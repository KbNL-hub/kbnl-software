"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"

type Broker = {
  broker_id: string
  broker_name: string
}

type Props = {
  stopId: string
  onReassigned: () => void
}

export default function ReassignBroker({ stopId, onReassigned }: Props) {
  const [brokers, setBrokers] = useState<Broker[]>([])
  const [selectedBrokerId, setSelectedBrokerId] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState("")
  const [done, setDone] = useState(false)

  useEffect(() => {
    async function fetchBrokers() {
      const { data } = await supabase
        .from("Brokers")
        .select("broker_id, broker_name")
        .order("broker_name", { ascending: true })
      setBrokers(data || [])
    }
    fetchBrokers()
  }, [])

  async function handleReassign() {
    if (!selectedBrokerId) return setMessage("Select a broker")
    setSubmitting(true)

    const { error } = await supabase
      .from("Stops")
      .update({
        broker_id: selectedBrokerId,
        disputed: false,
        dispute_reason: null,
        disputed_by: null,
        confirmed: false,
      })
      .eq("stop_id", stopId)

    setSubmitting(false)

    if (error) {
      setMessage("Failed to reassign")
      return
    }

    setDone(true)
    setMessage("✅ Stop reassigned successfully")
    setTimeout(() => onReassigned(), 1500)
  }

  async function handleResolve() {
    setSubmitting(true)

    const { error } = await supabase
      .from("Stops")
      .update({
        disputed: false,
        dispute_reason: null,
        disputed_by: null,
        confirmed: true,
      })
      .eq("stop_id", stopId)

    setSubmitting(false)

    if (error) {
      setMessage("Failed to resolve dispute")
      return
    }

    setDone(true)
    setMessage("✅ Dispute resolved")
    setTimeout(() => onReassigned(), 1500)
  }

  if (done) return (
    <p style={{ marginTop: 8, fontSize: 13, fontWeight: "bold", color: "#00aa00" }}>
      {message}
    </p>
  )

  return (
    <div style={{ marginTop: 12 }}>
      {/* Reassign */}
      <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: "bold" }}>Reassign to different broker:</p>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <select
          value={selectedBrokerId}
          onChange={(e) => setSelectedBrokerId(e.target.value)}
          style={{ flex: 1, padding: 8, borderRadius: 4, border: "1px solid #ddd", fontSize: 13 }}
        >
          <option value="">Select broker</option>
          {brokers.map((b) => (
            <option key={b.broker_id} value={b.broker_id}>{b.broker_name}</option>
          ))}
        </select>
        <button
          onClick={handleReassign}
          disabled={submitting}
          style={{
            padding: "8px 14px", background: "#0070f3", color: "white",
            border: "none", borderRadius: 4,
            cursor: submitting ? "not-allowed" : "pointer", fontSize: 13
          }}
        >
          {submitting ? "..." : "Reassign"}
        </button>
      </div>

      {/* Resolve without reassigning */}
      <button
        onClick={handleResolve}
        disabled={submitting}
        style={{
          width: "100%", padding: "8px 0", background: "white",
          color: "#00aa00", border: "1px solid #00aa00",
          borderRadius: 4, cursor: submitting ? "not-allowed" : "pointer",
          fontSize: 13
        }}
      >
        Mark as Resolved (keep original broker)
      </button>

      {message && !done && (
        <p style={{ color: "red", fontSize: 12, marginTop: 6 }}>{message}</p>
      )}
    </div>
  )
}