"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { formatAmount, parseAmount } from "@/lib/formatAmount"

type AssignedTruck = {
  plate_number: string
  kbnl_truck_no: string | null
  truck_model: string
  status: string
  fuel_balance: number
}

type MaintenanceReport = {
  report_id: string
  plate_number: string
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

const MAINTENANCE_SUGGESTIONS = [
  "Oil service", "Tyre change", "Brake repair", "Electrical work",
  "Engine repair", "Suspension repair", "Body work", "Replacement of parts",
  "Coolant/radiator service", "Battery replacement", "Wheel alignment",
  "Exhaust repair", "General inspection",
]

const statusColor = (status: string) => {
  switch (status) {
    case "Pending": return { bg: "#fff8e1", color: "#f5a623" }
    case "Validated": return { bg: "#00aa0022", color: "#00aa00" }
    case "Rejected": return { bg: "#ff444422", color: "#ff4444" }
    default: return { bg: "#eee", color: "#888" }
  }
}

export default function MaintenanceManagerDashboard() {
  const router = useRouter()
  const [managerId, setManagerId] = useState("")
  const [managerName, setManagerName] = useState("")
  const [assignedTrucks, setAssignedTrucks] = useState<AssignedTruck[]>([])
  const [reports, setReports] = useState<MaintenanceReport[]>([])
  const [fuelExpenses, setFuelExpenses] = useState<FuelExpense[]>([])
  const [maintenanceBalance, setMaintenanceBalance] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [tab, setTab] = useState<"reports" | "fuel">("reports")
  const [filter, setFilter] = useState("All")

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
        .from("Profiles").select("role, full_name").eq("user_id", user.id).single()
      if (profile?.role !== "MaintenanceManager") { router.push("/login"); return }

      const { data: manager } = await supabase
        .from("maintenance_managers").select("manager_id, full_name").eq("manager_id", user.id).single()
      if (!manager) { router.push("/login"); return }

      setManagerId(manager.manager_id)
      setManagerName(manager.full_name)

      await Promise.all([
        fetchTrucks(manager.manager_id),
        fetchReports(manager.manager_id),
        fetchFuelExpenses(manager.manager_id),
        fetchMaintenanceBalance(),
      ])
      setLoading(false)
    }
    init()
  }, [])

  useEffect(() => {
    if (!managerId) return
    const interval = setInterval(() => {
      fetchReports(managerId)
      fetchFuelExpenses(managerId)
      fetchMaintenanceBalance()
    }, 30000)
    return () => clearInterval(interval)
  }, [managerId])

  async function fetchMaintenanceBalance() {
    const { data } = await supabase
      .from("maintenance_balance")
      .select("current_balance")
      .eq("id", 1)
      .single()
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

  async function fetchReports(mId: string) {
    const { data } = await supabase
      .from("maintenance_reports")
      .select("report_id, plate_number, maintenance_type, maintenance_location, amount, notes, status, rejection_reason, reported_at")
      .eq("manager_id", mId)
      .order("reported_at", { ascending: false })
    setReports(data || [])
    setLastUpdated(new Date())
  }

  async function fetchFuelExpenses(mId: string) {
    const { data } = await supabase
      .from("truck_fuel_expenses")
      .select("expense_id, plate_number, trip_id, litres, notes, logged_at")
      .eq("manager_id", mId)
      .order("logged_at", { ascending: false })
    setFuelExpenses(data || [])
  }

  // When plate is selected in fuel modal, fetch completed trips for that truck
  async function handleFuelPlateChange(plate: string) {
    setFuelPlate(plate)
    setFuelTripId("")
    setFuelTrips([])
    setFuelError("")
    if (!plate) return

    const { data } = await supabase
      .from("Trips")
      .select("trip_id, plate_number, material_centre, product, created_at")
      .eq("plate_number", plate)
      .eq("trip_status", "Completed")
      .order("created_at", { ascending: false })
      .limit(30)

    setFuelTrips(data || [])
  }

  async function handleLogReport() {
    const finalType = logType === "__custom__" ? logTypeCustom.trim() : logType
    if (!logPlate) return setLogError("Select a truck")
    if (!finalType) return setLogError("Enter a maintenance type")
    if (!logLocation.trim()) return setLogError("Enter the maintenance location")
    if (!logAmount || parseAmount(logAmount) <= 0) return setLogError("Enter a valid amount")

    setLogLoading(true)
    const { error } = await supabase.from("maintenance_reports").insert([{
      manager_id: managerId,
      plate_number: logPlate,
      maintenance_type: finalType,
      maintenance_location: logLocation.trim(),
      amount: parseAmount(logAmount),
      notes: logNotes.trim() || null,
    }])
    setLogLoading(false)
    if (error) { setLogError("Failed to log report"); return }

    setShowLogModal(false)
    setLogPlate(""); setLogType(""); setLogTypeCustom("")
    setLogAmount(""); setLogLocation(""); setLogNotes(""); setLogError("")
    fetchReports(managerId)
  }

  async function handleLogFuelExpense() {
    const litres = parseFloat(fuelLitres)
    if (!fuelPlate) return setFuelError("Select a truck")
    if (!fuelTripId) return setFuelError("Select a trip")
    if (!fuelLitres || isNaN(litres) || litres <= 0) return setFuelError("Enter valid litres")

    // Check truck fuel balance
    const truck = assignedTrucks.find(t => t.plate_number === fuelPlate)
    if (!truck) return setFuelError("Truck not found")
    if (litres > truck.fuel_balance) return setFuelError(`Only ${truck.fuel_balance}L available for this truck`)

    setFuelLoading(true)

    const { error: expenseError } = await supabase.from("truck_fuel_expenses").insert([{
      manager_id: managerId,
      plate_number: fuelPlate,
      trip_id: fuelTripId,
      litres,
      notes: fuelNotes.trim() || null,
    }])

    if (expenseError) { setFuelError("Failed to log fuel expense"); setFuelLoading(false); return }

    const newBalance = truck.fuel_balance - litres
    await supabase
      .from("Trucks")
      .update({ fuel_balance: newBalance })
      .eq("plate_number", fuelPlate)

    setFuelLoading(false)
    setShowFuelModal(false)
    setFuelPlate(""); setFuelTripId(""); setFuelTrips([])
    setFuelLitres(""); setFuelNotes(""); setFuelError("")
    await fetchTrucks(managerId)
    await fetchFuelExpenses(managerId)
  }

  function closeLogModal() {
    setShowLogModal(false)
    setLogPlate(""); setLogType(""); setLogTypeCustom("")
    setLogAmount(""); setLogLocation(""); setLogNotes(""); setLogError("")
  }

  function closeFuelModal() {
    setShowFuelModal(false)
    setFuelPlate(""); setFuelTripId(""); setFuelTrips([])
    setFuelLitres(""); setFuelNotes(""); setFuelError("")
  }

  const filteredReports = filter === "All"
    ? reports
    : reports.filter(r => r.status === filter)

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "Arial" }}>
      <p style={{ color: "#888" }}>Loading...</p>
    </div>
  )

  return (
    <div style={{ minHeight: "100vh", background: "#f9f9f9", fontFamily: "Arial" }}>

      {/* Header */}
      <div style={{ background: "white", borderBottom: "1px solid #eee", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Truck Officer</h2>
          <p style={{ margin: 0, fontSize: 13, color: "#888" }}>{managerName}</p>
        </div>
        <button
          onClick={async () => { await supabase.auth.signOut(); router.push("/login") }}
          style={{ padding: "8px 20px", background: "#ff4444", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14 }}
        >
          Logout
        </button>
      </div>

      <div style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>

        {/* Maintenance Balance */}
        <div style={{ background: "white", border: "1px solid #eee", borderRadius: 12, padding: 20, marginBottom: 24, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
          <p style={{ margin: "0 0 4px", fontSize: 13, color: "#888" }}>Maintenance Balance</p>
          <p style={{ margin: 0, fontSize: 32, fontWeight: "bold", color: "#0070f3" }}>
            ₦{maintenanceBalance !== null ? maintenanceBalance.toLocaleString() : "—"}
          </p>
        </div>

        {/* Assigned Trucks */}
        <div style={{ background: "white", border: "1px solid #eee", borderRadius: 12, padding: 20, marginBottom: 24, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <p style={{ margin: 0, fontWeight: "bold", fontSize: 15 }}>My Trucks ({assignedTrucks.length})</p>
            <button
              onClick={() => fetchTrucks(managerId)}
              style={{ padding: "4px 12px", fontSize: 12, cursor: "pointer", borderRadius: 4, border: "1px solid #ddd", background: "white" }}
            >
              Refresh
            </button>
          </div>
          {assignedTrucks.length === 0 && <p style={{ color: "#888", fontSize: 13, margin: 0 }}>No trucks assigned yet.</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {assignedTrucks.map((t) => (
              <div key={t.plate_number} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#f9f9f9", borderRadius: 8, border: "1px solid #eee" }}>
                <div>
                  <span style={{ fontWeight: "bold", fontSize: 13 }}>{t.plate_number}</span>
                  {t.kbnl_truck_no && <span style={{ fontSize: 12, color: "#888", marginLeft: 6 }}>· #{t.kbnl_truck_no}</span>}
                  <span style={{ fontSize: 12, color: "#888", marginLeft: 8 }}>{t.truck_model}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 12, color: "#555" }}>
                    ⛽ <strong>{t.fuel_balance}L</strong>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {(["reports", "fuel"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "8px 20px", borderRadius: 20, fontSize: 13, cursor: "pointer",
                border: "1px solid #ddd",
                background: tab === t ? "#0070f3" : "white",
                color: tab === t ? "white" : "#333",
                fontWeight: tab === t ? "bold" : "normal",
              }}
            >
              {t === "reports" ? "Maintenance Reports" : "Fuel Expense Log"}
            </button>
          ))}
        </div>

        {/* Reports Tab */}
        {tab === "reports" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {filters.map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    style={{
                      padding: "6px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer",
                      border: "1px solid #ddd",
                      background: filter === f ? "#0070f3" : "white",
                      color: filter === f ? "white" : "#333",
                      fontWeight: filter === f ? "bold" : "normal"
                    }}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 12, color: "#888" }}>
                  {lastUpdated && `Updated: ${lastUpdated.toLocaleTimeString()}`}
                </span>
                <button
                  onClick={() => fetchReports(managerId)}
                  style={{ padding: "4px 12px", fontSize: 12, cursor: "pointer", borderRadius: 4, border: "1px solid #ddd", background: "white" }}
                >
                  Refresh
                </button>
                <button
                  onClick={() => setShowLogModal(true)}
                  disabled={assignedTrucks.length === 0}
                  style={{
                    padding: "8px 16px", fontSize: 13, fontWeight: "bold", cursor: assignedTrucks.length === 0 ? "not-allowed" : "pointer",
                    background: assignedTrucks.length === 0 ? "#ccc" : "#0070f3",
                    color: "white", border: "none", borderRadius: 6
                  }}
                >
                  + Log Maintenance
                </button>
              </div>
            </div>

            {filteredReports.length === 0 && <p style={{ color: "#888" }}>No {filter === "All" ? "" : filter.toLowerCase()} reports.</p>}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {filteredReports.map((r) => {
                const { bg, color } = statusColor(r.status)
                return (
                  <div key={r.report_id} style={{ background: "white", border: `1px solid ${r.status === "Rejected" ? "#ff444433" : "#eee"}`, borderRadius: 10, padding: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <div>
                        <p style={{ margin: 0, fontWeight: "bold", fontSize: 15 }}>{r.plate_number}</p>
                        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#555" }}>{r.maintenance_type}</p>
                        {r.maintenance_location && (
                          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#888" }}>📍 {r.maintenance_location}</p>
                        )}
                        <p style={{ margin: "4px 0 0", fontSize: 12, color: "#aaa" }}>{new Date(r.reported_at).toLocaleString()}</p>
                      </div>
                      <span style={{ padding: "4px 10px", borderRadius: 12, fontSize: 12, background: bg, color, fontWeight: "bold" }}>
                        {r.status}
                      </span>
                    </div>
                    <div style={{ background: "#f9f9f9", borderRadius: 6, padding: "8px 12px", marginBottom: 8, display: "inline-block" }}>
                      <p style={{ margin: 0, fontSize: 11, color: "#888" }}>Amount</p>
                      <p style={{ margin: 0, fontWeight: "bold", color: "#0070f3" }}>₦{r.amount.toLocaleString()}</p>
                    </div>
                    {r.notes && <p style={{ margin: "8px 0 0", fontSize: 13, color: "#555" }}><strong>Notes:</strong> {r.notes}</p>}
                    {r.status === "Rejected" && r.rejection_reason && (
                      <div style={{ marginTop: 10, padding: "8px 12px", background: "#fff5f5", border: "1px solid #ffcccc", borderRadius: 6 }}>
                        <p style={{ margin: 0, fontSize: 13, color: "#ff4444" }}><strong>Rejection reason:</strong> {r.rejection_reason}</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Fuel Expense Tab */}
        {tab === "fuel" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <p style={{ margin: 0, fontWeight: "bold", fontSize: 15 }}>Fuel Expense Log</p>
              <button
                onClick={() => setShowFuelModal(true)}
                disabled={assignedTrucks.length === 0}
                style={{
                  padding: "8px 16px", fontSize: 13, fontWeight: "bold",
                  cursor: assignedTrucks.length === 0 ? "not-allowed" : "pointer",
                  background: assignedTrucks.length === 0 ? "#ccc" : "#0070f3",
                  color: "white", border: "none", borderRadius: 6
                }}
              >
                + Log Fuel Expense
              </button>
            </div>

            {fuelExpenses.length === 0 && <p style={{ color: "#888" }}>No fuel expenses logged yet.</p>}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {fuelExpenses.map((e) => (
                <div key={e.expense_id} style={{ background: "white", border: "1px solid #eee", borderRadius: 10, padding: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: "bold" }}>{e.plate_number}</p>
                      <p style={{ margin: "4px 0 0", fontSize: 12, color: "#aaa" }}>{new Date(e.logged_at).toLocaleString()}</p>
                    </div>
                    <span style={{ padding: "4px 12px", borderRadius: 12, fontSize: 13, background: "#f0f7ff", color: "#0070f3", fontWeight: "bold" }}>
                      {e.litres}L
                    </span>
                  </div>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "#888" }}>Trip: {e.trip_id}</p>
                  {e.notes && <p style={{ margin: "6px 0 0", fontSize: 13, color: "#555" }}>{e.notes}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Log Maintenance Modal */}
      {showLogModal && (
        <div onClick={closeLogModal} style={overlay}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...modal, width: 480 }}>
            <h3 style={{ marginBottom: 20 }}>Log Maintenance</h3>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Truck *</label>
              <select value={logPlate} onChange={(e) => { setLogPlate(e.target.value); setLogError("") }} style={inputStyle}>
                <option value="">Select truck</option>
                {assignedTrucks.map(t => (
                  <option key={t.plate_number} value={t.plate_number}>
                    {t.plate_number}{t.kbnl_truck_no ? ` · #${t.kbnl_truck_no}` : ""} — {t.truck_model}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Maintenance Type *</label>
              <p style={{ margin: "0 0 6px", fontSize: 12, color: "#888" }}>Suggestions — or type your own below</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                {MAINTENANCE_SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => { setLogType(s); setLogTypeCustom(""); setLogError("") }}
                    style={{
                      padding: "4px 12px", borderRadius: 20, fontSize: 12, cursor: "pointer",
                      border: `1px solid ${logType === s ? "#0070f3" : "#ddd"}`,
                      background: logType === s ? "#0070f322" : "white",
                      color: logType === s ? "#0070f3" : "#333",
                      fontWeight: logType === s ? "bold" : "normal"
                    }}
                  >
                    {s}
                  </button>
                ))}
                <button
                  onClick={() => { setLogType("__custom__"); setLogError("") }}
                  style={{
                    padding: "4px 12px", borderRadius: 20, fontSize: 12, cursor: "pointer",
                    border: `1px solid ${logType === "__custom__" ? "#0070f3" : "#ddd"}`,
                    background: logType === "__custom__" ? "#0070f322" : "white",
                    color: logType === "__custom__" ? "#0070f3" : "#333",
                    fontWeight: logType === "__custom__" ? "bold" : "normal"
                  }}
                >
                  Other...
                </button>
              </div>
              {logType === "__custom__" && (
                <input
                  type="text"
                  placeholder="Describe the maintenance type"
                  value={logTypeCustom}
                  onChange={(e) => { setLogTypeCustom(e.target.value); setLogError("") }}
                  style={inputStyle}
                  autoFocus
                />
              )}
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Maintenance Location *</label>
              <input
                type="text"
                placeholder="e.g. Mechanic village, Aba Road"
                value={logLocation}
                onChange={(e) => { setLogLocation(e.target.value); setLogError("") }}
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Amount Spent (₦) *</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="e.g. 25,000"
                value={logAmount}
                onChange={(e) => { setLogAmount(formatAmount(e.target.value)); setLogError("") }}
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={labelStyle}>Notes (optional)</label>
              <textarea
                placeholder="Any additional details..."
                value={logNotes}
                onChange={(e) => setLogNotes(e.target.value)}
                rows={3}
                style={{ ...inputStyle, resize: "none" }}
              />
            </div>

            {logError && <p style={errorStyle}>{logError}</p>}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={closeLogModal} style={cancelBtn}>Cancel</button>
              <button onClick={handleLogReport} disabled={logLoading} style={primaryBtn}>
                {logLoading ? "Logging..." : "Log Report"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Log Fuel Expense Modal */}
      {showFuelModal && (
        <div onClick={closeFuelModal} style={overlay}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...modal, width: 480 }}>
            <h3 style={{ marginBottom: 20 }}>Log Fuel Expense</h3>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Truck *</label>
              <select
                value={fuelPlate}
                onChange={(e) => handleFuelPlateChange(e.target.value)}
                style={inputStyle}
              >
                <option value="">Select truck</option>
                {assignedTrucks.map(t => (
                  <option key={t.plate_number} value={t.plate_number}>
                    {t.plate_number}{t.kbnl_truck_no ? ` · #${t.kbnl_truck_no}` : ""} — ⛽ {t.fuel_balance}L available
                  </option>
                ))}
              </select>
            </div>

            {fuelPlate && (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Trip *</label>
                {fuelTrips.length === 0
                  ? <p style={{ fontSize: 13, color: "#888", marginTop: 4 }}>No completed trips found for this truck.</p>
                  : (
                    <select value={fuelTripId} onChange={(e) => { setFuelTripId(e.target.value); setFuelError("") }} style={inputStyle}>
                      <option value="">Select trip</option>
                      {fuelTrips.map(t => (
                        <option key={t.trip_id} value={t.trip_id}>
                          {new Date(t.created_at).toLocaleDateString()} — {t.material_centre} · {t.product}
                        </option>
                      ))}
                    </select>
                  )
                }
              </div>
            )}

            {fuelTripId && (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Estimated Litres Consumed *</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 120"
                  value={fuelLitres}
                  onChange={(e) => { setFuelLitres(e.target.value); setFuelError("") }}
                  style={inputStyle}
                />
              </div>
            )}

            <div style={{ marginBottom: 24 }}>
              <label style={labelStyle}>Notes (optional)</label>
              <textarea
                placeholder="e.g. Long haul — estimated 400km at 0.3L/km"
                value={fuelNotes}
                onChange={(e) => setFuelNotes(e.target.value)}
                rows={3}
                style={{ ...inputStyle, resize: "none" }}
              />
            </div>

            {fuelError && <p style={errorStyle}>{fuelError}</p>}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={closeFuelModal} style={cancelBtn}>Cancel</button>
              <button onClick={handleLogFuelExpense} disabled={fuelLoading} style={primaryBtn}>
                {fuelLoading ? "Logging..." : "Log Expense"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }
const modal: React.CSSProperties = { background: "white", borderRadius: 12, padding: 32, width: 420, maxWidth: "90vw", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }
const labelStyle: React.CSSProperties = { display: "block", fontWeight: "bold", marginBottom: 6, fontSize: 14 }
const inputStyle: React.CSSProperties = { width: "100%", padding: 10, boxSizing: "border-box", borderRadius: 6, border: "1px solid #ddd", fontSize: 14 }
const errorStyle: React.CSSProperties = { color: "red", fontSize: 13, marginBottom: 12 }
const primaryBtn: React.CSSProperties = { flex: 1, padding: "10px 0", background: "#0070f3", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold" }
const cancelBtn: React.CSSProperties = { flex: 1, padding: "10px 0", background: "white", border: "1px solid #ddd", borderRadius: 6, cursor: "pointer" }