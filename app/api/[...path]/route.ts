import { NextRequest, NextResponse } from 'next/server'

const BACKEND = 'https://medicalrag.duckdns.org'

async function handler(req: NextRequest) {
  // Extract path after /api/
  const url = new URL(req.url)
  const backendUrl = `${BACKEND}${url.pathname}${url.search}`

  const headers = new Headers()
  // Forward content-type only
  const contentType = req.headers.get('content-type')
  if (contentType) headers.set('content-type', contentType)

  let body: ArrayBuffer | undefined
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await req.arrayBuffer()
  }

  const res = await fetch(backendUrl, {
    method: req.method,
    headers,
    body,
  })

  const resBody = await res.arrayBuffer()
  const resHeaders = new Headers()

  // Forward response headers including set-cookie
  res.headers.forEach((value, key) => {
    resHeaders.set(key, value)
  })

  return new NextResponse(resBody, {
    status: res.status,
    headers: resHeaders,
  })
}

export const GET = handler
export const POST = handler
export const PUT = handler
export const DELETE = handler
export const PATCH = handler