"use client"

import { FONT_SIZE } from "@/lib/constants"
import { useState, useEffect } from "react"
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
  price_per_bag: number | null
  discount_status: string | null
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
}

type DiscEditForm = {
  isNew: boolean
  discrepancy_id: string | null
  shortage: number
  caked_bags: number
  discrepancy_type: string
  notes: string
}

type Props = {
  trip: TripEditData
  isMobile: boolean
  onClose: () => void
}

export default function TripEditModal({ trip, isMobile, onClose }: Props) {
  const [localStops, setLocalStops] = useState<Stop[]>(trip.stops)
  const [localDiscrepancies, setLocalDiscrepancies] = useState<Discrepancy[]>(trip.discrepancies)
  const [stopForm, setStopForm] = useState<StopEditForm | null>(null)
  const [discForm, setDiscForm] = useState<DiscEditForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [allBrokers, setAllBrokers] = useState<{ broker_id: string; broker_name: string }[]>([])
  const [storeLocations, setStoreLocations] = useState<string[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      const [brokersRes, storesRes] = await Promise.all([
        supabase.from("Brokers").select("broker_id, broker_name").order("broker_name"),
        fetchStores()
      ])
      setAllBrokers(brokersRes.data || [])
      setStoreLocations(storesRes)
      setLoadingData(false)
    }
    fetchData()
  }, [])

  const totalOffloaded = localStops.reduce((sum, s) => sum + s.quantity_offloaded, 0)
  const totalShortage = localDiscrepancies.reduce((sum, d) => sum + (d.shortage || 0), 0)
  const totalCaked = localDiscrepancies.reduce((sum, d) => sum + (d.caked_bags || 0), 0)
  const totalDiscrepancy = totalShortage + totalCaked
  const remaining = trip.loaded_quantity - totalOffloaded - totalDiscrepancy
  const isOverLimit = remaining < 0
  const hasRemaining = remaining > 0

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
    })
  }

  function openEditDisc(disc: Discrepancy) {
    setMessage("")
    setDiscForm({
      isNew: false,
      discrepancy_id: disc.discrepancy_id,
      shortage: disc.shortage,
      caked_bags: disc.caked_bags,
      discrepancy_type: disc.shortage > 0 && disc.caked_bags > 0 ? "both" : disc.shortage > 0 ? "shortage" : "caked",
      notes: disc.notes || "",
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

  function wouldExceed(formQuantity: number, isEditing: boolean, editingId: string | null): boolean {
    const currentStopTotal = localStops.reduce((sum, s) => {
      if (isEditing && s.stop_id === editingId) return sum + formQuantity
      return sum + s.quantity_offloaded
    }, 0)
    return (trip.loaded_quantity - currentStopTotal - totalDiscrepancy) < 0
  }

  function wouldExceedDisc(formShortage: number, formCaked: number, isEditing: boolean, editingId: string | null): boolean {
    const currentDiscTotal = localDiscrepancies.reduce((sum, d) => {
      if (isEditing && d.discrepancy_id === editingId) return sum + formShortage + formCaked
      return sum + (d.shortage || 0) + (d.caked_bags || 0)
    }, 0)
    return (trip.loaded_quantity - totalOffloaded - currentDiscTotal) < 0
  }

  async function handleSaveStop() {
    if (!stopForm) return

    if (stopForm.quantity_offloaded <= 0) {
      setMessage("Quantity must be greater than 0")
      return
    }
    if (stopForm.stop_type === "customer" && !stopForm.broker_id) {
      setMessage("Select a broker")
      return
    }
    if (stopForm.stop_type === "customer" && !stopForm.stop_location.trim()) {
      setMessage("Enter a stop location")
      return
    }
    if (stopForm.stop_type === "store" && !stopForm.store_name) {
      setMessage("Select a store")
      return
    }
    if (wouldExceed(stopForm.quantity_offloaded, !stopForm.isNew, stopForm.stop_id)) {
      setMessage("Cannot save — would exceed loaded quantity")
      return
    }

    setSaving(true)
    setMessage("")

    try {
      if (stopForm.isNew) {
        const stopData: Record<string, unknown> = {
          trip_id: trip.trip_id,
          stop_type: stopForm.stop_type,
          quantity_offloaded: stopForm.quantity_offloaded,
          stop_location: stopForm.stop_type === "store" ? stopForm.store_name : stopForm.stop_location,
          stop_time: stopForm.stop_time,
        }
        if (stopForm.stop_type === "customer") {
          stopData.broker_id = stopForm.broker_id
          stopData.customer_id = stopForm.customer_id
          stopData.store_name = null
        } else {
          stopData.broker_id = null
          stopData.customer_id = null
          stopData.store_name = stopForm.store_name
        }

        const { data, error } = await apiMutate("trips", {
          action: "insert",
          table: "Stops",
          data: stopData,
        })

        if (error) {
          setMessage("Failed to add stop: " + error)
          return
        }

        if (data) {
          const inserted = data as { stop_id: string }
          const newStop: Stop = {
            stop_id: inserted.stop_id,
            stop_type: stopForm.stop_type,
            broker_id: stopForm.stop_type === "customer" ? stopForm.broker_id : null,
            broker_name: stopForm.stop_type === "customer" ? allBrokers.find(b => b.broker_id === stopForm.broker_id)?.broker_name ?? null : null,
            customer_id: stopForm.stop_type === "customer" ? stopForm.customer_id : null,
            customer_name: stopForm.stop_type === "customer" ? stopForm.customer_name ?? "Not provided" : null,
            customer_phone: null,
            quantity_offloaded: stopForm.quantity_offloaded,
            latitude: 0,
            longitude: 0,
            stop_time: stopForm.stop_time,
            stop_location: stopForm.stop_type === "store" ? (stopForm.store_name ?? "") : stopForm.stop_location,
            store_name: stopForm.stop_type === "store" ? stopForm.store_name : null,
            confirmed: false,
            disputed: false,
            dispute_reason: null,
            price_per_bag: null,
            discount_status: "none",
            is_credit_approved: false,
          }
          setLocalStops(prev => [...prev, newStop])
        }
      } else {
        const updateData: Record<string, unknown> = {
          stop_type: stopForm.stop_type,
          quantity_offloaded: stopForm.quantity_offloaded,
          stop_time: stopForm.stop_time,
        }
        if (stopForm.stop_type === "customer") {
          updateData.broker_id = stopForm.broker_id
          updateData.customer_id = stopForm.customer_id
          updateData.stop_location = stopForm.stop_location
          updateData.store_name = null
        } else {
          updateData.store_name = stopForm.store_name
          updateData.stop_location = stopForm.store_name
          updateData.broker_id = null
          updateData.customer_id = null
        }

        const { error } = await apiMutate("trips", {
          action: "update",
          table: "Stops",
          data: updateData,
          filters: { stop_id: stopForm.stop_id! },
        })

        if (error) {
          setMessage("Failed to update stop: " + error)
          return
        }

        setLocalStops(prev => prev.map(s => {
          if (s.stop_id !== stopForm.stop_id) return s
          return {
            ...s,
            stop_type: stopForm.stop_type,
            broker_id: stopForm.stop_type === "customer" ? stopForm.broker_id : null,
            broker_name: stopForm.stop_type === "customer" ? allBrokers.find(b => b.broker_id === stopForm.broker_id)?.broker_name ?? null : null,
            customer_id: stopForm.stop_type === "customer" ? stopForm.customer_id : null,
            customer_name: stopForm.stop_type === "customer" ? stopForm.customer_name ?? "Not provided" : null,
            store_name: stopForm.stop_type === "store" ? stopForm.store_name : null,
            quantity_offloaded: stopForm.quantity_offloaded,
            stop_location: stopForm.stop_type === "store" ? (stopForm.store_name ?? "") : stopForm.stop_location,
            stop_time: stopForm.stop_time,
          }
        }))
      }

      setStopForm(null)
    } catch {
      setMessage("Network error, please try again")
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveDisc() {
    if (!discForm) return

    if (discForm.shortage <= 0 && discForm.caked_bags <= 0) {
      setMessage("Enter at least one quantity")
      return
    }
    if (wouldExceedDisc(discForm.shortage, discForm.caked_bags, !discForm.isNew, discForm.discrepancy_id)) {
      setMessage("Cannot save — would exceed loaded quantity")
      return
    }

    setSaving(true)
    setMessage("")

    try {
      if (discForm.isNew) {
        const { data, error } = await apiMutate("trips", {
          action: "insert",
          table: "trip_discrepancies",
          data: {
            trip_id: trip.trip_id,
            driver_id: null,
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
          setLocalDiscrepancies(prev => [...prev, {
            discrepancy_id: inserted.discrepancy_id,
            trip_id: trip.trip_id,
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

        setLocalDiscrepancies(prev => prev.map(d => {
          if (d.discrepancy_id !== discForm.discrepancy_id) return d
          return {
            ...d,
            shortage: discForm.shortage,
            caked_bags: discForm.caked_bags,
            notes: discForm.notes.trim() || null,
          }
        }))
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
    try {
      const { error } = await apiMutate("trips", {
        action: "delete",
        table: "trip_discrepancies",
        filters: { discrepancy_id: id },
      })

      if (error) {
        setMessage("Failed to delete: " + error)
        return
      }

      setLocalDiscrepancies(prev => prev.filter(d => d.discrepancy_id !== id))
      setConfirmDeleteId(null)
    } catch {
      setMessage("Network error, please try again")
    } finally {
      setSaving(false)
    }
  }

  const showOverview = !stopForm && !discForm

  return (
    <div onClick={() => { const ok = !isOverLimit && !saving; if (ok) onClose(); }} style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 100, padding: isMobile ? 0 : 24, animation: "fadeIn 0.2s ease-out" }}>
      <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
      <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: isMobile ? "20px 20px 0 0" : 12, padding: isMobile ? "28px 20px" : 32, width: "100%", maxWidth: stopForm || discForm ? 560 : 600, maxHeight: isMobile ? "90vh" : "85vh", overflowY: "auto", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)", animation: "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)" }}>

        {/* ─── Overview ─── */}
        {showOverview && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h3 style={{ margin: "0 0 4px 0", color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>Edit Trip</h3>
                <p style={{ margin: 0, color: "#94a3b8", fontSize: FONT_SIZE.sm }}>{trip.plate_number}</p>
              </div>
              <button onClick={onClose} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 0, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {/* Summary */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20, padding: 14, background: isOverLimit ? "#fef2f2" : hasRemaining ? "#fffbeb" : "#f0fdf4", border: `1.5px solid ${isOverLimit ? "#fecaca" : hasRemaining ? "#fde68a" : "#bbf7d0"}`, borderRadius: 10 }}>
              <div>
                <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#64748b" }}>Loaded</p>
                <p style={{ margin: "2px 0 0", fontWeight: 700, fontSize: FONT_SIZE.md, color: "#0f172a" }}>{trip.loaded_quantity} bags</p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#64748b" }}>Offloaded</p>
                <p style={{ margin: "2px 0 0", fontWeight: 700, fontSize: FONT_SIZE.md, color: "#0f172a" }}>{totalOffloaded} bags</p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#64748b" }}>Discrepancy</p>
                <p style={{ margin: "2px 0 0", fontWeight: 700, fontSize: FONT_SIZE.md, color: totalDiscrepancy > 0 ? "#f59e0b" : "#0f172a" }}>{totalDiscrepancy} bags</p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: isOverLimit ? "#ef4444" : hasRemaining ? "#f59e0b" : "#16a34a" }}>Remaining</p>
                <p style={{ margin: "2px 0 0", fontWeight: 700, fontSize: FONT_SIZE.md, color: isOverLimit ? "#b91c1c" : hasRemaining ? "#b45309" : "#15803d" }}>{remaining} bags</p>
              </div>
            </div>

            {isOverLimit && (
              <div style={{ padding: "8px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, marginBottom: 16, fontSize: FONT_SIZE.xs, color: "#b91c1c", fontWeight: 600 }}>
                Total exceeds loaded quantity by {Math.abs(remaining)} bags. Reduce quantities before closing.
              </div>
            )}

            {/* Stops Section */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h4 style={{ margin: 0, fontSize: FONT_SIZE.base, fontWeight: 700, color: "#0f172a" }}>Stops ({localStops.length})</h4>
              <button onClick={openAddStop} style={{ padding: "6px 12px", background: "#eff6ff", color: "#0070f3", border: "1px solid #bfdbfe", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.xs, display: "flex", alignItems: "center", gap: 4 }}>
                <Icon icon="mdi:plus" width={14} /> Add Stop
              </button>
            </div>

            {localStops.length === 0 ? (
              <div style={{ padding: 24, background: "#f8fafc", borderRadius: 8, border: "1px dashed #e2e8f0", textAlign: "center", marginBottom: 20 }}>
                <p style={{ margin: 0, color: "#94a3b8", fontSize: FONT_SIZE.sm }}>No stops logged yet</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                {[...localStops].sort((a, b) => new Date(a.stop_time).getTime() - new Date(b.stop_time).getTime()).map((stop, idx) => (
                  <div key={stop.stop_id} style={{ padding: 12, border: `1px solid ${stop.confirmed ? "#bbf7d0" : stop.disputed ? "#fca5a5" : "#e2e8f0"}`, borderRadius: 8, background: stop.confirmed ? "#f0fdf4" : stop.disputed ? "#fef2f2" : "#f8fafc" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <span style={{ fontWeight: 600, fontSize: FONT_SIZE.sm, color: "#0f172a" }}>Stop {idx + 1}</span>
                          <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: stop.stop_type === "customer" ? "#eff6ff" : "#f3e5f5", color: stop.stop_type === "customer" ? "#0070f3" : "#7c3aed", fontWeight: 600 }}>
                            {stop.stop_type === "customer" ? "Customer" : "Store"}
                          </span>
                          {stop.confirmed && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "#f0fdf4", color: "#16a34a", fontWeight: 600 }}>Confirmed</span>}
                          {stop.disputed && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "#fef2f2", color: "#ef4444", fontWeight: 600 }}>Disputed</span>}
                        </div>
                        <p style={{ margin: "2px 0", fontSize: FONT_SIZE.xs, color: "#475569" }}>
                          {stop.stop_type === "customer" ? `${stop.broker_name ?? "Unknown"} — ${stop.customer_name ?? "Not provided"}` : stop.store_name || stop.stop_location}
                        </p>
                        <p style={{ margin: "2px 0", fontSize: FONT_SIZE.xs, color: "#64748b" }}>{stop.quantity_offloaded} bags</p>
                      </div>
                      <button onClick={() => openEditStop(stop)} style={{ padding: "6px 12px", background: "white", color: "#0070f3", border: "1px solid #bfdbfe", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.xs, whiteSpace: "nowrap" }}>
                        Edit
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Discrepancies Section */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h4 style={{ margin: 0, fontSize: FONT_SIZE.base, fontWeight: 700, color: "#0f172a" }}>Discrepancies ({localDiscrepancies.length})</h4>
              <button onClick={openAddDisc} style={{ padding: "6px 12px", background: "#fffbeb", color: "#b45309", border: "1px solid #fde68a", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.xs, display: "flex", alignItems: "center", gap: 4 }}>
                <Icon icon="mdi:plus" width={14} /> Add Discrepancy
              </button>
            </div>

            {localDiscrepancies.length === 0 ? (
              <div style={{ padding: 24, background: "#f8fafc", borderRadius: 8, border: "1px dashed #e2e8f0", textAlign: "center", marginBottom: 20 }}>
                <p style={{ margin: 0, color: "#94a3b8", fontSize: FONT_SIZE.sm }}>No discrepancies recorded</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                {localDiscrepancies.map((disc) => (
                  <div key={disc.discrepancy_id} style={{ padding: 12, border: "1px solid #fde68a", borderRadius: 8, background: "#fffbeb" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        {disc.shortage > 0 && <p style={{ margin: "0 0 2px", fontSize: FONT_SIZE.sm, color: "#ef4444", fontWeight: 600 }}>Shortage: {disc.shortage} bags</p>}
                        {disc.caked_bags > 0 && <p style={{ margin: "0 0 2px", fontSize: FONT_SIZE.sm, color: "#b45309", fontWeight: 600 }}>Caked: {disc.caked_bags} bags</p>}
                        {disc.notes && <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.xs, color: "#64748b" }}>{disc.notes}</p>}
                      </div>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button onClick={() => openEditDisc(disc)} style={{ padding: "4px 10px", background: "white", color: "#b45309", border: "1px solid #fde68a", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.xs }}>
                          Edit
                        </button>
                        {confirmDeleteId === disc.discrepancy_id ? (
                          <div style={{ display: "flex", gap: 4 }}>
                            <button onClick={() => handleDeleteDisc(disc.discrepancy_id)} disabled={saving} style={{ padding: "4px 10px", background: "#ef4444", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.xs }}>
                              {saving ? "..." : "Yes"}
                            </button>
                            <button onClick={() => setConfirmDeleteId(null)} style={{ padding: "4px 10px", background: "white", color: "#64748b", border: "1px solid #e2e8f0", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.xs }}>
                              No
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setConfirmDeleteId(disc.discrepancy_id)} style={{ padding: "4px 10px", background: "white", color: "#ef4444", border: "1px solid #fecaca", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.xs }}>
                            Delete
                          </button>
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

            <button onClick={() => { if (!isOverLimit && !saving) onClose(); }} style={{ width: "100%", padding: "12px 16px", background: isOverLimit ? "#94a3b8" : "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: isOverLimit ? "not-allowed" : "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, minHeight: 44, transition: "background 0.2s" }}>
              {isOverLimit ? "Fix over-limit to close" : "Done"}
            </button>
          </>
        )}

        {/* ─── Stop Edit Sub-Modal ─── */}
        {stopForm && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>{stopForm.isNew ? "Add Stop" : "Edit Stop"}</h3>
              <button onClick={() => setStopForm(null)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 0, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {/* Stop Type Toggle */}
            <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
              {(["customer", "store"] as const).map((type) => (
                <button key={type} onClick={() => setStopForm({ ...stopForm, stop_type: type })} style={{ flex: 1, padding: "8px 0", borderRadius: 6, cursor: "pointer", border: `1.5px solid ${stopForm.stop_type === type ? "#0070f3" : "#e2e8f0"}`, fontSize: FONT_SIZE.xs, fontWeight: stopForm.stop_type === type ? 700 : 500, background: stopForm.stop_type === type ? "#0070f3" : "white", color: stopForm.stop_type === type ? "white" : "#475569", transition: "all 0.15s" }}>
                  {type === "customer" ? "Customer" : "Store"}
                </button>
              ))}
            </div>

            {/* Customer fields */}
            {stopForm.stop_type === "customer" && (
              <>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#475569", marginBottom: 4 }}>Broker *</label>
                  <select value={stopForm.broker_id || ""} onChange={e => setStopForm({ ...stopForm, broker_id: e.target.value || null })} style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 6, fontSize: FONT_SIZE.sm, boxSizing: "border-box", background: "white" }}>
                    <option value="">Select broker...</option>
                    {allBrokers.map(b => <option key={b.broker_id} value={b.broker_id}>{b.broker_name}</option>)}
                  </select>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#475569", marginBottom: 4 }}>Customer</label>
                  <CustomerSelector onSelect={(c) => setStopForm({ ...stopForm, customer_id: c.customer_id || null, customer_name: c.full_name || null })} initialValue={stopForm.customer_name || ""} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#475569", marginBottom: 4 }}>Stop Location *</label>
                  <input type="text" value={stopForm.stop_location} onChange={e => setStopForm({ ...stopForm, stop_location: e.target.value })} placeholder="e.g. Aba Road, beside GTBank" style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 6, fontSize: FONT_SIZE.sm, boxSizing: "border-box" }} />
                </div>
              </>
            )}

            {/* Store fields */}
            {stopForm.stop_type === "store" && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#475569", marginBottom: 4 }}>Store *</label>
                <select value={stopForm.store_name || ""} onChange={e => setStopForm({ ...stopForm, store_name: e.target.value || null })} style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 6, fontSize: FONT_SIZE.sm, boxSizing: "border-box", background: "white" }}>
                  <option value="">Select store...</option>
                  {storeLocations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                </select>
              </div>
            )}

            {/* Quantity */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#475569", marginBottom: 4 }}>Bags Offloaded *</label>
              <input type="number" min={1} value={stopForm.quantity_offloaded || ""} onChange={e => setStopForm({ ...stopForm, quantity_offloaded: parseInt(e.target.value) || 0 })} placeholder="e.g. 200" style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 6, fontSize: FONT_SIZE.sm, boxSizing: "border-box" }} />
            </div>

            {/* Stop Time */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#475569", marginBottom: 4 }}>Stop Date</label>
              <input type="date" value={stopForm.stop_time ? new Date(stopForm.stop_time).toISOString().slice(0, 10) : ""} onChange={e => { const val = e.target.value; if (!val) { setStopForm({ ...stopForm, stop_time: "" }); return; } const base = stopForm.stop_time ? new Date(stopForm.stop_time) : new Date(); setStopForm({ ...stopForm, stop_time: `${val}T${base.getHours().toString().padStart(2, '0')}:${base.getMinutes().toString().padStart(2, '0')}` }); }} style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 6, fontSize: FONT_SIZE.sm, boxSizing: "border-box" }} />
            </div>

            {message && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#ef4444", marginBottom: 14, fontSize: FONT_SIZE.sm, padding: "8px 12px", background: "#fef2f2", borderRadius: 6, border: "1px solid #fecaca" }}>
                <Icon icon="mdi:alert-circle" width={16} /> {message}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => setStopForm(null)} disabled={saving} style={{ padding: "12px 16px", background: "white", color: "#475569", border: "1px solid #cbd5e1", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, minHeight: 44 }}>
                Cancel
              </button>
              <button onClick={handleSaveStop} disabled={saving || loadingData} style={{ padding: "12px 16px", background: saving ? "#94a3b8" : "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: saving ? "not-allowed" : "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </>
        )}

        {/* ─── Discrepancy Edit Sub-Modal ─── */}
        {discForm && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>{discForm.isNew ? "Add Discrepancy" : "Edit Discrepancy"}</h3>
              <button onClick={() => setDiscForm(null)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 0, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#475569", marginBottom: 4 }}>Shortage (bags)</label>
              <input type="number" min={0} value={discForm.shortage || ""} onChange={e => setDiscForm({ ...discForm, shortage: parseInt(e.target.value) || 0 })} placeholder="0" style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 6, fontSize: FONT_SIZE.sm, boxSizing: "border-box" }} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#475569", marginBottom: 4 }}>Caked Bags</label>
              <input type="number" min={0} value={discForm.caked_bags || ""} onChange={e => setDiscForm({ ...discForm, caked_bags: parseInt(e.target.value) || 0 })} placeholder="0" style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 6, fontSize: FONT_SIZE.sm, boxSizing: "border-box" }} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#475569", marginBottom: 4 }}>Type</label>
              <select value={discForm.discrepancy_type} onChange={e => setDiscForm({ ...discForm, discrepancy_type: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 6, fontSize: FONT_SIZE.sm, boxSizing: "border-box", background: "white" }}>
                <option value="shortage">Shortage</option>
                <option value="caked">Caked</option>
                <option value="both">Both</option>
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#475569", marginBottom: 4 }}>Notes</label>
              <textarea value={discForm.notes} onChange={e => setDiscForm({ ...discForm, notes: e.target.value })} placeholder="Optional notes..." rows={3} style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 6, fontSize: FONT_SIZE.sm, boxSizing: "border-box", resize: "vertical" }} />
            </div>

            {message && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#ef4444", marginBottom: 14, fontSize: FONT_SIZE.sm, padding: "8px 12px", background: "#fef2f2", borderRadius: 6, border: "1px solid #fecaca" }}>
                <Icon icon="mdi:alert-circle" width={16} /> {message}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => setDiscForm(null)} disabled={saving} style={{ padding: "12px 16px", background: "white", color: "#475569", border: "1px solid #cbd5e1", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, minHeight: 44 }}>
                Cancel
              </button>
              <button onClick={handleSaveDisc} disabled={saving} style={{ padding: "12px 16px", background: saving ? "#94a3b8" : "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: saving ? "not-allowed" : "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
