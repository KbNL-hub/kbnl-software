"use client"

import { FONT_SIZE } from "@/lib/constants"
import { usePolling } from "@/lib/hooks/usePolling"

import { useState, useEffect, useCallback, Fragment } from "react"
import { Icon } from "@iconify/react"
import { supabase } from "@/lib/supabase"
import { fetchStores } from "@/lib/stores"

type StoreSale = {
  sale_id: string
  store_name: string
  product: string
  quantity: number
  price_per_bag: number | null
  total_amount: number | null
  customer_name: string | null
  payment_mode: string
  delivery_mode: string
  tricycle_id: string | null
  truck_plate: string | null
  broker_id: string | null
  sold_at: string
  created_at: string
  status: string
  broker_name?: string | null
  bank_name: string | null
  depositor_name: string | null
  rejection_reason: string | null
}

type GroupedSale = {
  date: string
  sales: StoreSale[]
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



const getPillStyle = (filter: string, isActive: boolean) => {
  if (!isActive) {
    return { bg: "white", textColor: "#64748b", borderColor: "#e2e8f0" }
  }

  if (filter === "All") {
    return { bg: "#171717", textColor: "white", borderColor: "#171717" }
  } else if (filter === "Confirmed") {
    return { bg: "#ecfdf5", textColor: "#10b981", borderColor: "#10b981" }
  } else if (filter === "Pending") {
    return { bg: "#fffbeb", textColor: "#f5a623", borderColor: "#f5a623" }
  } else if (filter === "Rejected") {
    return { bg: "#fef2f2", textColor: "#ef4444", borderColor: "#ef4444" }
  }

  return { bg: "white", textColor: "#64748b", borderColor: "#e2e8f0" }
}

const filterOptions = ["All", "Confirmed", "Pending", "Rejected"]

export default function StoreSales() {
  const { isMobile } = useBreakpoint()
  const [sales, setSales] = useState<StoreSale[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState("All")
  const [viewMode, setViewMode] = useState<ViewMode>(isMobile ? "card" : "table")
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const [allProducts, setAllProducts] = useState<string[]>([])
  const [filterProduct, setFilterProduct] = useState("")
  const [filterStore, setFilterStore] = useState("")
  const [dateDropOpen, setDateDropOpen] = useState(false)
  const [dateMode, setDateMode] = useState<"single" | "range">("single")
  const [filterDateFrom, setFilterDateFrom] = useState("")
  const [filterDateTo, setFilterDateTo] = useState("")
  const [storeLocations, setStoreLocations] = useState<string[]>([])

  const hasActiveFilters = filterProduct || filterStore || filterDateFrom || filterDateTo

  useEffect(() => {
    supabase.rpc("get_products").then(({ data }) => {
      if (data) setAllProducts(data.map((r: { value: string }) => r.value))
    })
    fetchStores().then(setStoreLocations)
  }, [])

  async function fetchSales() {
    const { data, error } = await supabase
      .from("store_sales")
      .select("sale_id, store_name, product, quantity, price_per_bag, total_amount, customer_name, payment_mode, delivery_mode, tricycle_id, truck_plate, broker_id, sold_at, created_at, status, bank_name, depositor_name, rejection_reason")
      .order("sold_at", { ascending: false })

    if (error) throw error
    if (!data) return []

    const brokerIds = [...new Set(data.map(s => s.broker_id).filter(Boolean))]
    const brokerMap = new Map<string, string>()
    if (brokerIds.length > 0) {
      const { data: brokers } = await supabase
        .from("Brokers")
        .select("broker_id, broker_name")
        .in("broker_id", brokerIds)
      for (const b of brokers || []) brokerMap.set(b.broker_id, b.broker_name)
    }

    return data.map(s => ({
      ...s,
      broker_name: s.broker_id ? brokerMap.get(s.broker_id) ?? "Unknown" : null,
    }))
  }

  const loadAll = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const data = await fetchSales()
      setSales(data)
      setLastUpdated(new Date())
    } catch (err) {
      console.error("Error loading store sales:", err)
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

   
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll()
  }, [loadAll])

  usePolling(() => loadAll(false), 120000)

  const filteredSales = sales.filter(s => {
    if (filterStatus !== "All" && s.status !== filterStatus) return false
    if (filterProduct && s.product !== filterProduct) return false
    if (filterStore && s.store_name !== filterStore) return false
    const soldDate = s.sold_at.slice(0, 10)
    if (dateMode === "single") {
      if (filterDateFrom && soldDate !== filterDateFrom) return false
    } else {
      if (filterDateFrom && soldDate < filterDateFrom) return false
      if (filterDateTo && soldDate > filterDateTo) return false
    }
    return true
  })

  const groupedByDate = filteredSales.reduce<GroupedSale[]>((groups, sale) => {
    const dateKey = sale.sold_at.slice(0, 10)
    const existing = groups.find(g => g.date === dateKey)
    if (existing) { existing.sales.push(sale); return groups }
    groups.push({ date: dateKey, sales: [sale] })
    return groups
  }, [])

  function formatAmount(val: number | null | undefined): string {
    if (val == null) return "—"
    return `₦${val.toLocaleString()}`
  }

  function clearFilters() {
    setFilterProduct("")
    setFilterStore("")
    setFilterDateFrom("")
    setFilterDateTo("")
    setDateMode("single")
  }

  const dateLabel = filterDateFrom
    ? dateMode === "range" && filterDateTo
      ? `${filterDateFrom} → ${filterDateTo}`
      : filterDateFrom
    : "Filter by date…"

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: isMobile ? "16px" : "32px", fontFamily: "'Inter', sans-serif" }}>
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, color: "#0f172a", fontSize: isMobile ? FONT_SIZE["2xl"] : FONT_SIZE["3xl"], fontWeight: 700, letterSpacing: "-0.5px" }}>
            Store Sales
          </h1>
          <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: FONT_SIZE.base }}>
            View all sales recorded by store officers.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, width: isMobile ? "100%" : "auto" }}>
          {sales.length > 0 && (
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
          <button
            onClick={() => loadAll()}
            style={{
              padding: "8px 12px",
              background: "white",
              color: "#64748b",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: FONT_SIZE.xs,
              fontWeight: 500,
              minHeight: 40,
              minWidth: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s"
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1" }}
            onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#e2e8f0" }}
            title="Refresh"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36M20.49 15a9 9 0 0 1-14.85 3.36"/></svg>
          </button>
        </div>
      </div>

      {lastUpdated && (
        <p style={{ margin: "0 0 20px 0", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>
          Updated: {lastUpdated.toLocaleTimeString()}
        </p>
      )}

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
            </button>
          )
        })}
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <select
          value={filterProduct}
          onChange={e => setFilterProduct(e.target.value)}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: `1.5px solid ${filterProduct ? "#0070f3" : "#e2e8f0"}`,
            fontSize: FONT_SIZE.sm,
            color: filterProduct ? "#0f172a" : "#94a3b8",
            background: "white",
            minHeight: 40,
            outline: "none",
            cursor: "pointer",
            flex: isMobile ? "1 1 100%" : "1 1 160px",
          }}
        >
          <option value="">All Products</option>
          {allProducts.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        <select
          value={filterStore}
          onChange={e => setFilterStore(e.target.value)}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: `1.5px solid ${filterStore ? "#0070f3" : "#e2e8f0"}`,
            fontSize: FONT_SIZE.sm,
            color: filterStore ? "#0f172a" : "#94a3b8",
            background: "white",
            minHeight: 40,
            outline: "none",
            cursor: "pointer",
            flex: isMobile ? "1 1 100%" : "1 1 160px",
          }}
        >
          <option value="">All Stores</option>
          {storeLocations.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <div style={{ position: "relative", flex: isMobile ? "1 1 100%" : "1 1 200px" }}>
          <div
            onClick={() => setDateDropOpen(o => !o)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "white",
              border: `1.5px solid ${filterDateFrom ? "#0070f3" : "#e2e8f0"}`,
              borderRadius: 8,
              padding: "8px 12px",
              cursor: "pointer",
              userSelect: "none",
              minHeight: 40,
              boxSizing: "border-box",
            }}
          >
            <Icon icon="mdi:calendar-outline" style={{ color: filterDateFrom ? "#0070f3" : "#888", flexShrink: 0 }} />
            <span style={{ fontSize: FONT_SIZE.sm, color: filterDateFrom ? "#333" : "#aaa", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {dateLabel}
            </span>
            {filterDateFrom ? (
              <button
                onClick={e => { e.stopPropagation(); setFilterDateFrom(""); setFilterDateTo(""); setDateMode("single"); setDateDropOpen(false) }}
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
                    onClick={() => { setDateMode(m); setFilterDateFrom(""); setFilterDateTo("") }}
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
                    value={filterDateFrom}
                    onChange={e => { setFilterDateFrom(e.target.value); setDateDropOpen(false) }}
                    style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: FONT_SIZE.sm, color: "#333", boxSizing: "border-box" }}
                    autoFocus
                  />
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div>
                    <label style={{ display: "block", fontSize: FONT_SIZE.xs, color: "#888", marginBottom: 4 }}>From</label>
                    <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: FONT_SIZE.sm, color: "#333", boxSizing: "border-box" }} autoFocus />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: FONT_SIZE.xs, color: "#888", marginBottom: 4 }}>To</label>
                    <input type="date" value={filterDateTo} min={filterDateFrom || undefined} onChange={e => setFilterDateTo(e.target.value)} style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: FONT_SIZE.sm, color: "#333", boxSizing: "border-box" }} />
                  </div>
                  {filterDateFrom && filterDateTo && (
                    <button onClick={() => setDateDropOpen(false)} style={{ padding: "8px 0", background: "#0070f3", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontSize: FONT_SIZE.sm, fontWeight: "bold" }}>
                      Apply Range
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            style={{
              padding: "8px 14px",
              background: "white",
              color: "#ef4444",
              border: "1px solid #fecaca",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: FONT_SIZE.xs,
              fontWeight: 600,
              minHeight: 40,
              display: "flex",
              alignItems: "center",
              gap: 4,
              transition: "all 0.2s",
              flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "#fef2f2"; e.currentTarget.style.borderColor = "#fca5a5" }}
            onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#fecaca" }}
          >
            <Icon icon="mdi:close" width={14} />
            Clear
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "64px 0" }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid #e2e8f0", borderTopColor: "#0070f3", animation: "spin 1s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : filteredSales.length === 0 ? (
        <div style={{ textAlign: "center", padding: "64px 24px", background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)" }}>
          <div style={{ width: 64, height: 64, background: "#f1f5f9", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2"/></svg>
          </div>
          <h3 style={{ margin: "0 0 8px", color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 600 }}>No sales found</h3>
          <p style={{ color: "#64748b", fontSize: FONT_SIZE.base, margin: 0 }}>
            {filterStatus !== "All" || hasActiveFilters
              ? "No sales match the current filters."
              : "No sales have been recorded yet."}
          </p>
        </div>
      ) : (
        <>
          {viewMode === "card" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {groupedByDate.map((group) => (
                <div key={group.date}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <Icon icon="mdi:calendar" width={18} color="#64748b" />
                    <h3 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.lg, fontWeight: 700 }}>
                      {new Date(group.date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                    </h3>
                    <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: FONT_SIZE.xs, fontWeight: 600, background: "#f1f5f9", color: "#64748b" }}>
                      {group.sales.length} sale{group.sales.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
                    {group.sales.map((sale) => (
                      <div key={sale.sale_id} style={{ background: "white", borderRadius: 12, padding: 20, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)", transition: "all 0.2s ease" }} onMouseEnter={e => !isMobile && (e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.08)", e.currentTarget.style.borderColor = "#cbd5e1")} onMouseLeave={e => !isMobile && (e.currentTarget.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.05)", e.currentTarget.style.borderColor = "#e2e8f0")}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                          <div>
                            <h3 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.lg, fontWeight: 700 }}>{sale.store_name}</h3>
                            <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: FONT_SIZE.sm }}>{sale.product}</p>
                          </div>
                          <span style={{ padding: "6px 12px", borderRadius: 16, fontSize: FONT_SIZE.xs, fontWeight: 600, background: sale.status === "Confirmed" ? "#ecfdf5" : sale.status === "Pending" ? "#fffbeb" : sale.status === "Rejected" ? "#fef2f2" : "#f1f5f9", color: sale.status === "Confirmed" ? "#10b981" : sale.status === "Pending" ? "#f5a623" : sale.status === "Rejected" ? "#ef4444" : "#475569", border: `1.5px solid ${sale.status === "Confirmed" ? "#10b981" : sale.status === "Pending" ? "#f5a623" : sale.status === "Rejected" ? "#ef4444" : "#cbd5e1"}`, whiteSpace: "nowrap" }}>
                            {sale.status}
                          </span>
                          {sale.status === "Rejected" && sale.rejection_reason && (
                            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 8, padding: 10, background: "#fef2f2", borderRadius: 8, border: "1px solid #fecaca" }}>
                              <div style={{ background: "#ef4444", color: "white", padding: 3, borderRadius: "50%", flexShrink: 0, marginTop: 1 }}>
                                <Icon icon="mdi:close" width={12} height={12} />
                              </div>
                              <div>
                                <p style={{ margin: "0 0 4px 0", color: "#ef4444", fontSize: FONT_SIZE.xs, fontWeight: 600 }}>Rejection reason</p>
                                <div style={{ padding: "8px 10px", background: "white", borderRadius: 6, border: "1px solid #fecaca", color: "#7f1d1d", fontSize: FONT_SIZE.xs, fontStyle: "italic" }}>
                                  &ldquo;{sale.rejection_reason}&rdquo;
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #f1f5f9" }}>
                          <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#475569" }}><span style={{ color: "#94a3b8", width: 90, display: "inline-block" }}>Qty:</span> <span style={{ fontWeight: 500 }}>{sale.quantity} bags</span></p>
                          <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#475569" }}><span style={{ color: "#94a3b8", width: 90, display: "inline-block" }}>Price/bag:</span> <span style={{ fontWeight: 500 }}>{sale.price_per_bag ? formatAmount(sale.price_per_bag) : "—"}</span></p>
                          <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#475569" }}><span style={{ color: "#94a3b8", width: 90, display: "inline-block" }}>Total:</span> <span style={{ fontWeight: 600, color: "#10b981" }}>{sale.total_amount ? formatAmount(sale.total_amount) : "—"}</span></p>
                          <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#475569" }}><span style={{ color: "#94a3b8", width: 90, display: "inline-block" }}>Payment:</span> {sale.payment_mode}</p>
                          <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#475569" }}><span style={{ color: "#94a3b8", width: 90, display: "inline-block" }}>Delivery:</span> {sale.delivery_mode}{sale.truck_plate ? ` (${sale.truck_plate})` : ""}</p>
                          {sale.customer_name && (
                            <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#475569" }}><span style={{ color: "#94a3b8", width: 90, display: "inline-block" }}>Customer:</span> {sale.customer_name}</p>
                          )}
                          {sale.broker_name && (
                            <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#475569" }}><span style={{ color: "#94a3b8", width: 90, display: "inline-block" }}>Broker:</span> {sale.broker_name}</p>
                          )}
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ color: "#94a3b8", fontSize: FONT_SIZE.xs }}>
                            {new Date(sale.sold_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {viewMode === "table" && (
            <div style={{ background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", minWidth: 900 }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Store</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Product</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Qty</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Price/Bag</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Total</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Customer</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Payment</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Delivery</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Broker</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Status</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Sale Date</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedByDate.map((group) => (
                    <Fragment key={group.date}>
                      <tr>
                        <td colSpan={11} style={{ padding: "10px 16px", background: "#f8fafc", fontWeight: 700, fontSize: FONT_SIZE.sm, color: "#0f172a", borderBottom: "2px solid #e2e8f0" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <Icon icon="mdi:calendar" width={16} color="#64748b" />
                            {new Date(group.date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                            <span style={{ padding: "1px 6px", borderRadius: 8, fontSize: FONT_SIZE.xs, fontWeight: 600, background: "#e2e8f0", color: "#64748b" }}>
                              {group.sales.length}
                            </span>
                          </div>
                        </td>
                      </tr>
                      {group.sales.map((sale) => (
                        <tr key={sale.sale_id} style={{ borderBottom: "1px solid #e2e8f0", transition: "background 0.2s ease" }} onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                          <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 600 }}>{sale.store_name}</td>
                          <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: FONT_SIZE.base }}>{sale.product}</td>
                          <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 500 }}>{sale.quantity}</td>
                          <td style={{ padding: "12px 16px", color: "#64748b", fontSize: FONT_SIZE.sm }}>{formatAmount(sale.price_per_bag)}</td>
                          <td style={{ padding: "12px 16px", color: "#10b981", fontSize: FONT_SIZE.base, fontWeight: 600 }}>{formatAmount(sale.total_amount)}</td>
                          <td style={{ padding: "12px 16px", color: "#64748b", fontSize: FONT_SIZE.sm }}>{sale.customer_name || "—"}</td>
                          <td style={{ padding: "12px 16px", color: "#64748b", fontSize: FONT_SIZE.sm }}>{sale.payment_mode}</td>
                          <td style={{ padding: "12px 16px", color: "#64748b", fontSize: FONT_SIZE.sm }}>{sale.delivery_mode}{sale.truck_plate ? ` (${sale.truck_plate})` : ""}</td>
                          <td style={{ padding: "12px 16px", color: "#64748b", fontSize: FONT_SIZE.sm }}>{sale.broker_name || "—"}</td>
                          <td style={{ padding: "12px 16px" }}>
                            <span style={{ padding: "6px 10px", borderRadius: 14, fontSize: FONT_SIZE.xs, fontWeight: 600, background: sale.status === "Confirmed" ? "#ecfdf5" : sale.status === "Pending" ? "#fffbeb" : sale.status === "Rejected" ? "#fef2f2" : "#f1f5f9", color: sale.status === "Confirmed" ? "#10b981" : sale.status === "Pending" ? "#f5a623" : sale.status === "Rejected" ? "#ef4444" : "#475569", border: `1.5px solid ${sale.status === "Confirmed" ? "#10b981" : sale.status === "Pending" ? "#f5a623" : sale.status === "Rejected" ? "#ef4444" : "#cbd5e1"}` }}>
                              {sale.status}
                            </span>
                            {sale.status === "Rejected" && sale.rejection_reason && (
                              <div style={{ marginTop: 6, padding: "6px 8px", background: "white", borderRadius: 6, border: "1px solid #fecaca", color: "#7f1d1d", fontSize: FONT_SIZE.xs, fontStyle: "italic", maxWidth: 220 }}>
                                &ldquo;{sale.rejection_reason}&rdquo;
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "12px 16px", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>{new Date(sale.sold_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
