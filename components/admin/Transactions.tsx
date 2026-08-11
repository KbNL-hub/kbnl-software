"use client"

import React, { useState, useEffect, useRef } from "react"
import { Icon } from "@iconify/react"
import { supabase } from "@/lib/supabase"
import { apiMutate } from "@/lib/api-mutation"
import { formatAmount, parseAmount } from "@/lib/formatAmount"
import { BANKS, FONT_SIZE } from "@/lib/constants"
import { useBreakpoint } from "@/app/hooks/useBreakpoint"
import ModernInput from "@/components/ModernInput"
import { EmptyState } from "@/components/admin/EmptyState"
import type { User } from "@supabase/supabase-js"

type Transaction = {
  transaction_id: string
  from_account: string
  to_account: string
  amount: number
  description: string | null
  created_by: string | null
  created_at: string
}

const DESTINATIONS = ["Calabar", "Ikom", "Ogoja", "Uyo", "Haulage"] as const

const DESTINATION_META: Record<string, { icon: string; tag: string }> = {
  Calabar: { icon: "mdi:office-building", tag: "Cash Office" },
  Ikom: { icon: "mdi:office-building", tag: "Cash Office" },
  Ogoja: { icon: "mdi:office-building", tag: "Cash Office" },
  Uyo: { icon: "mdi:office-building", tag: "Cash Office" },
  Haulage: { icon: "mdi:car-wrench", tag: "Maintenance Fund" },
}

