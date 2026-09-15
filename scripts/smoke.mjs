import assert from 'node:assert/strict'
import { parseArgs } from 'node:util'

const { values, positionals } = parseArgs({ options: { increment: { type: 'boolean', default: false } }, allowPositionals: true })
if (positionals.length > 1) throw new Error('Usage: npm run smoke -- [base-url] [--increment]')
const base = new URL(positionals[0] || 'http://127.0.0.1:3000')
if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))) {
  throw new Error('A remote smoke test must use HTTPS')
}
async function request(path, method = 'GET') {
  const response = await fetch(new URL(path, base), { method, signal: AbortSignal.timeout(15_000), redirect: 'error' })
  assert.equal(response.status, 200, `${method} ${path}: HTTP ${response.status}`)
  assert.match(response.headers.get('cache-control') || '', /no-store/)
  return response.json()
}
const html = await fetch(base, { signal: AbortSignal.timeout(15_000), redirect: 'error' })
assert.equal(html.status, 200, 'Site is not available')
assert.match(await html.text(), /__nuxt/)
const health = await request('/api/health')
assert.equal(health.status, 'ok')
assert.equal((await request('/api/ready')).status, 'ready')
const before = await request('/api/counter')
assert.match(before.value, /^\d+$/)
if (values.increment) {
  console.log('Explicit --increment: the global counter will be changed once; no automatic retry.')
  const after = await request('/api/counter', 'POST')
  assert.match(after.value, /^\d+$/)
  assert.ok(BigInt(after.value) >= BigInt(before.value) + 1n, 'Counter did not increase')
}
if (process.env.ARCHIVE_URL) {
  const archive = new URL(process.env.ARCHIVE_URL)
  assert.equal(archive.protocol, 'https:', 'Archive must use HTTPS')
  const response = await fetch(archive, { method: 'HEAD', signal: AbortSignal.timeout(15_000), redirect: 'error' })
  assert.equal(response.status, 200, 'Archive is unavailable')
  console.log('Archive HEAD check passed (file not downloaded)')
}
console.log(JSON.stringify({ status: 'passed', baseUrl: base.origin, version: health.version, incremented: values.increment }))
