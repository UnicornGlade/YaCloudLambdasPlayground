import { Pool } from 'pg'
import { databaseConfig } from '../server/lib/database-config'
import { loadLocalEnvironment } from './lib/environment'
import { migrate } from './lib/migrations'

loadLocalEnvironment()
const pool = new Pool(databaseConfig())
try {
  const applied = await migrate(pool)
  console.log(JSON.stringify({ event: 'migrations_complete', applied }))
} catch (error) {
  // Driver errors can contain credentials or data; do not print arbitrary messages.
  console.error(JSON.stringify({ event: 'migration_failed', code: (error as { code?: string }).code || 'UNKNOWN' }))
  process.exitCode = 1
} finally {
  await pool.end()
}
