import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const root = fileURLToPath(new URL('../../', import.meta.url))
export const cloudId = 'b1gmsvb6g8s7kq62pdv3'
export const folderId = 'b1gh1fk7hbuj5hu9tujb'
export const stateBucket = `unicornglade-tfstate-${folderId}`

export function run(command, args, { env = process.env, capture = false, input, timeout } = {}) {
  const result = spawnSync(command, args, { env, cwd: root, encoding: 'utf8', input, timeout,
    stdio: capture ? ['pipe', 'pipe', 'pipe'] : input !== undefined ? ['pipe', 'inherit', 'inherit'] : 'inherit' })
  if (result.error || result.status !== 0) {
    // Captured stdout/stderr from credential commands is deliberately never logged.
    throw new Error(`${command === 'yc' ? 'yc' : 'Terraform'} failed (exit ${result.status ?? 'unavailable'}). Check authentication, permissions and installed tools.`)
  }
  return (result.stdout || '').trim()
}

export function cloudEnvironment({ provider = true, backend = false } = {}) {
  const env = { ...process.env, TF_IN_AUTOMATION: '1', AWS_EC2_METADATA_DISABLED: 'true' }
  for (const key of Object.keys(env)) {
    if (key.startsWith('TF_LOG') || key.startsWith('TF_CLI_ARGS') || key.startsWith('AWS_') || key.startsWith('YC_STORAGE_') || key === 'YC_SERVICE_ACCOUNT_KEY_FILE' || key === 'YC_TOKEN') delete env[key]
  }
  env.AWS_EC2_METADATA_DISABLED = 'true'
  if (run('yc', ['config', 'get', 'cloud-id'], { capture: true }) !== cloudId ||
      run('yc', ['config', 'get', 'folder-id'], { capture: true }) !== folderId) {
    throw new Error('Select the approved lambda-playground-folder in yc before running Terraform.')
  }
  env.TF_VAR_cloud_id = cloudId
  env.TF_VAR_folder_id = folderId
  env.TF_VAR_domain = 'playground.unicornglade.tech'
  if (provider) env.YC_TOKEN = run('yc', ['iam', 'create-token'], { capture: true })
  if (backend) {
    const key = JSON.parse(run('yc', ['iam', 'access-key', 'issue-ephemeral', '--session-name', 'playground-terraform',
      '--duration', '1h', '--policy', readFileSync(`${root}infra/backend-access-policy.json`, 'utf8'), '--format', 'json'], { capture: true }))
    if (!key.access_key_id || !key.secret || !key.session_token) throw new Error('Incomplete ephemeral S3 credentials')
    env.AWS_ACCESS_KEY_ID = key.access_key_id
    env.AWS_SECRET_ACCESS_KEY = key.secret
    env.AWS_SESSION_TOKEN = key.session_token
  }
  return env
}
