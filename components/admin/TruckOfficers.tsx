"use client"

import { useState, useEffect, useRef } from "react"
import { supabase } from "@/lib/supabase"
import { apiMutate } from "@/lib/api-mutation"
import ModernInput from "@/components/ModernInput"
import InviteSuccessCard from "@/components/admin/InviteSuccessCard"
import { usePermissions } from "@/lib/PermissionContext"

type TruckOfficer = {
  manager_id: string
  full_name: string
  phone_number: string | null
  status: string
  truck_count: number
  profile_picture_url?: string
}

type Truck = {
  plate_number: string
  truck_model: string
  status: string
  assigned_manager_id: string | null
  assigned_manager_name: string | null
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

const fontSize = { xs: 12, sm: 13, base: 14, md: 15, lg: 16, xl: 20, "2xl": 24, "3xl": 28 }

export default function ManageTruckOfficers() {
  const { getAccess } = usePermissions()
  const canEdit = getAccess("truck-officers").canEdit
  const { isMobile, isDesktop } = useBreakpoint()
  const [managers, setManagers] = useState<TruckOfficer[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>("card")
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [editingManager, setEditingManager] = useState<TruckOfficer | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [assigningManager, setAssigningManager] = useState<TruckOfficer | null>(null)
  const [allTrucks, setAllTrucks] = useState<Truck[]>([])
  const [assignedTrucks, setAssignedTrucks] = useState<Truck[]>([])
  const [trucksLoading, setTrucksLoading] = useState(false)

  const [fullName, setFullName] = useState("")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [email, setEmail] = useState("")
  const [editName, setEditName] = useState("")
  const [editPhone, setEditPhone] = useState("")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [inviteResult, setInviteResult] = useState<{ tempPassword: string; email: string } | null>(null)
  const [assignError, setAssignError] = useState("")
  const [pendingPlate, setPendingPlate] = useState<string | null>(null)

  const phoneRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const editPhoneRef = useRef<HTMLInputElement>(null)

  useEffect(() => { fetchManagers() }, [])

  async function fetchManagers() {
    setLoading(true)
    const { data } = await supabase
      .from("truck_officers")
      .select("manager_id, full_name, phone_number, status, profile_picture_url")
      .order("full_name", { ascending: true })

    if (!data) { setLoading(false); return }

    const enriched = await Promise.all(
      data.map(async (m) => {
        const { count } = await supabase
          .from("maintenance_assignments")
          .select("*", { count: "exact", head: true })
          .eq("manager_id", m.manager_id)
        return { ...m, truck_count: count || 0 }
      })
    )
    setManagers(enriched)
    setLoading(false)
  }

  async function fetchTrucksForAssignment(managerId: string) {
    setTrucksLoading(true)

    const { data: allTrucksRaw } = await supabase
      .from("Trucks")
      .select("plate_number, truck_model, status")
      .order("plate_number", { ascending: true })

    const { data: assignments } = await supabase
      .from("maintenance_assignments")
      .select("plate_number, manager_id")

    const { data: allManagersRaw } = await supabase
      .from("truck_officers")
      .select("manager_id, full_name")

    const assignmentMap = new Map(assignments?.map(a => [a.plate_number, a.manager_id]) || [])
    const managerMap = new Map(allManagersRaw?.map(m => [m.manager_id, m.full_name]) || [])

    const trucks: Truck[] = (allTrucksRaw || []).map((t) => ({
      plate_number: t.plate_number,
      truck_model: t.truck_model,
      status: t.status,
      assigned_manager_id: assignmentMap.get(t.plate_number) ?? null,
      assigned_manager_name: assignmentMap.get(t.plate_number) ? managerMap.get(assignmentMap.get(t.plate_number)!) ?? null : null,
    }))

    setAssignedTrucks(trucks.filter(t => t.assigned_manager_id === managerId))
    setAllTrucks(trucks)
    setTrucksLoading(false)
  }

  function closeModals() {
    setShowInviteModal(false)
    setEditingManager(null)
    setDeletingId(null)
    setAssigningManager(null)
    setFullName("")
    setPhoneNumber("")
    setEmail("")
    setEditName("")
    setEditPhone("")
    setMessage("")
    setAssignError("")
    setPendingPlate(null)
    setAllTrucks([])
    setAssignedTrucks([])
    setInviteResult(null)
  }

  async function handleInvite() {
    if (!fullName.trim()) return setMessage("Full name is required")
    if (!email.trim()) return setMessage("Email is required")
    setSubmitting(true)

    try {
      const res = await fetch("/api/invite-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, fullName, phoneNumber, role: "TruckOfficer" }),
      })
      const result = await res.json()

      if (!res.ok) { setMessage("Failed: " + result.error); return }
      setInviteResult({ tempPassword: result.tempPassword, email })
      fetchManagers()
    } catch {
      setMessage("Network error, please try again")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleUpdate() {
    if (!editingManager) return
    if (!editName.trim()) return setMessage("Name is required")
    setSubmitting(true)
    const { error } = await apiMutate("admin", {
      action: "update",
      table: "truck_officers",
      data: { full_name: editName, phone_number: editPhone || null },
      filters: { manager_id: editingManager.manager_id },
    })
    setSubmitting(false)
    if (error) { setMessage("Failed to update officer"); return }
    closeModals()
    fetchManagers()
  }

  async function handleDelete(managerId: string) {
    setSubmitting(true)
    const { error } = await apiMutate("admin", { action: "delete", table: "truck_officers", filters: { manager_id: managerId } })
    setSubmitting(false)
    if (error) { setMessage("Failed to delete officer"); return }
    closeModals()
    fetchManagers()
  }

  async function handleAssignTruck(plateNumber: string) {
    if (!assigningManager) return
    const truck = allTrucks.find(t => t.plate_number === plateNumber)
    if (truck?.assigned_manager_id && truck.assigned_manager_id !== assigningManager.manager_id) {
      setPendingPlate(plateNumber)
      setAssignError(`${plateNumber} is assigned to ${truck.assigned_manager_name}. Reassign anyway?`)
      return
    }
    setAssignError("")
    const { error } = await apiMutate("maintenance", {
      action: "upsert",
      table: "maintenance_assignments",
      data: { manager_id: assigningManager.manager_id, plate_number: plateNumber },
      conflict: "plate_number",
    })
    if (error) { setAssignError("Failed to assign truck"); return }
    fetchTrucksForAssignment(assigningManager.manager_id)
    fetchManagers()
  }

  async function handleUnassignTruck(plateNumber: string) {
    if (!assigningManager) return
    const { error } = await apiMutate("maintenance", {
      action: "delete",
      table: "maintenance_assignments",
      filters: { plate_number: plateNumber, manager_id: assigningManager.manager_id },
    })
    if (error) { setAssignError("Failed to unassign truck"); return }
    fetchTrucksForAssignment(assigningManager.manager_id)
    fetchManagers()
  }

  async function handleForceAssign(plateNumber: string) {
    if (!assigningManager) return
    setAssignError("")
    const { error } = await apiMutate("maintenance", {
      action: "upsert",
      table: "maintenance_assignments",
      data: { manager_id: assigningManager.manager_id, plate_number: plateNumber },
      conflict: "plate_number",
    })
    if (error) { setAssignError("Failed to reassign truck"); return }
    fetchTrucksForAssignment(assigningManager.manager_id)
    fetchManagers()
  }

  const statusColor = (status: string) => {
    switch (status) {
      case "Active": return { bg: "#d1fae5", color: "#065f46", border: "#a7f3d0" }
      case "Invited": return { bg: "#f0f7ff", color: "#0c4a6e", border: "#bfdbfe" }
      case "Suspended": return { bg: "#fee2e2", color: "#7f1d1d", border: "#fecaca" }
      default: return { bg: "#f3f4f6", color: "#6b7280", border: "#e5e7eb" }
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    boxSizing: "border-box",
    borderRadius: 8,
    border: "1px solid #e0e0e0",
    fontSize: fontSize.base,
    background: "white",
    color: "#171717",
    minHeight: 48,
    transition: "border-color 0.2s ease",
  }

  const unassignedTrucks = allTrucks.filter(t => !t.assigned_manager_id)
  const assignedToOthers = allTrucks.filter(t => t.assigned_manager_id && t.assigned_manager_id !== assigningManager?.manager_id)
  const assignedToThis = assignedTrucks

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: isMobile ? "16px" : "32px", fontFamily: "'Inter', sans-serif" }}>
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 16, marginBottom: 32 }}>
        <div>
          <h1 style={{ margin: 0, color: "#0f172a", fontSize: isMobile ? fontSize["2xl"] : fontSize["3xl"], fontWeight: 700, letterSpacing: "-0.5px" }}>
            Truck Officers
          </h1>
          <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: fontSize.base }}>
            Manage truck officers and their assigned vehicles.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, width: isMobile ? "100%" : "auto" }}>
          {managers.length > 0 && (
            <div style={{ display: "flex", background: "white", border: "1px solid #e2e8f0", borderRadius: 8, padding: 4, gap: 0 }}>
              <button onClick={() => setViewMode("card")} style={{ padding: "8px 12px", background: viewMode === "card" ? "#0070f3" : "transparent", color: viewMode === "card" ? "white" : "#64748b", border: "none", borderRadius: 6, cursor: "pointer", fontSize: fontSize.xs, fontWeight: 600, transition: "all 0.2s ease", minWidth: 44, height: 40, display: "flex", alignItems: "center", justifyContent: "center" }} title="Card view">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z" /></svg>
              </button>
              <button onClick={() => setViewMode("table")} style={{ padding: "8px 12px", background: viewMode === "table" ? "#0070f3" : "transparent", color: viewMode === "table" ? "white" : "#64748b", border: "none", borderRadius: 6, cursor: "pointer", fontSize: fontSize.xs, fontWeight: 600, transition: "all 0.2s ease", minWidth: 44, height: 40, display: "flex", alignItems: "center", justifyContent: "center" }} title="Table view">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 4h18v2H3V4zm0 7h18v2H3v-2zm0 7h18v2H3v-2z" /></svg>
              </button>
            </div>
          )}

          <button onClick={() => { if (!canEdit) return; setShowInviteModal(true); setMessage("") }} style={{ padding: isMobile ? "10px 16px" : "12px 20px", background: canEdit ? "#0070f3" : "#94a3b8", color: "white", border: "none", borderRadius: 8, cursor: canEdit ? "pointer" : "not-allowed", fontWeight: 600, fontSize: fontSize.md, flex: isMobile ? 1 : "0 0 auto", boxShadow: "0 4px 12px rgba(0, 112, 243, 0.2)", transition: "all 0.2s ease", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 40, whiteSpace: "nowrap" }} onMouseEnter={(e) => { if (!isMobile) e.currentTarget.style.transform = "translateY(-2px)" }} onMouseLeave={(e) => { if (!isMobile) e.currentTarget.style.transform = "none" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c5.5 0 10 4.5 10 10s-4.5 10-10 10S2 17.5 2 12 6.5 2 12 2m0 2c-4.4 0-8 3.6-8 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8m3.5 9h-3v3h-1v-3h-3v-1h3v-3h1v3h3v1z" /></svg>
            Add Officer
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "64px 0" }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid #e2e8f0", borderTopColor: "#0070f3", animation: "spin 1s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : managers.length === 0 ? (
        <div style={{ textAlign: "center", padding: "64px 24px", background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)" }}>
          <div style={{ width: 64, height: 64, background: "#f1f5f9", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
          </div>
          <h3 style={{ margin: "0 0 8px", color: "#0f172a", fontSize: fontSize.xl, fontWeight: 600 }}>No truck officers yet</h3>
          <p style={{ color: "#64748b", fontSize: fontSize.base, margin: "0 0 24px", maxWidth: 400, marginLeft: "auto", marginRight: "auto" }}>Add truck officers to manage vehicle assignments and maintenance.</p>
          <button onClick={() => { if (!canEdit) return; setShowInviteModal(true); setMessage("") }} style={{ padding: "10px 20px", background: canEdit ? "white" : "#94a3b8", color: "#0f172a", border: "1px solid #cbd5e1", borderRadius: 8, cursor: canEdit ? "pointer" : "not-allowed", fontWeight: 500, fontSize: fontSize.base, transition: "all 0.2s ease" }} onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"} onMouseLeave={e => e.currentTarget.style.background = "white"}>
            Add First Officer
          </button>
        </div>
      ) : (
        <>
          {viewMode === "card" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {managers.map((m) => {
                const { bg, color, border } = statusColor(m.status)
                return (
                  <div key={m.manager_id} style={{ background: "white", borderRadius: 12, padding: 16, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)", transition: "all 0.2s ease" }} onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.08)"; e.currentTarget.style.borderColor = "#cbd5e1" }} onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.05)"; e.currentTarget.style.borderColor = "#e2e8f0" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                        <div style={{ width: 40, height: 40, borderRadius: "50%", background: m.profile_picture_url ? "transparent" : "linear-gradient(135deg, #0070f3 0%, #0056d4 100%)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: fontSize.md, flexShrink: 0, overflow: "hidden" }}>
                          {m.profile_picture_url ? (
                            <img src={m.profile_picture_url} alt={m.full_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            m.full_name.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <h3 style={{ margin: "0 0 4px 0", color: "#0f172a", fontSize: fontSize.lg, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.full_name}</h3>
                          <p style={{ margin: 0, color: "#64748b", fontSize: fontSize.sm, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.phone_number || "No phone number"}</p>
                        </div>
                      </div>
                      <span style={{ padding: "4px 10px", borderRadius: 6, fontSize: fontSize.xs, background: bg, color: color, border: `1px solid ${border}`, fontWeight: 500, flexShrink: 0 }}>
                        {m.status}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, padding: "12px 0 0", borderTop: "1px solid #f1f5f9" }}>
                      <span style={{ fontSize: fontSize.sm, color: "#475569", fontWeight: 500 }}>
                        {m.truck_count} {m.truck_count === 1 ? "truck" : "trucks"} assigned
                      </span>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => { if (!canEdit) return; setAssigningManager(m); fetchTrucksForAssignment(m.manager_id); setAssignError("") }} style={{ padding: "8px 12px", cursor: canEdit ? "pointer" : "not-allowed", borderRadius: 6, border: "1px solid #e2e8f0", color: canEdit ? "#2f855a" : "#94a3b8", background: canEdit ? "#f0fdf4" : "#e2e8f0", fontSize: fontSize.sm, fontWeight: 500, transition: "all 0.2s" }} onMouseEnter={e => { if (!canEdit) return; e.currentTarget.style.background = "#ecfdf5"; e.currentTarget.style.borderColor = "#2f855a" }} onMouseLeave={e => { if (!canEdit) return; e.currentTarget.style.background = "#f0fdf4"; e.currentTarget.style.borderColor = "#e2e8f0" }}>
                          Assign
                        </button>
                        <button onClick={() => { if (!canEdit) return; setEditingManager(m); setEditName(m.full_name); setEditPhone(m.phone_number || ""); setMessage("") }} style={{ padding: "8px 12px", cursor: canEdit ? "pointer" : "not-allowed", borderRadius: 6, border: "1px solid #e2e8f0", color: canEdit ? "#0070f3" : "#94a3b8", background: canEdit ? "#f0f7ff" : "#e2e8f0", fontSize: fontSize.sm, fontWeight: 500, transition: "all 0.2s" }} onMouseEnter={e => { if (!canEdit) return; e.currentTarget.style.background = "#e0efff"; e.currentTarget.style.borderColor = "#0070f3" }} onMouseLeave={e => { if (!canEdit) return; e.currentTarget.style.background = "#f0f7ff"; e.currentTarget.style.borderColor = "#e2e8f0" }}>
                          Edit
                        </button>
                        <button onClick={() => { if (!canEdit) return; setDeletingId(m.manager_id); setMessage("") }} style={{ padding: "8px 12px", cursor: canEdit ? "pointer" : "not-allowed", borderRadius: 6, border: "1px solid #fee2e2", color: canEdit ? "#ef4444" : "#94a3b8", background: canEdit ? "#fef2f2" : "#e2e8f0", fontSize: fontSize.sm, fontWeight: 500, transition: "all 0.2s" }} onMouseEnter={e => { if (!canEdit) return; e.currentTarget.style.background = "#fee2e2" }} onMouseLeave={e => { if (!canEdit) return; e.currentTarget.style.background = "#fef2f2" }}>
                          Delete
                        </button>
                      </div>
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
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: fontSize.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Name</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: fontSize.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Phone</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: fontSize.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Trucks</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: fontSize.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Status</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: fontSize.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {managers.map((m, idx) => {
                    const { bg, color, border } = statusColor(m.status)
                    return (
                      <tr key={m.manager_id} style={{ borderBottom: idx === managers.length - 1 ? "none" : "1px solid #e2e8f0", transition: "background 0.2s ease" }} onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 36, height: 36, borderRadius: "50%", background: m.profile_picture_url ? "transparent" : "linear-gradient(135deg, #0070f3 0%, #0056d4 100%)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: fontSize.base, flexShrink: 0, overflow: "hidden" }}>
                              {m.profile_picture_url ? (
                                <img src={m.profile_picture_url} alt={m.full_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              ) : (
                                m.full_name.charAt(0).toUpperCase()
                              )}
                            </div>
                            <span style={{ color: "#0f172a", fontSize: fontSize.base, fontWeight: 500 }}>{m.full_name}</span>
                          </div>
                        </td>
                        <td style={{ padding: "12px 16px", color: "#475569", fontSize: fontSize.sm }}>
                          {m.phone_number || <span style={{ color: "#94a3b8", fontStyle: "italic" }}>Not provided</span>}
                        </td>
                        <td style={{ padding: "12px 16px", color: "#475569", fontSize: fontSize.sm, fontWeight: 500 }}>
                          {m.truck_count} {m.truck_count === 1 ? "truck" : "trucks"} assigned
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{ padding: "4px 10px", borderRadius: 6, fontSize: fontSize.xs, background: bg, color: color, border: `1px solid ${border}`, fontWeight: 500, display: "inline-block" }}>
                            {m.status}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button onClick={() => { if (!canEdit) return; setAssigningManager(m); fetchTrucksForAssignment(m.manager_id); setAssignError("") }} style={{ padding: "6px 10px", cursor: canEdit ? "pointer" : "not-allowed", borderRadius: 5, border: "1px solid #e2e8f0", color: canEdit ? "#2f855a" : "#94a3b8", background: canEdit ? "#f0fdf4" : "#e2e8f0", fontSize: fontSize.sm, fontWeight: 500, transition: "all 0.2s", minHeight: 32, minWidth: 32, display: "flex", alignItems: "center", justifyContent: "center" }} onMouseEnter={e => { if (!canEdit) return; e.currentTarget.style.background = "#ecfdf5"; e.currentTarget.style.borderColor = "#2f855a" }} onMouseLeave={e => { if (!canEdit) return; e.currentTarget.style.background = "#f0fdf4"; e.currentTarget.style.borderColor = "#e2e8f0" }}>
                              Assign
                            </button>
                            <button onClick={() => { if (!canEdit) return; setEditingManager(m); setEditName(m.full_name); setEditPhone(m.phone_number || ""); setMessage("") }} style={{ padding: "6px 10px", cursor: canEdit ? "pointer" : "not-allowed", borderRadius: 5, border: "1px solid #e2e8f0", color: canEdit ? "#0070f3" : "#94a3b8", background: canEdit ? "#f0f7ff" : "#e2e8f0", fontSize: fontSize.sm, fontWeight: 500, transition: "all 0.2s", minHeight: 32, minWidth: 32, display: "flex", alignItems: "center", justifyContent: "center" }} onMouseEnter={e => { if (!canEdit) return; e.currentTarget.style.background = "#e0efff"; e.currentTarget.style.borderColor = "#0070f3" }} onMouseLeave={e => { if (!canEdit) return; e.currentTarget.style.background = "#f0f7ff"; e.currentTarget.style.borderColor = "#e2e8f0" }}>
                              Edit
                            </button>
                            <button onClick={() => { if (!canEdit) return; setDeletingId(m.manager_id); setMessage("") }} style={{ padding: "6px 10px", cursor: canEdit ? "pointer" : "not-allowed", borderRadius: 5, border: "1px solid #fee2e2", color: canEdit ? "#ef4444" : "#94a3b8", background: canEdit ? "#fef2f2" : "#e2e8f0", fontSize: fontSize.sm, fontWeight: 500, transition: "all 0.2s", minHeight: 32, minWidth: 32, display: "flex", alignItems: "center", justifyContent: "center" }} onMouseEnter={e => { if (!canEdit) return; e.currentTarget.style.background = "#fee2e2" }} onMouseLeave={e => { if (!canEdit) return; e.currentTarget.style.background = "#fef2f2" }}>
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

      {(showInviteModal || editingManager || deletingId || assigningManager) && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 100, padding: isMobile ? 0 : 24, animation: "fadeIn 0.2s ease-out" }}>
          <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
          <div style={{ background: "white", borderRadius: isMobile ? "20px 20px 0 0" : 12, padding: isMobile ? "28px 20px" : 32, width: "100%", maxWidth: assigningManager ? 540 : 420, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)", animation: "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)" }}>

            {showInviteModal && (
              <>
                {inviteResult ? (
                  <InviteSuccessCard
                    tempPassword={inviteResult.tempPassword}
                    email={inviteResult.email}
                    onClose={() => { closeModals(); setInviteResult(null) }}
                  />
                ) : (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                      <h3 style={{ margin: 0, color: "#0f172a", fontSize: fontSize.xl, fontWeight: 700 }}>Add Truck Officer</h3>
                      <button onClick={closeModals} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 0, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", transition: "color 0.2s" }} onMouseEnter={e => e.currentTarget.style.color = "#64748b"} onMouseLeave={e => e.currentTarget.style.color = "#94a3b8"}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
                      <div>
                        <label style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: fontSize.sm, fontWeight: 500 }}>Full Name *</label>
                        <ModernInput type="text" placeholder="e.g. John Doe" value={fullName} onChange={(e: any) => { setFullName(e.target.value); setMessage("") }} onKeyDown={(e: any) => { if (e.key === "Enter") phoneRef.current?.focus() }} readOnly={!canEdit} style={inputStyle} autoFocus />
                      </div>
                      <div>
                        <label style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: fontSize.sm, fontWeight: 500 }}>Phone Number</label>
                        <ModernInput ref={phoneRef} type="text" placeholder="e.g. 08012345678" value={phoneNumber} onChange={(e: any) => { setPhoneNumber(e.target.value); setMessage("") }} onKeyDown={(e: any) => { if (e.key === "Enter") emailRef.current?.focus() }} readOnly={!canEdit} style={inputStyle} />
                      </div>
                      <div>
                        <label style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: fontSize.sm, fontWeight: 500 }}>Email Address *</label>
                        <ModernInput ref={emailRef} type="email" placeholder="e.g. officer@example.com" value={email} onChange={(e: any) => { setEmail(e.target.value); setMessage("") }} onKeyDown={(e: any) => { if (e.key === "Enter") handleInvite() }} readOnly={!canEdit} style={inputStyle} />
                      </div>
                    </div>
                    {message && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 20, color: "#b91c1c", fontSize: fontSize.sm }}>{message}</div>}
                    <button onClick={handleInvite} disabled={submitting || !canEdit} style={{ width: "100%", padding: "12px 16px", background: submitting || !canEdit ? "#94a3b8" : "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: submitting || !canEdit ? "not-allowed" : "pointer", fontWeight: 600, fontSize: fontSize.md, transition: "opacity 0.2s", opacity: submitting ? 0.7 : 1, minHeight: 44 }}>
                      {submitting ? "Sending Invite..." : "Send Invite"}
                    </button>
                  </>
                )}
              </>
            )}

            {editingManager && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                  <h3 style={{ margin: 0, color: "#0f172a", fontSize: fontSize.xl, fontWeight: 700 }}>Edit Officer</h3>
                  <button onClick={closeModals} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 0, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", transition: "color 0.2s" }} onMouseEnter={e => e.currentTarget.style.color = "#64748b"} onMouseLeave={e => e.currentTarget.style.color = "#94a3b8"}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
                  <div>
                    <label style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: fontSize.sm, fontWeight: 500 }}>Full Name *</label>
                    <ModernInput type="text" value={editName} onChange={(e: any) => { setEditName(e.target.value); setMessage("") }} onKeyDown={(e: any) => { if (e.key === "Enter") editPhoneRef.current?.focus() }} readOnly={!canEdit} style={inputStyle} autoFocus />
                  </div>
                  <div>
                    <label style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: fontSize.sm, fontWeight: 500 }}>Phone Number</label>
                    <ModernInput ref={editPhoneRef} type="text" value={editPhone} onChange={(e: any) => { setEditPhone(e.target.value); setMessage("") }} onKeyDown={(e: any) => { if (e.key === "Enter") handleUpdate() }} readOnly={!canEdit} style={inputStyle} />
                  </div>
                </div>
                {message && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 20, color: "#b91c1c", fontSize: fontSize.sm }}>{message}</div>}
                <button onClick={handleUpdate} disabled={submitting || !canEdit} style={{ width: "100%", padding: "12px 16px", background: submitting || !canEdit ? "#94a3b8" : "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: submitting || !canEdit ? "not-allowed" : "pointer", fontWeight: 600, fontSize: fontSize.md, transition: "opacity 0.2s", opacity: submitting ? 0.7 : 1, minHeight: 44 }}>
                  {submitting ? "Saving..." : "Save Changes"}
                </button>
              </>
            )}

            {deletingId && (
              <>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                  <div style={{ width: 64, height: 64, background: "#fef2f2", color: "#ef4444", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
                  </div>
                  <h3 style={{ margin: "0 0 12px", color: "#0f172a", fontSize: fontSize.xl, fontWeight: 700 }}>Delete Truck Officer</h3>
                  <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: fontSize.base, lineHeight: 1.5 }}>Are you sure? This will also remove all their truck assignments.</p>
                  {message && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 20, color: "#b91c1c", fontSize: fontSize.sm, width: "100%", textAlign: "left" }}>{message}</div>}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, width: "100%" }}>
                    <button onClick={closeModals} style={{ padding: "12px 16px", background: "white", color: "#475569", border: "1px solid #cbd5e1", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: fontSize.md, minHeight: 44, transition: "all 0.2s" }} onMouseEnter={e => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#0070f3"; e.currentTarget.style.color = "#0070f3" }} onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#cbd5e1"; e.currentTarget.style.color = "#475569" }}>
                      Cancel
                    </button>
                    <button onClick={() => handleDelete(deletingId)} disabled={submitting || !canEdit} style={{ padding: "12px 16px", background: submitting || !canEdit ? "#94a3b8" : "#ef4444", color: "white", border: "none", borderRadius: 8, cursor: submitting || !canEdit ? "not-allowed" : "pointer", fontWeight: 600, fontSize: fontSize.md, opacity: submitting ? 0.7 : 1, minHeight: 44, transition: "all 0.2s" }} onMouseEnter={e => { if (!submitting && canEdit) e.currentTarget.style.background = "#dc2626" }} onMouseLeave={e => { e.currentTarget.style.background = submitting || !canEdit ? "#94a3b8" : "#ef4444" }}>
                      {submitting ? "Deleting..." : "Yes, Delete"}
                    </button>
                  </div>
                </div>
              </>
            )}

            {assigningManager && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                  <div>
                    <h3 style={{ margin: 0, color: "#0f172a", fontSize: fontSize.xl, fontWeight: 700 }}>Assign Trucks</h3>
                    <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: fontSize.sm }}>
                      {assignedToThis.length} {assignedToThis.length === 1 ? "truck" : "trucks"} assigned
                    </p>
                  </div>
                  <button onClick={closeModals} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 0, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", transition: "color 0.2s" }} onMouseEnter={e => e.currentTarget.style.color = "#64748b"} onMouseLeave={e => e.currentTarget.style.color = "#94a3b8"}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
                </div>

                {assignError && (
                  <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
                    <p style={{ margin: 0, fontSize: fontSize.sm, color: "#78350f", lineHeight: 1.4 }}>{assignError}</p>
                    {assignError.includes("assigned to") && (
                      <button onClick={() => { if (!canEdit || !pendingPlate) return; handleForceAssign(pendingPlate) }} style={{ marginTop: 8, padding: "6px 12px", fontSize: fontSize.sm, cursor: canEdit ? "pointer" : "not-allowed", background: canEdit ? "#fcd34d" : "#94a3b8", color: canEdit ? "#78350f" : "#94a3b8", border: "none", borderRadius: 4, fontWeight: 500 }}>
                        Reassign Anyway
                      </button>
                    )}
                  </div>
                )}

                {trucksLoading && <p style={{ color: "#64748b", fontSize: fontSize.sm, textAlign: "center", padding: "20px 0" }}>Loading trucks...</p>}

                {!trucksLoading && (
                  <>
                    {assignedToThis.length > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        <p style={{ fontWeight: 500, marginBottom: 8, fontSize: fontSize.sm, color: "#475569" }}>Currently Assigned</p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {assignedToThis.map((t) => (
                            <div key={t.plate_number} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "#f0fdf4", border: "1px solid #a7f3d0", borderRadius: 6 }}>
                              <div>
                                <span style={{ fontWeight: 500, fontSize: fontSize.sm, color: "#0f172a" }}>{t.plate_number}</span>
                                <span style={{ fontSize: fontSize.xs, color: "#64748b", marginLeft: 8 }}>{t.truck_model}</span>
                              </div>
                              <button onClick={() => { if (!canEdit) return; handleUnassignTruck(t.plate_number) }} style={{ padding: "4px 10px", fontSize: fontSize.xs, cursor: canEdit ? "pointer" : "not-allowed", background: canEdit ? "white" : "#e2e8f0", border: "1px solid #fee2e2", color: canEdit ? "#ef4444" : "#94a3b8", borderRadius: 4, fontWeight: 500, transition: "all 0.2s" }} onMouseEnter={e => { if (!canEdit) return; e.currentTarget.style.background = "#fee2e2" }} onMouseLeave={e => { if (!canEdit) return; e.currentTarget.style.background = "white" }}>
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {unassignedTrucks.length > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        <p style={{ fontWeight: 500, marginBottom: 8, fontSize: fontSize.sm, color: "#475569" }}>Available Trucks</p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {unassignedTrucks.map((t) => (
                            <div key={t.plate_number} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "white", border: "1px solid #e2e8f0", borderRadius: 6 }}>
                              <div>
                                <span style={{ fontWeight: 500, fontSize: fontSize.sm, color: "#0f172a" }}>{t.plate_number}</span>
                                <span style={{ fontSize: fontSize.xs, color: "#64748b", marginLeft: 8 }}>{t.truck_model}</span>
                              </div>
                              <button onClick={() => { if (!canEdit) return; handleAssignTruck(t.plate_number) }} style={{ padding: "4px 10px", fontSize: fontSize.xs, cursor: canEdit ? "pointer" : "not-allowed", background: canEdit ? "#0070f3" : "#94a3b8", color: "white", border: "none", borderRadius: 4, fontWeight: 500, transition: "all 0.2s" }} onMouseEnter={e => { if (!canEdit) return; e.currentTarget.style.opacity = "0.9" }} onMouseLeave={e => { if (!canEdit) return; e.currentTarget.style.opacity = "1" }}>
                                Assign
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {assignedToOthers.length > 0 && (
                      <div>
                        <p style={{ fontWeight: 500, marginBottom: 8, fontSize: fontSize.sm, color: "#64748b" }}>Assigned to Others</p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {assignedToOthers.map((t) => (
                            <div key={t.plate_number} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "#fafafa", border: "1px solid #e5e7eb", borderRadius: 6 }}>
                              <div>
                                <span style={{ fontWeight: 500, fontSize: fontSize.sm, color: "#0f172a" }}>{t.plate_number}</span>
                                <span style={{ fontSize: fontSize.xs, color: "#64748b", marginLeft: 8 }}>{t.truck_model}</span>
                                <span style={{ fontSize: fontSize.xs, color: "#94a3b8", marginLeft: 8 }}>→ {t.assigned_manager_name}</span>
                              </div>
                              <button onClick={() => { if (!canEdit) return; setPendingPlate(t.plate_number); setAssignError(`${t.plate_number} is assigned to ${t.assigned_manager_name}. Reassign anyway?`) }} style={{ padding: "4px 10px", fontSize: fontSize.xs, cursor: canEdit ? "pointer" : "not-allowed", background: canEdit ? "white" : "#e2e8f0", border: "1px solid #fcd34d", color: canEdit ? "#f59e0b" : "#94a3b8", borderRadius: 4, fontWeight: 500, transition: "all 0.2s" }} onMouseEnter={e => { if (!canEdit) return; e.currentTarget.style.background = "#fffbeb" }} onMouseLeave={e => { if (!canEdit) return; e.currentTarget.style.background = "white" }}>
                                Reassign
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {unassignedTrucks.length === 0 && assignedToOthers.length === 0 && assignedToThis.length === 0 && (
                      <p style={{ color: "#64748b", fontSize: fontSize.sm, textAlign: "center", padding: "20px 0" }}>No trucks in system</p>
                    )}
                  </>
                )}

                <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
                  <button onClick={closeModals} style={{ padding: "10px 24px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: fontSize.md, minHeight: 40 }}>
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}