"use client"

import { useState, useRef } from "react"
import ModernInput from "@/components/ModernInput"
import { supabase } from "@/lib/supabase"

const TRUCK_SIZES = ["20", "40/45", "Dina", "Tricycle"]
const truckStatuses = ["Empty", "Loaded", "Undergoing Repairs", "Decommissioned"]

export default function AddTruck() {
  const [plateNumber, setPlateNumber] = useState("")
  const [kbnlTruckNo, setKbnlTruckNo] = useState("")
  const [truckModel, setTruckModel] = useState("")
  const [capacity, setCapacity] = useState("")
  const [tonnage, setTonnage] = useState("")
  const [truckSize, setTruckSize] = useState("")
  const [customTruckSize, setCustomTruckSize] = useState("")
  const [status, setStatus] = useState("Empty")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const kbnlRef = useRef<HTMLInputElement>(null)
  const truckModelRef = useRef<HTMLInputElement>(null)
  const capacityRef = useRef<HTMLInputElement>(null)
  const tonnageRef = useRef<HTMLInputElement>(null)
  const statusRef = useRef<HTMLSelectElement>(null)

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    padding: 12,
    boxSizing: "border-box",
    borderRadius: 6,
    border: "1px solid #e0e0e0",
    outline: "none",
    fontSize: 16,
    background: "#fff",
    transition: "border-color 0.2s ease",
  }

  async function handleSubmit() {
    if (!plateNumber.trim()) return setMessage("Plate number is required")
    if (!kbnlTruckNo.trim()) return setMessage("KbNL truck number is required")
    if (!truckModel.trim()) return setMessage("Truck model is required")
    if (!capacity) return setMessage("Capacity is required")
    if (!tonnage) return setMessage("Tonnage is required")
    const finalTruckSize = truckSize === "Create new size" ? customTruckSize.trim() : truckSize
    if (!finalTruckSize) return setMessage("Truck size is required")

    setSubmitting(true)

    const { error } = await supabase.from("Trucks").insert([{
      plate_number: plateNumber.toUpperCase(),
      kbnl_truck_no: kbnlTruckNo.trim(),
      truck_model: truckModel,
      capacity: parseInt(capacity),
      tonnage: parseFloat(tonnage),
      truck_size: finalTruckSize,
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
      setTruckSize("")
      setCustomTruckSize("")
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
        <ModernInput
          type="text"
          placeholder="e.g. ABC-123-XY"
          value={plateNumber}
          onChange={(e) => { setPlateNumber(e.target.value); setMessage("") }}
          onKeyDown={(e) => { if (e.key === "Enter") kbnlRef.current?.focus() }}
          style={fieldStyle}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>
          KbNL Truck No. *
        </label>
        <ModernInput
          ref={kbnlRef}
          type="text"
          placeholder="e.g. 007"
          value={kbnlTruckNo}
          onChange={(e) => { setKbnlTruckNo(e.target.value); setMessage("") }}
          onKeyDown={(e) => { if (e.key === "Enter") truckModelRef.current?.focus() }}
          style={fieldStyle}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>
          Truck Model *
        </label>
        <ModernInput
          ref={truckModelRef}
          type="text"
          placeholder="e.g. Volvo FH16"
          value={truckModel}
          onChange={(e) => { setTruckModel(e.target.value); setMessage("") }}
          onKeyDown={(e) => { if (e.key === "Enter") capacityRef.current?.focus() }}
          style={fieldStyle}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>
          Capacity (bags) *
        </label>
        <ModernInput
          ref={capacityRef}
          type="number"
          placeholder="e.g. 600"
          value={capacity}
          onChange={(e) => { setCapacity(e.target.value); setMessage("") }}
          onKeyDown={(e) => { if (e.key === "Enter") tonnageRef.current?.focus() }}
          style={fieldStyle}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>
          Tonnage *
        </label>
        <ModernInput
          ref={tonnageRef}
          type="number"
          step="0.1"
          placeholder="e.g. 30.5"
          value={tonnage}
          onChange={(e) => { setTonnage(e.target.value); setMessage("") }}
          onKeyDown={(e) => { if (e.key === "Enter") statusRef.current?.focus() }}
          style={fieldStyle}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>
          Truck Size *
        </label>
        <ModernInput
          as="select"
          value={truckSize}
          onChange={(e) => { setTruckSize(e.target.value); setMessage("") }}
          style={fieldStyle}
        >
          <option value="">Select truck size</option>
          {TRUCK_SIZES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
          <option style = {{ color: "#0070f3", fontWeight: "bold", borderTop: "1px solid #eee" }} value="Create new size">Add new size…</option>
        </ModernInput>
        {truckSize === "Create new size" && (
          <ModernInput
            type="text"
            placeholder="Enter new size"
            value={customTruckSize}
            onChange={(e) => { setCustomTruckSize(e.target.value); setMessage("") }}
            style={{ ...fieldStyle, marginTop: 8 }}
          />
        )}
      </div>

      <div style={{ marginBottom: 24 }}>
        <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>
          Status
        </label>
        <ModernInput
          as="select"
          ref={statusRef}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={fieldStyle}
        >
          {truckStatuses.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </ModernInput>
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