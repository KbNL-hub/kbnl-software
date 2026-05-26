"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import ReassignBroker from "@/components/admin/ReassignBroker"

type Stop = {
  stop_id: string
  broker_name: string
  customer_name: string
  quantity_offloaded: number
  latitude: number
  longitude: number
  stop_time: string
  stop_location: string
  confirmed: boolean
  disputed: boolean
  dispute_reason: string | null
}

type Discrepancy = {
  discrepancy_id: string
  shortage: number
  caked_bags: number
  notes: string | null
  reported_at: string
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
  trip_status: string
  atc: string | null
  created_at: string
  completed_at: string | null
}

const filterOptions = ["Active", "All", "In transit", "On hold", "Completed", "Disputed"]

export default function MonitorTrips() {
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState("Active")
  const [selectedDriver, setSelectedDriver] = useState<Pick<Trip, "driver_name" | "driver_phone" | "driver_status"> | null>(null)
  const [selectedStops, setSelectedStops] = useState<Stop[] | null>(null)
  const [selectedDiscrepancies, setSelectedDiscrepancies] = useState<Discrepancy[]>([])
  const [selectedPlate, setSelectedPlate] = useState("")
  const [selectedTrip, setSelectedTrip] = useState<Pick<Trip, "trip_id" | "plate_number" | "atc" | "trip_status"> | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [endingTrip, setEndingTrip] = useState<string | null>(null)
  const [endTripError, setEndTripError] = useState<string | null>(null)
  const [endTripLoading, setEndTripLoading] = useState(false)

  async function fetchTrips() {
    const { data: tripsData, error } = await supabase
      .from("Trips")
      .select("*")
      .order("created_at", { ascending: false })

    if (error || !tripsData) return

    const enriched = await Promise.all(
      tripsData.map(async (trip) => {
        const { data: driver } = await supabase
          .from("Drivers")
          .select("full_name, phone_number, status")
          .eq("driver_id", trip.driver_id)
          .single()

        const { data: stopsRaw } = await supabase
          .from("Stops")
          .select("stop_id, quantity_offloaded, latitude, longitude, stop_time, stop_location, broker_id, customer_id, confirmed, disputed, dispute_reason")
          .eq("trip_id", trip.trip_id)
          .order("stop_time", { ascending: true })

        const stops: Stop[] = await Promise.all(
          (stopsRaw || []).map(async (stop) => {
            const { data: broker } = await supabase
              .from("Brokers")
              .select("broker_name")
              .eq("broker_id", stop.broker_id)
              .single()

            let customer = null
            if (stop.customer_id) {
              const { data: customerData } = await supabase
                .from("Customers")
                .select("full_name")
                .eq("customer_id", stop.customer_id)
                .single()
              customer = customerData
            }

            return {
              stop_id: stop.stop_id,
              broker_name: broker?.broker_name ?? "Unknown",
              customer_name: customer?.full_name ?? "Not provided",
              quantity_offloaded: stop.quantity_offloaded,
              latitude: stop.latitude,
              longitude: stop.longitude,
              stop_time: stop.stop_time,
              stop_location: stop.stop_location,
              confirmed: stop.confirmed,
              disputed: stop.disputed,
              dispute_reason: stop.dispute_reason
            }
          })
        )

        // Fetch discrepancies
        const { data: discRaw } = await supabase
          .from("trip_discrepancies")
          .select("discrepancy_id, shortage, caked_bags, notes, reported_at")
          .eq("trip_id", trip.trip_id)
          .order("reported_at", { ascending: true })

        const discrepancies: Discrepancy[] = discRaw || []

        const totalOffloaded = stops.reduce((sum, s) => sum + s.quantity_offloaded, 0)
        const totalShortage = discrepancies.reduce((sum, d) => sum + (d.shortage || 0), 0)

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
          remaining: trip.loaded_quantity - totalOffloaded - totalShortage,
          stop_count: stops.length,
          stops,
          discrepancies,
          trip_status: trip.trip_status,
          atc: trip.ATC ?? null,
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

    await supabase.from("Trips").update({ trip_status: "Completed" }).eq("trip_id", endingTrip)
    await supabase.from("Trucks").update({ status: "Empty" }).eq("plate_number", selectedTrip.plate_number)

    setEndTripLoading(false)
    setEndingTrip(null)
    setSelectedStops(null)
    setSelectedTrip(null)
    fetchTrips()
  }

  const filteredTrips = filterStatus === "All"
    ? trips
    : filterStatus === "Active"
    ? trips.filter((t) => t.trip_status === "In transit" || t.trip_status === "On hold")
    : filterStatus === "Disputed"
    ? trips.filter((t) => t.stops.some((s) => s.disputed))
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
    setSelectedDiscrepancies([])
    setEndTripError(null)
    setEndingTrip(null)
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>Monitor Trips</h2>
        <div style={{ fontSize: 12, color: "#888" }}>
          {lastUpdated && `Updated: ${lastUpdated.toLocaleTimeString()}`}
          <button
            onClick={fetchTrips}
            style={{ marginLeft: 12, padding: "4px 12px", fontSize: 12, cursor: "pointer", borderRadius: 4, border: "1px solid #ddd", background: "white" }}
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
      {!loading && filteredTrips.length === 0 && <p style={{ color: "#888" }}>No trips found.</p>}

      {!loading && filteredTrips.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#f0f0f0", textAlign: "left" }}>
                <th style={th}>Plate</th>
                <th style={th}>Driver</th>
                <th style={th}>Product</th>
                <th style={th}>Centre</th>
                <th style={th}>ATC Number</th>
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
                        onClick={() => setSelectedDriver({ driver_name: trip.driver_name, driver_phone: trip.driver_phone, driver_status: trip.driver_status })}
                        style={{ color: "#0070f3", cursor: "pointer", textDecoration: "underline" }}
                      >
                        {trip.driver_name}
                      </span>
                    </td>
                    <td style={td}>{trip.product}</td>
                    <td style={td}>{trip.material_centre}</td>
                    <td style={td}>{trip.atc || "N/A"}</td>
                    <td style={td}>{trip.loaded_quantity} bags</td>
                    <td style={td}>
                      <span style={{ fontWeight: "bold", color: trip.remaining === 0 ? "red" : trip.remaining < trip.loaded_quantity * 0.2 ? "orange" : "green" }}>
                        {trip.remaining} bags
                      </span>
                    </td>
                    <td style={td}>
                      <span
                        onClick={() => {
                          setSelectedStops(trip.stops)
                          setSelectedDiscrepancies(trip.discrepancies)
                          setSelectedPlate(trip.plate_number)
                          setSelectedTrip({ trip_id: trip.trip_id, plate_number: trip.plate_number, atc: trip.atc, trip_status: trip.trip_status })
                          setEndTripError(null)
                        }}
                        style={{ color: "#0070f3", cursor: "pointer", textDecoration: "underline" }}
                      >
                        {trip.stop_count} {trip.stop_count === 1 ? "stop" : "stops"}
                      </span>
                    </td>
                    <td style={td}>
                      <span style={{ padding: "4px 10px", borderRadius: 12, fontSize: 12, background: bg, color, fontWeight: "bold" }}>
                        {trip.trip_status}
                      </span>
                    </td>
                    <td style={td}>{new Date(trip.created_at).toLocaleString()}</td>
                    <td style={td}>{trip.completed_at ? new Date(trip.completed_at).toLocaleString() : "—"}</td>
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
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "white", borderRadius: 12, padding: 32, width: 480, maxWidth: "90vw", maxHeight: "80vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}
          >
            {/* Driver Modal */}
            {selectedDriver && (
              <>
                <h3 style={{ marginBottom: 20 }}>Driver Info</h3>
                <p style={{ marginBottom: 12 }}><strong>Name:</strong> {selectedDriver.driver_name}</p>
                <p style={{ marginBottom: 12 }}><strong>Phone:</strong> {selectedDriver.driver_phone}</p>
                <p style={{ marginBottom: 24 }}><strong>Status:</strong> {selectedDriver.driver_status}</p>
                <button onClick={closeModals} style={{ width: "100%", padding: "10px 0", background: "#0070f3", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}>
                  Close
                </button>
              </>
            )}

            {/* Stops Modal */}
            {selectedStops && (
              <>
                <h3 style={{ marginBottom: 20 }}>Stops — {selectedPlate}</h3>

                {selectedTrip?.atc && (
                  <div style={{ background: "#fff8e1", border: "1px solid #f5a623", borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
                    <p style={{ margin: 0, fontSize: 13 }}><strong>ATC Number:</strong> {selectedTrip.atc}</p>
                  </div>
                )}

                {selectedStops.length === 0 && selectedDiscrepancies.length === 0 && (
                  <p style={{ color: "#888" }}>No stops logged yet.</p>
                )}

                {/* Stop cards */}
                {selectedStops.map((stop, index) => (
                  <div
                    key={stop.stop_id}
                    style={{
                      marginBottom: 16, padding: 16,
                      border: `1px solid ${stop.disputed ? "#ff4444" : stop.confirmed ? "#00aa00" : "#eee"}`,
                      borderRadius: 8, background: stop.disputed ? "#fff5f5" : "white"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <p style={{ fontWeight: "bold", margin: 0 }}>Stop {index + 1}</p>
                      <span style={{
                        padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: "bold",
                        background: stop.disputed ? "#ff444422" : stop.confirmed ? "#00aa0022" : "#f0f0f0",
                        color: stop.disputed ? "#ff4444" : stop.confirmed ? "#00aa00" : "#888"
                      }}>
                        {stop.disputed ? "Disputed" : stop.confirmed ? "Confirmed" : "Pending"}
                      </span>
                    </div>
                    <p style={{ marginBottom: 6 }}><strong>Broker:</strong> {stop.broker_name}</p>
                    <p style={{ marginBottom: 6 }}><strong>Customer:</strong> {stop.customer_name}</p>
                    <p style={{ marginBottom: 6 }}><strong>Bags Offloaded:</strong> {stop.quantity_offloaded}</p>
                    <p style={{ marginBottom: 6 }}><strong>Location:</strong> {stop.stop_location}</p>
                    <p style={{ marginBottom: 6 }}>
                      <strong>GPS: </strong>
                      <a href={`https://www.google.com/maps?q=${stop.latitude},${stop.longitude}`} target="_blank" rel="noopener noreferrer" style={{ color: "#0070f3" }}>
                        View on Maps 📍
                      </a>
                    </p>
                    {stop.disputed && stop.dispute_reason && (
                      <div style={{ marginTop: 8, padding: 10, background: "#fff0f0", borderRadius: 6, border: "1px solid #ffcccc" }}>
                        <p style={{ margin: 0, fontSize: 13, color: "#ff4444", fontWeight: "bold" }}>Dispute Reason:</p>
                        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#555" }}>{stop.dispute_reason}</p>
                        <ReassignBroker stopId={stop.stop_id} onReassigned={fetchTrips} />
                      </div>
                    )}
                    <p style={{ marginBottom: 0, color: "#888", fontSize: 12, marginTop: 8 }}>{new Date(stop.stop_time).toLocaleString()}</p>
                  </div>
                ))}

                {/* Discrepancy cards */}
                {selectedDiscrepancies.map((d, index) => (
                  <div
                    key={d.discrepancy_id}
                    style={{ marginBottom: 16, padding: 16, border: "1px solid #f5a62366", borderRadius: 8, background: "#fffbf0" }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <p style={{ fontWeight: "bold", margin: 0 }}>Discrepancy Report {index + 1}</p>
                      <span style={{ padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: "bold", background: "#f5a62322", color: "#f5a623" }}>
                        Reported
                      </span>
                    </div>
                    {d.shortage > 0 && (
                      <p style={{ marginBottom: 6, color: "#ff4444" }}>
                        <strong>Shortage:</strong> {d.shortage} bags
                      </p>
                    )}
                    {d.caked_bags > 0 && (
                      <p style={{ marginBottom: 6, color: "#888" }}>
                        <strong>Caked Bags:</strong> {d.caked_bags} bags (returned to plant)
                      </p>
                    )}
                    {d.notes && (
                      <p style={{ marginBottom: 6, fontSize: 13, color: "#555" }}>
                        <strong>Notes:</strong> {d.notes}
                      </p>
                    )}
                    <p style={{ marginBottom: 0, color: "#888", fontSize: 12, marginTop: 8 }}>{new Date(d.reported_at).toLocaleString()}</p>
                  </div>
                ))}

                {/* End Trip Error */}
                {endTripError && (
                  <div style={{ background: "#fff5f5", border: "1px solid #ffcccc", borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
                    <p style={{ margin: 0, fontSize: 13, color: "#ff4444" }}>{endTripError}</p>
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  {selectedTrip && (selectedTrip.trip_status === "In transit" || selectedTrip.trip_status === "On hold") && (
                    <button
                      onClick={handleEndTripClick}
                      style={{ flex: 1, padding: "10px 0", background: "#ff4444", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold" }}
                    >
                      End Trip
                    </button>
                  )}
                  <button
                    onClick={closeModals}
                    style={{ flex: 1, padding: "10px 0", background: "#0070f3", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* End Trip Confirmation Modal */}
      {endingTrip && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
          <div style={{ background: "white", borderRadius: 12, padding: 32, width: 400, maxWidth: "90vw", boxShadow: "0 8px 32px rgba(0,0,0,0.25)" }}>
            <h3 style={{ marginBottom: 12 }}>End Trip?</h3>
            <p style={{ color: "#555", marginBottom: 24 }}>
              This will mark the trip as <strong>Completed</strong> and set the truck status to <strong>Empty</strong>. This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setEndingTrip(null)} disabled={endTripLoading} style={{ flex: 1, padding: "10px 0", background: "white", border: "1px solid #ddd", borderRadius: 6, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={confirmEndTrip} disabled={endTripLoading} style={{ flex: 1, padding: "10px 0", background: "#ff4444", color: "white", border: "none", borderRadius: 6, cursor: endTripLoading ? "not-allowed" : "pointer", fontWeight: "bold" }}>
                {endTripLoading ? "Ending..." : "Yes, End Trip"}
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