import { useEffect, useState, useCallback, useRef } from "react"
import { supabase } from "@/lib/supabase"

export interface FuelExpense {
  expense_id: string
  manager_id: string | null
  plate_number: string | null
  trip_id: string | null
  litres: number
  notes: string | null
  location: string | null
  logged_at: string
  officer_name: string
  kbnl_truck_no?: string | null
  material_centre?: string | null
  product?: string | null
  trip_created_at?: string | null
}

interface FuelExpensesFilter {
  manager_id?: string
}

export function useFuelExpenses(filter?: FuelExpensesFilter) {
  const [data, setData] = useState<FuelExpense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [queryKey, setQueryKey] = useState(0)
  const mountedRef = useRef(true)

  const refetch = useCallback(() => setQueryKey(k => k + 1), [])

  useEffect(() => {
    mountedRef.current = true
    let cancelled = false

    async function fetchData() {
      setLoading(true)
      setError(null)

      try {
        let query = supabase
          .from("truck_fuel_expenses")
          .select("expense_id, manager_id, plate_number, trip_id, litres, notes, location, logged_at")
          .order("logged_at", { ascending: false })

        if (filter?.manager_id) {
          query = query.eq("manager_id", filter.manager_id)
        }

        const { data: raw, error: rawError } = await query
        if (cancelled || !mountedRef.current) return

        if (rawError) throw rawError
        if (!raw) { setData([]); setLoading(false); return }

        const officerIds = [...new Set(raw.map(r => r.manager_id).filter(Boolean))]
        const plates = [...new Set(raw.map(r => r.plate_number).filter(Boolean))]
        const tripIds = [...new Set(raw.map(r => r.trip_id).filter(Boolean))]

        const [officersResult, trucksResult, tripsResult] = await Promise.all([
          officerIds.length ? supabase.from("truck_officers").select("manager_id, full_name").in("manager_id", officerIds) : Promise.resolve({ data: [], error: null }),
          plates.length ? supabase.from("Trucks").select("plate_number, kbnl_truck_no").in("plate_number", plates) : Promise.resolve({ data: [], error: null }),
          tripIds.length ? supabase.from("Trips").select("trip_id, material_centre, product, created_at").in("trip_id", tripIds) : Promise.resolve({ data: [], error: null }),
        ])

        if (cancelled || !mountedRef.current) return

        const enrichmentError = officersResult.error ?? trucksResult.error ?? tripsResult.error
        if (enrichmentError) throw enrichmentError

        const officerMap = Object.fromEntries((officersResult.data || []).map(o => [o.manager_id, o.full_name]))
        const truckMap = Object.fromEntries((trucksResult.data || []).map(t => [t.plate_number, t.kbnl_truck_no]))
        const tripMap = Object.fromEntries((tripsResult.data || []).map(t => [t.trip_id, t]))

        const enriched = raw.map(r => ({
          ...r,
          officer_name: officerMap[r.manager_id] ?? "Unknown",
          kbnl_truck_no: truckMap[r.plate_number] ?? null,
          material_centre: tripMap[r.trip_id]?.material_centre ?? null,
          product: tripMap[r.trip_id]?.product ?? null,
          trip_created_at: tripMap[r.trip_id]?.created_at ?? null,
        }))

        setData(enriched)
      } catch (e) {
        if (cancelled || !mountedRef.current) return
        setError(e instanceof Error ? e.message : "Failed to fetch fuel expenses")
        setData([])
      } finally {
        if (!cancelled && mountedRef.current) setLoading(false)
      }
    }

    fetchData()

    return () => { cancelled = true; mountedRef.current = false }
     
  }, [queryKey, filter?.manager_id])

  return { data, loading, error, refetch }
}
