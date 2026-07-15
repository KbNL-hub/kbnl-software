import { supabase } from "./supabase"

const pendingMutations = new Map<string, Promise<unknown>>()

export type MutationAction = "insert" | "update" | "delete" | "upsert"

export type SubAction = {
  action: MutationAction
  table: string
  data?: Record<string, unknown>
  filters?: Record<string, unknown>
  conflict?: string
}

export type MutationPayload = {
  action: MutationAction
  table?: string
  data?: Record<string, unknown>
  filters?: Record<string, unknown>
  conflict?: string
  returning?: string
} | {
  action: "transaction"
  sub_actions: SubAction[]
} | {
  action: "rpc"
  function: string
  params?: Record<string, unknown>
}

export type MutationResult<T = unknown> = {
  data: T | null
  error: string | null
  status?: number
}

function extractMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === "string") return err
  try {
    return JSON.stringify(err)
  } catch {
    return "Unknown error"
  }
}

function mutationKey(endpoint: string, payload: MutationPayload): string {
  return JSON.stringify({ endpoint, payload })
}

export async function apiMutate<T = unknown>(
  endpoint: string,
  payload: MutationPayload,
): Promise<MutationResult<T>> {
  const key = mutationKey(endpoint, payload)
  const existing = pendingMutations.get(key)
  if (existing) return existing as Promise<MutationResult<T>>

  const promise = (async (): Promise<MutationResult<T>> => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) return { data: null, error: "No session", status: 401 }

      const res = await fetch(`/api/mutations/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      })

      const body = await res.json().catch(() => null)
      if (!res.ok) {
        return {
          data: null,
          error: body?.error || res.statusText || "Request failed",
          status: res.status,
        }
      }
      return { data: (body?.data ?? null) as T | null, error: null, status: res.status }
    } catch (err) {
      return { data: null, error: extractMessage(err) }
    }
  })()

  pendingMutations.set(key, promise)
  promise.finally(() => pendingMutations.delete(key))
  return promise
}

export function isAuthError(err: string | null | undefined): boolean {
  if (!err) return false
  const lower = err.toLowerCase()
  return lower.includes("unauthorized") || lower.includes("forbidden") || lower.includes("no session")
}
