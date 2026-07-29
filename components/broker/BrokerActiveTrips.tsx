"use client"

import { useState, useEffect } from "react"
import { Icon } from "@iconify/react"
import { supabase } from "@/lib/supabase"
import { useBreakpoint } from "@/app/hooks/useBreakpoint"

type Stop = {
  stop_id: string
  stop_type: "customer" | "store"
  broker_name: string | null
  customer_name: string | null
  quantity_offloaded: number
  stop_time: string
  stop_location: string
  store_name: string | null
  confirmed: boolean
  disputed: boolean
  dispute_reason: string | null
  price_per_bag: number | null
}

type LoadMoreEntry = {
  id: string
  quantity: number
  loading_point_type: string
  loading_point_name: string
  product: string
  created_at: string
}

type Trip = {
  trip_id: string
  plate_number: string
  driver_name: string
  driver_phone: string
  driver_status: string
  product: string
  material_centre: string
  loaded_quantity: number
  remaining: number
  stop_count: number
  stops: Stop[]
  load_more_entries: LoadMoreEntry[]
  trip_status: string
  atc: string | null
  order_no: string | null
  child_order_no: string | null
  amount_charged: number | null
  payment_mode: string | null
  created_at: string
  isDD?: boolean
}

type ViewMode = "card" | "table"

const fontSize = {
  xs: 12, sm: 13, base: 14, md: 15, lg: 16, xl: 20, "2xl": 24, "3xl": 28
}

