"use client"

import React from "react"
import Image from "next/image"
import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Icon } from "@iconify/react"
import { usePolling } from "@/lib/hooks/usePolling"
import dynamic from "next/dynamic"
import { supabase } from "@/lib/supabase"
import { apiMutate } from "@/lib/api-mutation"
import RoleSwitcher from "@/components/RoleSwitcher"
import { useBreakpoint } from "@/app/hooks/useBreakpoint"
import NoClearance from "@/components/admin/NoClearance"
import NavBadge from "@/components/NavBadge"
import { PermissionProvider, usePermissions } from "@/lib/PermissionContext"
import { ROLES } from "@/lib/permissions"
import { Role } from "@/lib/roles"

const SECTION_IMPORTS = {
  "manage-users": () => import("@/components/admin/ManageUsers"),
  "invite-users": () => import("@/components/admin/InviteUsers"),
  "add-truck": () => import("@/components/admin/AddTruck"),

  "manage-brokers": () => import("@/components/admin/ManageBrokers"),
  "monitor-trucks": () => import("@/components/admin/MonitorTrucks"),
  "manage-trucks": () => import("@/components/admin/ManageTrucks"),
  "manage-drivers": () => import("@/components/admin/ManageDrivers"),
  "monitor-trips": () => import("@/components/admin/MonitorTrips"),
  "complaints": () => import("@/components/admin/Complaints"),
  "station-managers": () => import("@/components/admin/StationManagers"),
  "diesel-manager": () => import("@/components/admin/DieselManager"),
  "truck-officers": () => import("@/components/admin/TruckOfficers"),
  "truck-admins": () => import("@/components/admin/TruckAdmins"),
  "tricycles": () => import("@/components/admin/Tricycles"),
  "store-officers": () => import("@/components/admin/StoreOfficers"),
  "cash-officers": () => import("@/components/admin/CashOfficers"),
  "cash-expenses": () => import("@/components/admin/CashExpenses"),
  "transactions": () => import("@/components/admin/Transactions"),
  "desk-expenses": () => import("@/components/admin/CashExpensesPosting"),
  "customer-payments": () => import("@/components/admin/CustomerPaymentsAdmin"),
  "credit": () => import("@/components/admin/BrokerCredits"),
  "reports": () => import("@/components/admin/Reports"),
  "store-sales": () => import("@/components/admin/StoreSales"),
  "company-prices": () => import("@/components/admin/CompanyPrices"),
  "side-trips": () => import("@/components/admin/SideTrips"),
  "our-stores": () => import("@/components/admin/OurStores"),
  "trips": () => import("@/components/admin/DeskTrips"),
} as const

type SectionKey = keyof typeof SECTION_IMPORTS
type NavKey = SectionKey | "__dashboard__"

const SECTION_KEYS = new Set(Object.keys(SECTION_IMPORTS) as SectionKey[])
const isSectionKey = (value: string | null): value is SectionKey =>
  !!value && SECTION_KEYS.has(value as SectionKey)

type NavItemConfig = { label: string; key: NavKey; icon: string }

const SECTION_COMPONENTS: Partial<Record<SectionKey, React.ComponentType<Record<string, unknown>>>> = {}
for (const key of Object.keys(SECTION_IMPORTS) as SectionKey[]) {
  SECTION_COMPONENTS[key] = dynamic(SECTION_IMPORTS[key])
}

const ReportModal = dynamic(() => import("@/components/ReportModal"))
const AdminDashboard = dynamic(() => import("@/components/admin/AdminDashboard"))

