import { useEffect, useState, useCallback, useRef } from "react"
import { supabase } from "@/lib/supabase"

interface ATFFilter {
  driver_id?: string
  initiated_by?: string
  company_id?: string
  all?: boolean
}

export interface EnrichedATF {
  request_id: string
  atf_code: string
  plate_number: string
  driver_id: string | null
  company_id: string | null
  litres: number
  rate_per_litre: number
  total_amount: number
  atf_status: string
  requested_at: string
  invalidation_reason: string | null
  initiated_by: string | null
  driver_name: string
  company_name: string
  officer_name: string
  kbnl_truck_no: string | null
  fuel_balance: number | null
  engine_type: string | null
}

export function useATFs(filter?: ATFFilter) {
  const [data, setData] = useState<EnrichedATF[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [queryKey, setQueryKey] = useState(0)
  const mountedRef = useRef(true)

  const refetch = useCallback(() => setQueryKey(k => k + 1), [])

  function hasFilter(f: ATFFilter | undefined): f is ATFFilter {
    return !!f && !!(f.all || f.driver_id || f.initiated_by || f.company_id)
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
          .from("fuel_requests")
          .select("request_id, atf_code, plate_number, driver_id, company_id, litres, rate_per_litre, total_amount, atf_status, requested_at, invalidation_reason, initiated_by")
          .order("requested_at", { ascending: false })

        if (filter.all) {
        } else if (filter.driver_id) {
          query = query.eq("driver_id", filter.driver_id).limit(20)
        } else if (filter.initiated_by) {
          query = query.eq("initiated_by", filter.initiated_by)
        } else if (filter.company_id) {
          query = query.eq("company_id", filter.company_id)
        }

        const { data: raw } = await query
        if (cancelled || !mountedRef.current) return

        if (!raw) { setData([]); setLoading(false); return }

        const driverIds = [...new Set(raw.map(r => r.driver_id).filter(Boolean))]
        const companyIds = [...new Set(raw.map(r => r.company_id).filter(Boolean))]
        const officerIds = [...new Set(raw.map(r => r.initiated_by).filter(Boolean))]
        const rawPlates = [...new Set(raw.map(r => r.plate_number).filter(Boolean))]
        const plates = filter?.all ? rawPlates.slice(0, 500) : rawPlates

        const [driversResult, companiesResult, officersResult, trucksResult] = await Promise.all([
          driverIds.length ? supabase.from("Drivers").select("driver_id, full_name").in("driver_id", driverIds) : Promise.resolve({ data: [], error: null }),
          companyIds.length ? supabase.from("fuel_companies").select("company_id, company_name").in("company_id", companyIds) : Promise.resolve({ data: [], error: null }),
          officerIds.length ? supabase.from("truck_officers").select("manager_id, full_name").in("manager_id", officerIds) : Promise.resolve({ data: [], error: null }),
          plates.length ? supabase.from("Trucks").select("plate_number, kbnl_truck_no, fuel_balance, engine_type").in("plate_number", plates) : Promise.resolve({ data: [], error: null }),
        ])

        if (cancelled || !mountedRef.current) return

        const enrichmentError = driversResult.error ?? companiesResult.error ?? officersResult.error ?? trucksResult.error
        if (enrichmentError) throw enrichmentError

        const driverMap = Object.fromEntries((driversResult.data || []).map(d => [d.driver_id, d.full_name]))
        const companyMap = Object.fromEntries((companiesResult.data || []).map(c => [c.company_id, c.company_name]))
        const officerMap = Object.fromEntries((officersResult.data || []).map(o => [o.manager_id, o.full_name]))
        const truckMap = new Map((trucksResult.data || []).map(t => [t.plate_number, { kbnl_truck_no: t.kbnl_truck_no, fuel_balance: t.fuel_balance, engine_type: t.engine_type }]))

        const enriched: EnrichedATF[] = raw.map(r => {
          const truck = truckMap.get(r.plate_number)
          return {
            ...r,
            driver_name: driverMap[r.driver_id] ?? "Unknown",
            company_name: companyMap[r.company_id] ?? "Unknown",
            officer_name: officerMap[r.initiated_by] ?? "Unknown",
            kbnl_truck_no: truck?.kbnl_truck_no ?? null,
            fuel_balance: truck?.fuel_balance ?? null,
            engine_type: truck?.engine_type ?? null,
          }
        })

        setData(enriched)
      } catch (e) {
        if (cancelled || !mountedRef.current) return
        setError(e instanceof Error ? e.message : "Failed to fetch ATFs")
        setData([])
      } finally {
        if (!cancelled && mountedRef.current) setLoading(false)
      }
    }

    fetchData()

    return () => { cancelled = true; mountedRef.current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, filter?.driver_id, filter?.initiated_by, filter?.company_id, filter?.all])

  return { data, loading, error, refetch }
}
