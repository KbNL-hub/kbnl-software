"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Icon } from "@iconify/react"
import { supabase } from "@/lib/supabase"
import { useBreakpoint } from "@/app/hooks/useBreakpoint"

// Admin sections
import AddTruck from "@/components/admin/AddTruck"
import Tricycles from "@/components/admin/Tricycles"
import AddDriver from "@/components/admin/AddDriver"
import ManageBrokers from "@/components/admin/ManageBrokers"
import MonitorTrucks from "@/components/admin/MonitorTrucks"
import ManageTrucks from "@/components/admin/ManageTrucks"
import ManageDrivers from "@/components/admin/ManageDrivers"
import MonitorTrips from "@/components/admin/MonitorTrips"
import DieselManager from "@/components/admin/DieselManager"
import StationManagers from "@/components/admin/StationManagers"
import TruckOfficers from "@/components/admin/TruckOfficers"
import TruckAdmins from "@/components/admin/TruckAdmins"
import Reports from "@/components/admin/Reports"
import Complaints from "@/components/admin/Complaints"
import StoreOfficers from "@/components/admin/StoreOfficers"
import OfficeClerks from "@/components/admin/OfficeClerks"
import CashExpenses from "@/components/admin/CashExpenses"
import CustomerPaymentsAdmin from "@/components/admin/CustomerPaymentsAdmin"
import BrokerCredits from "@/components/admin/BrokerCredits"

const NAV_ITEMS = [
  { label: "Add New Truck",     key: "add-truck",          icon: "mdi:truck-plus" },
  { label: "Add New Driver",    key: "add-driver",          icon: "mdi:account-plus" },
  { label: "Manage Brokers",    key: "manage-brokers",      icon: "mdi:handshake" },
  { label: "Monitor Trucks",    key: "monitor-trucks",      icon: "mdi:dump-truck" },
  { label: "Manage Trucks",     key: "manage-trucks",       icon: "mdi:bus-wrench" },
  { label: "Manage Drivers",    key: "manage-drivers",      icon: "mdi:account-group" },
  { label: "Monitor Trips",     key: "monitor-trips",       icon: "streamline-ultimate:trip-road-bold" },
  { label: "Complaints",        key: "complaints",          icon: "mdi:alert-circle" },
  { label: "Diesel Manager",    key: "diesel-manager",      icon: "mdi:gas-station" },
  { label: "Station Managers",  key: "station-managers",    icon: "mdi:person-tie" },
  { label: "Truck Officers",    key: "truck-officers",      icon: "wpf:maintenance" },
  { label: "Truck Admins",      key: "truck-admins",        icon: "mdi:person-star" },
  { label: "Tricycles",         key: "tricycles",           icon: "mdi:rickshaw" },
  { label: "Store Officers",    key: "store-officers",      icon: "mdi:storefront" },
  { label: "Office Clerks",     key: "office-clerks",       icon: "mdi:account-tie" },
  { label: "Cash Expenses",     key: "cash-expenses",       icon: "mdi:cash-multiple" },
  { label: "Customer Payments", key: "customer-payments",   icon: "mdi:cash-register" },
  { label: "Credit",            key: "credit",              icon: "mdi:credit-card-outline" },
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
}

