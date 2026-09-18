import assert from 'node:assert/strict'
import { parseArgs } from 'node:util'

const { values, positionals } = parseArgs({ options: { increment: { type: 'boolean', default: false }, 'without-db': { type: 'boolean', default: false } }, allowPositionals: true })
if (positionals.length > 1) throw new Error('Usage: npm run smoke -- [base-url] [--increment|--without-db]')
if (values.increment && values['without-db']) throw new Error('--increment cannot be combined with --without-db')
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
const source = await html.text()
assert.match(source, /__nuxt/)
assert.match(html.headers.get('content-type') || '', /text\/html/)
const assets = [...new Set([...source.matchAll(/(?:src|href)="([^" ]+\.(?:js|css))"/g)].map(match => match[1]))]
assert.ok(assets.length > 0, 'No JS/CSS assets found in entrypoint')
for (const asset of assets) {
  const url = new URL(asset, base)
  assert.equal(url.origin, base.origin, 'Unexpected external script or stylesheet')
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: 'error' })
  assert.equal(response.status, 200, `Asset unavailable: ${asset}`)
  assert.match(response.headers.get('content-type') || '', asset.endsWith('.css') ? /text\/css/ : /javascript/)
  assert.ok((await response.arrayBuffer()).byteLength > 0, 'Empty static asset')
}
const health = await request('/api/health')
assert.equal(health.status, 'ok')
if (process.env.EXPECTED_APP_VERSION) assert.equal(health.version, process.env.EXPECTED_APP_VERSION)
if (values['without-db']) {
  const readiness = await fetch(new URL('/api/ready', base), { signal: AbortSignal.timeout(15_000), redirect: 'error' })
  assert.equal(readiness.status, 503, 'Without a database, readiness must fail explicitly')
  assert.match(readiness.headers.get('cache-control') || '', /no-store/)
  assert.equal((await readiness.json()).statusMessage, 'Database unavailable')
} else {
  assert.equal((await request('/api/ready')).status, 'ready')
  const before = await request('/api/counter')
  assert.match(before.value, /^\d+$/)
  if (values.increment) {
    console.log('Explicit --increment: the global counter will be changed once; no automatic retry.')
    const after = await request('/api/counter', 'POST')
    assert.match(after.value, /^\d+$/)
    assert.ok(BigInt(after.value) >= BigInt(before.value) + 1n, 'Counter did not increase')
  }
}
if (process.env.ARCHIVE_URL) {
  const archive = new URL(process.env.ARCHIVE_URL)
  assert.equal(archive.protocol, 'https:', 'Archive must use HTTPS')
  const response = await fetch(archive, { method: 'HEAD', signal: AbortSignal.timeout(15_000), redirect: 'error' })
  assert.equal(response.status, 200, 'Archive is unavailable')
  console.log('Archive HEAD check passed (file not downloaded)')
}
console.log(JSON.stringify({ status: 'passed', baseUrl: base.origin, version: health.version, assetsChecked: assets.length, databaseChecked: !values['without-db'], incremented: values.increment }))
