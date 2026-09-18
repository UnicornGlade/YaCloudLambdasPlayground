import { randomUUID } from 'node:crypto'
import { getHeader, getRequestURL, setHeader } from 'h3'

export default defineNitroPlugin((app) => {
  app.hooks.hook('request', (event) => {
    const incomingId = getHeader(event, 'x-request-id')
    event.context.requestId = incomingId && /^[a-zA-Z0-9_-]{1,128}$/.test(incomingId) ? incomingId : randomUUID()
    event.context.startedAt = performance.now()
    setHeader(event, 'X-Request-Id', event.context.requestId)
  })
  app.hooks.hook('beforeResponse', (event) => {
    console.log(JSON.stringify({
      level: 'INFO',
      message: 'http_request',
      event: 'http_request',
      requestId: event.context.requestId,
      method: event.method,
      path: getRequestURL(event).pathname,
      status: event.node.res.statusCode,
      durationMs: Math.round(performance.now() - event.context.startedAt),
      version: useRuntimeConfig(event).public.appVersion,
    }))
  })
  app.hooks.hook('error', (error, context) => {
    const cause = error.cause as { code?: string } | undefined
    console.error(JSON.stringify({
      level: 'ERROR',
      message: 'request_error',
      event: 'request_error',
      requestId: context.event?.context.requestId,
      code: (error as { code?: string }).code || cause?.code || 'UNKNOWN',
    }))
  })
})
