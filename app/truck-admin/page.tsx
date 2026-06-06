"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { formatAmount, parseAmount } from "@/lib/formatAmount"
import { useBreakpoint } from "@/app/hooks/useBreakpoint"

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

const statusColor = (status: string) => {
  switch (status) {
    case "Pending": return { bg: "#fff8e1", color: "#f5a623" }
    case "Validated": return { bg: "#00aa0022", color: "#00aa00" }
    case "Rejected": return { bg: "#ff444422", color: "#ff4444" }
    default: return { bg: "#eee", color: "#888" }
  }
}

const atfStatusColor = (status: string) => {
  switch (status) {
    case "Pending": return { bg: "#fff8e1", color: "#f5a623" }
    case "Authorised": return { bg: "#0070f322", color: "#0070f3" }
    case "Dispensed": return { bg: "#7c3aed22", color: "#7c3aed" }
    case "Confirmed": return { bg: "#00aa0022", color: "#00aa00" }
    case "Invalidated": return { bg: "#ff444422", color: "#ff4444" }
    default: return { bg: "#eee", color: "#888" }
  }
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

  const [adminId, setAdminId] = useState("")
  const [adminName, setAdminName] = useState("")
  const [reports, setReports] = useState<MaintenanceReport[]>([])
  const [procurements, setProcurements] = useState<BulkProcurement[]>([])
  const [maintenanceBalance, setMaintenanceBalance] = useState<number | null>(null)
  const [atfs, setAtfs] = useState<ATF[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [tab, setTab] = useState<"reports" | "procurement" | "balance" | "atf">("reports")
  const [filter, setFilter] = useState("All")
  const [atfFilter, setAtfFilter] = useState("All")

  // Validate / Reject maintenance
  const [validating, setValidating] = useState<MaintenanceReport | null>(null)
  const [validateLoading, setValidateLoading] = useState(false)
  const [rejecting, setRejecting] = useState<MaintenanceReport | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [rejectError, setRejectError] = useState("")
  const [rejectLoading, setRejectLoading] = useState(false)

  // ATF authorise
  const [authorisingATF, setAuthorisingATF] = useState<ATF | null>(null)
  const [authoriseLoading, setAuthoriseLoading] = useState(false)

  // Bulk procurement
  const [procItem, setProcItem] = useState("")
  const [procTotal, setProcTotal] = useState("")
  const [procNotes, setProcNotes] = useState("")
  const [procError, setProcError] = useState("")
  const [procLoading, setProcLoading] = useState(false)

  // Balance deposit
  const [depositAmount, setDepositAmount] = useState("")
  const [depositNote, setDepositNote] = useState("")
  const [depositError, setDepositError] = useState("")
  const [depositLoading, setDepositLoading] = useState(false)

  const maintenanceFilters = ["All", "Pending", "Validated", "Rejected", "Bulk Procurement"]
  const atfFilters = ["All", "Pending", "Authorised", "Dispensed", "Confirmed", "Invalidated"]

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

      const { data: profile } = await supabase.from("Profiles").select("role").eq("user_id", user.id).single()
      if (profile?.role !== "TruckAdmin") { router.push("/login"); return }

      const { data: admin } = await supabase.from("truck_admins").select("admin_id, full_name").eq("admin_id", user.id).single()
      if (!admin) { router.push("/login"); return }

      setAdminId(admin.admin_id)
      setAdminName(admin.full_name)

      await Promise.all([fetchReports(), fetchProcurements(), fetchMaintenanceBalance(), fetchATFs()])
      setLoading(false)
    }
    init()
  }, [])

  useEffect(() => {
    if (!adminId) return
    const interval = setInterval(() => {
      fetchReports(); fetchProcurements(); fetchMaintenanceBalance(); fetchATFs()
    }, 30000)
    return () => clearInterval(interval)
  }, [adminId])

  async function fetchMaintenanceBalance() {
    const { data } = await supabase.from("maintenance_balance").select("current_balance").eq("id", 1).single()
    if (data) setMaintenanceBalance(data.current_balance)
  }

  async function fetchReports() {
    const { data: raw } = await supabase
      .from("maintenance_reports")
      .select("report_id, plate_number, manager_id, maintenance_type, maintenance_location, amount, notes, status, rejection_reason, reported_at")
      .order("reported_at", { ascending: false })
    if (!raw) return

    const enriched = await Promise.all(raw.map(async r => {
      const { data: manager } = await supabase.from("truck_officers").select("full_name").eq("manager_id", r.manager_id).single()
      return { ...r, manager_name: manager?.full_name ?? "Unknown", maintenance_location: r.maintenance_location ?? null }
    }))
    setReports(enriched)
    setLastUpdated(new Date())
  }

  async function fetchProcurements() {
    const { data: raw } = await supabase.from("bulk_procurement").select("procurement_id, item_name, total_amount, notes, logged_at").order("logged_at", { ascending: false })
    if (!raw) return
    const enriched = await Promise.all(raw.map(async p => {
      const { data: dists } = await supabase.from("procurement_distributions").select("plate_number, amount_allocated").eq("procurement_id", p.procurement_id)
      return { ...p, distributions: dists || [] }
    }))
    setProcurements(enriched)
  }

  async function fetchATFs() {
    const { data: raw } = await supabase
      .from("fuel_requests")
      .select("request_id, atf_code, plate_number, driver_id, company_id, litres, atf_status, requested_at, rate_per_litre, total_amount, initiated_by")
      .order("requested_at", { ascending: false })
    if (!raw) return

    const enriched = await Promise.all(raw.map(async r => {
      const { data: driver } = await supabase.from("Drivers").select("full_name").eq("driver_id", r.driver_id).single()
      const { data: officer } = await supabase.from("truck_officers").select("full_name").eq("manager_id", r.initiated_by).single()
      const { data: company } = await supabase.from("fuel_companies").select("company_name").eq("company_id", r.company_id).single()
      return {
        ...r,
        driver_name: driver?.full_name ?? "Unknown",
        officer_name: officer?.full_name ?? "Unknown",
        company_name: company?.company_name ?? "Unknown",
      }
    }))
    setAtfs(enriched)
  }

  async function handleValidate() {
    if (!validating) return
    setValidateLoading(true)
    await supabase.from("maintenance_reports").update({ status: "Validated", validated_at: new Date().toISOString(), validated_by: adminId }).eq("report_id", validating.report_id)
    const newBalance = Math.max(0, (maintenanceBalance ?? 0) - validating.amount)
    await supabase.from("maintenance_balance").update({ current_balance: newBalance, updated_at: new Date().toISOString() }).eq("id", 1)
    setMaintenanceBalance(newBalance)
    setValidateLoading(false)
    setValidating(null)
    fetchReports()
  }

  async function handleReject() {
    if (!rejecting) return
    if (!rejectReason.trim()) return setRejectError("Please provide a reason")
    setRejectLoading(true)
    await supabase.from("maintenance_reports").update({ status: "Rejected", rejection_reason: rejectReason.trim() }).eq("report_id", rejecting.report_id)
    setRejectLoading(false); setRejecting(null); setRejectReason(""); setRejectError("")
    fetchReports()
  }

  async function handleAuthoriseATF() {
    if (!authorisingATF) return
    setAuthoriseLoading(true)

    // Generate unique ATF code
    let code = generateATFCode()
    let attempts = 0
    while (attempts < 10) {
      const { data: existing } = await supabase.from("fuel_requests").select("request_id").eq("atf_code", code).single()
      if (!existing) break
      code = generateATFCode()
      attempts++
    }

    const { error } = await supabase
      .from("fuel_requests")
      .update({ atf_status: "Authorised", atf_code: code, authorised_by: adminId })
      .eq("request_id", authorisingATF.request_id)

    setAuthoriseLoading(false)
    if (error) return
    setAuthorisingATF(null)
    fetchATFs()
  }

  async function handleDeposit() {
    const amount = parseAmount(depositAmount)
    if (!depositAmount || amount <= 0) return setDepositError("Enter a valid amount")
    setDepositLoading(true)
    const { error } = await supabase.from("maintenance_deposits").insert([{ amount, note: depositNote.trim() || null, deposited_by: adminId }])
    if (error) { setDepositError("Failed to log deposit"); setDepositLoading(false); return }
    const newBalance = (maintenanceBalance ?? 0) + amount
    await supabase.from("maintenance_balance").update({ current_balance: newBalance, updated_at: new Date().toISOString() }).eq("id", 1)
    setMaintenanceBalance(newBalance)
    setDepositLoading(false); setDepositAmount(""); setDepositNote(""); setDepositError("")
  }

  async function handleLogProcurement() {
    if (!procItem.trim()) return setProcError("Enter item name")
    const totalNum = parseAmount(procTotal)
    if (!procTotal || totalNum <= 0) return setProcError("Enter a valid total amount")
    setProcLoading(true)
    const { data: procurement, error } = await supabase.from("bulk_procurement").insert([{ item_name: procItem.trim(), total_amount: totalNum, notes: procNotes.trim() || null, logged_by: adminId }]).select().single()
    setProcLoading(false)
    if (error || !procurement) { setProcError("Failed to log procurement"); return }
    
    // Deduct from maintenance balance
    const newBalance = Math.max(0, (maintenanceBalance ?? 0) - totalNum)
    await supabase.from("maintenance_balance").update({ current_balance: newBalance, updated_at: new Date().toISOString() }).eq("id", 1)
    setMaintenanceBalance(newBalance)
    
    setProcItem(""); setProcTotal(""); setProcNotes(""); setProcError("")
    await fetchProcurements()
    setTab("reports"); setFilter("Bulk Procurement")
  }

  const feedItems: FeedItem[] = [
    ...reports.map(r => ({ kind: "report" as const, data: r, date: r.reported_at })),
    ...procurements.map(p => ({ kind: "procurement" as const, data: p, date: p.logged_at })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const filteredFeed = filter === "All" ? feedItems
    : filter === "Bulk Procurement" ? feedItems.filter(f => f.kind === "procurement")
    : feedItems.filter(f => f.kind === "report" && (f.data as MaintenanceReport).status === filter)

  const filteredATFs = atfFilter === "All" ? atfs : atfs.filter(a => a.atf_status === atfFilter)

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "12px 14px", boxSizing: "border-box",
    borderRadius: 8, border: "1.5px solid #ccc",
    fontSize: 15, background: "white", color: "#171717", minHeight: 48,
  }

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "white" }}>
      <p style={{ color: "#888" }}>Loading...</p>
    </div>
  )

  return (
    <div style={{ minHeight: "100vh", background: "#f9f9f9", fontFamily: "Arial" }}>

      {/* Header */}
      <div style={{ background: "white", borderBottom: "1px solid #eee", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <p style={{ margin: 0, fontSize: 12, color: "#888" }}>Truck Admin</p>
          <p style={{ margin: 0, fontWeight: "bold", fontSize: 16, color: "#171717" }}>{adminName}</p>
        </div>
        <button onClick={async () => { await supabase.auth.signOut(); router.push("/login") }} style={{ padding: "8px 20px", background: "#ff4444", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14 }}>
          Logout
        </button>
      </div>

      <div style={{ padding: isMobile ? 16 : 24, maxWidth: 900, margin: "0 auto" }}>

        {/* Balance Card */}
        <div style={{ background: "white", border: "1px solid #eee", borderRadius: 12, padding: 20, marginBottom: 24, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
          <p style={{ margin: "0 0 4px", fontSize: 13, color: "#888" }}>Maintenance Balance</p>
          <p style={{ margin: 0, fontSize: 36, fontWeight: "bold", color: "#0070f3" }}>
            ₦{maintenanceBalance !== null ? maintenanceBalance.toLocaleString() : "—"}
          </p>
        </div>

        {/* Section Tabs — distinct style */}
        <div style={{ marginBottom: 8 }}>
          <p style={{ margin: "0 0 8px", fontSize: 11, color: "#aaa", textTransform: "uppercase", letterSpacing: 1 }}>Section</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              { key: "reports", label: "Maintenance" },
              { key: "atf", label: "ATF" },
              { key: "procurement", label: "Procurement" },
              { key: "balance", label: "Top Up" },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key as any)} style={{
                padding: "8px 18px", borderRadius: 6, fontSize: 13, cursor: "pointer",
                border: `2px solid ${tab === t.key ? "#171717" : "#ddd"}`,
                background: tab === t.key ? "#171717" : "white",
                color: tab === t.key ? "white" : "#555",
                fontWeight: tab === t.key ? "bold" : "normal",
              }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ height: 1, background: "#eee", marginBottom: 20 }} />

        {/* Reports Tab */}
        {tab === "reports" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <p style={{ margin: "0 6px 0 0", fontSize: 12, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.5 }}>Filter</p>
                {maintenanceFilters.map(f => (
                  <button key={f} onClick={() => setFilter(f)} style={{
                    padding: "5px 12px", borderRadius: 20, fontSize: 12, cursor: "pointer",
                    border: "1px solid #ddd",
                    background: filter === f ? "#0070f3" : "white",
                    color: filter === f ? "white" : "#555",
                    fontWeight: filter === f ? "bold" : "normal"
                  }}>{f}</button>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {lastUpdated && <span style={{ fontSize: 11, color: "#aaa" }}>{lastUpdated.toLocaleTimeString()}</span>}
                <button onClick={() => { fetchReports(); fetchProcurements() }} style={{ padding: "5px 10px", fontSize: 12, cursor: "pointer", borderRadius: 4, border: "1px solid #ddd", background: "white" }}>↻</button>
              </div>
            </div>

            {filteredFeed.length === 0 && <p style={{ color: "#888" }}>No entries.</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {filteredFeed.map(item => {
                if (item.kind === "procurement") {
                  const p = item.data as BulkProcurement
                  return (
                    <div key={p.procurement_id} style={{ background: "white", border: "1px solid #7c3aed33", borderRadius: 10, padding: 20 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                        <div>
                          <p style={{ margin: 0, fontWeight: "bold", fontSize: 15, color: "#171717" }}>{p.item_name}</p>
                          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#aaa" }}>{new Date(p.logged_at).toLocaleString()}</p>
                        </div>
                        <span style={{ padding: "4px 10px", borderRadius: 12, fontSize: 12, background: "#7c3aed22", color: "#7c3aed", fontWeight: "bold" }}>Bulk Procurement</span>
                      </div>
                      <div style={{ background: "#f9f9f9", borderRadius: 6, padding: "8px 12px", display: "inline-block" }}>
                        <p style={{ margin: 0, fontSize: 11, color: "#888" }}>Total Amount</p>
                        <p style={{ margin: 0, fontWeight: "bold", color: "#0070f3" }}>₦{p.total_amount.toLocaleString()}</p>
                      </div>
                      {p.notes && <p style={{ margin: "10px 0 0", fontSize: 13, color: "#555" }}><strong>Notes:</strong> {p.notes}</p>}
                    </div>
                  )
                }
                const r = item.data as MaintenanceReport
                const { bg, color } = statusColor(r.status)
                return (
                  <div key={r.report_id} style={{ background: "white", border: `1px solid ${r.status === "Rejected" ? "#ff444433" : "#eee"}`, borderRadius: 10, padding: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <div>
                        <p style={{ margin: 0, fontWeight: "bold", fontSize: 15, color: "#171717" }}>{r.plate_number}</p>
                        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#555" }}>{r.maintenance_type}</p>
                        {r.maintenance_location && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#888" }}>📍 {r.maintenance_location}</p>}
                        <p style={{ margin: "4px 0 0", fontSize: 12, color: "#888" }}>By {r.manager_name}</p>
                        <p style={{ margin: "4px 0 0", fontSize: 12, color: "#aaa" }}>{new Date(r.reported_at).toLocaleString()}</p>
                      </div>
                      <span style={{ padding: "4px 10px", borderRadius: 12, fontSize: 12, background: bg, color, fontWeight: "bold", whiteSpace: "nowrap" }}>{r.status}</span>
                    </div>
                    <div style={{ background: "#f9f9f9", borderRadius: 6, padding: "8px 12px", display: "inline-block", marginBottom: 8 }}>
                      <p style={{ margin: 0, fontSize: 11, color: "#888" }}>Amount</p>
                      <p style={{ margin: 0, fontWeight: "bold", color: "#0070f3" }}>₦{r.amount.toLocaleString()}</p>
                    </div>
                    {r.notes && <p style={{ fontSize: 13, color: "#555", marginBottom: 8 }}><strong>Notes:</strong> {r.notes}</p>}
                    {r.status === "Rejected" && r.rejection_reason && (
                      <div style={{ padding: "8px 12px", background: "#fff5f5", border: "1px solid #ffcccc", borderRadius: 6, marginBottom: 12 }}>
                        <p style={{ margin: 0, fontSize: 13, color: "#ff4444" }}><strong>Rejection reason:</strong> {r.rejection_reason}</p>
                      </div>
                    )}
                    {r.status === "Pending" && (
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button onClick={() => setValidating(r)} style={{ flex: 1, padding: "8px 0", background: "#00aa00", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold", fontSize: 13, minHeight: 44 }}>Validate</button>
                        <button onClick={() => { setRejecting(r); setRejectReason(""); setRejectError("") }} style={{ flex: 1, padding: "8px 0", background: "white", color: "#ff4444", border: "1px solid #ff4444", borderRadius: 6, cursor: "pointer", fontWeight: "bold", fontSize: 13, minHeight: 44 }}>Reject</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ATF Tab */}
        {tab === "atf" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <p style={{ margin: "0 6px 0 0", fontSize: 12, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.5 }}>Filter</p>
                {atfFilters.map(f => (
                  <button key={f} onClick={() => setAtfFilter(f)} style={{
                    padding: "5px 12px", borderRadius: 20, fontSize: 12, cursor: "pointer",
                    border: "1px solid #ddd",
                    background: atfFilter === f ? "#0070f3" : "white",
                    color: atfFilter === f ? "white" : "#555",
                    fontWeight: atfFilter === f ? "bold" : "normal"
                  }}>{f}</button>
                ))}
              </div>
              <button onClick={fetchATFs} style={{ padding: "5px 10px", fontSize: 12, cursor: "pointer", borderRadius: 4, border: "1px solid #ddd", background: "white" }}>↻</button>
            </div>

            {filteredATFs.length === 0 && <p style={{ color: "#888" }}>No ATFs found.</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {filteredATFs.map(atf => {
                const { bg, color } = atfStatusColor(atf.atf_status)
                return (
                  <div key={atf.request_id} style={{ background: "white", border: "1px solid #eee", borderRadius: 10, padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <div>
                        {atf.atf_code
                          ? <p style={{ margin: 0, fontWeight: "bold", fontSize: 18, color: "#171717", fontFamily: "monospace", letterSpacing: 2 }}>{atf.atf_code}</p>
                          : <p style={{ margin: 0, fontSize: 13, color: "#aaa" }}>Awaiting authorisation</p>
                        }
                        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#555" }}>{atf.plate_number} · {atf.driver_name}</p>
                        <p style={{ margin: "4px 0 0", fontSize: 12, color: "#888" }}>Station: {atf.company_name}</p>
                        <p style={{ margin: "4px 0 0", fontSize: 12, color: "#888" }}>Initiated by {atf.officer_name}</p>
                        <p style={{ margin: "4px 0 0", fontSize: 12, color: "#aaa" }}>{new Date(atf.requested_at).toLocaleString()}</p>
                      </div>
                      <span style={{ padding: "4px 10px", borderRadius: 12, fontSize: 12, background: bg, color, fontWeight: "bold", whiteSpace: "nowrap" }}>{atf.atf_status}</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: atf.total_amount ? "1fr 1fr 1fr" : "1fr 1fr", gap: 8, marginBottom: 12 }}>
                      <div style={{ background: "#f9f9f9", borderRadius: 6, padding: "8px 12px" }}>
                        <p style={{ margin: 0, fontSize: 11, color: "#888" }}>Litres</p>
                        <p style={{ margin: 0, fontWeight: "bold", color: "#171717" }}>{atf.litres}L</p>
                      </div>
                      {atf.rate_per_litre && (
                        <div style={{ background: "#f9f9f9", borderRadius: 6, padding: "8px 12px" }}>
                          <p style={{ margin: 0, fontSize: 11, color: "#888" }}>Rate/L</p>
                          <p style={{ margin: 0, fontWeight: "bold", color: "#171717" }}>₦{atf.rate_per_litre.toLocaleString()}</p>
                        </div>
                      )}
                      {atf.total_amount && (
                        <div style={{ background: "#f9f9f9", borderRadius: 6, padding: "8px 12px" }}>
                          <p style={{ margin: 0, fontSize: 11, color: "#888" }}>Total</p>
                          <p style={{ margin: 0, fontWeight: "bold", color: "#0070f3" }}>₦{atf.total_amount.toLocaleString()}</p>
                        </div>
                      )}
                    </div>
                    {atf.atf_status === "Pending" && (
                      <button onClick={() => setAuthorisingATF(atf)} style={{ width: "100%", padding: "10px 0", background: "#0070f3", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold", fontSize: 14, minHeight: 44 }}>
                        Authorise ATF
                      </button>
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
            <h3 style={{ marginBottom: 20, color: "#171717" }}>Log Bulk Procurement</h3>
            <div style={{ marginBottom: 16 }}>
              <label style={label}>Item Name *</label>
              <input type="text" placeholder="e.g. Grease, Engine oil" value={procItem} onChange={e => { setProcItem(e.target.value); setProcError("") }} style={inputStyle} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={label}>Total Amount (₦) *</label>
              <input type="text" inputMode="numeric" placeholder="e.g. 150,000" value={procTotal} onChange={e => { setProcTotal(formatAmount(e.target.value)); setProcError("") }} style={inputStyle} />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={label}>Notes (optional)</label>
              <textarea placeholder="Any additional details..." value={procNotes} onChange={e => setProcNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: "none" }} />
            </div>
            {procError && <p style={err}>{procError}</p>}
            <button onClick={handleLogProcurement} disabled={procLoading} style={{ width: "100%", padding: "12px 0", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold", fontSize: 15, minHeight: 48 }}>
              {procLoading ? "Logging..." : "Log Procurement"}
            </button>
          </div>
        )}

        {/* Balance Tab */}
        {tab === "balance" && (
          <div style={{ maxWidth: 480 }}>
            <h3 style={{ marginBottom: 20, color: "#171717" }}>Top Up Maintenance Balance</h3>
            <div style={{ background: "white", border: "1px solid #eee", borderRadius: 12, padding: 20, marginBottom: 24 }}>
              <p style={{ margin: "0 0 4px", fontSize: 13, color: "#888" }}>Current Balance</p>
              <p style={{ margin: 0, fontSize: 28, fontWeight: "bold", color: "#0070f3" }}>₦{maintenanceBalance !== null ? maintenanceBalance.toLocaleString() : "—"}</p>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={label}>Amount to Add (₦) *</label>
              <input type="text" inputMode="numeric" placeholder="e.g. 500,000" value={depositAmount} onChange={e => { setDepositAmount(formatAmount(e.target.value)); setDepositError("") }} style={inputStyle} />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={label}>Note (optional)</label>
              <input type="text" placeholder="e.g. Monthly allocation" value={depositNote} onChange={e => setDepositNote(e.target.value)} style={inputStyle} />
            </div>
            {depositError && <p style={err}>{depositError}</p>}
            <button onClick={handleDeposit} disabled={depositLoading} style={{ width: "100%", padding: "12px 0", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold", fontSize: 15, minHeight: 48 }}>
              {depositLoading ? "Adding..." : "Add to Balance"}
            </button>
          </div>
        )}
      </div>

      {/* Authorise ATF Modal */}
      {authorisingATF && (
        <div style={overlayStyle}>
          <div onClick={e => e.stopPropagation()} style={modalBox(isMobile)}>
            {isMobile && <div style={dragHandle} />}
            <h3 style={{ marginBottom: 12, color: "#171717" }}>Authorise ATF?</h3>
            <p style={{ color: "#555", fontSize: 14, marginBottom: 20 }}>
              A unique ATF code will be generated and sent to the driver and station manager.
            </p>
            <div style={{ background: "#f9f9f9", borderRadius: 8, padding: 16, marginBottom: 24 }}>
              <p style={{ margin: "0 0 6px" }}><strong>Truck:</strong> {authorisingATF.plate_number}</p>
              <p style={{ margin: "0 0 6px" }}><strong>Driver:</strong> {authorisingATF.driver_name}</p>
              <p style={{ margin: "0 0 6px" }}><strong>Station:</strong> {authorisingATF.company_name}</p>
              <p style={{ margin: 0 }}><strong>Litres:</strong> {authorisingATF.litres}L</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setAuthorisingATF(null)} style={cancelBtn}>Cancel</button>
              <button onClick={handleAuthoriseATF} disabled={authoriseLoading} style={primaryBtn}>
                {authoriseLoading ? "Authorising..." : "Yes, Authorise"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Validate Maintenance Modal */}
      {validating && (
        <div style={overlayStyle}>
          <div onClick={e => e.stopPropagation()} style={modalBox(isMobile)}>
            {isMobile && <div style={dragHandle} />}
            <h3 style={{ marginBottom: 12, color: "#171717" }}>Validate Report?</h3>
            <div style={{ background: "#f9f9f9", borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <p style={{ margin: "0 0 8px" }}><strong>Truck:</strong> {validating.plate_number}</p>
              <p style={{ margin: "0 0 8px" }}><strong>Type:</strong> {validating.maintenance_type}</p>
              {validating.maintenance_location && <p style={{ margin: "0 0 8px" }}><strong>Location:</strong> {validating.maintenance_location}</p>}
              <p style={{ margin: "0 0 8px" }}><strong>Officer:</strong> {validating.manager_name}</p>
              <p style={{ margin: 0 }}><strong>Amount:</strong> <span style={{ color: "#0070f3", fontWeight: "bold" }}>₦{validating.amount.toLocaleString()}</span></p>
            </div>
            <p style={{ fontSize: 13, color: "#888", marginBottom: 24 }}>
              Balance after deduction: <strong style={{ color: (maintenanceBalance ?? 0) - validating.amount < 0 ? "#ff4444" : "#333" }}>
                ₦{Math.max(0, (maintenanceBalance ?? 0) - validating.amount).toLocaleString()}
              </strong>
              {(maintenanceBalance ?? 0) - validating.amount < 0 && <span style={{ color: "#ff4444", marginLeft: 8, fontSize: 12 }}>⚠️ Insufficient balance</span>}
            </p>
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
        <div style={overlayStyle}>
          <div onClick={e => e.stopPropagation()} style={modalBox(isMobile)}>
            {isMobile && <div style={dragHandle} />}
            <h3 style={{ marginBottom: 12, color: "#171717" }}>Reject Report</h3>
            <p style={{ color: "#555", marginBottom: 16 }}><strong>{rejecting.plate_number}</strong> — {rejecting.maintenance_type}</p>
            <label style={label}>Reason *</label>
            <textarea value={rejectReason} onChange={e => { setRejectReason(e.target.value); setRejectError("") }} placeholder="e.g. Amount seems incorrect" rows={3} style={{ width: "100%", padding: "12px 14px", boxSizing: "border-box", borderRadius: 8, border: "1.5px solid #ccc", fontSize: 14, resize: "none", marginBottom: 8, background: "white", color: "#171717" }} />
            {rejectError && <p style={err}>{rejectError}</p>}
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

const overlayStyle: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 100 }
const modalBox = (isMobile: boolean): React.CSSProperties => ({ background: "white", borderRadius: isMobile ? "16px 16px 0 0" : 12, padding: isMobile ? "24px 20px 36px" : 32, width: isMobile ? "100%" : 420, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" })
const dragHandle: React.CSSProperties = { width: 40, height: 4, background: "#ddd", borderRadius: 2, margin: "0 auto 20px" }
const label: React.CSSProperties = { display: "block", fontWeight: "bold", marginBottom: 6, fontSize: 14, color: "#171717" }
const err: React.CSSProperties = { color: "red", fontSize: 13, marginBottom: 12 }
const primaryBtn: React.CSSProperties = { flex: 1, padding: "12px 0", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold", fontSize: 15, minHeight: 48 }
const cancelBtn: React.CSSProperties = { flex: 1, padding: "12px 0", background: "white", border: "1.5px solid #ddd", borderRadius: 8, cursor: "pointer", fontSize: 15, minHeight: 48, color: "#171717" }