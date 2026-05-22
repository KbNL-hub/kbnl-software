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

const navItems = [
  { label: "Add New Truck", key: "add-truck" },
  { label: "Add New Driver", key: "add-driver" },
  { label: "Manage Brokers", key: "manage-brokers" },
  { label: "Monitor Trucks", key: "monitor-trucks" },
  { label: "Manage Trucks", key: "manage-trucks" },
  { label: "Manage Drivers", key: "manage-drivers" },
  { label: "Monitor Trips", key: "monitor-trips" },
  { label: "Diesel Manager", key: "diesel-manager" },
]

type LowBalanceCompany = {
  company_id: string
  company_name: string
  current_balance: number
}

export default function AdminDashboard() {
  const [active, setActive] = useState("")
  const router = useRouter()
  const [disputedCount, setDisputedCount] = useState(0)
  const [lowBalanceCompanies, setLowBalanceCompanies] = useState<LowBalanceCompany[]>([])
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set())

  useEffect(() => {
    // Load dismissed alerts from sessionStorage (clears on tab close)
    const stored = sessionStorage.getItem("dismissedFuelAlerts")
    if (stored) setDismissedAlerts(new Set(JSON.parse(stored)))
  }, [])

  useEffect(() => {
    async function checkDisputed() {
      const { count } = await supabase
        .from("Stops")
        .select("*", { count: "exact", head: true })
        .eq("disputed", true)
      setDisputedCount(count || 0)
    }

    async function checkLowBalances() {
      const { data } = await supabase
        .from("fuel_companies")
        .select("company_id, company_name, current_balance, low_balance_threshold")

      if (!data) return

      const low = data.filter((c) => c.current_balance < c.low_balance_threshold)
      setLowBalanceCompanies(low)
    }

    checkDisputed()
    checkLowBalances()
    const interval = setInterval(() => {
      checkDisputed()
      checkLowBalances()
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  function dismissAlert(company_id: string) {
    const updated = new Set(dismissedAlerts).add(company_id)
    setDismissedAlerts(updated)
    sessionStorage.setItem("dismissedFuelAlerts", JSON.stringify([...updated]))
  }

  const visibleAlerts = lowBalanceCompanies.filter((c) => !dismissedAlerts.has(c.company_id))

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
      case "diesel-manager": return <DieselManager />
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
        width: 240, background: "#1a1a2e", color: "white",
        display: "flex", flexDirection: "column", padding: "24px 0"
      }}>
        <h2 style={{ padding: "0 24px", marginBottom: 32, fontSize: 16, color: "#aaa" }}>
          Admin Panel
        </h2>
        {navItems.map((item) => (
          <button
            key={item.key}
            onClick={() => setActive(item.key)}
            style={{
              background: active === item.key ? "#0070f3" : "transparent",
              color: "white", border: "none", textAlign: "left",
              padding: "12px 24px", cursor: "pointer", fontSize: 14,
              borderLeft: active === item.key ? "3px solid white" : "3px solid transparent",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              width: "100%"
            }}
          >
            {item.label}
            {item.key === "monitor-trips" && disputedCount > 0 && (
              <span style={{
                background: "#ff4444", color: "white", borderRadius: "50%",
                width: 18, height: 18, fontSize: 11, fontWeight: "bold",
                display: "flex", alignItems: "center", justifyContent: "center"
              }}>
                {disputedCount}
              </span>
            )}
          </button>
        ))}
        <div style={{ marginTop: "auto", padding: "0 24px" }}>
          <button
            onClick={handleLogout}
            style={{
              width: "100%", padding: "10px 0", background: "#ff4444",
              color: "white", border: "none", borderRadius: 6,
              cursor: "pointer", fontSize: 14
            }}
          >
            Logout
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, background: "#f9f9f9", display: "flex", flexDirection: "column" }}>
        {/* Low Balance Notification Banner */}
        {visibleAlerts.length > 0 && (
          <div style={{ padding: "12px 40px 0", display: "flex", flexDirection: "column", gap: 8 }}>
            {visibleAlerts.map((company) => (
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
                  style={{
                    background: "transparent", border: "none", cursor: "pointer",
                    fontSize: 16, color: "#7a5c00", marginLeft: 16, lineHeight: 1
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Page Content */}
        <div style={{ flex: 1, padding: 40 }}>
          {renderContent()}
        </div>
      </div>
    </div>
  )
}