"use client"

import { useState, useEffect } from "react"
import { Icon } from "@iconify/react"
import { supabase } from "@/lib/supabase"
import { apiMutate } from "@/lib/api-mutation"
import { formatAmount, parseAmount } from "@/lib/formatAmount"
import ModernInput from "@/components/ModernInput"
import CustomerSelector from "@/components/CustomerSelector"

const AREAS = ["Calabar to Obubra", "Ikom to Obudu", "Akwa-Ibom", "East"]

type Customer = { customer_id: string; full_name: string; phone_number: string }

type Stop = {
  stop_id: string
  trip_id: string
  customer_id: string | null
  customer_name: string
  customer_phone: string | null
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
  discount_status: string | null
}

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

type Props = {
  isOpen: boolean
  onClose: () => void
  brokerId: string
  isMobile: boolean
  companyPriceMap: Record<string, Record<string, number>>
  onConfirmed: () => void
} & (
  | { mode: "stop"; stop: Stop }
  | { mode: "sale"; saleGroup: SaleGroup }
)

const PAYMENT_LABELS: Record<string, string> = { Cash: "Cash", Transfer: "Transfer", POS: "POS", Broker: "Broker" }
const DELIVERY_LABELS: Record<string, string> = { self: "Self", tricycle: "Tricycle", truck: "Truck" }

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })
}

