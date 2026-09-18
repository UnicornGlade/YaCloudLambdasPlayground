import { cloudEnvironment, root, run } from './lib/cloud-auth.mjs'

const [action = 'plan', ...extra] = process.argv.slice(2)
if (extra.length || !['init', 'validate', 'plan', 'apply', 'dns', 'status', 'nameservers'].includes(action)) {
  throw new Error('Usage: npm run certificate -- init|validate|plan|apply|dns|status|nameservers')
}
if (['init', 'validate', 'plan', 'apply'].includes(action)) {
  run(process.execPath, ['scripts/infra.mjs', 'certificate', action])
} else {
  const env = cloudEnvironment({ provider: false, backend: true })
  const output = (name, json = false) => run(`${root}.tools/terraform/terraform`,
    [`-chdir=${root}infra/certificate`, 'output', json ? '-json' : '-raw', name], { env, capture: true })
  try {
    if (action === 'dns') {
      console.log(output('certificate_dns', true))
    } else if (action === 'status') {
      const id = output('certificate_id')
      const certificate = JSON.parse(run('yc', ['certificate-manager', 'certificate', 'get', id, '--format', 'json'], { capture: true }))
      console.log(JSON.stringify({ id: certificate.id, status: certificate.status, domains: certificate.domains }, null, 2))
    } else {
      const zoneId = output('dns_zone_id')
      const response = JSON.parse(run('yc', ['dns', 'zone', 'list-records', zoneId, '--format', 'json'], { capture: true }))
      const records = response.record_sets
      if (!Array.isArray(records)) throw new Error('Unexpected Cloud DNS response')
      const nameservers = records.filter(record => record.type === 'NS' && record.name === 'unicornglade.tech.').flatMap(record => record.data)
      if (!nameservers.length) throw new Error('No authoritative nameservers returned by Cloud DNS')
      console.log(JSON.stringify({ zoneId, nameservers }, null, 2))
    }
  } finally {
    for (const key of ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN']) delete env[key]
  }
}
