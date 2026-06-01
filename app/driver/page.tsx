"use client"

import { useState, useEffect, useRef } from "react"
import { supabase } from "@/lib/supabase"
import StopForm from "@/components/StopForm"
import BuyDiesel from "@/components/BuyDiesel"
import { useBreakpoint } from "@/app/hooks/useBreakpoint"

type Driver = { driver_id: string; full_name: string }
type Trip = {
  trip_id: string
  plate_number: string
  product: string
  material_centre: string
  loaded_quantity: number
  trip_status: string
  atc: string | null
}
type Stop = {
  stop_id: string
  stop_location: string
  quantity_offloaded: number
  stop_time: string
}
type Truck = { plate_number: string; kbnl_truck_no: string }

const LOADING_POINT_MAP: Record<string, string[]> = {
  Factory: ["Lafarge (Unicem)", "Dangote BOCO"],
  Depot: ["Calabar Mini Depot", "Ikom Mini Depot", "Ogoja Warehouse", "Uyo Warehouse"],
  Outlet: ["Brooks Outlet", "Urua Ekpa Outlet", "Urua Nyemeiko Outlet", "Reserve Store", "E1 Outlet", "Ogoja Outlet"],
}

const FACTORY_PRODUCTS: Record<string, string[]> = {
  "Lafarge (Unicem)": ["Classic", "Supaset"],
  "Dangote BOCO": ["Falcon", "3X"],
}

const COMPLAINT_TYPES = [
  "Breakdown", "Tyre Blowout", "Accident", "Police / Checkpoint Issue",
  "Fuel Problem", "Mechanical Fault", "Road Blockage", "Other",
]

