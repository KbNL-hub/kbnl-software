"use client"

import { useEffect, useRef, useState } from "react"
import { Icon } from "@iconify/react"
import { supabase } from "@/lib/supabase"

type ReportModalProps = {
  isOpen: boolean
  onClose: () => void
  userId: string
  userRole: string
}

export default function ReportModal({ isOpen, onClose, userId, userRole }: ReportModalProps) {
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleClose() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    setMessage("")
    setError("")
    setSuccess(false)
    setSubmitting(false)
    onClose()
  }

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    }
  }, [])

  if (!isOpen) return null

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
      const { error: insertError } = await supabase.from("reports").insert([{
        user_id: userId,
        role: userRole,
        message: message.trim(),
        resolved: false,
      }])

      if (insertError) {
        setError("Failed to submit. Try again.")
        return
      }

      setSuccess(true)
      closeTimerRef.current = setTimeout(() => {
        handleClose()
      }, 2000)
    } catch {
      setError("Failed to submit. Try again.")
    } finally {
      setSubmitting(false)
    }
  }

  const modalOverlay: React.CSSProperties = {
    position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)",
    backdropFilter: "blur(4px)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 100, padding: 24,
  }

  const modalBox: React.CSSProperties = {
    background: "white", borderRadius: 12, padding: 32,
    width: "100%", maxWidth: 480,
    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
    fontFamily: "'Inter', sans-serif",
  }

  const labelStyle: React.CSSProperties = {
    fontWeight: 600, display: "block",
    marginBottom: 8, fontSize: 13, color: "#475569",
  }

  return (
    <div style={modalOverlay} onClick={handleClose}>
      <div style={modalBox} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Submit Report</h2>
          <button
            onClick={handleClose}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#94a3b8", transition: "color 0.2s" }}
            onMouseEnter={e => e.currentTarget.style.color = "#475569"}
            onMouseLeave={e => e.currentTarget.style.color = "#94a3b8"}
          >
            <Icon icon="mdi:close" width={20} />
          </button>
        </div>

        {success ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <Icon icon="mdi:check-circle" width={48} color="#16a34a" style={{ marginBottom: 12 }} />
            <p style={{ fontSize: 16, fontWeight: 600, color: "#0f172a", margin: 0 }}>Report submitted successfully!</p>
          </div>
        ) : (
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

            {error && (
              <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                <Icon icon="mdi:alert-circle" width={16} color="#dc2626" />
                <span style={{ fontSize: 13, color: "#dc2626", fontWeight: 600 }}>{error}</span>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{
                width: "100%", padding: "14px 16px",
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
                <><Icon icon="mdi:send" width={16} /> Submit Report</>
              )}
            </button>
          </>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
