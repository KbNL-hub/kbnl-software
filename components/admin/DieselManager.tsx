"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { formatAmount, parseAmount } from "@/lib/formatAmount"

type ATF = {
  request_id: string
  atf_code: string | null
  plate_number: string
  kbnl_truck_no: string | null
  driver_name: string
  officer_name: string
  company_name: string
  litres: number
  rate_per_litre: number | null
  total_amount: number | null
  atf_status: string
  requested_at: string
  dispensed_at: string | null
  confirmed_at: string | null
  invalidated_at: string | null
  invalidation_reason: string | null
}

type FuelCompany = {
  company_id: string
  company_name: string
  current_balance: number
  low_balance_threshold: number
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

const filters = ["All", "Pending", "Authorised", "Dispensed", "Confirmed", "Invalidated"]

export default function DieselManager() {
  const [atfs, setAtfs] = useState<ATF[]>([])
  const [companies, setCompanies] = useState<FuelCompany[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("All")
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Deposit modal
  const [depositCompanyId, setDepositCompanyId] = useState("")
  const [depositAmount, setDepositAmount] = useState("")
  const [depositNote, setDepositNote] = useState("")
  const [depositError, setDepositError] = useState("")
  const [depositLoading, setDepositLoading] = useState(false)
  const [showDepositModal, setShowDepositModal] = useState(false)

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 30000)
    return () => clearInterval(interval)
  }, [])

  async function fetchAll() {
    await Promise.all([fetchATFs(), fetchCompanies()])
    setLastUpdated(new Date())
    setLoading(false)
  }

  async function fetchATFs() {
    const { data: raw } = await supabase
      .from("fuel_requests")
      .select("request_id, atf_code, plate_number, driver_id, company_id, litres, rate_per_litre, total_amount, atf_status, requested_at, dispensed_at, confirmed_at, invalidated_at, invalidation_reason, initiated_by")
      .order("requested_at", { ascending: false })

    if (!raw) return

    const enriched = await Promise.all(raw.map(async r => {
      const { data: driver } = await supabase.from("Drivers").select("full_name").eq("driver_id", r.driver_id).single()
      const { data: officer } = await supabase.from("truck_officers").select("full_name").eq("manager_id", r.initiated_by).single()
      const { data: company } = await supabase.from("fuel_companies").select("company_name").eq("company_id", r.company_id).single()
      const { data: truck } = await supabase.from("Trucks").select("kbnl_truck_no").eq("plate_number", r.plate_number).single()
      return {
        ...r,
        driver_name: driver?.full_name ?? "Unknown",
        officer_name: officer?.full_name ?? "Unknown",
        company_name: company?.company_name ?? "Unknown",
        kbnl_truck_no: truck?.kbnl_truck_no ?? null,
      }
    }))

    setAtfs(enriched)
  }

  async function fetchCompanies() {
    const { data } = await supabase
      .from("fuel_companies")
      .select("company_id, company_name, current_balance, low_balance_threshold")
      .order("company_name")
    setCompanies(data || [])
  }

  async function handleDeposit() {
    const amount = parseAmount(depositAmount)
    if (!depositCompanyId) return setDepositError("Select a fuel company")
    if (!depositAmount || amount <= 0) return setDepositError("Enter a valid amount")

    setDepositLoading(true)

    const { error } = await supabase.from("fuel_deposits").insert([{
      company_id: depositCompanyId,
      amount,
      note: depositNote.trim() || null,
    }])

    if (error) { setDepositError("Failed to log deposit"); setDepositLoading(false); return }

    const company = companies.find(c => c.company_id === depositCompanyId)
    if (company) {
      await supabase.from("fuel_companies").update({ current_balance: company.current_balance + amount }).eq("company_id", depositCompanyId)
    }

    setDepositLoading(false)
    setShowDepositModal(false)
    setDepositCompanyId(""); setDepositAmount(""); setDepositNote(""); setDepositError("")
    fetchCompanies()
  }

  const filteredATFs = filter === "All" ? atfs : atfs.filter(a => a.atf_status === filter)

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "12px 14px", boxSizing: "border-box",
    borderRadius: 8, border: "1.5px solid #ccc",
    fontSize: 14, background: "white", color: "#171717", minHeight: 48,
  }

  if (loading) return <p style={{ color: "#888" }}>Loading...</p>

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={{ margin: 0, color: "#171717" }}>Diesel Manager</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {lastUpdated && <span style={{ fontSize: 12, color: "#aaa" }}>{lastUpdated.toLocaleTimeString()}</span>}
          <button onClick={fetchAll} style={{ padding: "6px 14px", fontSize: 13, cursor: "pointer", borderRadius: 4, border: "1px solid #ddd", background: "white" }}>Refresh</button>
          <button onClick={() => setShowDepositModal(true)} style={{ padding: "8px 16px", background: "#0070f3", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold", fontSize: 13 }}>
            + Top Up Balance
          </button>
        </div>
      </div>

      {/* Company Balances */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: 24 }}>
        {companies.map(c => {
          const low = c.current_balance < c.low_balance_threshold
          return (
            <div key={c.company_id} style={{ background: low ? "#fff8e1" : "white", border: `1px solid ${low ? "#f5a623" : "#eee"}`, borderRadius: 10, padding: 16 }}>
              <p style={{ margin: 0, fontSize: 12, color: "#888" }}>{c.company_name}</p>
              <p style={{ margin: "4px 0 0", fontWeight: "bold", fontSize: 20, color: low ? "#f5a623" : "#00aa00" }}>
                ₦{c.current_balance.toLocaleString()}
              </p>
              {low && <p style={{ margin: "4px 0 0", fontSize: 11, color: "#f5a623" }}>⚠️ Low balance</p>}
            </div>
          )
        })}
      </div>

      {/* ATF Feed */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {filters.map(f => {
          const isActive = filter === f
          const activeColor =
            f === "Pending" ? "#f5a623" :
            f === "Authorised" ? "#0070f3" :
            f === "Dispensed" ? "#7c3aed" :
            f === "Confirmed" ? "#00aa00" :
            f === "Invalidated" ? "#ff4444" : "#0070f3"
          return (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: "6px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer",
              border: `1px solid ${isActive ? activeColor : "#ddd"}`,
              background: isActive ? activeColor : "white",
              color: isActive ? "white" : "#333",
              fontWeight: isActive ? "bold" : "normal"
            }}>{f}</button>
          )
        })}
      </div>

      {filteredATFs.length === 0 && <p style={{ color: "#888" }}>No {filter === "All" ? "" : filter.toLowerCase()} ATFs.</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {filteredATFs.map(atf => {
          const { bg, color } = atfStatusColor(atf.atf_status)
          return (
            <div key={atf.request_id} style={{ background: "white", border: "1px solid #eee", borderRadius: 10, padding: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  {atf.atf_code
                    ? <p style={{ margin: 0, fontWeight: "bold", fontSize: 18, fontFamily: "monospace", letterSpacing: 2, color: "#171717" }}>{atf.atf_code}</p>
                    : <p style={{ margin: 0, fontSize: 13, color: "#aaa" }}>Pending authorisation</p>
                  }
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: "#555" }}>{atf.plate_number}{atf.kbnl_truck_no ? ` · #${atf.kbnl_truck_no}` : ""} · {atf.driver_name}</p>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "#888" }}>Station: {atf.company_name}</p>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "#888" }}>Officer: {atf.officer_name}</p>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "#aaa" }}>{new Date(atf.requested_at).toLocaleString()}</p>
                </div>
                <span style={{ padding: "4px 10px", borderRadius: 12, fontSize: 12, background: bg, color, fontWeight: "bold", whiteSpace: "nowrap" }}>{atf.atf_status}</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8 }}>
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

              {atf.invalidation_reason && (
                <div style={{ marginTop: 12, padding: "8px 12px", background: "#fff5f5", border: "1px solid #ffcccc", borderRadius: 6 }}>
                  <p style={{ margin: 0, fontSize: 13, color: "#ff4444" }}><strong>Invalidation reason:</strong> {atf.invalidation_reason}</p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Deposit Modal */}
      {showDepositModal && (
        <div onClick={() => { setShowDepositModal(false); setDepositCompanyId(""); setDepositAmount(""); setDepositNote(""); setDepositError("") }} style={overlay}>
          <div onClick={e => e.stopPropagation()} style={modal}>
            <h3 style={{ marginBottom: 20, color: "#171717" }}>Top Up Fuel Balance</h3>
            <div style={{ marginBottom: 16 }}>
              <label style={label}>Fuel Company *</label>
              <select value={depositCompanyId} onChange={e => { setDepositCompanyId(e.target.value); setDepositError("") }} style={inputStyle}>
                <option value="">Select company</option>
                {companies.map(c => <option key={c.company_id} value={c.company_id}>{c.company_name} — ₦{c.current_balance.toLocaleString()}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={label}>Amount (₦) *</label>
              <input type="text" inputMode="numeric" placeholder="e.g. 500,000" value={depositAmount} onChange={e => { setDepositAmount(formatAmount(e.target.value)); setDepositError("") }} style={inputStyle} />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={label}>Note (optional)</label>
              <input type="text" placeholder="e.g. Monthly top-up" value={depositNote} onChange={e => setDepositNote(e.target.value)} style={inputStyle} />
            </div>
            {depositError && <p style={{ color: "red", fontSize: 13, marginBottom: 12 }}>{depositError}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setShowDepositModal(false); setDepositCompanyId(""); setDepositAmount(""); setDepositNote(""); setDepositError("") }} style={cancelBtn}>Cancel</button>
              <button onClick={handleDeposit} disabled={depositLoading} style={primaryBtn}>{depositLoading ? "Adding..." : "Top Up"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }
const modal: React.CSSProperties = { background: "white", borderRadius: 12, padding: 32, width: 420, maxWidth: "90vw", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }
const label: React.CSSProperties = { display: "block", fontWeight: "bold", marginBottom: 6, fontSize: 14, color: "#171717" }
const primaryBtn: React.CSSProperties = { flex: 1, padding: "12px 0", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold", fontSize: 15, minHeight: 48 }
const cancelBtn: React.CSSProperties = { flex: 1, padding: "12px 0", background: "white", border: "1.5px solid #ddd", borderRadius: 8, cursor: "pointer", fontSize: 15, minHeight: 48, color: "#171717" }