"use client"

import { FONT_SIZE } from "@/lib/constants"
import { usePolling } from "@/lib/hooks/usePolling"
import { usePermissions } from "@/lib/PermissionContext"
import { useState, useEffect, useCallback } from "react"
import { Icon } from "@iconify/react"
import { supabase } from "@/lib/supabase"
import { apiMutate } from "@/lib/api-mutation"

type CreditApproval = {
  id: string
  source_type: "stop" | "store_sale"
  source_id: string
  broker_id: string
  broker_name: string | null
  credit_manager_id: string
  credit_manager_name: string | null
  area: string
  product: string
  quantity: number | null
  company_price: number | null
  adjusted_price: number | null
  status: "Pending" | "Approved" | "Rejected"
  rejection_reason: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  has_discount: boolean
}

type ViewMode = "card" | "table"

const getPillStyle = (filter: string, isActive: boolean) => {
  if (!isActive) {
    return { bg: "white", textColor: "#64748b", borderColor: "#e2e8f0" }
  }

  if (filter === "All") {
    return { bg: "#171717", textColor: "white", borderColor: "#171717" }
  } else if (filter === "Pending") {
    return { bg: "#fffbeb", textColor: "#f5a623", borderColor: "#f5a623" }
  } else if (filter === "Approved") {
    return { bg: "#f0fdf4", textColor: "#16a34a", borderColor: "#16a34a" }
  } else if (filter === "Rejected") {
    return { bg: "#fef2f2", textColor: "#ef4444", borderColor: "#ef4444" }
  }

  return { bg: "white", textColor: "#64748b", borderColor: "#e2e8f0" }
}

const filterOptions = ["All", "Pending", "Approved", "Rejected"] as const

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })
}

