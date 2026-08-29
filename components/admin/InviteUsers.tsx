"use client"

import React from "react"
import { useState, useEffect, useRef } from "react"
import { supabase } from "@/lib/supabase"
import ModernInput from "@/components/ModernInput"
import { usePermissions } from "@/lib/PermissionContext"
import { fetchStores } from "@/lib/stores"

type FuelCompany = {
  company_id: string
  company_name: string
}

const ALL_ROLES = [
  { key: "SuperAdmin", label: "Super Admin", group: "admin", needsField: null },
  { key: "Supervisor", label: "Supervisor", group: "admin", needsField: null },
  { key: "CashAuthorizer", label: "Cash Authorizer", group: "admin", needsField: "office" },
  { key: "Broker", label: "Broker", group: "admin", needsField: null },
  { key: "TruckAdmin", label: "Truck Admin", group: "admin", needsField: null },
  { key: "DeskOfficer", label: "Desk Officer", group: "admin", needsField: null },
  { key: "ATCOfficer", label: "ATC Officer", group: "admin", needsField: null },
  { key: "CreditManager", label: "Credit Manager", group: "admin", needsField: null },
  { key: "Driver", label: "Driver", group: "other", needsField: null },
  { key: "StationManager", label: "Station Manager", group: "other", needsField: "company" },
  { key: "TruckOfficer", label: "Truck Officer", group: "other", needsField: null },
  { key: "StoreOfficer", label: "Store Officer", group: "other", needsField: "store" },
  { key: "CashOfficer", label: "Cash Officer", group: "other", needsField: "office" },
  { key: "StoreSupervisor", label: "Store Supervisor", group: "other", needsField: "stores" },
]

const OFFICE_LOCATIONS = ["Uyo", "Ikom", "Calabar", "Ogoja"]

type InviteResult = {
  success: boolean
  tempPassword?: string
  error?: string
  userId?: string
}

