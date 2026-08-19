"use client"

import { useState, useEffect, useCallback } from "react"
import { Icon } from "@iconify/react"
import { supabase } from "@/lib/supabase"
import { apiMutate } from "@/lib/api-mutation"
import ModernInput from "@/components/ModernInput"
import BrokerConfirmModal from "@/components/broker/BrokerConfirmModal"
import { useBreakpoint } from "@/app/hooks/useBreakpoint"
import { usePagination } from "@/lib/hooks/usePagination"
import PaginationControls from "@/components/PaginationControls"

const AREAS = ["Calabar to Obubra", "Ikom to Obudu", "Akwa-Ibom", "East"]

type Stop = {
  stop_id: string
  trip_id: string
  customer_id: string | null
  customer_name: string
  quantity_offloaded: number
  stop_location: string
  stop_time: string
  plate_number: string
  material_centre: string
  atc: string | null
  order_no: string | null
  child_order_no: string | null
  product: string
  confirmed: boolean
  disputed: boolean
  discount_status: string | null
  on_credit: boolean
  credit_approval_id: string | null
  credit_approval_status: string | null
  denial_reason?: string | null
  denied_by?: string | null
  denial_date?: string | null
}

export default function MyStops() {
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"

  const [brokerId, setBrokerId] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<"pending" | "confirmed" | "disputed" | "returned" | "review">("pending")
  const [allStops, setAllStops] = useState<Stop[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<"card" | "table">("card")

  const [selectedStop, setSelectedStop] = useState<Stop | null>(null)
  const [confirmModalKey, setConfirmModalKey] = useState(0)
  const [disputingStop, setDisputingStop] = useState<Stop | null>(null)
  const [disputeReason, setDisputeReason] = useState("")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [companyPriceMap, setCompanyPriceMap] = useState<Record<string, Record<string, number>>>({})
  const [expandedCard, setExpandedCard] = useState<string | null>(null)
  const [stopAdjustments, setStopAdjustments] = useState<Record<string, { company_price: number; adjusted_price: number; price_reason: string }>>({})

  const fetchStops = useCallback(async (bId: string) => {
    const { data: stops, error } = await supabase
      .from("Stops")
      .select(`
        stop_id, trip_id, customer_id, quantity_offloaded, stop_location, stop_time, confirmed, disputed, discount_status, on_credit, credit_approval_id,
        Trips!inner(plate_number, material_centre, ATC, order_no, child_order_no, product),
        Customers(full_name)
      `)
      .eq("broker_id", bId)
      .order("stop_time", { ascending: false })

    if (error) { console.error("Failed to fetch stops:", error); return }

    const stopsData = (stops || []) as unknown as StopRow[]
    const creditApprovalIds = stopsData.filter(s => s.credit_approval_id).map(s => s.credit_approval_id as string)
    const creditMap: Record<string, string> = {}
    if (creditApprovalIds.length > 0) {
      const { data: cas } = await supabase
        .from("credit_approvals")
        .select("id, status")
        .in("id", creditApprovalIds)
      for (const ca of (cas || [])) creditMap[ca.id] = ca.status
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const enriched = (stopsData || []).map((stop: any) => ({
      stop_id: stop.stop_id,
      trip_id: stop.trip_id,
      customer_id: stop.customer_id,
      quantity_offloaded: stop.quantity_offloaded,
      stop_location: stop.stop_location,
      stop_time: stop.stop_time,
      confirmed: stop.confirmed,
      disputed: stop.disputed,
      discount_status: stop.discount_status ?? "none",
      on_credit: stop.on_credit ?? false,
      credit_approval_id: stop.credit_approval_id ?? null,
      credit_approval_status: stop.credit_approval_id ? (creditMap[stop.credit_approval_id] ?? null) : null,
      plate_number: stop.Trips?.plate_number ?? "Unknown",
      material_centre: stop.Trips?.material_centre ?? "",
      atc: stop.Trips?.ATC ?? null,
      order_no: stop.Trips?.order_no ?? null,
      child_order_no: stop.Trips?.child_order_no ?? null,
      product: stop.Trips?.product ?? "",
      customer_name: stop.Customers?.full_name ?? "Not provided",
    }))

    const returnedStops = enriched.filter(s => s.discount_status === "returned" || s.credit_approval_status === "Rejected")
    const returnedIds = returnedStops.map(s => s.stop_id)
    const denialMap: Record<string, { reason: string; by: string; at: string }> = {}

    if (returnedIds.length > 0) {
      const { data: adjRows } = await supabase
        .from("price_adjustments")
        .select("source_id, denial_reason, reviewed_by, reviewed_at")
        .eq("source_type", "stop")
        .eq("status", "Denied")
        .in("source_id", returnedIds)
      for (const a of adjRows || []) {
        if (a.denial_reason) denialMap[a.source_id] = { reason: a.denial_reason, by: a.reviewed_by ?? "Admin", at: a.reviewed_at ?? "" }
      }

      const creditRejectedIds = returnedStops.filter(s => s.credit_approval_id).map(s => s.credit_approval_id as string)
      if (creditRejectedIds.length > 0) {
        const { data: cas } = await supabase
          .from("credit_approvals")
          .select("source_id, rejection_reason, reviewed_by, credit_manager_id, reviewed_at")
          .eq("status", "Rejected")
          .in("id", creditRejectedIds)
        for (const ca of cas || []) {
          if (ca.rejection_reason && !denialMap[ca.source_id]) {
            denialMap[ca.source_id] = { reason: ca.rejection_reason, by: ca.reviewed_by ?? ca.credit_manager_id ?? "Credit Manager", at: ca.reviewed_at ?? "" }
          }
        }
      }

      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      const reviewerIds = [...new Set(Object.values(denialMap).map(d => d.by).filter(id => UUID_RE.test(id)))]
      if (reviewerIds.length > 0) {
        const { data: profiles } = await supabase
          .from("Profiles")
          .select("user_id, full_name")
          .in("user_id", reviewerIds)
        const nameMap: Record<string, string> = {}
        for (const p of profiles || []) nameMap[p.user_id] = p.full_name
        for (const key of Object.keys(denialMap)) {
          const entry = denialMap[key]
          if (nameMap[entry.by]) entry.by = nameMap[entry.by]
        }
      }
    }

    setAllStops(enriched.map(s => ({
      ...s,
      denial_reason: denialMap[s.stop_id]?.reason ?? null,
      denied_by: denialMap[s.stop_id]?.by ?? null,
      denial_date: denialMap[s.stop_id]?.at ?? null,
    })))

    const stopIds = enriched.map(s => s.stop_id)
    if (stopIds.length > 0) {
      const { data: adjustments } = await supabase
        .from("price_adjustments")
        .select("source_id, company_price, adjusted_price, price_reason")
        .eq("source_type", "stop")
        .in("source_id", stopIds)
      const adjMap: Record<string, { company_price: number; adjusted_price: number; price_reason: string }> = {}
      for (const a of (adjustments || [])) adjMap[a.source_id] = { company_price: a.company_price, adjusted_price: a.adjusted_price, price_reason: a.price_reason }
      setStopAdjustments(adjMap)
    }
  }, [])

  const initBroker = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.href = "/login"; return }
    setBrokerId(session.user.id)
    const { data: priceData } = await supabase.from("company_prices").select("*")
    const priceMap: Record<string, Record<string, number>> = {}
    for (const area of AREAS) priceMap[area] = {}
    for (const p of (priceData || [])) {
      if (!priceMap[p.area]) priceMap[p.area] = {}
      priceMap[p.area][p.product] = p.price
    }
    setCompanyPriceMap(priceMap)
    await fetchStops(session.user.id)
    setLoading(false)
  }, [fetchStops])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { initBroker() }, [initBroker])

  type StopRow = {
    stop_id: string; trip_id: string; customer_id: string | null;
    quantity_offloaded: number; stop_location: string; stop_time: string;
    confirmed: boolean; disputed: boolean; discount_status: string | null;
    on_credit: boolean; credit_approval_id: string | null;
    Trips: { plate_number: string; material_centre: string; ATC: string | null; order_no: string | null; child_order_no: string | null; product: string } | null;
    Customers: { full_name: string } | null;
  }

  function openConfirmModal(stop: Stop) {
    setSelectedStop(stop)
    setConfirmModalKey(k => k + 1)
    setMessage("")
  }

  function closeModal() {
    setSelectedStop(null)
    setMessage("")
  }

  async function handleDispute() {
    if (!disputingStop || !disputeReason.trim()) { setMessage("Please provide a reason"); return }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setSubmitting(true)
    try {
      const { error } = await apiMutate("trips", {
        action: "update", table: "Stops",
        data: { disputed: true, dispute_reason: disputeReason, disputed_by: user.id },
        filters: { stop_id: disputingStop.stop_id },
      })
      if (error) { setMessage("Failed to dispute stop"); return }
      setDisputingStop(null); setDisputeReason(""); if (brokerId) fetchStops(brokerId)
    } catch {
      setMessage("Failed to dispute stop")
    } finally {
      setSubmitting(false)
    }
  }

  const pendingStops = allStops.filter(s => !s.confirmed && !s.disputed && s.discount_status !== "returned" && s.credit_approval_status !== "Pending" && s.discount_status !== "pending")
  const reviewStops = allStops.filter(s => !s.confirmed && !s.disputed && (s.credit_approval_status === "Pending" || s.discount_status === "pending"))
  const confirmedStops = allStops.filter(s => s.confirmed && s.discount_status !== "returned")
  const disputedStops = allStops.filter(s => s.disputed)
  const returnedStops = allStops.filter(s => s.discount_status === "returned")

  const visibleStops = activeFilter === "pending" ? pendingStops : activeFilter === "review" ? reviewStops : activeFilter === "confirmed" ? confirmedStops : activeFilter === "returned" ? returnedStops : activeFilter === "disputed" ? disputedStops : []

  const { page, setPage, totalPages, paginatedItems, totalItems } = usePagination(visibleStops)

  if (loading) return <p style={{ color: "#888" }}>Loading…</p>

  const filterOptions = [
    { key: "pending" as const, label: "Pending", count: pendingStops.length, color: "#0070f3" },
    { key: "review" as const, label: "Awaiting Review", count: reviewStops.length, color: "#f5a623" },
    { key: "confirmed" as const, label: "Confirmed", count: confirmedStops.length, color: "#10b981" },
    { key: "returned" as const, label: "Returned", count: returnedStops.length, color: "#7c3aed" },
    { key: "disputed" as const, label: "Disputed", count: disputedStops.length, color: "#ff4444" },
  ]

  const inputStyle: React.CSSProperties = { width: "100%", padding: isMobile ? "14px 12px" : "11px 12px", boxSizing: "border-box", borderRadius: 8, border: "1.5px solid #e5e5e5", fontSize: isMobile ? 16 : 14, background: "white", color: "#171717", minHeight: isMobile ? 48 : 42 }
  const labelStyle: React.CSSProperties = { fontWeight: "600", display: "block", marginBottom: 6, fontSize: isMobile ? 14 : 13, color: "#444" }
  const modalOverlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 100 }
  const modalBox: React.CSSProperties = { background: "white", borderRadius: isMobile ? "20px 20px 0 0" : 14, padding: isMobile ? "24px 20px 40px" : 32, width: isMobile ? "100%" : 420, maxHeight: isMobile ? "92vh" : "88vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: isMobile ? 22 : 20, color: "#171717" }}>My Stops</h2>
        {allStops.length > 0 && (
          <div style={{ display: "flex", background: "white", border: "1px solid #e2e8f0", borderRadius: 8, padding: 4, gap: 0 }}>
            <button onClick={() => setViewMode("card")} style={{
              padding: "8px 12px", background: viewMode === "card" ? "#0070f3" : "transparent",
              color: viewMode === "card" ? "white" : "#64748b", border: "none", borderRadius: 6,
              cursor: "pointer", fontSize: 12, fontWeight: 600, transition: "all 0.2s ease",
              minWidth: 44, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
            }} title="Card view">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z"/></svg>
            </button>
            <button onClick={() => setViewMode("table")} style={{
              padding: "8px 12px", background: viewMode === "table" ? "#0070f3" : "transparent",
              color: viewMode === "table" ? "white" : "#64748b", border: "none", borderRadius: 6,
              cursor: "pointer", fontSize: 12, fontWeight: 600, transition: "all 0.2s ease",
              minWidth: 44, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
            }} title="Table view">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 4h18v2H3V4zm0 7h18v2H3v-2zm0 7h18v2H3v-2z"/></svg>
            </button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 8 }}>
        {filterOptions.map(({ key, label, count }) => {
          const isActive = activeFilter === key
          const activeBg = key === "pending" ? "rgba(0,112,243,0.1)" : key === "review" ? "rgba(245,166,35,0.1)" : key === "confirmed" ? "rgba(16,185,129,0.1)" : key === "returned" ? "rgba(124,58,237,0.1)" : "rgba(239,68,68,0.1)"
          const activeColor = key === "pending" ? "#0070f3" : key === "review" ? "#f5a623" : key === "confirmed" ? "#10b981" : key === "returned" ? "#7c3aed" : "#ef4444"
          const activeBorder = key === "pending" ? "#0070f3" : key === "review" ? "#f5a623" : key === "confirmed" ? "#10b981" : key === "returned" ? "#7c3aed" : "#ef4444"
          return (
            <button key={key} onClick={() => setActiveFilter(key)} style={{
              padding: isMobile ? "9px 16px" : "7px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer",
              border: `1.5px solid ${isActive ? activeBorder : "#e2e8f0"}`,
              background: isActive ? activeBg : "white",
              color: isActive ? activeColor : "#64748b",
              fontWeight: isActive ? 600 : 500,
              minHeight: 38, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
              transition: "all 0.2s ease",
            }}>
              {label}
              {count > 0 && (
                <span style={{
                  background: isActive ? "rgba(255,255,255,0.5)" : "#f1f5f9",
                  color: isActive ? activeColor : "#64748b",
                  borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 600,
                }}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {visibleStops.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#bbb" }}>
          <Icon icon="mdi:map-marker-off" width={40} style={{ marginBottom: 10, display: "block", margin: "0 auto 10px" }} />
          <p style={{ margin: 0, fontSize: 14 }}>No {activeFilter} stops</p>
        </div>
      ) : viewMode === "card" ? (
        paginatedItems.map((stop) => {
          const isExpanded = expandedCard === stop.stop_id
          const statusColor = stop.discount_status === "returned" ? { bg: "#f5f3ff", text: "#7c3aed", border: "#c4b5fd", label: "Returned" }
            : (stop.discount_status === "pending" || stop.credit_approval_status === "Pending") ? { bg: "#fffbeb", text: "#f5a623", border: "#fcd34d", label: "In Review" }
            : stop.confirmed ? { bg: "#ecfdf5", text: "#10b981", border: "#a7f3d0", label: "Confirmed" }
            : stop.disputed ? { bg: "#fef2f2", text: "#ef4444", border: "#fecaca", label: "Disputed" }
            : { bg: "#f0f7ff", text: "#0070f3", border: "#bfdbfe", label: "Pending" }
          return (
          <div key={stop.stop_id} style={{ background: "white", borderTop: `1px solid ${isExpanded ? "#bfdbfe" : "#e2e8f0"}`, borderRight: `1px solid ${isExpanded ? "#bfdbfe" : "#e2e8f0"}`, borderBottom: `1px solid ${isExpanded ? "#bfdbfe" : "#e2e8f0"}`, borderLeft: `3px solid ${statusColor.border}`, borderRadius: 12, marginBottom: 10, boxShadow: isExpanded ? "0 4px 12px rgba(0,0,0,0.08)" : "0 1px 3px rgba(0,0,0,0.04)", transition: "all 0.2s ease", cursor: "pointer" }}
            onClick={() => setExpandedCard(isExpanded ? null : stop.stop_id)}
          >
            {/* Summary row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: isMobile ? "14px 16px" : "16px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: "#f0f7ff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon icon="mdi:truck" width={18} color="#0070f3" />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: isMobile ? 15 : 14, color: "#0f172a" }}>{stop.plate_number}</p>
                    <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: statusColor.bg, color: statusColor.text, border: `1px solid ${statusColor.border}` }}>{statusColor.label}</span>
                  </div>
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{stop.stop_location} &middot; {stop.customer_name}</p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, paddingLeft: 8 }}>
                <p style={{ margin: 0, fontSize: 11, color: "#94a3b8" }}>
                  {new Date(stop.stop_time).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}
                </p>
                <Icon icon="mdi:chevron-down" width={18} color="#94a3b8" style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
              </div>
            </div>

            {/* Expanded detail section */}
            {isExpanded && (
              <div style={{ padding: "0 20px 16px", borderTop: "1px solid #f1f5f9" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "12px 0" }}>
                  <div><p style={{ margin: 0, fontSize: 11, color: "#94a3b8" }}>Bags</p><p style={{ margin: "2px 0 0", fontWeight: 700, fontSize: 14, color: "#0f172a" }}>{stop.quantity_offloaded}</p></div>
                  <div><p style={{ margin: 0, fontSize: 11, color: "#94a3b8" }}>Customer</p><p style={{ margin: "2px 0 0", fontSize: 13, color: "#0f172a", fontWeight: 500 }}>{stop.customer_name}</p></div>
                  <div><p style={{ margin: 0, fontSize: 11, color: "#94a3b8" }}>Loading Point</p><p style={{ margin: "2px 0 0", fontSize: 12, color: "#475569" }}>{stop.material_centre}</p></div>
                  {stop.order_no ? (
                    <>
                      <div><p style={{ margin: 0, fontSize: 11, color: "#94a3b8" }}>Order No</p><p style={{ margin: "2px 0 0", fontSize: 12, color: "#475569" }}>{stop.order_no}</p></div>
                      {stop.child_order_no && <div><p style={{ margin: 0, fontSize: 11, color: "#94a3b8" }}>Child Order</p><p style={{ margin: "2px 0 0", fontSize: 12, color: "#475569" }}>{stop.child_order_no}</p></div>}
                    </>
                  ) : stop.atc ? (
                    <div><p style={{ margin: 0, fontSize: 11, color: "#94a3b8" }}>ATC</p><p style={{ margin: "2px 0 0", fontSize: 12, color: "#475569" }}>{stop.atc}</p></div>
                  ) : null}
                </div>

                {(stop.discount_status === "returned" || stop.credit_approval_status === "Rejected") && (
                  <div style={{ marginBottom: 12 }}>
                    <span style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: stop.discount_status === "returned" ? "#f5f3ff" : "#fef2f2", color: stop.discount_status === "returned" ? "#7c3aed" : "#dc2626", border: `1px solid ${stop.discount_status === "returned" ? "#c4b5fd" : "#fecaca"}` }}>{stop.discount_status === "returned" ? "Returned — Edit price to resubmit" : "Credit Rejected"}</span>
                    {stop.denial_reason && (
                      <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca" }}>
                        <p style={{ margin: 0, fontSize: 11, color: "#ef4444", fontWeight: 600 }}>Rejection reason</p>
                        <p style={{ margin: "2px 0 0", fontSize: 12, color: "#374151", fontStyle: "italic" }}>&ldquo;{stop.denial_reason}&rdquo;</p>
                        {stop.denied_by && (
                          <p style={{ margin: "4px 0 0", fontSize: 11, color: "#94a3b8" }}>
                            Returned by <span style={{ fontWeight: 600, color: "#64748b" }}>{stop.denied_by}</span>
                            {stop.denial_date && <span> &middot; {new Date(stop.denial_date).toLocaleDateString()}</span>}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {stop.discount_status === "pending" && (
                  <div style={{ marginBottom: 12 }}>
                    <span style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: "#fffbeb", color: "#f5a623", border: "1px solid #fcd34d" }}>In Review — Awaiting admin approval</span>
                  </div>
                )}

                {stopAdjustments[stop.stop_id] && (
                  <div style={{ padding: "8px 12px", borderRadius: 8, background: "#f8fafc", border: "1px solid #e2e8f0", marginBottom: 12 }}>
                    <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>Price comparison</span>
                    <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                      <div>
                        <p style={{ margin: 0, fontSize: 11, color: "#94a3b8" }}>Company</p>
                        <p style={{ margin: "2px 0 0", fontWeight: 600, fontSize: 13, color: "#0f172a" }}>₦{stopAdjustments[stop.stop_id].company_price.toLocaleString()}</p>
                      </div>
                      <div>
                        <p style={{ margin: 0, fontSize: 11, color: "#94a3b8" }}>Adjusted</p>
                        <p style={{ margin: "2px 0 0", fontWeight: 600, fontSize: 13, color: "#0f172a" }}>₦{stopAdjustments[stop.stop_id].adjusted_price.toLocaleString()}</p>
                      </div>
                      <div>
                        <p style={{ margin: 0, fontSize: 11, color: stopAdjustments[stop.stop_id].adjusted_price > stopAdjustments[stop.stop_id].company_price ? "#059669" : "#854d09" }}>
                          {stopAdjustments[stop.stop_id].adjusted_price > stopAdjustments[stop.stop_id].company_price ? "Premium" : "Discount"}
                        </p>
                        <p style={{ margin: "2px 0 0", fontWeight: 700, fontSize: 13, color: stopAdjustments[stop.stop_id].adjusted_price > stopAdjustments[stop.stop_id].company_price ? "#059669" : "#854d09" }}>
                          ₦{Math.abs(stopAdjustments[stop.stop_id].adjusted_price - stopAdjustments[stop.stop_id].company_price).toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p style={{ margin: 0, fontSize: 11, color: "#94a3b8" }}>Bags</p>
                        <p style={{ margin: "2px 0 0", fontWeight: 600, fontSize: 13, color: "#0f172a" }}>{stop.quantity_offloaded}</p>
                      </div>
                    </div>
                    <div style={{ padding: "6px 0", marginTop: 6, borderTop: "1px solid #e2e8f0" }}>
                      <p style={{ margin: 0, fontSize: 11, color: "#94a3b8" }}>Reason</p>
                      <p style={{ margin: "2px 0 0", fontSize: 12, color: "#374151", fontStyle: "italic" }}>&ldquo;{stopAdjustments[stop.stop_id].price_reason}&rdquo;</p>
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, marginTop: 4 }} onClick={e => e.stopPropagation()}>
                  {activeFilter === "pending" && stop.discount_status === "pending" && (
                    <button disabled style={{ flex: 1, padding: "11px 0", background: "#f5f5f5", color: "#9ca3af", border: "1.5px solid #e5e7eb", borderRadius: 8, cursor: "not-allowed", fontWeight: "bold", fontSize: isMobile ? 14 : 13, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: 0.7 }}>
                      <Icon icon="mdi:clock-outline" width={16} /> Awaiting Review
                    </button>
                  )}
                  {activeFilter === "pending" && stop.discount_status !== "pending" && (
                    <>
                      <button onClick={() => openConfirmModal(stop)} style={{ flex: 1, padding: "11px 0", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold", fontSize: isMobile ? 14 : 13, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                        <Icon icon="mdi:check-circle" width={16} /> Confirm
                      </button>
                      <button onClick={() => { setDisputingStop(stop); setDisputeReason(""); setMessage("") }} style={{ flex: 1, padding: "11px 0", background: "white", color: "#ef4444", border: "1.5px solid #ef4444", borderRadius: 8, cursor: "pointer", fontWeight: "bold", fontSize: isMobile ? 14 : 13, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                        <Icon icon="mdi:alert-circle" width={16} /> Dispute
                      </button>
                    </>
                  )}
                  {activeFilter === "returned" && (
                    <button onClick={() => openConfirmModal(stop)} style={{ flex: 1, padding: "11px 0", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold", fontSize: isMobile ? 14 : 13, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                      <Icon icon="mdi:pencil" width={14} /> Edit
                    </button>
                  )}
                  {activeFilter === "confirmed" && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", background: "#ecfdf5", borderRadius: 7 }}><Icon icon="mdi:check-circle" width={16} color="#10b981" /><span style={{ fontSize: 13, color: "#10b981", fontWeight: 600 }}>Confirmed</span></div>}
                  {activeFilter === "disputed" && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", background: "#fef2f2", borderRadius: 7 }}><Icon icon="mdi:alert-circle" width={16} color="#ef4444" /><span style={{ fontSize: 13, color: "#ef4444", fontWeight: 600 }}>Disputed</span></div>}
                </div>
              </div>
            )}
          </div>
          )
        })
      ) : (
          <div style={{ background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                  <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Plate</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Customer</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "right" }}>Bags</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Location</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Date</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Status</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((stop, idx) => (
                  <tr key={stop.stop_id} style={{ borderBottom: idx === visibleStops.length - 1 ? "none" : "1px solid #e2e8f0", transition: "background 0.2s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: 14, fontWeight: 500 }}>{stop.plate_number}</td>
                    <td style={{ padding: "12px 16px", color: "#475569", fontSize: 13 }}>{stop.customer_name}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", color: "#0f172a", fontSize: 14, fontWeight: 600 }}>{stop.quantity_offloaded}</td>
                    <td style={{ padding: "12px 16px", color: "#64748b", fontSize: 13 }}>{stop.stop_location}</td>
                    <td style={{ padding: "12px 16px", color: "#64748b", fontSize: 13 }}>{new Date(stop.stop_time).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}</td>
                    <td style={{ padding: "12px 16px" }}>
                      {stop.discount_status === "returned" ? (
                        <span style={{ padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 500, background: "#f5f3ff", color: "#7c3aed", border: "1px solid #c4b5fd", display: "inline-block" }}>Returned</span>
                      ) : (stop.discount_status === "pending" || stop.credit_approval_status === "Pending") ? (
                        <span style={{ padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 500, background: "#fffbeb", color: "#f5a623", border: "1px solid #fcd34d", display: "inline-block" }}>In Review</span>
                      ) : stop.confirmed ? (
                        <span style={{ padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 500, background: "#d1fae5", color: "#065f46", border: "1px solid #a7f3d0", display: "inline-block" }}>Confirmed</span>
                      ) : stop.disputed ? (
                        <span style={{ padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 500, background: "#fee2e2", color: "#7f1d1d", border: "1px solid #fecaca", display: "inline-block" }}>Disputed</span>
                      ) : (
                        <span style={{ padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 500, background: "#f0f7ff", color: "#0c4a6e", border: "1px solid #bfdbfe", display: "inline-block" }}>Pending</span>
                      )}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      {activeFilter === "pending" ? (
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <button onClick={() => openConfirmModal(stop)} style={{ padding: "6px 10px", cursor: "pointer", borderRadius: 6, border: "1px solid #0070f3", color: "#0070f3", background: "#f0f7ff", fontSize: 12, fontWeight: 600, transition: "all 0.2s", minHeight: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                            onMouseEnter={e => { e.currentTarget.style.background = "#e0efff" }} onMouseLeave={e => { e.currentTarget.style.background = "#f0f7ff" }}>
                            <Icon icon="mdi:check-circle" width={14} /> Confirm
                          </button>
                          <button onClick={() => { setDisputingStop(stop); setDisputeReason(""); setMessage("") }} style={{ padding: "6px 10px", cursor: "pointer", borderRadius: 6, border: "1px solid #fecaca", color: "#ef4444", background: "#fef2f2", fontSize: 12, fontWeight: 600, transition: "all 0.2s", minHeight: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                            onMouseEnter={e => { e.currentTarget.style.background = "#fee2e2" }} onMouseLeave={e => { e.currentTarget.style.background = "#fef2f2" }}>
                            <Icon icon="mdi:alert-circle" width={14} /> Dispute
                          </button>
                        </div>
                      ) : activeFilter === "returned" ? (
                        <button onClick={() => openConfirmModal(stop)} style={{ padding: "6px 10px", cursor: "pointer", borderRadius: 6, border: "1px solid #0070f3", color: "#0070f3", background: "#f0f7ff", fontSize: 12, fontWeight: 600, transition: "all 0.2s", minHeight: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                          onMouseEnter={e => { e.currentTarget.style.background = "#e0efff" }} onMouseLeave={e => { e.currentTarget.style.background = "#f0f7ff" }}>
                          <Icon icon="mdi:pencil" width={14} /> Edit Price
                        </button>
                      ) : (
                        <span style={{ fontSize: 12, color: "#94a3b8" }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      )}

      {visibleStops.length > 0 && (
        <PaginationControls page={page} totalPages={totalPages} totalItems={totalItems} onPageChange={setPage} />
      )}

      <BrokerConfirmModal
        key={confirmModalKey}
        isOpen={!!selectedStop}
        onClose={closeModal}
        brokerId={brokerId || ""}
        isMobile={isMobile}
        companyPriceMap={companyPriceMap}
        onConfirmed={() => { if (brokerId) fetchStops(brokerId) }}
        mode="stop"
        stop={selectedStop!}
      />

      {disputingStop && (
        <div onClick={() => setDisputingStop(null)} style={modalOverlay}>
          <div onClick={e => e.stopPropagation()} style={modalBox}>
            {isMobile && <div style={{ width: 40, height: 4, background: "#e0e0e0", borderRadius: 2, margin: "0 auto 20px" }} />}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: "#fff0f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon icon="mdi:alert-circle" width={20} color="#ff4444" />
              </div>
              <h3 style={{ margin: 0, color: "#ff4444", fontSize: isMobile ? 18 : 16 }}>Dispute Stop</h3>
            </div>
            <p style={{ color: "#888", fontSize: 13, marginBottom: 20 }}>{disputingStop.plate_number} · {disputingStop.stop_location}</p>

            <div style={{ marginBottom: 24 }}>
              <label style={labelStyle}>Reason for Dispute *</label>
              <ModernInput as="textarea" placeholder="e.g. This stop does not belong to me…" value={disputeReason} onChange={e => { setDisputeReason(e.target.value); setMessage("") }} rows={4} style={{ ...inputStyle, resize: "none", minHeight: 110 }} />
            </div>

            {message && <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#ff4444", marginBottom: 14, fontSize: 13 }}><Icon icon="mdi:alert-circle" width={15} />{message}</div>}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setDisputingStop(null)} style={{ flex: 1, padding: "13px 0", background: "white", border: "1.5px solid #e5e5e5", borderRadius: 10, cursor: "pointer", fontSize: 15, minHeight: 50, fontWeight: "bold" }}>Cancel</button>
              <button onClick={handleDispute} disabled={submitting} style={{ flex: 1, padding: "13px 0", background: submitting ? "#ccc" : "#ff4444", color: "white", border: "none", borderRadius: 10, cursor: submitting ? "not-allowed" : "pointer", fontSize: 15, minHeight: 50, fontWeight: "bold", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {submitting ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} />Submitting…</> : <><Icon icon="mdi:alert-circle" width={16} />Submit Dispute</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
