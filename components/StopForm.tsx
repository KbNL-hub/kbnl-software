"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import BrokerDropdown from "./BrokerDropdown"
import CustomerSelector from "./CustomerSelector"

type Broker = {
  broker_id: string
  broker_name: string
}

type Customer = {
  customer_id: string
  full_name: string
  phone_number: string
}

type Props = {
  tripId: string
  onStopLogged: () => void
}

export default function StopForm({ tripId, onStopLogged }: Props) {
  const [selectedBroker, setSelectedBroker] = useState<Broker | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [quantityOffloaded, setQuantityOffloaded] = useState("")
  const [stopLocation, setStopLocation] = useState("")
  const [latitude, setLatitude] = useState<number | null>(null)
  const [longitude, setLongitude] = useState<number | null>(null)
  const [gpsStatus, setGpsStatus] = useState("Tap to capture GPS")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const [loadedQuantity, setLoadedQuantity] = useState<number>(0)
  const [offloadedSoFar, setOffloadedSoFar] = useState<number>(0)

  const remaining = loadedQuantity - offloadedSoFar
  const inputQty = parseInt(quantityOffloaded) || 0
  const displayRemaining = remaining - inputQty

  useEffect(() => {
    fetchTripData()
  }, [tripId])

  async function fetchTripData() {
    // Fetch total loaded quantity for this trip
    const { data: tripData, error: tripError } = await supabase
      .from("Trips")
      .select("loaded_quantity")
      .eq("trip_id", tripId)
      .single()

    if (tripError || !tripData) return
    setLoadedQuantity(tripData.loaded_quantity)

    // Fetch all stops for this trip and sum quantity offloaded
    const { data: stopsData, error: stopsError } = await supabase
      .from("Stops")
      .select("quantity_offloaded")
      .eq("trip_id", tripId)

    if (!stopsError && stopsData) {
      const total = stopsData.reduce((sum, stop) => sum + (stop.quantity_offloaded || 0), 0)
      setOffloadedSoFar(total)
    }
  }

  function captureGPS() {
    if (!navigator.geolocation) {
      setGpsStatus("GPS not supported on this device")
      return
    }
    setGpsStatus("Capturing...")
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude)
        setLongitude(position.coords.longitude)
        setGpsStatus(`✅ ${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`)
      },
      () => {
        setGpsStatus("❌ Failed to capture. Check permissions.")
      }
    )
  }

  async function handleSubmit() {
    if (!selectedBroker) return setMessage("Select a broker")
    if (!quantityOffloaded) return setMessage("Enter quantity offloaded")
    if (inputQty <= 0) return setMessage("Quantity must be greater than 0")
    if (inputQty > remaining) return setMessage(`Only ${remaining} bags remaining`)
    if (!stopLocation.trim()) return setMessage("Enter stop location")
    if (!latitude || !longitude) return setMessage("Capture GPS before submitting")

    setSubmitting(true)

    const { error } = await supabase.from("Stops").insert([{
      trip_id: tripId,
      broker_id: selectedBroker.broker_id,
      customer_id: selectedCustomer?.customer_id ?? null,
      quantity_offloaded: inputQty,
      stop_location: stopLocation,
      latitude,
      longitude,
      stop_time: new Date().toISOString(),
    }])

    setSubmitting(false)

    if (error) {
      console.error(error)
      setMessage("Failed to save stop")
    } else {
      setOffloadedSoFar((prev) => prev + inputQty)
      onStopLogged()
    }
  }

  // Bag counter color logic
  const counterColor = displayRemaining === 0
    ? "red"
    : displayRemaining < loadedQuantity * 0.2
    ? "orange"
    : "green"

  return (
    <div style={{ padding: 40, fontFamily: "Arial", maxWidth: 400 }}>

      {/* Trip ID Banner */}
      <div style={{
        background: "#f0f0f0", padding: "10px 16px",
        borderRadius: 8, marginBottom: 16, fontSize: 13, color: "#555"
      }}>
        Trip ID: <strong>{tripId}</strong>
      </div>

      {/* Bag Counter */}
      <div style={{
        background: "#fafafa", border: "1px solid #ddd",
        borderRadius: 8, padding: "14px 16px", marginBottom: 24,
        textAlign: "center"
      }}>
        <p style={{ margin: 0, fontSize: 13, color: "#888" }}>Bags Available</p>
        <p style={{
          margin: "4px 0 0 0", fontSize: 28, fontWeight: "bold", color: counterColor
        }}>
          {displayRemaining < 0 ? 0 : displayRemaining}
          <span style={{ fontSize: 16, color: "#aaa", fontWeight: "normal" }}>
            /{loadedQuantity}
          </span>
        </p>
        {displayRemaining < 0 && (
          <p style={{ color: "red", fontSize: 12, margin: "4px 0 0 0" }}>
            Exceeds available bags
          </p>
        )}
      </div>

      <h2 style={{ marginBottom: 24 }}>Log a Stop</h2>

      {/* Broker */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontWeight: "bold" }}>Broker *</label>
        <div style={{ marginTop: 6 }}>
          <BrokerDropdown onSelect={(broker) => setSelectedBroker(broker)} />
        </div>
      </div>

      {/* Customer */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontWeight: "bold" }}>Customer</label>
        <div style={{ marginTop: 6 }}>
          <CustomerSelector onSelect={(customer) => setSelectedCustomer(customer)} />
        </div>
      </div>

      {/* Quantity */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontWeight: "bold" }}>Quantity Offloaded (bags) *</label>
        <input
          type="number"
          placeholder="e.g. 50"
          value={quantityOffloaded}
          min={1}
          max={remaining}
          onChange={(e) => {
            setQuantityOffloaded(e.target.value)
            setMessage("")
          }}
          style={{
            display: "block", width: "100%", padding: 10,
            marginTop: 6, boxSizing: "border-box",
            borderColor: displayRemaining < 0 ? "red" : "#ccc",
            borderWidth: 1, borderStyle: "solid", borderRadius: 4
          }}
        />
      </div>

      {/* Stop Location */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontWeight: "bold" }}>Stop Location *</label>
        <input
          type="text"
          placeholder="e.g. Aba Road, beside GTBank"
          value={stopLocation}
          onChange={(e) => setStopLocation(e.target.value)}
          style={{ display: "block", width: "100%", padding: 10, marginTop: 6, boxSizing: "border-box" }}
        />
      </div>

      {/* GPS */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ fontWeight: "bold" }}>GPS Coordinates *</label>
        <div style={{ marginTop: 6 }}>
          <button
            onClick={captureGPS}
            style={{ padding: "10px 16px", cursor: "pointer", marginBottom: 8 }}
          >
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