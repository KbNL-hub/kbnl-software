"use client"

import { useState, useEffect, useMemo } from "react"
import { supabase } from "@/lib/supabase"
import { usePermissions } from "@/lib/PermissionContext"
import { ROLES } from "@/lib/permissions"
import { fetchStores } from "@/lib/stores"
import { Icon } from "@iconify/react"

const OFFICE_LOCATIONS = ["Uyo", "Ikom", "Calabar", "Ogoja"]

type FuelCompany = { company_id: string; company_name: string }

type UserRow = {
  user_id: string
  email: string
  full_name: string
  phone_number: string
  role: string
  is_deactivated: boolean
  must_change_password: boolean
  created_at: string
  last_sign_in_at: string | null
  roles: string[]
}

const ALL_ROLE_KEYS = Object.keys(ROLES).sort((a, b) => {
  const order = ["SuperAdmin", "Admin", "Supervisor", "Broker", "TruckAdmin", "DeskOfficer", "ATCOfficer", "CashAuthorizer", "CreditManager", "Driver", "StationManager", "TruckOfficer", "StoreOfficer", "CashOfficer", "StoreSupervisor"]
  return order.indexOf(a) - order.indexOf(b)
})

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  boxSizing: "border-box",
  fontSize: 14,
  border: "1.5px solid #e5e5e5",
  borderRadius: 8,
  background: "#f9f9f9",
  outline: "none",
  transition: "all 0.2s ease",
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: "#171717",
  marginBottom: 8,
  letterSpacing: "0.3px",
}

