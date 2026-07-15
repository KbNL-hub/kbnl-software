"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { apiMutate } from "@/lib/api-mutation"
import RoleSwitcher from "@/components/RoleSwitcher"
import { formatAmount, parseAmount } from "@/lib/formatAmount"
import { Icon } from "@iconify/react"
import CustomerSelector from "@/components/CustomerSelector"
import ReportModal from "@/components/ReportModal"
import ModernInput from "@/components/ModernInput"
import ProfilePictureUpload from "@/components/ProfilePictureUpload"
import { FONT_SIZE, POLLING_INTERVAL } from "@/lib/constants"
  import { saleDateWithTime } from "@/lib/date-utils"
  import dayjs from "dayjs"
import { useBreakpoint } from "@/app/hooks/useBreakpoint"
import { requireDashboardRole } from "@/lib/auth-helpers"
import { Role } from "@/lib/roles"
import { formatDateTime, formatDate, formatTime } from "@/lib/date-utils"
import { useStops } from "@/lib/hooks/useStops"

type Officer = { officer_id: string; full_name: string; store_name: string; profile_picture_url?: string }

type PendingStop = {
  stop_id: string
  plate_number: string
  driver_name: string
  quantity_offloaded: number
  stop_time: string
  trip_id: string
}

type StockBalance = {
  product: string
  balance: number
}

type Sale = {
  sale_id: string
  product: string
  quantity: number
  price_per_bag: number | null
  total_amount: number | null
  customer_name: string | null
  payment_mode: string
  delivery_mode: string
  tricycle_number: string | null
  truck_plate: string | null
  sold_at: string
  created_at: string
  broker_id: string | null
  broker_name?: string | null
  status: string
}

type GroupedSale = {
  group_id: string
  customer_name: string | null
  payment_mode: string
  delivery_mode: string
  tricycle_number: string | null
  truck_plate: string | null
  sold_at: string
  broker_id: string | null
  broker_name?: string | null
  status: string
  lines: Sale[]
}

type Broker = { broker_id: string; broker_name: string }

type SupplyLine = { product: string; quantity: string }
type SaleLine = { product: string; quantity: string; price_per_bag: string }

const PAYMENT_MODES = ["Cash", "Transfer", "POS", "Broker"]

