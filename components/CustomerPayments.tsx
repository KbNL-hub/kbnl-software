"use client"

import { useState, useEffect } from "react"
import { Icon } from "@iconify/react"
import { supabase } from "@/lib/supabase"
import { apiMutate } from "@/lib/api-mutation"
import { formatAmount, parseAmount } from "@/lib/formatAmount"
import { useBreakpoint } from "@/app/hooks/useBreakpoint"
import CustomerSelector, { Customer } from "./CustomerSelector"
import { BANKS } from "@/lib/constants"
import { generateCustomerId } from "@/lib/customerUtils"

type Payment = {
  payment_id: string
  bank_name: string
  payment_date: string
  depositor_name: string | null
  customer_id: string | null
  customer_name: string | null
  amount: number
  status: "Pending" | "Posted"
  posted_by: string | null
  posted_at: string | null
  created_at: string
}

type ViewMode = "card" | "table"

const fontSize = {
  xs: 12, sm: 13, base: 14, md: 15, lg: 16, xl: 20, "2xl": 24, "3xl": 28
}

export default function CustomerPayments({ brokerId }: { brokerId: string }) {
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>("card")
  const [showModal, setShowModal] = useState(false)
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null)

  const [bankName, setBankName] = useState("")
  const [paymentDate, setPaymentDate] = useState("")
  const [depositorName, setDepositorName] = useState("")
  const [amount, setAmount] = useState("")
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState("")
  const [profilesMap, setProfilesMap] = useState<Record<string, string>>({})

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchPayments(); fetchProfiles() }, [brokerId])

  async function fetchPayments() {
    setLoading(true)
    const { data, error } = await supabase
      .from("customer_payments")
      .select("*")
      .eq("broker_id", brokerId)
      .order("created_at", { ascending: false })
    if (!error && data) setPayments(data)
    setLoading(false)
  }

  async function fetchProfiles() {
    const { data: profiles } = await supabase.from("Profiles").select("user_id, full_name")
    const { data: brokers } = await supabase.from("Brokers").select("broker_id, broker_name")
    const pMap: Record<string, string> = {}
    profiles?.forEach(p => { pMap[p.user_id] = p.full_name })
    brokers?.forEach(b => { if (!pMap[b.broker_id]) pMap[b.broker_id] = b.broker_name })
    setProfilesMap(pMap)
  }

  function openModal(payment?: Payment) {
    if (payment) {
      setEditingPayment(payment)
      setBankName(payment.bank_name)
      setPaymentDate(payment.payment_date)
      setDepositorName(payment.depositor_name || "")
      setAmount(payment.amount.toString())
      setSelectedCustomer({ customer_id: payment.customer_id || "", full_name: payment.customer_name || "", phone_number: "", isNew: !payment.customer_id })
    } else {
      setEditingPayment(null); setBankName(""); setPaymentDate(""); setDepositorName(""); setAmount(""); setSelectedCustomer(null)
    }
    setMessage(""); setShowModal(true)
  }

  async function handleSubmit() {
    if (!bankName) return setMessage("Please select a bank")
    if (!paymentDate) return setMessage("Payment date is required")
    if (!selectedCustomer) return setMessage("Please select or add a customer")
    if (!depositorName.trim()) return setMessage("Depositor's name is required")
    const parsedAmount = parseAmount(amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) return setMessage("Valid amount is required")

    setSubmitting(true); setMessage("")

    if (editingPayment) {
      const payload = {
        broker_id: brokerId, bank_name: bankName, payment_date: paymentDate,
        depositor_name: depositorName.trim(), amount: parsedAmount,
        customer_id: selectedCustomer?.customer_id || null,
        customer_name: selectedCustomer.full_name,
      }
      const { data, error } = await apiMutate<unknown[]>("finance", { action: "update", table: "customer_payments", data: payload, filters: { payment_id: editingPayment.payment_id, status: "Pending" } })
      if (error) setMessage("Failed to update: " + error)
      else if (data && data.length === 0) setMessage("This payment has already been posted and can no longer be edited.")
      else { setShowModal(false); fetchPayments() }
    } else if (selectedCustomer.isNew || selectedCustomer.is_new) {
      const customerId = await generateCustomerId()
      const { error } = await apiMutate("finance", {
        action: "transaction",
        sub_actions: [
          {
            action: "insert",
            table: "Customers",
            data: { customer_id: customerId, full_name: selectedCustomer.full_name, phone_number: selectedCustomer.phone_number || null, is_new: true },
          },
          {
            action: "insert",
            table: "customer_payments",
            data: {
              broker_id: brokerId, bank_name: bankName, payment_date: paymentDate,
              depositor_name: depositorName.trim(), amount: parsedAmount,
              customer_id: customerId, customer_name: selectedCustomer.full_name,
            },
          },
        ],
      })
      if (error) {
        setMessage("Failed to log payment: " + error)
      } else {
        setShowModal(false)
        fetchPayments()
      }
    } else {
      const payload = {
        broker_id: brokerId, bank_name: bankName, payment_date: paymentDate,
        depositor_name: depositorName.trim(), amount: parsedAmount,
        customer_id: selectedCustomer?.customer_id || null,
        customer_name: selectedCustomer.full_name,
      }
      const { error } = await apiMutate("finance", { action: "insert", table: "customer_payments", data: payload })
      if (error) setMessage("Failed to log: " + error)
      else { setShowModal(false); fetchPayments() }
    }
    setSubmitting(false)
  }

  const statusStyle = (s: string) => {
    if (s === "Posted") return { bg: "#d1fae5", color: "#065f46", border: "#a7f3d0" }
    return { bg: "#f0f7ff", color: "#0c4a6e", border: "#bfdbfe" }
  }

  const thStyle: React.CSSProperties = {
    padding: "12px 16px", fontWeight: 600, fontSize: fontSize.xs,
    color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px",
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: isMobile ? 20 : 22, color: "#171717", fontWeight: 700 }}>Customer Payments</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {payments.length > 0 && (
            <div style={{ display: "flex", background: "white", border: "1px solid #e2e8f0", borderRadius: 8, padding: 4, gap: 0 }}>
              <button onClick={() => setViewMode("card")} style={{
                padding: "8px 12px", background: viewMode === "card" ? "#0070f3" : "transparent",
                color: viewMode === "card" ? "white" : "#64748b", border: "none", borderRadius: 6,
                cursor: "pointer", fontSize: fontSize.xs, fontWeight: 600, transition: "all 0.2s ease",
                minWidth: 44, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
              }} title="Card view">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z"/></svg>
              </button>
              <button onClick={() => setViewMode("table")} style={{
                padding: "8px 12px", background: viewMode === "table" ? "#0070f3" : "transparent",
                color: viewMode === "table" ? "white" : "#64748b", border: "none", borderRadius: 6,
                cursor: "pointer", fontSize: fontSize.xs, fontWeight: 600, transition: "all 0.2s ease",
                minWidth: 44, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
              }} title="Table view">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 4h18v2H3V4zm0 7h18v2H3v-2zm0 7h18v2H3v-2z"/></svg>
              </button>
            </div>
          )}
          <button onClick={() => openModal()} style={{
            padding: "10px 16px", background: "#0070f3", color: "white", border: "none", borderRadius: 8,
            cursor: "pointer", fontWeight: 600, fontSize: fontSize.md, display: "flex", alignItems: "center", gap: 6,
            boxShadow: "0 4px 12px rgba(0,112,243,0.2)", transition: "all 0.2s", minHeight: 40,
          }} onMouseEnter={e => { if (!isMobile) e.currentTarget.style.transform = "translateY(-1px)" }} onMouseLeave={e => { if (!isMobile) e.currentTarget.style.transform = "none" }}>
            <Icon icon="mdi:plus" width={18} /> Add Payment
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "64px 0" }}>
          <div style={{ width: 36, height: 36, border: "3px solid #e2e8f0", borderTopColor: "#0070f3", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        </div>
      ) : payments.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 24px", background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ width: 56, height: 56, background: "#f1f5f9", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <Icon icon="mdi:cash-register" width={28} color="#94a3b8" />
          </div>
          <p style={{ margin: 0, color: "#94a3b8", fontSize: 15 }}>No payments logged yet</p>
        </div>
      ) : viewMode === "card" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
          {payments.map(p => {
            const ss = statusStyle(p.status)
            return (
              <div key={p.payment_id} style={{ background: "white", borderRadius: 12, border: "1px solid #e2e8f0", padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", transition: "all 0.2s ease" }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)"; e.currentTarget.style.borderColor = "#cbd5e1" }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)"; e.currentTarget.style.borderColor = "#e2e8f0" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <h3 style={{ margin: "0 0 4px 0", fontSize: fontSize.lg, color: "#0f172a", fontWeight: 600 }}>{p.customer_name}</h3>
                    <p style={{ margin: 0, fontSize: fontSize.sm, color: "#64748b" }}>{p.bank_name} &bull; {new Date(p.payment_date).toLocaleDateString()}</p>
                  </div>
                  <span style={{ padding: "4px 10px", borderRadius: 6, fontSize: fontSize.xs, fontWeight: 500, background: ss.bg, color: ss.color, border: `1px solid ${ss.border}`, flexShrink: 0 }}>
                    {p.status}
                  </span>
                </div>

                <div style={{ fontSize: 24, fontWeight: "bold", color: "#0f172a", marginBottom: 16 }}>
                  ₦{p.amount.toLocaleString()}
                </div>

                {p.depositor_name && (
                  <p style={{ margin: "0 0 16px 0", fontSize: fontSize.sm, color: "#475569" }}>
                    <Icon icon="mdi:account-cash" width={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
                    Depositor: {p.depositor_name}
                  </p>
                )}

                {p.status === "Pending" && (
                  <button onClick={() => openModal(p)} style={{
                    width: "100%", padding: "10px", background: "#f0f7ff", color: "#0070f3",
                    border: "1px solid #bfdbfe", borderRadius: 8, cursor: "pointer", fontWeight: 600,
                    fontSize: fontSize.sm, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "all 0.2s",
                  }} onMouseEnter={e => { e.currentTarget.style.background = "#e0efff"; e.currentTarget.style.borderColor = "#0070f3" }} onMouseLeave={e => { e.currentTarget.style.background = "#f0f7ff"; e.currentTarget.style.borderColor = "#bfdbfe" }}>
                    <Icon icon="mdi:pencil" width={16} /> Edit Payment
                  </button>
                )}
                {p.status === "Posted" && (
                  <div style={{ marginTop: 12, padding: "10px 12px", background: "#f0fdf4", borderRadius: 8, fontSize: fontSize.sm, color: "#166534" }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>Posted by {profilesMap[p.posted_by || ""] || "Admin"}</p>
                    {p.posted_at && <p style={{ margin: "4px 0 0 0", color: "#16a34a", fontSize: fontSize.xs }}>{new Date(p.posted_at).toLocaleString()}</p>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                <th style={thStyle}>Customer</th>
                <th style={thStyle}>Bank</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Status</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p, idx) => {
                const ss = statusStyle(p.status)
                return (
                  <tr key={p.payment_id} style={{ borderBottom: idx === payments.length - 1 ? "none" : "1px solid #e2e8f0", transition: "background 0.2s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: fontSize.base, fontWeight: 500 }}>{p.customer_name}</td>
                    <td style={{ padding: "12px 16px", color: "#475569", fontSize: fontSize.sm }}>{p.bank_name}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", color: "#0f172a", fontSize: fontSize.base, fontWeight: 600 }}>₦{p.amount.toLocaleString()}</td>
                    <td style={{ padding: "12px 16px", color: "#64748b", fontSize: fontSize.sm }}>{new Date(p.payment_date).toLocaleDateString()}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ padding: "4px 10px", borderRadius: 6, fontSize: fontSize.xs, fontWeight: 500, background: ss.bg, color: ss.color, border: `1px solid ${ss.border}`, display: "inline-block" }}>
                        {p.status}
                      </span>
                      {p.status === "Posted" && p.posted_by && (
                        <div style={{ marginTop: 4, fontSize: fontSize.xs, color: "#16a34a" }}>
                          by {profilesMap[p.posted_by] || "Admin"}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      {p.status === "Pending" && (
                        <button onClick={() => openModal(p)} style={{ padding: "6px 10px", cursor: "pointer", borderRadius: 5, border: "1px solid #e2e8f0", color: "#0070f3", background: "#f0f7ff", fontSize: fontSize.sm, fontWeight: 500, transition: "all 0.2s", minHeight: 32, minWidth: 32, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                          onMouseEnter={e => { e.currentTarget.style.background = "#e0efff"; e.currentTarget.style.borderColor = "#0070f3" }}
                          onMouseLeave={e => { e.currentTarget.style.background = "#f0f7ff"; e.currentTarget.style.borderColor = "#e2e8f0" }}
                        >
                          <Icon icon="mdi:pencil" width={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 100, padding: isMobile ? 0 : 24 }}>
          <div style={{ background: "white", borderRadius: isMobile ? "20px 20px 0 0" : 12, padding: isMobile ? "28px 20px" : 32, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h3 style={{ margin: 0, fontSize: fontSize.xl, fontWeight: 700, color: "#0f172a" }}>{editingPayment ? "Edit Payment" : "Log Customer Payment"}</h3>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 0, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, transition: "color 0.2s" }}
                onMouseEnter={e => e.currentTarget.style.color = "#64748b"} onMouseLeave={e => e.currentTarget.style.color = "#94a3b8"}
              >
                <Icon icon="mdi:close" width={20} />
              </button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: fontSize.sm, color: "#475569" }}>Bank *</label>
              <select value={bankName} onChange={e => { setBankName(e.target.value); setMessage("") }} style={{ width: "100%", padding: "12px 14px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: fontSize.base, background: "white", color: "#0f172a", minHeight: 48, boxSizing: "border-box" }}>
                <option value="">Select bank...</option>
                {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: fontSize.sm, color: "#475569" }}>Date of Payment *</label>
              <input type="date" value={paymentDate} onChange={e => { setPaymentDate(e.target.value); setMessage("") }} style={{ width: "100%", padding: "12px 14px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: fontSize.base, background: "white", color: "#0f172a", minHeight: 48, boxSizing: "border-box" }} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: fontSize.sm, color: "#475569" }}>Amount (₦) *</label>
              <input type="text" placeholder="e.g. 500,000" value={amount} onChange={e => { setAmount(formatAmount(e.target.value)); setMessage("") }} style={{ width: "100%", padding: "12px 14px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: fontSize.base, background: "white", color: "#0f172a", minHeight: 48, boxSizing: "border-box" }} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: fontSize.sm, color: "#475569" }}>Depositor&apos;s Name *</label>
              <input type="text" placeholder="Name of person who made the deposit" value={depositorName} onChange={e => setDepositorName(e.target.value)} style={{ width: "100%", padding: "12px 14px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: fontSize.base, background: "white", color: "#0f172a", minHeight: 48, boxSizing: "border-box" }} />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: fontSize.sm, color: "#475569" }}>Customer *</label>
              <CustomerSelector onSelect={(c: Customer) => { setSelectedCustomer(c); setMessage("") }} initialValue={selectedCustomer?.full_name || ""} allowUnsavedNew />
            </div>

            {message && (
              <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 16, color: "#b91c1c", fontSize: fontSize.sm, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                <Icon icon="mdi:alert-circle" width={16} /> {message}
              </div>
            )}

            <button onClick={handleSubmit} disabled={submitting} style={{
              width: "100%", padding: "14px 0", background: "#0070f3", color: "white", border: "none",
              borderRadius: 8, fontSize: fontSize.md, fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              opacity: submitting ? 0.7 : 1, transition: "opacity 0.2s", minHeight: 48,
            }}>
              {submitting ? <Icon icon="mdi:loading" width={18} style={{ animation: "spin 1s linear infinite" }} /> : <Icon icon="mdi:content-save" width={18} />}
              {submitting ? "Saving..." : "Save Payment"}
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
