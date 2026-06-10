// Shared TypeScript interfaces for the Medical RAG Chatbot

export interface User {
  id: string
  email: string
  full_name: string
  is_admin: boolean
}

export interface Source {
  filename: string
  page: number
  excerpt: string
}

export type MessageRole = "user" | "assistant"

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  sources?: Source[]
  disclaimer?: string
  // UI-only flag for the in-progress streaming assistant message
  streaming?: boolean
}

export interface ChatResponse {
  answer: string
  sources: Source[]
  disclaimer: string
}

export interface Conversation {
  id: string
  title: string
  created_at: string
}

export interface ConversationMessage {
  id: string
  conversation_id: string
  role: MessageRole
  content: string
  sources?: Source[]
  created_at: string
}

export interface IngestedDocument {
  filename: string
  chunks: number
}

export interface UploadResult {
  filename: string
  chunks_inserted: number
}

// Server-Sent Events emitted by POST /api/chat/stream
export type StreamEvent =
  | { type: "chunk"; content: string }
  | { type: "sources"; sources: Source[]; disclaimer: string }
  | { type: "done" }
  | { type: "error"; detail: string }
