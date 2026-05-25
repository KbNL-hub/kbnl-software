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
  confirmed: boolean
}

export default function BrokerDashboard() {
  const [brokerId, setBrokerId] = useState<string | null>(null)
  const [brokerName, setBrokerName] = useState("")
  const [unconfirmedStops, setUnconfirmedStops] = useState<Stop[]>([])
  const [recentConfirmed, setRecentConfirmed] = useState<Stop[]>([])
  const [selectedStop, setSelectedStop] = useState<Stop | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [pricePerBag, setPricePerBag] = useState("")
  const [disputingStop, setDisputingStop] = useState<Stop | null>(null)
  const [disputeReason, setDisputeReason] = useState("")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)

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
    // Fetch unconfirmed stops
    const { data: unconfirmed } = await supabase
      .from("Stops")
      .select("stop_id, trip_id, customer_id, quantity_offloaded, stop_location, stop_time, confirmed, disputed")
      .eq("broker_id", bId)
      .eq("confirmed", false)
      .eq("disputed", false)
      .order("stop_time", { ascending: false })

    // Fetch last 3 confirmed stops
    const { data: confirmed } = await supabase
      .from("Stops")
      .select("stop_id, trip_id, customer_id, quantity_offloaded, stop_location, stop_time, confirmed")
      .eq("broker_id", bId)
      .eq("confirmed", true)
      .order("updated_at", { ascending: false })
      .limit(3)

    const enrich = async (stops: any[]) => {
      return await Promise.all(stops.map(async (stop) => {
        // Get plate number from trip
        const { data: trip } = await supabase
          .from("Trips")
          .select("plate_number")
          .eq("trip_id", stop.trip_id)
          .single()

        // Get customer name
        console.log("customer_id:", stop.customer_id, typeof stop.customer_id)
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
          customer_name: customerName,
        }
      }))
    }

    setUnconfirmedStops(await enrich(unconfirmed || []))
    setRecentConfirmed(await enrich(confirmed || []))
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
          style={{
            padding: "6px 14px", background: "#ff4444", color: "white",
            border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13
          }}
        >
          Logout
        </button>
      </div>

      {/* Unconfirmed Stops */}
      <h2 style={{ marginBottom: 16 }}>Pending Confirmation</h2>

      {unconfirmedStops.length === 0 && (
        <p style={{ color: "#888", marginBottom: 32 }}>No pending stops.</p>
      )}

      {unconfirmedStops.map((stop) => (
        <div
          key={stop.stop_id}
          style={{
            background: "white", border: "1px solid #eee", borderRadius: 12,
            padding: 16, marginBottom: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.05)"
          }}
        >
          <p style={{ margin: 0, fontWeight: "bold" }}>{stop.plate_number}</p>
          <p style={{ margin: "4px 0", fontSize: 13, color: "#555" }}>{stop.stop_location}</p>
          <p style={{ margin: "4px 0", fontSize: 13, color: "#555" }}>
            {stop.quantity_offloaded} bags
          </p>
          <p style={{ margin: "4px 0", fontSize: 12, color: "#888" }}>
                Customer: {stop.customer_name}
              </p>
          <p style={{ margin: "4px 0", fontSize: 12, color: "#aaa" }}>
            {new Date(stop.stop_time).toLocaleString()}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => openConfirmModal(stop)}
              style={{
                padding: "8px 16px", background: "#0070f3", color: "white",
                border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13,
                whiteSpace: "nowrap"
              }}
            >
              Confirm
            </button>
            <button
              onClick={() => { setDisputingStop(stop); setDisputeReason(""); setMessage("") }}
              style={{
                padding: "8px 16px", background: "white", color: "#ff4444",
                border: "1px solid #ff4444", borderRadius: 6, cursor: "pointer", fontSize: 13,
                whiteSpace: "nowrap"
              }}
            >
              Dispute
            </button>
          </div>
        </div>
      ))}

      {/* Recent Confirmed */}
      {recentConfirmed.length > 0 && (
        <>
          <h2 style={{ marginBottom: 16, marginTop: 32 }}>Recently Confirmed</h2>
          {recentConfirmed.map((stop) => (
            <div
              key={stop.stop_id}
              style={{
                background: "#f9f9f9", border: "1px solid #eee", borderRadius: 12,
                padding: 16, marginBottom: 12, opacity: 0.8
              }}
            >
              <p style={{ margin: 0, fontWeight: "bold" }}>{stop.plate_number}</p>
              <p style={{ margin: "4px 0", fontSize: 13, color: "#555" }}>{stop.stop_location}</p>
              <p style={{ margin: "4px 0", fontSize: 13, color: "#555" }}>
                {stop.quantity_offloaded} bags
              </p>
              <p style={{ margin: "4px 0", fontSize: 12, color: "#888" }}>
                Customer: {stop.customer_name}
              </p>
              <p style={{ margin: "4px 0", fontSize: 12, color: "#aaa" }}>
                {new Date(stop.stop_time).toLocaleString()}
              </p>
              <p style={{ margin: "4px 0", fontSize: 12, color: "#00aa00", fontWeight: "bold" }}>
                ✅ Confirmed
              </p>
            </div>
          ))}
        </>
      )}

      {/* Confirmation Modal */}
      {selectedStop && (
        <div
          onClick={closeModal}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 100
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white", borderRadius: 12, padding: 32,
              width: 400, maxWidth: "90vw", maxHeight: "90vh",
              overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.2)"
            }}
          >
            <h3 style={{ marginBottom: 4 }}>Confirm Stop</h3>
            <p style={{ color: "#888", fontSize: 13, marginBottom: 20 }}>
              {selectedStop.plate_number} — {selectedStop.stop_location}
            </p>

            <div style={{ marginBottom: 16, padding: 12, background: "#f9f9f9", borderRadius: 8 }}>
              <p style={{ margin: 0, fontSize: 13 }}>
                <strong>Bags:</strong> {selectedStop.quantity_offloaded}
              </p>
              <p style={{ margin: "4px 0 0", fontSize: 13 }}>
                <strong>Driver's Customer:</strong> {selectedStop.customer_name}
              </p>
            </div>

            {/* Customer selector */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>
                Correct Customer (if different)
              </label>
              <CustomerSelector onSelect={(c) => setSelectedCustomer(c)} />
            </div>

            {/* Price per bag */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>
                Price Per Bag (₦) *
              </label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="e.g. 10,500"
                value={pricePerBag}
                onChange={(e) => { setPricePerBag(formatAmount(e.target.value)); setMessage("") }}
                style={{ width: "100%", padding: 10, boxSizing: "border-box" }}
              />
            </div>

            {message && (
              <p style={{ color: "red", marginBottom: 12, fontWeight: "bold" }}>{message}</p>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleConfirm}
                disabled={submitting}
                style={{
                  flex: 1, padding: "10px 0", background: "#0070f3",
                  color: "white", border: "none", borderRadius: 6,
                  cursor: submitting ? "not-allowed" : "pointer"
                }}
              >
                {submitting ? "Confirming..." : "Confirm Stop"}
              </button>
              <button
                onClick={closeModal}
                style={{
                  flex: 1, padding: "10px 0", background: "white",
                  color: "#333", border: "1px solid #ddd", borderRadius: 6,
                  cursor: "pointer"
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dispute Modal */}
      {disputingStop && (
        <div
          onClick={() => setDisputingStop(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 100
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white", borderRadius: 12, padding: 32,
              width: 400, maxWidth: "90vw",
              boxShadow: "0 8px 32px rgba(0,0,0,0.2)"
            }}
          >
            <h3 style={{ marginBottom: 4, color: "#ff4444" }}>Dispute Stop</h3>
            <p style={{ color: "#888", fontSize: 13, marginBottom: 20 }}>
              {disputingStop.plate_number} — {disputingStop.stop_location}
            </p>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>
                Reason for Dispute *
              </label>
              <textarea
                placeholder="e.g. This stop does not belong to me. The correct broker is..."
                value={disputeReason}
                onChange={(e) => { setDisputeReason(e.target.value); setMessage("") }}
                rows={4}
                style={{
                  width: "100%", padding: 10, boxSizing: "border-box",
                  borderRadius: 6, border: "1px solid #ddd", fontSize: 14,
                  resize: "vertical"
                }}
              />
            </div>

            {message && (
              <p style={{ color: "red", marginBottom: 12, fontWeight: "bold" }}>{message}</p>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleDispute}
                disabled={submitting}
                style={{
                  flex: 1, padding: "10px 0", background: "#ff4444",
                  color: "white", border: "none", borderRadius: 6,
                  cursor: submitting ? "not-allowed" : "pointer"
                }}
              >
                {submitting ? "Submitting..." : "Submit Dispute"}
              </button>
              <button
                onClick={() => setDisputingStop(null)}
                style={{
                  flex: 1, padding: "10px 0", background: "white",
                  color: "#333", border: "1px solid #ddd", borderRadius: 6,
                  cursor: "pointer"
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}