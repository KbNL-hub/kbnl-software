"use client"

import { useState, useEffect } from "react"
import { Icon } from "@iconify/react"
import { supabase } from "@/lib/supabase"
import { formatAmount, parseAmount } from "@/lib/formatAmount"
import ModernInput from "@/components/ModernInput"
import CustomerSelector from "@/components/CustomerSelector"
import { useBreakpoint } from "@/app/hooks/useBreakpoint"

type Customer = {
  customer_id: string
  full_name: string
  phone_number: string
}

type Stop = {
  stop_id: string
  trip_id: string
  customer_id: string | null
  customer_name: string
  quantity_offloaded: number
  stop_location: string
  stop_time: string
  plate_number: string
  material_centre: string
  atc: string | null
  confirmed: boolean
  disputed: boolean
}

export default function MyStops() {
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"

  const [brokerId, setBrokerId] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<"pending" | "confirmed" | "disputed">("pending")
  const [allStops, setAllStops] = useState<Stop[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<"card" | "table">("card")

  const [selectedStop, setSelectedStop] = useState<Stop | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [pricePerBag, setPricePerBag] = useState("")
  const [disputingStop, setDisputingStop] = useState<Stop | null>(null)
  const [disputeReason, setDisputeReason] = useState("")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { initBroker() }, [])

  async function initBroker() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.href = "/login"; return }
    setBrokerId(session.user.id)
    await fetchStops(session.user.id)
    setLoading(false)
  }

  async function fetchStops(bId: string) {
    const { data: stops, error } = await supabase
      .from("Stops")
      .select(`
        stop_id, trip_id, customer_id, quantity_offloaded, stop_location, stop_time, confirmed, disputed,
        Trips!inner(plate_number, material_centre, ATC),
        Customers(full_name)
      `)
      .eq("broker_id", bId)
      .order("stop_time", { ascending: false })

    if (error) { console.error("Failed to fetch stops:", error); return }

    const enriched = (stops || []).map((stop: any) => ({
      stop_id: stop.stop_id,
      trip_id: stop.trip_id,
      customer_id: stop.customer_id,
      quantity_offloaded: stop.quantity_offloaded,
      stop_location: stop.stop_location,
      stop_time: stop.stop_time,
      confirmed: stop.confirmed,
      disputed: stop.disputed,
      plate_number: stop.Trips?.plate_number ?? "Unknown",
      material_centre: stop.Trips?.material_centre ?? "",
      atc: stop.Trips?.ATC ?? null,
      customer_name: stop.Customers?.full_name ?? "Not provided",
    }))

    setAllStops(enriched)
  }

  function openConfirmModal(stop: Stop) {
    setSelectedStop(stop); setSelectedCustomer(null); setPricePerBag(""); setMessage("")
  }

  function closeModal() {
    setSelectedStop(null); setSelectedCustomer(null); setPricePerBag(""); setMessage("")
  }

  async function handleDispute() {
    if (!disputingStop || !disputeReason.trim()) { setMessage("Please provide a reason"); return }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setSubmitting(true)
    const { error } = await supabase.from("Stops").update({
      disputed: true, dispute_reason: disputeReason, disputed_by: user.id,
    }).eq("stop_id", disputingStop.stop_id)
    setSubmitting(false)

    if (error) { setMessage("Failed to dispute stop"); return }
    setDisputingStop(null); setDisputeReason(""); if (brokerId) fetchStops(brokerId)
  }

  async function handleConfirm() {
    if (!selectedStop || !pricePerBag) { setMessage("Price per bag required"); return }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setSubmitting(true)
    const customerIdToSave = selectedCustomer?.customer_id ?? selectedStop.customer_id

    const { error: stopError } = await supabase.from("Stops").update({
      confirmed: true, customer_id: customerIdToSave, updated_by: user.id,
    }).eq("stop_id", selectedStop.stop_id)

    if (stopError) { setMessage("Failed to confirm"); setSubmitting(false); return }

    const { error: confirmError } = await supabase.from("Stop_Confirmations").insert([{
      stop_id: selectedStop.stop_id, broker_id: brokerId,
      customer_id: customerIdToSave, price_per_bag: parseAmount(pricePerBag),
    }])

    setSubmitting(false)
    if (confirmError) {
      await supabase.from("Stops").update({ confirmed: false, customer_id: selectedStop.customer_id }).eq("stop_id", selectedStop.stop_id)
      setMessage("Failed to save confirmation record. Please try again.")
      return
    }
    closeModal()
    if (brokerId) fetchStops(brokerId)
  }

  if (loading) return <p style={{ color: "#888" }}>Loading…</p>

  const pendingStops = allStops.filter(s => !s.confirmed && !s.disputed)
  const confirmedStops = allStops.filter(s => s.confirmed)
  const disputedStops = allStops.filter(s => s.disputed)

  const visibleStops = activeFilter === "pending" ? pendingStops : activeFilter === "confirmed" ? confirmedStops : disputedStops

  const filterOptions = [
    { key: "pending" as const, label: "Pending", count: pendingStops.length, color: "#0070f3" },
    { key: "confirmed" as const, label: "Confirmed", count: confirmedStops.length, color: "#00aa00" },
    { key: "disputed" as const, label: "Disputed", count: disputedStops.length, color: "#ff4444" },
  ]

  const inputStyle: React.CSSProperties = { width: "100%", padding: isMobile ? "14px 12px" : "11px 12px", boxSizing: "border-box", borderRadius: 8, border: "1.5px solid #e5e5e5", fontSize: isMobile ? 16 : 14, background: "white", color: "#171717", minHeight: isMobile ? 48 : 42 }
  const labelStyle: React.CSSProperties = { fontWeight: "600", display: "block", marginBottom: 6, fontSize: isMobile ? 14 : 13, color: "#444" }
  const modalOverlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 100 }
  const modalBox: React.CSSProperties = { background: "white", borderRadius: isMobile ? "20px 20px 0 0" : 14, padding: isMobile ? "24px 20px 40px" : 32, width: isMobile ? "100%" : 420, maxHeight: isMobile ? "92vh" : "88vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: isMobile ? 22 : 20, color: "#171717" }}>My Stops</h2>
        {allStops.length > 0 && (
          <div style={{ display: "flex", background: "white", border: "1px solid #e2e8f0", borderRadius: 8, padding: 4, gap: 0 }}>
            <button onClick={() => setViewMode("card")} style={{
              padding: "8px 12px", background: viewMode === "card" ? "#0070f3" : "transparent",
              color: viewMode === "card" ? "white" : "#64748b", border: "none", borderRadius: 6,
              cursor: "pointer", fontSize: 12, fontWeight: 600, transition: "all 0.2s ease",
              minWidth: 44, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
            }} title="Card view">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z"/></svg>
            </button>
            <button onClick={() => setViewMode("table")} style={{
              padding: "8px 12px", background: viewMode === "table" ? "#0070f3" : "transparent",
              color: viewMode === "table" ? "white" : "#64748b", border: "none", borderRadius: 6,
              cursor: "pointer", fontSize: 12, fontWeight: 600, transition: "all 0.2s ease",
              minWidth: 44, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
            }} title="Table view">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 4h18v2H3V4zm0 7h18v2H3v-2zm0 7h18v2H3v-2z"/></svg>
            </button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 8 }}>
        {filterOptions.map(({ key, label, count }) => {
          const isActive = activeFilter === key
          const activeBg = key === "pending" ? "rgba(0,112,243,0.1)" : key === "confirmed" ? "rgba(22,163,74,0.1)" : "rgba(239,68,68,0.1)"
          const activeColor = key === "pending" ? "#0070f3" : key === "confirmed" ? "#16a34a" : "#ef4444"
          const activeBorder = key === "pending" ? "#0070f3" : key === "confirmed" ? "#16a34a" : "#ef4444"
          return (
            <button key={key} onClick={() => setActiveFilter(key)} style={{
              padding: isMobile ? "9px 16px" : "7px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer",
              border: `1.5px solid ${isActive ? activeBorder : "#e2e8f0"}`,
              background: isActive ? activeBg : "white",
              color: isActive ? activeColor : "#64748b",
              fontWeight: isActive ? 600 : 500,
              minHeight: 38, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
              transition: "all 0.2s ease",
            }}>
              {label}
              {count > 0 && (
                <span style={{
                  background: isActive ? "rgba(255,255,255,0.5)" : "#f1f5f9",
                  color: isActive ? activeColor : "#64748b",
                  borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 600,
                }}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {visibleStops.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#bbb" }}>
          <Icon icon="mdi:map-marker-off" width={40} style={{ marginBottom: 10, display: "block", margin: "0 auto 10px" }} />
          <p style={{ margin: 0, fontSize: 14 }}>No {activeFilter} stops</p>
        </div>
      ) : viewMode === "card" ? (
        visibleStops.map((stop) => (
          <div key={stop.stop_id} style={{ background: "white", border: "1px solid #eee", borderRadius: 12, padding: isMobile ? "14px 16px" : "16px 20px", marginBottom: 10, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: "#f0f7ff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon icon="mdi:truck" width={18} color="#0070f3" />
                </div>
                <div>
                  <p style={{ margin: 0, fontWeight: "bold", fontSize: isMobile ? 15 : 14, color: "#171717" }}>{stop.plate_number}</p>
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: "#888" }}>{stop.stop_location}</p>
                </div>
              </div>
              <p style={{ margin: 0, fontSize: 11, color: "#aaa", flexShrink: 0, paddingLeft: 8 }}>
                {new Date(stop.stop_time).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "10px 12px", background: "#f9f9f9", borderRadius: 8, marginBottom: 12 }}>
              <div><p style={{ margin: 0, fontSize: 11, color: "#aaa" }}>Bags</p><p style={{ margin: "2px 0 0", fontWeight: "bold", fontSize: 14, color: "#171717" }}>{stop.quantity_offloaded}</p></div>
              <div><p style={{ margin: 0, fontSize: 11, color: "#aaa" }}>Customer</p><p style={{ margin: "2px 0 0", fontSize: 13, color: "#171717", fontWeight: "500" }}>{stop.customer_name}</p></div>
              <div><p style={{ margin: 0, fontSize: 11, color: "#aaa" }}>Loading Point</p><p style={{ margin: "2px 0 0", fontSize: 12, color: "#555" }}>{stop.material_centre}</p></div>
              {stop.atc && <div><p style={{ margin: 0, fontSize: 11, color: "#aaa" }}>ATC</p><p style={{ margin: "2px 0 0", fontSize: 12, color: "#555" }}>{stop.atc}</p></div>}
            </div>

            {activeFilter === "pending" && (
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => openConfirmModal(stop)} style={{ flex: 1, padding: "11px 0", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold", fontSize: isMobile ? 14 : 13, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <Icon icon="mdi:check-circle" width={16} />
                  Confirm
                </button>
                <button onClick={() => { setDisputingStop(stop); setDisputeReason(""); setMessage("") }} style={{ flex: 1, padding: "11px 0", background: "white", color: "#ff4444", border: "1.5px solid #ff4444", borderRadius: 8, cursor: "pointer", fontWeight: "bold", fontSize: isMobile ? 14 : 13, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <Icon icon="mdi:alert-circle" width={16} />
                  Dispute
                </button>
              </div>
            )}
            {activeFilter === "confirmed" && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", background: "#f0fff4", borderRadius: 7 }}><Icon icon="mdi:check-circle" width={16} color="#00aa00" /><span style={{ fontSize: 13, color: "#00aa00", fontWeight: "600" }}>Confirmed</span></div>}
            {activeFilter === "disputed" && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", background: "#fff0f0", borderRadius: 7 }}><Icon icon="mdi:alert-circle" width={16} color="#ff4444" /><span style={{ fontSize: 13, color: "#ff4444", fontWeight: "600" }}>Disputed</span></div>}
          </div>
        ))
      ) : (
          <div style={{ background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                  <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Plate</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Customer</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "right" }}>Bags</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Location</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Date</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Status</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleStops.map((stop, idx) => (
                  <tr key={stop.stop_id} style={{ borderBottom: idx === visibleStops.length - 1 ? "none" : "1px solid #e2e8f0", transition: "background 0.2s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: 14, fontWeight: 500 }}>{stop.plate_number}</td>
                    <td style={{ padding: "12px 16px", color: "#475569", fontSize: 13 }}>{stop.customer_name}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", color: "#0f172a", fontSize: 14, fontWeight: 600 }}>{stop.quantity_offloaded}</td>
                    <td style={{ padding: "12px 16px", color: "#64748b", fontSize: 13 }}>{stop.stop_location}</td>
                    <td style={{ padding: "12px 16px", color: "#64748b", fontSize: 13 }}>{new Date(stop.stop_time).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}</td>
                    <td style={{ padding: "12px 16px" }}>
                      {stop.confirmed ? (
                        <span style={{ padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 500, background: "#d1fae5", color: "#065f46", border: "1px solid #a7f3d0", display: "inline-block" }}>Confirmed</span>
                      ) : stop.disputed ? (
                        <span style={{ padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 500, background: "#fee2e2", color: "#7f1d1d", border: "1px solid #fecaca", display: "inline-block" }}>Disputed</span>
                      ) : (
                        <span style={{ padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 500, background: "#f0f7ff", color: "#0c4a6e", border: "1px solid #bfdbfe", display: "inline-block" }}>Pending</span>
                      )}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      {activeFilter === "pending" ? (
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <button onClick={() => openConfirmModal(stop)} style={{ padding: "6px 10px", cursor: "pointer", borderRadius: 6, border: "1px solid #0070f3", color: "#0070f3", background: "#f0f7ff", fontSize: 12, fontWeight: 600, transition: "all 0.2s", minHeight: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                            onMouseEnter={e => { e.currentTarget.style.background = "#e0efff" }} onMouseLeave={e => { e.currentTarget.style.background = "#f0f7ff" }}>
                            <Icon icon="mdi:check-circle" width={14} /> Confirm
                          </button>
                          <button onClick={() => { setDisputingStop(stop); setDisputeReason(""); setMessage("") }} style={{ padding: "6px 10px", cursor: "pointer", borderRadius: 6, border: "1px solid #fecaca", color: "#ef4444", background: "#fef2f2", fontSize: 12, fontWeight: 600, transition: "all 0.2s", minHeight: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                            onMouseEnter={e => { e.currentTarget.style.background = "#fee2e2" }} onMouseLeave={e => { e.currentTarget.style.background = "#fef2f2" }}>
                            <Icon icon="mdi:alert-circle" width={14} /> Dispute
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: 12, color: "#94a3b8" }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      )}

      {selectedStop && (
        <div onClick={closeModal} style={modalOverlay}>
          <div onClick={e => e.stopPropagation()} style={modalBox}>
            {isMobile && <div style={{ width: 40, height: 4, background: "#e0e0e0", borderRadius: 2, margin: "0 auto 20px" }} />}
            <h3 style={{ margin: "0 0 4px", color: "#171717", fontSize: isMobile ? 18 : 16 }}>Confirm Stop</h3>
            <p style={{ color: "#888", fontSize: 13, marginBottom: 20 }}>{selectedStop.plate_number} · {selectedStop.stop_location}</p>

            <div style={{ padding: "12px 14px", background: "#f9f9f9", borderRadius: 10, marginBottom: 20 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div><p style={{ margin: 0, fontSize: 11, color: "#aaa" }}>Bags</p><p style={{ margin: "2px 0 0", fontWeight: "bold", fontSize: 16, color: "#171717" }}>{selectedStop.quantity_offloaded}</p></div>
                <div><p style={{ margin: 0, fontSize: 11, color: "#aaa" }}>Loading Point</p><p style={{ margin: "2px 0 0", fontSize: 13, color: "#171717" }}>{selectedStop.material_centre}</p></div>
                {selectedStop.atc && <div><p style={{ margin: 0, fontSize: 11, color: "#aaa" }}>ATC</p><p style={{ margin: "2px 0 0", fontSize: 13, color: "#171717" }}>{selectedStop.atc}</p></div>}
                <div><p style={{ margin: 0, fontSize: 11, color: "#aaa" }}>Driver's Customer</p><p style={{ margin: "2px 0 0", fontSize: 13, color: "#171717" }}>{selectedStop.customer_name}</p></div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Correct Customer (if different)</label>
              <CustomerSelector onSelect={(c) => setSelectedCustomer(c)} />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={labelStyle}>Price Per Bag (₦) *</label>
              <ModernInput type="text" inputMode="numeric" placeholder="e.g. 10,500" value={pricePerBag} onChange={(e) => { setPricePerBag(formatAmount(e.target.value)); setMessage("") }} style={inputStyle} />
            </div>

            {message && <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#ff4444", marginBottom: 14, fontSize: 13 }}><Icon icon="mdi:alert-circle" width={15} />{message}</div>}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={closeModal} style={{ flex: 1, padding: "13px 0", background: "white", border: "1.5px solid #e5e5e5", borderRadius: 10, cursor: "pointer", fontSize: 15, minHeight: 50, fontWeight: "bold" }}>Cancel</button>
              <button onClick={handleConfirm} disabled={submitting} style={{ flex: 1, padding: "13px 0", background: submitting ? "#ccc" : "#0070f3", color: "white", border: "none", borderRadius: 10, cursor: submitting ? "not-allowed" : "pointer", fontSize: 15, minHeight: 50, fontWeight: "bold", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {submitting ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} />Confirming…</> : <><Icon icon="mdi:check-circle" width={16} />Confirm Stop</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {disputingStop && (
        <div onClick={() => setDisputingStop(null)} style={modalOverlay}>
          <div onClick={e => e.stopPropagation()} style={modalBox}>
            {isMobile && <div style={{ width: 40, height: 4, background: "#e0e0e0", borderRadius: 2, margin: "0 auto 20px" }} />}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: "#fff0f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon icon="mdi:alert-circle" width={20} color="#ff4444" />
              </div>
              <h3 style={{ margin: 0, color: "#ff4444", fontSize: isMobile ? 18 : 16 }}>Dispute Stop</h3>
            </div>
            <p style={{ color: "#888", fontSize: 13, marginBottom: 20 }}>{disputingStop.plate_number} · {disputingStop.stop_location}</p>

            <div style={{ marginBottom: 24 }}>
              <label style={labelStyle}>Reason for Dispute *</label>
              <ModernInput as="textarea" placeholder="e.g. This stop does not belong to me…" value={disputeReason} onChange={e => { setDisputeReason(e.target.value); setMessage("") }} rows={4} style={{ ...inputStyle, resize: "none", minHeight: 110 }} />
            </div>

            {message && <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#ff4444", marginBottom: 14, fontSize: 13 }}><Icon icon="mdi:alert-circle" width={15} />{message}</div>}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setDisputingStop(null)} style={{ flex: 1, padding: "13px 0", background: "white", border: "1.5px solid #e5e5e5", borderRadius: 10, cursor: "pointer", fontSize: 15, minHeight: 50, fontWeight: "bold" }}>Cancel</button>
              <button onClick={handleDispute} disabled={submitting} style={{ flex: 1, padding: "13px 0", background: submitting ? "#ccc" : "#ff4444", color: "white", border: "none", borderRadius: 10, cursor: submitting ? "not-allowed" : "pointer", fontSize: 15, minHeight: 50, fontWeight: "bold", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {submitting ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} />Submitting…</> : <><Icon icon="mdi:alert-circle" width={16} />Submit Dispute</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}