"use client"

import { useState, useEffect } from "react"
import { Icon } from "@iconify/react"
import { supabase } from "@/lib/supabase"
import { formatAmount, parseAmount } from "@/lib/formatAmount"
import CustomerSelector from "@/components/CustomerSelector"
import OfficeClerkPanel from "@/components/OfficeClerkPanel"
import CustomerPayments from "@/components/CustomerPayments"
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

export default function BrokerDashboard() {
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"
  const isTablet = bp === "tablet"
  const isNarrow = isMobile || isTablet

  const [brokerId, setBrokerId] = useState<string | null>(null)
  const [brokerName, setBrokerName] = useState("")
  const [selectedStop, setSelectedStop] = useState<Stop | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [pricePerBag, setPricePerBag] = useState("")
  const [disputingStop, setDisputingStop] = useState<Stop | null>(null)
  const [disputeReason, setDisputeReason] = useState("")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<"pending" | "confirmed" | "disputed">("pending")
  const [allStops, setAllStops] = useState<Stop[]>([])

  // Dual-role state
  const [isDualRole, setIsDualRole] = useState(false)
  const [clerkOfficeName, setClerkOfficeName] = useState("")
  const [activeView, setActiveView] = useState<"broker" | "expenses" | "payments">("broker")

  useEffect(() => { initBroker() }, [])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") window.location.href = "/login"
    })
    return () => subscription.unsubscribe()
  }, [])

  async function initBroker() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.href = "/login"; return }
    const user = session.user

    setBrokerId(user.id)

    const { data: profile } = await supabase
      .from("Profiles").select("full_name").eq("user_id", user.id).single()
    if (profile) setBrokerName(profile.full_name)

    const { data: clerkRecord } = await supabase
      .from("office_clerks").select("office_name")
      .eq("clerk_id", user.id).eq("status", "Active").single()

    if (clerkRecord) {
      setIsDualRole(true)
      setClerkOfficeName(clerkRecord.office_name)
    }

    await fetchStops(user.id)
    setLoading(false)
  }

  async function fetchStops(bId: string) {
    const { data: stops } = await supabase
      .from("Stops")
      .select("stop_id, trip_id, customer_id, quantity_offloaded, stop_location, stop_time, confirmed, disputed")
      .eq("broker_id", bId)
      .order("stop_time", { ascending: false })

    const enrich = async (stops: any[]) => {
      return await Promise.all(stops.map(async (stop) => {
        const { data: trip } = await supabase
          .from("Trips").select("plate_number, material_centre, ATC")
          .eq("trip_id", stop.trip_id).single()

        let customerName = "Not provided"
        if (stop.customer_id) {
          const { data: customer } = await supabase
            .from("Customers").select("full_name")
            .eq("customer_id", stop.customer_id).single()
          customerName = customer?.full_name ?? "Not provided"
        }

        return {
          ...stop,
          plate_number: trip?.plate_number ?? "Unknown",
          material_centre: trip?.material_centre ?? "",
          atc: trip?.ATC ?? null,
          customer_name: customerName,
        }
      }))
    }

    setAllStops(await enrich(stops || []))
  }

  function openConfirmModal(stop: Stop) {
    setSelectedStop(stop); setSelectedCustomer(null); setPricePerBag(""); setMessage("")
  }

  function closeModal() {
    setSelectedStop(null); setSelectedCustomer(null); setPricePerBag(""); setMessage("")
  }

  async function handleDispute() {
    if (!disputingStop) return
    if (!disputeReason.trim()) return setMessage("Please provide a reason for the dispute")
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setSubmitting(true)
    const { error } = await supabase.from("Stops").update({
      disputed: true, dispute_reason: disputeReason, disputed_by: user.id,
    }).eq("stop_id", disputingStop.stop_id)
    setSubmitting(false)

    if (error) { setMessage("Failed to dispute stop"); return }
    setDisputingStop(null); setDisputeReason(""); setMessage("")
    if (brokerId) fetchStops(brokerId)
  }

  async function handleConfirm() {
    if (!selectedStop) return
    if (!pricePerBag) return setMessage("Price per bag is required")
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setSubmitting(true)
    const customerIdToSave = selectedCustomer?.customer_id ?? selectedStop.customer_id

    const { error: stopError } = await supabase.from("Stops").update({
      confirmed: true, customer_id: customerIdToSave, updated_by: user.id,
    }).eq("stop_id", selectedStop.stop_id)

    if (stopError) { setMessage("Failed to confirm stop"); setSubmitting(false); return }

    const { error: confirmError } = await supabase.from("Stop_Confirmations").insert([{
      stop_id: selectedStop.stop_id, broker_id: brokerId,
      customer_id: customerIdToSave, price_per_bag: parseAmount(pricePerBag),
    }])

    setSubmitting(false)
    if (confirmError) { setMessage("Stop updated but confirmation record failed"); return }
    closeModal()
    if (brokerId) fetchStops(brokerId)
  }

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "white" }}>
      <div style={{ textAlign: "center" }}>
        <Icon icon="mdi:loading" width={32} color="#0070f3" style={{ animation: "spin 1s linear infinite" }} />
        <p style={{ color: "#888", marginTop: 12, fontSize: 14 }}>Loading…</p>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  const pendingStops = allStops.filter(s => !s.confirmed && !s.disputed)
  const confirmedStops = allStops.filter(s => s.confirmed)
  const disputedStops = allStops.filter(s => s.disputed)

  const visibleStops =
    activeFilter === "pending" ? pendingStops :
    activeFilter === "confirmed" ? confirmedStops : disputedStops

  const filterOptions: { key: "pending" | "confirmed" | "disputed"; label: string; count: number; color: string }[] = [
    { key: "pending", label: "Pending", count: pendingStops.length, color: "#0070f3" },
    { key: "confirmed", label: "Confirmed", count: confirmedStops.length, color: "#00aa00" },
    { key: "disputed", label: "Disputed", count: disputedStops.length, color: "#ff4444" },
  ]

  // ── Shared styles ──
  const maxW = isNarrow ? "100%" : 520
  const sidePad = isMobile ? "0 16px" : isTablet ? "0 24px" : 0

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: isMobile ? "14px 12px" : "11px 12px",
    boxSizing: "border-box", borderRadius: 8,
    border: "1.5px solid #e5e5e5", fontSize: isMobile ? 16 : 14,
    background: "white", color: "#171717", minHeight: isMobile ? 48 : 42,
    appearance: "none", WebkitAppearance: "none",
  }

  const labelStyle: React.CSSProperties = {
    fontWeight: "600", display: "block", marginBottom: 6,
    fontSize: isMobile ? 14 : 13, color: "#444",
  }

  const modalOverlay: React.CSSProperties = {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
    display: "flex", alignItems: isMobile ? "flex-end" : "center",
    justifyContent: "center", zIndex: 100,
  }

  const modalBox: React.CSSProperties = {
    background: "white",
    borderRadius: isMobile ? "20px 20px 0 0" : 14,
    padding: isMobile ? "24px 20px 40px" : 32,
    width: isMobile ? "100%" : 420,
    maxWidth: "100%",
    maxHeight: isMobile ? "92vh" : "88vh",
    overflowY: "auto",
    boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
  }

  const fullBtn = (bg: string, color = "white"): React.CSSProperties => ({
    width: "100%", padding: isMobile ? "15px 0" : "13px 0",
    background: bg, color,
    border: "none", borderRadius: 10,
    fontSize: isMobile ? 16 : 14, cursor: "pointer", fontWeight: "bold",
    minHeight: 52,
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
  })

  const outlineBtn = (color: string): React.CSSProperties => ({
    width: "100%", padding: isMobile ? "13px 0" : "11px 0",
    background: "white", color, border: `1.5px solid ${color}`,
    borderRadius: 10, fontSize: isMobile ? 15 : 14,
    cursor: "pointer", minHeight: 48,
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
  })

  return (
    <div style={{ fontFamily: "Arial, sans-serif", background: "#f7f7f7", minHeight: "100vh" }}>
      <div style={{ maxWidth: maxW, margin: "0 auto" }}>

        {/* ── Sticky Header ── */}
        <div style={{
          background: "white", borderBottom: "1px solid #eee",
          padding: isMobile ? "14px 16px" : "16px 24px",
          position: "sticky", top: 0, zIndex: 20,
          boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <p style={{ margin: 0, fontSize: 11, color: "#aaa", fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 }}>
              {isDualRole ? "Broker · " + clerkOfficeName + " Clerk" : "Broker"}
            </p>
            <p style={{ margin: "2px 0 0", fontWeight: "bold", fontSize: isMobile ? 15 : 14, color: "#171717" }}>{brokerName}</p>
          </div>
          <button
            onClick={async () => { await supabase.auth.signOut(); window.location.href = "/login" }}
            style={{
              padding: isMobile ? "8px 12px" : "7px 14px",
              background: "#fff0f0", color: "#ff4444",
              border: "1.5px solid #ff4444", borderRadius: 8,
              cursor: "pointer", fontSize: 12, minHeight: 38,
              display: "flex", alignItems: "center", gap: 5,
            }}
          >
            <Icon icon="mdi:logout" width={15} />
            {!isMobile && "Logout"}
          </button>
        </div>

        <div style={{ padding: sidePad }}>

          {/* ── View Switcher ── */}
          <div style={{
            display: "grid", gridTemplateColumns: isDualRole ? "1fr 1fr 1fr" : "1fr 1fr",
            gap: 10, padding: isMobile ? "16px 16px 0" : "20px 0 0",
            background: isMobile ? "#f7f7f7" : "transparent",
          }}>
            {[
              { key: "broker", label: "My Stops", icon: "mdi:truck-delivery", count: allStops.length },
              { key: "payments", label: "Payments", icon: "mdi:cash-register" },
              ...(isDualRole ? [{ key: "expenses", label: "Cash Expenses", icon: "mdi:cash-multiple", count: pendingStops.length === 0 ? undefined : undefined }] : []),
            ].map(tab => {
              const isActive = activeView === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveView(tab.key as "broker" | "expenses" | "payments")}
                    style={{
                      padding: isMobile ? "14px 12px" : "13px 12px",
                      background: isActive ? "#0070f3" : "white",
                      color: isActive ? "white" : "#555",
                      border: isActive ? "none" : "1.5px solid #e5e5e5",
                      borderRadius: 10,
                      cursor: "pointer",
                      fontWeight: isActive ? "bold" : "normal",
                      fontSize: isMobile ? 14 : 13,
                      minHeight: 52,
                      display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center", gap: 6,
                      transition: "all 0.15s",
                      boxShadow: isActive ? "0 4px 12px rgba(0,112,243,0.25)" : "none",
                    }}
                  >
                    <Icon icon={tab.icon} width={20} />
                    <span>{tab.label}</span>
                  </button>
                )
              })}
            </div>

          {/* ── Payments View ── */}
          {activeView === "payments" && brokerId && (
            <div style={{ padding: isMobile ? "16px 0" : "20px 0" }}>
              <CustomerPayments brokerId={brokerId} />
            </div>
          )}

          {/* ── Expenses View ── */}
          {activeView === "expenses" && isDualRole && brokerId && (
            <div style={{ padding: isMobile ? "16px 0" : "20px 0" }}>
              <OfficeClerkPanel
                clerkId={brokerId}
                officeName={clerkOfficeName}
                fullName={brokerName}
              />
            </div>
          )}

          {/* ── Broker Stops View ── */}
          {activeView === "broker" && (
            <div style={{ padding: isMobile ? "20px 0" : "24px 0" }}>

              {!isDualRole && (
                <h2 style={{ margin: "0 0 20px", fontSize: isMobile ? 22 : 20, color: "#171717",
                  padding: isMobile ? "0 16px" : 0 }}>
                  My Stops
                </h2>
              )}

              {/* Filter Pills */}
              <div style={{
                display: "flex", gap: 8, marginBottom: 20,
                padding: isMobile ? "0 16px" : 0,
                overflowX: "auto", scrollbarWidth: "none",
              }}>
                {filterOptions.map(({ key, label, count, color }) => {
                  const isActive = activeFilter === key
                  return (
                    <button
                      key={key}
                      onClick={() => setActiveFilter(key)}
                      style={{
                        padding: isMobile ? "9px 16px" : "7px 14px",
                        borderRadius: 20, fontSize: 13, cursor: "pointer",
                        border: isActive ? "none" : "1.5px solid #e5e5e5",
                        background: isActive ? color : "white",
                        color: isActive ? "white" : "#555",
                        fontWeight: isActive ? "bold" : "normal",
                        minHeight: 38, whiteSpace: "nowrap",
                        display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
                        boxShadow: isActive ? `0 2px 8px ${color}44` : "none",
                      }}
                    >
                      {label}
                      {count > 0 && (
                        <span style={{
                          background: isActive ? "rgba(255,255,255,0.25)" : "#f0f0f0",
                          color: isActive ? "white" : "#888",
                          borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: "bold",
                        }}>
                          {count}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Stop Cards */}
              <div style={{ padding: isMobile ? "0 16px" : 0 }}>
                {visibleStops.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "60px 0", color: "#bbb" }}>
                    <Icon icon="mdi:map-marker-off" width={40} style={{ marginBottom: 10, display: "block", margin: "0 auto 10px" }} />
                    <p style={{ margin: 0, fontSize: 14 }}>No {activeFilter} stops</p>
                  </div>
                ) : (
                  visibleStops.map((stop) => (
                    <div
                      key={stop.stop_id}
                      style={{
                        background: "white", border: "1px solid #eee", borderRadius: 12,
                        padding: isMobile ? "14px 16px" : "16px 20px",
                        marginBottom: 10,
                        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
                      }}
                    >
                      {/* Top row */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{
                            width: 36, height: 36, borderRadius: 9, background: "#f0f7ff",
                            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                          }}>
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

                      {/* Details */}
                      <div style={{
                        display: "grid", gridTemplateColumns: "1fr 1fr",
                        gap: 8, padding: "10px 12px", background: "#f9f9f9",
                        borderRadius: 8, marginBottom: 12,
                      }}>
                        <div>
                          <p style={{ margin: 0, fontSize: 11, color: "#aaa" }}>Bags</p>
                          <p style={{ margin: "2px 0 0", fontWeight: "bold", fontSize: 14, color: "#171717" }}>{stop.quantity_offloaded}</p>
                        </div>
                        <div>
                          <p style={{ margin: 0, fontSize: 11, color: "#aaa" }}>Customer</p>
                          <p style={{ margin: "2px 0 0", fontSize: 13, color: "#171717", fontWeight: "500" }}>{stop.customer_name}</p>
                        </div>
                        <div>
                          <p style={{ margin: 0, fontSize: 11, color: "#aaa" }}>Loading Point</p>
                          <p style={{ margin: "2px 0 0", fontSize: 12, color: "#555" }}>{stop.material_centre}</p>
                        </div>
                        {stop.atc && (
                          <div>
                            <p style={{ margin: 0, fontSize: 11, color: "#aaa" }}>ATC</p>
                            <p style={{ margin: "2px 0 0", fontSize: 12, color: "#555" }}>{stop.atc}</p>
                          </div>
                        )}
                      </div>

                      {/* Status / Actions */}
                      {activeFilter === "pending" && (
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => openConfirmModal(stop)}
                            style={{
                              flex: 1, padding: "11px 0", background: "#0070f3", color: "white",
                              border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold",
                              fontSize: isMobile ? 14 : 13, minHeight: 44,
                              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                            }}
                          >
                            <Icon icon="mdi:check-circle" width={16} />
                            Confirm
                          </button>
                          <button
                            onClick={() => { setDisputingStop(stop); setDisputeReason(""); setMessage("") }}
                            style={{
                              flex: 1, padding: "11px 0", background: "white", color: "#ff4444",
                              border: "1.5px solid #ff4444", borderRadius: 8, cursor: "pointer",
                              fontWeight: "bold", fontSize: isMobile ? 14 : 13, minHeight: 44,
                              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                            }}
                          >
                            <Icon icon="mdi:alert-circle" width={16} />
                            Dispute
                          </button>
                        </div>
                      )}

                      {activeFilter === "confirmed" && (
                        <div style={{
                          display: "flex", alignItems: "center", gap: 6,
                          padding: "8px 10px", background: "#f0fff4", borderRadius: 7,
                        }}>
                          <Icon icon="mdi:check-circle" width={16} color="#00aa00" />
                          <span style={{ fontSize: 13, color: "#00aa00", fontWeight: "600" }}>Confirmed</span>
                        </div>
                      )}

                      {activeFilter === "disputed" && (
                        <div style={{
                          display: "flex", alignItems: "center", gap: 6,
                          padding: "8px 10px", background: "#fff0f0", borderRadius: 7,
                        }}>
                          <Icon icon="mdi:alert-circle" width={16} color="#ff4444" />
                          <span style={{ fontSize: 13, color: "#ff4444", fontWeight: "600" }}>Disputed</span>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ══ Confirmation Modal ══ */}
      {selectedStop && (
        <div onClick={closeModal} style={modalOverlay}>
          <div onClick={e => e.stopPropagation()} style={modalBox}>
            {isMobile && <div style={{ width: 40, height: 4, background: "#e0e0e0", borderRadius: 2, margin: "0 auto 20px" }} />}
            <h3 style={{ margin: "0 0 4px", color: "#171717", fontSize: isMobile ? 18 : 16 }}>Confirm Stop</h3>
            <p style={{ color: "#888", fontSize: 13, marginBottom: 20 }}>
              {selectedStop.plate_number} · {selectedStop.stop_location}
            </p>

            {/* Info card */}
            <div style={{ padding: "12px 14px", background: "#f9f9f9", borderRadius: 10, marginBottom: 20 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <p style={{ margin: 0, fontSize: 11, color: "#aaa" }}>Bags</p>
                  <p style={{ margin: "2px 0 0", fontWeight: "bold", fontSize: 16, color: "#171717" }}>{selectedStop.quantity_offloaded}</p>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 11, color: "#aaa" }}>Loading Point</p>
                  <p style={{ margin: "2px 0 0", fontSize: 13, color: "#171717" }}>{selectedStop.material_centre}</p>
                </div>
                {selectedStop.atc && (
                  <div>
                    <p style={{ margin: 0, fontSize: 11, color: "#aaa" }}>ATC</p>
                    <p style={{ margin: "2px 0 0", fontSize: 13, color: "#171717" }}>{selectedStop.atc}</p>
                  </div>
                )}
                <div>
                  <p style={{ margin: 0, fontSize: 11, color: "#aaa" }}>Driver's Customer</p>
                  <p style={{ margin: "2px 0 0", fontSize: 13, color: "#171717" }}>{selectedStop.customer_name}</p>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Correct Customer (if different)</label>
              <CustomerSelector onSelect={(c) => setSelectedCustomer(c)} />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={labelStyle}>Price Per Bag (₦) *</label>
              <input
                type="text" inputMode="numeric" placeholder="e.g. 10,500"
                value={pricePerBag}
                onChange={(e) => { setPricePerBag(formatAmount(e.target.value)); setMessage("") }}
                style={inputStyle}
              />
            </div>

            {message && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#ff4444", marginBottom: 14, fontSize: 13 }}>
                <Icon icon="mdi:alert-circle" width={15} />{message}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={closeModal} style={{ flex: 1, padding: "13px 0", background: "white", border: "1.5px solid #e5e5e5", borderRadius: 10, cursor: "pointer", fontSize: 15, minHeight: 50 }}>
                Cancel
              </button>
              <button onClick={handleConfirm} disabled={submitting} style={{ ...fullBtn(submitting ? "#ccc" : "#0070f3"), flex: 1 }}>
                {submitting
                  ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} /> Confirming…</>
                  : <><Icon icon="mdi:check-circle" width={16} /> Confirm Stop</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Dispute Modal ══ */}
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
            <p style={{ color: "#888", fontSize: 13, marginBottom: 20 }}>
              {disputingStop.plate_number} · {disputingStop.stop_location}
            </p>

            <div style={{ marginBottom: 24 }}>
              <label style={labelStyle}>Reason for Dispute *</label>
              <textarea
                placeholder="e.g. This stop does not belong to me…"
                value={disputeReason}
                onChange={e => { setDisputeReason(e.target.value); setMessage("") }}
                rows={4}
                style={{ ...inputStyle, resize: "none", minHeight: 110 }}
              />
            </div>

            {message && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#ff4444", marginBottom: 14, fontSize: 13 }}>
                <Icon icon="mdi:alert-circle" width={15} />{message}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setDisputingStop(null)} style={{ flex: 1, padding: "13px 0", background: "white", border: "1.5px solid #e5e5e5", borderRadius: 10, cursor: "pointer", fontSize: 15, minHeight: 50 }}>
                Cancel
              </button>
              <button onClick={handleDispute} disabled={submitting} style={{ ...fullBtn(submitting ? "#ccc" : "#ff4444"), flex: 1 }}>
                {submitting
                  ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} /> Submitting…</>
                  : <><Icon icon="mdi:alert-circle" width={16} /> Submit Dispute</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}