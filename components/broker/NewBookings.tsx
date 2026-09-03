"use client"

import { useState, useEffect, useCallback } from "react"
import { Icon } from "@iconify/react"
import { supabase } from "@/lib/supabase"
import { useBreakpoint } from "@/app/hooks/useBreakpoint"
import { usePagination } from "@/lib/hooks/usePagination"
import PaginationControls from "@/components/PaginationControls"
import NewBookingModal from "@/components/broker/NewBookingModal"
import { FONT_SIZE } from "@/lib/constants"
import type { NewBooking } from "@/lib/types"

const AREAS = ["Calabar to Obubra", "Ikom to Obudu", "Akwa-Ibom", "East"]

type FilterKey = "all" | "pending" | "awaiting_review" | "rejected" | "supplied"

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; border: string; icon: string }> = {
  pending:         { label: "Pending",         bg: "#eff6ff", color: "#0070f3", border: "#0070f3", icon: "mdi:clock-outline" },
  awaiting_review: { label: "Awaiting Review", bg: "#fffbeb", color: "#d97706", border: "#fcd34d", icon: "mdi:clock-alert-outline" },
  supplied:        { label: "Supplied",        bg: "#ecfdf5", color: "#059669", border: "#10b981", icon: "mdi:check-circle" },
  rejected:        { label: "Rejected",        bg: "#fef2f2", color: "#dc2626", border: "#ef4444", icon: "mdi:close-circle" },
}

const FILTER_COLORS: Record<FilterKey, string> = {
  all: "#171717", pending: "#0070f3", awaiting_review: "#f5a623", rejected: "#ef4444", supplied: "#10b981",
}

const getPillStyle = (filter: FilterKey, isActive: boolean) => {
  if (!isActive) return { bg: "white", textColor: "#64748b", borderColor: "#e2e8f0" }
  const color = FILTER_COLORS[filter]
  const tint: Record<FilterKey, string> = {
    all: "#f5f5f5", pending: "#eff6ff", awaiting_review: "#fffbeb", rejected: "#fef2f2", supplied: "#ecfdf5",
  }
  return { bg: tint[filter], textColor: color, borderColor: color }
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })
}

