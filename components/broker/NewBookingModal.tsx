"use client"

import { useState, useEffect, useRef } from "react"
import { Icon } from "@iconify/react"
import { apiMutate } from "@/lib/api-mutation"
import { formatAmount, parseAmount } from "@/lib/formatAmount"
import ModernInput from "@/components/ModernInput"
import CustomerSelector, { type Customer } from "@/components/CustomerSelector"
import type { NewBooking } from "@/lib/types"

const AREAS = ["Calabar to Obubra", "Ikom to Obudu", "Akwa-Ibom", "East"]

type Props = {
  isOpen: boolean
  onClose: () => void
  brokerId: string
  isMobile: boolean
  companyPriceMap: Record<string, Record<string, number>>
  onSaved: () => void
  editBooking?: NewBooking | null
}

export default function NewBookingModal({ isOpen, onClose, brokerId, isMobile, companyPriceMap, onSaved, editBooking }: Props) {
  const isEdit = !!editBooking
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [area, setArea] = useState("")
  const [product, setProduct] = useState("")
  const [location, setLocation] = useState("")
  const [numberOfBags, setNumberOfBags] = useState("")
  const [ratePerBag, setRatePerBag] = useState("")
  const [companyPrice, setCompanyPrice] = useState(0)
  const [soldAtDifferentPrice, setSoldAtDifferentPrice] = useState(false)
  const [discount, setDiscount] = useState("")
  const [salePrice, setSalePrice] = useState("")
  const [priceReason, setPriceReason] = useState("")
  const [paymentDate, setPaymentDate] = useState("")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const areaProducts = area ? Object.keys(companyPriceMap[area] || {}).sort() : []
  const editInitDoneRef = useRef(false)
  const editCleanupDoneRef = useRef(false)
  const editOriginalRef = useRef<{ area: string; product: string } | null>(null)

  useEffect(() => {
    if (!isOpen) return
    if (editBooking) {
      editInitDoneRef.current = true
      editCleanupDoneRef.current = true
      editOriginalRef.current = { area: editBooking.area, product: editBooking.product }
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedCustomer(editBooking.customer_id ? { customer_id: editBooking.customer_id, full_name: editBooking.customer_name || "", phone_number: "" } : null)
      setArea(editBooking.area)
      setProduct(editBooking.product)
      setLocation(editBooking.location)
      setNumberOfBags(String(editBooking.number_of_bags))
      setRatePerBag(formatAmount(String(editBooking.rate_per_bag)))
      setPaymentDate(editBooking.payment_date)
      setPriceReason(editBooking.price_reason || "")
      setSoldAtDifferentPrice(!!editBooking.price_reason)
      setCompanyPrice(editBooking.company_price || 0)
      setMessage("")
    } else {
      editOriginalRef.current = null
      setSelectedCustomer(null)
      setArea("")
      setProduct("")
      setLocation("")
      setNumberOfBags("")
      setRatePerBag("")
      setPaymentDate("")
      setSoldAtDifferentPrice(false)
      setDiscount("")
      setSalePrice("")
      setPriceReason("")
      setMessage("")
    }
  }, [isOpen, editBooking])

  useEffect(() => {
    if (editCleanupDoneRef.current) { editCleanupDoneRef.current = false; return }
    if (area && product && !(product in (companyPriceMap[area] || {}))) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProduct("")
    }
  }, [area, product, companyPriceMap])

  useEffect(() => {
    if (!area || !product) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCompanyPrice(0); return
    }
    // If user returned to original area/product combo, restore persisted snapshot
    if (editOriginalRef.current && area === editOriginalRef.current.area && product === editOriginalRef.current.product) {
      if (editInitDoneRef.current) editInitDoneRef.current = false
      setCompanyPrice(editBooking?.company_price || 0)
      if (editBooking?.rate_per_bag && (editBooking.company_price ?? 0) > 0) {
        setRatePerBag(formatAmount(editBooking.rate_per_bag.toString()))
      }
      return
    }
    // Skip on initial edit mount — snapshot already set in init effect
    if (editInitDoneRef.current) { editInitDoneRef.current = false; return }
    const cp = companyPriceMap[area]?.[product] ?? 0
    setCompanyPrice(cp)
    if (!soldAtDifferentPrice && cp > 0) {
      setRatePerBag(formatAmount(cp.toString()))
    }
  }, [area, product, companyPriceMap, soldAtDifferentPrice, editBooking])

  const bags = parseInt(numberOfBags.replace(/[^0-9]/g, "")) || 0
  const rate = parseAmount(ratePerBag)
  const total = bags * rate

  const showPriceReason = soldAtDifferentPrice && companyPrice > 0 && rate > 0 && rate !== companyPrice

  function handleAreaChange(val: string) {
    setArea(val)
    setSoldAtDifferentPrice(false)
    setDiscount("")
    setSalePrice("")
    setPriceReason("")
    setMessage("")
    // Clear original tracker so change-back triggers restoration, not stale snapshot
    if (editOriginalRef.current && val !== editOriginalRef.current.area) {
      editOriginalRef.current = null
    }
  }

  function handleToggleDifferentPrice(checked: boolean) {
    setSoldAtDifferentPrice(checked)
    if (!checked) {
      setDiscount("")
      setSalePrice("")
      setPriceReason("")
      if (companyPrice > 0) setRatePerBag(formatAmount(companyPrice.toString()))
    } else {
      setDiscount("0")
      setSalePrice(formatAmount(companyPrice.toString()))
      setRatePerBag(formatAmount(companyPrice.toString()))
    }
  }

  function handleDiscountChange(raw: string) {
    const digits = raw.replace(/[^0-9]/g, "")
    if (digits === "") {
      setDiscount(""); setSalePrice(""); setRatePerBag(formatAmount(companyPrice.toString())); return
    }
    const discountVal = parseInt(digits)
    const saleAmount = Math.max(0, companyPrice - discountVal)
    setDiscount(formatAmount(discountVal.toString()))
    setSalePrice(formatAmount(saleAmount.toString()))
    setRatePerBag(formatAmount(saleAmount.toString()))
    setMessage("")
  }

  function handleSalePriceChange(raw: string) {
    const digits = raw.replace(/[^0-9]/g, "")
    if (digits === "") {
      setSalePrice(""); setDiscount(""); setRatePerBag(formatAmount(companyPrice.toString())); return
    }
    const saleVal = parseInt(digits)
    const discountAmount = Math.max(0, companyPrice - saleVal)
    setSalePrice(formatAmount(saleVal.toString()))
    setDiscount(formatAmount(discountAmount.toString()))
    setRatePerBag(formatAmount(saleVal.toString()))
    setMessage("")
  }

  async function handleSubmit() {
    if (!selectedCustomer) { setMessage("Select a customer"); return }
    if (!area) { setMessage("Select an area"); return }
    if (!product) { setMessage("Select a product"); return }
    if (!location.trim()) { setMessage("Enter a location"); return }
    if (!bags || bags <= 0) { setMessage("Enter number of bags"); return }
    if (!rate || rate <= 0) { setMessage("Enter rate per bag"); return }
    if (!paymentDate) { setMessage("Select date of payment"); return }
    if (showPriceReason && !priceReason.trim()) { setMessage("Provide a reason for using a different price"); return }

    setSubmitting(true)
    setMessage("")
    try {
      const bookingData = {
        broker_id: brokerId,
        customer_id: selectedCustomer?.customer_id || null,
        customer_name: selectedCustomer?.full_name || null,
        area,
        product,
        location: location.trim(),
        number_of_bags: bags,
        rate_per_bag: rate,
        total_amount: total,
        payment_date: paymentDate,
        price_reason: showPriceReason ? priceReason.trim() : (companyPrice === 0 && rate > 0 ? "No company price configured" : null),
        company_price: companyPrice || null,
      }

      if (isEdit && editBooking) {
        const { error } = await apiMutate("finance", {
          action: "update",
          table: "new_bookings",
          data: bookingData,
          filters: { id: editBooking.id },
        })
        if (error) { setMessage("Failed to update booking. Try again."); return }
      } else {
        const { error } = await apiMutate("finance", {
          action: "insert",
          table: "new_bookings",
          data: bookingData,
        })
        if (error) { setMessage("Failed to create booking. Try again."); return }
      }

      onSaved()
      onClose()
    } catch {
      setMessage("Something went wrong. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

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

  if (!isOpen) return null

  return (
    <div onClick={onClose} style={modalOverlay}>
      <div onClick={e => e.stopPropagation()} style={modalBox}>
        <h3 style={{ margin: "0 0 4px", fontSize: isMobile ? 18 : 20, fontWeight: 700, color: "#0f172a" }}>
          {isEdit ? "Edit Booking" : "New Booking"}
        </h3>
        <p style={{ margin: "0 0 20px", fontSize: isMobile ? 13 : 12, color: "#64748b" }}>
          {isEdit ? "Update booking details below" : "Fill in the booking details below"}
        </p>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Customer *</label>
          <CustomerSelector onSelect={setSelectedCustomer} initialValue={selectedCustomer?.full_name || ""} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>Area *</label>
            <select value={area} onChange={e => handleAreaChange(e.target.value)} style={{ ...inputStyle, appearance: "auto" }}>
              <option value="">Select area</option>
              {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Product *</label>
            <select value={product} onChange={e => { setProduct(e.target.value); setMessage("") }} style={{ ...inputStyle, appearance: "auto" }}>
              <option value="">Select product</option>
              {areaProducts.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Location *</label>
          <ModernInput
            type="text"
            placeholder="Enter delivery location"
            value={location}
            onChange={e => { setLocation(e.target.value); setMessage("") }}
            style={inputStyle}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>Number of Bags *</label>
            <ModernInput
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={numberOfBags}
              onChange={e => { setNumberOfBags(e.target.value.replace(/[^0-9]/g, "")); setMessage("") }}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Rate per Bag *</label>
            <ModernInput
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={ratePerBag}
              onChange={e => { setRatePerBag(formatAmount(e.target.value)); setMessage("") }}
              style={{ ...inputStyle, opacity: companyPrice > 0 && !soldAtDifferentPrice ? 0.7 : 1 }}
              readOnly={companyPrice > 0 && !soldAtDifferentPrice}
            />
          </div>
        </div>

        <div style={{ marginBottom: 16, padding: "12px 14px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: isMobile ? 14 : 13, fontWeight: 600, color: "#444" }}>Total Amount</span>
            <span style={{ fontSize: isMobile ? 18 : 16, fontWeight: 700, color: "#0070f3" }}>
              ₦{total.toLocaleString()}
            </span>
          </div>
        </div>

        {companyPrice > 0 && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: isMobile ? 14 : 13, color: "#444" }}>
              <input
                type="checkbox"
                checked={soldAtDifferentPrice}
                onChange={e => handleToggleDifferentPrice(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: "#0070f3" }}
              />
              Sold at a different price?
            </label>
            {soldAtDifferentPrice && (
              <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ ...labelStyle, fontSize: 12 }}>Discount (₦)</label>
                  <ModernInput
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={discount}
                    onChange={e => handleDiscountChange(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ ...labelStyle, fontSize: 12 }}>Sale Price (₦)</label>
                  <ModernInput
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={salePrice}
                    onChange={e => handleSalePriceChange(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {area && product && companyPrice === 0 && (
          <div style={{ marginBottom: 16, padding: "10px 14px", background: "#fffbeb", borderLeft: "4px solid #f59e0b", borderRadius: 4, fontSize: isMobile ? 13 : 12, color: "#92400e", fontWeight: 500 }}>
            No company price configured for this product. Your rate will be sent for admin review.
          </div>
        )}

        {showPriceReason && (
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Reason for different price *</label>
            <textarea
              value={priceReason}
              onChange={e => { setPriceReason(e.target.value); setMessage("") }}
              placeholder="e.g. Special arrangement with customer..."
              rows={3}
              style={{ ...inputStyle, resize: "vertical", minHeight: 80 }}
            />
          </div>
        )}

        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Date of Payment *</label>
          <ModernInput
            type="date"
            value={paymentDate}
            onChange={e => { setPaymentDate(e.target.value); setMessage("") }}
            style={inputStyle}
          />
        </div>

        {message && (
          <div style={{ padding: "10px 14px", background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 16, color: "#b91c1c", fontSize: 13, fontWeight: 600 }}>
            {message}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <button
            onClick={onClose}
            style={{ padding: "12px 16px", background: "white", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: isMobile ? 15 : 14, minHeight: 44 }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{ padding: "12px 16px", background: submitting ? "#93c5fd" : "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: submitting ? "not-allowed" : "pointer", fontWeight: 700, fontSize: isMobile ? 15 : 14, minHeight: 44, opacity: submitting ? 0.7 : 1, transition: "opacity 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            {submitting ? (
              <>
                <span style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%", animation: "spin 0.6s linear infinite" }} />
                {isEdit ? "Updating..." : "Submitting..."}
              </>
            ) : (
              <>
                <Icon icon={isEdit ? "mdi:content-save" : "mdi:check"} width={18} />
                {isEdit ? "Save Changes" : "Submit"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
