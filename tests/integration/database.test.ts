import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { Pool } from 'pg'
import { databaseConfig } from '../../server/lib/database-config'
import { counterValue } from '../../server/lib/counter'
import { migrate } from '../../scripts/lib/migrations'

// Explicit opt-in. Never fall back to DATABASE_URL and accidentally mutate a deployed database.
const url = process.env.TEST_DATABASE_URL

test('real PostgreSQL: migrations, persistence and concurrent increments', { skip: !url && 'Set TEST_DATABASE_URL to a local test PostgreSQL' }, async () => {
  const parsed = new URL(url!)
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname), 'Integration tests only target loopback PostgreSQL')
  const config = databaseConfig({ DATABASE_URL: url, PGSSLMODE: 'disable' })
  const admin = new Pool(config)
  const schema = `test_${randomUUID().replaceAll('-', '')}`
  const pool = new Pool({ ...config, max: 4, options: `-c search_path=${schema}` })
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`)
    assert.deepEqual(await migrate(pool), ['001-counter.sql'])
    assert.deepEqual(await counterValue(pool), { value: '0' })
    const results = await Promise.all(Array.from({ length: 50 }, () => counterValue(pool, true)))
    assert.equal(new Set(results.map(result => result.value)).size, 50)
    assert.deepEqual(await counterValue(pool), { value: '50' })
    assert.deepEqual(await migrate(pool), [])
    assert.deepEqual(await counterValue(pool), { value: '50' })
    const secondClient = new Pool({ ...config, options: `-c search_path=${schema}` })
    try { assert.deepEqual(await counterValue(secondClient), { value: '50' }) } finally { await secondClient.end() }
  } finally {
    await pool.end()
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    await admin.end()
  }
})
