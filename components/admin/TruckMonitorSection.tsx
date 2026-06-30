"use client"

import { useState, useEffect, useRef } from "react"
import { supabase } from "@/lib/supabase"

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
    return { bg: "#111", textColor: "white", borderColor: "#111" }
  } else if (filter === "In transit") {
    return { bg: "#ebf8ff", textColor: "#0070f3", borderColor: "#0070f3" }
  } else if (filter === "On hold") {
    return { bg: "#fffbeb", textColor: "#f5a623", borderColor: "#f5a623" }
  }
  return { bg: "white", textColor: "#64748b", borderColor: "#e2e8f0" }
}

const fontSize = {
  xs: 12, sm: 13, base: 14, md: 15, lg: 16, xl: 20, "2xl": 24, "3xl": 28,
}

const statusColor = (status: string) =>
  status === "In transit" ? "#0070f3" :
  status === "On hold" ? "#f5a623" :
  status === "Completed" ? "#10b981" : "#64748b"

const remainingColor = (remaining: number, loaded: number) => {
  if (remaining === 0) return "#ef4444"
  if (remaining < loaded * 0.2) return "#f59e0b"
  return "#10b981"
}

type Props = {
  plates?: string[]
}

export default function TruckMonitorSection({ plates }: Props) {
  const { isMobile } = useBreakpoint()
  const [trucks, setTrucks] = useState<ActiveTruck[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [filterStatus, setFilterStatus] = useState("All")
  const [viewMode, setViewMode] = useState<ViewMode>("card")

  const lastSaveTimeRef = useRef(0)

  const filterOptions = ["All", "In transit", "On hold"]

  async function fetchActiveTrucks() {
    let query = supabase
      .from("Trips")
      .select("trip_id, plate_number, loaded_quantity, trip_status, driver_id, route_points")
      .in("trip_status", ["In transit", "On hold"])

    if (plates && plates.length > 0) {
      query = query.in("plate_number", plates)
    }

    const { data: trips } = await query

    if (!trips) {
      setTrucks([])
      setLoading(false)
      return
    }

    const enriched = await Promise.all(
      trips
        .filter(t => t.driver_id)
        .map(async (trip) => {
          const { data: driver } = await supabase
            .from("Drivers").select("full_name, phone_number").eq("driver_id", trip.driver_id).single()

          const { data: truck } = await supabase
            .from("Trucks").select("kbnl_truck_no").eq("plate_number", trip.plate_number).single()

          const { data: stops } = await supabase
            .from("Stops").select("quantity_offloaded").eq("trip_id", trip.trip_id)

          const totalOffloaded = stops?.reduce((sum, s) => sum + (s.quantity_offloaded || 0), 0) ?? 0

          return {
            trip_id: trip.trip_id,
            plate_number: trip.plate_number,
            kbnl_truck_no: truck?.kbnl_truck_no ?? null,
            loaded_quantity: trip.loaded_quantity,
            remaining: trip.loaded_quantity - totalOffloaded,
            driver_name: driver?.full_name ?? "Unknown",
            driver_phone: driver?.phone_number ?? "—",
            trip_status: trip.trip_status,
            route_points: trip.route_points ?? [],
          }
        })
    )

    setTrucks(enriched)
    setLastUpdated(new Date())
    setLoading(false)
  }

  useEffect(() => {
    fetchActiveTrucks()

    const subscription = supabase
      .channel("truck-monitor-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "Trips" }, () => {
        if (Date.now() - lastSaveTimeRef.current > 2000) {
          fetchActiveTrucks()
        }
      })
      .subscribe()

    const interval = setInterval(fetchActiveTrucks, 30000)
    return () => {
      clearInterval(interval)
      subscription.unsubscribe()
    }
  }, [plates?.join(",")])

  const filteredTrucks = filterStatus === "All"
    ? trucks
    : trucks.filter(t => t.trip_status === filterStatus)

  return (
    <div>
      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        {trucks.length > 0 && (
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
          onClick={fetchActiveTrucks}
          style={{
            padding: "8px 12px", background: "white", color: "#64748b",
            border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer",
            fontSize: fontSize.xs, fontWeight: 500, minHeight: 40, minWidth: 40,
            display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1" }}
          onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#e2e8f0" }}
          title="Refresh"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36M20.49 15a9 9 0 0 1-14.85 3.36"/></svg>
        </button>
      </div>

      {lastUpdated && (
        <p style={{ margin: "0 0 16px 0", color: "#94a3b8", fontSize: fontSize.xs }}>
          Last updated: {lastUpdated.toLocaleTimeString()}
        </p>
      )}

      {/* Filter Pills */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
        {filterOptions.map(option => {
          const isActive = filterStatus === option
          const pill = getPillStyle(option, isActive)
          return (
            <button
              key={option}
              onClick={() => setFilterStatus(option)}
              style={{
                padding: "8px 14px", borderRadius: 20, fontSize: fontSize.sm, cursor: "pointer",
                border: `1.5px solid ${pill.borderColor}`, background: pill.bg,
                color: pill.textColor, fontWeight: isActive ? 600 : 500, transition: "all 0.2s",
              }}
              onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1" } }}
              onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#e2e8f0" } }}
            >
              {option}
            </button>
          )
        })}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "64px 0" }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid #e2e8f0", borderTopColor: "#0070f3", animation: "spin 1s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : filteredTrucks.length === 0 ? (
        <div style={{ textAlign: "center", padding: "64px 24px", background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)" }}>
          <div style={{ width: 64, height: 64, background: "#f1f5f9", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2"/></svg>
          </div>
          <h3 style={{ margin: "0 0 8px", color: "#0f172a", fontSize: fontSize.xl, fontWeight: 600 }}>No trucks found</h3>
          <p style={{ color: "#64748b", fontSize: fontSize.base, margin: 0 }}>
            {filterStatus === "All" ? "No trucks are currently active." : `No trucks with status "${filterStatus}".`}
          </p>
        </div>
      ) : (
        <>
          {/* Card View */}
          {viewMode === "card" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {filteredTrucks.map((truck) => (
                <div key={truck.trip_id} style={{ background: "white", borderRadius: 12, padding: 16, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)", transition: "all 0.2s ease" }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.08)"; e.currentTarget.style.borderColor = "#cbd5e1" }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.05)"; e.currentTarget.style.borderColor = "#e2e8f0" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <h3 style={{ margin: 0, color: "#0f172a", fontSize: fontSize.lg, fontWeight: 600 }}>{truck.plate_number}</h3>
                        {truck.kbnl_truck_no && (
                          <span style={{ color: "#94a3b8", fontSize: fontSize.xs }}>· #{truck.kbnl_truck_no}</span>
                        )}
                      </div>
                      <p style={{ margin: 0, color: "#64748b", fontSize: fontSize.sm }}>{truck.driver_name}</p>
                    </div>
                    <span style={{
                      padding: "6px 12px", borderRadius: 16, fontSize: fontSize.xs, fontWeight: 600,
                      background: truck.trip_status === "In transit" ? "#ebf8ff" : "#fffbeb",
                      color: statusColor(truck.trip_status),
                      border: `1.5px solid ${statusColor(truck.trip_status)}`, whiteSpace: "nowrap",
                    }}>
                      {truck.trip_status}
                    </span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12, padding: "12px 0", borderTop: "1px solid #f1f5f9", borderBottom: "1px solid #f1f5f9" }}>
                    <div>
                      <p style={{ margin: "0 0 4px 0", color: "#94a3b8", fontSize: fontSize.xs }}>Loaded</p>
                      <p style={{ margin: 0, color: "#0f172a", fontSize: fontSize.lg, fontWeight: 600 }}>{truck.loaded_quantity} bags</p>
                    </div>
                    <div>
                      <p style={{ margin: "0 0 4px 0", color: "#94a3b8", fontSize: fontSize.xs }}>Remaining</p>
                      <p style={{ margin: 0, color: remainingColor(truck.remaining, truck.loaded_quantity), fontSize: fontSize.lg, fontWeight: 600 }}>{truck.remaining} bags</p>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div>
                      <p style={{ margin: "0 0 4px 0", color: "#94a3b8", fontSize: fontSize.xs }}>Route</p>
                      {truck.route_points.length > 0 ? (
                        <p style={{ margin: 0, color: "#0f172a", fontSize: fontSize.sm, wordBreak: "break-word" }}>{truck.route_points.join(" → ")}</p>
                      ) : (
                        <p style={{ margin: 0, color: "#cbd5e1", fontSize: fontSize.sm, fontStyle: "italic" }}>No route set</p>
                      )}
                    </div>
                    <div>
                      <p style={{ margin: "0 0 4px 0", color: "#94a3b8", fontSize: fontSize.xs }}>Driver Contact</p>
                      <p style={{ margin: 0, color: "#0f172a", fontSize: fontSize.sm }}>{truck.driver_phone}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Table View */}
          {viewMode === "table" && (
            <div style={{ background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: fontSize.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Truck</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: fontSize.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Driver</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: fontSize.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Contact</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: fontSize.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Loaded</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: fontSize.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Remaining</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: fontSize.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Status</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: fontSize.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Route</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTrucks.map((truck, idx) => (
                    <tr key={truck.trip_id} style={{ borderBottom: idx === filteredTrucks.length - 1 ? "none" : "1px solid #e2e8f0", transition: "background 0.2s ease" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <td style={{ padding: "12px 16px" }}>
                        <strong style={{ color: "#0f172a", fontSize: fontSize.base }}>{truck.plate_number}</strong>
                        {truck.kbnl_truck_no && <div style={{ fontSize: fontSize.xs, color: "#94a3b8", marginTop: 2 }}>#{truck.kbnl_truck_no}</div>}
                      </td>
                      <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: fontSize.base }}>{truck.driver_name}</td>
                      <td style={{ padding: "12px 16px", color: "#64748b", fontSize: fontSize.sm }}>{truck.driver_phone}</td>
                      <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: fontSize.base, fontWeight: 500 }}>{truck.loaded_quantity}</td>
                      <td style={{ padding: "12px 16px", color: remainingColor(truck.remaining, truck.loaded_quantity), fontSize: fontSize.base, fontWeight: 600 }}>{truck.remaining}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{
                          padding: "6px 10px", borderRadius: 14, fontSize: fontSize.xs, fontWeight: 600,
                          background: truck.trip_status === "In transit" ? "#ebf8ff" : "#fffbeb",
                          color: statusColor(truck.trip_status), border: `1.5px solid ${statusColor(truck.trip_status)}`,
                        }}>
                          {truck.trip_status}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", color: truck.route_points.length > 0 ? "#0f172a" : "#cbd5e1", fontSize: fontSize.sm }}>
                        {truck.route_points.length > 0 ? truck.route_points.join(" → ") : "No route"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
