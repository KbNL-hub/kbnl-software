"use client"

import React from "react"
import { FONT_SIZE } from "@/lib/constants"
import { usePolling } from "@/lib/hooks/usePolling"
import DieselConsumptionSection from "@/components/truck-admin/DieselConsumptionSection"

import { useState, useEffect, useMemo } from "react"
import ModernInput from "@/components/ModernInput"
import { supabase } from "@/lib/supabase"
import { apiMutate } from "@/lib/api-mutation"
import { formatAmount, parseAmount } from "@/lib/formatAmount"
import { usePermissions } from "@/lib/PermissionContext"
import { usePagination } from "@/lib/hooks/usePagination"
import PaginationControls from "@/components/PaginationControls"

type FuelDeposit = {
  deposit_id: string
  company_id: string
  amount: number
  note: string | null
  status: string
  deposited_at: string
  confirmed_at: string | null
}

type ATF = {
  request_id: string
  company_id: string
  atf_code: string | null
  plate_number: string
  kbnl_truck_no: string | null
  driver_name: string
  officer_name: string
  company_name: string
  litres: number
  rate_per_litre: number | null
  total_amount: number | null
  atf_status: string
  requested_at: string
  dispensed_at: string | null
  confirmed_at: string | null
  invalidated_at: string | null
  invalidation_reason: string | null
}

type FuelCompany = {
  company_id: string
  company_name: string
  current_balance: number
  low_balance_threshold: number
}

