"use client"

import { useState, useEffect } from "react"
import ModernInput from "@/components/ModernInput"
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

type ViewMode = "card" | "table"

function useBreakpoint() {
  const [isDesktop, setIsDesktop] = useState(false)
  const [isMobile, setIsMobile] = useState(true)
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640)
      setIsDesktop(window.innerWidth >= 640)
    }
    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])
  return { isMobile, isDesktop }
}

const fontSize = { xs: 12, sm: 13, base: 14, md: 15, lg: 16, xl: 20, "2xl": 24, "3xl": 28 }

const atfStatusColor = (status: string) => {
  switch (status) {
    case "Pending": return { bg: "#fef3c7", color: "#b45309", border: "#fde68a" } // amber/yellow
    case "Authorised": return { bg: "#f0f7ff", color: "#0070f3", border: "#bfdbfe" } // blue
    case "Dispensed": return { bg: "#f3e8ff", color: "#7e22ce", border: "#e9d5ff" } // purple
    case "Confirmed": return { bg: "#d1fae5", color: "#047857", border: "#a7f3d0" } // green
    case "Invalidated": return { bg: "#fef2f2", color: "#b91c1c", border: "#fecaca" } // red
    default: return { bg: "#f1f5f9", color: "#475569", border: "#e2e8f0" }
  }
}

const filters = ["All", "Pending", "Authorised", "Dispensed", "Confirmed", "Invalidated"]

