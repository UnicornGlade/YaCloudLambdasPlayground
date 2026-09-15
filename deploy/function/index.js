// Copied into a CommonJS package by scripts/build.mjs. Entry point in Yandex: index.handler.
let application

exports.handler = async function (event, context = {}) {
  if (event?.version !== '2.0' || typeof event.rawPath !== 'string' || !event.requestContext?.http?.method) {
    return {
      statusCode: 400,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      body: JSON.stringify({ error: 'API Gateway payload_format_version must be 2.0' }),
      isBase64Encoded: false,
    }
  }
  application ||= import('./server/index.mjs')
  const { handler } = await application
  const headers = { ...event.headers }
  // Prefer the gateway-generated ID to a caller-supplied ID.
  if (event.requestContext.requestId) headers['x-request-id'] = event.requestContext.requestId
  // Do not pass the Yandex IAM access token into the application context.
  return handler({ ...event, headers }, { awsRequestId: context.requestId || event.requestContext.requestId })
}
