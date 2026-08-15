"use client"

import { FONT_SIZE } from "@/lib/constants"
import { usePolling } from "@/lib/hooks/usePolling"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { apiMutate } from "@/lib/api-mutation"
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
  status: "Open" | "In Progress" | "Resolved"
  admin_reply: string | null
  admin_reply_at: string | null
  raw_id?: string
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

const filters = ["All", "Open", "In Progress", "Resolved"]

function statusBadge(status: string) {
  if (status === "Resolved") return { bg: "#d1fae5", color: "#065f46", border: "#a7f3d0" }
  if (status === "In Progress") return { bg: "#dbeafe", color: "#1e40af", border: "#93c5fd" }
  return { bg: "#fef3c7", color: "#78350f", border: "#fde68a" }
}

export default function Complaints() {
  const { isMobile } = useBreakpoint()
  const { getAccess } = usePermissions()
  const canEdit = getAccess("complaints").canEdit
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("Open")
  const [viewMode, setViewMode] = useState<ViewMode>("card")
  const [resolving, setResolving] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Reply modal
  const [replyingTo, setReplyingTo] = useState<Complaint | null>(null)
  const [replyText, setReplyText] = useState("")
  const [replyLoading, setReplyLoading] = useState(false)
  const [replyError, setReplyError] = useState("")

  useEffect(() => {
    fetchComplaints()
  }, [])

  usePolling(fetchComplaints, 120000)

  async function fetchComplaints() {
    const [driverRes, reportRes] = await Promise.all([
      supabase.from("driver_complaints").select("complaint_id, driver_id, plate_number, complaint_type, notes, reported_at, resolved, trip_id").order("reported_at", { ascending: false }),
      supabase.from("reports").select("*").order("created_at", { ascending: false }),
    ])

    if (driverRes.error || reportRes.error) return

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
        status: (c.resolved ? "Resolved" : "Open") as "Open" | "In Progress" | "Resolved",
        admin_reply: null,
        admin_reply_at: null,
      }
    }))

    const reportComplaints = await Promise.all((reportRes.data || []).map(async (r: Record<string, unknown>) => {
      const { data: profile } = await supabase.from("Profiles").select("full_name").eq("user_id", r.user_id).single()
      return {
        complaint_id: `report-${r.id}`,
        driver_name: profile?.full_name ?? "Unknown",
        plate_number: r.role as string,
        kbnl_truck_no: null,
        complaint_type: "User Report",
        notes: r.message as string,
        reported_at: r.created_at as string,
        resolved: r.resolved as boolean ?? false,
        trip_id: null,
        status: (r.status as "Open" | "In Progress" | "Resolved") || (r.resolved ? "Resolved" : "Open"),
        admin_reply: r.admin_reply as string | null ?? null,
        admin_reply_at: r.admin_reply_at as string | null ?? null,
        raw_id: r.id as string,
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
        const { error } = await apiMutate("admin", { action: "update", table: "reports", data: { resolved: true, status: "Resolved" }, filters: { id: reportId } })
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

  async function handleMarkInProgress(id: string) {
    if (!canEdit || !id.startsWith("report-")) return
    const reportId = id.replace("report-", "")
    setResolving(id)
    try {
      const { error } = await apiMutate("admin", { action: "update", table: "reports", data: { status: "In Progress" }, filters: { id: reportId } })
      if (error) console.error("Mark In Progress error:", error)
      fetchComplaints()
    } catch {
      console.error("Network error")
    } finally {
      setResolving(null)
    }
  }

  async function handleReply() {
    if (!replyingTo || !replyText.trim() || !canEdit) return
    const reportId = replyingTo.complaint_id.replace("report-", "")
    setReplyLoading(true)
    setReplyError("")
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await apiMutate("admin", {
        action: "update", table: "reports",
        data: {
          status: "In Progress",
          admin_reply: replyText.trim(),
          admin_reply_at: new Date().toISOString(),
          admin_reply_by: user?.id || null,
        },
        filters: { id: reportId },
      })
      if (error) { setReplyError("Failed to send reply. Try again."); return }
      setReplyingTo(null)
      setReplyText("")
      fetchComplaints()
    } catch {
      setReplyError("Network error. Try again.")
    } finally {
      setReplyLoading(false)
    }
  }

  const filtered = filter === "All"
    ? complaints
    : complaints.filter(c => c.status === filter)

  const openCount = complaints.filter(c => c.status === "Open").length
  const inProgressCount = complaints.filter(c => c.status === "In Progress").length
  const resolvedCount = complaints.filter(c => c.status === "Resolved").length

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: isMobile ? "16px" : "32px", fontFamily: "'Inter', sans-serif" }}>
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 16, marginBottom: 32 }}>
        <div>
          <h1 style={{ margin: 0, color: "#0f172a", fontSize: isMobile ? FONT_SIZE["2xl"] : FONT_SIZE["3xl"], fontWeight: 700, letterSpacing: "-0.5px" }}>
            Complaints
          </h1>
          <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: FONT_SIZE.base }}>
            {openCount} open · {inProgressCount} in progress · {resolvedCount} resolved
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
          const count = f === "All" ? complaints.length : f === "Open" ? openCount : f === "In Progress" ? inProgressCount : resolvedCount
          const s = f === "All" ? { bg: "#f1f5f9", color: "#0f172a", border: "#cbd5e1" } : statusBadge(f === "In Progress" ? "In Progress" : f)
          const isActive = filter === f
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: "6px 12px",
                borderRadius: 24,
                fontSize: FONT_SIZE.xs,
                cursor: "pointer",
                border: `1px solid ${isActive ? s.border : "#e2e8f0"}`,
                background: isActive ? s.bg : "white",
                color: isActive ? s.color : "#64748b",
                fontWeight: isActive ? 600 : 500,
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
              {filtered.map(c => {
                const s = statusBadge(c.status)
                const isReport = c.complaint_id.startsWith("report-")
                return (
                  <div
                    key={c.complaint_id}
                    style={{
                      background: "white",
                      borderRadius: 12,
                      padding: 16,
                      border: `1px solid ${s.border}`,
                      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
                      opacity: c.status === "Resolved" ? 0.75 : 1,
                      transition: "all 0.2s ease"
                    }}
                    onMouseEnter={e => { if (c.status !== "Resolved") { e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.08)" } }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.05)" }}
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
                        <span style={{ padding: "4px 10px", borderRadius: 6, fontSize: FONT_SIZE.xs, fontWeight: 600, background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
                          {c.status}
                        </span>
                        <span style={{ padding: "4px 10px", borderRadius: 6, fontSize: FONT_SIZE.xs, fontWeight: 500, background: "#f0f7ff", color: "#0c4a6e", border: "1px solid #bfdbfe" }}>
                          {c.complaint_type}
                        </span>
                      </div>
                    </div>

                    <p style={{ margin: "12px 0", fontSize: FONT_SIZE.base, color: "#475569", lineHeight: 1.5, padding: "12px 0", borderTop: "1px solid #f1f5f9", borderBottom: "1px solid #f1f5f9" }}>
                      {c.notes}
                    </p>

                    {c.admin_reply && (
                      <div style={{ margin: "0 0 12px", padding: "10px 12px", borderRadius: 8, background: "#eef2ff", border: "1px solid #c7d2fe", borderLeft: "3px solid #4f46e5" }}>
                        <p style={{ margin: "0 0 4px", fontSize: FONT_SIZE.xs, fontWeight: 600, color: "#4338ca", textTransform: "uppercase", letterSpacing: 0.3 }}>Admin Response</p>
                        <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#1e1b4b", lineHeight: 1.4 }}>{c.admin_reply}</p>
                        {c.admin_reply_at && (
                          <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.xs, color: "#6366f1" }}>
                            {new Date(c.admin_reply_at).toLocaleString()}
                          </p>
                        )}
                      </div>
                    )}

                    {c.trip_id && (
                      <p style={{ margin: "0 0 12px", fontSize: FONT_SIZE.sm, color: "#64748b" }}>
                        Trip: <span style={{ fontFamily: "monospace", fontWeight: 500 }}>{c.trip_id}</span>
                      </p>
                    )}

                    {c.status !== "Resolved" && isReport && canEdit && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          onClick={() => { setReplyingTo(c); setReplyText(""); setReplyError("") }}
                          disabled={resolving === c.complaint_id}
                          style={{
                            padding: "8px 16px",
                            background: "#4f46e5",
                            color: "white",
                            border: "none",
                            borderRadius: 6,
                            cursor: "pointer",
                            fontWeight: 600,
                            fontSize: FONT_SIZE.sm,
                            transition: "all 0.2s ease",
                            display: "flex", alignItems: "center", gap: 6,
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = "#4338ca"}
                          onMouseLeave={e => e.currentTarget.style.background = "#4f46e5"}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                          Reply
                        </button>
                        {c.status === "Open" && (
                          <button
                            onClick={() => handleMarkInProgress(c.complaint_id)}
                            disabled={resolving === c.complaint_id}
                            style={{
                              padding: "8px 16px",
                              background: resolving === c.complaint_id ? "#94a3b8" : "#f59e0b",
                              color: "white",
                              border: "none",
                              borderRadius: 6,
                              cursor: resolving === c.complaint_id ? "not-allowed" : "pointer",
                              fontWeight: 600,
                              fontSize: FONT_SIZE.sm,
                              opacity: resolving === c.complaint_id ? 0.7 : 1,
                              transition: "all 0.2s ease",
                            }}
                            onMouseEnter={e => { if (resolving !== c.complaint_id) e.currentTarget.style.background = "#d97706" }}
                            onMouseLeave={e => { if (resolving !== c.complaint_id) e.currentTarget.style.background = "#f59e0b" }}
                          >
                            {resolving === c.complaint_id ? "Updating..." : "Mark In Progress"}
                          </button>
                        )}
                        <button
                          onClick={() => handleResolve(c.complaint_id)}
                          disabled={resolving === c.complaint_id}
                          style={{
                            padding: "8px 16px",
                            background: resolving === c.complaint_id ? "#94a3b8" : "#16a34a",
                            color: "white",
                            border: "none",
                            borderRadius: 6,
                            cursor: resolving === c.complaint_id ? "not-allowed" : "pointer",
                            fontWeight: 600,
                            fontSize: FONT_SIZE.sm,
                            opacity: resolving === c.complaint_id ? 0.7 : 1,
                            transition: "all 0.2s ease",
                          }}
                          onMouseEnter={e => { if (resolving !== c.complaint_id) e.currentTarget.style.background = "#15803d" }}
                          onMouseLeave={e => { if (resolving !== c.complaint_id) e.currentTarget.style.background = "#16a34a" }}
                        >
                          {resolving === c.complaint_id ? "Resolving..." : "Mark Resolved"}
                        </button>
                      </div>
                    )}

                    {c.status !== "Resolved" && !isReport && canEdit && (
                      <button
                        onClick={() => handleResolve(c.complaint_id)}
                        disabled={resolving === c.complaint_id}
                        style={{
                          padding: "8px 16px",
                          background: resolving === c.complaint_id ? "#94a3b8" : "#0070f3",
                          color: "white",
                          border: "none",
                          borderRadius: 6,
                          cursor: resolving === c.complaint_id ? "not-allowed" : "pointer",
                          fontWeight: 600,
                          fontSize: FONT_SIZE.sm,
                          opacity: resolving === c.complaint_id ? 0.7 : 1,
                          transition: "all 0.2s ease"
                        }}
                        onMouseEnter={e => { if (!resolving) e.currentTarget.style.background = "#0070f3" }}
                        onMouseLeave={e => e.currentTarget.style.background = resolving === c.complaint_id ? "#94a3b8" : "#0070f3"}
                      >
                        {resolving === c.complaint_id ? "Resolving..." : "Mark Resolved"}
                      </button>
                    )}
                  </div>
                )
              })}
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
                  {filtered.map((c, idx) => {
                    const s = statusBadge(c.status)
                    const isReport = c.complaint_id.startsWith("report-")
                    return (
                      <tr key={c.complaint_id} style={{ borderBottom: idx === filtered.length - 1 ? "none" : "1px solid #e2e8f0", opacity: c.status === "Resolved" ? 0.75 : 1, transition: "background 0.2s ease" }} onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
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
                          <span style={{ padding: "4px 10px", borderRadius: 6, fontSize: FONT_SIZE.xs, fontWeight: 600, background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
                            {c.status}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right" }}>
                          {c.status !== "Resolved" && isReport && canEdit && (
                            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                              <button
                                onClick={() => { setReplyingTo(c); setReplyText(""); setReplyError("") }}
                                style={{ padding: "6px 12px", background: "#4f46e5", color: "white", border: "none", borderRadius: 5, cursor: "pointer", fontWeight: 500, fontSize: FONT_SIZE.xs, transition: "all 0.2s ease", minHeight: 32 }}
                                onMouseEnter={e => e.currentTarget.style.background = "#4338ca"}
                                onMouseLeave={e => e.currentTarget.style.background = "#4f46e5"}
                              >
                                Reply
                              </button>
                              <button
                                onClick={() => handleResolve(c.complaint_id)}
                                disabled={resolving === c.complaint_id}
                                style={{ padding: "6px 12px", background: resolving === c.complaint_id ? "#94a3b8" : "#16a34a", color: "white", border: "none", borderRadius: 5, cursor: resolving === c.complaint_id ? "not-allowed" : "pointer", fontWeight: 500, fontSize: FONT_SIZE.xs, opacity: resolving === c.complaint_id ? 0.7 : 1, transition: "all 0.2s ease", minHeight: 32 }}
                              >
                                Resolve
                              </button>
                            </div>
                          )}
                          {c.status !== "Resolved" && !isReport && canEdit && (
                            <button
                              onClick={() => handleResolve(c.complaint_id)}
                              disabled={resolving === c.complaint_id}
                              style={{ padding: "6px 12px", background: resolving === c.complaint_id ? "#94a3b8" : "#0070f3", color: "white", border: "none", borderRadius: 5, cursor: resolving === c.complaint_id ? "not-allowed" : "pointer", fontWeight: 500, fontSize: FONT_SIZE.xs, opacity: resolving === c.complaint_id ? 0.7 : 1, transition: "all 0.2s ease", minHeight: 32, minWidth: 32, display: "flex", alignItems: "center", justifyContent: "center" }}
                            >
                              Resolve
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Reply Modal */}
      {replyingTo && (
        <div onClick={() => { if (!replyLoading) { setReplyingTo(null); setReplyText("") } }} style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: 12, padding: 32, width: "100%", maxWidth: 480, boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)" }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Reply to {replyingTo.driver_name}</h3>
            <p style={{ margin: "0 0 16px", fontSize: FONT_SIZE.sm, color: "#64748b" }}>
              Your reply will set this complaint to &quot;In Progress&quot; and the user will be notified.
            </p>

            <div style={{ padding: "10px 12px", borderRadius: 8, background: "#f8fafc", border: "1px solid #e2e8f0", marginBottom: 16 }}>
              <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#475569", lineHeight: 1.4 }}>
                &quot;{replyingTo.notes.length > 150 ? replyingTo.notes.slice(0, 150) + "…" : replyingTo.notes}&quot;
              </p>
            </div>

            <textarea
              placeholder="Type your response to the user..."
              value={replyText}
              onChange={e => { setReplyText(e.target.value); setReplyError("") }}
              style={{
                width: "100%", padding: "12px 16px",
                boxSizing: "border-box", borderRadius: 8,
                border: "1.5px solid #e2e8f0", fontSize: 14,
                background: "#f9f9f9", color: "#0f172a",
                minHeight: 100, resize: "vertical",
                outline: "none", fontFamily: "'Inter', sans-serif",
                transition: "border-color 0.2s ease",
              }}
              onFocus={e => e.currentTarget.style.borderColor = "#4f46e5"}
              onBlur={e => e.currentTarget.style.borderColor = "#e2e8f0"}
              autoFocus
            />

            {replyError && (
              <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, color: "#dc2626", fontWeight: 600 }}>{replyError}</span>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button
                onClick={() => { setReplyingTo(null); setReplyText("") }}
                disabled={replyLoading}
                style={{
                  flex: 1, padding: "12px 16px", background: "white", border: "1px solid #cbd5e1",
                  borderRadius: 8, cursor: replyLoading ? "not-allowed" : "pointer", fontWeight: 600, fontSize: 14,
                  color: "#475569", minHeight: 44, opacity: replyLoading ? 0.7 : 1,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleReply}
                disabled={replyLoading || !replyText.trim()}
                style={{
                  flex: 1, padding: "12px 16px",
                  background: replyLoading || !replyText.trim() ? "#94a3b8" : "#4f46e5",
                  color: "white", border: "none", borderRadius: 8,
                  cursor: replyLoading || !replyText.trim() ? "not-allowed" : "pointer",
                  fontWeight: 700, fontSize: 14,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  opacity: replyLoading || !replyText.trim() ? 0.7 : 1,
                  minHeight: 44,
                }}
              >
                {replyLoading ? "Sending..." : "Send Reply"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
