"use client"

import { useState, useEffect, useCallback } from "react"
import { Icon } from "@iconify/react"
import { supabase } from "@/lib/supabase"
import { apiMutate } from "@/lib/api-mutation"
import { formatAmount, parseAmount } from "@/lib/formatAmount"
import ModernInput from "@/components/ModernInput"
import CustomerSelector from "@/components/CustomerSelector"
import { useBreakpoint } from "@/app/hooks/useBreakpoint"

type Customer = { customer_id: string; full_name: string; phone_number: string; isNew?: boolean }

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
  lines: SaleLine[]
}

export default function BrokerSaleConfirmations() {
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"

  const [brokerId, setBrokerId] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<"pending" | "confirmed" | "rejected">("pending")
  const [allGroups, setAllGroups] = useState<SaleGroup[]>([])
  const [loading, setLoading] = useState(true)

  const [confirmingGroup, setConfirmingGroup] = useState<SaleGroup | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [linePrices, setLinePrices] = useState<Record<string, string>>({})
  const [rejectingGroup, setRejectingGroup] = useState<SaleGroup | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [message, setMessage] = useState("")
  const [notification, setNotification] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [companyPriceMap, setCompanyPriceMap] = useState<Record<string, number>>({})

  useEffect(() => { initBroker() }, [])

  const initBroker = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.href = "/login"; return }
    setBrokerId(session.user.id)
    await Promise.all([
      fetchSales(session.user.id),
      fetchCompanyPrices(session.user.id),
    ])
    setLoading(false)
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { initBroker() }, [initBroker])

  async function fetchCompanyPrices(bId: string) {
    const { data, error } = await supabase
      .from("company_prices")
      .select("product_name, price_per_bag")
      .eq("broker_id", bId)
    if (!error && data) {
      const map: Record<string, number> = {}
      for (const row of data) map[row.product_name] = row.price_per_bag
      setCompanyPriceMap(map)
    }
  }

  async function fetchSales(bId: string) {
    const { data, error } = await supabase
      .from("store_sales")
      .select("sale_id, product, quantity, price_per_bag, total_amount, customer_name, payment_mode, delivery_mode, tricycle_id, truck_plate, sold_at, created_at, status, store_name, rejection_reason")
      .eq("broker_id", bId)
      .order("sold_at", { ascending: false })

    if (error) { console.error("Failed to fetch sales:", error); return }

    const groups = groupSales(data || [])
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
        lines: [sale],
      })

      return groups
    }, [])
  }

  function openConfirmModal(group: SaleGroup) {
    const prices: Record<string, string> = {}
    for (const line of group.lines) {
      const companyPrice = companyPriceMap[line.product]
      if (companyPrice) {
        prices[line.sale_id] = formatAmount(String(companyPrice))
      } else if (line.price_per_bag) {
        prices[line.sale_id] = formatAmount(String(line.price_per_bag))
      } else {
        prices[line.sale_id] = ""
      }
    }
    setConfirmingGroup(group)
    setSelectedCustomer(null)
    setLinePrices(prices)
    setMessage("")
  }

  function closeConfirmModal() {
    setConfirmingGroup(null)
    setSelectedCustomer(null)
    setLinePrices({})
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

  async function handleConfirm() {
    if (!confirmingGroup) return

    for (const line of confirmingGroup.lines) {
      if (!linePrices[line.sale_id]) {
        setMessage(`Enter price per bag for ${line.product}`)
        return
      }
    }

    setSubmitting(true)
    try {
      const customerName = selectedCustomer?.full_name || confirmingGroup.customer_name
      const confirmed: string[] = []
      const unconfirmed: string[] = []

      for (const line of confirmingGroup.lines) {
        const price = parseAmount(linePrices[line.sale_id])

        const updateData: Record<string, unknown> = {
          price_per_bag: price,
          status: "Confirmed",
        }
        if (customerName) updateData.customer_name = customerName

        const { data, error } = await apiMutate("finance", {
          action: "update",
          table: "store_sales",
          data: updateData,
          filters: { sale_id: line.sale_id, status: "Pending", broker_id: brokerId },
        })

        if (error || !data || (Array.isArray(data) && data.length === 0)) {
          unconfirmed.push(line.product)
        } else {
          confirmed.push(line.product)
        }
      }

      if (confirmed.length > 0) {
        closeConfirmModal()
        if (brokerId) fetchSales(brokerId)
        if (unconfirmed.length > 0) {
          setNotification(`Confirmed ${confirmed.join(", ")}, but could not confirm ${unconfirmed.join(", ")}`)
        }
      } else {
        setMessage(`Could not confirm: ${unconfirmed.join(", ")}`)
        setSubmitting(false)
        return
      }
    } catch {
      setMessage("Failed to confirm sale. Please try again.")
    } finally {
      setSubmitting(false)
    }
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

  const pendingGroups = allGroups.filter(g => g.status === "Pending")
  const confirmedGroups = allGroups.filter(g => g.status === "Confirmed")
  const rejectedGroups = allGroups.filter(g => g.status === "Rejected")

  const visibleGroups = activeFilter === "pending" ? pendingGroups
    : activeFilter === "confirmed" ? confirmedGroups
    : rejectedGroups

  const filterOptions = [
    { key: "pending" as const, label: "Pending", count: pendingGroups.length, color: "#f5a623" },
    { key: "confirmed" as const, label: "Confirmed", count: confirmedGroups.length, color: "#10b981" },
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
        visibleGroups.map((group) => (
          <div key={group.group_id} style={{
            background: "white", border: "1px solid #eee", borderRadius: 12,
            padding: isMobile ? "14px 16px" : "16px 20px", marginBottom: 10,
            boxShadow: "0 1px 4px rgba(0,0,0,0.05)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon icon="mdi:store" width={18} color="#f59e0b" />
                </div>
                <div>
                  <p style={{ margin: 0, fontWeight: "bold", fontSize: isMobile ? 15 : 14, color: "#171717" }}>
                    {group.store_name}
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: "#888" }}>
                    {group.customer_name || "Walk-in"} · {PAYMENT_LABELS[group.payment_mode] || group.payment_mode}
                  </p>
                </div>
              </div>
              <p style={{ margin: 0, fontSize: 11, color: "#aaa", flexShrink: 0, paddingLeft: 8 }}>
                {formatDate(group.sold_at)}
              </p>
            </div>

            <div style={{ padding: "10px 12px", background: "#f9f9f9", borderRadius: 8, marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: "#888" }}>
                  <Icon icon="mdi:van-passenger" width={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
                  {DELIVERY_LABELS[group.delivery_mode] || group.delivery_mode}
                </span>
                {group.truck_plate && <span style={{ fontSize: 12, color: "#888" }}>· {group.truck_plate}</span>}
              </div>
              {group.lines.map((line) => (
                <div key={line.sale_id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "4px 0", borderBottom: "1px solid #eee"
                }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 14, color: "#171717" }}>{line.product}</span>
                    <span style={{ fontSize: 13, color: "#555", marginLeft: 8 }}>× {line.quantity}</span>
                  </div>
                  {line.price_per_bag && (
                    <span style={{ fontSize: 13, color: "#555" }}>
                      ₦{formatAmount(String(line.price_per_bag))}/bag
                    </span>
                  )}
                </div>
              ))}
            </div>

            {activeFilter === "pending" && (
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => openConfirmModal(group)} style={{
                  flex: 1, padding: "11px 0", background: "#0070f3", color: "white",
                  border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold",
                  fontSize: isMobile ? 14 : 13, minHeight: 44,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6
                }}>
                  <Icon icon="mdi:check-circle" width={16} />
                  Confirm
                </button>
                <button onClick={() => openRejectModal(group)} style={{
                  flex: 1, padding: "11px 0", background: "white", color: "#ef4444",
                  border: "1.5px solid #ef4444", borderRadius: 8, cursor: "pointer",
                  fontWeight: "bold", fontSize: isMobile ? 14 : 13, minHeight: 44,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6
                }}>
                  <Icon icon="mdi:close-circle" width={16} />
                  Reject
                </button>
              </div>
            )}
            {activeFilter === "confirmed" && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", background: "#ecfdf5", borderRadius: 7 }}>
                <Icon icon="mdi:check-circle" width={16} color="#10b981" />
                <span style={{ fontSize: 13, color: "#10b981", fontWeight: "600" }}>Confirmed</span>
              </div>
            )}
            {activeFilter === "rejected" && (
              <div style={{ width: "100%" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", background: "#fef2f2", borderRadius: 7 }}>
                  <Icon icon="mdi:close-circle" width={16} color="#ef4444" />
                  <span style={{ fontSize: 13, color: "#ef4444", fontWeight: "600" }}>Rejected</span>
                </div>
                {group.rejection_reason && (
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 8, padding: 10, background: "#fef2f2", borderRadius: 8, border: "1px solid #fecaca" }}>
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
              </div>
            )}
          </div>
        ))
      )}

      {confirmingGroup && (
        <div onClick={closeConfirmModal} style={modalOverlay}>
          <div onClick={e => e.stopPropagation()} style={modalBox}>
            {isMobile && <div style={{ width: 40, height: 4, background: "#e0e0e0", borderRadius: 2, margin: "0 auto 20px" }} />}
            <h3 style={{ margin: "0 0 4px", color: "#171717", fontSize: isMobile ? 18 : 16 }}>Confirm Sale</h3>
            <p style={{ color: "#888", fontSize: 13, marginBottom: 20 }}>
              {confirmingGroup.store_name} · {formatDate(confirmingGroup.sold_at)}
            </p>

            <div style={{ padding: "12px 14px", background: "#f9f9f9", borderRadius: 10, marginBottom: 20 }}>
              <p style={{ margin: "0 0 8px", fontSize: 12, color: "#888" }}>
                {PAYMENT_LABELS[confirmingGroup.payment_mode] || confirmingGroup.payment_mode} · {DELIVERY_LABELS[confirmingGroup.delivery_mode] || confirmingGroup.delivery_mode}
              </p>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Customer (correct if needed)</label>
              <CustomerSelector
                key={confirmingGroup.group_id}
                onSelect={(c) => setSelectedCustomer(c)}
                initialValue={confirmingGroup.customer_name ?? ""}
              />
            </div>

            {confirmingGroup.lines.map((line) => {
              const companyPrice = companyPriceMap[line.product]
              const enteredPrice = parseAmount(linePrices[line.sale_id])
              const showDiscount = companyPrice && enteredPrice && enteredPrice !== companyPrice
              return (
                <div key={line.sale_id} style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>
                    {line.product} × {line.quantity} — Price Per Bag (₦) *
                  </label>
                  {companyPrice && (
                    <div style={{ padding: "8px 10px", background: "#f0f7ff", borderRadius: 7, marginBottom: 6, fontSize: 12, color: "#0070f3", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                      <Icon icon="mdi:information-outline" width={14} />
                      Company price: {formatAmount(String(companyPrice))}
                    </div>
                  )}
                  <ModernInput
                    type="text" inputMode="numeric"
                    placeholder={companyPrice ? formatAmount(String(companyPrice)) : "e.g. 10,500"}
                    value={linePrices[line.sale_id] || ""}
                    onChange={(e) => {
                      setLinePrices(prev => ({ ...prev, [line.sale_id]: formatAmount(e.target.value) }))
                      setMessage("")
                    }}
                    style={inputStyle}
                  />
                  {showDiscount && (
                    <div style={{ marginTop: 6, padding: "6px 10px", background: enteredPrice! < companyPrice ? "#fef9c3" : "#ecfdf5", borderRadius: 6, fontSize: 12, color: enteredPrice! < companyPrice ? "#854d0e" : "#166534", display: "flex", alignItems: "center", gap: 6 }}>
                      <Icon icon={enteredPrice! < companyPrice ? "mdi:tag-outline" : "mdi:tag-arrow-up-outline"} width={14} />
                      {enteredPrice! < companyPrice ? "Discount" : "Sale price"}: {formatAmount(String(enteredPrice))} vs {formatAmount(String(companyPrice))}
                    </div>
                  )}
                </div>
              )
            })}

            {message && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#ef4444", marginBottom: 14, fontSize: 13 }}>
                <Icon icon="mdi:alert-circle" width={15} />{message}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={closeConfirmModal} style={{
                flex: 1, padding: "13px 0", background: "white", border: "1.5px solid #e5e5e5",
                borderRadius: 10, cursor: "pointer", fontSize: 15, minHeight: 50, fontWeight: "bold"
              }}>
                Cancel
              </button>
              <button onClick={handleConfirm} disabled={submitting} style={{
                flex: 1, padding: "13px 0", background: submitting ? "#ccc" : "#0070f3",
                color: "white", border: "none", borderRadius: 10,
                cursor: submitting ? "not-allowed" : "pointer", fontSize: 15, minHeight: 50,
                fontWeight: "bold", display: "flex", alignItems: "center", justifyContent: "center", gap: 6
              }}>
                {submitting
                  ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} />Confirming…</>
                  : <><Icon icon="mdi:check-circle" width={16} />Confirm Sale</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

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
