"use client"

import { useState, useEffect, useRef } from "react"

import { Icon } from "@iconify/react"
import { supabase } from "@/lib/supabase"
import { apiMutate } from "@/lib/api-mutation"
import RoleSwitcher from "@/components/RoleSwitcher"
import StopForm from "@/components/StopForm"
import ModernInput from "@/components/ModernInput"
import TripOfflineIndicator from "@/components/TripOfflineIndicator"
import { useBreakpoint } from "@/app/hooks/useBreakpoint"
import { useOfflineTripAction } from "@/app/hooks/useOfflineTripAction"
import { initTripActionAutoSync } from "@/lib/offline/tripActionSync"
import { clearOfflineTripData } from '@/lib/offline/tripsDb'

type Driver = { driver_id: string; full_name: string; profile_picture_url?: string }
type Trip = {
  trip_id: string
  plate_number: string
  product: string
  material_centre: string
  loaded_quantity: number
  trip_status: string
  atc: string | null
  amount_charged: number | null
  payment_mode: string | null
}
type Stop = {
  stop_id: string
  stop_location: string
  quantity_offloaded: number
  stop_time: string
}
type Truck = { plate_number: string; kbnl_truck_no?: string; truck_size: string | null }
type LoadMoreEntry = {
  id: string
  quantity: number
  loading_point_type: string
  loading_point_name: string
  product: string
  created_at: string
}

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

type ViewType = "dashboard" | "start-trip" | "active-trip" | "log-stop" | "fuel"

const LOADING_POINT_MAP: Record<string, string[]> = {
  Factory: ["Lafarge Mfamosing", "Lafarge Uyo Warehouse"],
  Depot: ["Calabar Mini Depot", "Ikom Mini Depot", "Ogoja Depot", "Uyo Depot"],
  Outlet: ["Brooks Outlet", "Urua Ekpa Outlet", "Urua Nyemeiko Outlet", "Reserve Store", "E1 Outlet", "Ogoja Outlet"],
}

const FACTORY_PRODUCTS: Record<string, string[]> = {
  "Lafarge Mfamosing": ["Classic", "Supaset", "Supafix"],
  "Lafarge Uyo Warehouse": ["Classic", "Supaset", "Supafix"],
}

const COMPLAINT_TYPES = [
  "Breakdown", "Tyre Blowout", "Accident", "Police / Checkpoint Issue",
  "Fuel Problem", "Mechanical Fault", "Road Blockage", "Other",
]

