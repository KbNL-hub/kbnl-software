"use client"

import { useState, useEffect, useCallback } from "react"
import { Icon } from "@iconify/react"
import { supabase } from "@/lib/supabase"
import { apiMutate } from "@/lib/api-mutation"
import { useBreakpoint } from "@/app/hooks/useBreakpoint"
import { usePagination } from "@/lib/hooks/usePagination"
import PaginationControls from "@/components/PaginationControls"
import ModernInput from "@/components/ModernInput"
import { usePermissions } from "@/lib/PermissionContext"
import { FONT_SIZE } from "@/lib/constants"
import { Role } from "@/lib/roles"
import type { NewBooking } from "@/lib/types"

type FilterKey = "all" | "pending" | "awaiting_review" | "rejected" | "supplied" | "partial"

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; border: string }> = {
  pending:         { label: "Pending",         bg: "#eff6ff", color: "#0070f3", border: "#0070f3" },
  awaiting_review: { label: "Awaiting Review", bg: "#fffbeb", color: "#d97706", border: "#fcd34d" },
  supplied:        { label: "Supplied",        bg: "#ecfdf5", color: "#059669", border: "#10b981" },
  partial:         { label: "Partial",         bg: "#fff7ed", color: "#ea580c", border: "#fb923c" },
  rejected:        { label: "Rejected",        bg: "#fef2f2", color: "#dc2626", border: "#ef4444" },
}

const FILTER_COLORS: Record<FilterKey, string> = {
  all: "#171717", pending: "#0070f3", awaiting_review: "#f5a623", rejected: "#ef4444", supplied: "#10b981", partial: "#ea580c",
}

const getPillStyle = (filter: FilterKey, isActive: boolean) => {
  if (!isActive) return { bg: "white", textColor: "#64748b", borderColor: "#e2e8f0" }
  const color = FILTER_COLORS[filter]
  const tint: Record<FilterKey, string> = {
    all: "#f5f5f5", pending: "#eff6ff", awaiting_review: "#fffbeb", rejected: "#fef2f2", supplied: "#ecfdf5", partial: "#fff7ed",
  }
  return { bg: tint[filter], textColor: color, borderColor: color }
}

