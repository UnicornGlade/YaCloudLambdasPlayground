import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from 'pg'
import { counterValue, INCREMENT_COUNTER, READ_COUNTER } from '../server/lib/counter'

function database(rows: Array<{ value: string }>) {
  const calls: string[] = []
  return {
    calls,
    query: (async (sql: string) => { calls.push(sql); return { rows } }) as unknown as Pool['query'],
  }
}

test('reads a BIGINT without losing precision', async () => {
  const db = database([{ value: '9007199254740993' }])
  assert.deepEqual(await counterValue(db), { value: '9007199254740993' })
  assert.deepEqual(db.calls, [READ_COUNTER])
})

test('increments in one database statement, not read-modify-write', async () => {
  const db = database([{ value: '42' }])
  assert.deepEqual(await counterValue(db, true), { value: '42' })
  assert.deepEqual(db.calls, [INCREMENT_COUNTER])
  assert.match(INCREMENT_COUNTER, /SET value = value \+ 1/)
})

test('missing initialization is an error, not an implicit counter reset', async () => {
  await assert.rejects(counterValue(database([])), /not initialized/)
})