export default function CreditApprovals() {
  const [isMobile, setIsMobile] = useState(true)
  const { getAccess, userRoles, userId } = usePermissions()
  const canEdit = getAccess("credit-approvals").canEdit

  const isCreditManager = userRoles.includes("CreditManager")
  const isSuperAdmin = userRoles.includes("SuperAdmin") || userRoles.includes("Admin")

  const [approvals, setApprovals] = useState<CreditApproval[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState("All")
  const [viewMode, setViewMode] = useState<ViewMode>("card")

  const [rejectModal, setRejectModal] = useState<CreditApproval | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640)
    }
    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  const fetchApprovals = useCallback(async () => {
    try {
      let query = supabase
        .from("credit_approvals")
        .select("*")
        .order("created_at", { ascending: false })

      if (isCreditManager && !isSuperAdmin) {
        query = query.eq("credit_manager_id", userId)
      }

      const { data, error } = await query

      if (error) { console.error("Failed to fetch credit approvals:", error); return }

      const brokerIds = [...new Set((data || []).map(a => a.broker_id).filter(Boolean))]
      const managerIds = [...new Set((data || []).map(a => a.credit_manager_id).filter(Boolean))]
      const brokerMap: Record<string, string> = {}
      const managerMap: Record<string, string> = {}

      if (brokerIds.length > 0) {
        const { data: brokers } = await supabase
          .from("Brokers")
          .select("broker_id, broker_name")
          .in("broker_id", brokerIds)
        for (const b of brokers || []) brokerMap[b.broker_id] = b.broker_name
      }

      if (managerIds.length > 0) {
        const { data: managers } = await supabase
          .from("credit_managers")
          .select("manager_id, full_name")
          .in("manager_id", managerIds)
        for (const m of managers || []) managerMap[m.manager_id] = m.full_name
      }

      const stopSourceIds = (data || []).filter(a => a.source_type === "stop").map(a => a.source_id)
      const saleSourceIds = (data || []).filter(a => a.source_type === "store_sale").map(a => a.source_id)

      const discountMap: Record<string, boolean> = {}

      if (stopSourceIds.length > 0) {
        const { data: adjustments } = await supabase
          .from("price_adjustments")
          .select("source_id, credit_status")
          .eq("source_type", "stop")
          .in("source_id", stopSourceIds)
        for (const a of adjustments || []) {
          discountMap[`stop:${a.source_id}`] = a.credit_status === "pending" || a.credit_status === "approved"
        }
      }

      if (saleSourceIds.length > 0) {
        const { data: adjustments } = await supabase
          .from("price_adjustments")
          .select("source_id, credit_status")
          .eq("source_type", "store_sale")
          .in("source_id", saleSourceIds)
        for (const a of adjustments || []) {
          discountMap[`store_sale:${a.source_id}`] = a.credit_status === "pending" || a.credit_status === "approved"
        }
      }

      const enriched = (data || []).map(a => ({
        ...a,
        broker_name: brokerMap[a.broker_id] || "Unknown",
        credit_manager_name: managerMap[a.credit_manager_id] || "Unknown",
        has_discount: discountMap[`${a.source_type}:${a.source_id}`] || false,
      }))

      setApprovals(enriched)
    } catch (err) {
      console.error("Error fetching credit approvals:", err)
    } finally {
      setLoading(false)
    }
  }, [userId, isCreditManager, isSuperAdmin])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchApprovals() }, [fetchApprovals])
  usePolling(fetchApprovals, 30000)

  const filtered = approvals.filter(a => {
    if (filterStatus !== "All" && a.status !== filterStatus) return false
    return true
  })

  const pendingCount = approvals.filter(a => a.status === "Pending").length
  const approvedCount = approvals.filter(a => a.status === "Approved").length
  const rejectedCount = approvals.filter(a => a.status === "Rejected").length

  async function handleApprove(approval: CreditApproval) {
    if (!canEdit) return
    setSubmitting(true)
    setMessage("")
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { error: caError } = await apiMutate("finance", {
        action: "update",
        table: "credit_approvals",
        data: { status: "Approved", reviewed_by: user.id, reviewed_at: new Date().toISOString() },
        filters: { id: approval.id },
      })
      if (caError) { setMessage("Failed to approve. Try again."); return }

      if (approval.has_discount) {
        if (approval.source_type === "store_sale") {
          await apiMutate("finance", {
            action: "update",
            table: "price_adjustments",
            data: { credit_status: "approved" },
            filters: { source_type: "store_sale", source_id: approval.source_id },
          })
          await apiMutate("finance", {
            action: "update",
            table: "store_sales",
            data: { discount_status: "pending" },
            filters: { sale_id: approval.source_id },
          })
        } else {
          await apiMutate("finance", {
            action: "update",
            table: "price_adjustments",
            data: { credit_status: "approved" },
            filters: { source_type: "stop", source_id: approval.source_id },
          })
          await apiMutate("trips", {
            action: "update",
            table: "Stops",
            data: { discount_status: "pending" },
            filters: { stop_id: approval.source_id },
          })
        }
      } else {
        if (approval.source_type === "store_sale") {
          const { error: saleError } = await apiMutate("finance", {
            action: "update",
            table: "store_sales",
            data: { status: "Confirmed", discount_status: "none" },
            filters: { sale_id: approval.source_id },
          })
          if (saleError) { setMessage("Approved but failed to confirm sale. Try again."); return }
        } else {
          const { error: stopError } = await apiMutate("trips", {
            action: "update",
            table: "Stops",
            data: { confirmed: true, discount_status: "none" },
            filters: { stop_id: approval.source_id },
          })
          if (stopError) { setMessage("Approved but failed to confirm stop. Try again."); return }
        }
      }

      fetchApprovals()
    } catch {
      setMessage("Failed to approve. Try again.")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleReject() {
    if (!canEdit || !rejectModal) return
    if (!rejectReason.trim()) { setMessage("Provide a rejection reason"); return }
    setSubmitting(true)
    setMessage("")
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { error: caError } = await apiMutate("finance", {
        action: "update",
        table: "credit_approvals",
        data: {
          status: "Rejected",
          rejection_reason: rejectReason.trim(),
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        },
        filters: { id: rejectModal.id },
      })
      if (caError) { setMessage("Failed to reject. Try again."); return }

      if (rejectModal.source_type === "store_sale") {
        if (rejectModal.has_discount) {
          await apiMutate("finance", {
            action: "delete",
            table: "price_adjustments",
            filters: { source_type: "store_sale", source_id: rejectModal.source_id },
          })
        }
        await apiMutate("finance", {
          action: "update",
          table: "store_sales",
          data: { discount_status: "returned" },
          filters: { sale_id: rejectModal.source_id },
        })
      } else {
        if (rejectModal.has_discount) {
          await apiMutate("finance", {
            action: "delete",
            table: "price_adjustments",
            filters: { source_type: "stop", source_id: rejectModal.source_id },
          })
        }
        await apiMutate("trips", {
          action: "update",
          table: "Stops",
          data: { discount_status: "returned" },
          filters: { stop_id: rejectModal.source_id },
        })
      }

      setRejectModal(null)
      setRejectReason("")
      fetchApprovals()
    } catch {
      setMessage("Failed to reject. Try again.")
    } finally {
      setSubmitting(false)
    }
  }

  const STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
    Pending: { bg: "#fffbeb", color: "#d97706", border: "#fcd34d" },
    Approved: { bg: "#ecfdf5", color: "#059669", border: "#6ee7b7" },
    Rejected: { bg: "#fef2f2", color: "#dc2626", border: "#fca5a5" },
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: isMobile ? "16px" : "32px", fontFamily: "'Inter', sans-serif" }}>
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, color: "#0f172a", fontSize: isMobile ? FONT_SIZE["2xl"] : FONT_SIZE["3xl"], fontWeight: 700, letterSpacing: "-0.5px" }}>
            Credit Approvals
          </h1>
          <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: FONT_SIZE.base }}>
            {isCreditManager && !isSuperAdmin
              ? "Review credit transactions assigned to you."
              : "All credit transactions across managers."
            }
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, width: isMobile ? "100%" : "auto" }}>
          {approvals.length > 0 && (
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
                  minWidth: 44,
                  height: 40,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s"
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
                  minWidth: 44,
                  height: 40,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s"
                }}
                title="Table view"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 4h18v2H3V4zm0 7h18v2H3v-2zm0 7h18v2H3v-2z"/></svg>
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24, overflowX: "auto", paddingBottom: 4 }}>
        {filterOptions.map((option) => {
          const isActive = filterStatus === option
          const pill = getPillStyle(option, isActive)
          return (
            <button
              key={option}
              onClick={() => setFilterStatus(option)}
              style={{
                padding: "8px 14px",
                borderRadius: 24,
                fontSize: FONT_SIZE.sm,
                cursor: "pointer",
                border: `1.5px solid ${pill.borderColor}`,
                background: pill.bg,
                color: pill.textColor,
                fontWeight: isActive ? 600 : 500,
                transition: "all 0.2s",
                whiteSpace: "nowrap"
              }}
              onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1" } }}
              onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#e2e8f0" } }}
            >
              {option}
              {option === "Pending" && !isActive && pendingCount > 0 && (
                <span style={{ display: "inline-flex", marginLeft: 6, width: 8, height: 8, borderRadius: "50%", background: "#f5a623" }} />
              )}
              {option === "Pending" && isActive && pendingCount > 0 && (
                <span style={{ display: "inline-flex", marginLeft: 6, background: "#fffbeb", color: "#f5a623", borderRadius: 10, padding: "0 6px", fontSize: 11, fontWeight: 700, lineHeight: "18px", minWidth: 18, justifyContent: "center" }}>
                  {pendingCount}
                </span>
              )}
              {option === "Approved" && !isActive && approvedCount > 0 && (
                <span style={{ display: "inline-flex", marginLeft: 6, width: 8, height: 8, borderRadius: "50%", background: "#16a34a" }} />
              )}
              {option === "Approved" && isActive && approvedCount > 0 && (
                <span style={{ display: "inline-flex", marginLeft: 6, background: "#f0fdf4", color: "#16a34a", borderRadius: 10, padding: "0 6px", fontSize: 11, fontWeight: 700, lineHeight: "18px", minWidth: 18, justifyContent: "center" }}>
                  {approvedCount}
                </span>
              )}
              {option === "Rejected" && !isActive && rejectedCount > 0 && (
                <span style={{ display: "inline-flex", marginLeft: 6, width: 8, height: 8, borderRadius: "50%", background: "#ef4444" }} />
              )}
              {option === "Rejected" && isActive && rejectedCount > 0 && (
                <span style={{ display: "inline-flex", marginLeft: 6, background: "#fef2f2", color: "#ef4444", borderRadius: 10, padding: "0 6px", fontSize: 11, fontWeight: 700, lineHeight: "18px", minWidth: 18, justifyContent: "center" }}>
                  {rejectedCount}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "64px 0" }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid #e2e8f0", borderTopColor: "#0070f3", animation: "spin 1s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "64px 24px", background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)" }}>
          <div style={{ width: 64, height: 64, background: "#f1f5f9", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <Icon icon="mdi:credit-card-outline" width={32} color="#94a3b8" />
          </div>
          <h3 style={{ margin: "0 0 8px", color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 600 }}>No credit approvals found</h3>
          <p style={{ color: "#64748b", fontSize: FONT_SIZE.base, margin: 0 }}>
            {filterStatus === "All" ? "No credit transactions in the system." : `No credit approvals with status "${filterStatus}".`}
          </p>
        </div>
      ) : (
        <>
          {viewMode === "card" && (
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(380px, 1fr))", gap: 16 }}>
              {filtered.map(approval => {
                const sc = STATUS_COLORS[approval.status]
                return (
                  <div key={approval.id} style={{ background: "white", borderRadius: 12, padding: 20, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", transition: "all 0.2s ease" }} onMouseEnter={e => !isMobile && (e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.08)", e.currentTarget.style.borderColor = "#cbd5e1")} onMouseLeave={e => !isMobile && (e.currentTarget.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.05)", e.currentTarget.style.borderColor = "#e2e8f0")}>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <span style={{ padding: "6px 12px", borderRadius: 16, fontSize: FONT_SIZE.xs, fontWeight: 600, background: sc.bg, color: sc.color, border: `1.5px solid ${sc.border}` }}>{approval.status}</span>
                      <span style={{ color: "#94a3b8", fontSize: FONT_SIZE.xs }}>
                        {formatDate(approval.created_at)} · {formatTime(approval.created_at)}
                      </span>
                    </div>

                    <h3 style={{ margin: "0 0 4px", color: "#0f172a", fontSize: FONT_SIZE.lg, fontWeight: 700 }}>{approval.broker_name}</h3>
                    <p style={{ margin: "0 0 10px", color: "#64748b", fontSize: FONT_SIZE.sm }}>{approval.product} · {approval.area}</p>

                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                      <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 12, background: "#e0f2fe", color: "#0369a1", fontWeight: 700, border: "1px solid #7dd3fc" }}>{approval.source_type === "stop" ? "Stop" : "Store Sale"}</span>
                      {approval.has_discount && (
                        <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 12, background: "#fef3c7", color: "#92400e", fontWeight: 700, border: "1px solid #fcd34d" }}>+ Discount</span>
                      )}
                      {isSuperAdmin && (
                        <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 12, background: "#f0fdf4", color: "#166534", fontWeight: 700, border: "1px solid #86efac" }}>{approval.credit_manager_name}</span>
                      )}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, padding: "10px 12px", borderRadius: 8, background: "#f8fafc", border: "1px solid #e2e8f0", marginBottom: 12 }}>
                      {approval.company_price != null && (
                        <div>
                          <p style={{ margin: 0, fontSize: 11, color: "#94a3b8" }}>Company</p>
                          <p style={{ margin: "2px 0 0", fontWeight: 600, fontSize: FONT_SIZE.sm, color: "#0f172a" }}>₦{approval.company_price.toLocaleString()}</p>
                        </div>
                      )}
                      {approval.adjusted_price != null && (
                        <div>
                          <p style={{ margin: 0, fontSize: 11, color: "#94a3b8" }}>Adjusted</p>
                          <p style={{ margin: "2px 0 0", fontWeight: 600, fontSize: FONT_SIZE.sm, color: "#0f172a" }}>₦{approval.adjusted_price.toLocaleString()}</p>
                        </div>
                      )}
                      {approval.quantity != null && (
                        <div>
                          <p style={{ margin: 0, fontSize: 11, color: "#94a3b8" }}>Bags</p>
                          <p style={{ margin: "2px 0 0", fontWeight: 600, fontSize: FONT_SIZE.sm, color: "#0f172a" }}>{approval.quantity}</p>
                        </div>
                      )}
                    </div>

                    {approval.status === "Rejected" && approval.rejection_reason && (
                      <div style={{ padding: "8px 10px", background: "#fef2f2", borderRadius: 8, marginBottom: 12, borderLeft: "3px solid #ef4444" }}>
                        <p style={{ margin: 0, fontSize: 11, color: "#ef4444", fontWeight: 600 }}>Rejection reason</p>
                        <p style={{ margin: "2px 0 0", fontSize: FONT_SIZE.sm, color: "#7f1d1d" }}>{approval.rejection_reason}</p>
                      </div>
                    )}

                    {approval.status === "Pending" && canEdit && (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => handleApprove(approval)} disabled={submitting} style={{ flex: 1, padding: "10px 0", background: "#10b981", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontSize: FONT_SIZE.sm, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, opacity: submitting ? 0.6 : 1 }}>
                          <Icon icon="mdi:check-circle" width={15} /> Approve
                        </button>
                        <button onClick={() => { setRejectModal(approval); setRejectReason(""); setMessage("") }} disabled={submitting} style={{ flex: 1, padding: "10px 0", background: "white", color: "#ef4444", border: "1.5px solid #ef4444", borderRadius: 8, cursor: "pointer", fontSize: FONT_SIZE.sm, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                          <Icon icon="mdi:close-circle" width={15} /> Reject
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {viewMode === "table" && (
            <div style={{ background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", minWidth: 900 }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    {["Broker", "Type", "Product", "Area", "Bags", "Company", "Adjusted", "Credit Manager", "Status", "Date", "Actions"].map(h => (
                      <th key={h} style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(approval => {
                    const sc = STATUS_COLORS[approval.status]
                    return (
                      <tr key={approval.id} style={{ borderBottom: "1px solid #f1f5f9", transition: "background 0.2s ease" }} onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <td style={{ padding: "12px 16px", fontSize: FONT_SIZE.sm, fontWeight: 500 }}>
                          <div>{approval.broker_name}</div>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 8, background: approval.source_type === "stop" ? "#e0f2fe" : "#f3e5f5", color: approval.source_type === "stop" ? "#0369a1" : "#7c3aed", fontWeight: 700, border: `1px solid ${approval.source_type === "stop" ? "#7dd3fc" : "#d8b4fe"}` }}>
                            {approval.source_type === "stop" ? "Stop" : "Store Sale"}
                          </span>
                          {approval.has_discount && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 8, background: "#fef3c7", color: "#92400e", fontWeight: 700, border: "1px solid #fcd34d", marginLeft: 4 }}>+Disc</span>}
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: FONT_SIZE.sm }}>{approval.product}</td>
                        <td style={{ padding: "12px 16px", fontSize: FONT_SIZE.sm, color: "#64748b" }}>{approval.area}</td>
                        <td style={{ padding: "12px 16px", fontSize: FONT_SIZE.sm, fontWeight: 600 }}>{approval.quantity != null ? approval.quantity : "—"}</td>
                        <td style={{ padding: "12px 16px", fontSize: FONT_SIZE.sm }}>{approval.company_price != null ? `₦${approval.company_price.toLocaleString()}` : "—"}</td>
                        <td style={{ padding: "12px 16px", fontSize: FONT_SIZE.sm }}>{approval.adjusted_price != null ? `₦${approval.adjusted_price.toLocaleString()}` : "—"}</td>
                        <td style={{ padding: "12px 16px", fontSize: FONT_SIZE.sm, color: "#64748b" }}>{isSuperAdmin ? approval.credit_manager_name : "—"}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{ padding: "6px 10px", borderRadius: 14, fontSize: FONT_SIZE.xs, fontWeight: 600, background: sc.bg, color: sc.color, border: `1.5px solid ${sc.border}` }}>{approval.status}</span>
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: FONT_SIZE.xs, color: "#94a3b8", whiteSpace: "nowrap" }}>{formatDate(approval.created_at)}</td>
                        <td style={{ padding: "12px 16px" }}>
                          {approval.status === "Pending" && canEdit && (
                            <div style={{ display: "flex", gap: 6 }}>
                              <button onClick={() => handleApprove(approval)} disabled={submitting} style={{ padding: "6px 10px", cursor: "pointer", borderRadius: 6, border: "1px solid #10b981", color: "#10b981", background: "#f0fdf4", fontSize: 12, fontWeight: 600, transition: "all 0.2s", minHeight: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                                onMouseEnter={e => { e.currentTarget.style.background = "#dcfce7" }} onMouseLeave={e => { e.currentTarget.style.background = "#f0fdf4" }}>
                                <Icon icon="mdi:check-circle" width={14} /> Approve
                              </button>
                              <button onClick={() => { setRejectModal(approval); setRejectReason(""); setMessage("") }} disabled={submitting} style={{ padding: "6px 10px", cursor: "pointer", borderRadius: 6, border: "1px solid #fecaca", color: "#ef4444", background: "#fef2f2", fontSize: 12, fontWeight: 600, transition: "all 0.2s", minHeight: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                                onMouseEnter={e => { e.currentTarget.style.background = "#fee2e2" }} onMouseLeave={e => { e.currentTarget.style.background = "#fef2f2" }}>
                                <Icon icon="mdi:close-circle" width={14} /> Reject
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {rejectModal && (
        <div
          onClick={() => { setRejectModal(null); setRejectReason(""); setMessage("") }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 100 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: isMobile ? "20px 20px 0 0" : 14, padding: isMobile ? "24px 20px 40px" : 32, width: isMobile ? "100%" : 420, maxHeight: isMobile ? "92vh" : "88vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
            <h3 style={{ margin: "0 0 4px", color: "#171717", fontSize: isMobile ? 18 : 16 }}>Reject Credit Approval</h3>
            <p style={{ color: "#888", fontSize: 13, marginBottom: 20 }}>
              {rejectModal.broker_name} · {rejectModal.product} · {rejectModal.area}
            </p>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontWeight: 600, display: "block", marginBottom: 6, fontSize: isMobile ? 14 : 13, color: "#444" }}>Rejection Reason *</label>
              <textarea
                placeholder="Explain why this credit is being rejected…"
                value={rejectReason}
                onChange={e => { setRejectReason(e.target.value); setMessage("") }}
                rows={3}
                style={{ width: "100%", padding: "12px 14px", boxSizing: "border-box", borderRadius: 8, border: "1.5px solid #e5e5e5", fontSize: isMobile ? 16 : 14, background: "white", color: "#171717", minHeight: 80, resize: "none" }}
              />
            </div>

            {message && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#ef4444", marginBottom: 14, fontSize: 13 }}>
                <Icon icon="mdi:alert-circle" width={15} />{message}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setRejectModal(null); setRejectReason(""); setMessage("") }} style={{ flex: 1, padding: "13px 0", background: "white", border: "1.5px solid #e5e5e5", borderRadius: 10, cursor: "pointer", fontSize: 15, minHeight: 50, fontWeight: "bold" }}>Cancel</button>
              <button onClick={handleReject} disabled={submitting} style={{ flex: 1, padding: "13px 0", background: submitting ? "#ccc" : "#ef4444", color: "white", border: "none", borderRadius: 10, cursor: submitting ? "not-allowed" : "pointer", fontSize: 15, minHeight: 50, fontWeight: "bold", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {submitting
                  ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} />Rejecting…</>
                  : <><Icon icon="mdi:close-circle" width={16} />Reject</>
                }
              </button>
            </div>
          </div>
          <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
        </div>
      )}
    </div>
  )
}
