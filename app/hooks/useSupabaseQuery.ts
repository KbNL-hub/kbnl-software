"use client"

import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"

interface UseSupabaseQueryOptions<T> {
  table: string
  select?: string
  filters?: Record<string, unknown>
  order?: { column: string; ascending?: boolean }
  limit?: number
  enabled?: boolean
}

interface UseSupabaseQueryResult<T> {
  data: T[]
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useSupabaseQuery<T = Record<string, unknown>>({
  table,
  select = "*",
  filters,
  order,
  limit,
  enabled = true,
}: UseSupabaseQueryOptions<T>): UseSupabaseQueryResult<T> {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const refetch = useCallback(() => {
    setRefreshKey(k => k + 1)
  }, [])

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }

    let cancelled = false

    async function fetchData() {
      setLoading(true)
      setError(null)

      try {
        let query: any = supabase
          .from(table)
          .select(select) as any

        if (filters) {
          for (const [key, value] of Object.entries(filters)) {
            query = query.eq(key, value)
          }
        }

        if (order) {
          query = query.order(order.column, { ascending: order.ascending ?? false })
        }

        if (limit) {
          query = query.limit(limit)
        }

        const { data: result, error: queryError } = await query

        if (!cancelled) {
          if (queryError) {
            setError(queryError.message)
            setData([])
          } else {
            setData((result || []) as T[])
          }
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Query failed")
          setData([])
          setLoading(false)
        }
      }
    }

    fetchData()

    return () => {
      cancelled = true
    }
  }, [table, select, JSON.stringify(filters), order?.column, order?.ascending, limit, enabled, refreshKey])

  return { data, loading, error, refetch }
}
