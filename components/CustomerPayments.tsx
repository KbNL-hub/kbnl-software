"use client"

import { useState, useEffect } from "react"
import { Icon } from "@iconify/react"
import { supabase } from "@/lib/supabase"
import { formatAmount, parseAmount } from "@/lib/formatAmount"
import CustomerSelector from "./CustomerSelector"

type Customer = { customer_id: string; full_name: string; isNew?: boolean }

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
  created_at: string
}

const BANKS = ["First Bank", "Access Bank", "Stanbic IBTC", "Sterling Bank", "GTB"]

export default function CustomerPayments({ brokerId }: { brokerId: string }) {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null)
  
  // Form State
  const [bankName, setBankName] = useState("")
  const [paymentDate, setPaymentDate] = useState("")
  const [depositorName, setDepositorName] = useState("")
  const [amount, setAmount] = useState("")
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    fetchPayments()
  }, [brokerId])

  async function fetchPayments() {
    setLoading(true)
    const { data, error } = await supabase
      .from("customer_payments")
      .select("*")
      .eq("broker_id", brokerId)
      .order("created_at", { ascending: false })
      
    if (!error && data) {
      setPayments(data)
    }
    setLoading(false)
  }

  function openModal(payment?: Payment) {
    if (payment) {
      setEditingPayment(payment)
      setBankName(payment.bank_name)
      setPaymentDate(payment.payment_date)
      setDepositorName(payment.depositor_name || "")
      setAmount(payment.amount.toString())
      setSelectedCustomer({
        customer_id: payment.customer_id || "",
        full_name: payment.customer_name || "",
        isNew: !payment.customer_id
      })
    } else {
      setEditingPayment(null)
      setBankName("")
      setPaymentDate("")
      setDepositorName("")
      setAmount("")
      setSelectedCustomer(null)
    }
    setMessage("")
    setShowModal(true)
  }

  async function handleSubmit() {
    if (!bankName) return setMessage("Please select a bank")
    if (!paymentDate) return setMessage("Payment date is required")
    if (!selectedCustomer) return setMessage("Please select or add a customer")
    
    const parsedAmount = parseAmount(amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) return setMessage("Valid amount is required")

    setSubmitting(true)
    setMessage("")

    const payload = {
      broker_id: brokerId,
      bank_name: bankName,
      payment_date: paymentDate,
      depositor_name: depositorName.trim() || null,
      amount: parsedAmount,
      customer_id: selectedCustomer.isNew ? null : selectedCustomer.customer_id,
      customer_name: selectedCustomer.full_name
    }

    if (editingPayment) {
      const { error } = await supabase
        .from("customer_payments")
        .update(payload)
        .eq("payment_id", editingPayment.payment_id)
        
      if (error) setMessage("Failed to update payment: " + error.message)
      else {
        setShowModal(false)
        fetchPayments()
      }
    } else {
      const { error } = await supabase
        .from("customer_payments")
        .insert([payload])
        
      if (error) setMessage("Failed to log payment: " + error.message)
      else {
        setShowModal(false)
        fetchPayments()
      }
    }
    setSubmitting(false)
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, padding: "0 16px" }}>
        <h2 style={{ margin: 0, fontSize: 20, color: "#171717" }}>Customer Payments</h2>
        <button
          onClick={() => openModal()}
          style={{
            padding: "10px 16px", background: "#0070f3", color: "white",
            border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold",
            display: "flex", alignItems: "center", gap: 6, fontSize: 14
          }}
        >
          <Icon icon="mdi:plus" width={18} /> Add Payment
        </button>
      </div>

      <div style={{ padding: "0 16px" }}>
        {loading ? (
          <p style={{ color: "#888", textAlign: "center", padding: "40px 0" }}>Loading payments...</p>
        ) : payments.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#bbb", background: "white", borderRadius: 12, border: "1px solid #eee" }}>
            <Icon icon="mdi:cash-register" width={40} style={{ marginBottom: 10, display: "block", margin: "0 auto" }} />
            <p style={{ margin: 0, fontSize: 14 }}>No payments logged yet</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
            {payments.map(p => (
              <div key={p.payment_id} style={{ background: "white", border: "1px solid #eee", borderRadius: 12, padding: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <h3 style={{ margin: "0 0 4px 0", fontSize: 16, color: "#111" }}>{p.customer_name}</h3>
                    <p style={{ margin: 0, fontSize: 13, color: "#888" }}>{p.bank_name} • {new Date(p.payment_date).toLocaleDateString()}</p>
                  </div>
                  <span style={{
                    padding: "4px 10px", borderRadius: 12, fontSize: 11, fontWeight: "bold",
                    background: p.status === "Posted" ? "#f0fff4" : "#ebf8ff",
                    color: p.status === "Posted" ? "#2f855a" : "#2b6cb0"
                  }}>
                    {p.status}
                  </span>
                </div>
                
                <div style={{ fontSize: 22, fontWeight: "bold", color: "#171717", marginBottom: 16 }}>
                  ₦{p.amount.toLocaleString()}
                </div>
                
                {p.depositor_name && (
                  <p style={{ margin: "0 0 16px 0", fontSize: 13, color: "#555" }}>
                    <Icon icon="mdi:account-cash" width={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
                    Depositor: {p.depositor_name}
                  </p>
                )}
                
                {p.status === "Pending" && (
                  <button
                    onClick={() => openModal(p)}
                    style={{
                      width: "100%", padding: "10px", background: "white", color: "#0070f3",
                      border: "1px solid #0070f3", borderRadius: 8, cursor: "pointer",
                      fontWeight: "bold", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6
                    }}
                  >
                    <Icon icon="mdi:pencil" width={16} /> Edit Payment
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div style={{ background: "white", borderRadius: 16, padding: 32, width: 480, maxWidth: "90vw", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h3 style={{ margin: 0, fontSize: 20 }}>{editingPayment ? "Edit Payment" : "Log Customer Payment"}</h3>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#888" }}>&times;</button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontWeight: "bold", marginBottom: 6, fontSize: 14 }}>Bank *</label>
              <select
                value={bankName}
                onChange={e => { setBankName(e.target.value); setMessage("") }}
                style={{ width: "100%", padding: 12, borderRadius: 8, border: "1.5px solid #ddd", fontSize: 15 }}
              >
                <option value="">Select bank...</option>
                {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontWeight: "bold", marginBottom: 6, fontSize: 14 }}>Date of Payment *</label>
              <input
                type="date"
                value={paymentDate}
                onChange={e => { setPaymentDate(e.target.value); setMessage("") }}
                style={{ width: "100%", padding: 12, borderRadius: 8, border: "1.5px solid #ddd", fontSize: 15, boxSizing: "border-box" }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontWeight: "bold", marginBottom: 6, fontSize: 14 }}>Amount (₦) *</label>
              <input
                type="text"
                placeholder="e.g. 500,000"
                value={amount}
                onChange={e => { setAmount(formatAmount(e.target.value)); setMessage("") }}
                style={{ width: "100%", padding: 12, borderRadius: 8, border: "1.5px solid #ddd", fontSize: 15, boxSizing: "border-box" }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontWeight: "bold", marginBottom: 6, fontSize: 14 }}>Depositor's Name <span style={{ fontWeight: "normal", color: "#888" }}>(Optional)</span></label>
              <input
                type="text"
                placeholder="Name of person who made the deposit"
                value={depositorName}
                onChange={e => setDepositorName(e.target.value)}
                style={{ width: "100%", padding: 12, borderRadius: 8, border: "1.5px solid #ddd", fontSize: 15, boxSizing: "border-box" }}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", fontWeight: "bold", marginBottom: 6, fontSize: 14 }}>Customer *</label>
              <CustomerSelector 
                onSelect={(c: any) => { setSelectedCustomer(c); setMessage("") }} 
                allowUnsavedNew={true}
                initialValue={selectedCustomer?.full_name || ""}
              />
              {selectedCustomer && (
                <div style={{ marginTop: 8, padding: "8px 12px", background: "#f0f7ff", borderRadius: 6, fontSize: 13, color: "#0070f3", display: "flex", alignItems: "center", gap: 6 }}>
                  <Icon icon="mdi:check-circle" />
                  Selected: {selectedCustomer.full_name} {selectedCustomer.isNew ? "(New)" : ""}
                </div>
              )}
            </div>

            {message && <p style={{ color: "#ff4444", fontSize: 14, marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}><Icon icon="mdi:alert-circle" /> {message}</p>}

            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{
                width: "100%", padding: 14, background: "#0070f3", color: "white",
                border: "none", borderRadius: 8, fontSize: 16, fontWeight: "bold", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8
              }}
            >
              {submitting ? <Icon icon="mdi:loading" className="spin" /> : <Icon icon="mdi:content-save" />}
              {submitting ? "Saving..." : "Save Payment"}
            </button>
          </div>
        </div>
      )}
      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
