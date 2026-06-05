"use client"

import { useState, useEffect, useRef } from "react"
import ModernInput from "@/components/ModernInput"
import { supabase } from "@/lib/supabase"

type Tricycle = {
  tricycle_id: string
  tricycle_number: string
  assigned_to: string | null
  phone_number: string | null
  created_at: string
}

export default function Tricycles() {
  const [tricycles, setTricycles] = useState<Tricycle[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingTricycle, setEditingTricycle] = useState<Tricycle | null>(null)

  // Add form
  const [tricycleNumber, setTricycleNumber] = useState("")
  const [assignedTo, setAssignedTo] = useState("")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // Edit form
  const [editNumber, setEditNumber] = useState("")
  const [editAssignedTo, setEditAssignedTo] = useState("")
  const [editPhoneNumber, setEditPhoneNumber] = useState("")

  const numberRef = useRef<HTMLInputElement>(null)

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    boxSizing: "border-box",
    borderRadius: 8,
    border: "1px solid #e0e0e0",
    fontSize: 14,
    background: "white",
    color: "#171717",
    minHeight: 48,
    transition: "border-color 0.2s ease",
  }

  useEffect(() => { fetchTricycles() }, [])

  async function fetchTricycles() {
    setLoading(true)
    const { data } = await supabase
      .from("tricycles")
      .select("tricycle_id, tricycle_number, assigned_to, phone_number, created_at")
      .order("created_at", { ascending: true })
    setTricycles(data || [])
    setLoading(false)
  }

  function closeModals() {
    setShowAddModal(false)
    setEditingTricycle(null)
    setDeletingId(null)
    setTricycleNumber("")
    setAssignedTo("")
    setPhoneNumber("")
    setEditNumber("")
    setEditAssignedTo("")
    setEditPhoneNumber("")
    setMessage("")
  }

  async function handleAdd() {
    if (!tricycleNumber.trim()) return setMessage("Tricycle number is required")

    setSubmitting(true)
    const { error } = await supabase.from("tricycles").insert([{
      tricycle_number: tricycleNumber.trim().toUpperCase(),
      assigned_to: assignedTo.trim() || null,
      phone_number: phoneNumber.trim() || null,
    }])
    setSubmitting(false)

    if (error) {
      setMessage(error.code === "23505" ? "That tricycle number already exists" : "Failed to add tricycle")
      return
    }
    closeModals()
    fetchTricycles()
  }

  async function handleUpdate() {
    if (!editingTricycle) return
    if (!editNumber.trim()) return setMessage("Tricycle number is required")

    setSubmitting(true)
    const { error } = await supabase
      .from("tricycles")
      .update({
        tricycle_number: editNumber.trim().toUpperCase(),
        assigned_to: editAssignedTo.trim() || null,
        phone_number: editPhoneNumber.trim() || null,
      })
      .eq("tricycle_id", editingTricycle.tricycle_id)
    setSubmitting(false)

    if (error) {
      setMessage(error.code === "23505" ? "That tricycle number already exists" : "Failed to update")
      return
    }
    closeModals()
    fetchTricycles()
  }

  async function handleDelete(id: string) {
    setSubmitting(true)
    await supabase.from("tricycles").delete().eq("tricycle_id", id)
    setSubmitting(false)
    closeModals()
    fetchTricycles()
  }

  const filtered = tricycles

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={{ margin: 0, color: "#171717" }}>Tricycles</h2>
        <button
          onClick={() => { setShowAddModal(true); setMessage("") }}
          style={{ padding: "10px 20px", background: "#0070f3", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold" }}
        >
          + Add Tricycle
        </button>
      </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
      </div>


      {!loading && filtered.map(t => (
        <div
          key={t.tricycle_id}
          style={{
            background: "white", border: "1px solid #eee", borderRadius: 10,
            padding: "14px 16px", display: "flex", alignItems: "center", gap: 16,
            boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
            marginBottom: 12,
          }}
        >
          {/* Tricycle number */}
          <div style={{ minWidth: 90 }}>
            <p style={{ margin: 0, fontWeight: "bold", fontSize: 15, color: "#171717", fontFamily: "monospace" }}>
              {t.tricycle_number}
            </p>
            <p style={{ margin: "3px 0 0", fontSize: 11, color: "#bbb" }}>
              Added {new Date(t.created_at).toLocaleDateString()}
            </p>
          </div>

          {/* Divider */}
          <div style={{ width: 1, alignSelf: "stretch", background: "#f0f0f0" }} />

          {/* Assignment info */}
          <div style={{ flex: 1 }}>
            {t.assigned_to ? (
              <>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#333" }}>{t.assigned_to}</p>
                {t.phone_number && (
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: "#888" }}>{t.phone_number}</p>
                )}
              </>
            ) : (
              <p style={{ margin: 0, fontSize: 12, color: "#ccc", fontStyle: "italic" }}>Unassigned</p>
            )}
          </div>

          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => {
                setEditingTricycle(t)
                setEditNumber(t.tricycle_number)
                setEditAssignedTo(t.assigned_to || "")
                setEditPhoneNumber(t.phone_number || "")
                setMessage("")
              }}
              style={{ padding: "5px 10px", cursor: "pointer", borderRadius: 4, border: "1px solid #0070f3", color: "#0070f3", background: "white", fontSize: 12 }}
            >
              Edit
            </button>
            <button
              onClick={() => { setDeletingId(t.tricycle_id); setMessage("") }}
              style={{ padding: "5px 10px", cursor: "pointer", borderRadius: 4, border: "1px solid #ff4444", color: "#ff4444", background: "white", fontSize: 12 }}
            >
              Delete
            </button>
          </div>
        </div>
      ))}

      {/* Modals */}
      {(showAddModal || editingTricycle || deletingId) && (
        <div onClick={closeModals} style={overlay}>
          <div onClick={e => e.stopPropagation()} style={modal}>

            {/* Add Modal */}
            {showAddModal && (
              <>
                <h3 style={{ marginBottom: 20, color: "#171717" }}>Add Tricycle</h3>
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Tricycle Number *</label>
                  <ModernInput
                    ref={numberRef}
                    type="text"
                    placeholder="e.g. TRC-001"
                    value={tricycleNumber}
                    onChange={e => { setTricycleNumber(e.target.value); setMessage("") }}
                    onKeyDown={e => { if (e.key === "Enter") handleAdd() }}
                    style={fieldStyle}
                    autoFocus
                  />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Assigned To</label>
                  <ModernInput
                    type="text"
                    placeholder="Full name of assignee"
                    value={assignedTo}
                    onChange={e => setAssignedTo(e.target.value)}
                    style={fieldStyle}
                  />
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={labelStyle}>Phone Number</label>
                  <ModernInput
                    type="tel"
                    placeholder="e.g. 08012345678"
                    value={phoneNumber}
                    onChange={e => setPhoneNumber(e.target.value)}
                    style={fieldStyle}
                  />
                </div>
                {message && <p style={errStyle}>{message}</p>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={closeModals} style={cancelBtn}>Cancel</button>
                  <button onClick={handleAdd} disabled={submitting} style={primaryBtn}>
                    {submitting ? "Adding..." : "Add Tricycle"}
                  </button>
                </div>
              </>
            )}

            {/* Edit Modal */}
            {editingTricycle && (
              <>
                <h3 style={{ marginBottom: 20, color: "#171717" }}>Edit Tricycle</h3>
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Tricycle Number *</label>
                  <ModernInput
                    type="text"
                    value={editNumber}
                    onChange={e => { setEditNumber(e.target.value); setMessage("") }}
                    style={fieldStyle}
                    autoFocus
                  />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Assigned To</label>
                  <ModernInput
                    type="text"
                    placeholder="Full name of assignee"
                    value={editAssignedTo}
                    onChange={e => setEditAssignedTo(e.target.value)}
                    style={fieldStyle}
                  />
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={labelStyle}>Phone Number</label>
                  <ModernInput
                    type="tel"
                    placeholder="e.g. 08012345678"
                    value={editPhoneNumber}
                    onChange={e => setEditPhoneNumber(e.target.value)}
                    style={fieldStyle}
                  />
                </div>
                {message && <p style={errStyle}>{message}</p>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={closeModals} style={cancelBtn}>Cancel</button>
                  <button onClick={handleUpdate} disabled={submitting} style={primaryBtn}>
                    {submitting ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </>
            )}

            {/* Delete Modal */}
            {deletingId && (
              <>
                <h3 style={{ marginBottom: 12, color: "#ff4444" }}>Delete Tricycle?</h3>
                <p style={{ marginBottom: 24, color: "#555" }}>
                  This cannot be undone. Any sales linked to this tricycle will lose the reference.
                </p>
                {message && <p style={errStyle}>{message}</p>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={closeModals} style={cancelBtn}>Cancel</button>
                  <button onClick={() => handleDelete(deletingId)} disabled={submitting} style={{ ...primaryBtn, background: "#ff4444" }}>
                    {submitting ? "Deleting..." : "Yes, Delete"}
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

const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }
const modal: React.CSSProperties = { background: "white", borderRadius: 12, padding: 32, width: 420, maxWidth: "90vw", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }
const labelStyle: React.CSSProperties = { display: "block", fontWeight: "bold", marginBottom: 6, fontSize: 14, color: "#171717" }
const inputStyle: React.CSSProperties = { width: "100%", padding: "12px 14px", boxSizing: "border-box", borderRadius: 8, border: "1.5px solid #ccc", fontSize: 14, background: "white", color: "#171717", minHeight: 48 }
const errStyle: React.CSSProperties = { color: "red", fontSize: 13, marginBottom: 12 }
const primaryBtn: React.CSSProperties = { flex: 1, padding: "12px 0", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold", fontSize: 15, minHeight: 48 }
const cancelBtn: React.CSSProperties = { flex: 1, padding: "12px 0", background: "white", border: "1.5px solid #ddd", borderRadius: 8, cursor: "pointer", fontSize: 15, minHeight: 48, color: "#171717" }