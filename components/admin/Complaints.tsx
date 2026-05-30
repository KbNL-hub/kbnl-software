"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"

type Complaint = {
  complaint_id: string
  driver_name: string
  plate_number: string
  kbnl_truck_no: string | null
  complaint_type: string
  notes: string
  reported_at: string
  resolved: boolean
  trip_id: string | null
}

const filters = ["Unresolved", "All", "Resolved"]

export default function Complaints() {
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("Unresolved")
  const [resolving, setResolving] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  useEffect(() => {
    fetchComplaints()
    const interval = setInterval(fetchComplaints, 30000)
    return () => clearInterval(interval)
  }, [])

  async function fetchComplaints() {
    const { data: raw } = await supabase
      .from("driver_complaints")
      .select("complaint_id, driver_id, plate_number, complaint_type, notes, reported_at, resolved, trip_id")
      .order("reported_at", { ascending: false })

    if (!raw) return

    const enriched = await Promise.all(raw.map(async (c) => {
      const { data: driver } = await supabase
        .from("Drivers").select("full_name").eq("driver_id", c.driver_id).single()

      const { data: truck } = await supabase
        .from("Trucks").select("kbnl_truck_no").eq("plate_number", c.plate_number).single()

      return {
        complaint_id: c.complaint_id,
        driver_name: driver?.full_name ?? "Unknown",
        plate_number: c.plate_number,
        kbnl_truck_no: truck?.kbnl_truck_no ?? null,
        complaint_type: c.complaint_type,
        notes: c.notes,
        reported_at: c.reported_at,
        resolved: c.resolved ?? false,
        trip_id: c.trip_id,
      }
    }))

    setComplaints(enriched)
    setLastUpdated(new Date())
    setLoading(false)
  }

  async function handleResolve(complaint_id: string) {
    setResolving(complaint_id)
    const { error } = await supabase
      .from("driver_complaints")
      .update({ resolved: true })
      .eq("complaint_id", complaint_id)

    if (error) {
      console.error("Resolve error:", error)
      setResolving(null)
      return
    }

    setResolving(null)
    fetchComplaints()
  }

  const filtered = filter === "All"
    ? complaints
    : filter === "Resolved"
    ? complaints.filter(c => c.resolved)
    : complaints.filter(c => !c.resolved)

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>Driver Complaints</h2>
        <div style={{ fontSize: 12, color: "#888", display: "flex", alignItems: "center", gap: 12 }}>
          {lastUpdated && `Updated: ${lastUpdated.toLocaleTimeString()}`}
          <button
            onClick={fetchComplaints}
            style={{ padding: "4px 12px", fontSize: 12, cursor: "pointer", borderRadius: 4, border: "1px solid #ddd", background: "white" }}
          >
            Refresh
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {filters.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "6px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer",
              border: "1px solid #ddd",
              background: filter === f ? "#0070f3" : "white",
              color: filter === f ? "white" : "#333",
              fontWeight: filter === f ? "bold" : "normal"
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {loading && <p style={{ color: "#888" }}>Loading...</p>}
      {!loading && filtered.length === 0 && <p style={{ color: "#888" }}>No {filter.toLowerCase()} complaints.</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {filtered.map(c => (
          <div
            key={c.complaint_id}
            style={{
              background: "white", borderRadius: 12, padding: 20,
              border: `1px solid ${c.resolved ? "#eee" : "#f5a62344"}`,
              boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
              opacity: c.resolved ? 0.7 : 1
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <p style={{ margin: 0, fontWeight: "bold", fontSize: 15 }}>{c.driver_name}</p>
                <p style={{ margin: "2px 0 0", fontSize: 13, color: "#555" }}>
                  {c.plate_number}{c.kbnl_truck_no ? ` · #${c.kbnl_truck_no}` : ""}
                </p>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "#aaa" }}>{new Date(c.reported_at).toLocaleString()}</p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                <span style={{
                  padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: "bold",
                  background: c.resolved ? "#00aa0022" : "#f5a62322",
                  color: c.resolved ? "#00aa00" : "#f5a623"
                }}>
                  {c.resolved ? "Resolved" : "Open"}
                </span>
                <span style={{
                  padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: "bold",
                  background: "#0070f322", color: "#0070f3"
                }}>
                  {c.complaint_type}
                </span>
              </div>
            </div>

            <p style={{ margin: "0 0 12px", fontSize: 14, color: "#333", lineHeight: 1.5 }}>{c.notes}</p>

            {c.trip_id && (
              <p style={{ margin: "0 0 12px", fontSize: 12, color: "#888" }}>
                Trip: <span style={{ fontFamily: "monospace" }}>{c.trip_id}</span>
              </p>
            )}

            {!c.resolved && (
              <button
                onClick={() => handleResolve(c.complaint_id)}
                disabled={resolving === c.complaint_id}
                style={{
                  padding: "8px 20px", background: "#00aa00", color: "white",
                  border: "none", borderRadius: 6, cursor: resolving === c.complaint_id ? "not-allowed" : "pointer",
                  fontWeight: "bold", fontSize: 13
                }}
              >
                {resolving === c.complaint_id ? "Resolving..." : "Mark as Resolved"}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}