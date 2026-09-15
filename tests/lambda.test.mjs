import assert from 'node:assert/strict'
import { cp, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import test, { after } from 'node:test'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// This suite invokes the actual self-contained build through the Yandex CommonJS entrypoint.
// No database is required; Cloud Functions invocation itself is a separate cloud smoke test.
delete process.env.DATABASE_URL
const isolated = await mkdtemp(join(tmpdir(), 'unicornglade-lambda-'))
await cp(new URL('../.artifacts/function/', import.meta.url), isolated, { recursive: true })
after(() => rm(isolated, { recursive: true, force: true }))
// Outside the repository: missing packaged dependencies must not resolve from our node_modules.
const require = createRequire(join(isolated, 'probe.cjs'))
const { handler } = require('./index.js')
const release = JSON.parse(await readFile(new URL('../.artifacts/release.json', import.meta.url), 'utf8'))

function event(path, method = 'GET') {
  return {
    version: '2.0', rawPath: path, rawQueryString: '', headers: { host: 'example.apigw.yandexcloud.net' },
    requestContext: { requestId: 'test-gateway-request', http: { method, path, sourceIp: '127.0.0.1', userAgent: 'test' } },
    isBase64Encoded: false,
  }
}
function json(response) {
  const body = response.isBase64Encoded ? Buffer.from(response.body, 'base64').toString('utf8') : response.body
  return JSON.parse(body)
}

test('site output contains a static entrypoint and no server or source files', async () => {
  const directory = new URL('../.artifacts/site/', import.meta.url)
  const files = await readdir(directory, { recursive: true })
  assert.ok(files.includes('index.html'))
  assert.ok(files.some(file => file.startsWith('_nuxt/')))
  assert.ok(!files.some(file => /(^|\/)(\.env|server|node_modules|\.git|terraform\.tfstate)(\/|$)/.test(file)))
  const html = await readFile(new URL('index.html', directory), 'utf8')
  assert.match(html, /__nuxt/)
})

test('AWS-compatible v2 health request runs through the Yandex entrypoint', async () => {
  const response = await handler(event('/api/health'), { requestId: 'test-function-request', token: { access_token: 'must-not-be-exposed' } })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(json(response), { status: 'ok', version: release.version })
  assert.match(response.headers['cache-control'], /no-store/)
  assert.equal(response.headers['x-request-id'], 'test-gateway-request')
  assert.ok(!JSON.stringify(response).includes('must-not-be-exposed'))
})

test('default Yandex payload v0.1 is rejected with an actionable error', async () => {
  const response = await handler({ path: '/api/health', httpMethod: 'GET' })
  assert.equal(response.statusCode, 400)
  assert.match(json(response).error, /payload_format_version/)
})

test('readiness fails when PostgreSQL is not configured; liveness still succeeds', async () => {
  const response = await handler(event('/api/ready'))
  assert.equal(response.statusCode, 503)
  assert.ok(!response.body.includes('DATABASE_URL'))
  assert.equal((await handler(event('/api/health'))).statusCode, 200)
})
