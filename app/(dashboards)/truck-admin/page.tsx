"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { apiMutate } from "@/lib/api-mutation"
import RoleSwitcher from "@/components/RoleSwitcher"
import { formatAmount, parseAmount } from "@/lib/formatAmount"
import { Icon } from "@iconify/react"
import { useBreakpoint } from "@/app/hooks/useBreakpoint"
import ReportModal from "@/components/ReportModal"
import ProfilePictureUpload from "@/components/ProfilePictureUpload"
import TruckMonitorSection from "@/components/admin/TruckMonitorSection"
import { FONT_SIZE, POLLING_INTERVAL } from "@/lib/constants"
import { toISOString } from "@/lib/date-utils"
import { requireDashboardRole } from "@/lib/auth-helpers"
import { Role } from "@/lib/roles"
import { formatDateTime, formatTime } from "@/lib/date-utils"
import { useATFs } from "@/lib/hooks/useATFs"

type MaintenanceReport = {
  report_id: string
  plate_number: string
  manager_name: string
  maintenance_type: string
  maintenance_location: string | null
  amount: number
  notes: string | null
  status: "Pending" | "Validated" | "Rejected"
  rejection_reason: string | null
  reported_at: string
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
  distributions: { plate_number: string; amount_allocated: number }[]
}

type FeedItem =
  | { kind: "report"; data: MaintenanceReport; date: string }
  | { kind: "procurement"; data: BulkProcurement; date: string }

type ATF = {
  request_id: string
  atf_code: string | null
  plate_number: string
  driver_name: string
  officer_name: string
  company_name: string
  litres: number
  atf_status: string
  requested_at: string
  rate_per_litre: number | null
  total_amount: number | null
}