export default function ManageUsers() {
  const { getAccess } = usePermissions()
  const canView = getAccess("manage-users").canView
  const canEdit = getAccess("manage-users").canEdit

  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState("")
  const [error, setError] = useState("")

  const [editingUser, setEditingUser] = useState<UserRow | null>(null)
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set())
  const [roleSaveLoading, setRoleSaveLoading] = useState(false)
  const [roleSaveError, setRoleSaveError] = useState("")

  const [companyId, setCompanyId] = useState("")
  const [storeName, setStoreName] = useState("")
  const [officeName, setOfficeName] = useState("")
  const [cashAuthOffice, setCashAuthOffice] = useState("")
  const [storeNames, setStoreNames] = useState<Set<string>>(new Set())
  const [companies, setCompanies] = useState<FuelCompany[]>([])
  const [storeLocations, setStoreLocations] = useState<string[]>([])

  const [confirmAction, setConfirmAction] = useState<{
    user: UserRow
    action: "deactivate" | "activate"
  } | null>(null)
  const [confirmLoading, setConfirmLoading] = useState(false)

  async function fetchUsers() {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/manage-users", {
        headers: {
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || "Failed to load users")
        return
      }
      const data = await res.json()
      setUsers(data.users || [])
    } catch {
      setError("Network error while loading users")
    } finally {
      setLoading(false)
    }
  }

   
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (canView) fetchUsers()
  }, [canView])

  useEffect(() => {
    supabase.from("fuel_companies").select("company_id, company_name").order("company_name").then(({ data }) => {
      if (data) setCompanies(data)
    })
    fetchStores().then(setStoreLocations)
  }, [])

  function needsField(field: string): boolean {
    if (field === "company") return selectedRoles.has("StationManager")
    if (field === "store") return selectedRoles.has("StoreOfficer")
    if (field === "stores") return selectedRoles.has("StoreSupervisor")
    if (field === "cashOffice") return selectedRoles.has("CashOfficer")
    if (field === "cashAuthOffice") return selectedRoles.has("CashAuthorizer")
    return false
  }

  const filteredUsers = useMemo(() => {
    let result = users
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        u =>
          (u.full_name || "").toLowerCase().includes(q) ||
          (u.email || "").toLowerCase().includes(q) ||
          (u.phone_number || "").toLowerCase().includes(q)
      )
    }
    if (roleFilter) {
      result = result.filter(u => u.roles.includes(roleFilter))
    }
    return result
  }, [users, search, roleFilter])

  function openRoleEditor(user: UserRow) {
    if (!canEdit) return
    setEditingUser(user)
    setSelectedRoles(new Set(user.roles))
    setRoleSaveError("")
    setCompanyId("")
    setStoreName("")
    setOfficeName("")
    setCashAuthOffice("")
    setStoreNames(new Set())

    const queries: Promise<void>[] = []
    if (user.roles.includes("StationManager")) {
      queries.push(
        Promise.resolve(supabase.from("station_managers").select("company_id").eq("manager_id", user.user_id).single()
          .then(({ data }) => { if (data?.company_id) setCompanyId(data.company_id) }))
      )
    }
    if (user.roles.includes("StoreOfficer")) {
      queries.push(
        Promise.resolve(supabase.from("store_officers").select("store_name").eq("officer_id", user.user_id).single()
          .then(({ data }) => { if (data?.store_name) setStoreName(data.store_name) }))
      )
    }
    if (user.roles.includes("CashOfficer")) {
      queries.push(
        Promise.resolve(supabase.from("cash_officers").select("office_name").eq("clerk_id", user.user_id).single()
          .then(({ data }) => { if (data?.office_name) setOfficeName(data.office_name) }))
      )
    }
    if (user.roles.includes("CashAuthorizer")) {
      queries.push(
        Promise.resolve(supabase.from("cash_authorizers").select("assigned_office").eq("authorizer_id", user.user_id).single()
          .then(({ data }) => { if (data?.assigned_office) setCashAuthOffice(data.assigned_office) }))
      )
    }
    if (user.roles.includes("StoreSupervisor")) {
      queries.push(
        Promise.resolve(supabase.from("store_supervisors").select("store_names").eq("supervisor_id", user.user_id).single()
          .then(({ data }) => { if (data?.store_names) setStoreNames(new Set(data.store_names)) }))
      )
    }
    Promise.all(queries)
  }

  function toggleRole(role: string) {
    setSelectedRoles(prev => {
      const next = new Set(prev)
      if (next.has(role)) next.delete(role)
      else next.add(role)
      return next
    })
    setRoleSaveError("")
  }

  async function saveRoles() {
    if (!editingUser) return
    if (selectedRoles.size === 0) {
      setRoleSaveError("User must have at least one role")
      return
    }
    if (needsField("company") && !companyId) {
      setRoleSaveError("Select a company for Station Manager")
      return
    }
    if (needsField("store") && !storeName) {
      setRoleSaveError("Select a store for Store Officer")
      return
    }
    if (needsField("stores") && storeNames.size === 0) {
      setRoleSaveError("Select at least one store for Store Supervisor")
      return
    }
    if (needsField("cashOffice") && !officeName) {
      setRoleSaveError("Select an office for Cash Officer")
      return
    }
    if (needsField("cashAuthOffice") && !cashAuthOffice) {
      setRoleSaveError("Select an assigned office for Cash Authorizer")
      return
    }
    setRoleSaveLoading(true)
    setRoleSaveError("")
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      const res = await fetch("/api/manage-users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "reassign-roles",
          userId: editingUser.user_id,
          roles: [...selectedRoles],
          companyId: companyId || undefined,
          storeName: storeName || undefined,
          storeNames: storeNames.size > 0 ? [...storeNames] : undefined,
          officeName: officeName || undefined,
          assignedOffice: cashAuthOffice || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setRoleSaveError(data.error || "Failed to save roles")
        return
      }
      const updatedRoles: string[] = data.roles || [...selectedRoles]
      setUsers(prev => prev.map(u =>
        u.user_id === editingUser.user_id ? { ...u, roles: updatedRoles } : u
      ))
      setEditingUser(null)
      setSelectedRoles(new Set())
      setCompanyId("")
      setStoreName("")
      setOfficeName("")
      setCashAuthOffice("")
      setStoreNames(new Set())
      await fetchUsers()
    } catch {
      setRoleSaveError("Network error")
    } finally {
      setRoleSaveLoading(false)
    }
  }

  async function confirmToggleActive() {
    if (!confirmAction) return
    setConfirmLoading(true)
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      const res = await fetch("/api/manage-users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: confirmAction.action,
          userId: confirmAction.user.user_id,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || `Failed to ${confirmAction.action} user`)
        setConfirmAction(null)
        return
      }
      setConfirmAction(null)
      await fetchUsers()
    } catch {
      setError("Network error")
    } finally {
      setConfirmLoading(false)
    }
  }

  const checkboxStyle = (checked: boolean): React.CSSProperties => ({
    width: 18,
    height: 18,
    borderRadius: 4,
    border: `2px solid ${checked ? "#0070f3" : "#d0d0d0"}`,
    background: checked ? "#0070f3" : "white",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    flexShrink: 0,
    transition: "all 0.15s ease",
  })

  const roleBadgeStyle = (checked: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderRadius: 8,
    border: `1.5px solid ${checked ? "#0070f3" : "#e5e5e5"}`,
    background: checked ? "rgba(0, 112, 243, 0.06)" : "white",
    cursor: "pointer",
    transition: "all 0.15s ease",
    fontSize: 14,
    color: checked ? "#0070f3" : "#333",
    fontWeight: checked ? 600 : 400,
  })

  const roleColors: Record<string, { bg: string; text: string }> = {
    SuperAdmin: { bg: "#fef3c7", text: "#92400e" },
    Admin: { bg: "#dbeafe", text: "#1e40af" },
    Supervisor: { bg: "#e0e7ff", text: "#3730a3" },
    CashAuthorizer: { bg: "#fce7f3", text: "#9d174d" },
    Broker: { bg: "#d1fae5", text: "#065f46" },
    TruckAdmin: { bg: "#e0f2fe", text: "#075985" },
    DeskOfficer: { bg: "#ede9fe", text: "#5b21b6" },
    ATCOfficer: { bg: "#f3e8ff", text: "#6b21a8" },
    Driver: { bg: "#fef2f2", text: "#991b1b" },
    StationManager: { bg: "#fefce8", text: "#854d0e" },
    TruckOfficer: { bg: "#f0fdf4", text: "#166534" },
    StoreOfficer: { bg: "#f0f9ff", text: "#0c4a6e" },
    CashOfficer: { bg: "#fff7ed", text: "#9a3412" },
    StoreSupervisor: { bg: "#ecfdf5", text: "#065f46" },
  }

  function RoleBadge({ role }: { role: string }) {
    const colors = roleColors[role] || { bg: "#f3f4f6", text: "#374151" }
    return (
      <span style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
        background: colors.bg,
        color: colors.text,
        border: "1px solid transparent",
      }}>
        {role === "SuperAdmin" && <Icon icon="mdi:crown" width={12} />}
        {ROLES[role]?.label || role}
      </span>
    )
  }

  if (!canView) return null

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", maxWidth: 1200 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: "0 0 4px 0", color: "#0f172a", fontSize: 24, fontWeight: 700 }}>Users</h1>
          <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>
            {loading ? "Loading..." : `${users.length} user${users.length !== 1 ? "s" : ""}`}
          </p>
        </div>
      </div>

      {error && (
        <div style={{
          padding: 12, borderRadius: 10, marginBottom: 16,
          background: "rgba(239, 68, 68, 0.08)",
          border: "1.5px solid rgba(239, 68, 68, 0.3)",
          color: "#dc2626", fontSize: 14, fontWeight: 500,
        }}>
          {error}
          <button onClick={fetchUsers} style={{
            marginLeft: 12, background: "none", border: "none",
            color: "#0070f3", cursor: "pointer", fontWeight: 600, fontSize: 13,
          }}>
            Retry
          </button>
        </div>
      )}

      <div style={{
        background: "white",
        border: "1px solid #e2e8f0",
        borderRadius: 16,
        boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
        overflow: "hidden",
      }}>
        <div style={{
          padding: "16px 20px",
          borderBottom: "1px solid #e2e8f0",
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}>
          <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
            <Icon icon="mdi:magnify" width={18} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
            <input
              type="text"
              placeholder="Search by name, email, or phone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                ...inputStyle,
                paddingLeft: 36,
                background: "#f1f5f9",
                border: "1.5px solid transparent",
              }}
              onFocus={e => { e.target.style.borderColor = "#0070f3"; e.target.style.background = "white" }}
              onBlur={e => { e.target.style.borderColor = "transparent"; e.target.style.background = "#f1f5f9" }}
            />
          </div>
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            style={{
              ...inputStyle,
              width: "auto",
              minWidth: 160,
              appearance: "none",
              background: "#f1f5f9 url(\"data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%23999' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\") no-repeat right 14px center",
              border: "1.5px solid transparent",
              cursor: "pointer",
            }}
            onFocus={e => { e.target.style.borderColor = "#0070f3"; e.target.style.background = "white" }}
            onBlur={e => { e.target.style.borderColor = "transparent"; e.target.style.background = "#f1f5f9" }}
          >
            <option value="">All Roles</option>
            {ALL_ROLE_KEYS.map(key => (
              <option key={key} value={key}>{ROLES[key]?.label || key}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div style={{ padding: "48px 20px", textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
            Loading users...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div style={{ padding: "48px 20px", textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
            {search || roleFilter ? "No users match your search criteria." : "No users found."}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
                  <th style={{ padding: "12px 20px", textAlign: "left", fontWeight: 600, color: "#475569", whiteSpace: "nowrap" }}>Name</th>
                  <th style={{ padding: "12px 20px", textAlign: "left", fontWeight: 600, color: "#475569", whiteSpace: "nowrap" }}>Email</th>
                  <th style={{ padding: "12px 20px", textAlign: "left", fontWeight: 600, color: "#475569", whiteSpace: "nowrap" }}>Phone</th>
                  <th style={{ padding: "12px 20px", textAlign: "left", fontWeight: 600, color: "#475569", whiteSpace: "nowrap" }}>Roles</th>
                  <th style={{ padding: "12px 20px", textAlign: "left", fontWeight: 600, color: "#475569", whiteSpace: "nowrap" }}>Status</th>
                  <th style={{ padding: "12px 20px", textAlign: "left", fontWeight: 600, color: "#475569", whiteSpace: "nowrap" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(user => (
                  <tr key={user.user_id} style={{
                    borderBottom: "1px solid #f1f5f9",
                    opacity: user.is_deactivated ? 0.6 : 1,
                    transition: "background 0.15s",
                  }}
                    onMouseEnter={e => { if (!user.is_deactivated) e.currentTarget.style.background = "#f8fafc" }}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <td style={{ padding: "14px 20px", fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap" }}>
                      {user.full_name || "—"}
                    </td>
                    <td style={{ padding: "14px 20px", color: "#475569" }}>{user.email}</td>
                    <td style={{ padding: "14px 20px", color: "#475569", whiteSpace: "nowrap" }}>
                      {user.phone_number || "—"}
                    </td>
                    <td style={{ padding: "14px 20px" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {user.roles.map(r => (
                          <RoleBadge key={r} role={r} />
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: "14px 20px", whiteSpace: "nowrap" }}>
                      {user.is_deactivated ? (
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          padding: "2px 8px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                          background: "#fef2f2", color: "#991b1b",
                        }}>
                          <Icon icon="mdi:account-cancel" width={12} />
                          Deactivated
                        </span>
                      ) : (
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          padding: "2px 8px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                          background: "#f0fdf4", color: "#166534",
                        }}>
                          <Icon icon="mdi:account-check" width={12} />
                          Active
                        </span>
                      )}
                      {user.must_change_password && (
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                          background: "#fef3c7", color: "#92400e",
                          marginLeft: 4,
                        }}>
                          Pending
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "14px 20px", whiteSpace: "nowrap" }}>
                      {canEdit && (
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <button
                            onClick={() => openRoleEditor(user)}
                            title="Assign Roles"
                            style={{
                              padding: "6px 10px",
                              background: "#f1f5f9",
                              border: "1px solid #e2e8f0",
                              borderRadius: 6,
                              cursor: "pointer",
                              color: "#475569",
                              fontSize: 13,
                              fontWeight: 600,
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              transition: "all 0.15s",
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = "#e2e8f0"; e.currentTarget.style.color = "#0f172a" }}
                            onMouseLeave={e => { e.currentTarget.style.background = "#f1f5f9"; e.currentTarget.style.color = "#475569" }}
                          >
                            <Icon icon="mdi:account-edit" width={14} />
                            Roles
                          </button>
                          {user.is_deactivated ? (
                            <button
                              onClick={() => setConfirmAction({ user, action: "activate" })}
                              title="Activate User"
                              style={{
                                padding: "6px 10px",
                                background: "#f0fdf4",
                                border: "1px solid #bbf7d0",
                                borderRadius: 6,
                                cursor: "pointer",
                                color: "#166534",
                                fontSize: 13,
                                fontWeight: 600,
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                                transition: "all 0.15s",
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = "#dcfce7" }}
                              onMouseLeave={e => { e.currentTarget.style.background = "#f0fdf4" }}
                            >
                              <Icon icon="mdi:account-reactivate" width={14} />
                              Activate
                            </button>
                          ) : (
                            <button
                              onClick={() => setConfirmAction({ user, action: "deactivate" })}
                              title="Deactivate User"
                              style={{
                                padding: "6px 10px",
                                background: "#fef2f2",
                                border: "1px solid #fecaca",
                                borderRadius: 6,
                                cursor: "pointer",
                                color: "#991b1b",
                                fontSize: 13,
                                fontWeight: 600,
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                                transition: "all 0.15s",
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = "#fecaca" }}
                              onMouseLeave={e => { e.currentTarget.style.background = "#fef2f2" }}
                            >
                              <Icon icon="mdi:account-remove" width={14} />
                              Deactivate
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Role Assignment Modal */}
      {editingUser && (
        <div
          onClick={() => { setEditingUser(null); setSelectedRoles(new Set()); setRoleSaveError(""); setCompanyId(""); setStoreName(""); setOfficeName(""); setCashAuthOffice(""); setStoreNames(new Set()) }}
          style={{
            position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 100, padding: 24,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "white", borderRadius: 16, padding: 32,
              width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#0f172a" }}>
                  Assign Roles
                </h3>
                <p style={{ margin: "4px 0 0 0", fontSize: 14, color: "#64748b" }}>
                  {editingUser.full_name || editingUser.email}
                </p>
              </div>
              <button
                onClick={() => { setEditingUser(null); setSelectedRoles(new Set()); setRoleSaveError(""); setCompanyId(""); setStoreName(""); setOfficeName(""); setCashAuthOffice(""); setStoreNames(new Set()) }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 4 }}
              >
                <Icon icon="mdi:close" width={20} />
              </button>
            </div>

            <div style={{ margin: "24px 0" }}>
              <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 600, color: "#0f172a", letterSpacing: "0.3px" }}>
                Select all roles this user should have
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {ALL_ROLE_KEYS.map(key => (
                  <div
                    key={key}
                    onClick={() => toggleRole(key)}
                    style={roleBadgeStyle(selectedRoles.has(key))}
                  >
                    <div style={checkboxStyle(selectedRoles.has(key))}>
                      {selectedRoles.has(key) && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                    {ROLES[key]?.label || key}
                  </div>
                ))}
              </div>
            </div>

            {needsField("company") && (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Company (for Station Manager) *</label>
                <select
                  value={companyId}
                  onChange={e => setCompanyId(e.target.value)}
                  style={{
                    ...inputStyle,
                    appearance: "none",
                    background: "#f9f9f9 url(\"data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%23999' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\") no-repeat right 14px center",
                  }}
                >
                  <option value="">Select company...</option>
                  {companies.map(c => (
                    <option key={c.company_id} value={c.company_id}>{c.company_name}</option>
                  ))}
                </select>
              </div>
            )}

            {needsField("store") && (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Store (for Store Officer) *</label>
                <select
                  value={storeName}
                  onChange={e => setStoreName(e.target.value)}
                  style={{
                    ...inputStyle,
                    appearance: "none",
                    background: "#f9f9f9 url(\"data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%23999' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\") no-repeat right 14px center",
                  }}
                >
                  <option value="">Select store...</option>
                  {storeLocations.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            )}

            {needsField("stores") && (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Stores (for Store Supervisor) *</label>
                <p style={{ margin: "0 0 8px 0", fontSize: 12, color: "#94a3b8" }}>Select one or more stores this supervisor will be responsible for.</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {storeLocations.map((s) => (
                    <div
                      key={s}
                      onClick={() => {
                        setStoreNames(prev => {
                          const next = new Set(prev)
                          if (next.has(s)) next.delete(s)
                          else next.add(s)
                          return next
                        })
                        setRoleSaveError("")
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: `1.5px solid ${storeNames.has(s) ? "#0070f3" : "#e5e5e5"}`,
                        background: storeNames.has(s) ? "rgba(0, 112, 243, 0.06)" : "white",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                        fontSize: 14,
                        color: storeNames.has(s) ? "#0070f3" : "#333",
                        fontWeight: storeNames.has(s) ? 600 : 400,
                      }}
                    >
                      <div style={checkboxStyle(storeNames.has(s))}>
                        {storeNames.has(s) && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                      {s}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {needsField("cashOffice") && (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Office (for Cash Officer) *</label>
                <select
                  value={officeName}
                  onChange={e => setOfficeName(e.target.value)}
                  style={{
                    ...inputStyle,
                    appearance: "none",
                    background: "#f9f9f9 url(\"data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%23999' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\") no-repeat right 14px center",
                  }}
                >
                  <option value="">Select office...</option>
                  {OFFICE_LOCATIONS.map(o => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
            )}

            {needsField("cashAuthOffice") && (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Assigned Office (for Cash Authorizer) *</label>
                <select
                  value={cashAuthOffice}
                  onChange={e => setCashAuthOffice(e.target.value)}
                  style={{
                    ...inputStyle,
                    appearance: "none",
                    background: "#f9f9f9 url(\"data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%23999' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\") no-repeat right 14px center",
                  }}
                >
                  <option value="">Select office...</option>
                  {OFFICE_LOCATIONS.map(o => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
            )}

            {roleSaveError && (
              <div style={{
                padding: 12, borderRadius: 10, marginBottom: 16,
                background: "rgba(239, 68, 68, 0.08)",
                border: "1.5px solid rgba(239, 68, 68, 0.3)",
                color: "#dc2626", fontSize: 14, fontWeight: 500,
              }}>
                {roleSaveError}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button
                onClick={() => { setEditingUser(null); setSelectedRoles(new Set()); setRoleSaveError(""); setCompanyId(""); setStoreName(""); setOfficeName(""); setCashAuthOffice(""); setStoreNames(new Set()) }}
                style={{
                  padding: "12px 16px", background: "white",
                  border: "1px solid #cbd5e1", color: "#475569",
                  borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 15, minHeight: 44,
                }}
              >
                Cancel
              </button>
              <button
                onClick={saveRoles}
                disabled={roleSaveLoading}
                style={{
                  padding: "12px 16px", background: "#0070f3", color: "white",
                  border: "none", borderRadius: 8,
                  cursor: roleSaveLoading ? "not-allowed" : "pointer",
                  fontWeight: 700, fontSize: 15, minHeight: 44,
                  opacity: roleSaveLoading ? 0.7 : 1,
                }}
              >
                {roleSaveLoading ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Deactivate/Activate Modal */}
      {confirmAction && (
        <div
          onClick={() => setConfirmAction(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 100, padding: 24,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "white", borderRadius: 16, padding: 32,
              width: "100%", maxWidth: 420,
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
              textAlign: "center",
            }}
          >
            <div style={{
              width: 56, height: 56, borderRadius: "50%",
              background: confirmAction.action === "deactivate" ? "rgba(239, 68, 68, 0.1)" : "rgba(34, 197, 94, 0.1)",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 16px",
            }}>
              <Icon
                icon={confirmAction.action === "deactivate" ? "mdi:account-remove" : "mdi:account-reactivate"}
                width={28}
                color={confirmAction.action === "deactivate" ? "#dc2626" : "#16a34a"}
              />
            </div>
            <h3 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: "#0f172a" }}>
              {confirmAction.action === "deactivate" ? "Deactivate User" : "Activate User"}
            </h3>
            <p style={{ margin: "0 0 24px", fontSize: 14, color: "#64748b", lineHeight: 1.5 }}>
              {confirmAction.action === "deactivate"
                ? `This will prevent ${confirmAction.user.full_name || confirmAction.user.email} from logging in. Their data will be preserved.`
                : `This will restore ${confirmAction.user.full_name || confirmAction.user.email}'s access to the system.`
              }
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button
                onClick={() => setConfirmAction(null)}
                style={{
                  padding: "12px 16px", background: "white",
                  border: "1px solid #cbd5e1", color: "#475569",
                  borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 15, minHeight: 44,
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmToggleActive}
                disabled={confirmLoading}
                style={{
                  padding: "12px 16px",
                  background: confirmAction.action === "deactivate" ? "#dc2626" : "#16a34a",
                  color: "white", border: "none", borderRadius: 8,
                  cursor: confirmLoading ? "not-allowed" : "pointer",
                  fontWeight: 700, fontSize: 15, minHeight: 44,
                  opacity: confirmLoading ? 0.7 : 1,
                }}
              >
                {confirmLoading ? "Confirming..." : `Yes, ${confirmAction.action === "deactivate" ? "Deactivate" : "Activate"}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
