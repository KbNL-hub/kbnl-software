"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { formatAmount, parseAmount } from "@/lib/formatAmount"
import { Icon } from "@iconify/react"
import CustomerSelector from "@/components/CustomerSelector"
import ModernInput from "@/components/ModernInput"

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
  sale_type: string
  tricycle_number: string | null
  sold_at: string
  broker_id: string | null
  broker_name?: string | null
  status: string
}

type GroupedSale = {
  group_id: string
  customer_name: string | null
  payment_mode: string
  sale_type: string
  tricycle_number: string | null
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

const fontSize = {
  xs: 12,
  sm: 13,
  base: 14,
  md: 15,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 28
}

export default function StoreOfficerDashboard() {
  const { isMobile } = useBreakpoint()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [officer, setOfficer] = useState<Officer | null>(null)
  const [pendingStops, setPendingStops] = useState<PendingStop[]>([])
  const [stock, setStock] = useState<StockBalance[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<"supply" | "sales" | "stock">("supply")
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

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
  const [saleType, setSaleType] = useState<"self" | "tricycle" | "truck">("self")
  const [tricycles, setTricycles] = useState<{ tricycle_id: string; tricycle_number: string }[]>([])
  const [saleTricycleId, setSaleTricycleId] = useState("")
  const [tricycleSearch, setTricycleSearch] = useState("")
  const [tricycleDropOpen, setTricycleDropOpen] = useState(false)
  const [brokers, setBrokers] = useState<Broker[]>([])
  const [saleBroker, setSaleBroker] = useState<Broker | null>(null)
  const [brokerSearch, setBrokerSearch] = useState("")
  const [brokerDropOpen, setBrokerDropOpen] = useState(false)
  const [isBrokerLinked, setIsBrokerLinked] = useState(false)
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split("T")[0])

  const [salesFilter, setSalesFilter] = useState("All")

  // Profile picture upload states
  const [showPictureModal, setShowPictureModal] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [picturePreview, setPicturePreview] = useState<string | null>(null)
  const [pictureLoading, setPictureLoading] = useState(false)
  const [pictureError, setPictureError] = useState("")

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.push("/login")
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push("/login"); return }

    const { data: profile } = await supabase
      .from("Profiles").select("role").eq("user_id", session.user.id).single()
    if (profile?.role !== "StoreOfficer") { router.push("/login"); return }

    const { data: officerData } = await supabase
      .from("store_officers")
      .select("officer_id, full_name, store_name, profile_picture_url")
      .eq("officer_id", session.user.id)
      .single()
    if (!officerData) { router.push("/login"); return }

    setOfficer(officerData)

    const { data: productsData } = await supabase.rpc("get_products")
    if (productsData) setAllProducts(productsData.map((r: { value: string }) => r.value))

    await Promise.all([
      fetchPendingStops(officerData.store_name),
      fetchStock(officerData.store_name),
      fetchSales(officerData.officer_id),
      fetchTricycles(),
      fetchBrokers(),
    ])
    setLoading(false)
  }

  useEffect(() => {
    if (!officer) return
    const interval = setInterval(() => {
      fetchPendingStops(officer.store_name)
      fetchStock(officer.store_name)
      setLastUpdated(new Date())
    }, 30000)
    return () => clearInterval(interval)
  }, [officer])

  async function fetchPendingStops(storeName: string) {
    const { data: stops } = await supabase
      .from("Stops")
      .select("stop_id, trip_id, quantity_offloaded, stop_time, stop_location")
      .eq("stop_location", storeName)
      .eq("confirmed", false)
      .eq("disputed", false)
      .order("stop_time", { ascending: false })

    if (!stops) return

    const enriched = await Promise.all(stops.map(async (s) => {
      const { data: trip } = await supabase
        .from("Trips").select("plate_number, driver_id").eq("trip_id", s.trip_id).single()
      const { data: driver } = trip?.driver_id
        ? await supabase.from("Drivers").select("full_name").eq("driver_id", trip.driver_id).single()
        : { data: null }

      return {
        stop_id: s.stop_id,
        trip_id: s.trip_id,
        plate_number: trip?.plate_number ?? "Unknown",
        driver_name: (driver as any)?.full_name ?? "Unknown",
        quantity_offloaded: s.quantity_offloaded,
        stop_time: s.stop_time,
      }
    }))

    setPendingStops(enriched)
    setLastUpdated(new Date())
  }

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
      .select("sale_id, product, quantity, price_per_bag, total_amount, customer_name, payment_mode, sale_type, tricycle_id, sold_at, broker_id, status")
      .eq("officer_id", officerId)
      .order("sold_at", { ascending: false })

    if (!data) return

    const enriched = await Promise.all(data.map(async s => {
      let tricycle_number: string | null = null
      let broker_name: string | null = null

      if (s.tricycle_id) {
        const { data: t } = await supabase
          .from("tricycles").select("tricycle_number").eq("tricycle_id", s.tricycle_id).single()
        tricycle_number = t?.tricycle_number ?? null
      }

      if (s.broker_id) {
        const { data: b } = await supabase
          .from("Brokers").select("broker_name").eq("broker_id", s.broker_id).single()
        broker_name = b?.broker_name ?? null
      }

      return { ...s, tricycle_number, broker_name }
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

    const { data: confirmation, error: confError } = await supabase
      .from("store_supply_confirmations")
      .insert([{
        stop_id: confirmingStop.stop_id,
        officer_id: officer.officer_id,
        store_name: officer.store_name,
      }])
      .select()
      .single()

    if (confError || !confirmation) { setConfirmError("Failed to confirm supply"); setConfirmLoading(false); return }

    const { error: linesError } = await supabase
      .from("store_supply_lines")
      .insert(supplyLines.map(l => ({
        confirmation_id: confirmation.confirmation_id,
        product: l.product,
        quantity: parseInt(l.quantity),
      })))

    if (linesError) { setConfirmError("Supply confirmed but product lines failed"); setConfirmLoading(false); return }

    await supabase.from("Stops").update({ confirmed: true }).eq("stop_id", confirmingStop.stop_id)

    for (const line of supplyLines) {
      const qty = parseInt(line.quantity)
      const { data: existing } = await supabase
        .from("store_stock")
        .select("balance")
        .eq("store_name", officer.store_name)
        .eq("product", line.product)
        .single()

      if (existing) {
        await supabase
          .from("store_stock")
          .update({ balance: existing.balance + qty, updated_at: new Date().toISOString() })
          .eq("store_name", officer.store_name)
          .eq("product", line.product)
      } else {
        await supabase
          .from("store_stock")
          .insert([{ store_name: officer.store_name, product: line.product, balance: qty }])
      }
    }

    setConfirmLoading(false)
    setConfirmingStop(null)
    setSupplyLines([{ product: "", quantity: "" }])
    setConfirmError("")
    await Promise.all([
      fetchPendingStops(officer.store_name),
      fetchStock(officer.store_name),
    ])
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
  
    // Validate lines
    if (saleLines.some(l => !l.product)) return setSaleError("Select a product for each line")
    if (saleLines.some(l => !l.quantity || parseInt(l.quantity) <= 0)) return setSaleError("Enter a valid quantity for each line")
    
    if (!salePayment) return setSaleError("Select a payment mode")
    if (saleType === "tricycle" && !saleTricycleId) return setSaleError("Select a tricycle")
    if (!saleDate) return setSaleError("Select a sale date")

    // Broker-linked validation
    if (isBrokerLinked) {
      if (!saleBroker) return setSaleError("Select a broker")
    }
    // Self / Truck / non-broker tricycle: all lines must have price
    if (!isBrokerLinked) {
      if (saleLines.some(l => !l.price_per_bag)) return setSaleError("Enter a price per bag for each line")
      if (saleLines.some(l => parseAmount(l.price_per_bag) <= 0)) return setSaleError("Enter valid prices")
    }
  
    // Check stock for all products
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
      // Insert one row per product line
      const salesToInsert = saleLines.map(line => ({
        officer_id: officer.officer_id,
        store_name: officer.store_name,
        product: line.product,
        quantity: parseInt(line.quantity),
        price_per_bag: isBrokerLinked ? null : parseAmount(line.price_per_bag),
        customer_name: saleCustomer?.full_name.trim() || null,
        payment_mode: salePayment,
        sale_type: saleType,
        tricycle_id: saleType === "tricycle" ? saleTricycleId : null,
        broker_id: isBrokerLinked ? saleBroker?.broker_id : null,
        status: isBrokerLinked ? "Pending" : "Confirmed",
        sold_at: saleDate,
      }))
  
      const { error: saleErr } = await supabase.from("store_sales").insert(salesToInsert)
      if (saleErr) {
        setSaleError("Failed to log sales")
        setSaleLoading(false)
        return
      }
  
      // Deduct stock for each product
      for (const line of saleLines) {
        const stockItem = stock.find(s => s.product === line.product)
        if (!stockItem) continue
  
        const qty = parseInt(line.quantity)
        await supabase
          .from("store_stock")
          .update({ balance: stockItem.balance - qty, updated_at: new Date().toISOString() })
          .eq("store_name", officer.store_name)
          .eq("product", line.product)
      }
  
      setSaleLoading(false)
      setShowSaleModal(false)
      setSaleLines([{ product: "", quantity: "", price_per_bag: "" }])
      setSaleCustomer(null)
      setSalePayment("")
      setSaleError("")
      setSaleType("self")
      setSaleTricycleId("")
      setTricycleSearch("")
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

  function handleAvatarClick() {
    setPictureError("")
    setPicturePreview(null)
    setSelectedFile(null)
    setShowPictureModal(true)
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith("image/")) {
      setPictureError("Please select an image file")
      return
    }

    if (file.size > 1 * 1024 * 1024) {
      setPictureError("Image must be less than 1MB")
      return
    }

    setSelectedFile(file)
    setPictureError("")

    const reader = new FileReader()
    reader.onload = (event) => {
      setPicturePreview(event.target?.result as string)
    }
    reader.readAsDataURL(file)
  }

  async function handleUploadPicture() {
    if (!selectedFile || !officer) {
      setPictureError("Please select an image")
      return
    }

    setPictureLoading(true)
    setPictureError("")

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setPictureError("Session expired"); setPictureLoading(false); return }

      const fileExt = selectedFile.name.split(".").pop()
      const fileName = `${officer.officer_id}-${Date.now()}.${fileExt}`
      const filePath = `${officer.officer_id}/${fileName}`

      if (officer.profile_picture_url) {
        const oldPath = officer.profile_picture_url.split("/").slice(-2).join("/")
        await supabase.storage.from("profile-pictures").remove([oldPath])
      }

      const { error: uploadError } = await supabase.storage
        .from("profile-pictures")
        .upload(filePath, selectedFile, { upsert: false })

      if (uploadError) { setPictureError("Upload failed"); setPictureLoading(false); return }

      const { data: { publicUrl } } = supabase.storage
        .from("profile-pictures")
        .getPublicUrl(filePath)

      const { error: updateError } = await supabase
        .from("store_officers")
        .update({ profile_picture_url: publicUrl })
        .eq("officer_id", officer.officer_id)

      if (updateError) { setPictureError("Failed to save profile"); setPictureLoading(false); return }

      setOfficer({ ...officer, profile_picture_url: publicUrl })

      setPictureLoading(false)
      setShowPictureModal(false)
      setSelectedFile(null)
      setPicturePreview(null)
    } catch (err) {
      setPictureError("Something went wrong")
      setPictureLoading(false)
    }
  }

  const groupedSales = sales.reduce<GroupedSale[]>((groups, sale) => {
    const groupId = [
      sale.sold_at,
      sale.customer_name ?? "",
      sale.payment_mode,
      sale.sale_type,
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
      sale_type: sale.sale_type,
      tricycle_number: sale.tricycle_number,
      sold_at: sale.sold_at,
      broker_id: sale.broker_id,
      broker_name: sale.broker_name,
      status: sale.status,
      lines: [sale],
    })
    return groups
  }, [])

  const filteredSales = salesFilter === "All" ? groupedSales : groupedSales.filter(s => s.payment_mode === salesFilter)
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
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "'Inter', sans-serif" }}>

      {/* Profile Banner */}
      <div style={{ background: "white", borderBottom: "1px solid #e2e8f0", padding: isMobile ? "16px" : "24px 32px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", gap: isMobile ? 12 : 16, justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 12 : 16, flex: 1 }}>
            <div
              onClick={handleAvatarClick}
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
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = "#0070f3"
                e.currentTarget.style.transform = "scale(1.05)"
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = "#bfdbfe"
                e.currentTarget.style.transform = "scale(1)"
              }}
            >
              {officer?.profile_picture_url ? (
                <img
                  src={officer.profile_picture_url}
                  alt={officer.full_name}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              ) : (
                <span style={{ fontSize: isMobile ? 20 : 24, fontWeight: 700, color: "#0070f3" }}>
                  {officer?.full_name.charAt(0).toUpperCase()}
                </span>
              )}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(0, 0, 0, 0.4)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: 0,
                  transition: "opacity 0.2s",
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = "1"}
                onMouseLeave={e => e.currentTarget.style.opacity = "0"}
              >
                <Icon icon="mdi:camera" width={20} height={20} color="white" />
              </div>
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: isMobile ? fontSize.lg : fontSize.xl, fontWeight: 700, color: "#0070f3" }}>
                {officer?.full_name}
              </h1>
              <p style={{ margin: "2px 0 0", fontSize: fontSize.sm, color: "#64748b" }}>
                {officer?.store_name}
              </p>
            </div>
          </div>
          <button
            onClick={async () => { await supabase.auth.signOut(); router.push("/login") }}
            style={{ padding: "8px 16px", background: "rgba(239, 68, 68, 0.05)", color: "#ef4444", border: "1.5px solid #fecaca", borderRadius: 6, cursor: "pointer", fontSize: fontSize.sm, fontWeight: 600, transition: "all 0.2s", minHeight: 40, whiteSpace: "nowrap" }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)"; e.currentTarget.style.borderColor = "#fca5a5" }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(239, 68, 68, 0.05)"; e.currentTarget.style.borderColor = "#fecaca" }}
          >
            Logout
          </button>
        </div>
      </div>

      <div style={{ padding: isMobile ? "16px" : "32px", maxWidth: 1200, margin: "0 auto" }}>

        {/* Stock Summary */}
        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: isMobile ? 16 : 24, marginBottom: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <p style={{ margin: "0 0 16px 0", fontWeight: 700, fontSize: fontSize.lg, color: "#0f172a" }}>Stock Balance</p>
          {stock.length === 0
            ? <p style={{ color: "#64748b", fontSize: fontSize.base, margin: 0 }}>No stock recorded yet.</p>
            : (
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
                {stock.map(s => (
                  <div key={s.product} style={{ background: "#f0f7ff", border: "1.5px solid #bfdbfe", borderRadius: 8, padding: "12px 14px" }}>
                    <p style={{ margin: 0, fontSize: fontSize.xs, color: "#64748b" }}>{s.product}</p>
                    <p style={{ margin: "6px 0 0", fontWeight: 700, fontSize: fontSize["2xl"], color: s.balance === 0 ? "#ef4444" : s.balance < 50 ? "#f5a623" : "#0070f3" }}>
                      {s.balance}<span style={{ fontSize: fontSize.xs, fontWeight: 500, color: "#64748b", marginLeft: 4 }}>bags</span>
                    </p>
                  </div>
                ))}
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
                fontSize: fontSize.sm,
                cursor: "pointer",
                border: `1.5px solid ${tab === t ? "" : "#e2e8f0"}`,
                background: tab === t ? "#171717" : "white",
                color: tab === t ? "white" : "#64748b",
                fontWeight: tab === t ? 600 : 500,
                transition: "all 0.2s",
                position: "relative",
                minHeight: 40,
              }}
              onMouseEnter={e => { if (tab !== t) { e.currentTarget.style.borderColor = "#cbd5e1"; e.currentTarget.style.background = "#f8fafc" } }}
              onMouseLeave={e => { if (tab !== t) { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.background = "white" } }}
            >
              {t === "supply" ? "Supplies" : t === "sales" ? "Sales" : "Stock"}
              {t === "supply" && pendingStops.length > 0 && (
                <span style={{
                  position: "absolute", top: -8, right: -8,
                  background: "#ef4444", color: "white", borderRadius: "50%",
                  width: 20, height: 20, fontSize: fontSize.xs, fontWeight: 700,
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
              <p style={{ margin: 0, fontWeight: 700, fontSize: fontSize.lg, color: "#0f172a" }}>Pending Supplies ({pendingStops.length})</p>
              <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: fontSize.xs, color: "#94a3b8" }}>
                {lastUpdated && `Updated: ${lastUpdated.toLocaleTimeString()}`}
                <button onClick={() => officer && fetchPendingStops(officer.store_name)} style={{ padding: "6px 12px", fontSize: fontSize.xs, cursor: "pointer", borderRadius: 6, border: "1px solid #e2e8f0", background: "white", color: "#64748b", transition: "all 0.2s" }} onMouseEnter={e => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1" }} onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#e2e8f0" }}>
                  Refresh
                </button>
              </div>
            </div>

            {pendingStops.length === 0 && <p style={{ color: "#64748b", fontSize: fontSize.base }}>No pending supplies.</p>}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {pendingStops.map(stop => (
                <div key={stop.stop_id} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", transition: "all 0.2s ease" }} onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)"; e.currentTarget.style.borderColor = "#cbd5e1" }} onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)"; e.currentTarget.style.borderColor = "#e2e8f0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: fontSize.lg, color: "#0f172a" }}>{stop.plate_number}</p>
                      <p style={{ margin: "4px 0 0", fontSize: fontSize.sm, color: "#64748b" }}>{stop.driver_name}</p>
                      <p style={{ margin: "4px 0 0", fontSize: fontSize.xs, color: "#94a3b8" }}>{new Date(stop.stop_time).toLocaleString()}</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ margin: "0 0 4px 0", fontSize: fontSize.xs, color: "#94a3b8" }}>Bags delivered</p>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: fontSize["2xl"], color: "#0070f3" }}>{stop.quantity_offloaded}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setConfirmingStop(stop); setSupplyLines([{ product: "", quantity: "" }]); setConfirmError("") }}
                    style={{ width: "100%", padding: "10px 14px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: fontSize.md, minHeight: 44, transition: "opacity 0.2s" }}
                    onMouseEnter={e => e.currentTarget.style.opacity = "0.9"}
                    onMouseLeave={e => e.currentTarget.style.opacity = "1"}
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
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["All", ...paymentFilters].map(f => (
                  <button
                    key={f}
                    onClick={() => setSalesFilter(f)}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 20,
                      fontSize: fontSize.sm,
                      cursor: "pointer",
                      border: `1.5px solid ${salesFilter === f ? "#0070f3" : "#e2e8f0"}`,
                      background: salesFilter === f ? "rgba(0, 112, 243, 0.1)" : "white",
                      color: salesFilter === f ? "#0070f3" : "#64748b",
                      fontWeight: salesFilter === f ? 600 : 500,
                      transition: "all 0.2s",
                      minHeight: 40
                    }}
                    onMouseEnter={e => { if (salesFilter !== f) { e.currentTarget.style.borderColor = "#cbd5e1"; e.currentTarget.style.background = "#f8fafc" } }}
                    onMouseLeave={e => { if (salesFilter !== f) { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.background = "white" } }}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <button
                onClick={() => { setShowSaleModal(true); setSaleError(""); setIsBrokerLinked(false); setSaleBroker(null) }}
                style={{ padding: "8px 16px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: fontSize.md, minHeight: 40, whiteSpace: "nowrap", transition: "opacity 0.2s" }}
                onMouseEnter={e => e.currentTarget.style.opacity = "0.9"}
                onMouseLeave={e => e.currentTarget.style.opacity = "1"}
              >
                + Log Sale
              </button>
            </div>

            {filteredSales.length === 0 && <p style={{ color: "#64748b", fontSize: fontSize.base }}>No sales logged yet.</p>}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {filteredSales.map(sale => {
                const totalAmount = sale.lines.reduce((sum, line) => sum + (line.total_amount ?? 0), 0)
                const hasBrokerPricing = sale.lines.some(line => line.price_per_bag === null)

                return (
                <div key={sale.group_id} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", transition: "all 0.2s ease" }} onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)"; e.currentTarget.style.borderColor = "#cbd5e1" }} onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)"; e.currentTarget.style.borderColor = "#e2e8f0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: fontSize.lg, color: "#0f172a" }}>
                        {sale.lines.length === 1 ? sale.lines[0].product : `${sale.lines.length} products`}
                      </p>
                      {sale.customer_name && <p style={{ margin: "4px 0 0", fontSize: fontSize.sm, color: "#64748b" }}>{sale.customer_name}</p>}
                      {sale.broker_name && <p style={{ margin: "4px 0 0", fontSize: fontSize.sm, color: "#0070f3", fontWeight: 500 }}>Broker: {sale.broker_name}</p>}
                      <p style={{ margin: "4px 0 0", fontSize: fontSize.xs, color: "#94a3b8" }}>{new Date(sale.sold_at).toLocaleString()}</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {!hasBrokerPricing ? (
                        <>
                          <p style={{ margin: 0, fontWeight: 700, fontSize: fontSize.lg, color: "#16a34a" }}>₦{totalAmount.toLocaleString()}</p>
                          <span style={{ fontSize: fontSize.xs, padding: "3px 8px", borderRadius: 6, background: "#f0f7ff", color: "#0070f3", fontWeight: 600, display: "inline-block", marginTop: 4 }}>{sale.payment_mode}</span>
                        </>
                      ) : (
                        <>
                          <p style={{ margin: 0, fontWeight: 700, fontSize: fontSize.lg, color: "#94a3b8", fontStyle: "italic" }}>Provided by broker</p>
                          <span style={{ fontSize: fontSize.xs, padding: "3px 8px", borderRadius: 6, background: "#f0f7ff", color: "#0070f3", fontWeight: 600, display: "inline-block", marginTop: 4 }}>{sale.payment_mode}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Status Badge */}
                  {sale.broker_id && (
                    <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px", marginBottom: 10, border: "1px solid #e2e8f0" }}>
                      <p style={{ margin: 0, fontSize: fontSize.xs, color: "#94a3b8" }}>Status</p>
                      <span style={{
                        fontSize: fontSize.xs,
                        padding: "4px 10px",
                        borderRadius: 6,
                        background: sale.status === "Pending" ? "#fffbeb" : sale.status === "Confirmed" ? "#ecfdf5" : "#fef2f2",
                        color: getStatusColor(sale.status),
                        fontWeight: 600,
                        display: "inline-block",
                        marginTop: 4
                      }}>
                        {sale.status}
                      </span>
                    </div>
                  )}

                  {/* Sale Type */}
                  {(() => {
                    const saleTypeConfig: Record<string, { label: string; icon: string; bg: string; border: string; color: string }> = {
                      self: { label: "Self", icon: "mdi:account", bg: "#f0fdf4", border: "#bbf7d0", color: "#16a34a" },
                      tricycle: { label: sale.tricycle_number || "Tricycle", icon: "mdi:rickshaw", bg: "#eff6ff", border: "#bfdbfe", color: "#0070f3" },
                      truck: { label: "Truck", icon: "mdi:truck", bg: "#fefce8", border: "#fde68a", color: "#ca8a04" },
                    }
                    const cfg = saleTypeConfig[sale.sale_type]
                    if (!cfg) return null
                    return (
                      <div style={{ background: cfg.bg, borderRadius: 8, padding: "10px 12px", marginBottom: 10, border: `1px solid ${cfg.border}` }}>
                        <p style={{ margin: 0, fontSize: fontSize.xs, color: "#94a3b8" }}>Sale Type</p>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                          <Icon icon={cfg.icon} width={18} height={18} color={cfg.color} />
                          <p style={{ margin: 0, fontWeight: 600, fontSize: fontSize.base, color: cfg.color }}>
                            {cfg.label}
                          </p>
                        </div>
                      </div>
                    )
                  })()}

                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {sale.lines.map(line => (
                      <div key={line.sale_id} style={{ display: "grid", gridTemplateColumns: line.price_per_bag !== null ? "1.4fr 0.7fr 0.9fr" : "1.4fr 0.7fr", gap: 8 }}>
                        <div style={{ background: "#f8fafc", borderRadius: 8, padding: "8px 12px" }}>
                          <p style={{ margin: 0, fontSize: fontSize.xs, color: "#94a3b8" }}>Product</p>
                          <p style={{ margin: "2px 0 0", fontWeight: 600, fontSize: fontSize.base, color: "#0f172a" }}>
                            {line.product}
                          </p>
                        </div>
                        <div style={{ background: "#f8fafc", borderRadius: 8, padding: "8px 12px" }}>
                          <p style={{ margin: 0, fontSize: fontSize.xs, color: "#94a3b8" }}>Bags</p>
                          <p style={{ margin: "2px 0 0", fontWeight: 600, fontSize: fontSize.base, color: "#0f172a" }}>
                            {line.quantity}
                          </p>
                        </div>
                        {line.price_per_bag !== null && (
                          <div style={{ background: "#f8fafc", borderRadius: 8, padding: "8px 12px" }}>
                            <p style={{ margin: 0, fontSize: fontSize.xs, color: "#94a3b8" }}>Price/Bag</p>
                            <p style={{ margin: "2px 0 0", fontWeight: 600, fontSize: fontSize.base, color: "#0f172a" }}>
                              ₦{line.price_per_bag.toLocaleString()}
                            </p>
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
            <p style={{ margin: "0 0 16px 0", fontWeight: 700, fontSize: fontSize.lg, color: "#0f172a" }}>Current Stock</p>
            {stock.length === 0 && <p style={{ color: "#64748b", fontSize: fontSize.base }}>No stock data yet.</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {stock.map(s => (
                <div key={s.product} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: fontSize.lg, color: "#0f172a" }}>{s.product}</p>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: fontSize.lg, color: s.balance === 0 ? "#ef4444" : s.balance < 50 ? "#f5a623" : "#0070f3" }}>
                    {s.balance} <span style={{ fontSize: fontSize.sm, fontWeight: 500, color: "#64748b", marginLeft: 4 }}>bags</span>
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
            <h3 style={{ margin: "0 0 6px 0", fontSize: fontSize.xl, fontWeight: 700, color: "#0f172a" }}>Confirm Supply</h3>
            <p style={{ color: "#94a3b8", fontSize: fontSize.sm, margin: "0 0 4px 0" }}>
              {confirmingStop.plate_number} · {confirmingStop.driver_name}
            </p>
            <p style={{ color: "#64748b", fontSize: fontSize.sm, margin: "0 0 20px 0" }}>
              Total: <strong>{confirmingStop.quantity_offloaded} bags</strong>
            </p>

            <p style={{ fontWeight: 700, fontSize: fontSize.base, margin: "0 0 4px 0", color: "#0f172a" }}>Breakdown by Product *</p>
            <p style={{ fontSize: fontSize.xs, color: "#94a3b8", margin: "0 0 12px 0" }}>Total must equal bags delivered</p>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {supplyLines.map((line, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", width: "100%" }}>
                  <ModernInput
                    as="select"
                    value={line.product}
                    onChange={e => updateSupplyLine(i, "product", e.target.value)}
                    style={{ flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: 6, border: "1px solid #e0e0e0", fontSize: fontSize.sm, boxSizing: "border-box" }}
                  >
                    <option value="">Select product</option>
                    {allProducts.map(p => (<option key={p} value={p}>{p}</option>))}
                  </ModernInput>
                  <ModernInput
                    type="number"
                    placeholder="Qty"
                    value={line.quantity}
                    onChange={e => updateSupplyLine(i, "quantity", e.target.value)}
                    style={{ flex: 1, width: isMobile ? 90 : 110, flexShrink: 0, padding: "10px 12px", borderRadius: 6, border: "1px solid #e0e0e0", fontSize: fontSize.sm, boxSizing: "border-box" }}
                  />
                  {supplyLines.length > 1 && (
                    <button onClick={() => removeSupplyLine(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 18, lineHeight: 1, padding: 0, width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                  )}
                </div>
              ))}
            </div>

            <div style={{ padding: "8px 12px", background: "#f8fafc", borderRadius: 6, marginBottom: 16, border: "1px solid #e2e8f0" }}>
              <p style={{ margin: 0, fontSize: fontSize.sm, color: "#0f172a" }}>
                Total entered: <strong style={{ color: supplyLines.reduce((s, l) => s + (parseInt(l.quantity) || 0), 0) === confirmingStop.quantity_offloaded ? "#16a34a" : "#f5a623" }}>
                  {supplyLines.reduce((s, l) => s + (parseInt(l.quantity) || 0), 0)}
                </strong> / {confirmingStop.quantity_offloaded}
              </p>
            </div>

            <button onClick={addSupplyLine} style={{ width: "100%", padding: "8px 12px", background: "white", border: "1px dashed #0070f3", color: "#0070f3", borderRadius: 6, cursor: "pointer", fontSize: fontSize.sm, fontWeight: 600, marginBottom: 20, minHeight: 40 }}>
              + Add Product Line
            </button>

            {confirmError && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 16, color: "#b91c1c", fontSize: fontSize.sm }}>{confirmError}</div>}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => { setConfirmingStop(null); setSupplyLines([{ product: "", quantity: "" }]); setConfirmError("") }} style={{ padding: "12px 16px", background: "white", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: fontSize.md, minHeight: 44 }}>Cancel</button>
              <button onClick={handleConfirmSupply} disabled={confirmLoading} style={{ padding: "12px 16px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: confirmLoading ? "not-allowed" : "pointer", fontWeight: 600, fontSize: fontSize.md, opacity: confirmLoading ? 0.7 : 1, minHeight: 44 }}>
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
          setSaleType("self")
          setSaleTricycleId("")
          setTricycleSearch("")
          setIsBrokerLinked(false)
          setSaleBroker(null)
          setBrokerSearch("")
          setSaleDate(new Date().toISOString().split("T")[0])
        }} style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 100, padding: isMobile ? 0 : 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: isMobile ? "20px 20px 0 0" : 12, padding: isMobile ? "28px 20px" : 32, width: "100%", maxWidth: 600, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)" }}>
            <h3 style={{ margin: "0 0 20px 0", fontSize: fontSize.xl, fontWeight: 700, color: "#0f172a" }}>Log Sales</h3>
      
            {/* Broker Linked Toggle */}
            <div style={{ marginBottom: 20, padding: "12px", background: "#f0f7ff", borderRadius: 8, border: "1px solid #bfdbfe" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={isBrokerLinked}
                  onChange={e => { setIsBrokerLinked(e.target.checked); setSaleBroker(null); setSaleError("") }}
                  style={{ width: 18, height: 18, cursor: "pointer" }}
                />
                <span style={{ margin: "4px 0 0", fontWeight: 600, color: "#0070f3", fontSize: fontSize.sm }}>Broker-linked sales</span>
              </label>
              <p style={{ margin: "6px 0 0", fontSize: fontSize.xs, color: "#64748b" }}>
                {isBrokerLinked ? "Broker will provide the prices" : ""}
              </p>
            </div>
      
            {/* Products Section */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <label style={{ fontWeight: 700, fontSize: fontSize.base, color: "#0f172a" }}>Products *</label>
                <p style={{ margin: 0, fontSize: fontSize.xs, color: "#94a3b8" }}>{saleLines.length} product(s)</p>
              </div>
      
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
                {saleLines.map((line, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "2fr 1fr " + (isBrokerLinked ? "0fr" : "1fr") + " auto", gap: 8, alignItems: "center" }}>
                    {/* Product Select */}
                    <ModernInput
                      as="select"
                      value={line.product}
                      onChange={e => updateSaleLine(i, "product", e.target.value)}
                      style={{ padding: "10px 12px", borderRadius: 6, border: "1px solid #e0e0e0", fontSize: fontSize.sm, boxSizing: "border-box", minHeight: 44 }}
                    >
                      <option value="">Select product</option>
                      {stock.filter(s => s.balance > 0).map(s => (
                        <option key={s.product} value={s.product}>{s.product} ({s.balance})</option>
                      ))}
                    </ModernInput>
      
                    {/* Quantity */}
                    <ModernInput
                      type="number"
                      placeholder="Qty"
                      value={line.quantity}
                      onChange={e => updateSaleLine(i, "quantity", e.target.value)}
                      style={{ padding: "10px 12px", borderRadius: 6, border: "1px solid #e0e0e0", fontSize: fontSize.sm, boxSizing: "border-box", minHeight: 44 }}
                    />
      
                    {/* Price (self / truck / non-broker tricycle) */}
                    {!isBrokerLinked && (
                      <ModernInput
                        type="text"
                        inputMode="numeric"
                        placeholder="Price per bag"
                        value={line.price_per_bag}
                        onChange={e => updateSaleLine(i, "price_per_bag", formatAmount(e.target.value))}
                        style={{ padding: "10px 12px", borderRadius: 6, border: "1px solid #e0e0e0", fontSize: fontSize.sm, boxSizing: "border-box", minHeight: 44 }}
                      />
                    )}
      
                    {/* Remove Button */}
                    {saleLines.length > 1 && (
                      <button onClick={() => removeSaleLine(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 18, lineHeight: 1, padding: 0, width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                    )}
                  </div>
                ))}
              </div>
      
              <button onClick={addSaleLine} style={{ width: "100%", padding: "8px 12px", background: "white", border: "1px dashed #0070f3", color: "#0070f3", borderRadius: 6, cursor: "pointer", fontSize: fontSize.sm, fontWeight: 600, minHeight: 40 }}>
                + Add Another Product
              </button>
            </div>
      
            {/* Broker Selection (if broker-linked) */}
            {isBrokerLinked && (
              <div style={{ marginBottom: 16, position: "relative" }}>
                <label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: fontSize.sm, color: "#475569" }}>Broker *</label>
                {brokers.length === 0
                  ? <p style={{ fontSize: fontSize.sm, color: "#94a3b8", margin: 0 }}>No brokers available.</p>
                  : (
                    <div style={{ position: "relative" }}>
                      <ModernInput
                        type="text"
                        placeholder="Search broker…"
                        value={brokerSearch}
                        onChange={e => { setBrokerSearch(e.target.value); setBrokerDropOpen(true) }}
                        onFocus={() => setBrokerDropOpen(true)}
                        onBlur={() => setTimeout(() => setBrokerDropOpen(false), 150)}
                        style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid #e0e0e0", fontSize: fontSize.base, boxSizing: "border-box", minHeight: 44 }}
                      />
                      {brokerDropOpen && (
                        <ul style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "white", border: "1px solid #e2e8f0", borderRadius: 8, listStyle: "none", margin: 0, padding: 4, maxHeight: 200, overflowY: "auto", zIndex: 50, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
                          {brokers
                            .filter(b => b.broker_name.toLowerCase().includes(brokerSearch.toLowerCase()))
                            .map(b => (
                              <li
                                key={b.broker_id}
                                onMouseDown={() => { setSaleBroker(b); setBrokerSearch(b.broker_name); setBrokerDropOpen(false); setSaleError("") }}
                                style={{ padding: "10px 12px", cursor: "pointer", fontSize: fontSize.base, background: saleBroker?.broker_id === b.broker_id ? "#eff6ff" : "white", borderRadius: 6, transition: "all 0.2s" }}
                                onMouseEnter={e => { if (saleBroker?.broker_id !== b.broker_id) e.currentTarget.style.background = "#f8fafc" }}
                                onMouseLeave={e => { e.currentTarget.style.background = saleBroker?.broker_id === b.broker_id ? "#eff6ff" : "white" }}
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
                  <div style={{ marginTop: 8, padding: "8px 12px", background: "#eff6ff", borderRadius: 6, fontSize: fontSize.sm, color: "#0070f3", fontWeight: 500 }}>
                    Selected: {saleBroker.broker_name}
                  </div>
                )}
              </div>
            )}
      
            {/* Customer Name (optional) */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: fontSize.sm, color: "#475569" }}>Customer Name <span style={{ fontWeight: 400, color: "#94a3b8" }}>(optional)</span></label>
              <CustomerSelector 
                onSelect={(c: any) => { setSaleCustomer(c); setSaleError("") }} 
                allowUnsavedNew={true}
                initialValue={saleCustomer?.full_name || ""}
              />
              {saleCustomer && (
                <div style={{ marginTop: 8, padding: "8px 12px", background: "#eff6ff", borderRadius: 6, fontSize: fontSize.sm, color: "#0070f3", fontWeight: 500 }}>
                  Selected: {saleCustomer.full_name}
                </div>
              )}
            </div>
      
            {/* Sale Type */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: fontSize.sm, color: "#475569" }}>Sale Type</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                {(["self", "tricycle", "truck"] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => { setSaleType(type); setSaleTricycleId(""); setSaleError("") }}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 8,
                      cursor: "pointer",
                      border: `1.5px solid ${saleType === type ? "#0070f3" : "#e2e8f0"}`,
                      background: saleType === type ? "#0070f3" : "white",
                      color: saleType === type ? "white" : "#64748b",
                      fontWeight: saleType === type ? 600 : 500,
                      fontSize: fontSize.sm,
                      minHeight: 44,
                      transition: "all 0.2s"
                    }}
                    onMouseEnter={e => { if (saleType !== type) { e.currentTarget.style.borderColor = "#cbd5e1"; e.currentTarget.style.background = "#f8fafc" } }}
                    onMouseLeave={e => { if (saleType !== type) { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.background = "white" } }}
                  >
                    {type === "self" ? "Self" : type === "truck" ? "Truck" : "Tricycle"}
                  </button>
                ))}
              </div>
            </div>

            {/* Sale Date */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: fontSize.sm, color: "#475569" }}>Date of Sale</label>
              <ModernInput
                type="date"
                value={saleDate}
                onChange={e => { setSaleDate(e.target.value); setSaleError("") }}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid #e0e0e0", fontSize: fontSize.base, boxSizing: "border-box", minHeight: 44 }}
              />
            </div>

            {/* Tricycle Selection */}
            {saleType === "tricycle" && (
              <div style={{ marginBottom: 16, position: "relative" }}>
                <label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: fontSize.sm, color: "#475569" }}>Tricycle *</label>
                {tricycles.length === 0
                  ? <p style={{ fontSize: fontSize.sm, color: "#94a3b8", margin: 0 }}>No tricycles available.</p>
                  : (
                    <div style={{ position: "relative" }}>
                      <ModernInput
                        type="text"
                        placeholder="Search tricycle…"
                        value={tricycleSearch}
                        onChange={e => { setTricycleSearch(e.target.value); setTricycleDropOpen(true) }}
                        onFocus={() => setTricycleDropOpen(true)}
                        onBlur={() => setTimeout(() => setTricycleDropOpen(false), 150)}
                        style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid #e0e0e0", fontSize: fontSize.base, boxSizing: "border-box", minHeight: 44 }}
                      />
                      {tricycleDropOpen && (
                        <ul style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "white", border: "1px solid #e2e8f0", borderRadius: 8, listStyle: "none", margin: 0, padding: 4, maxHeight: 200, overflowY: "auto", zIndex: 50, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
                          {tricycles
                            .filter(t => t.tricycle_number.toLowerCase().includes(tricycleSearch.toLowerCase()))
                            .map(t => (
                              <li
                                key={t.tricycle_id}
                                onMouseDown={() => { setSaleTricycleId(t.tricycle_id); setTricycleSearch(t.tricycle_number); setTricycleDropOpen(false); setSaleError("") }}
                                style={{ padding: "10px 12px", cursor: "pointer", fontSize: fontSize.base, background: saleTricycleId === t.tricycle_id ? "#eff6ff" : "white", borderRadius: 6, transition: "all 0.2s" }}
                                onMouseEnter={e => { if (saleTricycleId !== t.tricycle_id) e.currentTarget.style.background = "#f8fafc" }}
                                onMouseLeave={e => { e.currentTarget.style.background = saleTricycleId === t.tricycle_id ? "#eff6ff" : "white" }}
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
      
            {/* Payment Mode */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: fontSize.sm, color: "#475569" }}>Payment Mode *</label>
              <ModernInput
                as="select"
                value={salePayment}
                onChange={e => { setSalePayment(e.target.value); setSaleError("") }}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid #e0e0e0", fontSize: fontSize.base, boxSizing: "border-box", minHeight: 44 }}
              >
                <option value="">Select payment mode</option>
                {PAYMENT_MODES.map(m => (<option key={m} value={m}>{m}</option>))}
              </ModernInput>
            </div>
      
            {saleError && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 16, color: "#b91c1c", fontSize: fontSize.sm }}>{saleError}</div>}
      
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => { 
                setShowSaleModal(false)
                setSaleLines([{ product: "", quantity: "", price_per_bag: "" }])
                setSaleCustomer(null)
                setSalePayment("")
                setSaleError("")
                setSaleType("self")
                setSaleTricycleId("")
                setTricycleSearch("")
                setIsBrokerLinked(false)
                setSaleBroker(null)
                setBrokerSearch("")
                setSaleDate(new Date().toISOString().split("T")[0])
              }} style={{ padding: "12px 16px", background: "white", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: fontSize.md, minHeight: 44 }}>Cancel</button>
              <button onClick={handleLogSale} disabled={saleLoading} style={{ padding: "12px 16px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: saleLoading ? "not-allowed" : "pointer", fontWeight: 600, fontSize: fontSize.md, opacity: saleLoading ? 0.7 : 1, minHeight: 44 }}>
                {saleLoading ? "Logging..." : `Log ${saleLines.filter(l => l.product).length} Sale(s)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Profile Picture Upload Modal */}
      {showPictureModal && (
        <div onClick={() => { setShowPictureModal(false); setSelectedFile(null); setPicturePreview(null); setPictureError("") }} style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 100, padding: isMobile ? 0 : 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: isMobile ? "20px 20px 0 0" : 12, padding: isMobile ? "28px 20px" : 32, width: "100%", maxWidth: 420, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)" }}>
            <h3 style={{ margin: "0 0 6px 0", fontSize: fontSize.xl, fontWeight: 700, color: "#0f172a" }}>Update Profile Picture</h3>
            <p style={{ margin: "0 0 20px 0", fontSize: fontSize.sm, color: "#64748b" }}>Click to upload or drag and drop. PNG, JPG up to 1MB.</p>

            {picturePreview ? (
              <div style={{ marginBottom: 20 }}>
                <p style={{ margin: "0 0 8px 0", fontSize: fontSize.sm, fontWeight: 600, color: "#0f172a" }}>Preview</p>
                <img
                  src={picturePreview}
                  alt="Preview"
                  style={{
                    width: "100%",
                    height: 200,
                    objectFit: "cover",
                    borderRadius: 12,
                    border: "2px solid #e2e8f0",
                  }}
                />
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: "1.5px dashed #0070f3",
                  borderRadius: 12,
                  padding: "32px 16px",
                  cursor: "pointer",
                  background: "#f0f7ff",
                  transition: "all 0.2s",
                  marginBottom: 20,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = "#e0efff"
                  e.currentTarget.style.borderColor = "#0055d4"
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = "#f0f7ff"
                  e.currentTarget.style.borderColor = "#0070f3"
                }}
              >
                <Icon icon="mdi:cloud-upload" width={40} height={40} color="#0070f3" style={{ marginBottom: 8 }} />
                <p style={{ margin: "0 0 4px 0", fontSize: fontSize.base, fontWeight: 600, color: "#0070f3" }}>
                  Click to upload
                </p>
                <p style={{ margin: 0, fontSize: fontSize.sm, color: "#64748b" }}>
                  or drag and drop
                </p>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              style={{ display: "none" }}
            />

            {pictureError && (
              <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 16, color: "#b91c1c", fontSize: fontSize.sm }}>
                {pictureError}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button
                onClick={() => { setShowPictureModal(false); setSelectedFile(null); setPicturePreview(null); setPictureError("") }}
                style={{ padding: "12px 16px", background: "white", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: fontSize.md, minHeight: 44 }}
              >
                Cancel
              </button>
              <button
                onClick={handleUploadPicture}
                disabled={pictureLoading || !selectedFile}
                style={{
                  padding: "12px 16px",
                  background: selectedFile ? "#0070f3" : "#bfdbfe",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  cursor: selectedFile && !pictureLoading ? "pointer" : "not-allowed",
                  fontWeight: 600,
                  fontSize: fontSize.md,
                  minHeight: 44,
                  opacity: pictureLoading ? 0.7 : 1,
                }}
              >
                {pictureLoading ? "Uploading..." : "Upload"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