const NAV_ITEMS: NavItemConfig[] = [
  { label: "Dashboard",        key: "__dashboard__",        icon: "mdi:view-dashboard" },
  { label: "Users",            key: "manage-users",        icon: "mdi:account-group" },
  { label: "Invite Users",     key: "invite-users",        icon: "mdi:account-plus-outline" },
  { label: "Add New Truck",     key: "add-truck",          icon: "mdi:truck-plus" },

  { label: "Manage Brokers",    key: "manage-brokers",      icon: "mdi:handshake" },
  { label: "Manage Drivers",    key: "manage-drivers",      icon: "mdi:account-group" },
  { label: "Manage Trucks",     key: "manage-trucks",       icon: "mdi:bus-wrench" },
  { label: "Station Managers",  key: "station-managers",    icon: "mdi:person-tie" },
  { label: "Truck Officers",    key: "truck-officers",      icon: "wpf:maintenance" },
  { label: "Truck Admins",      key: "truck-admins",        icon: "mdi:person-star" },
  { label: "Store Officers",    key: "store-officers",      icon: "mdi:storefront" },
  { label: "Our Stores",        key: "our-stores",           icon: "mdi:storefront-check" },
  { label: "Cash Officers",     key: "cash-officers",       icon: "mdi:account-tie" },
  { label: "Tricycles",         key: "tricycles",           icon: "mdi:rickshaw" },
  { label: "Monitor Trucks",    key: "monitor-trucks",      icon: "mdi:dump-truck" },
  { label: "Monitor Trips",     key: "monitor-trips",       icon: "streamline-ultimate:trip-road-bold" },
  { label: "Trips",              key: "trips",               icon: "mdi:map-marker-path" },
  { label: "Side Trips",        key: "side-trips",           icon: "mdi:road-variant" },
  { label: "Diesel Manager",    key: "diesel-manager",      icon: "mdi:gas-station" },
  { label: "Store Sales",       key: "store-sales",         icon: "mdi:storefront-outline" },
  { label: "Customer Payments", key: "customer-payments",   icon: "mdi:cash-register" },
  { label: "Credit",            key: "credit",              icon: "mdi:credit-card-outline" },
  { label: "Cash Expenses",     key: "cash-expenses",       icon: "mdi:cash-multiple" },
  { label: "Transactions",      key: "transactions",        icon: "mdi:bank-transfer" },
  { label: "Cash Movement Register", key: "desk-expenses",  icon: "mdi:cash-check" },
  { label: "Company Prices",    key: "company-prices",      icon: "mdi:currency-ngn" },
  { label: "Complaints",        key: "complaints",          icon: "mdi:alert-circle" },
  { label: "Reports",           key: "reports",             icon: "mdi:chart-bar" },
]

type LowBalanceCompany = {
  company_id: string
  company_name: string
  current_balance: number
}

type Props = {
  userProfile: {
    user_id: string
    role: string
    full_name: string
    profile_picture_url?: string
  }
  initialRole?: string
}

