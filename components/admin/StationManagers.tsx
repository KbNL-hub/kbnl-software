"use client"

import { useState, useEffect, useRef } from "react"
import { supabase } from "@/lib/supabase"

type StationManager = {
  manager_id: string
  full_name: string
  phone_number: string | null
  status: string
  company_id: string
  company_name: string
}

type FuelCompany = {
  company_id: string
  company_name: string
}

export default function StationManagers() {
  const [managers, setManagers] = useState<StationManager[]>([])
  const [companies, setCompanies] = useState<FuelCompany[]>([])
  const [loading, setLoading] = useState(true)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingManager, setEditingManager] = useState<StationManager | null>(null)

  // Invite form
  const [fullName, setFullName] = useState("")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [email, setEmail] = useState("")
  const [companyId, setCompanyId] = useState("")

  // Edit form
  const [editName, setEditName] = useState("")
  const [editPhone, setEditPhone] = useState("")

  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const phoneRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const editPhoneRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchAll()
  }, [])

  async function fetchAll() {
    setLoading(true)
    await Promise.all([fetchManagers(), fetchCompanies()])
    setLoading(false)
  }

  async function fetchManagers() {
    const { data } = await supabase
      .from("station_managers")
      .select("manager_id, full_name, phone_number, status, company_id")
      .order("full_name", { ascending: true })

    if (!data) return

    const enriched = await Promise.all(
      data.map(async (m) => {
        const { data: company } = await supabase
          .from("fuel_companies")
          .select("company_name")
          .eq("company_id", m.company_id)
          .single()

        return {
          ...m,
          company_name: company?.company_name ?? "Unknown",
        }
      })
    )

    setManagers(enriched)
  }

  async function fetchCompanies() {
    const { data } = await supabase
      .from("fuel_companies")
      .select("company_id, company_name")
      .order("company_name", { ascending: true })
    setCompanies(data || [])
  }

  function closeModals() {
    setShowInviteModal(false)
    setEditingManager(null)
    setDeletingId(null)
    setFullName("")
    setPhoneNumber("")
    setEmail("")
    setCompanyId("")
    setEditName("")
    setEditPhone("")
    setMessage("")
  }

  async function handleInvite() {
    if (!fullName.trim()) return setMessage("Full name is required")
    if (!email.trim()) return setMessage("Email is required")
    if (!companyId) return setMessage("Select a fuel company")

    setSubmitting(true)
    const res = await fetch("/api/invite-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        fullName,
        phoneNumber,
        role: "StationManager",
        companyId,
      }),
    })

    const result = await res.json()
    setSubmitting(false)

    if (!res.ok) {
      setMessage("Failed: " + result.error)
      return
    }

    closeModals()
    fetchManagers()
  }

  async function handleUpdate() {
    if (!editingManager) return
    if (!editName.trim()) return setMessage("Name is required")

    setSubmitting(true)
    const { error } = await supabase
      .from("station_managers")
      .update({ full_name: editName, phone_number: editPhone || null })
      .eq("manager_id", editingManager.manager_id)

    setSubmitting(false)
    if (error) { setMessage("Failed to update"); return }
    closeModals()
    fetchManagers()
  }

  async function handleDelete(managerId: string) {
    setSubmitting(true)
    await supabase
      .from("station_managers")
      .delete()
      .eq("manager_id", managerId)
    setSubmitting(false)
    closeModals()
    fetchManagers()
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
        <h2 style={{ margin: 0 }}>Station Managers</h2>
        <button
          onClick={() => { setShowInviteModal(true); setMessage("") }}
          style={{
            padding: "10px 20px", background: "#0070f3", color: "white",
            border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold"
          }}
        >
          + Add Station Manager
        </button>
      </div>

      {loading && <p style={{ color: "#888" }}>Loading...</p>}
      {!loading && managers.length === 0 && <p style={{ color: "#888" }}>No station managers added yet.</p>}

      {!loading && managers.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#f0f0f0", textAlign: "left" }}>
                <th style={th}>Name</th>
                <th style={th}>Phone</th>
                <th style={th}>Company</th>
                <th style={th}>Status</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {managers.map((m) => {
                const { bg, color } = statusColor(m.status)
                return (
                  <tr key={m.manager_id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={td}><strong>{m.full_name}</strong></td>
                    <td style={td}>{m.phone_number || "—"}</td>
                    <td style={td}>{m.company_name}</td>
                    <td style={td}>
                      <span style={{
                        padding: "4px 10px", borderRadius: 12, fontSize: 12,
                        background: bg, color, fontWeight: "bold"
                      }}>
                        {m.status}
                      </span>
                    </td>
                    <td style={td}>
                      <button
                        onClick={() => {
                          setEditingManager(m)
                          setEditName(m.full_name)
                          setEditPhone(m.phone_number || "")
                          setMessage("")
                        }}
                        style={{
                          padding: "6px 12px", marginRight: 8, cursor: "pointer",
                          borderRadius: 4, border: "1px solid #0070f3",
                          color: "#0070f3", background: "white", fontSize: 12
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => { setDeletingId(m.manager_id); setMessage("") }}
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
      {(showInviteModal || editingManager || deletingId) && (
        <div
          onClick={closeModals}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white", borderRadius: 12, padding: 32,
              width: 420, maxWidth: "90vw", boxShadow: "0 8px 32px rgba(0,0,0,0.2)"
            }}
          >
            {/* Invite Modal */}
            {showInviteModal && (
              <>
                <h3 style={{ marginBottom: 20 }}>Add Station Manager</h3>
                <div style={{ marginBottom: 16 }}>
                  <label style={label}>Full Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. John Doe"
                    value={fullName}
                    onChange={(e) => { setFullName(e.target.value); setMessage("") }}
                    onKeyDown={(e) => { if (e.key === "Enter") phoneRef.current?.focus() }}
                    style={inputStyle}
                    autoFocus
                  />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={label}>Phone Number</label>
                  <input
                    ref={phoneRef}
                    type="text"
                    placeholder="e.g. 08012345678"
                    value={phoneNumber}
                    onChange={(e) => { setPhoneNumber(e.target.value); setMessage("") }}
                    onKeyDown={(e) => { if (e.key === "Enter") emailRef.current?.focus() }}
                    style={inputStyle}
                  />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={label}>Email Address *</label>
                  <input
                    ref={emailRef}
                    type="email"
                    placeholder="e.g. manager@example.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setMessage("") }}
                    style={inputStyle}
                  />
                </div>
                <div style={{ marginBottom: 24 }}>
                  <label style={label}>Fuel Company *</label>
                  <select
                    value={companyId}
                    onChange={(e) => { setCompanyId(e.target.value); setMessage("") }}
                    style={inputStyle}
                  >
                    <option value="">Select company</option>
                    {companies.map((c) => (
                      <option key={c.company_id} value={c.company_id}>{c.company_name}</option>
                    ))}
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

            {/* Edit Modal */}
            {editingManager && (
              <>
                <h3 style={{ marginBottom: 20 }}>Edit — {editingManager.full_name}</h3>
                <div style={{ marginBottom: 16 }}>
                  <label style={label}>Full Name *</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => { setEditName(e.target.value); setMessage("") }}
                    onKeyDown={(e) => { if (e.key === "Enter") editPhoneRef.current?.focus() }}
                    style={inputStyle}
                    autoFocus
                  />
                </div>
                <div style={{ marginBottom: 24 }}>
                  <label style={label}>Phone Number</label>
                  <input
                    ref={editPhoneRef}
                    type="text"
                    value={editPhone}
                    onChange={(e) => { setEditPhone(e.target.value); setMessage("") }}
                    onKeyDown={(e) => { if (e.key === "Enter") handleUpdate() }}
                    style={inputStyle}
                  />
                </div>
                <p style={{ fontSize: 13, color: "#888", marginBottom: 24 }}>
                  Assigned company: <strong>{editingManager.company_name}</strong>
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

            {/* Delete Modal */}
            {deletingId && (
              <>
                <h3 style={{ marginBottom: 12, color: "#ff4444" }}>Delete Station Manager?</h3>
                <p style={{ marginBottom: 24, color: "#555" }}>
                  Are you sure? This cannot be undone.
                </p>
                {message && <p style={errorStyle}>{message}</p>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={closeModals} style={cancelBtn}>Cancel</button>
                  <button
                    onClick={() => handleDelete(deletingId)}
                    disabled={submitting}
                    style={{ ...primaryBtn, background: "#ff4444" }}
                  >
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