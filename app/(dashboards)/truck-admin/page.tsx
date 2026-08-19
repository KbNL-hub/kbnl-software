"use client"

import Image from "next/image"
import { useEffect, useMemo, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { apiMutate } from "@/lib/api-mutation"
import RoleSwitcher from "@/components/RoleSwitcher"
import { parseAmount } from "@/lib/formatAmount"
import { Icon } from "@iconify/react"
import { useBreakpoint } from "@/app/hooks/useBreakpoint"
import ReportModal from "@/components/ReportModal"
import ProfilePictureUpload from "@/components/ProfilePictureUpload"
import NavBadge from "@/components/NavBadge"
import { FONT_SIZE } from "@/lib/constants"
import { usePolling } from "@/lib/hooks/usePolling"
import { requireDashboardRole } from "@/lib/auth-helpers"
import { Role } from "@/lib/roles"
import { useATFs } from "@/lib/hooks/useATFs"
import MaintenanceSection from "@/components/truck-admin/MaintenanceSection"
import MonitorTrucksSection from "@/components/truck-admin/MonitorTrucksSection"
import ATFSection from "@/components/truck-admin/ATFSection"
import ProcurementSection from "@/components/truck-admin/ProcurementSection"
import SideTripsSection from "@/components/truck-admin/SideTripsSection"
import DieselConsumptionSection from "@/components/truck-admin/DieselConsumptionSection"

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
  fuel_balance: number | null
  engine_type: string | null
}

type TruckAdmin = {
  admin_id: string
  full_name: string
  profile_picture_url?: string
}

function generateATFCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let code = "ATF-"
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

const SECTION_LABELS = {
  "maintenance": { label: "Maintenance", icon: "mdi:wrench" },
  "monitor": { label: "Monitor Trucks", icon: "mdi:truck-check" },
  "atf": { label: "ATF", icon: "mdi:gas-station" },
  "procurement": { label: "Procurement", icon: "mdi:package" },
  "side-trips": { label: "Side Trips", icon: "mdi:road-variant" },
  "diesel": { label: "Diesel Consumption", icon: "mdi:fuel" },
} satisfies Record<string, { label: string; icon: string }>

type SectionKey = keyof typeof SECTION_LABELS