export default function NewBookingsAdmin() {
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"
  const { getAccess, activeRole } = usePermissions()
  const canEdit = getAccess("new-bookings").canEdit
  const isAdmin = activeRole === Role.Admin || activeRole === Role.SuperAdmin

  const [bookings, setBookings] = useState<NewBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all")
  const [viewMode, setViewMode] = useState<"card" | "table">("card")
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState("")

  // Supply modal
  const [supplyModal, setSupplyModal] = useState<NewBooking | null>(null)
  const [supplyDate, setSupplyDate] = useState("")
  const [supplyBags, setSupplyBags] = useState("")

  // Reject modal
  const [rejectModal, setRejectModal] = useState<NewBooking | null>(null)
  const [rejectReason, setRejectReason] = useState("")

  const fetchBookings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("new_bookings")
        .select("*")
        .order("created_at", { ascending: false })
      if (error) { console.error("Failed to fetch bookings:", error); return }

      const brokerIds = [...new Set((data || []).map(b => b.broker_id).filter(Boolean))]
      const brokerMap: Record<string, string> = {}
      if (brokerIds.length > 0) {
        const { data: brokers } = await supabase
          .from("Brokers")
          .select("broker_id, broker_name")
          .in("broker_id", brokerIds)
        for (const b of brokers || []) brokerMap[b.broker_id] = b.broker_name
      }

      const enriched = (data || []).map(b => ({
        ...b,
        broker_name: brokerMap[b.broker_id] || null,
      }))

      setBookings(enriched as NewBooking[])
    } catch (err) {
      console.error("Error fetching bookings:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchBookings() }, [fetchBookings])

  async function handleApprove(booking: NewBooking) {
    if (!canEdit) return
    setSubmitting(true)
    setMessage("")
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await apiMutate<NewBooking[]>("finance", {
        action: "update",
        table: "new_bookings",
        data: { status: "pending", reviewed_by: user.id, reviewed_at: new Date().toISOString() },
        filters: { id: booking.id, status: "awaiting_review" },
      })
      if (error) { setMessage("Failed to approve. Try again."); return }
      if (!data || data.length === 0) { setMessage("This booking was already reviewed by another admin."); fetchBookings(); return }

      fetchBookings()
    } catch {
      setMessage("Failed to approve. Try again.")
    } finally {
      setSubmitting(false)
    }
  }

  function openRejectModal(booking: NewBooking) {
    setRejectModal(booking)
    setRejectReason("")
    setMessage("")
  }

  async function handleReject() {
    if (!rejectModal || !rejectReason.trim()) { setMessage("Provide a rejection reason"); return }
    setSubmitting(true)
    setMessage("")
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await apiMutate<NewBooking[]>("finance", {
        action: "update",
        table: "new_bookings",
        data: {
          status: "rejected",
          rejection_reason: rejectReason.trim(),
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        },
        filters: { id: rejectModal.id, status: "awaiting_review" },
      })
      if (error) { setMessage("Failed to reject. Try again."); return }
      if (!data || data.length === 0) { setMessage("This booking was already reviewed by another admin."); setRejectModal(null); setRejectReason(""); fetchBookings(); return }

      setRejectModal(null)
      setRejectReason("")
      fetchBookings()
    } catch {
      setMessage("Failed to reject. Try again.")
    } finally {
      setSubmitting(false)
    }
  }

  function openSupplyModal(booking: NewBooking) {
    setSupplyModal(booking)
    setSupplyDate("")
    const remaining = booking.number_of_bags - (booking.bags_supplied || 0)
    setSupplyBags(remaining > 0 ? String(remaining) : "")
    setMessage("")
  }

  async function handleSupply() {
    if (!supplyModal || !supplyDate) { setMessage("Select a supply date"); return }
    const bagsToSupply = parseInt(supplyBags, 10)
    if (!bagsToSupply || bagsToSupply <= 0) { setMessage("Enter a valid number of bags"); return }
    const previouslySupplied = supplyModal.bags_supplied || 0
    const remaining = supplyModal.number_of_bags - previouslySupplied
    if (bagsToSupply > remaining) { setMessage(`Cannot supply more than ${remaining} remaining bags`); return }

    setSubmitting(true)
    setMessage("")
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { error } = await apiMutate("finance", {
        action: "rpc",
        function: "supply_booking",
        params: {
          p_booking_id: supplyModal.id,
          p_bags: bagsToSupply,
          p_supply_date: supplyDate,
          p_supplied_by: user.id,
          p_idempotency_key: crypto.randomUUID(),
        },
      })
      if (error) { setMessage("Failed to mark as supplied. Try again."); return }

      setSupplyModal(null)
      setSupplyDate("")
      setSupplyBags("")
      fetchBookings()
    } catch {
      setMessage("Failed to mark as supplied. Try again.")
    } finally {
      setSubmitting(false)
    }
  }

  const pending = bookings.filter(b => b.status === "pending")
  const awaitingReview = bookings.filter(b => b.status === "awaiting_review")
  const rejected = bookings.filter(b => b.status === "rejected")
  const supplied = bookings.filter(b => b.status === "supplied")
  const partial = bookings.filter(b => b.status === "partial")

  const filtered = (activeFilter === "all" ? bookings
    : activeFilter === "pending" ? pending
    : activeFilter === "awaiting_review" ? awaitingReview
    : activeFilter === "rejected" ? rejected
    : activeFilter === "partial" ? partial
    : supplied
  ).slice().sort((a, b) => new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime())

  const { page, setPage, totalPages, paginatedItems, totalItems } = usePagination(filtered)

  const filterOptions: { key: FilterKey; label: string; count: number }[] = [
    { key: "all", label: "All", count: bookings.length },
    { key: "pending", label: "Pending", count: pending.length },
    { key: "awaiting_review", label: "Awaiting Review", count: awaitingReview.length },
    { key: "rejected", label: "Rejected", count: rejected.length },
    { key: "supplied", label: "Supplied", count: supplied.length },
    { key: "partial", label: "Partial", count: partial.length },
  ]

  const thStyle: React.CSSProperties = {
    padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs,
    color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap",
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: isMobile ? "16px" : "32px", fontFamily: "'Inter', sans-serif" }}>
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, color: "#0f172a", fontSize: isMobile ? FONT_SIZE["2xl"] : FONT_SIZE["3xl"], fontWeight: 700, letterSpacing: "-0.5px" }}>
            New Bookings
          </h1>
          <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: FONT_SIZE.base }}>
            Review, approve, reject, and supply broker bookings.
          </p>
        </div>

        {bookings.length > 0 && (
          <div style={{ display: "flex", background: "white", border: "1px solid #e2e8f0", borderRadius: 8, padding: 4, gap: 0 }}>
            <button onClick={() => setViewMode("card")} style={{
              padding: "8px 12px", background: viewMode === "card" ? "#0070f3" : "transparent",
              color: viewMode === "card" ? "white" : "#64748b", border: "none", borderRadius: 6,
              cursor: "pointer", fontSize: FONT_SIZE.xs, fontWeight: 600, transition: "all 0.2s",
              minWidth: 44, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
            }} title="Card view">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z"/></svg>
            </button>
            <button onClick={() => setViewMode("table")} style={{
              padding: "8px 12px", background: viewMode === "table" ? "#0070f3" : "transparent",
              color: viewMode === "table" ? "white" : "#64748b", border: "none", borderRadius: 6,
              cursor: "pointer", fontSize: FONT_SIZE.xs, fontWeight: 600, transition: "all 0.2s",
              minWidth: 44, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
            }} title="Table view">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 4h18v2H3V4zm0 7h18v2H3v-2zm0 7h18v2H3v-2z"/></svg>
            </button>
          </div>
        )}
      </div>

      {/* Filter pills */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24, overflowX: "auto", paddingBottom: 4 }}>
        {filterOptions.map(({ key, label, count }) => {
          const isActive = activeFilter === key
          const pill = getPillStyle(key, isActive)
          return (
            <button
              key={key}
              onClick={() => { setActiveFilter(key); setPage(1) }}
              style={{
                padding: "8px 14px", borderRadius: 24, fontSize: FONT_SIZE.sm, cursor: "pointer",
                border: `1.5px solid ${pill.borderColor}`, background: pill.bg, color: pill.textColor,
                fontWeight: isActive ? 600 : 500, transition: "all 0.2s", whiteSpace: "nowrap",
                display: "inline-flex", alignItems: "center", gap: 6,
              }}
              onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1" } }}
              onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#e2e8f0" } }}
            >
              {label}
              {count > 0 && (
                <span style={{
                  fontSize: 11, fontWeight: 700, minWidth: 18, lineHeight: "18px", textAlign: "center",
                  background: isActive ? `${pill.textColor}1a` : "#f1f5f9", color: pill.textColor,
                  borderRadius: 10, padding: "0 6px",
                }}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {message && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#ef4444", marginBottom: 16, fontSize: FONT_SIZE.sm, padding: "10px 14px", background: "#fef2f2", borderRadius: 8 }}>
          <Icon icon="mdi:alert-circle" width={15} />{message}
        </div>
      )}

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "64px 0" }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid #e2e8f0", borderTopColor: "#0070f3", animation: "spin 1s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "64px 24px", background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ width: 64, height: 64, background: "#f1f5f9", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <Icon icon="mdi:book-open-variant" width={32} color="#94a3b8" />
          </div>
          <h3 style={{ margin: "0 0 8px", color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 600 }}>
            No {activeFilter === "all" ? "bookings" : `${activeFilter.replace("_", " ")} bookings`} found
          </h3>
          <p style={{ color: "#64748b", fontSize: FONT_SIZE.base, margin: 0 }}>
            {activeFilter === "all" ? "No bookings have been filed by brokers yet." : `No bookings with status "${activeFilter.replace("_", " ")}".`}
          </p>
        </div>
      ) : (
        <>
          {viewMode === "card" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {paginatedItems.map(booking => {
                const status = STATUS_CONFIG[booking.status] || STATUS_CONFIG.pending
                return (
                  <div key={booking.id} style={{ background: "white", borderRadius: 12, padding: 20, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", transition: "all 0.2s ease" }} onMouseEnter={e => !isMobile && (e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)", e.currentTarget.style.borderColor = "#cbd5e1")} onMouseLeave={e => !isMobile && (e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)", e.currentTarget.style.borderColor = "#e2e8f0")}>

                    {/* Header */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 style={{ margin: "0 0 4px", color: "#0f172a", fontSize: FONT_SIZE.lg, fontWeight: 700 }}>{booking.customer_name || "Unknown Customer"}</h3>
                        <p style={{ margin: 0, color: "#64748b", fontSize: FONT_SIZE.sm }}>
                          {booking.broker_name || "Unknown broker"} · {booking.area}
                        </p>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                        <span style={{ padding: "6px 12px", borderRadius: 16, fontSize: FONT_SIZE.xs, fontWeight: 600, background: status.bg, color: status.color, border: `1.5px solid ${status.border}`, whiteSpace: "nowrap" }}>
                          {status.label}
                        </span>
                        <span style={{ color: "#94a3b8", fontSize: FONT_SIZE.xs }}>{formatDate(booking.created_at)}</span>
                      </div>
                    </div>

                    {/* Detail grid */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "14px 0", borderTop: "1px solid #f1f5f9", borderBottom: "1px solid #f1f5f9", marginBottom: 12 }}>
                      {booking.customer_phone && (
                        <div>
                          <p style={{ margin: "0 0 4px", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>Phone</p>
                          <p style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 500 }}>{booking.customer_phone}</p>
                        </div>
                      )}
                      <div>
                        <p style={{ margin: "0 0 4px", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>Product</p>
                        <p style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 500 }}>{booking.product}</p>
                      </div>
                      <div>
                        <p style={{ margin: "0 0 4px", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>Location</p>
                        <p style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 500 }}>{booking.location}</p>
                      </div>
                      <div>
                        <p style={{ margin: "0 0 4px", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>Bags</p>
                        <p style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 600 }}>{booking.number_of_bags.toLocaleString()}</p>
                      </div>
                      <div>
                        <p style={{ margin: "0 0 4px", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>Rate / Bag</p>
                        <p style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 600 }}>₦{booking.rate_per_bag.toLocaleString()}</p>
                      </div>
                      <div>
                        <p style={{ margin: "0 0 4px", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>Total Amount</p>
                        <p style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 700 }}>₦{booking.total_amount.toLocaleString()}</p>
                      </div>
                      <div>
                        <p style={{ margin: "0 0 4px", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>Date of Payment</p>
                        <p style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 500 }}>{formatDate(booking.payment_date)}</p>
                      </div>
                      {booking.supply_date && (
                        <div>
                          <p style={{ margin: "0 0 4px", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>Supply Date</p>
                          <p style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 500 }}>{formatDate(booking.supply_date)}</p>
                        </div>
                      )}
                      {booking.status === "partial" && (
                        <div>
                          <p style={{ margin: "0 0 4px", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>Bags Supplied</p>
                          <p style={{ margin: 0, color: "#ea580c", fontSize: FONT_SIZE.base, fontWeight: 700 }}>
                            {booking.bags_supplied || 0} / {booking.number_of_bags.toLocaleString()}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Price reason */}
                    {booking.price_reason && (
                      <div style={{ padding: "10px 12px", borderRadius: 8, background: "#f0f7ff", border: "1px solid #bfdbfe", marginBottom: 12 }}>
                        <p style={{ margin: "0 0 2px", color: "#0369a1", fontSize: FONT_SIZE.xs, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Price reason</p>
                        <p style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.sm }}>{booking.price_reason}</p>
                      </div>
                    )}

                    {/* Rejection reason */}
                    {booking.rejection_reason && (
                      <div style={{ padding: "10px 12px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", borderLeft: "3px solid #ef4444", marginBottom: 12 }}>
                        <p style={{ margin: "0 0 2px", color: "#dc2626", fontSize: FONT_SIZE.xs, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Rejection reason</p>
                        <p style={{ margin: 0, color: "#7f1d1d", fontSize: FONT_SIZE.sm }}>{booking.rejection_reason}</p>
                      </div>
                    )}

                    {/* Price comparison */}
                    {booking.status === "awaiting_review" && booking.company_price != null && booking.company_price > 0 && (
                      <div style={{ padding: "10px 12px", borderRadius: 8, background: "#fffbeb", border: "1px solid #fcd34d", marginBottom: 12 }}>
                        <p style={{ margin: "0 0 6px", color: "#d97706", fontSize: FONT_SIZE.xs, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                          <Icon icon="mdi:alert-circle-outline" width={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
                          Price differs from company rate
                        </p>
                        <div style={{ display: "flex", gap: 16 }}>
                          <div>
                            <p style={{ margin: 0, fontSize: 11, color: "#92400e" }}>Company</p>
                            <p style={{ margin: "2px 0 0", fontWeight: 600, fontSize: FONT_SIZE.sm, color: "#92400e" }}>₦{booking.company_price.toLocaleString()}</p>
                          </div>
                          <div>
                            <p style={{ margin: 0, fontSize: 11, color: "#92400e" }}>Broker rate</p>
                            <p style={{ margin: "2px 0 0", fontWeight: 600, fontSize: FONT_SIZE.sm, color: "#92400e" }}>₦{booking.rate_per_bag.toLocaleString()}</p>
                          </div>
                          <div>
                            <p style={{ margin: 0, fontSize: 11, color: "#92400e" }}>{booking.rate_per_bag > booking.company_price ? "Premium" : "Discount"}</p>
                            <p style={{ margin: "2px 0 0", fontWeight: 700, fontSize: FONT_SIZE.sm, color: "#92400e" }}>₦{Math.abs(booking.rate_per_bag - booking.company_price).toLocaleString()}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {booking.status === "awaiting_review" && booking.company_price == null && booking.price_reason && (
                      <div style={{ padding: "10px 12px", borderRadius: 8, background: "#fffbeb", border: "1px solid #fcd34d", marginBottom: 12 }}>
                        <p style={{ margin: 0, color: "#d97706", fontSize: FONT_SIZE.sm, fontWeight: 600 }}>
                          <Icon icon="mdi:alert-circle-outline" width={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
                          No company price configured — review this rate.
                        </p>
                      </div>
                    )}

                    {/* Actions */}
                    {booking.status === "awaiting_review" && canEdit && isAdmin && (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => handleApprove(booking)} disabled={submitting} style={{ flex: 1, padding: "10px 0", background: "#059669", color: "white", border: "none", borderRadius: 8, cursor: submitting ? "not-allowed" : "pointer", fontSize: FONT_SIZE.sm, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, opacity: submitting ? 0.6 : 1, transition: "all 0.2s" }} onMouseEnter={e => { if (!submitting) e.currentTarget.style.background = "#047857" }} onMouseLeave={e => { if (!submitting) e.currentTarget.style.background = "#059669" }}>
                          <Icon icon="mdi:check-circle" width={15} /> Approve
                        </button>
                        <button onClick={() => openRejectModal(booking)} disabled={submitting} style={{ flex: 1, padding: "10px 0", background: "white", color: "#ef4444", border: "1.5px solid #ef4444", borderRadius: 8, cursor: submitting ? "not-allowed" : "pointer", fontSize: FONT_SIZE.sm, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, opacity: submitting ? 0.6 : 1, transition: "all 0.2s" }} onMouseEnter={e => { if (!submitting) { e.currentTarget.style.background = "#fef2f2"; e.currentTarget.style.borderColor = "#dc2626" } }} onMouseLeave={e => { if (!submitting) { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#ef4444" } }}>
                          <Icon icon="mdi:close-circle" width={15} /> Reject
                        </button>
                      </div>
                    )}

                    {booking.status === "awaiting_review" && canEdit && !isAdmin && (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 14px", borderRadius: 8, background: "#fffbeb", border: "1px solid #fcd34d" }}>
                        <Icon icon="mdi:clock-alert-outline" width={16} color="#d97706" />
                        <span style={{ fontSize: FONT_SIZE.sm, color: "#d97706", fontWeight: 600 }}>Awaiting admin approval</span>
                      </div>
                    )}

                    {booking.status === "pending" && canEdit && (
                      <button onClick={() => openSupplyModal(booking)} style={{ width: "100%", padding: "10px 0", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontSize: FONT_SIZE.sm, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, transition: "all 0.2s" }} onMouseEnter={e => e.currentTarget.style.background = "#0055d4"} onMouseLeave={e => e.currentTarget.style.background = "#0070f3"}>
                        <Icon icon="mdi:truck-check" width={15} /> Mark Supplied
                      </button>
                    )}

                    {booking.status === "partial" && canEdit && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ padding: "10px 12px", borderRadius: 8, background: "#fff7ed", border: "1px solid #fed7aa" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <span style={{ fontSize: FONT_SIZE.xs, color: "#9a3412", fontWeight: 600 }}>Supply Progress</span>
                            <span style={{ fontSize: FONT_SIZE.xs, color: "#9a3412", fontWeight: 700 }}>{booking.bags_supplied || 0} / {booking.number_of_bags.toLocaleString()}</span>
                          </div>
                          <div style={{ width: "100%", height: 6, background: "#fed7aa", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ width: `${((booking.bags_supplied || 0) / booking.number_of_bags) * 100}%`, height: "100%", background: "#ea580c", borderRadius: 3, transition: "width 0.3s" }} />
                          </div>
                          <p style={{ margin: "6px 0 0", fontSize: FONT_SIZE.xs, color: "#9a3412" }}>
                            {(booking.number_of_bags - (booking.bags_supplied || 0)).toLocaleString()} bags remaining
                          </p>
                        </div>
                        <button onClick={() => openSupplyModal(booking)} style={{ width: "100%", padding: "10px 0", background: "#ea580c", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontSize: FONT_SIZE.sm, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, transition: "all 0.2s" }} onMouseEnter={e => e.currentTarget.style.background = "#c2410c"} onMouseLeave={e => e.currentTarget.style.background = "#ea580c"}>
                          <Icon icon="mdi:truck-check" width={15} /> Supply More
                        </button>
                      </div>
                    )}

                    {booking.status === "supplied" && (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 12px", borderRadius: 8, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                        <Icon icon="mdi:check-circle" width={15} color="#059669" />
                        <span style={{ fontSize: FONT_SIZE.sm, color: "#059669", fontWeight: 600 }}>Booking fully supplied</span>
                      </div>
                    )}

                    {booking.status === "rejected" && (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 12px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca" }}>
                        <Icon icon="mdi:close-circle" width={15} color="#dc2626" />
                        <span style={{ fontSize: FONT_SIZE.sm, color: "#dc2626", fontWeight: 600 }}>Booking rejected</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {viewMode === "table" && (
            <div style={{ background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", minWidth: 1100 }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    {["Customer", "Phone", "Broker", "Product", "Bags", "Rate", "Total", "Payment", "Status", "Actions"].map(h => (
                      <th key={h} style={{ ...thStyle, textAlign: h === "Total" || h === "Rate" ? "right" : "left" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map(booking => {
                    const status = STATUS_CONFIG[booking.status] || STATUS_CONFIG.pending
                    return (
                      <tr key={booking.id} style={{ borderBottom: "1px solid #f1f5f9", transition: "background 0.2s ease" }} onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: FONT_SIZE.sm, fontWeight: 500 }}>{booking.customer_name || "Unknown"}</td>
                        <td style={{ padding: "12px 16px", color: "#64748b", fontSize: FONT_SIZE.sm }}>{booking.customer_phone || "—"}</td>
                        <td style={{ padding: "12px 16px", color: "#64748b", fontSize: FONT_SIZE.sm }}>{booking.broker_name || "—"}</td>
                        <td style={{ padding: "12px 16px", color: "#475569", fontSize: FONT_SIZE.sm }}>{booking.product}</td>
                        <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: FONT_SIZE.sm, fontWeight: 600 }}>{booking.number_of_bags.toLocaleString()}</td>
                        <td style={{ padding: "12px 16px", textAlign: "right", color: "#475569", fontSize: FONT_SIZE.sm }}>₦{booking.rate_per_bag.toLocaleString()}</td>
                        <td style={{ padding: "12px 16px", textAlign: "right", color: "#0f172a", fontSize: FONT_SIZE.sm, fontWeight: 600 }}>₦{booking.total_amount.toLocaleString()}</td>
                        <td style={{ padding: "12px 16px", color: "#64748b", fontSize: FONT_SIZE.sm, whiteSpace: "nowrap" }}>{formatDate(booking.payment_date)}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{ padding: "6px 10px", borderRadius: 14, fontSize: FONT_SIZE.xs, fontWeight: 600, background: status.bg, color: status.color, border: `1.5px solid ${status.border}`, whiteSpace: "nowrap" }}>{status.label}</span>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          {booking.status === "awaiting_review" && canEdit && isAdmin && (
                            <div style={{ display: "flex", gap: 6 }}>
                              <button onClick={() => handleApprove(booking)} disabled={submitting} style={{ padding: "6px 10px", cursor: "pointer", borderRadius: 6, border: "1px solid #059669", color: "#059669", background: "#f0fdf4", fontSize: FONT_SIZE.xs, fontWeight: 600, transition: "all 0.2s", minHeight: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 }} onMouseEnter={e => e.currentTarget.style.background = "#dcfce7"} onMouseLeave={e => e.currentTarget.style.background = "#f0fdf4"}>
                                <Icon icon="mdi:check-circle" width={14} /> Approve
                              </button>
                              <button onClick={() => openRejectModal(booking)} disabled={submitting} style={{ padding: "6px 10px", cursor: "pointer", borderRadius: 6, border: "1px solid #fecaca", color: "#ef4444", background: "#fef2f2", fontSize: FONT_SIZE.xs, fontWeight: 600, transition: "all 0.2s", minHeight: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 }} onMouseEnter={e => e.currentTarget.style.background = "#fee2e2"} onMouseLeave={e => e.currentTarget.style.background = "#fef2f2"}>
                                <Icon icon="mdi:close-circle" width={14} /> Reject
                              </button>
                            </div>
                          )}
                          {booking.status === "awaiting_review" && canEdit && !isAdmin && (
                            <span style={{ fontSize: FONT_SIZE.xs, color: "#d97706", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}><Icon icon="mdi:clock-alert-outline" width={12} /> Pending approval</span>
                          )}
                          {booking.status === "pending" && canEdit && (
                            <button onClick={() => openSupplyModal(booking)} style={{ padding: "6px 10px", cursor: "pointer", borderRadius: 6, border: "1px solid #bfdbfe", color: "#0070f3", background: "#eff6ff", fontSize: FONT_SIZE.xs, fontWeight: 600, transition: "all 0.2s", minHeight: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 }} onMouseEnter={e => e.currentTarget.style.background = "#dbeafe"} onMouseLeave={e => e.currentTarget.style.background = "#eff6ff"}>
                              <Icon icon="mdi:truck-check" width={14} /> Supply
                            </button>
                          )}
                          {booking.status === "partial" && canEdit && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              <span style={{ fontSize: 11, color: "#9a3412", fontWeight: 600 }}>{booking.bags_supplied || 0}/{booking.number_of_bags.toLocaleString()} bags</span>
                              <button onClick={() => openSupplyModal(booking)} style={{ padding: "6px 10px", cursor: "pointer", borderRadius: 6, border: "1px solid #fed7aa", color: "#ea580c", background: "#fff7ed", fontSize: FONT_SIZE.xs, fontWeight: 600, transition: "all 0.2s", minHeight: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 }} onMouseEnter={e => e.currentTarget.style.background = "#ffedd5"} onMouseLeave={e => e.currentTarget.style.background = "#fff7ed"}>
                                <Icon icon="mdi:truck-check" width={14} /> Supply More
                              </button>
                            </div>
                          )}
                          {(booking.status === "supplied" || booking.status === "rejected" || !canEdit) && (
                            <span style={{ fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>—</span>
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

      {filtered.length > 0 && (
        <PaginationControls page={page} totalPages={totalPages} totalItems={totalItems} onPageChange={setPage} />
      )}

      {/* Supply Modal */}
      {supplyModal && (
        <div onClick={() => { setSupplyModal(null); setSupplyDate(""); setSupplyBags("") }} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 100, padding: isMobile ? 0 : 24, animation: "fadeIn 0.2s ease-out" }}>
          <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: isMobile ? "20px 20px 0 0" : 12, padding: isMobile ? "28px 20px" : 32, width: "100%", maxWidth: 420, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)", animation: "slideUp 0.3s cubic-bezier(0.16,1,0.3,1)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h3 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>Mark as Supplied</h3>
              <button onClick={() => { setSupplyModal(null); setSupplyDate(""); setSupplyBags("") }} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 0, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", transition: "color 0.2s" }} onMouseEnter={e => e.currentTarget.style.color = "#64748b"} onMouseLeave={e => e.currentTarget.style.color = "#94a3b8"}><Icon icon="mdi:close" width={20} /></button>
            </div>
            <p style={{ margin: "0 0 20px", fontSize: FONT_SIZE.sm, color: "#64748b" }}>
              {supplyModal.customer_name || "Unknown"} — {supplyModal.number_of_bags.toLocaleString()} bags of {supplyModal.product}
              {(supplyModal.bags_supplied || 0) > 0 && (
                <span style={{ display: "block", marginTop: 4, color: "#9a3412", fontWeight: 600 }}>
                  {supplyModal.bags_supplied} bags already supplied · {supplyModal.number_of_bags - (supplyModal.bags_supplied || 0)} remaining
                </span>
              )}
            </p>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: FONT_SIZE.sm, color: "#475569" }}>Bags to Supply *</label>
              <ModernInput
                type="number"
                min={1}
                max={supplyModal.number_of_bags - (supplyModal.bags_supplied || 0)}
                value={supplyBags}
                onChange={e => { setSupplyBags(e.target.value); setMessage("") }}
                placeholder={`Max ${supplyModal.number_of_bags - (supplyModal.bags_supplied || 0)}`}
                style={{ width: "100%", padding: isMobile ? "14px 12px" : "11px 12px", boxSizing: "border-box", borderRadius: 8, border: "1.5px solid #e5e5e5", fontSize: isMobile ? 16 : 14, background: "white", color: "#171717", minHeight: isMobile ? 48 : 42 }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: FONT_SIZE.sm, color: "#475569" }}>Supply Date *</label>
              <ModernInput
                type="date"
                value={supplyDate}
                onChange={e => { setSupplyDate(e.target.value); setMessage("") }}
                style={{ width: "100%", padding: isMobile ? "14px 12px" : "11px 12px", boxSizing: "border-box", borderRadius: 8, border: "1.5px solid #e5e5e5", fontSize: isMobile ? 16 : 14, background: "white", color: "#171717", minHeight: isMobile ? 48 : 42 }}
              />
            </div>

            {message && (
              <div style={{ padding: "10px 14px", background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 16, color: "#b91c1c", fontSize: FONT_SIZE.sm, fontWeight: 600 }}>
                {message}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 10 }}>
              <button onClick={() => { setSupplyModal(null); setSupplyDate(""); setSupplyBags("") }} style={{ padding: "12px 16px", background: "white", color: "#475569", border: "1px solid #cbd5e1", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, minHeight: 44 }}>
                Cancel
              </button>
              <button onClick={handleSupply} disabled={submitting || !supplyDate || !supplyBags} style={{ padding: "12px 16px", background: (!supplyDate || !supplyBags || submitting) ? "#93c5fd" : "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: (!supplyDate || !supplyBags || submitting) ? "not-allowed" : "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, opacity: submitting ? 0.7 : 1, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {submitting ? <Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} /> : <Icon icon="mdi:truck-check" width={16} />}
                {submitting ? "Saving..." : "Confirm Supply"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <div onClick={() => { setRejectModal(null); setRejectReason("") }} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 100, padding: isMobile ? 0 : 24, animation: "fadeIn 0.2s ease-out" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: isMobile ? "20px 20px 0 0" : 12, padding: isMobile ? "28px 20px" : 32, width: "100%", maxWidth: 420, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)", animation: "slideUp 0.3s cubic-bezier(0.16,1,0.3,1)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h3 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>Reject Booking</h3>
              <button onClick={() => { setRejectModal(null); setRejectReason("") }} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 0, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", transition: "color 0.2s" }} onMouseEnter={e => e.currentTarget.style.color = "#64748b"} onMouseLeave={e => e.currentTarget.style.color = "#94a3b8"}><Icon icon="mdi:close" width={20} /></button>
            </div>
            <p style={{ margin: "0 0 20px", fontSize: FONT_SIZE.sm, color: "#64748b" }}>
              {rejectModal.customer_name || "Unknown"} — {rejectModal.number_of_bags.toLocaleString()} bags of {rejectModal.product}
            </p>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: FONT_SIZE.sm, color: "#475569" }}>Rejection Reason *</label>
              <textarea
                value={rejectReason}
                onChange={e => { setRejectReason(e.target.value); setMessage("") }}
                placeholder="Provide a reason for rejection..."
                rows={3}
                style={{ width: "100%", padding: isMobile ? "14px 12px" : "11px 12px", boxSizing: "border-box", borderRadius: 8, border: "1.5px solid #e5e5e5", fontSize: isMobile ? 16 : 14, background: "white", color: "#171717", minHeight: isMobile ? 80 : 80, resize: "none" }}
              />
            </div>

            {message && (
              <div style={{ padding: "10px 14px", background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 16, color: "#b91c1c", fontSize: FONT_SIZE.sm, fontWeight: 600 }}>
                {message}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 10 }}>
              <button onClick={() => { setRejectModal(null); setRejectReason("") }} style={{ padding: "12px 16px", background: "white", color: "#475569", border: "1px solid #cbd5e1", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, minHeight: 44 }}>
                Cancel
              </button>
              <button onClick={handleReject} disabled={submitting || !rejectReason.trim()} style={{ padding: "12px 16px", background: (!rejectReason.trim() || submitting) ? "#fca5a5" : "#ef4444", color: "white", border: "none", borderRadius: 8, cursor: (!rejectReason.trim() || submitting) ? "not-allowed" : "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, opacity: submitting ? 0.7 : 1, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {submitting ? <Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} /> : <Icon icon="mdi:close-circle" width={16} />}
                {submitting ? "Rejecting..." : "Reject Booking"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
