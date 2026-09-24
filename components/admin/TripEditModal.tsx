"use client"

import { FONT_SIZE } from "@/lib/constants"
import { useEffect, useState } from "react"
import { Icon } from "@iconify/react"
import { supabase } from "@/lib/supabase"
import { apiMutate } from "@/lib/api-mutation"
import CustomerSelector from "@/components/CustomerSelector"
import { fetchStores } from "@/lib/stores"

type Stop = {
  stop_id: string
  stop_type: "customer" | "store"
  broker_id: string | null
  broker_name: string | null
  customer_id: string | null
  customer_name: string | null
  customer_phone: string | null
  quantity_offloaded: number
  latitude: number
  longitude: number
  stop_time: string
  stop_location: string
  store_name: string | null
  confirmed: boolean
  disputed: boolean
  dispute_reason: string | null
  confirmation_id: string | null
  confirmation_broker_id: string | null
  price_per_bag: number | null
  area: string | null
  company_price: number | null
  price_reason: string | null
  confirmed_at: string | null
  discount_status: string | null
  on_credit: boolean
  credit_approval_id: string | null
  credit_status: string | null
  is_credit_approved: boolean
}

type Discrepancy = {
  discrepancy_id: string
  shortage: number
  caked_bags: number
  notes: string | null
  reported_at: string
}

type TripEditData = {
  trip_id: string
  plate_number: string
  product: string
  loaded_quantity: number
  stops: Stop[]
  discrepancies: Discrepancy[]
}

type StopEditForm = {
  isNew: boolean
  stop_id: string | null
  stop_type: "customer" | "store"
  broker_id: string | null
  customer_id: string | null
  customer_name: string | null
  store_name: string | null
  quantity_offloaded: number
  stop_location: string
  stop_time: string
  area: string
  company_price: number
  price_per_bag: string
  price_reason: string
  is_credit_linked: boolean
}

type DiscEditForm = {
  isNew: boolean
  discrepancy_id: string | null
  shortage: number
  caked_bags: number
  discrepancy_type: string
  notes: string
}

type SavedStop = {
  stop_id: string
  stop_type: "customer" | "store"
  broker_id: string | null
  customer_id: string | null
  quantity_offloaded: number
  latitude: number | null
  longitude: number | null
  stop_time: string
  stop_location: string
  store_name: string | null
  confirmed: boolean
  disputed: boolean
  dispute_reason: string | null
  discount_status: string | null
  on_credit: boolean
  credit_approval_id: string | null
}

type SavedConfirmation = {
  confirmation_id: string
  stop_id: string
  broker_id: string | null
  customer_id: string | null
  price_per_bag: number
  area: string | null
  company_price: number | null
  price_reason: string | null
  confirmed_at: string | null
}

type SaveStopResult = {
  stop: SavedStop
  confirmation: SavedConfirmation | null
  credit_status: string | null
}

type Props = {
  trip: TripEditData
  isMobile: boolean
  canEdit: boolean
  onClose: () => void
}

