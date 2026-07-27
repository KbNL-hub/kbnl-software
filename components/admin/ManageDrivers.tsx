"use client"

import { FONT_SIZE } from "@/lib/constants"

import Image from "next/image"
import React, { useState, useEffect, useRef } from "react"
import { supabase } from "@/lib/supabase"
import ModernInput from "@/components/ModernInput"
import InviteSuccessCard from "@/components/admin/InviteSuccessCard"
import { apiMutate } from "@/lib/api-mutation"
import { usePermissions } from "@/lib/PermissionContext"

type Driver = {
  driver_id: string
  full_name: string
  phone_number: string
  status: string
  created_at: string
  profile_picture_url?: string
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



const getPillStyle = (filter: string, isActive: boolean) => {
  if (!isActive) {
    return { bg: "white", textColor: "#64748b", borderColor: "#e2e8f0" }
  }
  
  if (filter === "All") {
    return { bg: "#171717", textColor: "white", borderColor: "#171717" }
  } else if (filter === "Active") {
    return { bg: "#f0fdf4", textColor: "#16a34a", borderColor: "#16a34a" }
  } else if (filter === "Invited") {
    return { bg: "#fffbeb", textColor: "#f5a623", borderColor: "#f5a623" }
  } else if (filter === "Suspended") {
    return { bg: "#fef2f2", textColor: "#ef4444", borderColor: "#ef4444" }
  }
  
  return { bg: "white", textColor: "#64748b", borderColor: "#e2e8f0" }
}

export default function ManageDrivers() {
  const { isMobile } = useBreakpoint()
  const { getAccess } = usePermissions()
  const canEdit = getAccess("manage-drivers").canEdit
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>("card")
  const [filterStatus, setFilterStatus] = useState("All")
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null)
  const [editName, setEditName] = useState("")
  const [editPhone, setEditPhone] = useState("")
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // Invite state
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [fullName, setFullName] = useState("")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [email, setEmail] = useState("")
  const [inviteResult, setInviteResult] = useState<{ tempPassword: string; email: string } | null>(null)

  const phoneRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const editPhoneRef = useRef<HTMLInputElement>(null)

  const filterOptions = ["All", "Active", "Invited", "Suspended"]
  const filteredDrivers = filterStatus === "All" ? drivers : drivers.filter((d) => d.status === filterStatus)

  async function fetchDrivers() {
    const { data, error } = await supabase
      .from("Drivers")
      .select("driver_id, full_name, phone_number, status, created_at, profile_picture_url")
      .order("full_name", { ascending: true })

    if (!error) setDrivers(data || [])
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchDrivers() }, [])

  function startEdit(driver: Driver) {
    setEditingDriver(driver)
    setEditName(driver.full_name)
    setEditPhone(driver.phone_number)
    setMessage("")
  }

  function closeModals() {
    setShowInviteModal(false)
    setEditingDriver(null)
    setDeletingId(null)
    setFullName("")
    setPhoneNumber("")
    setEmail("")
    setEditName("")
    setEditPhone("")
    setMessage("")
    setInviteResult(null)
  }

  async function handleUpdate() {
    if (!canEdit) return
    if (!editingDriver) return
    if (!editName.trim()) return setMessage("Full name is required")

    setSubmitting(true)

    try {
      const { error } = await apiMutate("admin", {
        action: "update",
        table: "Drivers",
        data: { full_name: editName, phone_number: editPhone || null },
        filters: { driver_id: editingDriver.driver_id },
      })

      if (error) {
        setMessage(error)
      } else {
        closeModals()
        fetchDrivers()
      }
    } catch {
      setMessage("Network error, please try again")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSuspend(driver: Driver) {
    if (!canEdit) return
    const newStatus = driver.status === "Suspended" ? "Active" : "Suspended"
    setSubmitting(true)

    try {
      const { error } = await apiMutate("admin", {
        action: "update",
        table: "Drivers",
        data: { status: newStatus },
        filters: { driver_id: driver.driver_id },
      })

      if (error) {
        setMessage(error)
      } else {
        fetchDrivers()
      }
    } catch {
      setMessage("Network error, please try again")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(driver_id: string) {
    if (!canEdit) return
    setSubmitting(true)

    try {
      const { error } = await apiMutate("admin", {
        action: "delete",
        table: "Drivers",
        filters: { driver_id },
      })

      if (error) {
        setMessage(error)
      } else {
        closeModals()
        fetchDrivers()
      }
    } catch {
      setMessage("Network error, please try again")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleInvite() {
    if (!fullName.trim()) return setMessage("Full name is required")
    if (!email.trim()) return setMessage("Email is required")

    setSubmitting(true)

    try {
      const res = await fetch("/api/invite-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, fullName, phoneNumber, role: "Driver" }),
      })

      const result = await res.json()

      if (!res.ok) {
        setMessage("Failed: " + result.error)
        return
      }

      setInviteResult({ tempPassword: result.tempPassword, email })
      fetchDrivers()
    } catch {
      setMessage("Network error, please try again")
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
            Drivers
          </h1>
          <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: FONT_SIZE.base }}>
            Manage driver accounts and status.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, width: isMobile ? "100%" : "auto" }}>
          {drivers.length > 0 && (
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

          <button
            onClick={() => setShowInviteModal(true)}
            disabled={!canEdit}
            style={{
              padding: isMobile ? "10px 16px" : "12px 20px",
              background: !canEdit ? "#94a3b8" : "#0070f3",
              color: "white",
              border: "none",
              borderRadius: 8,
              cursor: !canEdit ? "not-allowed" : "pointer",
              fontWeight: 600,
              fontSize: FONT_SIZE.md,
              flex: isMobile ? 1 : "0 0 auto",
              boxShadow: "0 4px 12px rgba(0, 112, 243, 0.2)",
              transition: "all 0.2s ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              minHeight: 40,
              whiteSpace: "nowrap"
            }}
            onMouseEnter={(e) => {
              if (!isMobile) (e.currentTarget.style.transform = "translateY(-2px)")
            }}
            onMouseLeave={(e) => {
              if (!isMobile) (e.currentTarget.style.transform = "none")
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c5.5 0 10 4.5 10 10s-4.5 10-10 10S2 17.5 2 12 6.5 2 12 2m0 2c-4.4 0-8 3.6-8 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8m3.5 9h-3v3h-1v-3h-3v-1h3v-3h1v3h3v1z"/></svg>
            Add Driver
          </button>
        </div>
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
      ) : filteredDrivers.length === 0 ? (
        <div style={{ textAlign: "center", padding: "64px 24px", background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)" }}>
          <h3 style={{ margin: "0 0 8px", color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 600 }}>No drivers found</h3>
          <p style={{ color: "#64748b", fontSize: FONT_SIZE.base, margin: 0 }}>
            {filterStatus === "All" ? "No drivers in the system." : `No drivers with status "${filterStatus}".`}
          </p>
        </div>
      ) : (
        <>
          {viewMode === "card" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {filteredDrivers.map((driver) => {
                const pill = statusPillColor(driver.status)
                return (
                  <div key={driver.driver_id} style={{ background: "white", borderRadius: 12, padding: 16, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)", transition: "all 0.2s ease" }} onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.08)"; e.currentTarget.style.borderColor = "#cbd5e1" }} onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.05)"; e.currentTarget.style.borderColor = "#e2e8f0" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                        <div style={{ width: 40, height: 40, borderRadius: "50%", background: driver.profile_picture_url ? "transparent" : "linear-gradient(135deg, #0070f3 0%, #0056d4 100%)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: FONT_SIZE.md, flexShrink: 0, overflow: "hidden" }}>
                          {driver.profile_picture_url ? (
                                <Image src={driver.profile_picture_url} alt={driver.full_name} width={36} height={36} unoptimized style={{ objectFit: "cover" }} />
                          ) : (
                            driver.full_name.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <h3 style={{ margin: "0 0 4px 0", color: "#0f172a", fontSize: FONT_SIZE.lg, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{driver.full_name}</h3>
                          <p style={{ margin: 0, color: "#64748b", fontSize: FONT_SIZE.sm, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{driver.phone_number || "No phone"}</p>
                        </div>
                      </div>
                      <span style={{ padding: "6px 12px", borderRadius: 16, fontSize: FONT_SIZE.xs, fontWeight: 600, background: pill.bg, color: pill.color, border: `1.5px solid ${pill.border}`, whiteSpace: "nowrap" }}>
                        {driver.status}
                      </span>
                    </div>

                    <p style={{ margin: "12px 0", padding: "12px 0", borderTop: "1px solid #f1f5f9", borderBottom: "1px solid #f1f5f9", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>
                      Joined {new Date(driver.created_at).toLocaleDateString()}
                    </p>

                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => startEdit(driver)}
                        disabled={!canEdit}
                        style={{ flex: 1, padding: "8px 12px", cursor: !canEdit ? "not-allowed" : "pointer", borderRadius: 6, border: "1px solid #e2e8f0", color: "#0070f3", background: !canEdit ? "#94a3b8" : "#f0f7ff", fontSize: FONT_SIZE.sm, fontWeight: 500, transition: "all 0.2s" }}
                        onMouseEnter={e => { if (canEdit) { e.currentTarget.style.background = "#e0efff"; e.currentTarget.style.borderColor = "#0070f3" } }}
                        onMouseLeave={e => { if (canEdit) { e.currentTarget.style.background = "#f0f7ff"; e.currentTarget.style.borderColor = "#e2e8f0" } }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleSuspend(driver)}
                        disabled={!canEdit}
                        style={{ flex: 1, padding: "8px 12px", cursor: !canEdit ? "not-allowed" : "pointer", borderRadius: 6, border: `1px solid ${!canEdit ? "#94a3b8" : driver.status === "Suspended" ? "#16a34a" : "#f5a623"}`, color: !canEdit ? "#94a3b8" : driver.status === "Suspended" ? "#16a34a" : "#f5a623", background: !canEdit ? "#e2e8f0" : driver.status === "Suspended" ? "#f0fdf4" : "#fffbeb", fontSize: FONT_SIZE.sm, fontWeight: 500, transition: "all 0.2s" }}
                        onMouseEnter={e => { if (!canEdit) return; e.currentTarget.style.opacity = "0.8" }}
                        onMouseLeave={e => { if (!canEdit) return; e.currentTarget.style.opacity = "1" }}
                      >
                        {driver.status === "Suspended" ? "Unsuspend" : "Suspend"}
                      </button>
                      <button
                        onClick={() => { setDeletingId(driver.driver_id); setMessage("") }}
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
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Name</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Phone</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Status</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Joined</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDrivers.map((driver, idx) => {
                    const pill = statusPillColor(driver.status)
                    return (
                      <tr key={driver.driver_id} style={{ borderBottom: idx === filteredDrivers.length - 1 ? "none" : "1px solid #e2e8f0", transition: "background 0.2s ease" }} onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 36, height: 36, borderRadius: "50%", background: driver.profile_picture_url ? "transparent" : "linear-gradient(135deg, #0070f3 0%, #0056d4 100%)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: FONT_SIZE.base, flexShrink: 0, overflow: "hidden" }}>
                              {driver.profile_picture_url ? (
                            <Image src={driver.profile_picture_url} alt={driver.full_name} width={40} height={40} unoptimized style={{ objectFit: "cover" }} />
                              ) : (
                                driver.full_name.charAt(0).toUpperCase()
                              )}
                            </div>
                            <span style={{ color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 500 }}>{driver.full_name}</span>
                          </div>
                        </td>
                        <td style={{ padding: "12px 16px", color: "#64748b", fontSize: FONT_SIZE.sm }}>{driver.phone_number || "—"}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{ padding: "6px 10px", borderRadius: 14, fontSize: FONT_SIZE.xs, fontWeight: 600, background: pill.bg, color: pill.color, border: `1.5px solid ${pill.border}` }}>
                            {driver.status}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px", color: "#94a3b8", fontSize: FONT_SIZE.sm }}>
                          {new Date(driver.created_at).toLocaleDateString()}
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right" }}>
                          <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", flexWrap: "wrap" }}>
                            <button
                              onClick={() => startEdit(driver)}
                              disabled={!canEdit}
                              style={{ padding: "6px 10px", cursor: !canEdit ? "not-allowed" : "pointer", borderRadius: 6, border: "1px solid #e2e8f0", color: "#0070f3", background: !canEdit ? "#94a3b8" : "#f0f7ff", fontSize: FONT_SIZE.xs, fontWeight: 500, transition: "all 0.2s", minHeight: 32 }}
                              onMouseEnter={e => { if (canEdit) { e.currentTarget.style.background = "#e0efff"; e.currentTarget.style.borderColor = "#0070f3" } }}
                              onMouseLeave={e => { if (canEdit) { e.currentTarget.style.background = "#f0f7ff"; e.currentTarget.style.borderColor = "#e2e8f0" } }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleSuspend(driver)}
                              disabled={!canEdit}
                              style={{ padding: "6px 10px", cursor: !canEdit ? "not-allowed" : "pointer", borderRadius: 6, border: `1px solid ${!canEdit ? "#94a3b8" : driver.status === "Suspended" ? "#16a34a" : "#f5a623"}`, color: !canEdit ? "#94a3b8" : driver.status === "Suspended" ? "#16a34a" : "#f5a623", background: !canEdit ? "#e2e8f0" : driver.status === "Suspended" ? "#f0fdf4" : "#fffbeb", fontSize: FONT_SIZE.xs, fontWeight: 500, transition: "all 0.2s", minHeight: 32 }}
                              onMouseEnter={e => { if (!canEdit) return; e.currentTarget.style.opacity = "0.8" }}
                              onMouseLeave={e => { if (!canEdit) return; e.currentTarget.style.opacity = "1" }}
                            >
                              {driver.status === "Suspended" ? "Unsuspend" : "Suspend"}
                            </button>
                            <button
                              onClick={() => { setDeletingId(driver.driver_id); setMessage("") }}
                              disabled={!canEdit}
                              style={{ padding: "6px 10px", cursor: !canEdit ? "not-allowed" : "pointer", borderRadius: 6, border: "1px solid #fee2e2", color: "#ef4444", background: !canEdit ? "#94a3b8" : "#fef2f2", fontSize: FONT_SIZE.xs, fontWeight: 500, transition: "all 0.2s", minHeight: 32 }}
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

      {(showInviteModal || editingDriver || deletingId) && (
        <div
          onClick={closeModals}
          style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 100, padding: isMobile ? 0 : 24, animation: "fadeIn 0.2s ease-out" }}
        >
          <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: "white", borderRadius: isMobile ? "20px 20px 0 0" : 12, padding: isMobile ? "28px 20px" : 32, width: "100%", maxWidth: 440, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)", animation: "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)" }}
          >

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
                      <h3 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>Add New Driver</h3>
                      <button onClick={closeModals} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 0, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", transition: "color 0.2s" }} onMouseEnter={e => e.currentTarget.style.color = "#64748b"} onMouseLeave={e => e.currentTarget.style.color = "#94a3b8"}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
                      <div>
                        <label style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: FONT_SIZE.sm, fontWeight: 500 }}>Full Name *</label>
                        <ModernInput
                          type="text"
                          placeholder="e.g. John Doe"
                          value={fullName}
                          readOnly={!canEdit}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setFullName(e.target.value); setMessage("") }}
                          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") phoneRef.current?.focus() }}
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: FONT_SIZE.sm, fontWeight: 500 }}>Phone Number</label>
                        <ModernInput
                          ref={phoneRef}
                          type="text"
                          placeholder="e.g. 08012345678"
                          value={phoneNumber}
                          readOnly={!canEdit}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setPhoneNumber(e.target.value); setMessage("") }}
                          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") emailRef.current?.focus() }}
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: FONT_SIZE.sm, fontWeight: 500 }}>Email Address *</label>
                        <ModernInput
                          ref={emailRef}
                          type="email"
                          placeholder="e.g. driver@example.com"
                          value={email}
                          readOnly={!canEdit}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setEmail(e.target.value); setMessage("") }}
                          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") handleInvite() }}
                          style={inputStyle}
                        />
                      </div>
                    </div>

                    {message && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 20, color: "#b91c1c", fontSize: FONT_SIZE.sm }}>{message}</div>}

                    <button
                      onClick={handleInvite}
                      disabled={submitting || !canEdit}
                      style={{ width: "100%", padding: "12px 16px", background: submitting || !canEdit ? "#94a3b8" : "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: submitting || !canEdit ? "not-allowed" : "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, transition: "opacity 0.2s", opacity: submitting || !canEdit ? 0.7 : 1, minHeight: 44 }}
                    >
                      {submitting ? "Adding User..." : "Add User"}
                    </button>
                  </>
                )}
              </>
            )}

            {editingDriver && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                  <h3 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>Edit Driver</h3>
                  <button onClick={closeModals} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 0, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", transition: "color 0.2s" }} onMouseEnter={e => e.currentTarget.style.color = "#64748b"} onMouseLeave={e => e.currentTarget.style.color = "#94a3b8"}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
                  <div>
                    <label style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: FONT_SIZE.sm, fontWeight: 500 }}>Full Name *</label>
                    <input type="text" value={editName} readOnly={!canEdit} onChange={(e) => { setEditName(e.target.value); setMessage("") }} onKeyDown={(e) => { if (e.key === "Enter") editPhoneRef.current?.focus() }} style={inputStyle} />
                  </div>

                  <div>
                    <label style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: FONT_SIZE.sm, fontWeight: 500 }}>Phone Number</label>
                    <input ref={editPhoneRef} type="text" value={editPhone} readOnly={!canEdit} onChange={(e) => { setEditPhone(e.target.value); setMessage("") }} onKeyDown={(e) => { if (e.key === "Enter") handleUpdate() }} style={inputStyle} />
                  </div>
                </div>

                {message && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 20, color: "#b91c1c", fontSize: FONT_SIZE.sm }}>{message}</div>}

                <button onClick={handleUpdate} disabled={submitting || !canEdit} style={{ width: "100%", padding: "12px 16px", background: submitting || !canEdit ? "#94a3b8" : "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: submitting || !canEdit ? "not-allowed" : "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, transition: "opacity 0.2s", opacity: submitting || !canEdit ? 0.7 : 1, minHeight: 44 }}>
                  {submitting ? "Saving..." : "Save Changes"}
                </button>
              </>
            )}

            {deletingId && (
              <>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                  <div style={{ width: 64, height: 64, background: "#fef2f2", color: "#ef4444", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                  </div>
                  <h3 style={{ margin: "0 0 12px", color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>Delete Driver</h3>
                  <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: FONT_SIZE.base, lineHeight: 1.5 }}>Are you sure you want to delete this driver? This action cannot be undone and will permanently remove their data.</p>

                  {message && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 20, color: "#b91c1c", fontSize: FONT_SIZE.sm, width: "100%", textAlign: "left" }}>{message}</div>}

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, width: "100%" }}>
                    <button onClick={closeModals} style={{ padding: "12px 16px", background: "white", color: "#475569", border: "1px solid #cbd5e1", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, minHeight: 44, transition: "all 0.2s" }} onMouseEnter={e => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#0070f3"; e.currentTarget.style.color = "#0070f3" }} onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#cbd5e1"; e.currentTarget.style.color = "#475569" }}>
                      Cancel
                    </button>
                    <button onClick={() => handleDelete(deletingId)} disabled={submitting || !canEdit} style={{ padding: "12px 16px", background: submitting || !canEdit ? "#94a3b8" : "#ef4444", color: "white", border: "none", borderRadius: 8, cursor: submitting || !canEdit ? "not-allowed" : "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, opacity: submitting || !canEdit ? 0.7 : 1, minHeight: 44, transition: "all 0.2s" }} onMouseEnter={e => { if (!submitting && canEdit) e.currentTarget.style.background = "#dc2626" }} onMouseLeave={e => { e.currentTarget.style.background = "#ef4444" }}>
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