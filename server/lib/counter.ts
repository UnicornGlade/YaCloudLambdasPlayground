import type { Pool } from 'pg'

export const READ_COUNTER = 'SELECT value::text AS value FROM global_counter WHERE id = 1'
export const INCREMENT_COUNTER = 'UPDATE global_counter SET value = value + 1 WHERE id = 1 RETURNING value::text AS value'

export async function counterValue(database: Pick<Pool, 'query'>, increment = false): Promise<{ value: string }> {
  const result = await database.query<{ value: string }>(increment ? INCREMENT_COUNTER : READ_COUNTER)
  const row = result.rows[0]
  if (!row) throw new Error('Counter is not initialized: run database migrations')
  // BIGINT is intentionally returned as a string to avoid JavaScript precision loss.
  return { value: row.value }
}
