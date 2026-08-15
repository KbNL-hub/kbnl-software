"use client"

import { useState, useEffect, useCallback } from "react"
import { Icon } from "@iconify/react"
import { supabase } from "@/lib/supabase"
import { apiMutate } from "@/lib/api-mutation"
import { formatAmount } from "@/lib/formatAmount"
import ModernInput from "@/components/ModernInput"
import BrokerConfirmModal from "@/components/broker/BrokerConfirmModal"
import { useBreakpoint } from "@/app/hooks/useBreakpoint"

const AREAS = ["Calabar to Obubra", "Ikom to Obudu", "Akwa-Ibom", "East"]

type SaleLine = {
  sale_id: string
  product: string
  quantity: number
  price_per_bag: number | null
  total_amount: number | null
  customer_name: string | null
  payment_mode: string
  delivery_mode: string
  tricycle_id: string | null
  truck_plate: string | null
  sold_at: string
  created_at: string
  status: string
  store_name: string
  rejection_reason: string | null
  discount_status: string | null
  denial_reason?: string | null
}

type SaleGroup = {
  group_id: string
  customer_name: string | null
  payment_mode: string
  delivery_mode: string
  tricycle_id: string | null
  truck_plate: string | null
  sold_at: string
  status: string
  store_name: string
  rejection_reason: string | null
  denial_reason?: string | null
  lines: SaleLine[]
}