export default function DriverDashboard() {
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"
  const isTablet = bp === "tablet"

  const [driver, setDriver] = useState<Driver | null>(null)
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null)
  const [stops, setStops] = useState<Stop[]>([])
  const [remaining, setRemaining] = useState(0)
  const [view, setView] = useState<"dashboard" | "start-trip" | "active-trip" | "log-stop" | "buy-diesel">("dashboard")
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState("")

  // Modals
  const [showEndConfirm, setShowEndConfirm] = useState(false)
  const [showHoldConfirm, setShowHoldConfirm] = useState(false)
  const [showDiscrepancyModal, setShowDiscrepancyModal] = useState(false)
  const [showComplaintModal, setShowComplaintModal] = useState(false)
  const [showLoadMoreModal, setShowLoadMoreModal] = useState(false)

  // Discrepancy
  const [discShortage, setDiscShortage] = useState("")
  const [discCaked, setDiscCaked] = useState("")
  const [discNotes, setDiscNotes] = useState("")
  const [discDropLocation, setDiscDropLocation] = useState("")
  const [discError, setDiscError] = useState("")
  const [discSubmitting, setDiscSubmitting] = useState(false)

  // Complaint
  const [complaintType, setComplaintType] = useState("")
  const [complaintTruck, setComplaintTruck] = useState("")
  const [complaintNotes, setComplaintNotes] = useState("")
  const [complaintError, setComplaintError] = useState("")
  const [complaintSubmitting, setComplaintSubmitting] = useState(false)
  const [complaintPendingEndTrip, setComplaintPendingEndTrip] = useState(false)

  // Load more
  const [loadMoreQty, setLoadMoreQty] = useState("")
  const [loadMoreCategory, setLoadMoreCategory] = useState("")
  const [loadMoreLocationName, setLoadMoreLocationName] = useState("")
  const [loadMoreProduct, setLoadMoreProduct] = useState("")
  const [loadMoreProductOptions, setLoadMoreProductOptions] = useState<string[]>([])
  const [loadMoreError, setLoadMoreError] = useState("")
  const [loadMoreSubmitting, setLoadMoreSubmitting] = useState(false)

  // Start trip
  const [plateNumber, setPlateNumber] = useState("")
  const [loadingPointCategory, setLoadingPointCategory] = useState("")
  const [loadingPointName, setLoadingPointName] = useState("")
  const [product, setProduct] = useState("")
  const [loadedQuantity, setLoadedQuantity] = useState("")
  const [atc, setAtc] = useState("")
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [allTrucks, setAllTrucks] = useState<Truck[]>([])
  const [productOptions, setProductOptions] = useState<string[]>([])
  const [allProducts, setAllProducts] = useState<string[]>([])

  const loadedQtyRef = useRef<HTMLInputElement>(null)
  const loadMoreRef = useRef<HTMLInputElement>(null)

  const allStoreLocations = [...LOADING_POINT_MAP.Depot, ...LOADING_POINT_MAP.Outlet]

  useEffect(() => { initDriver() }, [])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") window.location.href = "/login"
    })
    return () => subscription.unsubscribe()
  }, [])

  async function initDriver() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.href = "/login"; return }
    const user = session.user

    const { data: driverData } = await supabase
      .from("Drivers").select("driver_id, full_name").eq("driver_id", user.id).single()
    if (!driverData) return
    setDriver(driverData)

    const { data: tripData } = await supabase
      .from("Trips").select("*").eq("driver_id", user.id)
      .in("trip_status", ["In transit", "On hold"]).single()

    if (tripData) {
      setActiveTrip(tripData)
      await fetchStops(tripData.trip_id, tripData.loaded_quantity)
    }

    const { data: activePlates } = await supabase
      .from("Trips").select("plate_number").in("trip_status", ["In transit", "On hold"])
    const usedPlates = activePlates?.map(t => t.plate_number) || []

    const { data: trucksData } = await supabase
      .from("Trucks").select("plate_number, kbnl_truck_no").eq("status", "Empty")
    const available = (trucksData || []).filter(t => !usedPlates.includes(t.plate_number))
    setTrucks(available)
    setAllTrucks(trucksData || [])

    const { data: productsData } = await supabase.rpc("get_products")
    if (productsData) {
      const list = productsData.map((r: { value: string }) => r.value)
      setAllProducts(list)
      setProductOptions(list)
    }

    setLoading(false)
  }

  async function fetchStops(tripId: string, loadedQty: number) {
    const { data: stopsData } = await supabase
      .from("Stops").select("stop_id, stop_location, quantity_offloaded, stop_time")
      .eq("trip_id", tripId).order("stop_time", { ascending: false })

    const { data: discData } = await supabase
      .from("trip_discrepancies").select("shortage").eq("trip_id", tripId)

    const stopList = stopsData || []
    setStops(stopList)

    const totalOffloaded = stopList.reduce((sum, s) => sum + s.quantity_offloaded, 0)
    const totalShortage = (discData || []).reduce((sum, d) => sum + (d.shortage || 0), 0)
    const rem = loadedQty - totalOffloaded - totalShortage
    setRemaining(rem)
    if (rem <= 0 && tripId) setShowEndConfirm(true)
  }

  function handleCategoryChange(cat: string) {
    setLoadingPointCategory(cat); setLoadingPointName(""); setProduct(""); setAtc(""); setMessage("")
  }

  function handleLoadingPointNameChange(name: string) {
    setLoadingPointName(name); setProduct(""); setAtc(""); setMessage("")
    setProductOptions(loadingPointCategory === "Factory" ? (FACTORY_PRODUCTS[name] || []) : allProducts)
  }

  function handleLoadMoreCategoryChange(cat: string) {
    setLoadMoreCategory(cat); setLoadMoreLocationName(""); setLoadMoreProduct(""); setLoadMoreProductOptions([]); setLoadMoreError("")
  }

  function handleLoadMoreLocationChange(name: string) {
    setLoadMoreLocationName(name); setLoadMoreProduct(""); setLoadMoreError("")
    setLoadMoreProductOptions(allProducts)
  }

  const showATC = loadingPointCategory === "Factory"
  const availableLocations = LOADING_POINT_MAP[loadingPointCategory] || []

  async function handleStartTrip() {
    if (!plateNumber) return setMessage("Select a plate number")
    if (!loadingPointCategory) return setMessage("Select a loading point type")
    if (!loadingPointName) return setMessage("Select a loading point")
    if (showATC && !atc.trim()) return setMessage("ATC number is required")
    if (!product) return setMessage("Select a product")
    if (!loadedQuantity) return setMessage("Enter no. of bags")

    setSubmitting(true)
    const { data, error } = await supabase.from("Trips").insert([{
      driver_id: driver?.driver_id, plate_number: plateNumber, product,
      material_centre: loadingPointName, loaded_quantity: parseInt(loadedQuantity),
      ATC: showATC ? atc.trim() : null, trip_status: "In transit",
    }]).select().single()

    if (error || !data) { setMessage("Failed to start trip"); setSubmitting(false); return }
    await supabase.from("Trucks").update({ status: "Loaded" }).eq("plate_number", plateNumber)
    setActiveTrip(data); setRemaining(parseInt(loadedQuantity)); setStops([])
    setSubmitting(false); setMessage(""); setView("active-trip")
  }

  async function handleEndTrip() {
    if (!activeTrip) return
    setSubmitting(true)
    await supabase.from("Trips").update({ trip_status: "Completed", updated_at: new Date().toISOString() }).eq("trip_id", activeTrip.trip_id)
    await supabase.from("Trucks").update({ status: "Empty" }).eq("plate_number", activeTrip.plate_number)
    setSubmitting(false); setShowEndConfirm(false); setActiveTrip(null); setStops([]); setRemaining(0); setView("dashboard")
  }

  async function handleHoldTrip() {
    if (!activeTrip) return
    setSubmitting(true)
    const newStatus = activeTrip.trip_status === "On hold" ? "In transit" : "On hold"
    await supabase.from("Trips").update({ trip_status: newStatus }).eq("trip_id", activeTrip.trip_id)
    setActiveTrip({ ...activeTrip, trip_status: newStatus }); setSubmitting(false); setShowHoldConfirm(false)
  }

  async function handleReportDiscrepancy() {
    const shortage = parseInt(discShortage) || 0
    const caked = parseInt(discCaked) || 0
    if (shortage === 0 && caked === 0) return setDiscError("Enter at least a shortage or caked bags count")
    if (shortage < 0 || caked < 0) return setDiscError("Values cannot be negative")
    if (shortage > remaining) return setDiscError(`Shortage cannot exceed remaining bags (${remaining})`)
    if (!discDropLocation) return setDiscError("Select a drop location")

    setDiscSubmitting(true)
    const { error } = await supabase.from("trip_discrepancies").insert([{
      trip_id: activeTrip?.trip_id, driver_id: driver?.driver_id,
      shortage, caked_bags: caked, notes: discNotes.trim() || null, drop_location: discDropLocation,
    }])
    setDiscSubmitting(false)
    if (error) { setDiscError("Failed to submit report"); return }
    setShowDiscrepancyModal(false)
    setDiscShortage(""); setDiscCaked(""); setDiscNotes(""); setDiscDropLocation(""); setDiscError("")
    if (activeTrip) fetchStops(activeTrip.trip_id, activeTrip.loaded_quantity)
  }

  async function handleLoadMore() {
    const qty = parseInt(loadMoreQty)
    if (!loadMoreCategory) return setLoadMoreError("Select a loading point type")
    if (!loadMoreLocationName) return setLoadMoreError("Select a loading point")
    if (!loadMoreProduct) return setLoadMoreError("Select a product")
    if (!qty || qty <= 0) return setLoadMoreError("Enter a valid number of bags")
    if (!activeTrip) return

    setLoadMoreSubmitting(true)
    const newTotal = activeTrip.loaded_quantity + qty
    const { error } = await supabase.from("Trips").update({ loaded_quantity: newTotal }).eq("trip_id", activeTrip.trip_id)
    setLoadMoreSubmitting(false)
    if (error) { setLoadMoreError("Failed to update bags"); return }

    setActiveTrip({ ...activeTrip, loaded_quantity: newTotal }); setRemaining(remaining + qty)
    setShowLoadMoreModal(false); setLoadMoreQty(""); setLoadMoreCategory("")
    setLoadMoreLocationName(""); setLoadMoreProduct(""); setLoadMoreProductOptions([]); setLoadMoreError("")
  }

  async function handleSubmitComplaint(thenEndTrip = false) {
    if (!complaintTruck) return setComplaintError("Select a truck")
    if (!complaintType) return setComplaintError("Select a complaint type")
    if (!complaintNotes.trim()) return setComplaintError("Please describe the issue")

    setComplaintSubmitting(true)
    const { error } = await supabase.from("driver_complaints").insert([{
      driver_id: driver?.driver_id, trip_id: activeTrip?.trip_id ?? null,
      plate_number: complaintTruck, complaint_type: complaintType, notes: complaintNotes.trim(),
    }])
    setComplaintSubmitting(false)
    if (error) { setComplaintError("Failed to submit complaint"); return }

    setShowComplaintModal(false); setComplaintType(""); setComplaintTruck("")
    setComplaintNotes(""); setComplaintError(""); setComplaintPendingEndTrip(false)
    if (thenEndTrip) handleEndTrip()
  }

  function openComplaintFromEndTrip() {
    setComplaintPendingEndTrip(true); setShowEndConfirm(false); setShowComplaintModal(true)
  }

  function handleStopLogged() {
    if (activeTrip) fetchStops(activeTrip.trip_id, activeTrip.loaded_quantity)
    setView("active-trip")
  }

  // ── Styles ──────────────────────────────────────────────────────────────
  const containerPad = isMobile ? "16px 16px 100px" : "24px 24px 40px"
  const maxW = isMobile ? "100%" : isTablet ? 560 : 480

  const cardStyle: React.CSSProperties = {
    background: "white", border: "1px solid #eee", borderRadius: 12,
    padding: isMobile ? 16 : 20, marginBottom: 16,
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)"
  }

  const fullBtn = (bg: string, color = "white"): React.CSSProperties => ({
    width: "100%", padding: isMobile ? "16px 0" : "14px 0",
    background: bg, color, border: color === "white" ? "none" : `1px solid ${bg}`,
    borderRadius: 8, fontSize: isMobile ? 17 : 16,
    cursor: "pointer", fontWeight: "bold",
    minHeight: 52,
  })

  const outlineBtn = (color: string): React.CSSProperties => ({
    width: "100%", padding: isMobile ? "14px 0" : "12px 0",
    background: "white", color, border: `1px solid ${color}`,
    borderRadius: 8, fontSize: isMobile ? 16 : 15,
    cursor: "pointer", minHeight: 48,
  })

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: isMobile ? "14px 12px" : "10px 12px",
    boxSizing: "border-box", borderRadius: 8,
    border: "1px solid #ddd", fontSize: isMobile ? 16 : 14,
    background: "white", color: "#171717",
    minHeight: isMobile ? 48 : 40,
  }

  const labelStyle: React.CSSProperties = {
    fontWeight: "bold", display: "block",
    marginBottom: 6, fontSize: isMobile ? 15 : 14, color: "#171717"
  }

  const modalOverlay: React.CSSProperties = {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
    display: "flex", alignItems: isMobile ? "flex-end" : "center",
    justifyContent: "center", zIndex: 100
  }

  const modalBox: React.CSSProperties = {
    background: "white",
    borderRadius: isMobile ? "16px 16px 0 0" : 12,
    padding: isMobile ? "24px 20px 36px" : 32,
    width: isMobile ? "100%" : 360,
    maxWidth: "100%",
    maxHeight: isMobile ? "90vh" : "85vh",
    overflowY: "auto",
    boxShadow: "0 8px 32px rgba(0,0,0,0.2)"
  }

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "white" }}>
      <p style={{ color: "#888" }}>Loading...</p>
    </div>
  )

  return (
    <div style={{ fontFamily: "Arial", background: "#f9f9f9", minHeight: "100vh" }}>
      <div style={{ maxWidth: maxW, margin: "0 auto", padding: containerPad }}>

        {/* Header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 24, paddingBottom: 16, borderBottom: "1px solid #eee",
          background: "white", position: "sticky", top: 0, zIndex: 10,
          margin: isMobile ? "0 -16px 24px" : "0 0 24px",
          padding: isMobile ? "16px 16px" : "0 0 16px",
          boxShadow: isMobile ? "0 2px 8px rgba(0,0,0,0.06)" : "none"
        }}>
          <div>
            <p style={{ margin: 0, fontSize: 12, color: "#888" }}>Logged in as</p>
            <p style={{ margin: 0, fontWeight: "bold", fontSize: isMobile ? 15 : 14, color: "#171717" }}>{driver?.full_name}</p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={() => { setComplaintPendingEndTrip(false); setShowComplaintModal(true) }}
              style={{
                padding: isMobile ? "8px 12px" : "6px 14px",
                background: "white", color: "#f5a623",
                border: "1px solid #f5a623", borderRadius: 6,
                cursor: "pointer", fontSize: isMobile ? 13 : 12,
                minHeight: 36, fontWeight: "bold"
              }}
            >
              {isMobile ? "⚠️" : "Report Issue"}
            </button>
            <button
              onClick={async () => { await supabase.auth.signOut(); window.location.href = "/login" }}
              style={{
                padding: isMobile ? "8px 12px" : "6px 14px",
                background: "#ff4444", color: "white",
                border: "none", borderRadius: 6,
                cursor: "pointer", fontSize: isMobile ? 13 : 12,
                minHeight: 36
              }}
            >
              {isMobile ? "↩" : "Logout"}
            </button>
          </div>
        </div>

        {/* Dashboard View */}
        {view === "dashboard" && (
          <div style={{ textAlign: "center", paddingTop: isMobile ? 40 : 60 }}>
            <h2 style={{ marginBottom: 8, fontSize: isMobile ? 22 : 20, color: "#171717" }}>
              {activeTrip ? `Welcome back, ${driver?.full_name?.split(" ")[0]}` : "Ready to go?"}
            </h2>
            <p style={{ color: "#888", marginBottom: 40, fontSize: isMobile ? 15 : 14 }}>
              {activeTrip ? `Trip in progress · ${activeTrip.plate_number}` : "No active trip. What would you like to do?"}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 320, margin: "0 auto" }}>
              <button onClick={() => setView(activeTrip ? "active-trip" : "start-trip")} style={fullBtn("#0070f3")}>
                {activeTrip ? "Continue Trip" : "Start a Trip"}
              </button>
              <button onClick={() => setView("buy-diesel")} style={{ ...fullBtn("white", "#333"), border: "1px solid #ddd" }}>
                Buy Diesel
              </button>
            </div>
          </div>
        )}

        {/* Start Trip View */}
        {view === "start-trip" && (
          <div>
            <button onClick={() => { setView("dashboard"); setMessage("") }} style={{ background: "none", border: "none", color: "#0070f3", cursor: "pointer", marginBottom: 16, padding: 0, fontSize: isMobile ? 16 : 14, display: "flex", alignItems: "center", gap: 4 }}>
              ← Back
            </button>
            <h2 style={{ marginBottom: 24, color: "#171717" }}>Start a Trip</h2>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Plate Number *</label>
              <select value={plateNumber} onChange={(e) => { setPlateNumber(e.target.value); setMessage("") }} style={inputStyle}>
                <option value="">Select plate number</option>
                {trucks.map(t => <option key={t.plate_number} value={t.plate_number}>{t.plate_number}{t.kbnl_truck_no ? ` · #${t.kbnl_truck_no}` : ""}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Loading Point *</label>
              <select value={loadingPointCategory} onChange={(e) => handleCategoryChange(e.target.value)} style={inputStyle}>
                <option value="">Select loading point</option>
                {Object.keys(LOADING_POINT_MAP).map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>

            {loadingPointCategory && (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>{loadingPointCategory} *</label>
                <select value={loadingPointName} onChange={(e) => handleLoadingPointNameChange(e.target.value)} style={inputStyle}>
                  <option value="">Select {loadingPointCategory.toLowerCase()}</option>
                  {availableLocations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                </select>
              </div>
            )}

            {showATC && loadingPointName && (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>ATC Number *</label>
                <input type="text" placeholder="Enter ATC number" value={atc} onChange={(e) => { setAtc(e.target.value); setMessage("") }} onKeyDown={(e) => { if (e.key === "Enter") loadedQtyRef.current?.focus() }} style={inputStyle} />
              </div>
            )}

            {loadingPointName && (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Product *</label>
                <select value={product} onChange={(e) => { setProduct(e.target.value); setMessage("") }} style={inputStyle}>
                  <option value="">Select product</option>
                  {productOptions.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            )}

            {product && (
              <div style={{ marginBottom: 24 }}>
                <label style={labelStyle}>No. of Bags *</label>
                <input ref={loadedQtyRef} type="number" placeholder="e.g. 600" value={loadedQuantity} onChange={(e) => { setLoadedQuantity(e.target.value); setMessage("") }} onKeyDown={(e) => { if (e.key === "Enter") handleStartTrip() }} style={inputStyle} />
              </div>
            )}

            {message && <p style={{ color: "red", marginBottom: 16, fontWeight: "bold", fontSize: 14 }}>{message}</p>}

            <button onClick={handleStartTrip} disabled={submitting} style={fullBtn(submitting ? "#ccc" : "#0070f3")}>
              {submitting ? "Starting..." : "Start Trip"}
            </button>
          </div>
        )}

        {/* Active Trip View */}
        {view === "active-trip" && activeTrip && (
          <div>
            <button onClick={() => setView("dashboard")} style={{ background: "none", border: "none", color: "#0070f3", cursor: "pointer", marginBottom: 16, padding: 0, fontSize: isMobile ? 16 : 14 }}>
              ← Dashboard
            </button>
            <h2 style={{ marginBottom: 20, color: "#171717" }}>Active Trip</h2>

            {/* Trip Info Card */}
            <div style={cardStyle}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: isMobile ? 14 : 12 }}>
                <div>
                  <p style={{ margin: 0, fontSize: 12, color: "#888" }}>Plate Number</p>
                  <p style={{ margin: "2px 0 0", fontWeight: "bold", fontSize: isMobile ? 15 : 14, color: "#171717" }}>{activeTrip.plate_number}</p>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 12, color: "#888" }}>Product</p>
                  <p style={{ margin: "2px 0 0", fontWeight: "bold", fontSize: isMobile ? 15 : 14, color: "#171717" }}>{activeTrip.product}</p>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 12, color: "#888" }}>Loading Point</p>
                  <p style={{ margin: "2px 0 0", fontWeight: "bold", fontSize: isMobile ? 14 : 13, color: "#171717" }}>{activeTrip.material_centre}</p>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 12, color: "#888" }}>Loaded</p>
                  <p style={{ margin: "2px 0 0", fontWeight: "bold", fontSize: isMobile ? 15 : 14, color: "#171717" }}>{activeTrip.loaded_quantity} bags</p>
                </div>
              </div>

              {/* Remaining — prominent */}
              <div style={{ marginTop: 16, padding: "12px 16px", background: "#f9f9f9", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <p style={{ margin: 0, fontSize: 13, color: "#888" }}>Remaining</p>
                <p style={{ margin: 0, fontWeight: "bold", fontSize: isMobile ? 24 : 20, color: remaining === 0 ? "#ff4444" : remaining < activeTrip.loaded_quantity * 0.2 ? "#f5a623" : "#00aa00" }}>
                  {remaining} <span style={{ fontSize: 13, fontWeight: "normal", color: "#888" }}>bags</span>
                </p>
              </div>

              <div style={{ marginTop: 12, textAlign: "center" }}>
                <span style={{
                  padding: "4px 14px", borderRadius: 12, fontSize: 12, fontWeight: "bold",
                  background: activeTrip.trip_status === "On hold" ? "#f5a62322" : "#0070f322",
                  color: activeTrip.trip_status === "On hold" ? "#f5a623" : "#0070f3"
                }}>
                  {activeTrip.trip_status}
                </span>
              </div>
            </div>

            {/* Previous Stops */}
            {stops.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <p style={{ fontWeight: "bold", marginBottom: 12, fontSize: isMobile ? 15 : 14, color: "#171717" }}>
                  Previous Stops ({stops.length})
                </p>
                {stops.map((stop, index) => (
                  <div key={stop.stop_id} style={{ ...cardStyle, marginBottom: 8 }}>
                    <p style={{ margin: 0, fontWeight: "bold", fontSize: 14, color: "#171717" }}>Stop {stops.length - index}</p>
                    <p style={{ margin: "4px 0 0", color: "#555", fontSize: 13 }}>{stop.stop_location}</p>
                    <p style={{ margin: "4px 0 0", color: "#888", fontSize: 12 }}>{stop.quantity_offloaded} bags · {new Date(stop.stop_time).toLocaleTimeString()}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {remaining > 0 && (
                <button onClick={() => setView("log-stop")} style={fullBtn("#0070f3")}>
                  Make a Stop
                </button>
              )}
              <button onClick={() => { setShowLoadMoreModal(true); setLoadMoreError("") }} style={outlineBtn("#0070f3")}>
                Load More Bags
              </button>
              <button onClick={() => { setShowDiscrepancyModal(true); setDiscError("") }} style={outlineBtn("#f5a623")}>
                Report Shortage / Caked Bags
              </button>
              <button
                onClick={() => setShowHoldConfirm(true)}
                style={outlineBtn(activeTrip.trip_status === "On hold" ? "#0070f3" : "#aaa")}
              >
                {activeTrip.trip_status === "On hold" ? "Resume Trip" : "Put Trip On Hold"}
              </button>
            </div>
          </div>
        )}

        {/* Log Stop View */}
        {view === "log-stop" && activeTrip && (
          <div>
            <button onClick={() => setView("active-trip")} style={{ background: "none", border: "none", color: "#0070f3", cursor: "pointer", marginBottom: 16, padding: 0, fontSize: isMobile ? 16 : 14 }}>
              ← Back
            </button>
            <StopForm tripId={activeTrip.trip_id} onStopLogged={handleStopLogged} />
          </div>
        )}

        {/* Buy Diesel View */}
        {view === "buy-diesel" && (
          <BuyDiesel driverId={driver?.driver_id ?? ""} onBack={() => setView("dashboard")} />
        )}

      </div>

      {/* ── MODALS ── */}

      {/* Complaint Modal */}
      {showComplaintModal && (
        <div style={modalOverlay}>
          <div onClick={e => e.stopPropagation()} style={modalBox}>
            {isMobile && <div style={{ width: 40, height: 4, background: "#ddd", borderRadius: 2, margin: "0 auto 20px" }} />}
            <h3 style={{ marginBottom: 20, color: "#171717" }}>Report an Issue</h3>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Truck *</label>
              <select value={complaintTruck} onChange={e => { setComplaintTruck(e.target.value); setComplaintError("") }} style={inputStyle}>
                <option value="">Select truck</option>
                {allTrucks.map(t => <option key={t.plate_number} value={t.plate_number}>{t.plate_number}{t.kbnl_truck_no ? ` · #${t.kbnl_truck_no}` : ""}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Issue Type *</label>
              <select value={complaintType} onChange={e => { setComplaintType(e.target.value); setComplaintError("") }} style={inputStyle}>
                <option value="">Select type</option>
                {COMPLAINT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={labelStyle}>Description *</label>
              <textarea
                placeholder="Describe the issue..."
                value={complaintNotes}
                onChange={e => { setComplaintNotes(e.target.value); setComplaintError("") }}
                rows={4}
                style={{ ...inputStyle, resize: "none", minHeight: 100 }}
              />
            </div>

            {complaintError && <p style={{ color: "red", fontSize: 13, marginBottom: 12 }}>{complaintError}</p>}

            <div style={{ display: "flex", gap: 8 }}>
              {!complaintPendingEndTrip && (
                <button onClick={() => { setShowComplaintModal(false); setComplaintType(""); setComplaintTruck(""); setComplaintNotes(""); setComplaintError("") }} style={{ flex: 1, padding: "12px 0", background: "white", border: "1px solid #ddd", borderRadius: 8, cursor: "pointer", fontSize: 15, minHeight: 48 }}>
                  Cancel
                </button>
              )}
              <button onClick={() => handleSubmitComplaint(complaintPendingEndTrip)} disabled={complaintSubmitting} style={{ ...fullBtn(complaintSubmitting ? "#ccc" : "#f5a623"), flex: 1 }}>
                {complaintSubmitting ? "Submitting..." : complaintPendingEndTrip ? "Submit & End Trip" : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* End Trip Modal */}
      {showEndConfirm && (
        <div style={modalOverlay}>
          <div onClick={e => e.stopPropagation()} style={modalBox}>
            {isMobile && <div style={{ width: 40, height: 4, background: "#ddd", borderRadius: 2, margin: "0 auto 20px" }} />}
            <h3 style={{ marginBottom: 12, color: "#171717" }}>All bags offloaded!</h3>
            <p style={{ marginBottom: 24, color: "#555", fontSize: isMobile ? 15 : 14 }}>
              All bags have been offloaded. Ready to end this trip?
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleEndTrip} disabled={submitting} style={{ ...fullBtn("#0070f3"), flex: 1 }}>
                {submitting ? "Ending..." : "End Trip"}
              </button>
              <button onClick={openComplaintFromEndTrip} style={{ ...outlineBtn("#f5a623"), flex: 1 }}>
                Lodge a Complaint
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hold Trip Modal */}
      {showHoldConfirm && (
        <div onClick={() => setShowHoldConfirm(false)} style={modalOverlay}>
          <div onClick={e => e.stopPropagation()} style={modalBox}>
            {isMobile && <div style={{ width: 40, height: 4, background: "#ddd", borderRadius: 2, margin: "0 auto 20px" }} />}
            <h3 style={{ marginBottom: 12, color: "#171717" }}>{activeTrip?.trip_status === "On hold" ? "Resume Trip?" : "Put Trip On Hold?"}</h3>
            <p style={{ marginBottom: 24, color: "#555", fontSize: isMobile ? 15 : 14 }}>
              {activeTrip?.trip_status === "On hold" ? "This will set your trip back to In Transit." : "This will pause your trip. You can resume it later."}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowHoldConfirm(false)} style={{ flex: 1, padding: "12px 0", background: "white", border: "1px solid #ddd", borderRadius: 8, cursor: "pointer", fontSize: 15, minHeight: 48 }}>
                Cancel
              </button>
              <button onClick={handleHoldTrip} disabled={submitting} style={{ ...fullBtn("#f5a623"), flex: 1 }}>
                {submitting ? "Updating..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discrepancy Modal */}
      {showDiscrepancyModal && (
        <div onClick={() => { setShowDiscrepancyModal(false); setDiscShortage(""); setDiscCaked(""); setDiscNotes(""); setDiscDropLocation(""); setDiscError("") }} style={modalOverlay}>
          <div onClick={e => e.stopPropagation()} style={modalBox}>
            {isMobile && <div style={{ width: 40, height: 4, background: "#ddd", borderRadius: 2, margin: "0 auto 20px" }} />}
            <h3 style={{ marginBottom: 8, color: "#171717" }}>Report Shortage / Caked Bags</h3>
            <p style={{ color: "#888", fontSize: 13, marginBottom: 20 }}>Remaining bags: <strong>{remaining}</strong></p>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Drop Location *</label>
              <select value={discDropLocation} onChange={e => { setDiscDropLocation(e.target.value); setDiscError("") }} style={inputStyle}>
                <option value="">Select location</option>
                {allStoreLocations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Shortage (bags)</label>
              <p style={{ margin: "0 0 6px", fontSize: 12, color: "#888" }}>Will be deducted from remaining</p>
              <input type="number" placeholder="0" value={discShortage} onChange={e => { setDiscShortage(e.target.value); setDiscError("") }} style={inputStyle} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Caked Bags</label>
              <p style={{ margin: "0 0 6px", fontSize: 12, color: "#888" }}>Logged for record only — returned to plant</p>
              <input type="number" placeholder="0" value={discCaked} onChange={e => { setDiscCaked(e.target.value); setDiscError("") }} style={inputStyle} />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={labelStyle}>Notes (optional)</label>
              <textarea placeholder="Any additional context..." value={discNotes} onChange={e => setDiscNotes(e.target.value)} rows={3} style={{ ...inputStyle, resize: "none" }} />
            </div>

            {discError && <p style={{ color: "red", fontSize: 13, marginBottom: 12 }}>{discError}</p>}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setShowDiscrepancyModal(false); setDiscShortage(""); setDiscCaked(""); setDiscNotes(""); setDiscDropLocation(""); setDiscError("") }} style={{ flex: 1, padding: "12px 0", background: "white", border: "1px solid #ddd", borderRadius: 8, cursor: "pointer", fontSize: 15, minHeight: 48 }}>
                Cancel
              </button>
              <button onClick={handleReportDiscrepancy} disabled={discSubmitting} style={{ ...fullBtn(discSubmitting ? "#ccc" : "#f5a623"), flex: 1 }}>
                {discSubmitting ? "Submitting..." : "Submit Report"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Load More Modal */}
      {showLoadMoreModal && (
        <div onClick={() => { setShowLoadMoreModal(false); setLoadMoreQty(""); setLoadMoreCategory(""); setLoadMoreLocationName(""); setLoadMoreProduct(""); setLoadMoreProductOptions([]); setLoadMoreError("") }} style={modalOverlay}>
          <div onClick={e => e.stopPropagation()} style={modalBox}>
            {isMobile && <div style={{ width: 40, height: 4, background: "#ddd", borderRadius: 2, margin: "0 auto 20px" }} />}
            <h3 style={{ marginBottom: 8, color: "#171717" }}>Load More Bags</h3>
            <p style={{ color: "#888", fontSize: 13, marginBottom: 20 }}>Current total: <strong>{activeTrip?.loaded_quantity} bags</strong></p>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Loading Point *</label>
              <select value={loadMoreCategory} onChange={e => handleLoadMoreCategoryChange(e.target.value)} style={inputStyle}>
                <option value="">Select loading point</option>
                <option value="Depot">Depot</option>
                <option value="Outlet">Outlet</option>
              </select>
            </div>
            {loadMoreCategory && (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>{loadMoreCategory} *</label>
                <select value={loadMoreLocationName} onChange={e => handleLoadMoreLocationChange(e.target.value)} style={inputStyle}>
                  <option value="">Select {loadMoreCategory.toLowerCase()}</option>
                  {LOADING_POINT_MAP[loadMoreCategory].map(loc => <option key={loc} value={loc}>{loc}</option>)}
                </select>
              </div>
            )}
            {loadMoreLocationName && (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Product *</label>
                <select value={loadMoreProduct} onChange={e => { setLoadMoreProduct(e.target.value); setLoadMoreError("") }} style={inputStyle}>
                  <option value="">Select product</option>
                  {loadMoreProductOptions.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            )}
            {loadMoreProduct && (
              <div style={{ marginBottom: 24 }}>
                <label style={labelStyle}>No. of Bags to Add *</label>
                <input ref={loadMoreRef} type="number" placeholder="e.g. 100" value={loadMoreQty} onChange={e => { setLoadMoreQty(e.target.value); setLoadMoreError("") }} onKeyDown={e => { if (e.key === "Enter") handleLoadMore() }} style={inputStyle} />
              </div>
            )}

            {loadMoreError && <p style={{ color: "red", fontSize: 13, marginBottom: 12 }}>{loadMoreError}</p>}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setShowLoadMoreModal(false); setLoadMoreQty(""); setLoadMoreCategory(""); setLoadMoreLocationName(""); setLoadMoreProduct(""); setLoadMoreProductOptions([]); setLoadMoreError("") }} style={{ flex: 1, padding: "12px 0", background: "white", border: "1px solid #ddd", borderRadius: 8, cursor: "pointer", fontSize: 15, minHeight: 48 }}>
                Cancel
              </button>
              <button onClick={handleLoadMore} disabled={loadMoreSubmitting} style={{ ...fullBtn(loadMoreSubmitting ? "#ccc" : "#0070f3"), flex: 1 }}>
                {loadMoreSubmitting ? "Saving..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}