type TruckAdmin = {
  admin_id: string
  full_name: string
  profile_picture_url?: string
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

const filterColor = (filter: string, activeFilter: string) => {
  if (filter === "All") return { bg: activeFilter === "All" ? "rgba(0, 112, 243, 0.1)" : "white", color: activeFilter === "All" ? "#0070f3" : "#64748b", border: activeFilter === "All" ? "#0070f3" : "#e2e8f0" }
  if (filter === "Pending") return { bg: activeFilter === "Pending" ? "rgba(245, 166, 35, 0.1)" : "white", color: activeFilter === "Pending" ? "#f5a623" : "#64748b", border: activeFilter === "Pending" ? "#f5a623" : "#e2e8f0" }
  if (filter === "Validated") return { bg: activeFilter === "Validated" ? "rgba(22, 163, 74, 0.1)" : "white", color: activeFilter === "Validated" ? "#16a34a" : "#64748b", border: activeFilter === "Validated" ? "#16a34a" : "#e2e8f0" }
  if (filter === "Rejected") return { bg: activeFilter === "Rejected" ? "rgba(239, 68, 68, 0.1)" : "white", color: activeFilter === "Rejected" ? "#ef4444" : "#64748b", border: activeFilter === "Rejected" ? "#ef4444" : "#e2e8f0" }
  if (filter === "Bulk Procurement") return { bg: activeFilter === "Bulk Procurement" ? "rgba(124, 58, 237, 0.1)" : "white", color: activeFilter === "Bulk Procurement" ? "#7c3aed" : "#64748b", border: activeFilter === "Bulk Procurement" ? "#7c3aed" : "#e2e8f0" }
  return { bg: "white", color: "#64748b", border: "#e2e8f0" }
}

const atfFilterColor = (filter: string, activeFilter: string) => {
  if (filter === "All") return { bg: activeFilter === "All" ? "rgba(0, 112, 243, 0.1)" : "white", color: activeFilter === "All" ? "#0070f3" : "#64748b", border: activeFilter === "All" ? "#0070f3" : "#e2e8f0" }
  if (filter === "Pending") return { bg: activeFilter === "Pending" ? "rgba(245, 166, 35, 0.1)" : "white", color: activeFilter === "Pending" ? "#f5a623" : "#64748b", border: activeFilter === "Pending" ? "#f5a623" : "#e2e8f0" }
  if (filter === "Authorised" || filter === "Dispensed") return { bg: activeFilter === filter ? "rgba(0, 112, 243, 0.1)" : "white", color: activeFilter === filter ? "#0070f3" : "#64748b", border: activeFilter === filter ? "#0070f3" : "#e2e8f0" }
  if (filter === "Confirmed") return { bg: activeFilter === "Confirmed" ? "rgba(22, 163, 74, 0.1)" : "white", color: activeFilter === "Confirmed" ? "#16a34a" : "#64748b", border: activeFilter === "Confirmed" ? "#16a34a" : "#e2e8f0" }
  if (filter === "Invalidated") return { bg: activeFilter === "Invalidated" ? "rgba(239, 68, 68, 0.1)" : "white", color: activeFilter === "Invalidated" ? "#ef4444" : "#64748b", border: activeFilter === "Invalidated" ? "#ef4444" : "#e2e8f0" }
  return { bg: "white", color: "#64748b", border: "#e2e8f0" }
}

function generateATFCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let code = "ATF-"
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

export default function TruckAdminDashboard() {
  const router = useRouter()
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"

  const [admin, setAdmin] = useState<TruckAdmin | null>(null)
  const [reports, setReports] = useState<MaintenanceReport[]>([])
  const [procurements, setProcurements] = useState<BulkProcurement[]>([])
  const [deposits, setDeposits] = useState<MaintenanceDeposit[]>([])
  const [balanceMap, setBalanceMap] = useState<Record<string, number>>({})
  const [maintenanceBalance, setMaintenanceBalance] = useState<number | null>(null)
  const [atfs, setAtfs] = useState<ATF[]>([])
  const { data: atfsFromHook, refetch: refetchATFs } = useATFs({ all: true })
  useEffect(() => { setAtfs(atfsFromHook as ATF[]) }, [atfsFromHook])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [tab, setTab] = useState<"reports" | "procurement" | "balance" | "atf" | "monitor" | "side-trips">("reports")
  const [filter, setFilter] = useState("All")
  const [atfFilter, setAtfFilter] = useState("All")
  const [feedPage, setFeedPage] = useState(1)
  const [atfPage, setAtfPage] = useState(1)
  const PAGE_SIZE = 50

  const [showPictureModal, setShowPictureModal] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)

  const [validating, setValidating] = useState<MaintenanceReport | null>(null)
  const [validateLoading, setValidateLoading] = useState(false)
  const [rejecting, setRejecting] = useState<MaintenanceReport | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [rejectError, setRejectError] = useState("")
  const [rejectLoading, setRejectLoading] = useState(false)

  const [authorisingATF, setAuthorisingATF] = useState<ATF | null>(null)
  const [authoriseLoading, setAuthoriseLoading] = useState(false)

  const [invalidatingATF, setInvalidatingATF] = useState<ATF | null>(null)
  const [invalidateReason, setInvalidateReason] = useState("")
  const [invalidateError, setInvalidateError] = useState("")
  const [invalidateLoading, setInvalidateLoading] = useState(false)

  // Side trips
  const [sideTrips, setSideTrips] = useState<{ id: string; driver_id: string; plate_number: string; item_description: string; created_at: string; driver_name: string; kbnl_truck_no: string | null }[]>([])
  const [sideTripsLoading, setSideTripsLoading] = useState(false)

  async function fetchSideTrips() {
    setSideTripsLoading(true)
    const { data } = await supabase
      .from("side_trips")
      .select("*")
      .order("created_at", { ascending: false })

    if (data) {
      const enriched = await Promise.all(
        data.map(async (t) => {
          const [driverRes, truckRes] = await Promise.all([
            supabase.from("Drivers").select("full_name").eq("driver_id", t.driver_id).single(),
            supabase.from("Trucks").select("kbnl_truck_no").eq("plate_number", t.plate_number).single(),
          ])
          return {
            ...t,
            driver_name: driverRes.data?.full_name ?? "Unknown",
            kbnl_truck_no: truckRes.data?.kbnl_truck_no ?? null,
          }
        })
      )
      setSideTrips(enriched)
    }
    setSideTripsLoading(false)
  }

  useEffect(() => {
    if (tab === "side-trips" && sideTrips.length === 0) fetchSideTrips()
  }, [tab])

  const [procItem, setProcItem] = useState("")
  const [procTotal, setProcTotal] = useState("")
  const [procNotes, setProcNotes] = useState("")
  const [procError, setProcError] = useState("")
  const [procLoading, setProcLoading] = useState(false)

  const [depositAmount, setDepositAmount] = useState("")
  const [depositNote, setDepositNote] = useState("")
  const [depositError, setDepositError] = useState("")
  const [depositLoading, setDepositLoading] = useState(false)

  const maintenanceFilters = ["All", "Pending", "Validated", "Rejected", "Bulk Procurement"]
  const atfFilters = ["All", "Pending", "Authorised", "Dispensed", "Confirmed", "Invalidated"]

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push("/login"); return }
      const user = session.user

      const hasRole = await requireDashboardRole(user.id, Role.TruckAdmin)
      if (!hasRole) { router.push("/login"); return }

      const { data: profile } = await supabase.from("Profiles").select("full_name").eq("user_id", user.id).single()

      const { data: adm } = await supabase
        .from("truck_admins")
        .select("admin_id, full_name, profile_picture_url")
        .eq("admin_id", user.id)
        .single()

      if (!adm) {
        router.push("/login")
        return
      }

      setAdmin({ ...adm, full_name: profile?.full_name ?? adm.full_name })

      await Promise.all([fetchReports(), fetchProcurements(), fetchMaintenanceBalance(), fetchDeposits()])
      setLoading(false)
    }
    init()
  }, [])

  useEffect(() => {
    if (!admin) return
    const interval = setInterval(() => {
      fetchReports(); fetchProcurements(); fetchMaintenanceBalance(); refetchATFs(); fetchDeposits()
      if (tab === "side-trips") fetchSideTrips()
    }, POLLING_INTERVAL)
    return () => clearInterval(interval)
  }, [admin])

  async function fetchMaintenanceBalance() {
    const { data } = await supabase.from("maintenance_balance").select("current_balance").eq("id", 1).single()
    if (data) setMaintenanceBalance(data.current_balance)
  }

  async function fetchReports() {
    const { data: raw } = await supabase
      .from("maintenance_reports")
      .select("report_id, plate_number, manager_id, maintenance_type, maintenance_location, amount, notes, status, rejection_reason, reported_at")
      .order("reported_at", { ascending: false })
    if (!raw) { setReports([]); return }

    const managerIds = [...new Set(raw.map(r => r.manager_id).filter(Boolean))]
    const { data: managers } = managerIds.length
      ? await supabase.from("truck_officers").select("manager_id, full_name").in("manager_id", managerIds)
      : { data: [] }
    const managerMap = Object.fromEntries((managers || []).map(m => [m.manager_id, m.full_name]))

    const enriched = raw.map(r => ({
      ...r,
      manager_name: managerMap[r.manager_id] ?? "Unknown",
      maintenance_location: r.maintenance_location ?? null,
    }))
    setReports(enriched)
    setLastUpdated(new Date())
  }

  async function fetchProcurements() {
    const { data: raw } = await supabase.from("bulk_procurement").select("procurement_id, item_name, total_amount, notes, logged_at").order("logged_at", { ascending: false })
    if (!raw) { setProcurements([]); return }
    const ids = raw.map(p => p.procurement_id)
    const { data: allDists } = ids.length
      ? await supabase.from("procurement_distributions").select("procurement_id, plate_number, amount_allocated").in("procurement_id", ids)
      : { data: [] }
    const distMap: Record<string, { plate_number: string; amount_allocated: number }[]> = {}
    for (const d of allDists || []) {
      if (!distMap[d.procurement_id]) distMap[d.procurement_id] = []
      distMap[d.procurement_id].push({ plate_number: d.plate_number, amount_allocated: d.amount_allocated })
    }
    const enriched = raw.map(p => ({ ...p, distributions: distMap[p.procurement_id] || [] }))
    setProcurements(enriched)
  }

  async function fetchDeposits() {
    const { data } = await supabase.from("maintenance_deposits").select("*").order("created_at", { ascending: false })
    if (data) setDeposits(data)
  }

  async function handleValidate() {
    if (!validating) return
    setValidateLoading(true)

    const { data, error } = await apiMutate("maintenance", {
      action: "rpc",
      function: "validate_maintenance_report",
      params: { p_report_id: validating.report_id },
    })
    if (error) { setValidateLoading(false); return }

    if (data && typeof data === 'object' && 'new_balance' in (data as Record<string, unknown>)) {
      setMaintenanceBalance((data as { new_balance: number }).new_balance)
    } else {
      setMaintenanceBalance(Math.max(0, (maintenanceBalance ?? 0) - validating.amount))
    }
    setValidateLoading(false)
    setValidating(null)
    fetchReports()
  }

  async function handleReject() {
    if (!rejecting) return
    if (!rejectReason.trim()) return setRejectError("Please provide a reason")
    setRejectLoading(true)
    await apiMutate("maintenance", {
      action: "update",
      table: "maintenance_reports",
      data: { status: "Rejected", rejection_reason: rejectReason.trim() },
      filters: { report_id: rejecting.report_id },
    })
    setRejectLoading(false); setRejecting(null); setRejectReason(""); setRejectError("")
    fetchReports()
  }

  async function handleAuthoriseATF() {
    if (!authorisingATF) return
    setAuthoriseLoading(true)

    const code = generateATFCode()
    const { error } = await apiMutate("fuel", {
      action: "update",
      table: "fuel_requests",
      data: { atf_status: "Authorised", atf_code: code, authorised_by: admin?.admin_id },
      filters: { request_id: authorisingATF.request_id },
    })

    setAuthoriseLoading(false)
    if (error) return
    setAuthorisingATF(null)
    refetchATFs()
  }

  async function handleInvalidate() {
    if (!invalidatingATF) return
    if (!invalidateReason.trim()) return setInvalidateError("Provide a reason for invalidation")

    setInvalidateLoading(true)
    const { error } = await apiMutate("fuel", {
      action: "rpc",
      function: "invalidate_atf",
      params: {
        p_request_id: invalidatingATF.request_id,
        p_reason: invalidateReason.trim(),
      },
    })

    if (error) {
      setInvalidateError(error)
      setInvalidateLoading(false)
      return
    }

    setInvalidateLoading(false)
    setInvalidatingATF(null)
    setInvalidateReason("")
    setInvalidateError("")
    refetchATFs()
  }

  async function handleDeposit() {
    const amount = parseAmount(depositAmount)
    if (!depositAmount || amount <= 0) return setDepositError("Enter a valid amount")
    setDepositLoading(true)

    const { data, error } = await apiMutate("maintenance", {
      action: "rpc",
      function: "add_maintenance_deposit",
      params: { p_amount: amount, p_note: depositNote.trim() || null },
    })
    if (error) { setDepositError(error); setDepositLoading(false); return }

    if (data && typeof data === 'object' && 'new_balance' in (data as Record<string, unknown>)) {
      setMaintenanceBalance((data as { new_balance: number }).new_balance)
    } else {
      setMaintenanceBalance((prev) => (prev ?? 0) + amount)
    }
    setDepositLoading(false); setDepositAmount(""); setDepositNote(""); setDepositError("")
  }

  async function handleLogProcurement() {
    if (!procItem.trim()) return setProcError("Enter item name")
    const totalNum = parseAmount(procTotal)
    if (!procTotal || totalNum <= 0) return setProcError("Enter a valid total amount")
    setProcLoading(true)

    const { data, error } = await apiMutate("maintenance", {
      action: "rpc",
      function: "deduct_maintenance_balance",
      params: {
        p_amount: totalNum,
        p_item_name: procItem.trim(),
        p_notes: procNotes.trim() || null,
      },
    })
    setProcLoading(false)
    if (error) { setProcError(error); return }

    if (data && typeof data === 'object' && 'new_balance' in (data as Record<string, unknown>)) {
      setMaintenanceBalance((data as { new_balance: number }).new_balance)
    } else {
      setMaintenanceBalance((prev) => Math.max(0, (prev ?? 0) - totalNum))
    }
    setProcItem(""); setProcTotal(""); setProcNotes(""); setProcError("")
    await fetchProcurements()
    setTab("reports"); setFilter("Bulk Procurement")
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

  const feedItems: FeedItem[] = [
    ...reports.map(r => ({ kind: "report" as const, data: r, date: r.reported_at })),
    ...procurements.map(p => ({ kind: "procurement" as const, data: p, date: p.logged_at })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const filteredFeedAll = filter === "All" ? feedItems
    : filter === "Bulk Procurement" ? feedItems.filter(f => f.kind === "procurement")
    : feedItems.filter(f => f.kind === "report" && (f.data as MaintenanceReport).status === filter)
  const feedTotalPages = Math.ceil(filteredFeedAll.length / PAGE_SIZE) || 1
  const safeFeedPage = Math.min(feedPage, feedTotalPages)
  const filteredFeed = filteredFeedAll.slice(0, safeFeedPage * PAGE_SIZE)

  const filteredATFsAll = atfFilter === "All" ? atfs : atfs.filter(a => a.atf_status === atfFilter)
  const atfTotalPages = Math.ceil(filteredATFsAll.length / PAGE_SIZE) || 1
  const safeAtfPage = Math.min(atfPage, atfTotalPages)
  const filteredATFs = filteredATFsAll.slice(0, safeAtfPage * PAGE_SIZE)

  const chevron = (
    <Icon icon="mdi:chevron-down" width={18} color="#aaa"
      style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
    />
  )

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", paddingRight: 36,
    boxSizing: "border-box", borderRadius: 8,
    border: "1px solid #e2e8f0", fontSize: FONT_SIZE.base,
    background: "white", color: "#0f172a", minHeight: 48,
  }

  const labelStyle: React.CSSProperties = {
    fontWeight: 600, display: "block",
    marginBottom: 6, fontSize: FONT_SIZE.sm, color: "#475569"
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
        <p style={{ color: "#64748b", fontSize: FONT_SIZE.sm }}>Loading…</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .avatar-btn:hover { border-color: #0070f3 !important; transform: scale(1.05); }
        .avatar-wrapper:hover .camera-overlay { opacity: 1 !important; }
        .btn-hover-opacity:hover { opacity: 0.9 !important; }
        .report-btn:hover { background: #fff0e1 !important; border-color: #f8ad5c !important; }
        .logout-btn:hover { background: rgba(239,68,68,0.1) !important; border-color: #fca5a5 !important; }
        .tab-btn:hover:not(.tab-active) { border-color: #cbd5e1 !important; background: #f8fafc !important; }
        .filter-btn:hover { border-color: #cbd5e1 !important; }
        .card-hover:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08) !important; border-color: #cbd5e1 !important; }
        .invalidate-btn:hover { background: rgba(239,68,68,0.05) !important; border-color: #f87171 !important; }
        .refresh-btn:hover { background: #f8fafc !important; border-color: #cbd5e1 !important; }
      `}</style>

      {/* Profile Banner */}
      <div style={{ background: "white", borderBottom: "1px solid #e2e8f0", padding: isMobile ? "16px" : "24px 32px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", gap: isMobile ? 12 : 16, justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 12 : 16, flex: 1 }}>
            <div className="avatar-wrapper" style={{ position: "relative" }}>
              <div
                onClick={() => setShowPictureModal(true)}
                className="avatar-btn"
                style={{
                  width: isMobile ? 48 : 56,
                  height: isMobile ? 48 : 56,
                  borderRadius: "50%",
                  background: admin?.profile_picture_url ? "transparent" : "#f0f7ff",
                  border: "2px solid #bfdbfe",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  cursor: "pointer",
                  overflow: "hidden",
                  transition: "all 0.2s",
                }}
              >
                {admin?.profile_picture_url ? (
                  <img src={admin.profile_picture_url} alt={admin.full_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ fontSize: isMobile ? 20 : 24, fontWeight: 700, color: "#0070f3" }}>
                    {admin?.full_name.charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="camera-overlay" style={{ position: "absolute", inset: 0, background: "rgba(0, 0, 0, 0.4)", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0, transition: "opacity 0.2s" }}>
                  <Icon icon="mdi:camera" width={20} height={20} color="white" />
                </div>
              </div>
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: isMobile ? FONT_SIZE.lg : FONT_SIZE.xl, fontWeight: 700, color: "#0070f3" }}>
                {admin?.full_name}
              </h1>
              <RoleSwitcher currentRole={Role.TruckAdmin} style={{ margin: "2px 0 0", fontSize: FONT_SIZE.sm, color: "#64748b" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setShowReportModal(true)}
              className="report-btn"
              style={{ padding: "8px 14px", background: "#fff8e1", color: "#f5a623", border: "1.5px solid #f8ad5c", borderRadius: 8, cursor: "pointer", fontSize: FONT_SIZE.sm, minHeight: 40, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s", whiteSpace: "nowrap" }}
            >
              <Icon icon="mdi:alert-circle-outline" width={16} />
              {!isMobile && "Report"}
            </button>
            <button onClick={async () => { await supabase.auth.signOut(); router.push("/login") }} className="logout-btn" style={{ padding: "8px 16px", background: "rgba(239, 68, 68, 0.05)", color: "#ef4444", border: "1.5px solid #fecaca", borderRadius: 8, cursor: "pointer", fontSize: FONT_SIZE.sm, minHeight: 40, fontWeight: 600, transition: "all 0.2s" }}>
              Logout
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding: isMobile ? "16px" : "32px", maxWidth: 1200, margin: "0 auto" }}>

        {/* Balance Card */}
        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: isMobile ? 16 : 24, marginBottom: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <p style={{ margin: "0 0 8px 0", fontWeight: 600, fontSize: FONT_SIZE.sm, color: "#94a3b8", letterSpacing: 0.5 }}>Maintenance Balance</p>
          <p style={{ margin: 0, fontSize: isMobile ? FONT_SIZE["2xl"] : FONT_SIZE.xl, fontWeight: 700, color: "#0070f3" }}>
            ₦{maintenanceBalance !== null ? maintenanceBalance.toLocaleString() : "—"}
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
          {[
            { key: "reports", label: "Maintenance", icon: "mdi:wrench" },
            { key: "monitor", label: "Monitor Trucks", icon: "mdi:truck-check" },
            { key: "atf", label: "ATF", icon: "mdi:gas-station" },
            { key: "procurement", label: "Procurement", icon: "mdi:package" },
            { key: "balance", label: "Top Up", icon: "mdi:plus-circle" },
            { key: "side-trips", label: "Side Trips", icon: "mdi:road-variant" },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as typeof tab)} className={tab !== t.key ? "tab-btn" : "tab-active"} style={{ padding: "8px 16px", borderRadius: 8, fontSize: FONT_SIZE.sm, cursor: "pointer", border: `1.5px solid ${tab === t.key ? "" : "#e2e8f0"}`, background: tab === t.key ? "#171717" : "white", color: tab === t.key ? "white" : "#64748b", fontWeight: tab === t.key ? 600 : 500, transition: "all 0.2s", display: "flex", alignItems: "center", gap: 6, minHeight: 40 }}>
              <Icon icon={t.icon} width={16} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Reports Tab */}
        {tab === "reports" && (
          <div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
              {maintenanceFilters.map(f => {
                const { bg, color, border } = filterColor(f, filter)
                return (
                  <button key={f} onClick={() => setFilter(f)} className="filter-btn" style={{ padding: "6px 14px", borderRadius: 20, fontSize: FONT_SIZE.xs, cursor: "pointer", border: `1.5px solid ${border}`, background: bg, color, fontWeight: filter === f ? 600 : 500, transition: "all 0.2s", minHeight: 40 }}>
                    {f}
                  </button>
                )
              })}
              <div style={{ flex: 1 }} />
              {lastUpdated && <span style={{ fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Updated {formatTime(lastUpdated)}</span>}
              <button onClick={() => { fetchReports(); fetchProcurements() }} className="refresh-btn" style={{ padding: "6px 12px", fontSize: FONT_SIZE.xs, cursor: "pointer", borderRadius: 8, border: "1px solid #e2e8f0", background: "white", color: "#64748b", transition: "all 0.2s", fontWeight: 600 }}>
                ↻
              </button>
            </div>

            {filteredFeed.length === 0 && <p style={{ color: "#64748b", fontSize: FONT_SIZE.base }}>No entries.</p>}
            {filteredFeedAll.length > PAGE_SIZE && (
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 16 }}>
                <button disabled={safeFeedPage <= 1} onClick={() => setFeedPage(p => Math.max(1, p - 1))} style={{ padding: "6px 14px", background: safeFeedPage <= 1 ? "#f0f0f0" : "white", border: "1px solid #e2e8f0", borderRadius: 8, cursor: safeFeedPage <= 1 ? "not-allowed" : "pointer", fontSize: FONT_SIZE.xs, color: safeFeedPage <= 1 ? "#ccc" : "#64748b" }}>
                  ← Previous
                </button>
                <span style={{ display: "flex", alignItems: "center", fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Page {safeFeedPage} of {feedTotalPages}</span>
                <button disabled={safeFeedPage >= feedTotalPages} onClick={() => setFeedPage(p => p + 1)} style={{ padding: "6px 14px", background: safeFeedPage >= feedTotalPages ? "#f0f0f0" : "white", border: "1px solid #e2e8f0", borderRadius: 8, cursor: safeFeedPage >= feedTotalPages ? "not-allowed" : "pointer", fontSize: FONT_SIZE.xs, color: safeFeedPage >= feedTotalPages ? "#ccc" : "#64748b" }}>
                  Next →
                </button>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {filteredFeed.map(item => {
                if (item.kind === "procurement") {
                  const p = item.data as BulkProcurement
                  return (
                    <div key={p.procurement_id} className="card-hover" style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", transition: "all 0.2s" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                        <div>
                          <p style={{ margin: 0, fontWeight: 700, fontSize: FONT_SIZE.lg, color: "#0f172a" }}>{p.item_name}</p>
                          <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>{formatDateTime(p.logged_at)}</p>
                        </div>
                        <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: FONT_SIZE.xs, background: "rgba(124, 58, 237, 0.1)", color: "#7c3aed", fontWeight: 700, border: "1px solid #7c3aed33" }}>Bulk Procurement</span>
                      </div>
                      <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px", marginBottom: 8, border: "1px solid #e2e8f0" }}>
                        <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Total Amount</p>
                        <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#0070f3", fontSize: FONT_SIZE.base }}>₦{p.total_amount.toLocaleString()}</p>
                        {balanceMap[p.procurement_id] !== undefined && (
                          <span style={{ marginTop: 4, fontSize: FONT_SIZE.xs, fontWeight: 600, color: "#16a34a", background: "#f0fdf4", padding: "2px 8px", borderRadius: 4, display: "inline-block" }}>
                            Balance after: ₦{balanceMap[p.procurement_id].toLocaleString()}
                          </span>
                        )}
                      </div>
                      {p.notes && <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#64748b" }}><strong>Notes:</strong> {p.notes}</p>}
                    </div>
                  )
                }
                const r = item.data as MaintenanceReport
                const { bg, color, border } = statusColor(r.status)
                return (
                  <div key={r.report_id} className="card-hover" style={{ background: "white", border: `1px solid ${border}`, borderRadius: 12, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", transition: "all 0.2s" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <div>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: FONT_SIZE.lg, color: "#0f172a" }}>{r.plate_number}</p>
                        <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.sm, color: "#64748b" }}>{r.maintenance_type}</p>
                        {r.maintenance_location && <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>📍 {r.maintenance_location}</p>}
                        <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>By {r.manager_name}</p>
                      </div>
                      <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: FONT_SIZE.xs, background: bg, color, fontWeight: 700, whiteSpace: "nowrap", border: `1px solid ${color}33` }}>{r.status}</span>
                    </div>
                    <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px", marginBottom: 12, border: "1px solid #e2e8f0" }}>
                      <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Amount</p>
                      <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#0070f3", fontSize: FONT_SIZE.base }}>₦{r.amount.toLocaleString()}</p>
                      {r.status === "Validated" && balanceMap[r.report_id] !== undefined && (
                        <span style={{ marginTop: 4, fontSize: FONT_SIZE.xs, fontWeight: 600, color: "#16a34a", background: "#f0fdf4", padding: "2px 8px", borderRadius: 4, display: "inline-block" }}>
                          Balance after: ₦{balanceMap[r.report_id].toLocaleString()}
                        </span>
                      )}
                    </div>
                    {r.notes && <p style={{ margin: "0 0 8px 0", fontSize: FONT_SIZE.sm, color: "#64748b" }}><strong>Notes:</strong> {r.notes}</p>}
                    {r.status === "Rejected" && r.rejection_reason && (
                      <div style={{ padding: "10px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, marginBottom: 12 }}>
                        <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#b91c1c", fontWeight: 600 }}>{r.rejection_reason}</p>
                      </div>
                    )}
                    {r.status === "Pending" && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <button onClick={() => setValidating(r)} className="btn-hover-opacity" style={{ padding: "10px 14px", background: "#16a34a", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: FONT_SIZE.sm, minHeight: 40, transition: "opacity 0.2s" }}>
                          Validate
                        </button>
                        <button onClick={() => { setRejecting(r); setRejectReason(""); setRejectError("") }} className="invalidate-btn" style={{ padding: "10px 14px", background: "white", color: "#ef4444", border: "1.5px solid #ef4444", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: FONT_SIZE.sm, minHeight: 40, transition: "all 0.2s" }}>
                          Reject
                        </button>
                      </div>
                    )}
                    <p style={{ margin: "8px 0 0", fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>{formatDateTime(r.reported_at)}</p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Monitor Trucks Tab */}
        {tab === "monitor" && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <h2 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>Monitor Trucks</h2>
              <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: FONT_SIZE.base }}>
                Track all active trucks and view their routes.
              </p>
            </div>
            <TruckMonitorSection />
          </div>
        )}

        {/* ATF Tab */}
        {tab === "atf" && (
          <div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
              {atfFilters.map(f => {
                const { bg, color, border } = atfFilterColor(f, atfFilter)
                return (
                  <button key={f} onClick={() => setAtfFilter(f)} className="filter-btn" style={{ padding: "6px 14px", borderRadius: 20, fontSize: FONT_SIZE.xs, cursor: "pointer", border: `1.5px solid ${border}`, background: bg, color, fontWeight: atfFilter === f ? 600 : 500, transition: "all 0.2s", minHeight: 40 }}>
                    {f}
                  </button>
                )
              })}
              <div style={{ flex: 1 }} />
                             <button onClick={refetchATFs} className="refresh-btn" style={{ padding: "6px 12px", fontSize: FONT_SIZE.xs, cursor: "pointer", borderRadius: 8, border: "1px solid #e2e8f0", background: "white", color: "#64748b", transition: "all 0.2s", fontWeight: 600 }}>
                ↻
              </button>
            </div>

            {filteredATFs.length === 0 && <p style={{ color: "#64748b", fontSize: FONT_SIZE.base }}>No ATFs found.</p>}
            {filteredATFsAll.length > PAGE_SIZE && (
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 16 }}>
                <button disabled={safeAtfPage <= 1} onClick={() => setAtfPage(p => Math.max(1, p - 1))} style={{ padding: "6px 14px", background: safeAtfPage <= 1 ? "#f0f0f0" : "white", border: "1px solid #e2e8f0", borderRadius: 8, cursor: safeAtfPage <= 1 ? "not-allowed" : "pointer", fontSize: FONT_SIZE.xs, color: safeAtfPage <= 1 ? "#ccc" : "#64748b" }}>
                  ← Previous
                </button>
                <span style={{ display: "flex", alignItems: "center", fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Page {safeAtfPage} of {atfTotalPages}</span>
                <button disabled={safeAtfPage >= atfTotalPages} onClick={() => setAtfPage(p => p + 1)} style={{ padding: "6px 14px", background: safeAtfPage >= atfTotalPages ? "#f0f0f0" : "white", border: "1px solid #e2e8f0", borderRadius: 8, cursor: safeAtfPage >= atfTotalPages ? "not-allowed" : "pointer", fontSize: FONT_SIZE.xs, color: safeAtfPage >= atfTotalPages ? "#ccc" : "#64748b" }}>
                  Next →
                </button>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {filteredATFs.map(atf => {
                const { bg, color, border } = atfStatusColor(atf.atf_status)
                return (
                  <div key={atf.request_id} className="card-hover" style={{ background: "white", border: `1px solid ${border}`, borderRadius: 12, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", transition: "all 0.2s" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <div>
                        {atf.atf_code ? <p style={{ margin: 0, fontWeight: 700, fontSize: FONT_SIZE.base, fontFamily: "monospace", letterSpacing: 1, color: "#0f172a" }}>{atf.atf_code}</p> : <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#94a3b8" }}>Awaiting authorisation</p>}
                        <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.sm, color: "#64748b" }}>{atf.plate_number} · {atf.driver_name}</p>
                        <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Station: {atf.company_name}</p>
                        <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Initiated by {atf.officer_name}</p>
                      </div>
                      <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: FONT_SIZE.xs, background: bg, color, fontWeight: 700, whiteSpace: "nowrap", border: `1px solid ${color}33` }}>{atf.atf_status}</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: atf.total_amount ? "1fr 1fr 1fr" : "1fr 1fr", gap: 10, marginBottom: 12 }}>
                      <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px", border: "1px solid #e2e8f0" }}>
                        <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Litres</p>
                        <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#0f172a", fontSize: FONT_SIZE.base }}>{atf.litres}L</p>
                      </div>
                      {atf.rate_per_litre && (
                        <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px", border: "1px solid #e2e8f0" }}>
                          <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Rate/L</p>
                          <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#0f172a", fontSize: FONT_SIZE.base }}>₦{atf.rate_per_litre.toLocaleString()}</p>
                        </div>
                      )}
                      {atf.total_amount && (
                        <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px", border: "1px solid #e2e8f0" }}>
                          <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Total</p>
                          <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#0070f3", fontSize: FONT_SIZE.base }}>₦{atf.total_amount.toLocaleString()}</p>
                        </div>
                      )}
                    </div>
                    {atf.atf_status === "Pending" && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <button onClick={() => setAuthorisingATF(atf)} className="btn-hover-opacity" style={{ padding: "10px 14px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: FONT_SIZE.sm, minHeight: 40, transition: "opacity 0.2s" }}>
                          Authorise ATF
                        </button>
                        <button onClick={() => { setInvalidatingATF(atf); setInvalidateReason(""); setInvalidateError("") }} className="invalidate-btn" style={{ padding: "10px 14px", background: "white", color: "#ef4444", border: "1.5px solid #ef4444", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: FONT_SIZE.sm, minHeight: 40, transition: "all 0.2s" }}>
                          Invalidate
                        </button>
                      </div>
                    )}
                    {atf.atf_status === "Authorised" && (
                      <button onClick={() => { setInvalidatingATF(atf); setInvalidateReason(""); setInvalidateError("") }} className="invalidate-btn" style={{ width: "100%", padding: "10px 14px", background: "white", color: "#ef4444", border: "1.5px solid #ef4444", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: FONT_SIZE.sm, minHeight: 40, transition: "all 0.2s" }}>
                        Invalidate
                      </button>
                    )}
                    <p style={{ margin: "8px 0 0", fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>{formatDateTime(atf.requested_at)}</p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Side Trips Tab */}
        {tab === "side-trips" && (
          <div>
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ margin: 0, color: "#0f172a", fontSize: isMobile ? "22px" : "24px", fontWeight: 700 }}>
                Side Trips
              </h2>
              <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.sm, color: "#64748b" }}>
                Unofficial trips where drivers carried goods other than cement
              </p>
            </div>

            {sideTripsLoading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", border: "3px solid #e2e8f0", borderTopColor: "#0070f3", animation: "spin 1s linear infinite" }} />
              </div>
            ) : sideTrips.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 24px" }}>
                <Icon icon="mdi:road-variant" width={48} color="#cbd5e1" style={{ marginBottom: 12 }} />
                <p style={{ margin: 0, color: "#64748b", fontSize: FONT_SIZE.base }}>No side trips reported yet</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {sideTrips.map(t => (
                  <div key={t.id} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: FONT_SIZE.base, color: "#0f172a" }}>{t.driver_name}</p>
                      <span style={{ padding: "2px 8px", borderRadius: 4, background: "#f0f7ff", color: "#0c4a6e", fontSize: FONT_SIZE.xs, fontWeight: 500 }}>{t.item_description}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#64748b" }}>
                      {t.plate_number}
                      {t.kbnl_truck_no ? <span> · #{t.kbnl_truck_no}</span> : null}
                    </p>
                    <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>
                      {new Date(t.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Procurement Tab */}
        {tab === "procurement" && (
          <div style={{ maxWidth: 600 }}>
            <h3 style={{ marginBottom: 20, color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>Log Bulk Procurement</h3>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Item Name *</label>
              <input type="text" placeholder="e.g. Grease, Engine oil" value={procItem} onChange={e => { setProcItem(e.target.value); setProcError("") }} style={inputStyle} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Total Amount (₦) *</label>
              <input type="text" inputMode="numeric" placeholder="e.g. 150,000" value={procTotal} onChange={e => { setProcTotal(formatAmount(e.target.value)); setProcError("") }} style={inputStyle} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Notes (optional)</label>
              <textarea placeholder="Any additional details..." value={procNotes} onChange={e => setProcNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: "none", minHeight: 80, paddingRight: 12 }} />
            </div>
            {procError && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 16, color: "#b91c1c", fontSize: FONT_SIZE.sm, fontWeight: 600 }}>{procError}</div>}
            <button onClick={handleLogProcurement} disabled={procLoading} style={{ width: "100%", padding: "12px 16px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: procLoading ? "not-allowed" : "pointer", fontWeight: 700, fontSize: FONT_SIZE.md, minHeight: 48, opacity: procLoading ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {procLoading ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} /> Logging...</> : "Log Procurement"}
            </button>
          </div>
        )}

        {/* Balance Tab */}
        {tab === "balance" && (
          <div style={{ maxWidth: 600 }}>
            <h3 style={{ marginBottom: 20, color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>Top Up maintenance balance</h3>
            <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20, marginBottom: 24 }}>
              <p style={{ margin: "0 0 8px 0", fontWeight: 600, fontSize: FONT_SIZE.sm, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>current balance</p>
              <p style={{ margin: 0, fontSize: FONT_SIZE.xl, fontWeight: 700, color: "#0070f3" }}>₦{maintenanceBalance !== null ? maintenanceBalance.toLocaleString() : "—"}</p>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Amount to Add (₦) *</label>
              <input type="text" inputMode="numeric" placeholder="e.g. 500,000" value={depositAmount} onChange={e => { setDepositAmount(formatAmount(e.target.value)); setDepositError("") }} style={inputStyle} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Note (optional)</label>
              <input type="text" placeholder="e.g. Monthly allocation" value={depositNote} onChange={e => setDepositNote(e.target.value)} style={inputStyle} />
            </div>
            {depositError && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 16, color: "#b91c1c", fontSize: FONT_SIZE.sm, fontWeight: 600 }}>{depositError}</div>}
            <button onClick={handleDeposit} disabled={depositLoading} style={{ width: "100%", padding: "12px 16px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: depositLoading ? "not-allowed" : "pointer", fontWeight: 700, fontSize: FONT_SIZE.md, minHeight: 48, opacity: depositLoading ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {depositLoading ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} /> Adding...</> : "Add to Balance"}
            </button>
          </div>
        )}
      </div>

      <ProfilePictureUpload
        isOpen={showPictureModal}
        onClose={() => setShowPictureModal(false)}
        userId={admin?.admin_id || ""}
        table="truck_admins"
        idField="admin_id"
        currentUrl={admin?.profile_picture_url}
        onSuccess={(url) => setAdmin(prev => prev ? { ...prev, profile_picture_url: url } : prev)}
      />

      {/* Authorise ATF Modal */}
      {authorisingATF && (
        <div style={modalOverlay}>
          <div onClick={e => e.stopPropagation()} style={modalBox}>
            <h3 style={{ marginBottom: 12, color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>Authorise ATF?</h3>
            <p style={{ color: "#64748b", fontSize: FONT_SIZE.sm, marginBottom: 20 }}>A unique ATF code will be generated and sent to the driver and station manager.</p>
            <div style={{ background: "#f8fafc", borderRadius: 8, padding: 16, marginBottom: 24, border: "1px solid #e2e8f0" }}>
              <p style={{ margin: "0 0 6px" }}><strong>Truck:</strong> {authorisingATF.plate_number}</p>
              <p style={{ margin: "0 0 6px" }}><strong>Driver:</strong> {authorisingATF.driver_name}</p>
              <p style={{ margin: "0 0 6px" }}><strong>Station:</strong> {authorisingATF.company_name}</p>
              <p style={{ margin: 0 }}><strong>Litres:</strong> {authorisingATF.litres}L</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => setAuthorisingATF(null)} style={{ padding: "12px 16px", background: "white", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: FONT_SIZE.md, minHeight: 44 }}>
                Cancel
              </button>
              <button onClick={handleAuthoriseATF} disabled={authoriseLoading} style={{ padding: "12px 16px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: authoriseLoading ? "not-allowed" : "pointer", fontWeight: 700, fontSize: FONT_SIZE.md, minHeight: 44, opacity: authoriseLoading ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {authoriseLoading ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} /> Authorising...</> : "Yes, Authorise"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invalidate ATF Modal */}
      {invalidatingATF && (
        <div style={modalOverlay}>
          <div onClick={e => e.stopPropagation()} style={modalBox}>
            <h3 style={{ marginBottom: 6, color: "#ef4444", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>Invalidate ATF</h3>
            <p style={{ margin: "0 0 16px", color: "#64748b", fontSize: FONT_SIZE.sm }}>
              <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#0f172a", letterSpacing: 1 }}>{invalidatingATF.atf_code}</span> — {invalidatingATF.litres}L for {invalidatingATF.driver_name}
            </p>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Reason *</label>
              <textarea value={invalidateReason} onChange={e => { setInvalidateReason(e.target.value); setInvalidateError("") }} placeholder="e.g. Only 100L available, requested 200L" rows={4} style={{ width: "100%", padding: "10px 12px", boxSizing: "border-box", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: FONT_SIZE.base, resize: "none", background: "white", color: "#0f172a", minHeight: 100 }} />
            </div>
            {invalidateError && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 16, color: "#b91c1c", fontSize: FONT_SIZE.sm, fontWeight: 600 }}>{invalidateError}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => { setInvalidatingATF(null); setInvalidateReason(""); setInvalidateError("") }} style={{ padding: "12px 16px", background: "white", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: FONT_SIZE.md, minHeight: 44 }}>
                Cancel
              </button>
              <button onClick={handleInvalidate} disabled={invalidateLoading} style={{ padding: "12px 16px", background: "#ef4444", color: "white", border: "none", borderRadius: 8, cursor: invalidateLoading ? "not-allowed" : "pointer", fontWeight: 700, fontSize: FONT_SIZE.md, minHeight: 44, opacity: invalidateLoading ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {invalidateLoading ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} /> Invalidating...</> : "Confirm Invalidate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Validate Modal */}
      {validating && (
        <div style={modalOverlay}>
          <div onClick={e => e.stopPropagation()} style={modalBox}>
            <h3 style={{ marginBottom: 12, color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>Validate Report?</h3>
            <div style={{ background: "#f8fafc", borderRadius: 8, padding: 16, marginBottom: 16, border: "1px solid #e2e8f0" }}>
              <p style={{ margin: "0 0 8px" }}><strong>Truck:</strong> {validating.plate_number}</p>
              <p style={{ margin: "0 0 8px" }}><strong>Type:</strong> {validating.maintenance_type}</p>
              {validating.maintenance_location && <p style={{ margin: "0 0 8px" }}><strong>Location:</strong> {validating.maintenance_location}</p>}
              <p style={{ margin: "0 0 8px" }}><strong>Officer:</strong> {validating.manager_name}</p>
              <p style={{ margin: 0 }}><strong>Amount:</strong> <span style={{ color: "#0070f3", fontWeight: 700 }}>₦{validating.amount.toLocaleString()}</span></p>
            </div>
            <p style={{ fontSize: FONT_SIZE.sm, color: "#64748b", marginBottom: 24 }}>
              Balance after: <strong style={{ color: (maintenanceBalance ?? 0) - validating.amount < 0 ? "#ef4444" : "#0f172a" }}>₦{Math.max(0, (maintenanceBalance ?? 0) - validating.amount).toLocaleString()}</strong>
              {(maintenanceBalance ?? 0) - validating.amount < 0 && <span style={{ color: "#ef4444", marginLeft: 8 }}>⚠️ Insufficient</span>}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => setValidating(null)} style={{ padding: "12px 16px", background: "white", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: FONT_SIZE.md, minHeight: 44 }}>
                Cancel
              </button>
              <button onClick={handleValidate} disabled={validateLoading} style={{ padding: "12px 16px", background: "#16a34a", color: "white", border: "none", borderRadius: 8, cursor: validateLoading ? "not-allowed" : "pointer", fontWeight: 700, fontSize: FONT_SIZE.md, minHeight: 44, opacity: validateLoading ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {validateLoading ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} /> Validating...</> : "Yes, Validate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejecting && (
        <div style={modalOverlay}>
          <div onClick={e => e.stopPropagation()} style={modalBox}>
            <h3 style={{ marginBottom: 12, color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>Reject Report</h3>
            <p style={{ color: "#64748b", marginBottom: 16, fontSize: FONT_SIZE.sm }}><strong>{rejecting.plate_number}</strong> — {rejecting.maintenance_type}</p>
            <label style={labelStyle}>Reason *</label>
            <textarea value={rejectReason} onChange={e => { setRejectReason(e.target.value); setRejectError("") }} placeholder="e.g. Amount seems incorrect" rows={3} style={{ width: "100%", padding: "10px 12px", boxSizing: "border-box", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: FONT_SIZE.base, resize: "none", marginBottom: 8, background: "white", color: "#0f172a", minHeight: 80 }} />
            {rejectError && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 16, color: "#b91c1c", fontSize: FONT_SIZE.sm, fontWeight: 600 }}>{rejectError}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => setRejecting(null)} style={{ padding: "12px 16px", background: "white", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: FONT_SIZE.md, minHeight: 44 }}>
                Cancel
              </button>
              <button onClick={handleReject} disabled={rejectLoading} style={{ padding: "12px 16px", background: "#ef4444", color: "white", border: "none", borderRadius: 8, cursor: rejectLoading ? "not-allowed" : "pointer", fontWeight: 700, fontSize: FONT_SIZE.md, minHeight: 44, opacity: rejectLoading ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {rejectLoading ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} /> Rejecting...</> : "Confirm Reject"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        userId={admin?.admin_id || ""}
        userRole={Role.TruckAdmin}
      />
    </div>
  )
}
