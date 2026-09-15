import { readFileSync } from 'node:fs'
import type { PoolConfig } from 'pg'

export function databaseConfig(env: NodeJS.ProcessEnv = process.env): PoolConfig {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required')
  let url: URL
  try { url = new URL(env.DATABASE_URL) } catch { throw new Error('DATABASE_URL must be a valid PostgreSQL URL') }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('DATABASE_URL must use PostgreSQL')
  }
  // pg query parameters can override TLS or even the hostname checked below.
  if (url.search) {
    throw new Error('Configure TLS with PGSSLMODE and PGSSLROOTCERT; DATABASE_URL query parameters are not supported')
  }
  const mode = env.PGSSLMODE || 'verify-full'
  if (!['verify-full', 'disable'].includes(mode)) {
    throw new Error('PGSSLMODE must be verify-full or disable')
  }
  if (mode === 'disable' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('TLS may only be disabled for a loopback database')
  }
  return {
    connectionString: env.DATABASE_URL,
    ssl: mode === 'disable' ? false : {
      rejectUnauthorized: true,
      ...(env.PGSSLROOTCERT ? { ca: readFileSync(env.PGSSLROOTCERT, 'utf8') } : {}),
    },
    max: 2,
    connectionTimeoutMillis: 3_000,
    idleTimeoutMillis: 10_000,
    statement_timeout: 5_000,
    query_timeout: 8_000,
    application_name: 'unicornglade-counter',
  }
}
