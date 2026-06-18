"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { Icon } from "@iconify/react"
import CustomerSelector from "@/components/CustomerSelector"
import { formatAmount, parseAmount } from "@/lib/formatAmount"
import { useBreakpoint } from "@/app/hooks/useBreakpoint"

type Broker = { broker_id: string; broker_name: string }
type CreditEntry = {
  credit_id: string
  broker_id: string
  customer_name: string
  customer_id: string | null
  amount: number
  status: "Active" | "Cleared"
  cleared_at: string | null
  created_by: string
  created_at: string
}
type BrokerTotal = Broker & { total_credit: number }
type ViewMode = "card" | "table"

const fontSize = {
  xs: 12, sm: 13, base: 14, md: 15, lg: 16, xl: 20, "2xl": 24, "3xl": 28,
}

export default function BrokerCredits() {
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"
  const [view, setView] = useState<"overview" | "detail">("overview")
  const [selectedBroker, setSelectedBroker] = useState<Broker | null>(null)
  const [brokerTotals, setBrokerTotals] = useState<BrokerTotal[]>([])
  const [credits, setCredits] = useState<CreditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")
  const [showAddModal, setShowAddModal] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<{ customer_id: string; full_name: string } | null>(null)
  const [amountInput, setAmountInput] = useState("")
  const [viewMode, setViewMode] = useState<ViewMode>("card")

  useEffect(() => { fetchBrokerTotals() }, [])

  const companyTotal = brokerTotals.reduce((sum, b) => sum + b.total_credit, 0)

  async function fetchBrokerTotals() {
    setLoading(true)
    const { data: brokers } = await supabase
      .from("Brokers")
      .select("broker_id, broker_name")
      .order("broker_name", { ascending: true })

    if (!brokers) { setLoading(false); return }

    const { data: creditsData } = await supabase
      .from("broker_credits")
      .select("broker_id, amount")
      .eq("status", "Active")

    const creditMap: Record<string, number> = {}
    creditsData?.forEach(c => {
      creditMap[c.broker_id] = (creditMap[c.broker_id] || 0) + Number(c.amount)
    })

    const totals: BrokerTotal[] = brokers.map(b => ({
      ...b,
      total_credit: creditMap[b.broker_id] || 0,
    }))
    setBrokerTotals(totals)
    setLoading(false)
  }

  async function fetchBrokerCredits(brokerId: string) {
    setLoading(true)
    const { data } = await supabase
      .from("broker_credits")
      .select("*")
      .eq("broker_id", brokerId)
      .order("created_at", { ascending: false })

    if (data) setCredits(data)
    setLoading(false)
  }

  function openBrokerDetail(broker: Broker) {
    setSelectedBroker(broker)
    setView("detail")
    setShowHistory(false)
    fetchBrokerCredits(broker.broker_id)
  }

  function backToOverview() {
    setView("overview")
    setSelectedBroker(null)
    setCredits([])
    setShowHistory(false)
    fetchBrokerTotals()
  }

  const displayedCredits = credits.filter(c =>
    showHistory ? c.status === "Cleared" : c.status === "Active"
  )

  const brokerActiveTotal = credits
    .filter(c => c.status === "Active")
    .reduce((sum, c) => sum + Number(c.amount), 0)

  async function handleAddCredit() {
    if (!selectedCustomer || !selectedBroker) return
    const amount = parseAmount(amountInput)
    if (!amount || amount <= 0) { setErrorMsg("Enter a valid amount"); return }

    setSubmitting(true)
    setErrorMsg("")

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setErrorMsg("Not authenticated"); setSubmitting(false); return }

    const { error } = await supabase.from("broker_credits").insert({
      broker_id: selectedBroker.broker_id,
      customer_name: selectedCustomer.full_name,
      customer_id: selectedCustomer.customer_id || null,
      amount,
      created_by: user.id,
    })

    if (error) { setErrorMsg(error.message); setSubmitting(false); return }

    setShowAddModal(false)
    setSelectedCustomer(null)
    setAmountInput("")
    setSubmitting(false)
    await fetchBrokerCredits(selectedBroker.broker_id)
    await fetchBrokerTotals()
  }

  async function handleClear(credit: CreditEntry) {
    setSubmitting(true)
    setErrorMsg("")
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setErrorMsg("Not authenticated"); setSubmitting(false); return }

    const { error } = await supabase
      .from("broker_credits")
      .update({ status: "Cleared", cleared_at: new Date().toISOString(), cleared_by: user.id })
      .eq("credit_id", credit.credit_id)

    if (error) { setErrorMsg(error.message); setSubmitting(false); return }

    await fetchBrokerCredits(selectedBroker!.broker_id)
    await fetchBrokerTotals()
    setSubmitting(false)
  }

  function openAddModal() {
    setSelectedCustomer(null)
    setAmountInput("")
    setErrorMsg("")
    setShowAddModal(true)
  }

  const tblHeadStyle: React.CSSProperties = {
    padding: "12px 16px", fontWeight: 600, fontSize: fontSize.xs,
    color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px",
  }

  return (
    <div style={{ padding: "24px 16px", maxWidth: 960, margin: "0 auto" }}>
      <div style={{ background: "#171717", borderRadius: 16, padding: "24px 20px", marginBottom: 24, color: "white" }}>
        <p style={{ fontSize: fontSize.base, opacity: 0.7, margin: 0, marginBottom: 4 }}>
          {view === "detail" && selectedBroker
            ? `${selectedBroker.broker_name} — Total Credit`
            : "Total Company Credit"}
        </p>
        <p style={{ fontSize: isMobile ? 28 : 36, fontWeight: "bold", margin: 0 }}>
          ₦{formatAmount(String(view === "detail" && selectedBroker ? brokerActiveTotal : companyTotal)) || "0"}
        </p>
      </div>

      {view === "overview" && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
            <h2 style={{ fontSize: fontSize.lg, color: "#171717", margin: 0 }}>Brokers</h2>
            {brokerTotals.length > 0 && (
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

          {loading && brokerTotals.length === 0 ? (
            <LoadingState />
          ) : brokerTotals.length === 0 ? (
            <EmptyState message="No brokers found" />
          ) : viewMode === "card" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {brokerTotals.map(b => (
                <div
                  key={b.broker_id}
                  onClick={() => openBrokerDetail(b)}
                  style={{
                    background: "white", borderRadius: 12, padding: "16px 18px",
                    border: "1px solid #e5e7eb", cursor: "pointer",
                    transition: "box-shadow 0.2s, border-color 0.2s",
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#0070f3"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,112,243,0.12)" }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.boxShadow = "none" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Icon icon="mdi:handshake" width={20} color="#0070f3" />
                    </div>
                    <span style={{ fontSize: fontSize.base, fontWeight: 600, color: "#171717" }}>{b.broker_name}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: fontSize.md, fontWeight: "bold", color: b.total_credit > 0 ? "#dc2626" : "#6b7280" }}>
                      ₦{formatAmount(String(b.total_credit)) || "0"}
                    </span>
                    <Icon icon="mdi:chevron-right" width={18} color="#9ca3af" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    <th style={tblHeadStyle}>Broker</th>
                    <th style={{ ...tblHeadStyle, textAlign: "right" }}>Total Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {brokerTotals.map((b, idx) => (
                    <tr
                      key={b.broker_id}
                      onClick={() => openBrokerDetail(b)}
                      style={{ borderBottom: idx === brokerTotals.length - 1 ? "none" : "1px solid #e2e8f0", transition: "background 0.2s ease", cursor: "pointer" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 36, height: 36, borderRadius: 8, background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <Icon icon="mdi:handshake" width={18} color="#0070f3" />
                          </div>
                          <span style={{ color: "#0f172a", fontSize: fontSize.base, fontWeight: 500 }}>{b.broker_name}</span>
                        </div>
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                          <span style={{ fontSize: fontSize.md, fontWeight: "bold", color: b.total_credit > 0 ? "#dc2626" : "#6b7280" }}>
                            ₦{formatAmount(String(b.total_credit)) || "0"}
                          </span>
                          <Icon icon="mdi:chevron-right" width={16} color="#9ca3af" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {view === "detail" && selectedBroker && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button onClick={backToOverview} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#6b7280" }}>
                <Icon icon="mdi:arrow-left" width={22} />
              </button>
              <h2 style={{ fontSize: fontSize.lg, color: "#171717", margin: 0 }}>{selectedBroker.broker_name}</h2>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
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
              <button
                onClick={openAddModal}
                style={{ padding: "10px 18px", minHeight: 42, display: "flex", alignItems: "center", gap: 6, fontSize: 13, background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold" }}
              >
                <Icon icon="mdi:plus" width={16} />
                Add Credit
              </button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <button
              onClick={() => setShowHistory(false)}
              style={{
                padding: "8px 14px", borderRadius: 20, fontSize: fontSize.sm, cursor: "pointer",
                border: showHistory ? "1.5px solid #e2e8f0" : "1.5px solid #0070f3",
                background: showHistory ? "white" : "#eff6ff",
                color: showHistory ? "#64748b" : "#0070f3",
                fontWeight: showHistory ? 500 : 600, transition: "all 0.2s ease",
              }}
            >
              Active ({credits.filter(c => c.status === "Active").length})
            </button>
            <button
              onClick={() => setShowHistory(true)}
              style={{
                padding: "8px 14px", borderRadius: 20, fontSize: fontSize.sm, cursor: "pointer",
                border: showHistory ? "1.5px solid #0070f3" : "1.5px solid #e2e8f0",
                background: showHistory ? "#eff6ff" : "white",
                color: showHistory ? "#0070f3" : "#64748b",
                fontWeight: showHistory ? 600 : 500, transition: "all 0.2s ease",
              }}
            >
              History ({credits.filter(c => c.status === "Cleared").length})
            </button>
          </div>

          {errorMsg && (
            <div style={{ padding: "12px 16px", background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", borderRadius: 8, marginBottom: 16, fontSize: fontSize.sm, fontWeight: 500 }}>
              {errorMsg}
            </div>
          )}

          {loading && credits.length === 0 ? (
            <LoadingState />
          ) : displayedCredits.length === 0 ? (
            <EmptyState message={showHistory ? "No cleared credits" : "No active credits — tap Add Credit to file one"} />
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
                  {!showHistory && c.status === "Active" && (
                    <button
                      onClick={() => handleClear(c)}
                      disabled={submitting}
                      style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#16a34a", color: "white", fontWeight: "bold", fontSize: 12, cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.6 : 1, whiteSpace: "nowrap", minHeight: 36 }}
                    >
                      Mark Cleared
                    </button>
                  )}
                  {showHistory && c.status === "Cleared" && (
                    <span style={{ padding: "4px 10px", borderRadius: 999, fontSize: fontSize.xs, fontWeight: "bold", background: "#f0fdf4", color: "#16a34a", whiteSpace: "nowrap" }}>
                      Cleared
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
                    <th style={{ ...tblHeadStyle, textAlign: "right" }}>{showHistory ? "Status" : "Action"}</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedCredits.map((c, idx) => (
                    <tr key={c.credit_id} style={{ borderBottom: idx === displayedCredits.length - 1 ? "none" : "1px solid #e2e8f0" }}>
                      <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: fontSize.base, fontWeight: 500 }}>{c.customer_name}</td>
                      <td style={{ padding: "12px 16px", textAlign: "right", color: "#475569", fontSize: fontSize.sm, fontWeight: 600 }}>₦{formatAmount(String(c.amount))}</td>
                      <td style={{ padding: "12px 16px", textAlign: "right", color: "#64748b", fontSize: fontSize.sm }}>{new Date(c.created_at).toLocaleDateString()}</td>
                      <td style={{ padding: "12px 16px", textAlign: "right" }}>
                        {!showHistory && c.status === "Active" ? (
                          <button
                            onClick={() => handleClear(c)}
                            disabled={submitting}
                            style={{ padding: "6px 10px", borderRadius: 6, border: "none", background: "#16a34a", color: "white", fontWeight: "bold", fontSize: fontSize.xs, cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.6 : 1, minHeight: 32 }}
                          >
                            Mark Cleared
                          </button>
                        ) : (
                          <span style={{ padding: "4px 10px", borderRadius: 999, fontSize: fontSize.xs, fontWeight: "bold", background: "#f0fdf4", color: "#16a34a" }}>
                            Cleared
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {showAddModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }} onClick={() => setShowAddModal(false)}>
          <div style={{ background: "white", borderRadius: 16, padding: 24, width: "100%", maxWidth: 440, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: fontSize.lg, margin: 0, marginBottom: 20, color: "#171717" }}>
              Add Credit — {selectedBroker?.broker_name}
            </h3>

            <label style={{ display: "block", fontSize: fontSize.sm, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Customer</label>
            <CustomerSelector onSelect={(c) => setSelectedCustomer(c)} allowUnsavedNew={true} />

            <label style={{ display: "block", fontSize: fontSize.sm, fontWeight: 600, color: "#374151", marginBottom: 6, marginTop: 16 }}>Amount (₦)</label>
            <input
              type="text"
              placeholder="0"
              value={amountInput}
              onChange={e => setAmountInput(formatAmount(e.target.value))}
              style={{ width: "100%", padding: "12px 14px", boxSizing: "border-box", borderRadius: 8, border: "1.5px solid #ccc", fontSize: 14, background: "white", color: "#171717", outline: "none", minHeight: 48 }}
            />

            {errorMsg && <p style={{ color: "#dc2626", fontSize: fontSize.sm, margin: "12px 0 0 0" }}>{errorMsg}</p>}

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button onClick={() => setShowAddModal(false)} style={{ flex: 1, padding: "12px 0", background: "white", border: "1.5px solid #d1d5db", borderRadius: 8, cursor: "pointer", fontSize: 14, minHeight: 48 }}>Cancel</button>
              <button
                onClick={handleAddCredit}
                disabled={submitting || !selectedCustomer || !parseAmount(amountInput)}
                style={{ flex: 1, padding: "12px 0", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: (submitting || !selectedCustomer || !parseAmount(amountInput)) ? "not-allowed" : "pointer", fontWeight: "bold", fontSize: 14, minHeight: 48, opacity: (submitting || !selectedCustomer || !parseAmount(amountInput)) ? 0.5 : 1 }}
              >
                {submitting ? "Adding..." : "Add Credit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function LoadingState() {
  return (
    <div style={{ textAlign: "center", padding: "60px 0" }}>
      <div style={{ width: 36, height: 36, border: "3px solid #e5e7eb", borderTopColor: "#0070f3", borderRadius: "50%", margin: "0 auto 12px", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <p style={{ color: "#9ca3af", fontSize: 14, margin: 0 }}>Loading...</p>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ textAlign: "center", padding: "60px 20px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "100%", boxSizing: "border-box" }}>
      <Icon icon="mdi:credit-card-off" width={48} color="#d1d5db" />
      <p style={{ color: "#9ca3af", fontSize: 15, margin: "12px 0 0 0" }}>{message}</p>
    </div>
  )
}
