"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
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
import CashTransactions from "@/components/admin/CashTransactions"
import CustomerPaymentsAdmin from "@/components/admin/CustomerPaymentsAdmin"
import { Icon } from "@iconify/react"
import { useBreakpoint } from "@/app/hooks/useBreakpoint"

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
  { label: "Tricycles",         key: "tricycles",           icon: "mdi:tricycle" },
  { label: "Store Officers",    key: "store-officers",      icon: "mdi:storefront" },
  { label: "Office Clerks",     key: "office-clerks",       icon: "mdi:account-tie" },
  { label: "Cash Transactions", key: "cash-transactions",   icon: "mdi:cash-multiple" },
  { label: "Customer Payments", key: "customer-payments",   icon: "mdi:cash-register" },
  { label: "Reports",           key: "reports",             icon: "mdi:chart-bar" },
]

type LowBalanceCompany = {
  company_id: string
  company_name: string
  current_balance: number
}

export default function AdminDashboard() {
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"
  const isTablet = bp === "tablet"
  const isNarrow = isMobile || isTablet

  const [active, setActive] = useState("")
  // Desktop: sidebar collapsed/expanded. Mobile: always uses drawer.
  const [sidebarOpen, setSidebarOpen] = useState(true)
  // Mobile drawer open state
  const [drawerOpen, setDrawerOpen] = useState(false)

  const router = useRouter()
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
      const { count: disputed } = await supabase
        .from("Stops").select("*", { count: "exact", head: true }).eq("disputed", true)
      setDisputedCount(disputed || 0)

      const { count: complaints } = await supabase
        .from("driver_complaints").select("*", { count: "exact", head: true }).eq("resolved", false)
      setUnresolvedComplaints(complaints || 0)

      const { data } = await supabase
        .from("fuel_companies").select("company_id, company_name, current_balance, low_balance_threshold")
      if (data) setLowBalanceCompanies(data.filter(c => c.current_balance < c.low_balance_threshold))
    }
    checkAlerts()
    const interval = setInterval(checkAlerts, 30000)
    return () => clearInterval(interval)
  }, [])

  // Close drawer when switching to desktop
  useEffect(() => {
    if (!isNarrow) setDrawerOpen(false)
  }, [isNarrow])

  function dismissAlert(company_id: string) {
    const updated = new Set(dismissedAlerts).add(company_id)
    setDismissedAlerts(updated)
    sessionStorage.setItem("dismissedFuelAlerts", JSON.stringify([...updated]))
  }

  const visibleAlerts = lowBalanceCompanies.filter(c => !dismissedAlerts.has(c.company_id))

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push("/login")
  }

  function navigate(key: string) {
    setActive(key)
    if (isNarrow) setDrawerOpen(false)
  }

  const activeLabel = NAV_ITEMS.find(n => n.key === active)?.label ?? "Admin Panel"

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
      case "cash-transactions":  return <CashTransactions />
      case "customer-payments":  return <CustomerPaymentsAdmin />
      case "reports":            return <Reports />
      default: return (
        <div>
          <h1 style={{ marginBottom: 8, fontSize: isMobile ? 22 : 28, color: "#171717" }}>Welcome, Admin</h1>
          <p style={{ color: "#888", fontSize: 15 }}>Select a section from the {isNarrow ? "menu" : "sidebar"}.</p>
        </div>
      )
    }
  }

  // ─── Shared nav list (used in both desktop sidebar and mobile drawer) ───
  function NavList({ showLabels }: { showLabels: boolean }) {
    return (
      <>
        {NAV_ITEMS.map(item => {
          const isActive = active === item.key
          const badge =
            item.key === "monitor-trips" && disputedCount > 0 ? disputedCount :
            item.key === "complaints" && unresolvedComplaints > 0 ? unresolvedComplaints :
            null

          return (
            <button
              key={item.key}
              onClick={() => navigate(item.key)}
              title={!showLabels ? item.label : undefined}
              style={{
                background: isActive ? "#0070f3" : "transparent",
                color: "white",
                border: "none",
                textAlign: "left",
                padding: showLabels ? "12px 20px" : "12px 0",
                justifyContent: showLabels ? "flex-start" : "center",
                cursor: "pointer",
                fontSize: 14,
                borderLeft: isActive ? "3px solid rgba(255,255,255,0.6)" : "3px solid transparent",
                display: "flex",
                alignItems: "center",
                gap: showLabels ? 12 : 0,
                width: "100%",
                whiteSpace: "nowrap",
                overflow: "hidden",
                minHeight: 44,
                transition: "background 0.15s",
                borderRadius: showLabels ? "0 8px 8px 0" : 0,
                marginRight: showLabels ? 8 : 0,
              }}
            >
              <span style={{ position: "relative", flexShrink: 0, display: "flex", alignItems: "center" }}>
                <Icon icon={item.icon} width={18} height={18} />
                {/* Badge dot in icon-only mode */}
                {!showLabels && badge && (
                  <span style={{
                    position: "absolute", top: -4, right: -4,
                    width: 8, height: 8, borderRadius: "50%",
                    background: item.key === "complaints" ? "#f5a623" : "#ff4444",
                    border: "1.5px solid #1a1a2e",
                  }} />
                )}
              </span>

              {showLabels && (
                <>
                  <span style={{ flex: 1, fontSize: 14 }}>{item.label}</span>
                  {badge && (
                    <span style={{
                      background: item.key === "complaints" ? "#f5a623" : "#ff4444",
                      color: "white", borderRadius: 10,
                      minWidth: 20, height: 20, fontSize: 11, fontWeight: "bold",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      padding: "0 5px", flexShrink: 0,
                    }}>
                      {badge}
                    </span>
                  )}
                </>
              )}
            </button>
          )
        })}
      </>
    )
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "Arial, sans-serif" }}>

      {/* ══ DESKTOP SIDEBAR ══ */}
      {!isNarrow && (
        <div style={{
          width: sidebarOpen ? 240 : 56,
          background: "#1a1a2e",
          color: "white",
          display: "flex",
          flexDirection: "column",
          padding: "20px 0",
          transition: "width 0.2s ease",
          overflow: "hidden",
          flexShrink: 0,
          position: "sticky",
          top: 0,
          height: "100vh",
        }}>
          {/* Sidebar header */}
          <div style={{
            display: "flex", alignItems: "center",
            padding: "0 16px", marginBottom: 24, gap: 10,
          }}>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              style={{
                background: "none", border: "none", color: "#aaa",
                cursor: "pointer", padding: 4, flexShrink: 0,
                display: "flex", alignItems: "center",
              }}
            >
              <Icon icon={sidebarOpen ? "mdi:close" : "mdi:menu"} width={20} />
            </button>
            {sidebarOpen && (
              <h2 style={{ margin: 0, fontSize: 15, color: "#ccc", whiteSpace: "nowrap", fontWeight: "600" }}>
                Admin Panel
              </h2>
            )}
          </div>

          {/* Scrollable nav */}
          <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", paddingRight: sidebarOpen ? 8 : 0 }}>
            <NavList showLabels={sidebarOpen} />
          </div>

          {/* Logout */}
          <div style={{ padding: sidebarOpen ? "16px 16px 0" : "16px 8px 0", marginTop: 8 }}>
            <button
              onClick={handleLogout}
              style={{
                width: "100%",
                padding: sidebarOpen ? "10px 0" : "10px 0",
                background: "#ff4444", color: "white",
                border: "none", borderRadius: 6,
                cursor: "pointer", fontWeight: "bold",
                fontSize: 13, minHeight: 40,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}
            >
              <Icon icon="mdi:logout" width={16} />
              {sidebarOpen && "Logout"}
            </button>
          </div>
        </div>
      )}

      {/* ══ MOBILE DRAWER OVERLAY ══ */}
      {isNarrow && drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 50,
          }}
        />
      )}

      {/* ══ MOBILE DRAWER ══ */}
      {isNarrow && (
        <div style={{
          position: "fixed", top: 0, left: 0,
          width: 272, height: "100vh",
          background: "#1a1a2e", color: "white",
          display: "flex", flexDirection: "column",
          padding: "0",
          zIndex: 60,
          transform: drawerOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.25s ease",
          boxShadow: drawerOpen ? "4px 0 24px rgba(0,0,0,0.3)" : "none",
        }}>
          {/* Drawer header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)",
            flexShrink: 0,
          }}>
            <h2 style={{ margin: 0, fontSize: 16, color: "#ccc", fontWeight: "600" }}>Admin Panel</h2>
            <button
              onClick={() => setDrawerOpen(false)}
              style={{
                background: "none", border: "none", color: "#aaa",
                cursor: "pointer", padding: 4,
                display: "flex", alignItems: "center",
              }}
            >
              <Icon icon="mdi:close" width={22} />
            </button>
          </div>

          {/* Scrollable nav */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 0 8px" }}>
            <NavList showLabels={true} />
          </div>

          {/* Logout */}
          <div style={{ padding: "12px 16px 24px", borderTop: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
            <button
              onClick={handleLogout}
              style={{
                width: "100%", padding: "12px 0",
                background: "#ff4444", color: "white",
                border: "none", borderRadius: 8,
                cursor: "pointer", fontWeight: "bold", fontSize: 14,
                minHeight: 48,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              <Icon icon="mdi:logout" width={18} />
              Logout
            </button>
          </div>
        </div>
      )}

      {/* ══ MAIN AREA ══ */}
      <div style={{ flex: 1, background: "#f9f9f9", display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* Mobile top nav bar */}
        {isNarrow && (
          <div style={{
            background: "#1a1a2e", color: "white",
            padding: "0 16px",
            height: 56,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            position: "sticky", top: 0, zIndex: 40,
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            flexShrink: 0,
          }}>
            <button
              onClick={() => setDrawerOpen(true)}
              style={{
                background: "none", border: "none", color: "white",
                cursor: "pointer", padding: "8px 8px 8px 0",
                display: "flex", alignItems: "center",
              }}
            >
              <Icon icon="mdi:menu" width={24} />
            </button>

            <p style={{
              margin: 0, fontWeight: "bold", fontSize: 15,
              color: "white", flex: 1, textAlign: "center",
              // Ellipsis if label is long
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              padding: "0 8px",
            }}>
              {active ? activeLabel : "Admin Panel"}
            </p>

            {/* Spacer to balance the hamburger */}
            <div style={{ width: 32 }} />
          </div>
        )}

        {/* Alert banners */}
        {visibleAlerts.length > 0 && (
          <div style={{
            padding: isNarrow ? "10px 16px 0" : "12px 40px 0",
            display: "flex", flexDirection: "column", gap: 8,
          }}>
            {visibleAlerts.map(company => (
              <div
                key={company.company_id}
                style={{
                  background: "#fff8e1",
                  border: "1px solid #f5a623",
                  borderRadius: 8,
                  padding: "10px 14px",
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flex: 1 }}>
                  <Icon icon="mdi:alert" width={16} color="#f5a623" style={{ flexShrink: 0, marginTop: 1 }} />
                  <p style={{ margin: 0, fontSize: 13, color: "#7a5c00", lineHeight: 1.4 }}>
                    <strong>{company.company_name}</strong> balance is running low —{" "}
                    ₦{company.current_balance.toLocaleString()} remaining.
                  </p>
                </div>
                <button
                  onClick={() => dismissAlert(company.company_id)}
                  style={{
                    background: "transparent", border: "none",
                    cursor: "pointer", color: "#7a5c00",
                    padding: 2, flexShrink: 0,
                    display: "flex", alignItems: "center",
                  }}
                >
                  <Icon icon="mdi:close" width={16} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Content */}
        <div style={{
          flex: 1,
          padding: isNarrow ? "20px 16px 40px" : "40px",
          overflowX: "hidden",
        }}>
          {renderContent()}
        </div>
      </div>
    </div>
  )
}