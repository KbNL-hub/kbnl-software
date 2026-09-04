"use client"

import React from "react"
import { useCallback, useEffect, useState, useMemo } from "react"
import { supabase } from "@/lib/supabase"
import { apiMutate } from "@/lib/api-mutation"
import { Icon } from "@iconify/react"
import CustomerSelector from "@/components/CustomerSelector"
import { formatAmount, parseAmount } from "@/lib/formatAmount"
import { useBreakpoint } from "@/app/hooks/useBreakpoint"
import { usePermissions } from "@/lib/PermissionContext"
import ModernInput from "@/components/ModernInput"
import { FONT_SIZE, BANKS } from "@/lib/constants"
import { usePolling } from "@/lib/hooks/usePolling"

import { usePagination } from "@/lib/hooks/usePagination"
import PaginationControls from "@/components/PaginationControls"
import { ExportActions } from "@/components/admin/ExportActions"

const PRODUCTS = ["BUA cement", "Falcon", "3X", "Supaset", "Supafix", "Classic"]

type Broker = { broker_id: string; broker_name: string }
type Customer = { customer_id: string; full_name: string; phone_number: number | null; broker_id: string }
type Trip = {
  trip_id: string
  plate_number: string
  created_at: string | null
  ATC: string | null
  order_no: string | null
  child_order_no: string | null
}

type ChartRecord = {
  chart_id: string
  customer_id: string
  customer_name: string
  broker_id: string
  record_type: "Credit" | "Sales"
  record_date: string
  bank_name: string | null
  teller_no: string | null
  amount: number
  location: string | null
  product: string | null
  trip_ref: string | null
  quantity: number | null
  rate: number | null
  created_by: string | null
  created_at: string
  updated_at: string
}

type ViewMode = "card" | "table"
type NavLevel = "brokers" | "customers" | "ledger"

type Props = {
  userProfile: {
    user_id: string
    role: string
    roles?: string[]
    full_name: string
    profile_picture_url?: string
  }
}