export default function BrokerActiveTrips() {
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>(isMobile ? "card" : "table")
  const [selectedDriver, setSelectedDriver] = useState<Pick<Trip, "driver_name" | "driver_phone" | "driver_status"> | null>(null)
  const [selectedStops, setSelectedStops] = useState<Stop[] | null>(null)
  const [selectedLoadMore, setSelectedLoadMore] = useState<LoadMoreEntry[]>([])
  const [selectedPlate, setSelectedPlate] = useState("")
  const [selectedTrip, setSelectedTrip] = useState<Pick<Trip, "atc" | "order_no" | "child_order_no" | "amount_charged" | "payment_mode"> | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  async function loadAll() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: rec } = await supabase
      .from("Brokers")
      .select("broker_id")
      .eq("broker_id", user.id)
      .maybeSingle()

    const allTrips: Trip[] = []

    // Fetch DD trip IDs first to exclude mirror Trips rows
    const { data: ddIdRows } = await supabase.from("dd_trips").select("dd_trip_id")
    const ddTripIdSet = new Set((ddIdRows || []).map(r => r.dd_trip_id))

    const { data: tripsData } = await supabase
      .from("Trips")
      .select("*")
      .in("trip_status", ["In transit", "On hold"])
      .order("created_at", { ascending: false })

    if (tripsData) {
      // Filter out mirror rows that were created for DD trips
      const regularTrips = tripsData.filter(t => !ddTripIdSet.has(t.trip_id))
      const tripIds = regularTrips.map(t => t.trip_id)

      const { data: stopCounts } = await supabase
        .rpc("get_trip_stop_counts", { p_trip_ids: tripIds })

      const countMap: Record<string, number> = {}
      if (stopCounts) {
        for (const row of stopCounts) {
          countMap[row.trip_id] = Number(row.stop_count)
        }
      }

      const { data: allDiscRaw } = await supabase
        .from("trip_discrepancies")
        .select("trip_id, shortage, caked_bags")
        .in("trip_id", tripIds)
      const discByTrip = new Map<string, { shortage: number; caked_bags: number }[]>()
      for (const d of allDiscRaw || []) {
        if (!discByTrip.has(d.trip_id)) discByTrip.set(d.trip_id, [])
        discByTrip.get(d.trip_id)!.push(d)
      }

      const enriched = await Promise.all(
        regularTrips.map(async (trip) => {
          const { data: driver } = await supabase
            .from("Drivers")
            .select("full_name, phone_number, status")
            .eq("driver_id", trip.driver_id)
            .single()

          const { data: s } = await supabase
            .from("Stops")
            .select("stop_id, quantity_offloaded, stop_time, stop_location, broker_id, customer_id, confirmed, disputed, dispute_reason, store_name, stop_type")
            .eq("trip_id", trip.trip_id)
            .order("stop_time", { ascending: true })

          const discData = discByTrip.get(trip.trip_id) || []

          const stops: Stop[] = await Promise.all(
            (s || []).map(async (stop) => {
              let broker_name = null
              let customer_name = null

              if (stop.stop_type === "customer") {
                const { data: broker } = await supabase
                  .from("Brokers")
                  .select("broker_name")
                  .eq("broker_id", stop.broker_id)
                  .single()
                broker_name = broker?.broker_name ?? "Unknown"

                if (stop.customer_id) {
                  const { data: customerData } = await supabase
                    .from("Customers")
                    .select("full_name")
                    .eq("customer_id", stop.customer_id)
                    .single()
                  customer_name = customerData?.full_name ?? "Not provided"
                } else {
                  customer_name = "Not provided"
                }
              }

              const { data: confirmation } = await supabase
                .from("Stop_Confirmations")
                .select("price_per_bag")
                .eq("stop_id", stop.stop_id)
                .single()

              return {
                stop_id: stop.stop_id,
                stop_type: stop.stop_type,
                broker_name,
                customer_name,
                quantity_offloaded: stop.quantity_offloaded,
                stop_time: stop.stop_time,
                stop_location: stop.stop_location,
                store_name: stop.store_name ?? null,
                confirmed: stop.confirmed,
                disputed: stop.disputed,
                dispute_reason: stop.dispute_reason,
                price_per_bag: confirmation?.price_per_bag ?? null,
              }
            })
          )

          const { data: loadMoreRaw } = await supabase
            .from("trip_load_more")
            .select("id, quantity, loading_point_type, loading_point_name, product, created_at")
            .eq("trip_id", trip.trip_id)
            .order("created_at", { ascending: false })

          const load_more_entries: LoadMoreEntry[] = loadMoreRaw || []

          const totalOffloaded = stops.reduce((sum, st) => sum + st.quantity_offloaded, 0)
          const totalShortage = (discData || []).reduce((sum, d) => sum + (d.shortage || 0), 0)
          const totalCaked = (discData || []).reduce((sum, d) => sum + (d.caked_bags || 0), 0)

          return {
            trip_id: trip.trip_id,
            plate_number: trip.plate_number,
            driver_name: driver?.full_name ?? "Unknown",
            driver_phone: driver?.phone_number ?? "—",
            driver_status: driver?.status ?? "—",
            product: trip.product,
            material_centre: trip.material_centre,
            loaded_quantity: trip.loaded_quantity,
            remaining: trip.loaded_quantity - totalOffloaded - totalShortage - totalCaked,
            stop_count: countMap[trip.trip_id] ?? stops.length,
            stops,
            load_more_entries,
            trip_status: trip.trip_status,
            atc: trip.ATC ?? null,
            order_no: trip.order_no ?? null,
            child_order_no: trip.child_order_no ?? null,
            amount_charged: trip.amount_charged ?? null,
            payment_mode: trip.payment_mode ?? null,
            created_at: trip.created_at,
          } as Trip
        })
      )
      allTrips.push(...enriched)
    }

    const { data: ddTripsData } = await supabase
      .from("dd_trips")
      .select("*")
      .in("trip_status", ["In transit", "On hold"])
      .order("created_at", { ascending: false })

    if (ddTripsData) {
      const ddTripIds = ddTripsData.map(t => t.dd_trip_id)

      const { data: ddStopCounts } = await supabase
        .rpc("get_trip_stop_counts", { p_trip_ids: ddTripIds })

      const ddCountMap: Record<string, number> = {}
      if (ddStopCounts) {
        for (const row of ddStopCounts) {
          ddCountMap[row.trip_id] = Number(row.stop_count)
        }
      }

      const { data: ddDiscRaw } = await supabase
        .from("trip_discrepancies")
        .select("trip_id, shortage, caked_bags")
        .in("trip_id", ddTripIds)
      const ddDiscByTrip = new Map<string, { shortage: number; caked_bags: number }[]>()
      for (const d of ddDiscRaw || []) {
        if (!ddDiscByTrip.has(d.trip_id)) ddDiscByTrip.set(d.trip_id, [])
        ddDiscByTrip.get(d.trip_id)!.push(d)
      }

      const ddTrips: Trip[] = await Promise.all(
        ddTripsData.map(async (ddTrip) => {
          const { data: s } = await supabase
            .from("Stops")
            .select("stop_id, quantity_offloaded, stop_time, stop_location, broker_id, customer_id, confirmed, disputed, dispute_reason, store_name, stop_type")
            .eq("trip_id", ddTrip.dd_trip_id)
            .order("stop_time", { ascending: true })

          const discData = ddDiscByTrip.get(ddTrip.dd_trip_id) || []

          const stops: Stop[] = await Promise.all(
            (s || []).map(async (stop) => {
              let broker_name = null
              let customer_name = null

              if (stop.stop_type === "customer") {
                const { data: broker } = await supabase
                  .from("Brokers")
                  .select("broker_name")
                  .eq("broker_id", stop.broker_id)
                  .single()
                broker_name = broker?.broker_name ?? "Unknown"

                if (stop.customer_id) {
                  const { data: customerData } = await supabase
                    .from("Customers")
                    .select("full_name")
                    .eq("customer_id", stop.customer_id)
                    .single()
                  customer_name = customerData?.full_name ?? "Not provided"
                } else {
                  customer_name = "Not provided"
                }
              }

              const { data: confirmation } = await supabase
                .from("Stop_Confirmations")
                .select("price_per_bag")
                .eq("stop_id", stop.stop_id)
                .single()

              return {
                stop_id: stop.stop_id,
                stop_type: stop.stop_type,
                broker_name,
                customer_name,
                quantity_offloaded: stop.quantity_offloaded,
                stop_time: stop.stop_time,
                stop_location: stop.stop_location,
                store_name: stop.store_name ?? null,
                confirmed: stop.confirmed,
                disputed: stop.disputed,
                dispute_reason: stop.dispute_reason,
                price_per_bag: confirmation?.price_per_bag ?? null,
              }
            })
          )

          const { data: loadMoreRaw } = await supabase
            .from("trip_load_more")
            .select("id, quantity, loading_point_type, loading_point_name, product, created_at")
            .eq("trip_id", ddTrip.dd_trip_id)
            .order("created_at", { ascending: false })

          const load_more_entries: LoadMoreEntry[] = loadMoreRaw || []

          const totalOffloaded = stops.reduce((sum, st) => sum + st.quantity_offloaded, 0)
          const totalShortage = (discData || []).reduce((sum, d) => sum + (d.shortage || 0), 0)
          const totalCaked = (discData || []).reduce((sum, d) => sum + (d.caked_bags || 0), 0)

          return {
            trip_id: ddTrip.dd_trip_id,
            plate_number: ddTrip.plate_number,
            driver_name: ddTrip.driver_name ?? "DD Driver",
            driver_phone: ddTrip.driver_phone ?? "—",
            driver_status: "Active",
            product: ddTrip.product,
            material_centre: ddTrip.loading_point,
            loaded_quantity: ddTrip.loaded_quantity,
            remaining: ddTrip.loaded_quantity - totalOffloaded - totalShortage - totalCaked,
            stop_count: ddCountMap[ddTrip.dd_trip_id] ?? stops.length,
            stops,
            load_more_entries,
            trip_status: ddTrip.trip_status,
            atc: ddTrip.atc ?? null,
            order_no: ddTrip.order_no ?? null,
            child_order_no: ddTrip.child_order_no ?? null,
            amount_charged: null,
            payment_mode: null,
            created_at: ddTrip.created_at,
            isDD: true,
          } as Trip
        })
      )
      allTrips.push(...ddTrips)
    }

    allTrips.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    if (allTrips.length > 0) {
      setTrips(allTrips)
    }
    setLastUpdated(new Date())
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    loadAll()
    const interval = setInterval(loadAll, 30000)
    return () => clearInterval(interval)
  }, [])

  function closeModals() {
    setSelectedDriver(null)
    setSelectedStops(null)
    setSelectedLoadMore([])
  }

  return (
    <div style={{ padding: "24px 16px", maxWidth: 960, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div>
          <h2 style={{ fontSize: fontSize.lg, color: "#171717", margin: 0 }}>
            Active Trips
          </h2>
          {lastUpdated && (
            <p style={{ margin: "4px 0 0", color: "#94a3b8", fontSize: fontSize.xs }}>
              Updated: {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {trips.length > 0 && (
            <div style={{ display: "flex", background: "white", border: "1px solid #e2e8f0", borderRadius: 8, padding: 4, gap: 0 }}>
              <button
                onClick={() => setViewMode("card")}
                style={{
                  padding: "8px 12px", background: viewMode === "card" ? "#0070f3" : "transparent",
                  color: viewMode === "card" ? "white" : "#64748b", border: "none", borderRadius: 6,
                  cursor: "pointer", fontSize: fontSize.xs, fontWeight: 600,
                  minWidth: 44, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
                }}
                title="Card view"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z"/></svg>
              </button>
              <button
                onClick={() => setViewMode("table")}
                style={{
                  padding: "8px 12px", background: viewMode === "table" ? "#0070f3" : "transparent",
                  color: viewMode === "table" ? "white" : "#64748b", border: "none", borderRadius: 6,
                  cursor: "pointer", fontSize: fontSize.xs, fontWeight: 600,
                  minWidth: 44, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
                }}
                title="Table view"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 4h18v2H3V4zm0 7h18v2H3v-2zm0 7h18v2H3v-2z"/></svg>
              </button>
            </div>
          )}
          <button
            onClick={loadAll}
            style={{
              padding: "8px 12px", background: "white", color: "#64748b",
              border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer",
              fontSize: fontSize.xs, fontWeight: 500, minHeight: 40, minWidth: 40,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
            title="Refresh"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36M20.49 15a9 9 0 0 1-14.85 3.36"/></svg>
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <div style={{ width: 36, height: 36, border: "3px solid #e5e7eb", borderTopColor: "#0070f3", borderRadius: "50%", margin: "0 auto 12px", animation: "spin 0.8s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          <p style={{ color: "#9ca3af", fontSize: 14, margin: 0 }}>Loading...</p>
        </div>
      ) : trips.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <Icon icon="mdi:truck-off" width={48} color="#d1d5db" />
          <p style={{ color: "#9ca3af", fontSize: 15, margin: "12px 0 0 0" }}>
            No active trips
          </p>
        </div>
      ) : viewMode === "card" ? (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
          {trips.map((trip) => {
            const confirmed = trip.stops.filter(s => s.confirmed).length
            const pending = trip.stops.filter(s => !s.confirmed && !s.disputed).length
            const disputed = trip.stops.filter(s => s.disputed).length
            return (
              <div key={trip.trip_id} style={{ background: "white", borderRadius: 12, padding: 20, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)" }} onMouseEnter={e => { if (!isMobile) { e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.08)"; e.currentTarget.style.borderColor = "#cbd5e1" } }} onMouseLeave={e => { if (!isMobile) { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.05)"; e.currentTarget.style.borderColor = "#e2e8f0" } }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <h3 style={{ margin: 0, color: "#0f172a", fontSize: fontSize.lg, fontWeight: 700 }}>{trip.plate_number}</h3>
                      {trip.isDD ? (
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 12, background: "#f3e5f5", color: "#7c3aed", fontWeight: 700, border: "1px solid #d8b4fe" }}>DD</span>
                      ) : (
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 12, background: "#e0f2fe", color: "#0369a1", fontWeight: 700, border: "1px solid #7dd3fc" }}>SC/MDD</span>
                      )}
                    </div>
                    <p style={{ margin: 0, color: "#0070f3", fontSize: fontSize.sm, cursor: "pointer", textDecoration: "underline", fontWeight: 500 }} onClick={() => setSelectedDriver({ driver_name: trip.driver_name, driver_phone: trip.driver_phone, driver_status: trip.driver_status })}>
                      {trip.driver_name}
                    </p>
                  </div>
                  <span style={{ padding: "6px 12px", borderRadius: 16, fontSize: fontSize.xs, fontWeight: 600, background: trip.trip_status === "In transit" ? "#eff6ff" : trip.trip_status === "On hold" ? "#fffbeb" : "#f1f5f9", color: trip.trip_status === "In transit" ? "#0070f3" : trip.trip_status === "On hold" ? "#f5a623" : "#475569", border: `1.5px solid ${trip.trip_status === "In transit" ? "#0070f3" : trip.trip_status === "On hold" ? "#f5a623" : "#cbd5e1"}`, whiteSpace: "nowrap" }}>
                    {trip.trip_status}
                  </span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #f1f5f9" }}>
                  <p style={{ margin: 0, fontSize: fontSize.sm, color: "#475569" }}><span style={{ color: "#94a3b8", width: 70, display: "inline-block" }}>Product:</span> <span style={{ fontWeight: 500 }}>{trip.product}</span></p>
                  <p style={{ margin: 0, fontSize: fontSize.sm, color: "#475569" }}><span style={{ color: "#94a3b8", width: 70, display: "inline-block" }}>Centre:</span> {trip.material_centre}</p>
                  {trip.order_no ? (
                    <>
                      <p style={{ margin: 0, fontSize: fontSize.sm, color: "#475569" }}><span style={{ color: "#94a3b8", width: 70, display: "inline-block" }}>Order No:</span> {trip.order_no}</p>
                      {trip.child_order_no && <p style={{ margin: 0, fontSize: fontSize.sm, color: "#475569" }}><span style={{ color: "#94a3b8", width: 70, display: "inline-block" }}>Child:</span> {trip.child_order_no}</p>}
                    </>
                  ) : (
                    <p style={{ margin: 0, fontSize: fontSize.sm, color: "#475569" }}><span style={{ color: "#94a3b8", width: 70, display: "inline-block" }}>ATC:</span> {trip.atc || "N/A"}</p>
                  )}
                  {trip.amount_charged && <p style={{ margin: 0, fontSize: fontSize.sm, color: "#475569" }}><span style={{ color: "#94a3b8", width: 70, display: "inline-block" }}>Charged:</span> ₦{trip.amount_charged.toLocaleString()}</p>}
                  {trip.payment_mode && <p style={{ margin: 0, fontSize: fontSize.sm, color: "#475569" }}><span style={{ color: "#94a3b8", width: 70, display: "inline-block" }}>Payment:</span> {trip.payment_mode}</p>}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                  <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px" }}>
                    <p style={{ margin: 0, fontSize: fontSize.xs, color: "#64748b" }}>Loaded</p>
                    <p style={{ margin: "2px 0 0", fontWeight: 600, color: "#0f172a", fontSize: fontSize.md }}>{trip.loaded_quantity} bags</p>
                  </div>
                  <div style={{ background: trip.remaining === 0 ? "#fef2f2" : trip.remaining < trip.loaded_quantity * 0.2 ? "#fffbeb" : "#f0fdf4", borderRadius: 8, padding: "10px 12px", border: `1px solid ${trip.remaining === 0 ? "#fecaca" : trip.remaining < trip.loaded_quantity * 0.2 ? "#fde68a" : "#bbf7d0"}` }}>
                    <p style={{ margin: 0, fontSize: fontSize.xs, color: trip.remaining === 0 ? "#ef4444" : trip.remaining < trip.loaded_quantity * 0.2 ? "#f5a623" : "#16a34a" }}>Remaining</p>
                    <p style={{ margin: "2px 0 0", fontWeight: 700, color: trip.remaining === 0 ? "#b91c1c" : trip.remaining < trip.loaded_quantity * 0.2 ? "#b45309" : "#15803d", fontSize: fontSize.md }}>{trip.remaining} bags</p>
                  </div>
                </div>

                {trip.load_more_entries.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12, padding: 10, background: "#fffbeb", borderRadius: 8, border: "1px solid #fde68a" }}>
                    {trip.load_more_entries.map((entry) => (
                      <div key={entry.id} style={{ fontSize: fontSize.xs }}>
                        <p style={{ margin: 0, color: "#b45309", fontWeight: 600 }}>{entry.loading_point_name}</p>
                        <p style={{ margin: "2px 0 0", color: "#92400e" }}>{entry.product} <span style={{ fontWeight: 700 }}>+{entry.quantity}</span></p>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: fontSize.sm, color: "#64748b", fontWeight: 500 }}>{trip.stop_count} stops</span>
                    {confirmed > 0 && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#16a34a" }} title={`${confirmed} confirmed`} />}
                    {pending > 0 && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f5a623" }} title={`${pending} pending`} />}
                    {disputed > 0 && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444" }} title={`${disputed} disputed`} />}
                  </div>
                  <button
                    onClick={() => { setSelectedStops(trip.stops); setSelectedLoadMore(trip.load_more_entries); setSelectedPlate(trip.plate_number); setSelectedTrip({ atc: trip.atc, order_no: trip.order_no, child_order_no: trip.child_order_no, amount_charged: trip.amount_charged, payment_mode: trip.payment_mode }) }}
                    style={{ padding: "8px 16px", background: "#f0f7ff", color: "#0070f3", border: "1px solid #bfdbfe", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: fontSize.sm }}
                    onMouseEnter={e => e.currentTarget.style.background = "#e0efff"}
                    onMouseLeave={e => e.currentTarget.style.background = "#f0f7ff"}
                  >
                    Details
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", minWidth: 700 }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: fontSize.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Plate</th>
                <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: fontSize.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Driver</th>
                <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: fontSize.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Product</th>
                <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: fontSize.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>ATC / Order</th>
                <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: fontSize.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Loaded</th>
                <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: fontSize.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Remaining</th>
                <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: fontSize.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Stops</th>
                <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: fontSize.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {trips.map((trip) => {
                const confirmed = trip.stops.filter(s => s.confirmed).length
                const pending = trip.stops.filter(s => !s.confirmed && !s.disputed).length
                const disputed = trip.stops.filter(s => s.disputed).length

                return (
                  <tr key={trip.trip_id} style={{ borderBottom: "1px solid #e2e8f0" }} onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: fontSize.base, fontWeight: 600 }}>
                      {trip.plate_number}
                      {trip.isDD ? (
                        <span style={{ marginLeft: 8, fontSize: 10, padding: "2px 8px", borderRadius: 12, background: "#f3e5f5", color: "#7c3aed", fontWeight: 700, border: "1px solid #d8b4fe" }}>DD</span>
                      ) : (
                        <span style={{ marginLeft: 8, fontSize: 10, padding: "2px 8px", borderRadius: 12, background: "#e0f2fe", color: "#0369a1", fontWeight: 700, border: "1px solid #7dd3fc" }}>SC/MDD</span>
                      )}
                    </td>
                    <td style={{ padding: "12px 16px", color: "#0070f3", fontSize: fontSize.base, cursor: "pointer", textDecoration: "underline" }} onClick={() => setSelectedDriver({ driver_name: trip.driver_name, driver_phone: trip.driver_phone, driver_status: trip.driver_status })}>
                      {trip.driver_name}
                    </td>
                    <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: fontSize.base }}>{trip.product}</td>
                    <td style={{ padding: "12px 16px", color: "#64748b", fontSize: fontSize.sm }}>{trip.order_no ? `${trip.order_no}${trip.child_order_no ? ` / ${trip.child_order_no}` : ""}` : trip.atc || "N/A"}</td>
                    <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: fontSize.base, fontWeight: 500 }}>{trip.loaded_quantity}</td>
                    <td style={{ padding: "12px 16px", color: trip.remaining === 0 ? "#ef4444" : trip.remaining < trip.loaded_quantity * 0.2 ? "#f5a623" : "#16a34a", fontSize: fontSize.base, fontWeight: 600 }}>{trip.remaining}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ color: "#0070f3", fontSize: fontSize.sm, fontWeight: 500, textDecoration: "underline", cursor: "pointer" }}
                        onClick={() => { setSelectedStops(trip.stops); setSelectedLoadMore(trip.load_more_entries); setSelectedPlate(trip.plate_number); setSelectedTrip({ atc: trip.atc, order_no: trip.order_no, child_order_no: trip.child_order_no, amount_charged: trip.amount_charged, payment_mode: trip.payment_mode }) }}>
                        {trip.stop_count} {trip.stop_count === 1 ? "stop" : "stops"}
                      </span>
                      {confirmed > 0 && <span style={{ marginLeft: 4, width: 8, height: 8, borderRadius: "50%", background: "#16a34a", display: "inline-block" }} title={`${confirmed} confirmed`} />}
                      {pending > 0 && <span style={{ marginLeft: 4, width: 8, height: 8, borderRadius: "50%", background: "#f5a623", display: "inline-block" }} title={`${pending} pending`} />}
                      {disputed > 0 && <span style={{ marginLeft: 4, width: 8, height: 8, borderRadius: "50%", background: "#ef4444", display: "inline-block" }} title={`${disputed} disputed`} />}
                      {trip.load_more_entries.length > 0 && <span style={{ marginLeft: 4, fontSize: 10, padding: "2px 6px", background: "#fffbeb", borderRadius: 12, color: "#f59e0b", fontWeight: "bold", border: "1px solid #fde68a" }}>+{trip.load_more_entries.reduce((s, e) => s + e.quantity, 0)}</span>}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ padding: "6px 10px", borderRadius: 14, fontSize: fontSize.xs, fontWeight: 600, background: trip.trip_status === "In transit" ? "#eff6ff" : trip.trip_status === "On hold" ? "#fffbeb" : "#f1f5f9", color: trip.trip_status === "In transit" ? "#0070f3" : trip.trip_status === "On hold" ? "#f5a623" : "#475569", border: `1.5px solid ${trip.trip_status === "In transit" ? "#0070f3" : trip.trip_status === "On hold" ? "#f5a623" : "#cbd5e1"}` }}>
                        {trip.trip_status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Driver Info Modal */}
      {selectedDriver && (
        <div onClick={closeModals} style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 100, padding: isMobile ? 0 : 24, animation: "fadeIn 0.2s ease-out" }}>
          <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
          <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: isMobile ? "20px 20px 0 0" : 12, padding: isMobile ? "28px 20px" : 32, width: "100%", maxWidth: 500, maxHeight: isMobile ? "90vh" : "80vh", overflowY: "auto", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)", animation: "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h3 style={{ margin: 0, color: "#0f172a", fontSize: fontSize.xl, fontWeight: 700 }}>Driver Info</h3>
              <button onClick={closeModals} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 0, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
              <div>
                <p style={{ margin: "0 0 4px 0", color: "#94a3b8", fontSize: fontSize.xs }}>Full Name</p>
                <p style={{ margin: 0, color: "#0f172a", fontSize: fontSize.base, fontWeight: 500 }}>{selectedDriver.driver_name}</p>
              </div>
              <div>
                <p style={{ margin: "0 0 4px 0", color: "#94a3b8", fontSize: fontSize.xs }}>Phone</p>
                <p style={{ margin: 0, color: "#0f172a", fontSize: fontSize.base, fontWeight: 500 }}>{selectedDriver.driver_phone}</p>
              </div>
              <div>
                <p style={{ margin: "0 0 4px 0", color: "#94a3b8", fontSize: fontSize.xs }}>Status</p>
                <p style={{ margin: 0, color: "#0f172a", fontSize: fontSize.base, fontWeight: 500 }}>{selectedDriver.driver_status}</p>
              </div>
            </div>
            <button onClick={closeModals} style={{ width: "100%", padding: "12px 16px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: fontSize.md, minHeight: 44 }}>
              Close
            </button>
          </div>
        </div>
      )}

      {/* Stops Modal */}
      {selectedStops && (
        <div onClick={closeModals} style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 100, padding: isMobile ? 0 : 24, animation: "fadeIn 0.2s ease-out" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: isMobile ? "20px 20px 0 0" : 12, padding: isMobile ? "28px 20px" : 32, width: "100%", maxWidth: 500, maxHeight: isMobile ? "90vh" : "80vh", overflowY: "auto", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)", animation: "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h3 style={{ margin: "0 0 4px 0", color: "#0f172a", fontSize: fontSize.xl, fontWeight: 700 }}>Stops</h3>
                <p style={{ margin: 0, color: "#94a3b8", fontSize: fontSize.sm }}>{selectedPlate}</p>
              </div>
              <button onClick={closeModals} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 0, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>

            {selectedTrip?.order_no ? (
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 14px", marginBottom: 8 }}>
                <p style={{ margin: 0, fontSize: fontSize.sm, color: "#0f172a" }}><strong>Order No:</strong> {selectedTrip.order_no}</p>
                {selectedTrip.child_order_no && <p style={{ margin: "4px 0 0", fontSize: fontSize.sm, color: "#0f172a" }}><strong>Child Order No:</strong> {selectedTrip.child_order_no}</p>}
              </div>
            ) : selectedTrip?.atc ? (
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 14px", marginBottom: 8 }}>
                <p style={{ margin: 0, fontSize: fontSize.sm, color: "#0f172a" }}><strong>ATC:</strong> {selectedTrip.atc}</p>
              </div>
            ) : null}

            {selectedTrip?.amount_charged && (
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "12px 14px", marginBottom: 16, display: "flex", gap: 24 }}>
                <p style={{ margin: 0, fontSize: fontSize.sm, color: "#0f172a" }}><strong>Amount Charged:</strong> ₦{selectedTrip.amount_charged.toLocaleString()}</p>
                <p style={{ margin: 0, fontSize: fontSize.sm, color: "#0f172a" }}><strong>Payment Mode:</strong> {selectedTrip.payment_mode}</p>
              </div>
            )}

            {selectedStops.length === 0 ? (
              <p style={{ color: "#94a3b8", fontSize: fontSize.base }}>No stops on this trip.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
                {selectedStops.map((stop, index) => (
                  <div key={stop.stop_id} style={{ padding: 14, border: `1px solid ${stop.disputed ? "#fca5a5" : stop.confirmed ? "#86efac" : "#e2e8f0"}`, borderRadius: 8, background: stop.disputed ? "#fef2f2" : stop.confirmed ? "#f0fdf4" : "#f8fafc" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div>
                        <p style={{ margin: "0 0 4px 0", color: "#0f172a", fontSize: fontSize.base, fontWeight: 600 }}>Stop {index + 1}</p>
                        <span style={{ fontSize: fontSize.xs, padding: "3px 8px", borderRadius: 4, background: stop.stop_type === "customer" ? "#eff6ff" : "#f3e5f5", color: stop.stop_type === "customer" ? "#0070f3" : "#7c3aed" }}>
                          {stop.stop_type === "customer" ? "Customer" : "Store"}
                        </span>
                      </div>
                      {stop.disputed && <span style={{ fontSize: fontSize.xs, padding: "4px 10px", background: "#fef2f2", borderRadius: 16, color: "#ef4444", fontWeight: 600 }}>Disputed</span>}
                      {!stop.disputed && stop.confirmed && <span style={{ fontSize: fontSize.xs, padding: "4px 10px", background: "#f0fdf4", borderRadius: 16, color: "#16a34a", fontWeight: 600 }}>Confirmed</span>}
                      {!stop.disputed && !stop.confirmed && <span style={{ fontSize: fontSize.xs, padding: "4px 10px", background: "#fffbeb", borderRadius: 16, color: "#f5a623", fontWeight: 600 }}>Pending</span>}
                    </div>

                    {stop.stop_type === "customer" && (
                      <>
                        <p style={{ margin: "6px 0", color: "#475569", fontSize: fontSize.sm }}><strong>Broker:</strong> <span style={{ color: "#0f172a" }}>{stop.broker_name}</span></p>
                        <p style={{ margin: "6px 0", color: "#475569", fontSize: fontSize.sm }}><strong>Customer:</strong> <span style={{ color: "#0f172a" }}>{stop.customer_name}</span></p>
                      </>
                    )}

                    {stop.stop_type === "store" && (
                      <p style={{ margin: "6px 0", color: "#475569", fontSize: fontSize.sm }}><strong>Store:</strong> <span style={{ color: "#0f172a" }}>{stop.stop_location}</span></p>
                    )}

                    <p style={{ margin: "6px 0", color: "#475569", fontSize: fontSize.sm }}><strong>Offloaded:</strong> <span style={{ color: "#0f172a" }}>{stop.quantity_offloaded} bags</span></p>
                    {stop.confirmed && stop.price_per_bag && <p style={{ margin: "6px 0", color: "#475569", fontSize: fontSize.sm }}><strong>Price:</strong> <span style={{ color: "#0f172a" }}>₦{stop.price_per_bag.toLocaleString()}/bag</span></p>}

                    {stop.disputed && stop.dispute_reason && (
                      <div style={{ marginTop: 10, padding: 12, background: "#fff5f5", borderRadius: 6, border: "1px solid #fecaca" }}>
                        <p style={{ margin: "0 0 6px 0", fontSize: fontSize.xs, color: "#ef4444", fontWeight: 600 }}>Dispute Reason:</p>
                        <p style={{ margin: 0, fontSize: fontSize.sm, color: "#7f1d1d" }}>{stop.dispute_reason}</p>
                      </div>
                    )}

                    <p style={{ margin: "10px 0 0 0", color: "#94a3b8", fontSize: fontSize.xs }}>{new Date(stop.stop_time).toLocaleString()}</p>
                  </div>
                ))}

                {selectedLoadMore.length > 0 && (
                  <>
                    <p style={{ fontWeight: 700, margin: "16px 0 12px 0", fontSize: fontSize.base, color: "#0f172a" }}>Additional Loads ({selectedLoadMore.length})</p>
                    {selectedLoadMore.map((entry) => (
                      <div key={entry.id} style={{ padding: 14, border: "1px solid #fde68a", borderRadius: 8, background: "#fffbeb" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div>
                            <p style={{ margin: "0 0 4px 0", fontWeight: 600, fontSize: fontSize.sm, color: "#0f172a" }}>{entry.loading_point_name}</p>
                            <span style={{ fontSize: fontSize.xs, padding: "3px 8px", borderRadius: 4, background: "#fef3c7", color: "#b45309" }}>{entry.loading_point_type}</span>
                          </div>
                          <p style={{ margin: 0, fontWeight: 700, fontSize: fontSize.base, color: "#f59e0b" }}>+{entry.quantity}</p>
                        </div>
                        <p style={{ margin: "8px 0 0 0", color: "#475569", fontSize: fontSize.sm }}><strong>Product:</strong> <span style={{ color: "#0f172a" }}>{entry.product}</span></p>
                        <p style={{ margin: "6px 0 0 0", color: "#94a3b8", fontSize: fontSize.xs }}>{new Date(entry.created_at).toLocaleString()}</p>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
              <button onClick={closeModals} style={{ padding: "12px 16px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: fontSize.md, minHeight: 44 }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
