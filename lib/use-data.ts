import { useEffect, useState, useCallback, useRef } from "react"

type UseDataResult<T> = {
  data: T[]
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useData<T>(
  buildQuery: () => PromiseLike<{ data: T[] | null; error: unknown }>,
  deps: unknown[] = [],
): UseDataResult<T> {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)
  const [queryKey, setQueryKey] = useState(0)

  const refetch = useCallback(() => {
    setQueryKey(k => k + 1)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    let cancelled = false

    async function fetchData() {
      setLoading(true)
      setError(null)

      const query = buildQuery()
      const { data: result, error: err } = await query

      if (cancelled || !mountedRef.current) return

      if (err) {
        setError(err instanceof Error ? err.message : String(err))
        setData([])
      } else {
        setData((result || []) as T[])
      }
      setLoading(false)
    }

    fetchData()

    return () => {
      cancelled = true
      mountedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, ...deps])

  return { data, loading, error, refetch }
}

type EnrichFn<T, R> = (items: T[]) => Promise<R[]>

export async function batchEnrich<T, R>(
  items: T[],
  enrichFn: EnrichFn<T, R>,
): Promise<R[]> {
  if (items.length === 0) return []
  return enrichFn(items)
}
