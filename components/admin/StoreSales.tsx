"use client"

import { apiMutate } from "@/lib/api-mutation"
import { FONT_SIZE } from "@/lib/constants"
import { usePolling } from "@/lib/hooks/usePolling"
import { usePagination } from "@/lib/hooks/usePagination"

import { useState, useEffect, useCallback } from "react"
import { Icon } from "@iconify/react"
import { supabase } from "@/lib/supabase"
import { fetchStores } from "@/lib/stores"
import ModernInput from "@/components/ModernInput"
import PaginationControls from "@/components/PaginationControls"
import { calculateStockBalances, TransactionEvent } from "@/lib/stock-utils"

type SaleItem = {
  product: string
  quantity: number
  price_per_bag: number | null
  company_price?: number | null
  price_reason?: string | null
}

type StoreSale = {
  sale_id: string
  store_name: string
  items: SaleItem[]
  total_amount: number | null
  total_quantity: number
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
  sale_type: string | null
  discount_status: string | null
  driver_name?: string | null
  kbnl_truck_no?: string | null
  is_credit_approved?: boolean
}

type StoreSupply = {
  confirmation_id: string
  store_name: string
  confirmed_at: string
  items: { product: string; quantity: number }[]
  total_quantity: number
  plate_number: string | null
  driver_name: string | null
}

type ActivityItem = {
  id: string
  kind: "sale" | "supply"
  store_name: string
  date: string
  created_at: string
  total_quantity: number
  total_amount: number | null
  status: string
  items: Array<{ product: string; quantity: number; price_per_bag?: number | null }>
  sale_id?: string
  discount_status?: string | null
  customer_name?: string | null
  payment_mode?: string
  delivery_mode?: string
  broker_name?: string | null
  bank_name?: string | null
  depositor_name?: string | null
  rejection_reason?: string | null
  sale_type?: string | null
  driver_name?: string | null
  kbnl_truck_no?: string | null
  is_credit_approved?: boolean
  confirmation_id?: string
  plate_number?: string | null
}

type ViewMode = "card" | "table"

function getSaleStatusStyle(sale: { status: string; discount_status?: string | null }) {
  if (sale.discount_status === "returned") return { label: "Returned", bg: "#fffbeb", color: "#d97706", border: "#fcd34d" }
  if (sale.discount_status === "pending") return { label: "Awaiting Review", bg: "#eff6ff", color: "#0070f3", border: "#93c5fd" }
  const byStatus: Record<string, { bg: string; color: string; border: string }> = {
    Confirmed: { bg: "#ecfdf5", color: "#10b981", border: "#10b981" },
    Pending: { bg: "#fffbeb", color: "#f5a623", border: "#f5a623" },
    Rejected: { bg: "#fef2f2", color: "#ef4444", border: "#ef4444" },
  }
  return { label: sale.status, ...(byStatus[sale.status] ?? { bg: "#f1f5f9", color: "#475569", border: "#cbd5e1" }) }
}

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
  } else if (filter === "Supplies") {
    return { bg: "#ecfdf5", textColor: "#059669", borderColor: "#059669" }
  }

  return { bg: "white", textColor: "#64748b", borderColor: "#e2e8f0" }
}

const filterOptions = ["All", "Confirmed", "Pending", "Rejected", "Supplies"]

