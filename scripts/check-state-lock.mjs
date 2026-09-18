// Tests S3 locking using isolated Terraform built-in data + a local sleep.
// Only test state/lock objects are written; application infrastructure is not touched.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { cloudEnvironment, root, run, stateBucket } from './lib/cloud-auth.mjs'

process.umask(0o077)
const env = cloudEnvironment({ provider: false, backend: true })
const terraform = `${root}.tools/terraform/terraform`
const path = `${root}.tools/state-lock-probe`
await mkdir(path, { recursive: true })
await writeFile(`${path}/main.tf`, `terraform {
  backend "s3" {
    bucket = "${stateBucket}"
    key = "terraform/lock-probe.tfstate"
    region = "ru-central1"
    endpoints = { s3 = "https://storage.yandexcloud.net" }
    use_lockfile = true
    use_path_style = true
    skip_region_validation = true
    skip_credentials_validation = true
    skip_metadata_api_check = true
    skip_requesting_account_id = true
    skip_s3_checksum = true
  }
}
resource "terraform_data" "probe" {
  triggers_replace = [timestamp()]
  provisioner "local-exec" { command = "sleep 15" }
}
`)
const directory = `-chdir=${path}`
run(terraform, [directory, 'init', '-input=false', '-no-color'], { env, capture: true })
const locker = spawn(terraform, [directory, 'apply', '-auto-approve', '-input=false', '-no-color'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
locker.stdout.resume()
locker.stderr.resume()
const closed = new Promise(resolve => locker.once('close', resolve))
try {
  let locked = false
  for (let attempt = 0; attempt < 15; attempt++) {
    await delay(300)
    if (locker.exitCode !== null) throw new Error('Lock holder exited unexpectedly')
    const head = spawnSync('yc', ['storage', 's3api', 'head-object', '--bucket', stateBucket,
      '--key', 'terraform/lock-probe.tfstate.tflock'], { stdio: 'pipe', timeout: 10_000 })
    if (head.status === 0) { locked = true; break }
  }
  assert.ok(locked, 'Lock object was not observed')
  const competing = spawnSync(terraform, [directory, 'plan', '-input=false', '-lock-timeout=0s', '-no-color'],
    { env, encoding: 'utf8', stdio: 'pipe', timeout: 20_000 })
  assert.equal(competing.status, 1, 'A competing plan must fail, not bypass the lock')
  assert.match(competing.stderr + competing.stdout, /Error acquiring the state lock/)
  console.log('PASS: concurrent Terraform plan rejected while another process holds the S3 state lock.')
} finally {
  const timeout = setTimeout(() => locker.kill('SIGINT'), 30_000)
  const exitCode = await closed
  clearTimeout(timeout)
  for (const key of ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN']) delete env[key]
  assert.equal(exitCode, 0, 'The isolated lock holder did not finish successfully')
}
const released = spawnSync('yc', ['storage', 's3api', 'head-object', '--bucket', stateBucket,
  '--key', 'terraform/lock-probe.tfstate.tflock'], { encoding: 'utf8', stdio: 'pipe', timeout: 10_000 })
assert.notEqual(released.status, 0, 'State lock unexpectedly remained after the holder exited')
assert.match(released.stderr, /404|NotFound|NoSuchKey/, 'Could not verify lock release')
console.log('PASS: the lock was released normally, without force-unlock.')
