"use client"

import { FONT_SIZE } from "@/lib/constants"

import { useState, useEffect, useRef } from "react"
import { supabase } from "@/lib/supabase"
import { apiMutate } from "@/lib/api-mutation"
import { usePermissions } from "@/lib/PermissionContext"

type Truck = {
  plate_number: string
  kbnl_truck_no: string
  truck_model: string
  capacity: number
  truck_size: string | null
  status: string
}

type ViewMode = "card" | "table"

const TRUCK_SIZES = ["20", "40/45", "Dina", "Tricycle"]
const truckStatuses = ["Empty", "Loaded", "Undergoing Repairs", "Decommissioned"]

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



const getPillStyle = (filter: string, isActive: boolean) => {
  if (!isActive) {
    return { bg: "white", textColor: "#64748b", borderColor: "#e2e8f0" }
  }
  
  if (filter === "All") {
    return { bg: "#171717", textColor: "white", borderColor: "#171717" }
  } else if (filter === "Empty") {
    return { bg: "#f0fdf4", textColor: "#16a34a", borderColor: "#16a34a" }
  } else if (filter === "Loaded") {
    return { bg: "#eff6ff", textColor: "#0070f3", borderColor: "#0070f3" }
  } else if (filter === "Undergoing Repairs") {
    return { bg: "#fffbeb", textColor: "#f5a623", borderColor: "#f5a623" }
  } else if (filter === "Decommissioned") {
    return { bg: "#fef2f2", textColor: "#ef4444", borderColor: "#ef4444" }
  }
  
  return { bg: "white", textColor: "#64748b", borderColor: "#e2e8f0" }
}

