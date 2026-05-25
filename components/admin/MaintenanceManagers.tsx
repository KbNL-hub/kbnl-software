"use client"

import { useState, useEffect, useRef } from "react"
import { supabase } from "@/lib/supabase"

type MaintenanceManager = {
  manager_id: string
  full_name: string
  phone_number: string | null
  status: string
  truck_count: number
}

type Truck = {
  plate_number: string
  truck_model: string
  status: string
  assigned_manager_id: string | null
  assigned_manager_name: string | null
}

export default function MaintenanceManagers() {
  const [managers, setManagers] = useState<MaintenanceManager[]>([])
  const [loading, setLoading] = useState(true)

  // Invite
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [fullName, setFullName] = useState("")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [email, setEmail] = useState("")
  const [inviteError, setInviteError] = useState("")
  const [inviteLoading, setInviteLoading] = useState(false)

  // Edit
  const [editingManager, setEditingManager] = useState<MaintenanceManager | null>(null)
  const [editName, setEditName] = useState("")
  const [editPhone, setEditPhone] = useState("")
  const [editError, setEditError] = useState("")
  const [editLoading, setEditLoading] = useState(false)

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Assign trucks
  const [assigningManager, setAssigningManager] = useState<MaintenanceManager | null>(null)
  const [allTrucks, setAllTrucks] = useState<Truck[]>([])
  const [assignedTrucks, setAssignedTrucks] = useState<Truck[]>([])
  const [trucksLoading, setTrucksLoading] = useState(false)
  const [assignError, setAssignError] = useState("")

  const [message, setMessage] = useState("")

  const phoneRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const editPhoneRef = useRef<HTMLInputElement>(null)

  useEffect(() => { fetchManagers() }, [])

  async function fetchManagers() {
    setLoading(true)
    const { data } = await supabase
      .from("maintenance_managers")
      .select("manager_id, full_name, phone_number, status")
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
      .from("maintenance_managers")
      .select("manager_id, full_name")

    const assignmentMap = new Map(assignments?.map(a => [a.plate_number, a.manager_id]) || [])
    const managerMap = new Map(allManagersRaw?.map(m => [m.manager_id, m.full_name]) || [])

    const trucks: Truck[] = (allTrucksRaw || []).map((t) => {
      const assignedMgrId = assignmentMap.get(t.plate_number) ?? null
      return {
        plate_number: t.plate_number,
        truck_model: t.truck_model,
        status: t.status,
        assigned_manager_id: assignedMgrId,
        assigned_manager_name: assignedMgrId ? managerMap.get(assignedMgrId) ?? null : null,
      }
    })

    const assigned = trucks.filter(t => t.assigned_manager_id === managerId)
    setAssignedTrucks(assigned)
    setAllTrucks(trucks)
    setTrucksLoading(false)
  }

  function closeModals() {
    setShowInviteModal(false)
    setEditingManager(null)
    setDeletingId(null)
    setAssigningManager(null)
    setFullName(""); setPhoneNumber(""); setEmail("")
    setEditName(""); setEditPhone("")
    setInviteError(""); setEditError(""); setAssignError(""); setMessage("")
    setAllTrucks([]); setAssignedTrucks([])
  }

  async function handleInvite() {
    if (!fullName.trim()) return setInviteError("Full name is required")
    if (!email.trim()) return setInviteError("Email is required")
    setInviteLoading(true)

    const res = await fetch("/api/invite-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, fullName, phoneNumber, role: "MaintenanceManager" }),
    })
    const result = await res.json()
    setInviteLoading(false)
    if (!res.ok) { setInviteError("Failed: " + result.error); return }
    closeModals()
    fetchManagers()
  }

  async function handleUpdate() {
    if (!editingManager) return
    if (!editName.trim()) return setEditError("Name is required")
    setEditLoading(true)
    const { error } = await supabase
      .from("maintenance_managers")
      .update({ full_name: editName, phone_number: editPhone || null })
      .eq("manager_id", editingManager.manager_id)
    setEditLoading(false)
    if (error) { setEditError("Failed to update"); return }
    closeModals()
    fetchManagers()
  }

  async function handleDelete() {
    if (!deletingId) return
    setDeleteLoading(true)
    await supabase.from("maintenance_managers").delete().eq("manager_id", deletingId)
    setDeleteLoading(false)
    closeModals()
    fetchManagers()
  }

  async function handleAssignTruck(plateNumber: string) {
    if (!assigningManager) return
    setAssignError("")

    if (assignedTrucks.length >= 10) {
      setAssignError("⚠️ This manager already has 10 trucks assigned. You can still assign more but it's not recommended.")
    }

    const truck = allTrucks.find(t => t.plate_number === plateNumber)
    if (truck?.assigned_manager_id && truck.assigned_manager_id !== assigningManager.manager_id) {
      setAssignError(`⚠️ ${plateNumber} is currently assigned to ${truck.assigned_manager_name}. Assigning it here will remove it from them.`)
      return
    }

    await supabase
      .from("maintenance_assignments")
      .upsert([{ manager_id: assigningManager.manager_id, plate_number: plateNumber }],
        { onConflict: "plate_number" })

    fetchTrucksForAssignment(assigningManager.manager_id)
    fetchManagers()
  }

  async function handleUnassignTruck(plateNumber: string) {
    if (!assigningManager) return
    await supabase
      .from("maintenance_assignments")
      .delete()
      .eq("plate_number", plateNumber)
      .eq("manager_id", assigningManager.manager_id)

    fetchTrucksForAssignment(assigningManager.manager_id)
    fetchManagers()
  }

  async function handleForceAssign(plateNumber: string) {
    if (!assigningManager) return
    setAssignError("")
    await supabase
      .from("maintenance_assignments")
      .upsert([{ manager_id: assigningManager.manager_id, plate_number: plateNumber }],
        { onConflict: "plate_number" })

    fetchTrucksForAssignment(assigningManager.manager_id)
    fetchManagers()
  }

  const statusColor = (status: string) => {
    switch (status) {
      case "Active": return { bg: "#00aa0022", color: "#00aa00" }
      case "Invited": return { bg: "#0070f322", color: "#0070f3" }
      case "Suspended": return { bg: "#ff444422", color: "#ff4444" }
      default: return { bg: "#eee", color: "#888" }
    }
  }

  const unassignedTrucks = allTrucks.filter(t => !t.assigned_manager_id)
  const assignedToOthers = allTrucks.filter(t => t.assigned_manager_id && t.assigned_manager_id !== assigningManager?.manager_id)
  const assignedToThis = assignedTrucks

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>Maintenance Managers</h2>
        <button
          onClick={() => { setShowInviteModal(true); setInviteError("") }}
          style={{ padding: "10px 20px", background: "#0070f3", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold" }}
        >
          + Add Maintenance Manager
        </button>
      </div>

      {loading && <p style={{ color: "#888" }}>Loading...</p>}
      {!loading && managers.length === 0 && <p style={{ color: "#888" }}>No maintenance managers added yet.</p>}

      {!loading && managers.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#f0f0f0", textAlign: "left" }}>
                <th style={th}>Name</th>
                <th style={th}>Phone</th>
                <th style={th}>Trucks Assigned</th>
                <th style={th}>Status</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {managers.map((m) => {
                const { bg, color } = statusColor(m.status)
                return (
                  <tr key={m.manager_id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={td}><strong>{m.full_name}</strong></td>
                    <td style={td}>{m.phone_number || "—"}</td>
                    <td style={td}>
                      <span style={{
                        fontWeight: "bold",
                        color: m.truck_count >= 10 ? "#f5a623" : "#333"
                      }}>
                        {m.truck_count} / 10
                        {m.truck_count >= 10 && " ⚠️"}
                      </span>
                    </td>
                    <td style={td}>
                      <span style={{ padding: "4px 10px", borderRadius: 12, fontSize: 12, background: bg, color, fontWeight: "bold" }}>
                        {m.status}
                      </span>
                    </td>
                    <td style={td}>
                      <button
                        onClick={() => {
                          setAssigningManager(m)
                          fetchTrucksForAssignment(m.manager_id)
                          setAssignError("")
                        }}
                        style={{ padding: "6px 12px", marginRight: 8, cursor: "pointer", borderRadius: 4, border: "1px solid #00aa00", color: "#00aa00", background: "white", fontSize: 12 }}
                      >
                        Assign Trucks
                      </button>
                      <button
                        onClick={() => { setEditingManager(m); setEditName(m.full_name); setEditPhone(m.phone_number || ""); setEditError("") }}
                        style={{ padding: "6px 12px", marginRight: 8, cursor: "pointer", borderRadius: 4, border: "1px solid #0070f3", color: "#0070f3", background: "white", fontSize: 12 }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeletingId(m.manager_id)}
                        style={{ padding: "6px 12px", cursor: "pointer", borderRadius: 4, border: "1px solid #ff4444", color: "#ff4444", background: "white", fontSize: 12 }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals Overlay */}
      {(showInviteModal || editingManager || deletingId || assigningManager) && (
        <div
          onClick={closeModals}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white", borderRadius: 12, padding: 32,
              width: assigningManager ? 600 : 420, maxWidth: "90vw",
              maxHeight: "85vh", overflowY: "auto",
              boxShadow: "0 8px 32px rgba(0,0,0,0.2)"
            }}
          >

            {/* Invite Modal */}
            {showInviteModal && (
              <>
                <h3 style={{ marginBottom: 20 }}>Add Maintenance Manager</h3>
                <div style={{ marginBottom: 16 }}>
                  <label style={label}>Full Name *</label>
                  <input type="text" placeholder="e.g. John Doe" value={fullName} onChange={(e) => { setFullName(e.target.value); setInviteError("") }} onKeyDown={(e) => { if (e.key === "Enter") phoneRef.current?.focus() }} style={inputStyle} autoFocus />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={label}>Phone Number</label>
                  <input ref={phoneRef} type="text" placeholder="e.g. 08012345678" value={phoneNumber} onChange={(e) => { setPhoneNumber(e.target.value) }} onKeyDown={(e) => { if (e.key === "Enter") emailRef.current?.focus() }} style={inputStyle} />
                </div>
                <div style={{ marginBottom: 24 }}>
                  <label style={label}>Email Address *</label>
                  <input ref={emailRef} type="email" placeholder="e.g. manager@example.com" value={email} onChange={(e) => { setEmail(e.target.value); setInviteError("") }} onKeyDown={(e) => { if (e.key === "Enter") handleInvite() }} style={inputStyle} />
                </div>
                {inviteError && <p style={errorStyle}>{inviteError}</p>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={closeModals} style={cancelBtn}>Cancel</button>
                  <button onClick={handleInvite} disabled={inviteLoading} style={primaryBtn}>{inviteLoading ? "Sending..." : "Send Invite"}</button>
                </div>
              </>
            )}

            {/* Edit Modal */}
            {editingManager && (
              <>
                <h3 style={{ marginBottom: 20 }}>Edit — {editingManager.full_name}</h3>
                <div style={{ marginBottom: 16 }}>
                  <label style={label}>Full Name *</label>
                  <input type="text" value={editName} onChange={(e) => { setEditName(e.target.value); setEditError("") }} onKeyDown={(e) => { if (e.key === "Enter") editPhoneRef.current?.focus() }} style={inputStyle} autoFocus />
                </div>
                <div style={{ marginBottom: 24 }}>
                  <label style={label}>Phone Number</label>
                  <input ref={editPhoneRef} type="text" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleUpdate() }} style={inputStyle} />
                </div>
                {editError && <p style={errorStyle}>{editError}</p>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={closeModals} style={cancelBtn}>Cancel</button>
                  <button onClick={handleUpdate} disabled={editLoading} style={primaryBtn}>{editLoading ? "Saving..." : "Save Changes"}</button>
                </div>
              </>
            )}

            {/* Delete Modal */}
            {deletingId && (
              <>
                <h3 style={{ marginBottom: 12, color: "#ff4444" }}>Delete Maintenance Manager?</h3>
                <p style={{ marginBottom: 24, color: "#555" }}>Are you sure? This will also remove all their truck assignments.</p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={closeModals} style={cancelBtn}>Cancel</button>
                  <button onClick={handleDelete} disabled={deleteLoading} style={{ ...primaryBtn, background: "#ff4444" }}>{deleteLoading ? "Deleting..." : "Yes, Delete"}</button>
                </div>
              </>
            )}

            {/* Assign Trucks Modal */}
            {assigningManager && (
              <>
                <h3 style={{ marginBottom: 4 }}>Assign Trucks — {assigningManager.full_name}</h3>
                <p style={{ color: "#888", fontSize: 13, marginBottom: 20 }}>
                  {assignedToThis.length} / 10 trucks assigned
                  {assignedToThis.length >= 10 && <span style={{ color: "#f5a623", marginLeft: 8 }}>⚠️ At recommended limit</span>}
                </p>

                {assignError && (
                  <div style={{ background: "#fff8e1", border: "1px solid #f5a623", borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
                    <p style={{ margin: 0, fontSize: 13, color: "#7a5c00" }}>{assignError}</p>
                    {/* Show force assign button if it's an ownership conflict */}
                    {assignError.includes("currently assigned to") && (
                      <button
                        onClick={() => {
                          const match = assignError.match(/(\S+-\S+) is currently/)
                          if (match) handleForceAssign(match[1])
                        }}
                        style={{ marginTop: 8, padding: "4px 12px", fontSize: 12, cursor: "pointer", background: "#f5a623", color: "white", border: "none", borderRadius: 4 }}
                      >
                        Reassign Anyway
                      </button>
                    )}
                  </div>
                )}

                {trucksLoading && <p style={{ color: "#888" }}>Loading trucks...</p>}

                {!trucksLoading && (
                  <>
                    {/* Currently assigned trucks */}
                    {assignedToThis.length > 0 && (
                      <div style={{ marginBottom: 20 }}>
                        <p style={{ fontWeight: "bold", marginBottom: 8, fontSize: 13 }}>Currently Assigned</p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {assignedToThis.map((t) => (
                            <div key={t.plate_number} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#f0fff4", border: "1px solid #00aa0033", borderRadius: 6 }}>
                              <div>
                                <span style={{ fontWeight: "bold", fontSize: 13 }}>{t.plate_number}</span>
                                <span style={{ fontSize: 12, color: "#888", marginLeft: 8 }}>{t.truck_model}</span>
                              </div>
                              <button
                                onClick={() => handleUnassignTruck(t.plate_number)}
                                style={{ padding: "4px 10px", fontSize: 12, cursor: "pointer", background: "white", border: "1px solid #ff4444", color: "#ff4444", borderRadius: 4 }}
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Unassigned trucks */}
                    {unassignedTrucks.length > 0 && (
                      <div style={{ marginBottom: 20 }}>
                        <p style={{ fontWeight: "bold", marginBottom: 8, fontSize: 13 }}>Available Trucks</p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {unassignedTrucks.map((t) => (
                            <div key={t.plate_number} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "white", border: "1px solid #eee", borderRadius: 6 }}>
                              <div>
                                <span style={{ fontWeight: "bold", fontSize: 13 }}>{t.plate_number}</span>
                                <span style={{ fontSize: 12, color: "#888", marginLeft: 8 }}>{t.truck_model}</span>
                                <span style={{ fontSize: 11, color: "#aaa", marginLeft: 8 }}>{t.status}</span>
                              </div>
                              <button
                                onClick={() => handleAssignTruck(t.plate_number)}
                                style={{ padding: "4px 10px", fontSize: 12, cursor: "pointer", background: "#0070f3", color: "white", border: "none", borderRadius: 4 }}
                              >
                                Assign
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Trucks assigned to other managers */}
                    {assignedToOthers.length > 0 && (
                      <div>
                        <p style={{ fontWeight: "bold", marginBottom: 8, fontSize: 13, color: "#888" }}>Assigned to Other Managers</p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {assignedToOthers.map((t) => (
                            <div key={t.plate_number} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#fafafa", border: "1px solid #eee", borderRadius: 6 }}>
                              <div>
                                <span style={{ fontWeight: "bold", fontSize: 13 }}>{t.plate_number}</span>
                                <span style={{ fontSize: 12, color: "#888", marginLeft: 8 }}>{t.truck_model}</span>
                                <span style={{ fontSize: 12, color: "#aaa", marginLeft: 8 }}>→ {t.assigned_manager_name}</span>
                              </div>
                              <button
                                onClick={() => handleAssignTruck(t.plate_number)}
                                style={{ padding: "4px 10px", fontSize: 12, cursor: "pointer", background: "white", border: "1px solid #f5a623", color: "#f5a623", borderRadius: 4 }}
                              >
                                Reassign
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {unassignedTrucks.length === 0 && assignedToOthers.length === 0 && assignedToThis.length === 0 && (
                      <p style={{ color: "#888" }}>No trucks in the system yet.</p>
                    )}
                  </>
                )}

                <div style={{ marginTop: 24 }}>
                  <button onClick={closeModals} style={{ ...primaryBtn }}>Done</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = { padding: "12px 16px", fontWeight: "bold", fontSize: 13 }
const td: React.CSSProperties = { padding: "12px 16px" }
const label: React.CSSProperties = { display: "block", fontWeight: "bold", marginBottom: 6, fontSize: 14 }
const inputStyle: React.CSSProperties = { width: "100%", padding: 10, boxSizing: "border-box", borderRadius: 6, border: "1px solid #ddd", fontSize: 14 }
const errorStyle: React.CSSProperties = { color: "red", fontSize: 13, marginBottom: 12 }
const primaryBtn: React.CSSProperties = { flex: 1, padding: "10px 0", background: "#0070f3", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold" }
const cancelBtn: React.CSSProperties = { flex: 1, padding: "10px 0", background: "white", border: "1px solid #ddd", borderRadius: 6, cursor: "pointer" }