export default function TruckAdminDashboard() {
  const router = useRouter()
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"
  const isTablet = bp === "tablet"
  const isNarrow = isMobile || isTablet

  const [admin, setAdmin] = useState<TruckAdmin | null>(null)
  const [reports, setReports] = useState<MaintenanceReport[]>([])
  const [procurements, setProcurements] = useState<BulkProcurement[]>([])
  const [deposits, setDeposits] = useState<MaintenanceDeposit[]>([])
  const [maintenanceBalance, setMaintenanceBalance] = useState<number | null>(null)
  const { data: atfsFromHook, refetch: refetchATFs } = useATFs({ all: true })
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [active, setActive] = useState<SectionKey>("maintenance")
  const [filter, setFilter] = useState("All")
  const [atfFilter, setAtfFilter] = useState("All")
  const [feedPage, setFeedPage] = useState(1)
  const [atfPage, setAtfPage] = useState(1)
  const PAGE_SIZE = 100

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

  const [sideTrips, setSideTrips] = useState<{ id: string; driver_id: string; plate_number: string; item_description: string; created_at: string; driver_name: string; kbnl_truck_no: string | null }[]>([])
  const [sideTripsLoading, setSideTripsLoading] = useState(false)
  const [sideTripsViewMode, setSideTripsViewMode] = useState<"card" | "table">("card")

  const [procItem, setProcItem] = useState("")
  const [procTotal, setProcTotal] = useState("")
  const [procNotes, setProcNotes] = useState("")
  const [procError, setProcError] = useState("")
  const [procLoading, setProcLoading] = useState(false)

  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const bannerRef = useRef<HTMLDivElement>(null)
  const [bannerHeight, setBannerHeight] = useState(64)

  const isSectionKey = (value: string | null): value is SectionKey =>
    !!value && value in SECTION_LABELS

  useEffect(() => {
    const el = bannerRef.current
    if (!el) return
    const update = () => setBannerHeight(el.offsetHeight)
    const ro = new ResizeObserver(update)
    ro.observe(el)
    update()
    return () => ro.disconnect()
  }, [loading])

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (active === "side-trips" && sideTrips.length === 0) fetchSideTrips()
  }, [active, sideTrips.length])

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

      if (!adm) { router.push("/login"); return }

      setAdmin({ ...adm, full_name: profile?.full_name ?? adm.full_name })

      const params = new URLSearchParams(window.location.search)
      const section = params.get("section")
      if (isSectionKey(section)) setActive(section)

      await Promise.all([fetchReports(), fetchProcurements(), fetchMaintenanceBalance(), fetchDeposits()])
      setLoading(false)
    }
    init()
  }, [router])

  usePolling(() => {
    fetchReports(); fetchProcurements(); fetchMaintenanceBalance(); refetchATFs(); fetchDeposits()
    if (active === "side-trips") fetchSideTrips()
  }, 120000, !!admin)

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search)
      const section = params.get("section")
      if (isSectionKey(section)) setActive(section)
    }
    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [])

  function navigate(key: SectionKey) {
    setActive(key)
    if (isNarrow) setDrawerOpen(false)
    window.history.pushState(null, "", `${window.location.pathname}?section=${key}`)
  }

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

    if (data && typeof data === "object" && "new_balance" in (data as Record<string, unknown>)) {
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
        p_status_filter: invalidatingATF.atf_status,
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

    if (data && typeof data === "object" && "new_balance" in (data as Record<string, unknown>)) {
      setMaintenanceBalance((data as { new_balance: number }).new_balance)
    } else {
      setMaintenanceBalance((prev) => Math.max(0, (prev ?? 0) - totalNum))
    }
    setProcItem(""); setProcTotal(""); setProcNotes(""); setProcError("")
    await fetchProcurements()
    navigate("maintenance"); setFilter("Bulk Procurement")
  }

  const balanceMap = useMemo(() => {
    const map: Record<string, number> = {}
    const records: { id: string; amount: number; created_at: string }[] = [
      ...reports.filter(r => r.status === "Validated").map(r => ({
        id: r.report_id, amount: r.amount, created_at: r.reported_at
      })),
      ...procurements.map(p => ({
        id: p.procurement_id, amount: p.total_amount, created_at: p.logged_at
      })),
      ...deposits.map(d => ({
        id: d.deposit_id, amount: -d.amount, created_at: d.created_at
      })),
    ]
    records.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    let running = maintenanceBalance ?? 0
    for (const rec of records) {
      map[rec.id] = running
      running += rec.amount
    }
    return map
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

  const filteredATFsAll = atfFilter === "All" ? atfsFromHook : atfsFromHook.filter(a => a.atf_status === atfFilter)
  const atfTotalPages = Math.ceil(filteredATFsAll.length / PAGE_SIZE) || 1
  const safeAtfPage = Math.min(atfPage, atfTotalPages)
  const filteredATFs = filteredATFsAll.slice(0, safeAtfPage * PAGE_SIZE)

  const pendingReportCount = useMemo(() => reports.filter(r => r.status === "Pending").length, [reports])
  const pendingATFCount = useMemo(() => atfsFromHook.filter(a => a.atf_status === "Pending").length, [atfsFromHook])

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

  const sectionKeys = Object.keys(SECTION_LABELS) as SectionKey[]

  return (
    <div style={{ display: "flex", flexDirection: "column", fontFamily: "'Inter', sans-serif", background: "#f5f5f7", height: "100dvh", overflow: "hidden" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .avatar-btn:hover { border-color: #0070f3 !important; transform: scale(1.05); }
        .avatar-wrapper:hover .camera-overlay { opacity: 1 !important; }
        .btn-hover-opacity:hover { opacity: 0.9 !important; }
        .report-btn:hover { background: #fff0e1 !important; border-color: #f8ad5c !important; }
        .logout-btn:hover { background: rgba(239,68,68,0.1) !important; border-color: #fca5a5 !important; }
        .filter-btn:hover { border-color: #cbd5e1 !important; }
        .card-hover:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08) !important; border-color: #cbd5e1 !important; }
        .invalidate-btn:hover { background: rgba(239,68,68,0.05) !important; border-color: #f87171 !important; }
        .refresh-btn:hover { background: #f8fafc !important; border-color: #cbd5e1 !important; }
        .side-trip-row:hover { background: #f8fafc !important; }
      `}</style>

      {/* ══ PROFILE BANNER ══ */}
      <div ref={bannerRef} style={{
        background: "linear-gradient(135deg, #0f0f1e 0%, #1a1a2e 100%)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        padding: isMobile ? "12px 16px" : "16px 32px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        flexShrink: 0,
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", gap: isMobile ? 12 : 16, justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 12 : 16 }}>
            <div className="avatar-wrapper" style={{ position: "relative" }}>
              <div
                onClick={() => setShowPictureModal(true)}
                className="avatar-btn"
                style={{
                  width: isMobile ? 40 : 48,
                  height: isMobile ? 40 : 48,
                  borderRadius: "50%",
                  background: admin?.profile_picture_url ? "transparent" : "rgba(255,255,255,0.15)",
                  border: "2px solid rgba(255,255,255,0.2)",
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
                  <Image src={admin.profile_picture_url} alt={admin.full_name} width={48} height={48} unoptimized style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ fontSize: isMobile ? 18 : 20, fontWeight: 700, color: "#fff" }}>
                    {admin?.full_name.charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="camera-overlay" style={{ position: "absolute", inset: 0, background: "rgba(0, 0, 0, 0.4)", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0, transition: "opacity 0.2s" }}>
                  <Icon icon="mdi:camera" width={16} color="white" />
                </div>
              </div>
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: isMobile ? 15 : 18, fontWeight: 700, color: "#fff" }}>
                {admin?.full_name}
              </h1>
              <RoleSwitcher currentRole={Role.TruckAdmin} style={{ margin: "2px 0 0", fontSize: 12, color: "rgba(255,255,255,0.7)" }} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 12 }}>
            <button
              onClick={() => setShowReportModal(true)}
              className="report-btn"
              style={{ padding: "8px 14px", background: "rgba(245, 166, 35, 0.15)", color: "#f5a623", border: "1px solid rgba(245, 166, 35, 0.3)", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, minHeight: 36, display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s", whiteSpace: "nowrap" }}
            >
              <Icon icon="mdi:alert-circle-outline" width={isMobile ? 14 : 16} />
              {!isMobile && "Submit Report"}
            </button>
            {isNarrow && (
              <button
                onClick={() => setDrawerOpen(true)}
                style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", padding: "8px", borderRadius: 8, display: "flex", alignItems: "center", transition: "all 0.2s" }}
              >
                <Icon icon="mdi:menu" width={22} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ══ BODY: SIDEBAR + CONTENT ══ */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>

        {/* ══ DESKTOP SIDEBAR ══ */}
        {!isNarrow && (
          <div style={{
            width: sidebarOpen ? 260 : 70,
            height: "100%",
            background: "linear-gradient(135deg, #0f0f1e 0%, #1a1a2e 100%)",
            color: "white",
            display: "flex",
            flexDirection: "column",
            transition: "width 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
            flexShrink: 0,
            borderRight: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "2px 0 12px rgba(0,0,0,0.1)",
            overflowY: "hidden",
          }}>
            <div style={{ display: "flex", alignItems: "center", padding: "20px 16px", gap: 12, flexShrink: 0 }}>
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#aaa", cursor: "pointer", padding: "8px", borderRadius: "8px", flexShrink: 0, display: "flex", alignItems: "center", transition: "all 0.2s ease" }}
              >
                <Icon icon={sidebarOpen ? "mdi:chevron-left" : "mdi:chevron-right"} width={20} />
              </button>
              {sidebarOpen && (
                <h2 style={{ margin: 0, fontSize: 16, color: "#fff", whiteSpace: "nowrap", fontWeight: "700", letterSpacing: "-0.3px" }}>Truck Admin</h2>
              )}
            </div>

            <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", paddingBottom: 16 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingLeft: sidebarOpen ? 8 : 0 }}>
                {sectionKeys.map(key => {
                  const isActive = active === key
                  const item = SECTION_LABELS[key]
                  const badge =
                    key === "maintenance" && pendingReportCount > 0 ? { count: pendingReportCount, color: "#f5a623" } :
                    key === "atf" && pendingATFCount > 0 ? { count: pendingATFCount, color: "#f5a623" } :
                    null
                  return (
                    <button
                      key={key}
                      onClick={() => navigate(key)}
                      title={!sidebarOpen ? item.label : undefined}
                      style={{
                        background: isActive ? "rgba(255,255,255,0.12)" : "transparent",
                        color: isActive ? "#fff" : "#aaa",
                        border: "none",
                        textAlign: "left",
                        padding: sidebarOpen ? "11px 16px" : "11px 0",
                        cursor: "pointer",
                        fontSize: 14,
                        display: "flex",
                        alignItems: "center",
                        gap: sidebarOpen ? 12 : 0,
                        width: "100%",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        minHeight: 44,
                        transition: "all 0.2s ease",
                        borderRadius: sidebarOpen ? "8px" : "0px",
                        marginLeft: sidebarOpen ? "8px" : "0px",
                        marginRight: sidebarOpen ? "8px" : "0px",
                        justifyContent: sidebarOpen ? "flex-start" : "center",
                        position: "relative",
                      }}
                    >
                      <span style={{ position: "relative", flexShrink: 0, display: "flex", alignItems: "center" }}>
                        <Icon icon={item.icon} width={18} height={18} />
                        {!sidebarOpen && <NavBadge count={badge?.count ?? 0} color={badge?.color} showLabel={false} />}
                      </span>
                      {sidebarOpen && (
                        <>
                          <span style={{ flex: 1, fontSize: 14, fontWeight: isActive ? 600 : 500 }}>{item.label}</span>
                          {badge && <NavBadge count={badge.count} color={badge.color} showLabel={true} />}
                        </>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            <div style={{ padding: "12px 8px 20px", borderTop: "1px solid rgba(255,255,255,0.1)", flexShrink: 0 }}>
              <button
                onClick={async () => { await supabase.auth.signOut(); router.push("/login") }}
                className="logout-btn"
                style={{ width: "100%", padding: "11px 0", background: "rgba(255, 85, 85, 0.2)", color: "#ff5555", border: "1.5px solid rgba(255, 85, 85, 0.3)", borderRadius: 8, cursor: "pointer", fontWeight: "600", fontSize: 13, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.2s ease" }}
              >
                <Icon icon="mdi:logout" width={16} />
                {sidebarOpen && "Logout"}
              </button>
            </div>
          </div>
        )}

        {/* ══ MAIN CONTENT ══ */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>

          {/* Mobile drawer overlay */}
          {isNarrow && drawerOpen && (
            <div onClick={() => setDrawerOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50 }} />
          )}

          {/* Mobile drawer */}
          {isNarrow && (
            <div style={{
              position: "fixed",
              top: bannerHeight,
              left: 0,
              width: drawerOpen ? "85%" : "0%",
              maxWidth: 300,
              height: `calc(100dvh - ${bannerHeight}px)`,
              background: "linear-gradient(135deg, #0f0f1e 0%, #1a1a2e 100%)",
              color: "white",
              display: "flex",
              flexDirection: "column",
              zIndex: 60,
              transition: "width 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              boxShadow: drawerOpen ? "2px 0 12px rgba(0,0,0,0.2)" : "none",
              overflow: "hidden",
            }}>
              <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "8px 8px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {sectionKeys.map(key => {
                    const isActive = active === key
                    const item = SECTION_LABELS[key]
                    const badge =
                      key === "maintenance" && pendingReportCount > 0 ? { count: pendingReportCount, color: "#f5a623" } :
                      key === "atf" && pendingATFCount > 0 ? { count: pendingATFCount, color: "#f5a623" } :
                      null
                    return (
                      <button
                        key={key}
                        onClick={() => navigate(key)}
                        style={{
                          background: isActive ? "rgba(255,255,255,0.12)" : "transparent",
                          color: isActive ? "#fff" : "#aaa",
                          border: "none",
                          textAlign: "left",
                          padding: "11px 16px",
                          cursor: "pointer",
                          fontSize: 14,
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          width: "100%",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          minHeight: 44,
                          transition: "all 0.2s ease",
                          borderRadius: "8px",
                          marginLeft: "8px",
                          marginRight: "8px",
                          justifyContent: "flex-start",
                          position: "relative",
                        }}
                      >
                        <Icon icon={item.icon} width={18} height={18} />
                        <span style={{ flex: 1, fontSize: 14, fontWeight: isActive ? 600 : 500 }}>{item.label}</span>
                        {badge && <NavBadge count={badge.count} color={badge.color} showLabel={true} />}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div style={{ padding: "16px 12px 24px", borderTop: "1px solid rgba(255,255,255,0.1)", flexShrink: 0 }}>
                <button
                  onClick={async () => { await supabase.auth.signOut(); router.push("/login") }}
                  className="logout-btn"
                  style={{ width: "100%", padding: "12px 0", background: "rgba(255, 85, 85, 0.2)", color: "#ff5555", border: "1.5px solid rgba(255, 85, 85, 0.3)", borderRadius: 8, cursor: "pointer", fontWeight: "600", fontSize: 14, minHeight: 48, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.2s ease" }}
                >
                  <Icon icon="mdi:logout" width={18} />
                  Logout
                </button>
              </div>
            </div>
          )}

          {/* Content area */}
          <div style={{ flex: 1, padding: isNarrow ? "20px 16px 40px" : "32px", overflow: "auto" }}>

            {/* Maintenance Balance strip */}
            <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: isMobile ? 16 : 24, marginBottom: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
              <p style={{ margin: "0 0 8px 0", fontWeight: 600, fontSize: FONT_SIZE.sm, color: "#94a3b8", letterSpacing: 0.5 }}>Maintenance Balance</p>
              <p style={{ margin: 0, fontSize: isMobile ? FONT_SIZE["2xl"] : FONT_SIZE.xl, fontWeight: 700, color: "#0070f3" }}>
                ₦{maintenanceBalance !== null ? maintenanceBalance.toLocaleString() : "—"}
              </p>
            </div>

            {/* ══ SECTION RENDERING ══ */}
            {active === "maintenance" && (
              <MaintenanceSection
                reports={reports}
                procurements={procurements}
                balanceMap={balanceMap}
                filter={filter}
                setFilter={setFilter}
                feedPage={feedPage}
                setFeedPage={setFeedPage}
                filteredFeed={filteredFeed}
                filteredFeedAll={filteredFeedAll}
                feedTotalPages={feedTotalPages}
                safeFeedPage={safeFeedPage}
                lastUpdated={lastUpdated}
                onRefresh={() => { fetchReports(); fetchProcurements() }}
                onValidate={(r) => setValidating(r)}
                onReject={(r) => { setRejecting(r); setRejectReason(""); setRejectError("") }}
                PAGE_SIZE={PAGE_SIZE}
              />
            )}

            {active === "monitor" && <MonitorTrucksSection />}

            {active === "atf" && (
              <ATFSection
                atfs={atfsFromHook}
                atfFilter={atfFilter}
                setAtfFilter={setAtfFilter}
                filteredATFs={filteredATFs}
                filteredATFsAll={filteredATFsAll}
                safeAtfPage={safeAtfPage}
                atfTotalPages={atfTotalPages}
                setAtfPage={setAtfPage}
                atfPage={atfPage}
                onAuthorise={(a) => setAuthorisingATF(a)}
                onInvalidate={(a) => { setInvalidatingATF(a); setInvalidateReason(""); setInvalidateError("") }}
                onRefresh={refetchATFs}
                PAGE_SIZE={PAGE_SIZE}
              />
            )}

            {active === "procurement" && (
              <ProcurementSection
                procItem={procItem}
                setProcItem={setProcItem}
                procTotal={procTotal}
                setProcTotal={setProcTotal}
                procNotes={procNotes}
                setProcNotes={setProcNotes}
                procError={procError}
                procLoading={procLoading}
                onLogProcurement={handleLogProcurement}
              />
            )}

            {active === "side-trips" && (
              <SideTripsSection
                sideTrips={sideTrips}
                loading={sideTripsLoading}
                viewMode={sideTripsViewMode}
                setViewMode={setSideTripsViewMode}
              />
            )}

            {active === "diesel" && <DieselConsumptionSection />}
          </div>
        </div>
      </div>

      {/* ══ MODALS ══ */}
      <ProfilePictureUpload
        isOpen={showPictureModal}
        onClose={() => setShowPictureModal(false)}
        userId={admin?.admin_id || ""}
        table="truck_admins"
        idField="admin_id"
        currentUrl={admin?.profile_picture_url}
        onSuccess={(url) => setAdmin(prev => prev ? { ...prev, profile_picture_url: url } : prev)}
      />

      {authorisingATF && (
        <div style={modalOverlay}>
          <div onClick={e => e.stopPropagation()} style={modalBox}>
            <h3 style={{ marginBottom: 12, color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>Authorise ATF?</h3>
            <p style={{ color: "#64748b", fontSize: FONT_SIZE.sm, marginBottom: 20 }}>A unique ATF code will be generated and shown to the driver for confirmation.</p>
            <div style={{ background: "#f8fafc", borderRadius: 8, padding: 16, marginBottom: 24, border: "1px solid #e2e8f0" }}>
              <p style={{ margin: "0 0 6px" }}><strong>Truck:</strong> {authorisingATF.plate_number}</p>
              <p style={{ margin: "0 0 6px" }}><strong>Driver:</strong> {authorisingATF.driver_name}</p>
              <p style={{ margin: "0 0 6px" }}><strong>Station:</strong> {authorisingATF.company_name}</p>
              <p style={{ margin: 0 }}><strong>Litres:</strong> {authorisingATF.litres}L</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => setAuthorisingATF(null)} style={{ padding: "12px 16px", background: "white", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: FONT_SIZE.md, minHeight: 44 }}>Cancel</button>
              <button onClick={handleAuthoriseATF} disabled={authoriseLoading} style={{ padding: "12px 16px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: authoriseLoading ? "not-allowed" : "pointer", fontWeight: 700, fontSize: FONT_SIZE.md, minHeight: 44, opacity: authoriseLoading ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {authoriseLoading ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} /> Authorising...</> : "Yes, Authorise"}
              </button>
            </div>
          </div>
        </div>
      )}

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
              <button onClick={() => { setInvalidatingATF(null); setInvalidateReason(""); setInvalidateError("") }} style={{ padding: "12px 16px", background: "white", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: FONT_SIZE.md, minHeight: 44 }}>Cancel</button>
              <button onClick={handleInvalidate} disabled={invalidateLoading} style={{ padding: "12px 16px", background: "#ef4444", color: "white", border: "none", borderRadius: 8, cursor: invalidateLoading ? "not-allowed" : "pointer", fontWeight: 700, fontSize: FONT_SIZE.md, minHeight: 44, opacity: invalidateLoading ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {invalidateLoading ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} /> Invalidating...</> : "Confirm Invalidate"}
              </button>
            </div>
          </div>
        </div>
      )}

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
              {(maintenanceBalance ?? 0) - validating.amount < 0 && <span style={{ color: "#ef4444", marginLeft: 8 }}>Insufficient</span>}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => setValidating(null)} style={{ padding: "12px 16px", background: "white", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: FONT_SIZE.md, minHeight: 44 }}>Cancel</button>
              <button onClick={handleValidate} disabled={validateLoading} style={{ padding: "12px 16px", background: "#16a34a", color: "white", border: "none", borderRadius: 8, cursor: validateLoading ? "not-allowed" : "pointer", fontWeight: 700, fontSize: FONT_SIZE.md, minHeight: 44, opacity: validateLoading ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {validateLoading ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} /> Validating...</> : "Yes, Validate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {rejecting && (
        <div style={modalOverlay}>
          <div onClick={e => e.stopPropagation()} style={modalBox}>
            <h3 style={{ marginBottom: 12, color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>Reject Report</h3>
            <p style={{ color: "#64748b", marginBottom: 16, fontSize: FONT_SIZE.sm }}><strong>{rejecting.plate_number}</strong> — {rejecting.maintenance_type}</p>
            <label style={labelStyle}>Reason *</label>
            <textarea value={rejectReason} onChange={e => { setRejectReason(e.target.value); setRejectError("") }} placeholder="e.g. Amount seems incorrect" rows={3} style={{ width: "100%", padding: "10px 12px", boxSizing: "border-box", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: FONT_SIZE.base, resize: "none", marginBottom: 8, background: "white", color: "#0f172a", minHeight: 80 }} />
            {rejectError && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 16, color: "#b91c1c", fontSize: FONT_SIZE.sm, fontWeight: 600 }}>{rejectError}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => setRejecting(null)} style={{ padding: "12px 16px", background: "white", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: FONT_SIZE.md, minHeight: 44 }}>Cancel</button>
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
