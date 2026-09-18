// Read-only cloud diagnostics. No Terraform state or permanent keys required.
import { cloudEnvironment, run } from './lib/cloud-auth.mjs'
const [action, ...extra] = process.argv.slice(2)
if (extra.length || !['status', 'logs'].includes(action)) throw new Error('Usage: node scripts/cloud-read.mjs status|logs')
const env = cloudEnvironment({ provider: false, backend: false })
if (action === 'logs') {
  run('yc', ['logging', 'read', '--group-name', 'playground-application', '--since', '15m', '--until', '10s',
    '--limit', '30', '--max-response-size', '64K', '--filter', 'json_payload.source = "user"', '--format', 'json'], { env, timeout: 30_000 })
} else {
  const gateway = JSON.parse(run('yc', ['serverless', 'api-gateway', 'get', 'playground', '--format', 'json',
    '--jq', '{id: .id, status: .status, domain: .domain}'], { env, capture: true, timeout: 30_000 }))
  const certificate = JSON.parse(run('yc', ['certificate-manager', 'certificate', 'get', 'fpqlqlsp9augs9lqa7ne', '--format', 'json',
    '--jq', '{id: .id, status: .status, domains: .domains}'], { env, capture: true, timeout: 30_000 }))
  const response = await fetch(`https://${gateway.domain}/api/health`, { signal: AbortSignal.timeout(15_000), redirect: 'error' })
  console.log(JSON.stringify({ gateway, certificate, healthHttpStatus: response.status, health: await response.json() }, null, 2))
  if (!response.ok) process.exitCode = 1
}
