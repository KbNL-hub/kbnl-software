"use client"

import { useState, useEffect, useRef } from "react"
import { supabase } from "@/lib/supabase"

type Broker = {
  broker_id: string
  broker_name: string
  phone_number: string
}

export default function ManageBrokers() {
  const [brokers, setBrokers] = useState<Broker[]>([])
  const [loading, setLoading] = useState(true)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [editingBroker, setEditingBroker] = useState<Broker | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [fullName, setFullName] = useState("")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [email, setEmail] = useState("")
  const [editName, setEditName] = useState("")
  const [editPhone, setEditPhone] = useState("")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const phoneRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const editPhoneRef = useRef<HTMLInputElement>(null)

  async function fetchBrokers() {
    const { data, error } = await supabase
      .from("Brokers")
      .select("broker_id, broker_name, phone_number")
      .order("broker_name", { ascending: true })

    if (!error) setBrokers(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchBrokers() }, [])

  function closeModals() {
    setShowInviteModal(false)
    setEditingBroker(null)
    setDeletingId(null)
    setFullName("")
    setPhoneNumber("")
    setEmail("")
    setEditName("")
    setEditPhone("")
    setMessage("")
  }

  async function handleInvite() {
    if (!fullName.trim()) return setMessage("Full name is required")
    if (!email.trim()) return setMessage("Email is required")

    setSubmitting(true)

    const res = await fetch("/api/invite-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, fullName, phoneNumber, role: "Broker" }),
    })

    const result = await res.json()
    setSubmitting(false)

    if (!res.ok) {
      setMessage("Failed: " + result.error)
      return
    }

    closeModals()
    fetchBrokers()
  }

  async function handleUpdate() {
    if (!editingBroker) return
    if (!editName.trim()) return setMessage("Name is required")

    setSubmitting(true)

    const { error } = await supabase
      .from("Brokers")
      .update({ broker_name: editName, phone_number: editPhone || null })
      .eq("broker_id", editingBroker.broker_id)

    setSubmitting(false)

    if (error) {
      setMessage("Failed to update broker")
      return
    }

    closeModals()
    fetchBrokers()
  }

  async function handleDelete(broker_id: string) {
    setSubmitting(true)

    const { error } = await supabase
      .from("Brokers")
      .delete()
      .eq("broker_id", broker_id)

    setSubmitting(false)

    if (error) {
      setMessage("Failed to delete broker")
      return
    }

    closeModals()
    fetchBrokers()
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>Manage Brokers</h2>
        <button
          onClick={() => setShowInviteModal(true)}
          style={{
            padding: "10px 20px", background: "#0070f3", color: "white",
            border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold"
          }}
        >
          + Add New Broker
        </button>
      </div>

      {loading && <p style={{ color: "#888" }}>Loading...</p>}
      {!loading && brokers.length === 0 && <p style={{ color: "#888" }}>No brokers found.</p>}

      {!loading && brokers.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#f0f0f0", textAlign: "left" }}>
                <th style={th}>Name</th>
                <th style={th}>Phone</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {brokers.map((broker) => (
                <tr key={broker.broker_id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={td}><strong>{broker.broker_name}</strong></td>
                  <td style={td}>{broker.phone_number || "—"}</td>
                  <td style={td}>
                    <button
                      onClick={() => {
                        setEditingBroker(broker)
                        setEditName(broker.broker_name)
                        setEditPhone(broker.phone_number || "")
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
                      onClick={() => { setDeletingId(broker.broker_id); setMessage("") }}
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
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Overlay */}
      {(showInviteModal || editingBroker || deletingId) && (
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

            {/* Invite Modal */}
            {showInviteModal && (
              <>
                <h3 style={{ marginBottom: 20 }}>Add New Broker</h3>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>Full Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. John Doe"
                    value={fullName}
                    onChange={(e) => { setFullName(e.target.value); setMessage("") }}
                    onKeyDown={(e) => { if (e.key === "Enter") phoneRef.current?.focus() }}
                    style={{ width: "100%", padding: 10, boxSizing: "border-box" }}
                  />
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>Phone Number</label>
                  <input
                    ref={phoneRef}
                    type="text"
                    placeholder="e.g. 08012345678"
                    value={phoneNumber}
                    onChange={(e) => { setPhoneNumber(e.target.value); setMessage("") }}
                    onKeyDown={(e) => { if (e.key === "Enter") emailRef.current?.focus() }}
                    style={{ width: "100%", padding: 10, boxSizing: "border-box" }}
                  />
                </div>

                <div style={{ marginBottom: 24 }}>
                  <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>Email Address *</label>
                  <input
                    ref={emailRef}
                    type="email"
                    placeholder="e.g. broker@example.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setMessage("") }}
                    onKeyDown={(e) => { if (e.key === "Enter") handleInvite() }}
                    style={{ width: "100%", padding: 10, boxSizing: "border-box" }}
                  />
                </div>

                {message && <p style={{ color: "red", marginBottom: 12, fontWeight: "bold" }}>{message}</p>}

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={handleInvite}
                    disabled={submitting}
                    style={{
                      flex: 1, padding: "10px 0", background: "#0070f3",
                      color: "white", border: "none", borderRadius: 6,
                      cursor: submitting ? "not-allowed" : "pointer"
                    }}
                  >
                    {submitting ? "Sending Invite..." : "Send Invite"}
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

            {/* Edit Modal */}
            {editingBroker && (
              <>
                <h3 style={{ marginBottom: 20 }}>Edit — {editingBroker.broker_name}</h3>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>Name *</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => { setEditName(e.target.value); setMessage("") }}
                    onKeyDown={(e) => { if (e.key === "Enter") editPhoneRef.current?.focus() }}
                    style={{ width: "100%", padding: 10, boxSizing: "border-box" }}
                  />
                </div>

                <div style={{ marginBottom: 24 }}>
                  <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>Phone Number</label>
                  <input
                    ref={editPhoneRef}
                    type="text"
                    value={editPhone}
                    onChange={(e) => { setEditPhone(e.target.value); setMessage("") }}
                    onKeyDown={(e) => { if (e.key === "Enter") handleUpdate() }}
                    style={{ width: "100%", padding: 10, boxSizing: "border-box" }}
                  />
                </div>

                {message && <p style={{ color: "red", marginBottom: 12, fontWeight: "bold" }}>{message}</p>}

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
                <h3 style={{ marginBottom: 12, color: "#ff4444" }}>Delete Broker</h3>
                <p style={{ marginBottom: 24 }}>
                  Are you sure? This cannot be undone.
                </p>

                {message && <p style={{ color: "red", marginBottom: 12, fontWeight: "bold" }}>{message}</p>}

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

const th: React.CSSProperties = { padding: "12px 16px", fontWeight: "bold", fontSize: 13 }
const td: React.CSSProperties = { padding: "12px 16px" }