export default function ManageTrucks() {
  const { isMobile, isDesktop } = useBreakpoint()
  const { getAccess } = usePermissions()
  const canEdit = getAccess("manage-trucks").canEdit
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>("card")
  const [editingTruck, setEditingTruck] = useState<Truck | null>(null)
  const [editKbnlNo, setEditKbnlNo] = useState("")
  const [editModel, setEditModel] = useState("")
  const [editCapacity, setEditCapacity] = useState("")
  const [editTruckSize, setEditTruckSize] = useState("")
  const [editStatus, setEditStatus] = useState("")
  const [deletingPlate, setDeletingPlate] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [filterStatus, setFilterStatus] = useState("All")

  const capacityRef = useRef<HTMLInputElement>(null)

  async function fetchTrucks() {
    try {
      const { data, error } = await supabase
        .from("Trucks")
        .select("*")
        .order("kbnl_truck_no", { ascending: true })

      if (!error) setTrucks(data || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchTrucks() }, [])

  useEffect(() => {
    setViewMode(isMobile ? "card" : "table")
  }, [isMobile])

  const filterOptions = ["All", "Empty", "Loaded", "Undergoing Repairs", "Decommissioned"]
  const filteredTrucks = filterStatus === "All" ? trucks : trucks.filter((t) => t.status === filterStatus)

  function startEdit(truck: Truck) {
    setEditingTruck(truck)
    setEditKbnlNo(truck.kbnl_truck_no)
    setEditModel(truck.truck_model)
    setEditCapacity(truck.capacity.toString())
    setEditTruckSize(truck.truck_size ?? "")
    setEditStatus(truck.status)
    setMessage("")
  }

  function closeModals() {
    setEditingTruck(null)
    setDeletingPlate(null)
    setMessage("")
  }

  async function handleUpdate() {
    if (!canEdit) return
    if (!editingTruck) return
    if (!editKbnlNo.trim()) return setMessage("KbNL truck number is required")
    if (!editModel.trim()) return setMessage("Truck model is required")
    if (!editCapacity) return setMessage("Capacity is required")
    const capacity = Number(editCapacity)
    if (!Number.isInteger(capacity) || capacity <= 0) return setMessage("Capacity must be a positive whole number")

    setSubmitting(true)

    try {
      const { error } = await apiMutate("admin", {
        action: "update",
        table: "Trucks",
        data: {
          kbnl_truck_no: editKbnlNo.trim(),
          truck_model: editModel.trim(),
          capacity,
          truck_size: editTruckSize || null,
          status: editStatus,
        },
        filters: { plate_number: editingTruck.plate_number },
      })

      if (error) {
        setMessage(error)
        return
      }

      closeModals()
      await fetchTrucks()
    } catch {
      setMessage("Failed to update truck")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(plate_number: string) {
    if (!canEdit) return
    setSubmitting(true)

    try {
      const { error } = await apiMutate("admin", {
        action: "delete",
        table: "Trucks",
        filters: { plate_number },
      })

      if (error) {
        setMessage(error)
        return
      }

      closeModals()
      await fetchTrucks()
    } catch {
      setMessage("Failed to delete truck")
    } finally {
      setSubmitting(false)
    }
  }

  const statusPillColor = (status: string) => {
    const pill = getPillStyle(status, true)
    return { bg: pill.bg, color: pill.textColor, border: pill.borderColor }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    boxSizing: "border-box",
    borderRadius: 8,
    border: "1px solid #e0e0e0",
    fontSize: FONT_SIZE.base,
    background: "white",
    color: "#171717",
    minHeight: 48,
    transition: "border-color 0.2s ease",
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: isMobile ? "16px" : "32px", fontFamily: "'Inter', sans-serif" }}>
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, color: "#0f172a", fontSize: isMobile ? FONT_SIZE["2xl"] : FONT_SIZE["3xl"], fontWeight: 700, letterSpacing: "-0.5px" }}>
            Manage Trucks
          </h1>
          <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: FONT_SIZE.base }}>
            Track fleet inventory and truck status.
          </p>
        </div>

        {trucks.length > 0 && (
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
                justifyContent: "center"
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z"/></svg>
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
                justifyContent: "center"
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 4h18v2H3V4zm0 7h18v2H3v-2zm0 7h18v2H3v-2z"/></svg>
            </button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
        {filterOptions.map((option) => {
          const isActive = filterStatus === option
          const pill = getPillStyle(option, isActive)
          return (
            <button
              key={option}
              onClick={() => setFilterStatus(option)}
              style={{
                padding: "8px 14px",
                borderRadius: 20,
                fontSize: FONT_SIZE.sm,
                cursor: "pointer",
                border: `1.5px solid ${pill.borderColor}`,
                background: pill.bg,
                color: pill.textColor,
                fontWeight: isActive ? 600 : 500,
                transition: "all 0.2s"
              }}
              onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1" } }}
              onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#e2e8f0" } }}
            >
              {option}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "64px 0" }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid #e2e8f0", borderTopColor: "#0070f3", animation: "spin 1s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : filteredTrucks.length === 0 ? (
        <div style={{ textAlign: "center", padding: "64px 24px", background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)" }}>
          <h3 style={{ margin: "0 0 8px", color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 600 }}>No trucks found</h3>
          <p style={{ color: "#64748b", fontSize: FONT_SIZE.base, margin: 0 }}>
            {filterStatus === "All" ? "No trucks in the fleet." : `No trucks with status "${filterStatus}".`}
          </p>
        </div>
      ) : (
        <>
          {viewMode === "card" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {filteredTrucks.map((truck) => {
                const pill = statusPillColor(truck.status)
                return (
                  <div key={truck.plate_number} style={{ background: "white", borderRadius: 12, padding: 16, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)", transition: "all 0.2s ease" }} onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.08)"; e.currentTarget.style.borderColor = "#cbd5e1" }} onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.05)"; e.currentTarget.style.borderColor = "#e2e8f0" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <h3 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.lg, fontWeight: 600 }}>{truck.plate_number}</h3>
                          <span style={{ color: "#94a3b8", fontSize: FONT_SIZE.xs }}>· #{truck.kbnl_truck_no}</span>
                        </div>
                        <p style={{ margin: 0, color: "#64748b", fontSize: FONT_SIZE.sm }}>{truck.truck_model}</p>
                      </div>
                      <span style={{ padding: "6px 12px", borderRadius: 16, fontSize: FONT_SIZE.xs, fontWeight: 600, background: pill.bg, color: pill.color, border: `1.5px solid ${pill.border}`, whiteSpace: "nowrap" }}>
                        {truck.status}
                      </span>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "12px 0", borderTop: "1px solid #f1f5f9", borderBottom: "1px solid #f1f5f9" }}>
                      <div>
                        <p style={{ margin: "0 0 4px 0", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>Capacity</p>
                        <p style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.lg, fontWeight: 600 }}>{truck.capacity} bags</p>
                      </div>
                      <div>
                        <p style={{ margin: "0 0 4px 0", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>Size (Tonnage)</p>
                        <p style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.lg, fontWeight: 600 }}>{truck.truck_size || "—"}</p>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                      <button
                        onClick={() => startEdit(truck)}
                        disabled={!canEdit}
                        style={{ flex: 1, padding: "8px 12px", cursor: !canEdit ? "not-allowed" : "pointer", borderRadius: 6, border: "1px solid #e2e8f0", color: "#0070f3", background: !canEdit ? "#94a3b8" : "#f0f7ff", fontSize: FONT_SIZE.sm, fontWeight: 500, transition: "all 0.2s" }}
                        onMouseEnter={e => { if (canEdit) { e.currentTarget.style.background = "#e0efff"; e.currentTarget.style.borderColor = "#0070f3" } }}
                        onMouseLeave={e => { if (canEdit) { e.currentTarget.style.background = "#f0f7ff"; e.currentTarget.style.borderColor = "#e2e8f0" } }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => { setDeletingPlate(truck.plate_number); setMessage("") }}
                        disabled={!canEdit}
                        style={{ flex: 1, padding: "8px 12px", cursor: !canEdit ? "not-allowed" : "pointer", borderRadius: 6, border: "1px solid #fee2e2", color: "#ef4444", background: !canEdit ? "#94a3b8" : "#fef2f2", fontSize: FONT_SIZE.sm, fontWeight: 500, transition: "all 0.2s" }}
                        onMouseEnter={e => { if (canEdit) e.currentTarget.style.background = "#fee2e2" }}
                        onMouseLeave={e => { if (canEdit) e.currentTarget.style.background = "#fef2f2" }}
                      >
                        Delete
                      </button>
                    </div>
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
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Truck</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Model</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Size (Tonnage)</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Capacity</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Status</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTrucks.map((truck, idx) => {
                    const pill = statusPillColor(truck.status)
                    return (
                      <tr key={truck.plate_number} style={{ borderBottom: idx === filteredTrucks.length - 1 ? "none" : "1px solid #e2e8f0", transition: "background 0.2s ease" }} onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <td style={{ padding: "12px 16px" }}>
                          <strong style={{ color: "#0f172a", fontSize: FONT_SIZE.base }}>{truck.plate_number}</strong>
                          <div style={{ fontSize: FONT_SIZE.xs, color: "#94a3b8", marginTop: 2 }}>#{truck.kbnl_truck_no}</div>
                        </td>
                        <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: FONT_SIZE.base }}>{truck.truck_model}</td>
                        <td style={{ padding: "12px 16px", color: "#64748b", fontSize: FONT_SIZE.sm }}>{truck.truck_size || "—"}</td>
                        <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 500 }}>{truck.capacity}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{ padding: "6px 10px", borderRadius: 14, fontSize: FONT_SIZE.xs, fontWeight: 600, background: pill.bg, color: pill.color, border: `1.5px solid ${pill.border}` }}>
                            {truck.status}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button
                              onClick={() => startEdit(truck)}
                              disabled={!canEdit}
                              style={{ padding: "6px 10px", cursor: !canEdit ? "not-allowed" : "pointer", borderRadius: 6, border: "1px solid #e2e8f0", color: "#0070f3", background: !canEdit ? "#94a3b8" : "#f0f7ff", fontSize: FONT_SIZE.sm, fontWeight: 500, transition: "all 0.2s", minHeight: 32, minWidth: 32, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                              onMouseEnter={e => { if (canEdit) { e.currentTarget.style.background = "#e0efff"; e.currentTarget.style.borderColor = "#0070f3" } }}
                              onMouseLeave={e => { if (canEdit) { e.currentTarget.style.background = "#f0f7ff"; e.currentTarget.style.borderColor = "#e2e8f0" } }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => { setDeletingPlate(truck.plate_number); setMessage("") }}
                              disabled={!canEdit}
                              style={{ padding: "6px 10px", cursor: !canEdit ? "not-allowed" : "pointer", borderRadius: 6, border: "1px solid #fee2e2", color: "#ef4444", background: !canEdit ? "#94a3b8" : "#fef2f2", fontSize: FONT_SIZE.sm, fontWeight: 500, transition: "all 0.2s", minHeight: 32, minWidth: 32, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                              onMouseEnter={e => { if (canEdit) e.currentTarget.style.background = "#fee2e2" }}
                              onMouseLeave={e => { if (canEdit) e.currentTarget.style.background = "#fef2f2" }}
                            >
                              Delete
                            </button>
                          </div>
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

      {(editingTruck || deletingPlate) && (
        <div
          onClick={closeModals}
          style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 100, padding: isMobile ? 0 : 24, animation: "fadeIn 0.2s ease-out" }}
        >
          <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: "white", borderRadius: isMobile ? "20px 20px 0 0" : 12, padding: isMobile ? "28px 20px" : 32, width: "100%", maxWidth: 440, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)", animation: "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)" }}
          >

            {editingTruck && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                  <h3 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>Edit Truck</h3>
                  <button onClick={closeModals} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 0, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", transition: "color 0.2s" }} onMouseEnter={e => e.currentTarget.style.color = "#64748b"} onMouseLeave={e => e.currentTarget.style.color = "#94a3b8"}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                </div>

                <p style={{ margin: "0 0 20px 0", color: "#94a3b8", fontSize: FONT_SIZE.sm }}>Plate: {editingTruck.plate_number}</p>

                <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
                  <div>
                    <label style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: FONT_SIZE.sm, fontWeight: 500 }}>KbNL Truck No. *</label>
                    <input type="text" value={editKbnlNo} readOnly={!canEdit} onChange={(e) => { setEditKbnlNo(e.target.value); setMessage("") }} onKeyDown={(e) => { if (e.key === "Enter") capacityRef.current?.focus() }} style={inputStyle} />
                  </div>

                  <div>
                    <label style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: FONT_SIZE.sm, fontWeight: 500 }}>Truck Model *</label>
                    <input type="text" value={editModel} readOnly={!canEdit} onChange={(e) => { setEditModel(e.target.value); setMessage("") }} onKeyDown={(e) => { if (e.key === "Enter") capacityRef.current?.focus() }} style={inputStyle} />
                  </div>

                  <div>
                    <label style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: FONT_SIZE.sm, fontWeight: 500 }}>Capacity (bags) *</label>
                    <input ref={capacityRef} type="number" value={editCapacity} readOnly={!canEdit} onChange={(e) => { setEditCapacity(e.target.value); setMessage("") }} style={inputStyle} />
                  </div>

                  <div>
                    <label style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: FONT_SIZE.sm, fontWeight: 500 }}>Truck Size (Tonnage)</label>
                    <select value={editTruckSize} disabled={!canEdit} onChange={(e) => setEditTruckSize(e.target.value)} style={{ ...inputStyle, appearance: "none", paddingRight: 32, backgroundImage: "url('data:image/svg+xml;charset=UTF-8,%3csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23171717%22 stroke-width=%222%22%3e%3cpolyline points=%226 9 12 15 18 9%22%3e%3c/polyline%3e%3c/svg%3e')", backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center", backgroundSize: "16px" }}>
                      <option value="">No size</option>
                      {TRUCK_SIZES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: FONT_SIZE.sm, fontWeight: 500 }}>Status</label>
                    <select value={editStatus} disabled={!canEdit} onChange={(e) => setEditStatus(e.target.value)} style={{ ...inputStyle, appearance: "none", paddingRight: 32, backgroundImage: "url('data:image/svg+xml;charset=UTF-8,%3csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23171717%22 stroke-width=%222%22%3e%3cpolyline points=%226 9 12 15 18 9%22%3e%3c/polyline%3e%3c/svg%3e')", backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center", backgroundSize: "16px" }}>
                      {truckStatuses.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {message && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 20, color: "#b91c1c", fontSize: FONT_SIZE.sm }}>{message}</div>}

                <button onClick={handleUpdate} disabled={submitting || !canEdit} style={{ width: "100%", padding: "12px 16px", background: submitting || !canEdit ? "#94a3b8" : "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: submitting || !canEdit ? "not-allowed" : "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, transition: "opacity 0.2s", opacity: submitting || !canEdit ? 0.7 : 1, minHeight: 44 }}>
                  {submitting ? "Saving..." : "Save Changes"}
                </button>
              </>
            )}

            {deletingPlate && (
              <>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                  <div style={{ width: 64, height: 64, background: "#fef2f2", color: "#ef4444", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                  </div>
                  <h3 style={{ margin: "0 0 12px", color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>Delete Truck</h3>
                  <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: FONT_SIZE.base, lineHeight: 1.5 }}>Are you sure you want to delete <strong>{deletingPlate}</strong>? This action cannot be undone and will permanently remove the truck data.</p>

                  {message && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 20, color: "#b91c1c", fontSize: FONT_SIZE.sm, width: "100%", textAlign: "left" }}>{message}</div>}

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, width: "100%" }}>
                    <button onClick={closeModals} style={{ padding: "12px 16px", background: "white", color: "#475569", border: "1px solid #cbd5e1", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, minHeight: 44, transition: "all 0.2s" }} onMouseEnter={e => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#0070f3"; e.currentTarget.style.color = "#0070f3" }} onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#cbd5e1"; e.currentTarget.style.color = "#475569" }}>
                      Cancel
                    </button>
                    <button onClick={() => handleDelete(deletingPlate)} disabled={submitting || !canEdit} style={{ padding: "12px 16px", background: submitting || !canEdit ? "#94a3b8" : "#ef4444", color: "white", border: "none", borderRadius: 8, cursor: submitting || !canEdit ? "not-allowed" : "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, opacity: submitting || !canEdit ? 0.7 : 1, minHeight: 44, transition: "all 0.2s" }} onMouseEnter={e => { if (!submitting && canEdit) e.currentTarget.style.background = "#dc2626" }} onMouseLeave={e => { e.currentTarget.style.background = "#ef4444" }}>
                      {submitting ? "Deleting..." : "Yes, Delete"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}