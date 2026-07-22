"use client"

import { FONT_SIZE, POLLING_INTERVAL } from "@/lib/constants"

import { useState, useEffect } from "react"
import { Icon } from "@iconify/react"
import { supabase } from "@/lib/supabase"
import { apiMutate } from "@/lib/api-mutation"
import ReassignBroker from "@/components/admin/ReassignBroker"
import { usePermissions } from "@/lib/PermissionContext"

type Stop = {
  stop_id: string
  stop_type: "customer" | "store"
  broker_name: string | null
  customer_name: string | null
  quantity_offloaded: number
  latitude: number
  longitude: number
  stop_time: string
  stop_location: string
  store_name: string | null
  confirmed: boolean
  disputed: boolean
  dispute_reason: string | null
  price_per_bag: number | null
}

type Discrepancy = {
  discrepancy_id: string
  shortage: number
  caked_bags: number
  notes: string | null
  reported_at: string
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
  driver_id: string
  driver_name: string
  driver_phone: string
  driver_status: string
  product: string
  material_centre: string
  loaded_quantity: number
  remaining: number
  stop_count: number
  stops: Stop[]
  discrepancies: Discrepancy[]
  load_more_entries: LoadMoreEntry[]
  trip_status: string
  atc: string | null
  order_no: string | null
  child_order_no: string | null
  amount_charged: number | null
  payment_mode: string | null
  created_at: string
  completed_at: string | null
  isDD?: boolean
}

type ViewMode = "card" | "table"

function useBreakpoint() {
  const [isDesktop, setIsDesktop] = useState(false)
  const [isMobile, setIsMobile] = useState(true)

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640)
      setIsDesktop(window.innerWidth >= 640)
    }

    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  return { isMobile, isDesktop }
}



const getPillStyle = (filter: string, isActive: boolean) => {
  if (!isActive) {
    return { bg: "white", textColor: "#64748b", borderColor: "#e2e8f0" }
  }
  
  if (filter === "All") {
    return { bg: "#171717", textColor: "white", borderColor: "#171717" }
  } else if (filter === "Active") {
    return { bg: "#eff6ff", textColor: "#0070f3", borderColor: "#0070f3" }
  } else if (filter === "In transit") {
    return { bg: "#eff6ff", textColor: "#0070f3", borderColor: "#0070f3" }
  } else if (filter === "On hold") {
    return { bg: "#fffbeb", textColor: "#f5a623", borderColor: "#f5a623" }
  } else if (filter === "Completed") {
    return { bg: "#f0fdf4", textColor: "#16a34a", borderColor: "#16a34a" }
  } else if (filter === "Disputed") {
    return { bg: "#fef2f2", textColor: "#ef4444", borderColor: "#ef4444" }
  }
  
  return { bg: "white", textColor: "#64748b", borderColor: "#e2e8f0" }
}

const filterOptions = ["Active", "All", "In transit", "On hold", "Completed", "Disputed"]

