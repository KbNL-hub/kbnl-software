"use client"

import { useState, useEffect, useRef } from "react"
import { supabase } from "@/lib/supabase"

type TruckAdmin = {
  admin_id: string
  full_name: string
  phone_number: string | null
  status: string
}

export default function TruckAdmins() {
  const [admins, setAdmins] = useState<TruckAdmin[]>([])
  const [loading, setLoading] = useState(true)

  // Invite
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [fullName, setFullName] = useState("")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [email, setEmail] = useState("")
  const [inviteError, setInviteError] = useState("")
  const [inviteLoading, setInviteLoading] = useState(false)

  // Edit
  const [editingAdmin, setEditingAdmin] = useState<TruckAdmin | null>(null)
  const [editName, setEditName] = useState("")
  const [editPhone, setEditPhone] = useState("")
  const [editError, setEditError] = useState("")
  const [editLoading, setEditLoading] = useState(false)

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const phoneRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const editPhoneRef = useRef<HTMLInputElement>(null)

  useEffect(() => { fetchAdmins() }, [])

  async function fetchAdmins() {
    setLoading(true)
    const { data } = await supabase
      .from("truck_admins")
      .select("admin_id, full_name, phone_number, status")
      .order("full_name", { ascending: true })
    setAdmins(data || [])
    setLoading(false)
  }

  function closeModals() {
    setShowInviteModal(false)
    setEditingAdmin(null)
    setDeletingId(null)
    setFullName(""); setPhoneNumber(""); setEmail("")
    setEditName(""); setEditPhone("")
    setInviteError(""); setEditError("")
  }

  async function handleInvite() {
    if (!fullName.trim()) return setInviteError("Full name is required")
    if (!email.trim()) return setInviteError("Email is required")
    setInviteLoading(true)

    const res = await fetch("/api/invite-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, fullName, phoneNumber, role: "TruckAdmin" }),
    })
    const result = await res.json()
    setInviteLoading(false)
    if (!res.ok) { setInviteError("Failed: " + result.error); return }
    closeModals()
    fetchAdmins()
  }

  async function handleUpdate() {
    if (!editingAdmin) return
    if (!editName.trim()) return setEditError("Name is required")
    setEditLoading(true)
    const { error } = await supabase
      .from("truck_admins")
      .update({ full_name: editName, phone_number: editPhone || null })
      .eq("admin_id", editingAdmin.admin_id)
    setEditLoading(false)
    if (error) { setEditError("Failed to update"); return }
    closeModals()
    fetchAdmins()
  }

  async function handleDelete() {
    if (!deletingId) return
    setDeleteLoading(true)
    await supabase.from("truck_admins").delete().eq("admin_id", deletingId)
    setDeleteLoading(false)
    closeModals()
    fetchAdmins()
  }

  const statusColor = (status: string) => {
    switch (status) {
      case "Active": return { bg: "#00aa0022", color: "#00aa00" }
      case "Invited": return { bg: "#0070f322", color: "#0070f3" }
      case "Suspended": return { bg: "#ff444422", color: "#ff4444" }
      default: return { bg: "#eee", color: "#888" }
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>Truck Admins</h2>
        <button
          onClick={() => { setShowInviteModal(true); setInviteError("") }}
          style={{ padding: "10px 20px", background: "#0070f3", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold" }}
        >
          + Add Truck Admin
        </button>
      </div>

      {loading && <p style={{ color: "#888" }}>Loading...</p>}
      {!loading && admins.length === 0 && <p style={{ color: "#888" }}>No truck admins added yet.</p>}

      {!loading && admins.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#f0f0f0", textAlign: "left" }}>
                <th style={th}>Name</th>
                <th style={th}>Phone</th>
                <th style={th}>Status</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => {
                const { bg, color } = statusColor(a.status)
                return (
                  <tr key={a.admin_id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={td}><strong>{a.full_name}</strong></td>
                    <td style={td}>{a.phone_number || "—"}</td>
                    <td style={td}>
                      <span style={{ padding: "4px 10px", borderRadius: 12, fontSize: 12, background: bg, color, fontWeight: "bold" }}>
                        {a.status}
                      </span>
                    </td>
                    <td style={td}>
                      <button
                        onClick={() => { setEditingAdmin(a); setEditName(a.full_name); setEditPhone(a.phone_number || ""); setEditError("") }}
                        style={{ padding: "6px 12px", marginRight: 8, cursor: "pointer", borderRadius: 4, border: "1px solid #0070f3", color: "#0070f3", background: "white", fontSize: 12 }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeletingId(a.admin_id)}
                        style={{ padding: "6px 12px", cursor: "pointer", borderRadius: 4, border: "1px solid #ff4444", color: "#ff4444", background: "white", fontSize: 12 }}
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

      {(showInviteModal || editingAdmin || deletingId) && (
        <div onClick={closeModals} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 12, padding: 32, width: 420, maxWidth: "90vw", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>

            {/* Invite Modal */}
            {showInviteModal && (
              <>
                <h3 style={{ marginBottom: 20 }}>Add Truck Admin</h3>
                <div style={{ marginBottom: 16 }}>
                  <label style={label}>Full Name *</label>
                  <input type="text" placeholder="e.g. John Doe" value={fullName} onChange={(e) => { setFullName(e.target.value); setInviteError("") }} onKeyDown={(e) => { if (e.key === "Enter") phoneRef.current?.focus() }} style={inputStyle} autoFocus />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={label}>Phone Number</label>
                  <input ref={phoneRef} type="text" placeholder="e.g. 08012345678" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") emailRef.current?.focus() }} style={inputStyle} />
                </div>
                <div style={{ marginBottom: 24 }}>
                  <label style={label}>Email Address *</label>
                  <input ref={emailRef} type="email" placeholder="e.g. admin@example.com" value={email} onChange={(e) => { setEmail(e.target.value); setInviteError("") }} onKeyDown={(e) => { if (e.key === "Enter") handleInvite() }} style={inputStyle} />
                </div>
                {inviteError && <p style={errorStyle}>{inviteError}</p>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={closeModals} style={cancelBtn}>Cancel</button>
                  <button onClick={handleInvite} disabled={inviteLoading} style={primaryBtn}>{inviteLoading ? "Sending..." : "Send Invite"}</button>
                </div>
              </>
            )}

            {/* Edit Modal */}
            {editingAdmin && (
              <>
                <h3 style={{ marginBottom: 20 }}>Edit — {editingAdmin.full_name}</h3>
                <div style={{ marginBottom: 16 }}>
                  <label style={label}>Full Name *</label>
                  <input type="text" value={editName} onChange={(e) => { setEditName(e.target.value); setEditError("") }} onKeyDown={(e) => { if (e.key === "Enter") editPhoneRef.current?.focus() }} style={inputStyle} autoFocus />
                </div>
                <div style={{ marginBottom: 24 }}>
                  <label style={label}>Phone Number</label>
                  <input ref={editPhoneRef} type="text" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleUpdate() }} style={inputStyle} />
                </div>
                {editError && <p style={errorStyle}>{editError}</p>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={closeModals} style={cancelBtn}>Cancel</button>
                  <button onClick={handleUpdate} disabled={editLoading} style={primaryBtn}>{editLoading ? "Saving..." : "Save Changes"}</button>
                </div>
              </>
            )}

            {/* Delete Modal */}
            {deletingId && (
              <>
                <h3 style={{ marginBottom: 12, color: "#ff4444" }}>Delete Truck Admin?</h3>
                <p style={{ marginBottom: 24, color: "#555" }}>Are you sure? This cannot be undone.</p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={closeModals} style={cancelBtn}>Cancel</button>
                  <button onClick={handleDelete} disabled={deleteLoading} style={{ ...primaryBtn, background: "#ff4444" }}>{deleteLoading ? "Deleting..." : "Yes, Delete"}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = { padding: "12px 16px", fontWeight: "bold", fontSize: 13 }
const td: React.CSSProperties = { padding: "12px 16px" }
const label: React.CSSProperties = { display: "block", fontWeight: "bold", marginBottom: 6, fontSize: 14 }
const inputStyle: React.CSSProperties = { width: "100%", padding: 10, boxSizing: "border-box", borderRadius: 6, border: "1px solid #ddd", fontSize: 14 }
const errorStyle: React.CSSProperties = { color: "red", fontSize: 13, marginBottom: 12 }
const primaryBtn: React.CSSProperties = { flex: 1, padding: "10px 0", background: "#0070f3", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold" }
const cancelBtn: React.CSSProperties = { flex: 1, padding: "10px 0", background: "white", border: "1px solid #ddd", borderRadius: 6, cursor: "pointer" }