export default function BrokerSaleConfirmations() {
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"

  const [brokerId, setBrokerId] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<"pending" | "confirmed" | "rejected" | "returned" | "review">("pending")
  const [allGroups, setAllGroups] = useState<SaleGroup[]>([])
  const [loading, setLoading] = useState(true)

  const [confirmingGroup, setConfirmingGroup] = useState<SaleGroup | null>(null)
  const [rejectingGroup, setRejectingGroup] = useState<SaleGroup | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [message, setMessage] = useState("")
  const [notification, setNotification] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [companyPriceMap, setCompanyPriceMap] = useState<Record<string, Record<string, number>>>({})
  const [expandedCard, setExpandedCard] = useState<string | null>(null)
  const initBroker = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.href = "/login"; return }
    setBrokerId(session.user.id)
    await Promise.all([
      fetchSales(session.user.id),
      fetchCompanyPrices(),
    ])
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { initBroker() }, [initBroker])

  async function fetchCompanyPrices() {
    const { data, error } = await supabase
      .from("company_prices")
      .select("area, product, price")
    if (!error && data) {
      const map: Record<string, Record<string, number>> = {}
      for (const area of AREAS) map[area] = {}
      for (const row of data) {
        if (!map[row.area]) map[row.area] = {}
        map[row.area][row.product] = row.price
      }
      setCompanyPriceMap(map)
    }
  }

  async function fetchSales(bId: string) {
    const { data, error } = await supabase
      .from("store_sales")
      .select("sale_id, product, quantity, price_per_bag, total_amount, customer_name, payment_mode, delivery_mode, tricycle_id, truck_plate, sold_at, created_at, status, store_name, rejection_reason, discount_status")
      .eq("broker_id", bId)
      .order("sold_at", { ascending: false })

    if (error) { console.error("Failed to fetch sales:", error); return }

    // Fetch denial reasons for returned lines
    const returnedSaleIds = (data || []).filter(s => s.discount_status === "returned").map(s => s.sale_id)
    const denialMap: Record<string, string> = {}
    if (returnedSaleIds.length > 0) {
      const { data: adjustments } = await supabase
        .from("price_adjustments")
        .select("source_id, denial_reason")
        .eq("source_type", "store_sale")
        .eq("status", "Denied")
        .in("source_id", returnedSaleIds)
      for (const adj of adjustments || []) {
        if (adj.denial_reason) denialMap[adj.source_id] = adj.denial_reason
      }
    }

    const enriched = (data || []).map(s => ({
      ...s,
      denial_reason: denialMap[s.sale_id] || null,
    }))

    const groups = groupSales(enriched)
    setAllGroups(groups)
  }

  function groupSales(sales: SaleLine[]): SaleGroup[] {
    return sales.reduce<SaleGroup[]>((groups, sale) => {
      const groupId = [
        sale.sold_at.split("T")[0],
        sale.customer_name ?? "",
        sale.payment_mode,
        sale.delivery_mode,
        sale.status,
      ].join("|")

      const existing = groups.find(g => g.group_id === groupId)

      if (existing) {
        existing.lines.push(sale)
        return groups
      }

      groups.push({
        group_id: groupId,
        customer_name: sale.customer_name,
        payment_mode: sale.payment_mode,
        delivery_mode: sale.delivery_mode,
        tricycle_id: sale.tricycle_id,
        truck_plate: sale.truck_plate,
        sold_at: sale.sold_at,
        status: sale.status,
        store_name: sale.store_name,
        rejection_reason: sale.rejection_reason,
        denial_reason: sale.denial_reason,
        lines: [sale],
      })

      return groups
    }, [])
  }

  function openConfirmModal(group: SaleGroup) {
    setConfirmingGroup(group)
    setMessage("")
  }

  function closeConfirmModal() {
    setConfirmingGroup(null)
    setMessage("")
  }

  function openRejectModal(group: SaleGroup) {
    setRejectingGroup(group)
    setRejectReason("")
    setMessage("")
  }

  function closeRejectModal() {
    setRejectingGroup(null)
    setRejectReason("")
    setMessage("")
  }

  async function handleReject() {
    if (!rejectingGroup || !rejectReason.trim()) {
      setMessage("Please provide a reason")
      return
    }

    setSubmitting(true)
    try {
      const updateData: Record<string, unknown> = {
        status: "Rejected",
        rejection_reason: rejectReason.trim(),
      }
      const saleIds = rejectingGroup.lines.map(line => line.sale_id)

      const { data, error } = await apiMutate("finance", {
        action: "update",
        table: "store_sales",
        data: updateData,
        filters: { sale_id: saleIds, status: "Pending", broker_id: brokerId },
      })

      if (error) {
        setMessage("Could not reject the selected sales")
        setSubmitting(false)
        return
      }

      const rejected = Array.isArray(data) ? data.length : 0
      if (rejected === 0) {
        setMessage("Could not reject any of the selected sales")
        setSubmitting(false)
        return
      }
      if (rejected < saleIds.length) {
        closeRejectModal()
        if (brokerId) fetchSales(brokerId)
        setNotification(`Rejected ${rejected} of ${saleIds.length} sales (${saleIds.length - rejected} had no matching pending sale)`)
        setSubmitting(false)
        return
      }

      closeRejectModal()
      if (brokerId) fetchSales(brokerId)
    } catch {
      setMessage("Failed to reject sale. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  useEffect(() => {
    if (!notification) return
    const t = setTimeout(() => setNotification(""), 5000)
    return () => clearTimeout(t)
  }, [notification])

  if (loading) return <p style={{ color: "#888" }}>Loading…</p>

  const pendingGroups = allGroups.filter(g => g.status === "Pending" && !g.lines.some(l => l.discount_status === "returned") && !g.lines.some(l => l.discount_status === "pending"))
  const reviewGroups = allGroups.filter(g => g.status === "Pending" && g.lines.some(l => l.discount_status === "pending"))
  const confirmedGroups = allGroups.filter(g => g.status === "Confirmed")
  const rejectedGroups = allGroups.filter(g => g.status === "Rejected")
  const returnedGroups = allGroups.filter(g => g.status === "Pending" && g.lines.some(l => l.discount_status === "returned"))

  const visibleGroups = activeFilter === "pending" ? pendingGroups
    : activeFilter === "review" ? reviewGroups
    : activeFilter === "confirmed" ? confirmedGroups
    : activeFilter === "returned" ? returnedGroups
    : rejectedGroups

  const filterOptions = [
    { key: "pending" as const, label: "Pending", count: pendingGroups.length, color: "#f5a623" },
    { key: "review" as const, label: "In Review", count: reviewGroups.length, color: "#0070f3" },
    { key: "confirmed" as const, label: "Confirmed", count: confirmedGroups.length, color: "#10b981" },
    { key: "returned" as const, label: "Returned", count: returnedGroups.length, color: "#d97706" },
    { key: "rejected" as const, label: "Rejected", count: rejectedGroups.length, color: "#ef4444" },
  ]

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: isMobile ? "14px 12px" : "11px 12px",
    boxSizing: "border-box", borderRadius: 8, border: "1.5px solid #e5e5e5",
    fontSize: isMobile ? 16 : 14, background: "white", color: "#171717",
    minHeight: isMobile ? 48 : 42
  }
  const labelStyle: React.CSSProperties = {
    fontWeight: "600", display: "block", marginBottom: 6,
    fontSize: isMobile ? 14 : 13, color: "#444"
  }
  const modalOverlay: React.CSSProperties = {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
    display: "flex", alignItems: isMobile ? "flex-end" : "center",
    justifyContent: "center", zIndex: 100
  }
  const modalBox: React.CSSProperties = {
    background: "white", borderRadius: isMobile ? "20px 20px 0 0" : 14,
    padding: isMobile ? "24px 20px 40px" : 32,
    width: isMobile ? "100%" : 500,
    maxHeight: isMobile ? "92vh" : "88vh",
    overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.2)"
  }

  const PAYMENT_LABELS: Record<string, string> = {
    Cash: "Cash", Transfer: "Transfer", POS: "POS", Broker: "Broker"
  }
  const DELIVERY_LABELS: Record<string, string> = {
    self: "Self", tricycle: "Tricycle", truck: "Truck"
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-NG", {
      day: "numeric", month: "short", year: "numeric"
    })
  }

  return (
    <div>
      {notification && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#ef4444", marginBottom: 14, fontSize: 13, padding: "10px 14px", background: "#fef2f2", borderRadius: 8 }}>
          <Icon icon="mdi:alert-circle" width={15} />{notification}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: isMobile ? 22 : 20, color: "#171717" }}>Store Sales</h2>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 8 }}>
        {filterOptions.map(({ key, label, count, color }) => {
          const isActive = activeFilter === key
          return (
            <button key={key} onClick={() => setActiveFilter(key)} style={{
              padding: isMobile ? "9px 16px" : "7px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer",
              border: `1.5px solid ${isActive ? color : "#e2e8f0"}`,
              background: isActive ? `${color}1a` : "white",
              color: isActive ? color : "#64748b",
              fontWeight: isActive ? 600 : 500,
              minHeight: 38, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
              transition: "all 0.2s ease",
            }}>
              {label}
              {count > 0 && (
                <span style={{
                  background: isActive ? "rgba(255,255,255,0.5)" : "#f1f5f9",
                  color: isActive ? color : "#64748b",
                  borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 600,
                }}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {visibleGroups.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#bbb" }}>
          <Icon icon="mdi:store-off" width={40} style={{ display: "block", margin: "0 auto 10px" }} />
          <p style={{ margin: 0, fontSize: 14 }}>No {activeFilter} store sales</p>
        </div>
      ) : (
        visibleGroups.map((group) => {
          const isExpanded = expandedCard === group.group_id
          const statusColor = group.lines.some(l => l.discount_status === "returned") ? { bg: "#fffbeb", text: "#d97706", border: "#fcd34d", label: "Returned" }
            : group.status === "Confirmed" ? { bg: "#ecfdf5", text: "#10b981", border: "#a7f3d0", label: "Confirmed" }
            : group.status === "Rejected" ? { bg: "#fef2f2", text: "#ef4444", border: "#fecaca", label: "Rejected" }
            : group.lines.some(l => l.discount_status === "pending") ? { bg: "#eff6ff", text: "#0070f3", border: "#93c5fd", label: "In Review" }
            : { bg: "#fffbeb", text: "#f5a623", border: "#fed7aa", label: "Pending" }
          return (
          <div key={group.group_id} style={{
            background: "white", borderTop: `1px solid ${isExpanded ? "#bfdbfe" : "#e2e8f0"}`, borderRight: `1px solid ${isExpanded ? "#bfdbfe" : "#e2e8f0"}`, borderBottom: `1px solid ${isExpanded ? "#bfdbfe" : "#e2e8f0"}`, borderLeft: `3px solid ${statusColor.border}`, borderRadius: 12, marginBottom: 10,
            boxShadow: isExpanded ? "0 4px 12px rgba(0,0,0,0.08)" : "0 1px 3px rgba(0,0,0,0.04)", transition: "all 0.2s ease", cursor: "pointer"
          }}
            onClick={() => setExpandedCard(isExpanded ? null : group.group_id)}
          >
            {/* Summary row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: isMobile ? "14px 16px" : "16px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon icon="mdi:store" width={18} color="#f59e0b" />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: isMobile ? 15 : 14, color: "#0f172a" }}>{group.store_name}</p>
                    <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: statusColor.bg, color: statusColor.text, border: `1px solid ${statusColor.border}` }}>{statusColor.label}</span>
                  </div>
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{group.customer_name || "Walk-in"} &middot; {group.lines.length} item{group.lines.length !== 1 ? "s" : ""}</p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, paddingLeft: 8 }}>
                <p style={{ margin: 0, fontSize: 11, color: "#94a3b8" }}>
                  {formatDate(group.sold_at)}
                </p>
                <Icon icon="mdi:chevron-down" width={18} color="#94a3b8" style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
              </div>
            </div>

            {/* Expanded detail section */}
            {isExpanded && (
              <div style={{ padding: "0 20px 16px", borderTop: "1px solid #f1f5f9" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, color: "#64748b", display: "flex", alignItems: "center", gap: 4 }}>
                    <Icon icon="mdi:van-passenger" width={14} />
                    {DELIVERY_LABELS[group.delivery_mode] || group.delivery_mode}
                  </span>
                  {group.truck_plate && <span style={{ fontSize: 12, color: "#64748b" }}>Plate: {group.truck_plate}</span>}
                  <span style={{ fontSize: 12, color: "#64748b" }}>Payment: {PAYMENT_LABELS[group.payment_mode] || group.payment_mode}</span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
                  {group.lines.map((line) => (
                    <div key={line.sale_id} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "8px 12px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0"
                    }}>
                      <div>
                        <span style={{ fontWeight: 600, fontSize: 14, color: "#0f172a" }}>{line.product}</span>
                        <span style={{ fontSize: 13, color: "#64748b", marginLeft: 8 }}>&times; {line.quantity} bags</span>
                      </div>
                      {line.price_per_bag != null && (
                        <span style={{ fontSize: 13, color: "#475569", fontWeight: 500 }}>
                          ₦{line.price_per_bag.toLocaleString()}/bag
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {activeFilter === "returned" && group.denial_reason && (
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 12, padding: 10, background: "#fef2f2", borderRadius: 8, border: "1px solid #fecaca" }}>
                    <div style={{ background: "#ef4444", color: "white", padding: 3, borderRadius: "50%", flexShrink: 0, marginTop: 1 }}>
                      <Icon icon="mdi:close" width={12} height={12} />
                    </div>
                    <div>
                      <p style={{ margin: "0 0 4px 0", color: "#ef4444", fontSize: 12, fontWeight: 600 }}>Returned reason</p>
                      <div style={{ padding: "8px 10px", background: "white", borderRadius: 6, border: "1px solid #fecaca", color: "#7f1d1d", fontSize: 12, fontStyle: "italic" }}>
                        &ldquo;{group.denial_reason}&rdquo;
                      </div>
                    </div>
                  </div>
                )}

                {activeFilter === "rejected" && group.rejection_reason && (
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 12, padding: 10, background: "#fef2f2", borderRadius: 8, border: "1px solid #fecaca" }}>
                    <div style={{ background: "#ef4444", color: "white", padding: 3, borderRadius: "50%", flexShrink: 0, marginTop: 1 }}>
                      <Icon icon="mdi:close" width={12} height={12} />
                    </div>
                    <div>
                      <p style={{ margin: "0 0 4px 0", color: "#ef4444", fontSize: 12, fontWeight: 600 }}>Rejection reason</p>
                      <div style={{ padding: "8px 10px", background: "white", borderRadius: 6, border: "1px solid #fecaca", color: "#7f1d1d", fontSize: 12, fontStyle: "italic" }}>
                        &ldquo;{group.rejection_reason}&rdquo;
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, marginTop: 4 }} onClick={e => e.stopPropagation()}>
                  {activeFilter === "pending" && group.lines.some(l => l.discount_status === "pending") && (
                    <button disabled style={{ flex: 1, padding: "11px 0", background: "#f5f5f5", color: "#9ca3af", border: "1.5px solid #e5e7eb", borderRadius: 8, cursor: "not-allowed", fontWeight: "bold", fontSize: isMobile ? 14 : 13, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: 0.7 }}>
                      <Icon icon="mdi:clock-outline" width={16} /> Awaiting Review
                    </button>
                  )}
                  {activeFilter === "pending" && !group.lines.some(l => l.discount_status === "pending") && (
                    <>
                      <button onClick={() => openConfirmModal(group)} style={{ flex: 1, padding: "11px 0", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold", fontSize: isMobile ? 14 : 13, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                        <Icon icon="mdi:check-circle" width={16} /> Confirm
                      </button>
                      <button onClick={() => openRejectModal(group)} style={{ flex: 1, padding: "11px 0", background: "white", color: "#ef4444", border: "1.5px solid #ef4444", borderRadius: 8, cursor: "pointer", fontWeight: "bold", fontSize: isMobile ? 14 : 13, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                        <Icon icon="mdi:close-circle" width={16} /> Reject
                      </button>
                    </>
                  )}
                  {activeFilter === "returned" && (
                    <button onClick={() => openConfirmModal(group)} style={{ flex: 1, padding: "11px 0", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold", fontSize: isMobile ? 14 : 13, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                      <Icon icon="mdi:pencil" width={16} /> Edit Price
                    </button>
                  )}
                  {activeFilter === "confirmed" && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", background: "#ecfdf5", borderRadius: 7 }}><Icon icon="mdi:check-circle" width={16} color="#10b981" /><span style={{ fontSize: 13, color: "#10b981", fontWeight: 600 }}>Confirmed</span></div>}
                  {activeFilter === "rejected" && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", background: "#fef2f2", borderRadius: 7 }}><Icon icon="mdi:close-circle" width={16} color="#ef4444" /><span style={{ fontSize: 13, color: "#ef4444", fontWeight: 600 }}>Rejected</span></div>}
                </div>
              </div>
            )}
          </div>
          )
        })
      )}

      <BrokerConfirmModal
        isOpen={!!confirmingGroup}
        onClose={closeConfirmModal}
        brokerId={brokerId || ""}
        isMobile={isMobile}
        companyPriceMap={companyPriceMap}
        onConfirmed={() => { if (brokerId) fetchSales(brokerId) }}
        mode="sale"
        saleGroup={confirmingGroup!}
      />

      {rejectingGroup && (
        <div onClick={closeRejectModal} style={modalOverlay}>
          <div onClick={e => e.stopPropagation()} style={modalBox}>
            {isMobile && <div style={{ width: 40, height: 4, background: "#e0e0e0", borderRadius: 2, margin: "0 auto 20px" }} />}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon icon="mdi:close-circle" width={20} color="#ef4444" />
              </div>
              <h3 style={{ margin: 0, color: "#ef4444", fontSize: isMobile ? 18 : 16 }}>Reject Sale</h3>
            </div>
            <p style={{ color: "#888", fontSize: 13, marginBottom: 20 }}>
              {rejectingGroup.store_name} · {formatDate(rejectingGroup.sold_at)}
            </p>

            <div style={{ marginBottom: 24 }}>
              <label style={labelStyle}>Reason for Rejection *</label>
              <ModernInput
                as="textarea"
                placeholder="e.g. This sale was not authorized…"
                value={rejectReason}
                onChange={e => { setRejectReason(e.target.value); setMessage("") }}
                rows={4}
                style={{ ...inputStyle, resize: "none", minHeight: 110 }}
              />
            </div>

            {message && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#ef4444", marginBottom: 14, fontSize: 13 }}>
                <Icon icon="mdi:alert-circle" width={15} />{message}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={closeRejectModal} style={{
                flex: 1, padding: "13px 0", background: "white", border: "1.5px solid #e5e5e5",
                borderRadius: 10, cursor: "pointer", fontSize: 15, minHeight: 50, fontWeight: "bold"
              }}>
                Cancel
              </button>
              <button onClick={handleReject} disabled={submitting} style={{
                flex: 1, padding: "13px 0", background: submitting ? "#ccc" : "#ef4444",
                color: "white", border: "none", borderRadius: 10,
                cursor: submitting ? "not-allowed" : "pointer", fontSize: 15, minHeight: 50,
                fontWeight: "bold", display: "flex", alignItems: "center", justifyContent: "center", gap: 6
              }}>
                {submitting
                  ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} />Rejecting…</>
                  : <><Icon icon="mdi:close-circle" width={16} />Reject Sale</>
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
