"use client"

import { useEffect, useRef, useState } from "react"
import { Icon } from "@iconify/react"
import { supabase } from "@/lib/supabase"
import { apiMutate } from "@/lib/api-mutation"

type ReportItem = {
  id: string
  message: string
  created_at: string
  resolved: boolean
  status: "Open" | "In Progress" | "Resolved"
  admin_reply: string | null
  admin_reply_at: string | null
}

type ReportModalProps = {
  isOpen: boolean
  onClose: () => void
  userId: string
  userRole: string
}

const fontSize = { xs: 12, sm: 13, base: 14, md: 15 }

function statusStyle(status: string) {
  if (status === "Resolved") return { bg: "#d1fae5", color: "#065f46", border: "#a7f3d0" }
  if (status === "In Progress") return { bg: "#dbeafe", color: "#1e40af", border: "#93c5fd" }
  return { bg: "#fef3c7", color: "#78350f", border: "#fde68a" }
}

export default function ReportModal({ isOpen, onClose, userId, userRole }: ReportModalProps) {
  const [mode, setMode] = useState<"list" | "form" | "success">("list")
  const [reports, setReports] = useState<ReportItem[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMode("list")
      setLoading(true)
      fetchReports()
    }
    return () => {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || mode !== "list") {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null }
      return
    }
    pollingRef.current = setInterval(fetchReports, 120000)
    return () => { if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, mode])

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    }
  }, [])

  async function fetchReports() {
    if (!userId) return
    const { data, error } = await supabase
      .from("reports")
      .select("id, message, created_at, resolved, status, admin_reply, admin_reply_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
    if (!error) {
      setReports((data || []) as ReportItem[])
    }
    setLoading(false)
  }

  function handleClose() {
    if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null }
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null }
    setMessage(""); setError(""); setSubmitting(false)
    setMode("list"); setReports([])
    onClose()
  }

  async function handleSubmit() {
    if (!userId.trim() || !userRole.trim()) {
      setError("Unable to identify your account. Please refresh and try again.")
      return
    }
    if (!message.trim()) {
      setError("Please describe your issue")
      return
    }
    setSubmitting(true)
    setError("")

    try {
      const { error: insertError } = await apiMutate("reports", {
        action: "insert", table: "reports",
        data: { user_id: userId, role: userRole, message: message.trim(), resolved: false, status: "Open" },
      })

      if (insertError) {
        setError("Failed to submit. Try again.")
        return
      }

      setMode("success")
      closeTimerRef.current = setTimeout(() => {
        setMode("list")
        setMessage("")
        fetchReports()
      }, 1500)
    } catch {
      setError("Failed to submit. Try again.")
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  const modalOverlay: React.CSSProperties = {
    position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)",
    backdropFilter: "blur(4px)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 100, padding: 24,
  }

  const modalBox: React.CSSProperties = {
    background: "white", borderRadius: 12, padding: 32,
    width: "100%", maxWidth: 480, maxHeight: "85vh", overflowY: "auto",
    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
    fontFamily: "'Inter', sans-serif",
  }

  const labelStyle: React.CSSProperties = {
    fontWeight: 600, display: "block",
    marginBottom: 8, fontSize: 13, color: "#475569",
  }

  const openCount = reports.filter(r => r.status === "Open").length
  const inProgressCount = reports.filter(r => r.status === "In Progress").length
  const resolvedCount = reports.filter(r => r.status === "Resolved").length

  return (
    <div style={modalOverlay} onClick={handleClose}>
      <div style={modalBox} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>
            {mode === "list" ? "My Complaints" : mode === "success" ? "" : "Submit Report"}
          </h2>
          <button
            onClick={handleClose}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#94a3b8", transition: "color 0.2s" }}
            onMouseEnter={e => e.currentTarget.style.color = "#475569"}
            onMouseLeave={e => e.currentTarget.style.color = "#94a3b8"}
          >
            <Icon icon="mdi:close" width={20} />
          </button>
        </div>

        {mode === "success" ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ width: 56, height: 56, background: "#f0fff4", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", border: "2px solid #86efac" }}>
              <Icon icon="mdi:check-circle" width={28} color="#16a34a" />
            </div>
            <p style={{ fontSize: 16, fontWeight: 600, color: "#0f172a", margin: 0 }}>Report submitted successfully!</p>
          </div>
        ) : mode === "form" ? (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Describe your issue</label>
              <textarea
                placeholder="Explain the problem you're experiencing..."
                value={message}
                onChange={e => { setMessage(e.target.value); setError("") }}
                style={{
                  width: "100%", padding: "12px 16px",
                  boxSizing: "border-box", borderRadius: 8,
                  border: "1.5px solid #e2e8f0", fontSize: 14,
                  background: "#f9f9f9", color: "#0f172a",
                  minHeight: 120, resize: "vertical",
                  outline: "none", fontFamily: "'Inter', sans-serif",
                  transition: "border-color 0.2s ease",
                }}
                onFocus={e => e.currentTarget.style.borderColor = "#f5a623"}
                onBlur={e => e.currentTarget.style.borderColor = "#e2e8f0"}
                autoFocus
              />
            </div>

            <div style={{ padding: "14px 16px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ width: 36, height: 36, background: "#dbeafe", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon icon="mdi:phone" width={18} color="#2563eb" />
              </div>
              <div style={{ flex: 1, minWidth: 140 }}>
                <p style={{ margin: 0, fontSize: 13, color: "#1e40af", fontWeight: 600 }}>Can&apos;t type? Call us directly</p>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "#3b82f6" }}>Prosper Betiang — 08128361851</p>
              </div>
              <a
                href="tel:08128361851"
                style={{
                  padding: "8px 16px", background: "#2563eb", color: "white",
                  border: "none", borderRadius: 6, cursor: "pointer",
                  fontWeight: 600, fontSize: fontSize.sm,
                  display: "flex", alignItems: "center", gap: 6,
                  minHeight: 36, textDecoration: "none",
                }}
              >
                <Icon icon="mdi:phone" width={14} /> Call Now
              </a>
            </div>

            {error && (
              <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                <Icon icon="mdi:alert-circle" width={16} color="#dc2626" />
                <span style={{ fontSize: 13, color: "#dc2626", fontWeight: 600 }}>{error}</span>
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => { setMode("list"); setMessage(""); setError("") }}
                style={{
                  padding: "14px 16px", background: "white", border: "1px solid #cbd5e1",
                  borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14,
                  color: "#475569", minHeight: 44, flex: 1,
                }}
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                style={{
                  flex: 1, padding: "14px 16px",
                  background: submitting ? "#94a3b8" : "#0070f3",
                  color: "white", border: "none", borderRadius: 8,
                  cursor: submitting ? "not-allowed" : "pointer",
                  fontWeight: 700, fontSize: 14,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  opacity: submitting ? 0.7 : 1,
                  transition: "all 0.2s ease",
                  minHeight: 44,
                }}
              >
                {submitting ? (
                  <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} /> Submitting...</>
                ) : (
                  <><Icon icon="mdi:send" width={16} /> Submit</>
                )}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ padding: "14px 16px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ width: 36, height: 36, background: "#dbeafe", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon icon="mdi:phone" width={18} color="#2563eb" />
              </div>
              <div style={{ flex: 1, minWidth: 140 }}>
                <p style={{ margin: 0, fontSize: 13, color: "#1e40af", fontWeight: 600 }}>Having trouble typing?</p>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "#3b82f6" }}>Call us directly — Prosper Betiang</p>
              </div>
              <a
                href="tel:08128361851"
                style={{
                  padding: "8px 16px", background: "#2563eb", color: "white",
                  border: "none", borderRadius: 6, cursor: "pointer",
                  fontWeight: 600, fontSize: fontSize.sm,
                  display: "flex", alignItems: "center", gap: 6,
                  minHeight: 36, textDecoration: "none",
                }}
              >
                <Icon icon="mdi:phone" width={14} /> 08128361851
              </a>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <p style={{ margin: 0, fontSize: fontSize.sm, color: "#64748b" }}>
                {openCount} open · {inProgressCount} in progress · {resolvedCount} resolved
              </p>
              <button
                onClick={() => { setMode("form"); setMessage(""); setError("") }}
                style={{
                  padding: "8px 16px", background: "#0070f3", color: "white",
                  border: "none", borderRadius: 6, cursor: "pointer",
                  fontWeight: 600, fontSize: fontSize.sm,
                  display: "flex", alignItems: "center", gap: 6,
                  minHeight: 36, transition: "all 0.2s ease",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "#0060df"}
                onMouseLeave={e => e.currentTarget.style.background = "#0070f3"}
              >
                <Icon icon="mdi:plus" width={16} /> New
              </button>
            </div>

            {loading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "32px 0" }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", border: "3px solid #e2e8f0", borderTopColor: "#0070f3", animation: "spin 1s linear infinite" }} />
              </div>
            ) : reports.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 24px" }}>
                <div style={{ width: 48, height: 48, background: "#f1f5f9", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                  <Icon icon="mdi:file-document-outline" width={24} color="#94a3b8" />
                </div>
                <p style={{ margin: 0, color: "#64748b", fontSize: fontSize.base }}>No reports yet</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {reports.map(r => {
                  const s = statusStyle(r.status)
                  return (
                    <div
                      key={r.id}
                      style={{
                        padding: "12px 14px", borderRadius: 8,
                        border: `1px solid ${s.border}`,
                        background: r.status === "Resolved" ? "#fafafa" : s.bg + "18",
                        opacity: r.status === "Resolved" ? 0.7 : 1,
                        transition: "all 0.2s ease",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: r.admin_reply ? 10 : 0 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: "0 0 4px", fontSize: fontSize.sm, color: "#0f172a", fontWeight: 500, lineHeight: 1.4, wordBreak: "break-word" }}>
                            {r.message.length > 100 ? r.message.slice(0, 100) + "…" : r.message}
                          </p>
                          <p style={{ margin: 0, fontSize: fontSize.xs, color: "#94a3b8" }}>
                            {new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                        <span style={{
                          padding: "3px 8px", borderRadius: 5, fontSize: fontSize.xs, fontWeight: 600,
                          background: s.bg, color: s.color, border: `1px solid ${s.border}`,
                          whiteSpace: "nowrap", flexShrink: 0,
                        }}>
                          {r.status}
                        </span>
                      </div>

                      {r.admin_reply && (
                        <div style={{
                          marginTop: 8, padding: "10px 12px", borderRadius: 6,
                          background: "#eef2ff", border: "1px solid #c7d2fe",
                          borderLeft: "3px solid #4f46e5",
                        }}>
                          <p style={{ margin: "0 0 4px", fontSize: fontSize.xs, fontWeight: 600, color: "#4338ca", textTransform: "uppercase", letterSpacing: 0.3 }}>
                            Admin Response
                          </p>
                          <p style={{ margin: "0 0 4px", fontSize: fontSize.sm, color: "#1e1b4b", lineHeight: 1.4, wordBreak: "break-word" }}>
                            {r.admin_reply}
                          </p>
                          {r.admin_reply_at && (
                            <p style={{ margin: 0, fontSize: fontSize.xs, color: "#6366f1" }}>
                              {new Date(r.admin_reply_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