export default function AdminPanel({ userProfile }: Props) {
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"
  const isTablet = bp === "tablet"
  const isNarrow = isMobile || isTablet

  const router = useRouter()
  const [active, setActive] = useState("")
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const bannerRef = useRef<HTMLDivElement>(null)
  const [bannerHeight, setBannerHeight] = useState(64)

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
  const [lowBalanceCompanies, setLowBalanceCompanies] = useState<LowBalanceCompany[]>([])
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set())

  useEffect(() => {
    const stored = sessionStorage.getItem("dismissedFuelAlerts")
    if (stored) setDismissedAlerts(new Set(JSON.parse(stored)))
  }, [])

  useEffect(() => {
    async function checkAlerts() {
      try {
        const { count: disputed } = await supabase
          .from("Stops").select("*", { count: "exact", head: true }).eq("disputed", true)
        setDisputedCount(disputed || 0)

        const { count: complaints } = await supabase
          .from("driver_complaints").select("*", { count: "exact", head: true }).eq("resolved", false)
        setUnresolvedComplaints(complaints || 0)

        const { data } = await supabase
          .from("fuel_companies").select("company_id, company_name, current_balance, low_balance_threshold")
        if (data) setLowBalanceCompanies(data.filter(c => c.current_balance < c.low_balance_threshold))
      } catch (err) {
        console.error("Error checking alerts:", err)
      }
    }
    checkAlerts()
    const interval = setInterval(checkAlerts, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!isNarrow) setDrawerOpen(false)
  }, [isNarrow])

  function dismissAlert(company_id: string) {
    const updated = new Set(dismissedAlerts).add(company_id)
    setDismissedAlerts(updated)
    sessionStorage.setItem("dismissedFuelAlerts", JSON.stringify([...updated]))
  }

  const visibleAlerts = lowBalanceCompanies.filter(c => !dismissedAlerts.has(c.company_id))

  function navigate(key: string) {
    setActive(key)
    if (isNarrow) setDrawerOpen(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push("/login")
  }

  const activeLabel = NAV_ITEMS.find(n => n.key === active)?.label ?? "Admin Panel"

  const roleDisplay = userProfile.role === "TruckAdmin" ? "Truck Admin" : userProfile.role

  function renderContent() {
    switch (active) {
      case "add-truck":          return <AddTruck />
      case "add-driver":         return <AddDriver />
      case "manage-brokers":     return <ManageBrokers />
      case "monitor-trucks":     return <MonitorTrucks />
      case "manage-trucks":      return <ManageTrucks />
      case "manage-drivers":     return <ManageDrivers />
      case "monitor-trips":      return <MonitorTrips />
      case "complaints":         return <Complaints />
      case "diesel-manager":     return <DieselManager />
      case "station-managers":   return <StationManagers />
      case "truck-officers":     return <TruckOfficers />
      case "truck-admins":       return <TruckAdmins />
      case "tricycles":          return <Tricycles />
      case "store-officers":     return <StoreOfficers />
      case "office-clerks":      return <OfficeClerks />
      case "cash-expenses":      return <CashExpenses />
      case "customer-payments":  return <CustomerPaymentsAdmin />
      case "credit":             return <BrokerCredits />
      case "reports":            return <Reports />
      default: return (
        <div>
          <h1 style={{ marginBottom: 8, fontSize: isMobile ? 22 : 28, color: "#171717" }}>Welcome, Admin</h1>
          <p style={{ color: "#888", fontSize: 15 }}>Select a section from the {isNarrow ? "menu" : "sidebar"}.</p>
        </div>
      )
    }
  }

  function NavItem({ item, showLabel }: { item: typeof NAV_ITEMS[0]; showLabel: boolean }) {
    const isActive = active === item.key
    const badge =
      item.key === "monitor-trips" && disputedCount > 0 ? disputedCount :
      item.key === "complaints" && unresolvedComplaints > 0 ? unresolvedComplaints :
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
          {!showLabel && badge && (
            <span style={{
              position: "absolute", top: -6, right: -6,
              width: 18, height: 18, borderRadius: "50%",
              background: item.key === "complaints" ? "#f5a623" : "#ff5555",
              color: "white",
              fontSize: 10,
              fontWeight: "bold",
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "2px solid #0f0f1e",
            }} />
          )}
        </span>

        {showLabel && (
          <>
            <span style={{ flex: 1, fontSize: 14, fontWeight: isActive ? 600 : 500 }}>{item.label}</span>
            {badge && (
              <span style={{
                background: item.key === "complaints" ? "#f5a623" : "#ff5555",
                color: "white", borderRadius: 12,
                minWidth: 22, height: 22, fontSize: 11, fontWeight: "700",
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: "0 6px", flexShrink: 0,
              }}>
                {badge}
              </span>
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
              <div style={{
                width: isMobile ? 40 : 48,
                height: isMobile ? 40 : 48,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.15)",
                border: "2px solid rgba(255,255,255,0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                overflow: "hidden",
                transition: "all 0.2s",
              }}>
                <span style={{ fontSize: isMobile ? 18 : 20, fontWeight: 700, color: "#fff" }}>
                  {userProfile.full_name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <h1 style={{ margin: 0, fontSize: isMobile ? 15 : 18, fontWeight: 700, color: "#fff" }}>
                  {userProfile.full_name}
                </h1>
                <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.7)" }}>{roleDisplay}</p>
              </div>
            </div>
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
                  {NAV_ITEMS.map(item => (
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
                    {NAV_ITEMS.map(item => (
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

            {/* Alert banners */}
            {visibleAlerts.length > 0 && (
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
    </>
  )
}