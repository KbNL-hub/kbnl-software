"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"

type ActiveTruck = {
  trip_id: string
  plate_number: string
  loaded_quantity: number
  remaining: number
  driver_name: string
  driver_phone: string
  trip_status: string
}

export default function MonitorTrucks() {
  const [trucks, setTrucks] = useState<ActiveTruck[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [filterStatus, setFilterStatus] = useState("All")

  async function fetchActiveTrucks() {
    // Fetch active trips with driver info
    const { data: trips, error: tripsError } = await supabase
      .from("Trips")
      .select("trip_id, plate_number, loaded_quantity, trip_status, driver_id")
      .in("trip_status", ["In transit", "On hold"])

    if (tripsError || !trips) return

    // For each trip, fetch driver info and sum of stops
    const enriched = await Promise.all(
      trips.map(async (trip) => {
        // Get driver name and phone
        const { data: driver } = await supabase
          .from("Drivers")
          .select("full_name, phone_number")
          .eq("driver_id", trip.driver_id)
          .single()

        // Get total offloaded for this trip
        const { data: stops } = await supabase
          .from("Stops")
          .select("quantity_offloaded")
          .eq("trip_id", trip.trip_id)

        const totalOffloaded = stops?.reduce(
          (sum, stop) => sum + (stop.quantity_offloaded || 0), 0
        ) ?? 0

        return {
          trip_id: trip.trip_id,
          plate_number: trip.plate_number,
          loaded_quantity: trip.loaded_quantity,
          remaining: trip.loaded_quantity - totalOffloaded,
          driver_name: driver?.full_name ?? "Unknown",
          driver_phone: driver?.phone_number ?? "—",
          trip_status: trip.trip_status,
        }
      })
    )

    setTrucks(enriched)
    setLastUpdated(new Date())
    setLoading(false)
  }

  useEffect(() => {
    fetchActiveTrucks()
    const interval = setInterval(fetchActiveTrucks, 30000)
    return () => clearInterval(interval)
  }, [])

  const filterOptions = ["All", "In transit", "On hold"]

  const filteredTrucks = filterStatus === "All"
    ? trucks
    : trucks.filter((t) => t.trip_status === filterStatus)

  const statusColor = (status: string) =>
    status === "In transit" ? "#0070f3" : "#f5a623"

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>Monitor Trucks</h2>
        <div style={{ fontSize: 12, color: "#888" }}>
          {lastUpdated && `Last updated: ${lastUpdated.toLocaleTimeString()}`}
          <button
            onClick={fetchActiveTrucks}
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

      {!loading && trucks.length === 0 && (
        <p style={{ color: "#888" }}>No trucks currently active.</p>
      )}
       

      {!loading && trucks.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#f0f0f0", textAlign: "left" }}>
                <th style={th}>Plate Number</th>
                <th style={th}>Driver</th>
                <th style={th}>Phone</th>
                <th style={th}>Loaded</th>
                <th style={th}>Remaining</th>
                <th style={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredTrucks.map((truck) => (
                <tr key={truck.trip_id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={td}><strong>{truck.plate_number}</strong></td>
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
                      padding: "4px 10px", borderRadius: 12, fontSize: 12,
                      background: statusColor(truck.trip_status) + "22",
                      color: statusColor(truck.trip_status),
                      fontWeight: "bold"
                    }}>
                      {truck.trip_status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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