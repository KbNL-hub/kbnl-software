"use client"

import { FONT_SIZE } from "@/lib/constants"
import { usePolling } from "@/lib/hooks/usePolling"
import { usePermissions } from "@/lib/PermissionContext"
import { useState, useEffect, useCallback } from "react"
import { Icon } from "@iconify/react"
import { supabase } from "@/lib/supabase"
import { apiMutate } from "@/lib/api-mutation"

type PriceAdjustment = {
  id: string
  source_type: "stop" | "store_sale"
  source_id: string
  broker_id: string
  broker_name: string | null
  area: string
  product: string
  company_price: number
  adjusted_price: number
  quantity: number | null
  price_reason: string
  status: "Pending" | "Approved" | "Denied"
  denial_reason: string | null
  group_id: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
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
  } else if (filter === "Denied") {
    return { bg: "#fef2f2", textColor: "#ef4444", borderColor: "#ef4444" }
  }

  return { bg: "white", textColor: "#64748b", borderColor: "#e2e8f0" }
}

const filterOptions = ["All", "Pending", "Approved", "Denied"] as const

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })
}

export default function Discounts() {
  const [isMobile, setIsMobile] = useState(true)
  const [isDesktop, setIsDesktop] = useState(false)
  const { getAccess } = usePermissions()
  const canEdit = getAccess("discounts").canEdit

  const [adjustments, setAdjustments] = useState<PriceAdjustment[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState("All")
  const [viewMode, setViewMode] = useState<ViewMode>("card")
  const [dateDropOpen, setDateDropOpen] = useState(false)
  const [dateMode, setDateMode] = useState<"single" | "range">("single")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const hasActiveDateFilter = !!(dateFrom || dateTo)

  const [brokersList, setBrokersList] = useState<{ broker_id: string; broker_name: string }[]>([])
  const [filterBroker, setFilterBroker] = useState("")
  const [brokerSearch, setBrokerSearch] = useState("")
  const [brokerDropOpen, setBrokerDropOpen] = useState(false)

  const [denialModal, setDenialModal] = useState<PriceAdjustment | null>(null)
  const [denialModalGroup, setDenialModalGroup] = useState<PriceAdjustment[] | null>(null)
  const [denialReason, setDenialReason] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640)
      setIsDesktop(window.innerWidth >= 640)
    }
    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  useEffect(() => {
    supabase.from("Brokers").select("broker_id, broker_name").order("broker_name", { ascending: true }).then(({ data }) => {
      if (data) setBrokersList(data)
    })
  }, [])

  const fetchAdjustments = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("price_adjustments")
        .select("*")
        .order("created_at", { ascending: false })

      if (error) { console.error("Failed to fetch price adjustments:", error); return }

      const brokerIds = [...new Set((data || []).map(a => a.broker_id).filter(Boolean))]
      const brokerMap: Record<string, string> = {}
      if (brokerIds.length > 0) {
        const { data: brokers } = await supabase
          .from("Brokers")
          .select("broker_id, broker_name")
          .in("broker_id", brokerIds)
        for (const b of brokers || []) brokerMap[b.broker_id] = b.broker_name
      }

      const stopSourceIds = (data || []).filter(a => a.source_type === "stop").map(a => a.source_id)
      const saleSourceIds = (data || []).filter(a => a.source_type === "store_sale").map(a => a.source_id)

      const quantityMap: Record<string, number> = {}

      if (stopSourceIds.length > 0) {
        const { data: stops } = await supabase
          .from("Stops")
          .select("stop_id, quantity_offloaded")
          .in("stop_id", stopSourceIds)
        for (const s of stops || []) quantityMap[`stop:${s.stop_id}`] = s.quantity_offloaded
      }

      if (saleSourceIds.length > 0) {
        const { data: sales } = await supabase
          .from("store_sales")
          .select("sale_id, quantity")
          .in("sale_id", saleSourceIds)
        for (const s of sales || []) quantityMap[`store_sale:${s.sale_id}`] = s.quantity
      }

      const enriched = (data || []).map(a => ({
        ...a,
        broker_name: brokerMap[a.broker_id] || "Unknown",
        quantity: quantityMap[`${a.source_type}:${a.source_id}`] ?? null,
      }))

      setAdjustments(enriched)
    } catch (err) {
      console.error("Error fetching adjustments:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAdjustments() }, [fetchAdjustments])
  usePolling(fetchAdjustments, 30000)

  const filtered = adjustments.filter(a => {
    if (filterStatus !== "All" && a.status !== filterStatus) return false
    if (filterBroker && a.broker_id !== filterBroker) return false
    const aDate = new Date(a.created_at).toISOString().slice(0, 10)
    if (dateMode === "single" && dateFrom && aDate !== dateFrom) return false
    if (dateMode === "range") {
      if (dateFrom && aDate < dateFrom) return false
      if (dateTo && aDate > dateTo) return false
    }
    return true
  })

  type GroupedDisplay = {
    key: string
    type: "stop"
    item: PriceAdjustment
  } | {
    key: string
    type: "group"
    items: PriceAdjustment[]
    group_id: string
    broker_name: string | null
    broker_id: string
    area: string
    price_reason: string
    status: PriceAdjustment["status"]
    created_at: string
  }

  const groupedDisplay: GroupedDisplay[] = (() => {
    const stops: GroupedDisplay[] = []
    const saleGroups = new Map<string, PriceAdjustment[]>()

    for (const adj of filtered) {
      if (adj.source_type === "stop") {
        stops.push({ key: adj.id, type: "stop", item: adj })
      } else {
        const gid = adj.group_id || adj.source_id
        if (!saleGroups.has(gid)) saleGroups.set(gid, [])
        saleGroups.get(gid)!.push(adj)
      }
    }

    const groups: GroupedDisplay[] = []
    for (const [gid, items] of saleGroups) {
      const rep = items[0]
      groups.push({
        key: `group:${gid}`,
        type: "group",
        items,
        group_id: gid,
        broker_name: rep.broker_name,
        broker_id: rep.broker_id,
        area: rep.area,
        price_reason: rep.price_reason,
        status: rep.status,
        created_at: rep.created_at,
      })
    }

    return [...stops, ...groups]
  })()

  const pendingCount = adjustments.filter(a => a.status === "Pending").length
  const approvedCount = adjustments.filter(a => a.status === "Approved").length
  const deniedCount = adjustments.filter(a => a.status === "Denied").length

  async function handleApprove(adj: PriceAdjustment) {
    if (!canEdit) return
    setSubmitting(true)
    setMessage("")
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { error: adjError } = await apiMutate("finance", {
        action: "update",
        table: "price_adjustments",
        data: { status: "Approved", reviewed_by: user.id, reviewed_at: new Date().toISOString() },
        filters: { id: adj.id },
      })
      if (adjError) { setMessage("Failed to approve. Try again."); return }

      if (adj.source_type === "store_sale") {
        const { error: saleError } = await apiMutate("finance", {
          action: "update",
          table: "store_sales",
          data: { status: "Confirmed", discount_status: "none" },
          filters: { sale_id: adj.source_id },
        })
        if (saleError) { setMessage("Approved but failed to confirm sale. Try again."); return }
      } else {
        const { error: stopError } = await apiMutate("trips", {
          action: "update",
          table: "Stops",
          data: { confirmed: true, discount_status: "none" },
          filters: { stop_id: adj.source_id },
        })
        if (stopError) { setMessage("Approved but failed to confirm stop. Try again."); return }
      }

      fetchAdjustments()
    } catch {
      setMessage("Failed to approve. Try again.")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeny() {
    if (!canEdit || !denialModal) return
    if (!denialReason.trim()) { setMessage("Provide a denial reason"); return }
    setSubmitting(true)
    setMessage("")
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { error: adjError } = await apiMutate("finance", {
        action: "update",
        table: "price_adjustments",
        data: {
          status: "Denied",
          denial_reason: denialReason.trim(),
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        },
        filters: { id: denialModal.id },
      })
      if (adjError) { setMessage("Failed to deny. Try again."); return }

      if (denialModal.source_type === "store_sale") {
        await apiMutate("finance", {
          action: "update",
          table: "store_sales",
          data: { discount_status: "returned" },
          filters: { sale_id: denialModal.source_id },
        })
      } else {
        await apiMutate("trips", {
          action: "update",
          table: "Stops",
          data: { discount_status: "returned" },
          filters: { stop_id: denialModal.source_id },
        })
      }

      setDenialModal(null)
      setDenialReason("")
      fetchAdjustments()
    } catch {
      setMessage("Failed to deny. Try again.")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleApproveGroup(items: PriceAdjustment[]) {
    if (!canEdit) return
    setSubmitting(true)
    setMessage("")
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      for (const adj of items) {
        const { error: adjError } = await apiMutate("finance", {
          action: "update",
          table: "price_adjustments",
          data: { status: "Approved", reviewed_by: user.id, reviewed_at: new Date().toISOString() },
          filters: { id: adj.id },
        })
        if (adjError) { setMessage("Failed to approve. Try again."); return }

        await apiMutate("finance", {
          action: "update",
          table: "store_sales",
          data: { discount_status: "approved" },
          filters: { sale_id: adj.source_id },
        })
      }
      fetchAdjustments()
    } catch {
      setMessage("Failed to approve. Try again.")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDenyGroup() {
    if (!canEdit || !denialModalGroup) return
    if (!denialReason.trim()) { setMessage("Provide a denial reason"); return }
    setSubmitting(true)
    setMessage("")
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      for (const adj of denialModalGroup) {
        const { error: adjError } = await apiMutate("finance", {
          action: "update",
          table: "price_adjustments",
          data: { status: "Denied", denial_reason: denialReason.trim(), reviewed_by: user.id, reviewed_at: new Date().toISOString() },
          filters: { id: adj.id },
        })
        if (adjError) { setMessage("Failed to deny. Try again."); return }

        await apiMutate("finance", {
          action: "update",
          table: "store_sales",
          data: { discount_status: "returned" },
          filters: { sale_id: adj.source_id },
        })
      }
      setDenialModalGroup(null)
      setDenialReason("")
      fetchAdjustments()
    } catch {
      setMessage("Failed to deny. Try again.")
    } finally {
      setSubmitting(false)
    }
  }

  const STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
    Pending: { bg: "#fffbeb", color: "#d97706", border: "#fcd34d" },
    Approved: { bg: "#ecfdf5", color: "#059669", border: "#6ee7b7" },
    Denied: { bg: "#fef2f2", color: "#dc2626", border: "#fca5a5" },
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: isMobile ? "16px" : "32px", fontFamily: "'Inter', sans-serif" }}>
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, color: "#0f172a", fontSize: isMobile ? FONT_SIZE["2xl"] : FONT_SIZE["3xl"], fontWeight: 700, letterSpacing: "-0.5px" }}>
            Discounts
          </h1>
          <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: FONT_SIZE.base }}>
            Review price adjustments from brokers.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, width: isMobile ? "100%" : "auto" }}>
          {adjustments.length > 0 && (
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
              {option === "Denied" && !isActive && deniedCount > 0 && (
                <span style={{ display: "inline-flex", marginLeft: 6, width: 8, height: 8, borderRadius: "50%", background: "#ef4444" }} />
              )}
              {option === "Denied" && isActive && deniedCount > 0 && (
                <span style={{ display: "inline-flex", marginLeft: 6, background: "#fef2f2", color: "#ef4444", borderRadius: 10, padding: "0 6px", fontSize: 11, fontWeight: 700, lineHeight: "18px", minWidth: 18, justifyContent: "center" }}>
                  {deniedCount}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: isMobile ? "1 1 100%" : "1 1 200px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "white", border: `1.5px solid ${filterBroker ? "#0070f3" : "#e2e8f0"}`, borderRadius: 8, padding: "8px 12px", minHeight: 40, boxSizing: "border-box" }}>
            <Icon icon="mdi:account-tie-outline" style={{ color: filterBroker ? "#0070f3" : "#888", flexShrink: 0 }} />
            <input type="text" placeholder="Search broker…" value={brokerSearch} onChange={e => { setBrokerSearch(e.target.value); setBrokerDropOpen(true) }} onFocus={() => setBrokerDropOpen(true)} onBlur={() => setTimeout(() => setBrokerDropOpen(false), 150)} style={{ border: "none", outline: "none", fontSize: FONT_SIZE.sm, width: "100%", color: "#333", background: "transparent" }} />
            {filterBroker && <button onClick={() => { setFilterBroker(""); setBrokerSearch("") }} style={{ border: "none", background: "none", cursor: "pointer", color: "#aaa", padding: 0, lineHeight: 1 }}>✕</button>}
          </div>
          {brokerDropOpen && (
            <ul style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "white", border: "1px solid #e2e8f0", borderRadius: 8, listStyle: "none", margin: 0, padding: 4, maxHeight: 200, overflowY: "auto", zIndex: 50, boxShadow: "0 4px 16px rgba(0,0,0,0.1)" }}>
              <li onMouseDown={() => { setFilterBroker(""); setBrokerSearch(""); setBrokerDropOpen(false) }} style={{ padding: "8px 12px", cursor: "pointer", fontSize: FONT_SIZE.sm, color: "#888", borderRadius: 6 }} onMouseEnter={e => (e.currentTarget.style.background = "#f5f5f5")} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                All brokers
              </li>
              {brokersList.filter(b => b.broker_name.toLowerCase().includes(brokerSearch.toLowerCase())).length === 0 ? (
                <li style={{ padding: "8px 12px", fontSize: FONT_SIZE.sm, color: "#bbb" }}>No brokers found</li>
              ) : (
                brokersList.filter(b => b.broker_name.toLowerCase().includes(brokerSearch.toLowerCase())).map(b => (
                  <li key={b.broker_id} onMouseDown={() => { setFilterBroker(b.broker_id); setBrokerSearch(b.broker_name); setBrokerDropOpen(false) }} style={{ padding: "8px 12px", cursor: "pointer", fontSize: FONT_SIZE.sm, color: "#333", borderRadius: 6, background: filterBroker === b.broker_id ? "#eff6ff" : "transparent", fontWeight: filterBroker === b.broker_id ? "bold" : "normal" }} onMouseEnter={e => { if (filterBroker !== b.broker_id) e.currentTarget.style.background = "#f5f5f5" }} onMouseLeave={e => { e.currentTarget.style.background = filterBroker === b.broker_id ? "#eff6ff" : "transparent" }}>
                    {b.broker_name}
                  </li>
                ))
              )}
            </ul>
          )}
        </div>

        <div style={{ position: "relative", flex: isMobile ? "1 1 100%" : "1 1 200px" }}>
          <div
            onClick={() => setDateDropOpen(o => !o)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "white",
              border: `1.5px solid ${hasActiveDateFilter ? "#0070f3" : "#e2e8f0"}`,
              borderRadius: 8,
              padding: "8px 12px",
              cursor: "pointer",
              userSelect: "none",
              minHeight: 40,
              boxSizing: "border-box",
            }}
          >
            <Icon icon="mdi:calendar-outline" style={{ color: hasActiveDateFilter ? "#0070f3" : "#888", flexShrink: 0 }} />
            <span style={{ fontSize: FONT_SIZE.sm, color: hasActiveDateFilter ? "#333" : "#aaa", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {hasActiveDateFilter ? (dateMode === "range" && dateTo ? `${dateFrom} → ${dateTo}` : dateFrom) : "Filter by date…"}
            </span>
            {hasActiveDateFilter ? (
              <button
                onClick={e => { e.stopPropagation(); setDateFrom(""); setDateTo(""); setDateMode("single"); setDateDropOpen(false) }}
                style={{ border: "none", background: "none", cursor: "pointer", color: "#aaa", padding: 0, lineHeight: 1, flexShrink: 0 }}
              >
                ✕
              </button>
            ) : (
              <Icon icon="mdi:chevron-down" style={{ color: "#aaa", fontSize: 16, transition: "transform 0.15s", transform: dateDropOpen ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }} />
            )}
          </div>

          {dateDropOpen && (
            <div style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              right: 0,
              background: "white",
              border: "1px solid #e2e8f0",
              borderRadius: 10,
              padding: 16,
              zIndex: 50,
              boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
              minWidth: isMobile ? "auto" : 260,
            }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                {(["single", "range"] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => { setDateMode(m); setDateFrom(""); setDateTo("") }}
                    style={{
                      flex: 1,
                      padding: "5px 0",
                      border: "none",
                      borderRadius: 6,
                      cursor: "pointer",
                      fontSize: FONT_SIZE.xs,
                      fontWeight: "bold",
                      background: dateMode === m ? "#0070f3" : "#f0f0f0",
                      color: dateMode === m ? "white" : "#666",
                      transition: "all 0.15s"
                    }}
                  >
                    {m === "single" ? "Single day" : "Date range"}
                  </button>
                ))}
              </div>

              {dateMode === "single" ? (
                <div>
                  <label style={{ display: "block", fontSize: FONT_SIZE.xs, color: "#888", marginBottom: 4 }}>Select date</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={e => { setDateFrom(e.target.value); setDateDropOpen(false) }}
                    style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: FONT_SIZE.sm, color: "#333", boxSizing: "border-box" }}
                    autoFocus
                  />
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div>
                    <label style={{ display: "block", fontSize: FONT_SIZE.xs, color: "#888", marginBottom: 4 }}>From</label>
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: FONT_SIZE.sm, color: "#333", boxSizing: "border-box" }} autoFocus />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: FONT_SIZE.xs, color: "#888", marginBottom: 4 }}>To</label>
                    <input type="date" value={dateTo} min={dateFrom || undefined} onChange={e => setDateTo(e.target.value)} style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: FONT_SIZE.sm, color: "#333", boxSizing: "border-box" }} />
                  </div>
                  {dateFrom && dateTo && (
                    <button onClick={() => setDateDropOpen(false)} style={{ padding: "8px 0", background: "#0070f3", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontSize: FONT_SIZE.sm, fontWeight: "bold" }}>
                      Apply Range
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {(hasActiveDateFilter || filterBroker) && (
          <button
            onClick={() => { setDateFrom(""); setDateTo(""); setDateMode("single"); setFilterBroker(""); setBrokerSearch("") }}
            style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "white", color: "#64748b", fontSize: FONT_SIZE.sm, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", minHeight: 40, transition: "all 0.2s" }}
            onMouseEnter={e => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1" }}
            onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#e2e8f0" }}
          >
            <Icon icon="mdi:filter-remove-outline" style={{ fontSize: 16 }} />
            Clear filters
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "64px 0" }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid #e2e8f0", borderTopColor: "#0070f3", animation: "spin 1s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : groupedDisplay.length === 0 ? (
        <div style={{ textAlign: "center", padding: "64px 24px", background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)" }}>
          <div style={{ width: 64, height: 64, background: "#f1f5f9", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
          </div>
          <h3 style={{ margin: "0 0 8px", color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 600 }}>No price adjustments found</h3>
          <p style={{ color: "#64748b", fontSize: FONT_SIZE.base, margin: 0 }}>
            {hasActiveDateFilter ? "No adjustments match your date filter." : filterStatus === "All" ? "No price adjustments in the system." : `No adjustments with status "${filterStatus}".`}
          </p>
        </div>
      ) : (
        <>
          {/* Card View */}
          {viewMode === "card" && (
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(380px, 1fr))", gap: 16 }}>
              {groupedDisplay.map(entry => {
                if (entry.type === "stop") {
                  const adj = entry.item
                  const sc = STATUS_COLORS[adj.status]
                  const discount = adj.company_price - adj.adjusted_price
                  const isPremium = adj.adjusted_price > adj.company_price
                  return (
                    <div key={adj.id} style={{ background: "white", borderRadius: 12, padding: 20, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", transition: "all 0.2s ease" }} onMouseEnter={e => !isMobile && (e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.08)", e.currentTarget.style.borderColor = "#cbd5e1")} onMouseLeave={e => !isMobile && (e.currentTarget.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.05)", e.currentTarget.style.borderColor = "#e2e8f0")}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <h3 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.lg, fontWeight: 700 }}>{adj.broker_name}</h3>
                            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 12, background: "#e0f2fe", color: "#0369a1", fontWeight: 700, border: "1px solid #7dd3fc" }}>Stop</span>
                          </div>
                          <p style={{ margin: 0, color: "#64748b", fontSize: FONT_SIZE.sm }}>{adj.product} · {adj.area}</p>
                        </div>
                        <span style={{ padding: "6px 12px", borderRadius: 16, fontSize: FONT_SIZE.xs, fontWeight: 600, background: sc.bg, color: sc.color, border: `1.5px solid ${sc.border}`, whiteSpace: "nowrap" }}>{adj.status}</span>
                      </div>

                      <div style={{ padding: "8px 12px", borderRadius: 8, background: "#f8fafc", border: "1px solid #e2e8f0", marginBottom: 12 }}>
                        <span style={{ fontSize: FONT_SIZE.xs, color: "#94a3b8", fontWeight: 500 }}>Price comparison</span>
                        <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                          <div>
                            <p style={{ margin: 0, fontSize: 11, color: "#94a3b8" }}>Company</p>
                            <p style={{ margin: "2px 0 0", fontWeight: 600, fontSize: FONT_SIZE.sm, color: "#0f172a" }}>₦{adj.company_price.toLocaleString()}</p>
                          </div>
                          <div>
                            <p style={{ margin: 0, fontSize: 11, color: "#94a3b8" }}>Adjusted</p>
                            <p style={{ margin: "2px 0 0", fontWeight: 600, fontSize: FONT_SIZE.sm, color: "#0f172a" }}>₦{adj.adjusted_price.toLocaleString()}</p>
                          </div>
                          <div>
                            <p style={{ margin: 0, fontSize: 11, color: isPremium ? "#059669" : "#854d0e" }}>{isPremium ? "Premium" : "Discount"}</p>
                            <p style={{ margin: "2px 0 0", fontWeight: 700, fontSize: FONT_SIZE.sm, color: isPremium ? "#059669" : "#854d0e" }}>₦{Math.abs(discount).toLocaleString()}</p>
                          </div>
                          {adj.quantity != null && (
                            <div>
                              <p style={{ margin: 0, fontSize: 11, color: "#94a3b8" }}>Bags</p>
                              <p style={{ margin: "2px 0 0", fontWeight: 600, fontSize: FONT_SIZE.sm, color: "#0f172a" }}>{adj.quantity}</p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #f1f5f9" }}>
                        <div style={{ padding: "8px 10px", background: "#f8fafc", borderRadius: 8, borderLeft: "3px solid #0070f3" }}>
                          <p style={{ margin: 0, fontSize: 11, color: "#94a3b8" }}>Reason</p>
                          <p style={{ margin: "2px 0 0", fontSize: FONT_SIZE.sm, color: "#374151", fontStyle: "italic" }}>&ldquo;{adj.price_reason}&rdquo;</p>
                        </div>
                      </div>

                      {adj.status === "Denied" && adj.denial_reason && (
                        <div style={{ padding: "8px 10px", background: "#fef2f2", borderRadius: 8, marginBottom: 12, borderLeft: "3px solid #ef4444" }}>
                          <p style={{ margin: 0, fontSize: 11, color: "#ef4444", fontWeight: 600 }}>Denial reason</p>
                          <p style={{ margin: "2px 0 0", fontSize: FONT_SIZE.sm, color: "#7f1d1d" }}>{adj.denial_reason}</p>
                        </div>
                      )}

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ color: "#94a3b8", fontSize: FONT_SIZE.xs }}>
                          {formatDate(adj.created_at)} · {formatTime(adj.created_at)}
                        </span>
                        {adj.status === "Pending" && canEdit && (
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => handleApprove(adj)} disabled={submitting} style={{ padding: "6px 14px", background: "#10b981", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontSize: FONT_SIZE.xs, fontWeight: 600, display: "flex", alignItems: "center", gap: 4, opacity: submitting ? 0.6 : 1 }}>
                              <Icon icon="mdi:check-circle" width={14} /> Approve
                            </button>
                            <button onClick={() => { setDenialModal(adj); setDenialReason(""); setMessage("") }} disabled={submitting} style={{ padding: "6px 14px", background: "white", color: "#ef4444", border: "1.5px solid #ef4444", borderRadius: 6, cursor: "pointer", fontSize: FONT_SIZE.xs, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                              <Icon icon="mdi:close-circle" width={14} /> Deny
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                }

                // Store Sale group
                const { items, group_id: gid } = entry
                const sc = STATUS_COLORS[entry.status]
                const totalCompany = items.reduce((s, i) => s + i.company_price * (i.quantity || 1), 0)
                const totalAdjusted = items.reduce((s, i) => s + i.adjusted_price * (i.quantity || 1), 0)
                const totalDiscount = totalCompany - totalAdjusted
                const totalBags = items.reduce((s, i) => s + (i.quantity || 0), 0)
                const productNames = items.map(i => i.product).filter(Boolean)
                return (
                  <div key={entry.key} style={{ background: "white", borderRadius: 12, padding: 20, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", transition: "all 0.2s ease" }} onMouseEnter={e => !isMobile && (e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.08)", e.currentTarget.style.borderColor = "#cbd5e1")} onMouseLeave={e => !isMobile && (e.currentTarget.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.05)", e.currentTarget.style.borderColor = "#e2e8f0")}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <h3 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.lg, fontWeight: 700 }}>{entry.broker_name}</h3>
                          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 12, background: "#f3e5f5", color: "#7c3aed", fontWeight: 700, border: "1px solid #d8b4fe" }}>Store Sale</span>
                        </div>
                        <p style={{ margin: 0, color: "#64748b", fontSize: FONT_SIZE.sm }}>{productNames.join(", ")} · {entry.area}</p>
                      </div>
                      <span style={{ padding: "6px 12px", borderRadius: 16, fontSize: FONT_SIZE.xs, fontWeight: 600, background: sc.bg, color: sc.color, border: `1.5px solid ${sc.border}`, whiteSpace: "nowrap" }}>{entry.status}</span>
                    </div>

                    <div style={{ padding: "8px 12px", borderRadius: 8, background: "#f8fafc", border: "1px solid #e2e8f0", marginBottom: 12 }}>
                      <span style={{ fontSize: FONT_SIZE.xs, color: "#94a3b8", fontWeight: 500 }}>Price comparison</span>
                      {items.map((item, idx) => {
                        const itemDiscount = item.company_price - item.adjusted_price
                        const itemPremium = item.adjusted_price > item.company_price
                        return (
                          <div key={idx} style={{ padding: "6px 0", borderTop: idx > 0 ? "1px solid #f1f5f9" : undefined }}>
                            <p style={{ margin: 0, fontSize: FONT_SIZE.xs, fontWeight: 600, color: "#374151" }}>{item.product}{item.quantity != null ? ` · ${item.quantity} bags` : ""}</p>
                            <div style={{ display: "flex", gap: 12, marginTop: 2 }}>
                              <span style={{ fontSize: 11, color: "#64748b" }}>Company: <b>₦{item.company_price.toLocaleString()}</b></span>
                              <span style={{ fontSize: 11, color: "#64748b" }}>Adjusted: <b>₦{item.adjusted_price.toLocaleString()}</b></span>
                              <span style={{ fontSize: 11, fontWeight: 700, color: itemPremium ? "#059669" : "#854d0e" }}>{itemPremium ? "Premium" : "Discount"}: ₦{Math.abs(itemDiscount).toLocaleString()}</span>
                            </div>
                          </div>
                        )
                      })}
                      <div style={{ display: "flex", gap: 12, marginTop: 6, paddingTop: 6, borderTop: "1px solid #e2e8f0" }}>
                        {totalBags > 0 && <span style={{ fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Total bags: <b style={{ color: "#0f172a" }}>{totalBags}</b></span>}
                        <span style={{ fontSize: FONT_SIZE.xs, fontWeight: 700, color: totalDiscount > 0 ? "#854d0e" : "#059669" }}>Total {totalDiscount > 0 ? "discount" : "premium"}: ₦{Math.abs(totalDiscount).toLocaleString()}</span>
                      </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #f1f5f9" }}>
                      <div style={{ padding: "8px 10px", background: "#f8fafc", borderRadius: 8, borderLeft: "3px solid #0070f3" }}>
                        <p style={{ margin: 0, fontSize: 11, color: "#94a3b8" }}>Reason</p>
                        <p style={{ margin: "2px 0 0", fontSize: FONT_SIZE.sm, color: "#374151", fontStyle: "italic" }}>&ldquo;{entry.price_reason}&rdquo;</p>
                      </div>
                    </div>

                    {entry.status === "Denied" && items[0]?.denial_reason && (
                      <div style={{ padding: "8px 10px", background: "#fef2f2", borderRadius: 8, marginBottom: 12, borderLeft: "3px solid #ef4444" }}>
                        <p style={{ margin: 0, fontSize: 11, color: "#ef4444", fontWeight: 600 }}>Denial reason</p>
                        <p style={{ margin: "2px 0 0", fontSize: FONT_SIZE.sm, color: "#7f1d1d" }}>{items[0].denial_reason}</p>
                      </div>
                    )}

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ color: "#94a3b8", fontSize: FONT_SIZE.xs }}>
                        {formatDate(entry.created_at)} · {formatTime(entry.created_at)}
                      </span>
                      {entry.status === "Pending" && canEdit && (
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => handleApproveGroup(items)} disabled={submitting} style={{ padding: "6px 14px", background: "#10b981", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontSize: FONT_SIZE.xs, fontWeight: 600, display: "flex", alignItems: "center", gap: 4, opacity: submitting ? 0.6 : 1 }}>
                            <Icon icon="mdi:check-circle" width={14} /> Approve all
                          </button>
                          <button onClick={() => { setDenialModalGroup(items); setDenialReason(""); setMessage("") }} disabled={submitting} style={{ padding: "6px 14px", background: "white", color: "#ef4444", border: "1.5px solid #ef4444", borderRadius: 6, cursor: "pointer", fontSize: FONT_SIZE.xs, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                            <Icon icon="mdi:close-circle" width={14} /> Deny all
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Table View */}
          {viewMode === "table" && (
            <div style={{ background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", minWidth: 900 }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    {["Broker", "Product", "Area", "Bags", "Company", "Adjusted", "Diff", "Reason", "Status", "Date", "Actions"].map(h => (
                      <th key={h} style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groupedDisplay.map(entry => {
                    if (entry.type === "stop") {
                      const adj = entry.item
                      const sc = STATUS_COLORS[adj.status]
                      const discount = adj.company_price - adj.adjusted_price
                      return (
                        <tr key={adj.id} style={{ borderBottom: "1px solid #f1f5f9", transition: "background 0.2s ease" }} onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                          <td style={{ padding: "12px 16px", fontSize: FONT_SIZE.sm, fontWeight: 500 }}>
                            <div>{adj.broker_name}</div>
                            <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 8, background: "#e0f2fe", color: "#0369a1", fontWeight: 700, border: "1px solid #7dd3fc" }}>Stop</span>
                          </td>
                          <td style={{ padding: "12px 16px", fontSize: FONT_SIZE.sm }}>{adj.product}</td>
                          <td style={{ padding: "12px 16px", fontSize: FONT_SIZE.sm, color: "#64748b" }}>{adj.area}</td>
                          <td style={{ padding: "12px 16px", fontSize: FONT_SIZE.sm, fontWeight: 600 }}>{adj.quantity != null ? adj.quantity : "—"}</td>
                          <td style={{ padding: "12px 16px", fontSize: FONT_SIZE.sm }}>₦{adj.company_price.toLocaleString()}</td>
                          <td style={{ padding: "12px 16px", fontSize: FONT_SIZE.sm }}>₦{adj.adjusted_price.toLocaleString()}</td>
                          <td style={{ padding: "12px 16px", fontSize: FONT_SIZE.sm, color: discount > 0 ? "#854d0e" : "#059669", fontWeight: 600 }}>
                            {discount > 0 ? "-" : "+"}₦{Math.abs(discount).toLocaleString()}
                          </td>
                          <td style={{ padding: "12px 16px", fontSize: FONT_SIZE.xs, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={adj.price_reason}>{adj.price_reason}</td>
                          <td style={{ padding: "12px 16px" }}>
                            <span style={{ padding: "6px 10px", borderRadius: 14, fontSize: FONT_SIZE.xs, fontWeight: 600, background: sc.bg, color: sc.color, border: `1.5px solid ${sc.border}` }}>{adj.status}</span>
                          </td>
                          <td style={{ padding: "12px 16px", fontSize: FONT_SIZE.xs, color: "#94a3b8", whiteSpace: "nowrap" }}>{formatDate(adj.created_at)}</td>
                          <td style={{ padding: "12px 16px" }}>
                            {adj.status === "Pending" && canEdit && (
                              <div style={{ display: "flex", gap: 6 }}>
                                <button onClick={() => handleApprove(adj)} disabled={submitting} style={{ padding: "6px 10px", cursor: "pointer", borderRadius: 6, border: "1px solid #10b981", color: "#10b981", background: "#f0fdf4", fontSize: 12, fontWeight: 600, transition: "all 0.2s", minHeight: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                                  onMouseEnter={e => { e.currentTarget.style.background = "#dcfce7" }} onMouseLeave={e => { e.currentTarget.style.background = "#f0fdf4" }}>
                                  <Icon icon="mdi:check-circle" width={14} /> Approve
                                </button>
                                <button onClick={() => { setDenialModal(adj); setDenialReason(""); setMessage("") }} disabled={submitting} style={{ padding: "6px 10px", cursor: "pointer", borderRadius: 6, border: "1px solid #fecaca", color: "#ef4444", background: "#fef2f2", fontSize: 12, fontWeight: 600, transition: "all 0.2s", minHeight: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                                  onMouseEnter={e => { e.currentTarget.style.background = "#fee2e2" }} onMouseLeave={e => { e.currentTarget.style.background = "#fef2f2" }}>
                                  <Icon icon="mdi:close-circle" width={14} /> Deny
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    }

                    // Store Sale group — one header row + sub-rows per product
                    const { items } = entry
                    const sc = STATUS_COLORS[entry.status]
                    return items.map((item, idx) => {
                      const discount = item.company_price - item.adjusted_price
                      const isFirst = idx === 0
                      return (
                        <tr key={item.id} style={{ borderBottom: "1px solid #f1f5f9", background: "#faf8ff", transition: "background 0.2s ease" }} onMouseEnter={e => e.currentTarget.style.background = "#f3f0ff"} onMouseLeave={e => e.currentTarget.style.background = "#faf8ff"}>
                          {isFirst ? (
                            <>
                              <td rowSpan={items.length} style={{ padding: "12px 16px", fontSize: FONT_SIZE.sm, fontWeight: 500, verticalAlign: "top", borderBottom: idx === items.length - 1 ? "1px solid #f1f5f9" : undefined }}>
                                <div>{entry.broker_name}</div>
                                <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 8, background: "#f3e5f5", color: "#7c3aed", fontWeight: 700, border: "1px solid #d8b4fe" }}>Store Sale</span>
                              </td>
                              <td rowSpan={items.length} style={{ padding: "12px 16px", fontSize: FONT_SIZE.sm, verticalAlign: "top", borderBottom: idx === items.length - 1 ? "1px solid #f1f5f9" : undefined }}>
                                {items.map((it, i) => (
                                  <div key={i} style={{ marginBottom: i < items.length - 1 ? 4 : 0 }}>{it.product}</div>
                                ))}
                              </td>
                              <td rowSpan={items.length} style={{ padding: "12px 16px", fontSize: FONT_SIZE.sm, color: "#64748b", verticalAlign: "top", borderBottom: idx === items.length - 1 ? "1px solid #f1f5f9" : undefined }}>{entry.area}</td>
                            </>
                          ) : null}
                          <td style={{ padding: "12px 16px", fontSize: FONT_SIZE.sm, fontWeight: 600 }}>{item.quantity != null ? item.quantity : "—"}</td>
                          <td style={{ padding: "12px 16px", fontSize: FONT_SIZE.sm }}>₦{item.company_price.toLocaleString()}</td>
                          <td style={{ padding: "12px 16px", fontSize: FONT_SIZE.sm }}>₦{item.adjusted_price.toLocaleString()}</td>
                          <td style={{ padding: "12px 16px", fontSize: FONT_SIZE.sm, color: discount > 0 ? "#854d0e" : "#059669", fontWeight: 600 }}>
                            {discount > 0 ? "-" : "+"}₦{Math.abs(discount).toLocaleString()}
                          </td>
                          <td style={{ padding: "12px 16px", fontSize: FONT_SIZE.xs, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.price_reason}>{item.price_reason}</td>
                          {isFirst ? (
                            <>
                              <td rowSpan={items.length} style={{ padding: "12px 16px", verticalAlign: "top", borderBottom: "1px solid #f1f5f9" }}>
                                <span style={{ padding: "6px 10px", borderRadius: 14, fontSize: FONT_SIZE.xs, fontWeight: 600, background: sc.bg, color: sc.color, border: `1.5px solid ${sc.border}` }}>{entry.status}</span>
                              </td>
                              <td rowSpan={items.length} style={{ padding: "12px 16px", fontSize: FONT_SIZE.xs, color: "#94a3b8", whiteSpace: "nowrap", verticalAlign: "top", borderBottom: "1px solid #f1f5f9" }}>{formatDate(entry.created_at)}</td>
                              <td rowSpan={items.length} style={{ padding: "12px 16px", verticalAlign: "top", borderBottom: "1px solid #f1f5f9" }}>
                                {entry.status === "Pending" && canEdit && (
                                  <div style={{ display: "flex", gap: 6 }}>
                                    <button onClick={() => handleApproveGroup(items)} disabled={submitting} style={{ padding: "6px 10px", cursor: "pointer", borderRadius: 6, border: "1px solid #10b981", color: "#10b981", background: "#f0fdf4", fontSize: 12, fontWeight: 600, transition: "all 0.2s", minHeight: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                                      onMouseEnter={e => { e.currentTarget.style.background = "#dcfce7" }} onMouseLeave={e => { e.currentTarget.style.background = "#f0fdf4" }}>
                                      <Icon icon="mdi:check-circle" width={14} /> Approve all
                                    </button>
                                    <button onClick={() => { setDenialModalGroup(items); setDenialReason(""); setMessage("") }} disabled={submitting} style={{ padding: "6px 10px", cursor: "pointer", borderRadius: 6, border: "1px solid #fecaca", color: "#ef4444", background: "#fef2f2", fontSize: 12, fontWeight: 600, transition: "all 0.2s", minHeight: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                                      onMouseEnter={e => { e.currentTarget.style.background = "#fee2e2" }} onMouseLeave={e => { e.currentTarget.style.background = "#fef2f2" }}>
                                      <Icon icon="mdi:close-circle" width={14} /> Deny all
                                    </button>
                                  </div>
                                )}
                              </td>
                            </>
                          ) : null}
                        </tr>
                      )
                    })
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Denial Modal */}
      {denialModal && (
        <div onClick={() => { setDenialModal(null); setMessage("") }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: isMobile ? "20px 20px 0 0" : 14, padding: isMobile ? "24px 20px 40px" : 32, width: isMobile ? "100%" : 440, maxHeight: "88vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
            {isMobile && <div style={{ width: 40, height: 4, background: "#e0e0e0", borderRadius: 2, margin: "0 auto 20px" }} />}
            <h3 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Deny Price Adjustment</h3>
            <p style={{ margin: "0 0 16px", fontSize: FONT_SIZE.sm, color: "#64748b" }}>
              {denialModal.broker_name} · {denialModal.product} · {denialModal.area}
            </p>

            <label style={{ display: "block", fontWeight: 600, fontSize: 13, color: "#444", marginBottom: 6 }}>Reason for denial *</label>
            <textarea
              value={denialReason}
              onChange={e => { setDenialReason(e.target.value); setMessage("") }}
              placeholder="e.g. Price too far below company rate…"
              rows={3}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid #e5e5e5", fontSize: 14, resize: "none", minHeight: 80, boxSizing: "border-box" }}
            />

            {message && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#ef4444", marginTop: 8, fontSize: 13 }}>
                <Icon icon="mdi:alert-circle" width={15} />{message}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button onClick={() => { setDenialModal(null); setMessage("") }} style={{ flex: 1, padding: "12px 0", background: "white", border: "1.5px solid #e5e5e5", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 600 }}>Cancel</button>
              <button onClick={handleDeny} disabled={submitting} style={{ flex: 1, padding: "12px 0", background: submitting ? "#ccc" : "#ef4444", color: "white", border: "none", borderRadius: 10, cursor: submitting ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {submitting ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} /> Denying…</> : "Deny"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Group Denial Modal */}
      {denialModalGroup && (
        <div onClick={() => { setDenialModalGroup(null); setMessage("") }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: isMobile ? "20px 20px 0 0" : 14, padding: isMobile ? "24px 20px 40px" : 32, width: isMobile ? "100%" : 440, maxHeight: "88vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
            {isMobile && <div style={{ width: 40, height: 4, background: "#e0e0e0", borderRadius: 2, margin: "0 auto 20px" }} />}
            <h3 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Deny Store Sale</h3>
            <p style={{ margin: "0 0 16px", fontSize: FONT_SIZE.sm, color: "#64748b" }}>
              {denialModalGroup[0].broker_name} · {denialModalGroup.map(i => i.product).join(", ")} · {denialModalGroup[0].area}
            </p>

            <label style={{ display: "block", fontWeight: 600, fontSize: 13, color: "#444", marginBottom: 6 }}>Reason for denial *</label>
            <textarea
              value={denialReason}
              onChange={e => { setDenialReason(e.target.value); setMessage("") }}
              placeholder="e.g. Price too far below company rate…"
              rows={3}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid #e5e5e5", fontSize: 14, resize: "none", minHeight: 80, boxSizing: "border-box" }}
            />

            {message && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#ef4444", marginTop: 8, fontSize: 13 }}>
                <Icon icon="mdi:alert-circle" width={15} />{message}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button onClick={() => { setDenialModalGroup(null); setMessage("") }} style={{ flex: 1, padding: "12px 0", background: "white", border: "1.5px solid #e5e5e5", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 600 }}>Cancel</button>
              <button onClick={handleDenyGroup} disabled={submitting} style={{ flex: 1, padding: "12px 0", background: submitting ? "#ccc" : "#ef4444", color: "white", border: "none", borderRadius: 10, cursor: submitting ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {submitting ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} /> Denying…</> : "Deny all"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