export default function StoreOfficerDashboard() {
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"
  const router = useRouter()

  const [officer, setOfficer] = useState<Officer | null>(null)
  const [pendingStops, setPendingStops] = useState<PendingStop[]>([])
  const [stopsFilter, setStopsFilter] = useState<{ store_name: string; pending: boolean } | null>(null)
  const { data: stopsFromHook, refetch: refetchStops } = useStops(stopsFilter ?? undefined)
  useEffect(() => { setPendingStops(stopsFromHook as PendingStop[]); setLastUpdated(new Date()) }, [stopsFromHook])
  const [stock, setStock] = useState<StockBalance[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<"supply" | "sales" | "stock">("supply")
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const [supplyPage, setSupplyPage] = useState(1)
  const [salesPage, setSalesPage] = useState(1)
  const PAGE_SIZE = 50
  const [confirmingStop, setConfirmingStop] = useState<PendingStop | null>(null)
  const [supplyLines, setSupplyLines] = useState<SupplyLine[]>([{ product: "", quantity: "" }])
  const [confirmError, setConfirmError] = useState("")
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [allProducts, setAllProducts] = useState<string[]>([])

  const [showSaleModal, setShowSaleModal] = useState(false)
  const [saleLines, setSaleLines] = useState<SaleLine[]>([{ product: "", quantity: "", price_per_bag: "" }])
  const [saleCustomer, setSaleCustomer] = useState<{ full_name: string } | null>(null)
  const [salePayment, setSalePayment] = useState("")
  const [saleError, setSaleError] = useState("")
  const [saleLoading, setSaleLoading] = useState(false)
  const [deliveryMode, setDeliveryMode] = useState<"self" | "tricycle" | "truck">("self")
  const [tricycles, setTricycles] = useState<{ tricycle_id: string; tricycle_number: string }[]>([])
  const [saleTricycleId, setSaleTricycleId] = useState("")
  const [tricycleSearch, setTricycleSearch] = useState("")
  const [tricycleDropOpen, setTricycleDropOpen] = useState(false)
  const [trucks, setTrucks] = useState<{ plate_number: string; kbnl_truck_no: string | null; truck_model: string | null }[]>([])
  const [saleTruckPlate, setSaleTruckPlate] = useState("")
  const [truckSearch, setTruckSearch] = useState("")
  const [truckDropOpen, setTruckDropOpen] = useState(false)
  const [brokers, setBrokers] = useState<Broker[]>([])
  const [saleBroker, setSaleBroker] = useState<Broker | null>(null)
  const [brokerSearch, setBrokerSearch] = useState("")
  const [brokerDropOpen, setBrokerDropOpen] = useState(false)
  const [isBrokerLinked, setIsBrokerLinked] = useState(false)
  const [saleDate, setSaleDate] = useState(dayjs().format("YYYY-MM-DD"))

  const [updatedStockProducts, setUpdatedStockProducts] = useState<string[]>([])
  const [salesFilter, setSalesFilter] = useState("All")
  const [salesDateFilter, setSalesDateFilter] = useState("")
  const [salesSortByAdded, setSalesSortByAdded] = useState(true)

  const [showPictureModal, setShowPictureModal] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push("/login"); return }

    const hasRole = await requireDashboardRole(session.user.id, Role.StoreOfficer)
    if (!hasRole) { router.push("/login"); return }

    const { data: profile } = await supabase
      .from("Profiles").select("full_name").eq("user_id", session.user.id).single()

    let storeName = ""
    let officerId = session.user.id

    if (profile) {
      const { data: officerData } = await supabase
        .from("store_officers")
        .select("officer_id, full_name, store_name, profile_picture_url")
        .eq("officer_id", session.user.id)
        .single()

      if (officerData) {
        setOfficer(officerData)
        storeName = officerData.store_name
        officerId = officerData.officer_id
      } else {
        setOfficer({ officer_id: session.user.id, full_name: profile.full_name, store_name: "" })
      }
    }

    const { data: productsData } = await supabase.rpc("get_products")
    if (productsData) setAllProducts(productsData.map((r: { value: string }) => r.value))
    if (storeName) setStopsFilter({ store_name: storeName, pending: true })

    await Promise.all([
      fetchStock(storeName),
      fetchSales(officerId),
      fetchTricycles(),
      fetchTrucks(),
      fetchBrokers(),
    ])
    setLoading(false)
  }

  useEffect(() => {
    if (!officer) return
    const interval = setInterval(() => {
      refetchStops()
      fetchStock(officer.store_name)
      setLastUpdated(new Date())
    }, POLLING_INTERVAL)
    return () => clearInterval(interval)
  }, [officer])

  async function fetchStock(storeName: string) {
    const { data } = await supabase
      .from("store_stock")
      .select("product, balance")
      .eq("store_name", storeName)
      .order("product", { ascending: true })
    setStock(data || [])
  }

  async function fetchSales(officerId: string) {
    const { data } = await supabase
      .from("store_sales")
      .select("sale_id, product, quantity, price_per_bag, total_amount, customer_name, payment_mode, delivery_mode, tricycle_id, truck_plate, sold_at, created_at, broker_id, status")
      .eq("officer_id", officerId)
      .order("sold_at", { ascending: false })

    if (!data) { setSales([]); return }

    const tricycleIds = [...new Set(data.map(s => s.tricycle_id).filter(Boolean))]
    const brokerIds = [...new Set(data.map(s => s.broker_id).filter(Boolean))]

    const [{ data: tricycles }, { data: brokers }] = await Promise.all([
      tricycleIds.length ? supabase.from("tricycles").select("tricycle_id, tricycle_number").in("tricycle_id", tricycleIds) : Promise.resolve({ data: [] }),
      brokerIds.length ? supabase.from("Brokers").select("broker_id, broker_name").in("broker_id", brokerIds) : Promise.resolve({ data: [] }),
    ])

    const tricycleMap = Object.fromEntries((tricycles || []).map(t => [t.tricycle_id, t.tricycle_number]))
    const brokerMap = Object.fromEntries((brokers || []).map(b => [b.broker_id, b.broker_name]))

    const enriched = data.map(s => ({
      ...s,
      tricycle_number: s.tricycle_id ? (tricycleMap[s.tricycle_id] ?? null) : null,
      broker_name: s.broker_id ? (brokerMap[s.broker_id] ?? null) : null,
    }))

    setSales(enriched)
  }

  async function fetchTricycles() {
    const { data } = await supabase
      .from("tricycles")
      .select("tricycle_id, tricycle_number")
      .order("tricycle_number", { ascending: true })
    setTricycles(data || [])
  }

  async function fetchTrucks() {
    const { data } = await supabase
      .from("Trucks")
      .select("plate_number, kbnl_truck_no, truck_model")
      .order("plate_number", { ascending: true })
    setTrucks(data || [])
  }

  async function fetchBrokers() {
    const { data } = await supabase
      .from("Brokers")
      .select("broker_id, broker_name")
      .order("broker_name", { ascending: true })
    setBrokers(data || [])
  }

  function addSupplyLine() {
    setSupplyLines([...supplyLines, { product: "", quantity: "" }])
  }

  function removeSupplyLine(index: number) {
    if (supplyLines.length === 1) return
    setSupplyLines(supplyLines.filter((_, i) => i !== index))
  }

  function updateSupplyLine(index: number, field: "product" | "quantity", value: string) {
    setSupplyLines(supplyLines.map((l, i) => i === index ? { ...l, [field]: value } : l))
    setConfirmError("")
  }

  async function handleConfirmSupply() {
    if (!confirmingStop || !officer) return

    const totalInLines = supplyLines.reduce((sum, l) => sum + (parseInt(l.quantity) || 0), 0)
    if (supplyLines.some(l => !l.product)) return setConfirmError("Select a product for each line")
    if (supplyLines.some(l => !l.quantity || parseInt(l.quantity) <= 0)) return setConfirmError("Enter a valid quantity for each line")
    if (totalInLines !== confirmingStop.quantity_offloaded) return setConfirmError(`Total (${totalInLines}) must equal ${confirmingStop.quantity_offloaded}`)

    const products = supplyLines.map(l => l.product)
    if (new Set(products).size !== products.length) return setConfirmError("Duplicate products — merge them")

    setConfirmLoading(true)

    const { data: confirmation, error: confError } = await apiMutate("finance", {
      action: "insert", table: "store_supply_confirmations",
      data: { stop_id: confirmingStop.stop_id, officer_id: officer.officer_id, store_name: officer.store_name },
    })

    if (confError || !confirmation) { setConfirmError("Failed to confirm supply"); setConfirmLoading(false); return }
    const confData = Array.isArray(confirmation) ? confirmation[0] : confirmation

    for (const line of supplyLines) {
      const { error: linesError } = await apiMutate("finance", {
        action: "insert", table: "store_supply_lines",
        data: { confirmation_id: confData.confirmation_id, product: line.product, quantity: parseInt(line.quantity) },
      })
      if (linesError) { setConfirmError("Supply confirmed but product lines failed"); setConfirmLoading(false); return }
    }

    const { error: stopError } = await apiMutate("trips", {
      action: "update", table: "Stops", data: { confirmed: true }, filters: { stop_id: confirmingStop.stop_id },
    })
    if (stopError) {
      setConfirmError("Supply and lines saved but stop update failed. Contact support.")
      setConfirmLoading(false)
      return
    }

    for (const line of supplyLines) {
      const qty = parseInt(line.quantity)
      const { data: existing } = await supabase
        .from("store_stock")
        .select("balance")
        .eq("store_name", officer.store_name)
        .eq("product", line.product)
        .single()

      if (existing) {
        const { error: stockError } = await apiMutate("finance", {
          action: "update", table: "store_stock",
          data: { balance: existing.balance + qty, updated_at: new Date().toISOString() },
          filters: { store_name: officer.store_name, product: line.product },
        })
        if (stockError) {
          setConfirmError("Supply confirmed but stock update failed. Contact support.")
          setConfirmLoading(false)
          return
        }
      } else {
        const { error: stockError } = await apiMutate("finance", {
          action: "insert", table: "store_stock",
          data: { store_name: officer.store_name, product: line.product, balance: qty },
        })
        if (stockError) {
          setConfirmError("Supply confirmed but stock insert failed. Contact support.")
          setConfirmLoading(false)
          return
        }
      }
    }

    setConfirmLoading(false)
    setConfirmingStop(null)
    setSupplyLines([{ product: "", quantity: "" }])
    setConfirmError("")
    await Promise.all([
      refetchStops(),
      fetchStock(officer.store_name),
    ])
    setUpdatedStockProducts(supplyLines.map(l => l.product))
    setTimeout(() => setUpdatedStockProducts([]), 3000)
  }

  function addSaleLine() {
    setSaleLines([...saleLines, { product: "", quantity: "", price_per_bag: "" }])
  }

  function removeSaleLine(index: number) {
    if (saleLines.length === 1) return
    setSaleLines(saleLines.filter((_, i) => i !== index))
  }

  function updateSaleLine(index: number, field: "product" | "quantity" | "price_per_bag", value: string) {
    setSaleLines(saleLines.map((l, i) => i === index ? { ...l, [field]: value } : l))
    setSaleError("")
  }

  async function handleLogSale() {
    if (!officer) return

    if (saleLines.some(l => !l.product)) return setSaleError("Select a product for each line")
    if (saleLines.some(l => !l.quantity || parseInt(l.quantity) <= 0)) return setSaleError("Enter a valid quantity for each line")

    const saleProducts = saleLines.map(l => l.product)
    if (new Set(saleProducts).size !== saleProducts.length) return setSaleError("Duplicate products — merge them")

    if (!salePayment) return setSaleError("Select a payment mode")
    if (deliveryMode === "tricycle" && !saleTricycleId) return setSaleError("Select a tricycle")
    if (deliveryMode === "truck" && !saleTruckPlate) return setSaleError("Select a truck")
    if (!saleDate) return setSaleError("Select a sale date")

    if (isBrokerLinked) {
      if (!saleBroker) return setSaleError("Select a broker")
    }
    if (!isBrokerLinked) {
      if (saleLines.some(l => !l.price_per_bag)) return setSaleError("Enter a price per bag for each line")
      if (saleLines.some(l => parseAmount(l.price_per_bag) <= 0)) return setSaleError("Enter valid prices")
    }

    const insufficientStock = saleLines.find(line => {
      const stockItem = stock.find(s => s.product === line.product)
      const qty = parseInt(line.quantity)
      return !stockItem || stockItem.balance < qty
    })

    if (insufficientStock) {
      const stockItem = stock.find(s => s.product === insufficientStock.product)
      return setSaleError(`Insufficient ${insufficientStock.product} — only ${stockItem?.balance ?? 0} bags available`)
    }

    setSaleLoading(true)

    try {
      const salesToInsert = saleLines.map(line => ({
        officer_id: officer.officer_id,
        store_name: officer.store_name,
        product: line.product,
        quantity: parseInt(line.quantity),
        price_per_bag: isBrokerLinked ? null : parseAmount(line.price_per_bag),
        customer_name: saleCustomer?.full_name.trim() || null,
        payment_mode: salePayment,
        delivery_mode: deliveryMode,
        tricycle_id: deliveryMode === "tricycle" ? saleTricycleId : null,
        truck_plate: deliveryMode === "truck" ? saleTruckPlate : null,
        broker_id: isBrokerLinked ? saleBroker?.broker_id : null,
        status: isBrokerLinked ? "Pending" : "Confirmed",
        sold_at: saleDateWithTime(saleDate),
      }))

      let saleErr: string | null = null
      for (const sale of salesToInsert) {
        const { error } = await apiMutate("finance", {
          action: "insert", table: "store_sales", data: sale,
        })
        if (error) { saleErr = error; break }
      }
      if (saleErr) {
        setSaleError("Failed to log sales")
        setSaleLoading(false)
        return
      }

      for (const line of saleLines) {
        const qty = parseInt(line.quantity)
        const { error: stockError } = await apiMutate("finance", {
          action: "rpc",
          function: "decrement_store_stock",
          params: { p_store: officer.store_name, p_product: line.product, p_qty: qty },
        })
        if (stockError) {
          setSaleError(stockError === "insufficient_stock" ? `Insufficient ${line.product} stock` : "Sale logged but stock deduction failed. Contact support.")
          setSaleLoading(false)
          return
        }
      }

      setSaleLoading(false)
      setShowSaleModal(false)
      setSaleLines([{ product: "", quantity: "", price_per_bag: "" }])
      setSaleCustomer(null)
      setSalePayment("")
      setSaleError("")
      setDeliveryMode("self")
      setSaleTricycleId("")
      setTricycleSearch("")
      setSaleTruckPlate("")
      setTruckSearch("")
      setIsBrokerLinked(false)
      setSaleBroker(null)
      setBrokerSearch("")
      setSaleDate(new Date().toISOString().split("T")[0])

      await Promise.all([fetchSales(officer.officer_id), fetchStock(officer.store_name)])
    } catch (err) {
      setSaleError("An error occurred")
      setSaleLoading(false)
    }
  }

  const groupedSales = sales.reduce<GroupedSale[]>((groups, sale) => {
    const groupId = [
      sale.sold_at.split("T")[0],
      sale.customer_name ?? "",
      sale.payment_mode,
      sale.delivery_mode,
      sale.tricycle_number ?? "",
      sale.broker_id ?? "",
      sale.status,
    ].join("|")
    const existing = groups.find(group => group.group_id === groupId)

    if (existing) {
      existing.lines.push(sale)
      return groups
    }

    groups.push({
      group_id: groupId,
      customer_name: sale.customer_name,
      payment_mode: sale.payment_mode,
      delivery_mode: sale.delivery_mode,
      tricycle_number: sale.tricycle_number,
      truck_plate: sale.truck_plate,
      sold_at: sale.sold_at,
      broker_id: sale.broker_id,
      broker_name: sale.broker_name,
      status: sale.status,
      lines: [sale],
    })
    return groups
  }, [])

  const salesSortOptions = [
    { label: "Most recent added", value: true },
    { label: "By sale date", value: false },
  ] as const

  const filteredSales = groupedSales.filter(s => {
    if (salesFilter !== "All" && s.payment_mode !== salesFilter) return false
    if (salesDateFilter) {
      const saleDate = s.sold_at.split("T")[0]
      if (saleDate !== salesDateFilter) return false
    }
    return true
  })
  .sort((a, b) => {
    if (salesSortByAdded) {
      const aCreated = a.lines[0]?.created_at || a.sold_at
      const bCreated = b.lines[0]?.created_at || b.sold_at
      return bCreated.localeCompare(aCreated)
    } else {
      return b.sold_at.split("T")[0].localeCompare(a.sold_at.split("T")[0])
    }
  })
  const paymentFilters = PAYMENT_MODES.filter(mode => sales.some(sale => sale.payment_mode === mode))

  const getStatusColor = (status: string) => {
    switch(status) {
      case "Pending": return "#f5a623"
      case "Confirmed": return "#10b981"
      case "Rejected": return "#ef4444"
      default: return "#64748b"
    }
  }

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "'Inter', sans-serif" }}>
      <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid #e2e8f0", borderTopColor: "#0070f3", animation: "spin 1s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }
