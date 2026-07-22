import { useEffect, useState, useCallback, useRef } from "react"
import { supabase } from "@/lib/supabase"

interface StopsFilter {
  trip_id?: string
  broker_id?: string
  store_name?: string
  pending?: boolean
}

export interface EnrichedStop {
  stop_id: string
  trip_id: string | null
  customer_id: string | null
  quantity_offloaded: number
  stop_location: string | null
  stop_time: string | null
  confirmed: boolean | null
  disputed: boolean | null
  broker_id: string | null
  plate_number?: string
  material_centre?: string
  atc?: string | null
  order_no?: string | null
  child_order_no?: string | null
  product?: string
  customer_name?: string
  driver_name?: string
  driver_id?: string | null
}

export function useStops(filter?: StopsFilter) {
  const [data, setData] = useState<EnrichedStop[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [queryKey, setQueryKey] = useState(0)
  const mountedRef = useRef(true)

  const refetch = useCallback(() => setQueryKey(k => k + 1), [])

  function hasFilter(f: StopsFilter | undefined): f is StopsFilter {
    return !!f && !!(f.trip_id || f.broker_id || f.store_name)
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
          .from("Stops")
          .select("stop_id, trip_id, customer_id, quantity_offloaded, stop_location, stop_time, confirmed, disputed, broker_id")
          .order("stop_time", { ascending: false })

        if (filter?.trip_id) {
          query = query.eq("trip_id", filter.trip_id)
        } else if (filter?.broker_id) {
          query = query.eq("broker_id", filter.broker_id)
        } else if (filter?.store_name) {
          query = query.eq("stop_location", filter.store_name)
          if (filter?.pending) {
            query = query.eq("confirmed", false).eq("disputed", false)
          }
        }

        const { data: stops } = await query
        if (cancelled || !mountedRef.current) return

        if (!stops) { setData([]); setLoading(false); return }

        const tripIds = [...new Set(stops.map(s => s.trip_id).filter(Boolean))]
        const customerIds = [...new Set(stops.map(s => s.customer_id).filter(Boolean))]

        const [tripsResult, customersResult] = await Promise.all([
          tripIds.length ? supabase.from("Trips").select("trip_id, plate_number, material_centre, ATC, order_no, child_order_no, product, driver_id").in("trip_id", tripIds) : Promise.resolve({ data: [] }),
          customerIds.length ? supabase.from("Customers").select("customer_id, full_name").in("customer_id", customerIds) : Promise.resolve({ data: [] }),
        ])

        if (cancelled || !mountedRef.current) return

        const trips = tripsResult.data || []
        const tripMap = Object.fromEntries(trips.map(t => [t.trip_id, t]))
        const customerMap = Object.fromEntries((customersResult.data || []).map(c => [c.customer_id, c.full_name]))

        const driverIds = [...new Set(trips.map(t => t.driver_id).filter(Boolean))]
        const { data: drivers } = driverIds.length
          ? await supabase.from("Drivers").select("driver_id, full_name").in("driver_id", driverIds)
          : { data: [] }

        if (cancelled || !mountedRef.current) return

        const driverMap = Object.fromEntries((drivers || []).map(d => [d.driver_id, d.full_name]))

        const enriched = stops.map(s => {
          const trip = tripMap[s.trip_id]
          return {
            ...s,
            plate_number: trip?.plate_number ?? "Unknown",
            material_centre: trip?.material_centre ?? "",
            atc: trip?.ATC ?? null,
            order_no: trip?.order_no ?? null,
            child_order_no: trip?.child_order_no ?? null,
            product: trip?.product ?? "",
            customer_name: s.customer_id ? (customerMap[s.customer_id] ?? "Not provided") : "Not provided",
            driver_name: trip?.driver_id ? (driverMap[trip.driver_id] ?? "Unknown") : "Unknown",
            driver_id: trip?.driver_id ?? null,
          }
        })

        setData(enriched as EnrichedStop[])
      } catch (e) {
        if (cancelled || !mountedRef.current) return
        setError(e instanceof Error ? e.message : "Failed to fetch stops")
        setData([])
      } finally {
        if (!cancelled && mountedRef.current) setLoading(false)
      }
    }

    fetchData()

    return () => { cancelled = true; mountedRef.current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, filter?.trip_id, filter?.broker_id, filter?.store_name, filter?.pending])

  return { data, loading, error, refetch }
}
