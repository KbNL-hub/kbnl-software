import { supabase } from "./supabase"

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
  action: "batch_confirm"
  sale_ids: string[]
  broker_id: string
  prices: Record<string, number>
  sale_qty_map: Record<string, number>
} | {
  action: "batch_reject"
  sale_ids: string[]
  broker_id: string
  rejection_reason?: string
}

export type MutationResult<T = unknown> = {
  data: T | null
  error: string | null
}

export async function apiMutate<T = unknown>(
  endpoint: string,
  payload: MutationPayload,
): Promise<MutationResult<T>> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) return { data: null, error: "No session" }

    const res = await fetch(`/api/mutations/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    })

    const result = await res.json().catch(() => null)
    if (!res.ok) {
      return { data: null, error: result?.error || res.statusText || "Request failed" }
    }
    return { data: (result?.data ?? null) as T | null, error: null }
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "Unknown error" }
  }
}
