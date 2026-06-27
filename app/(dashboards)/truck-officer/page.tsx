"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { apiMutate } from "@/lib/api-mutation"
import RoleSwitcher from "@/components/RoleSwitcher"
import { formatAmount, parseAmount } from "@/lib/formatAmount"
import ModernInput from "@/components/ModernInput"
import { Icon } from "@iconify/react"
import { useBreakpoint } from "@/app/hooks/useBreakpoint"
import ReportModal from "@/components/ReportModal"

type AssignedTruck = {
  plate_number: string
  kbnl_truck_no: string | null
  truck_model: string
  status: string
  fuel_balance: number
}

type MaintenanceDeposit = {
  deposit_id: string
  amount: number
  note: string | null
  deposited_by: string
  created_at: string
}

type BulkProcurement = {
  procurement_id: string
  item_name: string
  total_amount: number
  notes: string | null
  logged_at: string
}

type MaintenanceReport = {
  report_id: string
  plate_number: string
  manager_id: string
  maintenance_type: string
  maintenance_location: string | null
  amount: number
  notes: string | null
  status: "Pending" | "Validated" | "Rejected"
  rejection_reason: string | null
  reported_at: string
}

type FuelExpense = {
  expense_id: string
  plate_number: string
  trip_id: string
  litres: number
  notes: string | null
  logged_at: string
}

type Trip = {
  trip_id: string
  plate_number: string
  material_centre: string
  product: string
  created_at: string
}

type ATF = {
  request_id: string
  atf_code: string
  plate_number: string
  driver_name: string
  litres: number
  atf_status: string
  requested_at: string
  rate_per_litre: number | null
  total_amount: number | null
}

type Driver = {
  driver_id: string
  full_name: string
}

type TruckOfficer = {
  manager_id: string
  full_name: string
  profile_picture_url?: string
}

const MAINTENANCE_SUGGESTIONS = [
  "Oil service", "Tyre change", "Brake repair", "Electrical work",
  "Engine repair", "Suspension repair", "Body work", "Replacement of parts",
  "Coolant/radiator service", "Battery replacement", "Wheel alignment",
  "Exhaust repair", "General inspection",
]

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

const statusColor = (status: string) => {
  switch (status) {
    case "Pending": return { bg: "#fff8e1", color: "#f5a623", border: "#fde68a" }
    case "Validated": return { bg: "#f0fff4", color: "#16a34a", border: "#86efac" }
    case "Rejected": return { bg: "#fef2f2", color: "#ef4444", border: "#fecaca" }
    default: return { bg: "#f8fafc", color: "#64748b", border: "#e2e8f0" }
  }
}

const atfStatusColor = (status: string) => {
  switch (status) {
    case "Pending": return { bg: "#fff8e1", color: "#f5a623", border: "#fde68a" }
    case "Authorised": return { bg: "#f0f7ff", color: "#0070f3", border: "#bfdbfe" }
    case "Dispensed": return { bg: "#f0f7ff", color: "#0070f3", border: "#bfdbfe" }
    case "Confirmed": return { bg: "#f0fff4", color: "#16a34a", border: "#86efac" }
    case "Invalidated": return { bg: "#fef2f2", color: "#ef4444", border: "#fecaca" }
    default: return { bg: "#f8fafc", color: "#64748b", border: "#e2e8f0" }
  }
}

