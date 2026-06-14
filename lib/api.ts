// Centralized API client for the FastAPI backend.
// All requests include credentials so the httpOnly JWT cookies are sent.
//
// JWT refresh strategy: if a request returns 401, we call POST /api/auth/refresh
// once, then retry the original request a single time.

// export const API_BASE_URL =
//   process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://medicalrag.duckdns.org"
export const API_BASE_URL = ''

export class ApiError extends Error {
  status: number
  detail: string

  constructor(status: number, detail: string) {
    super(detail)
    this.name = "ApiError"
    this.status = status
    this.detail = detail
  }
}

async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.json()
    if (typeof data?.detail === "string") return data.detail
    if (Array.isArray(data?.detail) && data.detail[0]?.msg) {
      return data.detail[0].msg
    }
    return res.statusText || "Request failed"
  } catch {
    return res.statusText || "Request failed"
  }
}

let refreshPromise: Promise<boolean> | null = null

async function refreshToken(): Promise<boolean> {
  // De-duplicate concurrent refreshes.
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        // Allow a fresh refresh on the next 401.
        setTimeout(() => {
          refreshPromise = null
        }, 0)
      })
  }
  return refreshPromise
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown
  // Internal flag to prevent infinite refresh loops.
  _retried?: boolean
  // Skip JSON serialization (e.g. for FormData uploads).
  rawBody?: boolean
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, headers, rawBody, _retried, ...rest } = options

  const init: RequestInit = {
    ...rest,
    credentials: "include",
    headers: {
      ...(rawBody ? {} : body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
  }

  if (body !== undefined) {
    init.body = rawBody ? (body as BodyInit) : JSON.stringify(body)
  }

  const res = await fetch(`${API_BASE_URL}${path}`, init)

  // Attempt a single refresh + retry on 401.
  if (res.status === 401 && !_retried && path !== "/api/auth/refresh" && path !== "/api/auth/login" && path !== "/api/auth/me") {
    const refreshed = await refreshToken()
    if (refreshed) {
      return apiFetch<T>(path, { ...options, _retried: true })
    }
    throw new ApiError(401, "Your session has expired. Please sign in again.")
  }

  if (!res.ok) {
    throw new ApiError(res.status, await parseError(res))
  }

  // Some endpoints (e.g. DELETE) may return no content.
  if (res.status === 204) {
    return undefined as T
  }

  const contentType = res.headers.get("content-type") ?? ""
  if (contentType.includes("application/json")) {
    return (await res.json()) as T
  }
  return undefined as T
}

// Returns the raw Response, used for SSE streaming. Handles a single 401 retry.
export async function apiStream(
  path: string,
  body: unknown,
  _retried = false,
): Promise<Response> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
  })

  if (res.status === 401 && !_retried) {
    const refreshed = await refreshToken()
    if (refreshed) {
      return apiStream(path, body, true)
    }
    throw new ApiError(401, "Your session has expired. Please sign in again.")
  }

  if (!res.ok) {
    throw new ApiError(res.status, await parseError(res))
  }

  return res
}
