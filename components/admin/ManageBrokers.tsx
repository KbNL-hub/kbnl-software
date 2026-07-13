"use client"

import { FONT_SIZE } from "@/lib/constants"

import { useState, useEffect, useRef } from "react"
import { supabase } from "@/lib/supabase"
import { apiMutate } from "@/lib/api-mutation"
import ModernInput from "@/components/ModernInput"
import InviteSuccessCard from "@/components/admin/InviteSuccessCard"
import { usePermissions } from "@/lib/PermissionContext"
import { formatAmount } from "@/lib/formatAmount"

type Broker = {
  broker_id: string
  broker_name: string
  phone_number: string
  profile_picture_url?: string
  credit_limit: number | null
}

type ViewMode = "card" | "table"

// Responsive breakpoint hook
function useBreakpoint() {
  const [isDesktop, setIsDesktop] = useState(false)
  const [isMobile, setIsMobile] = useState(true)

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640)
      setIsDesktop(window.innerWidth >= 640)
    }

    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  return { isMobile, isDesktop }
}


export default function ManageBrokers() {
  const { isMobile, isDesktop } = useBreakpoint()
  const { getAccess } = usePermissions()
  const canEdit = getAccess("manage-brokers").canEdit
  const [brokers, setBrokers] = useState<Broker[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>("card")
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [editingBroker, setEditingBroker] = useState<Broker | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  
  // Form states
  const [fullName, setFullName] = useState("")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [email, setEmail] = useState("")
  const [editName, setEditName] = useState("")
  const [editPhone, setEditPhone] = useState("")
  const [editCreditLimit, setEditCreditLimit] = useState("")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [inviteResult, setInviteResult] = useState<{ tempPassword: string; email: string } | null>(null)

  const phoneRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const editPhoneRef = useRef<HTMLInputElement>(null)

  async function fetchBrokers() {
    const { data, error } = await supabase
      .from("Brokers")
      .select("broker_id, broker_name, phone_number, profile_picture_url, credit_limit")
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
    setEditCreditLimit("")
    setMessage("")
    setInviteResult(null)
  }

  async function handleInvite() {
    if (!fullName.trim()) return setMessage("Full name is required")
    if (!email.trim()) return setMessage("Email is required")

    setSubmitting(true)

    try {
      const res = await fetch("/api/invite-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, fullName, phoneNumber, role: "Broker" }),
      })

      const result = await res.json()

      if (!res.ok) {
        setMessage("Failed: " + result.error)
        return
      }

      setInviteResult({ tempPassword: result.tempPassword, email })
      fetchBrokers()
    } catch {
      setMessage("Network error, please try again")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleUpdate() {
    if (!canEdit) return
    if (!editingBroker) return
    if (!editName.trim()) return setMessage("Name is required")

    setSubmitting(true)

    try {
      const parsedCreditLimit = editCreditLimit === "" ? null : Number(editCreditLimit.replace(/,/g, ""))
      const { error } = await apiMutate("admin", {
        action: "update",
        table: "Brokers",
        data: { broker_name: editName, phone_number: editPhone || null, credit_limit: parsedCreditLimit },
        filters: { broker_id: editingBroker.broker_id },
      })

      if (error) {
        setMessage(error)
        return
      }

      closeModals()
      fetchBrokers()
    } catch {
      setMessage("Network error, please try again")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(broker_id: string) {
    if (!canEdit) return
    setSubmitting(true)

    try {
      const { error } = await apiMutate("admin", {
        action: "delete",
        table: "Brokers",
        filters: { broker_id },
      })

      if (error) {
        setMessage(error)
        return
      }

      closeModals()
      fetchBrokers()
    } catch {
      setMessage("Network error, please try again")
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    boxSizing: "border-box",
    borderRadius: 8,
    border: "1px solid #e0e0e0",
    fontSize: FONT_SIZE.base,
    background: "white",
    color: "#171717",
    minHeight: 48,
    transition: "border-color 0.2s ease",
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: isMobile ? "16px" : "32px", fontFamily: "'Inter', sans-serif" }}>
      {/* Header & Controls */}
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 16, marginBottom: 32 }}>
        <div>
          <h1 style={{ margin: 0, color: "#0f172a", fontSize: isMobile ? FONT_SIZE["2xl"] : FONT_SIZE["3xl"], fontWeight: 700, letterSpacing: "-0.5px" }}>
            Brokers
          </h1>
          <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: FONT_SIZE.base }}>
            Manage the list of brokers and their contact info.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, width: isMobile ? "100%" : "auto" }}>
          {/* View Toggle */}
          {brokers.length > 0 && (
            <div style={{ display: "flex", background: "white", border: "1px solid #e2e8f0", borderRadius: 8, padding: 4, gap: 0 }}>
              <button
                onClick={() => setViewMode("card")}
                style={{
                  padding: "8px 12px",
                  background: viewMode === "card" ? "#0070f3" : "transparent",
                  color: viewMode === "card" ? "white" : "#64748b",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: FONT_SIZE.xs,
                  fontWeight: 600,
                  transition: "all 0.2s ease",
                  minWidth: 44,
                  height: 40,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
                title="Card view"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z"/></svg>
              </button>
              <button
                onClick={() => setViewMode("table")}
                style={{
                  padding: "8px 12px",
                  background: viewMode === "table" ? "#0070f3" : "transparent",
                  color: viewMode === "table" ? "white" : "#64748b",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: FONT_SIZE.xs,
                  fontWeight: 600,
                  transition: "all 0.2s ease",
                  minWidth: 44,
                  height: 40,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
                title="Table view"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 4h18v2H3V4zm0 7h18v2H3v-2zm0 7h18v2H3v-2z"/></svg>
              </button>
            </div>
          )}

          {/* Add Button */}
          <button
            onClick={() => setShowInviteModal(true)}
            disabled={!canEdit}
            style={{
              padding: isMobile ? "10px 16px" : "12px 20px",
              background: !canEdit ? "#94a3b8" : "#0070f3",
              color: "white",
              border: "none",
              borderRadius: 8,
              cursor: !canEdit ? "not-allowed" : "pointer",
              fontWeight: 600,
              fontSize: FONT_SIZE.md,
              flex: isMobile ? 1 : "0 0 auto",
              boxShadow: "0 4px 12px rgba(0, 112, 243, 0.2)",
              transition: "all 0.2s ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              minHeight: 40,
              whiteSpace: "nowrap"
            }}
            onMouseEnter={(e) => {
              if (!isMobile) (e.currentTarget.style.transform = "translateY(-2px)")
            }}
            onMouseLeave={(e) => {
              if (!isMobile) (e.currentTarget.style.transform = "none")
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c5.5 0 10 4.5 10 10s-4.5 10-10 10S2 17.5 2 12 6.5 2 12 2m0 2c-4.4 0-8 3.6-8 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8m3.5 9h-3v3h-1v-3h-3v-1h3v-3h1v3h3v1z"/></svg>
            Add Broker
          </button>
        </div>
      </div>

      {/* Content Section */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "64px 0" }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid #e2e8f0", borderTopColor: "#0070f3", animation: "spin 1s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : brokers.length === 0 ? (
        <div style={{ textAlign: "center", padding: "64px 24px", background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)" }}>
          <div style={{ width: 64, height: 64, background: "#f1f5f9", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <h3 style={{ margin: "0 0 8px", color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 600 }}>No brokers yet</h3>
          <p style={{ color: "#64748b", fontSize: FONT_SIZE.base, margin: "0 0 24px", maxWidth: 400, marginLeft: "auto", marginRight: "auto" }}>Get started by adding a new broker to the system. You'll be able to manage their contact information here.</p>
          <button
            onClick={() => setShowInviteModal(true)}
            disabled={!canEdit}
            style={{ padding: "10px 20px", background: !canEdit ? "#94a3b8" : "white", color: !canEdit ? "white" : "#0f172a", border: "1px solid #cbd5e1", borderRadius: 8, cursor: !canEdit ? "not-allowed" : "pointer", fontWeight: 500, fontSize: FONT_SIZE.base, transition: "all 0.2s ease" }}
            onMouseEnter={e => { if (canEdit) e.currentTarget.style.background = "#f8fafc" }}
            onMouseLeave={e => { if (canEdit) e.currentTarget.style.background = "white" }}
          >
            Add First Broker
          </button>
        </div>
      ) : (
        <>
          {/* Card View */}
          {viewMode === "card" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {brokers.map((broker) => (
                <div key={broker.broker_id} style={{ background: "white", borderRadius: 12, padding: 16, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)", transition: "all 0.2s ease" }} onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.08)"; e.currentTarget.style.borderColor = "#cbd5e1" }} onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.05)"; e.currentTarget.style.borderColor = "#e2e8f0" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                      <div style={{ width: 40, height: 40, borderRadius: "50%", background: broker.profile_picture_url ? "transparent" : "linear-gradient(135deg, #0070f3 0%, #0056d4 100%)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: FONT_SIZE.md, flexShrink: 0, overflow: "hidden" }}>
                        {broker.profile_picture_url ? (
                          <img src={broker.profile_picture_url} alt={broker.broker_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          broker.broker_name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <h3 style={{ margin: "0 0 4px 0", color: "#0f172a", fontSize: FONT_SIZE.lg, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{broker.broker_name}</h3>
                        <p style={{ margin: 0, color: "#64748b", fontSize: FONT_SIZE.sm, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{broker.phone_number || "No phone number"}</p>
                        {broker.credit_limit != null && (
                          <p style={{ margin: "2px 0 0", color: "#9ca3af", fontSize: 11 }}>Limit: ₦{formatAmount(String(broker.credit_limit))}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons - Tighter on Card View */}
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button
                      onClick={() => {
                        setEditingBroker(broker)
                        setEditName(broker.broker_name)
                        setEditPhone(broker.phone_number || "")
                        setEditCreditLimit(broker.credit_limit != null ? formatAmount(String(broker.credit_limit)) : "")
                        setMessage("")
                      }}
                      disabled={!canEdit}
                      style={{ flex: 1, padding: "8px 12px", cursor: !canEdit ? "not-allowed" : "pointer", borderRadius: 6, border: "1px solid #e2e8f0", color: "#0070f3", background: !canEdit ? "#94a3b8" : "#f0f7ff", fontSize: FONT_SIZE.sm, fontWeight: 500, transition: "all 0.2s" }}
                      onMouseEnter={e => { if (canEdit) { e.currentTarget.style.background = "#e0efff"; e.currentTarget.style.borderColor = "#0070f3" } }}
                      onMouseLeave={e => { if (canEdit) { e.currentTarget.style.background = "#f0f7ff"; e.currentTarget.style.borderColor = "#e2e8f0" } }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => { setDeletingId(broker.broker_id); setMessage("") }}
                      disabled={!canEdit}
                      style={{ flex: 1, padding: "8px 12px", cursor: !canEdit ? "not-allowed" : "pointer", borderRadius: 6, border: "1px solid #fee2e2", color: "#ef4444", background: !canEdit ? "#94a3b8" : "#fef2f2", fontSize: FONT_SIZE.sm, fontWeight: 500, transition: "all 0.2s" }}
                      onMouseEnter={e => { if (canEdit) e.currentTarget.style.background = "#fee2e2" }}
                      onMouseLeave={e => { if (canEdit) e.currentTarget.style.background = "#fef2f2" }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Table View */}
          {viewMode === "table" && (
            <div style={{ background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Name</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Phone Number</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Credit Limit</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {brokers.map((broker, idx) => (
                    <tr key={broker.broker_id} style={{ borderBottom: idx === brokers.length - 1 ? "none" : "1px solid #e2e8f0", transition: "background 0.2s ease" }} onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 36, height: 36, borderRadius: "50%", background: broker.profile_picture_url ? "transparent" : "linear-gradient(135deg, #0070f3 0%, #0056d4 100%)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: FONT_SIZE.base, flexShrink: 0, overflow: "hidden" }}>
                            {broker.profile_picture_url ? (
                              <img src={broker.profile_picture_url} alt={broker.broker_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            ) : (
                              broker.broker_name.charAt(0).toUpperCase()
                            )}
                          </div>
                          <span style={{ color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 500 }}>{broker.broker_name}</span>
                        </div>
                      </td>
                      <td style={{ padding: "12px 16px", color: "#475569", fontSize: FONT_SIZE.sm }}>
                        {broker.phone_number || <span style={{ color: "#94a3b8", fontStyle: "italic" }}>Not provided</span>}
                      </td>
                      <td style={{ padding: "12px 16px", color: "#475569", fontSize: FONT_SIZE.sm }}>
                        {broker.credit_limit != null ? `₦${formatAmount(String(broker.credit_limit))}` : <span style={{ color: "#94a3b8", fontStyle: "italic" }}>No limit</span>}
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <button
                            onClick={() => {
                              setEditingBroker(broker)
                              setEditName(broker.broker_name)
                              setEditPhone(broker.phone_number || "")
                              setMessage("")
                            }}
                            disabled={!canEdit}
                            style={{ padding: "6px 10px", cursor: !canEdit ? "not-allowed" : "pointer", borderRadius: 5, border: "1px solid #e2e8f0", color: "#0070f3", background: !canEdit ? "#94a3b8" : "#f0f7ff", fontSize: FONT_SIZE.sm, fontWeight: 500, transition: "all 0.2s", minHeight: 32, minWidth: 32, display: "flex", alignItems: "center", justifyContent: "center" }}
                            onMouseEnter={e => { if (canEdit) { e.currentTarget.style.background = "#e0efff"; e.currentTarget.style.borderColor = "#0070f3" } }}
                            onMouseLeave={e => { if (canEdit) { e.currentTarget.style.background = "#f0f7ff"; e.currentTarget.style.borderColor = "#e2e8f0" } }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => { setDeletingId(broker.broker_id); setMessage("") }}
                            disabled={!canEdit}
                            style={{ padding: "6px 10px", cursor: !canEdit ? "not-allowed" : "pointer", borderRadius: 5, border: "1px solid #fee2e2", color: "#ef4444", background: !canEdit ? "#94a3b8" : "#fef2f2", fontSize: FONT_SIZE.sm, fontWeight: 500, transition: "all 0.2s", minHeight: 32, minWidth: 32, display: "flex", alignItems: "center", justifyContent: "center" }}
                            onMouseEnter={e => { if (canEdit) e.currentTarget.style.background = "#fee2e2" }}
                            onMouseLeave={e => { if (canEdit) e.currentTarget.style.background = "#fef2f2" }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {(showInviteModal || editingBroker || deletingId) && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 100, padding: isMobile ? 0 : 24, animation: "fadeIn 0.2s ease-out" }}>
          <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
          <div style={{ background: "white", borderRadius: isMobile ? "20px 20px 0 0" : 12, padding: isMobile ? "28px 20px" : 32, width: "100%", maxWidth: 420, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)", animation: "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)" }}>
            
            {/* Invite Modal */}
            {showInviteModal && (
              <>
                {inviteResult ? (
                  <InviteSuccessCard
                    tempPassword={inviteResult.tempPassword}
                    email={inviteResult.email}
                    onClose={() => { closeModals(); setInviteResult(null) }}
                  />
                ) : (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                      <h3 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>Add New Broker</h3>
                      <button onClick={closeModals} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 0, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", transition: "color 0.2s" }} onMouseEnter={e => e.currentTarget.style.color = "#64748b"} onMouseLeave={e => e.currentTarget.style.color = "#94a3b8"}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
                      <div>
                        <label style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: FONT_SIZE.sm, fontWeight: 500 }}>Full Name *</label>
                        <ModernInput
                          type="text"
                          placeholder="e.g. John Doe"
                          value={fullName}
                          readOnly={!canEdit}
                          onChange={(e: any) => { setFullName(e.target.value); setMessage("") }}
                          onKeyDown={(e: any) => { if (e.key === "Enter") phoneRef.current?.focus() }}
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: FONT_SIZE.sm, fontWeight: 500 }}>Phone Number</label>
                        <ModernInput
                          ref={phoneRef}
                          type="text"
                          placeholder="e.g. 08012345678"
                          value={phoneNumber}
                          readOnly={!canEdit}
                          onChange={(e: any) => { setPhoneNumber(e.target.value); setMessage("") }}
                          onKeyDown={(e: any) => { if (e.key === "Enter") emailRef.current?.focus() }}
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: FONT_SIZE.sm, fontWeight: 500 }}>Email Address *</label>
                        <ModernInput
                          ref={emailRef}
                          type="email"
                          placeholder="e.g. broker@example.com"
                          value={email}
                          readOnly={!canEdit}
                          onChange={(e: any) => { setEmail(e.target.value); setMessage("") }}
                          onKeyDown={(e: any) => { if (e.key === "Enter") handleInvite() }}
                          style={inputStyle}
                        />
                      </div>
                    </div>

                    {message && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 20, color: "#b91c1c", fontSize: FONT_SIZE.sm }}>{message}</div>}

                    <button
                      onClick={handleInvite}
                      disabled={submitting || !canEdit}
                      style={{ width: "100%", padding: "12px 16px", background: submitting || !canEdit ? "#94a3b8" : "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: submitting || !canEdit ? "not-allowed" : "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, transition: "opacity 0.2s", opacity: submitting || !canEdit ? 0.7 : 1, minHeight: 44 }}
                    >
                      {submitting ? "Adding User..." : "Add User"}
                    </button>
                  </>
                )}
              </>
            )}

            {/* Edit Modal */}
            {editingBroker && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                  <h3 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>Edit Broker</h3>
                  <button onClick={closeModals} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 0, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", transition: "color 0.2s" }} onMouseEnter={e => e.currentTarget.style.color = "#64748b"} onMouseLeave={e => e.currentTarget.style.color = "#94a3b8"}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
                  <div>
                    <label style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: FONT_SIZE.sm, fontWeight: 500 }}>Name *</label>
                    <ModernInput
                      type="text"
                      value={editName}
                      readOnly={!canEdit}
                      onChange={(e: any) => { setEditName(e.target.value); setMessage("") }}
                      onKeyDown={(e: any) => { if (e.key === "Enter") editPhoneRef.current?.focus() }}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: FONT_SIZE.sm, fontWeight: 500 }}>Phone Number</label>
                    <ModernInput
                      ref={editPhoneRef}
                      type="text"
                      value={editPhone}
                      readOnly={!canEdit}
                      onChange={(e: any) => { setEditPhone(e.target.value); setMessage("") }}
                      onKeyDown={(e: any) => { if (e.key === "Enter") handleUpdate() }}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: FONT_SIZE.sm, fontWeight: 500 }}>Credit Limit (₦)</label>
                    <ModernInput
                      type="text"
                      placeholder="0"
                      value={editCreditLimit}
                      readOnly={!canEdit}
                      onChange={(e: any) => { setEditCreditLimit(formatAmount(e.target.value)); setMessage("") }}
                      style={inputStyle}
                    />
                  </div>
                </div>

                {message && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 20, color: "#b91c1c", fontSize: FONT_SIZE.sm }}>{message}</div>}

                <button
                  onClick={handleUpdate}
                  disabled={submitting || !canEdit}
                  style={{ width: "100%", padding: "12px 16px", background: submitting || !canEdit ? "#94a3b8" : "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: submitting || !canEdit ? "not-allowed" : "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, transition: "opacity 0.2s", opacity: submitting || !canEdit ? 0.7 : 1, minHeight: 44 }}
                >
                  {submitting ? "Saving..." : "Save Changes"}
                </button>
              </>
            )}

            {/* Delete Modal */}
            {deletingId && (
              <>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                  <div style={{ width: 64, height: 64, background: "#fef2f2", color: "#ef4444", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                  </div>
                  <h3 style={{ margin: "0 0 12px", color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>Delete Broker</h3>
                  <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: FONT_SIZE.base, lineHeight: 1.5 }}>Are you sure you want to delete this broker? This action cannot be undone and will permanently remove their data.</p>
                  
                  {message && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 20, color: "#b91c1c", fontSize: FONT_SIZE.sm, width: "100%", textAlign: "left" }}>{message}</div>}

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, width: "100%" }}>
                    <button
                      onClick={closeModals}
                      style={{ padding: "12px 16px", background: "white", color: "#475569", border: "1px solid #cbd5e1", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, minHeight: 44, transition: "all 0.2s" }}
                      onMouseEnter={e => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#0070f3"; e.currentTarget.style.color = "#0070f3" }}
                      onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#cbd5e1"; e.currentTarget.style.color = "#475569" }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleDelete(deletingId)}
                      disabled={submitting || !canEdit}
                      style={{ padding: "12px 16px", background: submitting || !canEdit ? "#94a3b8" : "#ef4444", color: "white", border: "none", borderRadius: 8, cursor: submitting || !canEdit ? "not-allowed" : "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, opacity: submitting || !canEdit ? 0.7 : 1, minHeight: 44, transition: "all 0.2s" }}
                      onMouseEnter={e => { if (!submitting && canEdit) e.currentTarget.style.background = "#dc2626" }}
                      onMouseLeave={e => { e.currentTarget.style.background = "#ef4444" }}
                    >
                      {submitting ? "Deleting..." : "Yes, Delete"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}