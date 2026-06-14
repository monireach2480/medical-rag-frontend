import { API_BASE_URL, apiFetch, apiStream } from "@/lib/api"
import type {
  ChatResponse,
  Conversation,
  ConversationMessage,
  IngestedDocument,
  StreamEvent,
  UploadResult,
  User,
} from "@/lib/types"

// ---------------------------------------------------------------------------
// Cookie helpers (client-side, non-httpOnly checks are not possible for the
// JWT itself since it is httpOnly — these helpers read readable cookies only).
// The middleware handles the authoritative access_token check server-side.
// ---------------------------------------------------------------------------

export function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(
    new RegExp("(?:^|; )" + name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1") + "=([^;]*)"),
  )
  return match ? decodeURIComponent(match[1]) : null
}

// ---------------------------------------------------------------------------
// Auth endpoints
// ---------------------------------------------------------------------------

export interface LoginPayload {
  email: string
  password: string
}

export interface RegisterPayload {
  full_name: string
  email: string
  password: string
}

export function login(payload: LoginPayload) {
  return apiFetch<User>("/api/auth/login", { method: "POST", body: payload })
}

export function register(payload: RegisterPayload) {
  return apiFetch<User>("/api/auth/register", { method: "POST", body: payload })
}

export function logout() {
  return apiFetch<void>("/api/auth/logout", { method: "POST" })
}

export function getCurrentUser() {
  return apiFetch<User>("/api/auth/me")
}

export function updateProfile(full_name: string) {
  return apiFetch<User>("/api/auth/profile", {
    method: "PUT",
    body: { full_name },
  })
}

export function updatePassword(current_password: string, new_password: string) {
  return apiFetch<void>("/api/auth/password", {
    method: "PUT",
    body: { current_password, new_password },
  })
}

// ---------------------------------------------------------------------------
// Chat endpoints
// ---------------------------------------------------------------------------

export interface ChatPayload {
  message: string
  conversation_id?: string
}

export function sendChat(payload: ChatPayload) {
  return apiFetch<ChatResponse>("/api/chat", { method: "POST", body: payload })
}

// Streams the chat response, invoking onEvent for each parsed SSE event.
export async function streamChat(
  payload: ChatPayload,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await apiStream("/api/chat/stream", payload)
  const body = res.body
  if (!body) {
    onEvent({ type: "error", detail: "No response stream available." })
    return
  }

  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  const handleAbort = () => reader.cancel().catch(() => {})
  signal?.addEventListener("abort", handleAbort)

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // SSE events are separated by a blank line.
      const parts = buffer.split("\n\n")
      buffer = parts.pop() ?? ""

      for (const part of parts) {
        const dataLines = part
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())

        if (dataLines.length === 0) continue
        const dataStr = dataLines.join("\n")
        if (!dataStr || dataStr === "[DONE]") continue

        try {
          const parsed = JSON.parse(dataStr) as StreamEvent
          onEvent(parsed)
        } catch {
          // Ignore malformed chunks.
        }
      }
    }
  } finally {
    signal?.removeEventListener("abort", handleAbort)
    reader.releaseLock?.()
  }
}

// ---------------------------------------------------------------------------
// Conversation endpoints
// ---------------------------------------------------------------------------

export function listConversations() {
  return apiFetch<Conversation[]>("/api/conversations").then(list =>
    list.map(c => ({ ...c, id: String(c.id) }))
  )
}

export function createConversation(title: string) {
  return apiFetch<Conversation>("/api/conversations", {
    method: "POST",
    body: { title },
  }).then(c => ({ ...c, id: String(c.id) }))
}


export function getConversationMessages(id: string) {
  return apiFetch<ConversationMessage[]>(`/api/conversations/${id}/messages`)
    .then(msgs => msgs.map(m => ({
      ...m,
      id: String(m.id),
      conversation_id: String(m.conversation_id),
    })))
}

export function saveConversationMessage(
  id: string,
  message: { role: "user" | "assistant"; content: string; sources?: unknown },
) {
  return apiFetch<ConversationMessage>(`/api/conversations/${id}/messages`, {
    method: "POST",
    body: message,
  })
}

export function deleteConversation(id: string) {
  return apiFetch<void>(`/api/conversations/${id}`, { method: "DELETE" })
}

// ---------------------------------------------------------------------------
// Admin endpoints
// ---------------------------------------------------------------------------

export function listDocuments() {
  return apiFetch<IngestedDocument[]>("/api/admin/documents")
}

export function deleteDocument(filename: string) {
  return apiFetch<void>(`/api/admin/documents/${encodeURIComponent(filename)}`, {
    method: "DELETE",
  })
}

// Uploads a PDF with progress reporting via XMLHttpRequest (fetch lacks
// upload progress events).
export function uploadDocument(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", `${API_BASE_URL}/api/admin/upload`)
    xhr.withCredentials = true

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as UploadResult)
        } catch {
          reject(new Error("Invalid server response."))
        }
      } else {
        let detail = "Upload failed."
        try {
          const data = JSON.parse(xhr.responseText)
          if (typeof data?.detail === "string") detail = data.detail
        } catch {
          /* ignore */
        }
        reject(new Error(detail))
      }
    }

    xhr.onerror = () => reject(new Error("Network error during upload."))

    const formData = new FormData()
    formData.append("file", file)
    xhr.send(formData)
  })
}