const ATF_STATUS_CONFIG = {
  Authorised: { color: "#f5a623", bg: "#fff8e1", icon: "mdi:clock-outline", label: "Awaiting Dispensing" },
  Dispensed: { color: "#0070f3", bg: "#f0f7ff", icon: "mdi:gas-station-outline", label: "Dispensed — Confirm Receipt" },
  Confirmed: { color: "#16a34a", bg: "#f0fff4", icon: "mdi:check-circle", label: "Confirmed" },
  Invalidated: { color: "#ef4444", bg: "#fef2f2", icon: "mdi:close-circle", label: "Invalidated" },
  Pending: { color: "#94a3b8", bg: "#f8fafc", icon: "mdi:clock-outline", label: "Pending Authorisation" },
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

export default function DriverDashboard() {
  const [view, setView] = useState<ViewType>("dashboard")
  
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"

  const { submitAction, isSubmitting: isOfflineSubmitting, isOnline } = useOfflineTripAction()

  const fileInputRef = useRef<HTMLInputElement>(null)

  const [driver, setDriver] = useState<Driver | null>(null)
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null)
  const [stops, setStops] = useState<Stop[]>([])
  const [remaining, setRemaining] = useState(0)
  const [offloadedSoFar, setOffloadedSoFar] = useState(0)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState("")

  // ATF
  const [loadMoreEntries, setLoadMoreEntries] = useState<LoadMoreEntry[]>([])
  const [atfs, setAtfs] = useState<ATF[]>([])
  const [activeATF, setActiveATF] = useState<ATF | null>(null)
  const [confirmingATF, setConfirmingATF] = useState(false)

  // Modals
  const [showEndConfirm, setShowEndConfirm] = useState(false)
  const [showHoldConfirm, setShowHoldConfirm] = useState(false)
  const [showDiscrepancyModal, setShowDiscrepancyModal] = useState(false)
  const [showComplaintModal, setShowComplaintModal] = useState(false)
  const [showLoadMoreModal, setShowLoadMoreModal] = useState(false)
  const [showPictureModal, setShowPictureModal] = useState(false)

  // Discrepancy
  const [discrepancyType, setDiscrepancyType] = useState<'shortage' | 'caked'>('shortage')
  const [discShortage, setDiscShortage] = useState("")
  const [discCaked, setDiscCaked] = useState("")
  const [discNotes, setDiscNotes] = useState("")
  const [discDropLocation, setDiscDropLocation] = useState("")
  const [discCustomDropLocation, setDiscCustomDropLocation] = useState("")
  const [discError, setDiscError] = useState("")
  const [discSubmitting, setDiscSubmitting] = useState(false)

  // Complaint
  const [complaintType, setComplaintType] = useState("")
  const [complaintTruck, setComplaintTruck] = useState("")
  const [complaintNotes, setComplaintNotes] = useState("")
  const [complaintError, setComplaintError] = useState("")
  const [complaintSubmitting, setComplaintSubmitting] = useState(false)
  const [complaintPendingEndTrip, setComplaintPendingEndTrip] = useState(false)
  const [showMyComplaints, setShowMyComplaints] = useState(false)
  const [complaintsRefreshKey, setComplaintsRefreshKey] = useState(0)
  const [myComplaints, setMyComplaints] = useState<{ complaint_id: string; complaint_type: string; notes: string; plate_number: string; reported_at: string; resolved: boolean }[]>([])
  const [fetchingComplaints, setFetchingComplaints] = useState(false)
  const [resolvingComplaintId, setResolvingComplaintId] = useState<string | null>(null)

  // Load more
  const [loadMoreQty, setLoadMoreQty] = useState("")
  const [loadMoreCategory, setLoadMoreCategory] = useState("")
  const [loadMoreLocationName, setLoadMoreLocationName] = useState("")
  const [loadMoreProduct, setLoadMoreProduct] = useState("")
  const [loadMoreProductOptions, setLoadMoreProductOptions] = useState<string[]>([])
  const [loadMoreError, setLoadMoreError] = useState("")
  const [loadMoreSubmitting, setLoadMoreSubmitting] = useState(false)

  // Start trip
  const [truckSize, setTruckSize] = useState("")
  const [plateNumber, setPlateNumber] = useState("")
  const [loadingPointCategory, setLoadingPointCategory] = useState("")
  const [loadingPointName, setLoadingPointName] = useState("")
  const [product, setProduct] = useState("")
  const [loadedQuantity, setLoadedQuantity] = useState("")
  const [atc, setAtc] = useState("")
  const [amountCharged, setAmountCharged] = useState("")
  const [paymentMode, setPaymentMode] = useState("")
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [allTrucks, setAllTrucks] = useState<Truck[]>([])
  const [productOptions, setProductOptions] = useState<string[]>([])
  const [allProducts, setAllProducts] = useState<string[]>([])

  // Profile picture upload
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [picturePreview, setPicturePreview] = useState<string | null>(null)
  const [pictureLoading, setPictureLoading] = useState(false)
  const [pictureError, setPictureError] = useState("")

  const loadedQtyRef = useRef<HTMLInputElement | null>(null)
  const allStoreLocations = [...LOADING_POINT_MAP.Depot, ...LOADING_POINT_MAP.Outlet]

  useEffect(() => {
    initTripActionAutoSync()
  }, [])

  useEffect(() => { initDriver() }, [])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") window.location.href = "/login"
    })
    return () => subscription.unsubscribe()
  }, [])

  // Sync initial view from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const viewParam = params.get('view') as ViewType | null
    if (viewParam && ["dashboard", "start-trip", "active-trip", "log-stop", "fuel"].includes(viewParam)) {
      setView(viewParam)
    }
  }, [])

  // Handle browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search)
      const viewParam = params.get('view') as ViewType | null
      if (viewParam && ["dashboard", "start-trip", "active-trip", "log-stop", "fuel"].includes(viewParam)) {
        setView(viewParam)
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  function navigateTo(newView: ViewType) {
    setView(newView)
    window.history.pushState(null, '', `/driver?view=${newView}`)
  }

  async function initDriver() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.href = "/login"; return }
    const user = session.user

    const { data: profile } = await supabase
      .from("Profiles").select("full_name").eq("user_id", user.id).single()

    const { data: driverData } = await supabase
      .from("Drivers").select("driver_id, full_name, profile_picture_url").eq("driver_id", user.id).single()

    if (driverData) {
      setDriver(driverData)
    } else if (profile) {
      setDriver({ driver_id: user.id, full_name: profile.full_name })
    }

    const { data: tripData } = await supabase
      .from("Trips").select("*").eq("driver_id", user.id)
      .in("trip_status", ["In transit", "On hold"]).single()

    if (tripData) {
      setActiveTrip(tripData)
      await Promise.all([
        fetchStops(tripData.trip_id, tripData.loaded_quantity),
        fetchLoadMoreEntries(tripData.trip_id),
      ])
    }

    const { data: activePlates } = await supabase
      .from("Trips").select("plate_number").in("trip_status", ["In transit", "On hold"])
    const usedPlates = activePlates?.map(t => t.plate_number) || []

    const { data: trucksData } = await supabase
      .from("Trucks").select("plate_number, kbnl_truck_no, truck_size").eq("status", "Empty")
    const available = (trucksData || []).filter(t => !usedPlates.includes(t.plate_number))
    let merged: Truck[] = [...available]

    const { data: tricyclesData } = await supabase
      .from("tricycles").select("tricycle_number, assigned_to")
    const availableTricycles: Truck[] = (tricyclesData || [])
      .filter(t => !usedPlates.includes(t.tricycle_number))
      .map(t => ({ plate_number: t.tricycle_number, kbnl_truck_no: t.assigned_to, truck_size: "Tricycle" }))
    merged = [...merged, ...availableTricycles]

    setTrucks(merged)
    setAllTrucks([...(trucksData || []), ...availableTricycles])

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
    try {
      const { data: stopsData } = await supabase
        .from("Stops").select("stop_id, stop_location, quantity_offloaded, stop_time")
        .eq("trip_id", tripId).order("stop_time", { ascending: false })

      const { data: discData } = await supabase
        .from("trip_discrepancies").select("shortage").eq("trip_id", tripId)

      const stopList = stopsData || []
      setStops(stopList)

      const totalOffloaded = stopList.reduce((sum, s) => sum + s.quantity_offloaded, 0)
      const totalShortage = (discData || []).reduce((sum, d) => sum + (d.shortage || 0), 0)
      const total = totalOffloaded + totalShortage
      
      setOffloadedSoFar(total)
      
      const rem = loadedQty - total
      setRemaining(rem)
      if (rem <= 0 && tripId) setShowEndConfirm(true)
    } catch (error) {
      console.warn('[fetchStops] Network error, keeping local state', error)
    }
  }

  async function fetchLoadMoreEntries(tripId: string) {
    const { data } = await supabase
      .from("trip_load_more")
      .select("id, quantity, loading_point_type, loading_point_name, product, created_at")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: false })

    setLoadMoreEntries(data || [])
  }

  async function handleConfirmReceipt() {
    if (!activeATF || !driver) return
    setConfirmingATF(true)
    await apiMutate("fuel", {
      action: "update",
      table: "fuel_requests",
      data: {
        atf_status: "Confirmed",
        confirmed_at: new Date().toISOString(),
        confirmed_by: driver.driver_id,
      },
      filters: { request_id: activeATF.request_id },
    })
    setConfirmingATF(false)
    await fetchATFs(driver.driver_id)
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
    if (!selectedFile || !driver) {
      setPictureError("Please select an image")
      return
    }

    setPictureLoading(true)
    setPictureError("")

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setPictureError("Session expired"); setPictureLoading(false); return }

      const fileExt = selectedFile.name.split(".").pop()
      const fileName = `${driver.driver_id}-${Date.now()}.${fileExt}`
      const filePath = `${driver.driver_id}/${fileName}`

      if (driver.profile_picture_url) {
        const oldPath = driver.profile_picture_url.split("/").slice(-2).join("/")
        await supabase.storage.from("profile-pictures").remove([oldPath])
      }

      const { error: uploadError } = await supabase.storage
        .from("profile-pictures")
        .upload(filePath, selectedFile, { upsert: false })

      if (uploadError) { setPictureError("Upload failed"); setPictureLoading(false); return }

      const { data: { publicUrl } } = supabase.storage
        .from("profile-pictures")
        .getPublicUrl(filePath)

      const { error: updateError } = await apiMutate("admin", { action: "update", table: "Drivers", data: { profile_picture_url: publicUrl }, filters: { driver_id: driver.driver_id } })

      if (updateError) { setPictureError("Failed to save profile"); setPictureLoading(false); return }

      setDriver({ ...driver, profile_picture_url: publicUrl })

      setPictureLoading(false)
      setShowPictureModal(false)
      setSelectedFile(null)
      setPicturePreview(null)
    } catch (err) {
      setPictureError("Something went wrong")
      setPictureLoading(false)
    }
  }

  function handleCategoryChange(cat: string) {
    setLoadingPointCategory(cat); setLoadingPointName(""); setProduct(""); setAtc(""); setAmountCharged(""); setPaymentMode(""); setMessage("")
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

  const isDinaOrTricycle = truckSize === "Dina" || truckSize === "Tricycle"
  const showATC = loadingPointCategory === "Factory" && !isDinaOrTricycle
  const availableLocations = LOADING_POINT_MAP[loadingPointCategory] || []

  async function handleStartTrip() {
    if (!truckSize) return setMessage("Select a truck size")
    if (!plateNumber) return setMessage("Select a plate number")
    if (!loadingPointCategory) return setMessage("Select a loading point type")
    if (!loadingPointName) return setMessage("Select a loading point")
    if (showATC && !atc.trim()) return setMessage("ATC number is required")
    if (isDinaOrTricycle && !amountCharged) return setMessage("Enter amount charged")
    if (isDinaOrTricycle && !paymentMode) return setMessage("Select payment mode")
    if (!product) return setMessage("Select a product")
    if (!loadedQuantity) return setMessage("Enter no. of bags")

    setSubmitting(true)
    const { data, error } = await apiMutate("trips", {
      action: "insert",
      table: "Trips",
      data: {
        driver_id: driver?.driver_id, plate_number: plateNumber, product,
        material_centre: loadingPointName, loaded_quantity: parseInt(loadedQuantity),
        ATC: showATC ? atc.trim() : null,
        amount_charged: isDinaOrTricycle ? parseFloat(amountCharged) : null,
        payment_mode: isDinaOrTricycle ? paymentMode : null,
        trip_status: "In transit",
      },
    })

    if (error || !data || !Array.isArray(data) || data.length === 0) { setMessage("Failed to start trip"); setSubmitting(false); return }
    if (truckSize !== "Tricycle") {
      await apiMutate("trips", { action: "update", table: "Trucks", data: { status: "Loaded" }, filters: { plate_number: plateNumber } })
    }
    setActiveTrip(data[0]); setRemaining(parseInt(loadedQuantity)); setOffloadedSoFar(0); setStops([]); setLoadMoreEntries([])
    setSubmitting(false); setShowEndConfirm(false); setMessage(""); navigateTo("active-trip")
  }

  async function handleEndTrip() {
    if (!activeTrip) return
    setSubmitting(true)

    await clearOfflineTripData(activeTrip.trip_id);
    await apiMutate("trips", { action: "update", table: "Trips", data: { trip_status: "Completed", updated_at: new Date().toISOString() }, filters: { trip_id: activeTrip.trip_id } })
    await apiMutate("trips", { action: "update", table: "Trucks", data: { status: "Empty" }, filters: { plate_number: activeTrip.plate_number } })
    setSubmitting(false); setShowEndConfirm(false); setActiveTrip(null); setStops([]); setLoadMoreEntries([]); setRemaining(0); setOffloadedSoFar(0); navigateTo("dashboard")
  }

  async function handleHoldTrip() {
    if (!activeTrip) return
    setSubmitting(true)
    const newStatus = activeTrip.trip_status === "On hold" ? "In transit" : "On hold"
    await apiMutate("trips", { action: "update", table: "Trips", data: { trip_status: newStatus }, filters: { trip_id: activeTrip.trip_id } })
    setActiveTrip({ ...activeTrip, trip_status: newStatus }); setSubmitting(false); setShowHoldConfirm(false)
  }

  async function handleReportDiscrepancy() {
    const shortage = parseInt(discShortage) || 0
    const caked = parseInt(discCaked) || 0

    if (discrepancyType === 'shortage') {
      if (shortage === 0) return setDiscError("Enter shortage bags count")
      if (shortage < 0) return setDiscError("Values cannot be negative")
      if (shortage > remaining) return setDiscError(`Shortage cannot exceed remaining bags (${remaining})`)
    } else {
      if (caked === 0) return setDiscError("Enter caked bags count")
      if (caked < 0) return setDiscError("Values cannot be negative")
      if (!discDropLocation) return setDiscError("Select a drop location")
      if (discDropLocation === "Other" && !discCustomDropLocation.trim()) return setDiscError("Enter a drop location")
    }

    setDiscSubmitting(true)
    
    const discrepancyData = {
      trip_id: activeTrip?.trip_id,
      driver_id: driver?.driver_id,
      shortage: discrepancyType === 'shortage' ? shortage : 0,
      caked_bags: discrepancyType === 'caked' ? caked : 0,
      discrepancy_type: discrepancyType,
      notes: discNotes.trim() || null,
      drop_location: discrepancyType === 'caked' ? (discDropLocation === "Other" ? discCustomDropLocation.trim() : discDropLocation) : null,
    }

    const result = await submitAction(
      'discrepancy',
      activeTrip?.trip_id ?? '',
      'trip_discrepancies',
      discrepancyData
    )

    setDiscSubmitting(false)

    if (!result.success) {
      setDiscError(result.error || "Failed to submit report")
      return
    }

    setShowDiscrepancyModal(false)
    setDiscrepancyType('shortage')
    setDiscShortage(""); setDiscCaked(""); setDiscNotes(""); setDiscDropLocation(""); setDiscCustomDropLocation(""); setDiscError("")
    
    if (result.offline) {
      setMessage("✅ Report saved offline. Will sync when connected.")
    }
    
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

    const updateData = {
      trip_id: activeTrip.trip_id,
      loaded_quantity: newTotal,
      trip_status: activeTrip.trip_status,
      updated_at: new Date().toISOString(),
    }

    const result = await submitAction(
      'load_more',
      activeTrip.trip_id,
      'Trips',
      updateData
    )

    setLoadMoreSubmitting(false)

    if (!result.success) {
      setLoadMoreError(result.error || "Failed to update bags")
      return
    }

    const moreCat = loadMoreCategory
    const moreLoc = loadMoreLocationName
    const moreProd = loadMoreProduct

    setActiveTrip({ ...activeTrip, loaded_quantity: newTotal }); setRemaining(remaining + qty)
    setShowLoadMoreModal(false); setLoadMoreQty(""); setLoadMoreCategory("")
    setLoadMoreLocationName(""); setLoadMoreProduct(""); setLoadMoreProductOptions([]); setLoadMoreError("")

    if (!result.offline && navigator.onLine && activeTrip) {
      await apiMutate("trips", {
        action: "insert",
        table: "trip_load_more",
        data: {
          trip_id: activeTrip.trip_id,
          quantity: qty,
          loading_point_type: moreCat,
          loading_point_name: moreLoc,
          product: moreProd,
        },
      })
      await fetchLoadMoreEntries(activeTrip.trip_id)
    }

    if (result.offline) {
      setMessage("✅ Saved offline. Will update when you are connected.")
    }
  }

  async function handleSubmitComplaint(thenEndTrip = false) {
    if (!complaintTruck) return setComplaintError("Select a truck")
    if (!complaintType) return setComplaintError("Select a complaint type")
    if (!complaintNotes.trim()) return setComplaintError("Please describe the issue")

    if (!isOnline) {
      setComplaintError("⚠️ Internet required to submit complaints")
      return
    }

    setComplaintSubmitting(true)
    const { error } = await apiMutate("admin", {
      action: "insert",
      table: "driver_complaints",
      data: {
        driver_id: driver?.driver_id, trip_id: activeTrip?.trip_id ?? null,
        plate_number: complaintTruck, complaint_type: complaintType, notes: complaintNotes.trim(),
      },
    })
    setComplaintSubmitting(false)
    if (error) { setComplaintError("Failed to submit complaint"); return }

    setShowComplaintModal(false); setComplaintType(""); setComplaintTruck("")
    setComplaintNotes(""); setComplaintError(""); setComplaintPendingEndTrip(false)
    if (thenEndTrip) { handleEndTrip() } else { setComplaintsRefreshKey(k => k + 1) }
  }

  useEffect(() => {
    if (!showMyComplaints) return
    let cancelled = false
    ;(async () => {
      setFetchingComplaints(true)
      const { data } = await supabase
        .from("driver_complaints")
        .select("complaint_id, complaint_type, notes, plate_number, reported_at, resolved")
        .eq("driver_id", driver?.driver_id)
        .order("reported_at", { ascending: false })
      if (!cancelled) {
        setMyComplaints((data || []) as any)
        setFetchingComplaints(false)
      }
    })()
    return () => { cancelled = true }
  }, [showMyComplaints, complaintsRefreshKey])

  async function handleMarkResolved(id: string) {
    setResolvingComplaintId(id)
    try {
      await apiMutate("admin", {
        action: "update", table: "driver_complaints",
        data: { resolved: true }, filters: { complaint_id: id },
      })
      setMyComplaints(prev => prev.map(c => c.complaint_id === id ? { ...c, resolved: true } : c))
    } finally {
      setResolvingComplaintId(null)
    }
  }

  function openComplaintFromEndTrip() {
    setComplaintPendingEndTrip(true); setShowEndConfirm(false); setShowComplaintModal(true)
  }

  function handleStopLogged(quantityOffloaded: number) {
    setRemaining(remaining - quantityOffloaded);
    setOffloadedSoFar(offloadedSoFar + quantityOffloaded);

    if (navigator.onLine && activeTrip) {
      fetchStops(activeTrip.trip_id, activeTrip.loaded_quantity)
    }

    navigateTo("active-trip")
  }

  // Styles
  const chevron = (
    <Icon icon="mdi:chevron-down" width={18} color="#aaa"
      style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
    />
  )

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", paddingRight: 36,
    boxSizing: "border-box", borderRadius: 8,
    border: "1px solid #e2e8f0", fontSize: fontSize.base,
    background: "white", color: "#0f172a",
    minHeight: 48,
  }

  const labelStyle: React.CSSProperties = {
    fontWeight: 600, display: "block",
    marginBottom: 6, fontSize: fontSize.sm, color: "#475569"
  }

  const modalOverlay: React.CSSProperties = {
    position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)",
    backdropFilter: "blur(4px)",
    display: "flex", alignItems: isMobile ? "flex-end" : "center",
    justifyContent: "center", zIndex: 100, padding: isMobile ? 0 : 24
  }

  const modalBox: React.CSSProperties = {
    background: "white",
    borderRadius: isMobile ? "20px 20px 0 0" : 12,
    padding: isMobile ? "28px 20px" : 32,
    width: "100%",
    maxWidth: 480,
    maxHeight: "90vh",
    overflowY: "auto",
    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)"
  }

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#f8fafc", fontFamily: "'Inter', sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid #e2e8f0", borderTopColor: "#0070f3", animation: "spin 1s linear infinite", margin: "0 auto 12px" }} />
        <p style={{ color: "#64748b", fontSize: fontSize.sm }}>Loading…</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  const hasPendingATF = !!activeATF

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: "#f8fafc", minHeight: "100vh" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Profile Banner */}
      <div style={{ background: "white", borderBottom: "1px solid #e2e8f0", padding: isMobile ? "16px" : "24px 32px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", gap: isMobile ? 12 : 16, justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 12 : 16, flex: 1 }}>
            <div
              onClick={handleAvatarClick}
              style={{
                width: isMobile ? 48 : 56,
                height: isMobile ? 48 : 56,
                borderRadius: "50%",
                background: driver?.profile_picture_url ? "transparent" : "#f0f7ff",
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
              {driver?.profile_picture_url ? (
                <img
                  src={driver.profile_picture_url}
                  alt={driver.full_name}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              ) : (
                <span style={{ fontSize: isMobile ? 20 : 24, fontWeight: 700, color: "#0070f3" }}>
                  {driver?.full_name.charAt(0).toUpperCase()}
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
                {driver?.full_name}
              </h1>
              <RoleSwitcher currentRole="Driver" style={{ margin: "2px 0 0", fontSize: fontSize.sm, color: "#64748b" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => { setComplaintPendingEndTrip(false); setShowMyComplaints(true) }}
              style={{ padding: "8px 14px", background: "#fff8e1", color: "#f5a623", border: "1.5px solid #f8ad5c", borderRadius: 8, cursor: "pointer", fontSize: fontSize.sm, minHeight: 40, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s", whiteSpace: "nowrap" }}
              onMouseEnter={e => { e.currentTarget.style.background = "#fff0e1"; e.currentTarget.style.borderColor = "#f8ad5c" }}
              onMouseLeave={e => { e.currentTarget.style.background = "#fff8e1"; e.currentTarget.style.borderColor = "#f8ad5c" }}
            >
              <Icon icon="mdi:alert-circle-outline" width={16} />
              {!isMobile && "Report"}
            </button>
            <button
              onClick={async () => { await supabase.auth.signOut(); window.location.href = "/login" }}
              style={{ padding: "8px 14px", background: "rgba(239, 68, 68, 0.05)", color: "#ef4444", border: "1.5px solid #fecaca", borderRadius: 8, cursor: "pointer", fontSize: fontSize.sm, minHeight: 40, display: "flex", alignItems: "center", gap: 6, fontWeight: 600, transition: "all 0.2s", whiteSpace: "nowrap" }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)"; e.currentTarget.style.borderColor = "#fca5a5" }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(239, 68, 68, 0.05)"; e.currentTarget.style.borderColor = "#fca5a5" }}
            >
              <Icon icon="mdi:logout" width={16} />
              {!isMobile && "Logout"}
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding: isMobile ? "16px" : "32px", maxWidth: 1200, margin: "0 auto", paddingBottom: 80 }}>

        {/* ── Dashboard ── */}
        {view === "dashboard" && (
          <div style={{ paddingTop: isMobile ? 32 : 48 }}>
            <div style={{ marginBottom: 36, textAlign: "center" }}>
              <h2 style={{ margin: 0, fontSize: isMobile ? fontSize["2xl"] : fontSize.xl, color: "#0f172a", fontWeight: 700 }}>
                {activeTrip ? `Continue Your Trip?` : "Ready to go?"}
              </h2>
              <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: fontSize.base }}>
                {activeTrip ? `${activeTrip.plate_number} • ${activeTrip.material_centre}` : "No active trip. Start a trip below."}
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 320, margin: "240px auto" }}>
              <button onClick={() => navigateTo(activeTrip ? "active-trip" : "start-trip")} style={{ width: "100%", padding: "14px 16px", background: "#0070f3", color: "white", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: fontSize.md, minHeight: 52, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "opacity 0.2s" }} onMouseEnter={e => e.currentTarget.style.opacity = "0.9"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                <Icon icon={activeTrip ? "mdi:truck-fast" : "mdi:truck-outline"} width={20} />
                {activeTrip ? "Continue Trip" : "Start a Trip"}
              </button>

              <button onClick={() => navigateTo("fuel")} style={{ width: "100%", padding: "12px 16px", background: "white", color: "#0070f3", border: "1.5px solid #0070f3", borderRadius: 10, cursor: "pointer", fontWeight: 600, fontSize: fontSize.md, minHeight: 48, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, position: "relative", transition: "all 0.2s" }} onMouseEnter={e => { e.currentTarget.style.background = "#f0f7ff"; e.currentTarget.style.borderColor = "#0055d4" }} onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#0070f3" }}>
                <Icon icon="mdi:gas-station" width={18} />
                Fuel
                {hasPendingATF && (
                  <span style={{ position: "absolute", top: 10, right: 14, width: 8, height: 8, borderRadius: "50%", background: "#f5a623", border: "2px solid white" }} />
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── Fuel View ── */}
        {view === "fuel" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <button onClick={() => navigateTo("dashboard")} style={{ background: "none", border: "none", color: "#0070f3", cursor: "pointer", padding: 0, fontSize: fontSize.base, display: "flex", alignItems: "center", gap: 4, fontWeight: 600, transition: "all 0.2s" }} onMouseEnter={e => e.currentTarget.style.opacity = "0.8"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                <Icon icon="mdi:arrow-left" width={18} /> Back
              </button>
              <button onClick={() => driver && fetchATFs(driver.driver_id)} style={{ padding: "8px 12px", background: "white", color: "#64748b", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer", fontSize: fontSize.xs, fontWeight: 500, minHeight: 40, minWidth: 40, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }} title="Refresh" onMouseEnter={e => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1" }} onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#e2e8f0" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36M20.49 15a9 9 0 0 1-14.85 3.36"/></svg>
              </button>
            </div>
            <h2 style={{ marginBottom: 8, color: "#0f172a", fontSize: isMobile ? fontSize["2xl"] : fontSize.xl, fontWeight: 700 }}>Fuel</h2>
            <p style={{ margin: "0 0 24px", fontSize: fontSize.sm, color: "#64748b" }}>
              Your Truck Officer initiates fuel requests on your behalf.
            </p>

            {/* Active ATF */}
            {activeATF && (() => {
              const cfg = ATF_STATUS_CONFIG[activeATF.atf_status] ?? ATF_STATUS_CONFIG.Pending
              return (
                <div style={{ background: cfg.bg, border: `1px solid ${cfg.color}40`, borderRadius: 12, padding: 24, marginBottom: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                  {/* ATF Code */}
                  <div style={{ textAlign: "center", marginBottom: 24 }}>
                    <p style={{ margin: 0, fontSize: fontSize.xs, color: cfg.color, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>Authority to Fuel</p>
                    <p style={{ margin: "8px 0 4px", fontSize: 32, fontWeight: 700, fontFamily: "monospace", letterSpacing: 2, color: "#0f172a" }}>
                      {activeATF.atf_code ?? "—"}
                    </p>
                    <p style={{ margin: 0, fontSize: fontSize.xs, color: "#94a3b8" }}>
                      {activeATF.atf_code ? "Show this to the station manager" : "Awaiting Truck Admin authorisation"}
                    </p>
                  </div>

                  {/* Details Grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                    <div style={{ background: "white", borderRadius: 8, padding: "12px 14px", border: "1px solid #e2e8f0" }}>
                      <p style={{ margin: 0, fontSize: fontSize.xs, color: "#94a3b8" }}>Truck</p>
                      <p style={{ margin: "4px 0 0", fontWeight: 700, fontSize: fontSize.base, color: "#0f172a" }}>{activeATF.plate_number}</p>
                    </div>
                    <div style={{ background: "white", borderRadius: 8, padding: "12px 14px", border: "1px solid #e2e8f0" }}>
                      <p style={{ margin: 0, fontSize: fontSize.xs, color: "#94a3b8" }}>Station</p>
                      <p style={{ margin: "4px 0 0", fontWeight: 700, fontSize: fontSize.base, color: "#0f172a" }}>{activeATF.company_name}</p>
                    </div>
                    <div style={{ background: "white", borderRadius: 8, padding: "12px 14px", border: "1px solid #e2e8f0" }}>
                      <p style={{ margin: 0, fontSize: fontSize.xs, color: "#94a3b8" }}>Litres</p>
                      <p style={{ margin: "4px 0 0", fontWeight: 700, fontSize: fontSize.lg, color: "#0070f3" }}>{activeATF.litres}L</p>
                    </div>
                    {activeATF.total_amount && (
                      <div style={{ background: "white", borderRadius: 8, padding: "12px 14px", border: "1px solid #e2e8f0" }}>
                        <p style={{ margin: 0, fontSize: fontSize.xs, color: "#94a3b8" }}>Total</p>
                        <p style={{ margin: "4px 0 0", fontWeight: 700, fontSize: fontSize.base, color: "#16a34a" }}>₦{activeATF.total_amount.toLocaleString()}</p>
                      </div>
                    )}
                  </div>

                  {/* Status */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "white", borderRadius: 8, marginBottom: activeATF.atf_status === "Dispensed" ? 16 : 0, border: "1px solid #e2e8f0" }}>
                    <Icon icon={cfg.icon} width={16} color={cfg.color} />
                    <p style={{ margin: 0, fontSize: fontSize.sm, color: cfg.color, fontWeight: 700 }}>{cfg.label}</p>
                  </div>

                  {/* Confirm Button */}
                  {activeATF.atf_status === "Dispensed" && (
                    <button
                      onClick={handleConfirmReceipt}
                      disabled={confirmingATF}
                      style={{ width: "100%", padding: "14px 16px", background: "#16a34a", color: "white", border: "none", borderRadius: 10, cursor: confirmingATF ? "not-allowed" : "pointer", fontWeight: 700, fontSize: fontSize.md, minHeight: 48, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: confirmingATF ? 0.7 : 1, transition: "opacity 0.2s" }}
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
                <p style={{ fontWeight: 700, fontSize: fontSize.base, color: "#0f172a", marginBottom: 12 }}>Recent History</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {atfs
                    .filter(a => a.atf_status === "Confirmed" || a.atf_status === "Invalidated")
                    .map(atf => {
                      const cfg = ATF_STATUS_CONFIG[atf.atf_status]
                      return (
                        <div key={atf.request_id} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                            <div>
                              <p style={{ margin: 0, fontWeight: 700, fontSize: fontSize.base, fontFamily: "monospace", letterSpacing: 1, color: "#0f172a" }}>{atf.atf_code}</p>
                              <p style={{ margin: "4px 0 0", fontSize: fontSize.sm, color: "#64748b" }}>{atf.plate_number} · {atf.company_name}</p>
                              <p style={{ margin: "2px 0 0", fontSize: fontSize.xs, color: "#94a3b8" }}>{new Date(atf.requested_at).toLocaleDateString()}</p>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 20, background: cfg.bg, border: `1px solid ${cfg.color}40` }}>
                              <Icon icon={cfg.icon} width={13} color={cfg.color} />
                              <span style={{ fontSize: fontSize.xs, color: cfg.color, fontWeight: 700 }}>{atf.atf_status}</span>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <div style={{ flex: 1, background: "#f8fafc", borderRadius: 8, padding: "10px 12px", border: "1px solid #e2e8f0" }}>
                              <p style={{ margin: 0, fontSize: fontSize.xs, color: "#94a3b8" }}>Litres</p>
                              <p style={{ margin: 0, fontWeight: 700, fontSize: fontSize.base, color: "#0f172a" }}>{atf.litres}L</p>
                            </div>
                            {atf.total_amount && (
                              <div style={{ flex: 1, background: "#f8fafc", borderRadius: 8, padding: "10px 12px", border: "1px solid #e2e8f0" }}>
                                <p style={{ margin: 0, fontSize: fontSize.xs, color: "#94a3b8" }}>Total</p>
                                <p style={{ margin: 0, fontWeight: 700, fontSize: fontSize.base, color: "#0070f3" }}>₦{atf.total_amount.toLocaleString()}</p>
                              </div>
                            )}
                          </div>
                          {atf.atf_status === "Invalidated" && atf.invalidation_reason && (
                            <div style={{ marginTop: 10, padding: "8px 12px", background: "#fef2f2", borderRadius: 8, border: "1px solid #fecaca" }}>
                              <p style={{ margin: 0, fontSize: fontSize.sm, color: "#b91c1c", fontWeight: 600 }}>{atf.invalidation_reason}</p>
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
              <div style={{ textAlign: "center", paddingTop: 48, paddingBottom: 48 }}>
                <Icon icon="mdi:gas-station-off" width={48} color="#cbd5e1" style={{ marginBottom: 12 }} />
                <p style={{ marginBottom: 0, fontSize: fontSize.base, fontWeight: 600, color: "#0f172a" }}>No fuel requests yet</p>
                <p style={{ margin: "4px 0 0", fontSize: fontSize.sm, color: "#64748b" }}>Your Truck Officer will initiate when needed.</p>
              </div>
            )}
          </div>
        )}

        {/* ── Start Trip ── */}
        {view === "start-trip" && (
          <div>
            <button onClick={() => { navigateTo("dashboard"); setMessage("") }} style={{ background: "none", border: "none", color: "#0070f3", cursor: "pointer", marginBottom: 20, padding: 0, fontSize: fontSize.base, display: "flex", alignItems: "center", gap: 4, fontWeight: 600, transition: "all 0.2s" }} onMouseEnter={e => e.currentTarget.style.opacity = "0.8"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
              <Icon icon="mdi:arrow-left" width={18} /> Back
            </button>
            <h2 style={{ marginBottom: 24, color: "#0070f3", fontSize: isMobile ? fontSize["2xl"] : fontSize.xl, fontWeight: 700 }}>Start a Trip</h2>

            <div style={{ maxWidth: 480 }}>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Truck Size *</label>
                <div style={{ position: "relative" }}>
                  <ModernInput as="select" value={truckSize} onChange={e => { setTruckSize(e.target.value); setPlateNumber(""); setMessage("") }} style={inputStyle}>
                    <option value="">Select truck size</option>
                    <option value="20">20</option>
                    <option value="40/45">40/45</option>
                    <option value="Dina">Dina</option>
                    <option value="Tricycle">Tricycle</option>
                  </ModernInput>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>{truckSize === "Tricycle" ? "Tricycle Number" : "Plate Number"} *</label>
                <div style={{ position: "relative" }}>
                  <ModernInput as="select" value={plateNumber} onChange={e => { setPlateNumber(e.target.value); setMessage("") }} style={inputStyle}>
                    <option value="">{truckSize === "Tricycle" ? "Select tricycle" : "Select plate number"}</option>
                    {trucks.filter(t => !truckSize || t.truck_size === truckSize).map(t => <option key={t.plate_number} value={t.plate_number}>{t.plate_number}{t.kbnl_truck_no ? (t.truck_size === "Tricycle" ? ` · ${t.kbnl_truck_no}` : ` · #${t.kbnl_truck_no}`) : ""}</option>)}
                  </ModernInput>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Loading Point Type *</label>
                <div style={{ position: "relative" }}>
                  <ModernInput as="select" value={loadingPointCategory} onChange={e => handleCategoryChange(e.target.value)} style={inputStyle}>
                    <option value="">Select loading point</option>
                    {Object.keys(LOADING_POINT_MAP).filter(cat => !isDinaOrTricycle || cat !== "Factory").map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </ModernInput>
                </div>
              </div>

              {loadingPointCategory && (
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>{loadingPointCategory} *</label>
                  <div style={{ position: "relative" }}>
                    <ModernInput as="select" value={loadingPointName} onChange={e => handleLoadingPointNameChange(e.target.value)} style={inputStyle}>
                      <option value="">Select {loadingPointCategory.toLowerCase()}</option>
                      {availableLocations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                    </ModernInput>
                    
                  </div>
                </div>
              )}

              {showATC && loadingPointName && (
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>ATC Number *</label>
                  <ModernInput type="text" placeholder="Enter ATC number" value={atc} onChange={e => { setAtc(e.target.value); setMessage("") }} onKeyDown={e => { if (e.key === "Enter") loadedQtyRef.current?.focus() }} style={inputStyle} />
                </div>
              )}

              {isDinaOrTricycle && loadingPointName && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>Amount Charged (₦) *</label>
                    <ModernInput type="number" placeholder="e.g. 5000" value={amountCharged} onChange={e => { setAmountCharged(e.target.value); setMessage("") }} style={inputStyle} />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>Payment Mode *</label>
                    <div style={{ position: "relative" }}>
                      <ModernInput as="select" value={paymentMode} onChange={e => { setPaymentMode(e.target.value); setMessage("") }} style={inputStyle}>
                        <option value="">Select payment mode</option>
                        <option value="Cash">Cash</option>
                        <option value="Transfer">Transfer</option>
                        <option value="POS">POS</option>
                      </ModernInput>
                    </div>
                  </div>
                </>
              )}

              {loadingPointName && (
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Product *</label>
                  <div style={{ position: "relative" }}>
                    <ModernInput as="select" value={product} onChange={e => { setProduct(e.target.value); setMessage("") }} style={inputStyle}>
                      <option value="">Select product</option>
                      {productOptions.map(p => <option key={p} value={p}>{p}</option>)}
                    </ModernInput>
                    
                  </div>
                </div>
              )}

              {product && (
                <div style={{ marginBottom: 24 }}>
                  <label style={labelStyle}>No. of Bags *</label>
                  <ModernInput ref={loadedQtyRef} type="number" placeholder="e.g. 600" value={loadedQuantity} onChange={e => { setLoadedQuantity(e.target.value); setMessage("") }} onKeyDown={e => { if (e.key === "Enter") handleStartTrip() }} style={inputStyle} />
                </div>
              )}

              {message && (
                <div style={{ padding: 12, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, marginBottom: 16, color: "#b91c1c", fontSize: fontSize.sm, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                  <Icon icon="mdi:alert-circle" width={16} />{message}
                </div>
              )}

              <button onClick={handleStartTrip} disabled={submitting} style={{ width: "100%", padding: "14px 16px", background: submitting ? "#bfdbfe" : "#0070f3", color: "white", border: "none", borderRadius: 10, cursor: submitting ? "not-allowed" : "pointer", fontWeight: 700, fontSize: fontSize.md, minHeight: 48, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: submitting ? 0.7 : 1, transition: "opacity 0.2s" }}>
                {submitting
                  ? <><Icon icon="mdi:loading" width={18} style={{ animation: "spin 1s linear infinite" }} /> Starting…</>
                  : <><Icon icon="mdi:truck-check" width={18} /> Start Trip</>
                }
              </button>
            </div>
          </div>
        )}

        {/* ── Active Trip ── */}
        {view === "active-trip" && activeTrip && (
          <div>
            <button onClick={() => navigateTo("dashboard")} style={{ background: "none", border: "none", color: "#0070f3", cursor: "pointer", marginBottom: 20, padding: 0, fontSize: fontSize.base, display: "flex", alignItems: "center", gap: 4, fontWeight: 600, transition: "all 0.2s" }} onMouseEnter={e => e.currentTarget.style.opacity = "0.8"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
              <Icon icon="mdi:arrow-left" width={18} /> Dashboard
            </button>
            <h2 style={{ marginBottom: 20, color: "#0f172a", fontSize: isMobile ? fontSize["2xl"] : fontSize.xl, fontWeight: 700 }}>Active Trip</h2>

            {/* Trip Card */}
            <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: isMobile ? 16 : 20, marginBottom: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                {[
                  { label: "Plate", value: activeTrip.plate_number },
                  { label: "Product", value: activeTrip.product },
                  { label: "Loading Point", value: activeTrip.material_centre },
                  { label: "Loaded", value: `${activeTrip.loaded_quantity} bags` },
                  ...(activeTrip.amount_charged ? [{ label: "Amount Charged", value: `₦${activeTrip.amount_charged.toLocaleString()}` }] : []),
                  ...(activeTrip.payment_mode ? [{ label: "Payment Mode", value: activeTrip.payment_mode }] : []),
                  ...(loadMoreEntries.length > 0 ? [{ label: "Extra Loads", value: loadMoreEntries.map(e => `${e.product} @ ${e.loading_point_name} (+${e.quantity})`).join("; ") }] : []),
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p style={{ margin: 0, fontSize: fontSize.xs, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>{label}</p>
                    <p style={{ margin: "4px 0 0", fontWeight: 700, fontSize: fontSize.base, color: "#0f172a" }}>{value}</p>
                  </div>
                ))}
              </div>

              <div style={{ padding: 14, background: remaining === 0 ? "#fef2f2" : remaining < activeTrip.loaded_quantity * 0.2 ? "#fff8e1" : "#f0fff4", borderRadius: 10, border: remaining === 0 ? "1px solid #fecaca" : remaining < activeTrip.loaded_quantity * 0.2 ? "1px solid #fde68a" : "1px solid #86efac", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <p style={{ margin: 0, fontSize: fontSize.sm, color: "#64748b", display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
                  <Icon icon="mdi:package-variant" width={16} /> Remaining
                </p>
                <p style={{ margin: 0, fontWeight: 700, fontSize: isMobile ? fontSize.xl : fontSize.lg, color: remaining === 0 ? "#ef4444" : remaining < activeTrip.loaded_quantity * 0.2 ? "#f5a623" : "#16a34a" }}>
                  {remaining} <span style={{ fontSize: fontSize.sm, fontWeight: 500, color: "#94a3b8" }}>bags</span>
                </p>
              </div>

              <div style={{ marginTop: 12, textAlign: "center" }}>
                <span style={{ padding: "4px 14px", borderRadius: 20, fontSize: fontSize.xs, fontWeight: 700, background: activeTrip.trip_status === "On hold" ? "#fff8e1" : "#f0f7ff", color: activeTrip.trip_status === "On hold" ? "#f5a623" : "#0070f3", border: activeTrip.trip_status === "On hold" ? "1px solid #fde68a" : "1px solid #bfdbfe" }}>
                  {activeTrip.trip_status}
                </span>
              </div>
            </div>

            {/* Stops */}
            {stops.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <p style={{ fontWeight: 700, marginBottom: 12, fontSize: fontSize.base, color: "#0f172a" }}>Previous Stops ({stops.length})</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {stops.map((stop, index) => (
                    <div key={stop.stop_id} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: "#f0f7ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Icon icon="mdi:map-marker" width={16} color="#0070f3" />
                          </div>
                          <div>
                            <p style={{ margin: 0, fontWeight: 700, fontSize: fontSize.sm, color: "#0f172a" }}>Stop {stops.length - index}</p>
                            <p style={{ margin: "2px 0 0", color: "#64748b", fontSize: fontSize.sm }}>{stop.stop_location}</p>
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <p style={{ margin: 0, fontWeight: 700, fontSize: fontSize.base, color: "#0070f3" }}>{stop.quantity_offloaded}</p>
                          <p style={{ margin: "2px 0 0", color: "#94a3b8", fontSize: fontSize.xs }}>bags</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {loadMoreEntries.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <p style={{ fontWeight: 700, marginBottom: 12, fontSize: fontSize.base, color: "#0f172a" }}>Additional Loads ({loadMoreEntries.length})</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {loadMoreEntries.map((entry) => (
                    <div key={entry.id} style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "12px 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: "#fffbeb", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Icon icon="mdi:package-variant-closed" width={16} color="#f59e0b" />
                          </div>
                          <div>
                            <p style={{ margin: 0, fontWeight: 700, fontSize: fontSize.sm, color: "#0f172a" }}>{entry.loading_point_name}</p>
                            <p style={{ margin: "2px 0 0", color: "#64748b", fontSize: fontSize.sm }}>{entry.loading_point_type} — {entry.product}</p>
                          </div>
                        </div>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: fontSize.base, color: "#f59e0b" }}>+{entry.quantity}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {message && (
              <div style={{ padding: 12, background: "#f0fff4", border: "1px solid #86efac", borderRadius: 8, marginBottom: 16, color: "#166534", fontSize: fontSize.sm, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                <Icon icon="mdi:check-circle" width={16} />{message}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {remaining > 0 && (
                <button onClick={() => { window.scrollTo(0, 0); navigateTo("log-stop") }} style={{ width: "100%", padding: "14px 16px", background: "#0070f3", color: "white", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: fontSize.md, minHeight: 48, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "opacity 0.2s" }} onMouseEnter={e => e.currentTarget.style.opacity = "0.9"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                  <Icon icon="mdi:map-marker-plus" width={18} /> Make a Stop
                </button>
              )}
              <button onClick={() => { setShowLoadMoreModal(true); setLoadMoreError("") }} style={{ width: "100%", padding: "12px 16px", background: "white", color: "#0070f3", border: "1.5px solid #0070f3", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: fontSize.md, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.2s" }} onMouseEnter={e => { e.currentTarget.style.background = "#f0f7ff"; e.currentTarget.style.borderColor = "#0055d4" }} onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#0070f3" }}>
                <Icon icon="mdi:plus-box-outline" width={18} /> Load More Bags
              </button>
              <button onClick={() => { setShowDiscrepancyModal(true); setDiscError(""); setDiscrepancyType("shortage") }} style={{ width: "100%", padding: "12px 16px", background: "white", color: "#f5a623", border: "1.5px solid #f5a623", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: fontSize.md, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.2s" }} onMouseEnter={e => { e.currentTarget.style.background = "#fff8e1"; e.currentTarget.style.borderColor = "#f5a623" }} onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#f5a623" }}>
                <Icon icon="mdi:alert-outline" width={18} /> Shortage/Caked Bags
              </button>
              <button onClick={() => setShowHoldConfirm(true)} style={{ width: "100%", padding: "12px 16px", background: "white", color: activeTrip.trip_status === "On hold" ? "#0070f3" : "#64748b", border: `1.5px solid ${activeTrip.trip_status === "On hold" ? "#0070f3" : "#cbd5e1"}`, borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: fontSize.md, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.2s" }} onMouseEnter={e => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1" }} onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = activeTrip.trip_status === "On hold" ? "#0070f3" : "#cbd5e1" }}>
                <Icon icon={activeTrip.trip_status === "On hold" ? "mdi:play-circle-outline" : "mdi:pause-circle-outline"} width={18} />
                {activeTrip.trip_status === "On hold" ? "Resume Trip" : "Hold Trip"}
              </button>
            </div>
          </div>
        )}

        {/* ── Log Stop ── */}
        {view === "log-stop" && activeTrip && (
          <div>
            <button onClick={() => navigateTo("active-trip")} style={{ background: "none", border: "none", color: "#0070f3", cursor: "pointer", marginBottom: 20, padding: 0, fontSize: fontSize.base, display: "flex", alignItems: "center", gap: 4, fontWeight: 600, transition: "all 0.2s" }} onMouseEnter={e => e.currentTarget.style.opacity = "0.8"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
              <Icon icon="mdi:arrow-left" width={18} /> Back to Trip
            </button>
            <StopForm 
              tripId={activeTrip.trip_id} 
              loadedQuantity={activeTrip.loaded_quantity}
              offloadedSoFar={offloadedSoFar}
              onStopLogged={handleStopLogged} 
            />
          </div>
        )}

      </div>

      {/* ══ MODALS ══ */}

      {/* Profile Picture Upload */}
      {showPictureModal && (
        <div onClick={() => { setShowPictureModal(false); setSelectedFile(null); setPicturePreview(null); setPictureError("") }} style={modalOverlay}>
          <div onClick={e => e.stopPropagation()} style={modalBox}>
            <h3 style={{ margin: "0 0 6px 0", fontSize: fontSize.xl, fontWeight: 700, color: "#0f172a" }}>Update Profile Picture</h3>
            <p style={{ margin: "0 0 20px 0", fontSize: fontSize.sm, color: "#64748b" }}>PNG, JPG up to 1MB</p>

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
                  border: "2px dashed #0070f3",
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
                <p style={{ margin: "0 0 4px 0", fontSize: fontSize.base, fontWeight: 700, color: "#0070f3" }}>
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
              <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 16, color: "#b91c1c", fontSize: fontSize.sm, fontWeight: 600 }}>
                {pictureError}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button
                onClick={() => { setShowPictureModal(false); setSelectedFile(null); setPicturePreview(null); setPictureError("") }}
                style={{ padding: "12px 16px", background: "white", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: fontSize.md, minHeight: 44 }}
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
                  fontWeight: 700,
                  fontSize: fontSize.md,
                  minHeight: 44,
                  opacity: pictureLoading ? 0.7 : 1,
                  transition: "opacity 0.2s",
                }}
              >
                {pictureLoading ? "Uploading..." : "Upload"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* My Complaints List */}
      {showMyComplaints && (
        <div style={modalOverlay}>
          <div onClick={e => e.stopPropagation()} style={{ ...modalBox, maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, color: "#0f172a", fontSize: fontSize.xl, fontWeight: 700 }}>My Reports</h3>
              <button onClick={() => setShowMyComplaints(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#94a3b8" }} onMouseEnter={e => e.currentTarget.style.color = "#475569"} onMouseLeave={e => e.currentTarget.style.color = "#94a3b8"}><Icon icon="mdi:close" width={20} /></button>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <p style={{ margin: 0, fontSize: fontSize.sm, color: "#64748b" }}>{myComplaints.filter(c => !c.resolved).length} open &middot; {myComplaints.filter(c => c.resolved).length} resolved</p>
              <button onClick={() => { setShowMyComplaints(false); setShowComplaintModal(true) }} style={{ padding: "8px 16px", background: "#f5a623", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: fontSize.sm, display: "flex", alignItems: "center", gap: 6, minHeight: 36 }} onMouseEnter={e => e.currentTarget.style.background = "#d48a1c"} onMouseLeave={e => e.currentTarget.style.background = "#f5a623"}><Icon icon="mdi:plus" width={16} /> New Report</button>
            </div>
            {fetchingComplaints ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "32px 0" }}><div style={{ width: 28, height: 28, borderRadius: "50%", border: "3px solid #e2e8f0", borderTopColor: "#0070f3", animation: "spin 1s linear infinite" }} /></div>
            ) : myComplaints.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 24px" }}><p style={{ margin: 0, color: "#64748b", fontSize: fontSize.base }}>No reports yet</p></div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {myComplaints.map(c => (
                  <div key={c.complaint_id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", borderRadius: 8, border: `1px solid ${c.resolved ? "#e2e8f0" : "#fef3c7"}`, background: c.resolved ? "#fafafa" : "#fffcf5", opacity: c.resolved ? 0.7 : 1 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ padding: "2px 7px", borderRadius: 4, fontSize: fontSize.xs, fontWeight: 500, background: "#f0f7ff", color: "#0c4a6e", border: "1px solid #bfdbfe" }}>{c.complaint_type}</span>
                        <span style={{ fontSize: fontSize.xs, color: "#94a3b8", fontFamily: "monospace" }}>{c.plate_number}</span>
                      </div>
                      <p style={{ margin: "0 0 4px", fontSize: fontSize.sm, color: "#0f172a", fontWeight: 500, lineHeight: 1.4, wordBreak: "break-word" }}>{c.notes.length > 100 ? c.notes.slice(0, 100) + "…" : c.notes}</p>
                      <p style={{ margin: 0, fontSize: fontSize.xs, color: "#94a3b8" }}>{new Date(c.reported_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end", flexShrink: 0 }}>
                      <span style={{ padding: "3px 8px", borderRadius: 5, fontSize: fontSize.xs, fontWeight: 500, background: c.resolved ? "#d1fae5" : "#fef3c7", color: c.resolved ? "#065f46" : "#78350f", border: `1px solid ${c.resolved ? "#a7f3d0" : "#fde68a"}` }}>{c.resolved ? "Resolved" : "Open"}</span>
                      {!c.resolved && <button onClick={() => handleMarkResolved(c.complaint_id)} disabled={resolvingComplaintId === c.complaint_id} style={{ padding: "4px 10px", fontSize: fontSize.xs, fontWeight: 600, background: resolvingComplaintId === c.complaint_id ? "#94a3b8" : "#16a34a", color: "white", border: "none", borderRadius: 5, cursor: resolvingComplaintId === c.complaint_id ? "not-allowed" : "pointer", minHeight: 28 }} onMouseEnter={e => { if (!resolvingComplaintId) e.currentTarget.style.background = "#15803d" }} onMouseLeave={e => { if (!resolvingComplaintId) e.currentTarget.style.background = "#16a34a" }}>{resolvingComplaintId === c.complaint_id ? "…" : "Mark Resolved"}</button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Complaint */}
      {showComplaintModal && (
        <div style={modalOverlay}>
          <div onClick={e => e.stopPropagation()} style={modalBox}>
            <h3 style={{ marginBottom: 6, color: "#0f172a", fontSize: fontSize.xl, fontWeight: 700 }}>Report an Issue</h3>
            <p style={{ margin: "0 0 20px", fontSize: fontSize.sm, color: "#64748b" }}>This will be reviewed by management</p>

            {!isOnline && (
              <div style={{ padding: 12, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, marginBottom: 16, color: "#991b1b", fontSize: fontSize.sm, fontWeight: 600 }}>
                ⚠️ Internet required to submit complaints
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Truck *</label>
              <div style={{ position: "relative" }}>
                <ModernInput as="select" value={complaintTruck} onChange={e => { setComplaintTruck(e.target.value); setComplaintError("") }} style={inputStyle}>
                  <option value="">Select truck</option>
                  {allTrucks.map(t => <option key={t.plate_number} value={t.plate_number}>{t.plate_number}{t.kbnl_truck_no ? (t.truck_size === "Tricycle" ? ` · ${t.kbnl_truck_no}` : ` · #${t.kbnl_truck_no}`) : ""}</option>)}
                </ModernInput>
                
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Issue Type *</label>
              <div style={{ position: "relative" }}>
                <ModernInput as="select" value={complaintType} onChange={e => { setComplaintType(e.target.value); setComplaintError("") }} style={inputStyle}>
                  <option value="">Select type</option>
                  {COMPLAINT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </ModernInput>
                
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Description *</label>
              <ModernInput as="textarea" placeholder="Describe the issue…" value={complaintNotes} onChange={e => { setComplaintNotes(e.target.value); setComplaintError("") }} rows={4} style={{ ...inputStyle, resize: "none", minHeight: 100, paddingRight: 12 }} />
            </div>

            {complaintError && (
              <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 16, color: "#b91c1c", fontSize: fontSize.sm, fontWeight: 600 }}>
                {complaintError}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              {!complaintPendingEndTrip && (
                <button onClick={() => { setShowComplaintModal(false); setComplaintType(""); setComplaintTruck(""); setComplaintNotes(""); setComplaintError("") }} style={{ flex: 1, padding: "12px 16px", background: "white", border: "1px solid #cbd5e1", borderRadius: 8, cursor: "pointer", fontSize: fontSize.md, minHeight: 44, color: "#475569", fontWeight: 700 }}>
                  Cancel
                </button>
              )}
              <button onClick={() => handleSubmitComplaint(complaintPendingEndTrip)} disabled={complaintSubmitting || !isOnline} style={{ flex: 1, padding: "12px 16px", background: complaintSubmitting || !isOnline ? "#bfdbfe" : "#f5a623", color: "white", border: "none", borderRadius: 8, cursor: complaintSubmitting || !isOnline ? "not-allowed" : "pointer", fontWeight: 700, fontSize: fontSize.md, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: complaintSubmitting ? 0.7 : 1 }}>
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
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ width: 56, height: 56, background: "#f0fff4", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", border: "2px solid #86efac" }}>
                <Icon icon="mdi:check-circle" width={28} color="#16a34a" />
              </div>
              <h3 style={{ margin: 0, color: "#0f172a", fontSize: fontSize.xl, fontWeight: 700 }}>All bags offloaded!</h3>
              <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: fontSize.sm }}>Ready to end this trip?</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={handleEndTrip} disabled={submitting} style={{ padding: "12px 16px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: submitting ? "not-allowed" : "pointer", fontWeight: 700, fontSize: fontSize.md, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: submitting ? 0.7 : 1 }}>
                {submitting ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} /> Ending…</> : <><Icon icon="mdi:flag-checkered" width={18} /> End Trip</>}
              </button>
              <button onClick={openComplaintFromEndTrip} style={{ padding: "12px 16px", background: "white", color: "#f5a623", border: "1.5px solid #f5a623", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: fontSize.md, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.2s" }} onMouseEnter={e => { e.currentTarget.style.background = "#fff8e1"; e.currentTarget.style.borderColor = "#f5a623" }} onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#f5a623" }}>
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
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ width: 56, height: 56, background: activeTrip?.trip_status === "On hold" ? "#dfecfc" : "#fff8e0", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", border: `2px solid ${activeTrip?.trip_status === "On hold" ? "#8abaf0" : "#fde68a"}` }}>
                <Icon icon={activeTrip?.trip_status === "On hold" ? "mdi:play-circle" : "mdi:pause-circle"} width={28} color = {activeTrip?.trip_status === "On hold" ? "#0070f3" : "#f5a623"} />
              </div>
              <h3 style={{ margin: 0, color: "#0f172a", fontSize: fontSize.xl, fontWeight: 700 }}>{activeTrip?.trip_status === "On hold" ? "Resume Trip?" : "Put Trip On Hold?"}</h3>
              <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: fontSize.sm }}>{activeTrip?.trip_status === "On hold" ? "Sets trip back to In Transit." : "Pauses your trip until resumed."}</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => setShowHoldConfirm(false)} style={{ padding: "12px 16px", background: "white", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: fontSize.md, minHeight: 44 }}>Cancel</button>
              <button onClick={handleHoldTrip} disabled={submitting} style={{ padding: "12px 16px", background: activeTrip?.trip_status === "On hold" ? "#0070f3" : "#f5a623", color: "white", border: "none", borderRadius: 8, cursor: submitting ? "not-allowed" : "pointer", fontWeight: 700, fontSize: fontSize.md, minHeight: 44, opacity: submitting ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {submitting ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} /> Updating…</> : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discrepancy */}
      {showDiscrepancyModal && (
        <div onClick={() => { setShowDiscrepancyModal(false); setDiscrepancyType('shortage'); setDiscShortage(""); setDiscCaked(""); setDiscNotes(""); setDiscDropLocation(""); setDiscCustomDropLocation(""); setDiscError("") }} style={modalOverlay}>
          <div onClick={e => e.stopPropagation()} style={modalBox}>
            <h3 style={{ marginBottom: 4, color: "#0f172a", fontSize: fontSize.xl, fontWeight: 700 }}>Report Discrepancy</h3>
            <p style={{ color: "#64748b", fontSize: fontSize.sm, marginBottom: 20 }}>Remaining: <strong style={{ color: "#0f172a" }}>{remaining} bags</strong></p>

            {!isOnline && (
              <div style={{ padding: 12, background: "#f0f7ff", border: "1px solid #bfdbfe", borderRadius: 8, marginBottom: 16, color: "#1e40af", fontSize: fontSize.sm, fontWeight: 600 }}>
                ℹ️ This will be saved and synced when you reconnect
              </div>
            )}

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Discrepancy Type *</label>
              <div style={{ position: "relative" }}>
                <ModernInput as="select" value={discrepancyType} onChange={e => { setDiscrepancyType(e.target.value as 'shortage' | 'caked'); setDiscError("") }} style={inputStyle}>
                  <option value="shortage">Shortage (Missing Bags)</option>
                  <option value="caked">Caked Bags</option>
                </ModernInput>
              </div>
            </div>

            {discrepancyType === 'shortage' && (
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Shortage (bags) *</label>
                <p style={{ margin: "0 0 6px", fontSize: fontSize.xs, color: "#94a3b8" }}>Will be deducted from remaining</p>
                <ModernInput type="number" placeholder="0" value={discShortage} onChange={e => { setDiscShortage(e.target.value); setDiscError("") }} style={inputStyle} />
              </div>
            )}

            {discrepancyType === 'caked' && (
              <>
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>No. of Caked Bags *</label>
                  <ModernInput type="number" placeholder="0" value={discCaked} onChange={e => { setDiscCaked(e.target.value); setDiscError("") }} style={inputStyle} />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Drop Location *</label>
                  <div style={{ position: "relative" }}>
                    <ModernInput as="select" value={discDropLocation} onChange={e => { setDiscDropLocation(e.target.value); setDiscCustomDropLocation(""); setDiscError("") }} style={inputStyle}>
                      <option value="">Select location</option>
                      {allStoreLocations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                      <option value="Other">Other</option>
                    </ModernInput>
                  </div>
                  {discDropLocation === "Other" && (
                    <div style={{ marginTop: 8 }}>
                      <ModernInput type="text" placeholder="Enter drop location" aria-label="Custom drop location" value={discCustomDropLocation} onChange={e => { setDiscCustomDropLocation(e.target.value); setDiscError("") }} style={inputStyle} />
                    </div>
                  )}
                </div>
              </>
            )}

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Notes (optional)</label>
              <ModernInput as="textarea" placeholder="Any additional context…" value={discNotes} onChange={e => setDiscNotes(e.target.value)} rows={3} style={{ ...inputStyle, resize: "none", paddingRight: 12 }} />
            </div>

            {discError && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 16, color: "#b91c1c", fontSize: fontSize.sm, fontWeight: 600 }}>{discError}</div>}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => { setShowDiscrepancyModal(false); setDiscrepancyType('shortage'); setDiscShortage(""); setDiscCaked(""); setDiscNotes(""); setDiscDropLocation(""); setDiscCustomDropLocation(""); setDiscError("") }} style={{ padding: "12px 16px", background: "white", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8, cursor: "pointer", fontSize: fontSize.md, minHeight: 44, fontWeight: 700 }}>Cancel</button>
              <button onClick={handleReportDiscrepancy} disabled={discSubmitting} style={{ padding: "12px 16px", background: "#f5a623", color: "white", border: "none", borderRadius: 8, cursor: discSubmitting ? "not-allowed" : "pointer", fontWeight: 700, fontSize: fontSize.md, minHeight: 44, opacity: discSubmitting ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
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
            <h3 style={{ marginBottom: 4, color: "#0f172a", fontSize: fontSize.xl, fontWeight: 700 }}>Load More Bags</h3>
            <p style={{ color: "#64748b", fontSize: fontSize.sm, marginBottom: 20 }}>Current total: <strong style={{ color: "#0f172a" }}>{activeTrip?.loaded_quantity} bags</strong></p>

            {!isOnline && (
              <div style={{ padding: 12, background: "#f0f7ff", border: "1px solid #bfdbfe", borderRadius: 8, marginBottom: 16, color: "#1e40af", fontSize: fontSize.sm, fontWeight: 600 }}>
                ℹ️ This will be saved and synced when you reconnect
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Loading Point Type *</label>
              <div style={{ position: "relative" }}>
                <ModernInput as="select" value={loadMoreCategory} onChange={e => handleLoadMoreCategoryChange(e.target.value)} style={inputStyle}>
                  <option value="">Select loading point</option>
                  <option value="Depot">Depot</option>
                  <option value="Outlet">Outlet</option>
                </ModernInput>
                
              </div>
            </div>
            {loadMoreCategory && (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>{loadMoreCategory} *</label>
                <div style={{ position: "relative" }}>
                  <ModernInput as="select" value={loadMoreLocationName} onChange={e => handleLoadMoreLocationChange(e.target.value)} style={inputStyle}>
                    <option value="">Select {loadMoreCategory.toLowerCase()}</option>
                    {LOADING_POINT_MAP[loadMoreCategory].map(loc => <option key={loc} value={loc}>{loc}</option>)}
                  </ModernInput>
                  
                </div>
              </div>
            )}
            {loadMoreLocationName && (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Product *</label>
                <div style={{ position: "relative" }}>
                  <ModernInput as="select" value={loadMoreProduct} onChange={e => { setLoadMoreProduct(e.target.value); setLoadMoreError("") }} style={inputStyle}>
                    <option value="">Select product</option>
                    {loadMoreProductOptions.map(p => <option key={p} value={p}>{p}</option>)}
                  </ModernInput>
                  
                </div>
              </div>
            )}
            {loadMoreProduct && (
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>No. of Bags to Add *</label>
                <ModernInput type="number" placeholder="e.g. 100" value={loadMoreQty} onChange={e => { setLoadMoreQty(e.target.value); setLoadMoreError("") }} onKeyDown={e => { if (e.key === "Enter") handleLoadMore() }} style={inputStyle} />
              </div>
            )}

            {loadMoreError && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 16, color: "#b91c1c", fontSize: fontSize.sm, fontWeight: 600 }}>{loadMoreError}</div>}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => { setShowLoadMoreModal(false); setLoadMoreQty(""); setLoadMoreCategory(""); setLoadMoreLocationName(""); setLoadMoreProduct(""); setLoadMoreProductOptions([]); setLoadMoreError("") }} style={{ padding: "12px 16px", background: "white", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8, cursor: "pointer", fontSize: fontSize.md, minHeight: 44, fontWeight: 700 }}>Cancel</button>
              <button onClick={handleLoadMore} disabled={loadMoreSubmitting} style={{ padding: "12px 16px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: loadMoreSubmitting ? "not-allowed" : "pointer", fontWeight: 700, fontSize: fontSize.md, minHeight: 44, opacity: loadMoreSubmitting ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {loadMoreSubmitting ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} /> Saving…</> : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}