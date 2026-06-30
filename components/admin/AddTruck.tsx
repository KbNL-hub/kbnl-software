"use client"

import { useState, useRef } from "react"
import ModernInput from "@/components/ModernInput"
import { supabase } from "@/lib/supabase"
import { apiMutate } from "@/lib/api-mutation"
import { usePermissions } from "@/lib/PermissionContext"

const TRUCK_SIZES = ["20", "40/45", "Dina", "Tricycle"]
const truckStatuses = ["Empty", "Loaded", "Undergoing Repairs", "Decommissioned"]

export default function AddTruck() {
  const { getAccess } = usePermissions()
  const canEdit = getAccess("add-truck").canEdit

  const [plateNumber, setPlateNumber] = useState("")
  const [kbnlTruckNo, setKbnlTruckNo] = useState("")
  const [truckModel, setTruckModel] = useState("")
  const [capacity, setCapacity] = useState("")
  const [truckSize, setTruckSize] = useState("")
  const [customTruckSize, setCustomTruckSize] = useState("")
  const [status, setStatus] = useState("Empty")
  const [tricycleNumber, setTricycleNumber] = useState("")
  const [assignedTo, setAssignedTo] = useState("")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const kbnlRef = useRef<HTMLInputElement>(null)
  const truckModelRef = useRef<HTMLInputElement>(null)
  const capacityRef = useRef<HTMLInputElement>(null)
  const statusRef = useRef<HTMLSelectElement>(null)
  const tricycleNumberRef = useRef<HTMLInputElement>(null)
  const assignedToRef = useRef<HTMLInputElement>(null)

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
    if (!canEdit) {
      setMessage("You do not have permission to add vehicles")
      return
    }

    const finalTruckSize = truckSize === "Create new size" ? customTruckSize.trim() : truckSize
    if (!finalTruckSize) return setMessage("Truck size is required")

    let parsedCapacity = 0
    if (truckSize === "Tricycle") {
      if (!tricycleNumber.trim()) return setMessage("Tricycle number is required")
      if (!assignedTo.trim()) return setMessage("Assigned to is required")
      if (!phoneNumber.trim()) return setMessage("Phone number is required")
    } else {
      if (!plateNumber.trim()) return setMessage("Plate number is required")
      if (!kbnlTruckNo.trim()) return setMessage("KbNL truck number is required")
      if (!truckModel.trim()) return setMessage("Truck model is required")
      parsedCapacity = Number(capacity)
      if (!Number.isInteger(parsedCapacity) || parsedCapacity <= 0) return setMessage("Capacity must be a positive whole number")
    }

    setSubmitting(true)

    try {
      if (truckSize === "Tricycle") {
        const { error } = await supabase
          .from("tricycles")
          .insert({
            tricycle_number: tricycleNumber.trim(),
            assigned_to: assignedTo.trim(),
            phone_number: phoneNumber.trim(),
          })
        if (error) { setMessage("Failed to add vehicle"); return }
      } else {
        const { error } = await apiMutate("trips", {
          action: "insert",
          table: "Trucks",
          data: {
            plate_number: plateNumber.toUpperCase(),
            kbnl_truck_no: kbnlTruckNo.trim(),
            truck_model: truckModel,
            capacity: parsedCapacity,
            truck_size: finalTruckSize,
            status,
          },
        })
        if (error) { setMessage("Failed to add vehicle"); return }
      }

      setMessage("Vehicle added successfully")
      setPlateNumber("")
      setKbnlTruckNo("")
      setTruckModel("")
      setCapacity("")
      setTruckSize("")
      setCustomTruckSize("")
      setStatus("Empty")
      setTricycleNumber("")
      setAssignedTo("")
      setPhoneNumber("")
    } catch {
      setMessage("Failed to add vehicle")
    } finally {
      setSubmitting(false)
    }
  }

  const isTricycleSelected = truckSize === "Tricycle"

  return (
    <div style={{ maxWidth: 400 }}>
      <h2 style={{ marginBottom: 24 }}>Add New Vehicle</h2>

      {!isTricycleSelected && (
        <>
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
              readOnly={!canEdit}
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
              readOnly={!canEdit}
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
              readOnly={!canEdit}
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
               onKeyDown={(e) => { if (e.key === "Enter") statusRef.current?.focus() }}
               style={fieldStyle}
               readOnly={!canEdit}
             />
           </div>
        </>
      )}

      {isTricycleSelected && (
        <>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>
              Tricycle Number *
            </label>
            <ModernInput
              ref={tricycleNumberRef}
              type="text"
              placeholder="e.g. TR-001"
              value={tricycleNumber}
              onChange={(e) => { setTricycleNumber(e.target.value); setMessage("") }}
              onKeyDown={(e) => { if (e.key === "Enter") assignedToRef.current?.focus() }}
              style={fieldStyle}
              readOnly={!canEdit}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>
              Assigned To *
            </label>
            <ModernInput
              ref={assignedToRef}
              type="text"
              placeholder="Driver name"
              value={assignedTo}
              onChange={(e) => { setAssignedTo(e.target.value); setMessage("") }}
              style={fieldStyle}
              readOnly={!canEdit}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>
              Phone Number *
            </label>
            <ModernInput
              type="tel"
              placeholder="e.g. 08012345678"
              value={phoneNumber}
              onChange={(e) => { setPhoneNumber(e.target.value); setMessage("") }}
              style={fieldStyle}
              readOnly={!canEdit}
            />
          </div>
        </>
      )}

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>
          Truck Size (Tonnage) *
        </label>
        <ModernInput
          as="select"
          value={truckSize}
          onChange={(e) => { setTruckSize(e.target.value); setMessage("") }}
          style={fieldStyle}
          disabled={!canEdit}
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
            readOnly={!canEdit}
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
          disabled={!canEdit}
        >
          {truckStatuses.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </ModernInput>
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitting || !canEdit}
        style={{
          width: "100%", padding: "12px 0", background: submitting || !canEdit ? "#94a3b8" : "#0070f3",
          color: "white", border: "none", borderRadius: 6,
          fontSize: 16, cursor: submitting || !canEdit ? "not-allowed" : "pointer"
        }}
      >
        {submitting ? "Saving..." : isTricycleSelected ? "Add Tricycle" : "Add Truck"}
      </button>

      {message && (() => {
        const isSuccess = message.toLowerCase().includes("successfully")
        return (
          <div style={{
            marginTop: 16,
            padding: "10px 14px",
            background: isSuccess ? "rgba(34, 197, 94, 0.08)" : "rgba(239, 68, 68, 0.08)",
            border: `1px solid ${isSuccess ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
            borderRadius: 8,
            fontSize: 13,
            color: isSuccess ? "#16a34a" : "#dc2626",
            fontWeight: 500,
            textAlign: "center",
          }}>
            {message}
          </div>
        )
      })()}
    </div>
  )
}