"use client"

import { useState, useEffect, useRef } from "react"
import { supabase } from "@/lib/supabase"

type Truck = {
  plate_number: string
  truck_model: string
  capacity: number
  status: string
}

const truckStatuses = ["Empty", "Loaded", "Need Repairs", "Decommissioned"]

export default function ManageTrucks() {
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [loading, setLoading] = useState(true)
  const [editingTruck, setEditingTruck] = useState<Truck | null>(null)
  const [editModel, setEditModel] = useState("")
  const [editCapacity, setEditCapacity] = useState("")
  const [editStatus, setEditStatus] = useState("")
  const [deletingPlate, setDeletingPlate] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [filterStatus, setFilterStatus] = useState("All")

  const capacityRef = useRef<HTMLInputElement>(null)

  async function fetchTrucks() {
    const { data, error } = await supabase
      .from("Trucks")
      .select("*")
      .order("plate_number", { ascending: true })

    if (!error) setTrucks(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchTrucks() }, [])

  const filterOptions = ["All", "Empty", "Loaded", "Need Repairs", "Decommissioned"]

  const filteredTrucks = filterStatus === "All"
    ? trucks
    : trucks.filter((t) => t.status === filterStatus)

  function startEdit(truck: Truck) {
    setEditingTruck(truck)
    setEditModel(truck.truck_model)
    setEditCapacity(truck.capacity.toString())
    setEditStatus(truck.status)
    setMessage("")
  }

  function closeModals() {
    setEditingTruck(null)
    setDeletingPlate(null)
    setMessage("")
  }

  async function handleUpdate() {
    if (!editingTruck) return
    if (!editModel.trim()) return setMessage("Truck model is required")
    if (!editCapacity) return setMessage("Capacity is required")

    setSubmitting(true)

    const { error } = await supabase
      .from("Trucks")
      .update({
        truck_model: editModel,
        capacity: parseInt(editCapacity),
        status: editStatus,
      })
      .eq("plate_number", editingTruck.plate_number)

    setSubmitting(false)

    if (error) {
      setMessage("Failed to update truck")
      return
    }

    closeModals()
    fetchTrucks()
  }

  async function handleDelete(plate_number: string) {
    setSubmitting(true)

    const { error } = await supabase
      .from("Trucks")
      .delete()
      .eq("plate_number", plate_number)

    setSubmitting(false)

    if (error) {
      setMessage("Failed to delete truck")
      return
    }

    closeModals()
    fetchTrucks()
  }

  const statusColor = (status: string) => {
    switch (status) {
      case "Loaded": return { bg: "#0070f322", color: "#0070f3" }
      case "Empty": return { bg: "#00aa0022", color: "#00aa00" }
      case "Need Repairs": return { bg: "#f5a62322", color: "#f5a623" }
      case "Decommissioned": return { bg: "#ff444422", color: "#ff4444" }
      default: return { bg: "#eee", color: "#888" }
    }
  }

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>Manage Trucks</h2>

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
      {!loading && trucks.length === 0 && <p style={{ color: "#888" }}>No trucks found.</p>}

      {!loading && trucks.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#f0f0f0", textAlign: "left" }}>
                <th style={th}>Plate Number</th>
                <th style={th}>Model</th>
                <th style={th}>Capacity</th>
                <th style={th}>Status</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTrucks.map((truck) => {
                const { bg, color } = statusColor(truck.status)
                return (
                  <tr key={truck.plate_number} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={td}><strong>{truck.plate_number}</strong></td>
                    <td style={td}>{truck.truck_model}</td>
                    <td style={td}>{truck.capacity} bags</td>
                    <td style={td}>
                      <span style={{
                        padding: "4px 10px", borderRadius: 12, fontSize: 12,
                        background: bg, color, fontWeight: "bold"
                      }}>
                        {truck.status}
                      </span>
                    </td>
                    <td style={td}>
                      <button
                        onClick={() => startEdit(truck)}
                        style={{
                          padding: "6px 12px", marginRight: 8, cursor: "pointer",
                          borderRadius: 4, border: "1px solid #0070f3",
                          color: "#0070f3", background: "white", fontSize: 12
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => { setDeletingPlate(truck.plate_number); setMessage("") }}
                        style={{
                          padding: "6px 12px", cursor: "pointer", borderRadius: 4,
                          border: "1px solid #ff4444", color: "#ff4444",
                          background: "white", fontSize: 12
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Overlay */}
      {(editingTruck || deletingPlate) && (
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
              width: 400, maxWidth: "90vw", boxShadow: "0 8px 32px rgba(0,0,0,0.2)"
            }}
          >

            {/* Edit Modal */}
            {editingTruck && (
              <>
                <h3 style={{ marginBottom: 20 }}>Edit — {editingTruck.plate_number}</h3>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>
                    Truck Model *
                  </label>
                  <input
                    type="text"
                    value={editModel}
                    onChange={(e) => { setEditModel(e.target.value); setMessage("") }}
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
                    value={editCapacity}
                    onChange={(e) => { setEditCapacity(e.target.value); setMessage("") }}
                    style={{ width: "100%", padding: 10, boxSizing: "border-box" }}
                  />
                </div>

                <div style={{ marginBottom: 24 }}>
                  <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>
                    Status
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    style={{ width: "100%", padding: 10, boxSizing: "border-box" }}
                  >
                    {truckStatuses.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                {message && (
                  <p style={{ color: "red", marginBottom: 12, fontWeight: "bold" }}>{message}</p>
                )}

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={handleUpdate}
                    disabled={submitting}
                    style={{
                      flex: 1, padding: "10px 0", background: "#0070f3",
                      color: "white", border: "none", borderRadius: 6,
                      cursor: submitting ? "not-allowed" : "pointer"
                    }}
                  >
                    {submitting ? "Saving..." : "Save Changes"}
                  </button>
                  <button
                    onClick={closeModals}
                    style={{
                      flex: 1, padding: "10px 0", background: "white",
                      color: "#333", border: "1px solid #ddd", borderRadius: 6,
                      cursor: "pointer"
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}

            {/* Delete Modal */}
            {deletingPlate && (
              <>
                <h3 style={{ marginBottom: 12, color: "#ff4444" }}>Delete Truck</h3>
                <p style={{ marginBottom: 24 }}>
                  Are you sure you want to delete <strong>{deletingPlate}</strong>? This cannot be undone.
                </p>

                {message && (
                  <p style={{ color: "red", marginBottom: 12, fontWeight: "bold" }}>{message}</p>
                )}

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => handleDelete(deletingPlate)}
                    disabled={submitting}
                    style={{
                      flex: 1, padding: "10px 0", background: "#ff4444",
                      color: "white", border: "none", borderRadius: 6,
                      cursor: submitting ? "not-allowed" : "pointer"
                    }}
                  >
                    {submitting ? "Deleting..." : "Yes, Delete"}
                  </button>
                  <button
                    onClick={closeModals}
                    style={{
                      flex: 1, padding: "10px 0", background: "white",
                      color: "#333", border: "1px solid #ddd", borderRadius: 6,
                      cursor: "pointer"
                    }}
                  >
                    Cancel
                  </button>
                </div>
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