export default function Transactions() {
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"
  const formRef = useRef<HTMLDivElement>(null)

  const [adminUser, setAdminUser] = useState<User | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [balances, setBalances] = useState<Record<string, number | null>>({})
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  const [fromAccount, setFromAccount] = useState("")
  const [toAccount, setToAccount] = useState<string>("Calabar")
  const [amount, setAmount] = useState("")
  const [description, setDescription] = useState("")

  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  async function fetchTransactions() {
    const { data } = await supabase
      .from("transactions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100)
    setTransactions(data || [])
  }

  async function fetchBalances() {
    const { data: offices } = await supabase
      .from("cash_offices")
      .select("office_name, current_balance")
    const { data: maintenance } = await supabase
      .from("maintenance_balance")
      .select("current_balance")
      .eq("id", 1)
      .single()

    const next: Record<string, number | null> = {}
    for (const o of DESTINATIONS) {
      if (o === "Haulage") {
        next[o] = maintenance?.current_balance ?? null
      } else {
        next[o] = offices?.find(x => x.office_name === o)?.current_balance ?? null
      }
    }
    setBalances(next)
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setAdminUser(data.user)
      return Promise.all([fetchTransactions(), fetchBalances()])
    }).then(() => {
      setLoading(false)
    }).catch(() => {
      setLoading(false)
    })
  }, [])

  const currentBalance = balances[toAccount]
  const amountNum = parseAmount(amount)
  const amountValid = amountNum > 0
  const canSend = !!fromAccount && amountValid && !!adminUser

  function handleSelectDestination(dest: string) {
    setToAccount(dest)
    setError("")
  }

  function handleBalanceClick(dest: string) {
    setToAccount(dest)
    setError("")
    if (formRef.current) {
      formRef.current.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  async function handleSend() {
    if (!canSend) return
    if (!adminUser) return
    setSending(true)
    setError("")
    setMessage("")

    try {
      const { data, error: apiError } = await apiMutate("finance", {
        action: "rpc",
        function: "create_transaction",
        params: {
          p_from_account: fromAccount,
          p_to_account: toAccount,
          p_amount: amountNum,
          p_description: description.trim() || null,
          p_created_by: adminUser.id,
        },
      })

      if (apiError) {
        setError(apiError)
        return
      }

      const result = data as { success?: boolean; error?: string; new_balance?: number } | null
      if (result && result.success === false) {
        setError(result.error || "Transfer failed")
        return
      }

      if (result && typeof result.new_balance === "number") {
        setBalances(prev => ({ ...prev, [toAccount]: result.new_balance! }))
      }

      setAmount("")
      setDescription("")
      setMessage(`₦${amountNum.toLocaleString()} sent to ${toAccount} successfully!`)
      await fetchTransactions()
      setTimeout(() => setMessage(""), 3000)
    } catch {
      setError("Network error, please try again")
    } finally {
      setSending(false)
    }
  }

  const totalTransferred = transactions.reduce((sum, t) => sum + (t.amount || 0), 0)

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", minHeight: "100vh", background: "#f8fafc", padding: isMobile ? 16 : 32 }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ margin: 0, color: "#0f172a", fontSize: isMobile ? FONT_SIZE["2xl"] : FONT_SIZE["3xl"], fontWeight: 700, letterSpacing: "-0.5px" }}>
          Transactions
        </h1>
        <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: FONT_SIZE.base }}>
          Top up cash offices and the Haulage maintenance fund.
        </p>
      </div>

      {/* Messages */}
      {message && (
        <div style={{ padding: "12px 16px", background: "#f0fdf4", borderLeft: "4px solid #16a34a", color: "#15803d", borderRadius: 6, marginBottom: 24, fontSize: FONT_SIZE.sm, fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon icon="mdi:check-circle" width={18} />
          <span style={{ flex: 1 }}>{message}</span>
          <button onClick={() => setMessage("")} style={{ background: "none", border: "none", color: "#15803d", cursor: "pointer", padding: 4, display: "flex" }}>
            <Icon icon="mdi:close" width={16} />
          </button>
        </div>
      )}
      {error && (
        <div style={{ padding: "12px 16px", background: "#fef2f2", borderLeft: "4px solid #ef4444", color: "#b91c1c", borderRadius: 6, marginBottom: 24, fontSize: FONT_SIZE.sm, fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon icon="mdi:alert-circle" width={18} />
          <span style={{ flex: 1 }}>{error}</span>
          <button onClick={() => setError("")} style={{ background: "none", border: "none", color: "#b91c1c", cursor: "pointer", padding: 4, display: "flex" }}>
            <Icon icon="mdi:close" width={16} />
          </button>
        </div>
      )}

      {/* Balance Overview */}
      <div style={{ background: "white", borderRadius: 16, border: "1px solid #e2e8f0", padding: isMobile ? 20 : 28, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <Icon icon="mdi:office-building" width={20} color="#0070f3" />
          <h2 style={{ margin: 0, fontSize: FONT_SIZE.lg, fontWeight: 600, color: "#0f172a" }}>Account Balances</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
          {DESTINATIONS.map(d => {
            const isActive = toAccount === d
            const isHaulage = d === "Haulage"
            const bal = balances[d]
            return (
              <button
                key={d}
                onClick={() => handleBalanceClick(d)}
                style={{
                  background: isActive ? (isHaulage ? "#fffbeb" : "#f0f7ff") : "#f8fafc",
                  border: `1px solid ${isActive ? (isHaulage ? "#fde68a" : "#bfdbfe") : "#e2e8f0"}`,
                  borderRadius: 10,
                  padding: 14,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <Icon icon={DESTINATION_META[d].icon} width={14} color={isActive ? (isHaulage ? "#b45309" : "#0070f3") : "#64748b"} />
                  <span style={{ fontSize: FONT_SIZE.sm, fontWeight: 600, color: isActive ? (isHaulage ? "#b45309" : "#0f172a") : "#475569" }}>{d}</span>
                </div>
                <p style={{ margin: 0, fontSize: FONT_SIZE.xl, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.5px" }}>
                  {bal != null ? `₦${bal.toLocaleString()}` : "—"}
                </p>
                <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>{DESTINATION_META[d].tag}</p>
              </button>
            )
          })}
        </div>
      </div>

      {/* Transfer Form */}
      <div ref={formRef} style={{ background: "white", borderRadius: 16, border: "1px solid #e2e8f0", padding: isMobile ? 20 : 28, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <Icon icon="mdi:bank-transfer" width={20} color="#0070f3" />
          <h2 style={{ margin: 0, fontSize: FONT_SIZE.lg, fontWeight: 600, color: "#0f172a" }}>New Transfer</h2>
          {currentBalance != null && (
            <span style={{ marginLeft: "auto", fontSize: FONT_SIZE.xs, color: "#64748b", background: "#f1f5f9", padding: "4px 10px", borderRadius: 6 }}>
              {toAccount}: <strong style={{ color: "#0f172a" }}>₦{currentBalance.toLocaleString()}</strong>
            </span>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* From Account */}
          <div>
            <label style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: FONT_SIZE.sm, fontWeight: 500 }}>
              From Account <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <ModernInput
              as="select"
              value={fromAccount}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { setFromAccount(e.target.value); setError("") }}
            >
              <option value="">Select bank account…</option>
              {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
            </ModernInput>
          </div>

          {/* To Destination */}
          <div>
            <label style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: FONT_SIZE.sm, fontWeight: 500 }}>
              To <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", background: "#f1f5f9", padding: 4, borderRadius: 10 }}>
              {DESTINATIONS.map(d => {
                const isActive = toAccount === d
                const isHaulage = d === "Haulage"
                return (
                  <button
                    key={d}
                    onClick={() => handleSelectDestination(d)}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 6,
                      border: "none",
                      background: isActive ? (isHaulage ? "#f5a623" : "white") : "transparent",
                      color: isActive ? (isHaulage ? "white" : "#0f172a") : "#64748b",
                      cursor: "pointer",
                      fontWeight: isActive ? 600 : 500,
                      fontSize: FONT_SIZE.sm,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      transition: "all 0.15s ease",
                      boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                    }}
                  >
                    <Icon icon={DESTINATION_META[d].icon} width={14} />
                    {d}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Amount */}
          <div>
            <label style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: FONT_SIZE.sm, fontWeight: 500 }}>
              Amount <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: FONT_SIZE.xl, fontWeight: 700, color: "#94a3b8", pointerEvents: "none" }}>₦</span>
              <ModernInput
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={amount}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setAmount(formatAmount(e.target.value)); setError("") }}
                style={{ paddingLeft: 44, fontSize: 20, fontWeight: 700, minHeight: 52 }}
              />
            </div>
            {amountValid && toAccount && (
              <p style={{ margin: "8px 0 0", fontSize: FONT_SIZE.xs, color: "#64748b" }}>
                {toAccount} will receive <strong style={{ color: "#0f172a" }}>₦{amountNum.toLocaleString()}</strong>
                {currentBalance != null && <> — new balance ≈ <strong style={{ color: "#0070f3" }}>₦{(currentBalance + amountNum).toLocaleString()}</strong></>}
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <label style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: FONT_SIZE.sm, fontWeight: 500 }}>
              Description <span style={{ color: "#94a3b8", fontWeight: 400 }}>(optional)</span>
            </label>
            <ModernInput
              as="textarea"
              placeholder="e.g. Monthly allocation for Calabar office"
              value={description}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
              rows={2}
              style={{ resize: "none", minHeight: 72 }}
            />
          </div>

          {/* Send Button */}
          <button
            onClick={handleSend}
            disabled={!canSend || sending}
            style={{
              width: "100%",
              padding: isMobile ? "14px" : "16px",
              marginTop: 4,
              background: !canSend || sending ? "#94a3b8" : "#0070f3",
              color: "white",
              border: "none",
              borderRadius: 10,
              cursor: !canSend || sending ? "not-allowed" : "pointer",
              fontWeight: 600,
              fontSize: FONT_SIZE.md,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              opacity: !canSend || sending ? 0.7 : 1,
              transition: "all 0.15s ease",
              boxShadow: canSend && !sending ? "0 4px 12px rgba(0,112,243,0.2)" : "none",
            }}
          >
            {sending ? (
              <>
                <Icon icon="mdi:loading" width={18} style={{ animation: "spin 1s linear infinite" }} />
                Sending…
              </>
            ) : (
              <>
                <Icon icon="mdi:send" width={18} />
                Send Transfer
              </>
            )}
          </button>
        </div>
      </div>

      {/* Transaction History */}
      <div style={{ background: "white", borderRadius: 16, border: "1px solid #e2e8f0", padding: isMobile ? 20 : 28, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 12, marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: FONT_SIZE.lg, fontWeight: 600, color: "#0f172a", display: "flex", alignItems: "center", gap: 8 }}>
              <Icon icon="mdi:history" width={20} color="#0070f3" />
              Transaction History
            </h2>
            <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: FONT_SIZE.sm }}>
              {transactions.length} transfer{transactions.length === 1 ? "" : "s"} recorded
            </p>
          </div>
          {totalTransferred > 0 && (
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 14px" }}>
              <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#94a3b8", fontWeight: 600 }}>TOTAL RECENT</p>
              <p style={{ margin: "2px 0 0", fontSize: FONT_SIZE.lg, fontWeight: 700, color: "#0070f3" }}>₦{totalTransferred.toLocaleString()}</p>
            </div>
          )}
        </div>

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "64px 0" }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid #e2e8f0", borderTopColor: "#0070f3", animation: "spin 1s linear infinite" }} />
          </div>
        ) : transactions.length === 0 ? (
          <EmptyState
            icon={<Icon icon="mdi:swap-horizontal" width={28} color="#94a3b8" />}
            title="No transactions yet"
            description="Transfers you make will appear here."
          />
        ) : (
          <>
            {/* Desktop Table */}
            {!isMobile && (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                      {["Amount", "From", "To", "Description", "Date & Time"].map(h => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: FONT_SIZE.xs, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t, idx) => {
                      const isMaintenance = t.to_account === "Haulage"
                      return (
                        <tr
                          key={t.transaction_id}
                          style={{ borderBottom: idx < transactions.length - 1 ? "1px solid #f1f5f9" : "none", transition: "background 0.15s ease" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          <td style={{ padding: "12px 14px", fontSize: FONT_SIZE.base, fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap" }}>
                            +₦{t.amount.toLocaleString()}
                          </td>
                          <td style={{ padding: "12px 14px", fontSize: FONT_SIZE.sm, color: "#475569", whiteSpace: "nowrap" }}>{t.from_account}</td>
                          <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                            <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: FONT_SIZE.xs, fontWeight: 600, background: isMaintenance ? "#fffbeb" : "#f0f7ff", color: isMaintenance ? "#b45309" : "#0070f3", display: "inline-flex", alignItems: "center", gap: 4 }}>
                              <Icon icon={DESTINATION_META[t.to_account]?.icon || "mdi:office-building"} width={12} />
                              {t.to_account}
                            </span>
                          </td>
                          <td style={{ padding: "12px 14px", fontSize: FONT_SIZE.sm, color: "#475569", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {t.description || <span style={{ color: "#cbd5e1", fontStyle: "italic" }}>—</span>}
                          </td>
                          <td style={{ padding: "12px 14px", fontSize: FONT_SIZE.xs, color: "#94a3b8", whiteSpace: "nowrap" }}>
                            {new Date(t.created_at).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Mobile Card List */}
            {isMobile && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {transactions.map(t => {
                  const isMaintenance = t.to_account === "Haulage"
                  return (
                    <div key={t.transaction_id} style={{ background: "#f8fafc", borderRadius: 10, padding: 14, border: "1px solid #e2e8f0" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <p style={{ margin: 0, fontSize: FONT_SIZE.base, fontWeight: 700, color: "#0f172a" }}>+₦{t.amount.toLocaleString()}</p>
                        <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: FONT_SIZE.xs, fontWeight: 600, background: isMaintenance ? "#fffbeb" : "#f0f7ff", color: isMaintenance ? "#b45309" : "#0070f3", display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <Icon icon={DESTINATION_META[t.to_account]?.icon || "mdi:office-building"} width={12} />
                          {t.to_account}
                        </span>
                      </div>
                      <p style={{ margin: "0 0 6px", fontSize: FONT_SIZE.sm, color: "#475569" }}>
                        {t.from_account} → {t.to_account}
                      </p>
                      {t.description && (
                        <p style={{ margin: "0 0 6px", fontSize: FONT_SIZE.sm, color: "#64748b" }}>{t.description}</p>
                      )}
                      <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>
                        {new Date(t.created_at).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
