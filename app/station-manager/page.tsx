"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

type FuelRequest = {
  request_id: string
  driver_name: string
  litres: number
  rate_per_litre: number
  total_amount: number
  status: "Pending" | "Validated" | "Rejected"
  requested_at: string
}

const filters = ["Pending", "All", "Validated", "Rejected"]

export default function StationManagerDashboard() {
  const router = useRouter()
  const [managerId, setManagerId] = useState("")
  const [companyId, setCompanyId] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [requests, setRequests] = useState<FuelRequest[]>([])
  const [filter, setFilter] = useState("Pending")
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Validate modal
  const [validating, setValidating] = useState<FuelRequest | null>(null)
  const [validateLoading, setValidateLoading] = useState(false)

  // Reject modal
  const [rejecting, setRejecting] = useState<FuelRequest | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [rejectError, setRejectError] = useState("")
  const [rejectLoading, setRejectLoading] = useState(false)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push("/login"); return }

      const { data: profile } = await supabase
        .from("Profiles")
        .select("role")
        .eq("user_id", user.id)
        .single()

      if (profile?.role !== "StationManager") { router.push("/login"); return }

      const { data: manager } = await supabase
        .from("station_managers")
        .select("manager_id, company_id")
        .eq("manager_id", user.id)
        .single()

      if (!manager) { router.push("/login"); return }

      setManagerId(manager.manager_id)
      setCompanyId(manager.company_id)

      const { data: company } = await supabase
        .from("fuel_companies")
        .select("company_name")
        .eq("company_id", manager.company_id)
        .single()

      setCompanyName(company?.company_name ?? "")
      await fetchRequests(manager.company_id)
      setLoading(false)
    }

    init()
  }, [])

  useEffect(() => {
    if (!companyId) return
    const interval = setInterval(() => fetchRequests(companyId), 30000)
    return () => clearInterval(interval)
  }, [companyId])

  async function fetchRequests(cId: string) {
    const { data: requestsRaw } = await supabase
      .from("fuel_requests")
      .select("request_id, driver_id, litres, rate_per_litre, total_amount, status, requested_at")
      .eq("company_id", cId)
      .order("requested_at", { ascending: false })

    if (!requestsRaw) return

    const enriched = await Promise.all(
      requestsRaw.map(async (r) => {
        const { data: driver } = await supabase
          .from("Drivers")
          .select("full_name")
          .eq("driver_id", r.driver_id)
          .single()

        return {
          request_id: r.request_id,
          driver_name: driver?.full_name ?? "Unknown",
          litres: r.litres,
          rate_per_litre: r.rate_per_litre,
          total_amount: r.total_amount,
          status: r.status,
          requested_at: r.requested_at,
        }
      })
    )

    setRequests(enriched)
    setLastUpdated(new Date())
  }

  async function handleValidate() {
    if (!validating) return
    setValidateLoading(true)

    // Update request status
    await supabase
      .from("fuel_requests")
      .update({ status: "Validated", validated_at: new Date().toISOString(), validated_by: managerId })
      .eq("request_id", validating.request_id)

    // Deduct from company balance
    const { data: company } = await supabase
      .from("fuel_companies")
      .select("current_balance")
      .eq("company_id", companyId)
      .single()

    if (company) {
      const newBalance = Math.max(0, company.current_balance - validating.total_amount)
      await supabase
        .from("fuel_companies")
        .update({ current_balance: newBalance })
        .eq("company_id", companyId)
    }

    setValidateLoading(false)
    setValidating(null)
    fetchRequests(companyId)
  }

  async function handleReject() {
    if (!rejecting) return
    if (!rejectReason.trim()) return setRejectError("Please provide a reason")

    setRejectLoading(true)
    await supabase
      .from("fuel_requests")
      .update({ status: "Rejected", rejection_reason: rejectReason.trim() })
      .eq("request_id", rejecting.request_id)

    setRejectLoading(false)
    setRejecting(null)
    setRejectReason("")
    setRejectError("")
    fetchRequests(companyId)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push("/login")
  }

  const filteredRequests = filter === "All"
    ? requests
    : requests.filter((r) => r.status === filter)

  const statusColor = (status: string) => {
    switch (status) {
      case "Pending": return { bg: "#fff8e1", color: "#f5a623" }
      case "Validated": return { bg: "#00aa0022", color: "#00aa00" }
      case "Rejected": return { bg: "#ff444422", color: "#ff4444" }
      default: return { bg: "#eee", color: "#888" }
    }
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "Arial" }}>
        <p style={{ color: "#888" }}>Loading...</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f9f9f9", fontFamily: "Arial" }}>
      {/* Header */}
      <div style={{
        background: "white", borderBottom: "1px solid #eee",
        padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center"
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Station Manager</h2>
          <p style={{ margin: 0, fontSize: 13, color: "#888" }}>{companyName}</p>
        </div>
        <button
          onClick={handleLogout}
          style={{
            padding: "8px 20px", background: "#ff4444", color: "white",
            border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14
          }}
        >
          Logout
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
        {/* Filter pills + refresh */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {filters.map((f) => (
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
            <button
              onClick={() => fetchRequests(companyId)}
              style={{
                padding: "4px 12px", fontSize: 12, cursor: "pointer",
                borderRadius: 4, border: "1px solid #ddd", background: "white"
              }}
            >
              Refresh
            </button>
          </div>
        </div>

        {filteredRequests.length === 0 && (
          <p style={{ color: "#888" }}>No {filter === "All" ? "" : filter.toLowerCase()} requests.</p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filteredRequests.map((r) => {
            const { bg, color } = statusColor(r.status)
            return (
              <div
                key={r.request_id}
                style={{
                  background: "white", border: "1px solid #eee",
                  borderRadius: 10, padding: 20,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.04)"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: "bold", fontSize: 15 }}>{r.driver_name}</p>
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: "#aaa" }}>
                      {new Date(r.requested_at).toLocaleString()}
                    </p>
                  </div>
                  <span style={{
                    padding: "4px 10px", borderRadius: 12, fontSize: 12,
                    background: bg, color, fontWeight: "bold"
                  }}>
                    {r.status}
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                  <div style={{ background: "#f9f9f9", borderRadius: 6, padding: "8px 12px" }}>
                    <p style={{ margin: 0, fontSize: 11, color: "#888" }}>Litres</p>
                    <p style={{ margin: 0, fontWeight: "bold" }}>{r.litres.toLocaleString()}L</p>
                  </div>
                  <div style={{ background: "#f9f9f9", borderRadius: 6, padding: "8px 12px" }}>
                    <p style={{ margin: 0, fontSize: 11, color: "#888" }}>Rate/Litre</p>
                    <p style={{ margin: 0, fontWeight: "bold" }}>₦{r.rate_per_litre.toLocaleString()}</p>
                  </div>
                  <div style={{ background: "#f9f9f9", borderRadius: 6, padding: "8px 12px" }}>
                    <p style={{ margin: 0, fontSize: 11, color: "#888" }}>Total</p>
                    <p style={{ margin: 0, fontWeight: "bold", color: "#0070f3" }}>₦{r.total_amount.toLocaleString()}</p>
                  </div>
                </div>

                {r.status === "Pending" && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => setValidating(r)}
                      style={{
                        flex: 1, padding: "10px 0", background: "#00aa00",
                        color: "white", border: "none", borderRadius: 6,
                        cursor: "pointer", fontWeight: "bold", fontSize: 14
                      }}
                    >
                      Validate
                    </button>
                    <button
                      onClick={() => { setRejecting(r); setRejectReason(""); setRejectError("") }}
                      style={{
                        flex: 1, padding: "10px 0", background: "white",
                        color: "#ff4444", border: "1px solid #ff4444", borderRadius: 6,
                        cursor: "pointer", fontWeight: "bold", fontSize: 14
                      }}
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

      {/* Validate Confirmation Modal */}
      {validating && (
        <div style={overlay}>
          <div style={modal}>
            <h3 style={{ marginBottom: 12 }}>Confirm Validation</h3>
            <p style={{ color: "#555", marginBottom: 16 }}>
              Confirm that this diesel request is correct:
            </p>
            <div style={{ background: "#f9f9f9", borderRadius: 8, padding: 16, marginBottom: 24 }}>
              <p style={{ margin: "0 0 8px" }}><strong>Driver:</strong> {validating.driver_name}</p>
              <p style={{ margin: "0 0 8px" }}><strong>Litres:</strong> {validating.litres.toLocaleString()}L</p>
              <p style={{ margin: "0 0 8px" }}><strong>Rate/Litre:</strong> ₦{validating.rate_per_litre.toLocaleString()}</p>
              <p style={{ margin: 0 }}><strong>Total:</strong> <span style={{ color: "#0070f3", fontWeight: "bold" }}>₦{validating.total_amount.toLocaleString()}</span></p>
            </div>
            <p style={{ fontSize: 13, color: "#888", marginBottom: 24 }}>
              This will deduct ₦{validating.total_amount.toLocaleString()} from the {companyName} balance.
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
        <div style={overlay}>
          <div style={modal}>
            <h3 style={{ marginBottom: 12 }}>Reject Request</h3>
            <p style={{ color: "#555", marginBottom: 16 }}>
              <strong>{rejecting.driver_name}</strong> — ₦{rejecting.total_amount.toLocaleString()}
            </p>
            <label style={{ display: "block", fontWeight: "bold", marginBottom: 6, fontSize: 14 }}>
              Reason for rejection *
            </label>
            <textarea
              value={rejectReason}
              onChange={(e) => { setRejectReason(e.target.value); setRejectError("") }}
              placeholder="e.g. Incorrect litres entered"
              rows={3}
              style={{
                width: "100%", padding: 10, boxSizing: "border-box",
                borderRadius: 6, border: "1px solid #ddd", fontSize: 14,
                resize: "none", marginBottom: 8
              }}
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

const overlay: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100
}
const modal: React.CSSProperties = {
  background: "white", borderRadius: 12, padding: 32,
  width: 420, maxWidth: "90vw", boxShadow: "0 8px 32px rgba(0,0,0,0.2)"
}
const primaryBtn: React.CSSProperties = {
  flex: 1, padding: "10px 0", background: "#0070f3",
  color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold"
}
const cancelBtn: React.CSSProperties = {
  flex: 1, padding: "10px 0", background: "white",
  border: "1px solid #ddd", borderRadius: 6, cursor: "pointer"
}