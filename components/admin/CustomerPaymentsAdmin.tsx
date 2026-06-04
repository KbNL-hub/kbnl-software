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

export default function CustomerPaymentsAdmin() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [profilesMap, setProfilesMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<"Pending" | "Posted">("Pending")
  const [filterBank, setFilterBank] = useState("")
  // Broker filter – full list from DB
  const [brokersList, setBrokersList] = useState<{ broker_id: string; broker_name: string }[]>([])
  const [filterBroker, setFilterBroker] = useState("")          // selected broker_id
  const [brokerSearch, setBrokerSearch] = useState("")          // search text
  const [brokerDropOpen, setBrokerDropOpen] = useState(false)   // dropdown visibility
  const [dateDropOpen, setDateDropOpen] = useState(false)       // date dropdown visibility
  // Date filter
  const [dateMode, setDateMode] = useState<"single" | "range">("single")
  const [filterDateFrom, setFilterDateFrom] = useState("")
  const [filterDateTo, setFilterDateTo] = useState("")
  
  // Modal State
  const [showPostModal, setShowPostModal] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [newCustomerId, setNewCustomerId] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")

  useEffect(() => {
    initData()
  }, [])

  async function initData() {
    setLoading(true)
    // Fetch profiles mapping
    const { data: profiles } = await supabase.from("Profiles").select("user_id, full_name")
    const { data: brokers } = await supabase
      .from("Brokers")
      .select("broker_id, broker_name")
      .order("broker_name", { ascending: true })
    const pMap: Record<string, string> = {}
    profiles?.forEach(p => { pMap[p.user_id] = p.full_name })
    brokers?.forEach(b => {
      if (!pMap[b.broker_id]) pMap[b.broker_id] = b.broker_name
    })
    setProfilesMap(pMap)
    setBrokersList(brokers || [])

    await fetchPayments()
  }

  async function fetchPayments() {
    const { data } = await supabase
      .from("customer_payments")
      .select("*")
      .order("created_at", { ascending: false })
      
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

    // If it's a new customer (broker left customer_id null)
    if (!finalCustomerId) {
      if (!newCustomerId.trim()) {
        setErrorMsg("Please assign a Customer ID for this new customer.")
        setSubmitting(false)
        return
      }
      
      finalCustomerId = newCustomerId.trim()
      
      // Insert into Customers table
      const { error: customerError } = await supabase
        .from("Customers")
        .insert([{
          customer_id: finalCustomerId,
          full_name: selectedPayment.customer_name,
          phone_number: selectedPayment.phone_number || null
        }])
        
      if (customerError) {
        setErrorMsg("Failed to create new customer: " + customerError.message)
        setSubmitting(false)
        return
      }
    }

    // Update the payment record to Posted
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
      setErrorMsg("Failed to post payment: " + paymentError.message)
      return
    }

    setShowPostModal(false)
    fetchPayments()
  }

  // Filtered brokers for the searchable dropdown
  const filteredBrokers = brokersList.filter(b =>
    b.broker_name.toLowerCase().includes(brokerSearch.toLowerCase())
  )

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
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
        <h2 style={{ margin: 0, fontSize: 24, color: "#111" }}>Customer Payments Review</h2>
        
        {/* Status Filters */}
        <div style={{ display: "flex", gap: 8, background: "#eee", padding: 4, borderRadius: 8 }}>
          {(["Pending", "Posted"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: "8px 16px", border: "none", borderRadius: 6, cursor: "pointer",
                fontWeight: "bold", fontSize: 13,
                background: filter === f ? "#fff" : "transparent",
                color: filter === f ? "#111" : "#666",
                boxShadow: filter === f ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                transition: "all 0.2s"
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Secondary Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        {/* Bank filter */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "white", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", flex: "1 1 180px" }}>
          <Icon icon="mdi:bank-outline" style={{ color: "#888", flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Filter by bank…"
            value={filterBank}
            onChange={e => setFilterBank(e.target.value)}
            style={{ border: "none", outline: "none", fontSize: 13, width: "100%", color: "#333", background: "transparent" }}
          />
          {filterBank && (
            <button onClick={() => setFilterBank("")} style={{ border: "none", background: "none", cursor: "pointer", color: "#aaa", padding: 0, lineHeight: 1 }}>✕</button>
          )}
        </div>

        {/* Broker filter – searchable dropdown */}
        <div style={{ position: "relative", flex: "1 1 200px" }}>
          <div
            style={{ display: "flex", alignItems: "center", gap: 8, background: "white", border: `1px solid ${filterBroker ? "#0070f3" : "#e2e8f0"}`, borderRadius: 8, padding: "8px 12px" }}
          >
            <Icon icon="mdi:account-tie-outline" style={{ color: filterBroker ? "#0070f3" : "#888", flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Search broker…"
              value={brokerSearch}
              onChange={e => { setBrokerSearch(e.target.value); setBrokerDropOpen(true) }}
              onFocus={() => setBrokerDropOpen(true)}
              onBlur={() => setTimeout(() => setBrokerDropOpen(false), 150)}
              style={{ border: "none", outline: "none", fontSize: 13, width: "100%", color: "#333", background: "transparent" }}
            />
            {filterBroker && (
              <button
                onClick={() => { setFilterBroker(""); setBrokerSearch("") }}
                style={{ border: "none", background: "none", cursor: "pointer", color: "#aaa", padding: 0, lineHeight: 1 }}
              >✕</button>
            )}
          </div>
          {brokerDropOpen && (
            <ul style={{
              position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
              background: "white", border: "1px solid #e2e8f0", borderRadius: 8,
              listStyle: "none", margin: 0, padding: 4,
              maxHeight: 200, overflowY: "auto", zIndex: 50,
              boxShadow: "0 4px 16px rgba(0,0,0,0.1)"
            }}>
              <li
                onMouseDown={() => { setFilterBroker(""); setBrokerSearch(""); setBrokerDropOpen(false) }}
                style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13, color: "#888", borderRadius: 6 }}
                onMouseEnter={e => (e.currentTarget.style.background = "#f5f5f5")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                All brokers
              </li>
              {filteredBrokers.length === 0 ? (
                <li style={{ padding: "8px 12px", fontSize: 13, color: "#bbb" }}>No brokers found</li>
              ) : filteredBrokers.map(b => (
                <li
                  key={b.broker_id}
                  onMouseDown={() => { setFilterBroker(b.broker_id); setBrokerSearch(b.broker_name); setBrokerDropOpen(false) }}
                  style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13, color: "#333", borderRadius: 6,
                    background: filterBroker === b.broker_id ? "#eff6ff" : "transparent",
                    fontWeight: filterBroker === b.broker_id ? "bold" : "normal" }}
                  onMouseEnter={e => { if (filterBroker !== b.broker_id) e.currentTarget.style.background = "#f5f5f5" }}
                  onMouseLeave={e => { e.currentTarget.style.background = filterBroker === b.broker_id ? "#eff6ff" : "transparent" }}
                >
                  {b.broker_name}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Date filter – dropdown popover */}
        <div style={{ position: "relative", flex: "1 1 200px" }}>
          {/* Pill trigger */}
          <div
            onClick={() => setDateDropOpen(o => !o)}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "white",
              border: `1px solid ${filterDateFrom ? "#0070f3" : "#e2e8f0"}`,
              borderRadius: 8, padding: "8px 12px", cursor: "pointer", userSelect: "none"
            }}
          >
            <Icon icon="mdi:calendar-outline" style={{ color: filterDateFrom ? "#0070f3" : "#888", flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: filterDateFrom ? "#333" : "#aaa", flex: 1 }}>
              {filterDateFrom
                ? dateMode === "range" && filterDateTo
                  ? `${filterDateFrom} → ${filterDateTo}`
                  : filterDateFrom
                : "Filter by date…"}
            </span>
            {filterDateFrom ? (
              <button
                onClick={e => { e.stopPropagation(); setFilterDateFrom(""); setFilterDateTo(""); setDateDropOpen(false) }}
                style={{ border: "none", background: "none", cursor: "pointer", color: "#aaa", padding: 0, lineHeight: 1 }}
              >✕</button>
            ) : (
              <Icon icon="mdi:chevron-down" style={{ color: "#aaa", fontSize: 16, transition: "transform 0.15s", transform: dateDropOpen ? "rotate(180deg)" : "rotate(0deg)" }} />
            )}
          </div>

          {/* Popover */}
          {dateDropOpen && (
            <div style={{
              position: "absolute", top: "calc(100% + 4px)", left: 0,
              background: "white", border: "1px solid #e2e8f0", borderRadius: 10,
              padding: 16, zIndex: 50, boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
              minWidth: 260
            }}>
              {/* Mode toggle */}
              <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                {(["single", "range"] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => { setDateMode(m); setFilterDateFrom(""); setFilterDateTo("") }}
                    style={{
                      flex: 1, padding: "5px 0", border: "none", borderRadius: 6, cursor: "pointer",
                      fontSize: 12, fontWeight: "bold",
                      background: dateMode === m ? "#0070f3" : "#f0f0f0",
                      color: dateMode === m ? "white" : "#666",
                      transition: "all 0.15s"
                    }}
                  >
                    {m === "single" ? "Single day" : "Date range"}
                  </button>
                ))}
              </div>

              {/* Date inputs */}
              {dateMode === "single" ? (
                <div>
                  <label style={{ display: "block", fontSize: 11, color: "#888", marginBottom: 4 }}>Select date</label>
                  <input
                    type="date"
                    value={filterDateFrom}
                    onChange={e => { setFilterDateFrom(e.target.value); setDateDropOpen(false) }}
                    style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13, color: "#333", boxSizing: "border-box" }}
                    autoFocus
                  />
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 11, color: "#888", marginBottom: 4 }}>From</label>
                    <input
                      type="date"
                      value={filterDateFrom}
                      onChange={e => setFilterDateFrom(e.target.value)}
                      style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13, color: "#333", boxSizing: "border-box" }}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 11, color: "#888", marginBottom: 4 }}>To</label>
                    <input
                      type="date"
                      value={filterDateTo}
                      min={filterDateFrom || undefined}
                      onChange={e => setFilterDateTo(e.target.value)}
                      style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13, color: "#333", boxSizing: "border-box" }}
                    />
                  </div>
                  {filterDateFrom && filterDateTo && (
                    <button
                      onClick={() => setDateDropOpen(false)}
                      style={{ padding: "8px 0", background: "#0070f3", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: "bold" }}
                    >
                      Apply Range
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={{ background: "white", borderRadius: 12, border: "1px solid #eee", padding: 24 }}>
        {loading ? (
          <p style={{ color: "#888", textAlign: "center", padding: "40px 0" }}>Loading payments...</p>
        ) : filteredPayments.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#bbb" }}>
            <Icon icon="mdi:file-document-outline" width={48} style={{ marginBottom: 12 }} />
            <p style={{ margin: 0, fontSize: 15 }}>No {filter.toLowerCase()} payments found.</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "#f9f9f9", textAlign: "left", color: "#555" }}>
                  <th style={{ padding: "12px 16px", fontWeight: "bold" }}>Date</th>
                  <th style={{ padding: "12px 16px", fontWeight: "bold" }}>Broker</th>
                  <th style={{ padding: "12px 16px", fontWeight: "bold" }}>Customer</th>
                  <th style={{ padding: "12px 16px", fontWeight: "bold" }}>Bank / Depositor</th>
                  <th style={{ padding: "12px 16px", fontWeight: "bold" }}>Amount</th>
                  <th style={{ padding: "12px 16px", fontWeight: "bold" }}>Status</th>
                  <th style={{ padding: "12px 16px", fontWeight: "bold" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayments.map(p => (
                  <tr key={p.payment_id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: "16px" }}>
                      {new Date(p.payment_date).toLocaleDateString()}
                    </td>
                    <td style={{ padding: "16px" }}>
                      <span style={{ fontWeight: "bold", color: "#333" }}>{profilesMap[p.broker_id] || "Unknown"}</span>
                    </td>
                    <td style={{ padding: "16px" }}>
                      <span style={{ fontWeight: "bold", color: "#111" }}>{p.customer_name}</span>
                      {!p.customer_id && (
                        <div style={{ display: "inline-block", marginLeft: 8, padding: "2px 6px", background: "#fef3c7", color: "#92400e", fontSize: 11, borderRadius: 4, fontWeight: "bold" }}>
                          NEW
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "16px" }}>
                      <div style={{ fontWeight: "bold", color: "#444" }}>{p.bank_name}</div>
                      {p.depositor_name && <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Dep: {p.depositor_name}</div>}
                    </td>
                    <td style={{ padding: "16px", fontWeight: "bold", color: "#111" }}>
                      ₦{p.amount.toLocaleString()}
                    </td>
                    <td style={{ padding: "16px" }}>
                      {p.status === "Pending" ? (
                        <span style={{ padding: "4px 8px", background: "#ebf8ff", color: "#2b6cb0", borderRadius: 12, fontSize: 11, fontWeight: "bold" }}>Pending</span>
                      ) : (
                        <span style={{ padding: "4px 8px", background: "#f0fff4", color: "#2f855a", borderRadius: 12, fontSize: 11, fontWeight: "bold" }}>Posted</span>
                      )}
                    </td>
                    <td style={{ padding: "16px" }}>
                      {p.status === "Pending" ? (
                        <button
                          onClick={() => openPostModal(p)}
                          style={{
                            padding: "8px 16px", background: "#0070f3", color: "white",
                            border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold", fontSize: 13
                          }}
                        >
                          Review & Post
                        </button>
                      ) : (
                        <div style={{ fontSize: 12, color: "#666" }}>
                          Posted by:<br/>
                          <strong>{profilesMap[p.posted_by || ""] || "Admin"}</strong><br/>
                          <span style={{ color: "#aaa" }}>{p.posted_at ? new Date(p.posted_at).toLocaleString() : ""}</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Post Modal */}
      {showPostModal && selectedPayment && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div style={{ background: "white", borderRadius: 12, padding: 32, width: 440, maxWidth: "90vw", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: 20 }}>Post Customer Payment</h3>
            
            <div style={{ background: "#f9f9f9", padding: 16, borderRadius: 8, marginBottom: 20 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <p style={{ margin: 0, fontSize: 12, color: "#888" }}>Amount</p>
                  <p style={{ margin: "2px 0 0", fontWeight: "bold", fontSize: 18, color: "#111" }}>₦{selectedPayment.amount.toLocaleString()}</p>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 12, color: "#888" }}>Bank</p>
                  <p style={{ margin: "2px 0 0", fontWeight: "bold", fontSize: 14, color: "#111" }}>{selectedPayment.bank_name}</p>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 12, color: "#888" }}>Customer</p>
                  <p style={{ margin: "2px 0 0", fontWeight: "bold", fontSize: 14, color: "#111" }}>{selectedPayment.customer_name}</p>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 12, color: "#888" }}>Broker</p>
                  <p style={{ margin: "2px 0 0", fontWeight: "bold", fontSize: 14, color: "#111" }}>{profilesMap[selectedPayment.broker_id] || "Unknown"}</p>
                </div>
              </div>
            </div>

            {!selectedPayment.customer_id && (
              <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", padding: 16, borderRadius: 8, marginBottom: 24 }}>
                <p style={{ fontWeight: "bold", color: "#1e40af", margin: "0 0 6px 0", display: "flex", alignItems: "center", gap: 6 }}>
                  <Icon icon="mdi:information" /> New Customer Alert
                </p>
                <p style={{ fontSize: 13, color: "#1e3a8a", margin: "0 0 16px 0", lineHeight: 1.4 }}>
                  This payment was logged for a new customer. You must assign an alphanumeric Customer ID to create their profile before posting.
                </p>
                <label style={{ display: "block", fontWeight: "bold", marginBottom: 6, fontSize: 13, color: "#1e40af" }}>Assign Customer ID *</label>
                <input
                  type="text"
                  placeholder="e.g. CUST-1049"
                  value={newCustomerId}
                  onChange={e => { setNewCustomerId(e.target.value); setErrorMsg("") }}
                  style={{ width: "100%", padding: 10, borderRadius: 6, border: "1px solid #93c5fd", boxSizing: "border-box", fontSize: 14 }}
                  autoFocus
                />
              </div>
            )}

            {errorMsg && <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 16, display: "flex", alignItems: "center", gap: 4 }}><Icon icon="mdi:alert-circle" /> {errorMsg}</p>}

            <div style={{ display: "flex", gap: 10 }}>
              <button 
                onClick={() => setShowPostModal(false)}
                style={{ flex: 1, padding: "12px 0", background: "white", border: "1px solid #ddd", borderRadius: 8, cursor: "pointer", fontWeight: "bold", color: "#555" }}
              >
                Cancel
              </button>
              <button 
                onClick={handlePost}
                disabled={submitting}
                style={{ flex: 1, padding: "12px 0", background: "#0070f3", border: "none", color: "white", borderRadius: 8, cursor: "pointer", fontWeight: "bold", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
              >
                {submitting ? <Icon icon="mdi:loading" className="spin" /> : <Icon icon="mdi:check-circle" />}
                {submitting ? "Processing..." : "Confirm & Post"}
              </button>
            </div>
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
