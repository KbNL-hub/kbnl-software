import { useEffect, useState, useCallback, useRef } from "react"
import { supabase } from "@/lib/supabase"

interface TripsFilter {
  driver_id?: string
  plate_number?: string
  status?: string | string[]
  single?: boolean
  activeOnly?: boolean
  completedOnly?: boolean
  limit?: number
}

export interface EnrichedTrip {
  trip_id: string
  plate_number: string
  driver_id: string | null
  loaded_quantity: number
  product: string | null
  material_centre: string | null
  trip_status: string
  ATC: string | null
  amount_charged: number | null
  payment_mode: string | null
  created_at: string | null
  updated_at: string | null
  driver_name?: string
  driver_phone?: string
  driver_status?: string
}

export function useTrips(filter?: TripsFilter) {
  const [data, setData] = useState<EnrichedTrip[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [queryKey, setQueryKey] = useState(0)
  const mountedRef = useRef(true)

  const refetch = useCallback(() => setQueryKey(k => k + 1), [])

  function hasFilter(f: TripsFilter | undefined): f is TripsFilter {
    return !!f && !!(f.driver_id || f.plate_number || f.status || f.completedOnly)
  }

  useEffect(() => {
    mountedRef.current = true
    let cancelled = false

    async function fetchData() {
      if (!hasFilter(filter)) {
        setData([]); setLoading(false); return
      }

      setLoading(true)
      setError(null)

      try {
        let query = supabase
          .from("Trips")
          .select("*")
          .order("created_at", { ascending: false })

        if (filter?.driver_id) {
          query = query.eq("driver_id", filter.driver_id)
          if (filter?.activeOnly) {
            query = query.in("trip_status", ["In transit", "On hold"])
          }
          if (filter?.single) {
            query = query.single() as any
          }
        }

        if (filter?.plate_number) {
          query = query.eq("plate_number", filter.plate_number)
        }

        if (filter?.completedOnly) {
          query = query.eq("trip_status", "Completed")
        }

        if (filter?.status) {
          const statuses = Array.isArray(filter.status) ? filter.status : [filter.status]
          query = query.in("trip_status", statuses)
        }

        if (filter?.limit) {
          query = query.limit(filter.limit)
        }

        if (filter?.single) {
          const { data: trip } = await query
          if (cancelled || !mountedRef.current) return
          if (!trip) { setData([]); setLoading(false); return }
          const tripArr = Array.isArray(trip) ? trip : [trip]
          const valid = tripArr.filter(Boolean)
          if (!valid.length) { setData([]); setLoading(false); return }

          const driverIds = [...new Set(valid.map(t => t.driver_id).filter(Boolean))]
          const { data: drivers } = driverIds.length
            ? await supabase.from("Drivers").select("driver_id, full_name, phone_number, status").in("driver_id", driverIds)
            : { data: [] }

          if (cancelled || !mountedRef.current) return
          const driverMap = Object.fromEntries((drivers || []).map(d => [d.driver_id, d]))

          const enriched = valid.map(t => ({
            ...t,
            driver_name: driverMap[t.driver_id]?.full_name ?? undefined,
            driver_phone: driverMap[t.driver_id]?.phone_number ?? undefined,
            driver_status: driverMap[t.driver_id]?.status ?? undefined,
          }))

          setData(enriched as EnrichedTrip[])
        } else {
          const { data: trips } = await query
          if (cancelled || !mountedRef.current) return
          if (!trips) { setData([]); setLoading(false); return }

          const driverIds = [...new Set(trips.map(t => t.driver_id).filter(Boolean))]
          const { data: drivers } = driverIds.length
            ? await supabase.from("Drivers").select("driver_id, full_name, phone_number, status").in("driver_id", driverIds)
            : { data: [] }

          if (cancelled || !mountedRef.current) return
          const driverMap = Object.fromEntries((drivers || []).map(d => [d.driver_id, d]))

          const enriched = trips.map(t => ({
            ...t,
            driver_name: driverMap[t.driver_id]?.full_name ?? undefined,
            driver_phone: driverMap[t.driver_id]?.phone_number ?? undefined,
            driver_status: driverMap[t.driver_id]?.status ?? undefined,
          }))

          setData(enriched as EnrichedTrip[])
        }
      } catch (e) {
        if (cancelled || !mountedRef.current) return
        setError(e instanceof Error ? e.message : "Failed to fetch trips")
        setData([])
      } finally {
        if (!cancelled && mountedRef.current) setLoading(false)
      }
    }

    fetchData()

    return () => { cancelled = true; mountedRef.current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, filter?.driver_id, filter?.plate_number, filter?.status, filter?.single, filter?.activeOnly, filter?.completedOnly, filter?.limit])

  return { data, loading, error, refetch }
}
