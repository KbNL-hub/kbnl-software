"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { formatAmount, parseAmount } from "@/lib/formatAmount"

type MaintenanceReport = {
  report_id: string
  plate_number: string
  manager_name: string
  maintenance_type: string
  amount: number
  notes: string | null
  status: "Pending" | "Validated" | "Rejected"
  rejection_reason: string | null
  reported_at: string
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
  | { kind: "report"; data: MaintenanceReport }
  | { kind: "procurement"; data: BulkProcurement }

type Truck = {
  plate_number: string
  truck_model: string
}

type DistributionEntry = {
  plate_number: string
  amount: string
}

const statusColor = (status: string) => {
  switch (status) {
    case "Pending": return { bg: "#fff8e1", color: "#f5a623" }
    case "Validated": return { bg: "#00aa0022", color: "#00aa00" }
    case "Rejected": return { bg: "#ff444422", color: "#ff4444" }
    default: return { bg: "#eee", color: "#888" }
  }
}

export default function TruckAdminDashboard() {
  const router = useRouter()
  const [adminId, setAdminId] = useState("")
  const [adminName, setAdminName] = useState("")
  const [reports, setReports] = useState<MaintenanceReport[]>([])
  const [procurements, setProcurements] = useState<BulkProcurement[]>([])
  const [allTrucks, setAllTrucks] = useState<Truck[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [tab, setTab] = useState<"reports" | "procurement">("reports")
  const [filter, setFilter] = useState("All")

  // Validate/Reject
  const [validating, setValidating] = useState<MaintenanceReport | null>(null)
  const [validateLoading, setValidateLoading] = useState(false)
  const [rejecting, setRejecting] = useState<MaintenanceReport | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [rejectError, setRejectError] = useState("")
  const [rejectLoading, setRejectLoading] = useState(false)

  // Bulk procurement
  const [procItem, setProcItem] = useState("")
  const [procTotal, setProcTotal] = useState("")
  const [procNotes, setProcNotes] = useState("")
  const [distributions, setDistributions] = useState<DistributionEntry[]>([])
  const [procError, setProcError] = useState("")
  const [procLoading, setProcLoading] = useState(false)

  const filters = ["All", "Pending", "Validated", "Rejected", "Bulk Procurement"]

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
        .select("role")
        .eq("user_id", user.id)
        .single()

      if (profile?.role !== "TruckAdmin") { router.push("/login"); return }

      const { data: admin } = await supabase
        .from("truck_admins")
        .select("admin_id, full_name")
        .eq("admin_id", user.id)
        .single()

      if (!admin) { router.push("/login"); return }

      setAdminId(admin.admin_id)
      setAdminName(admin.full_name)

      await Promise.all([fetchReports(), fetchProcurements(), fetchTrucks()])
      setLoading(false)
    }
    init()
  }, [])

  useEffect(() => {
    if (!adminId) return
    const interval = setInterval(() => {
      fetchReports()
      fetchProcurements()
    }, 30000)
    return () => clearInterval(interval)
  }, [adminId])

  async function fetchReports() {
    const { data: reportsRaw } = await supabase
      .from("maintenance_reports")
      .select("report_id, plate_number, manager_id, maintenance_type, amount, notes, status, rejection_reason, reported_at")
      .order("reported_at", { ascending: false })

    if (!reportsRaw) return

    const enriched = await Promise.all(
      reportsRaw.map(async (r) => {
        const { data: manager } = await supabase
          .from("maintenance_managers")
          .select("full_name")
          .eq("manager_id", r.manager_id)
          .single()

        return {
          report_id: r.report_id,
          plate_number: r.plate_number,
          manager_name: manager?.full_name ?? "Unknown",
          maintenance_type: r.maintenance_type,
          amount: r.amount,
          notes: r.notes,
          status: r.status,
          rejection_reason: r.rejection_reason,
          reported_at: r.reported_at,
        }
      })
    )

    setReports(enriched)
    setLastUpdated(new Date())
  }

  async function fetchProcurements() {
    const { data: procRaw } = await supabase
      .from("bulk_procurement")
      .select("procurement_id, item_name, total_amount, notes, logged_at")
      .order("logged_at", { ascending: false })

    if (!procRaw) return

    const enriched = await Promise.all(
      procRaw.map(async (p) => {
        const { data: dists } = await supabase
          .from("procurement_distributions")
          .select("plate_number, amount_allocated")
          .eq("procurement_id", p.procurement_id)

        return {
          procurement_id: p.procurement_id,
          item_name: p.item_name,
          total_amount: p.total_amount,
          notes: p.notes,
          logged_at: p.logged_at,
          distributions: dists || [],
        }
      })
    )

    setProcurements(enriched)
  }

  async function fetchTrucks() {
    const { data } = await supabase
      .from("Trucks")
      .select("plate_number, truck_model")
      .order("plate_number", { ascending: true })
    setAllTrucks(data || [])
  }

  async function handleValidate() {
    if (!validating) return
    setValidateLoading(true)
    await supabase
      .from("maintenance_reports")
      .update({ status: "Validated", validated_at: new Date().toISOString(), validated_by: adminId })
      .eq("report_id", validating.report_id)
    setValidateLoading(false)
    setValidating(null)
    fetchReports()
  }

  async function handleReject() {
    if (!rejecting) return
    if (!rejectReason.trim()) return setRejectError("Please provide a reason")
    setRejectLoading(true)
    await supabase
      .from("maintenance_reports")
      .update({ status: "Rejected", rejection_reason: rejectReason.trim() })
      .eq("report_id", rejecting.report_id)
    setRejectLoading(false)
    setRejecting(null)
    setRejectReason("")
    setRejectError("")
    fetchReports()
  }

  function toggleTruckDistribution(plateNumber: string) {
    const exists = distributions.find(d => d.plate_number === plateNumber)
    if (exists) {
      setDistributions(distributions.filter(d => d.plate_number !== plateNumber))
    } else {
      setDistributions([...distributions, { plate_number: plateNumber, amount: "" }])
    }
  }

  function updateDistributionAmount(plateNumber: string, value: string) {
    const formatted = formatAmount(value)
    setDistributions(distributions.map(d =>
      d.plate_number === plateNumber ? { ...d, amount: formatted } : d
    ))
  }

  const distributionTotal = distributions.reduce((sum, d) => sum + parseAmount(d.amount), 0)

  async function handleLogProcurement() {
    if (!procItem.trim()) return setProcError("Enter item name")
    const totalNum = parseAmount(procTotal)
    if (!procTotal || totalNum <= 0) return setProcError("Enter a valid total amount")
    if (distributions.length === 0) return setProcError("Select at least one truck to distribute across")
    const hasEmpty = distributions.some(d => !d.amount || parseAmount(d.amount) <= 0)
    if (hasEmpty) return setProcError("Enter a valid amount for each selected truck")

    setProcLoading(true)

    const { data: procurement, error: procErr } = await supabase
      .from("bulk_procurement")
      .insert([{
        item_name: procItem.trim(),
        total_amount: totalNum,
        notes: procNotes.trim() || null,
        logged_by: adminId,
      }])
      .select()
      .single()

    if (procErr || !procurement) { setProcError("Failed to log procurement"); setProcLoading(false); return }

    const distRows = distributions.map(d => ({
      procurement_id: procurement.procurement_id,
      plate_number: d.plate_number,
      amount_allocated: parseAmount(d.amount),
    }))

    const { error: distErr } = await supabase
      .from("procurement_distributions")
      .insert(distRows)

    setProcLoading(false)
    if (distErr) { setProcError("Procurement saved but distribution failed"); return }

    setProcItem(""); setProcTotal(""); setProcNotes("")
    setDistributions([]); setProcError("")
    await fetchProcurements()
    setTab("reports")
    setFilter("Bulk Procurement")
  }

  // Build combined feed sorted by date
  const feedItems: FeedItem[] = [
    ...reports.map(r => ({ kind: "report" as const, data: r, date: r.reported_at })),
    ...procurements.map(p => ({ kind: "procurement" as const, data: p, date: p.logged_at })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const filteredFeed = filter === "All"
    ? feedItems
    : filter === "Bulk Procurement"
    ? feedItems.filter(f => f.kind === "procurement")
    : feedItems.filter(f => f.kind === "report" && (f.data as MaintenanceReport).status === filter)

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
          <h2 style={{ margin: 0, fontSize: 18 }}>Truck Admin</h2>
          <p style={{ margin: 0, fontSize: 13, color: "#888" }}>{adminName}</p>
        </div>
        <button
          onClick={async () => { await supabase.auth.signOut(); router.push("/login") }}
          style={{ padding: "8px 20px", background: "#ff4444", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14 }}
        >
          Logout
        </button>
      </div>

      <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          {(["reports", "procurement"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "8px 20px", borderRadius: 20, fontSize: 13,
                cursor: "pointer", border: "1px solid #ddd",
                background: tab === t ? "#0070f3" : "white",
                color: tab === t ? "white" : "#333",
                fontWeight: tab === t ? "bold" : "normal",
              }}
            >
              {t === "reports" ? "Maintenance Reports" : "Log Bulk Procurement"}
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
              <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: "#888" }}>
                {lastUpdated && `Updated: ${lastUpdated.toLocaleTimeString()}`}
                <button onClick={() => { fetchReports(); fetchProcurements() }} style={{ padding: "4px 12px", fontSize: 12, cursor: "pointer", borderRadius: 4, border: "1px solid #ddd", background: "white" }}>
                  Refresh
                </button>
              </div>
            </div>

            {filteredFeed.length === 0 && <p style={{ color: "#888" }}>No {filter === "All" ? "" : filter.toLowerCase()} entries.</p>}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {filteredFeed.map(item => {
                if (item.kind === "procurement") {
                  const p = item.data as BulkProcurement
                  return (
                    <div key={p.procurement_id} style={{ background: "white", border: "1px solid #7c3aed33", borderRadius: 10, padding: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                        <div>
                          <p style={{ margin: 0, fontWeight: "bold", fontSize: 15 }}>{p.item_name}</p>
                          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#aaa" }}>{new Date(p.logged_at).toLocaleString()}</p>
                        </div>
                        <span style={{ padding: "4px 10px", borderRadius: 12, fontSize: 12, background: "#7c3aed22", color: "#7c3aed", fontWeight: "bold" }}>
                          Bulk Procurement
                        </span>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                        <div style={{ background: "#f9f9f9", borderRadius: 6, padding: "8px 12px" }}>
                          <p style={{ margin: 0, fontSize: 11, color: "#888" }}>Total Amount</p>
                          <p style={{ margin: 0, fontWeight: "bold", color: "#0070f3" }}>₦{p.total_amount.toLocaleString()}</p>
                        </div>
                        <div style={{ background: "#f9f9f9", borderRadius: 6, padding: "8px 12px" }}>
                          <p style={{ margin: 0, fontSize: 11, color: "#888" }}>Trucks</p>
                          <p style={{ margin: 0, fontWeight: "bold" }}>{p.distributions.length}</p>
                        </div>
                      </div>

                      {p.distributions.length > 0 && (
                        <div style={{ marginBottom: p.notes ? 12 : 0 }}>
                          <p style={{ margin: "0 0 6px", fontSize: 12, color: "#888", fontWeight: "bold" }}>Distribution:</p>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {p.distributions.map(d => (
                              <span key={d.plate_number} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 20, background: "#f0f7ff", border: "1px solid #0070f322", color: "#0070f3" }}>
                                {d.plate_number} — ₦{d.amount_allocated.toLocaleString()}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {p.notes && (
                        <p style={{ margin: "10px 0 0", fontSize: 13, color: "#555" }}>
                          <strong>Notes:</strong> {p.notes}
                        </p>
                      )}
                    </div>
                  )
                }

                const r = item.data as MaintenanceReport
                const { bg, color } = statusColor(r.status)
                return (
                  <div key={r.report_id} style={{ background: "white", border: `1px solid ${r.status === "Rejected" ? "#ff444433" : "#eee"}`, borderRadius: 10, padding: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <div>
                        <p style={{ margin: 0, fontWeight: "bold", fontSize: 15 }}>{r.plate_number}</p>
                        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#555" }}>{r.maintenance_type}</p>
                        <p style={{ margin: "4px 0 0", fontSize: 12, color: "#888" }}>Logged by {r.manager_name}</p>
                        <p style={{ margin: "4px 0 0", fontSize: 12, color: "#aaa" }}>{new Date(r.reported_at).toLocaleString()}</p>
                      </div>
                      <span style={{ padding: "4px 10px", borderRadius: 12, fontSize: 12, background: bg, color, fontWeight: "bold" }}>
                        {r.status}
                      </span>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                      <div style={{ background: "#f9f9f9", borderRadius: 6, padding: "8px 12px" }}>
                        <p style={{ margin: 0, fontSize: 11, color: "#888" }}>Amount</p>
                        <p style={{ margin: 0, fontWeight: "bold", color: "#0070f3" }}>₦{r.amount.toLocaleString()}</p>
                      </div>
                    </div>

                    {r.notes && <p style={{ fontSize: 13, color: "#555", marginBottom: 8 }}><strong>Notes:</strong> {r.notes}</p>}

                    {r.status === "Rejected" && r.rejection_reason && (
                      <div style={{ padding: "8px 12px", background: "#fff5f5", border: "1px solid #ffcccc", borderRadius: 6, marginBottom: 12 }}>
                        <p style={{ margin: 0, fontSize: 13, color: "#ff4444" }}><strong>Rejection reason:</strong> {r.rejection_reason}</p>
                      </div>
                    )}

                    {r.status === "Pending" && (
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button
                          onClick={() => setValidating(r)}
                          style={{ flex: 1, padding: "8px 0", background: "#00aa00", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold", fontSize: 13 }}
                        >
                          Validate
                        </button>
                        <button
                          onClick={() => { setRejecting(r); setRejectReason(""); setRejectError("") }}
                          style={{ flex: 1, padding: "8px 0", background: "white", color: "#ff4444", border: "1px solid #ff4444", borderRadius: 6, cursor: "pointer", fontWeight: "bold", fontSize: 13 }}
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Procurement Tab */}
        {tab === "procurement" && (
          <div style={{ maxWidth: 600 }}>
            <h3 style={{ marginBottom: 20 }}>Log Bulk Procurement</h3>

            <div style={{ marginBottom: 16 }}>
              <label style={label}>Item Name *</label>
              <input type="text" placeholder="e.g. Grease, Engine oil, Brake fluid" value={procItem} onChange={(e) => { setProcItem(e.target.value); setProcError("") }} style={inputStyle} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={label}>Total Amount (₦) *</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="e.g. 150,000"
                value={procTotal}
                onChange={(e) => { setProcTotal(formatAmount(e.target.value)); setProcError("") }}
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={label}>Notes (optional)</label>
              <textarea placeholder="Any additional details..." value={procNotes} onChange={(e) => setProcNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: "none" }} />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={label}>Distribute Across Trucks *</label>
              <p style={{ margin: "0 0 10px", fontSize: 12, color: "#888" }}>Select trucks and enter the amount allocated to each</p>

              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 300, overflowY: "auto" }}>
                {allTrucks.map(t => {
                  const dist = distributions.find(d => d.plate_number === t.plate_number)
                  const isSelected = !!dist
                  return (
                    <div key={t.plate_number} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", border: `1px solid ${isSelected ? "#0070f3" : "#eee"}`, borderRadius: 6, background: isSelected ? "#f0f7ff" : "white" }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => { toggleTruckDistribution(t.plate_number); setProcError("") }}
                        style={{ cursor: "pointer" }}
                      />
                      <span style={{ flex: 1, fontSize: 13, fontWeight: "bold" }}>{t.plate_number}</span>
                      <span style={{ fontSize: 12, color: "#888", marginRight: 8 }}>{t.truck_model}</span>
                      {isSelected && (
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="Amount"
                          value={dist.amount}
                          onChange={(e) => { updateDistributionAmount(t.plate_number, e.target.value); setProcError("") }}
                          style={{ width: 110, padding: "4px 8px", borderRadius: 4, border: "1px solid #ddd", fontSize: 13 }}
                        />
                      )}
                    </div>
                  )
                })}
              </div>

              {distributions.length > 0 && (
                <div style={{ marginTop: 12, padding: "8px 12px", background: "#f9f9f9", borderRadius: 6 }}>
                  <p style={{ margin: 0, fontSize: 13 }}>
                    Total distributed: <strong style={{ color: distributionTotal === parseAmount(procTotal) ? "#00aa00" : "#f5a623" }}>
                      ₦{distributionTotal.toLocaleString()}
                    </strong>
                    {procTotal && ` / ₦${parseAmount(procTotal).toLocaleString()}`}
                    {distributionTotal !== parseAmount(procTotal) && procTotal && (
                      <span style={{ color: "#f5a623", marginLeft: 8, fontSize: 12 }}>⚠️ Doesn't match total</span>
                    )}
                  </p>
                </div>
              )}
            </div>

            {procError && <p style={errorStyle}>{procError}</p>}

            <button
              onClick={handleLogProcurement}
              disabled={procLoading}
              style={{ width: "100%", padding: "12px 0", background: "#0070f3", color: "white", border: "none", borderRadius: 6, cursor: procLoading ? "not-allowed" : "pointer", fontWeight: "bold", fontSize: 15 }}
            >
              {procLoading ? "Logging..." : "Log Procurement"}
            </button>
          </div>
        )}
      </div>

      {/* Validate Modal */}
      {validating && (
        <div style={overlay}>
          <div style={modal}>
            <h3 style={{ marginBottom: 12 }}>Validate Report?</h3>
            <div style={{ background: "#f9f9f9", borderRadius: 8, padding: 16, marginBottom: 24 }}>
              <p style={{ margin: "0 0 8px" }}><strong>Truck:</strong> {validating.plate_number}</p>
              <p style={{ margin: "0 0 8px" }}><strong>Type:</strong> {validating.maintenance_type}</p>
              <p style={{ margin: "0 0 8px" }}><strong>Manager:</strong> {validating.manager_name}</p>
              <p style={{ margin: 0 }}><strong>Amount:</strong> <span style={{ color: "#0070f3", fontWeight: "bold" }}>₦{validating.amount.toLocaleString()}</span></p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setValidating(null)} style={cancelBtn}>Cancel</button>
              <button onClick={handleValidate} disabled={validateLoading} style={{ ...primaryBtn, background: "#00aa00" }}>
                {validateLoading ? "Validating..." : "Yes, Validate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejecting && (
        <div style={overlay}>
          <div style={modal}>
            <h3 style={{ marginBottom: 12 }}>Reject Report</h3>
            <p style={{ color: "#555", marginBottom: 16 }}>
              <strong>{rejecting.plate_number}</strong> — {rejecting.maintenance_type}
            </p>
            <label style={{ display: "block", fontWeight: "bold", marginBottom: 6, fontSize: 14 }}>Reason *</label>
            <textarea
              value={rejectReason}
              onChange={(e) => { setRejectReason(e.target.value); setRejectError("") }}
              placeholder="e.g. Amount seems incorrect, please resubmit"
              rows={3}
              style={{ width: "100%", padding: 10, boxSizing: "border-box", borderRadius: 6, border: "1px solid #ddd", fontSize: 14, resize: "none", marginBottom: 8 }}
            />
            {rejectError && <p style={{ color: "red", fontSize: 13, marginBottom: 8 }}>{rejectError}</p>}
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button onClick={() => setRejecting(null)} style={cancelBtn}>Cancel</button>
              <button onClick={handleReject} disabled={rejectLoading} style={{ ...primaryBtn, background: "#ff4444" }}>
                {rejectLoading ? "Rejecting..." : "Confirm Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }
const modal: React.CSSProperties = { background: "white", borderRadius: 12, padding: 32, width: 420, maxWidth: "90vw", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }
const label: React.CSSProperties = { display: "block", fontWeight: "bold", marginBottom: 6, fontSize: 14 }
const inputStyle: React.CSSProperties = { width: "100%", padding: 10, boxSizing: "border-box", borderRadius: 6, border: "1px solid #ddd", fontSize: 14 }
const errorStyle: React.CSSProperties = { color: "red", fontSize: 13, marginBottom: 12 }
const primaryBtn: React.CSSProperties = { flex: 1, padding: "10px 0", background: "#0070f3", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold" }
const cancelBtn: React.CSSProperties = { flex: 1, padding: "10px 0", background: "white", border: "1px solid #ddd", borderRadius: 6, cursor: "pointer" }