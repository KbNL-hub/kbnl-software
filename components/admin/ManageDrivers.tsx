"use client"

import { useState, useEffect, useRef } from "react"
import { supabase } from "@/lib/supabase"

type Driver = {
  driver_id: string
  full_name: string
  phone_number: string
  status: string
  created_at: string
}

export default function ManageDrivers() {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState("All")
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null)
  const [editName, setEditName] = useState("")
  const [editPhone, setEditPhone] = useState("")
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const phoneRef = useRef<HTMLInputElement>(null)

  const filterOptions = ["All", "Active", "Invited", "Suspended"]

  const filteredDrivers = filterStatus === "All"
    ? drivers
    : drivers.filter((d) => d.status === filterStatus)

  async function fetchDrivers() {
    const { data, error } = await supabase
      .from("Drivers")
      .select("*")
      .order("full_name", { ascending: true })

    if (!error) setDrivers(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchDrivers() }, [])

  function startEdit(driver: Driver) {
    setEditingDriver(driver)
    setEditName(driver.full_name)
    setEditPhone(driver.phone_number)
    setMessage("")
    setDeletingId(null)
  }

  function closeModals() {
    setEditingDriver(null)
    setDeletingId(null)
    setMessage("")
  }

  async function handleUpdate() {
    if (!editingDriver) return
    if (!editName.trim()) return setMessage("Full name is required")

    setSubmitting(true)

    const { error } = await supabase
      .from("Drivers")
      .update({
        full_name: editName,
        phone_number: editPhone || null,
      })
      .eq("driver_id", editingDriver.driver_id)

    setSubmitting(false)

    if (error) {
      setMessage("Failed to update driver")
      return
    }

    closeModals()
    fetchDrivers()
  }

  async function handleSuspend(driver: Driver) {
    const newStatus = driver.status === "Suspended" ? "Active" : "Suspended"

    setSubmitting(true)

    const { error } = await supabase
      .from("Drivers")
      .update({ status: newStatus })
      .eq("driver_id", driver.driver_id)

    setSubmitting(false)

    if (error) {
      setMessage("Failed to update driver status")
      return
    }

    fetchDrivers()
  }

  async function handleDelete(driver_id: string) {
    setSubmitting(true)

    const { error } = await supabase
      .from("Drivers")
      .delete()
      .eq("driver_id", driver_id)

    setSubmitting(false)

    if (error) {
      setMessage("Failed to delete driver")
      return
    }

    closeModals()
    fetchDrivers()
  }

  const statusColor = (status: string) => {
    switch (status) {
      case "Active": return { bg: "#00aa0022", color: "#00aa00" }
      case "Invited": return { bg: "#f5a62322", color: "#f5a623" }
      case "Suspended": return { bg: "#ff444422", color: "#ff4444" }
      default: return { bg: "#eee", color: "#888" }
    }
  }

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>Manage Drivers</h2>

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
      {!loading && filteredDrivers.length === 0 && (
        <p style={{ color: "#888" }}>No drivers found.</p>
      )}

      {!loading && filteredDrivers.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#f0f0f0", textAlign: "left" }}>
                <th style={th}>Full Name</th>
                <th style={th}>Phone</th>
                <th style={th}>Status</th>
                <th style={th}>Joined</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDrivers.map((driver) => {
                const { bg, color } = statusColor(driver.status)
                return (
                  <tr key={driver.driver_id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={td}><strong>{driver.full_name}</strong></td>
                    <td style={td}>{driver.phone_number || "—"}</td>
                    <td style={td}>
                      <span style={{
                        padding: "4px 10px", borderRadius: 12, fontSize: 12,
                        background: bg, color, fontWeight: "bold"
                      }}>
                        {driver.status}
                      </span>
                    </td>
                    <td style={td}>
                      {new Date(driver.created_at).toLocaleDateString()}
                    </td>
                    <td style={td}>
                      <button
                        onClick={() => startEdit(driver)}
                        style={{
                          padding: "6px 12px", marginRight: 8, cursor: "pointer",
                          borderRadius: 4, border: "1px solid #0070f3",
                          color: "#0070f3", background: "white", fontSize: 12
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleSuspend(driver)}
                        style={{
                          padding: "6px 12px", marginRight: 8, cursor: "pointer",
                          borderRadius: 4,
                          border: driver.status === "Suspended" ? "1px solid #00aa00" : "1px solid #f5a623",
                          color: driver.status === "Suspended" ? "#00aa00" : "#f5a623",
                          background: "white", fontSize: 12
                        }}
                      >
                        {driver.status === "Suspended" ? "Unsuspend" : "Suspend"}
                      </button>
                      <button
                        onClick={() => { setDeletingId(driver.driver_id); setMessage("") }}
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
      {(editingDriver || deletingId) && (
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
              width: 400, maxWidth: "90vw",
              boxShadow: "0 8px 32px rgba(0,0,0,0.2)"
            }}
          >

            {/* Edit Modal */}
            {editingDriver && (
              <>
                <h3 style={{ marginBottom: 20 }}>Edit — {editingDriver.full_name}</h3>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>
                    Full Name *
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => { setEditName(e.target.value); setMessage("") }}
                    onKeyDown={(e) => { if (e.key === "Enter") phoneRef.current?.focus() }}
                    style={{ width: "100%", padding: 10, boxSizing: "border-box" }}
                  />
                </div>

                <div style={{ marginBottom: 24 }}>
                  <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>
                    Phone Number
                  </label>
                  <input
                    ref={phoneRef}
                    type="text"
                    value={editPhone}
                    onChange={(e) => { setEditPhone(e.target.value); setMessage("") }}
                    onKeyDown={(e) => { if (e.key === "Enter") handleUpdate() }}
                    style={{ width: "100%", padding: 10, boxSizing: "border-box" }}
                  />
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
            {deletingId && (
              <>
                <h3 style={{ marginBottom: 12, color: "#ff4444" }}>Delete Driver</h3>
                <p style={{ marginBottom: 24 }}>
                  Are you sure? This will permanently delete the driver and cannot be undone.
                </p>

                {message && (
                  <p style={{ color: "red", marginBottom: 12, fontWeight: "bold" }}>{message}</p>
                )}

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => handleDelete(deletingId)}
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