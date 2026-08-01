"use client"

import { FONT_SIZE } from "@/lib/constants"
import { usePolling } from "@/lib/hooks/usePolling"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { apiMutate } from "@/lib/api-mutation"
import { Icon } from "@iconify/react"
import { usePermissions } from "@/lib/PermissionContext"

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

type ViewMode = "card" | "table"

function useBreakpoint() {
  const [isDesktop, setIsDesktop] = useState(false)
  const [isMobile, setIsMobile] = useState(true)
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640)
      setIsDesktop(window.innerWidth >= 640)
    }
    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])
  return { isMobile, isDesktop }
}



const filters = ["All", "Unresolved", "Resolved"]

export default function Complaints() {
  const { isMobile, isDesktop } = useBreakpoint()
  const { getAccess } = usePermissions()
  const canEdit = getAccess("complaints").canEdit
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("Unresolved")
  const [viewMode, setViewMode] = useState<ViewMode>("card")
  const [resolving, setResolving] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  useEffect(() => {
    fetchComplaints()
  }, [])

  usePolling(fetchComplaints, 120000)

  async function fetchComplaints() {
    const [driverRes, reportRes] = await Promise.all([
      supabase.from("driver_complaints").select("complaint_id, driver_id, plate_number, complaint_type, notes, reported_at, resolved, trip_id").order("reported_at", { ascending: false }),
      supabase.from("reports").select("*").order("created_at", { ascending: false }),
    ])

    const driverComplaints = await Promise.all((driverRes.data || []).map(async (c) => {
      const [driverRes, truckRes] = await Promise.all([
        supabase.from("Drivers").select("full_name").eq("driver_id", c.driver_id).single(),
        supabase.from("Trucks").select("kbnl_truck_no").eq("plate_number", c.plate_number).single(),
      ])
      return {
        complaint_id: c.complaint_id,
        driver_name: driverRes.data?.full_name ?? "Unknown",
        plate_number: c.plate_number,
        kbnl_truck_no: truckRes.data?.kbnl_truck_no ?? null,
        complaint_type: c.complaint_type,
        notes: c.notes,
        reported_at: c.reported_at,
        resolved: c.resolved ?? false,
        trip_id: c.trip_id,
      }
    }))

    const reportComplaints = await Promise.all((reportRes.data || []).map(async (r: any) => {
      const { data: profile } = await supabase.from("Profiles").select("full_name").eq("user_id", r.user_id).single()
      return {
        complaint_id: `report-${r.id}`,
        driver_name: profile?.full_name ?? "Unknown",
        plate_number: r.role,
        kbnl_truck_no: null,
        complaint_type: "User Report",
        notes: r.message,
        reported_at: r.created_at,
        resolved: r.resolved ?? false,
        trip_id: null,
      }
    }))

    const merged = [...driverComplaints, ...reportComplaints].sort(
      (a, b) => new Date(b.reported_at).getTime() - new Date(a.reported_at).getTime()
    )

    setComplaints(merged)
    setLastUpdated(new Date())
    setLoading(false)
  }

  async function handleResolve(id: string) {
    if (!canEdit) return
    setResolving(id)
    try {
      if (id.startsWith("report-")) {
        const reportId = id.replace("report-", "")
        const { error } = await apiMutate("admin", { action: "update", table: "reports", data: { resolved: true }, filters: { id: reportId } })
        if (error) console.error("Resolve report error:", error)
      } else {
        const { error } = await apiMutate("admin", { action: "update", table: "driver_complaints", data: { resolved: true }, filters: { complaint_id: id } })
        if (error) console.error("Resolve complaint error:", error)
      }
      fetchComplaints()
    } catch {
      console.error("Network error resolving complaint")
    } finally {
      setResolving(null)
    }
  }

  const filtered = filter === "All"
    ? complaints
    : filter === "Resolved"
    ? complaints.filter(c => c.resolved)
    : complaints.filter(c => !c.resolved)

  const resolvedCount = complaints.filter(c => c.resolved).length
  const unresolvedCount = complaints.filter(c => !c.resolved).length

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: isMobile ? "16px" : "32px", fontFamily: "'Inter', sans-serif" }}>
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 16, marginBottom: 32 }}>
        <div>
          <h1 style={{ margin: 0, color: "#0f172a", fontSize: isMobile ? FONT_SIZE["2xl"] : FONT_SIZE["3xl"], fontWeight: 700, letterSpacing: "-0.5px" }}>
            Driver Complaints
          </h1>
          <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: FONT_SIZE.base }}>
            {unresolvedCount} unresolved · {resolvedCount} resolved
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, width: isMobile ? "100%" : "auto" }}>
          {complaints.length > 0 && (
            <div style={{ display: "flex", background: "white", border: "1px solid #e2e8f0", borderRadius: 8, padding: 4, gap: 0 }}>
              <button onClick={() => setViewMode("card")} style={{ padding: "8px 12px", background: viewMode === "card" ? "#0070f3" : "transparent", color: viewMode === "card" ? "white" : "#64748b", border: "none", borderRadius: 6, cursor: "pointer", fontSize: FONT_SIZE.xs, fontWeight: 600, transition: "all 0.2s ease", minWidth: 44, height: 40, display: "flex", alignItems: "center", justifyContent: "center" }} title="Card view">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z" /></svg>
              </button>
              <button onClick={() => setViewMode("table")} style={{ padding: "8px 12px", background: viewMode === "table" ? "#0070f3" : "transparent", color: viewMode === "table" ? "white" : "#64748b", border: "none", borderRadius: 6, cursor: "pointer", fontSize: FONT_SIZE.xs, fontWeight: 600, transition: "all 0.2s ease", minWidth: 44, height: 40, display: "flex", alignItems: "center", justifyContent: "center" }} title="Table view">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 4h18v2H3V4zm0 7h18v2H3v-2zm0 7h18v2H3v-2z" /></svg>
              </button>
            </div>
          )}


          <button onClick={fetchComplaints} style={{ padding: "10px 16px", background: "white", color: "#0070f3", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer", fontWeight: 500, fontSize: FONT_SIZE.sm, transition: "all 0.2s ease", display: "flex", alignItems: "center", gap: 6, minHeight: 40 }} onMouseEnter={e => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#0070f3" }} onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#e2e8f0" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36M20.49 15a9 9 0 0 1-14.85 3.36" /></svg>
            Refresh
          </button>
        </div>
      </div>

      {lastUpdated && (
        <p style={{ fontSize: FONT_SIZE.xs, color: "#94a3b8", marginBottom: 20 }}>
          Updated {lastUpdated.toLocaleTimeString()}
        </p>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        {filters.map(f => {
          const count = f === "All" ? complaints.length : f === "Resolved" ? resolvedCount : unresolvedCount
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: "6px 12px",
                borderRadius: 24,
                fontSize: FONT_SIZE.xs,
                cursor: "pointer",
                border: "1px solid",
                background: filter === f ? (f === "Resolved" ? "#f0fff4" : f === "Unresolved" ? "#fdf5d3" : "#f1f5f9") : "white",
                color: filter === f ? (f === "Resolved" ? "#2f855a" : f === "Unresolved" ? "#f59e0b" : "#0f172a") : "#64748b",
                borderColor: filter === f ? (f === "Resolved" ? "#2f855a" : f === "Unresolved" ? "#fde68a" : "#cbd5e1") : "#e2e8f0",
                fontWeight: filter === f ? 600 : 500,
                transition: "all 0.2s ease"
              }}
            >
              {f} {count > 0 && <span style={{ marginLeft: 4, fontWeight: 500 }}>({count})</span>}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "64px 0" }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid #e2e8f0", borderTopColor: "#0070f3", animation: "spin 1s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "64px 24px", background: "white", borderRadius: 12, border: "1px solid #e2e8f0" }}>
          <div style={{ width: 64, height: 64, background: "#f1f5f9", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M12 8v8m0 0v-2m0 2v4M8 12h8" /></svg>
          </div>
          <h3 style={{ margin: "0 0 8px", color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 600 }}>No {filter.toLowerCase()} complaints</h3>
          <p style={{ color: "#64748b", fontSize: FONT_SIZE.base }}>Great work! Keep the operations smooth.</p>
        </div>
      ) : (
        <>
          {viewMode === "card" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {filtered.map(c => (
                <div
                  key={c.complaint_id}
                  style={{
                    background: "white",
                    borderRadius: 12,
                    padding: 16,
                    border: `1px solid ${c.resolved ? "#e2e8f0" : "#fef3c7"}`,
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
                    opacity: c.resolved ? 0.75 : 1,
                    transition: "all 0.2s ease"
                  }}
                  onMouseEnter={e => { if (!c.resolved) { e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.08)"; e.currentTarget.style.borderColor = "#fcd34d" } }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.05)"; e.currentTarget.style.borderColor = "#fef3c7" }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{ margin: "0 0 4px", color: "#0f172a", fontSize: FONT_SIZE.lg, fontWeight: 600 }}>
                        {c.driver_name}
                      </h3>
                      <p style={{ margin: "0 0 4px", color: "#64748b", fontSize: FONT_SIZE.sm }}>
                        {c.plate_number}{c.kbnl_truck_no ? ` · #${c.kbnl_truck_no}` : ""}
                      </p>
                      <p style={{ margin: 0, color: "#94a3b8", fontSize: FONT_SIZE.xs }}>
                        {new Date(c.reported_at).toLocaleString()}
                      </p>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                      <span style={{ padding: "4px 10px", borderRadius: 6, fontSize: FONT_SIZE.xs, fontWeight: 500, background: c.resolved ? "#d1fae5" : "#fef3c7", color: c.resolved ? "#065f46" : "#78350f", border: `1px solid ${c.resolved ? "#a7f3d0" : "#fde68a"}` }}>
                        {c.resolved ? "Resolved" : "Unresolved"}
                      </span>
                      <span style={{ padding: "4px 10px", borderRadius: 6, fontSize: FONT_SIZE.xs, fontWeight: 500, background: "#f0f7ff", color: "#0c4a6e", border: "1px solid #bfdbfe" }}>
                        {c.complaint_type}
                      </span>
                    </div>
                  </div>

                  <p style={{ margin: "12px 0", fontSize: FONT_SIZE.base, color: "#475569", lineHeight: 1.5, padding: "12px 0", borderTop: "1px solid #f1f5f9", borderBottom: "1px solid #f1f5f9" }}>
                    {c.notes}
                  </p>

                  {c.trip_id && (
                    <p style={{ margin: "0 0 12px", fontSize: FONT_SIZE.sm, color: "#64748b" }}>
                      Trip: <span style={{ fontFamily: "monospace", fontWeight: 500 }}>{c.trip_id}</span>
                    </p>
                  )}

                  {!c.resolved && (
                    <button
                      onClick={() => handleResolve(c.complaint_id)}
                      disabled={resolving === c.complaint_id || !canEdit}
                      style={{
                        padding: "8px 16px",
                        background: resolving === c.complaint_id || !canEdit ? "#94a3b8" : "#0070f3",
                        color: "white",
                        border: "none",
                        borderRadius: 6,
                        cursor: resolving === c.complaint_id || !canEdit ? "not-allowed" : "pointer",
                        fontWeight: 600,
                        fontSize: FONT_SIZE.sm,
                        opacity: resolving === c.complaint_id || !canEdit ? 0.7 : 1,
                        transition: "all 0.2s ease"
                      }}
                      onMouseEnter={e => { if (!resolving && canEdit) e.currentTarget.style.background = "#0070f3" }}
                      onMouseLeave={e => { e.currentTarget.style.background = resolving === c.complaint_id || !canEdit ? "#94a3b8" : "#0070f3" }}
                    >
                      {resolving === c.complaint_id ? "Resolving..." : "Mark Resolved"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {viewMode === "table" && (
            <div style={{ background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Driver</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Truck</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Type</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Notes</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Status</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c, idx) => (
                    <tr key={c.complaint_id} style={{ borderBottom: idx === filtered.length - 1 ? "none" : "1px solid #e2e8f0", opacity: c.resolved ? 0.75 : 1, transition: "background 0.2s ease" }} onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 500 }}>
                        {c.driver_name}
                      </td>
                      <td style={{ padding: "12px 16px", color: "#475569", fontSize: FONT_SIZE.sm, fontFamily: "monospace" }}>
                        {c.plate_number}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ padding: "4px 10px", borderRadius: 6, fontSize: FONT_SIZE.xs, fontWeight: 500, background: "#f0f7ff", color: "#0c4a6e", border: "1px solid #bfdbfe" }}>
                          {c.complaint_type}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", color: "#475569", fontSize: FONT_SIZE.sm, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.notes}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ padding: "4px 10px", borderRadius: 6, fontSize: FONT_SIZE.xs, fontWeight: 500, background: c.resolved ? "#d1fae5" : "#fef3c7", color: c.resolved ? "#065f46" : "#78350f", border: `1px solid ${c.resolved ? "#a7f3d0" : "#fde68a"}` }}>
                          {c.resolved ? "Resolved" : "Unresolved"}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right" }}>
                        {!c.resolved && (
                          <button
                            onClick={() => handleResolve(c.complaint_id)}
                            disabled={resolving === c.complaint_id || !canEdit}
                            style={{
                              padding: "6px 12px",
                              background: resolving === c.complaint_id || !canEdit ? "#94a3b8" : "#0070f3",
                              color: "white",
                              border: "none",
                              borderRadius: 5,
                              cursor: resolving === c.complaint_id || !canEdit ? "not-allowed" : "pointer",
                              fontWeight: 500,
                              fontSize: FONT_SIZE.xs,
                              opacity: resolving === c.complaint_id || !canEdit ? 0.7 : 1,
                              transition: "all 0.2s ease",
                              minHeight: 32,
                              minWidth: 32,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center"
                            }}
                            onMouseEnter={e => { if (!resolving && canEdit) e.currentTarget.style.background = "#0070f3" }}
                            onMouseLeave={e => { e.currentTarget.style.background = resolving === c.complaint_id || !canEdit ? "#94a3b8" : "#0070f3" }}
                          >
                            Resolve
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

    </div>
  )
}