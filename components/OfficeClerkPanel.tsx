"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { formatAmount, parseAmount } from "@/lib/formatAmount"

type Props = {
  clerkId: string
  officeName: string
  fullName: string
}

type CashExpense = {
  expense_id: string
  title: string
  total_amount: number
  status: "Pending" | "Authorised" | "Rejected"
  rejection_reason: string | null
  created_at: string
  resolved_at: string | null
}

type ExpenseItemInput = {
  item_name: string
  amount: string
}

type ExpenseItem = {
  item_id: string
  item_name: string
  amount: number
}

export default function OfficeClerkPanel({ clerkId, officeName, fullName }: Props) {
  const [officeBalance, setOfficeBalance] = useState<number>(0)
  const [expenses, setExpenses] = useState<CashExpense[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // New Expense Modal
  const [showLogModal, setShowLogModal] = useState(false)
  const [expenseTitle, setExpenseTitle] = useState("")
  const [items, setItems] = useState<ExpenseItemInput[]>([{ item_name: "", amount: "" }])
  const [submitLoading, setSubmitLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")
  const [successMsg, setSuccessMsg] = useState("")

  // Detail Modal
  const [viewingExpense, setViewingExpense] = useState<CashExpense | null>(null)
  const [viewingItems, setViewingItems] = useState<ExpenseItem[]>([])
  const [loadingItems, setLoadingItems] = useState(false)

  useEffect(() => {
    if (clerkId && officeName) {
      loadData()
    }
  }, [clerkId, officeName])

  useEffect(() => {
    if (!clerkId || !officeName) return
    const interval = setInterval(() => {
      fetchOfficeBalance()
      fetchExpenses()
    }, 30000)
    return () => clearInterval(interval)
  }, [clerkId, officeName])

  async function loadData() {
    setLoading(true)
    await Promise.all([
      fetchOfficeBalance(),
      fetchExpenses()
    ])
    setLoading(false)
  }

  async function fetchOfficeBalance() {
    const { data } = await supabase
      .from("cash_offices")
      .select("current_balance")
      .eq("office_name", officeName)
      .single()
    if (data) setOfficeBalance(data.current_balance)
    setLastUpdated(new Date())
  }

  async function fetchExpenses() {
    const { data } = await supabase
      .from("cash_expenses")
      .select("*")
      .eq("clerk_id", clerkId)
      .order("created_at", { ascending: false })
    if (data) setExpenses(data)
  }

  function handleAddItem() {
    setItems(prev => [...prev, { item_name: "", amount: "" }])
  }

  function handleRemoveItem(index: number) {
    if (items.length === 1) return
    setItems(prev => prev.filter((_, i) => i !== index))
  }

  function handleItemChange(index: number, field: keyof ExpenseItemInput, value: string) {
    const updated = [...items]
    if (field === "amount") {
      updated[index].amount = formatAmount(value)
    } else {
      updated[index].item_name = value
    }
    setItems(updated)
  }

  const runningTotal = items.reduce((sum, item) => {
    const val = parseAmount(item.amount)
    return sum + (isNaN(val) ? 0 : val)
  }, 0)

  async function handleSubmitExpense() {
    if (!expenseTitle.trim()) {
      setErrorMsg("Expense title is required")
      return
    }

    const validatedItems = items.map(item => {
      const amt = parseAmount(item.amount)
      return {
        item_name: item.item_name.trim(),
        amount: amt
      }
    })

    const hasEmptyItem = validatedItems.some(it => !it.item_name || isNaN(it.amount) || it.amount <= 0)
    if (hasEmptyItem) {
      setErrorMsg("All items must have a valid name and amount greater than 0")
      return
    }

    setSubmitLoading(true)
    setErrorMsg("")

    const { data: expData, error: expError } = await supabase
      .from("cash_expenses")
      .insert([{
        office_name: officeName,
        clerk_id: clerkId,
        title: expenseTitle.trim(),
        total_amount: runningTotal,
        status: "Pending"
      }])
      .select()
      .single()

    if (expError) {
      setSubmitLoading(false)
      setErrorMsg("Failed to create expense: " + expError.message)
      return
    }

    const expenseId = expData.expense_id
    const itemsToInsert = validatedItems.map(it => ({
      expense_id: expenseId,
      item_name: it.item_name,
      amount: it.amount
    }))

    const { error: itemsError } = await supabase
      .from("cash_expense_items")
      .insert(itemsToInsert)

    setSubmitLoading(false)
    if (itemsError) {
      setErrorMsg("Expense created but failed to save individual items: " + itemsError.message)
      fetchExpenses()
      return
    }

    setSuccessMsg("Expense logged successfully!")
    setShowLogModal(false)
    setExpenseTitle("")
    setItems([{ item_name: "", amount: "" }])
    
    await Promise.all([
      fetchOfficeBalance(),
      fetchExpenses()
    ])

    setTimeout(() => setSuccessMsg(""), 3000)
  }

  async function handleViewDetails(exp: CashExpense) {
    setViewingExpense(exp)
    setLoadingItems(true)
    const { data } = await supabase
      .from("cash_expense_items")
      .select("*")
      .eq("expense_id", exp.expense_id)
    setViewingItems(data || [])
    setLoadingItems(false)
  }

  async function handleCancelExpense(expenseId: string) {
    if (!confirm("Are you sure you want to cancel and delete this pending expense?")) return

    setLoading(true)
    await supabase.from("cash_expense_items").delete().eq("expense_id", expenseId)
    await supabase.from("cash_expenses").delete().eq("expense_id", expenseId)

    await Promise.all([
      fetchOfficeBalance(),
      fetchExpenses()
    ])
    setLoading(false)
  }

  return (
    <div>
      {successMsg && (
        <div style={{ padding: "12px 16px", background: "#e6fffa", border: "1px solid #319795", color: "#234e52", borderRadius: 8, marginBottom: 24, fontWeight: "bold" }}>
          {successMsg}
        </div>
      )}

      {/* Office Status Panel */}
      <div style={{
        background: "white",
        borderRadius: 12,
        padding: 24,
        border: "1px solid #eee",
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        marginBottom: 24,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 20
      }}>
        <div>
          <span style={{ fontSize: 12, color: "#888", textTransform: "uppercase", fontWeight: "bold", letterSpacing: 0.5 }}>
            {officeName} Office Cash Balance
          </span>
          <h1 style={{ margin: "4px 0 4px", fontSize: 32, color: "#111", display: "flex", alignItems: "baseline", gap: 4 }}>
            <span style={{ fontSize: 20, color: "#555" }}>₦</span>
            {officeBalance.toLocaleString()}
          </h1>
          {lastUpdated && (
            <span style={{ fontSize: 11, color: "#888" }}>
              Last updated: {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>

        <button
          onClick={() => { setShowLogModal(true); setErrorMsg("") }}
          style={{
            padding: "12px 24px",
            background: "#0070f3",
            color: "white",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            fontWeight: "bold",
            fontSize: 14,
            boxShadow: "0 2px 6px rgba(0,112,243,0.3)"
          }}
          title={`Log an office expense under ${officeName} office.`}
        >
          + Log New Expense
        </button>
      </div>

      {/* Expense History Table */}
      <div style={{ background: "white", borderRadius: 12, border: "1px solid #eee", padding: 24 }}>
        <h3 style={{ margin: "0 0 20px" }}>My Logged Expenses</h3>

        {loading ? (
          <p style={{ color: "#888", textAlign: "center", padding: "40px 0" }}>Loading expenses...</p>
        ) : expenses.length === 0 ? (
          <p style={{ color: "#888", textAlign: "center", padding: "40px 0" }}>No expenses logged yet.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
            {expenses.map((exp) => {
              let statusBg = "#eee"
              let statusColor = "#666"
              if (exp.status === "Pending") { statusBg = "#ebf8ff"; statusColor = "#2b6cb0" }
              else if (exp.status === "Authorised") { statusBg = "#f0fff4"; statusColor = "#2f855a" }
              else if (exp.status === "Rejected") { statusBg = "#fff5f5"; statusColor = "#c53030" }

              return (
                <div key={exp.expense_id} style={{ border: "1px solid #eee", borderRadius: 12, padding: 16, background: "white", display: "flex", flexDirection: "column", gap: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 13, color: "#888", fontWeight: "500" }}>{new Date(exp.created_at).toLocaleDateString()}</span>
                    <span style={{ padding: "4px 10px", borderRadius: 12, fontSize: 11, background: statusBg, color: statusColor, fontWeight: "bold", letterSpacing: 0.3 }}>
                      {exp.status}
                    </span>
                  </div>
                  <div>
                    <h4 style={{ margin: "0 0 6px 0", fontSize: 16, color: "#111", lineHeight: 1.3 }}>{exp.title}</h4>
                    <div style={{ fontSize: 20, fontWeight: "bold", color: "#333", display: "flex", alignItems: "baseline", gap: 2 }}>
                      <span style={{ fontSize: 14, color: "#666" }}>₦</span>
                      {exp.total_amount.toLocaleString()}
                    </div>
                  </div>
                  
                  {exp.status === "Rejected" && exp.rejection_reason && (
                    <div style={{ background: "#fff5f5", padding: "10px", borderRadius: "8px", color: "#c53030", fontSize: 12, border: "1px solid #fed7d7" }}>
                      <strong style={{ display: "block", marginBottom: 2 }}>Reason for rejection:</strong>
                      {exp.rejection_reason}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 10, marginTop: "auto", paddingTop: 16, borderTop: "1px solid #f0f0f0" }}>
                    <button
                      onClick={() => handleViewDetails(exp)}
                      style={{ flex: 1, padding: "10px", cursor: "pointer", borderRadius: 8, border: "1px solid #0070f3", color: "#0070f3", background: "rgba(0,112,243,0.05)", fontSize: 13, fontWeight: "bold", transition: "all 0.2s ease" }}
                    >
                      Details
                    </button>
                    {exp.status === "Pending" && (
                      <button
                        onClick={() => handleCancelExpense(exp.expense_id)}
                        style={{ flex: 1, padding: "10px", cursor: "pointer", borderRadius: 8, border: "1px solid #ff4444", color: "#ff4444", background: "rgba(255,68,68,0.05)", fontSize: 13, fontWeight: "bold", transition: "all 0.2s ease" }}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* MODALS */}
      {/* 1. Log Expense Modal */}
      {showLogModal && (
        <div style={modalOverlay}>
          <div style={modalContent}>
            <h3 style={{ margin: "0 0 16px 0" }}>Log New Expense</h3>
            
            <div style={{ marginBottom: 16 }}>
              <label style={label}>Expense Title *</label>
              <input
                type="text"
                placeholder="e.g. Generator Maintenance"
                value={expenseTitle}
                onChange={(e) => { setExpenseTitle(e.target.value); setErrorMsg("") }}
                style={inputStyle}
                autoFocus
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={label}>Line Items *</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 220, overflowY: "auto", paddingRight: 4, marginBottom: 10 }}>
                {items.map((item, idx) => (
                  <div key={idx} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="text"
                      placeholder="Item name"
                      value={item.item_name}
                      onChange={(e) => handleItemChange(idx, "item_name", e.target.value)}
                      style={{ ...inputStyle, flex: 2 }}
                    />
                    <input
                      type="text"
                      placeholder="Price"
                      value={item.amount}
                      onChange={(e) => handleItemChange(idx, "amount", e.target.value)}
                      style={{ ...inputStyle, flex: 1, textAlign: "right", fontWeight: "bold" }}
                    />
                    <button
                      onClick={() => handleRemoveItem(idx)}
                      disabled={items.length === 1}
                      style={{
                        padding: "8px 12px", background: "#ff4444", color: "white",
                        border: "none", borderRadius: 4, cursor: items.length === 1 ? "not-allowed" : "pointer",
                        opacity: items.length === 1 ? 0.5 : 1
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={handleAddItem}
                style={{
                  background: "none", border: "1px dashed #0070f3", color: "#0070f3",
                  padding: "6px 12px", borderRadius: 4, cursor: "pointer", fontSize: 13, fontWeight: "bold"
                }}
              >
                + Add Another Item
              </button>
            </div>

            {/* Running Total Box */}
            <div style={{
              background: "#f7fafc", border: "1px solid #edf2f7",
              padding: 12, borderRadius: 6, display: "flex", justifyContent: "space-between",
              alignItems: "center", marginBottom: 20
            }}>
              <span style={{ fontWeight: "bold", fontSize: 13, color: "#4a5568" }}>Total Amount:</span>
              <span style={{ fontWeight: "bold", fontSize: 18, color: "#2b6cb0" }}>
                ₦{runningTotal.toLocaleString()}
              </span>
            </div>

            {errorMsg && <p style={errorStyle}>{errorMsg}</p>}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowLogModal(false)} style={cancelBtn}>Cancel</button>
              <button
                onClick={handleSubmitExpense}
                disabled={submitLoading}
                style={{ ...primaryBtn, flex: 1 }}
              >
                {submitLoading ? "Submitting..." : "Submit Expense"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Expense Details Modal */}
      {viewingExpense && (
        <div onClick={() => setViewingExpense(null)} style={modalOverlay}>
          <div onClick={(e) => e.stopPropagation()} style={modalContent}>
            <h3 style={{ margin: "0 0 4px 0" }}>{viewingExpense.title}</h3>
            <p style={{ margin: "0 0 16px", color: "#888", fontSize: 12 }}>
              Logged on {new Date(viewingExpense.created_at).toLocaleString()}
            </p>

            <div style={{ marginBottom: 16 }}>
              <h4 style={{ margin: "0 0 8px 0", fontSize: 13 }}>Items Breakdown</h4>
              {loadingItems ? (
                <p style={{ color: "#888", fontSize: 13 }}>Loading details...</p>
              ) : viewingItems.length === 0 ? (
                <p style={{ color: "#888", fontSize: 13 }}>No items found.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {viewingItems.map(item => (
                    <div key={item.item_id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, paddingBottom: 4, borderBottom: "1px dashed #eee" }}>
                      <span>{item.item_name}</span>
                      <span style={{ fontWeight: "bold" }}>₦{item.amount.toLocaleString()}</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: "bold", paddingTop: 8, borderTop: "1px solid #eee" }}>
                    <span>Total</span>
                    <span style={{ color: "#0070f3" }}>₦{viewingExpense.total_amount.toLocaleString()}</span>
                  </div>
                </div>
              )}
            </div>

            {viewingExpense.resolved_at && (
              <div style={{ background: "#f3f4f6", padding: 12, borderRadius: 6, fontSize: 12, color: "#555", marginBottom: 20 }}>
                {viewingExpense.status === "Authorised" ? (
                  <div>✅ Authorised on {new Date(viewingExpense.resolved_at).toLocaleString()}</div>
                ) : (
                  <div>
                    ❌ Rejected on {new Date(viewingExpense.resolved_at).toLocaleString()}
                    <div style={{ marginTop: 4, paddingLeft: 12, borderLeft: "2px solid #ff4444", color: "#c53030" }}>
                      Reason: "{viewingExpense.rejection_reason}"
                    </div>
                  </div>
                )}
              </div>
            )}

            <button onClick={() => setViewingExpense(null)} style={{ ...cancelBtn, width: "100%" }}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const label: React.CSSProperties = { display: "block", fontWeight: "bold", marginBottom: 6, fontSize: 13 }
const inputStyle: React.CSSProperties = { width: "100%", padding: 10, boxSizing: "border-box", borderRadius: 6, border: "1px solid #ddd", fontSize: 14 }
const errorStyle: React.CSSProperties = { color: "red", fontSize: 13, marginBottom: 12 }
const primaryBtn: React.CSSProperties = { padding: "10px 0", background: "#0070f3", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold" }
const cancelBtn: React.CSSProperties = { padding: "10px 0", background: "white", border: "1px solid #ddd", borderRadius: 6, cursor: "pointer" }

const modalOverlay: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100
}

const modalContent: React.CSSProperties = {
  background: "white", borderRadius: 12, padding: 32,
  width: 460, maxWidth: "90vw", boxShadow: "0 8px 32px rgba(0,0,0,0.2)"
}