function toDateInputValue(timestamp: string) {
  if (!timestamp) return ""
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ""
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function updateDatePreservingTime(timestamp: string, value: string) {
  if (!value) return ""
  const original = timestamp ? new Date(timestamp) : new Date()
  const date = new Date(original)
  const [year, month, day] = value.split("-").map(Number)
  if (!year || !month || !day) return timestamp
  date.setFullYear(year, month - 1, day)
  return date.toISOString()
}

export default function TripEditModal({ trip, isMobile, canEdit, onClose }: Props) {
  const [localStops, setLocalStops] = useState<Stop[]>(trip.stops)
  const [localDiscrepancies, setLocalDiscrepancies] = useState<Discrepancy[]>(trip.discrepancies)
  const [stopForm, setStopForm] = useState<StopEditForm | null>(null)
  const [discForm, setDiscForm] = useState<DiscEditForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [allBrokers, setAllBrokers] = useState<{ broker_id: string; broker_name: string }[]>([])
  const [storeLocations, setStoreLocations] = useState<string[]>([])
  const [companyPrices, setCompanyPrices] = useState<Record<string, number>>({})
  const [loadingData, setLoadingData] = useState(true)
  const [confirmDeleteStopId, setConfirmDeleteStopId] = useState<string | null>(null)
  const [confirmDeleteDiscId, setConfirmDeleteDiscId] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      const [brokersRes, storesRes, pricesRes] = await Promise.all([
        supabase.from("Brokers").select("broker_id, broker_name").order("broker_name"),
        fetchStores(),
        supabase.from("company_prices").select("area, price").eq("product", trip.product),
      ])
      setAllBrokers(brokersRes.data || [])
      setStoreLocations(storesRes)
      const prices: Record<string, number> = {}
      for (const row of pricesRes.data || []) prices[row.area] = Number(row.price)
      setCompanyPrices(prices)
      setLoadingData(false)
    }
    fetchData()
  }, [trip.product])

  const totalOffloaded = localStops.reduce((sum, stop) => sum + stop.quantity_offloaded, 0)
  const totalShortage = localDiscrepancies.reduce((sum, discrepancy) => sum + (discrepancy.shortage || 0), 0)
  const totalCaked = localDiscrepancies.reduce((sum, discrepancy) => sum + (discrepancy.caked_bags || 0), 0)
  const totalDiscrepancy = totalShortage + totalCaked
  const remaining = trip.loaded_quantity - totalOffloaded - totalDiscrepancy
  const isOverLimit = remaining < 0
  const hasRemaining = remaining > 0
  const selectedCompanyPrice = stopForm?.is_credit_linked
    ? stopForm.company_price
    : stopForm?.area ? companyPrices[stopForm.area] || 0 : 0
  const enteredPrice = Number(stopForm?.price_per_bag || 0)
  const hasPriceDifference = stopForm?.stop_type === "customer"
    && selectedCompanyPrice > 0
    && enteredPrice > 0
    && enteredPrice !== selectedCompanyPrice
  const stopValue = enteredPrice * (stopForm?.quantity_offloaded || 0)

  function requestClose() {
    if (!isOverLimit && !saving) onClose()
  }

  function openEditStop(stop: Stop) {
    setMessage("")
    setStopForm({
      isNew: false,
      stop_id: stop.stop_id,
      stop_type: stop.stop_type,
      broker_id: stop.broker_id,
      customer_id: stop.customer_id,
      customer_name: stop.customer_name,
      store_name: stop.store_name,
      quantity_offloaded: stop.quantity_offloaded,
      stop_location: stop.stop_location,
      stop_time: stop.stop_time,
      area: stop.area || "",
      company_price: stop.company_price || 0,
      price_per_bag: stop.price_per_bag === null ? "" : String(stop.price_per_bag),
      price_reason: stop.price_reason || "",
      is_credit_linked: stop.on_credit || stop.credit_status !== null,
    })
  }

  function openAddStop() {
    setMessage("")
    setStopForm({
      isNew: true,
      stop_id: null,
      stop_type: "customer",
      broker_id: null,
      customer_id: null,
      customer_name: null,
      store_name: null,
      quantity_offloaded: 0,
      stop_location: "",
      stop_time: new Date().toISOString(),
      area: "",
      company_price: 0,
      price_per_bag: "",
      price_reason: "",
      is_credit_linked: false,
    })
  }

  function openEditDisc(discrepancy: Discrepancy) {
    setMessage("")
    setDiscForm({
      isNew: false,
      discrepancy_id: discrepancy.discrepancy_id,
      shortage: discrepancy.shortage,
      caked_bags: discrepancy.caked_bags,
      discrepancy_type: discrepancy.shortage > 0 && discrepancy.caked_bags > 0 ? "both" : discrepancy.shortage > 0 ? "shortage" : "caked",
      notes: discrepancy.notes || "",
    })
  }

  function openAddDisc() {
    setMessage("")
    setDiscForm({
      isNew: true,
      discrepancy_id: null,
      shortage: 0,
      caked_bags: 0,
      discrepancy_type: "shortage",
      notes: "",
    })
  }

  function selectArea(area: string) {
    if (!stopForm) return
    const companyPrice = companyPrices[area] || 0
    setStopForm({
      ...stopForm,
      area,
      company_price: companyPrice,
      price_per_bag: companyPrice > 0 ? String(companyPrice) : "",
      price_reason: "",
    })
  }

  function wouldExceed(formQuantity: number) {
    const currentStopTotal = localStops.reduce((sum, stop) => {
      if (stopForm && !stopForm.isNew && stop.stop_id === stopForm.stop_id) return sum + formQuantity
      return sum + stop.quantity_offloaded
    }, 0)
    return trip.loaded_quantity - currentStopTotal - totalDiscrepancy < 0
  }

  function wouldExceedDisc(formShortage: number, formCaked: number) {
    const currentDiscTotal = localDiscrepancies.reduce((sum, discrepancy) => {
      if (discForm && !discForm.isNew && discrepancy.discrepancy_id === discForm.discrepancy_id) {
        return sum + formShortage + formCaked
      }
      return sum + (discrepancy.shortage || 0) + (discrepancy.caked_bags || 0)
    }, 0)
    return trip.loaded_quantity - totalOffloaded - currentDiscTotal < 0
  }

  async function handleSaveStop() {
    if (!stopForm) return
    if (!canEdit) {
      setMessage("You do not have permission to edit stops")
      return
    }
    if (stopForm.quantity_offloaded <= 0) {
      setMessage("Quantity must be greater than 0")
      return
    }
    if (!stopForm.stop_time) {
      setMessage("Stop date is required")
      return
    }
    if (stopForm.stop_type === "customer") {
      if (!stopForm.broker_id) {
        setMessage("Select a broker")
        return
      }
      if (!stopForm.stop_location.trim()) {
        setMessage("Enter a stop location")
        return
      }
      if (!stopForm.is_credit_linked) {
        if (!stopForm.area) {
          setMessage("Select an area")
          return
        }
        if (selectedCompanyPrice <= 0) {
          setMessage("No company price exists for this area and product")
          return
        }
        if (enteredPrice <= 0) {
          setMessage("Price per bag must be greater than 0")
          return
        }
        if (hasPriceDifference && !stopForm.price_reason.trim()) {
          setMessage("Provide a reason for using a different price")
          return
        }
      }
    } else if (!stopForm.store_name) {
      setMessage("Select a store")
      return
    }
    if (wouldExceed(stopForm.quantity_offloaded)) {
      setMessage("Cannot save — would exceed loaded quantity")
      return
    }

    setSaving(true)
    setMessage("")

    try {
      const { data, error } = await apiMutate<SaveStopResult>("trips", {
        action: "save_stop",
        data: {
          stop_id: stopForm.stop_id,
          trip_id: trip.trip_id,
          stop_type: stopForm.stop_type,
          broker_id: stopForm.stop_type === "customer" ? stopForm.broker_id : null,
          customer_id: stopForm.stop_type === "customer" ? stopForm.customer_id : null,
          store_name: stopForm.stop_type === "store" ? stopForm.store_name : null,
          quantity_offloaded: stopForm.quantity_offloaded,
          stop_location: stopForm.stop_type === "customer" ? stopForm.stop_location : stopForm.store_name,
          stop_time: stopForm.stop_time,
          area: stopForm.stop_type === "customer" ? stopForm.area : null,
          price_per_bag: stopForm.stop_type === "customer" && !stopForm.is_credit_linked ? enteredPrice : null,
          price_reason: stopForm.stop_type === "customer" && hasPriceDifference ? stopForm.price_reason : null,
        },
      })

      if (error || !data?.stop) {
        setMessage("Failed to save stop: " + (error || "Invalid server response"))
        return
      }

      const existingStop = localStops.find(stop => stop.stop_id === data.stop.stop_id)
      const selectedBroker = allBrokers.find(broker => broker.broker_id === stopForm.broker_id)
      const updatedStop: Stop = {
        stop_id: data.stop.stop_id,
        stop_type: data.stop.stop_type,
        broker_id: data.stop.broker_id,
        broker_name: data.stop.stop_type === "customer" ? selectedBroker?.broker_name ?? existingStop?.broker_name ?? "Unknown" : null,
        customer_id: data.stop.customer_id,
        customer_name: data.stop.stop_type === "customer" ? stopForm.customer_name ?? existingStop?.customer_name ?? "Not provided" : null,
        customer_phone: existingStop?.customer_phone ?? null,
        quantity_offloaded: data.stop.quantity_offloaded,
        latitude: data.stop.latitude ?? existingStop?.latitude ?? 0,
        longitude: data.stop.longitude ?? existingStop?.longitude ?? 0,
        stop_time: data.stop.stop_time,
        stop_location: data.stop.stop_location,
        store_name: data.stop.store_name,
        confirmed: data.stop.confirmed,
        disputed: data.stop.disputed,
        dispute_reason: data.stop.dispute_reason,
        confirmation_id: data.confirmation?.confirmation_id ?? null,
        confirmation_broker_id: data.confirmation?.broker_id ?? data.stop.broker_id,
        price_per_bag: data.confirmation?.price_per_bag ?? null,
        area: data.confirmation?.area ?? null,
        company_price: data.confirmation?.company_price ?? null,
        price_reason: data.confirmation?.price_reason ?? null,
        confirmed_at: data.confirmation?.confirmed_at ?? null,
        discount_status: data.stop.discount_status ?? "none",
        on_credit: data.stop.on_credit,
        credit_approval_id: data.stop.credit_approval_id,
        credit_status: data.credit_status ?? null,
        is_credit_approved: data.credit_status === "Approved",
      }

      setLocalStops(previous => {
        const exists = previous.some(stop => stop.stop_id === updatedStop.stop_id)
        return exists
          ? previous.map(stop => stop.stop_id === updatedStop.stop_id ? updatedStop : stop)
          : [...previous, updatedStop]
      })
      setStopForm(null)
    } catch {
      setMessage("Network error, please try again")
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteStop(stopId: string) {
    if (!canEdit) {
      setMessage("You do not have permission to delete stops")
      return
    }
    setSaving(true)
    setMessage("")
    try {
      const { error } = await apiMutate("trips", {
        action: "delete_stop",
        data: { stop_id: stopId },
      })
      if (error) {
        setMessage("Failed to delete stop: " + error)
        return
      }
      setLocalStops(previous => previous.filter(stop => stop.stop_id !== stopId))
      setConfirmDeleteStopId(null)
    } catch {
      setMessage("Network error, please try again")
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveDisc() {
    if (!discForm) return
    if (!canEdit) {
      setMessage("You do not have permission to edit discrepancies")
      return
    }
    if (discForm.shortage <= 0 && discForm.caked_bags <= 0) {
      setMessage("Enter at least one quantity")
      return
    }
    if (wouldExceedDisc(discForm.shortage, discForm.caked_bags)) {
      setMessage("Cannot save — would exceed loaded quantity")
      return
    }

    setSaving(true)
    setMessage("")

    try {
      if (discForm.isNew) {
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
          setMessage("Unable to identify the current officer")
          return
        }
        const { data, error } = await apiMutate("trips", {
          action: "insert",
          table: "trip_discrepancies",
          data: {
            trip_id: trip.trip_id,
            driver_id: user.id,
            shortage: discForm.shortage,
            caked_bags: discForm.caked_bags,
            discrepancy_type: discForm.discrepancy_type,
            notes: discForm.notes.trim() || null,
          },
        })
        if (error) {
          setMessage("Failed to add discrepancy: " + error)
          return
        }
        if (data) {
          const inserted = data as { discrepancy_id: string }
          setLocalDiscrepancies(previous => [...previous, {
            discrepancy_id: inserted.discrepancy_id,
            shortage: discForm.shortage,
            caked_bags: discForm.caked_bags,
            notes: discForm.notes.trim() || null,
            reported_at: new Date().toISOString(),
          }])
        }
      } else {
        const { error } = await apiMutate("trips", {
          action: "update",
          table: "trip_discrepancies",
          data: {
            shortage: discForm.shortage,
            caked_bags: discForm.caked_bags,
            discrepancy_type: discForm.discrepancy_type,
            notes: discForm.notes.trim() || null,
          },
          filters: { discrepancy_id: discForm.discrepancy_id! },
        })
        if (error) {
          setMessage("Failed to update discrepancy: " + error)
          return
        }
        setLocalDiscrepancies(previous => previous.map(discrepancy => (
          discrepancy.discrepancy_id === discForm.discrepancy_id
            ? {
                ...discrepancy,
                shortage: discForm.shortage,
                caked_bags: discForm.caked_bags,
                notes: discForm.notes.trim() || null,
              }
            : discrepancy
        )))
      }
      setDiscForm(null)
    } catch {
      setMessage("Network error, please try again")
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteDisc(id: string) {
    setSaving(true)
    setMessage("")
    try {
      const { error } = await apiMutate("trips", {
        action: "delete",
        table: "trip_discrepancies",
        filters: { discrepancy_id: id },
      })
      if (error) {
        setMessage("Failed to delete discrepancy: " + error)
        return
      }
      setLocalDiscrepancies(previous => previous.filter(discrepancy => discrepancy.discrepancy_id !== id))
      setConfirmDeleteDiscId(null)
    } catch {
      setMessage("Network error, please try again")
    } finally {
      setSaving(false)
    }
  }

  const showOverview = !stopForm && !discForm
  const availableAreas = [...new Set([
    ...Object.keys(companyPrices),
    ...(stopForm?.area ? [stopForm.area] : []),
  ])].sort()

  return (
    <div onClick={requestClose} style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 100, padding: isMobile ? 0 : 24, animation: "fadeIn 0.2s ease-out" }}>
      <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
      <div onClick={event => event.stopPropagation()} style={{ background: "white", borderRadius: isMobile ? "20px 20px 0 0" : 12, padding: isMobile ? "28px 20px" : 32, width: "100%", maxWidth: stopForm || discForm ? 620 : 680, maxHeight: isMobile ? "90vh" : "88vh", overflowY: "auto", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)", animation: "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)" }}>

        {showOverview && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h3 style={{ margin: "0 0 4px 0", color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>Edit Trip</h3>
                <p style={{ margin: 0, color: "#94a3b8", fontSize: FONT_SIZE.sm }}>{trip.plate_number} · {trip.product}</p>
              </div>
              <button onClick={requestClose} disabled={isOverLimit || saving} style={{ background: "none", border: "none", color: "#94a3b8", cursor: isOverLimit || saving ? "not-allowed" : "pointer", padding: 0, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 20, padding: 12, background: isOverLimit ? "#fef2f2" : hasRemaining ? "#fffbeb" : "#f0fdf4", border: `1.5px solid ${isOverLimit ? "#fecaca" : hasRemaining ? "#fde68a" : "#bbf7d0"}`, borderRadius: 10 }}>
              <div><p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#64748b" }}>Loaded</p><p style={{ margin: "2px 0 0", fontWeight: 700, color: "#0f172a" }}>{trip.loaded_quantity}</p></div>
              <div><p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#64748b" }}>Offloaded</p><p style={{ margin: "2px 0 0", fontWeight: 700, color: "#0f172a" }}>{totalOffloaded}</p></div>
              <div><p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#64748b" }}>Discrepancy</p><p style={{ margin: "2px 0 0", fontWeight: 700, color: totalDiscrepancy ? "#b45309" : "#0f172a" }}>{totalDiscrepancy}</p></div>
              <div><p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: isOverLimit ? "#ef4444" : hasRemaining ? "#b45309" : "#16a34a" }}>Remaining</p><p style={{ margin: "2px 0 0", fontWeight: 700, color: isOverLimit ? "#b91c1c" : hasRemaining ? "#b45309" : "#15803d" }}>{remaining}</p></div>
            </div>

            {isOverLimit && (
              <div style={{ padding: "8px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, marginBottom: 16, fontSize: FONT_SIZE.xs, color: "#b91c1c", fontWeight: 600 }}>
                Total exceeds loaded quantity by {Math.abs(remaining)} bags. Reduce quantities before closing.
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h4 style={{ margin: 0, fontSize: FONT_SIZE.base, fontWeight: 700, color: "#0f172a" }}>Stops ({localStops.length})</h4>
              <button onClick={openAddStop} disabled={!canEdit} style={{ padding: "6px 12px", background: "#eff6ff", color: "#0070f3", border: "1px solid #bfdbfe", borderRadius: 6, cursor: canEdit ? "pointer" : "not-allowed", fontWeight: 600, fontSize: FONT_SIZE.xs, display: "flex", alignItems: "center", gap: 4 }}>
                <Icon icon="mdi:plus" width={14} /> Add Stop
              </button>
            </div>

            {localStops.length === 0 ? (
              <div style={{ padding: 24, background: "#f8fafc", borderRadius: 8, border: "1px dashed #e2e8f0", textAlign: "center", marginBottom: 20 }}>
                <p style={{ margin: 0, color: "#94a3b8", fontSize: FONT_SIZE.sm }}>No stops logged yet</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                {[...localStops].sort((a, b) => new Date(a.stop_time).getTime() - new Date(b.stop_time).getTime()).map((stop, index) => (
                  <div key={stop.stop_id} style={{ padding: 12, border: `1px solid ${stop.disputed ? "#fca5a5" : stop.stop_type === "customer" && (!stop.price_per_bag || stop.price_per_bag <= 0) ? "#fdba74" : stop.confirmed ? "#bbf7d0" : "#e2e8f0"}`, borderRadius: 8, background: stop.disputed ? "#fef2f2" : stop.stop_type === "customer" && (!stop.price_per_bag || stop.price_per_bag <= 0) ? "#fff7ed" : stop.confirmed ? "#f0fdf4" : "#f8fafc" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700, fontSize: FONT_SIZE.sm, color: "#0f172a" }}>Stop {index + 1}</span>
                          <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: stop.stop_type === "customer" ? "#eff6ff" : "#f3e5f5", color: stop.stop_type === "customer" ? "#0070f3" : "#7c3aed", fontWeight: 600 }}>{stop.stop_type === "customer" ? "Customer" : "Store"}</span>
                          {stop.confirmed && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "#f0fdf4", color: "#16a34a", fontWeight: 600 }}>Confirmed</span>}
                          {stop.disputed && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "#fef2f2", color: "#ef4444", fontWeight: 600 }}>Disputed</span>}
                          {stop.stop_type === "customer" && (!stop.price_per_bag || stop.price_per_bag <= 0) && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "#fff7ed", color: "#c2410c", fontWeight: 600 }}>Price required</span>}
                          {stop.discount_status === "pending" && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "#eff6ff", color: "#0070f3", fontWeight: 600 }}>Price review</span>}
                          {stop.credit_status && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "#f5f3ff", color: "#7c3aed", fontWeight: 600 }}>Credit {stop.credit_status}</span>}
                        </div>
                        <p style={{ margin: "2px 0", fontSize: FONT_SIZE.xs, color: "#475569" }}>{stop.stop_type === "customer" ? `${stop.broker_name ?? "Unknown"} — ${stop.customer_name ?? "Not provided"}` : stop.store_name || stop.stop_location}</p>
                        <p style={{ margin: "2px 0", fontSize: FONT_SIZE.xs, color: "#64748b" }}>{stop.quantity_offloaded} bags{stop.stop_type === "customer" && stop.price_per_bag ? ` · ₦${stop.price_per_bag.toLocaleString()}/bag${stop.area ? ` · ${stop.area}` : ""}` : ""}</p>
                      </div>
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <button onClick={() => openEditStop(stop)} disabled={!canEdit} style={{ padding: "5px 10px", background: "white", color: "#0070f3", border: "1px solid #bfdbfe", borderRadius: 6, cursor: canEdit ? "pointer" : "not-allowed", fontWeight: 600, fontSize: FONT_SIZE.xs }}>Edit</button>
                        {confirmDeleteStopId === stop.stop_id ? (
                          <>
                            <button onClick={() => handleDeleteStop(stop.stop_id)} disabled={saving} style={{ padding: "5px 10px", background: "#ef4444", color: "white", border: "none", borderRadius: 6, cursor: saving ? "not-allowed" : "pointer", fontWeight: 600, fontSize: FONT_SIZE.xs }}>{saving ? "Deleting..." : "Confirm"}</button>
                            <button onClick={() => setConfirmDeleteStopId(null)} style={{ padding: "5px 10px", background: "white", color: "#64748b", border: "1px solid #e2e8f0", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.xs }}>Cancel</button>
                          </>
                        ) : (
                          <button onClick={() => setConfirmDeleteStopId(stop.stop_id)} disabled={!canEdit} style={{ padding: "5px 10px", background: "white", color: "#ef4444", border: "1px solid #fecaca", borderRadius: 6, cursor: canEdit ? "pointer" : "not-allowed", fontWeight: 600, fontSize: FONT_SIZE.xs }}>Delete</button>
                        )}
                      </div>
                    </div>
                    {confirmDeleteStopId === stop.stop_id && (
                      <div style={{ marginTop: 10, padding: 10, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, fontSize: FONT_SIZE.xs, color: "#991b1b" }}>
                        This permanently deletes the stop and linked confirmation, price, credit, and store-supply records. Its {stop.quantity_offloaded} bags will return to Remaining.
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h4 style={{ margin: 0, fontSize: FONT_SIZE.base, fontWeight: 700, color: "#0f172a" }}>Discrepancies ({localDiscrepancies.length})</h4>
              <button onClick={openAddDisc} disabled={!canEdit} style={{ padding: "6px 12px", background: "#fffbeb", color: "#b45309", border: "1px solid #fde68a", borderRadius: 6, cursor: canEdit ? "pointer" : "not-allowed", fontWeight: 600, fontSize: FONT_SIZE.xs, display: "flex", alignItems: "center", gap: 4 }}>
                <Icon icon="mdi:plus" width={14} /> Add Discrepancy
              </button>
            </div>

            {localDiscrepancies.length === 0 ? (
              <div style={{ padding: 24, background: "#f8fafc", borderRadius: 8, border: "1px dashed #e2e8f0", textAlign: "center", marginBottom: 20 }}>
                <p style={{ margin: 0, color: "#94a3b8", fontSize: FONT_SIZE.sm }}>No discrepancies recorded</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                {localDiscrepancies.map(discrepancy => (
                  <div key={discrepancy.discrepancy_id} style={{ padding: 12, border: "1px solid #fde68a", borderRadius: 8, background: "#fffbeb" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <div>
                        {discrepancy.shortage > 0 && <p style={{ margin: "0 0 2px", fontSize: FONT_SIZE.sm, color: "#ef4444", fontWeight: 600 }}>Shortage: {discrepancy.shortage} bags</p>}
                        {discrepancy.caked_bags > 0 && <p style={{ margin: "0 0 2px", fontSize: FONT_SIZE.sm, color: "#b45309", fontWeight: 600 }}>Caked: {discrepancy.caked_bags} bags</p>}
                        {discrepancy.notes && <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.xs, color: "#64748b" }}>{discrepancy.notes}</p>}
                      </div>
                      <div style={{ display: "flex", gap: 5 }}>
                        <button onClick={() => openEditDisc(discrepancy)} disabled={!canEdit} style={{ padding: "4px 10px", background: "white", color: "#b45309", border: "1px solid #fde68a", borderRadius: 6, cursor: canEdit ? "pointer" : "not-allowed", fontWeight: 600, fontSize: FONT_SIZE.xs }}>Edit</button>
                        {confirmDeleteDiscId === discrepancy.discrepancy_id ? (
                          <>
                            <button onClick={() => handleDeleteDisc(discrepancy.discrepancy_id)} disabled={saving} style={{ padding: "4px 10px", background: "#ef4444", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.xs }}>{saving ? "..." : "Yes"}</button>
                            <button onClick={() => setConfirmDeleteDiscId(null)} style={{ padding: "4px 10px", background: "white", color: "#64748b", border: "1px solid #e2e8f0", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.xs }}>No</button>
                          </>
                        ) : (
                          <button onClick={() => setConfirmDeleteDiscId(discrepancy.discrepancy_id)} disabled={!canEdit} style={{ padding: "4px 10px", background: "white", color: "#ef4444", border: "1px solid #fecaca", borderRadius: 6, cursor: canEdit ? "pointer" : "not-allowed", fontWeight: 600, fontSize: FONT_SIZE.xs }}>Delete</button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {message && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#ef4444", marginBottom: 14, fontSize: FONT_SIZE.sm, padding: "8px 12px", background: "#fef2f2", borderRadius: 6, border: "1px solid #fecaca" }}>
                <Icon icon="mdi:alert-circle" width={16} /> {message}
              </div>
            )}

            <button onClick={requestClose} disabled={isOverLimit || saving} style={{ width: "100%", padding: "12px 16px", background: isOverLimit || saving ? "#94a3b8" : "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: isOverLimit || saving ? "not-allowed" : "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, minHeight: 44 }}>
              {saving ? "Saving..." : isOverLimit ? "Fix over-limit to close" : "Done"}
            </button>
          </>
        )}

        {stopForm && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <div>
                <h3 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>{stopForm.isNew ? "Add Stop" : "Edit Stop"}</h3>
                <p style={{ margin: "3px 0 0", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>{trip.plate_number} · {trip.product}</p>
              </div>
              <button onClick={() => setStopForm(null)} disabled={saving} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 0, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
              {(["customer", "store"] as const).map(type => (
                <button key={type} onClick={() => setStopForm({ ...stopForm, stop_type: type })} style={{ flex: 1, padding: "8px 0", borderRadius: 6, cursor: "pointer", border: `1.5px solid ${stopForm.stop_type === type ? "#0070f3" : "#e2e8f0"}`, fontSize: FONT_SIZE.xs, fontWeight: stopForm.stop_type === type ? 700 : 500, background: stopForm.stop_type === type ? "#0070f3" : "white", color: stopForm.stop_type === type ? "white" : "#475569" }}>
                  {type === "customer" ? "Broker / Customer" : "Store"}
                </button>
              ))}
            </div>

            {stopForm.is_credit_linked && stopForm.stop_type === "customer" && (
              <div style={{ marginBottom: 14, padding: "10px 12px", background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 8, fontSize: FONT_SIZE.xs, color: "#6d28d9" }}>
                Pricing is managed by the credit workflow. Changing broker, customer, quantity, or stop type reopens the credit approval as Pending.
              </div>
            )}

            {stopForm.stop_type === "customer" ? (
              <>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#475569", marginBottom: 4 }}>Broker *</label>
                  <select value={stopForm.broker_id || ""} onChange={event => setStopForm({ ...stopForm, broker_id: event.target.value || null })} style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 6, fontSize: FONT_SIZE.sm, boxSizing: "border-box", background: "white" }}>
                    <option value="">Select broker...</option>
                    {allBrokers.map(broker => <option key={broker.broker_id} value={broker.broker_id}>{broker.broker_name}</option>)}
                  </select>
                  {stopForm.broker_id && <p style={{ margin: "5px 0 0", fontSize: 11, color: "#64748b" }}>The confirmation will be attributed to this broker.</p>}
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#475569", marginBottom: 4 }}>Customer</label>
                  <CustomerSelector onSelect={customer => setStopForm({ ...stopForm, customer_id: customer.customer_id || null, customer_name: customer.full_name || null })} initialValue={stopForm.customer_name || ""} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#475569", marginBottom: 4 }}>Stop Location *</label>
                  <input type="text" value={stopForm.stop_location} onChange={event => setStopForm({ ...stopForm, stop_location: event.target.value })} placeholder="e.g. Aba Road, beside GTBank" style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 6, fontSize: FONT_SIZE.sm, boxSizing: "border-box" }} />
                </div>

                <div style={{ padding: 14, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <h4 style={{ margin: 0, fontSize: FONT_SIZE.sm, fontWeight: 700, color: "#0f172a" }}>Price & Confirmation</h4>
                    {stopForm.is_credit_linked && <span style={{ fontSize: 10, padding: "3px 7px", borderRadius: 10, background: "#ede9fe", color: "#7c3aed", fontWeight: 700 }}>Credit managed</span>}
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: "block", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#475569", marginBottom: 4 }}>Area *</label>
                    <select value={stopForm.area} onChange={event => selectArea(event.target.value)} disabled={stopForm.is_credit_linked} style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 6, fontSize: FONT_SIZE.sm, boxSizing: "border-box", background: stopForm.is_credit_linked ? "#f1f5f9" : "white" }}>
                      <option value="">Select area...</option>
                      {availableAreas.map(area => <option key={area} value={area}>{area}</option>)}
                    </select>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                    <div>
                      <label style={{ display: "block", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#475569", marginBottom: 4 }}>Company Price</label>
                      <input value={selectedCompanyPrice > 0 ? selectedCompanyPrice.toLocaleString() : ""} readOnly placeholder="Select an area" style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 6, fontSize: FONT_SIZE.sm, boxSizing: "border-box", background: "#f8fafc", color: "#475569" }} />
                    </div>
                    <div>
                      <label style={{ display: "block", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#475569", marginBottom: 4 }}>Price / Bag *</label>
                      <input type="number" min="0" step="0.01" value={stopForm.price_per_bag} onChange={event => setStopForm({ ...stopForm, price_per_bag: event.target.value })} disabled={stopForm.is_credit_linked} placeholder="0.00" style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 6, fontSize: FONT_SIZE.sm, boxSizing: "border-box", background: stopForm.is_credit_linked ? "#f1f5f9" : "white" }} />
                    </div>
                  </div>
                  {hasPriceDifference && !stopForm.is_credit_linked && (
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: "block", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#475569", marginBottom: 4 }}>Reason for Different Price *</label>
                      <textarea value={stopForm.price_reason} onChange={event => setStopForm({ ...stopForm, price_reason: event.target.value })} placeholder="Explain why this price differs" rows={2} style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #f59e0b", borderRadius: 6, fontSize: FONT_SIZE.sm, boxSizing: "border-box", resize: "vertical" }} />
                      <p style={{ margin: "5px 0 0", fontSize: 11, color: "#b45309" }}>This stop will remain unconfirmed until an admin approves the price.</p>
                    </div>
                  )}
                  {stopValue > 0 && <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#475569" }}>Stop value: <strong>₦{stopValue.toLocaleString()}</strong></p>}
                </div>
              </>
            ) : (
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#475569", marginBottom: 4 }}>Store *</label>
                <select value={stopForm.store_name || ""} onChange={event => setStopForm({ ...stopForm, store_name: event.target.value || null })} style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 6, fontSize: FONT_SIZE.sm, boxSizing: "border-box", background: "white" }}>
                  <option value="">Select store...</option>
                  {storeLocations.map(location => <option key={location} value={location}>{location}</option>)}
                </select>
                <p style={{ margin: "6px 0 0", fontSize: 11, color: "#64748b" }}>Store stops do not use broker area pricing.</p>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              <div>
                <label style={{ display: "block", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#475569", marginBottom: 4 }}>Bags Offloaded *</label>
                <input type="number" min={1} value={stopForm.quantity_offloaded || ""} onChange={event => setStopForm({ ...stopForm, quantity_offloaded: Number.parseInt(event.target.value) || 0 })} placeholder="e.g. 200" style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 6, fontSize: FONT_SIZE.sm, boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ display: "block", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#475569", marginBottom: 4 }}>Stop Date *</label>
                <input type="date" value={toDateInputValue(stopForm.stop_time)} onChange={event => setStopForm({ ...stopForm, stop_time: updateDatePreservingTime(stopForm.stop_time, event.target.value) })} style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 6, fontSize: FONT_SIZE.sm, boxSizing: "border-box" }} />
              </div>
            </div>

            {message && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#ef4444", marginBottom: 14, fontSize: FONT_SIZE.sm, padding: "8px 12px", background: "#fef2f2", borderRadius: 6, border: "1px solid #fecaca" }}>
                <Icon icon="mdi:alert-circle" width={16} /> {message}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => setStopForm(null)} disabled={saving} style={{ padding: "12px 16px", background: "white", color: "#475569", border: "1px solid #cbd5e1", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, minHeight: 44 }}>Cancel</button>
              <button onClick={handleSaveStop} disabled={saving || loadingData || !canEdit} style={{ padding: "12px 16px", background: saving || !canEdit ? "#94a3b8" : "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: saving || !canEdit ? "not-allowed" : "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, minHeight: 44 }}>{saving ? "Saving..." : "Save Stop"}</button>
            </div>
          </>
        )}

        {discForm && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>{discForm.isNew ? "Add Discrepancy" : "Edit Discrepancy"}</h3>
              <button onClick={() => setDiscForm(null)} disabled={saving} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 0, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#475569", marginBottom: 4 }}>Shortage (bags)</label>
              <input type="number" min={0} value={discForm.shortage || ""} onChange={event => setDiscForm({ ...discForm, shortage: Number.parseInt(event.target.value) || 0 })} placeholder="0" style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 6, fontSize: FONT_SIZE.sm, boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#475569", marginBottom: 4 }}>Caked Bags</label>
              <input type="number" min={0} value={discForm.caked_bags || ""} onChange={event => setDiscForm({ ...discForm, caked_bags: Number.parseInt(event.target.value) || 0 })} placeholder="0" style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 6, fontSize: FONT_SIZE.sm, boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#475569", marginBottom: 4 }}>Type</label>
              <select value={discForm.discrepancy_type} onChange={event => setDiscForm({ ...discForm, discrepancy_type: event.target.value })} style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 6, fontSize: FONT_SIZE.sm, boxSizing: "border-box", background: "white" }}>
                <option value="shortage">Shortage</option>
                <option value="caked">Caked</option>
                <option value="both">Both</option>
              </select>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#475569", marginBottom: 4 }}>Notes</label>
              <textarea value={discForm.notes} onChange={event => setDiscForm({ ...discForm, notes: event.target.value })} placeholder="Optional notes..." rows={3} style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 6, fontSize: FONT_SIZE.sm, boxSizing: "border-box", resize: "vertical" }} />
            </div>
            {message && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#ef4444", marginBottom: 14, fontSize: FONT_SIZE.sm, padding: "8px 12px", background: "#fef2f2", borderRadius: 6, border: "1px solid #fecaca" }}>
                <Icon icon="mdi:alert-circle" width={16} /> {message}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => setDiscForm(null)} disabled={saving} style={{ padding: "12px 16px", background: "white", color: "#475569", border: "1px solid #cbd5e1", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, minHeight: 44 }}>Cancel</button>
              <button onClick={handleSaveDisc} disabled={saving || !canEdit} style={{ padding: "12px 16px", background: saving || !canEdit ? "#94a3b8" : "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: saving || !canEdit ? "not-allowed" : "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, minHeight: 44 }}>{saving ? "Saving..." : "Save"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
