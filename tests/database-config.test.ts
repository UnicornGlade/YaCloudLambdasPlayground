import assert from 'node:assert/strict'
import test from 'node:test'
import { databaseConfig } from '../server/lib/database-config'

const local = 'postgresql://counter:counter@127.0.0.1:54329/counter'

test('database configuration is mandatory and errors do not expose credentials', () => {
  assert.throws(() => databaseConfig({}), /DATABASE_URL is required/)
  assert.throws(() => databaseConfig({ DATABASE_URL: 'https://user:secret@example.org' }), /must use PostgreSQL/)
})

test('local development may explicitly disable TLS', () => {
  const config = databaseConfig({ DATABASE_URL: local, PGSSLMODE: 'disable' })
  assert.equal(config.ssl, false)
  assert.equal(config.max, 2)
  assert.ok(config.connectionTimeoutMillis! > 0)
})

test('remote database connections verify TLS by default', () => {
  const config = databaseConfig({ DATABASE_URL: 'postgresql://user:secret@database.internal/counter' })
  assert.deepEqual(config.ssl, { rejectUnauthorized: true })
  assert.throws(() => databaseConfig({ DATABASE_URL: 'postgresql://user:secret@database.internal/counter', PGSSLMODE: 'disable' }), /loopback/)
})

test('URL parameters cannot silently downgrade TLS verification', () => {
  for (const parameter of ['sslmode=require', 'sslmode=no-verify', 'ssl=true', 'sslrootcert=x', 'host=remote.example']) {
    assert.throws(() => databaseConfig({ DATABASE_URL: `${local}?${parameter}` }), /Configure TLS/)
  }
  assert.throws(() => databaseConfig({ DATABASE_URL: local, PGSSLMODE: 'require' }), /verify-full or disable/)
})
