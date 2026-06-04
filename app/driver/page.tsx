"use client"

import { useState, useEffect, useRef } from "react"
import { Icon } from "@iconify/react"
import { supabase } from "@/lib/supabase"
import StopForm from "@/components/StopForm"
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
type ATF = {
  request_id: string
  atf_code: string | null
  plate_number: string
  company_name: string
  litres: number
  rate_per_litre: number | null
  total_amount: number | null
  atf_status: "Authorised" | "Dispensed" | "Confirmed" | "Invalidated" | "Pending"
  requested_at: string
  invalidation_reason: string | null
}

const LOADING_POINT_MAP: Record<string, string[]> = {
  Factory: ["Lafarge (Unicem)", "Dangote BOCO"],
  Depot: ["Calabar Mini Depot", "Ikom Mini Depot", "Ogoja Warehouse", "Uyo Depot"],
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

const ATF_STATUS_CONFIG = {
  Authorised: { color: "#f5a623", bg: "#fff8e1", icon: "mdi:clock-outline", label: "Awaiting Dispensing" },
  Dispensed: { color: "#0070f3", bg: "#f0f7ff", icon: "mdi:gas-station-outline", label: "Dispensed — Confirm Receipt" },
  Confirmed: { color: "#00aa00", bg: "#f0fff4", icon: "mdi:check-circle", label: "Confirmed" },
  Invalidated: { color: "#ff4444", bg: "#fff0f0", icon: "mdi:close-circle", label: "Invalidated" },
  Pending: { color: "#888", bg: "#f5f5f5", icon: "mdi:clock-outline", label: "Pending Authorisation" },
}

export default function DriverDashboard() {
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"
  const isTablet = bp === "tablet"

  const [driver, setDriver] = useState<Driver | null>(null)
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null)
  const [stops, setStops] = useState<Stop[]>([])
  const [remaining, setRemaining] = useState(0)
  const [view, setView] = useState<"dashboard" | "start-trip" | "active-trip" | "log-stop" | "fuel">("dashboard")
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState("")

  // ATF
  const [atfs, setAtfs] = useState<ATF[]>([])
  const [activeATF, setActiveATF] = useState<ATF | null>(null)
  const [confirmingATF, setConfirmingATF] = useState(false)

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

    await fetchATFs(user.id)
    setLoading(false)
  }

  async function fetchATFs(driverId: string) {
    const { data: raw } = await supabase
      .from("fuel_requests")
      .select("request_id, atf_code, plate_number, company_id, litres, rate_per_litre, total_amount, atf_status, requested_at, invalidation_reason")
      .eq("driver_id", driverId)
      .order("requested_at", { ascending: false })
      .limit(20)

    if (!raw) return

    const enriched = await Promise.all(raw.map(async r => {
      const { data: company } = await supabase
        .from("fuel_companies").select("company_name").eq("company_id", r.company_id).single()
      return { ...r, company_name: company?.company_name ?? "Unknown" }
    }))

    setAtfs(enriched)
    const active = enriched.find(a => a.atf_status === "Authorised" || a.atf_status === "Dispensed")
    setActiveATF(active ?? null)
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

  async function handleConfirmReceipt() {
    if (!activeATF || !driver) return
    setConfirmingATF(true)
    await supabase.from("fuel_requests").update({
      atf_status: "Confirmed",
      confirmed_at: new Date().toISOString(),
      confirmed_by: driver.driver_id,
    }).eq("request_id", activeATF.request_id)
    setConfirmingATF(false)
    await fetchATFs(driver.driver_id)
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
  const maxW = isMobile ? "100%" : isTablet ? 560 : 480

  const fullBtn = (bg: string, color = "white"): React.CSSProperties => ({
    width: "100%", padding: isMobile ? "16px 0" : "14px 0",
    background: bg, color,
    border: "none",
    borderRadius: 10, fontSize: isMobile ? 16 : 15,
    cursor: "pointer", fontWeight: "bold", minHeight: 52,
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
  })

  const outlineBtn = (color: string): React.CSSProperties => ({
    width: "100%", padding: isMobile ? "14px 0" : "12px 0",
    background: "white", color, border: `1.5px solid ${color}`,
    borderRadius: 10, fontSize: isMobile ? 15 : 14,
    cursor: "pointer", minHeight: 48,
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
  })

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: isMobile ? "14px 12px" : "10px 12px",
    paddingRight: 36,
    boxSizing: "border-box", borderRadius: 8,
    border: "1.5px solid #e5e5e5", fontSize: isMobile ? 16 : 14,
    background: "white", color: "#171717",
    minHeight: isMobile ? 48 : 40,
    appearance: "none", WebkitAppearance: "none",
  }

  const labelStyle: React.CSSProperties = {
    fontWeight: "600", display: "block",
    marginBottom: 6, fontSize: isMobile ? 14 : 13, color: "#444"
  }

  const modalOverlay: React.CSSProperties = {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
    display: "flex", alignItems: isMobile ? "flex-end" : "center",
    justifyContent: "center", zIndex: 100
  }

  const modalBox: React.CSSProperties = {
    background: "white",
    borderRadius: isMobile ? "20px 20px 0 0" : 14,
    padding: isMobile ? "24px 20px 40px" : 32,
    width: isMobile ? "100%" : 380,
    maxWidth: "100%",
    maxHeight: isMobile ? "90vh" : "85vh",
    overflowY: "auto",
    boxShadow: "0 8px 32px rgba(0,0,0,0.2)"
  }

  const dragHandle = <div style={{ width: 40, height: 4, background: "#e0e0e0", borderRadius: 2, margin: "0 auto 20px" }} />

  const chevron = (
    <Icon icon="mdi:chevron-down" width={18} color="#aaa"
      style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
    />
  )

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "white" }}>
      <div style={{ textAlign: "center" }}>
        <Icon icon="mdi:loading" width={32} color="#0070f3" style={{ animation: "spin 1s linear infinite" }} />
        <p style={{ color: "#888", marginTop: 12, fontSize: 14 }}>Loading…</p>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  const hasPendingATF = !!activeATF

  return (
    <div style={{ fontFamily: "Arial, sans-serif", background: "#f7f7f7", minHeight: "100vh" }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <div style={{ maxWidth: maxW, margin: "0 auto", paddingBottom: 80 }}>

        {/* ── Header ── */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: "white", padding: isMobile ? "14px 16px" : "16px 24px",
          borderBottom: "1px solid #eee", position: "sticky", top: 0, zIndex: 10,
          boxShadow: "0 2px 8px rgba(0,0,0,0.05)", marginBottom: 20,
        }}>
          <div>
            <p style={{ margin: 0, fontSize: 11, color: "#aaa", fontWeight: "500", textTransform: "uppercase", letterSpacing: 0.5 }}>Driver</p>
            <p style={{ margin: "1px 0 0", fontWeight: "bold", fontSize: isMobile ? 15 : 14, color: "#171717" }}>{driver?.full_name}</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => { setComplaintPendingEndTrip(false); setShowComplaintModal(true) }}
              style={{ padding: isMobile ? "8px 12px" : "7px 14px", background: "#fff8e1", color: "#f5a623", border: "1.5px solid #f5a623", borderRadius: 8, cursor: "pointer", fontSize: 12, minHeight: 38, fontWeight: "bold", display: "flex", alignItems: "center", gap: 5 }}
            >
              <Icon icon="mdi:alert-circle-outline" width={15} />
              {!isMobile && "Report Issue"}
            </button>
            <button
              onClick={async () => { await supabase.auth.signOut(); window.location.href = "/login" }}
              style={{ padding: isMobile ? "8px 12px" : "7px 14px", background: "#fff0f0", color: "#ff4444", border: "1.5px solid #ff4444", borderRadius: 8, cursor: "pointer", fontSize: 12, minHeight: 38, display: "flex", alignItems: "center", gap: 5 }}
            >
              <Icon icon="mdi:logout" width={15} />
              {!isMobile && "Logout"}
            </button>
          </div>
        </div>

        <div style={{ padding: isMobile ? "0 16px" : "0 24px" }}>

          {/* ── Dashboard ── */}
          {view === "dashboard" && (
            <div style={{ paddingTop: isMobile ? 32 : 48 }}>
              <div style={{ marginBottom: 36, textAlign: "center" }}>
                <h2 style={{ margin: 0, fontSize: isMobile ? 24 : 22, color: "#171717", fontWeight: "bold" }}>
                  {activeTrip ? `Hey, ${driver?.full_name?.split(" ")[0]}` : "Ready to go?"}
                </h2>
                <p style={{ margin: "6px 0 0", color: "#888", fontSize: isMobile ? 15 : 14 }}>
                  {activeTrip ? `Trip in progress · ${activeTrip.plate_number}` : "No active trip. Start your day below."}
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <button onClick={() => setView(activeTrip ? "active-trip" : "start-trip")} style={fullBtn("#0070f3")}>
                  <Icon icon={activeTrip ? "mdi:truck-fast" : "mdi:truck-outline"} width={20} />
                  {activeTrip ? "Continue Trip" : "Start a Trip"}
                </button>

                {/* Fuel button */}
                <button onClick={() => setView("fuel")} style={{ ...outlineBtn("#0070f3"), position: "relative" }}>
                  <Icon icon="mdi:gas-station" width={18} />
                  Fuel
                  {hasPendingATF && (
                    <span style={{ position: "absolute", top: 10, right: 14, width: 8, height: 8, borderRadius: "50%", background: "#f5a623", border: "2px solid white" }} />
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ── Fuel View (ATF Teller) ── */}
          {view === "fuel" && (
            <div>
              <button onClick={() => setView("dashboard")} style={{ background: "none", border: "none", color: "#0070f3", cursor: "pointer", marginBottom: 20, padding: 0, fontSize: isMobile ? 15 : 14, display: "flex", alignItems: "center", gap: 4 }}>
                <Icon icon="mdi:arrow-left" width={18} /> Back
              </button>
              <h2 style={{ marginBottom: 6, color: "#171717", fontSize: isMobile ? 22 : 20 }}>Fuel</h2>
              <p style={{ margin: "0 0 24px", fontSize: 13, color: "#888" }}>
                Your Truck Officer initiates fuel requests on your behalf.
              </p>

              {/* Active ATF Teller */}
              {activeATF && (() => {
                const cfg = ATF_STATUS_CONFIG[activeATF.atf_status] ?? ATF_STATUS_CONFIG.Pending
                return (
                  <div style={{ background: cfg.bg, border: `1.5px solid ${cfg.color}33`, borderRadius: 16, padding: 20, marginBottom: 24 }}>
                    {/* Code */}
                    <div style={{ textAlign: "center", marginBottom: 20 }}>
                      <p style={{ margin: 0, fontSize: 11, color: cfg.color, textTransform: "uppercase", letterSpacing: 1, fontWeight: "600" }}>Authority to Fuel</p>
                      <p style={{ margin: "8px 0 4px", fontSize: 36, fontWeight: "bold", fontFamily: "monospace", letterSpacing: 4, color: "#171717" }}>
                        {activeATF.atf_code ?? "—"}
                      </p>
                      <p style={{ margin: 0, fontSize: 12, color: "#888" }}>
                        {activeATF.atf_code ? "Show this to the station manager" : "Awaiting Truck Admin authorisation"}
                      </p>
                    </div>

                    {/* Details grid */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                      <div style={{ background: "white", borderRadius: 8, padding: "10px 14px" }}>
                        <p style={{ margin: 0, fontSize: 11, color: "#aaa" }}>Truck</p>
                        <p style={{ margin: "2px 0 0", fontWeight: "bold", fontSize: 14, color: "#171717" }}>{activeATF.plate_number}</p>
                      </div>
                      <div style={{ background: "white", borderRadius: 8, padding: "10px 14px" }}>
                        <p style={{ margin: 0, fontSize: 11, color: "#aaa" }}>Station</p>
                        <p style={{ margin: "2px 0 0", fontWeight: "bold", fontSize: 14, color: "#171717" }}>{activeATF.company_name}</p>
                      </div>
                      <div style={{ background: "white", borderRadius: 8, padding: "10px 14px" }}>
                        <p style={{ margin: 0, fontSize: 11, color: "#aaa" }}>Litres</p>
                        <p style={{ margin: "2px 0 0", fontWeight: "bold", fontSize: 22, color: "#0070f3" }}>{activeATF.litres}L</p>
                      </div>
                      {activeATF.total_amount && (
                        <div style={{ background: "white", borderRadius: 8, padding: "10px 14px" }}>
                          <p style={{ margin: 0, fontSize: 11, color: "#aaa" }}>Total</p>
                          <p style={{ margin: "2px 0 0", fontWeight: "bold", fontSize: 18, color: "#00aa00" }}>₦{activeATF.total_amount.toLocaleString()}</p>
                        </div>
                      )}
                    </div>

                    {/* Status banner */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "white", borderRadius: 8, marginBottom: activeATF.atf_status === "Dispensed" ? 16 : 0 }}>
                      <Icon icon={cfg.icon} width={16} color={cfg.color} />
                      <p style={{ margin: 0, fontSize: 13, color: cfg.color, fontWeight: "bold" }}>{cfg.label}</p>
                    </div>

                    {/* Confirm button — only when Dispensed */}
                    {activeATF.atf_status === "Dispensed" && (
                      <button
                        onClick={handleConfirmReceipt}
                        disabled={confirmingATF}
                        style={{ width: "100%", padding: "16px 0", background: "#00aa00", color: "white", border: "none", borderRadius: 10, cursor: confirmingATF ? "not-allowed" : "pointer", fontWeight: "bold", fontSize: 17, minHeight: 56, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                      >
                        {confirmingATF
                          ? <><Icon icon="mdi:loading" width={18} style={{ animation: "spin 1s linear infinite" }} /> Confirming…</>
                          : <><Icon icon="mdi:check-circle" width={20} /> Confirm Receipt</>
                        }
                      </button>
                    )}
                  </div>
                )
              })()}

              {/* History */}
              {atfs.filter(a => a.atf_status === "Confirmed" || a.atf_status === "Invalidated").length > 0 && (
                <div>
                  <p style={{ fontWeight: "bold", fontSize: 14, color: "#171717", marginBottom: 12 }}>Recent History</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {atfs
                      .filter(a => a.atf_status === "Confirmed" || a.atf_status === "Invalidated")
                      .map(atf => {
                        const cfg = ATF_STATUS_CONFIG[atf.atf_status]
                        return (
                          <div key={atf.request_id} style={{ background: "white", border: "1px solid #eee", borderRadius: 12, padding: 16 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                              <div>
                                <p style={{ margin: 0, fontWeight: "bold", fontSize: 15, fontFamily: "monospace", letterSpacing: 2, color: "#171717" }}>{atf.atf_code}</p>
                                <p style={{ margin: "4px 0 0", fontSize: 12, color: "#888" }}>{atf.plate_number} · {atf.company_name}</p>
                                <p style={{ margin: "2px 0 0", fontSize: 11, color: "#aaa" }}>{new Date(atf.requested_at).toLocaleDateString()}</p>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 20, background: cfg.bg }}>
                                <Icon icon={cfg.icon} width={13} color={cfg.color} />
                                <span style={{ fontSize: 12, color: cfg.color, fontWeight: "bold" }}>{atf.atf_status}</span>
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                              <div style={{ flex: 1, background: "#f9f9f9", borderRadius: 6, padding: "8px 12px" }}>
                                <p style={{ margin: 0, fontSize: 11, color: "#aaa" }}>Litres</p>
                                <p style={{ margin: 0, fontWeight: "bold", fontSize: 14, color: "#171717" }}>{atf.litres}L</p>
                              </div>
                              {atf.total_amount && (
                                <div style={{ flex: 1, background: "#f9f9f9", borderRadius: 6, padding: "8px 12px" }}>
                                  <p style={{ margin: 0, fontSize: 11, color: "#aaa" }}>Total</p>
                                  <p style={{ margin: 0, fontWeight: "bold", fontSize: 14, color: "#0070f3" }}>₦{atf.total_amount.toLocaleString()}</p>
                                </div>
                              )}
                            </div>
                            {atf.atf_status === "Invalidated" && atf.invalidation_reason && (
                              <div style={{ marginTop: 10, padding: "8px 12px", background: "#fff0f0", borderRadius: 6 }}>
                                <p style={{ margin: 0, fontSize: 12, color: "#ff4444" }}>{atf.invalidation_reason}</p>
                              </div>
                            )}
                          </div>
                        )
                      })
                    }
                  </div>
                </div>
              )}

              {!activeATF && atfs.length === 0 && (
                <div style={{ textAlign: "center", paddingTop: 48, color: "#aaa" }}>
                  <Icon icon="mdi:gas-station-off" width={40} color="#ddd" />
                  <p style={{ marginTop: 12, fontSize: 14 }}>No fuel requests yet.</p>
                  <p style={{ fontSize: 13 }}>Your Truck Officer will initiate when needed.</p>
                </div>
              )}
            </div>
          )}

          {/* ── Start Trip ── */}
          {view === "start-trip" && (
            <div>
              <button onClick={() => { setView("dashboard"); setMessage("") }} style={{ background: "none", border: "none", color: "#0070f3", cursor: "pointer", marginBottom: 20, padding: 0, fontSize: isMobile ? 15 : 14, display: "flex", alignItems: "center", gap: 4 }}>
                <Icon icon="mdi:arrow-left" width={18} /> Back
              </button>
              <h2 style={{ marginBottom: 24, color: "#0070f3", fontSize: isMobile ? 22 : 20 }}>Start a Trip</h2>

              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Plate Number *</label>
                <div style={{ position: "relative" }}>
                  <select value={plateNumber} onChange={e => { setPlateNumber(e.target.value); setMessage("") }} style={inputStyle}>
                    <option value="">Select plate number</option>
                    {trucks.map(t => <option key={t.plate_number} value={t.plate_number}>{t.plate_number}{t.kbnl_truck_no ? ` · #${t.kbnl_truck_no}` : ""}</option>)}
                  </select>
                  {chevron}
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Loading Point Type *</label>
                <div style={{ position: "relative" }}>
                  <select value={loadingPointCategory} onChange={e => handleCategoryChange(e.target.value)} style={inputStyle}>
                    <option value="">Select loading point</option>
                    {Object.keys(LOADING_POINT_MAP).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                  {chevron}
                </div>
              </div>

              {loadingPointCategory && (
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>{loadingPointCategory} *</label>
                  <div style={{ position: "relative" }}>
                    <select value={loadingPointName} onChange={e => handleLoadingPointNameChange(e.target.value)} style={inputStyle}>
                      <option value="">Select {loadingPointCategory.toLowerCase()}</option>
                      {availableLocations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                    </select>
                    {chevron}
                  </div>
                </div>
              )}

              {showATC && loadingPointName && (
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>ATC Number *</label>
                  <input type="text" placeholder="Enter ATC number" value={atc} onChange={e => { setAtc(e.target.value); setMessage("") }} onKeyDown={e => { if (e.key === "Enter") loadedQtyRef.current?.focus() }} style={inputStyle} />
                </div>
              )}

              {loadingPointName && (
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Product *</label>
                  <div style={{ position: "relative" }}>
                    <select value={product} onChange={e => { setProduct(e.target.value); setMessage("") }} style={inputStyle}>
                      <option value="">Select product</option>
                      {productOptions.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    {chevron}
                  </div>
                </div>
              )}

              {product && (
                <div style={{ marginBottom: 24 }}>
                  <label style={labelStyle}>No. of Bags *</label>
                  <input ref={loadedQtyRef} type="number" placeholder="e.g. 600" value={loadedQuantity} onChange={e => { setLoadedQuantity(e.target.value); setMessage("") }} onKeyDown={e => { if (e.key === "Enter") handleStartTrip() }} style={inputStyle} />
                </div>
              )}

              {message && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#ff4444", marginBottom: 16, fontSize: 14 }}>
                  <Icon icon="mdi:alert-circle" width={16} />{message}
                </div>
              )}

              <button onClick={handleStartTrip} disabled={submitting} style={fullBtn(submitting ? "#ccc" : "#0070f3")}>
                {submitting
                  ? <><Icon icon="mdi:loading" width={18} style={{ animation: "spin 1s linear infinite" }} /> Starting…</>
                  : <><Icon icon="mdi:truck-check" width={18} /> Start Trip</>
                }
              </button>
            </div>
          )}

          {/* ── Active Trip ── */}
          {view === "active-trip" && activeTrip && (
            <div>
              <button onClick={() => setView("dashboard")} style={{ background: "none", border: "none", color: "#0070f3", cursor: "pointer", marginBottom: 20, padding: 0, fontSize: isMobile ? 15 : 14, display: "flex", alignItems: "center", gap: 4 }}>
                <Icon icon="mdi:arrow-left" width={18} /> Dashboard
              </button>
              <h2 style={{ marginBottom: 20, color: "#171717", fontSize: isMobile ? 22 : 20 }}>Active Trip</h2>

              {/* Trip card */}
              <div style={{ background: "white", border: "1px solid #eee", borderRadius: 14, padding: isMobile ? 16 : 20, marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  {[
                    { label: "Plate", value: activeTrip.plate_number },
                    { label: "Product", value: activeTrip.product },
                    { label: "Loading Point", value: activeTrip.material_centre },
                    { label: "Loaded", value: `${activeTrip.loaded_quantity} bags` },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p style={{ margin: 0, fontSize: 11, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</p>
                      <p style={{ margin: "3px 0 0", fontWeight: "bold", fontSize: isMobile ? 14 : 13, color: "#171717" }}>{value}</p>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 16, padding: "12px 16px", background: remaining === 0 ? "#fff0f0" : remaining < activeTrip.loaded_quantity * 0.2 ? "#fff8e1" : "#f0fff4", borderRadius: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <p style={{ margin: 0, fontSize: 13, color: "#888", display: "flex", alignItems: "center", gap: 5 }}>
                    <Icon icon="mdi:package-variant" width={15} /> Remaining
                  </p>
                  <p style={{ margin: 0, fontWeight: "bold", fontSize: isMobile ? 28 : 24, color: remaining === 0 ? "#ff4444" : remaining < activeTrip.loaded_quantity * 0.2 ? "#f5a623" : "#00aa00" }}>
                    {remaining} <span style={{ fontSize: 13, fontWeight: "normal", color: "#aaa" }}>bags</span>
                  </p>
                </div>

                <div style={{ marginTop: 12, textAlign: "center" }}>
                  <span style={{ padding: "4px 14px", borderRadius: 20, fontSize: 12, fontWeight: "bold", background: activeTrip.trip_status === "On hold" ? "#fff8e1" : "#f0f7ff", color: activeTrip.trip_status === "On hold" ? "#f5a623" : "#0070f3" }}>
                    {activeTrip.trip_status}
                  </span>
                </div>
              </div>

              {/* Stops */}
              {stops.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <p style={{ fontWeight: "bold", marginBottom: 12, fontSize: isMobile ? 15 : 14, color: "#171717" }}>Previous Stops ({stops.length})</p>
                  {stops.map((stop, index) => (
                    <div key={stop.stop_id} style={{ background: "white", border: "1px solid #eee", borderRadius: 10, padding: "12px 16px", marginBottom: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 28, height: 28, borderRadius: 7, background: "#f0f7ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Icon icon="mdi:map-marker" width={15} color="#0070f3" />
                          </div>
                          <div>
                            <p style={{ margin: 0, fontWeight: "bold", fontSize: 13, color: "#171717" }}>Stop {stops.length - index}</p>
                            <p style={{ margin: "2px 0 0", color: "#555", fontSize: 12 }}>{stop.stop_location}</p>
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <p style={{ margin: 0, fontWeight: "bold", fontSize: 13, color: "#0070f3" }}>{stop.quantity_offloaded} bags</p>
                          <p style={{ margin: "2px 0 0", color: "#aaa", fontSize: 11 }}>{new Date(stop.stop_time).toLocaleTimeString()}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {remaining > 0 && (
                  <button onClick={() => setView("log-stop")} style={fullBtn("#0070f3")}>
                    <Icon icon="mdi:map-marker-plus" width={18} /> Make a Stop
                  </button>
                )}
                <button onClick={() => { setShowLoadMoreModal(true); setLoadMoreError("") }} style={outlineBtn("#0070f3")}>
                  <Icon icon="mdi:plus-box-outline" width={18} /> Load More Bags
                </button>
                <button onClick={() => { setShowDiscrepancyModal(true); setDiscError("") }} style={outlineBtn("#f5a623")}>
                  <Icon icon="mdi:alert-outline" width={18} /> Report Shortage / Caked Bags
                </button>
                <button onClick={() => setShowHoldConfirm(true)} style={outlineBtn(activeTrip.trip_status === "On hold" ? "#0070f3" : "#999")}>
                  <Icon icon={activeTrip.trip_status === "On hold" ? "mdi:play-circle-outline" : "mdi:pause-circle-outline"} width={18} />
                  {activeTrip.trip_status === "On hold" ? "Resume Trip" : "Put Trip On Hold"}
                </button>
              </div>
            </div>
          )}

          {/* ── Log Stop ── */}
          {view === "log-stop" && activeTrip && (
            <div>
              <button onClick={() => setView("active-trip")} style={{ background: "none", border: "none", color: "#0070f3", cursor: "pointer", marginBottom: 20, padding: 0, fontSize: isMobile ? 15 : 14, display: "flex", alignItems: "center", gap: 4 }}>
                <Icon icon="mdi:arrow-left" width={18} /> Back
              </button>
              <StopForm tripId={activeTrip.trip_id} onStopLogged={handleStopLogged} />
            </div>
          )}

        </div>
      </div>

      {/* ══ MODALS ══ */}

      {/* Complaint */}
      {showComplaintModal && (
        <div style={modalOverlay}>
          <div onClick={e => e.stopPropagation()} style={modalBox}>
            {isMobile && dragHandle}
            <h3 style={{ marginBottom: 6, color: "#171717" }}>Report an Issue</h3>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: "#888" }}>This will be reviewed by management</p>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Truck *</label>
              <div style={{ position: "relative" }}>
                <select value={complaintTruck} onChange={e => { setComplaintTruck(e.target.value); setComplaintError("") }} style={inputStyle}>
                  <option value="">Select truck</option>
                  {allTrucks.map(t => <option key={t.plate_number} value={t.plate_number}>{t.plate_number}{t.kbnl_truck_no ? ` · #${t.kbnl_truck_no}` : ""}</option>)}
                </select>
                {chevron}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Issue Type *</label>
              <div style={{ position: "relative" }}>
                <select value={complaintType} onChange={e => { setComplaintType(e.target.value); setComplaintError("") }} style={inputStyle}>
                  <option value="">Select type</option>
                  {COMPLAINT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                {chevron}
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Description *</label>
              <textarea placeholder="Describe the issue…" value={complaintNotes} onChange={e => { setComplaintNotes(e.target.value); setComplaintError("") }} rows={4} style={{ ...inputStyle, resize: "none", minHeight: 100, paddingRight: 12 }} />
            </div>

            {complaintError && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#ff4444", marginBottom: 12, fontSize: 13 }}>
                <Icon icon="mdi:alert-circle" width={15} />{complaintError}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              {!complaintPendingEndTrip && (
                <button onClick={() => { setShowComplaintModal(false); setComplaintType(""); setComplaintTruck(""); setComplaintNotes(""); setComplaintError("") }} style={{ flex: 1, padding: "13px 0", background: "white", border: "1.5px solid #e5e5e5", borderRadius: 10, cursor: "pointer", fontSize: 15, minHeight: 50, color: "#171717" }}>
                  Cancel
                </button>
              )}
              <button onClick={() => handleSubmitComplaint(complaintPendingEndTrip)} disabled={complaintSubmitting} style={{ ...fullBtn(complaintSubmitting ? "#ccc" : "#f5a623"), flex: 1 }}>
                {complaintSubmitting
                  ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} /> Submitting…</>
                  : complaintPendingEndTrip ? "Submit & End Trip" : "Submit"
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* End Trip */}
      {showEndConfirm && (
        <div style={modalOverlay}>
          <div onClick={e => e.stopPropagation()} style={modalBox}>
            {isMobile && dragHandle}
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ width: 56, height: 56, background: "#f0fff4", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                <Icon icon="mdi:check-circle" width={28} color="#00aa00" />
              </div>
              <h3 style={{ margin: 0, color: "#171717" }}>All bags offloaded!</h3>
              <p style={{ margin: "8px 0 0", color: "#888", fontSize: 13 }}>Ready to end this trip?</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleEndTrip} disabled={submitting} style={{ ...fullBtn("#0070f3"), flex: 1 }}>
                {submitting ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} /> Ending…</> : <><Icon icon="mdi:flag-checkered" width={18} /> End Trip</>}
              </button>
              <button onClick={openComplaintFromEndTrip} style={{ ...outlineBtn("#f5a623"), flex: 1 }}>
                <Icon icon="mdi:alert-circle-outline" width={16} /> Lodge Complaint
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hold Trip */}
      {showHoldConfirm && (
        <div onClick={() => setShowHoldConfirm(false)} style={modalOverlay}>
          <div onClick={e => e.stopPropagation()} style={modalBox}>
            {isMobile && dragHandle}
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ width: 56, height: 56, background: "#fff8e1", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                <Icon icon={activeTrip?.trip_status === "On hold" ? "mdi:play-circle" : "mdi:pause-circle"} width={28} color="#f5a623" />
              </div>
              <h3 style={{ margin: 0, color: "#171717" }}>{activeTrip?.trip_status === "On hold" ? "Resume Trip?" : "Put Trip On Hold?"}</h3>
              <p style={{ margin: "8px 0 0", color: "#888", fontSize: 13 }}>{activeTrip?.trip_status === "On hold" ? "Sets trip back to In Transit." : "Pauses your trip until resumed."}</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowHoldConfirm(false)} style={{ flex: 1, padding: "13px 0", background: "white", border: "1.5px solid #e5e5e5", borderRadius: 10, cursor: "pointer", fontSize: 15, minHeight: 50, color: "#171717" }}>Cancel</button>
              <button onClick={handleHoldTrip} disabled={submitting} style={{ ...fullBtn("#f5a623"), flex: 1 }}>
                {submitting ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} /> Updating…</> : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discrepancy */}
      {showDiscrepancyModal && (
        <div onClick={() => { setShowDiscrepancyModal(false); setDiscShortage(""); setDiscCaked(""); setDiscNotes(""); setDiscDropLocation(""); setDiscError("") }} style={modalOverlay}>
          <div onClick={e => e.stopPropagation()} style={modalBox}>
            {isMobile && dragHandle}
            <h3 style={{ marginBottom: 4, color: "#171717" }}>Report Shortage / Caked Bags</h3>
            <p style={{ color: "#888", fontSize: 13, marginBottom: 20 }}>Remaining: <strong style={{ color: "#171717" }}>{remaining} bags</strong></p>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Drop Location *</label>
              <div style={{ position: "relative" }}>
                <select value={discDropLocation} onChange={e => { setDiscDropLocation(e.target.value); setDiscError("") }} style={inputStyle}>
                  <option value="">Select location</option>
                  {allStoreLocations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                </select>
                {chevron}
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Shortage (bags)</label>
              <p style={{ margin: "0 0 6px", fontSize: 12, color: "#aaa" }}>Will be deducted from remaining</p>
              <input type="number" placeholder="0" value={discShortage} onChange={e => { setDiscShortage(e.target.value); setDiscError("") }} style={inputStyle} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Caked Bags</label>
              <p style={{ margin: "0 0 6px", fontSize: 12, color: "#aaa" }}>Logged for record only</p>
              <input type="number" placeholder="0" value={discCaked} onChange={e => { setDiscCaked(e.target.value); setDiscError("") }} style={inputStyle} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Notes (optional)</label>
              <textarea placeholder="Any additional context…" value={discNotes} onChange={e => setDiscNotes(e.target.value)} rows={3} style={{ ...inputStyle, resize: "none", paddingRight: 12 }} />
            </div>

            {discError && <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#ff4444", marginBottom: 12, fontSize: 13 }}><Icon icon="mdi:alert-circle" width={15} />{discError}</div>}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setShowDiscrepancyModal(false); setDiscShortage(""); setDiscCaked(""); setDiscNotes(""); setDiscDropLocation(""); setDiscError("") }} style={{ flex: 1, padding: "13px 0", background: "white", border: "1.5px solid #e5e5e5", borderRadius: 10, cursor: "pointer", fontSize: 15, minHeight: 50, color: "#171717" }}>Cancel</button>
              <button onClick={handleReportDiscrepancy} disabled={discSubmitting} style={{ ...fullBtn(discSubmitting ? "#ccc" : "#f5a623"), flex: 1 }}>
                {discSubmitting ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} /> Submitting…</> : "Submit Report"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Load More */}
      {showLoadMoreModal && (
        <div onClick={() => { setShowLoadMoreModal(false); setLoadMoreQty(""); setLoadMoreCategory(""); setLoadMoreLocationName(""); setLoadMoreProduct(""); setLoadMoreProductOptions([]); setLoadMoreError("") }} style={modalOverlay}>
          <div onClick={e => e.stopPropagation()} style={modalBox}>
            {isMobile && dragHandle}
            <h3 style={{ marginBottom: 4, color: "#171717" }}>Load More Bags</h3>
            <p style={{ color: "#888", fontSize: 13, marginBottom: 20 }}>Current total: <strong style={{ color: "#171717" }}>{activeTrip?.loaded_quantity} bags</strong></p>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Loading Point Type *</label>
              <div style={{ position: "relative" }}>
                <select value={loadMoreCategory} onChange={e => handleLoadMoreCategoryChange(e.target.value)} style={inputStyle}>
                  <option value="">Select loading point</option>
                  <option value="Depot">Depot</option>
                  <option value="Outlet">Outlet</option>
                </select>
                {chevron}
              </div>
            </div>
            {loadMoreCategory && (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>{loadMoreCategory} *</label>
                <div style={{ position: "relative" }}>
                  <select value={loadMoreLocationName} onChange={e => handleLoadMoreLocationChange(e.target.value)} style={inputStyle}>
                    <option value="">Select {loadMoreCategory.toLowerCase()}</option>
                    {LOADING_POINT_MAP[loadMoreCategory].map(loc => <option key={loc} value={loc}>{loc}</option>)}
                  </select>
                  {chevron}
                </div>
              </div>
            )}
            {loadMoreLocationName && (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Product *</label>
                <div style={{ position: "relative" }}>
                  <select value={loadMoreProduct} onChange={e => { setLoadMoreProduct(e.target.value); setLoadMoreError("") }} style={inputStyle}>
                    <option value="">Select product</option>
                    {loadMoreProductOptions.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  {chevron}
                </div>
              </div>
            )}
            {loadMoreProduct && (
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>No. of Bags to Add *</label>
                <input type="number" placeholder="e.g. 100" value={loadMoreQty} onChange={e => { setLoadMoreQty(e.target.value); setLoadMoreError("") }} onKeyDown={e => { if (e.key === "Enter") handleLoadMore() }} style={inputStyle} />
              </div>
            )}

            {loadMoreError && <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#ff4444", marginBottom: 12, fontSize: 13 }}><Icon icon="mdi:alert-circle" width={15} />{loadMoreError}</div>}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setShowLoadMoreModal(false); setLoadMoreQty(""); setLoadMoreCategory(""); setLoadMoreLocationName(""); setLoadMoreProduct(""); setLoadMoreProductOptions([]); setLoadMoreError("") }} style={{ flex: 1, padding: "13px 0", background: "white", border: "1.5px solid #e5e5e5", borderRadius: 10, cursor: "pointer", fontSize: 15, minHeight: 50, color: "#171717" }}>Cancel</button>
              <button onClick={handleLoadMore} disabled={loadMoreSubmitting} style={{ ...fullBtn(loadMoreSubmitting ? "#ccc" : "#0070f3"), flex: 1 }}>
                {loadMoreSubmitting ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} /> Saving…</> : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}