"use client"

import { useState, useEffect, useRef } from "react"
import { supabase } from "@/lib/supabase"
import StopForm from "@/components/StopForm"

type Driver = {
  driver_id: string
  full_name: string
}

type Trip = {
  trip_id: string
  plate_number: string
  product: string
  material_centre: string
  loaded_quantity: number
  trip_status: string
  atc: string | null
}

type Stop = {
  stop_id: string
  stop_location: string
  quantity_offloaded: number
  stop_time: string
}

const materialCentres = [
  "Main Store",
  "Brooks Outlet",
  "Calabar Warehouse",
  "E1 Outlet",
  "Ikom Mini Depot",
  "Ogoja Outlet",
  "Ogoja Warehouse",
  "Reserve Store",
  "Urua Ekpa Outlet",
  "Urua Nyemeiko Outlet",
  "Uyo Warehouse",
]

const products = ["BUA Cement","Dangote 3X", "Dangote Falcon", "Lafarge Classic", "Lafarge Supafix", "Lafarge Supaset"]

export default function DriverDashboard() {
  const [driver, setDriver] = useState<Driver | null>(null)
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null)
  const [stops, setStops] = useState<Stop[]>([])
  const [remaining, setRemaining] = useState(0)
  const [view, setView] = useState<"dashboard" | "start-trip" | "active-trip" | "log-stop">("dashboard")
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState("")
  const [showEndConfirm, setShowEndConfirm] = useState(false)
  const [showHoldConfirm, setShowHoldConfirm] = useState(false)

  // Start trip form
  const [plateNumber, setPlateNumber] = useState("")
  const [product, setProduct] = useState("")
  const [materialCentre, setMaterialCentre] = useState("")
  const [loadedQuantity, setLoadedQuantity] = useState("")
  const [atc, setAtc] = useState("")
  const [trucks, setTrucks] = useState<{ plate_number: string }[]>([])

  const loadedQtyRef = useRef<HTMLInputElement>(null)
  const atcRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    initDriver()
  }, [])

  async function initDriver() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: driverData } = await supabase
      .from("Drivers")
      .select("driver_id, full_name")
      .eq("driver_id", user.id)
      .single()

    if (!driverData) return
    setDriver(driverData)

    // Check for active trip
    const { data: tripData } = await supabase
      .from("Trips")
      .select("*")
      .eq("driver_id", user.id)
      .in("trip_status", ["In transit", "On hold"])
      .single()

    if (tripData) {
      setActiveTrip(tripData)
      await fetchStops(tripData.trip_id, tripData.loaded_quantity)
      setView("active-trip")
    } else {
      setView("dashboard")
    }

    // Fetch available trucks
    const { data: trucksData } = await supabase
      .from("Trucks")
      .select("plate_number")
      .eq("status", "Empty")

    setTrucks(trucksData || [])
    setLoading(false)
  }

  async function fetchStops(tripId: string, loadedQty: number) {
    const { data } = await supabase
      .from("Stops")
      .select("stop_id, stop_location, quantity_offloaded, stop_time")
      .eq("trip_id", tripId)
      .order("stop_time", { ascending: false })

    const stopList = data || []
    setStops(stopList)

    const totalOffloaded = stopList.reduce((sum, s) => sum + s.quantity_offloaded, 0)
    const rem = loadedQty - totalOffloaded
    setRemaining(rem)

    // Auto-end if remaining hits zero
    if (rem === 0 && activeTrip) {
      setShowEndConfirm(true)
    }
  }

  async function handleStartTrip() {
    if (!plateNumber) return setMessage("Select a plate number")
    if (!product) return setMessage("Select a product")
    if (!materialCentre) return setMessage("Select a material centre")
    if (!loadedQuantity) return setMessage("Enter loaded quantity")
    if (materialCentre === "Main Store" && !atc.trim()) return setMessage("ATC number is required for Main Store")

    setSubmitting(true)

    const { data, error } = await supabase
      .from("Trips")
      .insert([{
        driver_id: driver?.driver_id,
        plate_number: plateNumber,
        product,
        material_centre: materialCentre,
        loaded_quantity: parseInt(loadedQuantity),
        atc: materialCentre === "Main Store" ? atc : null,
        trip_status: "In transit",
      }])
      .select()
      .single()

    if (error || !data) {
      setMessage("Failed to start trip")
      setSubmitting(false)
      return
    }

    // Update truck status to Loaded
    await supabase
      .from("Trucks")
      .update({ status: "Loaded" })
      .eq("plate_number", plateNumber)

    setActiveTrip(data)
    setRemaining(parseInt(loadedQuantity))
    setStops([])
    setSubmitting(false)
    setMessage("")
    setView("active-trip")
  }

  async function handleEndTrip() {
    if (!activeTrip) return
    setSubmitting(true)

    await supabase
      .from("Trips")
      .update({ trip_status: "Completed", updated_at: new Date().toISOString() })
      .eq("trip_id", activeTrip.trip_id)

    await supabase
      .from("Trucks")
      .update({ status: "Empty" })
      .eq("plate_number", activeTrip.plate_number)

    setSubmitting(false)
    setShowEndConfirm(false)
    setActiveTrip(null)
    setStops([])
    setRemaining(0)
    setView("dashboard")
  }

  async function handleHoldTrip() {
    if (!activeTrip) return
    setSubmitting(true)

    const newStatus = activeTrip.trip_status === "On hold" ? "In transit" : "On hold"

    await supabase
      .from("Trips")
      .update({ trip_status: newStatus })
      .eq("trip_id", activeTrip.trip_id)

    setActiveTrip({ ...activeTrip, trip_status: newStatus })
    setSubmitting(false)
    setShowHoldConfirm(false)
  }

  function handleStopLogged() {
    if (activeTrip) {
      fetchStops(activeTrip.trip_id, activeTrip.loaded_quantity)
    }
    setView("active-trip")
  }

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <p>Loading...</p>
    </div>
  )

  return (
    <div style={{ fontFamily: "Arial", maxWidth: 480, margin: "0 auto", padding: "24px 16px", minHeight: "100vh" }}>

      {/* Header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 24, paddingBottom: 16, borderBottom: "1px solid #eee"
      }}>
        <div>
          <p style={{ margin: 0, fontSize: 13, color: "#888" }}>Logged in as</p>
          <p style={{ margin: 0, fontWeight: "bold" }}>{driver?.full_name}</p>
          <p style={{ margin: 0, fontSize: 11, color: "#aaa" }}>{driver?.driver_id}</p>
        </div>
        <button
          onClick={async () => { await supabase.auth.signOut(); window.location.href = "/login" }}
          style={{
            padding: "6px 14px", background: "#ff4444", color: "white",
            border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13
          }}
        >
          Logout
        </button>
      </div>

      {/* Dashboard View */}
      {view === "dashboard" && (
        <div style={{ textAlign: "center", paddingTop: 60 }}>
          <h2 style={{ marginBottom: 8 }}>Ready to go?</h2>
          <p style={{ color: "#888", marginBottom: 40 }}>No active trip. Start one below.</p>
          <button
            onClick={() => setView("start-trip")}
            style={{
              padding: "16px 48px", background: "#0070f3", color: "white",
              border: "none", borderRadius: 8, fontSize: 18, cursor: "pointer",
              fontWeight: "bold"
            }}
          >
            Start a Trip
          </button>
        </div>
      )}

      {/* Start Trip View */}
      {view === "start-trip" && (
        <div>
          <button
            onClick={() => { setView("dashboard"); setMessage("") }}
            style={{ background: "none", border: "none", color: "#0070f3", cursor: "pointer", marginBottom: 16, padding: 0 }}
          >
            ← Back
          </button>
          <h2 style={{ marginBottom: 24 }}>Start a Trip</h2>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>Plate Number *</label>
            <select
              value={plateNumber}
              onChange={(e) => { setPlateNumber(e.target.value); setMessage("") }}
              style={{ width: "100%", padding: 10, boxSizing: "border-box" }}
            >
              <option value="">Select plate number</option>
              {trucks.map((t) => (
                <option key={t.plate_number} value={t.plate_number}>{t.plate_number}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>Product *</label>
            <select
              value={product}
              onChange={(e) => { setProduct(e.target.value); setMessage("") }}
              style={{ width: "100%", padding: 10, boxSizing: "border-box" }}
            >
              <option value="">Select product</option>
              {products.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>Material Centre *</label>
            <select
              value={materialCentre}
              onChange={(e) => { setMaterialCentre(e.target.value); setMessage(""); setAtc("") }}
              style={{ width: "100%", padding: 10, boxSizing: "border-box" }}
            >
              <option value="">Select material centre</option>
              {materialCentres.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {materialCentre === "Main Store" && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>ATC Number *</label>
              <input
                ref={atcRef}
                type="text"
                placeholder="Enter ATC number"
                value={atc}
                onChange={(e) => { setAtc(e.target.value); setMessage("") }}
                onKeyDown={(e) => { if (e.key === "Enter") loadedQtyRef.current?.focus() }}
                style={{ width: "100%", padding: 10, boxSizing: "border-box" }}
              />
            </div>
          )}

          <div style={{ marginBottom: 24 }}>
            <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>Loaded Quantity (bags) *</label>
            <input
              ref={loadedQtyRef}
              type="number"
              placeholder="e.g. 600"
              value={loadedQuantity}
              onChange={(e) => { setLoadedQuantity(e.target.value); setMessage("") }}
              onKeyDown={(e) => { if (e.key === "Enter") handleStartTrip() }}
              style={{ width: "100%", padding: 10, boxSizing: "border-box" }}
            />
          </div>

          {message && <p style={{ color: "red", marginBottom: 16, fontWeight: "bold" }}>{message}</p>}

          <button
            onClick={handleStartTrip}
            disabled={submitting}
            style={{
              width: "100%", padding: "14px 0", background: "#0070f3",
              color: "white", border: "none", borderRadius: 8,
              fontSize: 16, cursor: submitting ? "not-allowed" : "pointer", fontWeight: "bold"
            }}
          >
            {submitting ? "Starting..." : "Start Trip"}
          </button>
        </div>
      )}

      {/* Active Trip View */}
      {view === "active-trip" && activeTrip && (
        <div>
          <h2 style={{ marginBottom: 20 }}>Active Trip</h2>

          {/* Trip Info Card */}
          <div style={{
            background: "white", border: "1px solid #eee", borderRadius: 12,
            padding: 20, marginBottom: 24, boxShadow: "0 2px 8px rgba(0,0,0,0.06)"
          }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <p style={{ margin: 0, fontSize: 12, color: "#888" }}>Trip ID</p>
                <p style={{ margin: "2px 0 0", fontWeight: "bold", fontSize: 12 }}>{activeTrip.trip_id}</p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 12, color: "#888" }}>Plate Number</p>
                <p style={{ margin: "2px 0 0", fontWeight: "bold" }}>{activeTrip.plate_number}</p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 12, color: "#888" }}>Product</p>
                <p style={{ margin: "2px 0 0", fontWeight: "bold" }}>{activeTrip.product}</p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 12, color: "#888" }}>Material Centre</p>
                <p style={{ margin: "2px 0 0", fontWeight: "bold" }}>{activeTrip.material_centre}</p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 12, color: "#888" }}>Loaded</p>
                <p style={{ margin: "2px 0 0", fontWeight: "bold" }}>{activeTrip.loaded_quantity} bags</p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 12, color: "#888" }}>Remaining</p>
                <p style={{
                  margin: "2px 0 0", fontWeight: "bold",
                  color: remaining === 0 ? "red" : remaining < activeTrip.loaded_quantity * 0.2 ? "orange" : "green"
                }}>
                  {remaining} bags
                </p>
              </div>
            </div>

            {/* Status Badge */}
            <div style={{ marginTop: 16, textAlign: "center" }}>
              <span style={{
                padding: "4px 14px", borderRadius: 12, fontSize: 12, fontWeight: "bold",
                background: activeTrip.trip_status === "On hold" ? "#f5a62322" : "#0070f322",
                color: activeTrip.trip_status === "On hold" ? "#f5a623" : "#0070f3"
              }}>
                {activeTrip.trip_status}
              </span>
            </div>
          </div>

          {/* Previous Stops */}
          {stops.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <p style={{ fontWeight: "bold", marginBottom: 12 }}>Previous Stops ({stops.length})</p>
              {stops.map((stop, index) => (
                <div key={stop.stop_id} style={{
                  padding: 12, border: "1px solid #eee", borderRadius: 8,
                  marginBottom: 8, background: "white", fontSize: 13
                }}>
                  <p style={{ margin: 0, fontWeight: "bold" }}>Stop {stops.length - index}</p>
                  <p style={{ margin: "4px 0 0", color: "#555" }}>{stop.stop_location}</p>
                  <p style={{ margin: "4px 0 0", color: "#888" }}>{stop.quantity_offloaded} bags • {new Date(stop.stop_time).toLocaleTimeString()}</p>
                </div>
              ))}
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {remaining > 0 && (
              <button
                onClick={() => setView("log-stop")}
                style={{
                  width: "100%", padding: "14px 0", background: "#0070f3",
                  color: "white", border: "none", borderRadius: 8,
                  fontSize: 16, cursor: "pointer", fontWeight: "bold"
                }}
              >
                Make a Stop
              </button>
            )}

            <button
              onClick={() => setShowHoldConfirm(true)}
              style={{
                width: "100%", padding: "12px 0",
                background: activeTrip.trip_status === "On hold" ? "white" : "white",
                color: activeTrip.trip_status === "On hold" ? "#0070f3" : "#f5a623",
                border: `1px solid ${activeTrip.trip_status === "On hold" ? "#0070f3" : "#f5a623"}`,
                borderRadius: 8, fontSize: 16, cursor: "pointer"
              }}
            >
              {activeTrip.trip_status === "On hold" ? "Resume Trip" : "Put Trip On Hold"}
            </button>

            <button
              onClick={() => setShowEndConfirm(true)}
              style={{
                width: "100%", padding: "12px 0", background: "white",
                color: "#ff4444", border: "1px solid #ff4444",
                borderRadius: 8, fontSize: 16, cursor: "pointer"
              }}
            >
              End Trip
            </button>
          </div>
        </div>
      )}

      {/* Log Stop View */}
      {view === "log-stop" && activeTrip && (
        <div>
          <button
            onClick={() => setView("active-trip")}
            style={{ background: "none", border: "none", color: "#0070f3", cursor: "pointer", marginBottom: 16, padding: 0 }}
          >
            ← Back
          </button>
          <StopForm tripId={activeTrip.trip_id} onStopLogged={handleStopLogged} />
        </div>
      )}

      {/* End Trip Confirmation Modal */}
      {showEndConfirm && (
        <div
          onClick={() => setShowEndConfirm(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white", borderRadius: 12, padding: 32,
              width: 320, maxWidth: "90vw", boxShadow: "0 8px 32px rgba(0,0,0,0.2)"
            }}
          >
            <h3 style={{ marginBottom: 12 }}>
              {remaining === 0 ? "All bags offloaded!" : "End Trip Early?"}
            </h3>
            <p style={{ marginBottom: 24, color: "#555" }}>
              {remaining === 0
                ? "All bags have been offloaded. Ready to end this trip?"
                : `You still have ${remaining} bags remaining. Are you sure you want to end the trip?`}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleEndTrip}
                disabled={submitting}
                style={{
                  flex: 1, padding: "10px 0", background: "#0070f3",
                  color: "white", border: "none", borderRadius: 6, cursor: "pointer"
                }}
              >
                {submitting ? "Ending..." : "Yes, End Trip"}
              </button>
              <button
                onClick={() => setShowEndConfirm(false)}
                style={{
                  flex: 1, padding: "10px 0", background: "white",
                  color: "#333", border: "1px solid #ddd", borderRadius: 6, cursor: "pointer"
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hold Trip Confirmation Modal */}
      {showHoldConfirm && (
        <div
          onClick={() => setShowHoldConfirm(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white", borderRadius: 12, padding: 32,
              width: 320, maxWidth: "90vw", boxShadow: "0 8px 32px rgba(0,0,0,0.2)"
            }}
          >
            <h3 style={{ marginBottom: 12 }}>
              {activeTrip?.trip_status === "On hold" ? "Resume Trip?" : "Put Trip On Hold?"}
            </h3>
            <p style={{ marginBottom: 24, color: "#555" }}>
              {activeTrip?.trip_status === "On hold"
                ? "This will set your trip back to In Transit."
                : "This will pause your trip. You can resume it later."}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleHoldTrip}
                disabled={submitting}
                style={{
                  flex: 1, padding: "10px 0", background: "#f5a623",
                  color: "white", border: "none", borderRadius: 6, cursor: "pointer"
                }}
              >
                {submitting ? "Updating..." : "Confirm"}
              </button>
              <button
                onClick={() => setShowHoldConfirm(false)}
                style={{
                  flex: 1, padding: "10px 0", background: "white",
                  color: "#333", border: "1px solid #ddd", borderRadius: 6, cursor: "pointer"
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}