"use client"

import { useState, useEffect } from "react"
import { Icon } from "@iconify/react"
import { supabase } from "@/lib/supabase"
import { apiMutate } from "@/lib/api-mutation"
import { useBreakpoint } from "@/app/hooks/useBreakpoint"
import { toISOString } from "@/lib/date-utils"

const OFFICES = ["Calabar", "Ikom", "Ogoja", "Uyo", "Haulage"]

type Expense = {
  expense_id: string
  office_name: string
  clerk_id: string
  title: string
  total_amount: number
  status: "Pending" | "Authorised" | "Rejected" | "Posted"
  authorised_by: string | null
  created_at: string
  posted_by: string | null
  posted_at: string | null
}

type ViewMode = "card" | "table"

const fontSize = { xs: 12, sm: 13, base: 14, md: 15, lg: 16, xl: 20, "2xl": 24, "3xl": 28 }

const officeStyle = (o: string) => {
  const map: Record<string, { bg: string; color: string; border: string }> = {
    Calabar: { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" },
    Ikom:    { bg: "#f5f3ff", color: "#5b21b6", border: "#ddd6fe" },
    Ogoja:   { bg: "#fffbeb", color: "#92400e", border: "#fde68a" },
    Uyo:     { bg: "#ecfdf5", color: "#065f46", border: "#a7f3d0" },
    Haulage: { bg: "#fef2f2", color: "#991b1b", border: "#fecaca" },
  }
  return map[o] || { bg: "#f1f5f9", color: "#475569", border: "#e2e8f0" }
}

const statusStyle = (s: string) => {
  if (s === "Authorised") return { bg: "#d1fae5", color: "#065f46", border: "#a7f3d0" }
  if (s === "Posted") return { bg: "#dbeafe", color: "#1e40af", border: "#bfdbfe" }
  if (s === "Rejected") return { bg: "#fef2f2", color: "#dc2626", border: "#fecaca" }
  return { bg: "#f0f7ff", color: "#0c4a6e", border: "#bfdbfe" }
}

export default function CashExpensesPosting() {
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"

  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>("card")
  const [selectedOffice, setSelectedOffice] = useState("All")
  const [filterStatus, setFilterStatus] = useState("All")
  const [profilesMap, setProfilesMap] = useState<Record<string, string>>({})

  const [showModal, setShowModal] = useState(false)
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => { initData() }, [])

  async function initData() {
    setLoading(true)
    const { data: profiles } = await supabase.from("Profiles").select("user_id, full_name")
    const pMap: Record<string, string> = {}
    profiles?.forEach(p => { pMap[p.user_id] = p.full_name })
    setProfilesMap(pMap)
    await fetchExpenses()
  }

  async function fetchExpenses() {
    const { data } = await supabase
      .from("cash_expenses")
      .select("expense_id, office_name, clerk_id, title, total_amount, status, authorised_by, created_at, posted_by, posted_at")
      .order("created_at", { ascending: false })
    if (data) setExpenses(data)
    setLoading(false)
  }

  function openPostModal(expense: Expense) {
    setSelectedExpense(expense)
    setMessage("")
    setShowModal(true)
  }

  async function handlePost() {
    if (!selectedExpense) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setSubmitting(true); setMessage("")
    const { error } = await apiMutate("finance", {
      action: "update",
      table: "cash_expenses",
      data: { posted_by: user.id, posted_at: toISOString(), status: "Posted" },
      filters: { expense_id: selectedExpense.expense_id },
    })

    if (error) setMessage("Failed to post: " + error)
    else { setShowModal(false); fetchExpenses() }
    setSubmitting(false)
  }

  const filtered = expenses.filter(e => {
    if (selectedOffice !== "All" && e.office_name !== selectedOffice) return false
    if (filterStatus === "All") return e.status === "Authorised" || e.status === "Posted"
    return e.status === filterStatus
  })

  const thStyle: React.CSSProperties = {
    padding: "12px 16px", fontWeight: 600, fontSize: fontSize.xs,
    color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px",
  }

  const statusFilters = ["All", "Authorised", "Posted"] as const

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: isMobile ? 20 : 22, color: "#171717", fontWeight: 700 }}>Cash Movement Register</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {filtered.length > 0 && (
            <div style={{ display: "flex", background: "white", border: "1px solid #e2e8f0", borderRadius: 8, padding: 4, gap: 0 }}>
              <button onClick={() => setViewMode("card")} style={{
                padding: "8px 12px", background: viewMode === "card" ? "#0070f3" : "transparent",
                color: viewMode === "card" ? "white" : "#64748b", border: "none", borderRadius: 6,
                cursor: "pointer", fontSize: fontSize.xs, fontWeight: 600, transition: "all 0.2s ease",
                minWidth: 44, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
              }} title="Card view">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z"/></svg>
              </button>
              <button onClick={() => setViewMode("table")} style={{
                padding: "8px 12px", background: viewMode === "table" ? "#0070f3" : "transparent",
                color: viewMode === "table" ? "white" : "#64748b", border: "none", borderRadius: 6,
                cursor: "pointer", fontSize: fontSize.xs, fontWeight: 600, transition: "all 0.2s ease",
                minWidth: 44, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
              }} title="Table view">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 4h18v2H3V4zm0 7h18v2H3v-2zm0 7h18v2H3v-2z"/></svg>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Office Filter Dropdown (like CustomerPayments.tsx select) */}
      <div style={{ marginBottom: 16, maxWidth: 320 }}>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: fontSize.sm, color: "#475569" }}>Filter by Office</label>
        <select value={selectedOffice} onChange={e => setSelectedOffice(e.target.value)} style={{ width: "100%", padding: "12px 14px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: fontSize.base, background: "white", color: "#0f172a", minHeight: 48, boxSizing: "border-box" }}>
          <option value="All">All Offices</option>
          {OFFICES.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>

      {/* Status Filter Pills (like CashExpenses.tsx) */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        {statusFilters.map(f => {
          const isActive = filterStatus === f
          let bg = "white", color = "#64748b", borderColor = "#e2e8f0"
          if (isActive) {
            if (f === "Authorised") { bg = "#f0fdf4"; color = "#16a34a"; borderColor = "#16a34a" }
            else if (f === "Posted") { bg = "#eff6ff"; color = "#0070f3"; borderColor = "#0070f3" }
            else { bg = "#0f172a"; color = "white"; borderColor = "#0f172a" }
          }
          const count = expenses.filter(e => {
            if (selectedOffice !== "All" && e.office_name !== selectedOffice) return false
            if (f === "All") return e.status === "Authorised" || e.status === "Posted"
            return e.status === f
          }).length
          return (
            <button
              key={f}
              onClick={() => setFilterStatus(f)}
              style={{
                padding: "6px 14px", borderRadius: 20, border: `1.5px solid ${borderColor}`,
                fontSize: fontSize.xs, cursor: "pointer", background: bg, color: color,
                fontWeight: isActive ? 600 : 500, transition: "all 0.2s ease"
              }}
              onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1" } }}
              onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#e2e8f0" } }}
            >
              {f}{count > 0 ? ` (${count})` : ""}
            </button>
          )
        })}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "64px 0" }}>
          <div style={{ width: 36, height: 36, border: "3px solid #e2e8f0", borderTopColor: "#0070f3", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 24px", background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ width: 56, height: 56, background: "#f1f5f9", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <Icon icon="mdi:cash-register" width={28} color="#94a3b8" />
          </div>
          <p style={{ margin: 0, color: "#94a3b8", fontSize: 15 }}>No expenses found.</p>
        </div>
      ) : viewMode === "card" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
          {filtered.map(e => {
            const ss = statusStyle(e.status)
            const os = officeStyle(e.office_name)
            return (
              <div key={e.expense_id} style={{ background: "white", borderRadius: 12, border: "1px solid #e2e8f0", padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", transition: "all 0.2s ease" }}
                onMouseEnter={ev => { ev.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)"; ev.currentTarget.style.borderColor = "#cbd5e1" }}
                onMouseLeave={ev => { ev.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)"; ev.currentTarget.style.borderColor = "#e2e8f0" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <h3 style={{ margin: "0 0 4px 0", fontSize: fontSize.lg, color: "#0f172a", fontWeight: 600 }}>{e.title}</h3>
                    <p style={{ margin: 0, fontSize: fontSize.sm, color: "#64748b" }}>
                      <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: fontSize.xs, fontWeight: 500, background: os.bg, color: os.color, border: `1px solid ${os.border}`, marginRight: 6 }}>{e.office_name}</span>
                      {new Date(e.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span style={{ padding: "4px 10px", borderRadius: 6, fontSize: fontSize.xs, fontWeight: 500, background: ss.bg, color: ss.color, border: `1px solid ${ss.border}`, flexShrink: 0 }}>
                    {e.status}
                  </span>
                </div>

                <div style={{ fontSize: 24, fontWeight: "bold", color: "#0f172a", marginBottom: 16 }}>
                  ₦{e.total_amount.toLocaleString()}
                </div>

                <p style={{ margin: "0 0 16px 0", fontSize: fontSize.sm, color: "#475569" }}>
                  <Icon icon="mdi:account" width={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
                  {profilesMap[e.clerk_id] || "Unknown"}
                </p>

                {e.status === "Authorised" && (
                  <button onClick={() => openPostModal(e)} style={{
                    width: "100%", padding: "10px", background: "#f0f7ff", color: "#0070f3",
                    border: "1px solid #bfdbfe", borderRadius: 8, cursor: "pointer", fontWeight: 600,
                    fontSize: fontSize.sm, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "all 0.2s",
                  }} onMouseEnter={ev => { ev.currentTarget.style.background = "#e0efff"; ev.currentTarget.style.borderColor = "#0070f3" }} onMouseLeave={ev => { ev.currentTarget.style.background = "#f0f7ff"; ev.currentTarget.style.borderColor = "#bfdbfe" }}>
                    <Icon icon="mdi:check-circle" width={16} /> Review & Post
                  </button>
                )}
                {e.status === "Posted" && (
                  <div style={{ marginTop: 12, padding: "10px 12px", background: "#f0fdf4", borderRadius: 8, fontSize: fontSize.sm, color: "#166534" }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>Posted by {profilesMap[e.posted_by || ""] || "Admin"}</p>
                    {e.posted_at && <p style={{ margin: "4px 0 0 0", color: "#16a34a", fontSize: fontSize.xs }}>{new Date(e.posted_at).toLocaleString()}</p>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                <th style={thStyle}>Office</th>
                <th style={thStyle}>Title</th>
                <th style={thStyle}>Clerk</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Status</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, idx) => {
                const ss = statusStyle(e.status)
                const os = officeStyle(e.office_name)
                return (
                  <tr key={e.expense_id} style={{ borderBottom: idx === filtered.length - 1 ? "none" : "1px solid #e2e8f0", transition: "background 0.2s" }}
                    onMouseEnter={ev => ev.currentTarget.style.background = "#f8fafc"}
                    onMouseLeave={ev => ev.currentTarget.style.background = "transparent"}
                  >
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: fontSize.xs, fontWeight: 500, background: os.bg, color: os.color, border: `1px solid ${os.border}` }}>
                        {e.office_name}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: fontSize.base, fontWeight: 500 }}>{e.title}</td>
                    <td style={{ padding: "12px 16px", color: "#475569", fontSize: fontSize.sm }}>{profilesMap[e.clerk_id] || "—"}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", color: "#0f172a", fontSize: fontSize.base, fontWeight: 600 }}>₦{e.total_amount.toLocaleString()}</td>
                    <td style={{ padding: "12px 16px", color: "#64748b", fontSize: fontSize.sm }}>{new Date(e.created_at).toLocaleDateString()}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ padding: "4px 10px", borderRadius: 6, fontSize: fontSize.xs, fontWeight: 500, background: ss.bg, color: ss.color, border: `1px solid ${ss.border}`, display: "inline-block" }}>
                        {e.status}
                      </span>
                      {e.status === "Posted" && e.posted_by && (
                        <div style={{ marginTop: 4, fontSize: fontSize.xs, color: "#16a34a" }}>
                          by {profilesMap[e.posted_by] || "Admin"}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      {e.status === "Authorised" && (
                        <button onClick={() => openPostModal(e)} style={{ padding: "6px 10px", cursor: "pointer", borderRadius: 5, border: "1px solid #e2e8f0", color: "#0070f3", background: "#f0f7ff", fontSize: fontSize.sm, fontWeight: 500, transition: "all 0.2s", minHeight: 32, minWidth: 32, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                          onMouseEnter={ev => { ev.currentTarget.style.background = "#e0efff"; ev.currentTarget.style.borderColor = "#0070f3" }}
                          onMouseLeave={ev => { ev.currentTarget.style.background = "#f0f7ff"; ev.currentTarget.style.borderColor = "#e2e8f0" }}
                        >
                          <Icon icon="mdi:check" width={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && selectedExpense && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 100, padding: isMobile ? 0 : 24 }}>
          <div style={{ background: "white", borderRadius: isMobile ? "20px 20px 0 0" : 12, padding: isMobile ? "28px 20px" : 32, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h3 style={{ margin: 0, fontSize: fontSize.xl, fontWeight: 700, color: "#0f172a" }}>Post Expense</h3>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 0, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, transition: "color 0.2s" }}
                onMouseEnter={e => e.currentTarget.style.color = "#64748b"} onMouseLeave={e => e.currentTarget.style.color = "#94a3b8"}
              >
                <Icon icon="mdi:close" width={20} />
              </button>
            </div>

            <div style={{ background: "#f8fafc", padding: 16, borderRadius: 8, marginBottom: 20 }}>
              <p style={{ margin: "0 0 8px 0", fontSize: fontSize.sm, color: "#64748b" }}>Title</p>
              <p style={{ margin: "0 0 12px 0", fontSize: fontSize.base, fontWeight: 600, color: "#0f172a" }}>{selectedExpense.title}</p>
              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: "0 0 4px 0", fontSize: fontSize.xs, color: "#94a3b8" }}>Office</p>
                  <p style={{ margin: 0, fontSize: fontSize.base, fontWeight: 600, color: "#0f172a" }}>{selectedExpense.office_name}</p>
                </div>
                <div style={{ flex: 1, textAlign: "right" }}>
                  <p style={{ margin: "0 0 4px 0", fontSize: fontSize.xs, color: "#94a3b8" }}>Amount</p>
                  <p style={{ margin: 0, fontSize: fontSize.xl, fontWeight: 700, color: "#0f172a" }}>₦{selectedExpense.total_amount.toLocaleString()}</p>
                </div>
              </div>
            </div>

            {message && (
              <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 16, color: "#b91c1c", fontSize: fontSize.sm, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                <Icon icon="mdi:alert-circle" width={16} /> {message}
              </div>
            )}

            <button onClick={handlePost} disabled={submitting} style={{
              width: "100%", padding: "14px 0", background: "#0070f3", color: "white", border: "none",
              borderRadius: 8, fontSize: fontSize.md, fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              opacity: submitting ? 0.7 : 1, transition: "opacity 0.2s", minHeight: 48,
            }}>
              {submitting ? <Icon icon="mdi:loading" width={18} style={{ animation: "spin 1s linear infinite" }} /> : <Icon icon="mdi:content-save" width={18} />}
              {submitting ? "Processing..." : "Confirm & Post"}
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