export default function TruckOfficerDashboard() {
  const router = useRouter()
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"

  const fileInputRef = useRef<HTMLInputElement>(null)

  const [officer, setOfficer] = useState<TruckOfficer | null>(null)
  const [assignedTrucks, setAssignedTrucks] = useState<AssignedTruck[]>([])
  const [reports, setReports] = useState<MaintenanceReport[]>([])
  const [procurements, setProcurements] = useState<BulkProcurement[]>([])
  const [deposits, setDeposits] = useState<MaintenanceDeposit[]>([])
  const [balanceMap, setBalanceMap] = useState<Record<string, number>>({})
  const [fuelExpenses, setFuelExpenses] = useState<FuelExpense[]>([])
  const [atfs, setAtfs] = useState<ATF[]>([])
  const [maintenanceBalance, setMaintenanceBalance] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [tab, setTab] = useState<"reports" | "fuel" | "atf">("reports")
  const [filter, setFilter] = useState("All")

  const [allDrivers, setAllDrivers] = useState<Driver[]>([])

  // Profile picture upload
  const [showPictureModal, setShowPictureModal] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [picturePreview, setPicturePreview] = useState<string | null>(null)
  const [pictureLoading, setPictureLoading] = useState(false)
  const [pictureError, setPictureError] = useState("")

  // Log maintenance modal
  const [showLogModal, setShowLogModal] = useState(false)
  const [logPlate, setLogPlate] = useState("")
  const [logType, setLogType] = useState("")
  const [logTypeCustom, setLogTypeCustom] = useState("")
  const [logAmount, setLogAmount] = useState("")
  const [logLocation, setLogLocation] = useState("")
  const [logNotes, setLogNotes] = useState("")
  const [logError, setLogError] = useState("")
  const [logLoading, setLogLoading] = useState(false)

  // Log fuel expense modal
  const [showFuelModal, setShowFuelModal] = useState(false)
  const [fuelPlate, setFuelPlate] = useState("")
  const [fuelTrips, setFuelTrips] = useState<Trip[]>([])
  const [fuelTripId, setFuelTripId] = useState("")
  const [fuelLitres, setFuelLitres] = useState("")
  const [fuelNotes, setFuelNotes] = useState("")
  const [fuelError, setFuelError] = useState("")
  const [fuelLoading, setFuelLoading] = useState(false)

  // ATF initiation modal
  const [showATFModal, setShowATFModal] = useState(false)
  const [atfPlate, setAtfPlate] = useState("")
  const [atfDriverId, setAtfDriverId] = useState("")
  const [atfLitres, setAtfLitres] = useState("")
  const [atfCompanyId, setAtfCompanyId] = useState("")
  const [atfError, setAtfError] = useState("")
  const [atfLoading, setAtfLoading] = useState(false)
  const [fuelCompanies, setFuelCompanies] = useState<{ company_id: string; company_name: string }[]>([])

  const filters = ["All", "Pending", "Validated", "Rejected"]

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.push("/login")
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push("/login"); return }
      const user = session.user

      const { data: profile } = await supabase
        .from("Profiles").select("full_name").eq("user_id", user.id).single()

      const { data: manager } = await supabase
        .from("truck_officers")
        .select("manager_id, full_name, profile_picture_url")
        .eq("manager_id", user.id)
        .single()

      if (!manager) {
        router.push("/login")
        return
      }

      const managerId = manager.manager_id
      setOfficer({ ...manager, full_name: profile?.full_name ?? manager.full_name })

      const { data: drivers } = await supabase
        .from("Drivers").select("driver_id, full_name").eq("status", "Active").order("full_name")
      setAllDrivers(drivers || [])

      const { data: companies } = await supabase
        .from("fuel_companies").select("company_id, company_name").order("company_name")
      setFuelCompanies(companies || [])

      await Promise.all([
        fetchTrucks(managerId),
        fetchReports(managerId),
        fetchProcurements(),
        fetchDeposits(),
        fetchFuelExpenses(managerId),
        fetchMaintenanceBalance(),
        fetchATFs(managerId),
      ])
      setLoading(false)
    }
    init()
  }, [])

  useEffect(() => {
    if (!officer) return
    const interval = setInterval(() => {
      fetchReports(officer.manager_id)
      fetchProcurements()
      fetchDeposits()
      fetchFuelExpenses(officer.manager_id)
      fetchMaintenanceBalance()
      fetchATFs(officer.manager_id)
    }, 30000)
    return () => clearInterval(interval)
  }, [officer])

  async function fetchMaintenanceBalance() {
    const { data } = await supabase
      .from("maintenance_balance").select("current_balance").eq("id", 1).single()
    if (data) setMaintenanceBalance(data.current_balance)
  }

  async function fetchTrucks(mId: string) {
    const { data: assignments } = await supabase
      .from("maintenance_assignments").select("plate_number").eq("manager_id", mId)
    if (!assignments || assignments.length === 0) { setAssignedTrucks([]); return }

    const plates = assignments.map(a => a.plate_number)
    const { data: trucks } = await supabase
      .from("Trucks")
      .select("plate_number, kbnl_truck_no, truck_model, status, fuel_balance")
      .in("plate_number", plates)
      .order("plate_number", { ascending: true })
    setAssignedTrucks(trucks || [])
  }

  async function fetchReports(_mId: string) {
    const { data } = await supabase
      .from("maintenance_reports")
      .select("report_id, plate_number, manager_id, maintenance_type, maintenance_location, amount, notes, status, rejection_reason, reported_at")
      .order("reported_at", { ascending: false })
    setReports(data || [])
    setLastUpdated(new Date())
  }

  async function fetchProcurements() {
    const { data } = await supabase.from("bulk_procurement").select("*").order("logged_at", { ascending: false })
    if (data) setProcurements(data)
  }

  async function fetchDeposits() {
    const { data } = await supabase.from("maintenance_deposits").select("*").order("created_at", { ascending: false })
    if (data) setDeposits(data)
  }

  async function fetchFuelExpenses(mId: string) {
    const { data } = await supabase
      .from("truck_fuel_expenses")
      .select("expense_id, plate_number, trip_id, litres, notes, logged_at")
      .eq("manager_id", mId)
      .order("logged_at", { ascending: false })
    setFuelExpenses(data || [])
  }

  async function fetchATFs(mId: string) {
    const { data: raw } = await supabase
      .from("fuel_requests")
      .select("request_id, atf_code, plate_number, driver_id, litres, atf_status, requested_at, rate_per_litre, total_amount")
      .eq("initiated_by", mId)
      .order("requested_at", { ascending: false })

    if (!raw) return

    const enriched = await Promise.all(raw.map(async (r) => {
      const { data: driver } = await supabase
        .from("Drivers").select("full_name").eq("driver_id", r.driver_id).single()
      return {
        ...r,
        driver_name: driver?.full_name ?? "Unknown",
      }
    }))
    setAtfs(enriched)
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
      const fileName = `${officer.manager_id}-${Date.now()}.${fileExt}`
      const filePath = `${officer.manager_id}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from("profile-pictures")
        .upload(filePath, selectedFile, { upsert: false })

      if (uploadError) { setPictureError("Upload failed"); setPictureLoading(false); return }

      const { data: { publicUrl } } = supabase.storage
        .from("profile-pictures")
        .getPublicUrl(filePath)

      const { error: updateError } = await supabase
        .from("truck_officers")
        .update({ profile_picture_url: publicUrl })
        .eq("manager_id", officer.manager_id)

      if (updateError) {
        await supabase.storage.from("profile-pictures").remove([filePath])
        setPictureError("Failed to save profile")
        setPictureLoading(false)
        return
      }

      if (officer.profile_picture_url) {
        const oldPath = officer.profile_picture_url.split("/").slice(-2).join("/")
        await supabase.storage.from("profile-pictures").remove([oldPath])
      }

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

  async function handleFuelPlateChange(plate: string) {
    setFuelPlate(plate); setFuelTripId(""); setFuelTrips([]); setFuelError("")
    if (!plate) return
    const { data } = await supabase
      .from("Trips")
      .select("trip_id, plate_number, material_centre, product, created_at")
      .eq("plate_number", plate).eq("trip_status", "Completed")
      .order("created_at", { ascending: false }).limit(30)
    setFuelTrips(data || [])
  }

  async function handleLogReport() {
    const finalType = logType === "__custom__" ? logTypeCustom.trim() : logType
    if (!logPlate) return setLogError("Select a truck")
    if (!finalType) return setLogError("Enter a maintenance type")
    if (!logLocation.trim()) return setLogError("Enter the maintenance location")
    if (!logAmount || parseAmount(logAmount) <= 0) return setLogError("Enter a valid amount")

    setLogLoading(true)
    const { error } = await apiMutate("maintenance", {
      action: "insert",
      table: "maintenance_reports",
      data: {
        manager_id: officer?.manager_id, plate_number: logPlate, maintenance_type: finalType,
        maintenance_location: logLocation.trim(), amount: parseAmount(logAmount),
        notes: logNotes.trim() || null,
      },
    })
    setLogLoading(false)
    if (error) { setLogError("Failed to log report"); return }
    setShowLogModal(false)
    setLogPlate(""); setLogType(""); setLogTypeCustom(""); setLogAmount(""); setLogLocation(""); setLogNotes(""); setLogError("")
    if (officer) fetchReports(officer.manager_id)
  }

  async function handleLogFuelExpense() {
    const litres = parseFloat(fuelLitres)
    if (!fuelPlate) return setFuelError("Select a truck")
    if (!fuelTripId) return setFuelError("Select a trip")
    if (!fuelLitres || isNaN(litres) || litres <= 0) return setFuelError("Enter valid litres")
    const truck = assignedTrucks.find(t => t.plate_number === fuelPlate)
    if (!truck) return setFuelError("Truck not found")

    setFuelLoading(true)

    const { data: freshTruck } = await supabase
      .from("Trucks")
      .select("fuel_balance")
      .eq("plate_number", fuelPlate)
      .single()

    const freshBalance = freshTruck?.fuel_balance ?? 0
    if (litres > freshBalance) {
      setFuelError(`Only ${freshBalance}L available for this truck`)
      setFuelLoading(false)
      return
    }

    const { error: expenseError } = await apiMutate("fuel", {
      action: "insert",
      table: "truck_fuel_expenses",
      data: {
        manager_id: officer?.manager_id, plate_number: fuelPlate, trip_id: fuelTripId,
        litres, notes: fuelNotes.trim() || null,
      },
    })
    if (expenseError) { setFuelError("Failed to log fuel expense"); setFuelLoading(false); return }

    const { error: truckError } = await apiMutate("trips", {
      action: "update", table: "Trucks",
      data: { fuel_balance: freshBalance - litres },
      filters: { plate_number: fuelPlate },
    })
    if (truckError) {
      setFuelError("Expense logged but truck balance update failed. Contact support.")
      setFuelLoading(false)
      return
    }

    setFuelLoading(false)
    setShowFuelModal(false)
    setFuelPlate(""); setFuelTripId(""); setFuelTrips([]); setFuelLitres(""); setFuelNotes(""); setFuelError("")
    if (officer) {
      await fetchTrucks(officer.manager_id)
      await fetchFuelExpenses(officer.manager_id)
    }
  }

  function generateATFCode() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    let code = ""
    for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)]
    return code
  }

  async function handleInitiateATF() {
    if (!atfPlate) return setAtfError("Select a truck")
    if (!atfDriverId) return setAtfError("Select a driver")
    if (!atfLitres || parseFloat(atfLitres) <= 0) return setAtfError("Enter valid litres")
    if (!atfCompanyId) return setAtfError("Select a fuel station")

    const { data: existing } = await supabase
      .from("fuel_requests")
      .select("request_id")
      .eq("plate_number", atfPlate)
      .in("atf_status", ["Pending", "Authorised", "Dispensed"])
      .single()

    if (existing) return setAtfError("This truck already has an open ATF. Wait for it to be resolved first.")

    setAtfLoading(true)
    const atf_code = generateATFCode()
    const { error } = await apiMutate("fuel", {
      action: "insert",
      table: "fuel_requests",
      data: {
        atf_code,
        plate_number: atfPlate,
        driver_id: atfDriverId,
        company_id: atfCompanyId,
        litres: parseFloat(atfLitres),
        initiated_by: officer?.manager_id,
        atf_status: "Pending",
      },
    })
    setAtfLoading(false)
    if (error) {
      if (error.toLowerCase().includes("duplicate") || error.toLowerCase().includes("unique")) {
        setAtfError("This truck already has an open ATF or code collision occurred. Try again.")
        return
      }
      setAtfError("Failed to initiate ATF")
      return
    }

    setShowATFModal(false)
    setAtfPlate(""); setAtfDriverId(""); setAtfLitres(""); setAtfCompanyId(""); setAtfError("")
    if (officer) fetchATFs(officer.manager_id)
  }

  useEffect(() => {
    const map: Record<string, number> = {}
    const records: { id: string; type: "deduction"; amount: number; created_at: string }[] = [
      ...reports.filter(r => r.status === "Validated").map(r => ({
        id: r.report_id, type: "deduction" as const, amount: r.amount, created_at: r.reported_at
      })),
      ...procurements.map(p => ({
        id: p.procurement_id, type: "deduction" as const, amount: p.total_amount, created_at: p.logged_at
      })),
      ...deposits.map(d => ({
        id: d.deposit_id, type: "deduction" as const, amount: -d.amount, created_at: d.created_at
      })),
    ]
    records.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    let running = maintenanceBalance ?? 0
    for (const rec of records) {
      if (rec.type === "deduction") {
        map[rec.id] = running
        running += rec.amount
      }
    }
    setBalanceMap(map)
  }, [reports, procurements, deposits, maintenanceBalance])

  const myReports = reports.filter(r => r.manager_id === officer?.manager_id)
  const filteredReports = filter === "All" ? myReports : myReports.filter(r => r.status === filter)

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

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "'Inter', sans-serif" }}>
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
              <RoleSwitcher currentRole="TruckOfficer" style={{ margin: "2px 0 0", fontSize: fontSize.sm, color: "#64748b" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setShowReportModal(true)}
              style={{ padding: "8px 14px", background: "#fff8e1", color: "#f5a623", border: "1.5px solid #f8ad5c", borderRadius: 8, cursor: "pointer", fontSize: fontSize.sm, minHeight: 40, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s", whiteSpace: "nowrap" }}
              onMouseEnter={e => { e.currentTarget.style.background = "#fff0e1"; e.currentTarget.style.borderColor = "#f8ad5c" }}
              onMouseLeave={e => { e.currentTarget.style.background = "#fff8e1"; e.currentTarget.style.borderColor = "#f8ad5c" }}
            >
              <Icon icon="mdi:alert-circle-outline" width={16} />
              {!isMobile && "Report"}
            </button>
            <button
              onClick={async () => { await supabase.auth.signOut(); router.push("/login") }}
              style={{ padding: "8px 16px", background: "rgba(239, 68, 68, 0.05)", color: "#ef4444", border: "1.5px solid #fecaca", borderRadius: 6, cursor: "pointer", fontSize: fontSize.sm, minHeight: 40, fontWeight: 600, transition: "all 0.2s", whiteSpace: "nowrap" }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)"; e.currentTarget.style.borderColor = "#fca5a5" }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(239, 68, 68, 0.05)"; e.currentTarget.style.borderColor = "#fecaca" }}
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding: isMobile ? "16px" : "32px", maxWidth: 1200, margin: "0 auto" }}>

        {/* Maintenance Balance */}
        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: isMobile ? 16 : 24, marginBottom: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <p style={{ margin: "0 0 8px 0", fontWeight: 600, fontSize: fontSize.sm, color: "#94a3b8", letterSpacing: 0.5 }}>Maintenance Balance</p>
          <p style={{ margin: 0, fontSize: isMobile ? fontSize["2xl"] : fontSize.xl, fontWeight: 700, color: "#0070f3" }}>
            ₦{maintenanceBalance !== null ? maintenanceBalance.toLocaleString() : "—"}
          </p>
        </div>

        {/* Assigned Trucks */}
        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: isMobile ? 16 : 24, marginBottom: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: fontSize.lg, color: "#0f172a" }}>My Trucks ({assignedTrucks.length})</p>
            <button onClick={() => officer && fetchTrucks(officer.manager_id)} style={{ padding: "6px 12px", fontSize: fontSize.xs, cursor: "pointer", borderRadius: 6, border: "1px solid #e2e8f0", background: "white", color: "#64748b", transition: "all 0.2s", fontWeight: 600 }} onMouseEnter={e => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1" }} onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#e2e8f0" }}>
              Refresh
            </button>
          </div>
          {assignedTrucks.length === 0 && <p style={{ color: "#64748b", fontSize: fontSize.base, margin: 0 }}>No trucks assigned yet.</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {assignedTrucks.map(t => (
              <div key={t.plate_number} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0", transition: "all 0.2s" }} onMouseEnter={e => { e.currentTarget.style.background = "#f0f7ff"; e.currentTarget.style.borderColor = "#bfdbfe" }} onMouseLeave={e => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#e2e8f0" }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: fontSize.base, color: "#0f172a" }}>{t.plate_number}</p>
                  <p style={{ margin: "2px 0 0", fontSize: fontSize.xs, color: "#94a3b8" }}>{t.truck_model}{t.kbnl_truck_no ? ` · #${t.kbnl_truck_no}` : ""}</p>
                </div>
                <span style={{ fontSize: fontSize.sm, color: "#0070f3", fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                  <Icon icon="mdi:gas-station" width={16} />{t.fuel_balance}L
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Section Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
          {[
            { key: "reports", label: "Maintenance", icon: "mdi:wrench" },
            { key: "fuel", label: "Fuel Log", icon: "mdi:fuel" },
            { key: "atf", label: "ATF", icon: "mdi:gas-station" },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as any)}
              style={{
                padding: "8px 16px", borderRadius: 6, fontSize: fontSize.sm, cursor: "pointer",
                border: `1.5px solid ${tab === t.key ? "" : "#e2e8f0"}`,
                background: tab === t.key ? "#171717" : "white",
                color: tab === t.key ? "white" : "#64748b",
                fontWeight: tab === t.key ? 600 : 500,
                transition: "all 0.2s",
                display: "flex",
                alignItems: "center",
                gap: 6,
                minHeight: 40,
              }}
              onMouseEnter={e => { if (tab !== t.key) { e.currentTarget.style.borderColor = "#cbd5e1"; e.currentTarget.style.background = "#f8fafc" } }}
              onMouseLeave={e => { if (tab !== t.key) { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.background = "white" } }}
            >
              <Icon icon={t.icon} width={16} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Reports Tab */}
        {tab === "reports" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {filters.map(f => {
                  let activeColor = "#0070f3"
                  let activeBg = "rgba(0, 112, 243, 0.1)"
                  if (f === "Pending") { activeColor = "#f5a623"; activeBg = "rgba(245, 166, 35, 0.1)" }
                  if (f === "Validated") { activeColor = "#16a34a"; activeBg = "rgba(22, 163, 74, 0.1)" }
                  if (f === "Rejected") { activeColor = "#ef4444"; activeBg = "rgba(239, 68, 68, 0.1)" }

                  return (
                    <button key={f} onClick={() => setFilter(f)} style={{
                      padding: "6px 14px", borderRadius: 20, fontSize: fontSize.xs, cursor: "pointer",
                      border: `1.5px solid ${filter === f ? activeColor : "#e2e8f0"}`,
                      background: filter === f ? activeBg : "white",
                      color: filter === f ? activeColor : "#64748b",
                      fontWeight: filter === f ? 600 : 500,
                      transition: "all 0.2s",
                      minHeight: 40,
                    }} onMouseEnter={e => { if (filter !== f) { e.currentTarget.style.borderColor = "#cbd5e1"; e.currentTarget.style.background = "#f8fafc" } }} onMouseLeave={e => { if (filter !== f) { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.background = "white" } }}>{f}</button>
                  )
                })}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {lastUpdated && <span style={{ fontSize: fontSize.xs, color: "#94a3b8", whiteSpace: "nowrap" }}>Updated {lastUpdated.toLocaleTimeString()}</span>}
                <button onClick={() => officer && fetchReports(officer.manager_id)} style={{ padding: "6px 12px", fontSize: fontSize.xs, cursor: "pointer", borderRadius: 6, border: "1px solid #e2e8f0", background: "white", color: "#64748b", transition: "all 0.2s", fontWeight: 600 }} onMouseEnter={e => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1" }} onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#e2e8f0" }}>
                  Refresh
                </button>
                <button
                  onClick={() => { setShowLogModal(true); setLogError("") }}
                  disabled={assignedTrucks.length === 0}
                  style={{ padding: "8px 16px", fontSize: fontSize.sm, fontWeight: 700, cursor: "pointer", background: "#0070f3", color: "white", border: "none", borderRadius: 8, minHeight: 40, display: "flex", alignItems: "center", gap: 6, transition: "opacity 0.2s", whiteSpace: "nowrap", opacity: assignedTrucks.length === 0 ? 0.5 : 1 }}
                  onMouseEnter={e => { if (assignedTrucks.length > 0) e.currentTarget.style.opacity = "0.9" }}
                  onMouseLeave={e => { if (assignedTrucks.length > 0) e.currentTarget.style.opacity = "1" }}
                >
                  <Icon icon="mdi:plus" width={16} /> Log
                </button>
              </div>
            </div>

            {filteredReports.length === 0 && <p style={{ color: "#64748b", fontSize: fontSize.base }}>No {filter === "All" ? "" : filter.toLowerCase()} reports.</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {filteredReports.map(r => {
                const { bg, color, border } = statusColor(r.status)
                return (
                  <div key={r.report_id} style={{ background: "white", border: `1px solid ${border}`, borderRadius: 12, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", transition: "all 0.2s" }} onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)"; e.currentTarget.style.borderColor = "#cbd5e1" }} onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)"; e.currentTarget.style.borderColor = border }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <div>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: fontSize.lg, color: "#0f172a" }}>{r.plate_number}</p>
                        <p style={{ margin: "4px 0 0", fontSize: fontSize.sm, color: "#64748b" }}>{r.maintenance_type}</p>
                        {r.maintenance_location && <p style={{ margin: "4px 0 0", fontSize: fontSize.xs, color: "#94a3b8" }}>📍 {r.maintenance_location}</p>}
                      </div>
                      <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: fontSize.xs, background: bg, color, fontWeight: 700, whiteSpace: "nowrap", border: `1px solid ${color}33` }}>{r.status}</span>
                    </div>
                    <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px", marginBottom: 12, border: "1px solid #e2e8f0" }}>
                      <p style={{ margin: 0, fontSize: fontSize.xs, color: "#94a3b8" }}>Amount</p>
                      <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#0070f3", fontSize: fontSize.base }}>₦{r.amount.toLocaleString()}</p>
                      {r.status === "Validated" && balanceMap[r.report_id] !== undefined && (
                        <span style={{ marginTop: 4, fontSize: fontSize.xs, fontWeight: 600, color: "#16a34a", background: "#f0fdf4", padding: "2px 8px", borderRadius: 4, display: "inline-block" }}>
                          Balance after: ₦{balanceMap[r.report_id].toLocaleString()}
                        </span>
                      )}
                    </div>
                    {r.notes && <p style={{ margin: "0 0 8px 0", fontSize: fontSize.sm, color: "#64748b" }}><strong>Notes:</strong> {r.notes}</p>}
                    {r.status === "Rejected" && r.rejection_reason && (
                      <div style={{ marginTop: 8, padding: "10px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8 }}>
                        <p style={{ margin: 0, fontSize: fontSize.sm, color: "#b91c1c", fontWeight: 600 }}>{r.rejection_reason}</p>
                      </div>
                    )}
                    <p style={{ margin: "8px 0 0", fontSize: fontSize.xs, color: "#94a3b8" }}>{new Date(r.reported_at).toLocaleString()}</p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Fuel Log Tab */}
        {tab === "fuel" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: fontSize.lg, color: "#0f172a" }}>Fuel Expense Log</p>
              <button
                onClick={() => { setShowFuelModal(true); setFuelError("") }}
                disabled={assignedTrucks.length === 0}
                style={{ padding: "8px 16px", fontSize: fontSize.sm, fontWeight: 700, cursor: "pointer", background: "#0070f3", color: "white", border: "none", borderRadius: 8, minHeight: 40, display: "flex", alignItems: "center", gap: 6, transition: "opacity 0.2s", opacity: assignedTrucks.length === 0 ? 0.5 : 1 }}
                onMouseEnter={e => { if (assignedTrucks.length > 0) e.currentTarget.style.opacity = "0.9" }}
                onMouseLeave={e => { if (assignedTrucks.length > 0) e.currentTarget.style.opacity = "1" }}
              >
                <Icon icon="mdi:plus" width={16} /> Log Consumption
              </button>
            </div>
            {fuelExpenses.length === 0 && <p style={{ color: "#64748b", fontSize: fontSize.base }}>No fuel expenses logged yet.</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {fuelExpenses.map(e => (
                <div key={e.expense_id} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", transition: "all 0.2s" }} onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)"; e.currentTarget.style.borderColor = "#cbd5e1" }} onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)"; e.currentTarget.style.borderColor = "#e2e8f0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: fontSize.base, color: "#0f172a" }}>{e.plate_number}</p>
                      <p style={{ margin: "2px 0 0", fontSize: fontSize.xs, color: "#94a3b8" }}>{new Date(e.logged_at).toLocaleString()}</p>
                    </div>
                    <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: fontSize.sm, background: "#f0f7ff", color: "#0070f3", fontWeight: 700, border: "1px solid #bfdbfe" }}>{e.litres}L</span>
                  </div>
                  {e.notes && <p style={{ margin: "6px 0 0", fontSize: fontSize.sm, color: "#64748b" }}>{e.notes}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ATF Tab */}
        {tab === "atf" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: fontSize.lg, color: "#0f172a" }}>Authority to Fuel</p>
              <button
                onClick={() => { setShowATFModal(true); setAtfError("") }}
                style={{ padding: "8px 16px", fontSize: fontSize.sm, fontWeight: 700, cursor: "pointer", background: "#0070f3", color: "white", border: "none", borderRadius: 8, minHeight: 40, display: "flex", alignItems: "center", gap: 6, transition: "opacity 0.2s" }}
                onMouseEnter={e => e.currentTarget.style.opacity = "0.9"}
                onMouseLeave={e => e.currentTarget.style.opacity = "1"}
              >
                <Icon icon="mdi:plus" width={16} /> Initiate ATF
              </button>
            </div>

            {atfs.length === 0 && <p style={{ color: "#64748b", fontSize: fontSize.base }}>No ATFs initiated yet.</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {atfs.map(atf => {
                const { bg, color, border } = atfStatusColor(atf.atf_status)
                return (
                  <div key={atf.request_id} style={{ background: "white", border: `1px solid ${border}`, borderRadius: 12, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", transition: "all 0.2s" }} onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)"; e.currentTarget.style.borderColor = "#cbd5e1" }} onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)"; e.currentTarget.style.borderColor = border }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <div>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: fontSize.base, fontFamily: "monospace", letterSpacing: 1, color: "#0f172a" }}>{atf.atf_code ?? "Pending"}</p>
                        <p style={{ margin: "4px 0 0", fontSize: fontSize.sm, color: "#64748b" }}>{atf.plate_number} · {atf.driver_name}</p>
                      </div>
                      <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: fontSize.xs, background: bg, color, fontWeight: 700, whiteSpace: "nowrap", border: `1px solid ${color}33` }}>{atf.atf_status}</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px", border: "1px solid #e2e8f0" }}>
                        <p style={{ margin: 0, fontSize: fontSize.xs, color: "#94a3b8" }}>Litres Requested</p>
                        <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#0f172a", fontSize: fontSize.base }}>{atf.litres}L</p>
                      </div>
                      {atf.total_amount && (
                        <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px", border: "1px solid #e2e8f0" }}>
                          <p style={{ margin: 0, fontSize: fontSize.xs, color: "#94a3b8" }}>Total Amount</p>
                          <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#0070f3", fontSize: fontSize.base }}>₦{atf.total_amount.toLocaleString()}</p>
                        </div>
                      )}
                    </div>
                    <p style={{ margin: "8px 0 0", fontSize: fontSize.xs, color: "#94a3b8" }}>{new Date(atf.requested_at).toLocaleString()}</p>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Profile Picture Upload Modal */}
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

      {/* Log Maintenance Modal */}
      {showLogModal && (
        <div onClick={() => { setShowLogModal(false); setLogPlate(""); setLogType(""); setLogTypeCustom(""); setLogAmount(""); setLogLocation(""); setLogNotes(""); setLogError("") }} style={modalOverlay}>
          <div onClick={e => e.stopPropagation()} style={modalBox}>
            <h3 style={{ marginBottom: 6, color: "#0f172a", fontSize: fontSize.xl, fontWeight: 700 }}>Log Maintenance</h3>
            <p style={{ margin: "0 0 20px", fontSize: fontSize.sm, color: "#64748b" }}>Record a maintenance expense</p>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Truck *</label>
              <div style={{ position: "relative" }}>
                <ModernInput as="select" value={logPlate} onChange={e => { setLogPlate(e.target.value); setLogError("") }} style={inputStyle}>
                  <option value="">Select truck</option>
                  {assignedTrucks.map(t => <option key={t.plate_number} value={t.plate_number}>{t.plate_number}{t.kbnl_truck_no ? ` · #${t.kbnl_truck_no}` : ""} — {t.truck_model}</option>)}
                </ModernInput>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Maintenance Type *</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                {MAINTENANCE_SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => { setLogType(s); setLogTypeCustom(""); setLogError("") }}
                    style={{ padding: "6px 12px", borderRadius: 20, fontSize: fontSize.xs, cursor: "pointer", border: `1.5px solid ${logType === s ? "#0070f3" : "#e2e8f0"}`, background: logType === s ? "rgba(0, 112, 243, 0.1)" : "white", color: logType === s ? "#0070f3" : "#64748b", fontWeight: logType === s ? 600 : 500, transition: "all 0.2s", minHeight: 36 }}>
                    {s}
                  </button>
                ))}
                <button onClick={() => { setLogType("__custom__"); setLogError("") }}
                  style={{ padding: "6px 12px", borderRadius: 20, fontSize: fontSize.xs, cursor: "pointer", border: `1.5px solid ${logType === "__custom__" ? "#0070f3" : "#e2e8f0"}`, background: logType === "__custom__" ? "rgba(0, 112, 243, 0.1)" : "white", color: logType === "__custom__" ? "#0070f3" : "#64748b", fontWeight: logType === "__custom__" ? 600 : 500, transition: "all 0.2s", minHeight: 36 }}>
                  Other...
                </button>
              </div>
              {logType === "__custom__" && (
                <ModernInput type="text" placeholder="Describe the maintenance type" value={logTypeCustom} onChange={e => { setLogTypeCustom(e.target.value); setLogError("") }} style={inputStyle} autoFocus />
              )}
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Maintenance Location *</label>
              <ModernInput type="text" placeholder="e.g. Mechanic village, Aba Road" value={logLocation} onChange={e => { setLogLocation(e.target.value); setLogError("") }} style={inputStyle} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Amount Spent (₦) *</label>
              <ModernInput type="text" inputMode="numeric" placeholder="e.g. 25,000" value={logAmount} onChange={e => { setLogAmount(formatAmount(e.target.value)); setLogError("") }} style={inputStyle} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Notes (optional)</label>
              <ModernInput as="textarea" placeholder="Any additional details..." value={logNotes} onChange={e => setLogNotes(e.target.value)} rows={3} style={{ ...inputStyle, resize: "none", minHeight: 100, paddingRight: 12 }} />
            </div>
            {logError && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 16, color: "#b91c1c", fontSize: fontSize.sm, fontWeight: 600 }}>{logError}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => { setShowLogModal(false); setLogPlate(""); setLogType(""); setLogTypeCustom(""); setLogAmount(""); setLogLocation(""); setLogNotes(""); setLogError("") }} style={{ padding: "12px 16px", background: "white", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: fontSize.md, minHeight: 44 }}>Cancel</button>
              <button onClick={handleLogReport} disabled={logLoading} style={{ padding: "12px 16px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: logLoading ? "not-allowed" : "pointer", fontWeight: 700, fontSize: fontSize.md, minHeight: 44, opacity: logLoading ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>{logLoading ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} /> Logging...</> : "Log Report"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Log Fuel Expense Modal */}
      {showFuelModal && (
        <div onClick={() => { setShowFuelModal(false); setFuelPlate(""); setFuelTripId(""); setFuelTrips([]); setFuelLitres(""); setFuelNotes(""); setFuelError("") }} style={modalOverlay}>
          <div onClick={e => e.stopPropagation()} style={modalBox}>
            <h3 style={{ marginBottom: 6, color: "#0f172a", fontSize: fontSize.xl, fontWeight: 700 }}>Log Fuel Expense</h3>
            <p style={{ margin: "0 0 20px", fontSize: fontSize.sm, color: "#64748b" }}>Record fuel consumption for a completed trip</p>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Truck *</label>
              <div style={{ position: "relative" }}>
                <ModernInput as="select" value={fuelPlate} onChange={e => handleFuelPlateChange(e.target.value)} style={inputStyle}>
                  <option value="">Select truck</option>
                  {assignedTrucks.map(t => (
                    <option key={t.plate_number} value={t.plate_number}>
                      {t.plate_number}{t.kbnl_truck_no ? ` · #${t.kbnl_truck_no}` : ""} — ⛽ {t.fuel_balance}L
                    </option>
                  ))}
                </ModernInput>
              </div>
            </div>

            {fuelPlate && (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Trip *</label>

                {fuelTrips.length === 0 ? (
                  <p style={{ fontSize: fontSize.sm, color: "#94a3b8", marginTop: 4, margin: 0 }}>
                    No completed trips found for this truck.
                  </p>
                ) : (
                  <div style={{ position: "relative" }}>
                    <ModernInput as="select" value={fuelTripId} onChange={e => { setFuelTripId(e.target.value); setFuelError("") }} style={inputStyle}>
                      <option value="">Select trip</option>
                      {fuelTrips.map(t => (
                        <option key={t.trip_id} value={t.trip_id}>
                          {new Date(t.created_at).toLocaleDateString()} — {t.material_centre} · {t.product}
                        </option>
                      ))}
                    </ModernInput>
                  </div>
                )}
              </div>
            )}

            {fuelTripId && (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Estimated Litres Consumed *</label>
                <ModernInput type="number" step="0.1" placeholder="e.g. 120" value={fuelLitres} onChange={e => { setFuelLitres(e.target.value); setFuelError("") }} style={inputStyle} />
              </div>
            )}

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Notes (optional)</label>
              <ModernInput as="textarea" placeholder="e.g. Long haul — 400km" value={fuelNotes} onChange={e => setFuelNotes(e.target.value)} rows={3} style={{ ...inputStyle, resize: "none", minHeight: 100, paddingRight: 12 }} />
            </div>

            {fuelError && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 16, color: "#b91c1c", fontSize: fontSize.sm, fontWeight: 600 }}>{fuelError}</div>}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => { setShowFuelModal(false); setFuelPlate(""); setFuelTripId(""); setFuelTrips([]); setFuelLitres(""); setFuelNotes(""); setFuelError("") }} style={{ padding: "12px 16px", background: "white", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: fontSize.md, minHeight: 44 }}>Cancel</button>
              <button onClick={handleLogFuelExpense} disabled={fuelLoading} style={{ padding: "12px 16px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: fuelLoading ? "not-allowed" : "pointer", fontWeight: 700, fontSize: fontSize.md, minHeight: 44, opacity: fuelLoading ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>{fuelLoading ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} /> Logging...</> : "Log Consumption"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ATF Initiation Modal */}
      {showATFModal && (
        <div onClick={() => { setShowATFModal(false); setAtfPlate(""); setAtfDriverId(""); setAtfLitres(""); setAtfCompanyId(""); setAtfError("") }} style={modalOverlay}>
          <div onClick={e => e.stopPropagation()} style={modalBox}>
            <h3 style={{ marginBottom: 6, color: "#0f172a", fontSize: fontSize.xl, fontWeight: 700 }}>Initiate ATF</h3>
            <p style={{ margin: "0 0 20px", fontSize: fontSize.sm, color: "#64748b" }}>Authority to Fuel — this will be sent to the Truck Admin for authorisation</p>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Truck *</label>
              <div style={{ position: "relative" }}>
                <ModernInput as="select" value={atfPlate} onChange={e => { setAtfPlate(e.target.value); setAtfError("") }} style={inputStyle}>
                  <option value="">Select truck</option>
                  {assignedTrucks.map(t => <option key={t.plate_number} value={t.plate_number}>{t.plate_number}{t.kbnl_truck_no ? ` · #${t.kbnl_truck_no}` : ""} — ⛽ {t.fuel_balance}L</option>)}
                </ModernInput>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Driver *</label>
              <div style={{ position: "relative" }}>
                <ModernInput as="select" value={atfDriverId} onChange={e => { setAtfDriverId(e.target.value); setAtfError("") }} style={inputStyle}>
                  <option value="">Select driver</option>
                  {allDrivers.map(d => <option key={d.driver_id} value={d.driver_id}>{d.full_name}</option>)}
                </ModernInput>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Fuel Station *</label>
              <div style={{ position: "relative" }}>
                <ModernInput as="select" value={atfCompanyId} onChange={e => { setAtfCompanyId(e.target.value); setAtfError("") }} style={inputStyle}>
                  <option value="">Select station</option>
                  {fuelCompanies.map(c => <option key={c.company_id} value={c.company_id}>{c.company_name}</option>)}
                </ModernInput>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Litres to Fill *</label>
              <ModernInput type="number" step="0.1" placeholder="e.g. 200" value={atfLitres} onChange={e => { setAtfLitres(e.target.value); setAtfError("") }} style={inputStyle} />
            </div>

            {atfError && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 16, color: "#b91c1c", fontSize: fontSize.sm, fontWeight: 600 }}>{atfError}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => { setShowATFModal(false); setAtfPlate(""); setAtfDriverId(""); setAtfLitres(""); setAtfCompanyId(""); setAtfError("") }} style={{ padding: "12px 16px", background: "white", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: fontSize.md, minHeight: 44 }}>Cancel</button>
              <button onClick={handleInitiateATF} disabled={atfLoading} style={{ padding: "12px 16px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: atfLoading ? "not-allowed" : "pointer", fontWeight: 700, fontSize: fontSize.md, minHeight: 44, opacity: atfLoading ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>{atfLoading ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} /> Initiating...</> : "Submit ATF"}</button>
            </div>
          </div>
        </div>
      )}

      <ReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        userId={officer?.manager_id || ""}
        userRole="TruckOfficer"
      />
    </div>
  )
}