export default function BrokerConfirmModal({ isOpen, onClose, brokerId, isMobile, companyPriceMap, onConfirmed, ...rest }: Props) {
  const isStop = rest.mode === "stop"
  const stop = isStop ? rest.stop : null
  const saleGroup = !isStop ? rest.saleGroup : null

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(() =>
    stop?.customer_id
      ? { customer_id: stop.customer_id, full_name: stop.customer_name, phone_number: stop.customer_phone || "" }
      : saleGroup?.customer_name
        ? { customer_id: "", full_name: saleGroup.customer_name, phone_number: "" }
        : null
  )
  const [selectedArea, setSelectedArea] = useState("")
  const [pricePerBag, setPricePerBag] = useState("")
  const [companyPrice, setCompanyPrice] = useState(0)
  const [soldAtDifferentPrice, setSoldAtDifferentPrice] = useState(false)
  const [discount, setDiscount] = useState("")
  const [salePrice, setSalePrice] = useState("")
  const [linePrices, setLinePrices] = useState<Record<string, string>>(() => {
    if (!saleGroup) return {}
    const prices: Record<string, string> = {}
    for (const line of saleGroup.lines) {
      prices[line.sale_id] = line.price_per_bag ? formatAmount(String(line.price_per_bag)) : ""
    }
    return prices
  })
  const [discounts, setDiscounts] = useState<Record<string, string>>({})
  const [salePrices, setSalePrices] = useState<Record<string, string>>({})
  const [priceReason, setPriceReason] = useState("")
  const [saleType, setSaleType] = useState<"cash" | "credit" | "">("")
  const [selectedCreditManagerId, setSelectedCreditManagerId] = useState("")
  const [creditManagersList, setCreditManagersList] = useState<{ manager_id: string; full_name: string }[]>([])
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    let active = true
    supabase.from("credit_managers").select("manager_id, full_name").order("full_name").then(({ data }) => {
      if (active && data) setCreditManagersList(data)
    })
    return () => { active = false }
  }, [isOpen])

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: isMobile ? "14px 12px" : "11px 12px",
    boxSizing: "border-box", borderRadius: 8, border: "1.5px solid #e5e5e5",
    fontSize: isMobile ? 16 : 14, background: "white", color: "#171717",
    minHeight: isMobile ? 48 : 42,
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
    background: "white", borderRadius: isMobile ? "20px 20px 0 0" : 14,
    padding: isMobile ? "24px 20px 40px" : 32,
    width: isMobile ? "100%" : 480,
    maxHeight: isMobile ? "92vh" : "88vh",
    overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
  }

  function handleAreaChange(area: string) {
    setSelectedArea(area)
    setSoldAtDifferentPrice(false)
    setDiscount("")
    setSalePrice("")
    setPriceReason("")
    setMessage("")

    if (isStop && stop) {
      const cp = companyPriceMap[area]?.[stop.product] ?? 0
      setCompanyPrice(cp)
      setPricePerBag(cp > 0 ? formatAmount(cp.toString()) : "")
    } else if (saleGroup) {
      const prices: Record<string, string> = {}
      for (const line of saleGroup.lines) {
        const cp = companyPriceMap[area]?.[line.product]
        if (cp) {
          prices[line.sale_id] = formatAmount(String(cp))
        } else if (line.price_per_bag) {
          prices[line.sale_id] = formatAmount(String(line.price_per_bag))
        } else {
          prices[line.sale_id] = ""
        }
      }
      setLinePrices(prices)
    }
  }

  function handleToggleDifferentPrice(checked: boolean) {
    setSoldAtDifferentPrice(checked)
    if (!checked) {
      setDiscount("")
      setSalePrice("")
      setDiscounts({})
      setSalePrices({})
      setPriceReason("")
      if (isStop) {
        setPricePerBag(formatAmount(companyPrice.toString()))
      } else if (saleGroup) {
        const prices: Record<string, string> = {}
        for (const line of saleGroup.lines) {
          const cp = companyPriceMap[selectedArea]?.[line.product]
          prices[line.sale_id] = cp ? formatAmount(String(cp)) : (line.price_per_bag ? formatAmount(String(line.price_per_bag)) : "")
        }
        setLinePrices(prices)
      }
    } else {
      setDiscount("0")
      if (isStop) {
        setSalePrice(formatAmount(companyPrice.toString()))
        setPricePerBag(formatAmount(companyPrice.toString()))
      } else if (saleGroup) {
        const prices: Record<string, string> = {}
        for (const line of saleGroup.lines) {
          const cp = companyPriceMap[selectedArea]?.[line.product] ?? 0
          prices[line.sale_id] = formatAmount(String(cp))
        }
        setLinePrices(prices)
        setSalePrice(formatAmount(companyPrice.toString()))
      }
    }
  }

  function handleDiscountChange(raw: string) {
    const digits = raw.replace(/[^0-9]/g, "")
    if (digits === "") {
      setDiscount(""); setSalePrice(""); setPricePerBag(formatAmount(companyPrice.toString())); return
    }
    const discountVal = parseInt(digits)
    const saleAmount = Math.max(0, companyPrice - discountVal)
    setDiscount(formatAmount(discountVal.toString()))
    setSalePrice(formatAmount(saleAmount.toString()))
    setPricePerBag(formatAmount(saleAmount.toString()))
    setMessage("")
  }

  function handleSalePriceChange(raw: string) {
    const digits = raw.replace(/[^0-9]/g, "")
    if (digits === "") {
      setSalePrice(""); setDiscount(""); setPricePerBag(formatAmount(companyPrice.toString())); return
    }
    const saleVal = parseInt(digits)
    const discountAmount = Math.max(0, companyPrice - saleVal)
    setSalePrice(formatAmount(saleVal.toString()))
    setDiscount(formatAmount(discountAmount.toString()))
    setPricePerBag(formatAmount(saleVal.toString()))
    setMessage("")
  }

  const finalPrice = parseAmount(pricePerBag)
  const showPriceReason = soldAtDifferentPrice && companyPrice > 0 && finalPrice > 0 && finalPrice !== companyPrice

  const hasPriceDiff = soldAtDifferentPrice && (
    isStop
      ? (companyPrice > 0 && finalPrice > 0 && finalPrice !== companyPrice)
      : (saleGroup?.lines.some(line => {
          const cp = companyPriceMap[selectedArea]?.[line.product]
          const ep = parseAmount(linePrices[line.sale_id] ?? "")
          return !!cp && ep > 0 && ep !== cp
        }) ?? false)
  )

  async function handleConfirm() {
    if (isStop && stop) {
      if (!selectedArea) { setMessage("Select an area"); return }
      if (!saleType) { setMessage("Select a sale type"); return }
      if (!selectedCustomer) { setMessage("Customer is required"); return }
      if (!pricePerBag) { setMessage("Price per bag required"); return }
      if (showPriceReason && !priceReason.trim()) { setMessage("Provide a reason for using a different price"); return }
      if (saleType === "credit" && !selectedCreditManagerId) { setMessage("Select a credit manager"); return }
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      setSubmitting(true)
      try {
        const customerIdToSave = selectedCustomer?.customer_id ?? stop.customer_id
        const finalPriceVal = parseAmount(pricePerBag)
        const cp = companyPriceMap[selectedArea]?.[stop.product] ?? 0
        const hasDiff = showPriceReason && finalPriceVal !== cp && cp > 0 && finalPriceVal > 0
        const isReturned = stop.discount_status === "returned"
        const creditApprovalId = saleType === "credit" ? crypto.randomUUID() : null

        const subActions: Array<{
          action: "insert" | "update" | "upsert" | "delete"
          table: string
          data?: Record<string, unknown>
          filters?: Record<string, unknown>
          conflict?: string
        }> = []

        if (saleType === "credit") {
          subActions.push({
            action: "insert",
            table: "credit_approvals",
            data: {
              id: creditApprovalId!,
              source_type: "stop",
              source_id: stop.stop_id,
              broker_id: brokerId,
              credit_manager_id: selectedCreditManagerId,
              area: selectedArea,
              product: stop.product,
              quantity: stop.quantity_offloaded,
              company_price: cp,
              adjusted_price: hasDiff ? finalPriceVal : null,
              status: "Pending",
            },
          })
        }

        const stopUpdate: Record<string, unknown> = {
          customer_id: customerIdToSave,
          updated_by: user.id,
          confirmed: !(saleType === "credit" || hasDiff),
        }
        if (saleType === "credit") {
          stopUpdate.on_credit = true
          stopUpdate.credit_approval_id = creditApprovalId
        }
        if (hasDiff || isReturned) {
          stopUpdate.discount_status = "pending"
        }

        subActions.push({
          action: "update",
          table: "Stops",
          data: stopUpdate,
          filters: { stop_id: stop.stop_id },
        })

        subActions.push({
          action: "insert",
          table: "Stop_Confirmations",
          data: {
            stop_id: stop.stop_id,
            broker_id: brokerId,
            customer_id: customerIdToSave,
            price_per_bag: finalPriceVal,
            area: selectedArea,
            company_price: cp,
            price_reason: hasDiff ? priceReason.trim() : null,
          },
        })

        if (hasDiff) {
          subActions.push({
            action: "upsert",
            table: "price_adjustments",
            conflict: "source_type,source_id",
            data: {
              source_type: "stop",
              source_id: stop.stop_id,
              broker_id: brokerId,
              area: selectedArea,
              product: stop.product,
              company_price: cp,
              adjusted_price: finalPriceVal,
              price_reason: priceReason.trim(),
              status: "Pending",
              credit_status: saleType === "credit" ? "pending" : "none",
            },
          })
        }

        const { error } = await apiMutate("trips", {
          action: "transaction",
          sub_actions: subActions,
        })
        if (error) { setMessage("Failed to submit. Please try again."); return }

        onConfirmed()
        onClose()
      } catch {
        setMessage("Failed to submit. Please try again.")
      } finally {
        setSubmitting(false)
      }
    } else if (saleGroup) {
      if (!selectedArea) { setMessage("Select an area"); return }
      if (!saleType) { setMessage("Select a sale type"); return }
      if (!selectedCustomer) { setMessage("Customer is required"); return }
      if (saleType === "credit" && !selectedCreditManagerId) { setMessage("Select a credit manager"); return }

      for (const line of saleGroup.lines) {
        if (!linePrices[line.sale_id]) {
          setMessage(`Enter price per bag for ${line.product}`)
          return
        }
      }

      if (hasPriceDiff && !priceReason.trim()) {
        setMessage("Provide a reason for using a different price")
        return
      }

      setSubmitting(true)
      try {
        const customerName = selectedCustomer.full_name
        const confirmed: string[] = []
        const unconfirmed: string[] = []
        const groupId = crypto.randomUUID()

        for (const line of saleGroup.lines) {
          const price = parseAmount(linePrices[line.sale_id] ?? "")
          const cp = companyPriceMap[selectedArea]?.[line.product] ?? 0
          const lineHasDiff = cp > 0 && price > 0 && price !== cp
          const approvalId = saleType === "credit" ? crypto.randomUUID() : null

          const subActions: Array<{
            action: "insert" | "update" | "upsert" | "delete"
            table: string
            data?: Record<string, unknown>
            filters?: Record<string, unknown>
            conflict?: string
          }> = []

          if (saleType === "credit" && approvalId) {
            subActions.push({
              action: "insert",
              table: "credit_approvals",
              data: {
                id: approvalId,
                source_type: "store_sale",
                source_id: line.sale_id,
                broker_id: brokerId,
                credit_manager_id: selectedCreditManagerId,
                area: selectedArea,
                product: line.product,
                quantity: line.quantity,
                company_price: cp,
                adjusted_price: lineHasDiff ? price : null,
                status: "Pending",
              },
            })
          }

          const updateData: Record<string, unknown> = {
            price_per_bag: price,
            area: selectedArea,
            company_price: cp,
            price_reason: lineHasDiff ? priceReason.trim() : null,
            group_id: groupId,
          }
          if (customerName) updateData.customer_name = customerName

          if (saleType === "credit") {
            updateData.status = "Pending"
            updateData.on_credit = true
            if (approvalId) updateData.credit_approval_id = approvalId
            if (lineHasDiff) updateData.discount_status = "pending"
          } else if (hasPriceDiff) {
            updateData.status = lineHasDiff ? "Pending" : "Confirmed"
            if (lineHasDiff) updateData.discount_status = "pending"
          } else {
            updateData.status = "Confirmed"
            if (line.discount_status === "returned") updateData.discount_status = "pending"
          }

          const isReturnedLine = line.discount_status === "returned"
          subActions.push({
            action: "update",
            table: "store_sales",
            data: updateData,
            filters: isReturnedLine
              ? { sale_id: line.sale_id, broker_id: brokerId }
              : { sale_id: line.sale_id, status: "Pending", broker_id: brokerId },
          })

          if (lineHasDiff) {
            subActions.push({
              action: "upsert",
              table: "price_adjustments",
              conflict: "source_type,source_id",
              data: {
                source_type: "store_sale",
                source_id: line.sale_id,
                broker_id: brokerId,
                area: selectedArea,
                product: line.product,
                company_price: cp,
                adjusted_price: price,
                price_reason: priceReason.trim(),
                status: "Pending",
                group_id: groupId,
                credit_status: saleType === "credit" ? "pending" : "none",
              },
            })
          }

          const { data, error } = await apiMutate("finance", {
            action: "transaction",
            sub_actions: subActions,
          })

          const saleUpdateIndex = subActions.findIndex(sa => sa.table === "store_sales")
          const saleUpdateRows = Array.isArray(data) ? data[saleUpdateIndex] : null
          if (error || !Array.isArray(saleUpdateRows) || saleUpdateRows.length === 0) {
            unconfirmed.push(line.product)
          } else {
            confirmed.push(line.product)
          }
        }

        if (confirmed.length > 0) {
          onConfirmed()
          onClose()
          if (unconfirmed.length > 0) {
            setMessage(`Submitted ${confirmed.join(", ")}, but failed for ${unconfirmed.join(", ")}`)
          }
        } else {
          setMessage(`Could not submit: ${unconfirmed.join(", ")}`)
          setSubmitting(false)
          return
        }
      } catch {
        setMessage("Failed to submit. Please try again.")
      } finally {
        setSubmitting(false)
      }
    }
  }

  if (!isOpen) return null

  return (
    <div onClick={onClose} style={modalOverlay}>
      <div onClick={e => e.stopPropagation()} style={modalBox}>
        {isMobile && <div style={{ width: 40, height: 4, background: "#e0e0e0", borderRadius: 2, margin: "0 auto 20px" }} />}

        <h3 style={{ margin: "0 0 4px", color: "#171717", fontSize: isMobile ? 18 : 16 }}>
          {isStop ? "Confirm Stop" : "Confirm Sale"}
        </h3>
        <p style={{ color: "#888", fontSize: 13, marginBottom: 20 }}>
          {isStop
            ? `${stop!.plate_number} · ${stop!.stop_location}`
            : `${saleGroup!.store_name} · ${formatDate(saleGroup!.sold_at)}`
          }
        </p>

        {isStop ? (
          <div style={{ padding: "12px 14px", background: "#f9f9f9", borderRadius: 10, marginBottom: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div><p style={{ margin: 0, fontSize: 11, color: "#aaa" }}>Bags</p><p style={{ margin: "2px 0 0", fontWeight: "bold", fontSize: 16, color: "#171717" }}>{stop!.quantity_offloaded}</p></div>
              <div><p style={{ margin: 0, fontSize: 11, color: "#aaa" }}>Loading Point</p><p style={{ margin: "2px 0 0", fontSize: 13, color: "#171717" }}>{stop!.material_centre}</p></div>
              {stop!.order_no ? (
                <>
                  <div><p style={{ margin: 0, fontSize: 11, color: "#aaa" }}>Order No</p><p style={{ margin: "2px 0 0", fontSize: 13, color: "#171717" }}>{stop!.order_no}</p></div>
                  {stop!.child_order_no && <div><p style={{ margin: 0, fontSize: 11, color: "#aaa" }}>Child Order</p><p style={{ margin: "2px 0 0", fontSize: 13, color: "#171717" }}>{stop!.child_order_no}</p></div>}
                </>
              ) : stop!.atc ? (
                <div><p style={{ margin: 0, fontSize: 11, color: "#aaa" }}>ATC</p><p style={{ margin: "2px 0 0", fontSize: 13, color: "#171717" }}>{stop!.atc}</p></div>
              ) : null}
              <div><p style={{ margin: 0, fontSize: 11, color: "#aaa" }}>Driver&apos;s Customer</p><p style={{ margin: "2px 0 0", fontSize: 13, color: "#171717" }}>{stop!.customer_name}{stop!.customer_phone ? ` (${stop!.customer_phone})` : ""}</p></div>
            </div>
          </div>
        ) : (
          <div style={{ padding: "12px 14px", background: "#f9f9f9", borderRadius: 10, marginBottom: 20 }}>
            <p style={{ margin: "0 0 8px", fontSize: 12, color: "#888" }}>
              {PAYMENT_LABELS[saleGroup!.payment_mode] || saleGroup!.payment_mode} · {DELIVERY_LABELS[saleGroup!.delivery_mode] || saleGroup!.delivery_mode}
            </p>
            {saleGroup!.lines.map((line) => (
              <div key={line.sale_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: "1px solid #eee" }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 14, color: "#171717" }}>{line.product}</span>
                  <span style={{ fontSize: 13, color: "#555", marginLeft: 8 }}>× {line.quantity}</span>
                </div>
                {line.price_per_bag && <span style={{ fontSize: 13, color: "#555" }}>₦{formatAmount(String(line.price_per_bag))}/bag</span>}
              </div>
            ))}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Area *</label>
          <select
            value={selectedArea}
            onChange={e => handleAreaChange(e.target.value)}
            style={{ ...inputStyle, appearance: "none", WebkitAppearance: "none", cursor: "pointer" }}
          >
            <option value="">Select area</option>
            {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Customer *</label>
          <CustomerSelector
            key={isStop ? stop!.stop_id : saleGroup!.group_id}
            onSelect={(c: Customer) => setSelectedCustomer(c)}
            initialValue={isStop
              ? (selectedCustomer?.full_name || (stop!.customer_name !== "Not provided" ? stop!.customer_name : ""))
              : (saleGroup!.customer_name ?? "")
            }
          />
        </div>

        {isStop ? (
          selectedArea && companyPrice > 0 && (
            <>
              <div style={{ marginBottom: 12, padding: "8px 12px", background: "#f0f7ff", borderRadius: 8, border: "1px solid #bfdbfe", display: "flex", alignItems: "center", gap: 8 }}>
                <Icon icon="mdi:information" width={16} color="#0070f3" />
                <span style={{ fontSize: 13, color: "#0c4a6e" }}>Company price: <strong>₦{companyPrice.toLocaleString()}</strong>/bag</span>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Price Per Bag (₦) *</label>
                <ModernInput
                  type="text" inputMode="numeric"
                  value={formatAmount(pricePerBag)}
                  readOnly
                  style={{ ...inputStyle, background: "#f8fafc", color: "#374151", cursor: "not-allowed" }}
                />
              </div>

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

              {soldAtDifferentPrice && companyPrice > 0 && finalPrice > 0 && finalPrice !== companyPrice && (
                <div style={{ marginBottom: 16, padding: "6px 10px", background: finalPrice < companyPrice ? "#fef9c3" : "#ecfdf5", borderRadius: 6, fontSize: 12, color: finalPrice < companyPrice ? "#854d0e" : "#166534", display: "flex", alignItems: "center", gap: 6 }}>
                  <Icon icon={finalPrice < companyPrice ? "mdi:tag-outline" : "mdi:tag-arrow-up-outline"} width={14} />
                  {finalPrice < companyPrice ? "Discount" : "Sale price"}: {formatAmount(pricePerBag)} vs ₦{companyPrice.toLocaleString()}
                </div>
              )}
            </>
          )
        ) : (
          <>
            {saleGroup?.lines.map((line) => {
              const cp = companyPriceMap[selectedArea]?.[line.product]
              return (
                <div key={line.sale_id} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: "#171717" }}>{line.product}</span>
                    <span style={{ fontSize: 13, color: "#555" }}>× {line.quantity}</span>
                  </div>
                  {cp && (
                    <div style={{ padding: "8px 10px", background: "#f0f7ff", borderRadius: 7, marginBottom: 6, fontSize: 12, color: "#0070f3", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                      <Icon icon="mdi:information-outline" width={14} />
                      Company price: ₦{cp.toLocaleString()}/bag
                    </div>
                  )}
                  <div style={{ marginBottom: 8 }}>
                    <label style={labelStyle}>Price Per Bag (₦) *</label>
                    <ModernInput
                      type="text" inputMode="numeric"
                      value={formatAmount(linePrices[line.sale_id] ?? "")}
                      readOnly
                      style={{ ...inputStyle, background: "#f8fafc", color: "#374151", cursor: "not-allowed" }}
                    />
                  </div>
                </div>
              )
            })}

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontWeight: 500, fontSize: 13, color: "#444" }}>
                <input type="checkbox" checked={soldAtDifferentPrice} onChange={e => handleToggleDifferentPrice(e.target.checked)} style={{ width: 16, height: 16, cursor: "pointer" }} />
                Sold at a different price?
              </label>
            </div>

            {soldAtDifferentPrice && saleGroup?.lines.map((line) => {
              const cp = companyPriceMap[selectedArea]?.[line.product]
              const ep = parseAmount(linePrices[line.sale_id] ?? "")
              const showBadge = cp && ep && ep !== cp
              return (
                <div key={`price-${line.sale_id}`} style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>{line.product} — Discount (₦)</label>
                      <ModernInput
                        type="text" inputMode="numeric" placeholder="0"
                        value={discounts[line.sale_id] || ""}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^0-9]/g, "")
                          const cpVal = cp ?? 0
                          if (raw === "") {
                            setDiscounts(prev => ({ ...prev, [line.sale_id]: "" }))
                            setSalePrices(prev => ({ ...prev, [line.sale_id]: "" }))
                            setLinePrices(prev => ({ ...prev, [line.sale_id]: formatAmount(String(cpVal)) }))
                          } else {
                            const discountVal = parseInt(raw)
                            const saleAmount = Math.max(0, cpVal - discountVal)
                            setDiscounts(prev => ({ ...prev, [line.sale_id]: formatAmount(String(discountVal)) }))
                            setSalePrices(prev => ({ ...prev, [line.sale_id]: formatAmount(String(saleAmount)) }))
                            setLinePrices(prev => ({ ...prev, [line.sale_id]: formatAmount(String(saleAmount)) }))
                          }
                          setMessage("")
                        }}
                        style={inputStyle}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>{line.product} — Sale Price (₦)</label>
                      <ModernInput
                        type="text" inputMode="numeric" placeholder="Sale price"
                        value={salePrices[line.sale_id] || ""}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^0-9]/g, "")
                          const cpVal = cp ?? 0
                          if (raw === "") {
                            setSalePrices(prev => ({ ...prev, [line.sale_id]: "" }))
                            setDiscounts(prev => ({ ...prev, [line.sale_id]: "" }))
                            setLinePrices(prev => ({ ...prev, [line.sale_id]: formatAmount(String(cpVal)) }))
                          } else {
                            const saleVal = parseInt(raw)
                            const discountAmount = Math.max(0, cpVal - saleVal)
                            setSalePrices(prev => ({ ...prev, [line.sale_id]: formatAmount(String(saleVal)) }))
                            setDiscounts(prev => ({ ...prev, [line.sale_id]: formatAmount(String(discountAmount)) }))
                            setLinePrices(prev => ({ ...prev, [line.sale_id]: formatAmount(String(saleVal)) }))
                          }
                          setMessage("")
                        }}
                        style={inputStyle}
                      />
                    </div>
                  </div>
                  {showBadge && (
                    <div style={{ marginTop: 6, padding: "6px 10px", background: ep < cp ? "#fef9c3" : "#ecfdf5", borderRadius: 6, fontSize: 12, color: ep < cp ? "#854d0e" : "#166534", display: "flex", alignItems: "center", gap: 6 }}>
                      <Icon icon={ep < cp ? "mdi:tag-outline" : "mdi:tag-arrow-up-outline"} width={14} />
                      {ep < cp ? "Discount" : "Sale price"}: ₦{ep.toLocaleString()} vs ₦{cp.toLocaleString()}
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}

        {hasPriceDiff && (
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Reason for price change *</label>
            <ModernInput
              as="textarea"
              placeholder="e.g. Bulk discount for regular customer…"
              value={priceReason}
              onChange={e => { setPriceReason(e.target.value); setMessage("") }}
              rows={3}
              style={{ ...inputStyle, resize: "none", minHeight: 80 }}
            />
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Sale Type *</label>
          <select
            value={saleType}
            onChange={e => { setSaleType(e.target.value as "cash" | "credit" | ""); setSelectedCreditManagerId(""); setMessage("") }}
            style={{ ...inputStyle, appearance: "none", WebkitAppearance: "none", cursor: "pointer" }}
          >
            <option value="">Select sale type</option>
            <option value="cash">Cash</option>
            <option value="credit">Credit</option>
          </select>
        </div>

        {saleType === "credit" && (
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Credit Manager *</label>
            <select
              value={selectedCreditManagerId}
              onChange={e => { setSelectedCreditManagerId(e.target.value); setMessage("") }}
              style={{ ...inputStyle, appearance: "none", WebkitAppearance: "none", cursor: "pointer" }}
            >
              <option value="">Select credit manager</option>
              {creditManagersList.map(cm => (
                <option key={cm.manager_id} value={cm.manager_id}>{cm.full_name}</option>
              ))}
            </select>
            {creditManagersList.length === 0 && (
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#94a3b8" }}>No credit managers available</p>
            )}
          </div>
        )}

        {message && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#ef4444", marginBottom: 14, fontSize: 13 }}>
            <Icon icon="mdi:alert-circle" width={15} />{message}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "13px 0", background: "white", border: "1.5px solid #e5e5e5", borderRadius: 10, cursor: "pointer", fontSize: 15, minHeight: 50, fontWeight: "bold" }}>Cancel</button>
          <button onClick={handleConfirm} disabled={submitting} style={{ flex: 1, padding: "13px 0", background: submitting ? "#ccc" : "#0070f3", color: "white", border: "none", borderRadius: 10, cursor: submitting ? "not-allowed" : "pointer", fontSize: 15, minHeight: 50, fontWeight: "bold", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            {submitting
              ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} />Confirming…</>
              : <><Icon icon="mdi:check-circle" width={16} />{isStop ? "Confirm Stop" : "Confirm Sale"}</>
            }
          </button>
        </div>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
