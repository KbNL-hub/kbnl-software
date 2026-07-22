"use client"

import { useState, useEffect } from "react"
import { Icon } from "@iconify/react"
import { supabase } from "@/lib/supabase"
import { apiMutate } from "@/lib/api-mutation"
import RoleSwitcher from "@/components/RoleSwitcher"
import ReportModal from "@/components/ReportModal"
import { formatAmount, parseAmount } from "@/lib/formatAmount"
import ModernInput from "@/components/ModernInput"
import CustomerSelector from "@/components/CustomerSelector"
import CustomerPayments from "@/components/CustomerPayments"
import ProfilePictureUpload from "@/components/ProfilePictureUpload"
import { useBreakpoint } from "@/app/hooks/useBreakpoint"
import { FONT_SIZE } from "@/lib/constants"
import { requireDashboardRole } from "@/lib/auth-helpers"
import { Role } from "@/lib/roles"
import { formatDate, formatDateTime } from "@/lib/date-utils"
import { useStops } from "@/lib/hooks/useStops"

type Broker = {
  broker_id: string
  full_name: string
  profile_picture_url?: string
}

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
  order_no: string | null
  child_order_no: string | null
  product: string
  confirmed: boolean
  disputed: boolean
}

export default function BrokerDashboard() {
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"
  const isTablet = bp === "tablet"
  const isNarrow = isMobile || isTablet

  const [brokerId, setBrokerId] = useState<string | null>(null)
  const [broker, setBroker] = useState<Broker | null>(null)
  const [selectedStop, setSelectedStop] = useState<Stop | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [pricePerBag, setPricePerBag] = useState("")
  const [disputingStop, setDisputingStop] = useState<Stop | null>(null)
  const [disputeReason, setDisputeReason] = useState("")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [companyPriceMap, setCompanyPriceMap] = useState<Record<string, number>>({})
  const [soldAtDifferentPrice, setSoldAtDifferentPrice] = useState(false)
  const [discount, setDiscount] = useState("")
  const [salePrice, setSalePrice] = useState("")
  const [activeFilter, setActiveFilter] = useState<"pending" | "confirmed" | "disputed">("pending")
  const [allStops, setAllStops] = useState<Stop[]>([])
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 50
  const [stopsFilter, setStopsFilter] = useState<{ broker_id: string } | null>(null)
  const { data: stopsFromHook, refetch: refetchStops } = useStops(stopsFilter ?? undefined)
  useEffect(() => { setAllStops(stopsFromHook as Stop[]) }, [stopsFromHook])

  const [showPictureModal, setShowPictureModal] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [activeView, setActiveView] = useState<"broker" | "payments">("broker")

  useEffect(() => { initBroker() }, [])

  async function initBroker() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.href = "/login"; return }
    const user = session.user

    const hasRole = await requireDashboardRole(user.id, Role.Broker)
    if (!hasRole) { window.location.href = "/login"; return }

    setBrokerId(user.id)
    setStopsFilter({ broker_id: user.id })

    const { data: brokerData } = await supabase
      .from("Profiles").select("full_name").eq("user_id", user.id).single()

    if (brokerData) {
      const { data: brokerDetails } = await supabase
        .from("brokers")
        .select("broker_id, full_name, profile_picture_url")
        .eq("broker_id", user.id)
        .single()

      if (brokerDetails) {
        setBroker(brokerDetails)
      } else {
        setBroker({ broker_id: user.id, full_name: brokerData.full_name })
      }
    }

    const { data: priceData } = await supabase.from("company_prices").select("*")
    const priceMap: Record<string, number> = {}
    for (const p of (priceData || [])) priceMap[p.product] = p.price
    setCompanyPriceMap(priceMap)
    setLoading(false)
  }

  function openConfirmModal(stop: Stop) {
    const cp = companyPriceMap[stop.product]
    setSelectedStop(stop)
    setSelectedCustomer(null)
    setPricePerBag(cp ? formatAmount(cp.toString()) : "")
    setSoldAtDifferentPrice(false)
    setDiscount("")
    setSalePrice("")
    setMessage("")
  }

  function closeModal() {
    setSelectedStop(null); setSelectedCustomer(null); setPricePerBag(""); setMessage(""); setSoldAtDifferentPrice(false); setDiscount(""); setSalePrice("")
  }

  function handleDiscountChange(raw: string) {
    const digits = raw.replace(/[^0-9]/g, "")
    if (digits === "") { setDiscount(""); setSalePrice(""); setPricePerBag(""); return }
    const discountVal = parseInt(digits)
    const cp = selectedStop ? companyPriceMap[selectedStop.product] ?? 0 : 0
    const saleAmount = Math.max(0, cp - discountVal)
    setDiscount(formatAmount(discountVal.toString()))
    setSalePrice(formatAmount(saleAmount.toString()))
    setPricePerBag(formatAmount(saleAmount.toString()))
    setMessage("")
  }

  function handleSalePriceChange(raw: string) {
    const digits = raw.replace(/[^0-9]/g, "")
    if (digits === "") { setSalePrice(""); setDiscount(""); setPricePerBag(""); return }
    const saleVal = parseInt(digits)
    const cp = selectedStop ? companyPriceMap[selectedStop.product] ?? 0 : 0
    const discountAmount = Math.max(0, cp - saleVal)
    setSalePrice(formatAmount(saleVal.toString()))
    setDiscount(formatAmount(discountAmount.toString()))
    setPricePerBag(formatAmount(saleVal.toString()))
    setMessage("")
  }

  function handleToggleDifferentPrice(checked: boolean) {
    setSoldAtDifferentPrice(checked)
    if (!checked) {
      const cp = selectedStop ? companyPriceMap[selectedStop.product] ?? 0 : 0
      setDiscount("")
      setSalePrice("")
      setPricePerBag(cp ? formatAmount(cp.toString()) : "")
    } else {
      const cp = selectedStop ? companyPriceMap[selectedStop.product] ?? 0 : 0
      setDiscount("0")
      setSalePrice(cp ? formatAmount(cp.toString()) : "")
    }
  }

  async function handleDispute() {
    if (!disputingStop) return
    if (!disputeReason.trim()) return setMessage("Please provide a reason for the dispute")
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setSubmitting(true)
    const { error } = await apiMutate("trips", {
      action: "update", table: "Stops",
      data: { disputed: true, dispute_reason: disputeReason, disputed_by: user.id },
      filters: { stop_id: disputingStop.stop_id },
    })
    setSubmitting(false)

    if (error) { setMessage("Failed to dispute stop"); return }
    setDisputingStop(null); setDisputeReason(""); setMessage("")
    refetchStops()
  }

  async function handleConfirm() {
    if (!selectedStop) return
    if (!pricePerBag) return setMessage("Price per bag is required")
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setSubmitting(true)
    const customerIdToSave = selectedCustomer?.customer_id ?? selectedStop.customer_id

    const { error: stopError } = await apiMutate("trips", {
      action: "update", table: "Stops",
      data: { confirmed: true, customer_id: customerIdToSave, updated_by: user.id },
      filters: { stop_id: selectedStop.stop_id },
    })

    if (stopError) { setMessage("Failed to confirm stop"); setSubmitting(false); return }

    const { error: confirmError } = await apiMutate("trips", {
      action: "insert", table: "Stop_Confirmations",
      data: { stop_id: selectedStop.stop_id, broker_id: brokerId, customer_id: customerIdToSave, price_per_bag: parseAmount(pricePerBag) },
    })

    setSubmitting(false)
    if (confirmError) { setMessage("Stop updated but confirmation record failed"); return }
    closeModal()
    refetchStops()
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

  const visibleStopsUnpaginated =
    activeFilter === "pending" ? pendingStops :
    activeFilter === "confirmed" ? confirmedStops : disputedStops
  const totalPages = Math.ceil(visibleStopsUnpaginated.length / PAGE_SIZE) || 1
  const safePage = Math.min(page, totalPages)
  const visibleStops = visibleStopsUnpaginated.slice(0, safePage * PAGE_SIZE)

  const filterOptions: { key: "pending" | "confirmed" | "disputed"; label: string; count: number; color: string }[] = [
    { key: "pending", label: "Pending", count: pendingStops.length, color: "#0070f3" },
    { key: "confirmed", label: "Confirmed", count: confirmedStops.length, color: "#10b981" },
    { key: "disputed", label: "Disputed", count: disputedStops.length, color: "#ff4444" },
  ]

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

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: "#f8fafc", minHeight: "100vh" }}>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        .avatar-btn:hover { border-color: #0070f3 !important; transform: scale(1.05); }
        .avatar-wrapper:hover .camera-overlay { opacity: 1 !important; }
        .report-btn:hover { background: #fff0e1 !important; border-color: #f8ad5c !important; }
        .logout-btn:hover { background: rgba(239,68,68,0.1) !important; border-color: #fca5a5 !important; }
      `}</style>

      {/* Profile Banner */}
      <div style={{ background: "white", borderBottom: "1px solid #e2e8f0", padding: isMobile ? "16px" : "24px 32px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", gap: isMobile ? 12 : 16, justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 12 : 16, flex: 1 }}>
            <div className="avatar-wrapper" style={{ position: "relative" }}>
              <div
                onClick={() => setShowPictureModal(true)}
                className="avatar-btn"
                style={{
                  width: isMobile ? 48 : 56,
                  height: isMobile ? 48 : 56,
                  borderRadius: "50%",
                  background: broker?.profile_picture_url ? "transparent" : "#f0f7ff",
                  border: "2px solid #bfdbfe",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  cursor: "pointer",
                  overflow: "hidden",
                  transition: "all 0.2s",
                }}
              >
                {broker?.profile_picture_url ? (
                  <img
                    src={broker.profile_picture_url}
                    alt={broker.full_name}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <span style={{ fontSize: isMobile ? 20 : 24, fontWeight: 700, color: "#0070f3" }}>
                    {broker?.full_name.charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="camera-overlay" style={{ position: "absolute", inset: 0, background: "rgba(0, 0, 0, 0.4)", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0, transition: "opacity 0.2s" }}>
                  <Icon icon="mdi:camera" width={20} height={20} color="white" />
                </div>
              </div>
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: isMobile ? FONT_SIZE.lg : FONT_SIZE.xl, fontWeight: 700, color: "#0070f3" }}>
                {broker?.full_name}
              </h1>
              <RoleSwitcher currentRole={Role.Broker} style={{ margin: "2px 0 0", fontSize: FONT_SIZE.sm, color: "#64748b" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setShowReportModal(true)}
              className="report-btn"
              style={{ padding: "8px 14px", background: "#fff8e1", color: "#f5a623", border: "1.5px solid #f8ad5c", borderRadius: 8, cursor: "pointer", fontSize: FONT_SIZE.sm, minHeight: 40, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s", whiteSpace: "nowrap" }}
            >
              <Icon icon="mdi:alert-circle-outline" width={16} />
              {!isMobile && "Report"}
            </button>
            <button
              onClick={async () => { await supabase.auth.signOut(); window.location.href = "/login" }}
              className="logout-btn"
              style={{ padding: "8px 16px", background: "rgba(239, 68, 68, 0.05)", color: "#ef4444", border: "1.5px solid #fecaca", borderRadius: 6, cursor: "pointer", fontSize: FONT_SIZE.sm, fontWeight: 600, transition: "all 0.2s", minHeight: 40, whiteSpace: "nowrap" }}
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: maxW, margin: "0 auto" }}>
        <div style={{ padding: sidePad }}>

          {/* ── View Switcher ── */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr",
            gap: 10, padding: isMobile ? "16px 16px 0" : "20px 0 0",
            background: isMobile ? "#f8fafc" : "transparent",
          }}>
            {[
              { key: "broker", label: "My Stops", icon: "mdi:truck-delivery", count: allStops.length },
              { key: "payments", label: "Payments", icon: "mdi:cash-register" },
            ].map(tab => {
              const isActive = activeView === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveView(tab.key as "broker" | "payments")}
                  style={{
                    padding: isMobile ? "14px 12px" : "13px 12px",
                    background: isActive ? "rgba(0, 112, 243, 0.1)" : "white",
                    color: isActive ? "#0070f3" : "#555",
                    border: isActive ? "1px solid #0070f3" : "1.5px solid #e5e5e5",
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

          {/* ── Broker Stops View ── */}
          {activeView === "broker" && (
            <div style={{ padding: isMobile ? "20px 0" : "24px 0" }}>

              <h2 style={{ margin: "0 0 20px", fontSize: isMobile ? 22 : 20, color: "#171717",
                padding: isMobile ? "0 16px" : 0 }}>
                My Stops
              </h2>

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
                {visibleStopsUnpaginated.length > PAGE_SIZE && (
                  <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 16 }}>
                    <button disabled={safePage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} style={{ padding: "8px 16px", background: safePage <= 1 ? "#f0f0f0" : "white", border: "1px solid #e5e5e5", borderRadius: 8, cursor: safePage <= 1 ? "not-allowed" : "pointer", fontSize: 13, color: safePage <= 1 ? "#ccc" : "#555" }}>
                      ← Previous
                    </button>
                    <span style={{ display: "flex", alignItems: "center", fontSize: 13, color: "#888", padding: "0 8px" }}>Page {safePage} of {totalPages}</span>
                    <button disabled={safePage >= totalPages} onClick={() => setPage(p => p + 1)} style={{ padding: "8px 16px", background: safePage >= totalPages ? "#f0f0f0" : "white", border: "1px solid #e5e5e5", borderRadius: 8, cursor: safePage >= totalPages ? "not-allowed" : "pointer", fontSize: 13, color: safePage >= totalPages ? "#ccc" : "#555" }}>
                      Next →
                    </button>
                  </div>
                )}
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
                          {formatDate(stop.stop_time)}
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
                        {stop.order_no ? (
                          <>
                            <div>
                              <p style={{ margin: 0, fontSize: 11, color: "#aaa" }}>Order No</p>
                              <p style={{ margin: "2px 0 0", fontSize: 12, color: "#555" }}>{stop.order_no}</p>
                            </div>
                            {stop.child_order_no && (
                              <div>
                                <p style={{ margin: 0, fontSize: 11, color: "#aaa" }}>Child Order</p>
                                <p style={{ margin: "2px 0 0", fontSize: 12, color: "#555" }}>{stop.child_order_no}</p>
                              </div>
                            )}
                          </>
                        ) : stop.atc ? (
                          <div>
                            <p style={{ margin: 0, fontSize: 11, color: "#aaa" }}>ATC</p>
                            <p style={{ margin: "2px 0 0", fontSize: 12, color: "#555" }}>{stop.atc}</p>
                          </div>
                        ) : null}
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
                          padding: "8px 10px", background: "#ecfdf5", borderRadius: 7,
                        }}>
                          <Icon icon="mdi:check-circle" width={16} color="#10b981" />
                          <span style={{ fontSize: 13, color: "#10b981", fontWeight: "600" }}>Confirmed</span>
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
                {selectedStop.order_no ? (
                  <>
                    <div>
                      <p style={{ margin: 0, fontSize: 11, color: "#aaa" }}>Order No</p>
                      <p style={{ margin: "2px 0 0", fontSize: 13, color: "#171717" }}>{selectedStop.order_no}</p>
                    </div>
                    {selectedStop.child_order_no && (
                      <div>
                        <p style={{ margin: 0, fontSize: 11, color: "#aaa" }}>Child Order</p>
                        <p style={{ margin: "2px 0 0", fontSize: 13, color: "#171717" }}>{selectedStop.child_order_no}</p>
                      </div>
                    )}
                  </>
                ) : selectedStop.atc ? (
                  <div>
                    <p style={{ margin: 0, fontSize: 11, color: "#aaa" }}>ATC</p>
                    <p style={{ margin: "2px 0 0", fontSize: 13, color: "#171717" }}>{selectedStop.atc}</p>
                  </div>
                ) : null}
                <div>
                  <p style={{ margin: 0, fontSize: 11, color: "#aaa" }}>Driver's Customer</p>
                  <p style={{ margin: "2px 0 0", fontSize: 13, color: "#171717" }}>{selectedStop.customer_name}</p>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Correct Customer (if not provided)</label>
              <CustomerSelector onSelect={(c) => setSelectedCustomer(c)} />
            </div>

            {companyPriceMap[selectedStop.product] !== undefined && (
              <div style={{ marginBottom: 12, padding: "8px 12px", background: "#f0f7ff", borderRadius: 8, border: "1px solid #bfdbfe", display: "flex", alignItems: "center", gap: 8 }}>
                <Icon icon="mdi:information" width={16} color="#0070f3" />
                <span style={{ fontSize: 13, color: "#0c4a6e" }}>Company price: <strong>₦{companyPriceMap[selectedStop.product].toLocaleString()}</strong>/bag</span>
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Price Per Bag (₦) *</label>
              <ModernInput
                type="text"
                inputMode="numeric"
                placeholder="e.g. 10,500"
                value={pricePerBag}
                onChange={(e) => { setPricePerBag(formatAmount(e.target.value)); setMessage("") }}
                style={inputStyle}
              />
            </div>

            {companyPriceMap[selectedStop.product] !== undefined && (
              <>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontWeight: 500, fontSize: 13, color: "#444" }}>
                    <input type="checkbox" checked={soldAtDifferentPrice} onChange={e => handleToggleDifferentPrice(e.target.checked)} style={{ width: 16, height: 16, cursor: "pointer" }} />
                    Sold at a different price?
                  </label>
                </div>

                {soldAtDifferentPrice && (
                  <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>Discount (₦)</label>
                      <ModernInput type="text" inputMode="numeric" placeholder="0" value={discount} onChange={e => handleDiscountChange(e.target.value)} style={inputStyle} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>Sale Price (₦)</label>
                      <ModernInput type="text" inputMode="numeric" placeholder="Sale price" value={salePrice} onChange={e => handleSalePriceChange(e.target.value)} style={inputStyle} />
                    </div>
                  </div>
                )}
              </>
            )}

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
              <ModernInput
                as="textarea"
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

      <ProfilePictureUpload
        isOpen={showPictureModal}
        onClose={() => setShowPictureModal(false)}
        userId={broker?.broker_id || ""}
        table="brokers"
        idField="broker_id"
        currentUrl={broker?.profile_picture_url}
        onSuccess={(url) => setBroker(prev => prev ? { ...prev, profile_picture_url: url } : prev)}
      />

      <ReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        userId={broker?.broker_id || ""}
        userRole={Role.Broker}
      />
    </div>
  )
}
