import { supabase } from "@/lib/supabase"

// Mirrors supabase/migrations/060_monitor_trips_list.sql. When that migration
// has not been applied yet the call fails with PGRST202, and callers fall back
// to the browser-side query path.

export type MonitorTripQuery = {
  status: string
  search: string
  plate: string
  dateFrom: string
  dateTo: string
  /**
   * "single" is an exact-day match, which the browser-side filter implements as
   * `tripDate === dateFrom`. Passing only dateFrom over the wire would mean
   * "this day onwards" instead, so the range is collapsed here.
   */
  dateMode: "single" | "range"
  page: number
  pageSize?: number
}

export type MonitorTripRow = {
  trip_id: string
  plate_number: string
  is_dd: boolean
  driver_id: string | null
  driver_name: string
  driver_phone: string
  driver_status: string
  product: string
  material_centre: string
  loaded_quantity: number
  remaining: number
  trip_status: string
  atc: string | null
  order_no: string | null
  child_order_no: string | null
  amount_charged: number | null
  payment_mode: string | null
  created_at: string
  completed_at: string | null
  recorded: boolean
  posted: boolean
  route_points: string[] | null
  stop_count: number
  stop_summary: {
    total: number
    confirmed: number
    pending: number
    disputed: number
    awaiting_review: number
    returned: number
  }
  load_more: Array<{
    id: string
    quantity: number
    loading_point_type: string
    loading_point_name: string
    product: string
    created_at: string
  }>
  load_more_total: number
}

export type MonitorTripPage = {
  total: number
  items: MonitorTripRow[]
  stats: { pending_record: number; disputed_trip: number }
  plates: string[]
}

export type MonitorTripPageResult =
  | { ok: true; data: MonitorTripPage }
  | { ok: false; unavailable: true; error: string }
  | { ok: false; unavailable: false; error: string }

/** PGRST202 is PostgREST's "function not found in schema cache". */
function isMissingFunction(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === "PGRST202" || /could not find the function|schema cache/i.test(error.message ?? "")
}

export async function fetchMonitorTripPage(query: MonitorTripQuery): Promise<MonitorTripPageResult> {
  const pageSize = query.pageSize ?? 100
  const dateFrom = query.dateFrom.trim() || null
  const dateTo = query.dateMode === "single" ? dateFrom : (query.dateTo.trim() || null)

  const { data, error } = await supabase.rpc("list_monitor_trips", {
    p_status: query.status,
    p_search: query.search.trim() || null,
    p_plate: query.plate.trim() || null,
    p_date_from: dateFrom,
    p_date_to: dateTo,
    p_limit: pageSize,
    p_offset: query.page * pageSize,
  })

  if (error) {
    return {
      ok: false,
      unavailable: isMissingFunction(error),
      error: error.message,
    }
  }

  const payload = (data ?? {}) as Partial<MonitorTripPage>

  return {
    ok: true,
    data: {
      total: Number(payload.total ?? 0),
      items: (payload.items ?? []) as MonitorTripRow[],
      stats: {
        pending_record: Number(payload.stats?.pending_record ?? 0),
        disputed_trip: Number(payload.stats?.disputed_trip ?? 0),
      },
      plates: (payload.plates ?? []) as string[],
    },
  }
}
