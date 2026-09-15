import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import type { Pool } from 'pg'

export async function migrate(pool: Pool, directory = new URL('../../migrations/', import.meta.url)): Promise<string[]> {
  const files = (await readdir(directory)).filter(name => /^\d{3}-[a-z0-9-]+\.sql$/.test(name)).sort()
  if (!files.length) throw new Error('No migrations found')
  if (new Set(files.map(name => name.slice(0, 3))).size !== files.length) throw new Error('Duplicate migration number')
  const client = await pool.connect()
  const applied: string[] = []
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(81477319)')
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`)
    const previous = await client.query<{ name: string; checksum: string }>('SELECT name, checksum FROM schema_migrations')
    for (const entry of previous.rows) {
      if (!files.includes(entry.name)) throw new Error(`Applied migration is missing: ${entry.name}`)
    }
    for (const name of files) {
      const sql = await readFile(new URL(name, directory), 'utf8')
      const checksum = createHash('sha256').update(sql).digest('hex')
      const existing = previous.rows.find(row => row.name === name)
      if (existing) {
        if (existing.checksum !== checksum) throw new Error(`Applied migration was modified: ${name}`)
        continue
      }
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [name, checksum])
      applied.push(name)
    }
    await client.query('COMMIT')
    return applied
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
