"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import AddTruck from "@/components/admin/AddTruck"
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

const navItems = [
  { label: "Add New Truck", key: "add-truck" },
  { label: "Add New Driver", key: "add-driver" },
  { label: "Manage Brokers", key: "manage-brokers" },
  { label: "Monitor Trucks", key: "monitor-trucks" },
  { label: "Manage Trucks", key: "manage-trucks" },
  { label: "Manage Drivers", key: "manage-drivers" },
  { label: "Monitor Trips", key: "monitor-trips" },
  { label: "Complaints", key: "complaints" },
  { label: "Diesel Manager", key: "diesel-manager" },
  { label: "Station Managers", key: "station-managers" },
  { label: "Truck Officers", key: "truck-officers" },
  { label: "Truck Admins", key: "truck-admins" },
  { label: "Store Officers", key: "store-officers" },
  { label: "Office Clerks", key: "office-clerks" },
  { label: "Cash Transactions", key: "cash-transactions" },
  { label: "Customer Payments", key: "customer-payments" },
  { label: "Reports", key: "reports" },
]

type LowBalanceCompany = {
  company_id: string
  company_name: string
  current_balance: number
}

export default function AdminDashboard() {
  const [active, setActive] = useState("")
  const [sidebarOpen, setSidebarOpen] = useState(true)
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
        .from("Stops")
        .select("*", { count: "exact", head: true })
        .eq("disputed", true)
      setDisputedCount(disputed || 0)

      const { count: complaints } = await supabase
        .from("driver_complaints")
        .select("*", { count: "exact", head: true })
        .eq("resolved", false)
      setUnresolvedComplaints(complaints || 0)

      const { data } = await supabase
        .from("fuel_companies")
        .select("company_id, company_name, current_balance, low_balance_threshold")
      if (data) setLowBalanceCompanies(data.filter(c => c.current_balance < c.low_balance_threshold))
    }

    checkAlerts()
    const interval = setInterval(checkAlerts, 30000)
    return () => clearInterval(interval)
  }, [])

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

  function renderContent() {
    switch (active) {
      case "add-truck": return <AddTruck />
      case "add-driver": return <AddDriver />
      case "manage-brokers": return <ManageBrokers />
      case "monitor-trucks": return <MonitorTrucks />
      case "manage-trucks": return <ManageTrucks />
      case "manage-drivers": return <ManageDrivers />
      case "monitor-trips": return <MonitorTrips />
      case "complaints": return <Complaints />
      case "diesel-manager": return <DieselManager />
      case "station-managers": return <StationManagers />
      case "truck-officers": return <TruckOfficers />
      case "truck-admins": return <TruckAdmins />
      case "store-officers": return <StoreOfficers />
      case "office-clerks": return <OfficeClerks />
      case "cash-transactions": return <CashTransactions />
      case "customer-payments": return <CustomerPaymentsAdmin />
      case "reports": return <Reports />
      default: return (
        <div>
          <h1 style={{ marginBottom: 8 }}>Welcome, Admin</h1>
          <p style={{ color: "#888" }}>Select a section from the sidebar.</p>
        </div>
      )
    }
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "Arial" }}>

      {/* Sidebar */}
      <div style={{
        width: sidebarOpen ? 240 : 56, background: "#1a1a2e", color: "white",
        display: "flex", flexDirection: "column", padding: "24px 0",
        transition: "width 0.2s ease", overflow: "hidden", flexShrink: 0
      }}>
        {/* Toggle + Title */}
        <div style={{ display: "flex", alignItems: "center", padding: "0 16px", marginBottom: 32, gap: 10 }}>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{
              background: "none", border: "none", color: "#aaa", cursor: "pointer",
              fontSize: 18, lineHeight: 1, padding: 0, flexShrink: 0
            }}
          >
            {sidebarOpen ? "✕" : "☰"}
          </button>
          {sidebarOpen && (
            <h2 style={{ margin: 0, fontSize: 16, color: "#aaa", whiteSpace: "nowrap" }}>
              Admin Panel
            </h2>
          )}
        </div>

        {/* Nav Items */}
        {navItems.map(item => (
          <button
            key={item.key}
            onClick={() => setActive(item.key)}
            title={!sidebarOpen ? item.label : undefined}
            style={{
              background: active === item.key ? "#0070f3" : "transparent",
              color: "white", border: "none", textAlign: "left",
              padding: sidebarOpen ? "12px 24px" : "12px 0",
              justifyContent: sidebarOpen ? "space-between" : "center",
              cursor: "pointer", fontSize: 14,
              borderLeft: active === item.key ? "3px solid white" : "3px solid transparent",
              display: "flex", alignItems: "center",
              width: "100%", whiteSpace: "nowrap", overflow: "hidden"
            }}
          >
            {sidebarOpen ? (
              <>
                <span>{item.label}</span>
                <span style={{ display: "flex", gap: 4 }}>
                  {item.key === "monitor-trips" && disputedCount > 0 && (
                    <span style={{
                      background: "#ff4444", color: "white", borderRadius: "50%",
                      width: 18, height: 18, fontSize: 11, fontWeight: "bold",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                    }}>
                      {disputedCount}
                    </span>
                  )}
                  {item.key === "complaints" && unresolvedComplaints > 0 && (
                    <span style={{
                      background: "#f5a623", color: "white", borderRadius: "50%",
                      width: 18, height: 18, fontSize: 11, fontWeight: "bold",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                    }}>
                      {unresolvedComplaints}
                    </span>
                  )}
                </span>
              </>
            ) : (
              <span style={{ fontSize: 16 }}>
                <Icon icon={
                  item.key === "add-truck" ? "mdi:truck-plus" :
                  item.key === "add-driver" ? "mdi:account-plus" :
                  item.key === "manage-brokers" ? "mdi:handshake" :
                  item.key === "monitor-trucks" ? "mdi:dump-truck" :
                  item.key === "manage-trucks" ? "mdi:bus-wrench" :
                  item.key === "manage-drivers" ? "mdi:account-group" :
                  item.key === "monitor-trips" ? "streamline-ultimate:trip-road-bold" :
                  item.key === "complaints" ? "mdi:alert-circle" :
                  item.key === "diesel-manager" ? "mdi:gas-station" :
                  item.key === "station-managers" ? "mdi:person-tie" :
                  item.key === "truck-officers" ? "wpf:maintenance" :
                  item.key === "truck-admins" ? "mdi:person-star" :
                  item.key === "store-officers" ? "mdi:storefront" :
                  item.key === "office-clerks" ? "mdi:account-tie" :
                  item.key === "cash-transactions" ? "mdi:cash-multiple" :
                  item.key === "customer-payments" ? "mdi:cash-register" :
                  item.key === "reports" ? "mdi:chart-bar" : "mdi:circle"
                } width={20} height={20} />
              </span>
            )}
          </button>
        ))}

        <div style={{ marginTop: "auto", padding: sidebarOpen ? "0 24px" : "0 8px" }}>
          <button
            onClick={handleLogout}
            style={{
              width: "100%", padding: "10px 0", background: "#ff4444",
              color: "white", border: "none", borderRadius: 6,
              cursor: "pointer", fontSize: sidebarOpen ? 14 : 18
            }}
          >
            {sidebarOpen ? "Logout" : "↩"}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, background: "#f9f9f9", display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Low Balance Banners */}
        {visibleAlerts.length > 0 && (
          <div style={{ padding: "12px 40px 0", display: "flex", flexDirection: "column", gap: 8 }}>
            {visibleAlerts.map(company => (
              <div
                key={company.company_id}
                style={{
                  background: "#fff8e1", border: "1px solid #f5a623",
                  borderRadius: 8, padding: "10px 16px",
                  display: "flex", alignItems: "center", justifyContent: "space-between"
                }}
              >
                <p style={{ margin: 0, fontSize: 13, color: "#7a5c00" }}>
                  ⚠️ <strong>{company.company_name}</strong> balance is running low —{" "}
                  ₦{company.current_balance.toLocaleString()} remaining.
                </p>
                <button
                  onClick={() => dismissAlert(company.company_id)}
                  style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 16, color: "#7a5c00", marginLeft: 16 }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ flex: 1, padding: 40 }}>
          {renderContent()}
        </div>
      </div>
    </div>
  )
}