export default function InviteUsers() {
  const { getAccess } = usePermissions()
  const canEdit = getAccess("invite-users").canEdit

  const [email, setEmail] = useState("")
  const [fullName, setFullName] = useState("")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set())
  const [companyId, setCompanyId] = useState("")
  const [storeName, setStoreName] = useState("")
  const [officeName, setOfficeName] = useState("")
  const [cashAuthOffice, setCashAuthOffice] = useState("")
  const [cashAuthOffices, setCashAuthOffices] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState("")
  const [isError, setIsError] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<InviteResult | null>(null)
  const [copied, setCopied] = useState(false)
  const [companies, setCompanies] = useState<FuelCompany[]>([])
  const [allProducts, setAllProducts] = useState<string[]>([])
  const [openingBalance, setOpeningBalance] = useState<{ product: string; quantity: string }[]>([
    { product: "", quantity: "" }
  ])
  const [storeNames, setStoreNames] = useState<Set<string>>(new Set())
  const [storeLocations, setStoreLocations] = useState<string[]>([])

  const phoneRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.from("fuel_companies").select("company_id, company_name").order("company_name").then(({ data }) => {
      if (data) setCompanies(data)
    })
    supabase.rpc("get_products").then(({ data }) => {
      if (data) setAllProducts(data.map((r: { value: string }) => r.value))
    })
    fetchStores().then(setStoreLocations)
  }, [])

  function toggleRole(role: string) {
    if (!canEdit) return
    setSelectedRoles((prev) => {
      const next = new Set(prev)
      if (next.has(role)) next.delete(role)
      else next.add(role)
      return next
    })
    setMessage("")
  }

  function needsField(field: string): boolean {
    return ALL_ROLES.some((r) => selectedRoles.has(r.key) && r.needsField === field)
  }

  function addOpeningBalanceLine() {
    setOpeningBalance([...openingBalance, { product: "", quantity: "" }])
  }

  function removeOpeningBalanceLine(index: number) {
    if (openingBalance.length === 1) return
    setOpeningBalance(openingBalance.filter((_, i) => i !== index))
  }

  function updateOpeningBalanceLine(index: number, field: "product" | "quantity", value: string) {
    setOpeningBalance(openingBalance.map((l, i) => (i === index ? { ...l, [field]: value } : l)))
  }

  async function handleSubmit() {
    if (!fullName.trim()) { setMessage("Full name is required"); setIsError(true); return }
    if (!email.trim()) { setMessage("Email is required"); setIsError(true); return }
    if (selectedRoles.size === 0) { setMessage("Select at least one role"); setIsError(true); return }
    if (needsField("company") && !companyId) { setMessage("Select a company for Station Manager"); setIsError(true); return }
    if (needsField("store") && !storeName) { setMessage("Select a store for Store Officer"); setIsError(true); return }
    if (needsField("stores") && storeNames.size === 0) { setMessage("Select at least one store for Store Supervisor"); setIsError(true); return }
    if (needsField("office") && selectedRoles.has("CashOfficer") && !officeName) { setMessage("Select an office for Cash Officer"); setIsError(true); return }
    if (needsField("office") && selectedRoles.has("CashAuthorizer") && cashAuthOffices.size === 0) { setMessage("Select at least one assigned office for Cash Authorizer"); setIsError(true); return }

    const validLines = openingBalance.filter(l => l.product && parseInt(l.quantity) > 0)
    const products = validLines.map(l => l.product)
    if (new Set(products).size !== products.length) {
      setMessage("Duplicate products in opening stock — merge them")
      setIsError(true)
      return
    }

    setSubmitting(true)
    setMessage("")
    setResult(null)

    try {
      const res = await fetch("/api/invite-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          fullName,
          phoneNumber: phoneNumber || undefined,
          roles: [...selectedRoles],
          companyId: companyId || undefined,
          storeName: storeName || undefined,
          storeNames: storeNames.size > 0 ? [...storeNames] : undefined,
          officeName: officeName || undefined,
          assignedOffices: cashAuthOffices.size > 0 ? [...cashAuthOffices] : undefined,
          openingBalance: validLines.length > 0 ? validLines : undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setMessage(data.error || "Failed to invite user")
        setIsError(true)
        return
      }

      setResult({ success: true, tempPassword: data.tempPassword, userId: data.userId })
      setCopied(false)
    } catch {
      setMessage("Network error, please try again")
      setIsError(true)
    } finally {
      setSubmitting(false)
    }
  }

  async function copyPassword() {
    if (!result?.tempPassword) return
    try {
      await navigator.clipboard.writeText(result.tempPassword)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
      const el = document.createElement("textarea")
      el.value = result.tempPassword
      document.body.appendChild(el)
      el.select()
      document.execCommand("copy")
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  function resetForm() {
    setEmail("")
    setFullName("")
    setPhoneNumber("")
    setSelectedRoles(new Set())
    setCompanyId("")
    setStoreName("")
    setOfficeName("")
    setCashAuthOffice("")
    setCashAuthOffices(new Set())
    setOpeningBalance([{ product: "", quantity: "" }])
    setStoreNames(new Set())
    setMessage("")
    setResult(null)
    setCopied(false)
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

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    boxSizing: "border-box",
    fontSize: 14,
    border: "1.5px solid #e5e5e5",
    borderRadius: 10,
    background: "#f9f9f9",
    transition: "all 0.2s ease",
  }

  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 13, fontWeight: 600,
    color: "#171717", marginBottom: 8, letterSpacing: "0.3px",
  }

  const adminRoles = ALL_ROLES.filter((r) => r.group === "admin")
  const otherRoles = ALL_ROLES.filter((r) => r.group === "other")

  return (
    <div style={{ maxWidth: 640, fontFamily: "'Inter', sans-serif" }}>
      <h1 style={{ margin: "0 0 4px 0", color: "#0f172a", fontSize: 24, fontWeight: 700 }}>
        Invite Users
      </h1>
      <p style={{ margin: "0 0 28px 0", color: "#64748b", fontSize: 14 }}>
        Create a new user account with one or more roles.
      </p>

      {result?.success ? (
        <div style={{
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 16,
          padding: 32,
          boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
          textAlign: "center",
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: "50%",
            background: "rgba(34, 197, 94, 0.1)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 16px",
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>

          <h2 style={{ margin: "0 0 4px", color: "#0f172a", fontSize: 20, fontWeight: 700 }}>
            User Created
          </h2>
          <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: 14 }}>
            {email}
          </p>

          <div style={{
            background: "#f0f7ff",
            border: "1.5px dashed #0070f3",
            borderRadius: 12,
            padding: "20px 24px",
            marginBottom: 20,
          }}>
            <p style={{ margin: "0 0 8px", color: "#0c4a6e", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Temporary Password
            </p>
            <p style={{
              margin: "0 0 12px",
              fontSize: 28,
              fontWeight: 700,
              color: "#0070f3",
              fontFamily: "'Fira Code', 'Cascadia Code', monospace",
              letterSpacing: "0.5px",
            }}>
              {result.tempPassword}
            </p>
            <button
              onClick={copyPassword}
              style={{
                padding: "8px 20px",
                background: copied ? "#16a34a" : "#0070f3",
                color: "white",
                border: "none",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              {copied ? "Copied!" : "Copy Password"}
            </button>
          </div>

          <div style={{
            background: "#fffbeb",
            border: "1px solid #fcd34d",
            borderRadius: 8,
            padding: "12px 16px",
            marginBottom: 24,
            textAlign: "left",
          }}>
            <p style={{ margin: 0, fontSize: 13, color: "#78350f", lineHeight: 1.5 }}>
              ⚠️ This is the only time this password will be shown. Share it securely with the user.
              They will be asked to change it on first login.
            </p>
          </div>

          <button
            onClick={resetForm}
            style={{
              padding: "10px 24px",
              background: "white",
              color: "#0f172a",
              border: "1px solid #cbd5e1",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Invite Another User
          </button>
        </div>
      ) : (
        <div style={{
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 16,
          padding: 28,
          boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
        }}>
          {/* Basic Info */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 }}>
            <div>
              <label style={labelStyle}>Full Name *</label>
              <ModernInput
                type="text" placeholder="e.g. John Doe"
                value={fullName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setFullName(e.target.value); setMessage("") }}
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") phoneRef.current?.focus() }}
                style={inputStyle}
                autoFocus
                readOnly={!canEdit}
              />
            </div>
            <div>
              <label style={labelStyle}>Phone Number</label>
              <ModernInput
                ref={phoneRef}
                type="text" placeholder="e.g. 08012345678"
                value={phoneNumber}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setPhoneNumber(e.target.value); setMessage("") }}
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") emailRef.current?.focus() }}
                style={inputStyle}
                readOnly={!canEdit}
              />
            </div>
            <div>
              <label style={labelStyle}>Email Address (username) *</label>
              <ModernInput
                ref={emailRef}
                type="email" placeholder="e.g. user@company.com"
                value={email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setEmail(e.target.value); setMessage("") }}
                style={inputStyle}
                readOnly={!canEdit}
              />
            </div>
          </div>

          {/* Admin Roles */}
          <div style={{ marginBottom: 20 }}>
            <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "#0f172a", letterSpacing: "0.3px", textTransform: "uppercase" }}>
              Admin Panel Roles
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {adminRoles.map((r) => (
                <div key={r.key} onClick={() => toggleRole(r.key)} style={roleBadgeStyle(selectedRoles.has(r.key))}>
                  <div style={checkboxStyle(selectedRoles.has(r.key))}>
                    {selectedRoles.has(r.key) && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  {r.label}
                </div>
              ))}
            </div>
          </div>

          {/* Other Roles */}
          <div style={{ marginBottom: 24 }}>
            <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "#0f172a", letterSpacing: "0.3px", textTransform: "uppercase" }}>
              Other Roles
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {otherRoles.map((r) => (
                <div key={r.key} onClick={() => toggleRole(r.key)} style={roleBadgeStyle(selectedRoles.has(r.key))}>
                  <div style={checkboxStyle(selectedRoles.has(r.key))}>
                    {selectedRoles.has(r.key) && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  {r.label}
                </div>
              ))}
            </div>
          </div>

          {/* Conditional Fields */}
          {needsField("company") && (
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Company (for Station Manager) *</label>
              <select
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                style={{
                  ...inputStyle,
                  appearance: "none",
                  background: "#f9f9f9 url(\"data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%23999' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\") no-repeat right 14px center",
                }}
              >
                <option value="">Select company...</option>
                {companies.map((c) => (
                  <option key={c.company_id} value={c.company_id}>{c.company_name}</option>
                ))}
              </select>
            </div>
          )}

          {needsField("store") && (
            <div>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Store (for Store Officer) *</label>
                <select
                  value={storeName}
                  onChange={(e) => {
                    setStoreName(e.target.value)
                    setOpeningBalance([{ product: "", quantity: "" }])
                  }}
                  style={{
                    ...inputStyle,
                    appearance: "none",
                    background: "#f9f9f9 url(\"data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%23999' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\") no-repeat right 14px center",
                  }}
                >
                  <option value="">Select store...</option>
                  {storeLocations.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {storeName && (
                <div style={{ marginBottom: 16 }}>
                  <p style={{ margin: "0 0 4px 0", fontWeight: 700, fontSize: 14, color: "#0f172a" }}>
                    Opening Stock Balance <span style={{ fontWeight: 400, fontSize: 12, color: "#94a3b8" }}>(optional)</span>
                  </p>
                  <p style={{ margin: "0 0 12px 0", fontSize: 12, color: "#94a3b8" }}>
                    Set the initial stock balance for <strong>{storeName}</strong>.
                  </p>

                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                    {openingBalance.map((line, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <select
                          value={line.product}
                          onChange={(e) => updateOpeningBalanceLine(i, "product", e.target.value)}
                          style={{
                            ...inputStyle,
                            flex: 1,
                            appearance: "none",
                            background: "#f9f9f9 url(\"data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%23999' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\") no-repeat right 14px center",
                          }}
                        >
                          <option value="">Select product</option>
                          {allProducts.map((p) => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min="1"
                          placeholder="Qty"
                          value={line.quantity}
                          onChange={(e) => updateOpeningBalanceLine(i, "quantity", e.target.value)}
                          onKeyDown={(e) => { if (e.key === "-" || e.key === "e") e.preventDefault() }}
                          style={{ ...inputStyle, width: 100, flexShrink: 0 }}
                        />
                        {openingBalance.length > 1 && (
                          <button onClick={() => removeOpeningBalanceLine(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 18, lineHeight: 1, padding: 0, width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>X</button>
                        )}
                      </div>
                    ))}
                  </div>

                  <button onClick={addOpeningBalanceLine} style={{ width: "100%", padding: "8px 12px", background: "white", border: "1px dashed #0070f3", color: "#0070f3", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600, minHeight: 38 }}>
                    + Add Product
                  </button>
                </div>
              )}
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
                      setMessage("")
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

          {selectedRoles.has("CashOfficer") && (
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Office (for Cash Officer) *</label>
              <select
                value={officeName}
                onChange={(e) => setOfficeName(e.target.value)}
                style={{
                  ...inputStyle,
                  appearance: "none",
                  background: "#f9f9f9 url(\"data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%23999' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\") no-repeat right 14px center",
                }}
              >
                <option value="">Select office...</option>
                {OFFICE_LOCATIONS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
          )}

          {selectedRoles.has("CashAuthorizer") && (
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Assigned Offices (for Cash Authorizer) *</label>
              <div style={{ display: "flex", gap: 12, alignItems: "stretch" }}>
                {/* Available offices */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Available</div>
                  <div style={{ border: "1.5px solid #e5e5e5", borderRadius: 8, background: "#f9f9f9", minHeight: 80, maxHeight: 160, overflowY: "auto" }}>
                    {OFFICE_LOCATIONS.filter(o => !cashAuthOffices.has(o)).length === 0 ? (
                      <div style={{ padding: "12px 14px", color: "#94a3b8", fontSize: 13, fontStyle: "italic" }}>All offices assigned</div>
                    ) : (
                      OFFICE_LOCATIONS.filter(o => !cashAuthOffices.has(o)).map(o => (
                        <button
                          key={o}
                          type="button"
                          onClick={() => setCashAuthOffices(prev => new Set([...prev, o]))}
                          style={{ padding: "8px 14px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid #e5e5e5", display: "flex", alignItems: "center", justifyContent: "space-between", transition: "background 0.15s", width: "100%", background: "transparent", border: "none", textAlign: "left", fontFamily: "inherit" }}
                          onMouseEnter={e => e.currentTarget.style.background = "#e2e8f0"}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        >
                          <span>{o}</span>
                          <span style={{ color: "#3b82f6", fontWeight: 600, fontSize: 16 }}>+</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
                {/* Selected offices */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#16a34a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Assigned</div>
                  <div style={{ border: "1.5px solid #bbf7d0", borderRadius: 8, background: "#f0fdf4", minHeight: 80, maxHeight: 160, overflowY: "auto" }}>
                    {cashAuthOffices.size === 0 ? (
                      <div style={{ padding: "12px 14px", color: "#94a3b8", fontSize: 13, fontStyle: "italic" }}>No offices selected</div>
                    ) : (
                      [...cashAuthOffices].map(o => (
                        <button
                          key={o}
                          type="button"
                          onClick={() => setCashAuthOffices(prev => { const next = new Set(prev); next.delete(o); return next })}
                          style={{ padding: "8px 14px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid #bbf7d0", display: "flex", alignItems: "center", justifyContent: "space-between", transition: "background 0.15s", width: "100%", background: "transparent", border: "none", textAlign: "left", fontFamily: "inherit" }}
                          onMouseEnter={e => e.currentTarget.style.background = "#dcfce7"}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        >
                          <span style={{ fontWeight: 500 }}>{o}</span>
                          <span style={{ color: "#ef4444", fontWeight: 600, fontSize: 16 }}>&times;</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {message && (
            <div style={{
              padding: 12, borderRadius: 10, marginBottom: 16,
              background: isError ? "rgba(239, 68, 68, 0.08)" : "rgba(34, 197, 94, 0.08)",
              border: `1.5px solid ${isError ? "rgba(239, 68, 68, 0.3)" : "rgba(34, 197, 94, 0.3)"}`,
              color: isError ? "#dc2626" : "#16a34a",
              fontSize: 14, fontWeight: 500,
            }}>
              {message}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting || !canEdit}
            style={{
              width: "100%",
              padding: 14,
              background: submitting || !canEdit ? "#94a3b8" : "#0070f3",
              color: "white",
              border: "none",
              borderRadius: 10,
              fontSize: 16,
              fontWeight: 600,
              cursor: submitting || !canEdit ? "not-allowed" : "pointer",
              opacity: submitting || !canEdit ? 0.7 : 1,
            }}
          >
            {submitting ? "Creating User..." : "Create User"}
          </button>
        </div>
      )}
    </div>
  )
}
