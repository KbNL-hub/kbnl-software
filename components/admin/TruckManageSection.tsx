"use client"

import { FONT_SIZE } from "@/lib/constants"

import { useState, useEffect, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import { Icon } from "@iconify/react"
import { apiMutate } from "@/lib/api-mutation"

type Truck = {
  plate_number: string
  kbnl_truck_no: string | null
  truck_model: string
  status: string
  fuel_balance: number
}

type ViewMode = "card" | "table"

const TRUCK_STATUSES = ["Empty", "Loaded", "Undergoing Repairs", "To Plant", "At Plant", "To Refuel", "Decommissioned"]

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
  } else if (filter === "To Plant") {
    return { bg: "#f0f0ff", textColor: "#874cf5", borderColor: "#874cf5" }
  } else if (filter === "At Plant") {
    return { bg: "#eef2ff", textColor: "#6366f1", borderColor: "#6366f1" }
  } else if (filter === "To Refuel") {
    return { bg: "#ecfeff", textColor: "#0891b2", borderColor: "#0891b2" }
  } else if (filter === "Undergoing Repairs") {
    return { bg: "#fffbeb", textColor: "#f5a623", borderColor: "#f5a623" }
  } else if (filter === "Decommissioned") {
    return { bg: "#fef2f2", textColor: "#ef4444", borderColor: "#ef4444" }
  }

  return { bg: "white", textColor: "#64748b", borderColor: "#e2e8f0" }
}

type StatusMenuProps = {
  current: string
  isUpdating: boolean
  onSelect: (status: string) => void
  position: { top: number; right: number }
  onClose: () => void
}

function StatusMenu({ current, isUpdating, onSelect, position, onClose }: StatusMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuRef.current) return
    const menu = menuRef.current
    const rect = menu.getBoundingClientRect()
    const viewportH = window.innerHeight
    if (rect.bottom > viewportH - 8) {
      menu.style.top = "auto"
      menu.style.bottom = `${viewportH - position.top + 6}px`
      menu.style.right = `${position.right}px`
    }
  }, [position])

  return createPortal(
    <div
      ref={menuRef}
      data-status-menu
      style={{
        position: "fixed", top: position.top, right: position.right, zIndex: 9999, minWidth: 220,
        background: "white", border: "1px solid #e2e8f0", borderRadius: 10,
        boxShadow: "0 8px 24px rgba(0,0,0,0.12)", overflow: "hidden",
      }}
    >
      <p style={{ margin: 0, padding: "10px 14px 6px", fontSize: FONT_SIZE.xs, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "#94a3b8" }}>
        Select status
      </p>
      {TRUCK_STATUSES.map((s, idx) => {
        const pill = getPillStyle(s, true)
        const isCurrent = s === current
        return (
          <button
            key={s}
            disabled={isCurrent || isUpdating}
            onClick={() => onSelect(s)}
            style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%",
              padding: "10px 14px", background: "transparent", border: "none",
              borderTop: idx === 0 ? "none" : "1px solid #f1f5f9",
              cursor: isCurrent || isUpdating ? "default" : "pointer", textAlign: "left",
              fontSize: FONT_SIZE.sm, fontWeight: 500,
              color: isCurrent ? "#94a3b8" : "#0f172a",
              transition: "background 0.15s",
            }}
            onMouseEnter={e => { if (!isCurrent && !isUpdating) e.currentTarget.style.background = "#f8fafc" }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent" }}
          >
            <span style={{ width: 8, height: 8, borderRadius: 999, background: pill.textColor, flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{s}</span>
            {isCurrent && <Icon icon="mdi:check" width={16} color="#16a34a" />}
          </button>
        )
      })}
    </div>,
    document.body
  )
}

type Props = {
  trucks: Truck[]
  onRefresh: () => void
}

