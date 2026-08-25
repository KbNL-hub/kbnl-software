"use client"

import { FONT_SIZE } from "@/lib/constants"
import { usePolling } from "@/lib/hooks/usePolling"

import { useState, useEffect, useRef } from "react"
import { supabase } from "@/lib/supabase"
import { apiMutate } from "@/lib/api-mutation"
import { Icon } from "@iconify/react"
import ModernInput from "@/components/ModernInput"
import StopForm from "@/components/StopForm"
import { usePermissions } from "@/lib/PermissionContext"
import { usePagination } from "@/lib/hooks/usePagination"
import PaginationControls from "@/components/PaginationControls"

type ActiveTruck = {
  trip_id: string
  plate_number: string
  kbnl_truck_no: string | null
  loaded_quantity: number
  remaining: number
  driver_name: string
  driver_phone: string
  trip_status: string
  route_points: string[]
}

type DDTrip = {
  dd_trip_id: string
  plate_number: string
  driver_name: string
  driver_phone: string | null
  product: string
  loading_point: string
  loaded_quantity: number
  remaining: number
  atc: string | null
  order_no: string | null
  child_order_no: string | null
  trip_status: string
  route_points: string[]
  created_at: string
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

type Mode = "mdd" | "dd"

const DD_LOADING_POINTS = ["BUA", "Dangote", "HBM"]

const PRODUCT_BY_LOADING_POINT: Record<string, string[]> = {
  HBM: ["Supaset", "Supafix", "Classic"],
  Dangote: ["3X", "Falcon"],
  BUA:     ["BUA cement"],
}



const getPillStyle = (filter: string, isActive: boolean) => {
  if (!isActive) {
    return { bg: "white", textColor: "#64748b", borderColor: "#e2e8f0" }
  }
  
  if (filter === "All") {
    return { bg: "#111", textColor: "white", borderColor: "#111" }
  } else if (filter === "In transit") {
    return { bg: "#ebf8ff", textColor: "#0070f3", borderColor: "#0070f3" }
  } else if (filter === "On hold") {
    return { bg: "#fffbeb", textColor: "#f5a623", borderColor: "#f5a623" }
  } else if (filter === "Completed") {
    return { bg: "#f0fdf4", textColor: "#10b981", borderColor: "#10b981" }
  }
  
  return { bg: "white", textColor: "#64748b", borderColor: "#e2e8f0" }
}

export const revalidate = 0
export default function MonitorTrucks({ viewOnly = false }: { viewOnly?: boolean }) {
  const { isMobile } = useBreakpoint()
  const { getAccess } = usePermissions()
  const canEdit = getAccess("monitor-trucks").canEdit
  const [trucks, setTrucks] = useState<ActiveTruck[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [filterStatus, setFilterStatus] = useState("All")
  const [viewMode, setViewMode] = useState<ViewMode>(isMobile ? "card" : "table")
  const [mode, setMode] = useState<Mode>("mdd")

  const [ddPlate, setDdPlate] = useState("")
  const [ddDriver, setDdDriver] = useState("")
  const [ddPhone, setDdPhone] = useState("")
  const [ddLoadName, setDdLoadName] = useState("")
  const [ddProduct, setDdProduct] = useState("")
  const [ddQty, setDdQty] = useState("")
  const [ddAtc, setDdAtc] = useState("")
  const [ddOrderNo, setDdOrderNo] = useState("")
  const [ddChildOrderNo, setDdChildOrderNo] = useState("")
  const [ddSubmitting, setDdSubmitting] = useState(false)
  const [ddMessage, setDdMessage] = useState("")
  const [ddMessageType, setDdMessageType] = useState<"success" | "error">("success")
  const ddQtyRef = useRef<HTMLInputElement>(null)
  const [ddTrips, setDdTrips] = useState<DDTrip[]>([])
  const [ddLoading, setDdLoading] = useState(true)
  const [ddLastUpdated, setDdLastUpdated] = useState<Date | null>(null)
  const [ddFilterStatus, setDdFilterStatus] = useState("All")
  const [ddViewMode, setDdViewMode] = useState<ViewMode>(isMobile ? "card" : "table")
  const [showDdForm, setShowDdForm] = useState(false)
  const [editingDdTrip, setEditingDdTrip] = useState<DDTrip | null>(null)
  const [ddRoutePoints, setDdRoutePoints] = useState<string[]>([])
  const [ddNewPoint, setDdNewPoint] = useState("")
  const [ddRouteSaving, setDdRouteSaving] = useState(false)

  const [editingRoute, setEditingRoute] = useState<ActiveTruck | null>(null)
  const [routePoints, setRoutePoints] = useState<string[]>([])
  const [newPoint, setNewPoint] = useState("")
  const [routeSaving, setRouteSaving] = useState(false)

  // Stop form for DD trips
  const [showDdStopForm, setShowDdStopForm] = useState(false)
  const [selectedDdStopTrip, setSelectedDdStopTrip] = useState<DDTrip | null>(null)
  const [ddStopOffloaded, setDdStopOffloaded] = useState(0)
  const [ddEndConfirmTrip, setDdEndConfirmTrip] = useState<DDTrip | null>(null)

  // Discrepancy reporting
  const [showDiscModal, setShowDiscModal] = useState(false)
  const [discTripId, setDiscTripId] = useState<string | null>(null)
  const [discTripLabel, setDiscTripLabel] = useState("")
  const [discTripRemaining, setDiscTripRemaining] = useState(0)
  const [discType, setDiscType] = useState<'shortage' | 'caked'>('shortage')
  const [discShortage, setDiscShortage] = useState("")
  const [discCaked, setDiscCaked] = useState("")
  const [discNotes, setDiscNotes] = useState("")
  const [discError, setDiscError] = useState("")
  const [discSubmitting, setDiscSubmitting] = useState(false)
  const [discSuccess, setDiscSuccess] = useState("")
  const discCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function fetchActiveTrucks() {
    const { data: trips, error } = await supabase.rpc("get_active_mdd_trucks_remaining")
    if (error) {
      console.error("MDD fetch error:", error)
      setLoading(false)
      return
    }

    if (!trips || trips.length === 0) {
      setTrucks([])
      setLastUpdated(new Date())
      setLoading(false)
      return
    }

    const enriched = trips.map((trip: { trip_id: string; plate_number: string; kbnl_truck_no: string | null; loaded_quantity: number; remaining: number; driver_name: string | null; driver_phone: string | null; trip_status: string; route_points: unknown[] }) => ({
      trip_id: trip.trip_id,
      plate_number: trip.plate_number,
      kbnl_truck_no: trip.kbnl_truck_no ?? null,
      loaded_quantity: trip.loaded_quantity,
      remaining: trip.remaining,
      driver_name: trip.driver_name ?? "Unknown",
      driver_phone: trip.driver_phone ?? "—",
      trip_status: trip.trip_status,
      route_points: trip.route_points ?? [],
    }))

    setTrucks(enriched)
    setLastUpdated(new Date())
    setLoading(false)
  }

  const lastSaveTimeRef = useRef(0)
  const [, setLastSaveTime] = useState(0)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchActiveTrucks()
  }, [])

  usePolling(fetchActiveTrucks, 120000)

  const ddLastSaveTimeRef = useRef(0)
  useEffect(() => {
    fetchDdTrips()
    const subscription = supabase
      .channel("dd-trips-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "dd_trips" }, () => {
        if (Date.now() - ddLastSaveTimeRef.current > 2000) {
          fetchDdTrips()
        }
      })
      .subscribe()
    return () => { subscription.unsubscribe() }
  }, [])

  usePolling(fetchDdTrips, 120000)

  async function openRouteEditor(truck: ActiveTruck) {
    setEditingRoute(truck)
    const { data } = await supabase
      .from("Trips")
      .select("route_points")
      .eq("trip_id", truck.trip_id)
      .single()
    setRoutePoints(data?.route_points ?? [])
    setNewPoint("")
  }

  function closeRouteEditor() {
    setEditingRoute(null)
    setNewPoint("")
    setRoutePoints([])
  }

  function addPoint() {
    const trimmed = newPoint.trim()
    if (!trimmed) return
    setRoutePoints([...routePoints, trimmed])
    setNewPoint("")
  }

  function removePoint(index: number) {
    setRoutePoints(routePoints.filter((_, i) => i !== index))
  }

  async function saveRoute() {
    if (!editingRoute) return
    setRouteSaving(true)
    try {
      const { data, error } = await apiMutate("trips", {
        action: "update",
        table: "Trips",
        data: { route_points: routePoints },
        filters: { trip_id: editingRoute.trip_id },
      })

      if (error) {
        console.error("❌ Route save failed:", error)
        alert(`Failed to save route:\n${error}`)
        return
      }

      lastSaveTimeRef.current = Date.now()
      setLastSaveTime(Date.now())
      if (data && Array.isArray(data) && data.length > 0) {
        setTrucks(prev =>
          prev.map(t =>
            t.trip_id === editingRoute.trip_id
              ? { ...t, route_points: data[0].route_points }
              : t
          )
        )
      }
      closeRouteEditor()
    } catch (error) {
      console.error("❌ Route save threw:", error)
      alert("Failed to save route due to a network error")
    } finally {
      setRouteSaving(false)
    }
  }

  async function fetchDdTrips() {
    setDdMessage("")
    const { data, error } = await supabase
      .from("dd_trips")
      .select("*")
      .in("trip_status", ["In transit", "On hold", "Completed"])
      .order("created_at", { ascending: false })
      .limit(100)

    if (error) { console.error("DD fetch error:", error); return [] }

    const trips = (data || []) as DDTrip[]
    let offloadedByTrip = new Map<string, number>()
    if (trips.length > 0) {
      const { data: stops } = await supabase
        .from("Stops")
        .select("trip_id, quantity_offloaded")
        .in("trip_id", trips.map(t => t.dd_trip_id))
      if (stops) {
        offloadedByTrip = stops.reduce((map, s) => {
          map.set(s.trip_id, (map.get(s.trip_id) || 0) + (s.quantity_offloaded || 0))
          return map
        }, new Map<string, number>())
      }
    }

    const enriched = trips.map(trip => ({
      ...trip,
      remaining: Math.max(0, (trip.loaded_quantity || 0) - (offloadedByTrip.get(trip.dd_trip_id) || 0)),
    }))

    setDdTrips(enriched)
    setDdLoading(false)
    setDdLastUpdated(new Date())
    return enriched
  }

  async function updateDdTripStatus(tripId: string, status: string) {
    const { error } = await apiMutate("trips", {
      action: "transaction",
      sub_actions: [
        {
          action: "update",
          table: "dd_trips",
          data: { trip_status: status },
          filters: { dd_trip_id: tripId },
        },
        {
          action: "update",
          table: "Trips",
          data: { trip_status: status },
          filters: { trip_id: tripId },
        },
      ],
    })

    if (error) { alert(`Failed to update status: ${error}`); return }

    ddLastSaveTimeRef.current = Date.now()
    setDdTrips(prev => prev.map(t => t.dd_trip_id === tripId ? { ...t, trip_status: status } : t))
  }

  async function openDdStopForm(trip: DDTrip) {
    setSelectedDdStopTrip(trip)
    setDdStopOffloaded(0)
    const { data: existing } = await supabase
      .from("Stops")
      .select("quantity_offloaded")
      .eq("trip_id", trip.dd_trip_id)
    if (existing) {
      setDdStopOffloaded(existing.reduce((sum, s) => sum + s.quantity_offloaded, 0))
    }
    setShowDdStopForm(true)
  }

  async function handleDdStopLogged() {
    const tripId = selectedDdStopTrip?.dd_trip_id
    setShowDdStopForm(false)
    setSelectedDdStopTrip(null)
    setDdStopOffloaded(0)
    const updated = await fetchDdTrips()
    const trip = updated.find(t => t.dd_trip_id === tripId)
    if (trip && trip.trip_status !== "Completed" && trip.remaining <= 0) {
      setDdEndConfirmTrip(trip)
    }
  }

  async function saveDdRoute() {
    if (!editingDdTrip) return
    setDdRouteSaving(true)
    try {
      const { data, error } = await apiMutate("trips", {
        action: "update",
        table: "dd_trips",
        data: { route_points: ddRoutePoints },
        filters: { dd_trip_id: editingDdTrip.dd_trip_id },
      })

      if (error) { alert(`Failed to save route: ${error}`); return }

      ddLastSaveTimeRef.current = Date.now()
      if (data && Array.isArray(data) && data.length > 0) {
        setDdTrips(prev =>
          prev.map(t => t.dd_trip_id === editingDdTrip.dd_trip_id ? { ...t, route_points: data[0].route_points } : t)
        )
      }
      setEditingDdTrip(null)
      setDdRoutePoints([])
    } catch (error) {
      console.error("❌ DD route save threw:", error)
      alert("Failed to save route due to a network error")
    } finally {
      setDdRouteSaving(false)
    }
  }

  function openDdRouteEditor(trip: DDTrip) {
    setEditingDdTrip(trip)
    setDdRoutePoints([...(trip.route_points || [])])
    setDdNewPoint("")
  }

  function closeDdRouteEditor() {
    setEditingDdTrip(null)
    setDdRoutePoints([])
    setDdNewPoint("")
  }

  function ddHandleLoadNameChange(name: string) {
    setDdLoadName(name)
    setDdProduct("")
    setDdAtc("")
    setDdOrderNo("")
    setDdChildOrderNo("")
    setDdMessage("")
  }

  function openDiscModal(tripId: string, label: string, remaining: number) {
    if (discCloseTimerRef.current) { clearTimeout(discCloseTimerRef.current); discCloseTimerRef.current = null }
    setDiscTripId(tripId)
    setDiscTripLabel(label)
    setDiscTripRemaining(remaining)
    setDiscType("shortage")
    setDiscShortage("")
    setDiscCaked("")
    setDiscNotes("")
    setDiscError("")
    setDiscSuccess("")
    setDiscSubmitting(false)
    setShowDiscModal(true)
  }

  function closeDiscModal() {
    if (discSubmitting) return
    if (discCloseTimerRef.current) { clearTimeout(discCloseTimerRef.current); discCloseTimerRef.current = null }
    setShowDiscModal(false)
    setDiscTripId(null)
    setDiscType("shortage")
    setDiscShortage("")
    setDiscCaked("")
    setDiscNotes("")
    setDiscError("")
    setDiscSuccess("")
    setDiscSubmitting(false)
  }

  async function handleReportDiscrepancy() {
    const shortage = parseInt(discShortage) || 0
    const caked = parseInt(discCaked) || 0

    if (discType === 'shortage') {
      if (shortage === 0) return setDiscError("Enter shortage bags count")
      if (shortage < 0) return setDiscError("Values cannot be negative")
      if (shortage > discTripRemaining) return setDiscError(`Shortage cannot exceed remaining bags (${discTripRemaining})`)
    } else {
      if (caked === 0) return setDiscError("Enter caked bags count")
      if (caked < 0) return setDiscError("Values cannot be negative")
    }

    setDiscSubmitting(true)
    setDiscError("")

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setDiscError("Not authenticated")
      setDiscSubmitting(false)
      return
    }

    const result = await apiMutate("trips", {
      action: "insert",
      table: "trip_discrepancies",
      data: {
        trip_id: discTripId,
        driver_id: user.id,
        shortage: discType === 'shortage' ? shortage : 0,
        caked_bags: discType === 'caked' ? caked : 0,
        discrepancy_type: discType,
        notes: discNotes.trim() || null,
      },
    })

    if (result.error) {
      setDiscSubmitting(false)
      setDiscError(result.error || "Failed to submit report")
      return
    }

    setDiscSuccess("Discrepancy reported successfully!")
    discCloseTimerRef.current = setTimeout(() => {
      discCloseTimerRef.current = null
      setShowDiscModal(false)
    }, 1500)
  }

  async function ddHandleSubmit() {
    const isHbm = ddLoadName === "HBM"
    if (!ddPlate.trim()) return ddSetMsg("Truck number is required", "error")
    if (!ddDriver.trim()) return ddSetMsg("Driver name is required", "error")
    if (!ddLoadName) return ddSetMsg("Select a loading point", "error")
    if (isHbm) {
      if (!ddOrderNo.trim()) return ddSetMsg("Order number is required", "error")
      if (!ddChildOrderNo.trim()) return ddSetMsg("Child order number is required", "error")
    } else {
      if (!ddAtc.trim()) return ddSetMsg("ATC number is required", "error")
    }
    if (!ddProduct) return ddSetMsg("Select a product", "error")
    const qty = parseInt(ddQty, 10)
    if (!ddQty || isNaN(qty) || qty <= 0) return ddSetMsg("Enter a valid number of bags", "error")

    setDdSubmitting(true)
    setDdMessage("")

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { ddSetMsg("Not authenticated", "error"); setDdSubmitting(false); return }

    const { data: ddData, error: ddErr } = await apiMutate("trips", {
      action: "insert",
      table: "dd_trips",
      data: {
        plate_number: ddPlate.trim().toUpperCase(),
        driver_name: ddDriver.trim(),
        driver_phone: ddPhone.trim() || null,
        product: ddProduct,
        loading_point: ddLoadName,
        loaded_quantity: qty,
        atc: ddLoadName === "HBM" ? null : ddAtc.trim(),
        order_no: ddLoadName === "HBM" ? ddOrderNo.trim() : null,
        child_order_no: ddLoadName === "HBM" ? ddChildOrderNo.trim() : null,
        created_by: user.id,
      },
    })

    setDdSubmitting(false)
    if (ddErr) return ddSetMsg(ddErr, "error")
    if (!ddData || !Array.isArray(ddData) || ddData.length === 0) return ddSetMsg("Failed to create trip", "error")

    // Insert mirror Trips row so Stops FK (Stop_trip_id_fkey → Trips.trip_id) is satisfied
    const tripId = ddData[0].dd_trip_id
    const plate = ddPlate.trim().toUpperCase()
    const { error: tripErr } = await apiMutate("trips", {
      action: "insert",
      table: "Trips",
      data: {
        trip_id: tripId,
        plate_number: plate,
        product: ddProduct,
        material_centre: ddLoadName,
        loaded_quantity: qty,
        ATC: ddLoadName === "HBM" ? null : ddAtc.trim(),
        order_no: ddLoadName === "HBM" ? ddOrderNo.trim() : null,
        child_order_no: ddLoadName === "HBM" ? ddChildOrderNo.trim() : null,
        trip_status: "In transit",
        driver_name: ddDriver.trim(),
      },
    })

    if (tripErr) {
      console.error("Trips mirror insert failed:", tripErr)
      await apiMutate("trips", {
        action: "delete",
        table: "dd_trips",
        filters: { dd_trip_id: tripId },
      })
      ddSetMsg(`Failed to create trip: ${tripErr}`, "error")
      return
    }

    ddSetMsg("Trip recorded successfully!", "success")
    setDdPlate(""); setDdDriver(""); setDdPhone("")
    setDdLoadName(""); setDdProduct("")
    setDdQty(""); setDdAtc(""); setDdOrderNo(""); setDdChildOrderNo("")
    setShowDdForm(false)
    fetchDdTrips()
  }

  function ddSetMsg(msg: string, type: "success" | "error") {
    setDdMessage(msg)
    setDdMessageType(type)
    if (type === "success") setTimeout(() => setDdMessage(""), 3000)
  }

  const ddProductOptions = ddLoadName ? PRODUCT_BY_LOADING_POINT[ddLoadName] ?? [] : []
  const ddShowHbmOrderFields = ddLoadName === "HBM"

  const filterOptions = ["All", "In transit", "On hold"]
  const ddFilterOptions = ["All", "In transit", "On hold", "Completed"]
  const filteredTrucks = filterStatus === "All"
    ? trucks
    : trucks.filter(t => t.trip_status === filterStatus)

  const { page, setPage, totalPages, paginatedItems, totalItems } = usePagination(filteredTrucks)

  const ddFiltered = ddFilterStatus === "All"
    ? ddTrips
    : ddTrips.filter(t => t.trip_status === ddFilterStatus)

  const { page: ddPage, setPage: setDdPage, totalPages: ddTotalPages, paginatedItems: paginatedDdItems, totalItems: ddTotalItems } = usePagination(ddFiltered)

  const statusColor = (status: string) =>
    status === "In transit" ? "#0070f3" :
    status === "On hold" ? "#f5a623" :
    status === "Completed" ? "#10b981" : "#64748b"

  const remainingColor = (remaining: number, loaded: number) => {
    if (remaining === 0) return "#ef4444"
    if (remaining < loaded * 0.2) return "#f59e0b"
    return "#10b981"
  }

  const labelStyle: React.CSSProperties = {
    fontWeight: 600,
    display: "block",
    marginBottom: 6,
    fontSize: FONT_SIZE.sm,
    color: "#475569",
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: isMobile ? "16px" : "32px", fontFamily: "'Inter', sans-serif" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, color: "#0f172a", fontSize: isMobile ? FONT_SIZE["2xl"] : FONT_SIZE["3xl"], fontWeight: 700, letterSpacing: "-0.5px" }}>
          Monitor Trucks
        </h1>
        <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: FONT_SIZE.base }}>
          {mode === "mdd" ? "Track active trucks and manage routes in real-time." : "Record a trip for third-party / direct delivery trucks."}
        </p>
      </div>

      <div style={{ display: "flex", background: "#eef2f6", borderRadius: 10, padding: 3, marginBottom: 24, maxWidth: 280 }}>
        {(["mdd", "dd"] as Mode[]).map(m => {
          const active = mode === m
          return (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                flex: 1,
                padding: "10px 16px",
                background: active ? "#fff" : "transparent",
                color: active ? "#0f172a" : "#64748b",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                fontWeight: active ? 700 : 500,
                fontSize: FONT_SIZE.sm,
                boxShadow: active ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                transition: "all 0.2s ease",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                minHeight: 40,
              }}
            >
              <Icon icon={m === "mdd" ? "mdi:truck-check" : "mdi:truck-delivery"} width={16} />
              {m === "mdd" ? "MDD/SC" : "DD"}
            </button>
          )
        })}
      </div>

      {mode === "mdd" ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            {trucks.length > 0 && (
              <div style={{ display: "flex", background: "white", border: "1px solid #e2e8f0", borderRadius: 8, padding: 4, gap: 0 }}>
                <button
                  onClick={() => setViewMode("card")}
                  style={{
                    padding: "8px 12px", background: viewMode === "card" ? "#0070f3" : "transparent",
                    color: viewMode === "card" ? "white" : "#64748b", border: "none", borderRadius: 6,
                    cursor: "pointer", fontSize: FONT_SIZE.xs, fontWeight: 600,
                    minWidth: 44, height: 40, display: "flex", alignItems: "center", justifyContent: "center"
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
                    cursor: "pointer", fontSize: FONT_SIZE.xs, fontWeight: 600,
                    minWidth: 44, height: 40, display: "flex", alignItems: "center", justifyContent: "center"
                  }}
                  title="Table view"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 4h18v2H3V4zm0 7h18v2H3v-2zm0 7h18v2H3v-2z"/></svg>
                </button>
              </div>
            )}
            <button
              onClick={fetchActiveTrucks}
              style={{
                padding: "8px 12px", background: "white", color: "#64748b",
                border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer",
                fontSize: FONT_SIZE.xs, fontWeight: 500, minHeight: 40, minWidth: 40,
                display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s"
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1" }}
              onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#e2e8f0" }}
              title="Refresh"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36M20.49 15a9 9 0 0 1-14.85 3.36"/></svg>
            </button>
          </div>

          {lastUpdated && (
            <p style={{ margin: "0 0 16px 0", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>
              Last updated: {lastUpdated.toLocaleTimeString()}
            </p>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
            {filterOptions.map(option => {
              const isActive = filterStatus === option
              const pill = getPillStyle(option, isActive)
              return (
                <button
                  key={option}
                  onClick={() => setFilterStatus(option)}
                  style={{
                    padding: "8px 14px", borderRadius: 20, fontSize: FONT_SIZE.sm, cursor: "pointer",
                    border: `1.5px solid ${pill.borderColor}`, background: pill.bg,
                    color: pill.textColor, fontWeight: isActive ? 600 : 500, transition: "all 0.2s"
                  }}
                  onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1" } }}
                  onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#e2e8f0" } }}
                >
                  {option}
                </button>
              )
            })}
          </div>

          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "64px 0" }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid #e2e8f0", borderTopColor: "#0070f3", animation: "spin 1s linear infinite" }} />
            </div>
          ) : filteredTrucks.length === 0 ? (
            <div style={{ textAlign: "center", padding: "64px 24px", background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)" }}>
              <div style={{ width: 64, height: 64, background: "#f1f5f9", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2"/></svg>
              </div>
              <h3 style={{ margin: "0 0 8px", color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 600 }}>No trucks found</h3>
              <p style={{ color: "#64748b", fontSize: FONT_SIZE.base, margin: 0 }}>
                {filterStatus === "All" ? "No trucks are currently active." : `No trucks with status "${filterStatus}".`}
              </p>
            </div>
          ) : (
            <>
              {viewMode === "card" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {paginatedItems.map((truck) => (
                    <div key={truck.trip_id} style={{ background: "white", borderRadius: 12, padding: 16, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)", transition: "all 0.2s ease" }} onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.08)"; e.currentTarget.style.borderColor = "#cbd5e1" }} onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.05)"; e.currentTarget.style.borderColor = "#e2e8f0" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <h3 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.lg, fontWeight: 600 }}>{truck.plate_number}</h3>
                            {truck.kbnl_truck_no && (
                              <span style={{ color: "#94a3b8", fontSize: FONT_SIZE.xs }}>· #{truck.kbnl_truck_no}</span>
                            )}
                          </div>
                          <p style={{ margin: 0, color: "#64748b", fontSize: FONT_SIZE.sm }}>{truck.driver_name}</p>
                        </div>
                        <span style={{
                          padding: "6px 12px", borderRadius: 16, fontSize: FONT_SIZE.xs, fontWeight: 600,
                          background: truck.trip_status === "In transit" ? "#ebf8ff" : "#fffbeb",
                          color: statusColor(truck.trip_status),
                          border: `1.5px solid ${statusColor(truck.trip_status)}`, whiteSpace: "nowrap"
                        }}>
                          {truck.trip_status}
                        </span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12, padding: "12px 0", borderTop: "1px solid #f1f5f9", borderBottom: "1px solid #f1f5f9" }}>
                        <div>
                          <p style={{ margin: "0 0 4px 0", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>Loaded</p>
                          <p style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.lg, fontWeight: 600 }}>{truck.loaded_quantity} bags</p>
                        </div>
                        <div>
                          <p style={{ margin: "0 0 4px 0", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>Remaining</p>
                          <p style={{ margin: 0, color: remainingColor(truck.remaining, truck.loaded_quantity), fontSize: FONT_SIZE.lg, fontWeight: 600 }}>{truck.remaining} bags</p>
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                        <div>
                          <p style={{ margin: "0 0 4px 0", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>Route</p>
                          {truck.route_points.length > 0 ? (
                            <p style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.sm, wordBreak: "break-word" }}>{truck.route_points.join(" → ")}</p>
                          ) : (
                            <p style={{ margin: 0, color: "#cbd5e1", fontSize: FONT_SIZE.sm, fontStyle: "italic" }}>No route set</p>
                          )}
                        </div>
                        <div>
                          <p style={{ margin: "0 0 4px 0", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>Driver Contact</p>
                          <p style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.sm }}>{truck.driver_phone}</p>
                        </div>
                      </div>
                      {!viewOnly && (
                        <button
                          onClick={() => openRouteEditor(truck)}
                          disabled={!canEdit}
                          style={{
                            width: "100%", padding: "10px 14px", background: !canEdit ? "#94a3b8" : "#0070f3", color: "white",
                            border: "none", borderRadius: 8, cursor: !canEdit ? "not-allowed" : "pointer", fontSize: FONT_SIZE.sm,
                            fontWeight: 600, transition: "all 0.2s", minHeight: 40
                          }}
                          onMouseEnter={e => { if (canEdit) e.currentTarget.style.opacity = "0.9" }}
                          onMouseLeave={e => { if (canEdit) e.currentTarget.style.opacity = "1" }}
                        >
                          {truck.route_points.length > 0 ? "Edit Route" : "Set Route"}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {viewMode === "table" && (
                <div style={{ background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)", overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                        <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Truck</th>
                        <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Driver</th>
                        <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Contact</th>
                        <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Loaded</th>
                        <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Remaining</th>
                        <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Status</th>
                        <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Route</th>
                        {!viewOnly && (
                          <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "right" }}>Action</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedItems.map((truck, idx) => (
                        <tr key={truck.trip_id} style={{ borderBottom: idx === filteredTrucks.length - 1 ? "none" : "1px solid #e2e8f0", transition: "background 0.2s ease" }} onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                          <td style={{ padding: "12px 16px" }}>
                            <strong style={{ color: "#0f172a", fontSize: FONT_SIZE.base }}>{truck.plate_number}</strong>
                            {truck.kbnl_truck_no && <div style={{ fontSize: FONT_SIZE.xs, color: "#94a3b8", marginTop: 2 }}>#{truck.kbnl_truck_no}</div>}
                          </td>
                          <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: FONT_SIZE.base }}>{truck.driver_name}</td>
                          <td style={{ padding: "12px 16px", color: "#64748b", fontSize: FONT_SIZE.sm }}>{truck.driver_phone}</td>
                          <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 500 }}>{truck.loaded_quantity}</td>
                          <td style={{ padding: "12px 16px", color: remainingColor(truck.remaining, truck.loaded_quantity), fontSize: FONT_SIZE.base, fontWeight: 600 }}>{truck.remaining}</td>
                          <td style={{ padding: "12px 16px" }}>
                            <span style={{
                              padding: "6px 10px", borderRadius: 14, fontSize: FONT_SIZE.xs, fontWeight: 600,
                              background: truck.trip_status === "In transit" ? "#ebf8ff" : "#fffbeb",
                              color: statusColor(truck.trip_status), border: `1.5px solid ${statusColor(truck.trip_status)}`
                            }}>
                              {truck.trip_status}
                            </span>
                          </td>
                          <td style={{ padding: "12px 16px", color: truck.route_points.length > 0 ? "#0f172a" : "#cbd5e1", fontSize: FONT_SIZE.sm }}>
                            {truck.route_points.length > 0 ? truck.route_points.join(" → ") : "No route"}
                          </td>
                          {!viewOnly && (
                            <td style={{ padding: "12px 16px", textAlign: "right" }}>
                              <button
                                onClick={() => openRouteEditor(truck)}
                                disabled={!canEdit}
                                title={truck.route_points.length > 0 ? "Edit route" : "Set route"}
                                style={{
                                  padding: "6px 10px", cursor: !canEdit ? "not-allowed" : "pointer", borderRadius: 6, border: "1.5px solid #0070f3",
                                  color: !canEdit ? "#94a3b8" : "#0070f3", background: !canEdit ? "#e2e8f0" : "#f0f7ff", fontSize: FONT_SIZE.sm, fontWeight: 500,
                                  transition: "all 0.2s", minHeight: 32,
                                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4
                                }}
                                onMouseEnter={e => { if (canEdit) e.currentTarget.style.background = "#e0efff" }}
                                onMouseLeave={e => { if (canEdit) e.currentTarget.style.background = "#f0f7ff" }}
                              >
                                Route
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {filteredTrucks.length > 0 && (
            <PaginationControls page={page} totalPages={totalPages} totalItems={totalItems} onPageChange={setPage} />
          )}

          {editingRoute && (
            <div onClick={closeRouteEditor} style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 100, padding: isMobile ? 0 : 24, animation: "fadeIn 0.2s ease-out" }}>
              <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
              <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: isMobile ? "20px 20px 0 0" : 12, padding: isMobile ? "28px 20px" : 32, width: "100%", maxWidth: 440, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)", animation: "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
                  <div>
                    <h3 style={{ margin: "0 0 4px 0", color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>
                      {editingRoute.route_points.length > 0 ? "Edit Route" : "Set Route"}
                    </h3>
                    <p style={{ margin: 0, color: "#94a3b8", fontSize: FONT_SIZE.sm }}>
                      {editingRoute.plate_number}{editingRoute.kbnl_truck_no ? ` · #${editingRoute.kbnl_truck_no}` : ""}
                    </p>
                  </div>
                  <button onClick={closeRouteEditor} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 0, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", transition: "color 0.2s", flexShrink: 0 }}
                    onMouseEnter={e => e.currentTarget.style.color = "#64748b"}
                    onMouseLeave={e => e.currentTarget.style.color = "#94a3b8"}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
                {routePoints.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ fontWeight: 600, display: "block", marginBottom: 10, color: "#475569", fontSize: FONT_SIZE.sm }}>Route Points</label>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {routePoints.map((point, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0", transition: "all 0.2s" }} onMouseEnter={e => { e.currentTarget.style.background = "#f1f5f9"; e.currentTarget.style.borderColor = "#cbd5e1" }} onMouseLeave={e => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#e2e8f0" }}>
                          <span style={{ fontSize: FONT_SIZE.xs, color: "#94a3b8", fontWeight: 600, minWidth: 20 }}>{i + 1}.</span>
                          <span style={{ flex: 1, fontSize: FONT_SIZE.base, color: "#0f172a" }}>{point}</span>
                          <button onClick={() => removePoint(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 18, lineHeight: 1, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, transition: "color 0.2s" }}
                            onMouseEnter={e => e.currentTarget.style.color = "#dc2626"}
                            onMouseLeave={e => e.currentTarget.style.color = "#ef4444"}>✕</button>
                        </div>
                      ))}
                    </div>
                    {routePoints.length > 1 && (
                      <p style={{ fontSize: FONT_SIZE.xs, color: "#94a3b8", marginTop: 8, margin: "8px 0 0 0" }}>{routePoints.join(" → ")}</p>
                    )}
                  </div>
                )}
                <div style={{ marginBottom: 24, paddingBottom: 20, borderBottom: "1px solid #e2e8f0" }}>
                  <label style={{ fontWeight: 600, display: "block", marginBottom: 8, color: "#475569", fontSize: FONT_SIZE.sm }}>Add a Point</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input type="text" placeholder="e.g. Ikom, Calabar, Ogoja" value={newPoint} onChange={e => setNewPoint(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addPoint() }} readOnly={!canEdit}
                      style={{ flex: 1, padding: "12px 14px", borderRadius: 8, border: "1px solid #e0e0e0", fontSize: FONT_SIZE.base, background: "white", color: "#171717", minHeight: 40, transition: "border-color 0.2s ease", boxSizing: "border-box" }} autoFocus />
                    <button onClick={addPoint} disabled={!canEdit} style={{ padding: "10px 16px", background: !canEdit ? "#94a3b8" : "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: !canEdit ? "not-allowed" : "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, minHeight: 40, transition: "opacity 0.2s" }}
                      onMouseEnter={e => { if (canEdit) e.currentTarget.style.opacity = "0.9" }}
                      onMouseLeave={e => { if (canEdit) e.currentTarget.style.opacity = "1" }}>Add</button>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <button onClick={closeRouteEditor} style={{ padding: "12px 16px", background: "white", color: "#475569", border: "1px solid #cbd5e1", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, minHeight: 44, transition: "all 0.2s" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#0070f3"; e.currentTarget.style.color = "#0070f3" }}
                    onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#cbd5e1"; e.currentTarget.style.color = "#475569" }}>Cancel</button>
                  <button onClick={saveRoute} disabled={routeSaving || !canEdit} style={{ padding: "12px 16px", background: routeSaving || !canEdit ? "#94a3b8" : "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: routeSaving || !canEdit ? "not-allowed" : "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, opacity: routeSaving || !canEdit ? 0.7 : 1, minHeight: 44, transition: "opacity 0.2s" }}
                    onMouseEnter={e => { if (!routeSaving && canEdit) e.currentTarget.style.opacity = "0.9" }}
                    onMouseLeave={e => { if (!routeSaving && canEdit) e.currentTarget.style.opacity = "1" }}>
                    {routeSaving ? "Saving..." : "Save Route"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
            {!viewOnly && (
              <button
                onClick={() => { setShowDdForm(true); setDdMessage("") }}
                disabled={!canEdit}
                style={{
                  padding: "10px 18px", background: !canEdit ? "#94a3b8" : "#0070f3", color: "white", border: "none",
                  borderRadius: 8, cursor: !canEdit ? "not-allowed" : "pointer", fontSize: FONT_SIZE.sm, fontWeight: 600,
                  display: "flex", alignItems: "center", gap: 6, minHeight: 40,
                }}
              >
                <Icon icon="mdi:plus" width={16} />
                Log New Trip
              </button>
            )}

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {ddTrips.length > 0 && (
                <div style={{ display: "flex", background: "white", border: "1px solid #e2e8f0", borderRadius: 8, padding: 4, gap: 0 }}>
                  <button
                    onClick={() => setDdViewMode("card")}
                    style={{
                      padding: "8px 12px", background: ddViewMode === "card" ? "#0070f3" : "transparent",
                      color: ddViewMode === "card" ? "white" : "#64748b", border: "none", borderRadius: 6,
                      cursor: "pointer", fontSize: FONT_SIZE.xs, fontWeight: 600,
                      minWidth: 44, height: 40, display: "flex", alignItems: "center", justifyContent: "center"
                    }}
                    title="Card view"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z"/></svg>
                  </button>
                  <button
                    onClick={() => setDdViewMode("table")}
                    style={{
                      padding: "8px 12px", background: ddViewMode === "table" ? "#0070f3" : "transparent",
                      color: ddViewMode === "table" ? "white" : "#64748b", border: "none", borderRadius: 6,
                      cursor: "pointer", fontSize: FONT_SIZE.xs, fontWeight: 600,
                      minWidth: 44, height: 40, display: "flex", alignItems: "center", justifyContent: "center"
                    }}
                    title="Table view"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 4h18v2H3V4zm0 7h18v2H3v-2zm0 7h18v2H3v-2z"/></svg>
                  </button>
                </div>
              )}
              <button
                onClick={fetchDdTrips}
                style={{
                  padding: "8px 12px", background: "white", color: "#64748b",
                  border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer",
                  fontSize: FONT_SIZE.xs, fontWeight: 500, minHeight: 40, minWidth: 40,
                  display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s"
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1" }}
                onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#e2e8f0" }}
                title="Refresh"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36M20.49 15a9 9 0 0 1-14.85 3.36"/></svg>
              </button>
            </div>
          </div>

          {ddLastUpdated && (
            <p style={{ margin: "0 0 16px 0", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>
              Last updated: {ddLastUpdated.toLocaleTimeString()}
            </p>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
            {ddFilterOptions.map(option => {
              const isActive = ddFilterStatus === option
              const pill = getPillStyle(option, isActive)
              return (
                <button
                  key={option}
                  onClick={() => setDdFilterStatus(option)}
                  style={{
                    padding: "8px 14px", borderRadius: 20, fontSize: FONT_SIZE.sm, cursor: "pointer",
                    border: `1.5px solid ${pill.borderColor}`, background: pill.bg,
                    color: pill.textColor, fontWeight: isActive ? 600 : 500, transition: "all 0.2s"
                  }}
                  onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1" } }}
                  onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#e2e8f0" } }}
                >
                  {option}
                </button>
              )
            })}
          </div>

          {ddMessage && (
            <div style={{
              padding: 12, borderRadius: 8, marginBottom: 20, fontSize: FONT_SIZE.sm, fontWeight: 600,
              display: "flex", alignItems: "center", gap: 8,
              background: ddMessageType === "success" ? "#f0fff4" : "#fef2f2",
              border: ddMessageType === "success" ? "1px solid #86efac" : "1px solid #fecaca",
              color: ddMessageType === "success" ? "#166534" : "#b91c1c",
            }}>
              <Icon icon={ddMessageType === "success" ? "mdi:check-circle" : "mdi:alert-circle"} width={16} />
              {ddMessage}
            </div>
          )}

          {ddLoading && ddTrips.length === 0 ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "64px 0" }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid #e2e8f0", borderTopColor: "#0070f3", animation: "spin 1s linear infinite" }} />
            </div>
          ) : ddFiltered.length === 0 ? (
              <div style={{ textAlign: "center", padding: "64px 24px", background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)" }}>
                <div style={{ width: 64, height: 64, background: "#f1f5f9", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                  <Icon icon="mdi:truck-delivery" width={32} color="#94a3b8" />
                </div>
                <h3 style={{ margin: "0 0 8px", color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 600 }}>No DD trips found</h3>
                <p style={{ color: "#64748b", fontSize: FONT_SIZE.base, margin: 0 }}>
                  {ddFilterStatus === "All" ? "No direct delivery trips yet." : `No trips with status "${ddFilterStatus}".`}
                </p>
              </div>
            ) : ddViewMode === "card" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {paginatedDdItems.map(trip => (
                  <div key={trip.dd_trip_id} style={{ background: "white", borderRadius: 12, padding: 16, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)", transition: "all 0.2s ease" }} onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.08)"; e.currentTarget.style.borderColor = "#cbd5e1" }} onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.05)"; e.currentTarget.style.borderColor = "#e2e8f0" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.lg, fontWeight: 600 }}>{trip.plate_number}</h3>
                        <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: FONT_SIZE.sm }}>{trip.driver_name}</p>
                      </div>
                      <span style={{
                        padding: "6px 12px", borderRadius: 16, fontSize: FONT_SIZE.xs, fontWeight: 600,
                        background: trip.trip_status === "In transit" ? "#ebf8ff" : trip.trip_status === "Completed" ? "#f0fdf4" : "#fffbeb",
                        color: statusColor(trip.trip_status),
                        border: `1.5px solid ${statusColor(trip.trip_status)}`, whiteSpace: "nowrap"
                      }}>
                        {trip.trip_status}
                      </span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12, padding: "12px 0", borderTop: "1px solid #f1f5f9", borderBottom: "1px solid #f1f5f9" }}>
                      <div>
                        <p style={{ margin: "0 0 4px 0", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>Product</p>
                        <p style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 600 }}>{trip.product}</p>
                      </div>
                      <div>
                        <p style={{ margin: "0 0 4px 0", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>Bags</p>
                        <p style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 600 }}>{trip.loaded_quantity}</p>
                      </div>
                      <div>
                        <p style={{ margin: "0 0 4px 0", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>Bags Remaining</p>
                        <p style={{ margin: 0, color: remainingColor(trip.remaining, trip.loaded_quantity), fontSize: FONT_SIZE.base, fontWeight: 600 }}>{trip.remaining}</p>
                      </div>
                      <div>
                        <p style={{ margin: "0 0 4px 0", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>Manufacturing Company</p>
                        <p style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.sm }}>{trip.loading_point}</p>
                      </div>
                      <div>
                        <p style={{ margin: "0 0 4px 0", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>{trip.order_no ? "Order No" : "ATC"}</p>
                        <p style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.sm }}>{trip.order_no || trip.atc || "—"}</p>
                      </div>
                      {trip.child_order_no && (
                        <div>
                          <p style={{ margin: "0 0 4px 0", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>Child Order No</p>
                          <p style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.sm }}>{trip.child_order_no}</p>
                        </div>
                      )}
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <p style={{ margin: "0 0 4px 0", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>Route</p>
                      {trip.route_points && trip.route_points.length > 0 ? (
                        <p style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.sm, wordBreak: "break-word" }}>{trip.route_points.join(" → ")}</p>
                      ) : (
                        <p style={{ margin: 0, color: "#cbd5e1", fontSize: FONT_SIZE.sm, fontStyle: "italic" }}>No route set</p>
                      )}
                    </div>
                    <p style={{ margin: "0 0 12px 0", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>
                      Created: {new Date(trip.created_at).toLocaleDateString()}
                    </p>
                    {!viewOnly && trip.trip_status !== "Completed" && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, borderTop: "1px solid #f1f5f9", paddingTop: 12, marginTop: 4 }}>
                        <button
                          onClick={() => openDiscModal(trip.dd_trip_id, `${trip.plate_number} — ${trip.driver_name}`, trip.remaining)}
                          disabled={!canEdit}
                          style={{
                            padding: "10px 12px", background: !canEdit ? "#e2e8f0" : "white", color: !canEdit ? "#94a3b8" : "#f5a623",
                            border: "1.5px solid #f5a623", borderRadius: 8, cursor: !canEdit ? "not-allowed" : "pointer",
                            fontSize: FONT_SIZE.sm, fontWeight: 600, minHeight: 40,
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "all 0.2s"
                          }}
                          onMouseEnter={e => { if (canEdit) e.currentTarget.style.background = "#fffbeb" }}
                          onMouseLeave={e => { if (canEdit) e.currentTarget.style.background = "white" }}
                        >
                          <Icon icon="mdi:alert-outline" width={16} /> Discrepancy
                        </button>
                        <button
                          onClick={() => openDdStopForm(trip)}
                          disabled={!canEdit}
                          style={{
                            padding: "10px 12px", background: !canEdit ? "#94a3b8" : "#8b5cf6", color: "white",
                            border: "none", borderRadius: 8, cursor: !canEdit ? "not-allowed" : "pointer", fontSize: FONT_SIZE.sm,
                            fontWeight: 600, minHeight: 40, transition: "opacity 0.2s"
                          }}
                          onMouseEnter={e => { if (canEdit) e.currentTarget.style.opacity = "0.9" }}
                          onMouseLeave={e => { if (canEdit) e.currentTarget.style.opacity = "1" }}
                        >
                          Log Stop
                        </button>
                        <button
                          onClick={() => openDdRouteEditor(trip)}
                          disabled={!canEdit}
                          style={{
                            padding: "10px 12px", background: !canEdit ? "#94a3b8" : "#0070f3", color: "white",
                            border: "none", borderRadius: 8, cursor: !canEdit ? "not-allowed" : "pointer", fontSize: FONT_SIZE.sm,
                            fontWeight: 600, minHeight: 40, transition: "opacity 0.2s"
                          }}
                          onMouseEnter={e => { if (canEdit) e.currentTarget.style.opacity = "0.9" }}
                          onMouseLeave={e => { if (canEdit) e.currentTarget.style.opacity = "1" }}
                        >
                          Edit Route
                        </button>
                        <button
                          onClick={() => updateDdTripStatus(trip.dd_trip_id, "Completed")}
                          disabled={!canEdit}
                          style={{
                            padding: "10px 12px", background: !canEdit ? "#94a3b8" : "#10b981", color: "white",
                            border: "none", borderRadius: 8, cursor: !canEdit ? "not-allowed" : "pointer", fontSize: FONT_SIZE.sm,
                            fontWeight: 600, minHeight: 40, transition: "opacity 0.2s"
                          }}
                          onMouseEnter={e => { if (canEdit) e.currentTarget.style.opacity = "0.9" }}
                          onMouseLeave={e => { if (canEdit) e.currentTarget.style.opacity = "1" }}
                        >
                          Mark Completed
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)", overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                      <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Truck</th>
                      <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Driver</th>
                      <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Product</th>
                      <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Bags</th>
                      <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Remaining</th>
                      <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Manufacturing Company</th>
                      <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Status</th>
                      <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Route</th>
                      {!viewOnly && (
                        <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "right" }}>Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedDdItems.map((trip, idx) => (
                      <tr key={trip.dd_trip_id} style={{ borderBottom: idx === ddFiltered.length - 1 ? "none" : "1px solid #e2e8f0", transition: "background 0.2s ease" }} onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <td style={{ padding: "12px 16px" }}>
                          <strong style={{ color: "#0f172a", fontSize: FONT_SIZE.base }}>{trip.plate_number}</strong>
                          <div style={{ fontSize: FONT_SIZE.xs, color: "#94a3b8", marginTop: 2 }}>{trip.driver_phone || "—"}</div>
                        </td>
                        <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: FONT_SIZE.base }}>{trip.driver_name}</td>
                        <td style={{ padding: "12px 16px", color: "#475569", fontSize: FONT_SIZE.sm }}>{trip.product}</td>
                        <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 500 }}>{trip.loaded_quantity}</td>
                        <td style={{ padding: "12px 16px", color: remainingColor(trip.remaining, trip.loaded_quantity), fontSize: FONT_SIZE.base, fontWeight: 600 }}>{trip.remaining}</td>
                        <td style={{ padding: "12px 16px", color: "#475569", fontSize: FONT_SIZE.sm }}>{trip.loading_point}{trip.order_no ? ` (Order: ${trip.order_no}${trip.child_order_no ? ` / Child: ${trip.child_order_no}` : ""})` : trip.atc ? ` (${trip.atc})` : ""}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{
                            padding: "6px 10px", borderRadius: 14, fontSize: FONT_SIZE.xs, fontWeight: 600,
                            background: trip.trip_status === "In transit" ? "#ebf8ff" : trip.trip_status === "Completed" ? "#f0fdf4" : "#fffbeb",
                            color: statusColor(trip.trip_status), border: `1.5px solid ${statusColor(trip.trip_status)}`
                          }}>
                            {trip.trip_status}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px", color: trip.route_points && trip.route_points.length > 0 ? "#0f172a" : "#cbd5e1", fontSize: FONT_SIZE.sm }}>
                          {trip.route_points && trip.route_points.length > 0 ? trip.route_points.join(" → ") : "No route"}
                        </td>
                        {!viewOnly && (
                          <td style={{ padding: "12px 16px", textAlign: "right" }}>
                            {trip.trip_status !== "Completed" && (
                            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                              <button onClick={() => openDiscModal(trip.dd_trip_id, `${trip.plate_number} — ${trip.driver_name}`, trip.remaining)} disabled={!canEdit} title="Report shortage or caked bags" style={{ padding: "6px 10px", cursor: !canEdit ? "not-allowed" : "pointer", borderRadius: 6, border: "1.5px solid #f5a623", color: !canEdit ? "#94a3b8" : "#f5a623", background: !canEdit ? "#e2e8f0" : "#fffbeb", fontSize: FONT_SIZE.xs, fontWeight: 600, transition: "all 0.2s", minHeight: 32, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                                onMouseEnter={e => { if (canEdit) e.currentTarget.style.background = "#fef3c7" }}
                                onMouseLeave={e => { if (canEdit) e.currentTarget.style.background = "#fffbeb" }}><Icon icon="mdi:alert-outline" width={14} /> Disc</button>
                              <button onClick={() => openDdStopForm(trip)} disabled={!canEdit} title="Log stop" style={{ padding: "6px 10px", cursor: !canEdit ? "not-allowed" : "pointer", borderRadius: 6, border: "1.5px solid #8b5cf6", color: !canEdit ? "#94a3b8" : "#8b5cf6", background: !canEdit ? "#e2e8f0" : "#f5f3ff", fontSize: FONT_SIZE.xs, fontWeight: 600, transition: "all 0.2s", minHeight: 32, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                                onMouseEnter={e => { if (canEdit) e.currentTarget.style.background = "#ede9fe" }}
                                onMouseLeave={e => { if (canEdit) e.currentTarget.style.background = "#f5f3ff" }}><Icon icon="mdi:map-marker-plus" width={14} /> Stop</button>
                              <button onClick={() => openDdRouteEditor(trip)} disabled={!canEdit} title="Edit route" style={{ padding: "6px 10px", cursor: !canEdit ? "not-allowed" : "pointer", borderRadius: 6, border: "1.5px solid #0070f3", color: !canEdit ? "#94a3b8" : "#0070f3", background: !canEdit ? "#e2e8f0" : "#f0f7ff", fontSize: FONT_SIZE.xs, fontWeight: 600, transition: "all 0.2s", minHeight: 32, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                                onMouseEnter={e => { if (canEdit) e.currentTarget.style.background = "#e0efff" }}
                                onMouseLeave={e => { if (canEdit) e.currentTarget.style.background = "#f0f7ff" }}><Icon icon="mdi:map-marker-outline" width={14} /> Route</button>
                              <button onClick={() => updateDdTripStatus(trip.dd_trip_id, "Completed")} disabled={!canEdit} title="Mark completed" style={{ padding: "6px 10px", cursor: !canEdit ? "not-allowed" : "pointer", borderRadius: 6, border: "1.5px solid #10b981", color: !canEdit ? "#94a3b8" : "#10b981", background: !canEdit ? "#e2e8f0" : "#f0fdf4", fontSize: FONT_SIZE.xs, fontWeight: 600, transition: "all 0.2s", minHeight: 32, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                                onMouseEnter={e => { if (canEdit) e.currentTarget.style.background = "#dcfce7" }}
                                onMouseLeave={e => { if (canEdit) e.currentTarget.style.background = "#f0fdf4" }}><Icon icon="mdi:check-circle-outline" width={14} /> Done</button>
                            </div>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          {ddFiltered.length > 0 && (
            <PaginationControls page={ddPage} totalPages={ddTotalPages} totalItems={ddTotalItems} onPageChange={setDdPage} />
          )}

          {/* ── Log New Trip Modal ── */}
          {showDdForm && (
            <div onClick={() => { if (!ddSubmitting) setShowDdForm(false) }} style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 100, padding: isMobile ? 0 : 24, animation: "fadeIn 0.2s ease-out" }}>
              <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
              <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: isMobile ? "20px 20px 0 0" : 12, padding: isMobile ? "28px 20px" : 32, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)", animation: "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                  <h2 style={{ margin: 0, color: "#0070f3", fontSize: FONT_SIZE.xl, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                    <Icon icon="mdi:truck-plus" width={22} />
                    New DD Trip
                  </h2>
                  <button onClick={() => { if (!ddSubmitting) { setShowDdForm(false); setDdMessage("") } }} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Truck Number *</label>
                  <ModernInput placeholder="e.g. ABC-123-XY" value={ddPlate} onChange={e => { setDdPlate(e.target.value); setDdMessage("") }} />
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Driver Name *</label>
                  <ModernInput placeholder="Full name" value={ddDriver} onChange={e => { setDdDriver(e.target.value); setDdMessage("") }} />
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Driver Phone</label>
                  <ModernInput placeholder="Optional" value={ddPhone} onChange={e => { setDdPhone(e.target.value); setDdMessage("") }} />
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Manufacturing Company *</label>
                  <ModernInput as="select" value={ddLoadName} onChange={e => ddHandleLoadNameChange(e.target.value)} options={DD_LOADING_POINTS}>
                    <option value="">Select manufacturing company</option>
                  </ModernInput>
                </div>

                {ddLoadName && !ddShowHbmOrderFields && (
                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>ATC Number *</label>
                    <ModernInput placeholder="Enter ATC number" value={ddAtc} onChange={e => { setDdAtc(e.target.value); setDdMessage("") }} onKeyDown={e => { if (e.key === "Enter") ddQtyRef.current?.focus() }} />
                  </div>
                )}

                {ddShowHbmOrderFields && (
                  <>
                    <div style={{ marginBottom: 16 }}>
                      <label style={labelStyle}>Order No. *</label>
                      <ModernInput placeholder="Enter order number" value={ddOrderNo} onChange={e => { setDdOrderNo(e.target.value); setDdMessage("") }} />
                    </div>
                    <div style={{ marginBottom: 16 }}>
                      <label style={labelStyle}>Child Order No. *</label>
                      <ModernInput placeholder="Enter child order number" value={ddChildOrderNo} onChange={e => { setDdChildOrderNo(e.target.value); setDdMessage("") }} onKeyDown={e => { if (e.key === "Enter") ddQtyRef.current?.focus() }} />
                    </div>
                  </>
                )}

                {ddLoadName && (
                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>Product *</label>
                    <ModernInput as="select" value={ddProduct} onChange={e => { setDdProduct(e.target.value); setDdMessage("") }}>
                      <option value="">Select product</option>
                      {ddProductOptions.map(p => <option key={p} value={p}>{p}</option>)}
                    </ModernInput>
                  </div>
                )}

                {ddProduct && ddLoadName && (
                  <div style={{ marginBottom: 24 }}>
                    <label style={labelStyle}>No. of Bags *</label>
                    <ModernInput ref={ddQtyRef} type="number" placeholder="e.g. 600" value={ddQty} onChange={e => { setDdQty(e.target.value); setDdMessage("") }} onKeyDown={e => { if (e.key === "Enter") ddHandleSubmit() }} />
                  </div>
                )}

                {ddMessage && (
                  <div style={{
                    padding: 12, borderRadius: 8, marginBottom: 16, fontSize: FONT_SIZE.sm, fontWeight: 600,
                    background: ddMessageType === "success" ? "#f0fff4" : "#fef2f2",
                    border: ddMessageType === "success" ? "1px solid #86efac" : "1px solid #fecaca",
                    color: ddMessageType === "success" ? "#166534" : "#b91c1c",
                  }}>
                    {ddMessage}
                  </div>
                )}

                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => { if (!ddSubmitting) { setShowDdForm(false); setDdMessage("") } }} disabled={ddSubmitting} style={{
                    flex: 1, padding: "12px 0", background: "white", border: "1.5px solid #d1d5db",
                    borderRadius: 8, cursor: ddSubmitting ? "not-allowed" : "pointer", fontSize: FONT_SIZE.sm, fontWeight: 600, minHeight: 48
                  }}>Cancel</button>
                  <button
                    onClick={ddHandleSubmit}
                    disabled={ddSubmitting || !canEdit}
                    style={{
                      flex: 1, padding: "12px 0", background: ddSubmitting || !canEdit ? "#94a3b8" : "#0070f3", color: "white",
                      border: "none", borderRadius: 8, cursor: ddSubmitting || !canEdit ? "not-allowed" : "pointer",
                      fontWeight: 700, fontSize: FONT_SIZE.sm, minHeight: 48,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      opacity: ddSubmitting || !canEdit ? 0.7 : 1, transition: "opacity 0.2s",
                    }}
                  >
                    {ddSubmitting
                      ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} /> Recording…</>
                      : <><Icon icon="mdi:truck-check" width={16} /> Record Trip</>
                    }
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Edit Route Modal ── */}
          {editingDdTrip && (
            <div onClick={closeDdRouteEditor} style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 100, padding: isMobile ? 0 : 24, animation: "fadeIn 0.2s ease-out" }}>
              <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: isMobile ? "20px 20px 0 0" : 12, padding: isMobile ? "28px 20px" : 32, width: "100%", maxWidth: 440, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)", animation: "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
                  <div>
                    <h3 style={{ margin: "0 0 4px 0", color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>
                      {editingDdTrip.route_points && editingDdTrip.route_points.length > 0 ? "Edit Route" : "Set Route"}
                    </h3>
                    <p style={{ margin: 0, color: "#94a3b8", fontSize: FONT_SIZE.sm }}>
                      {editingDdTrip.plate_number}
                    </p>
                  </div>
                  <button onClick={closeDdRouteEditor} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 0, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", transition: "color 0.2s", flexShrink: 0 }}
                    onMouseEnter={e => e.currentTarget.style.color = "#64748b"}
                    onMouseLeave={e => e.currentTarget.style.color = "#94a3b8"}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
                {ddRoutePoints.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ fontWeight: 600, display: "block", marginBottom: 10, color: "#475569", fontSize: FONT_SIZE.sm }}>Route Points</label>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {ddRoutePoints.map((point, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0", transition: "all 0.2s" }} onMouseEnter={e => { e.currentTarget.style.background = "#f1f5f9"; e.currentTarget.style.borderColor = "#cbd5e1" }} onMouseLeave={e => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#e2e8f0" }}>
                          <span style={{ fontSize: FONT_SIZE.xs, color: "#94a3b8", fontWeight: 600, minWidth: 20 }}>{i + 1}.</span>
                          <span style={{ flex: 1, fontSize: FONT_SIZE.base, color: "#0f172a" }}>{point}</span>
                          <button onClick={() => setDdRoutePoints(ddRoutePoints.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 18, lineHeight: 1, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, transition: "color 0.2s" }}
                            onMouseEnter={e => e.currentTarget.style.color = "#dc2626"}
                            onMouseLeave={e => e.currentTarget.style.color = "#ef4444"}>✕</button>
                        </div>
                      ))}
                    </div>
                    {ddRoutePoints.length > 1 && (
                      <p style={{ fontSize: FONT_SIZE.xs, color: "#94a3b8", marginTop: 8, margin: "8px 0 0 0" }}>{ddRoutePoints.join(" → ")}</p>
                    )}
                  </div>
                )}
                <div style={{ marginBottom: 24, paddingBottom: 20, borderBottom: "1px solid #e2e8f0" }}>
                  <label style={{ fontWeight: 600, display: "block", marginBottom: 8, color: "#475569", fontSize: FONT_SIZE.sm }}>Add a Point</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input type="text" placeholder="e.g. Ikom, Calabar, Ogoja" value={ddNewPoint} onChange={e => setDdNewPoint(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { const trimmed = ddNewPoint.trim(); if (trimmed) { setDdRoutePoints([...ddRoutePoints, trimmed]); setDdNewPoint("") } } }} readOnly={!canEdit}
                      style={{ flex: 1, padding: "12px 14px", borderRadius: 8, border: "1px solid #e0e0e0", fontSize: FONT_SIZE.base, background: "white", color: "#171717", minHeight: 40, transition: "border-color 0.2s ease", boxSizing: "border-box" }} autoFocus />
                    <button onClick={() => { const trimmed = ddNewPoint.trim(); if (trimmed) { setDdRoutePoints([...ddRoutePoints, trimmed]); setDdNewPoint("") } }} disabled={!canEdit} style={{ padding: "10px 16px", background: !canEdit ? "#94a3b8" : "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: !canEdit ? "not-allowed" : "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, minHeight: 40, transition: "opacity 0.2s" }}
                      onMouseEnter={e => { if (canEdit) e.currentTarget.style.opacity = "0.9" }}
                      onMouseLeave={e => { if (canEdit) e.currentTarget.style.opacity = "1" }}>Add</button>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <button onClick={closeDdRouteEditor} style={{ padding: "12px 16px", background: "white", color: "#475569", border: "1px solid #cbd5e1", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, minHeight: 44, transition: "all 0.2s" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#0070f3"; e.currentTarget.style.color = "#0070f3" }}
                    onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#cbd5e1"; e.currentTarget.style.color = "#475569" }}>Cancel</button>
                  <button onClick={saveDdRoute} disabled={ddRouteSaving || !canEdit} style={{ padding: "12px 16px", background: ddRouteSaving || !canEdit ? "#94a3b8" : "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: ddRouteSaving || !canEdit ? "not-allowed" : "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, opacity: ddRouteSaving || !canEdit ? 0.7 : 1, minHeight: 44, transition: "opacity 0.2s" }}
                    onMouseEnter={e => { if (!ddRouteSaving && canEdit) e.currentTarget.style.opacity = "0.9" }}
                    onMouseLeave={e => { if (!ddRouteSaving && canEdit) e.currentTarget.style.opacity = "1" }}>
                    {ddRouteSaving ? "Saving..." : "Save Route"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stop form modal for DD trips */}
      {showDdStopForm && selectedDdStopTrip && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.5)",
          display: "flex", justifyContent: "center", alignItems: "center",
          padding: 16
        }}
          onClick={() => { setShowDdStopForm(false); setSelectedDdStopTrip(null) }}>
          <div style={{ background: "white", borderRadius: 16, padding: 24, width: "100%", maxWidth: 480, maxHeight: "90vh", overflow: "auto" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h3 style={{ margin: 0, color: "#171717", fontWeight: 700, fontSize: FONT_SIZE.lg }}>Log Stop</h3>
                <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: FONT_SIZE.sm }}>
                  {selectedDdStopTrip.plate_number} — {selectedDdStopTrip.product}
                </p>
              </div>
              <button onClick={() => { setShowDdStopForm(false); setSelectedDdStopTrip(null) }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 24, padding: 4, lineHeight: 1 }}>
                ✕
              </button>
            </div>
            <StopForm
              tripId={selectedDdStopTrip.dd_trip_id}
              loadedQuantity={selectedDdStopTrip.loaded_quantity}
              offloadedSoFar={ddStopOffloaded}
              onStopLogged={handleDdStopLogged}
            />
          </div>
        </div>
      )}

      {/* DD end-trip confirm modal — all bags offloaded */}
      {ddEndConfirmTrip && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.5)",
          display: "flex", justifyContent: "center", alignItems: "center",
          padding: 16
        }}>
          <div style={{ background: "white", borderRadius: 16, padding: 24, width: "100%", maxWidth: 440 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ width: 56, height: 56, background: "#f0fff4", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", border: "2px solid #86efac" }}>
                <Icon icon="mdi:check-circle" width={28} color="#16a34a" />
              </div>
              <h3 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>All bags offloaded!</h3>
              <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: FONT_SIZE.sm }}>
                {ddEndConfirmTrip.plate_number} — {ddEndConfirmTrip.product}. Ready to end this trip?
              </p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button
                onClick={() => { updateDdTripStatus(ddEndConfirmTrip.dd_trip_id, "Completed"); setDdEndConfirmTrip(null) }}
                style={{ padding: "12px 16px", background: "#10b981", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: FONT_SIZE.md, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.2s" }}
                onMouseEnter={e => { e.currentTarget.style.opacity = "0.9" }}
                onMouseLeave={e => { e.currentTarget.style.opacity = "1" }}
              >
                <Icon icon="mdi:flag-checkered" width={18} /> End Trip
              </button>
              <button
                onClick={() => setDdEndConfirmTrip(null)}
                style={{ padding: "12px 16px", background: "white", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: FONT_SIZE.md, minHeight: 44 }}
              >
                Not Yet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discrepancy Report Modal */}
      {showDiscModal && (
        <div onClick={discSubmitting ? undefined : closeDiscModal} style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 100, padding: isMobile ? 0 : 24, animation: "fadeIn 0.2s ease-out" }}>
          <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
          <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: isMobile ? "20px 20px 0 0" : 12, padding: isMobile ? "28px 20px" : 32, width: "100%", maxWidth: 440, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)", animation: "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
              <div>
                <h3 style={{ margin: "0 0 4px 0", color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>Report Discrepancy</h3>
                <p style={{ margin: 0, color: "#94a3b8", fontSize: FONT_SIZE.sm }}>
                  {discTripLabel}
                </p>
                <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: FONT_SIZE.sm }}>
                  Remaining: <strong style={{ color: "#0f172a" }}>{discTripRemaining} bags</strong>
                </p>
              </div>
              <button onClick={closeDiscModal} disabled={discSubmitting} style={{ background: "none", border: "none", color: discSubmitting ? "#e2e8f0" : "#94a3b8", cursor: discSubmitting ? "not-allowed" : "pointer", padding: 0, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", transition: "color 0.2s", flexShrink: 0 }}
                onMouseEnter={e => { if (!discSubmitting) e.currentTarget.style.color = "#64748b" }}
                onMouseLeave={e => { if (!discSubmitting) e.currentTarget.style.color = "#94a3b8" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Discrepancy Type *</label>
              <div style={{ position: "relative" }}>
                <ModernInput as="select" value={discType} onChange={e => { setDiscType(e.target.value as 'shortage' | 'caked'); setDiscError("") }} style={{ padding: "12px 14px", borderRadius: 8, border: "1px solid #e0e0e0", fontSize: FONT_SIZE.base, background: "white", color: "#171717", minHeight: 40, width: "100%", boxSizing: "border-box" }}>
                  <option value="shortage">Shortage (Missing Bags)</option>
                  <option value="caked">Caked Bags</option>
                </ModernInput>
              </div>
            </div>

            {discType === 'shortage' && (
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Shortage (bags) *</label>
                <p style={{ margin: "0 0 6px", fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Will be deducted from remaining</p>
                <ModernInput type="number" placeholder="0" value={discShortage} onChange={e => { setDiscShortage(e.target.value); setDiscError("") }} style={{ padding: "12px 14px", borderRadius: 8, border: "1px solid #e0e0e0", fontSize: FONT_SIZE.base, background: "white", color: "#171717", minHeight: 40, width: "100%", boxSizing: "border-box" }} />
              </div>
            )}

            {discType === 'caked' && (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>No. of Caked Bags *</label>
                <ModernInput type="number" placeholder="0" value={discCaked} onChange={e => { setDiscCaked(e.target.value); setDiscError("") }} style={{ padding: "12px 14px", borderRadius: 8, border: "1px solid #e0e0e0", fontSize: FONT_SIZE.base, background: "white", color: "#171717", minHeight: 40, width: "100%", boxSizing: "border-box" }} />
              </div>
            )}

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Notes (optional)</label>
              <ModernInput as="textarea" placeholder="Any additional context…" value={discNotes} onChange={e => setDiscNotes(e.target.value)} rows={3} style={{ padding: "12px 14px", borderRadius: 8, border: "1px solid #e0e0e0", fontSize: FONT_SIZE.base, background: "white", color: "#171717", minHeight: 100, width: "100%", boxSizing: "border-box", resize: "none" }} />
            </div>

            {discError && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 16, color: "#b91c1c", fontSize: FONT_SIZE.sm, fontWeight: 600 }}>{discError}</div>}

            {discSuccess && <div style={{ padding: 12, background: "#f0fff4", borderLeft: "4px solid #10b981", borderRadius: 4, marginBottom: 16, color: "#166534", fontSize: FONT_SIZE.sm, fontWeight: 600 }}>{discSuccess}</div>}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={closeDiscModal} disabled={discSubmitting} style={{ padding: "12px 16px", background: "white", border: "1px solid #cbd5e1", color: discSubmitting ? "#cbd5e1" : "#475569", borderRadius: 8, cursor: discSubmitting ? "not-allowed" : "pointer", fontSize: FONT_SIZE.md, minHeight: 44, fontWeight: 700 }}>Cancel</button>
              <button onClick={handleReportDiscrepancy} disabled={discSubmitting} style={{ padding: "12px 16px", background: discSubmitting ? "#94a3b8" : "#f5a623", color: "white", border: "none", borderRadius: 8, cursor: discSubmitting ? "not-allowed" : "pointer", fontWeight: 700, fontSize: FONT_SIZE.md, minHeight: 44, opacity: discSubmitting ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {discSubmitting ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} /> Submitting…</> : "Submit Report"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
