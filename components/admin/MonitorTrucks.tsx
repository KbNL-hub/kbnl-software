"use client"

import { useState, useEffect } from "react"
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

export default function MonitorTrucks() {
  const [trucks, setTrucks] = useState<ActiveTruck[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [filterStatus, setFilterStatus] = useState("All")

  // Route editing
  const [editingRoute, setEditingRoute] = useState<ActiveTruck | null>(null)
  const [routePoints, setRoutePoints] = useState<string[]>([])
  const [newPoint, setNewPoint] = useState("")
  const [routeSaving, setRouteSaving] = useState(false)

  async function fetchActiveTrucks() {
    const { data: trips } = await supabase
      .from("Trips")
      .select("trip_id, plate_number, loaded_quantity, trip_status, driver_id, route_points")
      .in("trip_status", ["In transit", "On hold"])

    if (!trips) return

    const enriched = await Promise.all(trips.map(async (trip) => {
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
    }))

    setTrucks(enriched)
    setLastUpdated(new Date())
    setLoading(false)
  }

  useEffect(() => {
    fetchActiveTrucks()
    const interval = setInterval(fetchActiveTrucks, 30000)
    return () => clearInterval(interval)
  }, [])

  function openRouteEditor(truck: ActiveTruck) {
    setEditingRoute(truck)
    setRoutePoints([...truck.route_points])
    setNewPoint("")
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
    await supabase
      .from("Trips")
      .update({ route_points: routePoints })
      .eq("trip_id", editingRoute.trip_id)
    setRouteSaving(false)
    setEditingRoute(null)
    fetchActiveTrucks()
  }

  const filterOptions = ["All", "In transit", "On hold"]
  const filteredTrucks = filterStatus === "All"
    ? trucks
    : trucks.filter(t => t.trip_status === filterStatus)

  const statusColor = (status: string) =>
    status === "In transit" ? "#0070f3" : "#f5a623"

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>Monitor Trucks</h2>
        <div style={{ fontSize: 12, color: "#888", display: "flex", alignItems: "center", gap: 12 }}>
          {lastUpdated && `Last updated: ${lastUpdated.toLocaleTimeString()}`}
          <button
            onClick={fetchActiveTrucks}
            style={{ padding: "4px 12px", fontSize: 12, cursor: "pointer", borderRadius: 4, border: "1px solid #ddd", background: "white" }}
          >
            Refresh
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {filterOptions.map(option => (
          <button
            key={option}
            onClick={() => setFilterStatus(option)}
            style={{
              padding: "6px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer",
              border: "1px solid #ddd",
              background: filterStatus === option ? "#0070f3" : "white",
              color: filterStatus === option ? "white" : "#333",
              fontWeight: filterStatus === option ? "bold" : "normal"
            }}
          >
            {option}
          </button>
        ))}
      </div>

      {loading && <p style={{ color: "#888" }}>Loading...</p>}
      {!loading && trucks.length === 0 && <p style={{ color: "#888" }}>No trucks currently active.</p>}

      {!loading && trucks.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#f0f0f0", textAlign: "left" }}>
                <th style={th}>Truck</th>
                <th style={th}>Driver</th>
                <th style={th}>Phone</th>
                <th style={th}>Loaded</th>
                <th style={th}>Remaining</th>
                <th style={th}>Status</th>
                <th style={th}>Route</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTrucks.map(truck => (
                <tr key={truck.trip_id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={td}>
                    <strong>{truck.plate_number}</strong>
                    {truck.kbnl_truck_no && (
                      <span style={{ marginLeft: 6, fontSize: 12, color: "#888" }}>· #{truck.kbnl_truck_no}</span>
                    )}
                  </td>
                  <td style={td}>{truck.driver_name}</td>
                  <td style={td}>{truck.driver_phone}</td>
                  <td style={td}>{truck.loaded_quantity} bags</td>
                  <td style={td}>
                    <span style={{
                      fontWeight: "bold",
                      color: truck.remaining === 0 ? "red" : truck.remaining < truck.loaded_quantity * 0.2 ? "orange" : "green"
                    }}>
                      {truck.remaining} bags
                    </span>
                  </td>
                  <td style={td}>
                    <span style={{
                      padding: "4px 10px", borderRadius: 12, fontSize: 12, fontWeight: "bold",
                      background: statusColor(truck.trip_status) + "22",
                      color: statusColor(truck.trip_status)
                    }}>
                      {truck.trip_status}
                    </span>
                  </td>
                  <td style={td}>
                    {truck.route_points.length > 0
                      ? <span style={{ fontSize: 12, color: "#555" }}>{truck.route_points.join(" → ")}</span>
                      : <span style={{ fontSize: 12, color: "#bbb" }}>No route set</span>
                    }
                  </td>
                  <td style={td}>
                    <button
                      onClick={() => openRouteEditor(truck)}
                      style={{
                        padding: "6px 12px", cursor: "pointer", borderRadius: 4,
                        border: "1px solid #0070f3", color: "#0070f3",
                        background: "white", fontSize: 12
                      }}
                    >
                      {truck.route_points.length > 0 ? "Edit Route" : "Set Route"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Route Editor Modal */}
      {editingRoute && (
        <div
          onClick={() => setEditingRoute(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: "white", borderRadius: 12, padding: 32, width: 440, maxWidth: "90vw", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}
          >
            <h3 style={{ marginBottom: 4 }}>Set Route</h3>
            <p style={{ color: "#888", fontSize: 13, marginBottom: 20 }}>
              {editingRoute.plate_number}{editingRoute.kbnl_truck_no ? ` · #${editingRoute.kbnl_truck_no}` : ""}
            </p>

            {/* Current points */}
            {routePoints.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontWeight: "bold", fontSize: 13, marginBottom: 8 }}>Route Points</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {routePoints.map((point, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#f9f9f9", borderRadius: 6, border: "1px solid #eee" }}>
                      <span style={{ fontSize: 12, color: "#aaa", minWidth: 20 }}>{i + 1}.</span>
                      <span style={{ flex: 1, fontSize: 14 }}>{point}</span>
                      <button
                        onClick={() => removePoint(i)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#ff4444", fontSize: 16, lineHeight: 1 }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                {routePoints.length > 1 && (
                  <p style={{ fontSize: 12, color: "#888", marginTop: 8 }}>
                    {routePoints.join(" → ")}
                  </p>
                )}
              </div>
            )}

            {/* Add point */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ fontWeight: "bold", display: "block", marginBottom: 6, fontSize: 14 }}>Add a Point</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  placeholder="e.g. Ikom"
                  value={newPoint}
                  onChange={e => setNewPoint(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addPoint() }}
                  style={{ flex: 1, padding: 10, borderRadius: 6, border: "1px solid #ddd", fontSize: 14 }}
                  autoFocus
                />
                <button
                  onClick={addPoint}
                  style={{ padding: "10px 16px", background: "#0070f3", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold" }}
                >
                  Add
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setEditingRoute(null)}
                style={{ flex: 1, padding: "10px 0", background: "white", border: "1px solid #ddd", borderRadius: 6, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={saveRoute}
                disabled={routeSaving}
                style={{ flex: 1, padding: "10px 0", background: "#0070f3", color: "white", border: "none", borderRadius: 6, cursor: routeSaving ? "not-allowed" : "pointer", fontWeight: "bold" }}
              >
                {routeSaving ? "Saving..." : "Save Route"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = { padding: "12px 16px", fontWeight: "bold", fontSize: 13 }
const td: React.CSSProperties = { padding: "12px 16px" }