export default function TruckManageSection({ trucks, onRefresh }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("card")
  const [filterStatus, setFilterStatus] = useState("All")
  const [updatingPlate, setUpdatingPlate] = useState<string | null>(null)
  const [statusMenuPlate, setStatusMenuPlate] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [messageType, setMessageType] = useState<"success" | "error">("success")

  const triggerRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null)

  const measureAndOpen = useCallback((plateNumber: string) => {
    const btn = triggerRefs.current.get(plateNumber)
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    setMenuPosition({ top: rect.bottom + 6, right: window.innerWidth - rect.right })
    setStatusMenuPlate(plateNumber)
  }, [])

  useEffect(() => {
    if (!statusMenuPlate) { setMenuPosition(null); return }
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target?.closest("[data-status-menu]")) setStatusMenuPlate(null)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [statusMenuPlate])

  const filteredTrucks = filterStatus === "All"
    ? trucks
    : trucks.filter(t => t.status === filterStatus)

  async function updateTruckStatus(plateNumber: string, newStatus: string) {
    setUpdatingPlate(plateNumber)
    setMessage("")

    try {
      const { error } = await apiMutate("admin", {
        action: "update",
        table: "Trucks",
        data: { status: newStatus },
        filters: { plate_number: plateNumber },
      })

      if (error) {
        setMessage(`Failed to update status: ${error}`)
        setMessageType("error")
        return
      }

      setMessage(`Status updated to "${newStatus}"`)
      setMessageType("success")
      setTimeout(() => setMessage(""), 3000)
      onRefresh()
    } catch {
      setMessage("Failed to update status")
      setMessageType("error")
    } finally {
      setUpdatingPlate(null)
    }
  }

  const renderStatusControl = (truck: Truck, isUpdating: boolean, compact = false) => (
    <button
      ref={el => { if (el) triggerRefs.current.set(truck.plate_number, el) }}
      onClick={() => { statusMenuPlate === truck.plate_number ? setStatusMenuPlate(null) : measureAndOpen(truck.plate_number) }}
      disabled={isUpdating}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
        padding: compact ? "6px 10px" : "8px 14px",
        minWidth: compact ? undefined : "100%",
        minHeight: compact ? 32 : 40,
        cursor: isUpdating ? "not-allowed" : "pointer",
        borderRadius: 6, border: "1px solid #e2e8f0", background: "white",
        color: isUpdating ? "#94a3b8" : "#334155",
        fontSize: compact ? FONT_SIZE.xs : FONT_SIZE.sm, fontWeight: 600,
        transition: "all 0.2s", opacity: isUpdating ? 0.7 : 1, whiteSpace: "nowrap",
      }}
      onMouseEnter={e => { if (!isUpdating) { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1" } }}
      onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#e2e8f0" }}
    >
      {isUpdating ? "Updating..." : "Set status"}
      <Icon icon="mdi:chevron-down" width={compact ? 14 : 16} />
      {statusMenuPlate === truck.plate_number && menuPosition && (
        <StatusMenu
          current={truck.status}
          isUpdating={isUpdating}
          position={menuPosition}
          onClose={() => setStatusMenuPlate(null)}
          onSelect={s => { setStatusMenuPlate(null); updateTruckStatus(truck.plate_number, s) }}
        />
      )}
    </button>
  )

  const statusPillColor = (status: string) => {
    const pill = getPillStyle(status, true)
    return { bg: pill.bg, color: pill.textColor, border: pill.borderColor }
  }

  return (
    <div>
      {message && (
        <div style={{
          padding: 12, borderRadius: 8, marginBottom: 20, fontSize: FONT_SIZE.sm, fontWeight: 600,
          display: "flex", alignItems: "center", gap: 8,
          background: messageType === "success" ? "#f0fff4" : "#fef2f2",
          border: messageType === "success" ? "1px solid #86efac" : "1px solid #fecaca",
          color: messageType === "success" ? "#166534" : "#b91c1c",
        }}>
          {messageType === "success" ? "✓" : "✕"} {message}
        </div>
      )}

      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        {trucks.length > 0 && (
          <div style={{ display: "flex", background: "white", border: "1px solid #e2e8f0", borderRadius: 8, padding: 4, gap: 0 }}>
            <button
              onClick={() => setViewMode("card")}
              style={{
                padding: "8px 12px", background: viewMode === "card" ? "#0070f3" : "transparent",
                color: viewMode === "card" ? "white" : "#64748b", border: "none", borderRadius: 6,
                cursor: "pointer", fontSize: FONT_SIZE.xs, fontWeight: 600,
                minWidth: 44, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
              }}
              title="Card view"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z"/></svg>
            </button>
            <button
              onClick={() => setViewMode("table")}
              style={{
                padding: "8px 12px", background: viewMode === "table" ? "#0070f3" : "transparent",
                color: viewMode === "table" ? "white" : "#64748b", border: "none", borderRadius: 6,
                cursor: "pointer", fontSize: FONT_SIZE.xs, fontWeight: 600,
                minWidth: 44, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
              }}
              title="Table view"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 4h18v2H3V4zm0 7h18v2H3v-2zm0 7h18v2H3v-2z"/></svg>
            </button>
          </div>
        )}
        <button
          onClick={onRefresh}
          style={{
            padding: "8px 12px", background: "white", color: "#64748b",
            border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer",
            fontSize: FONT_SIZE.xs, fontWeight: 500, minHeight: 40, minWidth: 40,
            display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1" }}
          onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#e2e8f0" }}
          title="Refresh"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36M20.49 15a9 9 0 0 1-14.85 3.36"/></svg>
        </button>
      </div>

      {/* Filter Pills */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
        {["All", ...TRUCK_STATUSES].map(option => {
          const isActive = filterStatus === option
          const pill = getPillStyle(option, isActive)
          return (
            <button
              key={option}
              onClick={() => setFilterStatus(option)}
              style={{
                padding: "8px 14px", borderRadius: 20, fontSize: FONT_SIZE.sm, cursor: "pointer",
                border: `1.5px solid ${pill.borderColor}`, background: pill.bg,
                color: pill.textColor, fontWeight: isActive ? 600 : 500, transition: "all 0.2s",
              }}
              onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1" } }}
              onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#e2e8f0" } }}
            >
              {option}
            </button>
          )
        })}
      </div>

      {/* Content */}
      {filteredTrucks.length === 0 ? (
        <div style={{ textAlign: "center", padding: "64px 24px", background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)" }}>
          <h3 style={{ margin: "0 0 8px", color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 600 }}>No trucks found</h3>
          <p style={{ color: "#64748b", fontSize: FONT_SIZE.base, margin: 0 }}>
            {filterStatus === "All" ? "No trucks assigned." : `No trucks with status "${filterStatus}".`}
          </p>
        </div>
      ) : (
        <>
          {/* Card View */}
          {viewMode === "card" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {filteredTrucks.map(truck => {
                const pill = statusPillColor(truck.status)
                const isUpdating = updatingPlate === truck.plate_number
                return (
                  <div key={truck.plate_number} style={{ background: "white", borderRadius: 12, padding: 16, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)", transition: "all 0.2s ease" }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.08)"; e.currentTarget.style.borderColor = "#cbd5e1" }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.05)"; e.currentTarget.style.borderColor = "#e2e8f0" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <h3 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.lg, fontWeight: 600 }}>{truck.plate_number}</h3>
                          {truck.kbnl_truck_no && (
                            <span style={{ color: "#94a3b8", fontSize: FONT_SIZE.xs }}>· #{truck.kbnl_truck_no}</span>
                          )}
                        </div>
                        <p style={{ margin: 0, color: "#64748b", fontSize: FONT_SIZE.sm }}>{truck.truck_model}</p>
                      </div>
                      <span style={{
                        padding: "6px 12px", borderRadius: 16, fontSize: FONT_SIZE.xs, fontWeight: 600,
                        background: pill.bg, color: pill.color,
                        border: `1.5px solid ${pill.border}`, whiteSpace: "nowrap",
                      }}>
                        {truck.status}
                      </span>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "12px 0", borderTop: "1px solid #f1f5f9", borderBottom: "1px solid #f1f5f9" }}>
                      <div>
                        <p style={{ margin: "0 0 4px 0", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>Fuel Balance</p>
                        <p style={{ margin: 0, color: "#0070f3", fontSize: FONT_SIZE.lg, fontWeight: 600 }}>{truck.fuel_balance}L</p>
                      </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                      {renderStatusControl(truck, isUpdating)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Table View */}
          {viewMode === "table" && (
            <div style={{ background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Truck</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Model</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Status</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTrucks.map((truck, idx) => {
                    const pill = statusPillColor(truck.status)
                    const isUpdating = updatingPlate === truck.plate_number
                    return (
                      <tr key={truck.plate_number} style={{ borderBottom: idx === filteredTrucks.length - 1 ? "none" : "1px solid #e2e8f0", transition: "background 0.2s ease" }}
                        onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <td style={{ padding: "12px 16px" }}>
                          <strong style={{ color: "#0f172a", fontSize: FONT_SIZE.base }}>{truck.plate_number}</strong>
                          {truck.kbnl_truck_no && <div style={{ fontSize: FONT_SIZE.xs, color: "#94a3b8", marginTop: 2 }}>#{truck.kbnl_truck_no}</div>}
                        </td>
                        <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: FONT_SIZE.base }}>{truck.truck_model}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{
                            padding: "6px 10px", borderRadius: 14, fontSize: FONT_SIZE.xs, fontWeight: 600,
                            background: pill.bg, color: pill.color, border: `1.5px solid ${pill.border}`,
                          }}>
                            {truck.status}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          {renderStatusControl(truck, isUpdating, true)}
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
    </div>
  )
}
