"use client"

import React from "react"
import Image from "next/image"
import { FONT_SIZE } from "@/lib/constants"
import { toISOString } from "@/lib/date-utils"
import { useState, useEffect, useMemo } from "react"
import { supabase } from "@/lib/supabase"
import type { User } from "@supabase/supabase-js"
import { apiMutate } from "@/lib/api-mutation"
import { usePermissions } from "@/lib/PermissionContext"

type CashDeposit = {
  deposit_id: string
  office_name: string
  amount: number
  note: string | null
  deposited_by: string
  created_at: string
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
  approval_notes: string | null
  created_at: string
  resolved_at: string | null
}

type TopUp = {
  transaction_id: string
  from_account: string
  to_account: string
  amount: number
  description: string | null
  created_by: string | null
  created_at: string
}

type ExpenseItem = {
  item_id: string
  expense_id: string
  item_name: string
  amount: number
}

const OFFICES = ["Calabar", "Ikom", "Ogoja", "Uyo", "Haulage"]

// Responsive breakpoint hook
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

// Fixed typography scale


export default function CashExpenses() {
  const { getAccess } = usePermissions()
  const { canAuthorize } = getAccess("cash-expenses")
  const { isMobile } = useBreakpoint()
  const [selectedOffice, setSelectedOffice] = useState<string>("Calabar")
  const [assignedOffice, setAssignedOffice] = useState<string | null>(null)
  const [isCashAuthorizer, setIsCashAuthorizer] = useState(false)
  const [adminUser, setAdminUser] = useState<User | null>(null)
  const [officeBalance, setOfficeBalance] = useState<number>(0)
  const [expenses, setExpenses] = useState<CashExpense[]>([])
  const [deposits, setDeposits] = useState<CashDeposit[]>([])
  const [topUps, setTopUps] = useState<TopUp[]>([])
  const [clerksMap, setClerksMap] = useState<Record<string, string>>({})
  const [clerkPicsMap, setClerkPicsMap] = useState<Record<string, string>>({})
  const [adminsMap, setAdminsMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  // Filter state
  const [filter, setFilter] = useState<"All" | "Pending" | "Authorised" | "Rejected" | "Top-ups">("All")

  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState("")

  const [showApproveModal, setShowApproveModal] = useState(false)
  const [approveId, setApproveId] = useState<string | null>(null)
  const [approvalNotes, setApprovalNotes] = useState("")

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
      fetchDeposits()
      fetchTopUps()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOffice])

  async function initData() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setAdminUser(user)

        // Determine if user is a CashAuthorizer
        const { data: userRoles } = await supabase
          .from("UserRoles")
          .select("role")
          .eq("user_id", user.id)
        const roleList = userRoles?.map(r => r.role) || []
        const isAuth = roleList.includes("CashAuthorizer")
        setIsCashAuthorizer(isAuth)

        if (isAuth) {
          // Fetch assigned office from cash_authorizers table
          const { data: authorizer } = await supabase
            .from("cash_authorizers")
            .select("assigned_office")
            .eq("authorizer_id", user.id)
            .maybeSingle()
          
          if (authorizer?.assigned_office) {
            setAssignedOffice(authorizer.assigned_office)
            setSelectedOffice(authorizer.assigned_office)
          }
        }
      }

      // Fetch cash officers
      const { data: clerks } = await supabase.from("cash_officers").select("clerk_id, full_name, profile_picture_url")
      const cMap: Record<string, string> = {}
      const cpMap: Record<string, string> = {}
      clerks?.forEach(c => { cMap[c.clerk_id] = c.full_name; if (c.profile_picture_url) cpMap[c.clerk_id] = c.profile_picture_url })
      setClerksMap(cMap)
      setClerkPicsMap(cpMap)

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
    if (selectedOffice === "Haulage") {
      const { data } = await supabase
        .from("maintenance_balance")
        .select("current_balance")
        .eq("id", 1)
        .single()
      setOfficeBalance(data?.current_balance ?? 0)
      return
    }
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

  async function fetchDeposits() {
    const { data } = await supabase
      .from("cash_deposits")
      .select("*")
      .eq("office_name", selectedOffice)
      .order("created_at", { ascending: false })
    setDeposits(data || [])
  }

  async function fetchTopUps() {
    const { data } = await supabase
      .from("transactions")
      .select("*")
      .eq("to_account", selectedOffice)
      .order("created_at", { ascending: false })
    setTopUps(data || [])
  }

  const balanceMap = useMemo(() => {
    const map: Record<string, number> = {}
    const records: { id: string; amount: number; timestamp: string }[] = [
      ...expenses.filter(e => e.status === "Authorised" && e.resolved_at !== null).map(e => ({
        id: e.expense_id, amount: e.total_amount, timestamp: e.resolved_at ?? e.created_at
      })),
      ...deposits.map(d => ({
        id: d.deposit_id, amount: -d.amount, timestamp: d.created_at
      })),
      ...topUps.map(t => ({
        id: t.transaction_id, amount: -t.amount, timestamp: t.created_at
      })),
    ]
    records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    let running = officeBalance
    for (const rec of records) {
      map[rec.id] = running
      running += rec.amount
    }
    return map
  }, [expenses, deposits, topUps, officeBalance])

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

  async function handleAuthorise(expense: CashExpense, notes?: string) {
    if (!canAuthorize) { setErrorMsg("You do not have permission to authorise expenses"); return }
    if (!adminUser) return
    if (officeBalance < expense.total_amount) {
      alert("Insufficient office balance to authorise this expense! Current balance is ₦" + officeBalance.toLocaleString() + " but expense total is ₦" + expense.total_amount.toLocaleString())
      return
    }

    setSubmitting(true)

    try {
      // Atomic: check balance, deduct, mark Authorised
      const { data, error } = await apiMutate("finance", {
        action: "rpc",
        function: "authorise_cash_expense",
        params: { p_expense_id: expense.expense_id, p_admin_id: adminUser.id, p_notes: notes || null },
      })

      if (error) { alert("Error authorising: " + error); return }

      const result = data as { success?: boolean; error?: string; new_balance?: number } | null
      if (result && result.success === false) {
        alert(result.error || "Failed to authorise expense")
        return
      }
      if (result && typeof result.new_balance === "number") {
        setOfficeBalance(result.new_balance)
      }

      setMessage("Expense authorised and balance updated!")
      setTimeout(() => setMessage(""), 3000)
      fetchExpenses()
    } catch {
      setErrorMsg("Network error, please try again")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleReject() {
    if (!canAuthorize) { setErrorMsg("You do not have permission to reject expenses"); return }
    if (!rejectId) return
    if (!rejectionReason.trim()) {
      setErrorMsg("Please provide a rejection reason")
      return
    }
    if (!adminUser) return

    setSubmitting(true)

    try {
      const { error } = await apiMutate("finance", {
        action: "update", table: "cash_expenses",
        data: { status: "Rejected", rejection_reason: rejectionReason, authorised_by: adminUser.id, resolved_at: toISOString() },
        filters: { expense_id: rejectId },
      })

      if (error) { setErrorMsg("Failed to reject expense: " + error); return }

      setShowRejectModal(false)
      setRejectId(null)
      setRejectionReason("")
      setMessage("Expense rejected successfully.")
      fetchExpenses()
      setTimeout(() => setMessage(""), 3000)
    } catch {
      setErrorMsg("Network error, please try again")
    } finally {
      setSubmitting(false)
    }
  }
  const isAssigned = isCashAuthorizer ? Boolean(assignedOffice && selectedOffice === assignedOffice) : true

  const filteredExpenses = expenses.filter(e => {
    if (filter === "All") return true
    return e.status === filter
  })

  const logEntries = useMemo(() => {
    const expenseEntries = filteredExpenses.map(e => ({
      kind: "expense" as const,
      id: e.expense_id,
      timestamp: e.resolved_at ?? e.created_at,
      data: e,
    }))
    if (filter === "Top-ups") {
      const topUpEntries = topUps.map(t => ({
        kind: "topup" as const,
        id: t.transaction_id,
        timestamp: t.created_at,
        data: t,
      }))
      return topUpEntries
    }
    if (filter !== "All") return expenseEntries
    const depositEntries = deposits.map(d => ({
      kind: "deposit" as const,
      id: d.deposit_id,
      timestamp: d.created_at,
      data: d,
    }))
    const topUpEntries = topUps.map(t => ({
      kind: "topup" as const,
      id: t.transaction_id,
      timestamp: t.created_at,
      data: t,
    }))
    return [...expenseEntries, ...depositEntries, ...topUpEntries].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
  }, [filteredExpenses, deposits, topUps, filter])

  function toggleExpand(expenseId: string) {
    if (expandedExpense === expenseId) {
      setExpandedExpense(null)
    } else {
      setExpandedExpense(expenseId)
      fetchExpenseItems(expenseId)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    boxSizing: "border-box",
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    fontSize: FONT_SIZE.base,
    background: "white",
    color: "#0f172a",
    minHeight: 48,
    transition: "border-color 0.2s ease",
  }

  const textareaStyle: React.CSSProperties = {
    ...inputStyle,
    minHeight: 100,
    resize: "vertical",
    fontFamily: "'Inter', sans-serif"
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: isMobile ? "16px" : "32px", fontFamily: "'Inter', sans-serif" }}>
      {/* Messages */}
      {message && (
        <div style={{ padding: "12px 16px", background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#16a34a", borderRadius: 8, marginBottom: 24, fontSize: FONT_SIZE.sm, fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          {message}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 16, marginBottom: 32 }}>
        <div>
          <h1 style={{ margin: 0, color: "#0f172a", fontSize: isMobile ? FONT_SIZE["2xl"] : FONT_SIZE["3xl"], fontWeight: 700, letterSpacing: "-0.5px" }}>
            Cash Expenses
          </h1>
          {assignedOffice ? (
            <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: FONT_SIZE.base, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              Your assigned office: <strong style={{ color: "#0f172a" }}>{assignedOffice}</strong>
            </p>
          ) : (
            <p style={{ margin: "8px 0 0", color: "#ef4444", fontSize: FONT_SIZE.base, display: "flex", alignItems: "center", gap: 6, fontWeight: 500 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              You have not been assigned an office yet.
            </p>
          )}
        </div>

        {/* Office Selection Pills */}
        <div style={{ display: "flex", gap: 6, background: "#f1f5f9", padding: 4, borderRadius: 10, overflowX: "auto", maxWidth: "100%" }}>
          {OFFICES.map(o => (
            <button
              key={o}
              onClick={() => setSelectedOffice(o)}
              style={{
                padding: "8px 16px",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                fontWeight: selectedOffice === o ? 600 : 500,
                fontSize: FONT_SIZE.sm,
                background: selectedOffice === o ? "white" : "transparent",
                color: selectedOffice === o ? "#0f172a" : "#64748b",
                boxShadow: selectedOffice === o ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                transition: "all 0.2s ease",
                whiteSpace: "nowrap"
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
        borderRadius: 16,
        padding: isMobile ? 20 : 32,
        border: "1px solid #e2e8f0",
        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)",
        marginBottom: 32,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 24,
        position: "relative",
        overflow: "hidden"
      }}>
        {/* Subtle background decoration */}
        <div style={{ position: "absolute", right: -50, top: -50, width: 200, height: 200, background: "radial-gradient(circle, rgba(0,112,243,0.05) 0%, rgba(255,255,255,0) 70%)", borderRadius: "50%", pointerEvents: "none" }} />

        <div style={{ position: "relative", zIndex: 1 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.5, marginBottom: 8 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>
            {selectedOffice === "Haulage" ? "Haulage Maintenance Fund Balance" : `${selectedOffice} Office Cash Balance`}
          </span>
          <h1 style={{ margin: "0 0 12px", fontSize: isMobile ? 32 : 48, color: "#0f172a", fontWeight: 800, display: "flex", alignItems: "baseline", gap: 6, letterSpacing: "-1px" }}>
            <span style={{ fontSize: isMobile ? 24 : 32, color: "#94a3b8", fontWeight: 600 }}>₦</span>
            {officeBalance.toLocaleString()}
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: isAssigned ? "#f0fdf4" : "#fffbeb", padding: "6px 12px", borderRadius: 20, width: "fit-content" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: isAssigned ? "#16a34a" : "#f5a623" }} />
            <span style={{ fontSize: FONT_SIZE.xs, color: isAssigned ? "#16a34a" : "#b45309", fontWeight: 600 }}>
              {isAssigned ? `Active Assignment` : `Read-only Access`}
            </span>
          </div>
        </div>
      </div>

      {/* Filters & Expenses List */}
      <div style={{ background: "white", borderRadius: 16, border: "1px solid #e2e8f0", padding: isMobile ? 20 : 32, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 16, marginBottom: 24 }}>
          <h3 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>Expense Logs</h3>

          {/* Status Filters */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(["All", "Pending", "Authorised", "Rejected", "Top-ups"] as const).map(f => {
              const isActive = filter === f
              let bg = "white"
              let color = "#64748b"
              let borderColor = "#e2e8f0"

              if (isActive) {
                if (f === "Pending") { bg = "#eff6ff"; color = "#0070f3"; borderColor = "#0070f3" }
                else if (f === "Authorised") { bg = "#f0fdf4"; color = "#16a34a"; borderColor = "#16a34a" }
                else if (f === "Rejected") { bg = "#fef2f2"; color = "#ef4444"; borderColor = "#ef4444" }
                else if (f === "Top-ups") { bg = "#eef2ff"; color = "#4f46e5"; borderColor = "#4f46e5" }
                else { bg = "#0f172a"; color = "white"; borderColor = "#0f172a" }
              }

              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 20,
                    border: `1.5px solid ${borderColor}`,
                    fontSize: FONT_SIZE.xs,
                    cursor: "pointer",
                    background: bg,
                    color: color,
                    fontWeight: isActive ? 600 : 500,
                    transition: "all 0.2s ease"
                  }}
                  onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1" } }}
                  onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#e2e8f0" } }}
                >
                  {f}
                </button>
              )
            })}
          </div>
        </div>

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "64px 0" }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid #e2e8f0", borderTopColor: "#0070f3", animation: "spin 1s linear infinite" }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : logEntries.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 24px", background: "#f8fafc", borderRadius: 12, border: "1px dashed #cbd5e1" }}>
            <div style={{ width: 48, height: 48, background: "white", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </div>
            <p style={{ color: "#64748b", fontSize: FONT_SIZE.base, margin: 0, fontWeight: 500 }}>No expense logs found for this filter.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {logEntries.map(entry => {
              if (entry.kind === "deposit") {
                const dep = entry.data
                const depositorName = adminsMap[dep.deposited_by] || "Cash Officer"
                return (
                  <div key={dep.deposit_id} style={{ border: "1px solid #bbf7d0", borderRadius: 12, overflow: "hidden", background: "#f0fdf4", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                    <div style={{ padding: isMobile ? "16px" : "20px 24px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 600, color: "#166534", fontSize: FONT_SIZE.md }}>Cash Deposit</span>
                          <span style={{ padding: "4px 10px", borderRadius: 16, fontSize: FONT_SIZE.xs, fontWeight: 600, background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0" }}>Income</span>
                        </div>
                        <div style={{ fontSize: FONT_SIZE.lg, fontWeight: 700, color: "#16a34a", letterSpacing: "-0.5px" }}>
                          +₦{dep.amount.toLocaleString()}
                        </div>
                      </div>
                      <div style={{ fontSize: FONT_SIZE.xs, color: "#64748b", marginBottom: dep.note ? 8 : 0 }}>
                        <strong style={{ color: "#334155" }}>{depositorName}</strong>
                        <span style={{ margin: "0 6px" }}>·</span>
                        <span>{new Date(dep.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      {dep.note && (
                        <p style={{ margin: "0 0 8px", color: "#475569", fontSize: FONT_SIZE.sm, fontStyle: "italic" }}>&quot;{dep.note}&quot;</p>
                      )}
                      {balanceMap[dep.deposit_id] !== undefined && (
                        <div style={{ fontSize: FONT_SIZE.xs, fontWeight: 600, color: "#166534", background: "#dcfce7", padding: "4px 10px", borderRadius: 6, display: "inline-block", border: "1px solid #bbf7d0" }}>
                          Balance after: ₦{balanceMap[dep.deposit_id].toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>
                )
              }
              if (entry.kind === "topup") {
                const t = entry.data
                const adminName = adminsMap[t.created_by || ""] || "Admin"
                return (
                  <div key={t.transaction_id} style={{ border: "1px solid #c7d2fe", borderRadius: 12, overflow: "hidden", background: "#eef2ff", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                    <div style={{ padding: isMobile ? "16px" : "20px 24px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 600, color: "#3730a3", fontSize: FONT_SIZE.md }}>Balance Top-up</span>
                          <span style={{ padding: "4px 10px", borderRadius: 16, fontSize: FONT_SIZE.xs, fontWeight: 600, background: "#eef2ff", color: "#4f46e5", border: "1px solid #c7d2fe" }}>Income</span>
                        </div>
                        <div style={{ fontSize: FONT_SIZE.lg, fontWeight: 700, color: "#4f46e5", letterSpacing: "-0.5px" }}>
                          +₦{t.amount.toLocaleString()}
                        </div>
                      </div>
                      <div style={{ fontSize: FONT_SIZE.xs, color: "#64748b", marginBottom: t.description ? 8 : 0 }}>
                        <strong style={{ color: "#334155" }}>{adminName}</strong>
                        <span style={{ margin: "0 6px" }}>·</span>
                        <span>from {t.from_account}</span>
                        <span style={{ margin: "0 6px" }}>·</span>
                        <span>{new Date(t.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      {t.description && (
                        <p style={{ margin: "0 0 8px", color: "#475569", fontSize: FONT_SIZE.sm, fontStyle: "italic" }}>&quot;{t.description}&quot;</p>
                      )}
                      {balanceMap[t.transaction_id] !== undefined && (
                        <div style={{ fontSize: FONT_SIZE.xs, fontWeight: 600, color: "#3730a3", background: "#ddd6fe", padding: "4px 10px", borderRadius: 6, display: "inline-block", border: "1px solid #c7d2fe" }}>
                          Balance after: ₦{balanceMap[t.transaction_id].toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>
                )
              }
              const exp = entry.data
              const clerkName = clerksMap[exp.clerk_id] || "Unknown Clerk"
              const clerkPic = clerkPicsMap[exp.clerk_id]
              const isExpanded = expandedExpense === exp.expense_id
              const items = expenseItems[exp.expense_id] || []

              // Status styles
              let statusBg = "#f1f5f9"
              let statusColor = "#64748b"
              let statusBorder = "#cbd5e1"
              
              if (exp.status === "Pending") { statusBg = "#eff6ff"; statusColor = "#0070f3"; statusBorder = "#bfdbfe" }
              else if (exp.status === "Authorised") { statusBg = "#f0fdf4"; statusColor = "#16a34a"; statusBorder = "#bbf7d0" }
              else if (exp.status === "Rejected") { statusBg = "#fef2f2"; statusColor = "#ef4444"; statusBorder = "#fecaca" }

              return (
                <div key={exp.expense_id} style={{
                  border: `1px solid ${isExpanded ? "#cbd5e1" : "#e2e8f0"}`,
                  borderRadius: 12,
                  overflow: "hidden",
                  transition: "all 0.2s ease",
                  boxShadow: isExpanded ? "0 4px 12px rgba(0,0,0,0.05)" : "none",
                  background: "white"
                }}>
                  {/* Expense Header Row */}
                  <div 
                    onClick={() => toggleExpand(exp.expense_id)}
                    style={{
                      padding: isMobile ? "16px" : "20px 24px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: isMobile ? "flex-start" : "center",
                      cursor: "pointer",
                      background: isExpanded ? "#f8fafc" : "white",
                      flexDirection: isMobile ? "column" : "row",
                      gap: 16
                    }}
                    onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = "#f8fafc" }}
                    onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = "white" }}
                  >
                    <div style={{ flex: 1, minWidth: 200, width: "100%" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 600, color: "#0f172a", fontSize: FONT_SIZE.md }}>{exp.title}</span>
                        <span style={{
                          padding: "4px 10px", borderRadius: 16, fontSize: FONT_SIZE.xs, fontWeight: 600,
                          background: statusBg, color: statusColor, border: `1px solid ${statusBorder}`
                        }}>{exp.status}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#64748b", fontSize: FONT_SIZE.xs }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ width: 20, height: 20, borderRadius: "50%", background: clerkPic ? "transparent" : "#e2e8f0", color: "#64748b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, overflow: "hidden" }}>
                            {clerkPic ? (
                              <Image src={clerkPic} alt={clerkName} width={48} height={48} unoptimized style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            ) : (
                              clerkName.charAt(0)
                            )}
                          </div>
                          <strong style={{ color: "#334155" }}>{clerkName}</strong>
                        </div>
                        <span>•</span>
                        <span>{new Date(exp.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: isMobile ? "100%" : "auto", gap: 24 }}>
                      <div style={{ textAlign: isMobile ? "left" : "right" }}>
                        <div style={{ fontSize: FONT_SIZE.lg, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.5px" }}>
                          ₦{exp.total_amount.toLocaleString()}
                        </div>
                        {balanceMap[exp.expense_id] !== undefined && (
                          <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.xs, fontWeight: 600, color: "#16a34a", background: "#f0fdf4", padding: "2px 8px", borderRadius: 4, display: "inline-block" }}>
                            Balance after: ₦{balanceMap[exp.expense_id].toLocaleString()}
                          </p>
                        )}
                        <span style={{ fontSize: FONT_SIZE.xs, color: "#0070f3", fontWeight: 500, display: "flex", alignItems: "center", gap: 4, justifyContent: isMobile ? "flex-start" : "flex-end", marginTop: 4 }}>
                          {isExpanded ? "Hide Details" : "View Details"}
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}><polyline points="6 9 12 15 18 9"/></svg>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Item Details */}
                  {isExpanded && (
                    <div style={{ padding: isMobile ? "20px 16px" : "24px", background: "white", borderTop: "1px solid #e2e8f0" }}>
                      <h4 style={{ margin: "0 0 16px 0", fontSize: FONT_SIZE.sm, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Expense Breakdown</h4>
                      
                      {items.length === 0 ? (
                        <div style={{ padding: 20, textAlign: "center", background: "#f8fafc", borderRadius: 8 }}>
                          <div style={{ width: 24, height: 24, border: "2px solid #cbd5e1", borderTopColor: "#0070f3", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 8px" }} />
                          <p style={{ color: "#94a3b8", fontSize: FONT_SIZE.xs, margin: 0 }}>Loading items...</p>
                        </div>
                      ) : (
                        <div style={{ background: "#f8fafc", borderRadius: 12, padding: 16, border: "1px solid #e2e8f0" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
                            {items.map(item => (
                              <div key={item.item_id} style={{ display: "flex", justifyContent: "space-between", fontSize: FONT_SIZE.sm, paddingBottom: 12, borderBottom: "1px dashed #cbd5e1" }}>
                                <span style={{ color: "#475569", fontWeight: 500 }}>{item.item_name}</span>
                                <span style={{ fontWeight: 600, color: "#0f172a" }}>₦{item.amount.toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: FONT_SIZE.base, fontWeight: 700, paddingTop: 4 }}>
                            <span style={{ color: "#0f172a" }}>Total Amount</span>
                            <span style={{ color: "#0070f3" }}>₦{exp.total_amount.toLocaleString()}</span>
                          </div>
                        </div>
                      )}

                      {/* Resolution details (Authorised/Rejected info) */}
                      {exp.resolved_at && (
                        <div style={{ background: exp.status === "Authorised" ? "#f0fdf4" : "#fef2f2", padding: 16, borderRadius: 12, marginTop: 16, border: `1px solid ${exp.status === "Authorised" ? "#bbf7d0" : "#fecaca"}` }}>
                          {exp.status === "Authorised" ? (
                            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                              <div style={{ background: "#16a34a", color: "white", padding: 4, borderRadius: "50%" }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                              </div>
                              <div>
                                <p style={{ margin: "0 0 4px 0", color: "#16a34a", fontSize: FONT_SIZE.sm, fontWeight: 600 }}>Authorised</p>
                                <p style={{ margin: 0, color: "#15803d", fontSize: FONT_SIZE.xs }}>By <strong>{adminsMap[exp.authorised_by || ""] || "Admin"}</strong> on {new Date(exp.resolved_at).toLocaleString()}</p>
                                {exp.approval_notes && (
                                  <div style={{ marginTop: 8, padding: 12, background: "white", borderRadius: 8, border: "1px solid #bbf7d0", color: "#166534", fontSize: FONT_SIZE.sm, fontStyle: "italic" }}>
                                    &quot;{exp.approval_notes}&quot;
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                              <div style={{ background: "#ef4444", color: "white", padding: 4, borderRadius: "50%" }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                              </div>
                              <div style={{ width: "100%" }}>
                                <p style={{ margin: "0 0 4px 0", color: "#ef4444", fontSize: FONT_SIZE.sm, fontWeight: 600 }}>Rejected</p>
                                <p style={{ margin: "0 0 12px 0", color: "#b91c1c", fontSize: FONT_SIZE.xs }}>By <strong>{adminsMap[exp.authorised_by || ""] || "Admin"}</strong> on {new Date(exp.resolved_at).toLocaleString()}</p>
                                <div style={{ padding: 12, background: "white", borderRadius: 8, border: "1px solid #fecaca", color: "#7f1d1d", fontSize: FONT_SIZE.sm, fontStyle: "italic" }}>
                                  &quot;{exp.rejection_reason}&quot;
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Pending Action Buttons (Only for assigned office) */}
                      {exp.status === "Pending" && (
                        <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid #e2e8f0" }}>
                          {isAssigned ? (
                            <div style={{ display: "flex", gap: 12, flexDirection: isMobile ? "column" : "row" }}>
                              <button
                                onClick={() => { setApproveId(exp.expense_id); setApprovalNotes(""); setErrorMsg(""); setShowApproveModal(true) }}
                                disabled={submitting || !canAuthorize}
                                style={{
                                  flex: 1, padding: "12px", cursor: submitting || !canAuthorize ? "not-allowed" : "pointer", borderRadius: 8, border: "1px solid #16a34a", color: "white", background: submitting || !canAuthorize ? "#94a3b8" : "#16a34a", fontSize: FONT_SIZE.sm, fontWeight: 600, transition: "all 0.2s ease", display: "flex", justifyContent: "center", alignItems: "center", gap: 8, opacity: submitting || !canAuthorize ? 0.7 : 1
                                }}
                                onMouseEnter={e => !submitting && (e.currentTarget.style.background = "#15803d")}
                                onMouseLeave={e => !submitting && (e.currentTarget.style.background = "#16a34a")}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                                Authorise
                              </button>
                              <button
                                onClick={() => { setRejectId(exp.expense_id); setRejectionReason(""); setErrorMsg(""); setShowRejectModal(true) }}
                                disabled={submitting || !canAuthorize}
                                style={{
                                  flex: 1, padding: "12px", cursor: submitting || !canAuthorize ? "not-allowed" : "pointer", borderRadius: 8, border: "1px solid #fecaca", color: "#ef4444", background: submitting || !canAuthorize ? "#94a3b8" : "white", fontSize: FONT_SIZE.sm, fontWeight: 600, transition: "all 0.2s ease", display: "flex", justifyContent: "center", alignItems: "center", gap: 8, opacity: submitting || !canAuthorize ? 0.7 : 1
                                }}
                                onMouseEnter={e => !submitting && (e.currentTarget.style.background = "#fef2f2")}
                                onMouseLeave={e => !submitting && (e.currentTarget.style.background = "white")}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                Reject
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 12, background: "#fffbeb", borderRadius: 8, border: "1px solid #fde68a", color: "#b45309", fontSize: FONT_SIZE.xs, fontWeight: 500 }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                              Only the assigned administrator for {selectedOffice} can authorise or reject expenses.
                            </div>
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
      {/* 1. Rejection Reason Modal */}
      {showRejectModal && (
        <div onClick={() => setShowRejectModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 100, padding: isMobile ? 0 : 24, animation: "fadeIn 0.2s ease-out" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: isMobile ? "20px 20px 0 0" : 16, padding: isMobile ? "28px 24px" : 32, width: "100%", maxWidth: 440, boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)", animation: "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <div style={{ width: 40, height: 40, background: "#fef2f2", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#ef4444" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </div>
              <h3 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>Reject Expense</h3>
            </div>
            
            <p style={{ color: "#64748b", fontSize: FONT_SIZE.sm, marginBottom: 24, lineHeight: 1.5 }}>
              Provide a reason for rejecting this expense. This will be visible to the cash officer who submitted the request.
            </p>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", fontWeight: 600, color: "#334155", marginBottom: 8, fontSize: FONT_SIZE.sm }}>Rejection Reason *</label>
              <textarea
                placeholder="Explain why this expense is being rejected..."
                value={rejectionReason}
                onChange={(e) => { setRejectionReason(e.target.value); setErrorMsg("") }}
                style={textareaStyle}
                autoFocus
              />
            </div>

            {errorMsg && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 20, color: "#b91c1c", fontSize: FONT_SIZE.sm }}>{errorMsg}</div>}

            <div style={{ display: "flex", gap: 12 }}>
              <button 
                onClick={() => setShowRejectModal(false)} 
                style={{ flex: 1, padding: "12px", background: "white", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: FONT_SIZE.md, transition: "background 0.2s" }}
                onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                onMouseLeave={e => e.currentTarget.style.background = "white"}
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={submitting}
                style={{ flex: 1, padding: "12px", background: "#ef4444", border: "none", color: "white", borderRadius: 8, fontWeight: 600, cursor: submitting ? "not-allowed" : "pointer", fontSize: FONT_SIZE.md, opacity: submitting ? 0.7 : 1, transition: "background 0.2s" }}
                onMouseEnter={e => !submitting && (e.currentTarget.style.background = "#dc2626")}
                onMouseLeave={e => !submitting && (e.currentTarget.style.background = "#ef4444")}
              >
                {submitting ? "Rejecting..." : "Reject Expense"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Approval Notes Modal */}
      {showApproveModal && (
        <div onClick={() => setShowApproveModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 100, padding: isMobile ? 0 : 24, animation: "fadeIn 0.2s ease-out" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: isMobile ? "20px 20px 0 0" : 16, padding: isMobile ? "28px 24px" : 32, width: "100%", maxWidth: 440, boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)", animation: "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <div style={{ width: 40, height: 40, background: "#f0fdf4", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#16a34a" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <h3 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>Authorise Expense</h3>
            </div>
            
            <p style={{ color: "#64748b", fontSize: FONT_SIZE.sm, marginBottom: 24, lineHeight: 1.5 }}>
              Optionally add notes for this approval. This will be visible in the expense details.
            </p>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", fontWeight: 600, color: "#334155", marginBottom: 8, fontSize: FONT_SIZE.sm }}>Notes (optional)</label>
              <textarea
                placeholder="Add any notes about this approval..."
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                style={textareaStyle}
                autoFocus
              />
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <button 
                onClick={() => setShowApproveModal(false)} 
                style={{ flex: 1, padding: "12px", background: "white", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: FONT_SIZE.md, transition: "background 0.2s" }}
                onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                onMouseLeave={e => e.currentTarget.style.background = "white"}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const expense = expenses.find(e => e.expense_id === approveId)
                  if (!expense) return
                  setShowApproveModal(false)
                  await handleAuthorise(expense, approvalNotes || undefined)
                }}
                disabled={submitting}
                style={{ flex: 1, padding: "12px", background: "#16a34a", border: "none", color: "white", borderRadius: 8, fontWeight: 600, cursor: submitting ? "not-allowed" : "pointer", fontSize: FONT_SIZE.md, opacity: submitting ? 0.7 : 1, transition: "background 0.2s" }}
                onMouseEnter={e => !submitting && (e.currentTarget.style.background = "#15803d")}
                onMouseLeave={e => !submitting && (e.currentTarget.style.background = "#16a34a")}
              >
                {submitting ? "Authorising..." : "Confirm Authorise"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