export default function MonitorTrips() {
  const { isMobile, isDesktop } = useBreakpoint()
  const { getAccess } = usePermissions()
  const canEdit = getAccess("monitor-trips").canEdit
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState("Active")
  const [viewMode, setViewMode] = useState<ViewMode>("card")
  const [selectedDriver, setSelectedDriver] = useState<Pick<Trip, "driver_name" | "driver_phone" | "driver_status"> | null>(null)
  const [selectedStops, setSelectedStops] = useState<Stop[] | null>(null)
  const [selectedDiscrepancies, setSelectedDiscrepancies] = useState<Discrepancy[]>([])
  const [selectedLoadMore, setSelectedLoadMore] = useState<LoadMoreEntry[]>([])
  const [selectedPlate, setSelectedPlate] = useState("")
  const [selectedTrip, setSelectedTrip] = useState<Pick<Trip, "trip_id" | "plate_number" | "atc" | "order_no" | "child_order_no" | "amount_charged" | "payment_mode" | "trip_status"> | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [endingTrip, setEndingTrip] = useState<string | null>(null)
  const [endTripError, setEndTripError] = useState<string | null>(null)
  const [endTripLoading, setEndTripLoading] = useState(false)

  useEffect(() => {
    // Set default viewmode once breakpoint initializes
    setViewMode(isMobile ? "card" : "table")
  }, [isMobile])

  async function fetchTrips() {
    const { data: tripsData, error } = await supabase
      .from("Trips")
      .select("*")
      .order("created_at", { ascending: false })

    if (error || !tripsData) return []

    const tripIds = tripsData.map(t => t.trip_id)

    const driverIds = tripsData.map(t => t.driver_id).filter(Boolean)
    const driverMap = new Map<string, { full_name: string; phone_number: string; status: string }>()
    if (driverIds.length > 0) {
      const { data: driversData } = await supabase
        .from("Drivers")
        .select("driver_id, full_name, phone_number, status")
        .in("driver_id", driverIds)
      for (const d of driversData || []) driverMap.set(d.driver_id, d)
    }

    const { data: allStopsRaw } = await supabase
      .from("Stops")
      .select("stop_id, trip_id, quantity_offloaded, latitude, longitude, stop_time, stop_location, broker_id, customer_id, confirmed, disputed, dispute_reason, store_name, stop_type")
      .in("trip_id", tripIds)
      .order("stop_time", { ascending: true })

    const stopsByTrip = new Map<string, typeof allStopsRaw>()
    for (const stop of allStopsRaw || []) {
      if (!stopsByTrip.has(stop.trip_id)) stopsByTrip.set(stop.trip_id, [])
      stopsByTrip.get(stop.trip_id)!.push(stop)
    }

    const allStops = allStopsRaw || []
    const brokerIds = [...new Set(allStops.filter(s => s.stop_type === "customer").map(s => s.broker_id).filter(Boolean))]
    const brokerMap = new Map<string, { broker_name: string }>()
    if (brokerIds.length > 0) {
      const { data: brokersData } = await supabase
        .from("Brokers")
        .select("broker_id, broker_name")
        .in("broker_id", brokerIds)
      for (const b of brokersData || []) brokerMap.set(b.broker_id, b)
    }

    const customerIds = [...new Set(allStops.filter(s => s.stop_type === "customer" && s.customer_id).map(s => s.customer_id).filter(Boolean))]
    const customerMap = new Map<string, { full_name: string }>()
    if (customerIds.length > 0) {
      const { data: customersData } = await supabase
        .from("Customers")
        .select("customer_id, full_name")
        .in("customer_id", customerIds)
      for (const c of customersData || []) customerMap.set(c.customer_id, c)
    }

    const stopIds = allStops.map(s => s.stop_id).filter(Boolean)
    const confirmationMap = new Map<string, { price_per_bag: number }>()
    if (stopIds.length > 0) {
      const { data: confirmationsData } = await supabase
        .from("Stop_Confirmations")
        .select("stop_id, price_per_bag")
        .in("stop_id", stopIds)
      for (const c of confirmationsData || []) confirmationMap.set(c.stop_id, c)
    }

    const discByTrip = new Map<string, Discrepancy[]>()
    const { data: allDiscRaw } = await supabase
      .from("trip_discrepancies")
      .select("discrepancy_id, trip_id, shortage, caked_bags, notes, reported_at")
      .in("trip_id", tripIds)
      .order("reported_at", { ascending: true })
    for (const d of allDiscRaw || []) {
      if (!discByTrip.has(d.trip_id)) discByTrip.set(d.trip_id, [])
      discByTrip.get(d.trip_id)!.push(d)
    }

    const loadMoreByTrip = new Map<string, LoadMoreEntry[]>()
    const { data: allLoadMoreRaw } = await supabase
      .from("trip_load_more")
      .select("id, trip_id, quantity, loading_point_type, loading_point_name, product, created_at")
      .in("trip_id", tripIds)
      .order("created_at", { ascending: false })
    for (const lm of allLoadMoreRaw || []) {
      if (!loadMoreByTrip.has(lm.trip_id)) loadMoreByTrip.set(lm.trip_id, [])
      loadMoreByTrip.get(lm.trip_id)!.push(lm)
    }

    const enriched = tripsData.map((trip) => {
      const driver = driverMap.get(trip.driver_id)
      const stopsRaw = stopsByTrip.get(trip.trip_id) || []

      const stops: Stop[] = stopsRaw.map((stop) => {
        let broker_name = null
        let customer_name = null

        if (stop.stop_type === "customer") {
          const broker = brokerMap.get(stop.broker_id)
          broker_name = broker?.broker_name ?? "Unknown"

          if (stop.customer_id) {
            const customer = customerMap.get(stop.customer_id)
            customer_name = customer?.full_name ?? "Not provided"
          } else {
            customer_name = "Not provided"
          }
        }

        const confirmation = confirmationMap.get(stop.stop_id)

        return {
          stop_id: stop.stop_id,
          stop_type: stop.stop_type,
          broker_name,
          customer_name,
          quantity_offloaded: stop.quantity_offloaded,
          latitude: stop.latitude,
          longitude: stop.longitude,
          stop_time: stop.stop_time,
          stop_location: stop.stop_location,
          store_name: stop.store_name ?? null,
          confirmed: stop.confirmed,
          disputed: stop.disputed,
          dispute_reason: stop.dispute_reason,
          price_per_bag: confirmation?.price_per_bag ?? null,
        }
      })

      const discrepancies: Discrepancy[] = discByTrip.get(trip.trip_id) || []
      const load_more_entries: LoadMoreEntry[] = loadMoreByTrip.get(trip.trip_id) || []

      const totalOffloaded = stops.reduce((sum, s) => sum + s.quantity_offloaded, 0)
      const totalShortage = discrepancies.reduce((sum, d) => sum + (d.shortage || 0), 0)
      const totalCaked = discrepancies.reduce((sum, d) => sum + (d.caked_bags || 0), 0)

      return {
        trip_id: trip.trip_id,
        plate_number: trip.plate_number,
        driver_id: trip.driver_id,
        driver_name: driver?.full_name ?? "Unknown",
        driver_phone: driver?.phone_number ?? "—",
        driver_status: driver?.status ?? "—",
        product: trip.product,
        material_centre: trip.material_centre,
        loaded_quantity: trip.loaded_quantity,
        remaining: trip.loaded_quantity - totalOffloaded - totalShortage - totalCaked,
        stop_count: stops.length,
        stops,
        discrepancies,
        load_more_entries,
        trip_status: trip.trip_status,
        atc: trip.ATC ?? null,
        order_no: trip.order_no ?? null,
        child_order_no: trip.child_order_no ?? null,
        amount_charged: trip.amount_charged ?? null,
        payment_mode: trip.payment_mode ?? null,
        created_at: trip.created_at,
        completed_at: trip.trip_status === "Completed" ? trip.updated_at ?? null : null,
      }
    })

    return enriched
  }

  async function fetchDdTrips() {
    const { data: ddTripsData, error } = await supabase
      .from("dd_trips")
      .select("*")
      .order("created_at", { ascending: false })

    if (error || !ddTripsData) return []

    const ddTripIds = ddTripsData.map(t => t.dd_trip_id)

    const { data: allStopsRaw } = await supabase
      .from("Stops")
      .select("stop_id, trip_id, quantity_offloaded, latitude, longitude, stop_time, stop_location, broker_id, customer_id, confirmed, disputed, dispute_reason, store_name, stop_type")
      .in("trip_id", ddTripIds)
      .order("stop_time", { ascending: true })

    const stopsByTrip = new Map<string, typeof allStopsRaw>()
    for (const stop of allStopsRaw || []) {
      if (!stopsByTrip.has(stop.trip_id)) stopsByTrip.set(stop.trip_id, [])
      stopsByTrip.get(stop.trip_id)!.push(stop)
    }

    const allStops = allStopsRaw || []
    const brokerIds = [...new Set(allStops.filter(s => s.stop_type === "customer").map(s => s.broker_id).filter(Boolean))]
    const brokerMap = new Map<string, { broker_name: string }>()
    if (brokerIds.length > 0) {
      const { data: brokersData } = await supabase
        .from("Brokers")
        .select("broker_id, broker_name")
        .in("broker_id", brokerIds)
      for (const b of brokersData || []) brokerMap.set(b.broker_id, b)
    }

    const customerIds = [...new Set(allStops.filter(s => s.stop_type === "customer" && s.customer_id).map(s => s.customer_id).filter(Boolean))]
    const customerMap = new Map<string, { full_name: string }>()
    if (customerIds.length > 0) {
      const { data: customersData } = await supabase
        .from("Customers")
        .select("customer_id, full_name")
        .in("customer_id", customerIds)
      for (const c of customersData || []) customerMap.set(c.customer_id, c)
    }

    const stopIds = allStops.map(s => s.stop_id).filter(Boolean)
    const confirmationMap = new Map<string, { price_per_bag: number }>()
    if (stopIds.length > 0) {
      const { data: confirmationsData } = await supabase
        .from("Stop_Confirmations")
        .select("stop_id, price_per_bag")
        .in("stop_id", stopIds)
      for (const c of confirmationsData || []) confirmationMap.set(c.stop_id, c)
    }

    const ddDiscByTrip = new Map<string, Discrepancy[]>()
    const { data: allDiscRaw } = await supabase
      .from("trip_discrepancies")
      .select("discrepancy_id, trip_id, shortage, caked_bags, notes, reported_at")
      .in("trip_id", ddTripIds)
      .order("reported_at", { ascending: true })
    for (const d of allDiscRaw || []) {
      if (!ddDiscByTrip.has(d.trip_id)) ddDiscByTrip.set(d.trip_id, [])
      ddDiscByTrip.get(d.trip_id)!.push(d)
    }

    const loadMoreByTrip = new Map<string, LoadMoreEntry[]>()
    const { data: allLoadMoreRaw } = await supabase
      .from("trip_load_more")
      .select("id, trip_id, quantity, loading_point_type, loading_point_name, product, created_at")
      .in("trip_id", ddTripIds)
      .order("created_at", { ascending: false })
    for (const lm of allLoadMoreRaw || []) {
      if (!loadMoreByTrip.has(lm.trip_id)) loadMoreByTrip.set(lm.trip_id, [])
      loadMoreByTrip.get(lm.trip_id)!.push(lm)
    }

    const ddTrips: Trip[] = ddTripsData.map((ddTrip) => {
      const stopsRaw = stopsByTrip.get(ddTrip.dd_trip_id) || []

      const stops: Stop[] = stopsRaw.map((stop) => {
        let broker_name = null
        let customer_name = null

        if (stop.stop_type === "customer") {
          const broker = brokerMap.get(stop.broker_id)
          broker_name = broker?.broker_name ?? "Unknown"

          if (stop.customer_id) {
            const customer = customerMap.get(stop.customer_id)
            customer_name = customer?.full_name ?? "Not provided"
          } else {
            customer_name = "Not provided"
          }
        }

        const confirmation = confirmationMap.get(stop.stop_id)

        return {
          stop_id: stop.stop_id,
          stop_type: stop.stop_type,
          broker_name,
          customer_name,
          quantity_offloaded: stop.quantity_offloaded,
          latitude: stop.latitude,
          longitude: stop.longitude,
          stop_time: stop.stop_time,
          stop_location: stop.stop_location,
          store_name: stop.store_name ?? null,
          confirmed: stop.confirmed,
          disputed: stop.disputed,
          dispute_reason: stop.dispute_reason,
          price_per_bag: confirmation?.price_per_bag ?? null,
        }
      })

      const load_more_entries: LoadMoreEntry[] = loadMoreByTrip.get(ddTrip.dd_trip_id) || []

      const discrepancies: Discrepancy[] = ddDiscByTrip.get(ddTrip.dd_trip_id) || []

      const totalOffloaded = stops.reduce((sum, s) => sum + s.quantity_offloaded, 0)
      const totalShortage = discrepancies.reduce((sum, d) => sum + (d.shortage || 0), 0)
      const totalCaked = discrepancies.reduce((sum, d) => sum + (d.caked_bags || 0), 0)

      return {
        trip_id: ddTrip.dd_trip_id,
        plate_number: ddTrip.plate_number,
        driver_id: "",
        driver_name: ddTrip.driver_name ?? "DD Driver",
        driver_phone: ddTrip.driver_phone ?? "—",
        driver_status: "Active",
        product: ddTrip.product,
        material_centre: ddTrip.loading_point,
        loaded_quantity: ddTrip.loaded_quantity,
        remaining: ddTrip.loaded_quantity - totalOffloaded - totalShortage - totalCaked,
        stop_count: stops.length,
        stops,
        discrepancies,
        load_more_entries,
        trip_status: ddTrip.trip_status,
        atc: ddTrip.atc ?? null,
        order_no: ddTrip.order_no ?? null,
        child_order_no: ddTrip.child_order_no ?? null,
        amount_charged: null,
        payment_mode: null,
        created_at: ddTrip.created_at,
        completed_at: ddTrip.trip_status === "Completed" ? ddTrip.updated_at ?? null : null,
        isDD: true,
      }
    })

    return ddTrips
  }

  async function loadAll() {
    const [normal, dd] = await Promise.all([
      fetchTrips().catch(() => []),
      fetchDdTrips().catch(() => [])
    ])
    const ddTripIds = new Set(dd.map(t => t.trip_id))
    const allTrips = [...normal.filter(t => !ddTripIds.has(t.trip_id)), ...dd]
    setTrips(allTrips)
    setLastUpdated(new Date())
    setLoading(false)
  }

  useEffect(() => {
    loadAll()
    const interval = setInterval(loadAll, POLLING_INTERVAL)
    return () => clearInterval(interval)
  }, [])

  function handleEndTripClick() {
    if (!selectedStops || !selectedTrip) return
    setEndTripError(null)
    const hasUnresolved = selectedStops.some((s) => !s.confirmed || s.disputed)
    if (hasUnresolved) {
      setEndTripError("Resolve all disputed and unconfirmed stops before ending this trip.")
      return
    }
    setEndingTrip(selectedTrip.trip_id)
  }

  async function confirmEndTrip() {
    if (!endingTrip || !selectedTrip) return
    setEndTripLoading(true)

    const r1 = await apiMutate("trips", { action: "update", table: "Trips", data: { trip_status: "Completed" }, filters: { trip_id: endingTrip } })
    const r2 = await apiMutate("trips", { action: "update", table: "Trucks", data: { status: "Empty" }, filters: { plate_number: selectedTrip.plate_number } })
    if (r1.error) console.error("EndTrip update Trips failed:", r1.error)
    if (r2.error) console.error("EndTrip update Trucks failed:", r2.error)

    setEndTripLoading(false)
    setEndingTrip(null)
    setSelectedStops(null)
    setSelectedTrip(null)
    loadAll()
  }

  const disputedTripCount = trips.filter((t) => t.stops.some((s) => s.disputed)).length

  const filteredTrips = filterStatus === "All"
    ? trips
    : filterStatus === "Active"
    ? trips.filter((t) => t.trip_status === "In transit" || t.trip_status === "On hold")
    : filterStatus === "Disputed"
    ? trips.filter((t) => t.stops.some((s) => s.disputed))
    : trips.filter((t) => t.trip_status === filterStatus)

  function closeModals() {
    setSelectedDriver(null)
    setSelectedStops(null)
    setSelectedDiscrepancies([])
    setSelectedLoadMore([])
    setEndTripError(null)
    setEndingTrip(null)
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: isMobile ? "16px" : "32px", fontFamily: "'Inter', sans-serif" }}>
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, color: "#0f172a", fontSize: isMobile ? FONT_SIZE["2xl"] : FONT_SIZE["3xl"], fontWeight: 700, letterSpacing: "-0.5px" }}>
            Monitor Trips
          </h1>
          <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: FONT_SIZE.base }}>
            Track active trips and manage stops.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, width: isMobile ? "100%" : "auto" }}>
          {trips.length > 0 && (
            <div style={{ display: "flex", background: "white", border: "1px solid #e2e8f0", borderRadius: 8, padding: 4, gap: 0 }}>
              <button
                onClick={() => setViewMode("card")}
                style={{
                  padding: "8px 12px",
                  background: viewMode === "card" ? "#0070f3" : "transparent",
                  color: viewMode === "card" ? "white" : "#64748b",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: FONT_SIZE.xs,
                  fontWeight: 600,
                  minWidth: 44,
                  height: 40,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s"
                }}
                title="Card view"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z"/></svg>
              </button>
              <button
                onClick={() => setViewMode("table")}
                style={{
                  padding: "8px 12px",
                  background: viewMode === "table" ? "#0070f3" : "transparent",
                  color: viewMode === "table" ? "white" : "#64748b",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: FONT_SIZE.xs,
                  fontWeight: 600,
                  minWidth: 44,
                  height: 40,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s"
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
              padding: "8px 12px",
              background: "white",
              color: "#64748b",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: FONT_SIZE.xs,
              fontWeight: 500,
              minHeight: 40,
              minWidth: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s"
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1" }}
            onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#e2e8f0" }}
            title="Refresh"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36M20.49 15a9 9 0 0 1-14.85 3.36"/></svg>
          </button>
        </div>
      </div>

      {lastUpdated && (
        <p style={{ margin: "0 0 20px 0", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>
          Updated: {lastUpdated.toLocaleTimeString()}
        </p>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24, overflowX: "auto", paddingBottom: 4 }}>
        {filterOptions.map((option) => {
          const isActive = filterStatus === option
          const pill = getPillStyle(option, isActive)
          return (
            <button
              key={option}
              onClick={() => setFilterStatus(option)}
              style={{
                padding: "8px 14px",
                borderRadius: 24,
                fontSize: FONT_SIZE.sm,
                cursor: "pointer",
                border: `1.5px solid ${pill.borderColor}`,
                background: pill.bg,
                color: pill.textColor,
                fontWeight: isActive ? 600 : 500,
                transition: "all 0.2s",
                whiteSpace: "nowrap"
              }}
              onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1" } }}
              onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#e2e8f0" } }}
            >
              {option}
              {option === "Disputed" && !isActive && disputedTripCount > 0 && (
                <span style={{ display: "inline-flex", marginLeft: 6, width: 8, height: 8, borderRadius: "50%", background: "#ef4444" }} />
              )}
              {option === "Disputed" && isActive && disputedTripCount > 0 && (
                <span style={{ display: "inline-flex", marginLeft: 6, background: "#fef2f2", color: "#ef4444", borderRadius: 10, padding: "0 6px", fontSize: 11, fontWeight: 700, lineHeight: "18px", minWidth: 18, justifyContent: "center" }}>
                  {disputedTripCount}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "64px 0" }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid #e2e8f0", borderTopColor: "#0070f3", animation: "spin 1s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : filteredTrips.length === 0 ? (
        <div style={{ textAlign: "center", padding: "64px 24px", background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)" }}>
          <div style={{ width: 64, height: 64, background: "#f1f5f9", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2"/></svg>
          </div>
          <h3 style={{ margin: "0 0 8px", color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 600 }}>No trips found</h3>
          <p style={{ color: "#64748b", fontSize: FONT_SIZE.base, margin: 0 }}>
            {filterStatus === "All" ? "No trips in the system." : `No trips with status "${filterStatus}".`}
          </p>
        </div>
      ) : (
        <>
          {/* Card View */}
          {viewMode === "card" && (
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
              {filteredTrips.map((trip) => {
                const confirmed = trip.stops.filter(s => s.confirmed).length
                const pending = trip.stops.filter(s => !s.confirmed && !s.disputed).length
                const disputed = trip.stops.filter(s => s.disputed).length

                return (
                  <div key={trip.trip_id} style={{ background: "white", borderRadius: 12, padding: 20, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)", transition: "all 0.2s ease" }} onMouseEnter={e => !isMobile && (e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.08)", e.currentTarget.style.borderColor = "#cbd5e1")} onMouseLeave={e => !isMobile && (e.currentTarget.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.05)", e.currentTarget.style.borderColor = "#e2e8f0")}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                      <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <h3 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.lg, fontWeight: 700 }}>{trip.plate_number}</h3>
                            {trip.isDD && (
                              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 12, background: "#f3e5f5", color: "#7c3aed", fontWeight: 700, border: "1px solid #d8b4fe" }}>DD</span>
                            )}
                          </div>
                        <p style={{ margin: 0, color: "#0070f3", fontSize: FONT_SIZE.sm, cursor: "pointer", textDecoration: "underline", fontWeight: 500 }} onClick={() => setSelectedDriver({ driver_name: trip.driver_name, driver_phone: trip.driver_phone, driver_status: trip.driver_status })}>
                          {trip.driver_name}
                        </p>
                      </div>
                      <span style={{ padding: "6px 12px", borderRadius: 16, fontSize: FONT_SIZE.xs, fontWeight: 600, background: trip.trip_status === "In transit" ? "#eff6ff" : trip.trip_status === "On hold" ? "#fffbeb" : trip.trip_status === "Completed" ? "#f0fdf4" : "#f1f5f9", color: trip.trip_status === "In transit" ? "#0070f3" : trip.trip_status === "On hold" ? "#f5a623" : trip.trip_status === "Completed" ? "#16a34a" : "#475569", border: `1.5px solid ${trip.trip_status === "In transit" ? "#0070f3" : trip.trip_status === "On hold" ? "#f5a623" : trip.trip_status === "Completed" ? "#16a34a" : "#cbd5e1"}`, whiteSpace: "nowrap" }}>
                        {trip.trip_status}
                      </span>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #f1f5f9" }}>
                      <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#475569" }}><span style={{ color: "#94a3b8", width: 70, display: "inline-block" }}>Product:</span> <span style={{ fontWeight: 500 }}>{trip.product}</span></p>
                      <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#475569" }}><span style={{ color: "#94a3b8", width: 70, display: "inline-block" }}>Centre:</span> {trip.material_centre}</p>
                      {trip.order_no ? (
                        <>
                          <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#475569" }}><span style={{ color: "#94a3b8", width: 70, display: "inline-block" }}>Order No:</span> {trip.order_no}</p>
                          {trip.child_order_no && <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#475569" }}><span style={{ color: "#94a3b8", width: 70, display: "inline-block" }}>Child:</span> {trip.child_order_no}</p>}
                        </>
                      ) : (
                        <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#475569" }}><span style={{ color: "#94a3b8", width: 70, display: "inline-block" }}>ATC:</span> {trip.atc || "N/A"}</p>
                      )}
                      {trip.amount_charged && <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#475569" }}><span style={{ color: "#94a3b8", width: 70, display: "inline-block" }}>Charged:</span> ₦{trip.amount_charged.toLocaleString()}</p>}
                      {trip.payment_mode && <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#475569" }}><span style={{ color: "#94a3b8", width: 70, display: "inline-block" }}>Payment:</span> {trip.payment_mode}</p>}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                      <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px" }}>
                        <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#64748b" }}>Loaded</p>
                        <p style={{ margin: "2px 0 0", fontWeight: 600, color: "#0f172a", fontSize: FONT_SIZE.md }}>{trip.loaded_quantity} bags</p>
                      </div>
                      <div style={{ background: trip.remaining === 0 ? "#fef2f2" : trip.remaining < trip.loaded_quantity * 0.2 ? "#fffbeb" : "#f0fdf4", borderRadius: 8, padding: "10px 12px", border: `1px solid ${trip.remaining === 0 ? "#fecaca" : trip.remaining < trip.loaded_quantity * 0.2 ? "#fde68a" : "#bbf7d0"}` }}>
                        <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: trip.remaining === 0 ? "#ef4444" : trip.remaining < trip.loaded_quantity * 0.2 ? "#f5a623" : "#16a34a" }}>Remaining</p>
                        <p style={{ margin: "2px 0 0", fontWeight: 700, color: trip.remaining === 0 ? "#b91c1c" : trip.remaining < trip.loaded_quantity * 0.2 ? "#b45309" : "#15803d", fontSize: FONT_SIZE.md }}>{trip.remaining} bags</p>
                      </div>
                    </div>

                    {trip.load_more_entries.length > 0 && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12, padding: 10, background: "#fffbeb", borderRadius: 8, border: "1px solid #fde68a" }}>
                        {trip.load_more_entries.map((entry, i) => (
                          <div key={entry.id} style={{ fontSize: FONT_SIZE.xs }}>
                            <p style={{ margin: 0, color: "#b45309", fontWeight: 600 }}>{entry.loading_point_name}</p>
                            <p style={{ margin: "2px 0 0", color: "#92400e" }}>{entry.product} <span style={{ fontWeight: 700 }}>+{entry.quantity}</span></p>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <span style={{ fontSize: FONT_SIZE.sm, color: "#64748b", fontWeight: 500 }}>{trip.stop_count} stops</span>
                        {confirmed > 0 && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#16a34a" }} title={`${confirmed} confirmed`} />}
                        {pending > 0 && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f5a623" }} title={`${pending} pending`} />}
                        {disputed > 0 && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444" }} title={`${disputed} disputed`} />}
                      </div>
                      
                      <button
                        onClick={() => { setSelectedStops(trip.stops); setSelectedDiscrepancies(trip.discrepancies); setSelectedLoadMore(trip.load_more_entries); setSelectedPlate(trip.plate_number); setSelectedTrip({ trip_id: trip.trip_id, plate_number: trip.plate_number, atc: trip.atc, order_no: trip.order_no, child_order_no: trip.child_order_no, amount_charged: trip.amount_charged, payment_mode: trip.payment_mode, trip_status: trip.trip_status }); setEndTripError(null) }}
                        style={{ padding: "8px 16px", background: "#f0f7ff", color: "#0070f3", border: "1px solid #bfdbfe", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.sm, transition: "all 0.2s" }}
                        onMouseEnter={e => { e.currentTarget.style.background = "#e0efff" }}
                        onMouseLeave={e => { e.currentTarget.style.background = "#f0f7ff" }}
                      >
                        Details
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Table View */}
          {viewMode === "table" && (
            <div style={{ background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", minWidth: 800 }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Plate</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Driver</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Product</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Centre</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>ATC / Order</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Charged</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Payment</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Loaded</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Remaining</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Stops</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Status</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Started</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTrips.map((trip) => {
                    const confirmed = trip.stops.filter(s => s.confirmed).length
                    const pending = trip.stops.filter(s => !s.confirmed && !s.disputed).length
                    const disputed = trip.stops.filter(s => s.disputed).length

                    return (
                      <tr key={trip.trip_id} style={{ borderBottom: "1px solid #e2e8f0", transition: "background 0.2s ease" }} onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 600 }}>
                          {trip.plate_number}
                          {trip.isDD && <span style={{ marginLeft: 8, fontSize: 10, padding: "2px 8px", borderRadius: 12, background: "#f3e5f5", color: "#7c3aed", fontWeight: 700, border: "1px solid #d8b4fe" }}>DD</span>}
                        </td>
                        <td style={{ padding: "12px 16px", color: "#0070f3", fontSize: FONT_SIZE.base, cursor: "pointer", textDecoration: "underline" }} onClick={() => setSelectedDriver({ driver_name: trip.driver_name, driver_phone: trip.driver_phone, driver_status: trip.driver_status })}>
                          {trip.driver_name}
                        </td>
                        <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: FONT_SIZE.base }}>{trip.product}</td>
                        <td style={{ padding: "12px 16px", color: "#64748b", fontSize: FONT_SIZE.sm }}>{trip.material_centre}</td>
                        <td style={{ padding: "12px 16px", color: "#64748b", fontSize: FONT_SIZE.sm }}>{trip.order_no ? `${trip.order_no}${trip.child_order_no ? ` / ${trip.child_order_no}` : ""}` : trip.atc || "N/A"}</td>
                        <td style={{ padding: "12px 16px", color: "#059669", fontSize: FONT_SIZE.base, fontWeight: 500 }}>{trip.amount_charged ? `₦${trip.amount_charged.toLocaleString()}` : "—"}</td>
                        <td style={{ padding: "12px 16px", color: "#64748b", fontSize: FONT_SIZE.sm }}>{trip.payment_mode || "—"}</td>
                        <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 500 }}>{trip.loaded_quantity}</td>
                        <td style={{ padding: "12px 16px", color: trip.remaining === 0 ? "#ef4444" : trip.remaining < trip.loaded_quantity * 0.2 ? "#f5a623" : "#16a34a", fontSize: FONT_SIZE.base, fontWeight: 600 }}>{trip.remaining}</td>
                        <td style={{ padding: "12px 16px", cursor: "pointer" }} onClick={() => { setSelectedStops(trip.stops); setSelectedDiscrepancies(trip.discrepancies); setSelectedLoadMore(trip.load_more_entries); setSelectedPlate(trip.plate_number); setSelectedTrip({ trip_id: trip.trip_id, plate_number: trip.plate_number, atc: trip.atc, order_no: trip.order_no, child_order_no: trip.child_order_no, amount_charged: trip.amount_charged, payment_mode: trip.payment_mode, trip_status: trip.trip_status }); setEndTripError(null) }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <span style={{ color: "#0070f3", fontSize: FONT_SIZE.sm, fontWeight: 500, textDecoration: "underline" }}>{trip.stop_count} {trip.stop_count === 1 ? "stop" : "stops"}</span>
                            {confirmed > 0 && <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "2px 6px", background: "#f0fdf4", borderRadius: 12 }}><Icon icon="mdi:check-circle" width="12" height="12" style={{ color: "#16a34a" }} /><span style={{ fontSize: 10, color: "#16a34a", fontWeight: "bold" }}>{confirmed}</span></div>}
                            {pending > 0 && <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "2px 6px", background: "#fffbeb", borderRadius: 12 }}><Icon icon="mdi:clock-outline" width="12" height="12" style={{ color: "#f5a623" }} /><span style={{ fontSize: 10, color: "#f5a623", fontWeight: "bold" }}>{pending}</span></div>}
                            {disputed > 0 && <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "2px 6px", background: "#fef2f2", borderRadius: 12 }}><Icon icon="mdi:alert-circle" width="12" height="12" style={{ color: "#ef4444" }} /><span style={{ fontSize: 10, color: "#ef4444", fontWeight: "bold" }}>{disputed}</span></div>}
                            {trip.load_more_entries.length > 0 && <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "2px 6px", background: "#fffbeb", borderRadius: 12 }}><Icon icon="mdi:package-variant-closed" width="12" height="12" style={{ color: "#f59e0b" }} /><span style={{ fontSize: 10, color: "#f59e0b", fontWeight: "bold" }}>+{trip.load_more_entries.reduce((s, e) => s + e.quantity, 0)}</span></div>}
                          </div>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{ padding: "6px 10px", borderRadius: 14, fontSize: FONT_SIZE.xs, fontWeight: 600, background: trip.trip_status === "In transit" ? "#eff6ff" : trip.trip_status === "On hold" ? "#fffbeb" : trip.trip_status === "Completed" ? "#f0fdf4" : "#f1f5f9", color: trip.trip_status === "In transit" ? "#0070f3" : trip.trip_status === "On hold" ? "#f5a623" : trip.trip_status === "Completed" ? "#16a34a" : "#475569", border: `1.5px solid ${trip.trip_status === "In transit" ? "#0070f3" : trip.trip_status === "On hold" ? "#f5a623" : trip.trip_status === "Completed" ? "#16a34a" : "#cbd5e1"}` }}>
                            {trip.trip_status}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>{new Date(trip.created_at).toLocaleString()}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {(selectedDriver || selectedStops) && (
        <div onClick={closeModals} style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 100, padding: isMobile ? 0 : 24, animation: "fadeIn 0.2s ease-out" }}>
          <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: isMobile ? "20px 20px 0 0" : 12, padding: isMobile ? "28px 20px" : 32, width: "100%", maxWidth: 500, maxHeight: isMobile ? "90vh" : "80vh", overflowY: "auto", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)", animation: "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)" }}>

            {selectedDriver && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                  <h3 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>Driver Info</h3>
                  <button onClick={closeModals} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 0, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", transition: "color 0.2s" }} onMouseEnter={e => e.currentTarget.style.color = "#64748b"} onMouseLeave={e => e.currentTarget.style.color = "#94a3b8"}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
                  <div>
                    <p style={{ margin: "0 0 4px 0", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>Full Name</p>
                    <p style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 500 }}>{selectedDriver.driver_name}</p>
                  </div>
                  <div>
                    <p style={{ margin: "0 0 4px 0", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>Phone</p>
                    <p style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 500 }}>{selectedDriver.driver_phone}</p>
                  </div>
                  <div>
                    <p style={{ margin: "0 0 4px 0", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>Status</p>
                    <p style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 500 }}>{selectedDriver.driver_status}</p>
                  </div>
                </div>

                <button onClick={closeModals} style={{ width: "100%", padding: "12px 16px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, minHeight: 44 }}>
                  Close
                </button>
              </>
            )}

            {selectedStops && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <div>
                    <h3 style={{ margin: "0 0 4px 0", color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>Stops</h3>
                    <p style={{ margin: 0, color: "#94a3b8", fontSize: FONT_SIZE.sm }}>{selectedPlate}</p>
                  </div>
                  <button onClick={closeModals} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 0, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", transition: "color 0.2s" }} onMouseEnter={e => e.currentTarget.style.color = "#64748b"} onMouseLeave={e => e.currentTarget.style.color = "#94a3b8"}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                </div>

                {selectedTrip?.order_no ? (
                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 14px", marginBottom: 8 }}>
                    <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#0f172a" }}><strong>Order No:</strong> {selectedTrip.order_no}</p>
                    {selectedTrip.child_order_no && <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.sm, color: "#0f172a" }}><strong>Child Order No:</strong> {selectedTrip.child_order_no}</p>}
                  </div>
                ) : selectedTrip?.atc ? (
                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 14px", marginBottom: 8 }}>
                    <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#0f172a" }}><strong>ATC:</strong> {selectedTrip.atc}</p>
                  </div>
                ) : null}

                {selectedTrip?.amount_charged && (
                  <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "12px 14px", marginBottom: 16, display: "flex", gap: 24 }}>
                    <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#0f172a" }}><strong>Amount Charged:</strong> ₦{selectedTrip.amount_charged.toLocaleString()}</p>
                    <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#0f172a" }}><strong>Payment Mode:</strong> {selectedTrip.payment_mode}</p>
                  </div>
                )}

                {selectedStops.length === 0 && selectedDiscrepancies.length === 0 ? (
                  <p style={{ color: "#94a3b8", fontSize: FONT_SIZE.base }}>No stops logged yet.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
                    {selectedStops.map((stop, index) => (
                      <div key={stop.stop_id} style={{ padding: 14, border: `1px solid ${stop.disputed ? "#fca5a5" : stop.confirmed ? "#86efac" : "#e2e8f0"}`, borderRadius: 8, background: stop.disputed ? "#fef2f2" : stop.confirmed ? "#f0fdf4" : "#f8fafc" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                          <div>
                            <p style={{ margin: "0 0 4px 0", color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 600 }}>Stop {index + 1}</p>
                            <span style={{ fontSize: FONT_SIZE.xs, padding: "3px 8px", borderRadius: 4, background: stop.stop_type === "customer" ? "#eff6ff" : "#f3e5f5", color: stop.stop_type === "customer" ? "#0070f3" : "#7c3aed" }}>
                              {stop.stop_type === "customer" ? "Customer" : "Store"}
                            </span>
                          </div>
                          {stop.disputed && <span style={{ fontSize: FONT_SIZE.xs, padding: "4px 10px", background: "#fef2f2", borderRadius: 16, color: "#ef4444", fontWeight: 600 }}>Disputed</span>}
                          {!stop.disputed && stop.confirmed && <span style={{ fontSize: FONT_SIZE.xs, padding: "4px 10px", background: "#f0fdf4", borderRadius: 16, color: "#16a34a", fontWeight: 600 }}>Confirmed</span>}
                          {!stop.disputed && !stop.confirmed && <span style={{ fontSize: FONT_SIZE.xs, padding: "4px 10px", background: "#fffbeb", borderRadius: 16, color: "#f5a623", fontWeight: 600 }}>Pending</span>}
                        </div>

                        {stop.stop_type === "customer" && (
                          <>
                            <p style={{ margin: "6px 0", color: "#475569", fontSize: FONT_SIZE.sm }}><strong>Broker:</strong> <span style={{ color: "#0f172a" }}>{stop.broker_name}</span></p>
                            <p style={{ margin: "6px 0", color: "#475569", fontSize: FONT_SIZE.sm }}><strong>Customer:</strong> <span style={{ color: "#0f172a" }}>{stop.customer_name}</span></p>
                          </>
                        )}

                        {stop.stop_type === "store" && (
                          <p style={{ margin: "6px 0", color: "#475569", fontSize: FONT_SIZE.sm }}><strong>Store:</strong> <span style={{ color: "#0f172a" }}>{stop.stop_location}</span></p>
                        )}

                        <p style={{ margin: "6px 0", color: "#475569", fontSize: FONT_SIZE.sm }}><strong>Offloaded:</strong> <span style={{ color: "#0f172a" }}>{stop.quantity_offloaded} bags</span></p>
                        {stop.confirmed && stop.price_per_bag && <p style={{ margin: "6px 0", color: "#475569", fontSize: FONT_SIZE.sm }}><strong>Price:</strong> <span style={{ color: "#0f172a" }}>₦{stop.price_per_bag.toLocaleString()}/bag</span></p>}

                        {stop.disputed && stop.dispute_reason && (
                          <div style={{ marginTop: 10, padding: 12, background: "#fff5f5", borderRadius: 6, border: "1px solid #fecaca" }}>
                            <p style={{ margin: "0 0 6px 0", fontSize: FONT_SIZE.xs, color: "#ef4444", fontWeight: 600 }}>Dispute Reason:</p>
                            <p style={{ margin: "0 0 10px 0", fontSize: FONT_SIZE.sm, color: "#7f1d1d" }}>{stop.dispute_reason}</p>
                            <ReassignBroker stopId={stop.stop_id} onReassigned={loadAll} />
                          </div>
                        )}

                        <p style={{ margin: "10px 0 0 0", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>{new Date(stop.stop_time).toLocaleString()}</p>
                      </div>
                    ))}

                    {selectedDiscrepancies.map((d, index) => (
                      <div key={d.discrepancy_id} style={{ padding: 14, border: "1px solid #fcd34d", borderRadius: 8, background: "#fffbeb" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <p style={{ margin: 0, fontSize: FONT_SIZE.base, fontWeight: 600, color: "#0f172a" }}>Discrepancy {index + 1}</p>
                          <span style={{ fontSize: FONT_SIZE.xs, padding: "4px 10px", background: "#fffbeb", borderRadius: 16, color: "#b45309", fontWeight: 600, border: "1px solid #f5a623" }}>Reported</span>
                        </div>
                        {d.shortage > 0 && <p style={{ margin: "6px 0", color: "#ef4444", fontWeight: 600, fontSize: FONT_SIZE.base }}>Shortage: {d.shortage} bags</p>}
                        {d.caked_bags > 0 && <p style={{ margin: "6px 0", color: "#475569", fontSize: FONT_SIZE.sm }}><strong>Caked:</strong> <span style={{ color: "#0f172a" }}>{d.caked_bags} bags</span></p>}
                        {d.notes && <p style={{ margin: "6px 0", fontSize: FONT_SIZE.sm, color: "#475569" }}><strong>Notes:</strong> <span style={{ color: "#0f172a" }}>{d.notes}</span></p>}
                        <p style={{ margin: "10px 0 0 0", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>{new Date(d.reported_at).toLocaleString()}</p>
                      </div>
                    ))}

                    {selectedLoadMore.length > 0 && (
                      <>
                        <p style={{ fontWeight: 700, margin: "16px 0 12px 0", fontSize: FONT_SIZE.base, color: "#0f172a" }}>Additional Loads ({selectedLoadMore.length})</p>
                        {selectedLoadMore.map((entry) => (
                          <div key={entry.id} style={{ padding: 14, border: "1px solid #fde68a", borderRadius: 8, background: "#fffbeb" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                              <div>
                                <p style={{ margin: "0 0 4px 0", fontWeight: 600, fontSize: FONT_SIZE.sm, color: "#0f172a" }}>{entry.loading_point_name}</p>
                                <span style={{ fontSize: FONT_SIZE.xs, padding: "3px 8px", borderRadius: 4, background: "#fef3c7", color: "#b45309" }}>{entry.loading_point_type}</span>
                              </div>
                              <p style={{ margin: 0, fontWeight: 700, fontSize: FONT_SIZE.base, color: "#f59e0b" }}>+{entry.quantity}</p>
                            </div>
                            <p style={{ margin: "8px 0 0 0", color: "#475569", fontSize: FONT_SIZE.sm }}><strong>Product:</strong> <span style={{ color: "#0f172a" }}>{entry.product}</span></p>
                            <p style={{ margin: "6px 0 0 0", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>{new Date(entry.created_at).toLocaleString()}</p>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}

                {endTripError && (
                  <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
                    <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#ef4444" }}>{endTripError}</p>
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: selectedTrip && (selectedTrip.trip_status === "In transit" || selectedTrip.trip_status === "On hold") ? "1fr 1fr" : "1fr", gap: 10 }}>
                  {selectedTrip && (selectedTrip.trip_status === "In transit" || selectedTrip.trip_status === "On hold") && (
                    <button onClick={handleEndTripClick} disabled={!canEdit} style={{ padding: "12px 16px", background: !canEdit ? "#94a3b8" : "#fef2f2", color: !canEdit ? "white" : "#ef4444", border: "1px solid", borderColor: !canEdit ? "#94a3b8" : "#fecaca", borderRadius: 8, cursor: !canEdit ? "not-allowed" : "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, minHeight: 44, transition: "background 0.2s" }} onMouseEnter={e => { if (canEdit) e.currentTarget.style.background = "#fee2e2" }} onMouseLeave={e => { if (canEdit) e.currentTarget.style.background = "#fef2f2" }}>
                      End Trip
                    </button>
                  )}
                  <button onClick={closeModals} style={{ padding: "12px 16px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, minHeight: 44, transition: "opacity 0.2s" }} onMouseEnter={e => e.currentTarget.style.opacity = "0.9"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {endingTrip && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 24, animation: "fadeIn 0.2s ease-out" }}>
          <div style={{ background: "white", borderRadius: 12, padding: 32, width: "100%", maxWidth: 420, boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)", animation: "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)" }}>
            <h3 style={{ margin: "0 0 12px 0", color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>End Trip?</h3>
            <p style={{ margin: "0 0 24px 0", color: "#64748b", fontSize: FONT_SIZE.base, lineHeight: 1.5 }}>
              This will mark the trip as <strong>Completed</strong> and set the truck status to <strong>Empty</strong>. This cannot be undone.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => setEndingTrip(null)} disabled={endTripLoading} style={{ padding: "12px 16px", background: "white", color: "#475569", border: "1px solid #cbd5e1", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, minHeight: 44, transition: "background 0.2s" }} onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"} onMouseLeave={e => e.currentTarget.style.background = "white"}>
                Cancel
              </button>
              <button onClick={confirmEndTrip} disabled={endTripLoading || !canEdit} style={{ padding: "12px 16px", background: endTripLoading || !canEdit ? "#94a3b8" : "#ef4444", color: "white", border: "none", borderRadius: 8, cursor: endTripLoading || !canEdit ? "not-allowed" : "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, opacity: endTripLoading || !canEdit ? 0.7 : 1, minHeight: 44, transition: "background 0.2s" }} onMouseEnter={e => !endTripLoading && canEdit && (e.currentTarget.style.background = "#dc2626")} onMouseLeave={e => !endTripLoading && canEdit && (e.currentTarget.style.background = "#ef4444")}>
                {endTripLoading ? "Ending..." : "Yes, End Trip"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}