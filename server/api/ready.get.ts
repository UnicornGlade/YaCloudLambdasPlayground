import { createError, defineEventHandler, setHeader } from 'h3'
import { getDatabase } from '../utils/database'
import { counterValue } from '../lib/counter'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  try {
    await counterValue(getDatabase())
    return { status: 'ready' }
  } catch (error) {
    console.error(JSON.stringify({ level: 'ERROR', message: 'database_not_ready', event: 'database_not_ready', requestId: event.context.requestId, code: (error as { code?: string }).code || 'UNKNOWN' }))
    throw createError({ statusCode: 503, statusMessage: 'Database unavailable' })
  }
})
