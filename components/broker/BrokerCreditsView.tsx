"use client"

import { useState, useEffect } from "react"
import { Icon } from "@iconify/react"
import { supabase } from "@/lib/supabase"
import { formatAmount } from "@/lib/formatAmount"
import { useBreakpoint } from "@/app/hooks/useBreakpoint"

type CreditEntry = {
  credit_id: string
  broker_id: string
  customer_name: string
  customer_id: string | null
  amount: number
  status: "Active" | "Cleared"
  created_at: string
  cleared_at: string | null
}

type ViewMode = "card" | "table"

const fontSize = {
  xs: 12, sm: 13, base: 14, md: 15, lg: 16, xl: 20, "2xl": 24, "3xl": 28
}

export default function BrokerCreditsView() {
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"
  const [credits, setCredits] = useState<CreditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [viewMode, setViewMode] = useState<ViewMode>("card")

  useEffect(() => { fetchCredits() }, [])

  async function fetchCredits() {
    setLoading(true)
    setError("")
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError("Not authenticated"); setLoading(false); return }

      let brokerId = user.id

      const { data: brokerRecord, error: brokerErr } = await supabase
        .from("Brokers")
        .select("broker_id")
        .eq("broker_id", user.id)
        .maybeSingle()

      if (brokerRecord?.broker_id) {
        brokerId = brokerRecord.broker_id
      }

      const { data, error: queryError } = await supabase
        .from("broker_credits")
        .select("*")
        .eq("broker_id", brokerId)
        .order("created_at", { ascending: false })

      if (queryError) { setError(queryError.message); setLoading(false); return }
      if (data) setCredits(data as CreditEntry[])
    } catch (err: any) {
      setError(err?.message || "Failed to load credits")
    } finally {
      setLoading(false)
    }
  }

  const activeTotal = credits
    .filter(c => c.status === "Active")
    .reduce((sum, c) => sum + Number(c.amount), 0)

  const displayedCredits = credits

  const tblHeadStyle: React.CSSProperties = {
    padding: "12px 16px", fontWeight: 600, fontSize: fontSize.xs,
    color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px",
  }

  if (loading && credits.length === 0) {
    return (
      <div style={{ padding: "24px 16px", maxWidth: 960, margin: "0 auto" }}>
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <div style={{ width: 36, height: 36, border: "3px solid #e5e7eb", borderTopColor: "#0070f3", borderRadius: "50%", margin: "0 auto 12px", animation: "spin 0.8s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          <p style={{ color: "#9ca3af", fontSize: 14, margin: 0 }}>Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: "24px 16px", maxWidth: 960, margin: "0 auto" }}>
      {/* Total card */}
      <div style={{ background: "#171717", borderRadius: 16, padding: "24px 20px", marginBottom: 24, color: "white" }}>
        <p style={{ fontSize: fontSize.base, opacity: 0.7, margin: 0, marginBottom: 4 }}>
          My Total Credit
        </p>
        <p style={{ fontSize: isMobile ? 28 : 36, fontWeight: "bold", margin: 0 }}>
          ₦{formatAmount(String(activeTotal)) || "0"}
        </p>
      </div>

      {/* Error state */}
      {error && (
        <div style={{ padding: "12px 16px", background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", borderRadius: 8, marginBottom: 16, fontSize: fontSize.sm, fontWeight: 500 }}>
          {error}
        </div>
      )}

      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ fontSize: fontSize.lg, color: "#171717", margin: 0 }}>
          Credits
        </h2>
        {credits.length > 0 && (
          <div style={{ display: "flex", background: "white", border: "1px solid #e2e8f0", borderRadius: 8, padding: 4, gap: 0 }}>
            <button
              onClick={() => setViewMode("card")}
              style={{
                padding: "8px 12px", background: viewMode === "card" ? "#0070f3" : "transparent",
                color: viewMode === "card" ? "white" : "#64748b", border: "none", borderRadius: 6,
                cursor: "pointer", fontSize: fontSize.xs, fontWeight: 600, transition: "all 0.2s ease",
                minWidth: 44, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
              }}
              title="Card view"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z"/></svg>
            </button>
            <button
              onClick={() => setViewMode("table")}
              style={{
                padding: "8px 12px", background: viewMode === "table" ? "#0070f3" : "transparent",
                color: viewMode === "table" ? "white" : "#64748b", border: "none", borderRadius: 6,
                cursor: "pointer", fontSize: fontSize.xs, fontWeight: 600, transition: "all 0.2s ease",
                minWidth: 44, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
              }}
              title="Table view"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 4h18v2H3V4zm0 7h18v2H3v-2zm0 7h18v2H3v-2z"/></svg>
            </button>
          </div>
        )}
      </div>



      {/* Content */}
      {displayedCredits.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "100%", boxSizing: "border-box" }}>
          <Icon icon="mdi:credit-card-off" width={48} color="#d1d5db" />
          <p style={{ color: "#9ca3af", fontSize: 15, margin: "12px 0 0 0" }}>
            No credits
          </p>
        </div>
      ) : viewMode === "card" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {displayedCredits.map(c => (
            <div key={c.credit_id} style={{ background: "white", borderRadius: 12, padding: "16px 18px", border: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <span style={{ fontSize: fontSize.base, fontWeight: 600, color: "#171717" }}>{c.customer_name}</span>
                <div style={{ display: "flex", gap: 16, marginTop: 4, fontSize: fontSize.sm, color: "#6b7280" }}>
                  <span>₦{formatAmount(String(c.amount))}</span>
                  <span>{new Date(c.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              {c.status === "Cleared" ? (
                <span style={{ padding: "4px 10px", borderRadius: 999, fontSize: fontSize.xs, fontWeight: "bold", background: "#f0fdf4", color: "#16a34a", whiteSpace: "nowrap" }}>
                  Cleared
                </span>
              ) : (
                <span style={{ padding: "4px 10px", borderRadius: 999, fontSize: fontSize.xs, fontWeight: "bold", background: "#f0f7ff", color: "#0070f3", whiteSpace: "nowrap" }}>
                  Active
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                <th style={tblHeadStyle}>Customer</th>
                <th style={{ ...tblHeadStyle, textAlign: "right" }}>Amount</th>
                <th style={{ ...tblHeadStyle, textAlign: "right" }}>Date</th>
                <th style={{ ...tblHeadStyle, textAlign: "right" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {displayedCredits.map((c, idx) => (
                <tr key={c.credit_id} style={{ borderBottom: idx === displayedCredits.length - 1 ? "none" : "1px solid #e2e8f0" }}>
                  <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: fontSize.base, fontWeight: 500 }}>{c.customer_name}</td>
                  <td style={{ padding: "12px 16px", textAlign: "right", color: "#475569", fontSize: fontSize.sm, fontWeight: 600 }}>₦{formatAmount(String(c.amount))}</td>
                  <td style={{ padding: "12px 16px", textAlign: "right", color: "#64748b", fontSize: fontSize.sm }}>{new Date(c.created_at).toLocaleDateString()}</td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }}>
                    {c.status === "Cleared" ? (
                      <span style={{ padding: "4px 10px", borderRadius: 999, fontSize: fontSize.xs, fontWeight: "bold", background: "#f0fdf4", color: "#16a34a" }}>
                        Cleared
                      </span>
                    ) : (
                      <span style={{ padding: "4px 10px", borderRadius: 999, fontSize: fontSize.xs, fontWeight: "bold", background: "#f0f7ff", color: "#0070f3" }}>
                        Active
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
