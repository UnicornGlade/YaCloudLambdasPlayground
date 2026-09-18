import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { once } from 'node:events'
import test from 'node:test'

async function smoke(args: string[]) {
  const child = spawn(process.execPath, ['scripts/smoke.mjs', ...args], { env: { ...process.env, EXPECTED_APP_VERSION: '', ARCHIVE_URL: '' } })
  let output = ''
  child.stdout.on('data', data => { output += data })
  child.stderr.on('data', data => { output += data })
  const [code] = await once(child, 'close')
  return { code, output }
}

test('without-db smoke checks static assets and health, expects 503 readiness and never increments', async () => {
  const requests: string[] = []
  const server = createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`)
    res.setHeader('cache-control', 'no-store')
    if (req.url === '/') {
      res.setHeader('content-type', 'text/html')
      res.end('<div id="__nuxt"></div><script src="/app.js"></script>')
    } else if (req.url === '/app.js') {
      res.setHeader('content-type', 'text/javascript')
      res.end('console.log("test")')
    } else {
      res.setHeader('content-type', 'application/json')
      if (req.url === '/api/health') res.end(JSON.stringify({ status: 'ok', version: 'test' }))
      else {
        res.statusCode = 503
        res.end(JSON.stringify({ statusMessage: 'Database unavailable' }))
      }
    }
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    const address = server.address() as { port: number }
    const base = `http://127.0.0.1:${address.port}`
    const stage1 = await smoke([base, '--without-db'])
    assert.equal(stage1.code, 0, stage1.output)
    assert.match(stage1.output, /"databaseChecked":false/)
    assert.deepEqual(requests, ['GET /', 'GET /app.js', 'GET /api/health', 'GET /api/ready'])
    const normal = await smoke([base])
    assert.notEqual(normal.code, 0, 'Default smoke must not accept unavailable PostgreSQL')
    assert.ok(requests.every(request => request.startsWith('GET ')))
  } finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

test('without-db smoke rejects increment before making requests', async () => {
  const result = await smoke(['--without-db', '--increment'])
  assert.notEqual(result.code, 0)
  assert.match(result.output, /cannot be combined/)
})
