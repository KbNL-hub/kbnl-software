"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { formatAmount, parseAmount } from "@/lib/formatAmount"
import CustomerSelector from "@/components/CustomerSelector"

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

  useEffect(() => {
    initBroker()
  }, [])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        window.location.href = "/login"
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function initBroker() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.href = "/login"; return }
    const user = session.user

    setBrokerId(user.id)

    const { data: profile } = await supabase
      .from("Profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .single()

    if (profile) setBrokerName(profile.full_name)

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
          .from("Trips")
          .select("plate_number, material_centre, ATC")
          .eq("trip_id", stop.trip_id)
          .single()

        let customerName = "Not provided"
        if (stop.customer_id) {
          const { data: customer } = await supabase
            .from("Customers")
            .select("full_name")
            .eq("customer_id", stop.customer_id)
            .single()
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
    setSelectedStop(stop)
    setSelectedCustomer(null)
    setPricePerBag("")
    setMessage("")
  }

  function closeModal() {
    setSelectedStop(null)
    setSelectedCustomer(null)
    setPricePerBag("")
    setMessage("")
  }

  async function handleDispute() {
    if (!disputingStop) return
    if (!disputeReason.trim()) return setMessage("Please provide a reason for the dispute")

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setSubmitting(true)

    const { error } = await supabase
      .from("Stops")
      .update({
        disputed: true,
        dispute_reason: disputeReason,
        disputed_by: user.id,
      })
      .eq("stop_id", disputingStop.stop_id)

    setSubmitting(false)

    if (error) {
      setMessage("Failed to dispute stop")
      return
    }

    setDisputingStop(null)
    setDisputeReason("")
    setMessage("")
    if (brokerId) fetchStops(brokerId)
  }

  async function handleConfirm() {
    if (!selectedStop) return
    if (!pricePerBag) return setMessage("Price per bag is required")

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setSubmitting(true)

    // Update customer on stop if broker selected/corrected one
    const customerIdToSave = selectedCustomer?.customer_id ?? selectedStop.customer_id

    const { error: stopError } = await supabase
      .from("Stops")
      .update({
        confirmed: true,
        customer_id: customerIdToSave,
        updated_by: user.id,
      })
      .eq("stop_id", selectedStop.stop_id)

    if (stopError) {
      setMessage("Failed to confirm stop")
      setSubmitting(false)
      return
    }

    // Insert into Stop_Confirmations
    const { error: confirmError } = await supabase
      .from("Stop_Confirmations")
      .insert([{
        stop_id: selectedStop.stop_id,
        broker_id: brokerId,
        customer_id: customerIdToSave,
        price_per_bag: parseAmount(pricePerBag),
      }])

    setSubmitting(false)

    if (confirmError) {
      setMessage("Stop updated but confirmation record failed")
      return
    }

    if (confirmError) {
      console.error("Confirmation error:", JSON.stringify(confirmError))
      setMessage("Stop updated but confirmation record failed")
      return
    }

    closeModal()
    if (brokerId) fetchStops(brokerId)
  }

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <p>Loading...</p>
    </div>
  )

  const pendingStops = allStops.filter(s => !s.confirmed && !s.disputed)
  const confirmedStops = allStops.filter(s => s.confirmed)
  const disputedStops = allStops.filter(s => s.disputed)

  const visibleStops =
    activeFilter === "pending" ? pendingStops :
    activeFilter === "confirmed" ? confirmedStops : disputedStops

  const filterOptions: { key: "pending" | "confirmed" | "disputed"; label: string; count: number }[] = [
    { key: "pending", label: "Pending", count: pendingStops.length },
    { key: "confirmed", label: "Confirmed", count: confirmedStops.length },
    { key: "disputed", label: "Disputed", count: disputedStops.length },
  ]

  const pillColor = (key: string) => {
    if (key !== activeFilter) return { bg: "white", color: "#333", border: "#ddd" }
    if (key === "confirmed") return { bg: "#00aa00", color: "white", border: "#00aa00" }
    if (key === "disputed") return { bg: "#ff4444", color: "white", border: "#ff4444" }
    return { bg: "#0070f3", color: "white", border: "#0070f3" }
  }

  return (
    <div style={{ fontFamily: "Arial", maxWidth: 520, margin: "0 auto", padding: "24px 16px" }}>

      {/* Header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 24, paddingBottom: 16, borderBottom: "1px solid #eee"
      }}>
        <div>
          <p style={{ margin: 0, fontSize: 13, color: "#888" }}>Logged in as</p>
          <p style={{ margin: 0, fontWeight: "bold" }}>{brokerName}</p>
        </div>
        <button
          onClick={async () => { await supabase.auth.signOut(); window.location.href = "/login" }}
          style={{ padding: "6px 14px", background: "#ff4444", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
        >
          Logout
        </button>
      </div>

      <h2 style={{ marginBottom: 16 }}>My Stops</h2>

      {/* Filter Pills */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {filterOptions.map(({ key, label, count }) => {
          const { bg, color, border } = pillColor(key)
          return (
            <button
              key={key}
              onClick={() => setActiveFilter(key)}
              style={{
                padding: "6px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer",
                border: `1px solid ${border}`, background: bg, color, fontWeight: activeFilter === key ? "bold" : "normal"
              }}
            >
              {label} {count > 0 && `(${count})`}
            </button>
          )
        })}
      </div>

      {/* Stop Cards */}
      {visibleStops.length === 0 && (
        <p style={{ color: "#888" }}>No {activeFilter} stops.</p>
      )}

      {visibleStops.map((stop) => (
        <div
          key={stop.stop_id}
          style={{
            background: "white", border: "1px solid #eee", borderRadius: 12,
            padding: 16, marginBottom: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.05)"
          }}
        >
          <p style={{ margin: 0, fontWeight: "bold" }}>{stop.plate_number}</p>
          <p style={{ margin: "4px 0", fontSize: 13, color: "#555" }}>{stop.stop_location}</p>
          <p style={{ margin: "4px 0", fontSize: 13, color: "#555" }}>{stop.quantity_offloaded} bags</p>
          <p style={{ margin: "4px 0", fontSize: 12, color: "#888" }}>Customer: {stop.customer_name}</p>
          <p style={{ margin: "4px 0", fontSize: 12, color: "#888" }}>Loading Point: {stop.material_centre}</p>
          {stop.atc && (
            <p style={{ margin: "4px 0", fontSize: 12, color: "#888" }}>ATC: {stop.atc}</p>
          )}
          <p style={{ margin: "4px 0", fontSize: 12, color: "#aaa" }}>{new Date(stop.stop_time).toLocaleString()}</p>

          {activeFilter === "pending" && (
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                onClick={() => openConfirmModal(stop)}
                style={{ padding: "8px 16px", background: "#0070f3", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
              >
                Confirm
              </button>
              <button
                onClick={() => { setDisputingStop(stop); setDisputeReason(""); setMessage("") }}
                style={{ padding: "8px 16px", background: "white", color: "#ff4444", border: "1px solid #ff4444", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
              >
                Dispute
              </button>
            </div>
          )}

          {activeFilter === "confirmed" && (
            <p style={{ margin: "8px 0 0", fontSize: 12, color: "#00aa00", fontWeight: "bold" }}>✅ Confirmed</p>
          )}

          {activeFilter === "disputed" && (
            <p style={{ margin: "8px 0 0", fontSize: 12, color: "#ff4444", fontWeight: "bold" }}>⚠️ Disputed</p>
          )}
        </div>
      ))}

      {/* Confirmation Modal */}
      {selectedStop && (
        <div onClick={closeModal} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 12, padding: 32, width: 400, maxWidth: "90vw", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
            <h3 style={{ marginBottom: 4 }}>Confirm Stop</h3>
            <p style={{ color: "#888", fontSize: 13, marginBottom: 20 }}>
              {selectedStop.plate_number} — {selectedStop.stop_location}
            </p>

            <div style={{ marginBottom: 16, padding: 12, background: "#f9f9f9", borderRadius: 8 }}>
              <p style={{ margin: 0, fontSize: 13 }}><strong>Bags:</strong> {selectedStop.quantity_offloaded}</p>
              <p style={{ margin: "4px 0 0", fontSize: 13 }}><strong>Loading Point:</strong> {selectedStop.material_centre}</p>
              {selectedStop.atc && (
                <p style={{ margin: "4px 0 0", fontSize: 13 }}><strong>ATC:</strong> {selectedStop.atc}</p>
              )}
              <p style={{ margin: "4px 0 0", fontSize: 13 }}><strong>Driver's Customer:</strong> {selectedStop.customer_name}</p>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>Correct Customer (if different)</label>
              <CustomerSelector onSelect={(c) => setSelectedCustomer(c)} />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>Price Per Bag (₦) *</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="e.g. 10,500"
                value={pricePerBag}
                onChange={(e) => { setPricePerBag(formatAmount(e.target.value)); setMessage("") }}
                style={{ width: "100%", padding: 10, boxSizing: "border-box" }}
              />
            </div>

            {message && <p style={{ color: "red", marginBottom: 12, fontWeight: "bold" }}>{message}</p>}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleConfirm} disabled={submitting} style={{ flex: 1, padding: "10px 0", background: "#0070f3", color: "white", border: "none", borderRadius: 6, cursor: submitting ? "not-allowed" : "pointer" }}>
                {submitting ? "Confirming..." : "Confirm Stop"}
              </button>
              <button onClick={closeModal} style={{ flex: 1, padding: "10px 0", background: "white", color: "#333", border: "1px solid #ddd", borderRadius: 6, cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dispute Modal */}
      {disputingStop && (
        <div onClick={() => setDisputingStop(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 12, padding: 32, width: 400, maxWidth: "90vw", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
            <h3 style={{ marginBottom: 4, color: "#ff4444" }}>Dispute Stop</h3>
            <p style={{ color: "#888", fontSize: 13, marginBottom: 20 }}>
              {disputingStop.plate_number} — {disputingStop.stop_location}
            </p>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>Reason for Dispute *</label>
              <textarea
                placeholder="e.g. This stop does not belong to me..."
                value={disputeReason}
                onChange={(e) => { setDisputeReason(e.target.value); setMessage("") }}
                rows={4}
                style={{ width: "100%", padding: 10, boxSizing: "border-box", borderRadius: 6, border: "1px solid #ddd", fontSize: 14, resize: "vertical" }}
              />
            </div>

            {message && <p style={{ color: "red", marginBottom: 12, fontWeight: "bold" }}>{message}</p>}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleDispute} disabled={submitting} style={{ flex: 1, padding: "10px 0", background: "#ff4444", color: "white", border: "none", borderRadius: 6, cursor: submitting ? "not-allowed" : "pointer" }}>
                {submitting ? "Submitting..." : "Submit Dispute"}
              </button>
              <button onClick={() => setDisputingStop(null)} style={{ flex: 1, padding: "10px 0", background: "white", color: "#333", border: "1px solid #ddd", borderRadius: 6, cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}