"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

type AssignedTruck = {
  plate_number: string
  truck_model: string
  status: string
}

type MaintenanceReport = {
  report_id: string
  plate_number: string
  maintenance_type: string
  amount: number
  notes: string | null
  status: "Pending" | "Validated" | "Rejected"
  rejection_reason: string | null
  reported_at: string
}

const MAINTENANCE_SUGGESTIONS = [
  "Oil service",
  "Tyre change",
  "Brake repair",
  "Electrical work",
  "Engine repair",
  "Suspension repair",
  "Body work",
  "Replacement of parts",
  "Coolant/radiator service",
  "Battery replacement",
  "Wheel alignment",
  "Exhaust repair",
  "General inspection",
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
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [filter, setFilter] = useState("All")

  // Log report form
  const [showLogModal, setShowLogModal] = useState(false)
  const [logPlate, setLogPlate] = useState("")
  const [logType, setLogType] = useState("")
  const [logTypeCustom, setLogTypeCustom] = useState("")
  const [logAmount, setLogAmount] = useState("")
  const [logNotes, setLogNotes] = useState("")
  const [logError, setLogError] = useState("")
  const [logLoading, setLogLoading] = useState(false)

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
        .from("Profiles")
        .select("role, full_name")
        .eq("user_id", user.id)
        .single()

      if (profile?.role !== "MaintenanceManager") { router.push("/login"); return }

      const { data: manager } = await supabase
        .from("maintenance_managers")
        .select("manager_id, full_name")
        .eq("manager_id", user.id)
        .single()

      if (!manager) { router.push("/login"); return }

      setManagerId(manager.manager_id)
      setManagerName(manager.full_name)

      await fetchTrucks(manager.manager_id)
      await fetchReports(manager.manager_id)
      setLoading(false)
    }
    init()
  }, [])

  useEffect(() => {
    if (!managerId) return
    const interval = setInterval(() => fetchReports(managerId), 30000)
    return () => clearInterval(interval)
  }, [managerId])

  async function fetchTrucks(mId: string) {
    const { data: assignments } = await supabase
      .from("maintenance_assignments")
      .select("plate_number")
      .eq("manager_id", mId)

    if (!assignments || assignments.length === 0) { setAssignedTrucks([]); return }

    const plates = assignments.map(a => a.plate_number)
    const { data: trucks } = await supabase
      .from("Trucks")
      .select("plate_number, truck_model, status")
      .in("plate_number", plates)
      .order("plate_number", { ascending: true })

    setAssignedTrucks(trucks || [])
  }

  async function fetchReports(mId: string) {
    const { data } = await supabase
      .from("maintenance_reports")
      .select("report_id, plate_number, maintenance_type, amount, notes, status, rejection_reason, reported_at")
      .eq("manager_id", mId)
      .order("reported_at", { ascending: false })

    setReports(data || [])
    setLastUpdated(new Date())
  }

  async function handleLogReport() {
    const finalType = logType === "__custom__" ? logTypeCustom.trim() : logType
    if (!logPlate) return setLogError("Select a truck")
    if (!finalType) return setLogError("Enter a maintenance type")
    if (!logAmount || isNaN(Number(logAmount)) || Number(logAmount) <= 0) return setLogError("Enter a valid amount")

    setLogLoading(true)
    const { error } = await supabase
      .from("maintenance_reports")
      .insert([{
        manager_id: managerId,
        plate_number: logPlate,
        maintenance_type: finalType,
        amount: Number(logAmount),
        notes: logNotes.trim() || null,
      }])

    setLogLoading(false)
    if (error) { setLogError("Failed to log report"); return }

    setShowLogModal(false)
    setLogPlate(""); setLogType(""); setLogTypeCustom("")
    setLogAmount(""); setLogNotes(""); setLogError("")
    fetchReports(managerId)
  }

  function closeLogModal() {
    setShowLogModal(false)
    setLogPlate(""); setLogType(""); setLogTypeCustom("")
    setLogAmount(""); setLogNotes(""); setLogError("")
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
          <h2 style={{ margin: 0, fontSize: 18 }}>Maintenance Manager</h2>
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
        {/* Assigned Trucks Summary */}
        <div style={{ background: "white", border: "1px solid #eee", borderRadius: 12, padding: 20, marginBottom: 24, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
          <p style={{ margin: "0 0 12px", fontWeight: "bold", fontSize: 15 }}>
            My Trucks ({assignedTrucks.length})
          </p>
          {assignedTrucks.length === 0 && <p style={{ color: "#888", fontSize: 13, margin: 0 }}>No trucks assigned yet.</p>}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {assignedTrucks.map((t) => (
              <span key={t.plate_number} style={{
                padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: "bold",
                background: "#f0f7ff", border: "1px solid #0070f322", color: "#0070f3"
              }}>
                {t.plate_number}
              </span>
            ))}
          </div>
        </div>

        {/* Reports header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {filters.map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: "6px 14px", borderRadius: 20, fontSize: 13,
                  cursor: "pointer", border: "1px solid #ddd",
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
                padding: "8px 16px", background: assignedTrucks.length === 0 ? "#ccc" : "#0070f3",
                color: "white", border: "none", borderRadius: 6,
                cursor: assignedTrucks.length === 0 ? "not-allowed" : "pointer",
                fontWeight: "bold", fontSize: 13
              }}
            >
              + Log Maintenance
            </button>
          </div>
        </div>

        {filteredReports.length === 0 && (
          <p style={{ color: "#888" }}>No {filter === "All" ? "" : filter.toLowerCase()} reports.</p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filteredReports.map((r) => {
            const { bg, color } = statusColor(r.status)
            return (
              <div key={r.report_id} style={{ background: "white", border: `1px solid ${r.status === "Rejected" ? "#ff444433" : "#eee"}`, borderRadius: 10, padding: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: "bold", fontSize: 15 }}>{r.plate_number}</p>
                    <p style={{ margin: "4px 0 0", fontSize: 13, color: "#555" }}>{r.maintenance_type}</p>
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: "#aaa" }}>{new Date(r.reported_at).toLocaleString()}</p>
                  </div>
                  <span style={{ padding: "4px 10px", borderRadius: 12, fontSize: 12, background: bg, color, fontWeight: "bold" }}>
                    {r.status}
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: r.notes || r.rejection_reason ? 12 : 0 }}>
                  <div style={{ background: "#f9f9f9", borderRadius: 6, padding: "8px 12px" }}>
                    <p style={{ margin: 0, fontSize: 11, color: "#888" }}>Amount</p>
                    <p style={{ margin: 0, fontWeight: "bold", color: "#0070f3" }}>₦{r.amount.toLocaleString()}</p>
                  </div>
                </div>
                {r.notes && (
                  <p style={{ margin: "8px 0 0", fontSize: 13, color: "#555" }}>
                    <strong>Notes:</strong> {r.notes}
                  </p>
                )}
                {r.status === "Rejected" && r.rejection_reason && (
                  <div style={{ marginTop: 10, padding: "8px 12px", background: "#fff5f5", border: "1px solid #ffcccc", borderRadius: 6 }}>
                    <p style={{ margin: 0, fontSize: 13, color: "#ff4444" }}>
                      <strong>Rejection reason:</strong> {r.rejection_reason}
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Log Maintenance Modal */}
      {showLogModal && (
        <div onClick={closeLogModal} style={overlay}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...modal, width: 480 }}>
            <h3 style={{ marginBottom: 20 }}>Log Maintenance</h3>

            <div style={{ marginBottom: 16 }}>
              <label style={label}>Truck *</label>
              <select value={logPlate} onChange={(e) => { setLogPlate(e.target.value); setLogError("") }} style={inputStyle}>
                <option value="">Select truck</option>
                {assignedTrucks.map(t => (
                  <option key={t.plate_number} value={t.plate_number}>{t.plate_number} — {t.truck_model}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={label}>Maintenance Type *</label>
              <p style={{ margin: "0 0 6px", fontSize: 12, color: "#888" }}>Suggestions — you can also type your own below</p>
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
              <label style={label}>Amount Spent (₦) *</label>
              <input
                type="number"
                placeholder="e.g. 25000"
                value={logAmount}
                onChange={(e) => { setLogAmount(e.target.value); setLogError("") }}
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={label}>Notes (optional)</label>
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
    </div>
  )
}

const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }
const modal: React.CSSProperties = { background: "white", borderRadius: 12, padding: 32, width: 420, maxWidth: "90vw", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }
const label: React.CSSProperties = { display: "block", fontWeight: "bold", marginBottom: 6, fontSize: 14 }
const inputStyle: React.CSSProperties = { width: "100%", padding: 10, boxSizing: "border-box", borderRadius: 6, border: "1px solid #ddd", fontSize: 14 }
const errorStyle: React.CSSProperties = { color: "red", fontSize: 13, marginBottom: 12 }
const primaryBtn: React.CSSProperties = { flex: 1, padding: "10px 0", background: "#0070f3", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold" }
const cancelBtn: React.CSSProperties = { flex: 1, padding: "10px 0", background: "white", border: "1px solid #ddd", borderRadius: 6, cursor: "pointer" }