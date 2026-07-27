"use client"

import { FONT_SIZE, POLLING_INTERVAL } from "@/lib/constants"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { Icon } from "@iconify/react"
import { usePermissions } from "@/lib/PermissionContext"

type SideTrip = {
  id: string
  driver_id: string
  plate_number: string
  item_description: string
  created_at: string
  driver_name: string
  kbnl_truck_no: string | null
}

type ViewMode = "card" | "table"

export default function SideTrips() {
  const { getAccess } = usePermissions()
  const canView = getAccess("side-trips").canView
  const [trips, setTrips] = useState<SideTrip[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>("table")

  async function fetchTrips() {
    const { data } = await supabase
      .from("side_trips")
      .select("*")
      .order("created_at", { ascending: false })

    if (!data) {
      setLoading(false)
      return
    }

    const enriched = await Promise.all(
      data.map(async (t) => {
        const [driverRes, truckRes] = await Promise.all([
          supabase.from("Drivers").select("full_name").eq("driver_id", t.driver_id).single(),
          supabase.from("Trucks").select("kbnl_truck_no").eq("plate_number", t.plate_number).single(),
        ])
        return {
          ...t,
          driver_name: driverRes.data?.full_name ?? "Unknown",
          kbnl_truck_no: truckRes.data?.kbnl_truck_no ?? null,
        } as SideTrip
      })
    )

    setTrips(enriched)
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    fetchTrips()
    const interval = setInterval(fetchTrips, POLLING_INTERVAL)
    return () => clearInterval(interval)
  }, [])

  if (!canView) return null

  const tableStyle: React.CSSProperties = {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: FONT_SIZE.sm,
  }

  const thStyle: React.CSSProperties = {
    textAlign: "left",
    padding: "10px 12px",
    borderBottom: "2px solid #e2e8f0",
    color: "#475569",
    fontWeight: 600,
    fontSize: FONT_SIZE.xs,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  }

  const tdStyle: React.CSSProperties = {
    padding: "10px 12px",
    borderBottom: "1px solid #e2e8f0",
    color: "#0f172a",
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, color: "#0f172a", fontSize: "24px", fontWeight: 700 }}>Side Trips</h2>
          <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.sm, color: "#64748b" }}>
            Unofficial trips where drivers carried goods other than cement
          </p>
        </div>
        {!loading && trips.length > 0 && (
          <div style={{ display: "flex", background: "white", border: "1px solid #e2e8f0", borderRadius: 8, padding: 4, gap: 0 }}>
            <button
              onClick={() => setViewMode("card")}
              style={{
                padding: "8px 12px",
                background: viewMode === "card" ? "#0070f3" : "transparent",
                color: viewMode === "card" ? "white" : "#64748b",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: FONT_SIZE.xs,
                fontWeight: 600,
                minWidth: 44,
                height: 40,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode("table")}
              style={{
                padding: "8px 12px",
                background: viewMode === "table" ? "#0070f3" : "transparent",
                color: viewMode === "table" ? "white" : "#64748b",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: FONT_SIZE.xs,
                fontWeight: 600,
                minWidth: 44,
                height: 40,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 4h18v2H3V4zm0 7h18v2H3v-2zm0 7h18v2H3v-2z" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", border: "3px solid #e2e8f0", borderTopColor: "#0070f3", animation: "spin 1s linear infinite" }} />
        </div>
      ) : trips.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 24px" }}>
          <Icon icon="mdi:road-variant" width={48} color="#cbd5e1" style={{ marginBottom: 12 }} />
          <p style={{ margin: 0, color: "#64748b", fontSize: FONT_SIZE.base }}>No side trips reported yet</p>
        </div>
      ) : viewMode === "table" ? (
        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={thStyle}>Driver</th>
                <th style={thStyle}>Truck</th>
                <th style={thStyle}>Item</th>
                <th style={thStyle}>Date</th>
              </tr>
            </thead>
            <tbody>
              {trips.map((trip) => (
                <tr key={trip.id} style={{ transition: "background 0.15s" }} className="side-trip-row">
                  <td style={tdStyle}>
                    <span style={{ fontWeight: 600 }}>{trip.driver_name}</span>
                  </td>
                  <td style={tdStyle}>
                    {trip.plate_number}
                    {trip.kbnl_truck_no ? <span style={{ color: "#94a3b8" }}> · #{trip.kbnl_truck_no}</span> : null}
                  </td>
                  <td style={tdStyle}>
                    <span style={{ padding: "2px 8px", borderRadius: 4, background: "#f0f7ff", color: "#0c4a6e", fontSize: FONT_SIZE.xs, fontWeight: 500 }}>{trip.item_description}</span>
                  </td>
                  <td style={{ ...tdStyle, color: "#64748b", fontSize: FONT_SIZE.xs }}>
                    {new Date(trip.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {trips.map((trip) => (
            <div key={trip.id} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, padding: 14, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: FONT_SIZE.sm, color: "#0f172a" }}>{trip.driver_name}</p>
                <span style={{ padding: "2px 8px", borderRadius: 4, background: "#f0f7ff", color: "#0c4a6e", fontSize: FONT_SIZE.xs, fontWeight: 500 }}>{trip.item_description}</span>
              </div>
              <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#64748b" }}>
                {trip.plate_number}
                {trip.kbnl_truck_no ? <span> · #{trip.kbnl_truck_no}</span> : null}
              </p>
              <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>
                {new Date(trip.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          ))}
        </div>
      )}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .side-trip-row:hover { background: #f8fafc !important; }
      `}</style>
    </div>
  )
}
