import assert from 'node:assert/strict'
import { cloudEnvironment, run } from './lib/cloud-auth.mjs'

const [action, ...extra] = process.argv.slice(2)
if (extra.length || !['status', 'start', 'stop', 'migrate', 'backup'].includes(action)) throw new Error('Usage: npm run database:cloud -- status|start|stop|migrate|backup')
const env = cloudEnvironment({ provider: false, backend: false })
const id = 'c9q1pfg88e94keapkuue'
function status() {
  return JSON.parse(run('yc', ['managed-postgresql', 'cluster', 'get', id, '--format', 'json',
    '--jq', '{id:.id,name:.name,folder_id:.folder_id,status:.status,health:.health}'], { env, capture: true, timeout: 60_000 }))
}
const before = status()
assert.equal(before.id, id)
assert.equal(before.name, 'playground-postgresql')
assert.equal(before.folder_id, 'b1gh1fk7hbuj5hu9tujb')
if (action === 'migrate') {
  assert.equal(before.status, 'RUNNING', 'Start the database first')
  const result = JSON.parse(run('yc', ['serverless', 'function', 'invoke', '--id', 'd4envfjsgvfmbg9ee0ni',
    '--data', '{"action":"migrate"}'], { env, capture: true, timeout: 120_000 }))
  assert.equal(result.status, 'ok', 'Migration failed; use bounded cloud logs, never print credentials')
  console.log(JSON.stringify(result))
} else if (action === 'backup') {
  assert.equal(before.status, 'RUNNING', 'Start the database first')
  run('yc', ['managed-postgresql', 'cluster', 'backup', id], { env, capture: true, timeout: 600_000 })
  console.log('Backup created; no data was removed.')
} else if (action === 'status') {
  console.log(JSON.stringify(before, null, 2))
} else {
  const target = action === 'start' ? 'RUNNING' : 'STOPPED'
  if (before.status !== target) {
    assert.equal(before.status, action === 'start' ? 'STOPPED' : 'RUNNING', 'Cluster already has an operation in progress; inspect status first')
    console.log(`${action} ${id}: ${action === 'start' ? 'compute charges resume' : 'data retained, storage remains billable'}`)
    run('yc', ['managed-postgresql', 'cluster', action, id], { env, capture: true, timeout: 600_000 })
  }
  const after = status()
  console.log(JSON.stringify(after, null, 2))
  assert.equal(after.status, target)
}