export default function Chart({ userProfile }: Props) {
  const { getAccess } = usePermissions()
  const canEdit = getAccess("chart").canEdit
  const isAdmin = (userProfile.roles ?? [userProfile.role]).some(r => ["Admin", "SuperAdmin"].includes(r))
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"

  const [navLevel, setNavLevel] = useState<NavLevel>("brokers")
  const [selectedBroker, setSelectedBroker] = useState<Broker | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)

  const [brokers, setBrokers] = useState<Broker[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [records, setRecords] = useState<ChartRecord[]>([])
  const [trips, setTrips] = useState<Trip[]>([])
  const [customerBalances, setCustomerBalances] = useState<Record<string, number>>({})

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")
  const [viewMode, setViewMode] = useState<ViewMode>("card")

  const [showAddModal, setShowAddModal] = useState(false)
  const [showUpdateModal, setShowUpdateModal] = useState(false)
  const [updatingRecord, setUpdatingRecord] = useState<ChartRecord | null>(null)

  const [recordType, setRecordType] = useState<"Credit" | "Sales">("Credit")
  const [recordDate, setRecordDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [bankName, setBankName] = useState("")
  const [tellerNo, setTellerNo] = useState("")
  const [amountInput, setAmountInput] = useState("")
  const [location, setLocation] = useState("")
  const [product, setProduct] = useState("")
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null)
  const [tripSearch, setTripSearch] = useState("")
  const [tripDropOpen, setTripDropOpen] = useState(false)
  const [quantity, setQuantity] = useState("")
  const [rate, setRateInput] = useState("")

  const computedValue = useMemo(() => {
    const qty = parseFloat(quantity.replace(/,/g, "")) || 0
    const r = parseFloat(rate.replace(/,/g, "")) || 0
    return qty * r
  }, [quantity, rate])

  const fetchBrokers = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from("Brokers")
      .select("broker_id, broker_name")
      .order("broker_name", { ascending: true })
    if (data) setBrokers(data)
    setLoading(false)
  }, [])

  const fetchCustomers = useCallback(async (brokerId: string) => {
    setLoading(true)
    const { data: chartData } = await supabase
      .from("customer_charts")
      .select("customer_id, customer_name, record_type, amount")
      .eq("broker_id", brokerId)

    if (!chartData || chartData.length === 0) {
      setCustomers([])
      setCustomerBalances({})
      setLoading(false)
      return
    }

    const uniqueMap = new Map<string, string>()
    const balMap: Record<string, number> = {}
    chartData.forEach(r => {
      if (!uniqueMap.has(r.customer_id)) uniqueMap.set(r.customer_id, r.customer_name)
      const cur = balMap[r.customer_id] || 0
      balMap[r.customer_id] = r.record_type === "Credit" ? cur + r.amount : cur - r.amount
    })
    const customerIds = [...uniqueMap.keys()]

    const { data: customerRows } = await supabase
      .from("Customers")
      .select("customer_id, full_name, phone_number")
      .in("customer_id", customerIds)

    const phoneMap = new Map<string, number | null>()
    customerRows?.forEach(c => phoneMap.set(c.customer_id, c.phone_number))

    const result: Customer[] = customerIds.map(id => ({
      customer_id: id,
      full_name: uniqueMap.get(id) || "",
      phone_number: phoneMap.get(id) ?? null,
      broker_id: brokerId,
    }))

    setCustomers(result)
    setCustomerBalances(balMap)
    setLoading(false)
  }, [])

  const fetchRecords = useCallback(async (customerId: string) => {
    setLoading(true)
    const { data } = await supabase
      .from("customer_charts")
      .select("*")
      .eq("customer_id", customerId)
      .order("record_date", { ascending: true })
      .order("created_at", { ascending: true })
    if (data) setRecords(data as ChartRecord[])
    setLoading(false)
  }, [])

  const fetchTrips = useCallback(async () => {
    const { data } = await supabase
      .from("Trips")
      .select("trip_id, plate_number, created_at, ATC, order_no, child_order_no")
      .order("created_at", { ascending: false })
      .limit(200)
    if (data) setTrips(data as Trip[])
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchBrokers() }, [fetchBrokers])

  usePolling(() => {
    if (navLevel === "ledger" && selectedCustomer) {
      fetchRecords(selectedCustomer.customer_id)
    } else if (navLevel === "customers" && selectedBroker) {
      fetchCustomers(selectedBroker.broker_id)
    } else {
      fetchBrokers()
    }
  }, 120000)

  const { page: ledgerPage, setPage: setLedgerPage, totalPages: ledgerTotalPages, paginatedItems: paginatedRecords, totalItems: totalRecords } = usePagination(records)

  const runningBalances = useMemo(() => {
    const map: Record<string, number> = {}
    let balance = 0
    records.forEach(r => {
      balance = r.record_type === "Credit" ? balance + r.amount : balance - r.amount
      map[r.chart_id] = balance
    })
    return map
  }, [records])

  const totalBalance = useMemo(() => {
    return records.reduce((sum, r) => r.record_type === "Credit" ? sum + r.amount : sum - r.amount, 0)
  }, [records])

  function downloadXLSX(filename: string, rows: Record<string, unknown>[], sheetName: string) {
    if (!rows.length) return
    import("xlsx").then((XLSX) => {
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, sheetName)
      XLSX.writeFile(wb, filename)
    })
  }

  function buildLedgerRows() {
    let bal = 0
    return records.map(r => {
      bal = r.record_type === "Credit" ? bal + r.amount : bal - r.amount
      const trip = r.trip_ref ? trips.find(t => t.trip_id === r.trip_ref) : null
      return {
        Date: new Date(r.record_date).toLocaleDateString(),
        Type: r.record_type,
        Bank: r.record_type === "Credit" ? (r.bank_name || "") : "",
        "Teller No.": r.record_type === "Credit" ? (r.teller_no || "") : "",
        Location: r.record_type === "Sales" ? (r.location || "") : "",
        Product: r.record_type === "Sales" ? (r.product || "") : "",
        "T/R": trip ? formatTripRef(trip) : "",
        Qty: r.quantity ?? "",
        Rate: r.rate ?? "",
        Value: r.amount,
        Balance: bal,
      }
    })
  }

  function exportLedgerCSV() {
    const rows = buildLedgerRows()
    if (!rows.length) return
    const headers = Object.keys(rows[0])
    const csv = [headers.join(","), ...rows.map(row => headers.map(h => {
      const val = String((row as Record<string, unknown>)[h] ?? "")
      return /[",\r\n]/.test(val) ? `"${val.replace(/"/g, '""')}"` : val
    }).join(","))].join("\n")
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${selectedCustomer?.full_name || "customer"}_ledger.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportLedgerXLSX() {
    const rows = buildLedgerRows()
    downloadXLSX(`${selectedCustomer?.full_name || "customer"}_ledger.xlsx`, rows, "Ledger")
  }

  function openBrokerDetail(broker: Broker) {
    setSelectedBroker(broker)
    setSelectedCustomer(null)
    setRecords([])
    setNavLevel("customers")
    fetchCustomers(broker.broker_id)
  }

  function openCustomerLedger(customer: Customer) {
    setSelectedCustomer(customer)
    setRecords([])
    setLedgerPage(0)
    setNavLevel("ledger")
    fetchRecords(customer.customer_id)
    fetchTrips()
  }

  function backToBrokers() {
    setNavLevel("brokers")
    setSelectedBroker(null)
    setSelectedCustomer(null)
    setRecords([])
    fetchBrokers()
  }

  function backToCustomers() {
    setNavLevel("customers")
    setSelectedCustomer(null)
    setRecords([])
    if (selectedBroker) fetchCustomers(selectedBroker.broker_id)
  }

  function openAddModal() {
    setRecordType("Credit")
    setRecordDate(new Date().toISOString().slice(0, 10))
    setBankName("")
    setTellerNo("")
    setAmountInput("")
    setLocation("")
    setProduct("")
    setSelectedTrip(null)
    setTripSearch("")
    setQuantity("")
    setRateInput("")
    setErrorMsg("")
    setShowAddModal(true)
  }

  function openUpdateModal(record: ChartRecord) {
    setUpdatingRecord(record)
    setRecordType(record.record_type)
    setRecordDate(record.record_date)
    setBankName(record.bank_name || "")
    setTellerNo(record.teller_no || "")
    setAmountInput(String(record.amount))
    setLocation(record.location || "")
    setProduct(record.product || "")
    if (record.trip_ref) {
      const trip = trips.find(t => t.trip_id === record.trip_ref)
      setSelectedTrip(trip || null)
      if (trip) setTripSearch(formatTripLabel(trip))
    } else {
      setSelectedTrip(null)
      setTripSearch("")
    }
    setQuantity(record.quantity != null ? String(record.quantity) : "")
    setRateInput(record.rate != null ? String(record.rate) : "")
    setErrorMsg("")
    setShowUpdateModal(true)
  }

  async function handleAdd() {
    if (!selectedCustomer || !selectedBroker) return

    if (recordType === "Credit") {
      const amt = parseAmount(amountInput)
      if (!amt || amt <= 0) { setErrorMsg("Enter a valid amount"); return }
    }

    if (recordType === "Sales") {
      if (!location.trim()) { setErrorMsg("Location is required for Sales"); return }
      if (!product) { setErrorMsg("Product is required for Sales"); return }
      if (computedValue <= 0) { setErrorMsg("Quantity and Rate must result in a positive value"); return }
    }

    setSubmitting(true)
    setErrorMsg("")

    try {
      const finalAmount = recordType === "Sales" ? computedValue : parseAmount(amountInput)
      const { error } = await apiMutate("finance", {
        action: "insert",
        table: "customer_charts",
        data: {
          customer_id: selectedCustomer.customer_id,
          customer_name: selectedCustomer.full_name,
          broker_id: selectedBroker.broker_id,
          record_type: recordType,
          record_date: recordDate,
          bank_name: bankName || null,
          teller_no: tellerNo || null,
          amount: finalAmount,
          location: recordType === "Sales" ? location : null,
          product: recordType === "Sales" ? product : null,
          trip_ref: recordType === "Sales" && selectedTrip ? selectedTrip.trip_id : null,
          quantity: recordType === "Sales" && quantity ? parseFloat(quantity.replace(/,/g, "")) : null,
          rate: recordType === "Sales" && rate ? parseFloat(rate.replace(/,/g, "")) : null,
          created_by: userProfile.user_id,
        },
      })

      if (error) { setErrorMsg(error); return }

      setShowAddModal(false)
      await fetchRecords(selectedCustomer.customer_id)
    } catch {
      setErrorMsg("Network error, please try again")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleUpdate() {
    if (!updatingRecord) return
    if (!isAdmin) { setErrorMsg("Only admins can edit records"); return }

    if (recordType === "Credit") {
      const amt = parseAmount(amountInput)
      if (!amt || amt <= 0) { setErrorMsg("Enter a valid amount"); return }
    }

    if (recordType === "Sales") {
      if (!location.trim()) { setErrorMsg("Location is required for Sales"); return }
      if (!product) { setErrorMsg("Product is required for Sales"); return }
      if (computedValue <= 0) { setErrorMsg("Quantity and Rate must result in a positive value"); return }
    }

    setSubmitting(true)
    setErrorMsg("")

    try {
      const finalAmount = recordType === "Sales" ? computedValue : parseAmount(amountInput)
      const { error } = await apiMutate("finance", {
        action: "update",
        table: "customer_charts",
        data: {
          record_type: recordType,
          record_date: recordDate,
          bank_name: bankName || null,
          teller_no: tellerNo || null,
          amount: finalAmount,
          location: recordType === "Sales" ? location : null,
          product: recordType === "Sales" ? product : null,
          trip_ref: recordType === "Sales" && selectedTrip ? selectedTrip.trip_id : null,
          quantity: recordType === "Sales" && quantity ? parseFloat(quantity.replace(/,/g, "")) : null,
          rate: recordType === "Sales" && rate ? parseFloat(rate.replace(/,/g, "")) : null,
        },
        filters: { chart_id: updatingRecord.chart_id },
      })

      if (error) { setErrorMsg(error); return }

      setShowUpdateModal(false)
      setUpdatingRecord(null)
      if (selectedCustomer) await fetchRecords(selectedCustomer.customer_id)
    } catch {
      setErrorMsg("Network error, please try again")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(record: ChartRecord) {
    if (!isAdmin) return
    if (!confirm("Delete this record? This cannot be undone.")) return

    setSubmitting(true)
    try {
      const { error } = await apiMutate("finance", {
        action: "delete",
        table: "customer_charts",
        filters: { chart_id: record.chart_id },
      })
      if (error) { setErrorMsg(error); return }
      if (selectedCustomer) await fetchRecords(selectedCustomer.customer_id)
    } catch {
      setErrorMsg("Network error, please try again")
    } finally {
      setSubmitting(false)
    }
  }

  function formatTripLabel(trip: Trip): string {
    const date = trip.created_at ? new Date(trip.created_at).toLocaleDateString() : ""
    const ref = trip.order_no
      ? `Order: ${trip.order_no}${trip.child_order_no ? ` / ${trip.child_order_no}` : ""}`
      : trip.ATC
        ? `ATC: ${String(trip.ATC)}`
        : ""
    return `${trip.plate_number} | ${date}${ref ? " | " + ref : ""}`
  }

  function formatTripRef(trip: Trip): string {
    return trip.order_no
      ? `Order: ${trip.order_no}${trip.child_order_no ? ` / ${trip.child_order_no}` : ""}`
      : trip.ATC
        ? `ATC: ${String(trip.ATC)}`
        : trip.plate_number
  }

  const filteredTrips = useMemo(() => {
    if (!tripSearch) return trips
    const q = tripSearch.toLowerCase()
    return trips.filter(t =>
      t.plate_number.toLowerCase().includes(q) ||
      (t.order_no && t.order_no.toLowerCase().includes(q)) ||
      (t.child_order_no && t.child_order_no.toLowerCase().includes(q)) ||
      (t.ATC && String(t.ATC).toLowerCase().includes(q))
    )
  }, [trips, tripSearch])

  const tblHeadStyle: React.CSSProperties = {
    padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs,
    color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px",
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "'Inter', sans-serif" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #0f0f1e 0%, #1a1a2e 100%)", padding: isMobile ? "16px" : "16px 32px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {navLevel !== "brokers" && (
              <button
                onClick={navLevel === "customers" ? backToBrokers : backToCustomers}
                style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#aaa", cursor: "pointer", padding: 8, borderRadius: 8, display: "flex", alignItems: "center" }}
              >
                <Icon icon="mdi:arrow-left" width={20} />
              </button>
            )}
            <div>
              <h1 style={{ margin: 0, fontSize: isMobile ? 18 : 22, fontWeight: 700, color: "#fff" }}>
                {navLevel === "brokers" && "Chart"}
                {navLevel === "customers" && selectedBroker?.broker_name}
                {navLevel === "ledger" && selectedCustomer?.full_name}
              </h1>
              {navLevel === "ledger" && selectedCustomer && (
                <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "rgba(255,255,255,0.6)" }}>
                  {selectedCustomer.phone_number || "No phone"}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={() => supabase.auth.signOut().then(() => window.location.href = "/login")}
            style={{ background: "rgba(255,85,85,0.2)", color: "#ff5555", border: "1.5px solid rgba(255,85,85,0.3)", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.xs, display: "flex", alignItems: "center", gap: 6 }}
          >
            <Icon icon="mdi:logout" width={14} />
            {!isMobile && "Logout"}
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: isMobile ? "16px" : "32px" }}>

        {/* Balance banner */}
        {navLevel === "ledger" && (
          <div style={{ background: "#ffffff", border: "1px solid #eef2f7", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.06)", borderRadius: 16, padding: "24px 20px", marginBottom: 24, color: "#171717" }}>
            <p style={{ fontSize: FONT_SIZE.base, opacity: 0.7, margin: 0, marginBottom: 4, color: "#64748b" }}>Net Balance</p>
            <p style={{ fontSize: isMobile ? 28 : 36, fontWeight: "bold", margin: 0, color: totalBalance < 0 ? "#dc2626" : "#0070f3" }}>
              ₦{formatAmount(String(Math.abs(totalBalance))) || "0"}
              {totalBalance < 0 && <span style={{ fontSize: FONT_SIZE.sm, color: "#dc2626", opacity: 0.7, marginLeft: 8 }}>DR</span>}
            </p>
          </div>
        )}

        {/* Error */}
        {errorMsg && (
          <div style={{ padding: "12px 16px", background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", borderRadius: 8, marginBottom: 16, fontSize: FONT_SIZE.sm, fontWeight: 500 }}>
            {errorMsg}
          </div>
        )}

        {/* Level 1: Broker List */}
        {navLevel === "brokers" && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
              <h2 style={{ fontSize: FONT_SIZE.lg, color: "#171717", margin: 0 }}>Brokers</h2>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={fetchBrokers}
                  disabled={loading}
                  style={{
                    padding: "8px 12px", background: "white", color: "#64748b", border: "1px solid #e2e8f0",
                    borderRadius: 8, cursor: loading ? "not-allowed" : "pointer", fontSize: FONT_SIZE.xs,
                    fontWeight: 500, minHeight: 40, minWidth: 40, display: "flex", alignItems: "center",
                    justifyContent: "center", transition: "all 0.2s", opacity: loading ? 0.5 : 1,
                  }}
                  title="Refresh"
                >
                  <Icon icon="mdi:refresh" width={16} style={{ animation: loading ? "spin 0.8s linear infinite" : "none" }} />
                </button>
                {brokers.length > 0 && (
                  <div style={{ display: "flex", background: "white", border: "1px solid #e2e8f0", borderRadius: 8, padding: 4, gap: 0 }}>
                    <button
                      onClick={() => setViewMode("card")}
                      style={{
                        padding: "8px 12px", background: viewMode === "card" ? "#0070f3" : "transparent",
                        color: viewMode === "card" ? "white" : "#64748b", border: "none", borderRadius: 6,
                        cursor: "pointer", fontSize: FONT_SIZE.xs, fontWeight: 600, transition: "all 0.2s ease",
                        minWidth: 44, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                      title="Card view"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z"/></svg>
                    </button>
                    <button
                      onClick={() => setViewMode("table")}
                      style={{
                        padding: "8px 12px", background: viewMode === "table" ? "#0070f3" : "transparent",
                        color: viewMode === "table" ? "white" : "#64748b", border: "none", borderRadius: 6,
                        cursor: "pointer", fontSize: FONT_SIZE.xs, fontWeight: 600, transition: "all 0.2s ease",
                        minWidth: 44, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                      title="Table view"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 4h18v2H3V4zm0 7h18v2H3v-2zm0 7h18v2H3v-2z"/></svg>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {loading && brokers.length === 0 ? (
              <LoadingState />
            ) : brokers.length === 0 ? (
              <EmptyState message="No brokers found" />
            ) : viewMode === "card" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {brokers.map(b => (
                  <div
                    key={b.broker_id}
                    onClick={() => openBrokerDetail(b)}
                    style={{
                      background: "white", borderRadius: 12, padding: "16px 18px",
                      border: "1px solid #e5e7eb", cursor: "pointer",
                      transition: "box-shadow 0.2s, border-color 0.2s",
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "#0070f3"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,112,243,0.12)" }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.boxShadow = "none" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Icon icon="mdi:handshake" width={20} color="#0070f3" />
                      </div>
                      <span style={{ fontSize: FONT_SIZE.base, fontWeight: 600, color: "#171717" }}>{b.broker_name}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      <Icon icon="mdi:chevron-right" width={18} color="#9ca3af" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)", overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                      <th style={tblHeadStyle}>Broker</th>
                      <th style={{ ...tblHeadStyle, textAlign: "right" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {brokers.map((b, idx) => (
                      <tr
                        key={b.broker_id}
                        onClick={() => openBrokerDetail(b)}
                        style={{ borderBottom: idx === brokers.length - 1 ? "none" : "1px solid #e2e8f0", cursor: "pointer" }}
                        onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 8, background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <Icon icon="mdi:handshake" width={18} color="#0070f3" />
                            </div>
                            <span style={{ color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 500 }}>{b.broker_name}</span>
                          </div>
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right" }}>
                          <Icon icon="mdi:chevron-right" width={16} color="#9ca3af" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Level 2: Customer List */}
        {navLevel === "customers" && selectedBroker && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
              <h2 style={{ fontSize: FONT_SIZE.lg, color: "#171717", margin: 0 }}>Customers</h2>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => fetchCustomers(selectedBroker.broker_id)}
                  disabled={loading}
                  style={{
                    padding: "8px 12px", background: "white", color: "#64748b", border: "1px solid #e2e8f0",
                    borderRadius: 8, cursor: loading ? "not-allowed" : "pointer", fontSize: FONT_SIZE.xs,
                    fontWeight: 500, minHeight: 40, minWidth: 40, display: "flex", alignItems: "center",
                    justifyContent: "center", transition: "all 0.2s", opacity: loading ? 0.5 : 1,
                  }}
                  title="Refresh"
                >
                  <Icon icon="mdi:refresh" width={16} style={{ animation: loading ? "spin 0.8s linear infinite" : "none" }} />
                </button>
                {customers.length > 0 && (
                  <div style={{ display: "flex", background: "white", border: "1px solid #e2e8f0", borderRadius: 8, padding: 4, gap: 0 }}>
                    <button
                      onClick={() => setViewMode("card")}
                      style={{
                        padding: "8px 12px", background: viewMode === "card" ? "#0070f3" : "transparent",
                        color: viewMode === "card" ? "white" : "#64748b", border: "none", borderRadius: 6,
                        cursor: "pointer", fontSize: FONT_SIZE.xs, fontWeight: 600, transition: "all 0.2s ease",
                        minWidth: 44, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z"/></svg>
                    </button>
                    <button
                      onClick={() => setViewMode("table")}
                      style={{
                        padding: "8px 12px", background: viewMode === "table" ? "#0070f3" : "transparent",
                        color: viewMode === "table" ? "white" : "#64748b", border: "none", borderRadius: 6,
                        cursor: "pointer", fontSize: FONT_SIZE.xs, fontWeight: 600, transition: "all 0.2s ease",
                        minWidth: 44, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 4h18v2H3V4zm0 7h18v2H3v-2zm0 7h18v2H3v-2z"/></svg>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Customer search */}
            <div style={{ marginBottom: 16 }}>
              <CustomerSelector onSelect={(c) => {
                const customer: Customer = {
                  customer_id: c.customer_id,
                  full_name: c.full_name,
                  phone_number: c.phone_number ? Number(c.phone_number) || null : null,
                  broker_id: selectedBroker!.broker_id,
                }
                openCustomerLedger(customer)
              }} />
            </div>

            {loading && customers.length === 0 ? (
              <LoadingState />
            ) : customers.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 20px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "100%", boxSizing: "border-box" }}>
                <Icon icon="mdi:account-search" width={48} color="#d1d5db" />
                <p style={{ color: "#9ca3af", fontSize: 15, margin: "12px 0 0 0" }}>No chart records yet</p>
                <p style={{ color: "#9ca3af", fontSize: FONT_SIZE.sm, margin: "4px 0 0 0" }}>Search above to select a customer and start recording</p>
              </div>
            ) : viewMode === "card" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {customers.map(c => {
                  const bal = customerBalances[c.customer_id] || 0
                  return (
                    <div
                      key={c.customer_id}
                      onClick={() => openCustomerLedger(c)}
                      style={{
                        background: "white", borderRadius: 12, padding: "16px 18px",
                        border: "1px solid #e5e7eb", cursor: "pointer",
                        transition: "box-shadow 0.2s, border-color 0.2s",
                        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = "#0070f3"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,112,243,0.12)" }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.boxShadow = "none" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: "#f0fdf4", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <Icon icon="mdi:account" width={20} color="#16a34a" />
                        </div>
                        <div>
                          <span style={{ fontSize: FONT_SIZE.base, fontWeight: 600, color: "#171717" }}>{c.full_name}</span>
                          {c.phone_number && (
                            <div style={{ fontSize: FONT_SIZE.xs, color: "#6b7280", marginTop: 1 }}>{c.phone_number}</div>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        <span style={{ fontSize: FONT_SIZE.md, fontWeight: "bold", color: bal < 0 ? "#dc2626" : "#6b7280" }}>
                          ₦{formatAmount(String(Math.abs(bal))) || "0"}
                          {bal < 0 && <span style={{ fontSize: FONT_SIZE.xs, marginLeft: 2 }}>DR</span>}
                        </span>
                        <Icon icon="mdi:chevron-right" width={18} color="#9ca3af" />
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{ background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)", overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                      <th style={tblHeadStyle}>Customer</th>
                      <th style={tblHeadStyle}>Phone</th>
                      <th style={{ ...tblHeadStyle, textAlign: "right" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((c, idx) => (
                      <tr
                        key={c.customer_id}
                        onClick={() => openCustomerLedger(c)}
                        style={{ borderBottom: idx === customers.length - 1 ? "none" : "1px solid #e2e8f0", cursor: "pointer" }}
                        onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 8, background: "#f0fdf4", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <Icon icon="mdi:account" width={18} color="#16a34a" />
                            </div>
                            <span style={{ color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 500 }}>{c.full_name}</span>
                          </div>
                        </td>
                        <td style={{ padding: "12px 16px", color: "#64748b", fontSize: FONT_SIZE.sm }}>{c.phone_number || "—"}</td>
                        <td style={{ padding: "12px 16px", textAlign: "right" }}>
                          <Icon icon="mdi:chevron-right" width={16} color="#9ca3af" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Level 3: Customer Ledger */}
        {navLevel === "ledger" && selectedCustomer && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
              <h2 style={{ fontSize: FONT_SIZE.lg, color: "#171717", margin: 0 }}>Ledger</h2>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <button
                  onClick={() => selectedCustomer && fetchRecords(selectedCustomer.customer_id)}
                  disabled={loading}
                  style={{
                    padding: "8px 12px", background: "white", color: "#64748b", border: "1px solid #e2e8f0",
                    borderRadius: 8, cursor: loading ? "not-allowed" : "pointer", fontSize: FONT_SIZE.xs,
                    fontWeight: 500, minHeight: 40, minWidth: 40, display: "flex", alignItems: "center",
                    justifyContent: "center", transition: "all 0.2s", opacity: loading ? 0.5 : 1,
                  }}
                  title="Refresh"
                >
                  <Icon icon="mdi:refresh" width={16} style={{ animation: loading ? "spin 0.8s linear infinite" : "none" }} />
                </button>
                {records.length > 0 && (
                  <div style={{ display: "flex", background: "white", border: "1px solid #e2e8f0", borderRadius: 8, padding: 4, gap: 0 }}>
                    <button
                      onClick={() => setViewMode("card")}
                      style={{
                        padding: "8px 12px", background: viewMode === "card" ? "#0070f3" : "transparent",
                        color: viewMode === "card" ? "white" : "#64748b", border: "none", borderRadius: 6,
                        cursor: "pointer", fontSize: FONT_SIZE.xs, fontWeight: 600, transition: "all 0.2s ease",
                        minWidth: 44, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z"/></svg>
                    </button>
                    <button
                      onClick={() => setViewMode("table")}
                      style={{
                        padding: "8px 12px", background: viewMode === "table" ? "#0070f3" : "transparent",
                        color: viewMode === "table" ? "white" : "#64748b", border: "none", borderRadius: 6,
                        cursor: "pointer", fontSize: FONT_SIZE.xs, fontWeight: 600, transition: "all 0.2s ease",
                        minWidth: 44, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 4h18v2H3V4zm0 7h18v2H3v-2zm0 7h18v2H3v-2z"/></svg>
                    </button>
                  </div>
                )}
                <ExportActions onExportCSV={exportLedgerCSV} onExportXLSX={exportLedgerXLSX} disabled={records.length === 0} />
                <button
                  onClick={() => { if (!canEdit) return; openAddModal() }}
                  style={{ padding: "10px 18px", minHeight: 42, display: "flex", alignItems: "center", gap: 6, fontSize: 13, background: canEdit ? "#0070f3" : "#94a3b8", color: "white", border: "none", borderRadius: 8, cursor: canEdit ? "pointer" : "not-allowed", fontWeight: "bold" }}
                >
                  <Icon icon="mdi:plus" width={16} />
                  Add Record
                </button>
              </div>
            </div>

            {loading && records.length === 0 ? (
              <LoadingState />
            ) : records.length === 0 ? (
              <EmptyState message="No records yet — tap Add Record to file one" />
            ) : viewMode === "card" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {paginatedRecords.map(r => {
                  const balance = runningBalances[r.chart_id] || 0
                  const isCredit = r.record_type === "Credit"
                  const trip = r.trip_ref ? trips.find(t => t.trip_id === r.trip_ref) : null
                  return (
                    <div key={r.chart_id} style={{ background: "white", borderRadius: 12, padding: "16px 18px", border: "1px solid #e5e7eb", display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                          <div style={{
                            width: 36, height: 36, borderRadius: 8,
                            background: isCredit ? "#f0fdf4" : "#fff7ed",
                            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                          }}>
                            <Icon icon={isCredit ? "mdi:cash-plus" : "mdi:truck-delivery"} width={18} color={isCredit ? "#16a34a" : "#ea580c"} />
                          </div>
                          <div>
                            <span style={{
                              fontSize: FONT_SIZE.xs, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
                              background: isCredit ? "#dcfce7" : "#ffedd5",
                              color: isCredit ? "#166534" : "#9a3412",
                            }}>
                              {r.record_type}
                            </span>
                            <div style={{ fontSize: FONT_SIZE.sm, color: "#6b7280", marginTop: 2 }}>
                              {new Date(r.record_date).toLocaleDateString()}
                              {isCredit
                                ? <>{r.bank_name && ` • ${r.bank_name}`}{r.teller_no && ` • ${r.teller_no}`}</>
                                : <>{r.location && ` • ${r.location}`}{r.product && ` • ${r.product}`}</>
                              }
                            </div>
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: FONT_SIZE.md, fontWeight: "bold", color: isCredit ? "#16a34a" : "#dc2626" }}>
                              {isCredit ? "+" : "-"}₦{formatAmount(String(r.amount)) || "0"}
                            </div>
                            <div style={{ fontSize: FONT_SIZE.xs, color: balance < 0 ? "#dc2626" : "#6b7280", marginTop: 2 }}>
                              Bal: ₦{formatAmount(String(Math.abs(balance))) || "0"}{balance < 0 && " DR"}
                            </div>
                          </div>
                          {isAdmin && (
                            <div style={{ display: "flex", gap: 4 }}>
                              <button
                                onClick={(e) => { e.stopPropagation(); openUpdateModal(r) }}
                                disabled={submitting}
                                style={{ padding: 6, background: "none", border: "none", cursor: "pointer", color: "#64748b", borderRadius: 4 }}
                                title="Edit"
                              >
                                <Icon icon="mdi:pencil" width={16} />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDelete(r) }}
                                disabled={submitting}
                                style={{ padding: 6, background: "none", border: "none", cursor: "pointer", color: "#dc2626", borderRadius: 4 }}
                                title="Delete"
                              >
                                <Icon icon="mdi:trash-can-outline" width={16} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      {/* Sales details */}
                      {!isCredit && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, padding: "8px 0 0", borderTop: "1px solid #f1f5f9", fontSize: FONT_SIZE.sm, color: "#475569" }}>
                          {trip && <span>T/R: {formatTripLabel(trip)}</span>}
                          {r.quantity != null && <span>Qty: {r.quantity}</span>}
                          {r.rate != null && <span>Rate: ₦{formatAmount(String(r.rate))}</span>}
                          <span>Value: ₦{formatAmount(String(r.amount))}</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{ background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)", overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                      <th style={{ ...tblHeadStyle, borderRight: "1px solid #e2e8f0" }}>Date</th>
                      <th style={{ ...tblHeadStyle, borderRight: "1px solid #e2e8f0" }}>Type</th>
                      <th style={{ ...tblHeadStyle, borderRight: "1px solid #e2e8f0" }}>Bank</th>
                      <th style={{ ...tblHeadStyle, borderRight: "1px solid #e2e8f0" }}>Teller No.</th>
                      <th style={{ ...tblHeadStyle, borderRight: "1px solid #e2e8f0" }}>Location</th>
                      <th style={{ ...tblHeadStyle, borderRight: "1px solid #e2e8f0" }}>Product</th>
                      <th style={{ ...tblHeadStyle, borderRight: "1px solid #e2e8f0" }}>T/R</th>
                      <th style={{ ...tblHeadStyle, textAlign: "right", borderRight: "1px solid #e2e8f0" }}>Qty</th>
                      <th style={{ ...tblHeadStyle, textAlign: "right", borderRight: "1px solid #e2e8f0" }}>Rate</th>
                      <th style={{ ...tblHeadStyle, textAlign: "right", borderRight: "1px solid #e2e8f0" }}>Value</th>
                      <th style={{ ...tblHeadStyle, textAlign: "right", borderRight: "1px solid #e2e8f0" }}>Balance</th>
                      {isAdmin && <th style={{ ...tblHeadStyle, textAlign: "right" }}>Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRecords.map((r, idx) => {
                      const balance = runningBalances[r.chart_id] || 0
                      const isCredit = r.record_type === "Credit"
                      const trip = r.trip_ref ? trips.find(t => t.trip_id === r.trip_ref) : null
                      return (
                        <tr key={r.chart_id} style={{ borderBottom: idx === paginatedRecords.length - 1 ? "none" : "1px solid #e2e8f0" }}>
                          <td style={{ padding: "12px 16px", color: "#64748b", fontSize: FONT_SIZE.sm, borderRight: "1px solid #e2e8f0" }}>{new Date(r.record_date).toLocaleDateString()}</td>
                          <td style={{ padding: "12px 16px", borderRight: "1px solid #e2e8f0" }}>
                            <span style={{
                              fontSize: FONT_SIZE.xs, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
                              background: isCredit ? "#dcfce7" : "#ffedd5",
                              color: isCredit ? "#166534" : "#9a3412",
                            }}>
                              {r.record_type}
                            </span>
                          </td>
                          <td style={{ padding: "12px 16px", fontSize: FONT_SIZE.sm, color: "#475569", borderRight: "1px solid #e2e8f0" }}>
                            {isCredit ? r.bank_name || "—" : "—"}
                          </td>
                          <td style={{ padding: "12px 16px", fontSize: FONT_SIZE.sm, color: "#475569", borderRight: "1px solid #e2e8f0" }}>
                            {isCredit ? r.teller_no || "—" : "—"}
                          </td>
                          <td style={{ padding: "12px 16px", fontSize: FONT_SIZE.sm, color: "#475569", borderRight: "1px solid #e2e8f0" }}>
                            {isCredit ? "—" : r.location || "—"}
                          </td>
                          <td style={{ padding: "12px 16px", fontSize: FONT_SIZE.sm, color: "#475569", borderRight: "1px solid #e2e8f0" }}>
                            {isCredit ? "—" : r.product || "—"}
                          </td>
                          <td style={{ padding: "12px 16px", fontSize: FONT_SIZE.sm, color: "#475569", borderRight: "1px solid #e2e8f0" }}>
                            {isCredit ? "—" : trip ? formatTripRef(trip) : "—"}
                          </td>
                          <td style={{ padding: "12px 16px", fontSize: FONT_SIZE.sm, color: "#475569", textAlign: "right", borderRight: "1px solid #e2e8f0" }}>
                            {r.quantity != null ? r.quantity : "—"}
                          </td>
                          <td style={{ padding: "12px 16px", fontSize: FONT_SIZE.sm, color: "#475569", textAlign: "right", borderRight: "1px solid #e2e8f0" }}>
                            {r.rate != null ? `₦${formatAmount(String(r.rate))}` : "—"}
                          </td>
                          <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 600, color: "#171717", fontSize: FONT_SIZE.sm, borderRight: "1px solid #e2e8f0" }}>
                            {isCredit ? "+" : "-"}₦{formatAmount(String(r.amount)) || "0"}
                          </td>
                          <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 600, color: balance < 0 ? "#dc2626" : "#0070f3", fontSize: FONT_SIZE.sm, borderRight: "1px solid #e2e8f0" }}>
                            ₦{formatAmount(String(Math.abs(balance))) || "0"}{balance < 0 && " DR"}
                          </td>
                          {isAdmin && (
                            <td style={{ padding: "12px 16px", textAlign: "right" }}>
                              <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                                <button
                                  onClick={() => openUpdateModal(r)}
                                  disabled={submitting}
                                  style={{ padding: 6, background: "none", border: "none", cursor: "pointer", color: "#64748b", borderRadius: 4 }}
                                  title="Edit"
                                >
                                  <Icon icon="mdi:pencil" width={16} />
                                </button>
                                <button
                                  onClick={() => handleDelete(r)}
                                  disabled={submitting}
                                  style={{ padding: 6, background: "none", border: "none", cursor: "pointer", color: "#dc2626", borderRadius: 4 }}
                                  title="Delete"
                                >
                                  <Icon icon="mdi:trash-can-outline" width={16} />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <PaginationControls page={ledgerPage} totalPages={ledgerTotalPages} totalItems={totalRecords} onPageChange={setLedgerPage} />
          </>
        )}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <RecordModal
          isMobile={isMobile}
          recordType={recordType}
          setRecordType={setRecordType}
          recordDate={recordDate}
          setRecordDate={setRecordDate}
          bankName={bankName}
          setBankName={setBankName}
          tellerNo={tellerNo}
          setTellerNo={setTellerNo}
          amountInput={amountInput}
          setAmountInput={setAmountInput}
          location={location}
          setLocation={setLocation}
          product={product}
          setProduct={setProduct}
          selectedTrip={selectedTrip}
          setSelectedTrip={setSelectedTrip}
          tripSearch={tripSearch}
          setTripSearch={setTripSearch}
          tripDropOpen={tripDropOpen}
          setTripDropOpen={setTripDropOpen}
          filteredTrips={filteredTrips}
          formatTripLabel={formatTripLabel}
          quantity={quantity}
          setQuantity={setQuantity}
          rate={rate}
          setRateInput={setRateInput}
          computedValue={computedValue}
          errorMsg={errorMsg}
          submitting={submitting}
          canEdit={canEdit}
          onCancel={() => { setShowAddModal(false); setErrorMsg("") }}
          onSubmit={handleAdd}
          title={`Add Record — ${selectedCustomer?.full_name}`}
        />
      )}

      {/* Update Modal */}
      {showUpdateModal && updatingRecord && (
        <RecordModal
          isMobile={isMobile}
          recordType={recordType}
          setRecordType={setRecordType}
          recordDate={recordDate}
          setRecordDate={setRecordDate}
          bankName={bankName}
          setBankName={setBankName}
          tellerNo={tellerNo}
          setTellerNo={setTellerNo}
          amountInput={amountInput}
          setAmountInput={setAmountInput}
          location={location}
          setLocation={setLocation}
          product={product}
          setProduct={setProduct}
          selectedTrip={selectedTrip}
          setSelectedTrip={setSelectedTrip}
          tripSearch={tripSearch}
          setTripSearch={setTripSearch}
          tripDropOpen={tripDropOpen}
          setTripDropOpen={setTripDropOpen}
          filteredTrips={filteredTrips}
          formatTripLabel={formatTripLabel}
          quantity={quantity}
          setQuantity={setQuantity}
          rate={rate}
          setRateInput={setRateInput}
          computedValue={computedValue}
          errorMsg={errorMsg}
          submitting={submitting}
          canEdit={isAdmin}
          onCancel={() => { setShowUpdateModal(false); setUpdatingRecord(null); setErrorMsg("") }}
          onSubmit={handleUpdate}
          title="Update Record"
          isUpdate
        />
      )}

    </div>
  )
}

type ModalProps = {
  isMobile: boolean
  recordType: "Credit" | "Sales"
  setRecordType: (v: "Credit" | "Sales") => void
  recordDate: string
  setRecordDate: (v: string) => void
  bankName: string
  setBankName: (v: string) => void
  tellerNo: string
  setTellerNo: (v: string) => void
  amountInput: string
  setAmountInput: (v: string) => void
  location: string
  setLocation: (v: string) => void
  product: string
  setProduct: (v: string) => void
  selectedTrip: Trip | null
  setSelectedTrip: (v: Trip | null) => void
  tripSearch: string
  setTripSearch: (v: string) => void
  tripDropOpen: boolean
  setTripDropOpen: (v: boolean) => void
  filteredTrips: Trip[]
  formatTripLabel: (t: Trip) => string
  quantity: string
  setQuantity: (v: string) => void
  rate: string
  setRateInput: (v: string) => void
  computedValue: number
  errorMsg: string
  submitting: boolean
  canEdit: boolean
  onCancel: () => void
  onSubmit: () => void
  title: string
  isUpdate?: boolean
}

function RecordModal({
  isMobile, recordType, setRecordType, recordDate, setRecordDate,
  bankName, setBankName, tellerNo, setTellerNo, amountInput, setAmountInput,
  location, setLocation, product, setProduct, selectedTrip, setSelectedTrip,
  tripSearch, setTripSearch, tripDropOpen, setTripDropOpen, filteredTrips,
  formatTripLabel, quantity, setQuantity, rate, setRateInput, computedValue,
  errorMsg, submitting, canEdit, onCancel, onSubmit, title, isUpdate,
}: ModalProps) {
  const tellerRef = React.useRef<HTMLInputElement>(null)
  const amountRef = React.useRef<HTMLInputElement>(null)
  const locationRef = React.useRef<HTMLInputElement>(null)
  const quantityRef = React.useRef<HTMLInputElement>(null)
  const rateRef = React.useRef<HTMLInputElement>(null)

  const labelStyle: React.CSSProperties = { display: "block", fontSize: FONT_SIZE.sm, fontWeight: 600, color: "#374151", marginBottom: 6 }

  function handleEnter(e: React.KeyboardEvent, next?: React.RefObject<HTMLElement | null>) {
    if (e.key === "Enter") {
      e.preventDefault()
      next?.current?.focus()
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 100, padding: isMobile ? 0 : 16 }} onClick={onCancel}>
      <div style={{ background: "white", borderRadius: isMobile ? "20px 20px 0 0" : 16, padding: isMobile ? "24px 16px" : 24, width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: FONT_SIZE.lg, margin: 0, marginBottom: 20, color: "#171717" }}>{title}</h3>

        {/* Record Type Toggle */}
        <label style={labelStyle}>Record Type</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {(["Credit", "Sales"] as const).map(t => (
            <button
              key={t}
              onClick={() => setRecordType(t)}
              style={{
                flex: 1, padding: "10px 0", borderRadius: 8, border: `1.5px solid ${recordType === t ? (t === "Credit" ? "#16a34a" : "#ea580c") : "#e2e8f0"}`,
                background: recordType === t ? (t === "Credit" ? "#f0fdf4" : "#fff7ed") : "white",
                color: recordType === t ? (t === "Credit" ? "#166534" : "#9a3412") : "#64748b",
                cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.sm, transition: "all 0.2s",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Date */}
        <label style={labelStyle}>Date</label>
        <ModernInput
          type="date"
          value={recordDate}
          onChange={e => setRecordDate(e.target.value)}
          onKeyDown={e => handleEnter(e, recordType === "Credit" ? tellerRef : locationRef)}
          style={{ marginBottom: 16 }}
        />

        {/* Bank Details (Credit only) */}
        {recordType === "Credit" && (
          <>
            <label style={labelStyle}>Bank</label>
            <ModernInput
              as="select"
              value={bankName}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setBankName(e.target.value)}
              onKeyDown={e => handleEnter(e, tellerRef)}
              style={{ marginBottom: 16 }}
            >
              <option value="">Select bank</option>
              {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
            </ModernInput>

            <label style={labelStyle}>Teller No</label>
            <ModernInput
              ref={tellerRef}
              type="text"
              placeholder="e.g. 1234567890"
              value={tellerNo}
              onChange={e => setTellerNo(e.target.value)}
              onKeyDown={e => handleEnter(e, recordType === "Credit" ? amountRef : locationRef)}
              style={{ marginBottom: 16 }}
            />
          </>
        )}

        {/* Amount (for Credit) or Sales details */}
        {recordType === "Credit" ? (
          <>
            <label style={labelStyle}>Amount (₦)</label>
            <ModernInput
              ref={amountRef}
              type="text"
              placeholder="0"
              value={amountInput}
              onChange={e => setAmountInput(formatAmount(e.target.value))}
            />
          </>
        ) : (
          <>
            <label style={labelStyle}>Location</label>
            <ModernInput
              ref={locationRef}
              type="text"
              placeholder="e.g. Obubra"
              value={location}
              onChange={e => setLocation(e.target.value)}
              onKeyDown={e => handleEnter(e, quantityRef)}
              style={{ marginBottom: 16 }}
            />

            <label style={labelStyle}>Product</label>
            <ModernInput
              as="select"
              value={product}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setProduct(e.target.value)}
              style={{ marginBottom: 16 }}
            >
              <option value="">Select product</option>
              {PRODUCTS.map(p => <option key={p} value={p}>{p}</option>)}
            </ModernInput>

            {/* T/R Trip Selector */}
            <label style={labelStyle}>T/R (Trip Reference)</label>
            <div style={{ position: "relative", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", background: "white", border: "1.5px solid #d1d5db", borderRadius: 10, padding: "0 14px" }}>
                <Icon icon="mdi:truck" width={18} color="#94a3b8" style={{ flexShrink: 0 }} />
                <input
                  type="text"
                  placeholder="Search trips by plate, order, ATC..."
                  value={selectedTrip ? formatTripLabel(selectedTrip) : tripSearch}
                  onChange={e => { setTripSearch(e.target.value); setSelectedTrip(null); setTripDropOpen(true) }}
                  onFocus={() => setTripDropOpen(true)}
                  onBlur={() => setTimeout(() => setTripDropOpen(false), 200)}
                  style={{ border: "none", outline: "none", fontSize: FONT_SIZE.sm, flex: 1, padding: "12px 10px", background: "transparent", color: "#171717", minHeight: 48 }}
                />
                {(selectedTrip || tripSearch) && (
                  <button
                    onClick={() => { setSelectedTrip(null); setTripSearch("") }}
                    style={{ border: "none", background: "none", cursor: "pointer", color: "#94a3b8", padding: 0, lineHeight: 1, flexShrink: 0 }}
                  >
                    ✕
                  </button>
                )}
              </div>
              {tripDropOpen && !selectedTrip && (
                <ul style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "white", border: "1px solid #e2e8f0", borderRadius: 8, listStyle: "none", margin: 0, padding: 4, maxHeight: 200, overflowY: "auto", zIndex: 50, boxShadow: "0 4px 16px rgba(0,0,0,0.1)" }}>
                  {filteredTrips.length === 0 ? (
                    <li style={{ padding: "8px 12px", fontSize: FONT_SIZE.sm, color: "#bbb" }}>No trips found</li>
                  ) : filteredTrips.slice(0, 50).map(t => (
                    <li
                      key={t.trip_id}
                      onMouseDown={() => { setSelectedTrip(t); setTripSearch(formatTripLabel(t)); setTripDropOpen(false) }}
                      style={{ padding: "8px 12px", cursor: "pointer", fontSize: FONT_SIZE.sm, color: "#333", borderRadius: 6 }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#f5f5f5")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      {formatTripLabel(t)}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>Quantity</label>
                <ModernInput
                  ref={quantityRef}
                  type="text"
                  placeholder="0"
                  value={quantity}
                  onChange={e => setQuantity(formatAmount(e.target.value))}
                  onKeyDown={e => handleEnter(e, rateRef)}
                />
              </div>
              <div>
                <label style={labelStyle}>Rate (₦)</label>
                <ModernInput
                  ref={rateRef}
                  type="text"
                  placeholder="0"
                  value={rate}
                  onChange={e => setRateInput(formatAmount(e.target.value))}
                />
              </div>
            </div>

            <div style={{ padding: "12px 14px", background: "#f8fafc", borderRadius: 8, marginBottom: 8 }}>
              <span style={{ fontSize: FONT_SIZE.sm, color: "#64748b" }}>Value (Qty × Rate): </span>
              <span style={{ fontSize: FONT_SIZE.md, fontWeight: 700, color: "#0f172a" }}>₦{formatAmount(String(computedValue)) || "0"}</span>
            </div>
          </>
        )}

        {errorMsg && <p style={{ color: "#dc2626", fontSize: FONT_SIZE.sm, margin: "12px 0 0 0" }}>{errorMsg}</p>}

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "12px 0", background: "white", border: "1.5px solid #d1d5db", borderRadius: 8, cursor: "pointer", fontSize: 14, minHeight: 48 }}>Cancel</button>
          <button
            onClick={onSubmit}
            disabled={submitting || !canEdit}
            style={{ flex: 1, padding: "12px 0", background: submitting || !canEdit ? "#94a3b8" : "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: submitting || !canEdit ? "not-allowed" : "pointer", fontWeight: "bold", fontSize: 14, minHeight: 48, opacity: submitting ? 0.7 : 1 }}
          >
            {submitting ? (isUpdate ? "Updating..." : "Adding...") : (isUpdate ? "Update" : "Add Record")}
          </button>
        </div>
      </div>
    </div>
  )
}

function LoadingState() {
  return (
    <div style={{ textAlign: "center", padding: "60px 0" }}>
      <div style={{ width: 36, height: 36, border: "3px solid #e5e7eb", borderTopColor: "#0070f3", borderRadius: "50%", margin: "0 auto 12px", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <p style={{ color: "#9ca3af", fontSize: 14, margin: 0 }}>Loading...</p>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ textAlign: "center", padding: "60px 20px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "100%", boxSizing: "border-box" }}>
      <Icon icon="mdi:chart-line-variant" width={48} color="#d1d5db" />
      <p style={{ color: "#9ca3af", fontSize: 15, margin: "12px 0 0 0" }}>{message}</p>
    </div>
  )
}
