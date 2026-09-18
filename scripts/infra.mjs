import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { cloudEnvironment, root, run } from './lib/cloud-auth.mjs'

const [module, action, ...extra] = process.argv.slice(2)
if (extra.length || !['bootstrap', 'certificate', 'application'].includes(module) || !['init', 'migrate', 'validate', 'plan', 'apply'].includes(action)) {
  throw new Error('Usage: npm run infra -- bootstrap|certificate|application init|migrate|validate|plan|apply')
}
process.umask(0o077)
const directory = `${root}infra/${module}`
const remote = /backend "s3"/.test(await readFile(`${directory}/versions.tf`, 'utf8'))
const env = action === 'validate' ? process.env : cloudEnvironment({ provider: ['plan', 'apply'].includes(action), backend: remote })
const plan = `${root}.tools/${module}.tfplan`
await mkdir(`${root}.tools`, { recursive: true, mode: 0o700 })
const args = {
  init: ['init', '-input=false', '-no-color'],
  // Explicit one-time migration; Terraform itself copies state without printing it.
  migrate: ['init', '-migrate-state', '-no-color'],
  validate: ['validate', '-no-color'],
  plan: ['plan', '-input=false', '-no-color', '-lock-timeout=60s', `-out=${plan}`],
  apply: ['apply', '-input=false', '-no-color', '-lock-timeout=60s', plan],
}[action]
try {
  const buildDigest = async () => createHash('sha256').update(await readFile(`${root}.artifacts/function.zip`)).digest('hex')
  const guard = `${root}.tools/application-plan.sha256`
  if (module === 'application' && action === 'apply' && await buildDigest() !== (await readFile(guard, 'utf8')).trim()) {
    throw new Error('Build changed after plan; generate and review a new plan before apply.')
  }
  run(`${root}.tools/terraform/terraform`, [`-chdir=${directory}`, ...args], { env, ...(action === 'migrate' ? { input: 'yes\n' } : {}) })
  if (module === 'application' && action === 'plan') await writeFile(guard, await buildDigest(), { mode: 0o600 })
} finally {
  for (const path of [`${directory}/terraform.tfstate`, `${directory}/terraform.tfstate.backup`, plan]) {
    try { await chmod(path, 0o600) } catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  for (const key of ['YC_TOKEN', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN']) delete env[key]
}
