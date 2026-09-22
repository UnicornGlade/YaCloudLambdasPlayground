import pg from 'pg'
import { migrate } from './migrations.mjs'
import { databaseConfig } from './database-config.mjs'

// No HTTP route, no arbitrary SQL or filename accepted. Invocation requires IAM.
export async function handler(event) {
  if (event?.action !== 'migrate') return { status: 'rejected' }
  const pool = new pg.Pool(databaseConfig())
  try {
    const applied = await migrate(pool, new URL('./migrations/', import.meta.url))
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC')
      await client.query('GRANT USAGE ON SCHEMA public TO counter_app')
      await client.query('GRANT SELECT, UPDATE ON TABLE public.global_counter TO counter_app')
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally { client.release() }
    const { rows } = await pool.query('SELECT value::text AS value FROM public.global_counter WHERE id = 1')
    console.log(JSON.stringify({ level: 'INFO', message: 'migration_complete', applied }))
    return { status: 'ok', applied, value: rows[0]?.value }
  } catch (error) {
    console.error(JSON.stringify({ level: 'ERROR', message: 'migration_failed', code: error.code || 'UNKNOWN' }))
    return { status: 'failed' }
  } finally { await pool.end() }
}