export default function NewBookings() {
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"

  const [brokerId, setBrokerId] = useState<string | null>(null)
  const [bookings, setBookings] = useState<NewBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all")
  const [viewMode, setViewMode] = useState<"card" | "table">("card")
  const [expandedCard, setExpandedCard] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editBooking, setEditBooking] = useState<NewBooking | null>(null)
  const [modalKey, setModalKey] = useState(0)
  const [companyPriceMap, setCompanyPriceMap] = useState<Record<string, Record<string, number>>>({})

  const initBroker = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.href = "/login"; return }
    setBrokerId(session.user.id)
    await Promise.all([fetchBookings(session.user.id), fetchCompanyPrices()])
    setLoading(false)
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { initBroker() }, [initBroker])

  async function fetchCompanyPrices() {
    const { data, error } = await supabase.from("company_prices").select("area, product, price")
    if (!error && data) {
      const map: Record<string, Record<string, number>> = {}
      for (const area of AREAS) map[area] = {}
      for (const row of data) {
        if (!map[row.area]) map[row.area] = {}
        map[row.area][row.product] = row.price
      }
      setCompanyPriceMap(map)
    }
  }

  async function fetchBookings(bId: string) {
    const { data, error } = await supabase
      .from("new_bookings")
      .select("*")
      .eq("broker_id", bId)
      .order("created_at", { ascending: false })
    if (error) { console.error("Failed to fetch bookings:", error); return }
    setBookings((data || []) as NewBooking[])
  }

  function openCreateModal() {
    setEditBooking(null)
    setModalKey(k => k + 1)
    setModalOpen(true)
  }

  function openEditModal(booking: NewBooking) {
    setEditBooking(booking)
    setModalKey(k => k + 1)
    setModalOpen(true)
  }

  function handleResubmit(booking: NewBooking) {
    setEditBooking(booking)
    setModalKey(k => k + 1)
    setModalOpen(true)
  }

  const pending = bookings.filter(b => b.status === "pending")
  const awaitingReview = bookings.filter(b => b.status === "awaiting_review")
  const rejected = bookings.filter(b => b.status === "rejected")
  const supplied = bookings.filter(b => b.status === "supplied")

  const filtered = activeFilter === "all" ? bookings
    : activeFilter === "pending" ? pending
    : activeFilter === "awaiting_review" ? awaitingReview
    : activeFilter === "rejected" ? rejected
    : supplied

  const { page, setPage, totalPages, paginatedItems, totalItems } = usePagination(filtered)

  const filterOptions: { key: FilterKey; label: string; count: number }[] = [
    { key: "all", label: "All", count: bookings.length },
    { key: "pending", label: "Pending", count: pending.length },
    { key: "awaiting_review", label: "Awaiting Review", count: awaitingReview.length },
    { key: "rejected", label: "Rejected", count: rejected.length },
    { key: "supplied", label: "Supplied", count: supplied.length },
  ]

  const emptyState: Record<FilterKey, { title: string; desc: string }> = {
    all: { title: "No bookings yet", desc: "Create your first booking to get started." },
    pending: { title: "No pending bookings", desc: "No bookings currently awaiting supply." },
    awaiting_review: { title: "No bookings awaiting review", desc: "No bookings are pending admin review." },
    rejected: { title: "No rejected bookings", desc: "No bookings have been rejected." },
    supplied: { title: "No supplied bookings", desc: "No bookings have been supplied yet." },
  }

  const thStyle: React.CSSProperties = {
    padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs,
    color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap",
  }

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "64px 0" }}>
        <div style={{ width: 36, height: 36, border: "3px solid #e2e8f0", borderTopColor: "#0070f3", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: isMobile ? 20 : 22, color: "#171717", fontWeight: 700 }}>New Bookings</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
          {/* New Booking CTA */}
          <button
            onClick={openCreateModal}
            style={{
              padding: "10px 16px", background: "#0070f3", color: "white", border: "none", borderRadius: 8,
              cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, display: "flex", alignItems: "center", gap: 6,
              boxShadow: "0 4px 12px rgba(0,112,243,0.2)", transition: "all 0.2s", minHeight: 40,
            }}
            onMouseEnter={e => { if (!isMobile) e.currentTarget.style.transform = "translateY(-1px)" }}
            onMouseLeave={e => { if (!isMobile) e.currentTarget.style.transform = "none" }}
          >
            <Icon icon="mdi:plus" width={18} />
            {isMobile ? "New" : "New Booking"}
          </button>
        </div>
      </div>

      {/* Filter pills — wrap instead of horizontal scroll */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20, overflowX: "auto", paddingBottom: 4 }}>
        {filterOptions.map(({ key, label, count }) => {
          const isActive = activeFilter === key
          const pill = getPillStyle(key, isActive)
          return (
            <button key={key} onClick={() => { setActiveFilter(key); setPage(1) }} style={{
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

      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 24px", background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ width: 56, height: 56, background: "#f1f5f9", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <Icon icon="mdi:book-open-variant" width={28} color="#94a3b8" />
          </div>
          <h3 style={{ margin: "0 0 8px", color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 600 }}>{emptyState[activeFilter].title}</h3>
          <p style={{ margin: 0, color: "#64748b", fontSize: FONT_SIZE.base }}>{emptyState[activeFilter].desc}</p>
        </div>
      ) : viewMode === "card" ? (
        <div>
          {paginatedItems.map((booking) => {
            const isExpanded = expandedCard === booking.id
            const status = STATUS_CONFIG[booking.status] || STATUS_CONFIG.pending
            return (
              <div key={booking.id} style={{
                background: "white",
                borderRadius: 12,
                borderTop: `1px solid ${isExpanded ? status.border : "#e2e8f0"}`,
                borderRight: `1px solid ${isExpanded ? status.border : "#e2e8f0"}`,
                borderBottom: `1px solid ${isExpanded ? status.border : "#e2e8f0"}`,
                borderLeft: `3px solid ${status.border}`,
                boxShadow: isExpanded ? "0 4px 12px rgba(0,0,0,0.08)" : "0 1px 3px rgba(0,0,0,0.04)",
                transition: "all 0.2s ease", marginBottom: 12,
              }}>
                {/* Summary row — clickable button for keyboard accessibility */}
                <button
                  type="button"
                  onClick={() => setExpandedCard(isExpanded ? null : booking.id)}
                  aria-expanded={isExpanded}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: isMobile ? "14px 16px" : "16px 20px", width: "100%", background: "transparent",
                    border: "none", cursor: "pointer", textAlign: "left",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: status.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Icon icon={status.icon} width={18} color={status.color} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: FONT_SIZE.lg, color: "#0f172a" }}>{booking.customer_name || "Unknown Customer"}</p>
                      <p style={{ margin: "2px 0 0", fontSize: FONT_SIZE.sm, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {booking.area} · {booking.product} · {booking.number_of_bags.toLocaleString()} bags
                      </p>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, paddingLeft: 8 }}>
                    <span style={{ padding: "4px 10px", borderRadius: 14, fontSize: FONT_SIZE.xs, fontWeight: 600, background: status.bg, color: status.color, border: `1.5px solid ${status.border}`, whiteSpace: "nowrap" }}>
                      {status.label}
                    </span>
                    <Icon icon="mdi:chevron-down" width={20} color="#94a3b8" style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
                  </div>
                </button>

                {/* Expanded detail section */}
                {isExpanded && (
                  <div style={{ padding: "0 20px 20px", borderTop: "1px solid #f1f5f9" }}>
                    {/* Detail grid */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "14px 0", borderBottom: "1px solid #f1f5f9", marginBottom: 12 }}>
                      <div><p style={{ margin: "0 0 4px", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>Area</p><p style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 500 }}>{booking.area}</p></div>
                      <div><p style={{ margin: "0 0 4px", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>Product</p><p style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 500 }}>{booking.product}</p></div>
                      <div><p style={{ margin: "0 0 4px", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>Location</p><p style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 500 }}>{booking.location}</p></div>
                      <div><p style={{ margin: "0 0 4px", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>Date of Payment</p><p style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 500 }}>{formatDate(booking.payment_date)}</p></div>
                      <div><p style={{ margin: "0 0 4px", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>Bags</p><p style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 600 }}>{booking.number_of_bags.toLocaleString()}</p></div>
                      <div><p style={{ margin: "0 0 4px", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>Rate / Bag</p><p style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 600 }}>₦{booking.rate_per_bag.toLocaleString()}</p></div>
                      <div><p style={{ margin: "0 0 4px", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>Total Amount</p><p style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 700 }}>₦{booking.total_amount.toLocaleString()}</p></div>
                      {booking.supply_date && (
                        <div><p style={{ margin: "0 0 4px", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>Supply Date</p><p style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 500 }}>{formatDate(booking.supply_date)}</p></div>
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

                    {/* Awaiting review note */}
                    {booking.status === "awaiting_review" && (
                      <div style={{ padding: "10px 12px", borderRadius: 8, background: "#fffbeb", border: "1px solid #fcd34d", marginBottom: 12 }}>
                        <p style={{ margin: 0, color: "#d97706", fontSize: FONT_SIZE.sm, fontWeight: 600 }}>
                          <Icon icon="mdi:clock-alert-outline" width={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
                          Awaiting admin review
                        </p>
                      </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 8, marginTop: 4 }} onClick={e => e.stopPropagation()}>
                      {booking.status === "rejected" && (
                        <button onClick={() => handleResubmit(booking)} style={{ flex: 1, padding: "10px 0", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.sm, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "all 0.2s" }} onMouseEnter={e => e.currentTarget.style.background = "#0055d4"} onMouseLeave={e => e.currentTarget.style.background = "#0070f3"}>
                          <Icon icon="mdi:refresh" width={16} /> Resubmit
                        </button>
                      )}
                      {booking.status === "pending" && (
                        <button onClick={() => openEditModal(booking)} style={{ flex: 1, padding: "10px 0", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.sm, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "all 0.2s" }} onMouseEnter={e => e.currentTarget.style.background = "#0055d4"} onMouseLeave={e => e.currentTarget.style.background = "#0070f3"}>
                          <Icon icon="mdi:pencil" width={16} /> Edit
                        </button>
                      )}
                      {(booking.status === "awaiting_review" || booking.status === "supplied") && (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 12px", borderRadius: 8, background: booking.status === "awaiting_review" ? "#fffbeb" : "#f0fdf4", border: `1px solid ${booking.status === "awaiting_review" ? "#fcd34d" : "#bbf7d0"}`, width: "100%" }}>
                          <Icon icon={status.icon} width={15} color={status.color} />
                          <span style={{ fontSize: FONT_SIZE.sm, color: status.color, fontWeight: 600 }}>
                            {booking.status === "awaiting_review" ? "Awaiting Review" : "Supplied"}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          {totalPages > 1 && <PaginationControls page={page} totalPages={totalPages} totalItems={totalItems} onPageChange={setPage} />}
        </div>
      ) : (
        <div style={{ background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", minWidth: 900 }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                <th style={thStyle}>Customer</th>
                <th style={thStyle}>Area / Product</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Bags</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Rate</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
                <th style={thStyle}>Payment Date</th>
                <th style={thStyle}>Status</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map((booking, idx) => {
                const status = STATUS_CONFIG[booking.status] || STATUS_CONFIG.pending
                return (
                  <tr key={booking.id} style={{ borderBottom: idx === filtered.length - 1 ? "none" : "1px solid #e2e8f0", transition: "background 0.2s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: FONT_SIZE.sm, fontWeight: 500 }}>{booking.customer_name || "Unknown"}</td>
                    <td style={{ padding: "12px 16px", color: "#475569", fontSize: FONT_SIZE.sm }}>{booking.area} · {booking.product}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", color: "#0f172a", fontSize: FONT_SIZE.sm, fontWeight: 600 }}>{booking.number_of_bags.toLocaleString()}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", color: "#475569", fontSize: FONT_SIZE.sm }}>₦{booking.rate_per_bag.toLocaleString()}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", color: "#0f172a", fontSize: FONT_SIZE.sm, fontWeight: 600 }}>₦{booking.total_amount.toLocaleString()}</td>
                    <td style={{ padding: "12px 16px", color: "#64748b", fontSize: FONT_SIZE.sm, whiteSpace: "nowrap" }}>{formatDate(booking.payment_date)}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ padding: "6px 10px", borderRadius: 14, fontSize: FONT_SIZE.xs, fontWeight: 600, background: status.bg, color: status.color, border: `1.5px solid ${status.border}`, whiteSpace: "nowrap" }}>{status.label}</span>
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      {booking.status === "rejected" && (
                        <button onClick={() => handleResubmit(booking)} style={{ padding: "6px 10px", cursor: "pointer", borderRadius: 6, border: "1px solid #bfdbfe", color: "#0070f3", background: "#eff6ff", fontSize: FONT_SIZE.xs, fontWeight: 600, transition: "all 0.2s", minHeight: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 }} onMouseEnter={e => e.currentTarget.style.background = "#dbeafe"} onMouseLeave={e => e.currentTarget.style.background = "#eff6ff"}>
                          <Icon icon="mdi:refresh" width={14} /> Resubmit
                        </button>
                      )}
                      {booking.status === "pending" && (
                        <button onClick={() => openEditModal(booking)} style={{ padding: "6px 10px", cursor: "pointer", borderRadius: 6, border: "1px solid #bfdbfe", color: "#0070f3", background: "#eff6ff", fontSize: FONT_SIZE.xs, fontWeight: 600, transition: "all 0.2s", minHeight: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 }} onMouseEnter={e => e.currentTarget.style.background = "#dbeafe"} onMouseLeave={e => e.currentTarget.style.background = "#eff6ff"}>
                          <Icon icon="mdi:pencil" width={14} /> Edit
                        </button>
                      )}
                      {(booking.status === "awaiting_review" || booking.status === "supplied") && (
                        <span style={{ fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {totalPages > 1 && <PaginationControls page={page} totalPages={totalPages} totalItems={totalItems} onPageChange={setPage} />}
        </div>
      )}

      <NewBookingModal
        key={modalKey}
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditBooking(null) }}
        brokerId={brokerId || ""}
        isMobile={isMobile}
        companyPriceMap={companyPriceMap}
        onSaved={() => { if (brokerId) fetchBookings(brokerId) }}
        editBooking={editBooking}
      />
    </div>
  )
}
