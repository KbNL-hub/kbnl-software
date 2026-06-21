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

type ViewMode = "card" | "table"

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

const fontSize = { xs: 12, sm: 13, base: 14, md: 15, lg: 16, xl: 20, "2xl": 24, "3xl": 28 }

export default function ManageTricycles() {
  const { isMobile, isDesktop } = useBreakpoint()
  const [tricycles, setTricycles] = useState<Tricycle[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>("card")
  const [showAddModal, setShowAddModal] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingTricycle, setEditingTricycle] = useState<Tricycle | null>(null)

  const [tricycleNumber, setTricycleNumber] = useState("")
  const [assignedTo, setAssignedTo] = useState("")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [editNumber, setEditNumber] = useState("")
  const [editAssignedTo, setEditAssignedTo] = useState("")
  const [editPhoneNumber, setEditPhoneNumber] = useState("")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const numberRef = useRef<HTMLInputElement>(null)

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    boxSizing: "border-box",
    borderRadius: 8,
    border: "1px solid #e0e0e0",
    fontSize: fontSize.base,
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

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: isMobile ? "16px" : "32px", fontFamily: "'Inter', sans-serif" }}>
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 16, marginBottom: 32 }}>
        <div>
          <h1 style={{ margin: 0, color: "#0f172a", fontSize: isMobile ? fontSize["2xl"] : fontSize["3xl"], fontWeight: 700, letterSpacing: "-0.5px" }}>
            Tricycles
          </h1>
          <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: fontSize.base }}>
            Manage tricycle fleet and assignments.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, width: isMobile ? "100%" : "auto" }}>
          {tricycles.length > 0 && (
            <div style={{ display: "flex", background: "white", border: "1px solid #e2e8f0", borderRadius: 8, padding: 4, gap: 0 }}>
              <button onClick={() => setViewMode("card")} style={{ padding: "8px 12px", background: viewMode === "card" ? "#0070f3" : "transparent", color: viewMode === "card" ? "white" : "#64748b", border: "none", borderRadius: 6, cursor: "pointer", fontSize: fontSize.xs, fontWeight: 600, transition: "all 0.2s ease", minWidth: 44, height: 40, display: "flex", alignItems: "center", justifyContent: "center" }} title="Card view">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z" /></svg>
              </button>
              <button onClick={() => setViewMode("table")} style={{ padding: "8px 12px", background: viewMode === "table" ? "#0070f3" : "transparent", color: viewMode === "table" ? "white" : "#64748b", border: "none", borderRadius: 6, cursor: "pointer", fontSize: fontSize.xs, fontWeight: 600, transition: "all 0.2s ease", minWidth: 44, height: 40, display: "flex", alignItems: "center", justifyContent: "center" }} title="Table view">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 4h18v2H3V4zm0 7h18v2H3v-2zm0 7h18v2H3v-2z" /></svg>
              </button>
            </div>
          )}

          <button onClick={() => { setShowAddModal(true); setMessage("") }} style={{ padding: isMobile ? "10px 16px" : "12px 20px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: fontSize.md, flex: isMobile ? 1 : "0 0 auto", boxShadow: "0 4px 12px rgba(0, 112, 243, 0.2)", transition: "all 0.2s ease", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 40, whiteSpace: "nowrap" }} onMouseEnter={(e) => { if (!isMobile) e.currentTarget.style.transform = "translateY(-2px)" }} onMouseLeave={(e) => { if (!isMobile) e.currentTarget.style.transform = "none" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c5.5 0 10 4.5 10 10s-4.5 10-10 10S2 17.5 2 12 6.5 2 12 2m0 2c-4.4 0-8 3.6-8 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8m3.5 9h-3v3h-1v-3h-3v-1h3v-3h1v3h3v1z" /></svg>
            Add Tricycle
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "64px 0" }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid #e2e8f0", borderTopColor: "#0070f3", animation: "spin 1s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : tricycles.length === 0 ? (
        <div style={{ textAlign: "center", padding: "64px 24px", background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)" }}>
          <div style={{ width: 64, height: 64, background: "#f1f5f9", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M3 3h18v18H3z" /><path d="M3 3h18M3 9h18M9 3v18" /></svg>
          </div>
          <h3 style={{ margin: "0 0 8px", color: "#0f172a", fontSize: fontSize.xl, fontWeight: 600 }}>No tricycles yet</h3>
          <p style={{ color: "#64748b", fontSize: fontSize.base, margin: "0 0 24px", maxWidth: 400, marginLeft: "auto", marginRight: "auto" }}>Add tricycles to track your fleet and manage assignments.</p>
          <button onClick={() => { setShowAddModal(true); setMessage("") }} style={{ padding: "10px 20px", background: "white", color: "#0f172a", border: "1px solid #cbd5e1", borderRadius: 8, cursor: "pointer", fontWeight: 500, fontSize: fontSize.base, transition: "all 0.2s ease" }} onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"} onMouseLeave={e => e.currentTarget.style.background = "white"}>
            Add First Tricycle
          </button>
        </div>
      ) : (
        <>
          {viewMode === "card" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {tricycles.map((t) => (
                <div key={t.tricycle_id} style={{ background: "white", borderRadius: 12, padding: 16, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)", transition: "all 0.2s ease" }} onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.08)"; e.currentTarget.style.borderColor = "#cbd5e1" }} onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.05)"; e.currentTarget.style.borderColor = "#e2e8f0" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                    <div>
                      <p style={{ margin: 0, fontFamily: "monospace", fontWeight: 600, fontSize: fontSize.lg, color: "#0f172a" }}>
                        {t.tricycle_number}
                      </p>
                      <p style={{ margin: "4px 0 0", fontSize: fontSize.xs, color: "#94a3b8" }}>
                        Added {new Date(t.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div style={{ padding: "12px 0", borderTop: "1px solid #f1f5f9", borderBottom: "1px solid #f1f5f9", marginBottom: 12 }}>
                    {t.assigned_to ? (
                      <>
                        <p style={{ margin: 0, fontWeight: 500, fontSize: fontSize.sm, color: "#0f172a" }}>
                          {t.assigned_to}
                        </p>
                        {t.phone_number && (
                          <p style={{ margin: "4px 0 0", fontSize: fontSize.sm, color: "#64748b" }}>
                            {t.phone_number}
                          </p>
                        )}
                      </>
                    ) : (
                      <p style={{ margin: 0, fontSize: fontSize.sm, color: "#94a3b8", fontStyle: "italic" }}>
                        Unassigned
                      </p>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => { setEditingTricycle(t); setEditNumber(t.tricycle_number); setEditAssignedTo(t.assigned_to || ""); setEditPhoneNumber(t.phone_number || ""); setMessage("") }} style={{ flex: 1, padding: "8px 12px", cursor: "pointer", borderRadius: 6, border: "1px solid #e2e8f0", color: "#0070f3", background: "#f0f7ff", fontSize: fontSize.sm, fontWeight: 500, transition: "all 0.2s" }} onMouseEnter={e => { e.currentTarget.style.background = "#e0efff"; e.currentTarget.style.borderColor = "#0070f3" }} onMouseLeave={e => { e.currentTarget.style.background = "#f0f7ff"; e.currentTarget.style.borderColor = "#e2e8f0" }}>
                      Edit
                    </button>
                    <button onClick={() => { setDeletingId(t.tricycle_id); setMessage("") }} style={{ flex: 1, padding: "8px 12px", cursor: "pointer", borderRadius: 6, border: "1px solid #fee2e2", color: "#ef4444", background: "#fef2f2", fontSize: fontSize.sm, fontWeight: 500, transition: "all 0.2s" }} onMouseEnter={e => { e.currentTarget.style.background = "#fee2e2" }} onMouseLeave={e => { e.currentTarget.style.background = "#fef2f2" }}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {viewMode === "table" && (
            <div style={{ background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: fontSize.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Number</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: fontSize.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Assigned To</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: fontSize.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Phone</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: fontSize.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Added</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: fontSize.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tricycles.map((t, idx) => (
                    <tr key={t.tricycle_id} style={{ borderBottom: idx === tricycles.length - 1 ? "none" : "1px solid #e2e8f0", transition: "background 0.2s ease" }} onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <td style={{ padding: "12px 16px", fontFamily: "monospace", fontWeight: 600, fontSize: fontSize.base, color: "#0f172a" }}>
                        {t.tricycle_number}
                      </td>
                      <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: fontSize.sm, fontWeight: 500 }}>
                        {t.assigned_to || <span style={{ color: "#94a3b8", fontStyle: "italic" }}>Unassigned</span>}
                      </td>
                      <td style={{ padding: "12px 16px", color: "#475569", fontSize: fontSize.sm }}>
                        {t.phone_number || <span style={{ color: "#94a3b8", fontStyle: "italic" }}>—</span>}
                      </td>
                      <td style={{ padding: "12px 16px", color: "#64748b", fontSize: fontSize.sm }}>
                        {new Date(t.created_at).toLocaleDateString()}
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <button onClick={() => { setEditingTricycle(t); setEditNumber(t.tricycle_number); setEditAssignedTo(t.assigned_to || ""); setEditPhoneNumber(t.phone_number || ""); setMessage("") }} style={{ padding: "6px 10px", cursor: "pointer", borderRadius: 5, border: "1px solid #e2e8f0", color: "#0070f3", background: "#f0f7ff", fontSize: fontSize.sm, fontWeight: 500, transition: "all 0.2s", minHeight: 32, minWidth: 32, display: "flex", alignItems: "center", justifyContent: "center" }} onMouseEnter={e => { e.currentTarget.style.background = "#e0efff"; e.currentTarget.style.borderColor = "#0070f3" }} onMouseLeave={e => { e.currentTarget.style.background = "#f0f7ff"; e.currentTarget.style.borderColor = "#e2e8f0" }}>
                            Edit
                          </button>
                          <button onClick={() => { setDeletingId(t.tricycle_id); setMessage("") }} style={{ padding: "6px 10px", cursor: "pointer", borderRadius: 5, border: "1px solid #fee2e2", color: "#ef4444", background: "#fef2f2", fontSize: fontSize.sm, fontWeight: 500, transition: "all 0.2s", minHeight: 32, minWidth: 32, display: "flex", alignItems: "center", justifyContent: "center" }} onMouseEnter={e => { e.currentTarget.style.background = "#fee2e2" }} onMouseLeave={e => { e.currentTarget.style.background = "#fef2f2" }}>
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

      {(showAddModal || editingTricycle || deletingId) && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 100, padding: isMobile ? 0 : 24, animation: "fadeIn 0.2s ease-out" }}>
          <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
          <div style={{ background: "white", borderRadius: isMobile ? "20px 20px 0 0" : 12, padding: isMobile ? "28px 20px" : 32, width: "100%", maxWidth: 420, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)", animation: "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)" }}>

            {showAddModal && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                  <h3 style={{ margin: 0, color: "#0f172a", fontSize: fontSize.xl, fontWeight: 700 }}>Add Tricycle</h3>
                  <button onClick={closeModals} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 0, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", transition: "color 0.2s" }} onMouseEnter={e => e.currentTarget.style.color = "#64748b"} onMouseLeave={e => e.currentTarget.style.color = "#94a3b8"}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
                  <div>
                    <label style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: fontSize.sm, fontWeight: 500 }}>Tricycle Number *</label>
                    <ModernInput ref={numberRef} type="text" placeholder="e.g. TRC-001" value={tricycleNumber} onChange={e => { setTricycleNumber(e.target.value); setMessage("") }} onKeyDown={e => { if (e.key === "Enter") handleAdd() }} style={fieldStyle} autoFocus />
                  </div>
                  <div>
                    <label style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: fontSize.sm, fontWeight: 500 }}>Assigned To</label>
                    <ModernInput type="text" placeholder="Full name of assignee" value={assignedTo} onChange={e => setAssignedTo(e.target.value)} style={fieldStyle} />
                  </div>
                  <div>
                    <label style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: fontSize.sm, fontWeight: 500 }}>Phone Number</label>
                    <ModernInput type="tel" placeholder="e.g. 08012345678" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} style={fieldStyle} />
                  </div>
                </div>
                {message && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 20, color: "#b91c1c", fontSize: fontSize.sm }}>{message}</div>}
                <button onClick={handleAdd} disabled={submitting} style={{ width: "100%", padding: "12px 16px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: submitting ? "not-allowed" : "pointer", fontWeight: 600, fontSize: fontSize.md, transition: "opacity 0.2s", opacity: submitting ? 0.7 : 1, minHeight: 44 }}>
                  {submitting ? "Adding..." : "Add Tricycle"}
                </button>
              </>
            )}

            {editingTricycle && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                  <h3 style={{ margin: 0, color: "#0f172a", fontSize: fontSize.xl, fontWeight: 700 }}>Edit Tricycle</h3>
                  <button onClick={closeModals} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 0, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", transition: "color 0.2s" }} onMouseEnter={e => e.currentTarget.style.color = "#64748b"} onMouseLeave={e => e.currentTarget.style.color = "#94a3b8"}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
                  <div>
                    <label style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: fontSize.sm, fontWeight: 500 }}>Tricycle Number *</label>
                    <ModernInput type="text" value={editNumber} onChange={e => { setEditNumber(e.target.value); setMessage("") }} style={fieldStyle} autoFocus />
                  </div>
                  <div>
                    <label style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: fontSize.sm, fontWeight: 500 }}>Assigned To</label>
                    <ModernInput type="text" placeholder="Full name of assignee" value={editAssignedTo} onChange={e => setEditAssignedTo(e.target.value)} style={fieldStyle} />
                  </div>
                  <div>
                    <label style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: fontSize.sm, fontWeight: 500 }}>Phone Number</label>
                    <ModernInput type="tel" placeholder="e.g. 08012345678" value={editPhoneNumber} onChange={e => setEditPhoneNumber(e.target.value)} style={fieldStyle} />
                  </div>
                </div>
                {message && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 20, color: "#b91c1c", fontSize: fontSize.sm }}>{message}</div>}
                <button onClick={handleUpdate} disabled={submitting} style={{ width: "100%", padding: "12px 16px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: submitting ? "not-allowed" : "pointer", fontWeight: 600, fontSize: fontSize.md, transition: "opacity 0.2s", opacity: submitting ? 0.7 : 1, minHeight: 44 }}>
                  {submitting ? "Saving..." : "Save Changes"}
                </button>
              </>
            )}

            {deletingId && (
              <>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                  <div style={{ width: 64, height: 64, background: "#fef2f2", color: "#ef4444", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
                  </div>
                  <h3 style={{ margin: "0 0 12px", color: "#0f172a", fontSize: fontSize.xl, fontWeight: 700 }}>Delete Tricycle</h3>
                  <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: fontSize.base, lineHeight: 1.5 }}>This cannot be undone. Any sales linked to this tricycle will lose the reference.</p>
                  {message && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 20, color: "#b91c1c", fontSize: fontSize.sm, width: "100%", textAlign: "left" }}>{message}</div>}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, width: "100%" }}>
                    <button onClick={closeModals} style={{ padding: "12px 16px", background: "white", color: "#475569", border: "1px solid #cbd5e1", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: fontSize.md, minHeight: 44, transition: "all 0.2s" }} onMouseEnter={e => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#0070f3"; e.currentTarget.style.color = "#0070f3" }} onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#cbd5e1"; e.currentTarget.style.color = "#475569" }}>
                      Cancel
                    </button>
                    <button onClick={() => handleDelete(deletingId)} disabled={submitting} style={{ padding: "12px 16px", background: "#ef4444", color: "white", border: "none", borderRadius: 8, cursor: submitting ? "not-allowed" : "pointer", fontWeight: 600, fontSize: fontSize.md, opacity: submitting ? 0.7 : 1, minHeight: 44, transition: "all 0.2s" }} onMouseEnter={e => { if (!submitting) e.currentTarget.style.background = "#dc2626" }} onMouseLeave={e => { e.currentTarget.style.background = "#ef4444" }}>
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