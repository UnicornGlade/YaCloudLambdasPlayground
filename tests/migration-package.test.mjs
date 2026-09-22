import assert from 'node:assert/strict'
import { mkdtemp, cp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

test('private migration package loads in isolation without root node_modules', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'playground-migration-'))
  try {
    await cp('.artifacts/migration', directory, { recursive: true })
    await rm(join(directory, 'node_modules'), { recursive: true, force: true })
    const result = spawnSync(process.execPath, ['-e', 'require("./index.js").handler({}).then(r=>console.log(JSON.stringify(r)))'], {
      cwd: directory, encoding: 'utf8', timeout: 10000,
    })
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(JSON.parse(result.stdout), { status: 'rejected' })
  } finally { await rm(directory, { recursive: true, force: true }) }
})
