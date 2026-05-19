"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"

type Stop = {
  stop_id: string
  broker_name: string
  customer_name: string
  quantity_offloaded: number
  latitude: number
  longitude: number
  stop_time: string
  stop_location: string
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
  trip_status: string
  created_at: string
  completed_at: string | null
}

const filterOptions = ["Active", "All", "In transit", "On hold", "Completed"]

export default function MonitorTrips() {
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState("Active")
  const [selectedDriver, setSelectedDriver] = useState<Pick<Trip, "driver_name" | "driver_phone" | "driver_status"> | null>(null)
  const [selectedStops, setSelectedStops] = useState<Stop[] | null>(null)
  const [selectedPlate, setSelectedPlate] = useState("")
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  async function fetchTrips() {
    const { data: tripsData, error } = await supabase
      .from("Trips")
      .select("*")
      .order("created_at", { ascending: false })

    if (error || !tripsData) return

    const enriched = await Promise.all(
      tripsData.map(async (trip) => {
        // Fetch driver
        const { data: driver } = await supabase
          .from("Drivers")
          .select("full_name, phone_number, status")
          .eq("driver_id", trip.driver_id)
          .single()

        // Fetch stops with broker and customer names
        const { data: stopsRaw } = await supabase
          .from("Stops")
          .select("stop_id, quantity_offloaded, latitude, longitude, stop_time, stop_location, broker_id, customer_id")
          .eq("trip_id", trip.trip_id)
          .order("stop_time", { ascending: true })

        const stops: Stop[] = await Promise.all(
          (stopsRaw || []).map(async (stop) => {
            const { data: broker } = await supabase
              .from("Brokers")
              .select("broker_name")
              .eq("broker_id", stop.broker_id)
              .single()

            const { data: customer } = await supabase
              .from("Customers")
              .select("full_name")
              .eq("customer_id", stop.customer_id)
              .single()

            return {
              stop_id: stop.stop_id,
              broker_name: broker?.broker_name ?? "Unknown",
              customer_name: customer?.full_name ?? "Unknown",
              quantity_offloaded: stop.quantity_offloaded,
              latitude: stop.latitude,
              longitude: stop.longitude,
              stop_time: stop.stop_time,
              stop_location: stop.stop_location,
            }
          })
        )

        const totalOffloaded = stops.reduce((sum, s) => sum + s.quantity_offloaded, 0)

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
          remaining: trip.loaded_quantity - totalOffloaded,
          stop_count: stops.length,
          stops,
          trip_status: trip.trip_status,
          created_at: trip.created_at,
          completed_at: trip.trip_status === "Completed" ? trip.updated_at ?? null : null,
        }
      })
    )

    setTrips(enriched)
    setLastUpdated(new Date())
    setLoading(false)
  }

  useEffect(() => {
    fetchTrips()
    const interval = setInterval(fetchTrips, 30000)
    return () => clearInterval(interval)
  }, [])

  const filteredTrips = filterStatus === "All"
    ? trips
    : filterStatus === "Active"
    ? trips.filter((t) => t.trip_status === "In transit" || t.trip_status === "On hold")
    : trips.filter((t) => t.trip_status === filterStatus)

  const statusColor = (status: string) => {
    switch (status) {
      case "In transit": return { bg: "#0070f322", color: "#0070f3" }
      case "On hold": return { bg: "#f5a62322", color: "#f5a623" }
      case "Completed": return { bg: "#00aa0022", color: "#00aa00" }
      default: return { bg: "#eee", color: "#888" }
    }
  }

  function closeModals() {
    setSelectedDriver(null)
    setSelectedStops(null)
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>Monitor Trips</h2>
        <div style={{ fontSize: 12, color: "#888" }}>
          {lastUpdated && `Updated: ${lastUpdated.toLocaleTimeString()}`}
          <button
            onClick={fetchTrips}
            style={{
              marginLeft: 12, padding: "4px 12px", fontSize: 12,
              cursor: "pointer", borderRadius: 4, border: "1px solid #ddd",
              background: "white"
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Filter Pills */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {filterOptions.map((option) => (
          <button
            key={option}
            onClick={() => setFilterStatus(option)}
            style={{
              padding: "6px 14px", borderRadius: 20, fontSize: 13,
              cursor: "pointer", border: "1px solid #ddd",
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
      {!loading && filteredTrips.length === 0 && (
        <p style={{ color: "#888" }}>No trips found.</p>
      )}

      {!loading && filteredTrips.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#f0f0f0", textAlign: "left" }}>
                <th style={th}>Plate</th>
                <th style={th}>Driver</th>
                <th style={th}>Product</th>
                <th style={th}>Centre</th>
                <th style={th}>Loaded</th>
                <th style={th}>Remaining</th>
                <th style={th}>Stops</th>
                <th style={th}>Status</th>
                <th style={th}>Started</th>
                <th style={th}>Completed</th>
              </tr>
            </thead>
            <tbody>
              {filteredTrips.map((trip) => {
                const { bg, color } = statusColor(trip.trip_status)
                return (
                  <tr key={trip.trip_id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={td}><strong>{trip.plate_number}</strong></td>
                    <td style={td}>
                      <span
                        onClick={() => setSelectedDriver({
                          driver_name: trip.driver_name,
                          driver_phone: trip.driver_phone,
                          driver_status: trip.driver_status,
                        })}
                        style={{ color: "#0070f3", cursor: "pointer", textDecoration: "underline" }}
                      >
                        {trip.driver_name}
                      </span>
                    </td>
                    <td style={td}>{trip.product}</td>
                    <td style={td}>{trip.material_centre}</td>
                    <td style={td}>{trip.loaded_quantity} bags</td>
                    <td style={td}>
                      <span style={{
                        fontWeight: "bold",
                        color: trip.remaining === 0 ? "red" : trip.remaining < trip.loaded_quantity * 0.2 ? "orange" : "green"
                      }}>
                        {trip.remaining} bags
                      </span>
                    </td>
                    <td style={td}>
                      <span
                        onClick={() => {
                          setSelectedStops(trip.stops)
                          setSelectedPlate(trip.plate_number)
                        }}
                        style={{ color: "#0070f3", cursor: "pointer", textDecoration: "underline" }}
                      >
                        {trip.stop_count} {trip.stop_count === 1 ? "stop" : "stops"}
                      </span>
                    </td>
                    <td style={td}>
                      <span style={{
                        padding: "4px 10px", borderRadius: 12, fontSize: 12,
                        background: bg, color, fontWeight: "bold"
                      }}>
                        {trip.trip_status}
                      </span>
                    </td>
                    <td style={td}>{new Date(trip.created_at).toLocaleString()}</td>
                    <td style={td}>
                      {trip.completed_at
                        ? new Date(trip.completed_at).toLocaleString()
                        : "—"}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Overlay */}
      {(selectedDriver || selectedStops) && (
        <div
          onClick={closeModals}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 100
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white", borderRadius: 12, padding: 32,
              width: 480, maxWidth: "90vw", maxHeight: "80vh",
              overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.2)"
            }}
          >

            {/* Driver Modal */}
            {selectedDriver && (
              <>
                <h3 style={{ marginBottom: 20 }}>Driver Info</h3>
                <p style={{ marginBottom: 12 }}>
                  <strong>Name:</strong> {selectedDriver.driver_name}
                </p>
                <p style={{ marginBottom: 12 }}>
                  <strong>Phone:</strong> {selectedDriver.driver_phone}
                </p>
                <p style={{ marginBottom: 24 }}>
                  <strong>Status:</strong> {selectedDriver.driver_status}
                </p>
                <button
                  onClick={closeModals}
                  style={{
                    width: "100%", padding: "10px 0", background: "#0070f3",
                    color: "white", border: "none", borderRadius: 6, cursor: "pointer"
                  }}
                >
                  Close
                </button>
              </>
            )}

            {/* Stops Modal */}
            {selectedStops && (
              <>
                <h3 style={{ marginBottom: 20 }}>Stops — {selectedPlate}</h3>
                {selectedStops.length === 0 && (
                  <p style={{ color: "#888" }}>No stops logged yet.</p>
                )}
                {selectedStops.map((stop, index) => (
                  <div
                    key={stop.stop_id}
                    style={{
                      marginBottom: 16, padding: 16,
                      border: "1px solid #eee", borderRadius: 8
                    }}
                  >
                    <p style={{ fontWeight: "bold", marginBottom: 8 }}>Stop {index + 1}</p>
                    <p style={{ marginBottom: 6 }}><strong>Broker:</strong> {stop.broker_name}</p>
                    <p style={{ marginBottom: 6 }}><strong>Customer:</strong> {stop.customer_name}</p>
                    <p style={{ marginBottom: 6 }}><strong>Bags Offloaded:</strong> {stop.quantity_offloaded}</p>
                    <p style={{ marginBottom: 6 }}><strong>Location:</strong> {stop.stop_location}</p>
                    <p style={{ marginBottom: 6 }}>
                      <strong>GPS: </strong>
                      <a
                        href={`https://www.google.com/maps?q=${stop.latitude},${stop.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#0070f3" }}
                      >
                        View on Maps 📍
                      </a>
                    </p>
                    <p style={{ marginBottom: 0, color: "#888", fontSize: 12 }}>
                      {new Date(stop.stop_time).toLocaleString()}
                    </p>
                  </div>
                ))}
                <button
                  onClick={closeModals}
                  style={{
                    width: "100%", padding: "10px 0", background: "#0070f3",
                    color: "white", border: "none", borderRadius: 6,
                    cursor: "pointer", marginTop: 8
                  }}
                >
                  Close
                </button>
              </>
            )}

          </div>
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = {
  padding: "12px 16px", fontWeight: "bold", fontSize: 13
}

const td: React.CSSProperties = {
  padding: "12px 16px"
}