type FuelEstimate = {
  id: string
  location: string
  diesel_litres: number | null
  cng_bars: number | null
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

const atfStatusColor = (status: string) => {
  switch (status) {
    case "Pending": return { bg: "#fef3c7", color: "#b45309", border: "#fde68a" }
    case "Authorised": return { bg: "#f0f7ff", color: "#0070f3", border: "#bfdbfe" }
    case "Dispensed": return { bg: "#f3e8ff", color: "#7e22ce", border: "#e9d5ff" }
    case "Confirmed": return { bg: "#d1fae5", color: "#047857", border: "#a7f3d0" }
    case "Invalidated": return { bg: "#fef2f2", color: "#b91c1c", border: "#fecaca" }
    default: return { bg: "#f1f5f9", color: "#475569", border: "#e2e8f0" }
  }
}

const filters = ["All", "Pending", "Authorised", "Dispensed", "Confirmed", "Invalidated"]

export default function DieselManager() {
  const { getAccess } = usePermissions()
  const canEdit = getAccess("diesel-manager").canEdit
  const { isMobile } = useBreakpoint()
  const [atfs, setAtfs] = useState<ATF[]>([])
  const [deposits, setDeposits] = useState<FuelDeposit[]>([])
  const [companies, setCompanies] = useState<FuelCompany[]>([])
  const [fuelEstimates, setFuelEstimates] = useState<FuelEstimate[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("All")
  const [viewMode, setViewMode] = useState<ViewMode>("card")
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const [depositCompanyId, setDepositCompanyId] = useState("")
  const [depositAmount, setDepositAmount] = useState("")
  const [depositNote, setDepositNote] = useState("")
  const [depositError, setDepositError] = useState("")
  const [depositLoading, setDepositLoading] = useState(false)
  const [showDepositModal, setShowDepositModal] = useState(false)

  const [showAddStationModal, setShowAddStationModal] = useState(false)
  const [newStationName, setNewStationName] = useState("")
  const [stationError, setStationError] = useState("")
  const [stationLoading, setStationLoading] = useState(false)

  const [showEstimateModal, setShowEstimateModal] = useState(false)
  const [editingEstimate, setEditingEstimate] = useState<FuelEstimate | null>(null)
  const [estLocation, setEstLocation] = useState("")
  const [estDiesel, setEstDiesel] = useState("")
  const [estCng, setEstCng] = useState("")
  const [estError, setEstError] = useState("")
  const [estLoading, setEstLoading] = useState(false)

  const [deletingEstimateId, setDeletingEstimateId] = useState<string | null>(null)
  const [deleteEstLoading, setDeleteEstLoading] = useState(false)

  const [stationsCollapsed, setStationsCollapsed] = useState(true)
  const [estimatesCollapsed, setEstimatesCollapsed] = useState(true)
  const [activeSection, setActiveSection] = useState<"atf" | "consumption">("atf")

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "12px 14px", boxSizing: "border-box", borderRadius: 8,
    border: "1px solid #e2e8f0", fontSize: FONT_SIZE.base, background: "white", color: "#0f172a", minHeight: 48, transition: "border-color 0.2s ease"
  }

  useEffect(() => {
    fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  usePolling(fetchAll, 120000)

  async function fetchAll() {
    await Promise.all([fetchATFs(), fetchCompanies(), fetchDeposits(), fetchEstimates()])
    setLastUpdated(new Date())
    setLoading(false)
  }

  async function fetchATFs() {
    const { data: raw } = await supabase
      .from("fuel_requests")
      .select("request_id, atf_code, plate_number, driver_id, company_id, litres, rate_per_litre, total_amount, atf_status, requested_at, dispensed_at, confirmed_at, invalidated_at, invalidation_reason, initiated_by")
      .order("requested_at", { ascending: false })

    if (!raw) return

    const enriched = await Promise.all(raw.map(async r => {
      const { data: driver } = await supabase.from("Drivers").select("full_name").eq("driver_id", r.driver_id).single()
      const { data: officer } = await supabase.from("truck_officers").select("full_name").eq("manager_id", r.initiated_by).single()
      const { data: company } = await supabase.from("fuel_companies").select("company_name").eq("company_id", r.company_id).single()
      const { data: truck } = await supabase.from("Trucks").select("kbnl_truck_no").eq("plate_number", r.plate_number).single()
      return {
        ...r,
        company_id: r.company_id,
        driver_name: driver?.full_name ?? "Unknown",
        officer_name: officer?.full_name ?? "Unknown",
        company_name: company?.company_name ?? "Unknown",
        kbnl_truck_no: truck?.kbnl_truck_no ?? null,
      }
    }))

    setAtfs(enriched)
  }

  async function fetchDeposits() {
    const { data } = await supabase
      .from("fuel_deposits")
      .select("deposit_id, company_id, amount, note, status, deposited_at, confirmed_at")
      .order("deposited_at", { ascending: false })
    if (data) setDeposits(data)
  }

  async function fetchCompanies() {
    const { data } = await supabase
      .from("fuel_companies")
      .select("company_id, company_name, current_balance, low_balance_threshold")
      .order("company_name")
    setCompanies(data || [])
  }

  async function fetchEstimates() {
    const { data } = await supabase
      .from("fuel_estimates")
      .select("id, location, diesel_litres, cng_bars")
      .order("location")
    setFuelEstimates(data || [])
  }

  async function handleDeposit() {
    if (!canEdit) return
    const amount = parseAmount(depositAmount)
    if (!depositCompanyId) return setDepositError("Select a fuel company")
    if (!depositAmount || amount <= 0) return setDepositError("Enter a valid amount")

    setDepositLoading(true)

    try {
      const { error } = await apiMutate("fuel", {
        action: "rpc",
        function: "add_fuel_deposit",
        params: {
          p_company_id: depositCompanyId,
          p_amount: amount,
          p_note: depositNote.trim() || null,
        },
      })

      if (error) { setDepositError("Failed to log deposit"); return }

      setShowDepositModal(false)
      setDepositCompanyId(""); setDepositAmount(""); setDepositNote(""); setDepositError("")
      fetchCompanies()
    } catch {
      setDepositError("Network error, please try again")
    } finally {
      setDepositLoading(false)
    }
  }

  async function handleAddStation() {
    if (!canEdit) return
    const name = newStationName.trim()
    if (!name) return setStationError("Enter a station name")

    setStationLoading(true)
    try {
      const { error } = await apiMutate("fuel", {
        action: "insert",
        table: "fuel_companies",
        data: { company_name: name },
      })
      if (error) { setStationError("Failed to create station"); return }
      setShowAddStationModal(false)
      setNewStationName("")
      setStationError("")
      fetchCompanies()
    } catch {
      setStationError("Network error, please try again")
    } finally {
      setStationLoading(false)
    }
  }

  function openAddEstimate() {
    setEditingEstimate(null)
    setEstLocation("")
    setEstDiesel("")
    setEstCng("")
    setEstError("")
    setShowEstimateModal(true)
  }

  function openEditEstimate(est: FuelEstimate) {
    setEditingEstimate(est)
    setEstLocation(est.location)
    setEstDiesel(est.diesel_litres != null ? String(est.diesel_litres) : "")
    setEstCng(est.cng_bars != null ? String(est.cng_bars) : "")
    setEstError("")
    setShowEstimateModal(true)
  }

  async function handleSaveEstimate() {
    if (!canEdit) return
    const location = estLocation.trim()
    if (!location) return setEstError("Enter a location name")
    const diesel = estDiesel.trim() ? parseFloat(estDiesel) : null
    const cng = estCng.trim() ? parseFloat(estCng) : null
    if ((diesel === null || isNaN(diesel)) && (cng === null || isNaN(cng))) {
      return setEstError("Enter at least one estimate value (diesel or CNG)")
    }

    setEstLoading(true)
    try {
      if (editingEstimate) {
        const { error } = await apiMutate("admin", {
          action: "update",
          table: "fuel_estimates",
          data: { location, diesel_litres: diesel, cng_bars: cng },
          filters: { id: editingEstimate.id },
        })
        if (error) { setEstError("Failed to update estimate"); return }
      } else {
        const { error } = await apiMutate("admin", {
          action: "insert",
          table: "fuel_estimates",
          data: { location, diesel_litres: diesel, cng_bars: cng },
        })
        if (error) { setEstError("Failed to add estimate"); return }
      }
      setShowEstimateModal(false)
      setEditingEstimate(null)
      setEstLocation(""); setEstDiesel(""); setEstCng(""); setEstError("")
      fetchEstimates()
    } catch {
      setEstError("Network error, please try again")
    } finally {
      setEstLoading(false)
    }
  }

  async function handleDeleteEstimate() {
    if (!canEdit || !deletingEstimateId) return
    setDeleteEstLoading(true)
    try {
      const { error } = await apiMutate("admin", {
        action: "delete",
        table: "fuel_estimates",
        filters: { id: deletingEstimateId },
      })
      if (error) return
      setDeletingEstimateId(null)
      fetchEstimates()
    } finally {
      setDeleteEstLoading(false)
    }
  }

  const filteredATFs = filter === "All" ? atfs : atfs.filter(a => a.atf_status === filter)

  const { page, setPage, totalPages, paginatedItems, totalItems } = usePagination(filteredATFs)

  const balanceMap = useMemo(() => {
    const map: Record<string, number> = {}
    const perCompany = new Map<string, { id: string; amount: number; created_at: string }[]>()
    for (const a of atfs) {
      if (a.atf_status !== "Dispensed" && a.atf_status !== "Confirmed" || !a.total_amount) continue
      const r = perCompany.get(a.company_id) || []
      r.push({ id: a.request_id, amount: a.total_amount, created_at: a.dispensed_at ?? a.requested_at })
      perCompany.set(a.company_id, r)
    }
    for (const d of deposits) {
      if (d.status !== "Confirmed") continue
      const r = perCompany.get(d.company_id) || []
      r.push({ id: d.deposit_id, amount: -d.amount, created_at: d.confirmed_at ?? d.deposited_at })
      perCompany.set(d.company_id, r)
    }
    const balances = new Map(companies.map(c => [c.company_id, c.current_balance]))
    for (const [companyId, records] of perCompany) {
      records.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      let running = balances.get(companyId) ?? 0
      for (const rec of records) {
        map[rec.id] = running
        running += rec.amount
      }
    }
    return map
  }, [atfs, deposits, companies])

  const modalOverlayStyle: React.CSSProperties = {
    position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)",
    display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center",
    zIndex: 100, padding: isMobile ? 0 : 24
  }

  const modalBoxStyle: React.CSSProperties = {
    background: "white", borderRadius: isMobile ? "20px 20px 0 0" : 12,
    padding: isMobile ? "28px 20px" : 32, width: "100%", maxWidth: 420,
    maxHeight: "90vh", overflowY: "auto",
    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)"
  }

  const thStyle: React.CSSProperties = {
    padding: "10px 14px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b",
    textTransform: "uppercase" as const, letterSpacing: "0.5px", textAlign: "left"
  }

  const tdStyle: React.CSSProperties = {
    padding: "10px 14px", fontSize: FONT_SIZE.sm, color: "#0f172a"
  }

  const smallBtnStyle: React.CSSProperties = {
    padding: "4px 10px", borderRadius: 6, fontSize: FONT_SIZE.xs, fontWeight: 500,
    cursor: "pointer", border: "none", transition: "all 0.15s ease", minHeight: 28
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: isMobile ? "16px" : "32px", fontFamily: "'Inter', sans-serif" }}>
      <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>

      {/* Header */}
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "stretch" : "flex-start", gap: 16, marginBottom: 32 }}>
        <div>
          <h1 style={{ margin: 0, color: "#0f172a", fontSize: isMobile ? FONT_SIZE["2xl"] : FONT_SIZE["3xl"], fontWeight: 700, letterSpacing: "-0.5px" }}>
            Diesel Manager
          </h1>
          {lastUpdated && (
            <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: FONT_SIZE.sm }}>
              Updated {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {atfs.length > 0 && (
            <div style={{ display: "flex", background: "white", border: "1px solid #e2e8f0", borderRadius: 8, padding: 3, gap: 0 }}>
              <button onClick={() => setViewMode("card")} style={{ padding: "7px 10px", background: viewMode === "card" ? "#0070f3" : "transparent", color: viewMode === "card" ? "white" : "#64748b", border: "none", borderRadius: 5, cursor: "pointer", fontSize: FONT_SIZE.xs, fontWeight: 600, transition: "all 0.2s ease", minWidth: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center" }} title="Card view">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z" /></svg>
              </button>
              <button onClick={() => setViewMode("table")} style={{ padding: "7px 10px", background: viewMode === "table" ? "#0070f3" : "transparent", color: viewMode === "table" ? "white" : "#64748b", border: "none", borderRadius: 5, cursor: "pointer", fontSize: FONT_SIZE.xs, fontWeight: 600, transition: "all 0.2s ease", minWidth: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center" }} title="Table view">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 4h18v2H3V4zm0 7h18v2H3v-2zm0 7h18v2H3v-2z" /></svg>
              </button>
            </div>
          )}
          <button onClick={fetchAll} style={{ padding: "0 12px", background: "white", color: "#64748b", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer", fontSize: FONT_SIZE.sm, transition: "all 0.2s ease", display: "flex", alignItems: "center", justifyContent: "center", height: 40 }} title="Refresh">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36M20.49 15a9 9 0 0 1-14.85 3.36" /></svg>
          </button>
          {canEdit && (
            <>
              <button onClick={() => setShowDepositModal(true)} style={{ padding: "0 14px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.sm, height: 40, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                Top Up
              </button>
              <button onClick={() => { setShowAddStationModal(true); setStationError(""); setNewStationName("") }} style={{ padding: "0 14px", background: "white", color: "#0070f3", border: "1.5px solid #0070f3", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.sm, height: 40, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                Station
              </button>
              <button onClick={openAddEstimate} style={{ padding: "0 14px", background: "white", color: "#16a34a", border: "1.5px solid #16a34a", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.sm, height: 40, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                Estimate
              </button>
            </>
          )}
        </div>
      </div>

      {/* Station Balances */}
      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", marginBottom: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div
          onClick={() => setStationsCollapsed(!stationsCollapsed)}
          style={{ padding: "14px 16px", borderBottom: stationsCollapsed ? "none" : "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", userSelect: "none" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" style={{ transition: "transform 0.2s ease", transform: stationsCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}><polyline points="6 9 12 15 18 9" /></svg>
            <h2 style={{ margin: 0, fontSize: FONT_SIZE.base, fontWeight: 700, color: "#0f172a" }}>Fuel Stations</h2>
          </div>
          <span style={{ fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>{companies.length} station{companies.length !== 1 ? "s" : ""}</span>
        </div>

        {!stationsCollapsed && (<>

        {companies.length === 0 ? (
          <div style={{ padding: "32px 16px", textAlign: "center" }}>
            <p style={{ margin: 0, color: "#94a3b8", fontSize: FONT_SIZE.sm }}>No stations yet. Add one to get started.</p>
          </div>
        ) : isMobile ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {companies.map(c => {
              const low = c.current_balance < c.low_balance_threshold
              return (
                <div key={c.company_id} style={{ padding: "12px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: FONT_SIZE.sm, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.company_name}</p>
                    {low && <span style={{ fontSize: FONT_SIZE.xs, color: "#ef4444", fontWeight: 500 }}>Low balance</span>}
                  </div>
                  <span style={{ fontWeight: 700, fontSize: FONT_SIZE.sm, color: low ? "#ef4444" : "#0f172a", whiteSpace: "nowrap" }}>
                    ₦{c.current_balance.toLocaleString()}
                  </span>
                  {canEdit && (
                    <button
                      onClick={() => { setDepositCompanyId(c.company_id); setShowDepositModal(true); setDepositError("") }}
                      style={{ ...smallBtnStyle, background: "#f0f7ff", color: "#0070f3", flexShrink: 0 }}
                    >
                      Top Up
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                <th style={thStyle}>Station</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Balance</th>
                <th style={thStyle}>Threshold</th>
                <th style={thStyle}>Status</th>
                {canEdit && <th style={{ ...thStyle, textAlign: "right" }}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {companies.map(c => {
                const low = c.current_balance < c.low_balance_threshold
                return (
                  <tr key={c.company_id} style={{ borderBottom: "1px solid #f1f5f9" }} onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{c.company_name}</td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: low ? "#ef4444" : "#0f172a" }}>₦{c.current_balance.toLocaleString()}</td>
                    <td style={{ ...tdStyle, color: "#64748b" }}>₦{c.low_balance_threshold.toLocaleString()}</td>
                    <td style={tdStyle}>
                      {low ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 10, fontSize: FONT_SIZE.xs, fontWeight: 600, background: "#fef2f2", color: "#ef4444" }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01" /></svg>
                          Low
                        </span>
                      ) : (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 10, fontSize: FONT_SIZE.xs, fontWeight: 600, background: "#f0fdf4", color: "#16a34a" }}>
                          OK
                        </span>
                      )}
                    </td>
                    {canEdit && (
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <button
                          onClick={() => { setDepositCompanyId(c.company_id); setShowDepositModal(true); setDepositError("") }}
                          style={{ ...smallBtnStyle, background: "#f0f7ff", color: "#0070f3" }}
                        >
                          Top Up
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        </>)}
      </div>

      {/* Fuel Estimates */}
      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", marginBottom: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div
          onClick={() => setEstimatesCollapsed(!estimatesCollapsed)}
          style={{ padding: "14px 16px", borderBottom: estimatesCollapsed ? "none" : "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", userSelect: "none" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" style={{ transition: "transform 0.2s ease", transform: estimatesCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}><polyline points="6 9 12 15 18 9" /></svg>
            <h2 style={{ margin: 0, fontSize: FONT_SIZE.base, fontWeight: 700, color: "#0f172a" }}>Fuel Consumption Estimates</h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>{fuelEstimates.length} location{fuelEstimates.length !== 1 ? "s" : ""}</span>
            {canEdit && (
              <button onClick={(e) => { e.stopPropagation(); openAddEstimate() }} style={{ padding: "4px 10px", borderRadius: 6, fontSize: FONT_SIZE.xs, fontWeight: 600, cursor: "pointer", border: "1px solid #16a34a", background: "#f0fdf4", color: "#16a34a", transition: "all 0.15s ease" }}>
                + Add
              </button>
            )}
          </div>
        </div>

        {!estimatesCollapsed && (<>
        {fuelEstimates.length === 0 ? (
          <div style={{ padding: "32px 16px", textAlign: "center" }}>
            <p style={{ margin: "0 0 8px", color: "#94a3b8", fontSize: FONT_SIZE.sm }}>No estimates added yet.</p>
            <p style={{ margin: 0, color: "#94a3b8", fontSize: FONT_SIZE.xs }}>Add locations with diesel litres and CNG bars estimates for fuel consumption logging.</p>
          </div>
        ) : isMobile ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {fuelEstimates.map(est => (
              <div key={est.id} style={{ padding: "12px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: FONT_SIZE.sm, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{est.location}</p>
                  <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                    {est.diesel_litres != null && <span style={{ fontSize: FONT_SIZE.xs, color: "#64748b" }}>{est.diesel_litres}L diesel</span>}
                    {est.cng_bars != null && <span style={{ fontSize: FONT_SIZE.xs, color: "#64748b" }}>{est.cng_bars} bars CNG</span>}
                  </div>
                </div>
                {canEdit && (
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button onClick={() => openEditEstimate(est)} style={{ ...smallBtnStyle, background: "#f0f7ff", color: "#0070f3" }}>Edit</button>
                    <button onClick={() => setDeletingEstimateId(est.id)} style={{ ...smallBtnStyle, background: "#fef2f2", color: "#ef4444" }}>Del</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                <th style={thStyle}>Location</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Diesel (L)</th>
                <th style={{ ...thStyle, textAlign: "right" }}>CNG (Bars)</th>
                {canEdit && <th style={{ ...thStyle, textAlign: "right" }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {fuelEstimates.map(est => (
                <tr key={est.id} style={{ borderBottom: "1px solid #f1f5f9" }} onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{est.location}</td>
                  <td style={{ ...tdStyle, textAlign: "right", color: est.diesel_litres != null ? "#0f172a" : "#94a3b8" }}>
                    {est.diesel_litres != null ? `${est.diesel_litres}L` : "—"}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", color: est.cng_bars != null ? "#0f172a" : "#94a3b8" }}>
                    {est.cng_bars != null ? `${est.cng_bars}` : "—"}
                  </td>
                  {canEdit && (
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                        <button onClick={() => openEditEstimate(est)} style={{ ...smallBtnStyle, background: "#f0f7ff", color: "#0070f3" }}>Edit</button>
                        <button onClick={() => setDeletingEstimateId(est.id)} style={{ ...smallBtnStyle, background: "#fef2f2", color: "#ef4444" }}>Delete</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        </>)}
      </div>

      {/* Section Switcher */}
      <div style={{ display: "flex", background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 4, gap: 0, marginBottom: 24 }}>
        <button
          onClick={() => setActiveSection("atf")}
          style={{
            flex: 1, padding: "10px 16px",
            background: activeSection === "atf" ? "#0070f3" : "transparent",
            color: activeSection === "atf" ? "white" : "#64748b",
            border: "none", borderRadius: 8,
            cursor: "pointer", fontWeight: activeSection === "atf" ? 700 : 500,
            fontSize: FONT_SIZE.sm,
            transition: "all 0.2s ease",
            minHeight: 40,
          }}
        >
          ATF
        </button>
        <button
          onClick={() => setActiveSection("consumption")}
          style={{
            flex: 1, padding: "10px 16px",
            background: activeSection === "consumption" ? "#0070f3" : "transparent",
            color: activeSection === "consumption" ? "white" : "#64748b",
            border: "none", borderRadius: 8,
            cursor: "pointer", fontWeight: activeSection === "consumption" ? 700 : 500,
            fontSize: FONT_SIZE.sm,
            transition: "all 0.2s ease",
            minHeight: 40,
          }}
        >
          Consumption
        </button>
      </div>

      {activeSection === "atf" && (<>
      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap", overflowX: "auto", paddingBottom: 4 }}>
        {filters.map(f => {
          const isActive = filter === f
          const count = f === "All" ? atfs.length : atfs.filter(a => a.atf_status === f).length
          let colorProps = { bg: "white", color: "#64748b", border: "#e2e8f0" }

          if (isActive) {
            if (f === "All") colorProps = { bg: "#f1f5f9", color: "#0f172a", border: "#cbd5e1" }
            else colorProps = atfStatusColor(f)
          }

          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: "6px 14px",
                borderRadius: 24,
                fontSize: FONT_SIZE.xs,
                cursor: "pointer",
                border: `1px solid ${colorProps.border}`,
                background: colorProps.bg,
                color: colorProps.color,
                fontWeight: isActive ? 600 : 500,
                transition: "all 0.2s ease",
                whiteSpace: "nowrap"
              }}
            >
              {f} {count > 0 && <span style={{ marginLeft: 4, fontWeight: isActive ? 600 : 500 }}>({count})</span>}
            </button>
          )
        })}
      </div>

      {/* ATF List */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "64px 0" }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid #e2e8f0", borderTopColor: "#0070f3", animation: "spin 1s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : filteredATFs.length === 0 ? (
        <div style={{ textAlign: "center", padding: "64px 24px", background: "white", borderRadius: 12, border: "1px solid #e2e8f0" }}>
          <div style={{ width: 64, height: 64, background: "#f1f5f9", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
          </div>
          <h3 style={{ margin: "0 0 8px", color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 600 }}>No {filter.toLowerCase()} ATFs</h3>
          <p style={{ color: "#64748b", fontSize: FONT_SIZE.base }}>No fuel requests match this status.</p>
        </div>
      ) : (
        <>
          {viewMode === "card" && (
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
              {paginatedItems.map(atf => {
                const { bg, color, border } = atfStatusColor(atf.atf_status)
                return (
                  <div key={atf.request_id} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", transition: "all 0.2s ease" }} onMouseEnter={e => !isMobile && (e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)")} onMouseLeave={e => !isMobile && (e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)")}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                      <div>
                        {atf.atf_code
                          ? <p style={{ margin: 0, fontWeight: 700, fontSize: FONT_SIZE.lg, fontFamily: "monospace", letterSpacing: 1, color: "#0f172a" }}>{atf.atf_code}</p>
                          : <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#94a3b8", fontStyle: "italic" }}>Pending Code</p>
                        }
                        <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.sm, color: "#64748b" }}>{atf.plate_number}{atf.kbnl_truck_no ? ` · #${atf.kbnl_truck_no}` : ""}</p>
                        <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>{new Date(atf.requested_at).toLocaleString()}</p>
                      </div>
                      <span style={{ padding: "4px 10px", borderRadius: 6, fontSize: FONT_SIZE.xs, background: bg, color, border: `1px solid ${border}`, fontWeight: 600 }}>{atf.atf_status}</span>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #f1f5f9" }}>
                      <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#475569" }}><span style={{ color: "#94a3b8", width: 60, display: "inline-block" }}>Driver:</span> <span style={{ fontWeight: 500 }}>{atf.driver_name}</span></p>
                      <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#475569" }}><span style={{ color: "#94a3b8", width: 60, display: "inline-block" }}>Officer:</span> {atf.officer_name}</p>
                      <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#475569" }}><span style={{ color: "#94a3b8", width: 60, display: "inline-block" }}>Station:</span> {atf.company_name}</p>
                    </div>

                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ flex: 1, background: "#f8fafc", borderRadius: 8, padding: "10px 12px" }}>
                        <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#64748b" }}>Volume</p>
                        <p style={{ margin: "2px 0 0", fontWeight: 600, color: "#0f172a", fontSize: FONT_SIZE.md }}>{atf.litres}L</p>
                      </div>
                      {atf.rate_per_litre && (
                        <div style={{ flex: 1, background: "#f8fafc", borderRadius: 8, padding: "10px 12px" }}>
                          <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#64748b" }}>Rate/L</p>
                          <p style={{ margin: "2px 0 0", fontWeight: 600, color: "#0f172a", fontSize: FONT_SIZE.md }}>₦{atf.rate_per_litre.toLocaleString()}</p>
                        </div>
                      )}
                      {atf.total_amount && (
                        <div style={{ flex: 1, background: "#f0f7ff", borderRadius: 8, padding: "10px 12px", border: "1px solid #e0f2fe" }}>
                          <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#0284c7" }}>Total</p>
                          <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#0369a1", fontSize: FONT_SIZE.md }}>₦{atf.total_amount.toLocaleString()}</p>
                          {atf.atf_status === "Confirmed" && balanceMap[atf.request_id] !== undefined && (
                            <span style={{ marginTop: 4, fontSize: FONT_SIZE.xs, fontWeight: 600, color: "#16a34a", background: "#f0fdf4", padding: "2px 8px", borderRadius: 4, display: "inline-block" }}>
                              Balance after: ₦{balanceMap[atf.request_id].toLocaleString()}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {atf.invalidation_reason && (
                      <div style={{ marginTop: 16, padding: "10px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8 }}>
                        <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#b91c1c" }}><strong>Reason:</strong> {atf.invalidation_reason}</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {viewMode === "table" && (
            <div style={{ background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", minWidth: 800 }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    <th style={thStyle}>ATF Code</th>
                    <th style={thStyle}>Truck & Driver</th>
                    <th style={thStyle}>Station</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Volume</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
                    <th style={thStyle}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((atf, idx) => {
                    const { bg, color, border } = atfStatusColor(atf.atf_status)
                    return (
                      <tr key={atf.request_id} style={{ borderBottom: idx === filteredATFs.length - 1 ? "none" : "1px solid #e2e8f0", transition: "background 0.2s ease" }} onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <td style={{ ...tdStyle, fontFamily: "monospace", fontWeight: 600 }}>
                          {atf.atf_code || <span style={{ color: "#94a3b8", fontStyle: "italic", fontWeight: "normal" }}>Pending</span>}
                        </td>
                        <td style={tdStyle}>
                          <p style={{ margin: 0, fontWeight: 500 }}>{atf.plate_number}{atf.kbnl_truck_no ? ` (#${atf.kbnl_truck_no})` : ""}</p>
                          <p style={{ margin: "2px 0 0", color: "#64748b", fontSize: FONT_SIZE.xs }}>{atf.driver_name}</p>
                        </td>
                        <td style={{ ...tdStyle, color: "#475569" }}>{atf.company_name}</td>
                        <td style={{ ...tdStyle, textAlign: "right", fontWeight: 500 }}>{atf.litres}L</td>
                        <td style={{ ...tdStyle, textAlign: "right", fontWeight: 500 }}>{atf.total_amount ? `₦${atf.total_amount.toLocaleString()}` : "—"}</td>
                        <td style={tdStyle}>
                          <span style={{ padding: "4px 10px", borderRadius: 6, fontSize: FONT_SIZE.xs, fontWeight: 500, background: bg, color, border: `1px solid ${border}`, whiteSpace: "nowrap" }}>
                            {atf.atf_status}
                          </span>
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

      {filteredATFs.length > 0 && (
        <PaginationControls page={page} totalPages={totalPages} totalItems={totalItems} onPageChange={setPage} />
      )}
      </>)}

      {activeSection === "consumption" && (
        <DieselConsumptionSection />
      )}

      {/* Deposit Modal */}
      {showDepositModal && (
        <div onClick={() => { setShowDepositModal(false); setDepositCompanyId(""); setDepositAmount(""); setDepositNote(""); setDepositError("") }} style={modalOverlayStyle}>
          <div onClick={e => e.stopPropagation()} style={modalBoxStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h3 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>Top Up Fuel Balance</h3>
              <button onClick={() => { setShowDepositModal(false); setDepositCompanyId(""); setDepositAmount(""); setDepositNote(""); setDepositError("") }} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 4 }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 24 }}>
              <div>
                <label style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: FONT_SIZE.sm, fontWeight: 500 }}>Fuel Company *</label>
                <ModernInput
                  as="select"
                  value={depositCompanyId}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { setDepositCompanyId(e.target.value); setDepositError("") }}
                  style={inputStyle}
                >
                  <option value="">Select company</option>
                  {companies.map(c => <option key={c.company_id} value={c.company_id}>{c.company_name} — ₦{c.current_balance.toLocaleString()}</option>)}
                </ModernInput>
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: FONT_SIZE.sm, fontWeight: 500 }}>Amount (₦) *</label>
                <ModernInput
                  type="text"
                  inputMode="numeric"
                  placeholder="e.g. 500,000"
                  value={depositAmount}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setDepositAmount(formatAmount(e.target.value)); setDepositError("") }}
                  style={inputStyle}
                  readOnly={!canEdit}
                />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: FONT_SIZE.sm, fontWeight: 500 }}>Note (optional)</label>
                <ModernInput
                  type="text"
                  placeholder="e.g. Monthly top-up"
                  value={depositNote}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDepositNote(e.target.value)}
                  style={inputStyle}
                  readOnly={!canEdit}
                />
              </div>
            </div>

            {depositError && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 24, color: "#b91c1c", fontSize: FONT_SIZE.sm }}>{depositError}</div>}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setShowDepositModal(false); setDepositCompanyId(""); setDepositAmount(""); setDepositNote(""); setDepositError("") }} style={{ flex: 1, padding: "12px 16px", background: "white", color: "#0f172a", border: "1px solid #cbd5e1", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, minHeight: 44 }}>
                Cancel
              </button>
              <button onClick={handleDeposit} disabled={depositLoading || !canEdit} style={{ flex: 1, padding: "12px 16px", background: depositLoading || !canEdit ? "#94a3b8" : "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: depositLoading || !canEdit ? "not-allowed" : "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, minHeight: 44, opacity: depositLoading || !canEdit ? 0.7 : 1 }}>
                {depositLoading ? "Adding..." : "Top Up"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Station Modal */}
      {showAddStationModal && (
        <div onClick={() => { setShowAddStationModal(false); setNewStationName(""); setStationError("") }} style={modalOverlayStyle}>
          <div onClick={e => e.stopPropagation()} style={modalBoxStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h3 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>Add New Station</h3>
              <button onClick={() => { setShowAddStationModal(false); setNewStationName(""); setStationError("") }} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 4 }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: FONT_SIZE.sm, fontWeight: 500 }}>Station Name *</label>
              <ModernInput
                type="text"
                placeholder="e.g. Total Energies, NNPC"
                value={newStationName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setNewStationName(e.target.value); setStationError("") }}
                style={inputStyle}
                readOnly={!canEdit}
              />
            </div>

            {stationError && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 24, color: "#b91c1c", fontSize: FONT_SIZE.sm }}>{stationError}</div>}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setShowAddStationModal(false); setNewStationName(""); setStationError("") }} style={{ flex: 1, padding: "12px 16px", background: "white", color: "#0f172a", border: "1px solid #cbd5e1", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, minHeight: 44 }}>
                Cancel
              </button>
              <button onClick={handleAddStation} disabled={stationLoading || !canEdit} style={{ flex: 1, padding: "12px 16px", background: stationLoading || !canEdit ? "#94a3b8" : "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: stationLoading || !canEdit ? "not-allowed" : "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, minHeight: 44, opacity: stationLoading || !canEdit ? 0.7 : 1 }}>
                {stationLoading ? "Creating..." : "Create Station"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Estimate Modal */}
      {showEstimateModal && (
        <div onClick={() => { setShowEstimateModal(false); setEditingEstimate(null); setEstLocation(""); setEstDiesel(""); setEstCng(""); setEstError("") }} style={modalOverlayStyle}>
          <div onClick={e => e.stopPropagation()} style={modalBoxStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h3 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>{editingEstimate ? "Edit Estimate" : "Add Estimate"}</h3>
              <button onClick={() => { setShowEstimateModal(false); setEditingEstimate(null); setEstLocation(""); setEstDiesel(""); setEstCng(""); setEstError("") }} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 4 }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 24 }}>
              <div>
                <label style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: FONT_SIZE.sm, fontWeight: 500 }}>Location *</label>
                <ModernInput
                  type="text"
                  placeholder="e.g. Lagos, Port Harcourt"
                  value={estLocation}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setEstLocation(e.target.value); setEstError("") }}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: FONT_SIZE.sm, fontWeight: 500 }}>Diesel (Litres)</label>
                <ModernInput
                  type="number"
                  step="0.1"
                  placeholder="e.g. 120"
                  value={estDiesel}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setEstDiesel(e.target.value); setEstError("") }}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: FONT_SIZE.sm, fontWeight: 500 }}>CNG (Bars)</label>
                <ModernInput
                  type="number"
                  step="0.1"
                  placeholder="e.g. 15"
                  value={estCng}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setEstCng(e.target.value); setEstError("") }}
                  style={inputStyle}
                />
              </div>
            </div>

            <p style={{ margin: "-10px 0 20px", fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Enter at least one value (diesel or CNG).</p>

            {estError && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 24, color: "#b91c1c", fontSize: FONT_SIZE.sm }}>{estError}</div>}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setShowEstimateModal(false); setEditingEstimate(null); setEstLocation(""); setEstDiesel(""); setEstCng(""); setEstError("") }} style={{ flex: 1, padding: "12px 16px", background: "white", color: "#0f172a", border: "1px solid #cbd5e1", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, minHeight: 44 }}>
                Cancel
              </button>
              <button onClick={handleSaveEstimate} disabled={estLoading || !canEdit} style={{ flex: 1, padding: "12px 16px", background: estLoading || !canEdit ? "#94a3b8" : "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: estLoading || !canEdit ? "not-allowed" : "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, minHeight: 44, opacity: estLoading || !canEdit ? 0.7 : 1 }}>
                {estLoading ? "Saving..." : editingEstimate ? "Save Changes" : "Add Estimate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Estimate Confirmation */}
      {deletingEstimateId && (
        <div onClick={() => setDeletingEstimateId(null)} style={modalOverlayStyle}>
          <div onClick={e => e.stopPropagation()} style={{ ...modalBoxStyle, maxWidth: 380, textAlign: "center" }}>
            <div style={{ width: 56, height: 56, background: "#fef2f2", color: "#ef4444", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
            </div>
            <h3 style={{ margin: "0 0 8px", color: "#0f172a", fontSize: FONT_SIZE.lg, fontWeight: 700 }}>Delete Estimate</h3>
            <p style={{ margin: "0 0 24px", color: "#64748b", fontSize: FONT_SIZE.sm, lineHeight: 1.5 }}>
              Are you sure you want to delete the estimate for <strong>{fuelEstimates.find(e => e.id === deletingEstimateId)?.location}</strong>? This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setDeletingEstimateId(null)} style={{ flex: 1, padding: "12px 16px", background: "white", color: "#0f172a", border: "1px solid #cbd5e1", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, minHeight: 44 }}>
                Cancel
              </button>
              <button onClick={handleDeleteEstimate} disabled={deleteEstLoading} style={{ flex: 1, padding: "12px 16px", background: deleteEstLoading ? "#94a3b8" : "#ef4444", color: "white", border: "none", borderRadius: 8, cursor: deleteEstLoading ? "not-allowed" : "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, minHeight: 44, opacity: deleteEstLoading ? 0.7 : 1 }}>
                {deleteEstLoading ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
