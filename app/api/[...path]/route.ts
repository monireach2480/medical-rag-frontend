import { NextRequest, NextResponse } from 'next/server'

const BACKEND = 'https://medicalrag.duckdns.org'

async function handler(req: NextRequest, { params }: { params: { path: string[] } }) {
  const path = '/' + params.path.join('/')
  const search = req.nextUrl.search
  const url = `${BACKEND}${path}${search}`

  const headers = new Headers(req.headers)
  headers.delete('host')

  const res = await fetch(url, {
    method: req.method,
    headers,
    body: req.method !== 'GET' && req.method !== 'HEAD'
      ? await req.arrayBuffer()
      : undefined,
  })

  const responseHeaders = new Headers(res.headers)

  return new NextResponse(res.body, {
    status: res.status,
    headers: responseHeaders,
  })
}

export const GET = handler
export const POST = handler
export const PUT = handler
export const DELETE = handler
export const PATCH = handler