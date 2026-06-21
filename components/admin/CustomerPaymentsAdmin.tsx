"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { Icon } from "@iconify/react"

type Payment = {
  payment_id: string
  broker_id: string
  bank_name: string
  payment_date: string
  depositor_name: string | null
  customer_id: string | null
  customer_name: string | null
  phone_number: string | null
  amount: number
  status: "Pending" | "Posted"
  posted_by: string | null
  posted_at: string | null
  created_at: string
}

type ViewMode = "card" | "table"

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

const fontSize = {
  xs: 12,
  sm: 13,
  base: 14,
  md: 15,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 28
}

export default function CustomerPaymentsAdmin() {
  const { isMobile, isDesktop } = useBreakpoint()
  const [payments, setPayments] = useState<Payment[]>([])
  const [profilesMap, setProfilesMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>(isMobile ? "card" : "table")
  const [filter, setFilter] = useState<"Pending" | "Posted">("Pending")
  const [filterBank, setFilterBank] = useState("")
  const [brokersList, setBrokersList] = useState<{ broker_id: string; broker_name: string }[]>([])
  const [filterBroker, setFilterBroker] = useState("")
  const [brokerSearch, setBrokerSearch] = useState("")
  const [brokerDropOpen, setBrokerDropOpen] = useState(false)
  const [dateDropOpen, setDateDropOpen] = useState(false)
  const [dateMode, setDateMode] = useState<"single" | "range">("single")
  const [filterDateFrom, setFilterDateFrom] = useState("")
  const [filterDateTo, setFilterDateTo] = useState("")
  const [showPostModal, setShowPostModal] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [newCustomerId, setNewCustomerId] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")

  useEffect(() => { initData() }, [])

  async function initData() {
    setLoading(true)
    const { data: profiles } = await supabase.from("Profiles").select("user_id, full_name")
    const { data: brokers } = await supabase.from("Brokers").select("broker_id, broker_name").order("broker_name", { ascending: true })
    const pMap: Record<string, string> = {}
    profiles?.forEach(p => { pMap[p.user_id] = p.full_name })
    brokers?.forEach(b => { if (!pMap[b.broker_id]) pMap[b.broker_id] = b.broker_name })
    setProfilesMap(pMap)
    setBrokersList(brokers || [])
    await fetchPayments()
  }

  async function fetchPayments() {
    const { data } = await supabase.from("customer_payments").select("*").order("created_at", { ascending: false })
    if (data) setPayments(data)
    setLoading(false)
  }

  function openPostModal(payment: Payment) {
    setSelectedPayment(payment)
    setNewCustomerId("")
    setErrorMsg("")
    setShowPostModal(true)
  }

  async function handlePost() {
    if (!selectedPayment) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setSubmitting(true)
    setErrorMsg("")

    let finalCustomerId = selectedPayment.customer_id

    if (!finalCustomerId) {
      if (!newCustomerId.trim()) {
        setErrorMsg("Please assign a Customer ID for this new customer.")
        setSubmitting(false)
        return
      }
      
      finalCustomerId = newCustomerId.trim()
      
      const { error: customerError } = await supabase
        .from("Customers")
        .insert([{
          customer_id: finalCustomerId,
          full_name: selectedPayment.customer_name,
          phone_number: selectedPayment.phone_number || null
        }])
        
      if (customerError) {
        setErrorMsg("Failed to create customer: " + customerError.message)
        setSubmitting(false)
        return
      }
    }

    const { error: paymentError } = await supabase
      .from("customer_payments")
      .update({
        status: "Posted",
        customer_id: finalCustomerId,
        posted_by: user.id,
        posted_at: new Date().toISOString()
      })
      .eq("payment_id", selectedPayment.payment_id)

    setSubmitting(false)
    if (paymentError) {
      setErrorMsg("Failed to post: " + paymentError.message)
      return
    }

    setShowPostModal(false)
    fetchPayments()
  }

  const filteredBrokers = brokersList.filter(b => b.broker_name.toLowerCase().includes(brokerSearch.toLowerCase()))

  const filteredPayments = payments.filter(p => {
    if (p.status !== filter) return false
    if (filterBank && !p.bank_name.toLowerCase().includes(filterBank.toLowerCase())) return false
    if (filterBroker && p.broker_id !== filterBroker) return false
    const payDate = p.payment_date.slice(0, 10)
    if (dateMode === "single") {
      if (filterDateFrom && payDate !== filterDateFrom) return false
    } else {
      if (filterDateFrom && payDate < filterDateFrom) return false
      if (filterDateTo && payDate > filterDateTo) return false
    }
    return true
  })

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: isMobile ? "16px" : "32px", fontFamily: "'Inter', sans-serif" }}>
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, color: "#0f172a", fontSize: isMobile ? fontSize["2xl"] : fontSize["3xl"], fontWeight: 700, letterSpacing: "-0.5px" }}>
            Customer Payments
          </h1>
          <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: fontSize.base }}>
            Review and post pending customer payments.
          </p>
        </div>

        {filteredPayments.length > 0 && (
          <div style={{ display: "flex", background: "white", border: "1px solid #e2e8f0", borderRadius: 8, padding: 4, gap: 0 }}>
            <button
              onClick={() => setViewMode("card")}
              style={{
                padding: "8px 12px",
                background: viewMode === "card" ? "#0070f3" : "transparent",
                color: viewMode === "card" ? "white" : "#64748b",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: fontSize.xs,
                fontWeight: 600,
                minWidth: 44,
                height: 40,
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z"/></svg>
            </button>
            <button
              onClick={() => setViewMode("table")}
              style={{
                padding: "8px 12px",
                background: viewMode === "table" ? "#0070f3" : "transparent",
                color: viewMode === "table" ? "white" : "#64748b",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: fontSize.xs,
                fontWeight: 600,
                minWidth: 44,
                height: 40,
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 4h18v2H3V4zm0 7h18v2H3v-2zm0 7h18v2H3v-2z"/></svg>
            </button>
          </div>
        )}
      </div>

      {/* Status Filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {(["Pending", "Posted"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "8px 14px",
              borderRadius: 20,
              fontSize: fontSize.sm,
              cursor: "pointer",
              border: `1.5px solid ${filter === f ? (f === "Pending" ? "#0070f3" : "#16a34a") : "#e2e8f0"}`,
              background: filter === f ? (f === "Pending" ? "#eff6ff" : "#f0fdf4") : "white",
              color: filter === f ? (f === "Pending" ? "#0070f3" : "#16a34a") : "#64748b",
              fontWeight: filter === f ? 600 : 500,
              transition: "all 0.2s"
            }}
            onMouseEnter={e => { if (filter !== f) { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1" } }}
            onMouseLeave={e => { if (filter !== f) { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#e2e8f0" } }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Secondary Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "white", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", flex: "1 1 180px" }}>
          <Icon icon="mdi:bank-outline" style={{ color: "#88", flexShrink: 0 }} />
          <input type="text" placeholder="Filter by bank…" value={filterBank} onChange={e => setFilterBank(e.target.value)} style={{ border: "none", outline: "none", fontSize: fontSize.sm, width: "100%", color: "#333", background: "transparent" }} />
          {filterBank && <button onClick={() => setFilterBank("")} style={{ border: "none", background: "none", cursor: "pointer", color: "#aaa", padding: 0, lineHeight: 1 }}>✕</button>}
        </div>

        <div style={{ position: "relative", flex: "1 1 200px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "white", border: `1px solid ${filterBroker ? "#0070f3" : "#e2e8f0"}`, borderRadius: 8, padding: "8px 12px" }}>
            <Icon icon="mdi:account-tie-outline" style={{ color: filterBroker ? "#0070f3" : "#888", flexShrink: 0 }} />
            <input type="text" placeholder="Search broker…" value={brokerSearch} onChange={e => { setBrokerSearch(e.target.value); setBrokerDropOpen(true) }} onFocus={() => setBrokerDropOpen(true)} onBlur={() => setTimeout(() => setBrokerDropOpen(false), 150)} style={{ border: "none", outline: "none", fontSize: fontSize.sm, width: "100%", color: "#333", background: "transparent" }} />
            {filterBroker && <button onClick={() => { setFilterBroker(""); setBrokerSearch("") }} style={{ border: "none", background: "none", cursor: "pointer", color: "#aaa", padding: 0, lineHeight: 1 }}>✕</button>}
          </div>
          {brokerDropOpen && (
            <ul style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "white", border: "1px solid #e2e8f0", borderRadius: 8, listStyle: "none", margin: 0, padding: 4, maxHeight: 200, overflowY: "auto", zIndex: 50, boxShadow: "0 4px 16px rgba(0,0,0,0.1)" }}>
              <li onMouseDown={() => { setFilterBroker(""); setBrokerSearch(""); setBrokerDropOpen(false) }} style={{ padding: "8px 12px", cursor: "pointer", fontSize: fontSize.sm, color: "#888", borderRadius: 6 }} onMouseEnter={e => (e.currentTarget.style.background = "#f5f5f5")} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                All brokers
              </li>
              {filteredBrokers.length === 0 ? (
                <li style={{ padding: "8px 12px", fontSize: fontSize.sm, color: "#bbb" }}>No brokers found</li>
              ) : filteredBrokers.map(b => (
                <li key={b.broker_id} onMouseDown={() => { setFilterBroker(b.broker_id); setBrokerSearch(b.broker_name); setBrokerDropOpen(false) }} style={{ padding: "8px 12px", cursor: "pointer", fontSize: fontSize.sm, color: "#333", borderRadius: 6, background: filterBroker === b.broker_id ? "#eff6ff" : "transparent", fontWeight: filterBroker === b.broker_id ? "bold" : "normal" }} onMouseEnter={e => { if (filterBroker !== b.broker_id) e.currentTarget.style.background = "#f5f5f5" }} onMouseLeave={e => { e.currentTarget.style.background = filterBroker === b.broker_id ? "#eff6ff" : "transparent" }}>
                  {b.broker_name}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={{ position: "relative", flex: "1 1 200px" }}>
          <div onClick={() => setDateDropOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: 8, background: "white", border: `1px solid ${filterDateFrom ? "#0070f3" : "#e2e8f0"}`, borderRadius: 8, padding: "8px 12px", cursor: "pointer", userSelect: "none" }}>
            <Icon icon="mdi:calendar-outline" style={{ color: filterDateFrom ? "#0070f3" : "#888", flexShrink: 0 }} />
            <span style={{ fontSize: fontSize.sm, color: filterDateFrom ? "#333" : "#aaa", flex: 1 }}>
              {filterDateFrom ? (dateMode === "range" && filterDateTo ? `${filterDateFrom} → ${filterDateTo}` : filterDateFrom) : "Filter by date…"}
            </span>
            {filterDateFrom ? (
              <button onClick={e => { e.stopPropagation(); setFilterDateFrom(""); setFilterDateTo(""); setDateDropOpen(false) }} style={{ border: "none", background: "none", cursor: "pointer", color: "#aaa", padding: 0, lineHeight: 1 }}>✕</button>
            ) : (
              <Icon icon="mdi:chevron-down" style={{ color: "#aaa", fontSize: 16, transition: "transform 0.15s", transform: dateDropOpen ? "rotate(180deg)" : "rotate(0deg)" }} />
            )}
          </div>

          {dateDropOpen && (
            <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, background: "white", border: "1px solid #e2e8f0", borderRadius: 10, padding: 16, zIndex: 50, boxShadow: "0 4px 20px rgba(0,0,0,0.12)", minWidth: 260 }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                {(["single", "range"] as const).map(m => (
                  <button key={m} onClick={() => { setDateMode(m); setFilterDateFrom(""); setFilterDateTo("") }} style={{ flex: 1, padding: "5px 0", border: "none", borderRadius: 6, cursor: "pointer", fontSize: fontSize.xs, fontWeight: "bold", background: dateMode === m ? "#0070f3" : "#f0f0f0", color: dateMode === m ? "white" : "#666", transition: "all 0.15s" }}>
                    {m === "single" ? "Single day" : "Date range"}
                  </button>
                ))}
              </div>

              {dateMode === "single" ? (
                <div>
                  <label style={{ display: "block", fontSize: fontSize.xs, color: "#888", marginBottom: 4 }}>Select date</label>
                  <input type="date" value={filterDateFrom} onChange={e => { setFilterDateFrom(e.target.value); setDateDropOpen(false) }} style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: fontSize.sm, color: "#333", boxSizing: "border-box" }} autoFocus />
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div>
                    <label style={{ display: "block", fontSize: fontSize.xs, color: "#888", marginBottom: 4 }}>From</label>
                    <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: fontSize.sm, color: "#333", boxSizing: "border-box" }} autoFocus />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: fontSize.xs, color: "#888", marginBottom: 4 }}>To</label>
                    <input type="date" value={filterDateTo} min={filterDateFrom || undefined} onChange={e => setFilterDateTo(e.target.value)} style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: fontSize.sm, color: "#333", boxSizing: "border-box" }} />
                  </div>
                  {filterDateFrom && filterDateTo && (
                    <button onClick={() => setDateDropOpen(false)} style={{ padding: "8px 0", background: "#0070f3", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontSize: fontSize.sm, fontWeight: "bold" }}>
                      Apply Range
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "64px 0" }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid #e2e8f0", borderTopColor: "#0070f3", animation: "spin 1s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : filteredPayments.length === 0 ? (
        <div style={{ textAlign: "center", padding: "64px 24px", background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)" }}>
          <h3 style={{ margin: "0 0 8px", color: "#0f172a", fontSize: fontSize.xl, fontWeight: 600 }}>No payments found</h3>
          <p style={{ color: "#64748b", fontSize: fontSize.base, margin: 0 }}>No {filter.toLowerCase()} payments match your filters.</p>
        </div>
      ) : viewMode === "card" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filteredPayments.map((p) => (
            <div key={p.payment_id} style={{ background: "white", borderRadius: 12, padding: 16, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)", transition: "all 0.2s ease" }} onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.08)"; e.currentTarget.style.borderColor = "#cbd5e1" }} onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.05)"; e.currentTarget.style.borderColor = "#e2e8f0" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: "0 0 4px 0", color: "#0f172a", fontSize: fontSize.lg, fontWeight: 600 }}>₦{p.amount.toLocaleString()}</p>
                  <p style={{ margin: 0, color: "#64748b", fontSize: fontSize.sm }}>{p.bank_name}</p>
                </div>
                <span style={{ padding: "6px 12px", borderRadius: 16, fontSize: fontSize.xs, fontWeight: 600, background: p.status === "Pending" ? "#eff6ff" : "#f0fdf4", color: p.status === "Pending" ? "#0070f3" : "#16a34a", border: `1.5px solid ${p.status === "Pending" ? "#0070f3" : "#16a34a"}`, whiteSpace: "nowrap" }}>
                  {p.status}
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "12px 0", borderTop: "1px solid #f1f5f9", borderBottom: "1px solid #f1f5f9" }}>
                <div>
                  <p style={{ margin: "0 0 4px 0", color: "#94a3b8", fontSize: fontSize.xs }}>Customer</p>
                  <p style={{ margin: 0, color: "#0f172a", fontSize: fontSize.base, fontWeight: 500 }}>{p.customer_name}</p>
                  {!p.customer_id && <span style={{ fontSize: fontSize.xs, padding: "2px 6px", background: "#fef3c7", color: "#92400e", borderRadius: 4, fontWeight: "bold", marginTop: 4, display: "inline-block" }}>NEW</span>}
                </div>
                <div>
                  <p style={{ margin: "0 0 4px 0", color: "#94a3b8", fontSize: fontSize.xs }}>Broker</p>
                  <p style={{ margin: 0, color: "#0f172a", fontSize: fontSize.base, fontWeight: 500 }}>{profilesMap[p.broker_id] || "Unknown"}</p>
                </div>
              </div>

              <p style={{ margin: "12px 0 0 0", color: "#94a3b8", fontSize: fontSize.xs }}>{new Date(p.payment_date).toLocaleDateString()}</p>

              {p.status === "Pending" && (
                <button onClick={() => openPostModal(p)} style={{ width: "100%", marginTop: 12, padding: "10px 14px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: fontSize.md, minHeight: 40 }}>
                  Review & Post
                </button>
              )}
              {p.status === "Posted" && (
                <div style={{ marginTop: 12, padding: "10px 12px", background: "#f0fdf4", borderRadius: 8, fontSize: fontSize.sm, color: "#166534" }}>
                  <p style={{ margin: 0, fontWeight: 600 }}>Posted by {profilesMap[p.posted_by || ""] || "Admin"}</p>
                  <p style={{ margin: "4px 0 0 0", color: "#16a34a", fontSize: fontSize.xs }}>{p.posted_at ? new Date(p.posted_at).toLocaleString() : ""}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: fontSize.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Date</th>
                <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: fontSize.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Broker</th>
                <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: fontSize.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Customer</th>
                <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: fontSize.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Bank</th>
                <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: fontSize.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Amount</th>
                <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: fontSize.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Status</th>
                <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: fontSize.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayments.map((p, idx) => (
                <tr key={p.payment_id} style={{ borderBottom: idx === filteredPayments.length - 1 ? "none" : "1px solid #e2e8f0", transition: "background 0.2s ease" }} onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: fontSize.sm }}>{new Date(p.payment_date).toLocaleDateString()}</td>
                  <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: fontSize.base, fontWeight: 500 }}>{profilesMap[p.broker_id] || "Unknown"}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ color: "#0f172a", fontSize: fontSize.base, fontWeight: 500 }}>{p.customer_name}</div>
                    {!p.customer_id && <span style={{ fontSize: fontSize.xs, padding: "2px 6px", background: "#fef3c7", color: "#92400e", borderRadius: 4, fontWeight: "bold", marginTop: 2, display: "inline-block" }}>NEW</span>}
                  </td>
                  <td style={{ padding: "12px 16px", color: "#64748b", fontSize: fontSize.sm }}>{p.bank_name}</td>
                  <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: fontSize.base, fontWeight: 600 }}>₦{p.amount.toLocaleString()}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ padding: "6px 10px", borderRadius: 14, fontSize: fontSize.xs, fontWeight: 600, background: p.status === "Pending" ? "#eff6ff" : "#f0fdf4", color: p.status === "Pending" ? "#0070f3" : "#16a34a", border: `1.5px solid ${p.status === "Pending" ? "#0070f3" : "#16a34a"}` }}>
                      {p.status}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }}>
                    {p.status === "Pending" ? (
                      <button onClick={() => openPostModal(p)} style={{ padding: "6px 10px", background: "#0070f3", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontSize: fontSize.sm, fontWeight: 600, minHeight: 32 }}>
                        Post
                      </button>
                    ) : (
                      <div style={{ fontSize: fontSize.xs, color: "#666", textAlign: "right" }}>
                        <div>Posted</div>
                        <div style={{ color: "#94a3b8" }}>{p.posted_at ? new Date(p.posted_at).toLocaleDateString() : ""}</div>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showPostModal && selectedPayment && (
        <div onClick={() => setShowPostModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 100, padding: isMobile ? 0 : 24, animation: "fadeIn 0.2s ease-out" }}>
          <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: isMobile ? "20px 20px 0 0" : 12, padding: isMobile ? "28px 20px" : 32, width: "100%", maxWidth: 420, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)", animation: "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, color: "#0f172a", fontSize: fontSize.xl, fontWeight: 700 }}>Post Payment</h3>
              <button onClick={() => setShowPostModal(false)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 0, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", transition: "color 0.2s" }} onMouseEnter={e => e.currentTarget.style.color = "#64748b"} onMouseLeave={e => e.currentTarget.style.color = "#94a3b8"}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>

            <div style={{ background: "#f8fafc", padding: 14, borderRadius: 8, marginBottom: 18 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <p style={{ margin: "0 0 4px 0", color: "#94a3b8", fontSize: fontSize.xs }}>Amount</p>
                  <p style={{ margin: 0, fontSize: fontSize.lg, fontWeight: 700, color: "#0f172a" }}>₦{selectedPayment.amount.toLocaleString()}</p>
                </div>
                <div>
                  <p style={{ margin: "0 0 4px 0", color: "#94a3b8", fontSize: fontSize.xs }}>Bank</p>
                  <p style={{ margin: 0, fontSize: fontSize.base, fontWeight: 600, color: "#0f172a" }}>{selectedPayment.bank_name}</p>
                </div>
                <div>
                  <p style={{ margin: "0 0 4px 0", color: "#94a3b8", fontSize: fontSize.xs }}>Customer</p>
                  <p style={{ margin: 0, fontSize: fontSize.base, fontWeight: 600, color: "#0f172a" }}>{selectedPayment.customer_name}</p>
                </div>
                <div>
                  <p style={{ margin: "0 0 4px 0", color: "#94a3b8", fontSize: fontSize.xs }}>Broker</p>
                  <p style={{ margin: 0, fontSize: fontSize.base, fontWeight: 600, color: "#0f172a" }}>{profilesMap[selectedPayment.broker_id] || "Unknown"}</p>
                </div>
              </div>
            </div>

            {!selectedPayment.customer_id && (
              <div style={{ background: "#eff6ff", border: "1.5px solid #bfdbfe", padding: 14, borderRadius: 8, marginBottom: 18 }}>
                <p style={{ fontWeight: 600, color: "#1e40af", margin: "0 0 10px 0", fontSize: fontSize.sm, display: "flex", alignItems: "center", gap: 6 }}>
                  <Icon icon="mdi:information" width="16" height="16" /> New Customer
                </p>
                <p style={{ fontSize: fontSize.sm, color: "#1e3a8a", margin: "0 0 12px 0", lineHeight: 1.4 }}>
                  Assign an alphanumeric Customer ID to create their profile.
                </p>
                <label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: fontSize.sm, color: "#1e40af" }}>Customer ID *</label>
                <input type="text" placeholder="e.g. CUST-1049" value={newCustomerId} onChange={e => { setNewCustomerId(e.target.value); setErrorMsg("") }} style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid #bfdbfe", boxSizing: "border-box", fontSize: fontSize.base }} autoFocus />
              </div>
            )}

            {errorMsg && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 18, color: "#b91c1c", fontSize: fontSize.sm }}>{errorMsg}</div>}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 10 }}>
              <button onClick={() => setShowPostModal(false)} style={{ padding: "12px 16px", background: "white", color: "#475569", border: "1px solid #cbd5e1", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: fontSize.md, minHeight: 44 }}>
                Cancel
              </button>
              <button onClick={handlePost} disabled={submitting} style={{ padding: "12px 16px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: submitting ? "not-allowed" : "pointer", fontWeight: 600, fontSize: fontSize.md, opacity: submitting ? 0.7 : 1, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {submitting ? <Icon icon="mdi:loading" width="16" height="16" style={{ animation: "spin 1s linear infinite" }} /> : <Icon icon="mdi:check-circle" width="16" height="16" />}
                {submitting ? "Processing..." : "Confirm & Post"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}