function AdminPanelContent({ userProfile }: Props) {
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"
  const isTablet = bp === "tablet"
  const isNarrow = isMobile || isTablet

  const router = useRouter()
  const [active, setActive] = useState<NavKey>(() => {
    const params = new URLSearchParams(window.location.search)
    const section = params.get('section')
    return isSectionKey(section) ? section : "__dashboard__"
  })
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const bannerRef = useRef<HTMLDivElement>(null)
  const [bannerHeight, setBannerHeight] = useState(64)
  const { sections, getAccess, loading: permLoading, activeRole, setActiveRole } = usePermissions()
  const effectiveRole = activeRole ?? userProfile.role
  const isViewOnly = effectiveRole ? (ROLES[effectiveRole as Role]?.access === "view") : false

  // Profile picture state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [profilePicUrl, setProfilePicUrl] = useState<string | undefined>(userProfile.profile_picture_url)
  const [showPictureModal, setShowPictureModal] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [picturePreview, setPicturePreview] = useState<string | null>(null)
  const [pictureLoading, setPictureLoading] = useState(false)
  const [pictureError, setPictureError] = useState("")

  // Filter nav items based on user permissions (dashboard is always visible)
  const visibleNavItems = NAV_ITEMS.filter(item => item.key === "__dashboard__" || sections.includes(item.key as SectionKey))

  // Measure actual banner height for mobile drawer offset
  useEffect(() => {
    const el = bannerRef.current
    if (!el) return
    const update = () => setBannerHeight(el.offsetHeight)
    const ro = new ResizeObserver(update)
    ro.observe(el)
    update()
    return () => ro.disconnect()
  }, [])

  const [disputedCount, setDisputedCount] = useState(0)
  const [unresolvedComplaints, setUnresolvedComplaints] = useState(0)
  const [pendingStoreSales, setPendingStoreSales] = useState(0)
  const [pendingPayments, setPendingPayments] = useState(0)
  const [unauthorizedExpenses, setUnauthorizedExpenses] = useState(0)
  const [unpostedExpenses, setUnpostedExpenses] = useState(0)
  const [pendingDeskTrips, setPendingDeskTrips] = useState(0)
  const [lowBalanceCompanies, setLowBalanceCompanies] = useState<LowBalanceCompany[]>([])
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(() => {
    const stored = localStorage.getItem("dismissedFuelAlerts")
    return stored ? new Set(JSON.parse(stored)) : new Set()
  })

  const fetchUnauthorizedExpenses = useCallback(async () => {
    try {
      const { data: authorizer } = await supabase
        .from("cash_authorizers")
        .select("assigned_office")
        .eq("authorizer_id", userProfile.user_id)
        .maybeSingle()

      if (authorizer?.assigned_office) {
        const { count } = await supabase
          .from("cash_expenses")
          .select("*", { count: "exact", head: true })
          .eq("status", "Pending")
          .eq("office_name", authorizer.assigned_office)
        setUnauthorizedExpenses(count || 0)
      } else {
        setUnauthorizedExpenses(0)
      }
    } catch (err) {
      console.error("Error checking cash expenses:", err)
      setUnauthorizedExpenses(0)
    }
  }, [userProfile.user_id])

  useEffect(() => {
    if (permLoading) return

    const canViewTrips = getAccess("monitor-trips").canView
    const canViewComplaints = getAccess("complaints").canView
    const canViewFuel = getAccess("diesel-manager").canView
    const canViewStoreSales = getAccess("store-sales").canView
    const canViewPayments = getAccess("customer-payments").canView
    const canViewCashExpenses = getAccess("cash-expenses").canView
    const canViewDeskExpenses = getAccess("desk-expenses").canView
    const canViewDeskTrips = getAccess("trips").canView

    async function checkAlerts() {
      try {
        if (canViewTrips) {
          const { count: disputed } = await supabase
            .from("Stops").select("*", { count: "exact", head: true }).eq("disputed", true)
          setDisputedCount(disputed || 0)
        }

        if (canViewComplaints) {
          const { count: driverComplaints } = await supabase
            .from("driver_complaints").select("*", { count: "exact", head: true }).eq("resolved", false)
          const { count: userReports } = await supabase
            .from("reports").select("*", { count: "exact", head: true }).eq("resolved", false)
          setUnresolvedComplaints((driverComplaints || 0) + (userReports || 0))
        }

        if (canViewStoreSales) {
          const { count } = await supabase
            .from("store_sales").select("*", { count: "exact", head: true }).eq("status", "Pending")
          setPendingStoreSales(count || 0)
        }

        if (canViewPayments) {
          const { count } = await supabase
            .from("customer_payments").select("*", { count: "exact", head: true }).eq("status", "Pending")
          setPendingPayments(count || 0)
        }

        if (canViewCashExpenses) {
          await fetchUnauthorizedExpenses()
        }

        if (canViewDeskExpenses) {
          const { count } = await supabase
            .from("cash_expenses").select("*", { count: "exact", head: true }).eq("status", "Authorised")
          setUnpostedExpenses(count || 0)
        }

        if (canViewDeskTrips) {
          const { count } = await supabase
            .from("Trips")
            .select("*", { count: "exact", head: true })
            .eq("recorded", true)
            .eq("posted", false)
          setPendingDeskTrips(count || 0)
        }

        if (canViewFuel) {
          const { data } = await supabase
            .from("fuel_companies").select("company_id, company_name, current_balance, low_balance_threshold")
          if (data) setLowBalanceCompanies(data.filter(c => c.current_balance < c.low_balance_threshold))
        }
      } catch (err) {
        console.error("Error checking alerts:", err)
      }
    }
    checkAlerts()
  }, [permLoading, getAccess, fetchUnauthorizedExpenses])

  usePolling(() => {
    if (permLoading) return
    const canViewTrips = getAccess("monitor-trips").canView
    const canViewComplaints = getAccess("complaints").canView
    const canViewFuel = getAccess("diesel-manager").canView
    const canViewStoreSales = getAccess("store-sales").canView
    const canViewPayments = getAccess("customer-payments").canView
    const canViewCashExpenses = getAccess("cash-expenses").canView
    const canViewDeskExpenses = getAccess("desk-expenses").canView
    const canViewDeskTrips = getAccess("trips").canView
    async function checkAlerts() {
      try {
        if (canViewTrips) {
          const { count: disputed } = await supabase
            .from("Stops").select("*", { count: "exact", head: true }).eq("disputed", true)
          setDisputedCount(disputed || 0)
        }
        if (canViewComplaints) {
          const { count: driverComplaints } = await supabase
            .from("driver_complaints").select("*", { count: "exact", head: true }).eq("resolved", false)
          const { count: userReports } = await supabase
            .from("reports").select("*", { count: "exact", head: true }).eq("resolved", false)
          setUnresolvedComplaints((driverComplaints || 0) + (userReports || 0))
        }
        if (canViewStoreSales) {
          const { count } = await supabase
            .from("store_sales").select("*", { count: "exact", head: true }).eq("status", "Pending")
          setPendingStoreSales(count || 0)
        }
        if (canViewPayments) {
          const { count } = await supabase
            .from("customer_payments").select("*", { count: "exact", head: true }).eq("status", "Pending")
          setPendingPayments(count || 0)
        }
        if (canViewCashExpenses) {
          await fetchUnauthorizedExpenses()
        }
        if (canViewDeskExpenses) {
          const { count } = await supabase
            .from("cash_expenses").select("*", { count: "exact", head: true }).eq("status", "Authorised")
          setUnpostedExpenses(count || 0)
        }
        if (canViewDeskTrips) {
          const { count } = await supabase
            .from("Trips")
            .select("*", { count: "exact", head: true })
            .eq("recorded", true)
            .eq("posted", false)
          setPendingDeskTrips(count || 0)
        }
        if (canViewFuel) {
          const { data } = await supabase
            .from("fuel_companies").select("company_id, company_name, current_balance, low_balance_threshold")
          if (data) setLowBalanceCompanies(data.filter(c => c.current_balance < c.low_balance_threshold))
        }
      } catch (err) {
        console.error("Error checking alerts:", err)
      }
    }
    checkAlerts()
  }, 120000, !permLoading)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!isNarrow) setDrawerOpen(false)
  }, [isNarrow])

  function dismissAlert(company_id: string) {
    const updated = new Set(dismissedAlerts).add(company_id)
    setDismissedAlerts(updated)
    localStorage.setItem("dismissedFuelAlerts", JSON.stringify([...updated]))
  }

  const visibleAlerts = lowBalanceCompanies.filter(c => !dismissedAlerts.has(c.company_id))

  // Preload chunk for initial URL section
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const section = params.get('section')
    if (isSectionKey(section)) {
      SECTION_IMPORTS[section]()
    }
  }, [])

  // Handle browser back/forward between sections
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search)
      const section = params.get('section')
      setActive(isSectionKey(section) ? section : "__dashboard__")
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  function navigate(key: NavKey) {
    setActive(key)
    if (key !== "__dashboard__") SECTION_IMPORTS[key as SectionKey]()
    if (isNarrow) setDrawerOpen(false)
    const url = key === "__dashboard__"
      ? window.location.pathname
      : `${window.location.pathname}?section=${key}`
    window.history.pushState(null, '', url)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push("/login")
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
    if (!file.type.startsWith("image/")) { setPictureError("Please select an image file"); return }
    if (file.size > 1024 * 1024) { setPictureError("Image must be less than 1MB"); return }
    setSelectedFile(file)
    setPictureError("")
    const reader = new FileReader()
    reader.onload = (event) => setPicturePreview(event.target?.result as string)
    reader.readAsDataURL(file)
  }

  async function handleUploadPicture() {
    if (!selectedFile) { setPictureError("Please select an image"); return }
    setPictureLoading(true)
    setPictureError("")
    let uploadedPath: string | null = null
    let profileSaved = false
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setPictureError("Session expired"); setPictureLoading(false); return }
      const fileExt = selectedFile.name.split(".").pop()
      const fileName = `${userProfile.user_id}-${Date.now()}.${fileExt}`
      const filePath = `${userProfile.user_id}/${fileName}`
      const { error: uploadError } = await supabase.storage.from("profile-pictures").upload(filePath, selectedFile, { upsert: false })
      if (uploadError) { setPictureError("Upload failed"); setPictureLoading(false); return }
      uploadedPath = filePath
      const { data: { publicUrl } } = supabase.storage.from("profile-pictures").getPublicUrl(filePath)
      const { error: updateError } = await apiMutate("admin", { action: "update", table: "Profiles", data: { profile_picture_url: publicUrl }, filters: { user_id: userProfile.user_id } })
      if (updateError) {
        await supabase.storage.from("profile-pictures").remove([filePath])
        setPictureError("Failed to save profile")
        setPictureLoading(false)
        return
      }
      profileSaved = true
      if (profilePicUrl) {
        const oldPath = profilePicUrl.split("/").slice(-2).join("/")
        await supabase.storage.from("profile-pictures").remove([oldPath])
      }
      setProfilePicUrl(publicUrl)
      setPictureLoading(false)
      setShowPictureModal(false)
      setSelectedFile(null)
      setPicturePreview(null)
    } catch {
      if (uploadedPath && !profileSaved) {
        try { await supabase.storage.from("profile-pictures").remove([uploadedPath]) } catch {}
      }
      setPictureError("Something went wrong")
      setPictureLoading(false)
    }
  }

  const activeItem = NAV_ITEMS.find(n => n.key === active)
  const activeLabel = activeItem?.label ?? "Admin Panel"

  function renderContent() {
    if (active === "__dashboard__") {
      return <AdminDashboard effectiveRole={effectiveRole} fullName={userProfile.full_name} />
    }

    const sectionKey = active as SectionKey
    if (permLoading) return null
    const access = getAccess(sectionKey)
    if (!access.canView) {
      return <NoClearance sectionLabel={activeLabel} />
    }

    const Component = SECTION_COMPONENTS[sectionKey]
    if (Component) return <Component />
    return null
  }

  function NavItem({ item, showLabel }: { item: typeof NAV_ITEMS[0]; showLabel: boolean }) {
    const isActive = active === item.key
    const badge =
      item.key === "monitor-trips" && disputedCount > 0 ? { count: disputedCount, color: "#ef4444" } :
      item.key === "complaints" && unresolvedComplaints > 0 ? { count: unresolvedComplaints, color: "#f5a623" } :
      item.key === "store-sales" && pendingStoreSales > 0 ? { count: pendingStoreSales, color: "#f5a623" } :
      item.key === "customer-payments" && pendingPayments > 0 ? { count: pendingPayments, color: "#f5a623" } :
      item.key === "cash-expenses" && unauthorizedExpenses > 0 ? { count: unauthorizedExpenses, color: "#f5a623" } :
      item.key === "desk-expenses" && unpostedExpenses > 0 ? { count: unpostedExpenses, color: "#f5a623" } :
      item.key === "trips" && pendingDeskTrips > 0 ? { count: pendingDeskTrips, color: "#f5a623" } :
      null

    return (
      <button
        onClick={() => navigate(item.key)}
        title={!showLabel ? item.label : undefined}
        style={{
          background: isActive ? "rgba(255,255,255,0.12)" : "transparent",
          color: isActive ? "#fff" : "#aaa",
          border: "none",
          textAlign: "left",
          padding: showLabel ? "11px 16px" : "11px 0",
          cursor: "pointer",
          fontSize: 14,
          display: "flex",
          alignItems: "center",
          gap: showLabel ? 12 : 0,
          width: "100%",
          whiteSpace: "nowrap",
          overflow: "hidden",
          minHeight: 44,
          transition: "all 0.2s ease",
          borderRadius: showLabel ? "8px" : "0px",
          marginLeft: showLabel ? "8px" : "0px",
          marginRight: showLabel ? "8px" : "0px",
          justifyContent: showLabel ? "flex-start" : "center",
          position: "relative",
        }}
        onMouseEnter={(e) => {
          if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"
          if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = "#ccc"
        }}
        onMouseLeave={(e) => {
          if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "transparent"
          if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = "#aaa"
        }}
      >
        <span style={{ position: "relative", flexShrink: 0, display: "flex", alignItems: "center" }}>
          <Icon icon={item.icon} width={18} height={18} />
          {!showLabel && <NavBadge count={badge?.count ?? 0} color={badge?.color} showLabel={false} />}
        </span>

        {showLabel && (
          <>
            <span style={{ flex: 1, fontSize: 14, fontWeight: isActive ? 600 : 500 }}>{item.label}</span>
            {badge && (
              <NavBadge count={badge.count} color={badge.color} showLabel={true} />
            )}
          </>
        )}
      </button>
    )
  }

  return (
    <>
      <style>{`
        ::-webkit-scrollbar { width: 10px; height: 10px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, 0.2); border-radius: 5px; border: 2px solid transparent; background-clip: padding-box; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(0, 0, 0, 0.35); background-clip: padding-box; }
        * { scrollbar-width: thin; scrollbar-color: rgba(0, 0, 0, 0.2) transparent; }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", fontFamily: "'Inter', sans-serif", background: "#f5f5f7", height: "100dvh", overflow: "hidden" }}>

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
              <div
                onClick={handleAvatarClick}
                style={{
                  width: isMobile ? 40 : 48,
                  height: isMobile ? 40 : 48,
                  borderRadius: "50%",
                  background: profilePicUrl ? "transparent" : "rgba(255,255,255,0.15)",
                  border: "2px solid rgba(255,255,255,0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  cursor: "pointer",
                  overflow: "hidden",
                  transition: "all 0.2s",
                  position: "relative",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#fff"; e.currentTarget.style.transform = "scale(1.05)" }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)"; e.currentTarget.style.transform = "scale(1)" }}
              >
                {profilePicUrl ? (
                  <Image src={profilePicUrl} alt={userProfile.full_name} width={48} height={48} unoptimized style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ fontSize: isMobile ? 18 : 20, fontWeight: 700, color: "#fff" }}>
                    {userProfile.full_name.charAt(0).toUpperCase()}
                  </span>
                )}
                <div style={{ position: "absolute", inset: 0, background: "rgba(0, 0, 0, 0.4)", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0, transition: "opacity 0.2s" }} onMouseEnter={e => e.currentTarget.style.opacity = "1"} onMouseLeave={e => e.currentTarget.style.opacity = "0"}>
                  <Icon icon="mdi:camera" width={16} color="white" />
                </div>
              </div>
              <div>
                <h1 style={{ margin: 0, fontSize: isMobile ? 15 : 18, fontWeight: 700, color: "#fff" }}>
                  {userProfile.full_name}
                </h1>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <RoleSwitcher currentRole={effectiveRole} style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.7)" }} onRoleSwitch={(r) => setActiveRole(r)} />
                  {isViewOnly && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                      letterSpacing: "0.5px", padding: "2px 6px", borderRadius: 4,
                      background: "rgba(245, 158, 11, 0.2)", color: "#fbbf24",
                      border: "1px solid rgba(245, 158, 11, 0.3)", lineHeight: "14px"
                    }}>View-Only</span>
                  )}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 12 }}>
              <button
                onClick={() => setShowReportModal(true)}
                style={{
                  padding: "8px 14px",
                  background: "rgba(245, 166, 35, 0.15)",
                  color: "#f5a623",
                  border: "1px solid rgba(245, 166, 35, 0.3)",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: isMobile ? 12 : 13,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  minHeight: 36,
                  transition: "all 0.2s",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(245, 166, 35, 0.25)"; e.currentTarget.style.borderColor = "rgba(245, 166, 35, 0.5)" }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(245, 166, 35, 0.15)"; e.currentTarget.style.borderColor = "rgba(245, 166, 35, 0.3)" }}
              >
                <Icon icon="mdi:alert-circle-outline" width={isMobile ? 14 : 16} />
                {!isMobile && "Submit Report"}
              </button>
              {isNarrow && (
                <button
                  onClick={() => setDrawerOpen(true)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "rgba(255,255,255,0.6)",
                    cursor: "pointer",
                    padding: "8px",
                    borderRadius: 8,
                    display: "flex",
                    alignItems: "center",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "#fff" }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.6)" }}
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
              overflowY: "auto",
            }}>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", padding: "20px 16px", gap: 12, flexShrink: 0 }}>
                <button
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  style={{
                    background: "rgba(255,255,255,0.1)",
                    border: "none",
                    color: "#aaa",
                    cursor: "pointer",
                    padding: "8px",
                    borderRadius: "8px",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.15)";
                    (e.currentTarget as HTMLButtonElement).style.color = "#fff"
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.1)";
                    (e.currentTarget as HTMLButtonElement).style.color = "#aaa"
                  }}
                >
                  <Icon icon={sidebarOpen ? "mdi:chevron-left" : "mdi:chevron-right"} width={20} />
                </button>
                {sidebarOpen && (
                  <h2 style={{ margin: 0, fontSize: 16, color: "#fff", whiteSpace: "nowrap", fontWeight: "700", letterSpacing: "-0.3px" }}>
                    Admin
                  </h2>
                )}
              </div>

              {/* Nav items */}
              <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", paddingBottom: 16 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingLeft: sidebarOpen ? 8 : 0 }}>
                  {visibleNavItems.map(item => (
                    <NavItem key={item.key} item={item} showLabel={sidebarOpen} />
                  ))}
                </div>
              </div>

              {/* Logout button */}
              <div style={{ padding: "12px 8px 20px", borderTop: "1px solid rgba(255,255,255,0.1)", flexShrink: 0 }}>
                <button
                  onClick={handleLogout}
                  style={{
                    width: "100%",
                    padding: "11px 0",
                    background: "rgba(255, 85, 85, 0.2)",
                    color: "#ff5555",
                    border: "1.5px solid rgba(255, 85, 85, 0.3)",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontWeight: "600",
                    fontSize: 13,
                    minHeight: 44,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(255, 85, 85, 0.3)";
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255, 85, 85, 0.5)"
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(255, 85, 85, 0.2)";
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255, 85, 85, 0.3)"
                  }}
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
              <div
                onClick={() => setDrawerOpen(false)}
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(0,0,0,0.6)",
                  zIndex: 50,
                }}
              />
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
                    {visibleNavItems.map(item => (
                      <NavItem key={item.key} item={item} showLabel={true} />
                    ))}
                  </div>
                </div>

                {/* Logout button in drawer */}
                <div style={{ padding: "16px 12px 24px", borderTop: "1px solid rgba(255,255,255,0.1)", flexShrink: 0 }}>
                  <button
                    onClick={handleLogout}
                    style={{
                      width: "100%",
                      padding: "12px 0",
                      background: "rgba(255, 85, 85, 0.2)",
                      color: "#ff5555",
                      border: "1.5px solid rgba(255, 85, 85, 0.3)",
                      borderRadius: 8,
                      cursor: "pointer",
                      fontWeight: "600",
                      fontSize: 14,
                      minHeight: 48,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = "rgba(255, 85, 85, 0.3)";
                      (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255, 85, 85, 0.5)"
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = "rgba(255, 85, 85, 0.2)";
                      (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255, 85, 85, 0.3)"
                    }}
                  >
                    <Icon icon="mdi:logout" width={18} />
                    Logout
                  </button>
                </div>
              </div>
            )}

            {/* Alert banners — only shown in Diesel Manager section */}
            {active === "diesel-manager" && visibleAlerts.length > 0 && (
              <div style={{
                padding: isNarrow ? "12px 16px 0" : "20px 48px 0",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}>
                {visibleAlerts.map(company => (
                  <div
                    key={company.company_id}
                    style={{
                      background: "white",
                      border: "1.5px solid #f5a623",
                      borderRadius: 10,
                      padding: "12px 16px",
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: 12,
                      boxShadow: "0 2px 8px rgba(245, 166, 35, 0.1)",
                    }}
                  >
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flex: 1 }}>
                      <Icon icon="mdi:alert-circle" width={18} color="#f5a623" style={{ flexShrink: 0, marginTop: 2 }} />
                      <p style={{ margin: 0, fontSize: 13, color: "#5a5a5a", lineHeight: 1.5, fontWeight: 500 }}>
                        <strong style={{ color: "#171717" }}>{company.company_name}</strong> balance is running low — ₦{company.current_balance.toLocaleString()}
                      </p>
                    </div>
                    <button
                      onClick={() => dismissAlert(company.company_id)}
                      style={{
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        color: "#aaa",
                        padding: 2,
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        transition: "color 0.2s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget as HTMLButtonElement).style.color = "#f5a623"}
                      onMouseLeave={(e) => (e.currentTarget as HTMLButtonElement).style.color = "#aaa"}
                    >
                      <Icon icon="mdi:close" width={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Content area */}
            <div style={{ flex: 1, padding: isNarrow ? "20px 16px 40px" : "48px", overflow: "auto" }}>
              {renderContent()}
            </div>
          </div>
        </div>
      </div>

      <ReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        userId={userProfile.user_id}
        userRole={effectiveRole}
      />

      {/* Profile Picture Upload Modal */}
      {showPictureModal && (
        <div onClick={() => { setShowPictureModal(false); setSelectedFile(null); setPicturePreview(null); setPictureError("") }} style={{
          position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)",
          backdropFilter: "blur(4px)",
          display: "flex", alignItems: isMobile ? "flex-end" : "center",
          justifyContent: "center", zIndex: 100, padding: isMobile ? 0 : 24
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "white",
            borderRadius: isMobile ? "20px 20px 0 0" : 12,
            padding: isMobile ? "28px 20px" : 32,
            width: "100%",
            maxWidth: 480,
            maxHeight: "90vh",
            overflowY: "auto",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)"
          }}>
            <h3 style={{ margin: "0 0 6px 0", fontSize: 20, fontWeight: 700, color: "#0f172a" }}>Update Profile Picture</h3>
            <p style={{ margin: "0 0 20px 0", fontSize: 13, color: "#64748b" }}>PNG, JPG up to 1MB</p>

            {picturePreview ? (
              <div style={{ marginBottom: 20 }}>
                <p style={{ margin: "0 0 8px 0", fontSize: 13, fontWeight: 600, color: "#0f172a" }}>Preview</p>
                <Image src={picturePreview} alt="Preview" width={400} height={200} unoptimized style={{ width: "100%", height: 200, objectFit: "cover", borderRadius: 12, border: "2px solid #e2e8f0" }} />
              </div>
            ) : (
              <div onClick={() => fileInputRef.current?.click()} style={{ border: "2px dashed #0070f3", borderRadius: 12, padding: "32px 16px", cursor: "pointer", background: "#f0f7ff", transition: "all 0.2s", marginBottom: 20, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }} onMouseEnter={e => { e.currentTarget.style.background = "#e0efff"; e.currentTarget.style.borderColor = "#0055d4" }} onMouseLeave={e => { e.currentTarget.style.background = "#f0f7ff"; e.currentTarget.style.borderColor = "#0070f3" }}>
                <Icon icon="mdi:cloud-upload" width={40} height={40} color="#0070f3" style={{ marginBottom: 8 }} />
                <p style={{ margin: "0 0 4px 0", fontSize: 14, fontWeight: 700, color: "#0070f3" }}>Click to upload</p>
                <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>or drag and drop</p>
              </div>
            )}

            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} style={{ display: "none" }} />

            {pictureError && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 16, color: "#b91c1c", fontSize: 13, fontWeight: 600 }}>{pictureError}</div>}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => { setShowPictureModal(false); setSelectedFile(null); setPicturePreview(null); setPictureError("") }} style={{ padding: "12px 16px", background: "white", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 15, minHeight: 44 }}>
                Cancel
              </button>
              <button onClick={handleUploadPicture} disabled={pictureLoading || !selectedFile} style={{ padding: "12px 16px", background: selectedFile ? "#0070f3" : "#bfdbfe", color: "white", border: "none", borderRadius: 8, cursor: selectedFile && !pictureLoading ? "pointer" : "not-allowed", fontWeight: 700, fontSize: 15, minHeight: 44, opacity: pictureLoading ? 0.7 : 1, transition: "opacity 0.2s" }}>
                {pictureLoading ? "Uploading..." : "Upload"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default function AdminPanel({ userProfile, initialRole }: Props) {
  return (
    <PermissionProvider userId={userProfile.user_id} defaultRole={initialRole}>
      <AdminPanelContent userProfile={userProfile} />
    </PermissionProvider>
  )
}