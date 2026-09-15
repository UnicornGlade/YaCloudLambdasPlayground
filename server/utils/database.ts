import { Pool } from 'pg'
import { databaseConfig } from '../lib/database-config'

let pool: Pool | undefined

export function getDatabase(): Pool {
  if (!pool) {
    pool = new Pool(databaseConfig())
    pool.on('error', (error: Error & { code?: string }) => {
      // Do not log connection strings, passwords, event bodies or IAM context tokens.
      console.error(JSON.stringify({ level: 'error', event: 'database_pool_error', code: error.code || 'UNKNOWN' }))
    })
  }
  return pool
}