@keyframes pulseGlow { 0%, 100% { box-shadow: 0 0 5px rgba(16, 185, 129, 0.3); border-color: #6ee7b7; } 50% { box-shadow: 0 0 20px rgba(16, 185, 129, 0.6); border-color: #34d399; } }`}</style>
    </div>
  )

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "'Inter', sans-serif" }}>

      {/* Profile Banner */}
      <div style={{ background: "white", borderBottom: "1px solid #e2e8f0", padding: isMobile ? "16px" : "24px 32px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", gap: isMobile ? 12 : 16, justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 12 : 16, flex: 1 }}>
            <div
              onClick={() => setShowPictureModal(true)}
              style={{
                width: isMobile ? 48 : 56,
                height: isMobile ? 48 : 56,
                borderRadius: "50%",
                background: officer?.profile_picture_url ? "transparent" : "#f0f7ff",
                border: "2px solid #bfdbfe",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                cursor: "pointer",
                position: "relative",
                overflow: "hidden",
                transition: "all 0.2s",
              }}
            >
              {officer?.profile_picture_url ? (
                <img
                  src={officer.profile_picture_url}
                  alt={officer.full_name}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <span style={{ fontSize: isMobile ? 20 : 24, fontWeight: 700, color: "#0070f3" }}>
                  {officer?.full_name.charAt(0).toUpperCase()}
                </span>
              )}
              <div
                style={{
                  position: "absolute", inset: 0, background: "rgba(0, 0, 0, 0.4)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  opacity: 0, transition: "opacity 0.2s",
                }}
              >
                <Icon icon="mdi:camera" width={20} height={20} color="white" />
              </div>
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: isMobile ? FONT_SIZE.lg : FONT_SIZE.xl, fontWeight: 700, color: "#0070f3" }}>
                {officer?.full_name}
              </h1>
              <RoleSwitcher currentRole={Role.StoreOfficer} style={{ margin: "2px 0 0", fontSize: FONT_SIZE.sm, color: "#64748b" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setShowReportModal(true)}
              style={{ padding: "8px 14px", background: "#fff8e1", color: "#f5a623", border: "1.5px solid #f8ad5c", borderRadius: 8, cursor: "pointer", fontSize: FONT_SIZE.sm, minHeight: 40, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s", whiteSpace: "nowrap" }}
            >
              <Icon icon="mdi:alert-circle-outline" width={16} />
              {!isMobile && "Report"}
            </button>
            <button
              onClick={async () => { await supabase.auth.signOut(); router.push("/login") }}
              style={{ padding: "8px 16px", background: "rgba(239, 68, 68, 0.05)", color: "#ef4444", border: "1.5px solid #fecaca", borderRadius: 6, cursor: "pointer", fontSize: FONT_SIZE.sm, fontWeight: 600, transition: "all 0.2s", minHeight: 40, whiteSpace: "nowrap" }}
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding: isMobile ? "16px" : "32px", maxWidth: 1200, margin: "0 auto" }}>

        {/* Stock Summary */}
        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: isMobile ? 16 : 24, marginBottom: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: FONT_SIZE.lg, color: "#0f172a" }}>Stock Balance</p>
            <p style={{ margin: 0, fontWeight: 700, fontSize: FONT_SIZE.lg, color: "#0f172a" }}>
              Total: <span style={{ color: "#0070f3" }}>{stock.reduce((sum, s) => sum + s.balance, 0).toLocaleString()}</span> <span style={{ fontSize: FONT_SIZE.sm, fontWeight: 500, color: "#64748b" }}>bags</span>
            </p>
          </div>
          {stock.length === 0
            ? <p style={{ color: "#64748b", fontSize: FONT_SIZE.base, margin: 0 }}>No stock recorded yet.</p>
            : (
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
                {stock.map(s => {
                  const isUpdated = updatedStockProducts.includes(s.product)
                  return (
                  <div key={s.product} style={{
                    background: "#f0f7ff",
                    border: `1.5px solid ${isUpdated ? "#6ee7b7" : "#bfdbfe"}`,
                    borderRadius: 8,
                    padding: "12px 14px",
                    animation: isUpdated ? "pulseGlow 0.6s ease 3" : undefined,
                    transition: "box-shadow 0.3s, border-color 0.3s",
                  }}>
                    <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#64748b" }}>{s.product}</p>
                    <p style={{ margin: "6px 0 0", fontWeight: 700, fontSize: FONT_SIZE["2xl"], color: s.balance === 0 ? "#ef4444" : s.balance < 50 ? "#f5a623" : "#0070f3" }}>
                      {s.balance}<span style={{ fontSize: FONT_SIZE.xs, fontWeight: 500, color: "#64748b", marginLeft: 4 }}>bags</span>
                    </p>
                  </div>
                  )
                })}
              </div>
            )
          }
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
          {(["supply", "sales", "stock"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "8px 16px",
                borderRadius: 6,
                fontSize: FONT_SIZE.sm,
                cursor: "pointer",
                border: `1.5px solid ${tab === t ? "" : "#e2e8f0"}`,
                background: tab === t ? "#171717" : "white",
                color: tab === t ? "white" : "#64748b",
                fontWeight: tab === t ? 600 : 500,
                transition: "all 0.2s",
                position: "relative",
                minHeight: 40,
              }}
            >
              {t === "supply" ? "Supplies" : t === "sales" ? "Sales" : "Stock"}
              {t === "supply" && pendingStops.length > 0 && (
                <span style={{
                  position: "absolute", top: -8, right: -8,
                  background: "#ef4444", color: "white", borderRadius: "50%",
                  width: 20, height: 20, fontSize: FONT_SIZE.xs, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center"
                }}>
                  {pendingStops.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Supply Tab */}
        {tab === "supply" && (
          <div>
            <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 12, marginBottom: 16 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: FONT_SIZE.lg, color: "#0f172a" }}>Pending Supplies ({pendingStops.length})</p>
              <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>
                {lastUpdated && `Updated: ${formatTime(lastUpdated)}`}
                <button onClick={refetchStops} style={{ padding: "6px 12px", fontSize: FONT_SIZE.xs, cursor: "pointer", borderRadius: 6, border: "1px solid #e2e8f0", background: "white", color: "#64748b", transition: "all 0.2s" }}>
                  Refresh
                </button>
              </div>
            </div>

            {pendingStops.length === 0 && <p style={{ color: "#64748b", fontSize: FONT_SIZE.base }}>No pending supplies.</p>}

            {pendingStops.length > PAGE_SIZE && (
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 16 }}>
                <button disabled={supplyPage <= 1} onClick={() => setSupplyPage(p => Math.max(1, p - 1))} style={{ padding: "6px 14px", background: supplyPage <= 1 ? "#f0f0f0" : "white", border: "1px solid #e2e8f0", borderRadius: 8, cursor: supplyPage <= 1 ? "not-allowed" : "pointer", fontSize: FONT_SIZE.xs, color: supplyPage <= 1 ? "#ccc" : "#64748b" }}>
                  ← Previous
                </button>
                <span style={{ display: "flex", alignItems: "center", fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Page {supplyPage} of {Math.ceil(pendingStops.length / PAGE_SIZE)}</span>
                <button disabled={supplyPage >= Math.ceil(pendingStops.length / PAGE_SIZE)} onClick={() => setSupplyPage(p => p + 1)} style={{ padding: "6px 14px", background: supplyPage >= Math.ceil(pendingStops.length / PAGE_SIZE) ? "#f0f0f0" : "white", border: "1px solid #e2e8f0", borderRadius: 8, cursor: supplyPage >= Math.ceil(pendingStops.length / PAGE_SIZE) ? "not-allowed" : "pointer", fontSize: FONT_SIZE.xs, color: supplyPage >= Math.ceil(pendingStops.length / PAGE_SIZE) ? "#ccc" : "#64748b" }}>
                  Next →
                </button>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {pendingStops.slice(0, supplyPage * PAGE_SIZE).map(stop => (
                <div key={stop.stop_id} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: FONT_SIZE.lg, color: "#0f172a" }}>{stop.plate_number}</p>
                      <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.sm, color: "#64748b" }}>{stop.driver_name}</p>
                      <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>{formatDateTime(stop.stop_time)}</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ margin: "0 0 4px 0", fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Bags delivered</p>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: FONT_SIZE["2xl"], color: "#0070f3" }}>{stop.quantity_offloaded}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setConfirmingStop(stop); setSupplyLines([{ product: "", quantity: "" }]); setConfirmError("") }}
                    style={{ width: "100%", padding: "10px 14px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, minHeight: 44 }}
                  >
                    Confirm Supply
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sales Tab */}
        {tab === "sales" && (
          <div>
            <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 12, marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  onClick={() => setSalesSortByAdded(!salesSortByAdded)}
                  style={{
                    padding: "8px 12px", borderRadius: 8, fontSize: FONT_SIZE.xs, cursor: "pointer",
                    border: `1.5px solid #e2e8f0`, background: "white", color: "#64748b",
                    fontWeight: 500, minHeight: 40, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 4,
                  }}
                >
                  <Icon icon={salesSortByAdded ? "mdi:clock-outline" : "mdi:calendar"} width={14} />
                  {salesSortByAdded ? "By date added" : "By sale date"}
                </button>
                <input
                  type="date"
                  value={salesDateFilter}
                  onChange={e => setSalesDateFilter(e.target.value)}
                  style={{ padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${salesDateFilter ? "#0070f3" : "#e2e8f0"}`, fontSize: FONT_SIZE.sm, minHeight: 40, outline: "none", cursor: "pointer", background: salesDateFilter ? "rgba(0, 112, 243, 0.05)" : "white", color: "#0f172a" }}
                />
                {salesDateFilter && (
                  <button onClick={() => setSalesDateFilter("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: FONT_SIZE.sm, padding: "4px 8px", fontWeight: 600 }}>
                    ✕ Clear
                  </button>
                )}
                {["All", ...paymentFilters].map(f => (
                  <button
                    key={f}
                    onClick={() => setSalesFilter(f)}
                    style={{
                      padding: "8px 14px", borderRadius: 20, fontSize: FONT_SIZE.sm, cursor: "pointer",
                      border: `1.5px solid ${salesFilter === f ? "#0070f3" : "#e2e8f0"}`,
                      background: salesFilter === f ? "rgba(0, 112, 243, 0.1)" : "white",
                      color: salesFilter === f ? "#0070f3" : "#64748b",
                      fontWeight: salesFilter === f ? 600 : 500, minHeight: 40,
                    }}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <button
                onClick={() => { setShowSaleModal(true); setSaleError(""); setIsBrokerLinked(false); setSaleBroker(null) }}
                style={{ padding: "8px 16px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, minHeight: 40, whiteSpace: "nowrap" }}
              >
                + Log Sale
              </button>
            </div>

            {filteredSales.length === 0 && <p style={{ color: "#64748b", fontSize: FONT_SIZE.base }}>No sales logged yet.</p>}

            {filteredSales.length > PAGE_SIZE && (
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 16 }}>
                <button disabled={salesPage <= 1} onClick={() => setSalesPage(p => Math.max(1, p - 1))} style={{ padding: "6px 14px", background: salesPage <= 1 ? "#f0f0f0" : "white", border: "1px solid #e2e8f0", borderRadius: 8, cursor: salesPage <= 1 ? "not-allowed" : "pointer", fontSize: FONT_SIZE.xs, color: salesPage <= 1 ? "#ccc" : "#64748b" }}>
                  ← Previous
                </button>
                <span style={{ display: "flex", alignItems: "center", fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Page {salesPage} of {Math.ceil(filteredSales.length / PAGE_SIZE)}</span>
                <button disabled={salesPage >= Math.ceil(filteredSales.length / PAGE_SIZE)} onClick={() => setSalesPage(p => p + 1)} style={{ padding: "6px 14px", background: salesPage >= Math.ceil(filteredSales.length / PAGE_SIZE) ? "#f0f0f0" : "white", border: "1px solid #e2e8f0", borderRadius: 8, cursor: salesPage >= Math.ceil(filteredSales.length / PAGE_SIZE) ? "not-allowed" : "pointer", fontSize: FONT_SIZE.xs, color: salesPage >= Math.ceil(filteredSales.length / PAGE_SIZE) ? "#ccc" : "#64748b" }}>
                  Next →
                </button>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {filteredSales.slice(0, salesPage * PAGE_SIZE).map(sale => {
                const totalAmount = sale.lines.reduce((sum, line) => sum + (line.total_amount ?? 0), 0)
                const hasBrokerPricing = sale.lines.some(line => line.price_per_bag === null)

                return (
                <div key={sale.group_id} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: FONT_SIZE.lg, color: "#0f172a" }}>
                        {sale.lines.length === 1 ? sale.lines[0].product : `${sale.lines.length} products`}
                      </p>
                      {sale.customer_name && <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.sm, color: "#64748b" }}>{sale.customer_name}</p>}
                      {sale.broker_name && <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.sm, color: "#0070f3", fontWeight: 500 }}>Broker: {sale.broker_name}</p>}
                      <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>{formatDateTime(sale.sold_at)}</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {!hasBrokerPricing ? (
                        <>
                          <p style={{ margin: 0, fontWeight: 700, fontSize: FONT_SIZE.lg, color: "#16a34a" }}>₦{totalAmount.toLocaleString()}</p>
                          <span style={{ fontSize: FONT_SIZE.xs, padding: "3px 8px", borderRadius: 6, background: "#f0f7ff", color: "#0070f3", fontWeight: 600, display: "inline-block", marginTop: 4 }}>{sale.payment_mode}</span>
                        </>
                      ) : (
                        <>
                          <p style={{ margin: 0, fontWeight: 700, fontSize: FONT_SIZE.lg, color: "#94a3b8", fontStyle: "italic" }}>Provided by broker</p>
                          <span style={{ fontSize: FONT_SIZE.xs, padding: "3px 8px", borderRadius: 6, background: "#f0f7ff", color: "#0070f3", fontWeight: 600, display: "inline-block", marginTop: 4 }}>{sale.payment_mode}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {sale.broker_id && (
                    <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px", marginBottom: 10, border: "1px solid #e2e8f0" }}>
                      <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Status</p>
                      <span style={{
                        fontSize: FONT_SIZE.xs, padding: "4px 10px", borderRadius: 6,
                        background: sale.status === "Pending" ? "#fffbeb" : sale.status === "Confirmed" ? "#ecfdf5" : "#fef2f2",
                        color: getStatusColor(sale.status), fontWeight: 600, display: "inline-block", marginTop: 4,
                      }}>
                        {sale.status}
                      </span>
                    </div>
                  )}

                  {(() => {
                    const deliveryModeConfig: Record<string, { label: string; icon: string; bg: string; border: string; color: string }> = {
                      self: { label: "Self", icon: "mdi:account", bg: "#f0fdf4", border: "#bbf7d0", color: "#16a34a" },
                      tricycle: { label: sale.tricycle_number || "Tricycle", icon: "mdi:rickshaw", bg: "#eff6ff", border: "#bfdbfe", color: "#0070f3" },
                      truck: { label: sale.truck_plate || "Truck", icon: "mdi:truck", bg: "#fefce8", border: "#fde68a", color: "#ca8a04" },
                    }
                    const cfg = deliveryModeConfig[sale.delivery_mode]
                    if (!cfg) return null
                    return (
                      <div style={{ background: cfg.bg, borderRadius: 8, padding: "10px 12px", marginBottom: 10, border: `1px solid ${cfg.border}` }}>
                        <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Delivery Mode</p>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                          <Icon icon={cfg.icon} width={18} height={18} color={cfg.color} />
                          <p style={{ margin: 0, fontWeight: 600, fontSize: FONT_SIZE.base, color: cfg.color }}>{cfg.label}</p>
                        </div>
                      </div>
                    )
                  })()}

                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {sale.lines.map(line => (
                      <div key={line.sale_id} style={{ display: "grid", gridTemplateColumns: line.price_per_bag !== null ? "1.4fr 0.7fr 0.9fr" : "1.4fr 0.7fr", gap: 8 }}>
                        <div style={{ background: "#f8fafc", borderRadius: 8, padding: "8px 12px" }}>
                          <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Product</p>
                          <p style={{ margin: "2px 0 0", fontWeight: 600, fontSize: FONT_SIZE.base, color: "#0f172a" }}>{line.product}</p>
                        </div>
                        <div style={{ background: "#f8fafc", borderRadius: 8, padding: "8px 12px" }}>
                          <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Bags</p>
                          <p style={{ margin: "2px 0 0", fontWeight: 600, fontSize: FONT_SIZE.base, color: "#0f172a" }}>{line.quantity}</p>
                        </div>
                        {line.price_per_bag !== null && (
                          <div style={{ background: "#f8fafc", borderRadius: 8, padding: "8px 12px" }}>
                            <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Price/Bag</p>
                            <p style={{ margin: "2px 0 0", fontWeight: 600, fontSize: FONT_SIZE.base, color: "#0f172a" }}>₦{line.price_per_bag.toLocaleString()}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Stock Tab */}
        {tab === "stock" && (
          <div>
            <p style={{ margin: "0 0 16px 0", fontWeight: 700, fontSize: FONT_SIZE.lg, color: "#0f172a" }}>Current Stock</p>
            {stock.length === 0 && <p style={{ color: "#64748b", fontSize: FONT_SIZE.base }}>No stock data yet.</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {stock.map(s => (
                <div key={s.product} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: FONT_SIZE.lg, color: "#0f172a" }}>{s.product}</p>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: FONT_SIZE.lg, color: s.balance === 0 ? "#ef4444" : s.balance < 50 ? "#f5a623" : "#0070f3" }}>
                    {s.balance} <span style={{ fontSize: FONT_SIZE.sm, fontWeight: 500, color: "#64748b", marginLeft: 4 }}>bags</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Confirm Supply Modal */}
      {confirmingStop && (
        <div onClick={() => { setConfirmingStop(null); setSupplyLines([{ product: "", quantity: "" }]); setConfirmError("") }} style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 100, padding: isMobile ? 0 : 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: isMobile ? "20px 20px 0 0" : 12, padding: isMobile ? "28px 20px" : 32, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)" }}>
            <h3 style={{ margin: "0 0 6px 0", fontSize: FONT_SIZE.xl, fontWeight: 700, color: "#0f172a" }}>Confirm Supply</h3>
            <p style={{ color: "#94a3b8", fontSize: FONT_SIZE.sm, margin: "0 0 4px 0" }}>
              {confirmingStop.plate_number} · {confirmingStop.driver_name}
            </p>
            <p style={{ color: "#64748b", fontSize: FONT_SIZE.sm, margin: "0 0 20px 0" }}>
              Total: <strong>{confirmingStop.quantity_offloaded} bags</strong>
            </p>

            <p style={{ fontWeight: 700, fontSize: FONT_SIZE.base, margin: "0 0 4px 0", color: "#0f172a" }}>Breakdown by Product *</p>
            <p style={{ fontSize: FONT_SIZE.xs, color: "#94a3b8", margin: "0 0 12px 0" }}>Total must equal bags delivered</p>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {supplyLines.map((line, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", width: "100%" }}>
                  <ModernInput
                    as="select"
                    value={line.product}
                    onChange={e => updateSupplyLine(i, "product", e.target.value)}
                    style={{ flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: 6, border: "1px solid #e0e0e0", fontSize: FONT_SIZE.sm, boxSizing: "border-box" }}
                  >
                    <option value="">Select product</option>
                    {allProducts.map(p => (<option key={p} value={p}>{p}</option>))}
                  </ModernInput>
                  <ModernInput
                    type="number"
                    placeholder="Qty"
                    value={line.quantity}
                    onChange={e => updateSupplyLine(i, "quantity", e.target.value)}
                    onKeyDown={(e: any) => { if (e.key === "-" || e.key === "e") e.preventDefault() }}
                    style={{ flex: 1, width: isMobile ? 90 : 110, flexShrink: 0, padding: "10px 12px", borderRadius: 6, border: "1px solid #e0e0e0", fontSize: FONT_SIZE.sm, boxSizing: "border-box" }}
                  />
                  {supplyLines.length > 1 && (
                    <button onClick={() => removeSupplyLine(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 18, lineHeight: 1, padding: 0, width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                  )}
                </div>
              ))}
            </div>

            <div style={{ padding: "8px 12px", background: "#f8fafc", borderRadius: 6, marginBottom: 16, border: "1px solid #e2e8f0" }}>
              <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#0f172a" }}>
                Total entered: <strong style={{ color: supplyLines.reduce((s, l) => s + (parseInt(l.quantity) || 0), 0) === confirmingStop.quantity_offloaded ? "#16a34a" : "#f5a623" }}>
                  {supplyLines.reduce((s, l) => s + (parseInt(l.quantity) || 0), 0)}
                </strong> / {confirmingStop.quantity_offloaded}
              </p>
            </div>

            <button onClick={addSupplyLine} style={{ width: "100%", padding: "8px 12px", background: "white", border: "1px dashed #0070f3", color: "#0070f3", borderRadius: 6, cursor: "pointer", fontSize: FONT_SIZE.sm, fontWeight: 600, marginBottom: 20, minHeight: 40 }}>
              + Add Product Line
            </button>

            {confirmError && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 16, color: "#b91c1c", fontSize: FONT_SIZE.sm }}>{confirmError}</div>}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => { setConfirmingStop(null); setSupplyLines([{ product: "", quantity: "" }]); setConfirmError("") }} style={{ padding: "12px 16px", background: "white", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, minHeight: 44 }}>Cancel</button>
              <button onClick={handleConfirmSupply} disabled={confirmLoading} style={{ padding: "12px 16px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: confirmLoading ? "not-allowed" : "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, opacity: confirmLoading ? 0.7 : 1, minHeight: 44 }}>
                {confirmLoading ? "Confirming..." : "Confirm Supply"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Log Sale Modal */}
      {showSaleModal && (
        <div onClick={() => { 
          setShowSaleModal(false)
          setSaleLines([{ product: "", quantity: "", price_per_bag: "" }])
          setSaleCustomer(null)
          setSalePayment("")
          setSaleError("")
          setDeliveryMode("self")
          setSaleTricycleId("")
          setTricycleSearch("")
          setSaleTruckPlate("")
          setTruckSearch("")
          setIsBrokerLinked(false)
          setSaleBroker(null)
          setBrokerSearch("")
          setSaleDate(new Date().toISOString().split("T")[0])
        }} style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 100, padding: isMobile ? 0 : 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: isMobile ? "20px 20px 0 0" : 12, padding: isMobile ? "28px 20px" : 32, width: "100%", maxWidth: 600, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)" }}>
            <h3 style={{ margin: "0 0 20px 0", fontSize: FONT_SIZE.xl, fontWeight: 700, color: "#0f172a" }}>Log Sales</h3>

            {/* Broker Linked Toggle */}
            <div style={{ marginBottom: 20, padding: "12px", background: "#f0f7ff", borderRadius: 8, border: "1px solid #bfdbfe" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={isBrokerLinked}
                  onChange={e => { setIsBrokerLinked(e.target.checked); setSaleBroker(null); setSaleError("") }}
                  style={{ width: 18, height: 18, cursor: "pointer" }}
                />
                <span style={{ margin: "4px 0 0", fontWeight: 600, color: "#0070f3", fontSize: FONT_SIZE.sm }}>Broker-linked sales</span>
              </label>
              <p style={{ margin: "6px 0 0", fontSize: FONT_SIZE.xs, color: "#64748b" }}>
                {isBrokerLinked ? "Broker will provide the prices" : ""}
              </p>
            </div>

            {/* Products Section */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <label style={{ fontWeight: 700, fontSize: FONT_SIZE.base, color: "#0f172a" }}>Products *</label>
                <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>{saleLines.length} product(s)</p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
                {saleLines.map((line, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "2fr 1fr " + (isBrokerLinked ? "0fr" : "1fr") + " auto", gap: 8, alignItems: "center" }}>
                    <ModernInput
                      as="select"
                      value={line.product}
                      onChange={e => updateSaleLine(i, "product", e.target.value)}
                      style={{ padding: "10px 12px", borderRadius: 6, border: "1px solid #e0e0e0", fontSize: FONT_SIZE.sm, boxSizing: "border-box", minHeight: 44 }}
                    >
                      <option value="">Select product</option>
                      {stock.filter(s => s.balance > 0).map(s => (
                        <option key={s.product} value={s.product}>{s.product} ({s.balance})</option>
                      ))}
                    </ModernInput>

                    <ModernInput
                      type="number"
                      placeholder="Qty"
                      value={line.quantity}
                      onChange={e => updateSaleLine(i, "quantity", e.target.value)}
                      style={{ padding: "10px 12px", borderRadius: 6, border: "1px solid #e0e0e0", fontSize: FONT_SIZE.sm, boxSizing: "border-box", minHeight: 44 }}
                    />

                    {!isBrokerLinked && (
                      <ModernInput
                        type="text"
                        inputMode="numeric"
                        placeholder="Price per bag"
                        value={line.price_per_bag}
                        onChange={e => updateSaleLine(i, "price_per_bag", formatAmount(e.target.value))}
                        style={{ padding: "10px 12px", borderRadius: 6, border: "1px solid #e0e0e0", fontSize: FONT_SIZE.sm, boxSizing: "border-box", minHeight: 44 }}
                      />
                    )}

                    {saleLines.length > 1 && (
                      <button onClick={() => removeSaleLine(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 18, lineHeight: 1, padding: 0, width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                    )}
                  </div>
                ))}
              </div>

              <button onClick={addSaleLine} style={{ width: "100%", padding: "8px 12px", background: "white", border: "1px dashed #0070f3", color: "#0070f3", borderRadius: 6, cursor: "pointer", fontSize: FONT_SIZE.sm, fontWeight: 600, minHeight: 40 }}>
                + Add Another Product
              </button>
            </div>

            {/* Broker Selection */}
            {isBrokerLinked && (
              <div style={{ marginBottom: 16, position: "relative" }}>
                <label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: FONT_SIZE.sm, color: "#475569" }}>Broker *</label>
                {brokers.length === 0
                  ? <p style={{ fontSize: FONT_SIZE.sm, color: "#94a3b8", margin: 0 }}>No brokers available.</p>
                  : (
                    <div style={{ position: "relative" }}>
                      <ModernInput
                        type="text"
                        placeholder="Search broker…"
                        value={brokerSearch}
                        onChange={e => { setBrokerSearch(e.target.value); setBrokerDropOpen(true) }}
                        onFocus={() => setBrokerDropOpen(true)}
                        onBlur={() => setTimeout(() => setBrokerDropOpen(false), 150)}
                        style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid #e0e0e0", fontSize: FONT_SIZE.base, boxSizing: "border-box", minHeight: 44 }}
                      />
                      {brokerDropOpen && (
                        <ul style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "white", border: "1px solid #e2e8f0", borderRadius: 8, listStyle: "none", margin: 0, padding: 4, maxHeight: 200, overflowY: "auto", zIndex: 50, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
                          {brokers
                            .filter(b => b.broker_name.toLowerCase().includes(brokerSearch.toLowerCase()))
                            .map(b => (
                              <li
                                key={b.broker_id}
                                onMouseDown={() => { setSaleBroker(b); setBrokerSearch(b.broker_name); setBrokerDropOpen(false); setSaleError("") }}
                                style={{ padding: "10px 12px", cursor: "pointer", fontSize: FONT_SIZE.base, background: saleBroker?.broker_id === b.broker_id ? "#eff6ff" : "white", borderRadius: 6 }}
                              >
                                {b.broker_name}
                              </li>
                            ))}
                        </ul>
                      )}
                    </div>
                  )
                }
                {saleBroker && (
                  <div style={{ marginTop: 8, padding: "8px 12px", background: "#eff6ff", borderRadius: 6, fontSize: FONT_SIZE.sm, color: "#0070f3", fontWeight: 500 }}>
                    Selected: {saleBroker.broker_name}
                  </div>
                )}
              </div>
            )}

            {/* Customer Name */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: FONT_SIZE.sm, color: "#475569" }}>Customer Name <span style={{ fontWeight: 400, color: "#94a3b8" }}>(optional)</span></label>
              <CustomerSelector 
                onSelect={(c: any) => { setSaleCustomer(c); setSaleError("") }} 
                allowUnsavedNew={true}
                initialValue={saleCustomer?.full_name || ""}
              />
              {saleCustomer && (
                <div style={{ marginTop: 8, padding: "8px 12px", background: "#eff6ff", borderRadius: 6, fontSize: FONT_SIZE.sm, color: "#0070f3", fontWeight: 500 }}>
                  Selected: {saleCustomer.full_name}
                </div>
              )}
            </div>

            {/* Delivery Mode */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: FONT_SIZE.sm, color: "#475569" }}>Delivery Mode</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                {(["self", "tricycle", "truck"] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => { setDeliveryMode(type); setSaleTricycleId(""); setSaleTruckPlate(""); setTruckSearch(""); setSaleError("") }}
                    style={{
                      padding: "10px 12px", borderRadius: 8, cursor: "pointer",
                      border: `1.5px solid ${deliveryMode === type ? "#0070f3" : "#e2e8f0"}`,
                      background: deliveryMode === type ? "#0070f3" : "white",
                      color: deliveryMode === type ? "white" : "#64748b",
                      fontWeight: deliveryMode === type ? 600 : 500, fontSize: FONT_SIZE.sm, minHeight: 44,
                    }}
                  >
                    {type === "self" ? "Self" : type === "truck" ? "Truck" : "Tricycle"}
                  </button>
                ))}
              </div>
            </div>

            {/* Tricycle Selection */}
            {deliveryMode === "tricycle" && (
              <div style={{ marginBottom: 16, position: "relative" }}>
                <label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: FONT_SIZE.sm, color: "#475569" }}>Tricycle *</label>
                {tricycles.length === 0
                  ? <p style={{ fontSize: FONT_SIZE.sm, color: "#94a3b8", margin: 0 }}>No tricycles available.</p>
                  : (
                    <div style={{ position: "relative" }}>
                      <ModernInput
                        type="text"
                        placeholder="Search tricycle…"
                        value={tricycleSearch}
                        onChange={e => { setTricycleSearch(e.target.value); setTricycleDropOpen(true) }}
                        onFocus={() => setTricycleDropOpen(true)}
                        onBlur={() => setTimeout(() => setTricycleDropOpen(false), 150)}
                        style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid #e0e0e0", fontSize: FONT_SIZE.base, boxSizing: "border-box", minHeight: 44 }}
                      />
                      {tricycleDropOpen && (
                        <ul style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "white", border: "1px solid #e2e8f0", borderRadius: 8, listStyle: "none", margin: 0, padding: 4, maxHeight: 200, overflowY: "auto", zIndex: 50, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
                          {tricycles
                            .filter(t => t.tricycle_number.toLowerCase().includes(tricycleSearch.toLowerCase()))
                            .map(t => (
                              <li
                                key={t.tricycle_id}
                                onMouseDown={() => { setSaleTricycleId(t.tricycle_id); setTricycleSearch(t.tricycle_number); setTricycleDropOpen(false); setSaleError("") }}
                                style={{ padding: "10px 12px", cursor: "pointer", fontSize: FONT_SIZE.base, background: saleTricycleId === t.tricycle_id ? "#eff6ff" : "white", borderRadius: 6 }}
                              >
                                {t.tricycle_number}
                              </li>
                            ))}
                        </ul>
                      )}
                    </div>
                  )
                }
              </div>
            )}

            {/* Truck Selection */}
            {deliveryMode === "truck" && (
              <div style={{ marginBottom: 16, position: "relative" }}>
                <label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: FONT_SIZE.sm, color: "#475569" }}>Truck *</label>
                {trucks.length === 0
                  ? <p style={{ fontSize: FONT_SIZE.sm, color: "#94a3b8", margin: 0 }}>No trucks available.</p>
                  : (
                    <div style={{ position: "relative" }}>
                      <ModernInput
                        type="text"
                        placeholder="Search truck…"
                        value={truckSearch}
                        onChange={e => { setTruckSearch(e.target.value); setTruckDropOpen(true) }}
                        onFocus={() => setTruckDropOpen(true)}
                        onBlur={() => setTimeout(() => setTruckDropOpen(false), 150)}
                        style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid #e0e0e0", fontSize: FONT_SIZE.base, boxSizing: "border-box", minHeight: 44 }}
                      />
                      {truckDropOpen && (
                        <ul style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "white", border: "1px solid #e2e8f0", borderRadius: 8, listStyle: "none", margin: 0, padding: 4, maxHeight: 200, overflowY: "auto", zIndex: 50, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
                          {trucks
                            .filter(t => t.plate_number.toLowerCase().includes(truckSearch.toLowerCase()) || (t.kbnl_truck_no || "").toLowerCase().includes(truckSearch.toLowerCase()))
                            .map(t => (
                              <li
                                key={t.plate_number}
                                onMouseDown={() => { setSaleTruckPlate(t.plate_number); setTruckSearch(`${t.plate_number}${t.kbnl_truck_no ? ` · #${t.kbnl_truck_no}` : ""}`); setTruckDropOpen(false); setSaleError("") }}
                                style={{ padding: "10px 12px", cursor: "pointer", fontSize: FONT_SIZE.base, background: saleTruckPlate === t.plate_number ? "#eff6ff" : "white", borderRadius: 6 }}
                              >
                                {t.plate_number}{t.kbnl_truck_no ? ` · #${t.kbnl_truck_no}` : ""}
                              </li>
                            ))}
                        </ul>
                      )}
                    </div>
                  )
                }
                {saleTruckPlate && (
                  <div style={{ marginTop: 8, padding: "8px 12px", background: "#fefce8", borderRadius: 6, fontSize: FONT_SIZE.sm, color: "#ca8a04", fontWeight: 500, border: "1px solid #fde68a" }}>
                    Selected: {saleTruckPlate}
                  </div>
                )}
              </div>
            )}

            {/* Sale Date */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: FONT_SIZE.sm, color: "#475569" }}>Date of Sale</label>
              <ModernInput
                type="date"
                value={saleDate}
                onChange={e => { setSaleDate(e.target.value); setSaleError("") }}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid #e0e0e0", fontSize: FONT_SIZE.base, boxSizing: "border-box", minHeight: 44 }}
              />
            </div>

            {/* Payment Mode */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: FONT_SIZE.sm, color: "#475569" }}>Payment Mode *</label>
              <ModernInput
                as="select"
                value={salePayment}
                onChange={e => { setSalePayment(e.target.value); setSaleError("") }}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid #e0e0e0", fontSize: FONT_SIZE.base, boxSizing: "border-box", minHeight: 44 }}
              >
                <option value="">Select payment mode</option>
                {PAYMENT_MODES.map(m => (<option key={m} value={m}>{m}</option>))}
              </ModernInput>
            </div>

            {saleError && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 16, color: "#b91c1c", fontSize: FONT_SIZE.sm }}>{saleError}</div>}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => { 
                setShowSaleModal(false)
                setSaleLines([{ product: "", quantity: "", price_per_bag: "" }])
                setSaleCustomer(null)
                setSalePayment("")
                setSaleError("")
                setDeliveryMode("self")
                setSaleTricycleId("")
                setTricycleSearch("")
                setSaleTruckPlate("")
                setTruckSearch("")
                setIsBrokerLinked(false)
                setSaleBroker(null)
                setBrokerSearch("")
                setSaleDate(dayjs().format("YYYY-MM-DD"))
              }} style={{ padding: "12px 16px", background: "white", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, minHeight: 44 }}>Cancel</button>
              <button onClick={handleLogSale} disabled={saleLoading} style={{ padding: "12px 16px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: saleLoading ? "not-allowed" : "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, opacity: saleLoading ? 0.7 : 1, minHeight: 44 }}>
                {saleLoading ? "Logging..." : `Log ${saleLines.filter(l => l.product).length} Sale(s)`}
              </button>
            </div>
          </div>
        </div>
      )}

      <ProfilePictureUpload
        isOpen={showPictureModal}
        onClose={() => setShowPictureModal(false)}
        userId={officer?.officer_id || ""}
        table="store_officers"
        idField="officer_id"
        currentUrl={officer?.profile_picture_url}
        onSuccess={(url) => setOfficer(prev => prev ? { ...prev, profile_picture_url: url } : prev)}
      />

      <ReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        userId={officer?.officer_id || ""}
        userRole={Role.StoreOfficer}
      />
    </div>
  )
}
