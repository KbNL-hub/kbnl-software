"use client"

import { useState, useEffect, useRef } from "react"
import { supabase } from "@/lib/supabase"

type OfficeClerk = {
  clerk_id: string
  full_name: string
  phone_number: string | null
  office_name: string
  status: string
}

const OFFICE_LOCATIONS = ["Uyo", "Ikom", "Calabar", "Ogoja"]

export default function OfficeClerks() {
  const [clerks, setClerks] = useState<OfficeClerk[]>([])
  const [loading, setLoading] = useState(true)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingClerk, setEditingClerk] = useState<OfficeClerk | null>(null)

  const [fullName, setFullName] = useState("")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [email, setEmail] = useState("")
  const [officeName, setOfficeName] = useState("")

  const [editName, setEditName] = useState("")
  const [editPhone, setEditPhone] = useState("")

  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const phoneRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const editPhoneRef = useRef<HTMLInputElement>(null)

  useEffect(() => { fetchClerks() }, [])

  async function fetchClerks() {
    setLoading(true)
    const { data } = await supabase
      .from("office_clerks")
      .select("clerk_id, full_name, phone_number, office_name, status")
      .order("full_name", { ascending: true })
    setClerks(data || [])
    setLoading(false)
  }

  function closeModals() {
    setShowInviteModal(false)
    setEditingClerk(null)
    setDeletingId(null)
    setFullName(""); setPhoneNumber(""); setEmail(""); setOfficeName("")
    setEditName(""); setEditPhone("")
    setMessage("")
  }

  async function handleInvite() {
    if (!fullName.trim()) return setMessage("Full name is required")
    if (!email.trim()) return setMessage("Email is required")
    if (!officeName) return setMessage("Select an office")

    setSubmitting(true)
    const res = await fetch("/api/invite-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email, fullName, phoneNumber,
        role: "OfficeClerk",
        officeName,
      }),
    })

    const result = await res.json()
    setSubmitting(false)

    if (!res.ok) { setMessage("Failed: " + result.error); return }
    closeModals()
    fetchClerks()
  }

  async function handleUpdate() {
    if (!editingClerk) return
    if (!editName.trim()) return setMessage("Name is required")

    setSubmitting(true)
    const { error } = await supabase
      .from("office_clerks")
      .update({ full_name: editName, phone_number: editPhone || null })
      .eq("clerk_id", editingClerk.clerk_id)

    setSubmitting(false)
    if (error) { setMessage("Failed to update"); return }
    closeModals()
    fetchClerks()
  }

  async function handleDelete(clerkId: string) {
    setSubmitting(true)
    await supabase.from("office_clerks").delete().eq("clerk_id", clerkId)
    setSubmitting(false)
    closeModals()
    fetchClerks()
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
        <h2 style={{ margin: 0 }}>Office Clerks</h2>
        <button
          onClick={() => { setShowInviteModal(true); setMessage("") }}
          style={{ padding: "10px 20px", background: "#0070f3", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold" }}
        >
          + Add Office Clerk
        </button>
      </div>

      {loading && <p style={{ color: "#888" }}>Loading...</p>}
      {!loading && clerks.length === 0 && <p style={{ color: "#888" }}>No office clerks added yet.</p>}

      {!loading && clerks.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#f0f0f0", textAlign: "left" }}>
                <th style={th}>Name</th>
                <th style={th}>Phone</th>
                <th style={th}>Office</th>
                <th style={th}>Status</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {clerks.map((c) => {
                const { bg, color } = statusColor(c.status)
                return (
                  <tr key={c.clerk_id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={td}><strong>{c.full_name}</strong></td>
                    <td style={td}>{c.phone_number || "—"}</td>
                    <td style={td}>{c.office_name}</td>
                    <td style={td}>
                      <span style={{ padding: "4px 10px", borderRadius: 12, fontSize: 12, background: bg, color, fontWeight: "bold" }}>
                        {c.status}
                      </span>
                    </td>
                    <td style={td}>
                      <button
                        onClick={() => { setEditingClerk(c); setEditName(c.full_name); setEditPhone(c.phone_number || ""); setMessage("") }}
                        style={{ padding: "6px 12px", marginRight: 8, cursor: "pointer", borderRadius: 4, border: "1px solid #0070f3", color: "#0070f3", background: "white", fontSize: 12 }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => { setDeletingId(c.clerk_id); setMessage("") }}
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

      {(showInviteModal || editingClerk || deletingId) && (
        <div onClick={closeModals} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 12, padding: 32, width: 420, maxWidth: "90vw", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>

            {showInviteModal && (
              <>
                <h3 style={{ marginBottom: 20 }}>Add Office Clerk</h3>
                <div style={{ marginBottom: 16 }}>
                  <label style={label}>Full Name *</label>
                  <input type="text" placeholder="e.g. John Doe" value={fullName} onChange={(e) => { setFullName(e.target.value); setMessage("") }} onKeyDown={(e) => { if (e.key === "Enter") phoneRef.current?.focus() }} style={inputStyle} autoFocus />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={label}>Phone Number</label>
                  <input ref={phoneRef} type="text" placeholder="e.g. 08012345678" value={phoneNumber} onChange={(e) => { setPhoneNumber(e.target.value); setMessage("") }} onKeyDown={(e) => { if (e.key === "Enter") emailRef.current?.focus() }} style={inputStyle} />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={label}>Email Address *</label>
                  <input ref={emailRef} type="email" placeholder="e.g. clerk@example.com" value={email} onChange={(e) => { setEmail(e.target.value); setMessage("") }} style={inputStyle} />
                </div>
                <div style={{ marginBottom: 24 }}>
                  <label style={label}>Assigned Office *</label>
                  <select value={officeName} onChange={(e) => { setOfficeName(e.target.value); setMessage("") }} style={inputStyle}>
                    <option value="">Select office</option>
                    {OFFICE_LOCATIONS.map(o => (<option key={o} value={o}>{o} Office</option>))}
                  </select>
                </div>
                {message && <p style={errorStyle}>{message}</p>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={closeModals} style={cancelBtn}>Cancel</button>
                  <button onClick={handleInvite} disabled={submitting} style={primaryBtn}>
                    {submitting ? "Sending Invite..." : "Send Invite"}
                  </button>
                </div>
              </>
            )}

            {editingClerk && (
              <>
                <h3 style={{ marginBottom: 20 }}>Edit — {editingClerk.full_name}</h3>
                <div style={{ marginBottom: 16 }}>
                  <label style={label}>Full Name *</label>
                  <input type="text" value={editName} onChange={(e) => { setEditName(e.target.value); setMessage("") }} onKeyDown={(e) => { if (e.key === "Enter") editPhoneRef.current?.focus() }} style={inputStyle} autoFocus />
                </div>
                <div style={{ marginBottom: 24 }}>
                  <label style={label}>Phone Number</label>
                  <input ref={editPhoneRef} type="text" value={editPhone} onChange={(e) => { setEditPhone(e.target.value); setMessage("") }} onKeyDown={(e) => { if (e.key === "Enter") handleUpdate() }} style={inputStyle} />
                </div>
                <p style={{ fontSize: 13, color: "#888", marginBottom: 24 }}>
                  Assigned office: <strong>{editingClerk.office_name}</strong>
                </p>
                {message && <p style={errorStyle}>{message}</p>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={closeModals} style={cancelBtn}>Cancel</button>
                  <button onClick={handleUpdate} disabled={submitting} style={primaryBtn}>
                    {submitting ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </>
            )}

            {deletingId && (
              <>
                <h3 style={{ marginBottom: 12, color: "#ff4444" }}>Delete Office Clerk?</h3>
                <p style={{ marginBottom: 24, color: "#555" }}>Are you sure? This cannot be undone.</p>
                {message && <p style={errorStyle}>{message}</p>}
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

const th: React.CSSProperties = { padding: "12px 16px", fontWeight: "bold", fontSize: 13 }
const td: React.CSSProperties = { padding: "12px 16px" }
const label: React.CSSProperties = { display: "block", fontWeight: "bold", marginBottom: 6, fontSize: 14 }
const inputStyle: React.CSSProperties = { width: "100%", padding: 10, boxSizing: "border-box", borderRadius: 6, border: "1px solid #ddd", fontSize: 14 }
const errorStyle: React.CSSProperties = { color: "red", fontSize: 13, marginBottom: 12 }
const primaryBtn: React.CSSProperties = { flex: 1, padding: "10px 0", background: "#0070f3", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold" }
const cancelBtn: React.CSSProperties = { flex: 1, padding: "10px 0", background: "white", border: "1px solid #ddd", borderRadius: 6, cursor: "pointer" }