export default function StoreSales() {
  const { isMobile } = useBreakpoint()
  const [sales, setSales] = useState<StoreSale[]>([])
  const [supplies, setSupplies] = useState<StoreSupply[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState("All")
  const [viewMode, setViewMode] = useState<ViewMode>(isMobile ? "card" : "table")
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectingSale, setRejectingSale] = useState<ActivityItem | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [isRejecting, setIsRejecting] = useState(false)
  const [isResubmitting, setIsResubmitting] = useState(false)
  const [message, setMessage] = useState("")

  const [stockBalances, setStockBalances] = useState<Map<string, number>>(new Map())
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
      .select("sale_id, store_name, items, total_amount, total_quantity, customer_name, payment_mode, delivery_mode, tricycle_id, truck_plate, broker_id, sold_at, created_at, status, bank_name, depositor_name, rejection_reason, sale_type, discount_status, driver_name")
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

    // Fetch kbnl_truck_no for records with truck_plate
    const truckPlates = [...new Set(data.map(s => s.truck_plate).filter(Boolean))]
    const truckMap = new Map<string, string>()
    if (truckPlates.length > 0) {
      const { data: trucks } = await supabase
        .from("Trucks")
        .select("plate_number, kbnl_truck_no")
        .in("plate_number", truckPlates)
      for (const t of trucks || []) truckMap.set(t.plate_number, t.kbnl_truck_no || "")
    }

    // Fetch approved credit approvals for these sales
    const saleIds = data.map(s => s.sale_id)
    const creditApprovedSet = new Set<string>()
    if (saleIds.length > 0) {
      const { data: creditApprovals } = await supabase
        .from("credit_approvals")
        .select("source_id")
        .eq("status", "Approved")
        .eq("source_type", "store_sale")
        .in("source_id", saleIds)
      for (const ca of creditApprovals || []) creditApprovedSet.add(ca.source_id)
    }

    return data.map(s => ({
      ...s,
      broker_name: s.broker_id ? brokerMap.get(s.broker_id) ?? "Unknown" : null,
      kbnl_truck_no: s.truck_plate ? truckMap.get(s.truck_plate) ?? null : null,
      is_credit_approved: creditApprovedSet.has(s.sale_id),
    }))
  }

  async function fetchSupplies(): Promise<StoreSupply[]> {
    const { data: confirmations, error } = await supabase
      .from("store_supply_confirmations")
      .select("confirmation_id, store_name, confirmed_at, stop_id")
      .order("confirmed_at", { ascending: false })

    if (error) throw error
    if (!confirmations) return []

    const confIds = confirmations.map(c => c.confirmation_id)
    if (confIds.length === 0) return []

    const { data: lines, error: linesError } = await supabase
      .from("store_supply_lines")
      .select("confirmation_id, product, quantity")
      .in("confirmation_id", confIds)

    if (linesError) throw linesError

    const stopIds = [...new Set(confirmations.map(c => c.stop_id).filter(Boolean))]
    const stopMap = new Map<string, { plate_number: string | null; driver_name: string | null }>()
    if (stopIds.length > 0) {
      const { data: stops } = await supabase
        .from("Stops")
        .select("stop_id, plate_number, driver_name")
        .in("stop_id", stopIds)
      for (const s of stops || []) {
        stopMap.set(s.stop_id, { plate_number: s.plate_number, driver_name: s.driver_name })
      }
    }

    const linesByConf = new Map<string, { product: string; quantity: number }[]>()
    for (const line of lines || []) {
      const arr = linesByConf.get(line.confirmation_id) || []
      arr.push({ product: line.product, quantity: line.quantity })
      linesByConf.set(line.confirmation_id, arr)
    }

    return confirmations.map(c => {
      const confLines = linesByConf.get(c.confirmation_id) || []
      const stopInfo = c.stop_id ? stopMap.get(c.stop_id) : null
      return {
        confirmation_id: c.confirmation_id,
        store_name: c.store_name,
        confirmed_at: c.confirmed_at,
        items: confLines,
        total_quantity: confLines.reduce((sum, l) => sum + l.quantity, 0),
        plate_number: stopInfo?.plate_number ?? null,
        driver_name: stopInfo?.driver_name ?? null,
      }
    })
  }

  const loadAll = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const [salesData, suppliesData] = await Promise.all([fetchSales(), fetchSupplies()])
      setSales(salesData)
      setSupplies(suppliesData)
      setLastUpdated(new Date())

      const { data: stockRows } = await supabase.from("store_stock").select("store_name, balance")
      const currentBalanceMap = new Map<string, number>()
      for (const row of stockRows || []) {
        currentBalanceMap.set(row.store_name, (currentBalanceMap.get(row.store_name) || 0) + row.balance)
      }

      const events: TransactionEvent[] = []

      for (const sale of salesData) {
        events.push({
          id: sale.sale_id,
          kind: "sale",
          store_name: sale.store_name,
          total_quantity: sale.total_quantity,
          timestamp: sale.created_at,
        })
      }

      for (const supply of suppliesData) {
        events.push({
          id: supply.confirmation_id,
          kind: "supply",
          store_name: supply.store_name,
          total_quantity: supply.total_quantity,
          timestamp: supply.confirmed_at,
        })
      }

      const balances = calculateStockBalances(events, currentBalanceMap)
      setStockBalances(balances)
    } catch (err) {
      console.error("Error loading store activity:", err)
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

   
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll()
  }, [loadAll])

  usePolling(() => loadAll(false), 120000)

  const activities: ActivityItem[] = [
    ...sales.map(s => ({
      id: s.sale_id,
      kind: "sale" as const,
      store_name: s.store_name,
      date: s.sold_at,
      created_at: s.created_at,
      total_quantity: s.total_quantity,
      total_amount: s.total_amount,
      status: s.status,
      items: s.items,
      sale_id: s.sale_id,
      discount_status: s.discount_status,
      customer_name: s.customer_name,
      payment_mode: s.payment_mode,
      delivery_mode: s.delivery_mode,
      broker_name: s.broker_name,
      bank_name: s.bank_name,
      depositor_name: s.depositor_name,
      rejection_reason: s.rejection_reason,
      sale_type: s.sale_type,
      driver_name: s.driver_name,
      kbnl_truck_no: s.kbnl_truck_no,
      is_credit_approved: s.is_credit_approved,
    })),
    ...supplies.map(s => ({
      id: s.confirmation_id,
      kind: "supply" as const,
      store_name: s.store_name,
      date: s.confirmed_at,
      created_at: s.confirmed_at,
      total_quantity: s.total_quantity,
      total_amount: null as number | null,
      status: "Confirmed",
      items: s.items,
      confirmation_id: s.confirmation_id,
      plate_number: s.plate_number,
      driver_name: s.driver_name,
    })),
  ]

  const filteredActivities = activities.filter(a => {
    if (filterStatus === "Supplies" && a.kind !== "supply") return false
    if (filterStatus !== "All" && filterStatus !== "Supplies" && (a.kind !== "sale" || a.status !== filterStatus)) return false
    if (filterProduct && !a.items.some(item => item.product === filterProduct)) return false
    if (filterStore && a.store_name !== filterStore) return false
    const soldDate = a.date.slice(0, 10)
    if (dateMode === "single") {
      if (filterDateFrom && soldDate !== filterDateFrom) return false
    } else {
      if (filterDateFrom && soldDate < filterDateFrom) return false
      if (filterDateTo && soldDate > filterDateTo) return false
    }
    return true
  })

  filteredActivities.sort((a, b) => {
    const aRejected = a.kind === "sale" && a.status === "Rejected"
    const bRejected = b.kind === "sale" && b.status === "Rejected"
    if (aRejected && !bRejected) return -1
    if (!aRejected && bRejected) return 1
    const dateA = new Date(a.date).getTime()
    const dateB = new Date(b.date).getTime()
    return dateB - dateA
  })

  const { page, setPage, totalPages, paginatedItems, totalItems } = usePagination(filteredActivities)

  function activityTotal(item: ActivityItem): number | null {
    return item.total_amount ?? item.items.reduce((sum, i) => sum + (i.quantity * (i.price_per_bag || 0)), 0)
  }

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

  function openRejectModal(sale: ActivityItem) {
    setRejectingSale(sale)
    setRejectReason(sale.rejection_reason || "")
    setMessage("")
    setShowRejectModal(true)
  }

  function closeRejectModal() {
    setShowRejectModal(false)
    setRejectingSale(null)
    setRejectReason("")
    setMessage("")
  }

  async function handleReject() {
    if (!rejectingSale || rejectingSale.kind !== "sale" || !rejectingSale.sale_id) return
    if (!rejectReason.trim()) {
      setMessage("Please provide a reason for rejection")
      return
    }
    setIsRejecting(true)
    try {
      const { data, error } = await apiMutate("finance", {
        action: "update",
        table: "store_sales",
        data: { status: "Rejected", rejection_reason: rejectReason.trim() },
        filters: { sale_id: rejectingSale.sale_id },
      })
      if (error || (Array.isArray(data) && data.length === 0)) {
        setMessage("Failed to reject sale")
        setIsRejecting(false)
        return
      }
      closeRejectModal()
      loadAll()
    } catch (err) {
      console.error("Error rejecting sale:", err)
      setMessage("Failed to reject sale. Please try again.")
      setIsRejecting(false)
    }
  }

  async function handleResubmit(sale: ActivityItem) {
    if (sale.kind !== "sale" || !sale.sale_id) return
    setIsResubmitting(true)
    try {
      const { data, error } = await apiMutate("finance", {
        action: "update",
        table: "store_sales",
        data: { status: "Pending", rejection_reason: null },
        filters: { sale_id: sale.sale_id },
      })
      if (error || (Array.isArray(data) && data.length === 0)) {
        setMessage("Failed to resubmit sale")
        setIsResubmitting(false)
        return
      }
      closeRejectModal()
      loadAll()
    } catch (err) {
      console.error("Error resubmitting sale:", err)
      setMessage("Failed to resubmit sale. Please try again.")
      setIsResubmitting(false)
    }
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
            Store Activity
            {filteredActivities.length > 0 && filteredActivities.some(a => a.kind === "sale" && a.status === "Rejected") && (
              <span style={{
                display: "inline-flex",
                marginLeft: 6,
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#ef4444",
                color: "white",
                fontSize: 10,
                fontWeight: 700,
                lineHeight: "18px",
                justifyContent: "center",
              }}              >
                {filteredActivities.filter(a => a.kind === "sale" && a.status === "Rejected").length}
              </span>
            )}
          </h1>
          <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: FONT_SIZE.base }}>
            View all sales and supply records across stores.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, width: isMobile ? "100%" : "auto" }}>
          {activities.length > 0 && (
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
      ) : filteredActivities.length === 0 ? (
        <div style={{ textAlign: "center", padding: "64px 24px", background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)" }}>
          <div style={{ width: 64, height: 64, background: "#f1f5f9", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2"/></svg>
          </div>
          <h3 style={{ margin: "0 0 8px", color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 600 }}>No activity found</h3>
          <p style={{ color: "#64748b", fontSize: FONT_SIZE.base, margin: 0 }}>
            {filterStatus !== "All" || hasActiveFilters
              ? "No records match the current filters."
              : "No sales or supply records have been recorded yet."}
          </p>
        </div>
      ) : (
        <>
          {viewMode === "card" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {paginatedItems.map((item) => {
                if (item.kind === "supply") {
                  return (
                    <div key={item.id} style={{ background: "white", borderRadius: 12, padding: 20, border: "1px solid #d1fae5", borderLeft: "4px solid #059669", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)", transition: "all 0.2s ease" }} onMouseEnter={e => !isMobile && (e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.08)", e.currentTarget.style.borderColor = "#6ee7b7")} onMouseLeave={e => !isMobile && (e.currentTarget.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.05)", e.currentTarget.style.borderColor = "#d1fae5")}>
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6, gap: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 32, height: 32, borderRadius: 8, background: "#ecfdf5", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <Icon icon="mdi:truck-delivery" width={18} color="#059669" />
                            </div>
                            <h3 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.lg, fontWeight: 700 }}>{item.store_name}</h3>
                          </div>
                          <span style={{ padding: "6px 12px", borderRadius: 16, fontSize: FONT_SIZE.xs, fontWeight: 600, background: "#ecfdf5", color: "#059669", border: "1.5px solid #059669", whiteSpace: "nowrap", flexShrink: 0 }}>
                            Supply
                          </span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
                          {item.plate_number && (
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <Icon icon="mdi:truck" width={14} color="#64748b" />
                              <span style={{ fontSize: FONT_SIZE.sm, color: "#475569" }}>
                                <span style={{ fontWeight: 600, color: "#0f172a" }}>Plate:</span> {item.plate_number}
                              </span>
                            </div>
                          )}
                          {item.driver_name && (
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <Icon icon="mdi:account" width={14} color="#64748b" />
                              <span style={{ fontSize: FONT_SIZE.sm, color: "#475569" }}>
                                <span style={{ fontWeight: 600, color: "#0f172a" }}>Driver:</span> {item.driver_name}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ background: "#f0fdf4", borderRadius: 8, padding: 12, marginBottom: 16 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {item.items.map((line, idx) => (
                            <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: FONT_SIZE.sm }}>
                              <span style={{ fontWeight: 600, color: "#0f172a" }}>{line.product}</span>
                              <span style={{ fontWeight: 600, color: "#059669" }}>+{line.quantity} bags</span>
                            </div>
                          ))}
                        </div>
                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #bbf7d0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: FONT_SIZE.sm, color: "#059669", fontWeight: 500 }}>Total received</span>
                          <span style={{ fontSize: FONT_SIZE["2xl"], fontWeight: 700, color: "#059669" }}>{item.total_quantity}<span style={{ fontSize: FONT_SIZE.xs, fontWeight: 500, color: "#059669", marginLeft: 4 }}>bags</span></span>
                        </div>
                      </div>

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ color: "#94a3b8", fontSize: FONT_SIZE.xs }}>
                          {new Date(item.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} {new Date(item.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: FONT_SIZE.xs, color: "#059669", fontWeight: 500 }}>
                          <Icon icon="mdi:arrow-up-bold" width={12} />
                          Stock increased
                        </span>
                      </div>
                    </div>
                  )
                }

                return (
                  <div key={item.id} style={{ background: "white", borderRadius: 12, padding: 20, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)", transition: "all 0.2s ease" }} onMouseEnter={e => !isMobile && (e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.08)", e.currentTarget.style.borderColor = "#cbd5e1")} onMouseLeave={e => !isMobile && (e.currentTarget.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.05)", e.currentTarget.style.borderColor = "#e2e8f0")}>
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6, gap: 8 }}>
                        <h3 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.lg, fontWeight: 700 }}>{item.store_name}</h3>
                        {(() => {
                          const { label: displayStatus, bg: statusBg, color: statusColor, border: statusBorder } = getSaleStatusStyle(item)
                          return (
                            <span style={{ padding: "6px 12px", borderRadius: 16, fontSize: FONT_SIZE.xs, fontWeight: 600, background: statusBg, color: statusColor, border: `1.5px solid ${statusBorder}`, whiteSpace: "nowrap", flexShrink: 0 }}>
                              {displayStatus}
                            </span>
                          )
                        })()}
                      </div>
                      {item.sale_type === "truck_load_out" && (
                        <span style={{ marginTop: 4, padding: "2px 8px", borderRadius: 6, background: "#fff7ed", color: "#ea580c", fontWeight: 600, fontSize: FONT_SIZE.xs, display: "inline-block" }}>Truck Load Out</span>
                      )}
                      {item.sale_type === "truck_load_out" && (
                        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                          {item.driver_name && (
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <Icon icon="mdi:account" width={14} color="#64748b" />
                              <span style={{ fontSize: FONT_SIZE.sm, color: "#475569" }}>
                                <span style={{ fontWeight: 600, color: "#0f172a" }}>Driver:</span> {item.driver_name}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                      {item.status === "Rejected" && item.rejection_reason && (
                        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 10, padding: 10, background: "#fef2f2", borderRadius: 8, border: "1px solid #fecaca" }}>
                          <div style={{ background: "#ef4444", color: "white", padding: 3, borderRadius: "50%", flexShrink: 0, marginTop: 1 }}>
                            <Icon icon="mdi:close" width={12} height={12} />
                          </div>
                          <div>
                            <p style={{ margin: "0 0 4px 0", color: "#ef4444", fontSize: FONT_SIZE.xs, fontWeight: 600 }}>Rejection reason</p>
                            <div style={{ padding: "8px 10px", background: "white", borderRadius: 6, border: "1px solid #fecaca", color: "#7f1d1d", fontSize: FONT_SIZE.xs, fontStyle: "italic" }}>
                              &ldquo;{item.rejection_reason}&rdquo;
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #f1f5f9" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {item.items.map((item2, idx) => (
                          <div key={idx} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline", fontSize: FONT_SIZE.sm, color: "#475569" }}>
                            <span style={{ fontWeight: 600, color: "#0f172a" }}>{item2.product}</span>
                            <span>× {item2.quantity} bags</span>
                            {item2.price_per_bag != null && (
                              <span>· {formatAmount(item2.price_per_bag)}/bag</span>
                            )}
                          </div>
                        ))}
                      </div>
                      {item.sale_type !== "truck_load_out" && (
                        <>
                          {item.is_credit_approved && item.broker_name && (
                            <span style={{ display: "inline-block", marginTop: 4, marginBottom: 2, padding: "4px 12px", borderRadius: 6, fontSize: FONT_SIZE.xs, fontWeight: 600, background: "#eff6ff", color: "#0070f3", border: "1px solid #93c5fd" }}>Credit</span>
                          )}
                          <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#475569" }}><span style={{ color: "#94a3b8", minWidth: 80, display: "inline-block" }}>Qty:</span> <span style={{ fontWeight: 500 }}>{item.total_quantity} bags</span></p>
                          <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#475569" }}><span style={{ color: "#94a3b8", minWidth: 80, display: "inline-block" }}>Total:</span> <span style={{ fontWeight: 600, color: "#10b981" }}>{formatAmount(activityTotal(item))}</span></p>
                        </>
                      )}
                      {item.sale_type === "truck_load_out" && (
                        <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#475569" }}><span style={{ color: "#94a3b8", minWidth: 80, display: "inline-block" }}>Qty:</span> <span style={{ fontWeight: 500 }}>{item.total_quantity} bags</span></p>
                      )}
                      <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#475569" }}><span style={{ color: "#94a3b8", minWidth: 80, display: "inline-block" }}>Payment:</span> {item.payment_mode}</p>
                      <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#475569" }}><span style={{ color: "#94a3b8", minWidth: 80, display: "inline-block" }}>Delivery:</span> {item.delivery_mode}</p>
                      <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#475569" }}><span style={{ color: "#94a3b8", minWidth: 80, display: "inline-block" }}>Customer:</span> {item.customer_name || "—"}</p>
                      {item.broker_name && (
                        <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#475569" }}><span style={{ color: "#94a3b8", minWidth: 80, display: "inline-block" }}>Broker:</span> {item.broker_name}</p>
                      )}
                      {item.depositor_name && (
                        <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#475569" }}><span style={{ color: "#94a3b8", minWidth: 80, display: "inline-block" }}>Depositor:</span> {item.depositor_name}{item.bank_name ? ` (${item.bank_name})` : ""}</p>
                      )}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f0f7ff", borderRadius: 8, padding: "10px 14px", marginTop: 12, border: "1px solid #bfdbfe" }}>
                      <Icon icon="mdi:package-variant" width={18} color="#0070f3" />
                      <span style={{ fontSize: FONT_SIZE.sm, color: "#475569", fontWeight: 500 }}>Total bags remaining:</span>
                      <span style={{ fontSize: FONT_SIZE.lg, fontWeight: 700, color: "#0070f3" }}>{(item.sale_id ? stockBalances.get(item.sale_id) ?? 0 : 0).toLocaleString()}</span>
                      <span style={{ fontSize: FONT_SIZE.xs, color: "#64748b" }}>bags</span>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ color: "#94a3b8", fontSize: FONT_SIZE.xs }}>
                        {new Date(item.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} {new Date(item.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {(item.status === "Confirmed" || item.status === "Rejected") && (
                        <div style={{ display: "flex", gap: 8 }}>
                          {item.status === "Rejected" && (
                            <button
                              onClick={() => handleResubmit(item)}
                              disabled={isResubmitting}
                              style={{
                                padding: "6px 12px",
                                background: "#0070f3",
                                color: "white",
                                border: "none",
                                borderRadius: 6,
                                cursor: isResubmitting ? "not-allowed" : "pointer",
                                fontSize: FONT_SIZE.xs,
                                fontWeight: 600,
                                minHeight: 32,
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                                transition: "all 0.2s",
                                opacity: isResubmitting ? 0.6 : 1
                              }}
                              onMouseEnter={e => { if (!isResubmitting) e.currentTarget.style.background = "#0056d4" }}
                              onMouseLeave={e => { e.currentTarget.style.background = "#0070f3" }}
                            >
                              <Icon icon="mdi:rotate-3d-variant" width={14} />
                              {isResubmitting ? "Resubmitting…" : "Resubmit"}
                            </button>
                          )}
                          <button
                            onClick={() => openRejectModal(item)}
                            style={{
                              padding: "6px 12px",
                              background: "white",
                              color: "#ef4444",
                              border: "1.5px solid #ef4444",
                              borderRadius: 6,
                              cursor: "pointer",
                              fontSize: FONT_SIZE.xs,
                              fontWeight: 600,
                              minHeight: 32,
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              transition: "all 0.2s"
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = "#fef2f2"; e.currentTarget.style.borderColor = "#dc2626" }}
                            onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#ef4444" }}
                          >
                            <Icon icon="mdi:close-circle" width={14} />
                            {item.status === "Rejected" ? "Re-reject" : "Reject"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {viewMode === "table" && (
            <div style={{ background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", minWidth: 1250 }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Store</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Items</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Total Qty</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Total</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Customer</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Depositor</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Payment</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Delivery</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Driver</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Broker</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Status</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Stock Left</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((item) => {
                    if (item.kind === "supply") {
                      return (
                        <tr key={item.id} style={{ borderBottom: "1px solid #d1fae5", background: "#fafefb", transition: "background 0.2s ease" }} onMouseEnter={e => e.currentTarget.style.background = "#ecfdf5"} onMouseLeave={e => e.currentTarget.style.background = "#fafefb"}>
                          <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 600 }}>
                            {item.store_name}
                            <span style={{ marginLeft: 6, padding: "2px 6px", borderRadius: 6, background: "#ecfdf5", color: "#059669", fontWeight: 600, fontSize: 10, border: "1px solid #059669" }}>Supply</span>
                          </td>
                          <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: FONT_SIZE.sm }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                              {item.items.map((line, idx) => (
                                <div key={idx}>
                                  <span style={{ fontWeight: 600 }}>{line.product}</span>
                                  <span style={{ color: "#64748b" }}> × {line.quantity}</span>
                                </div>
                              ))}
                            </div>
                          </td>
                          <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 500 }}>{item.total_quantity}</td>
                          <td style={{ padding: "12px 16px", color: "#94a3b8", fontSize: FONT_SIZE.sm }}>—</td>
                          <td style={{ padding: "12px 16px", color: "#94a3b8", fontSize: FONT_SIZE.sm }}>—</td>
                          <td style={{ padding: "12px 16px", color: "#94a3b8", fontSize: FONT_SIZE.sm }}>—</td>
                          <td style={{ padding: "12px 16px", color: "#94a3b8", fontSize: FONT_SIZE.sm }}>—</td>
                          <td style={{ padding: "12px 16px", color: "#94a3b8", fontSize: FONT_SIZE.sm }}>
                            {item.plate_number || "—"}
                          </td>
                          <td style={{ padding: "12px 16px", color: "#64748b", fontSize: FONT_SIZE.sm }}>{item.driver_name || "—"}</td>
                          <td style={{ padding: "12px 16px", color: "#94a3b8", fontSize: FONT_SIZE.sm }}>—</td>
                          <td style={{ padding: "12px 16px" }}>
                            <span style={{ padding: "6px 10px", borderRadius: 14, fontSize: FONT_SIZE.xs, fontWeight: 600, background: "#ecfdf5", color: "#059669", border: "1.5px solid #059669" }}>
                              Confirmed
                            </span>
                          </td>
                          <td style={{ padding: "12px 16px", color: "#94a3b8", fontSize: FONT_SIZE.sm }}>—</td>
                          <td style={{ padding: "12px 16px", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>{new Date(item.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} {new Date(item.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                        </tr>
                      )
                    }

                    return (
                      <tr key={item.id} style={{ borderBottom: "1px solid #e2e8f0", transition: "background 0.2s ease" }} onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 600 }}>
                          {item.store_name}
                          {item.sale_type === "truck_load_out" && <span style={{ marginLeft: 6, padding: "2px 6px", borderRadius: 6, background: "#fff7ed", color: "#ea580c", fontWeight: 600, fontSize: 10 }}>Load Out</span>}
                        </td>
                        <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: FONT_SIZE.sm }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            {item.items.map((line, idx) => (
                              <div key={idx}>
                                <span style={{ fontWeight: 600 }}>{line.product}</span>
                                <span style={{ color: "#64748b" }}> × {line.quantity}</span>
                                {line.price_per_bag != null && <span style={{ color: "#64748b" }}> @ {formatAmount(line.price_per_bag)}</span>}
                              </div>
                            ))}
                          </div>
                        </td>
                        <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 500 }}>{item.total_quantity}</td>
                        <td style={{ padding: "12px 16px", color: "#10b981", fontSize: FONT_SIZE.base, fontWeight: 600 }}>
                          {item.sale_type === "truck_load_out" ? "—" : formatAmount(activityTotal(item))}
                          {item.sale_type !== "truck_load_out" && item.is_credit_approved && item.broker_name && (
                            <span style={{ display: "block", marginTop: 4, padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600, background: "#eff6ff", color: "#0070f3", border: "1px solid #93c5fd" }}>Credit</span>
                          )}
                        </td>
                        <td style={{ padding: "12px 16px", color: "#64748b", fontSize: FONT_SIZE.sm }}>{item.customer_name || "—"}</td>
                        <td style={{ padding: "12px 16px", color: "#64748b", fontSize: FONT_SIZE.sm }}>{item.depositor_name ? `${item.depositor_name}${item.bank_name ? ` (${item.bank_name})` : ""}` : "—"}</td>
                        <td style={{ padding: "12px 16px", color: "#64748b", fontSize: FONT_SIZE.sm }}>{item.payment_mode}</td>
                        <td style={{ padding: "12px 16px", color: "#64748b", fontSize: FONT_SIZE.sm }}>{item.delivery_mode}</td>
                        <td style={{ padding: "12px 16px", color: "#64748b", fontSize: FONT_SIZE.sm }}>
                          {item.sale_type === "truck_load_out" && item.driver_name
                            ? <span style={{ fontWeight: 500 }}>{item.driver_name}</span>
                            : "—"}
                        </td>
                        <td style={{ padding: "12px 16px", color: "#64748b", fontSize: FONT_SIZE.sm }}>{item.broker_name || "—"}</td>
                        <td style={{ padding: "12px 16px" }}>
                          {(() => {
                            const { label: displayStatus, bg: statusBg, color: statusColor, border: statusBorder } = getSaleStatusStyle(item)
                            return (
                              <span style={{ padding: "6px 10px", borderRadius: 14, fontSize: FONT_SIZE.xs, fontWeight: 600, background: statusBg, color: statusColor, border: `1.5px solid ${statusBorder}` }}>
                                {displayStatus}
                              </span>
                            )
                          })()}
                          {item.status === "Rejected" && item.rejection_reason && (
                            <div style={{ marginTop: 6, padding: "6px 8px", background: "white", borderRadius: 6, border: "1px solid #fecaca", color: "#7f1d1d", fontSize: FONT_SIZE.xs, fontStyle: "italic", maxWidth: 220 }}>
                              &ldquo;{item.rejection_reason}&rdquo;
                            </div>
                          )}
                          {(item.status === "Confirmed" || item.status === "Rejected") && (
                            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                              {item.status === "Rejected" && (
                                <button
onClick={() => handleResubmit(item)}
                                  disabled={isResubmitting}
                                  style={{
                                    padding: "5px 10px",
                                    background: "#0070f3",
                                    color: "white",
                                    border: "none",
                                    borderRadius: 5,
                                    cursor: isResubmitting ? "not-allowed" : "pointer",
                                    fontSize: FONT_SIZE.xs,
                                    fontWeight: 600,
                                    minHeight: 28,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 4,
                                    transition: "all 0.2s",
                                    opacity: isResubmitting ? 0.6 : 1
                                  }}
                                  onMouseEnter={e => { if (!isResubmitting) e.currentTarget.style.background = "#0056d4" }}
                                  onMouseLeave={e => { e.currentTarget.style.background = "#0070f3" }}
                                >
                                  <Icon icon="mdi:rotate-3d-variant" width={13} />
                                  Resubmit
                                </button>
                              )}
                              <button
                                onClick={() => openRejectModal(item)}
                                style={{
                                  padding: "5px 10px",
                                  background: "white",
                                  color: "#ef4444",
                                  border: "1.5px solid #ef4444",
                                  borderRadius: 5,
                                  cursor: "pointer",
                                  fontSize: FONT_SIZE.xs,
                                  fontWeight: 600,
                                  minHeight: 28,
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 4,
                                  transition: "all 0.2s"
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = "#fef2f2"; e.currentTarget.style.borderColor = "#dc2626" }}
                                onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#ef4444" }}
                              >
                                <Icon icon="mdi:close-circle" width={13} />
                                {item.status === "Rejected" ? "Re-reject" : "Reject"}
                              </button>
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: FONT_SIZE.base, fontWeight: 600, color: "#0070f3" }}>
                          {item.sale_id ? (stockBalances.get(item.sale_id) ?? 0).toLocaleString() : "—"}
                        </td>
                        <td style={{ padding: "12px 16px", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>{new Date(item.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} {new Date(item.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {filteredActivities.length > 0 && (
        <PaginationControls page={page} totalPages={totalPages} totalItems={totalItems} onPageChange={setPage} />
      )}

      {showRejectModal && rejectingSale && (
        <div
          onClick={closeRejectModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: isMobile ? "flex-end" : "center",
            justifyContent: "center",
            zIndex: 100,
            padding: isMobile ? 0 : 24,
            animation: "fadeIn 0.2s ease-out",
          }}
        >
          <style>{`
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
          `}</style>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white",
              borderRadius: isMobile ? "20px 20px 0 0" : 12,
              padding: isMobile ? "28px 20px" : 32,
              width: "100%",
              maxWidth: 480,
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
              animation: "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {isMobile && <div style={{ width: 40, height: 4, background: "#e0e0e0", borderRadius: 2, margin: "0 auto 20px" }} />}

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon icon="mdi:close-circle" width={20} color="#ef4444" />
              </div>
              <h3 style={{ margin: 0, color: "#0f172a", fontSize: isMobile ? 18 : 16, fontWeight: 700 }}>
                {rejectingSale.status === "Rejected" ? "Update Rejection Reason" : "Reject Sale"}
              </h3>
            </div>

            <div style={{ padding: "12px 14px", background: "#f8fafc", borderRadius: 10, margin: "16px 0", border: "1px solid #e2e8f0" }}>
              <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#0f172a", fontWeight: 600 }}>{rejectingSale.store_name}</p>
              {rejectingSale.items.map((item, idx) => (
                <p key={idx} style={{ margin: "4px 0 0", fontSize: FONT_SIZE.sm, color: "#64748b" }}>
                  {item.product} × {item.quantity} bags{item.price_per_bag != null ? ` · ${formatAmount(item.price_per_bag)}/bag` : ""}
                </p>
              ))}
              <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.sm, color: "#475569", fontWeight: 500 }}>
                Total: {formatAmount(activityTotal(rejectingSale))} · {rejectingSale.total_quantity} bags
              </p>
              {rejectingSale.broker_name && (
                <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.sm, color: "#64748b" }}>
                  Broker: {rejectingSale.broker_name}
                </p>
              )}
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: FONT_SIZE.sm, fontWeight: 600 }}>
                Reason for Rejection *
              </label>
              <ModernInput
                as="textarea"
                placeholder="e.g. Wrong quantity recorded, incorrect price, wrong customer…"
                value={rejectReason}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => { setRejectReason(e.target.value); setMessage("") }}
                rows={4}
                style={{ resize: "none", minHeight: 110, width: "100%" }}
              />
            </div>

            {rejectingSale.status === "Rejected" && rejectingSale.rejection_reason && (
              <div style={{ padding: "8px 12px", background: "#fef2f2", borderRadius: 6, border: "1px solid #fecaca", marginBottom: 16, fontSize: FONT_SIZE.xs, color: "#7f1d1d" }}>
                Current reason: &ldquo;{rejectingSale.rejection_reason}&rdquo;
              </div>
            )}

            {message && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#ef4444", marginBottom: 14, fontSize: 13 }}>
                <Icon icon="mdi:alert-circle" width={15} />{message}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={closeRejectModal}
                style={{
                  flex: 1,
                  padding: "13px 0",
                  background: "white",
                  border: "1.5px solid #e5e5e5",
                  borderRadius: 10,
                  cursor: "pointer",
                  fontSize: 15,
                  minHeight: 50,
                  fontWeight: "bold",
                  color: "#475569",
                  transition: "all 0.2s",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "#f8fafc" }}
                onMouseLeave={e => { e.currentTarget.style.background = "white" }}
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={isRejecting}
                style={{
                  flex: 1,
                  padding: "13px 0",
                  background: isRejecting ? "#ccc" : "#ef4444",
                  color: "white",
                  border: "none",
                  borderRadius: 10,
                  cursor: isRejecting ? "not-allowed" : "pointer",
                  fontSize: 15,
                  minHeight: 50,
                  fontWeight: "bold",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  transition: "all 0.2s",
                  opacity: isRejecting ? 0.7 : 1,
                }}
                onMouseEnter={e => { if (!isRejecting) e.currentTarget.style.background = "#dc2626" }}
                onMouseLeave={e => { e.currentTarget.style.background = isRejecting ? "#ccc" : "#ef4444" }}
              >
                {isRejecting
                  ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} />Rejecting…</>
                  : <><Icon icon="mdi:close-circle" width={16} />{rejectingSale.status === "Rejected" ? "Update Reason" : "Reject Sale"}</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
