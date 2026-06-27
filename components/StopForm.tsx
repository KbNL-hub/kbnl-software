"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import BrokerDropdown from "./BrokerDropdown"
import CustomerSelector from "./CustomerSelector"
import { useOfflineTripAction } from "@/app/hooks/useOfflineTripAction"

type Broker = { broker_id: string; broker_name: string; phone_number?: string | null }
type Customer = { customer_id: string; full_name: string; phone_number: string }
type Props = { tripId: string; loadedQuantity?: number; offloadedSoFar?: number; onStopLogged: (quantityOffloaded: number) => void }

const STORE_LOCATIONS = [
  "Calabar Mini Depot", "Ikom Mini Depot", "Ogoja Depot", "Uyo Depot",
  "Brooks Outlet", "Urua Ekpa Outlet", "Urua Nyemeiko Outlet", "Reserve Store", "E1 Outlet", "Ogoja Outlet",
]

export default function StopForm({ tripId, loadedQuantity: initialLoaded = 0, offloadedSoFar: initialOffloaded = 0, onStopLogged }: Props) {
  const { submitAction, isOnline } = useOfflineTripAction()
  const [loadedQuantity, setLoadedQuantity] = useState(initialLoaded)
  const [offloadedSoFar, setOffloadedSoFar] = useState(initialOffloaded)
  const [stopType, setStopType] = useState<"customer" | "store">("customer")

  // Customer stop
  const [selectedBroker, setSelectedBroker] = useState<Broker | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)

  // Store stop
  const [selectedStore, setSelectedStore] = useState("")

  const [quantityOffloaded, setQuantityOffloaded] = useState("")
  const [stopLocation, setStopLocation] = useState("")
  const [latitude, setLatitude] = useState<number | null>(null)
  const [longitude, setLongitude] = useState<number | null>(null)
  const [gpsStatus, setGpsStatus] = useState("Tap to capture GPS")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const remaining = loadedQuantity - offloadedSoFar
  const parsedQty = Number(quantityOffloaded)
  const inputQty = Number.isFinite(parsedQty) ? parsedQty : 0
  const displayRemaining = remaining - inputQty

  useEffect(() => {
    let cancelled = false

    async function fetchTripData() {
      const { data: tripData } = await supabase
        .from("Trips").select("loaded_quantity").eq("trip_id", tripId).single()
      if (!tripData || cancelled) return
      setLoadedQuantity(tripData.loaded_quantity)

      const { data: stopsData } = await supabase
        .from("Stops").select("quantity_offloaded").eq("trip_id", tripId)
      const { data: discData } = await supabase
        .from("trip_discrepancies").select("shortage").eq("trip_id", tripId)

      if (cancelled) return
      const totalOffloaded = (stopsData || []).reduce((sum, s) => sum + (s.quantity_offloaded || 0), 0)
      const totalShortage = (discData || []).reduce((sum, d) => sum + (d.shortage || 0), 0)
      setOffloadedSoFar(totalOffloaded + totalShortage)
    }

    // If data provided as props, use it
    if (initialLoaded > 0) {
      setLoadedQuantity(initialLoaded);
      setOffloadedSoFar(initialOffloaded);
      return; // Don't fetch
    }

    fetchTripData()
    return () => { cancelled = true }
  }, [tripId, initialLoaded, initialOffloaded])

  function captureGPS() {
    if (!navigator.geolocation) { setGpsStatus("GPS not supported on this device"); return }
    setGpsStatus("Capturing...")
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude)
        setLongitude(pos.coords.longitude)
        setGpsStatus(`✅ ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`)
      },
      () => setGpsStatus("❌ Failed to capture. Check permissions.")
    )
  }

  function switchStopType(type: "customer" | "store") {
    setStopType(type)
    setSelectedBroker(null)
    setSelectedCustomer(null)
    setSelectedStore("")
    setMessage("")
  }

  async function handleSubmit() {
    if (stopType === "customer" && !selectedBroker) return setMessage("Select a broker")
    if (stopType === "store" && !selectedStore) return setMessage("Select a store")
    if (!quantityOffloaded) return setMessage("Enter quantity offloaded")
    if (inputQty <= 0) return setMessage("Quantity must be greater than 0")
    if (!Number.isInteger(inputQty)) return setMessage("Quantity must be a whole number")
    if (inputQty > remaining) return setMessage(`Only ${remaining} bags remaining`)
    if (stopType === "customer" && !stopLocation.trim()) return setMessage("Enter stop location")

    setSubmitting(true)

    try {
      // Derive stop_type from actual form data: if broker exists → customer, else → store
      const derivedStopType = selectedBroker ? "customer" : "store"

      const payload: Record<string, unknown> = {
        trip_id: tripId,
        stop_type: derivedStopType,
        quantity_offloaded: inputQty,
        stop_location: derivedStopType === "store" ? selectedStore : stopLocation,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        stop_time: new Date().toISOString(),
      }

      if (derivedStopType === "customer") {
        payload.broker_id = selectedBroker!.broker_id
        payload.customer_id = selectedCustomer?.customer_id ?? null
      } else {
        payload.broker_id = null
        payload.customer_id = null
        payload.store_name = selectedStore
      }

      const result = await submitAction(
        'stop',
        tripId,
        'Stops',
        payload
      )

      if (!result.success) {
        console.error(result.error)
        setMessage(`Failed to save stop: ${result.error}`)
        return
      } 

      if (result.offline) {
        setMessage("✅ Stop saved offline. Will sync when connected.")
        setTimeout(() => onStopLogged(inputQty), 1500)
      } else {
        setMessage("✅ Stop logged successfully")
        setTimeout(() => onStopLogged(inputQty), 1000)
      }
    } catch {
      setMessage("Network error, please try again")
    } finally {
      setSubmitting(false)
    }
  }

  const counterColor = displayRemaining === 0 ? "red" : displayRemaining < loadedQuantity * 0.2 ? "orange" : "green"

  return (
    <div style={{ fontFamily: "Arial", maxWidth: 400 }}>

      {/* Bag Counter */}
      <div style={{ background: "#fafafa", border: "1px solid #ddd", borderRadius: 8, padding: "14px 16px", marginBottom: 24, textAlign: "center" }}>
        <p style={{ margin: 0, fontSize: 13, color: "#888" }}>Bags Available</p>
        <p style={{ margin: "4px 0 0", fontSize: 28, fontWeight: "bold", color: counterColor }}>
          {displayRemaining < 0 ? 0 : displayRemaining}
          <span style={{ fontSize: 16, color: "#aaa", fontWeight: "normal" }}>/{loadedQuantity}</span>
        </p>
        {displayRemaining < 0 && <p style={{ color: "red", fontSize: 12, margin: "4px 0 0" }}>Exceeds available bags</p>}
      </div>

      <h2 style={{ marginBottom: 20 }}>Log a Stop</h2>

      {/* Stop Type Toggle */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {(["customer", "store"] as const).map((type) => (
          <button
            key={type}
            onClick={() => switchStopType(type)}
            style={{
              flex: 1, padding: "10px 0", borderRadius: 8, cursor: "pointer",
              border: "1px solid #ddd", fontSize: 14, fontWeight: stopType === type ? "bold" : "normal",
              background: stopType === type ? "#0070f3" : "white",
              color: stopType === type ? "white" : "#333",
            }}
          >
            {type === "customer" ? "Customer Stop" : "Store Stop"}
          </button>
        ))}
      </div>

      {/* Customer Stop Fields */}
      {stopType === "customer" && (
        <>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontWeight: "bold", fontSize: 15, color: "#171717" }}>Select Broker *</label>
            <div style={{ marginTop: 6 }}>
              <BrokerDropdown onSelect={(broker) => setSelectedBroker(broker)} />
            </div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontWeight: "bold", fontSize: 15, color: "#171717" }}>Customer</label>
            <div style={{ marginTop: 6 }}>
              <CustomerSelector onSelect={(customer) => setSelectedCustomer(customer)} />
            </div>
          </div>
        </>
      )}

      {/* Store Stop Fields */}
      {stopType === "store" && (
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontWeight: "bold", fontSize: 15, color: "#171717" }}>Store *</label>
          <select
            value={selectedStore}
            onChange={(e) => { setSelectedStore(e.target.value); setMessage("") }}
            style={{ display: "block", width: "100%", padding: "12px 14px", marginTop: 6, boxSizing: "border-box", borderRadius: 8, border: "1.5px solid #ccc", background: "white", color: "#171717", fontSize: 15, minHeight: 48 }}
          >
            <option value="">Select store</option>
            {STORE_LOCATIONS.map((loc) => (<option key={loc} value={loc}>{loc}</option>))}
          </select>
        </div>
      )}

      {/* Quantity */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontWeight: "bold", fontSize: 15, color: "#171717" }}>Quantity Offloaded (bags) *</label>
        <input
          type="number"
          placeholder="e.g. 50"
          value={quantityOffloaded}
          min={1}
          step={1}
          max={remaining}
          onChange={(e) => { setQuantityOffloaded(e.target.value); setMessage("") }}
          style={{
            display: "block", width: "100%", padding: "12px 14px", marginTop: 6, boxSizing: "border-box",
            border: `1.5px solid ${displayRemaining < 0 ? "#ff4444" : "#ccc"}`,
            borderRadius: 8, background: "white", color: "#171717", fontSize: 15, minHeight: 48
          }}
        />
      </div>

      {/* Stop Location — only for customer stops */}
      {stopType === "customer" && (
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontWeight: "bold", fontSize: 15, color: "#171717" }}>Stop Location *</label>
          <input
            type="text"
            placeholder="e.g. Aba Road, beside GTBank"
            value={stopLocation}
            onChange={(e) => { setStopLocation(e.target.value); setMessage("") }}
            style={{ display: "block", width: "100%", padding: "12px 14px", marginTop: 6, boxSizing: "border-box", borderRadius: 8, border: "1.5px solid #ccc", background: "white", color: "#171717", fontSize: 15, minHeight: 48 }}
          />
        </div>
      )}

      {/* GPS — optional */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ fontWeight: "bold", fontSize: 15, color: "#171717" }}>GPS Coordinates <span style={{ fontWeight: "normal", color: "#aaa", fontSize: 13 }}>(optional)</span></label>
        <div style={{ marginTop: 6 }}>
          <button onClick={captureGPS} style={{ padding: "12px 16px", cursor: "pointer", marginBottom: 8, borderRadius: 8, border: "1.5px solid #0070f3", background: "white", color: "#0070f3", fontSize: 14, minHeight: 48 }}>
            📍 Capture My Location
          </button>
          <p style={{ fontSize: 13, color: "#555", margin: 0 }}>{gpsStatus}</p>
        </div>
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={submitting || displayRemaining < 0}
        style={{
          width: "100%", padding: "14px 0",
          background: displayRemaining < 0 ? "#ccc" : "#0070f3",
          color: "white", border: "none", borderRadius: 6,
          fontSize: 16, cursor: submitting || displayRemaining < 0 ? "not-allowed" : "pointer"
        }}
      >
        {submitting ? "Saving..." : "Log Stop"}
      </button>

      {message && (
        <p style={{ marginTop: 16, fontWeight: "bold", color: message.startsWith("✅") ? "green" : "red" }}>
          {message}
        </p>
      )}
    </div>
  )
}