"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { formatAmount, parseAmount } from "@/lib/formatAmount"
import ModernInput from "@/components/ModernInput"
import { useBreakpoint } from "@/app/hooks/useBreakpoint"

type ATF = {
  request_id: string
  atf_code: string
  plate_number: string
  kbnl_truck_no: string | null
  driver_name: string
  driver_id: string
  litres: number
  atf_status: string
  requested_at: string
  rate_per_litre: number | null
  total_amount: number | null
}

const atfStatusColor = (status: string) => {
  switch (status) {
    case "Authorised": return { bg: "#0070f322", color: "#0070f3" }
    case "Dispensed": return { bg: "#7c3aed22", color: "#7c3aed" }
    case "Confirmed": return { bg: "#00aa0022", color: "#00aa00" }
    case "Invalidated": return { bg: "#ff444422", color: "#ff4444" }
    default: return { bg: "#eee", color: "#888" }
  }
}

export default function StationManagerDashboard() {
  const router = useRouter()
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"

  const [managerId, setManagerId] = useState("")
  const [companyId, setCompanyId] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [currentBalance, setCurrentBalance] = useState<number | null>(null)
  const [lowThreshold, setLowThreshold] = useState<number>(0)
  const [atfs, setAtfs] = useState<ATF[]>([])
  const [filter, setFilter] = useState("Authorised")
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Dispense modal
  const [dispensingATF, setDispensingATF] = useState<ATF | null>(null)
  const [ratePerLitre, setRatePerLitre] = useState("")
  const [dispenseError, setDispenseError] = useState("")
  const [dispenseLoading, setDispenseLoading] = useState(false)

  // Invalidate modal
  const [invalidatingATF, setInvalidatingATF] = useState<ATF | null>(null)
  const [invalidateReason, setInvalidateReason] = useState("")
  const [invalidateError, setInvalidateError] = useState("")
  const [invalidateLoading, setInvalidateLoading] = useState(false)

  const filters = ["Authorised", "All", "Dispensed", "Confirmed", "Invalidated"]

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
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
      if (profile?.role !== "StationManager") { router.push("/login"); return }

      const { data: manager } = await supabase.from("station_managers").select("manager_id, company_id").eq("manager_id", user.id).single()
      if (!manager) { router.push("/login"); return }

      setManagerId(manager.manager_id)
      setCompanyId(manager.company_id)
      await fetchCompanyData(manager.company_id)
      await fetchATFs(manager.company_id)
      setLoading(false)
    }
    init()
  }, [])

  useEffect(() => {
    if (!companyId) return
    const interval = setInterval(() => {
      fetchCompanyData(companyId)
      fetchATFs(companyId)
    }, 30000)
    return () => clearInterval(interval)
  }, [companyId])

  async function fetchCompanyData(cId: string) {
    const { data } = await supabase.from("fuel_companies").select("company_name, current_balance, low_balance_threshold").eq("company_id", cId).single()
    if (data) { setCompanyName(data.company_name); setCurrentBalance(data.current_balance); setLowThreshold(data.low_balance_threshold) }
  }

  async function fetchATFs(cId: string) {
    const { data: raw } = await supabase
      .from("fuel_requests")
      .select("request_id, atf_code, plate_number, driver_id, litres, atf_status, requested_at, rate_per_litre, total_amount")
      .eq("company_id", cId)
      .order("requested_at", { ascending: false })

    if (!raw) return

    const enriched = await Promise.all(raw.map(async r => {
      const { data: driver } = await supabase.from("Drivers").select("full_name").eq("driver_id", r.driver_id).single()
      const { data: truck } = await supabase.from("Trucks").select("kbnl_truck_no").eq("plate_number", r.plate_number).single()
      return {
        ...r,
        driver_name: driver?.full_name ?? "Unknown",
        driver_id: r.driver_id,
        kbnl_truck_no: truck?.kbnl_truck_no ?? null,
      }
    }))

    setAtfs(enriched)
    setLastUpdated(new Date())
  }

  async function handleDispense() {
    if (!dispensingATF) return
    const rate = parseAmount(ratePerLitre)
    if (!ratePerLitre || rate <= 0) return setDispenseError("Enter a valid rate per litre")

    const total = dispensingATF.litres * rate
    const isLow = currentBalance !== null && currentBalance < total
    if (isLow) return setDispenseError(`Insufficient balance — need ₦${total.toLocaleString()} but only ₦${currentBalance?.toLocaleString()} available`)

    setDispenseLoading(true)

    await supabase.from("fuel_requests").update({
      atf_status: "Dispensed",
      rate_per_litre: rate,
      total_amount: total,
      dispensed_at: new Date().toISOString(),
    }).eq("request_id", dispensingATF.request_id)

    // Deduct from company balance
    const newBalance = (currentBalance ?? 0) - total
    await supabase.from("fuel_companies").update({ current_balance: newBalance }).eq("company_id", companyId)
    setCurrentBalance(newBalance)

    // Add litres to truck fuel balance
    const { data: truck } = await supabase.from("Trucks").select("fuel_balance").eq("plate_number", dispensingATF.plate_number).single()
    if (truck) {
      await supabase.from("Trucks").update({ fuel_balance: truck.fuel_balance + dispensingATF.litres }).eq("plate_number", dispensingATF.plate_number)
    }

    setDispenseLoading(false)
    setDispensingATF(null)
    setRatePerLitre("")
    setDispenseError("")
    fetchATFs(companyId)
  }

  async function handleInvalidate() {
    if (!invalidatingATF) return
    if (!invalidateReason.trim()) return setInvalidateError("Provide a reason for invalidation")

    setInvalidateLoading(true)
    await supabase.from("fuel_requests").update({
      atf_status: "Invalidated",
      invalidation_reason: invalidateReason.trim(),
      invalidated_at: new Date().toISOString(),
    }).eq("request_id", invalidatingATF.request_id)

    setInvalidateLoading(false)
    setInvalidatingATF(null)
    setInvalidateReason("")
    setInvalidateError("")
    fetchATFs(companyId)
  }

  const filteredATFs = filter === "All" ? atfs : atfs.filter(a => a.atf_status === filter)
  const isLow = currentBalance !== null && currentBalance < lowThreshold

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
          <p style={{ margin: 0, fontSize: 12, color: "#888" }}>Station Manager</p>
          <p style={{ margin: 0, fontWeight: "bold", fontSize: 16, color: "#171717" }}>{companyName}</p>
        </div>
        <button onClick={async () => { await supabase.auth.signOut(); router.push("/login") }} style={{ padding: "8px 20px", background: "rgba(255, 68, 68,0.05)", color: "#ff4444", border: "1px solid #ff4444", borderRadius: 6, cursor: "pointer", fontSize: 14 }}>
          Logout
        </button>
      </div>

      <div style={{ padding: isMobile ? 16 : 24, maxWidth: 800, margin: "0 auto" }}>

        {/* Balance Card */}
        <div style={{
          background: isLow ? "#fff8e1" : "white",
          border: `1px solid ${isLow ? "#f5a623" : "#eee"}`,
          borderRadius: 12, padding: 24, marginBottom: 24,
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)"
        }}>
          <p style={{ margin: "0 0 4px", fontSize: 13, color: "#888" }}>Available Balance</p>
          <p style={{ margin: 0, fontSize: 36, fontWeight: "bold", color: isLow ? "#f5a623" : "#00aa00" }}>
            ₦{currentBalance !== null ? currentBalance.toLocaleString() : "—"}
          </p>
          {isLow && <p style={{ margin: "8px 0 0", fontSize: 13, color: "#f5a623" }}>⚠️ Balance below threshold (₦{lowThreshold.toLocaleString()})</p>}
        </div>

        {/* Filter pills + refresh */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {filters.map(f => {
              const isActive = filter === f
              const activeColor =
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
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: "#888" }}>
            {lastUpdated && `Updated: ${lastUpdated.toLocaleTimeString()}`}
            <button onClick={() => { fetchCompanyData(companyId); fetchATFs(companyId) }} style={{ padding: "4px 12px", fontSize: 12, cursor: "pointer", borderRadius: 4, border: "1px solid #ddd", background: "white" }}>Refresh</button>
          </div>
        </div>

        {filteredATFs.length === 0 && <p style={{ color: "#888" }}>No {filter === "All" ? "" : filter.toLowerCase()} ATFs.</p>}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filteredATFs.map(atf => {
            const { bg, color } = atfStatusColor(atf.atf_status)
            return (
              <div key={atf.request_id} style={{ background: "white", border: "1px solid #eee", borderRadius: 12, padding: isMobile ? 16 : 20, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>

                {/* ATF Code — prominent */}
                <div style={{ background: "#f9f9f9", borderRadius: 8, padding: "12px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 1 }}>ATF Code</p>
                    <p style={{ margin: "4px 0 0", fontSize: 22, fontWeight: "bold", fontFamily: "monospace", letterSpacing: 3, color: "#171717" }}>{atf.atf_code}</p>
                  </div>
                  <span style={{ padding: "4px 12px", borderRadius: 12, fontSize: 12, background: bg, color, fontWeight: "bold" }}>{atf.atf_status}</span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 12, color: "#888" }}>Driver</p>
                    <p style={{ margin: "2px 0 0", fontWeight: "bold", fontSize: 14, color: "#171717" }}>{atf.driver_name}</p>
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: 12, color: "#888" }}>Truck</p>
                    <p style={{ margin: "2px 0 0", fontWeight: "bold", fontSize: 14, color: "#171717" }}>
                      {atf.plate_number}{atf.kbnl_truck_no ? ` · #${atf.kbnl_truck_no}` : ""}
                    </p>
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: 12, color: "#888" }}>Litres Authorised</p>
                    <p style={{ margin: "2px 0 0", fontWeight: "bold", fontSize: 18, color: "#0070f3" }}>{atf.litres}L</p>
                  </div>
                  {atf.total_amount && (
                    <div>
                      <p style={{ margin: 0, fontSize: 12, color: "#888" }}>Total Amount</p>
                      <p style={{ margin: "2px 0 0", fontWeight: "bold", fontSize: 16, color: "#00aa00" }}>₦{atf.total_amount.toLocaleString()}</p>
                    </div>
                  )}
                </div>

                <p style={{ margin: "0 0 12px", fontSize: 12, color: "#aaa" }}>{new Date(atf.requested_at).toLocaleString()}</p>

                {atf.atf_status === "Authorised" && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => { setDispensingATF(atf); setRatePerLitre(""); setDispenseError("") }} style={{ flex: 1, padding: "12px 0", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold", fontSize: 14, minHeight: 48 }}>
                      I've Dispensed
                    </button>
                    <button onClick={() => { setInvalidatingATF(atf); setInvalidateReason(""); setInvalidateError("") }} style={{ flex: 1, padding: "12px 0", background: "white", color: "#ff4444", border: "1.5px solid #ff4444", borderRadius: 8, cursor: "pointer", fontWeight: "bold", fontSize: 14, minHeight: 48 }}>
                      Invalidate
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Dispense Modal */}
      {dispensingATF && (
        <div style={overlayStyle}>
          <div onClick={e => e.stopPropagation()} style={modalBox(isMobile)}>
            {isMobile && <div style={dragHandle} />}
            <h3 style={{ marginBottom: 4, color: "#171717" }}>Confirm Dispensing</h3>
            <p style={{ color: "#888", fontSize: 13, marginBottom: 20 }}>Enter the rate per litre at which you dispensed</p>

            <div style={{ background: "#f9f9f9", borderRadius: 8, padding: 16, marginBottom: 20 }}>
              <p style={{ margin: "0 0 6px" }}><strong>ATF:</strong> <span style={{ fontFamily: "monospace", letterSpacing: 2 }}>{dispensingATF.atf_code}</span></p>
              <p style={{ margin: "0 0 6px" }}><strong>Driver:</strong> {dispensingATF.driver_name}</p>
              <p style={{ margin: "0 0 6px" }}><strong>Truck:</strong> {dispensingATF.plate_number}</p>
              <p style={{ margin: 0 }}><strong>Litres:</strong> {dispensingATF.litres}L</p>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={label}>Rate per Litre (₦) *</label>
              <ModernInput type="text" inputMode="numeric" placeholder="e.g. 1,200" value={ratePerLitre} onChange={e => { setRatePerLitre(formatAmount(e.target.value)); setDispenseError("") }} style={inputStyle} />
            </div>

            {ratePerLitre && parseAmount(ratePerLitre) > 0 && (
              <div style={{ background: "#f0f7ff", border: "1px solid #0070f322", borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
                <p style={{ margin: 0, fontSize: 13, color: "#0070f3" }}>
                  Total: <strong>₦{(dispensingATF.litres * parseAmount(ratePerLitre)).toLocaleString()}</strong>
                </p>
              </div>
            )}

            {dispenseError && <p style={err}>{dispenseError}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setDispensingATF(null); setRatePerLitre(""); setDispenseError("") }} style={cancelBtn}>Cancel</button>
              <button onClick={handleDispense} disabled={dispenseLoading} style={primaryBtn}>
                {dispenseLoading ? "Confirming..." : "Confirm Dispensed"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invalidate Modal */}
      {invalidatingATF && (
        <div style={overlayStyle}>
          <div onClick={e => e.stopPropagation()} style={modalBox(isMobile)}>
            {isMobile && <div style={dragHandle} />}
            <h3 style={{ marginBottom: 4, color: "#ff4444" }}>Invalidate ATF</h3>
            <p style={{ color: "#888", fontSize: 13, marginBottom: 20 }}>
              <span style={{ fontFamily: "monospace", fontWeight: "bold", color: "#171717" }}>{invalidatingATF.atf_code}</span> — {invalidatingATF.litres}L for {invalidatingATF.driver_name}
            </p>
            <div style={{ marginBottom: 24 }}>
              <label style={label}>Reason *</label>
              <ModernInput as="textarea" value={invalidateReason} onChange={e => { setInvalidateReason(e.target.value); setInvalidateError("") }} placeholder="e.g. Only 100L available, requested 200L" rows={4} style={{ width: "100%", padding: "12px 14px", boxSizing: "border-box", borderRadius: 8, border: "1.5px solid #ccc", fontSize: 14, resize: "none", background: "white", color: "#171717" }} />
            </div>
            {invalidateError && <p style={err}>{invalidateError}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setInvalidatingATF(null); setInvalidateReason(""); setInvalidateError("") }} style={cancelBtn}>Cancel</button>
              <button onClick={handleInvalidate} disabled={invalidateLoading} style={{ ...primaryBtn, background: "#ff4444" }}>
                {invalidateLoading ? "Invalidating..." : "Confirm Invalidate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const overlayStyle: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 100 }
const modalBox = (isMobile: boolean): React.CSSProperties => ({ background: "white", borderRadius: isMobile ? "16px 16px 0 0" : 12, padding: isMobile ? "24px 20px 36px" : 32, width: isMobile ? "100%" : 440, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" })
const dragHandle: React.CSSProperties = { width: 40, height: 4, background: "#ddd", borderRadius: 2, margin: "0 auto 20px" }
const label: React.CSSProperties = { display: "block", fontWeight: "bold", marginBottom: 6, fontSize: 14, color: "#171717" }
const err: React.CSSProperties = { color: "red", fontSize: 13, marginBottom: 12 }
const inputStyle: React.CSSProperties = { width: "100%", padding: "12px 14px", boxSizing: "border-box", borderRadius: 8, border: "1.5px solid #ccc", fontSize: 15, background: "white", color: "#171717", minHeight: 48 }
const primaryBtn: React.CSSProperties = { flex: 1, padding: "12px 0", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold", fontSize: 15, minHeight: 48 }
const cancelBtn: React.CSSProperties = { flex: 1, padding: "12px 0", background: "white", border: "1.5px solid #ddd", borderRadius: 8, cursor: "pointer", fontSize: 15, minHeight: 48, color: "#171717" }