export default function DieselManager() {
  const { isMobile, isDesktop } = useBreakpoint()
  const [atfs, setAtfs] = useState<ATF[]>([])
  const [companies, setCompanies] = useState<FuelCompany[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("All")
  const [viewMode, setViewMode] = useState<ViewMode>("card")
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  
  // Deposit modal
  const [depositCompanyId, setDepositCompanyId] = useState("")
  const [depositAmount, setDepositAmount] = useState("")
  const [depositNote, setDepositNote] = useState("")
  const [depositError, setDepositError] = useState("")
  const [depositLoading, setDepositLoading] = useState(false)
  const [showDepositModal, setShowDepositModal] = useState(false)

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "12px 14px", boxSizing: "border-box", borderRadius: 8,
    border: "1px solid #e2e8f0", fontSize: fontSize.base, background: "white", color: "#0f172a", minHeight: 48, transition: "border-color 0.2s ease"
  }

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
      status: "Pending",
    }])

    if (error) { setDepositError("Failed to log deposit"); setDepositLoading(false); return }

    setDepositLoading(false)
    setShowDepositModal(false)
    setDepositCompanyId(""); setDepositAmount(""); setDepositNote(""); setDepositError("")
    fetchCompanies()
  }

  const filteredATFs = filter === "All" ? atfs : atfs.filter(a => a.atf_status === filter)

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: isMobile ? "16px" : "32px", fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "stretch" : "flex-start", gap: 16, marginBottom: 32 }}>
        <div>
          <h1 style={{ margin: 0, color: "#0f172a", fontSize: isMobile ? fontSize["2xl"] : fontSize["3xl"], fontWeight: 700, letterSpacing: "-0.5px" }}>
            Diesel Manager
          </h1>
          {lastUpdated && (
            <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: fontSize.sm }}>
              Updated {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>
        
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {atfs.length > 0 && (
            <div style={{ display: "flex", background: "white", border: "1px solid #e2e8f0", borderRadius: 8, padding: 4, gap: 0 }}>
              <button onClick={() => setViewMode("card")} style={{ padding: "8px 12px", background: viewMode === "card" ? "#0070f3" : "transparent", color: viewMode === "card" ? "white" : "#64748b", border: "none", borderRadius: 6, cursor: "pointer", fontSize: fontSize.xs, fontWeight: 600, transition: "all 0.2s ease", minWidth: 44, height: 40, display: "flex", alignItems: "center", justifyContent: "center" }} title="Card view">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z" /></svg>
              </button>
              <button onClick={() => setViewMode("table")} style={{ padding: "8px 12px", background: viewMode === "table" ? "#0070f3" : "transparent", color: viewMode === "table" ? "white" : "#64748b", border: "none", borderRadius: 6, cursor: "pointer", fontSize: fontSize.xs, fontWeight: 600, transition: "all 0.2s ease", minWidth: 44, height: 40, display: "flex", alignItems: "center", justifyContent: "center" }} title="Table view">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 4h18v2H3V4zm0 7h18v2H3v-2zm0 7h18v2H3v-2z" /></svg>
              </button>
            </div>
          )}
          <button onClick={fetchAll} style={{ padding: "10px 16px", background: "white", color: "#0070f3", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer", fontWeight: 500, fontSize: fontSize.sm, transition: "all 0.2s ease", display: "flex", alignItems: "center", gap: 6, minHeight: 40, height: 48 }} onMouseEnter={e => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#0070f3" }} onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#e2e8f0" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36M20.49 15a9 9 0 0 1-14.85 3.36" /></svg>
          </button>
          <button onClick={() => setShowDepositModal(true)} style={{ padding: "0 20px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: fontSize.sm, transition: "all 0.2s ease", minHeight: 48, flex: isMobile ? 1 : "none" }} onMouseEnter={e => !isMobile && (e.currentTarget.style.transform = "translateY(-1px)")} onMouseLeave={e => !isMobile && (e.currentTarget.style.transform = "translateY(0)")}>
            + Top Up
          </button>
        </div>
      </div>

      {/* Company Balances */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))", gap: 16, marginBottom: 32 }}>
        {companies.map(c => {
          const low = c.current_balance < c.low_balance_threshold
          return (
            <div key={c.company_id} style={{ background: "white", border: `1px solid ${low ? "#fde68a" : "#e2e8f0"}`, borderRadius: 12, padding: 20, boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)", position: "relative", overflow: "hidden" }}>
              {low && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: "#ef4444" }} />}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <p style={{ margin: "0 0 4px", fontSize: fontSize.sm, color: "#64748b", fontWeight: 500 }}>{c.company_name}</p>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: fontSize.xl, color: "#0f172a" }}>
                    ₦{c.current_balance.toLocaleString()}
                  </p>
                </div>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: low ? "#fef2f2" : "#f0f7ff", color: low ? "#ef4444" : "#0070f3", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                </div>
              </div>
              {low && <p style={{ margin: "12px 0 0", fontSize: fontSize.xs, color: "#ef4444", fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01" /></svg> Balance below threshold</p>}
            </div>
          )
        })}
      </div>

      {/* Filter Pills */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap", overflowX: "auto", paddingBottom: 4 }}>
        {filters.map(f => {
          const isActive = filter === f
          const count = f === "All" ? atfs.length : atfs.filter(a => a.atf_status === f).length
          let colorProps = { bg: "white", color: "#64748b", border: "#e2e8f0" }
          
          if (isActive) {
            if (f === "All") colorProps = { bg: "#f1f5f9", color: "#0f172a", border: "#cbd5e1" }
            else colorProps = atfStatusColor(f)
          }

          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: "6px 14px",
                borderRadius: 24,
                fontSize: fontSize.xs,
                cursor: "pointer",
                border: `1px solid ${colorProps.border}`,
                background: colorProps.bg,
                color: colorProps.color,
                fontWeight: isActive ? 600 : 500,
                transition: "all 0.2s ease",
                whiteSpace: "nowrap"
              }}
            >
              {f} {count > 0 && <span style={{ marginLeft: 4, fontWeight: isActive ? 600 : 500 }}>({count})</span>}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "64px 0" }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid #e2e8f0", borderTopColor: "#0070f3", animation: "spin 1s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : filteredATFs.length === 0 ? (
        <div style={{ textAlign: "center", padding: "64px 24px", background: "white", borderRadius: 12, border: "1px solid #e2e8f0" }}>
          <div style={{ width: 64, height: 64, background: "#f1f5f9", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
          </div>
          <h3 style={{ margin: "0 0 8px", color: "#0f172a", fontSize: fontSize.xl, fontWeight: 600 }}>No {filter.toLowerCase()} ATFs</h3>
          <p style={{ color: "#64748b", fontSize: fontSize.base }}>No fuel requests match this status.</p>
        </div>
      ) : (
        <>
          {viewMode === "card" && (
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
              {filteredATFs.map(atf => {
                const { bg, color, border } = atfStatusColor(atf.atf_status)
                return (
                  <div key={atf.request_id} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", transition: "all 0.2s ease" }} onMouseEnter={e => !isMobile && (e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)")} onMouseLeave={e => !isMobile && (e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)")}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                      <div>
                        {atf.atf_code
                          ? <p style={{ margin: 0, fontWeight: 700, fontSize: fontSize.lg, fontFamily: "monospace", letterSpacing: 1, color: "#0f172a" }}>{atf.atf_code}</p>
                          : <p style={{ margin: 0, fontSize: fontSize.sm, color: "#94a3b8", fontStyle: "italic" }}>Pending Code</p>
                        }
                        <p style={{ margin: "4px 0 0", fontSize: fontSize.sm, color: "#64748b" }}>{atf.plate_number}{atf.kbnl_truck_no ? ` · #${atf.kbnl_truck_no}` : ""}</p>
                        <p style={{ margin: "4px 0 0", fontSize: fontSize.xs, color: "#94a3b8" }}>{new Date(atf.requested_at).toLocaleString()}</p>
                      </div>
                      <span style={{ padding: "4px 10px", borderRadius: 6, fontSize: fontSize.xs, background: bg, color, border: `1px solid ${border}`, fontWeight: 600 }}>{atf.atf_status}</span>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #f1f5f9" }}>
                      <p style={{ margin: 0, fontSize: fontSize.sm, color: "#475569" }}><span style={{ color: "#94a3b8", width: 60, display: "inline-block" }}>Driver:</span> <span style={{ fontWeight: 500 }}>{atf.driver_name}</span></p>
                      <p style={{ margin: 0, fontSize: fontSize.sm, color: "#475569" }}><span style={{ color: "#94a3b8", width: 60, display: "inline-block" }}>Officer:</span> {atf.officer_name}</p>
                      <p style={{ margin: 0, fontSize: fontSize.sm, color: "#475569" }}><span style={{ color: "#94a3b8", width: 60, display: "inline-block" }}>Station:</span> {atf.company_name}</p>
                    </div>

                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ flex: 1, background: "#f8fafc", borderRadius: 8, padding: "10px 12px" }}>
                        <p style={{ margin: 0, fontSize: fontSize.xs, color: "#64748b" }}>Volume</p>
                        <p style={{ margin: "2px 0 0", fontWeight: 600, color: "#0f172a", fontSize: fontSize.md }}>{atf.litres}L</p>
                      </div>
                      {atf.rate_per_litre && (
                        <div style={{ flex: 1, background: "#f8fafc", borderRadius: 8, padding: "10px 12px" }}>
                          <p style={{ margin: 0, fontSize: fontSize.xs, color: "#64748b" }}>Rate/L</p>
                          <p style={{ margin: "2px 0 0", fontWeight: 600, color: "#0f172a", fontSize: fontSize.md }}>₦{atf.rate_per_litre.toLocaleString()}</p>
                        </div>
                      )}
                      {atf.total_amount && (
                        <div style={{ flex: 1, background: "#f0f7ff", borderRadius: 8, padding: "10px 12px", border: "1px solid #e0f2fe" }}>
                          <p style={{ margin: 0, fontSize: fontSize.xs, color: "#0284c7" }}>Total</p>
                          <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#0369a1", fontSize: fontSize.md }}>₦{atf.total_amount.toLocaleString()}</p>
                        </div>
                      )}
                    </div>

                    {atf.invalidation_reason && (
                      <div style={{ marginTop: 16, padding: "10px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8 }}>
                        <p style={{ margin: 0, fontSize: fontSize.sm, color: "#b91c1c" }}><strong>Reason:</strong> {atf.invalidation_reason}</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {viewMode === "table" && (
            <div style={{ background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", minWidth: 800 }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: fontSize.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>ATF Code</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: fontSize.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Truck & Driver</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: fontSize.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Station</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: fontSize.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "right" }}>Volume</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: fontSize.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "right" }}>Amount</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: fontSize.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredATFs.map((atf, idx) => {
                    const { bg, color, border } = atfStatusColor(atf.atf_status)
                    return (
                      <tr key={atf.request_id} style={{ borderBottom: idx === filteredATFs.length - 1 ? "none" : "1px solid #e2e8f0", transition: "background 0.2s ease" }} onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: fontSize.sm, fontFamily: "monospace", fontWeight: 600 }}>
                          {atf.atf_code || <span style={{ color: "#94a3b8", fontStyle: "italic", fontWeight: "normal" }}>Pending</span>}
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <p style={{ margin: 0, color: "#0f172a", fontSize: fontSize.sm, fontWeight: 500 }}>{atf.plate_number}{atf.kbnl_truck_no ? ` (#${atf.kbnl_truck_no})` : ""}</p>
                          <p style={{ margin: "2px 0 0", color: "#64748b", fontSize: fontSize.xs }}>{atf.driver_name}</p>
                        </td>
                        <td style={{ padding: "12px 16px", color: "#475569", fontSize: fontSize.sm }}>
                          {atf.company_name}
                        </td>
                        <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: fontSize.sm, textAlign: "right", fontWeight: 500 }}>
                          {atf.litres}L
                        </td>
                        <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: fontSize.sm, textAlign: "right", fontWeight: 500 }}>
                          {atf.total_amount ? `₦${atf.total_amount.toLocaleString()}` : "—"}
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{ padding: "4px 10px", borderRadius: 6, fontSize: fontSize.xs, fontWeight: 500, background: bg, color, border: `1px solid ${border}`, whiteSpace: "nowrap" }}>
                            {atf.atf_status}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Deposit Modal */}
      {showDepositModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 100, padding: isMobile ? 0 : 24, animation: "fadeIn 0.2s ease-out" }}>
          <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
          <div style={{ background: "white", borderRadius: isMobile ? "20px 20px 0 0" : 12, padding: isMobile ? "28px 20px" : 32, width: "100%", maxWidth: 420, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)", animation: "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)" }}>
            
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h3 style={{ margin: 0, color: "#0f172a", fontSize: fontSize.xl, fontWeight: 700 }}>Top Up Fuel Balance</h3>
              <button onClick={() => { setShowDepositModal(false); setDepositCompanyId(""); setDepositAmount(""); setDepositNote(""); setDepositError("") }} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 4 }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 24 }}>
              <div>
                <label style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: fontSize.sm, fontWeight: 500 }}>Fuel Company *</label>
                <ModernInput
                  as="select"
                  value={depositCompanyId}
                  onChange={(e: any) => { setDepositCompanyId(e.target.value); setDepositError("") }}
                  style={inputStyle}
                >
                  <option value="">Select company</option>
                  {companies.map(c => <option key={c.company_id} value={c.company_id}>{c.company_name} — ₦{c.current_balance.toLocaleString()}</option>)}
                </ModernInput>
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: fontSize.sm, fontWeight: 500 }}>Amount (₦) *</label>
                <ModernInput
                  type="text"
                  inputMode="numeric"
                  placeholder="e.g. 500,000"
                  value={depositAmount}
                  onChange={(e: any) => { setDepositAmount(formatAmount(e.target.value)); setDepositError("") }}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: fontSize.sm, fontWeight: 500 }}>Note (optional)</label>
                <ModernInput
                  type="text"
                  placeholder="e.g. Monthly top-up"
                  value={depositNote}
                  onChange={(e: any) => setDepositNote(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>

            {depositError && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 24, color: "#b91c1c", fontSize: fontSize.sm }}>{depositError}</div>}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setShowDepositModal(false); setDepositCompanyId(""); setDepositAmount(""); setDepositNote(""); setDepositError("") }} style={{ flex: 1, padding: "12px 16px", background: "white", color: "#0f172a", border: "1px solid #cbd5e1", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: fontSize.md, minHeight: 44 }}>
                Cancel
              </button>
              <button onClick={handleDeposit} disabled={depositLoading} style={{ flex: 1, padding: "12px 16px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: depositLoading ? "not-allowed" : "pointer", fontWeight: 600, fontSize: fontSize.md, minHeight: 44, opacity: depositLoading ? 0.7 : 1 }}>
                {depositLoading ? "Adding..." : "Top Up"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}