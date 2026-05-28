"use client"

import { useState, useRef } from "react"
import { supabase } from "@/lib/supabase"

const truckStatuses = ["Empty", "Loaded", "Need Repairs", "Decommissioned"]

export default function AddTruck() {
  const [plateNumber, setPlateNumber] = useState("")
  const [kbnlTruckNo, setKbnlTruckNo] = useState("")
  const [truckModel, setTruckModel] = useState("")
  const [capacity, setCapacity] = useState("")
  const [tonnage, setTonnage] = useState("")
  const [status, setStatus] = useState("Empty")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const kbnlRef = useRef<HTMLInputElement>(null)
  const truckModelRef = useRef<HTMLInputElement>(null)
  const capacityRef = useRef<HTMLInputElement>(null)
  const tonnageRef = useRef<HTMLInputElement>(null)
  const statusRef = useRef<HTMLSelectElement>(null)

  async function handleSubmit() {
    if (!plateNumber.trim()) return setMessage("Plate number is required")
    if (!kbnlTruckNo.trim()) return setMessage("KbNL truck number is required")
    if (!truckModel.trim()) return setMessage("Truck model is required")
    if (!capacity) return setMessage("Capacity is required")
    if (!tonnage) return setMessage("Tonnage is required")

    setSubmitting(true)

    const { error } = await supabase.from("Trucks").insert([{
      plate_number: plateNumber.toUpperCase(),
      kbnl_truck_no: kbnlTruckNo.trim(),
      truck_model: truckModel,
      capacity: parseInt(capacity),
      tonnage: parseFloat(tonnage),
      status,
    }])

    setSubmitting(false)

    if (error) {
      console.error(error)
      setMessage("Failed to add truck")
    } else {
      setMessage("✅ Truck added successfully")
      setPlateNumber("")
      setKbnlTruckNo("")
      setTruckModel("")
      setCapacity("")
      setTonnage("")
      setStatus("Empty")
    }
  }

  return (
    <div style={{ maxWidth: 400 }}>
      <h2 style={{ marginBottom: 24 }}>Add New Truck</h2>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>
          Plate Number *
        </label>
        <input
          type="text"
          placeholder="e.g. ABC-123-XY"
          value={plateNumber}
          onChange={(e) => { setPlateNumber(e.target.value); setMessage("") }}
          onKeyDown={(e) => { if (e.key === "Enter") kbnlRef.current?.focus() }}
          style={{ width: "100%", padding: 10, boxSizing: "border-box" }}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>
          KbNL Truck No. *
        </label>
        <input
          ref={kbnlRef}
          type="text"
          placeholder="e.g. 007"
          value={kbnlTruckNo}
          onChange={(e) => { setKbnlTruckNo(e.target.value); setMessage("") }}
          onKeyDown={(e) => { if (e.key === "Enter") truckModelRef.current?.focus() }}
          style={{ width: "100%", padding: 10, boxSizing: "border-box" }}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>
          Truck Model *
        </label>
        <input
          ref={truckModelRef}
          type="text"
          placeholder="e.g. Volvo FH16"
          value={truckModel}
          onChange={(e) => { setTruckModel(e.target.value); setMessage("") }}
          onKeyDown={(e) => { if (e.key === "Enter") capacityRef.current?.focus() }}
          style={{ width: "100%", padding: 10, boxSizing: "border-box" }}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>
          Capacity (bags) *
        </label>
        <input
          ref={capacityRef}
          type="number"
          placeholder="e.g. 600"
          value={capacity}
          onChange={(e) => { setCapacity(e.target.value); setMessage("") }}
          onKeyDown={(e) => { if (e.key === "Enter") tonnageRef.current?.focus() }}
          style={{ width: "100%", padding: 10, boxSizing: "border-box" }}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>
          Tonnage *
        </label>
        <input
          ref={tonnageRef}
          type="number"
          step="0.1"
          placeholder="e.g. 30.5"
          value={tonnage}
          onChange={(e) => { setTonnage(e.target.value); setMessage("") }}
          onKeyDown={(e) => { if (e.key === "Enter") statusRef.current?.focus() }}
          style={{ width: "100%", padding: 10, boxSizing: "border-box" }}
        />
      </div>

      <div style={{ marginBottom: 24 }}>
        <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>
          Status
        </label>
        <select
          ref={statusRef}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={{ width: "100%", padding: 10, boxSizing: "border-box" }}
        >
          {truckStatuses.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitting}
        style={{
          width: "100%", padding: "12px 0", background: "#0070f3",
          color: "white", border: "none", borderRadius: 6,
          fontSize: 16, cursor: submitting ? "not-allowed" : "pointer"
        }}
      >
        {submitting ? "Saving..." : "Add Truck"}
      </button>

      {message && (
        <p style={{
          marginTop: 16, fontWeight: "bold",
          color: message.startsWith("✅") ? "green" : "red"
        }}>
          {message}
        </p>
      )}
    </div>
  )
}