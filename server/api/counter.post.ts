import { defineEventHandler, setHeader } from 'h3'
import { counterValue } from '../lib/counter'
import { getDatabase } from '../utils/database'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  return counterValue(getDatabase(), true)
})
