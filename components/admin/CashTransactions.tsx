"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { formatAmount, parseAmount } from "@/lib/formatAmount"

type CashOffice = {
  office_id: string
  office_name: string
  current_balance: number
}

type CashExpense = {
  expense_id: string
  office_name: string
  clerk_id: string
  title: string
  total_amount: number
  status: "Pending" | "Authorised" | "Rejected"
  authorised_by: string | null
  rejection_reason: string | null
  created_at: string
  resolved_at: string | null
}

type ExpenseItem = {
  item_id: string
  expense_id: string
  item_name: string
  amount: number
}

const OFFICES = ["Calabar", "Ikom", "Ogoja", "Uyo"]

export default function CashTransactions() {
  const [selectedOffice, setSelectedOffice] = useState<string>("Calabar")
  const [assignedOffice, setAssignedOffice] = useState<string | null>(null)
  const [adminUser, setAdminUser] = useState<any>(null)
  const [officeBalance, setOfficeBalance] = useState<number>(0)
  const [expenses, setExpenses] = useState<CashExpense[]>([])
  const [clerksMap, setClerksMap] = useState<Record<string, string>>({})
  const [adminsMap, setAdminsMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  // Filter state
  const [filter, setFilter] = useState<"All" | "Pending" | "Authorised" | "Rejected">("All")

  // Modals
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [newAssignedOffice, setNewAssignedOffice] = useState("")

  const [showDepositModal, setShowDepositModal] = useState(false)
  const [depositAmount, setDepositAmount] = useState("")
  const [depositNote, setDepositNote] = useState("")

  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState("")

  const [expandedExpense, setExpandedExpense] = useState<string | null>(null)
  const [expenseItems, setExpenseItems] = useState<Record<string, ExpenseItem[]>>({})

  const [message, setMessage] = useState("")
  const [errorMsg, setErrorMsg] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    initData()
  }, [])

  useEffect(() => {
    if (selectedOffice) {
      fetchOfficeBalance()
      fetchExpenses()
    }
  }, [selectedOffice])

  async function initData() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setAdminUser(user)
        // Fetch assignment
        const { data: assignment } = await supabase
          .from("admin_office_assignments")
          .select("office_name")
          .eq("admin_id", user.id)
          .single()
        
        if (assignment) {
          setAssignedOffice(assignment.office_name)
          setSelectedOffice(assignment.office_name)
        } else {
          setShowAssignModal(true)
        }
      }

      // Fetch office clerks
      const { data: clerks } = await supabase.from("office_clerks").select("clerk_id, full_name")
      const cMap: Record<string, string> = {}
      clerks?.forEach(c => { cMap[c.clerk_id] = c.full_name })
      setClerksMap(cMap)

      // Fetch admin profiles
      const { data: adminProfiles } = await supabase.from("Profiles").select("user_id, full_name")
      const aMap: Record<string, string> = {}
      adminProfiles?.forEach(a => { aMap[a.user_id] = a.full_name })
      setAdminsMap(aMap)

    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  async function fetchOfficeBalance() {
    const { data } = await supabase
      .from("cash_offices")
      .select("current_balance")
      .eq("office_name", selectedOffice)
      .single()
    if (data) {
      setOfficeBalance(data.current_balance)
    } else {
      setOfficeBalance(0)
    }
  }

  async function fetchExpenses() {
    const { data } = await supabase
      .from("cash_expenses")
      .select("*")
      .eq("office_name", selectedOffice)
      .order("created_at", { ascending: false })
    setExpenses(data || [])
  }

  async function fetchExpenseItems(expenseId: string) {
    if (expenseItems[expenseId]) return
    const { data } = await supabase
      .from("cash_expense_items")
      .select("*")
      .eq("expense_id", expenseId)
    if (data) {
      setExpenseItems(prev => ({ ...prev, [expenseId]: data }))
    }
  }

  async function handleSaveAssignment() {
    if (!newAssignedOffice) return
    if (!adminUser) return

    setSubmitting(true)
    const { error } = await supabase
      .from("admin_office_assignments")
      .upsert({ admin_id: adminUser.id, office_name: newAssignedOffice })

    setSubmitting(false)
    if (error) {
      setErrorMsg("Failed to assign office: " + error.message)
      return
    }
    setAssignedOffice(newAssignedOffice)
    setSelectedOffice(newAssignedOffice)
    setShowAssignModal(false)
    setMessage("Office assignment saved!")
    setTimeout(() => setMessage(""), 3000)
  }

  async function handleDeposit() {
    const parsed = parseAmount(depositAmount)
    if (isNaN(parsed) || parsed <= 0) {
      setErrorMsg("Please enter a valid amount")
      return
    }
    if (!adminUser) return

    setSubmitting(true)
    setErrorMsg("")

    // 1. Insert into cash_deposits
    const { error: depError } = await supabase
      .from("cash_deposits")
      .insert({
        office_name: selectedOffice,
        amount: parsed,
        note: depositNote || null,
        deposited_by: adminUser.id
      })

    if (depError) {
      setSubmitting(false)
      setErrorMsg("Failed to log deposit: " + depError.message)
      return
    }

    // 2. Update cash_offices balance
    const { error: balError } = await supabase
      .rpc("increment_office_balance", {
        o_name: selectedOffice,
        amount_to_add: parsed
      })

    // If RPC doesn't exist, we can fallback to direct update
    if (balError) {
      const newBal = officeBalance + parsed
      const { error: directError } = await supabase
        .from("cash_offices")
        .update({ current_balance: newBal })
        .eq("office_name", selectedOffice)

      if (directError) {
        setSubmitting(false)
        setErrorMsg("Failed to update balance: " + directError.message)
        return
      }
    }

    setSubmitting(false)
    setDepositAmount("")
    setDepositNote("")
    setShowDepositModal(false)
    setMessage("₦" + parsed.toLocaleString() + " deposited successfully!")
    fetchOfficeBalance()
    setTimeout(() => setMessage(""), 3000)
  }

  async function handleAuthorise(expense: CashExpense) {
    if (!adminUser) return
    if (officeBalance < expense.total_amount) {
      alert("Insufficient office balance to authorise this expense! Current balance is ₦" + officeBalance.toLocaleString() + " but expense total is ₦" + expense.total_amount.toLocaleString())
      return
    }

    if (!confirm("Are you sure you want to authorise this expense for ₦" + expense.total_amount.toLocaleString() + "?")) {
      return
    }

    setSubmitting(true)

    // 1. Update expense status
    const { error: expError } = await supabase
      .from("cash_expenses")
      .update({
        status: "Authorised",
        authorised_by: adminUser.id,
        resolved_at: new Date().toISOString()
      })
      .eq("expense_id", expense.expense_id)

    if (expError) {
      setSubmitting(false)
      alert("Error authorising: " + expError.message)
      return
    }

    // 2. Decrease office balance
    const newBal = officeBalance - expense.total_amount
    const { error: balError } = await supabase
      .from("cash_offices")
      .update({ current_balance: newBal })
      .eq("office_name", selectedOffice)

    setSubmitting(false)
    if (balError) {
      alert("Expense authorised but failed to deduct balance: " + balError.message)
    } else {
      setMessage("Expense authorised and balance updated!")
      setTimeout(() => setMessage(""), 3000)
    }

    fetchOfficeBalance()
    fetchExpenses()
  }

  async function handleReject() {
    if (!rejectId) return
    if (!rejectionReason.trim()) {
      setErrorMsg("Please provide a rejection reason")
      return
    }
    if (!adminUser) return

    setSubmitting(true)
    const { error } = await supabase
      .from("cash_expenses")
      .update({
        status: "Rejected",
        rejection_reason: rejectionReason,
        authorised_by: adminUser.id,
        resolved_at: new Date().toISOString()
      })
      .eq("expense_id", rejectId)

    setSubmitting(false)
    if (error) {
      setErrorMsg("Failed to reject expense: " + error.message)
      return
    }

    setShowRejectModal(false)
    setRejectId(null)
    setRejectionReason("")
    setMessage("Expense rejected successfully.")
    fetchExpenses()
    setTimeout(() => setMessage(""), 3000)
  }

  const isAssigned = selectedOffice === assignedOffice

  const filteredExpenses = expenses.filter(e => {
    if (filter === "All") return true
    return e.status === filter
  })

  function toggleExpand(expenseId: string) {
    if (expandedExpense === expenseId) {
      setExpandedExpense(null)
    } else {
      setExpandedExpense(expenseId)
      fetchExpenseItems(expenseId)
    }
  }

  return (
    <div>
      {/* Messages */}
      {message && (
        <div style={{ padding: "12px 16px", background: "#e6fffa", border: "1px solid #319795", color: "#234e52", borderRadius: 8, marginBottom: 20, fontWeight: "bold" }}>
          {message}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24 }}>Cash Transactions</h2>
          {assignedOffice ? (
            <p style={{ margin: "4px 0 0", color: "#666", fontSize: 13 }}>
              Your assigned office: <strong>{assignedOffice}</strong>{" "}
              <button 
                onClick={() => { setNewAssignedOffice(assignedOffice); setShowAssignModal(true); setErrorMsg("") }}
                style={{ background: "none", border: "none", color: "#0070f3", cursor: "pointer", textDecoration: "underline", padding: 0, fontSize: 13, marginLeft: 8 }}
              >
                Change Assignment
              </button>
            </p>
          ) : (
            <p style={{ margin: "4px 0 0", color: "red", fontSize: 13 }}>
              ⚠️ You have not been assigned an office yet.
            </p>
          )}
        </div>

        {/* Office Selection Pills */}
        <div style={{ display: "flex", gap: 8, background: "#eee", padding: 4, borderRadius: 8 }}>
          {OFFICES.map(o => (
            <button
              key={o}
              onClick={() => setSelectedOffice(o)}
              style={{
                padding: "8px 16px",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                fontWeight: "bold",
                fontSize: 13,
                background: selectedOffice === o ? "#fff" : "transparent",
                color: selectedOffice === o ? "#111" : "#666",
                boxShadow: selectedOffice === o ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                transition: "all 0.2s"
              }}
            >
              {o}
            </button>
          ))}
        </div>
      </div>

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
          <span style={{ fontSize: 13, color: "#888", textTransform: "uppercase", fontWeight: "bold", letterSpacing: 0.5 }}>
            {selectedOffice} Office Cash Balance
          </span>
          <h1 style={{ margin: "4px 0 8px", fontSize: 36, color: "#111", display: "flex", alignItems: "baseline", gap: 4 }}>
            <span style={{ fontSize: 24, color: "#555" }}>₦</span>
            {officeBalance.toLocaleString()}
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              background: isAssigned ? "#00aa00" : "#d69e2e"
            }} />
            <span style={{ fontSize: 13, color: "#555" }}>
              {isAssigned 
                ? `You are in charge of ${selectedOffice} cash tx / ${selectedOffice} Office.`
                : `Read-only access (You are not in charge of ${selectedOffice} Office)`
              }
            </span>
          </div>
        </div>

        {isAssigned && (
          <button
            onClick={() => { setShowDepositModal(true); setErrorMsg(""); setDepositAmount(""); setDepositNote("") }}
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
          >
            + Deposit Cash
          </button>
        )}
      </div>

      {/* Filters & Expenses List */}
      <div style={{ background: "white", borderRadius: 12, border: "1px solid #eee", padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <h3 style={{ margin: 0 }}>Expenses Logs</h3>

          {/* Status Filters */}
          <div style={{ display: "flex", gap: 6 }}>
            {(["All", "Pending", "Authorised", "Rejected"] as const).map(f => {
              let bg = "white";
              let textColor = "#555";
              let borderColor = "#ddd";
              if (filter === f) {
                if (f === "Pending") { bg = "#ebf8ff"; textColor = "#2b6cb0"; borderColor = "#2b6cb0"; }
                else if (f === "Authorised") { bg = "#f0fff4"; textColor = "#2f855a"; borderColor = "#2f855a"; }
                else if (f === "Rejected") { bg = "#fff5f5"; textColor = "#c53030"; borderColor = "#c53030"; }
                else { bg = "#111"; textColor = "white"; borderColor = "#111"; }
              }
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 20,
                    border: `1px solid ${borderColor}`,
                    fontSize: 12,
                    cursor: "pointer",
                    background: bg,
                    color: textColor,
                    fontWeight: "bold",
                    transition: "all 0.2s ease"
                  }}
                >
                  {f}
                </button>
              )
            })}
          </div>
        </div>

        {loading ? (
          <p style={{ color: "#888", textAlign: "center", padding: "40px 0" }}>Loading logs...</p>
        ) : filteredExpenses.length === 0 ? (
          <p style={{ color: "#888", textAlign: "center", padding: "40px 0" }}>No expense logs found for this filter.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {filteredExpenses.map(exp => {
              const clerkName = clerksMap[exp.clerk_id] || "Unknown Clerk"
              const isExpanded = expandedExpense === exp.expense_id
              const items = expenseItems[exp.expense_id] || []

              // Status styles
              let statusBg = "#eee"
              let statusColor = "#666"
              if (exp.status === "Pending") { statusBg = "#ebf8ff"; statusColor = "#2b6cb0" }
              else if (exp.status === "Authorised") { statusBg = "#f0fff4"; statusColor = "#2f855a" }
              else if (exp.status === "Rejected") { statusBg = "#fff5f5"; statusColor = "#c53030" }

              return (
                <div key={exp.expense_id} style={{
                  border: "1px solid #eee",
                  borderRadius: 8,
                  overflow: "hidden",
                  transition: "box-shadow 0.2s"
                }}>
                  {/* Expense Header Row */}
                  <div 
                    onClick={() => toggleExpand(exp.expense_id)}
                    style={{
                      padding: "16px 20px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      cursor: "pointer",
                      background: isExpanded ? "#fcfcfc" : "white",
                      flexWrap: "wrap",
                      gap: 12
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontWeight: "bold", color: "#111", fontSize: 15 }}>{exp.title}</span>
                        <span style={{
                          padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: "bold",
                          background: statusBg, color: statusColor
                        }}>{exp.status}</span>
                      </div>
                      <div style={{ color: "#777", fontSize: 12, marginTop: 4 }}>
                        Logged by: <strong>{clerkName}</strong> • {new Date(exp.created_at).toLocaleString()}
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 16, fontWeight: "bold", color: "#111" }}>
                          ₦{exp.total_amount.toLocaleString()}
                        </div>
                        <span style={{ fontSize: 11, color: "#888" }}>{isExpanded ? "Hide items ▲" : "View items ▼"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Item Details */}
                  {isExpanded && (
                    <div style={{ padding: "16px 20px", background: "#fcfcfc", borderTop: "1px solid #f1f1f1" }}>
                      <h4 style={{ margin: "0 0 10px 0", fontSize: 13, color: "#555" }}>Expense Items Breakdown</h4>
                      {items.length === 0 ? (
                        <p style={{ color: "#999", fontSize: 12, margin: 0 }}>Loading breakdown...</p>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                          {items.map(item => (
                            <div key={item.item_id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", borderBottom: "1px dashed #eee" }}>
                              <span style={{ color: "#333" }}>{item.item_name}</span>
                              <span style={{ fontWeight: "bold", color: "#111" }}>₦{item.amount.toLocaleString()}</span>
                            </div>
                          ))}
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: "bold", paddingTop: 8, borderTop: "1px solid #eee" }}>
                            <span>Total</span>
                            <span style={{ color: "#0070f3" }}>₦{exp.total_amount.toLocaleString()}</span>
                          </div>
                        </div>
                      )}

                      {/* Resolution details (Authorised/Rejected info) */}
                      {exp.resolved_at && (
                        <div style={{ background: "#f3f4f6", padding: 12, borderRadius: 6, fontSize: 12, color: "#555", marginTop: 12 }}>
                          {exp.status === "Authorised" ? (
                            <div>
                              ✅ Authorised by <strong>{adminsMap[exp.authorised_by || ""] || "Admin"}</strong> on {new Date(exp.resolved_at).toLocaleString()}
                            </div>
                          ) : (
                            <div>
                              ❌ Rejected by <strong>{adminsMap[exp.authorised_by || ""] || "Admin"}</strong> on {new Date(exp.resolved_at).toLocaleString()}
                              <div style={{ marginTop: 4, paddingLeft: 12, borderLeft: "2px solid #ff4444", color: "#c53030", fontWeight: "500" }}>
                                Reason: "{exp.rejection_reason}"
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Pending Action Buttons (Only for assigned office) */}
                      {exp.status === "Pending" && (
                        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                          {isAssigned ? (
                            <>
                              <button
                                onClick={() => handleAuthorise(exp)}
                                disabled={submitting}
                                style={{
                                  flex: 1, padding: "10px", cursor: "pointer", borderRadius: 8, border: "1px solid #10b981", color: "#10b981", background: "rgba(16,185,129,0.05)", fontSize: 13, fontWeight: "bold", transition: "all 0.2s ease"
                                }}
                              >
                                Authorise Expense
                              </button>
                              <button
                                onClick={() => { setRejectId(exp.expense_id); setRejectionReason(""); setErrorMsg(""); setShowRejectModal(true) }}
                                disabled={submitting}
                                style={{
                                  flex: 1, padding: "10px", cursor: "pointer", borderRadius: 8, border: "1px solid #ef4444", color: "#ef4444", background: "rgba(239,68,68,0.05)", fontSize: 13, fontWeight: "bold", transition: "all 0.2s ease"
                                }}
                              >
                                Reject Expense
                              </button>
                            </>
                          ) : (
                            <span style={{ fontSize: 12, color: "#d69e2e", fontStyle: "italic" }}>
                              * Only the assigned administrator of {selectedOffice} office can authorise or reject.
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* MODALS */}
      {/* 1. Office Assignment Modal */}
      {showAssignModal && (
        <div style={modalOverlay}>
          <div style={modalContent}>
            <h3 style={{ margin: "0 0 12px 0" }}>Set Office Assignment</h3>
            <p style={{ color: "#666", fontSize: 13, marginBottom: 20 }}>
              Please select the office you are in charge of. You will be able to authorise pending expenses and add balance for this office. Other offices will be read-only.
            </p>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontWeight: "bold", marginBottom: 6, fontSize: 13 }}>Office Location</label>
              <select
                value={newAssignedOffice}
                onChange={(e) => { setNewAssignedOffice(e.target.value); setErrorMsg("") }}
                style={{ width: "100%", padding: 10, borderRadius: 6, border: "1px solid #ddd" }}
              >
                <option value="">Select office</option>
                {OFFICES.map(o => (<option key={o} value={o}>{o} Office</option>))}
              </select>
            </div>
            {errorMsg && <p style={{ color: "red", fontSize: 12, margin: "0 0 12px" }}>{errorMsg}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              {assignedOffice && (
                <button onClick={() => setShowAssignModal(false)} style={cancelBtn}>Cancel</button>
              )}
              <button
                onClick={handleSaveAssignment}
                disabled={submitting || !newAssignedOffice}
                style={{ ...primaryBtn, flex: 1 }}
              >
                {submitting ? "Saving..." : "Save Assignment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Deposit Cash Modal */}
      {showDepositModal && (
        <div onClick={() => setShowDepositModal(false)} style={modalOverlay}>
          <div onClick={(e) => e.stopPropagation()} style={modalContent}>
            <h3 style={{ margin: "0 0 16px 0" }}>Deposit Cash — {selectedOffice}</h3>
            
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontWeight: "bold", marginBottom: 6, fontSize: 13 }}>Amount (₦) *</label>
              <input
                type="text"
                placeholder="e.g. 50,000"
                value={depositAmount}
                onChange={(e) => { setDepositAmount(formatAmount(e.target.value)); setErrorMsg("") }}
                style={{ width: "100%", padding: 10, borderRadius: 6, border: "1px solid #ddd", fontSize: 16, fontWeight: "bold" }}
                autoFocus
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontWeight: "bold", marginBottom: 6, fontSize: 13 }}>Notes / Description</label>
              <textarea
                placeholder="Add a note about this cash injection..."
                value={depositNote}
                onChange={(e) => setDepositNote(e.target.value)}
                style={{ width: "100%", padding: 10, borderRadius: 6, border: "1px solid #ddd", minHeight: 80, fontFamily: "inherit" }}
              />
            </div>

            {errorMsg && <p style={{ color: "red", fontSize: 12, margin: "0 0 12px" }}>{errorMsg}</p>}
            
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowDepositModal(false)} style={cancelBtn}>Cancel</button>
              <button
                onClick={handleDeposit}
                disabled={submitting}
                style={{ ...primaryBtn, flex: 1 }}
              >
                {submitting ? "Processing..." : "Complete Deposit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Rejection Reason Modal */}
      {showRejectModal && (
        <div onClick={() => setShowRejectModal(false)} style={modalOverlay}>
          <div onClick={(e) => e.stopPropagation()} style={modalContent}>
            <h3 style={{ margin: "0 0 12px 0", color: "#ef4444" }}>Reject Expense</h3>
            <p style={{ color: "#666", fontSize: 13, marginBottom: 16 }}>
              Provide a reason for rejecting this expense. This will be shown to the office clerk.
            </p>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontWeight: "bold", marginBottom: 6, fontSize: 13 }}>Rejection Reason *</label>
              <textarea
                placeholder="Explain why this expense is being rejected..."
                value={rejectionReason}
                onChange={(e) => { setRejectionReason(e.target.value); setErrorMsg("") }}
                style={{ width: "100%", padding: 10, borderRadius: 6, border: "1px solid #ddd", minHeight: 80, fontFamily: "inherit" }}
                autoFocus
              />
            </div>

            {errorMsg && <p style={{ color: "red", fontSize: 12, margin: "0 0 12px" }}>{errorMsg}</p>}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowRejectModal(false)} style={cancelBtn}>Cancel</button>
              <button
                onClick={handleReject}
                disabled={submitting}
                style={{ ...primaryBtn, background: "#ef4444", flex: 1 }}
              >
                {submitting ? "Rejecting..." : "Reject Expense"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const modalOverlay: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100
}

const modalContent: React.CSSProperties = {
  background: "white", borderRadius: 12, padding: 32,
  width: 440, maxWidth: "90vw", boxShadow: "0 8px 32px rgba(0,0,0,0.2)"
}

const primaryBtn: React.CSSProperties = {
  padding: "10px 0", background: "#0070f3", color: "white",
  border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold",
  fontSize: 14
}

const cancelBtn: React.CSSProperties = {
  flex: 1, padding: "10px 0", background: "white",
  border: "1px solid #ddd", borderRadius: 6, cursor: "pointer", fontSize: 14
}
