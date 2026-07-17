"use client"

import { useEffect, useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { apiMutate } from "@/lib/api-mutation"
import RoleSwitcher from "@/components/RoleSwitcher"
import { formatAmount, parseAmount } from "@/lib/formatAmount"
import { Icon } from "@iconify/react"
import { useBreakpoint } from "@/app/hooks/useBreakpoint"
import ReportModal from "@/components/ReportModal"
import ProfilePictureUpload from "@/components/ProfilePictureUpload"
import { FONT_SIZE, POLLING_INTERVAL } from "@/lib/constants"
import { toISOString, formatDateTime, formatTime } from "@/lib/date-utils"
import { requireDashboardRole } from "@/lib/auth-helpers"
import { Role } from "@/lib/roles"
import { useATFs } from "@/lib/hooks/useATFs"

type ATF = {
  request_id: string
  atf_code: string
  plate_number: string
  kbnl_truck_no: string | null
  driver_name: string
  driver_id: string
  litres: number
  atf_status: string
  requested_at: string
  rate_per_litre: number | null
  total_amount: number | null
}

type FuelDeposit = {
  deposit_id: string
  amount: number
  note: string | null
  deposited_at: string
  status: string
  confirmed_at: string | null
}

type StationManager = {
  manager_id: string
  company_id: string
  profile_picture_url?: string
}

const filterColor = (filter: string, activeFilter: string) => {
  if (filter === "All") return { bg: activeFilter === "All" ? "#171717" : "white", color: activeFilter === "All" ? "white" : "#64748b", border: activeFilter === "All" ? "" : "#e2e8f0" }
  if (filter === "Authorised") return { bg: activeFilter === "Authorised" ? "rgba(0, 112, 243, 0.1)" : "white", color: activeFilter === "Authorised" ? "#0070f3" : "#64748b", border: activeFilter === "Authorised" ? "#0070f3" : "#e2e8f0" }
  if (filter === "Dispensed") return { bg: activeFilter === "Dispensed" ? "rgba(124, 58, 237, 0.1)" : "white", color: activeFilter === "Dispensed" ? "#7c3aed" : "#64748b", border: activeFilter === "Dispensed" ? "#7c3aed" : "#e2e8f0" }
  if (filter === "Confirmed") return { bg: activeFilter === "Confirmed" ? "rgba(22, 163, 74, 0.1)" : "white", color: activeFilter === "Confirmed" ? "#16a34a" : "#64748b", border: activeFilter === "Confirmed" ? "#16a34a" : "#e2e8f0" }
  if (filter === "Invalidated") return { bg: activeFilter === "Invalidated" ? "rgba(239, 68, 68, 0.1)" : "white", color: activeFilter === "Invalidated" ? "#ef4444" : "#64748b", border: activeFilter === "Invalidated" ? "#ef4444" : "#e2e8f0" }
  return { bg: "white", color: "#64748b", border: "#e2e8f0" }
}

const atfStatusColor = (status: string) => {
  switch (status) {
    case "Authorised": return { bg: "#f0f7ff", color: "#0070f3", border: "#bfdbfe" }
    case "Dispensed": return { bg: "#f0f7ff", color: "#7c3aed", border: "#c7d2fe" }
    case "Confirmed": return { bg: "#f0fff4", color: "#16a34a", border: "#86efac" }
    case "Invalidated": return { bg: "#fef2f2", color: "#ef4444", border: "#fecaca" }
    default: return { bg: "#f8fafc", color: "#64748b", border: "#e2e8f0" }
  }
}

export default function StationManagerDashboard() {
  const router = useRouter()
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"

  const [manager, setManager] = useState<StationManager | null>(null)
  const [companyName, setCompanyName] = useState("")
  const [currentBalance, setCurrentBalance] = useState<number | null>(null)
  const [lowThreshold, setLowThreshold] = useState<number>(0)
  const [atfs, setAtfs] = useState<ATF[]>([])
  const [atfFilter, setAtfFilter] = useState<{ company_id: string } | null>(null)
  const { data: atfsFromHook, refetch: refetchATFs } = useATFs(atfFilter ?? undefined)
  useEffect(() => { setAtfs(atfsFromHook as ATF[]); setLastUpdated(new Date()) }, [atfsFromHook])
  const [deposits, setDeposits] = useState<FuelDeposit[]>([])
  const [filter, setFilter] = useState("All")
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const [showPictureModal, setShowPictureModal] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)

  const [dispensingATF, setDispensingATF] = useState<ATF | null>(null)
  const [ratePerLitre, setRatePerLitre] = useState("")
  const [dispenseError, setDispenseError] = useState("")
  const [dispenseLoading, setDispenseLoading] = useState(false)

  const [confirmingDeposit, setConfirmingDeposit] = useState<string | null>(null)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [depositError, setDepositError] = useState("")

  const [invalidatingATF, setInvalidatingATF] = useState<ATF | null>(null)
  const [invalidateReason, setInvalidateReason] = useState("")
  const [invalidateError, setInvalidateError] = useState("")
  const [invalidateLoading, setInvalidateLoading] = useState(false)

  const filters = ["All", "Authorised", "Dispensed", "Confirmed", "Invalidated"]

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push("/login"); return }
      const user = session.user

      const hasRole = await requireDashboardRole(user.id, Role.StationManager)
      if (!hasRole) { router.push("/login"); return }

      await supabase.from("Profiles").select("full_name").eq("user_id", user.id).single()

      const { data: mgr } = await supabase
        .from("station_managers")
        .select("manager_id, company_id, profile_picture_url")
        .eq("manager_id", user.id)
        .single()

      if (!mgr?.company_id) {
        router.push("/login")
        return
      }

      setManager(mgr)
      const companyId = mgr.company_id
      setAtfFilter({ company_id: companyId })
      await fetchCompanyData(companyId)
      await Promise.all([
        fetchDeposits(companyId),
      ])
      setLoading(false)
    }
    init()
  }, [])

  useEffect(() => {
    if (!manager) return
    const interval = setInterval(() => {
      fetchCompanyData(manager.company_id)
      refetchATFs()
      fetchDeposits(manager.company_id)
    }, POLLING_INTERVAL)
    return () => clearInterval(interval)
  }, [manager])

  async function fetchCompanyData(cId: string) {
    const { data } = await supabase.from("fuel_companies").select("company_name, current_balance, low_balance_threshold").eq("company_id", cId).single()
    if (data) { setCompanyName(data.company_name); setCurrentBalance(data.current_balance); setLowThreshold(data.low_balance_threshold) }
  }

  async function fetchDeposits(cId: string) {
    const { data } = await supabase
      .from("fuel_deposits")
      .select("deposit_id, amount, note, deposited_at, status, confirmed_at")
      .eq("company_id", cId)
      .order("deposited_at", { ascending: false })

    setDeposits(data || [])
    setLastUpdated(new Date())
  }

  async function confirmDeposit(deposit: FuelDeposit) {
    setConfirmLoading(true)
    setDepositError("")

    const { error } = await apiMutate("fuel", {
      action: "rpc",
      function: "confirm_fuel_deposit",
      params: { p_deposit_id: deposit.deposit_id },
    })

    setConfirmLoading(false)
    if (error) { setDepositError(error); return }
    setCurrentBalance((prev) => (prev ?? 0) + deposit.amount)
    setConfirmingDeposit(null)
    fetchDeposits(manager?.company_id ?? "")
  }

  async function declineDeposit(deposit: FuelDeposit) {
    setConfirmLoading(true)
    setDepositError("")

    const { error } = await apiMutate("fuel", {
      action: "rpc",
      function: "decline_fuel_deposit",
      params: { p_deposit_id: deposit.deposit_id },
    })

    setConfirmLoading(false)
    if (error) { setDepositError(error); return }
    setConfirmingDeposit(null)
    fetchDeposits(manager?.company_id ?? "")
  }

  async function handleDispense() {
    if (!dispensingATF) return
    const rate = parseAmount(ratePerLitre)
    if (!ratePerLitre || rate <= 0) return setDispenseError("Enter a valid rate per litre")

    const total = dispensingATF.litres * rate

    setDispenseLoading(true)

    const { data, error } = await apiMutate("fuel", {
      action: "rpc",
      function: "dispense_fuel",
      params: {
        p_request_id: dispensingATF.request_id,
        p_rate: rate,
        p_total: total,
        p_plate_number: dispensingATF.plate_number,
      },
    })
    if (error) {
      setDispenseError(error)
      setDispenseLoading(false)
      return
    }

    setCurrentBalance((prev) => (prev ?? 0) - total)
    setDispenseLoading(false)
    setDispensingATF(null)
    setRatePerLitre("")
    setDispenseError("")
    refetchATFs()
  }

  async function handleInvalidate() {
    if (!invalidatingATF) return
    if (!invalidateReason.trim()) return setInvalidateError("Provide a reason for invalidation")

    setInvalidateLoading(true)
    const { error } = await apiMutate("fuel", {
      action: "rpc",
      function: "invalidate_atf",
      params: {
        p_request_id: invalidatingATF.request_id,
        p_reason: invalidateReason.trim(),
        p_status_filter: "Authorised",
      },
    })

    if (error) {
      setInvalidateError(error)
      setInvalidateLoading(false)
      return
    }

    setInvalidateLoading(false)
    setInvalidatingATF(null)
    setInvalidateReason("")
    setInvalidateError("")
    refetchATFs()
  }

  const balanceMap = useMemo(() => {
    const map: Record<string, number> = {}
    const records: { id: string; amount: number; created_at: string }[] = [
      ...atfs.filter(a => a.atf_status === "Dispensed" || a.atf_status === "Confirmed").map(a => ({
        id: a.request_id, amount: a.total_amount ?? 0, created_at: a.requested_at
      })),
      ...deposits.filter(d => d.status === "Confirmed").map(d => ({
        id: d.deposit_id, amount: -d.amount, created_at: d.confirmed_at ?? d.deposited_at
      })),
    ]
    records.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    let running = currentBalance ?? 0
    for (const rec of records) {
      map[rec.id] = running
      running += rec.amount
    }
    return map
  }, [atfs, deposits, currentBalance])

  const filteredATFs = filter === "All" ? atfs : atfs.filter(a => a.atf_status === filter)
  const isLow = currentBalance !== null && currentBalance < lowThreshold

  const labelStyle: React.CSSProperties = {
    fontWeight: 600, display: "block",
    marginBottom: 6, fontSize: FONT_SIZE.sm, color: "#475569"
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", paddingRight: 36,
    boxSizing: "border-box", borderRadius: 8,
    border: "1px solid #e2e8f0", fontSize: FONT_SIZE.base,
    background: "white", color: "#0f172a", minHeight: 48,
  }

  const modalOverlay: React.CSSProperties = {
    position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)",
    backdropFilter: "blur(4px)",
    display: "flex", alignItems: isMobile ? "flex-end" : "center",
    justifyContent: "center", zIndex: 100, padding: isMobile ? 0 : 24
  }

  const modalBox: React.CSSProperties = {
    background: "white",
    borderRadius: isMobile ? "20px 20px 0 0" : 12,
    padding: isMobile ? "28px 20px" : 32,
    width: "100%",
    maxWidth: 480,
    maxHeight: "90vh",
    overflowY: "auto",
    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)"
  }

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#f8fafc", fontFamily: "'Inter', sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid #e2e8f0", borderTopColor: "#0070f3", animation: "spin 1s linear infinite", margin: "0 auto 12px" }} />
        <p style={{ color: "#64748b", fontSize: FONT_SIZE.sm }}>Loading…</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .avatar-btn:hover { border-color: #0070f3 !important; transform: scale(1.05); }
        .avatar-wrapper:hover .camera-overlay { opacity: 1 !important; }
        .btn-hover-opacity:hover { opacity: 0.9 !important; }
        .report-btn:hover { background: #fff0e1 !important; border-color: #f8ad5c !important; }
        .logout-btn:hover { background: rgba(239,68,68,0.1) !important; border-color: #fca5a5 !important; }
        .refresh-btn:hover { background: #f8fafc !important; border-color: #cbd5e1 !important; }
        .filter-btn:hover { border-color: #cbd5e1 !important; }
        .atf-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08) !important; border-color: #cbd5e1 !important; }
        .invalidate-btn:hover { background: rgba(239,68,68,0.05) !important; border-color: #f87171 !important; }
        .decline-btn:hover:not(:disabled) { background: #fee2e2 !important; border-color: #fca5a5 !important; }
      `}</style>

      {/* Profile Banner */}
      <div style={{ background: "white", borderBottom: "1px solid #e2e8f0", padding: isMobile ? "16px" : "24px 32px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", gap: isMobile ? 12 : 16, justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 12 : 16, flex: 1 }}>
            <div className="avatar-wrapper" style={{ position: "relative" }}>
              <div
                onClick={() => setShowPictureModal(true)}
                className="avatar-btn"
                style={{
                  width: isMobile ? 48 : 56,
                  height: isMobile ? 48 : 56,
                  borderRadius: "50%",
                  background: manager?.profile_picture_url ? "transparent" : "#f0f7ff",
                  border: "2px solid #bfdbfe",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  cursor: "pointer",
                  overflow: "hidden",
                  transition: "all 0.2s",
                }}
              >
                {manager?.profile_picture_url ? (
                  <img src={manager.profile_picture_url} alt={companyName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ fontSize: isMobile ? 20 : 24, fontWeight: 700, color: "#0070f3" }}>
                    {companyName.charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="camera-overlay" style={{ position: "absolute", inset: 0, background: "rgba(0, 0, 0, 0.4)", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0, transition: "opacity 0.2s" }}>
                  <Icon icon="mdi:camera" width={20} height={20} color="white" />
                </div>
              </div>
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: isMobile ? FONT_SIZE.lg : FONT_SIZE.xl, fontWeight: 700, color: "#0070f3" }}>
                {companyName}
              </h1>
              <RoleSwitcher currentRole={Role.StationManager} style={{ margin: "2px 0 0", fontSize: FONT_SIZE.sm, color: "#64748b" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setShowReportModal(true)}
              className="report-btn"
              style={{ padding: "8px 14px", background: "#fff8e1", color: "#f5a623", border: "1.5px solid #f8ad5c", borderRadius: 8, cursor: "pointer", fontSize: FONT_SIZE.sm, minHeight: 40, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s", whiteSpace: "nowrap" }}
            >
              <Icon icon="mdi:alert-circle-outline" width={16} />
              {!isMobile && "Report"}
            </button>
            <button onClick={async () => { await supabase.auth.signOut(); router.push("/login") }} className="logout-btn" style={{ padding: "8px 16px", background: "rgba(239, 68, 68, 0.05)", color: "#ef4444", border: "1.5px solid #fecaca", borderRadius: 8, cursor: "pointer", fontSize: FONT_SIZE.sm, minHeight: 40, fontWeight: 600, transition: "all 0.2s" }}>
              Logout
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding: isMobile ? "16px" : "32px", maxWidth: 1200, margin: "0 auto" }}>

        {/* Balance Card */}
        <div style={{ background: isLow ? "#fff8e1" : "white", border: `1px solid ${isLow ? "#fde68a" : "#e2e8f0"}`, borderRadius: 12, padding: isMobile ? 16 : 24, marginBottom: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <p style={{ margin: "0 0 8px 0", fontWeight: 600, fontSize: FONT_SIZE.sm, color: "#94a3b8", letterSpacing: 0.5 }}>Available Balance</p>
          <p style={{ margin: 0, fontSize: isMobile ? FONT_SIZE["2xl"] : FONT_SIZE.xl, fontWeight: 700, color: isLow ? "#f5a623" : "#16a34a" }}>
            ₦{currentBalance !== null ? currentBalance.toLocaleString() : "—"}
          </p>
          {isLow && <p style={{ margin: "8px 0 0", fontSize: FONT_SIZE.sm, color: "#f5a623", fontWeight: 600 }}>⚠️ Below threshold (₦{lowThreshold.toLocaleString()})</p>}
        </div>

        {/* Pending Deposits */}
        {deposits.filter(d => d.status === "Pending").length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: FONT_SIZE.base, fontWeight: 700, color: "#0f172a" }}>Pending Top-ups</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {deposits.filter(d => d.status === "Pending").map(d => (
                <div key={d.deposit_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: "14px 18px" }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: FONT_SIZE.lg, color: "#0f172a" }}>₦{d.amount.toLocaleString()}</p>
                    {d.note && <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.sm, color: "#64748b" }}>{d.note}</p>}
                    <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>{formatDateTime(d.deposited_at)}</p>
                  </div>
                  <button onClick={() => setConfirmingDeposit(d.deposit_id)} className="btn-hover-opacity" style={{ padding: "10px 18px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: FONT_SIZE.sm, whiteSpace: "nowrap", transition: "opacity 0.2s" }}>
                    Confirm Receipt
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filter pills */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20, alignItems: "center" }}>
          {filters.map(f => {
            const { bg, color, border } = filterColor(f, filter)
            return (
              <button key={f} onClick={() => setFilter(f)} className="filter-btn" style={{ padding: "6px 14px", borderRadius: 20, fontSize: FONT_SIZE.xs, cursor: "pointer", border: `1.5px solid ${border}`, background: bg, color, fontWeight: filter === f ? 600 : 500, transition: "all 0.2s", minHeight: 40 }}>
                {f}
              </button>
            )
          })}
          <div style={{ flex: 1 }} />
          {lastUpdated && <span style={{ fontSize: FONT_SIZE.xs, color: "#94a3b8", whiteSpace: "nowrap" }}>Updated {formatTime(lastUpdated)}</span>}
          <button onClick={() => { fetchCompanyData(manager?.company_id ?? ""); refetchATFs(); fetchDeposits(manager?.company_id ?? "") }} className="refresh-btn" style={{ padding: "6px 12px", fontSize: FONT_SIZE.xs, cursor: "pointer", borderRadius: 8, border: "1px solid #e2e8f0", background: "white", color: "#64748b", transition: "all 0.2s", fontWeight: 600 }}>
            Refresh
          </button>
        </div>

        {filteredATFs.length === 0 && <p style={{ color: "#64748b", fontSize: FONT_SIZE.base }}>No {filter === "All" ? "" : filter.toLowerCase()} ATFs.</p>}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filteredATFs.map(atf => {
            const { bg, color, border } = atfStatusColor(atf.atf_status)
            return (
              <div key={atf.request_id} className="atf-card" style={{ background: "white", border: `1px solid ${border}`, borderRadius: 12, padding: isMobile ? 16 : 20, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", transition: "all 0.2s" }}>

                {/* ATF Code */}
                <div style={{ background: "#f8fafc", borderRadius: 8, padding: "12px 14px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid #e2e8f0" }}>
                  <div>
                    <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>ATF Code</p>
                    <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.lg, fontWeight: 700, fontFamily: "monospace", letterSpacing: 2, color: "#0f172a" }}>{atf.atf_code}</p>
                  </div>
                  <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: FONT_SIZE.xs, background: bg, color, fontWeight: 700, border: `1px solid ${color}33` }}>{atf.atf_status}</span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div>
                    <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Driver</p>
                    <p style={{ margin: "2px 0 0", fontWeight: 700, fontSize: FONT_SIZE.base, color: "#0f172a" }}>{atf.driver_name}</p>
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Truck</p>
                    <p style={{ margin: "2px 0 0", fontWeight: 700, fontSize: FONT_SIZE.base, color: "#0f172a" }}>
                      {atf.plate_number}{atf.kbnl_truck_no ? ` · #${atf.kbnl_truck_no}` : ""}
                    </p>
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Litres Authorised</p>
                    <p style={{ margin: "2px 0 0", fontWeight: 700, fontSize: FONT_SIZE.lg, color: "#0070f3" }}>{atf.litres}L</p>
                  </div>
                  {atf.total_amount && (
                    <div>
                      <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Total Amount</p>
                      <p style={{ margin: "2px 0 0", fontWeight: 700, fontSize: FONT_SIZE.base, color: "#16a34a" }}>₦{atf.total_amount.toLocaleString()}</p>
                      {atf.atf_status === "Confirmed" && balanceMap[atf.request_id] !== undefined && (
                        <span style={{ marginTop: 4, fontSize: FONT_SIZE.xs, fontWeight: 600, color: "#16a34a", background: "#f0fdf4", padding: "2px 8px", borderRadius: 4, display: "inline-block" }}>
                          Balance after: ₦{balanceMap[atf.request_id].toLocaleString()}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <p style={{ margin: "0 0 12px", fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>{formatDateTime(atf.requested_at)}</p>

                {atf.atf_status === "Authorised" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <button onClick={() => { setDispensingATF(atf); setRatePerLitre(""); setDispenseError("") }} className="btn-hover-opacity" style={{ padding: "10px 14px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: FONT_SIZE.sm, minHeight: 40, transition: "opacity 0.2s" }}>
                      I've Dispensed
                    </button>
                    <button onClick={() => { setInvalidatingATF(atf); setInvalidateReason(""); setInvalidateError("") }} className="invalidate-btn" style={{ padding: "10px 14px", background: "white", color: "#ef4444", border: "1.5px solid #ef4444", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: FONT_SIZE.sm, minHeight: 40, transition: "all 0.2s" }}>
                      Invalidate
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <ProfilePictureUpload
        isOpen={showPictureModal}
        onClose={() => setShowPictureModal(false)}
        userId={manager?.manager_id || ""}
        table="station_managers"
        idField="manager_id"
        currentUrl={manager?.profile_picture_url}
        onSuccess={(url) => setManager(prev => prev ? { ...prev, profile_picture_url: url } : prev)}
      />

      {/* Dispense Modal */}
      {dispensingATF && (
        <div style={modalOverlay}>
          <div onClick={e => e.stopPropagation()} style={modalBox}>
            <h3 style={{ marginBottom: 6, color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>Confirm Dispensing</h3>
            <p style={{ color: "#64748b", fontSize: FONT_SIZE.sm, marginBottom: 20 }}>Enter the rate per litre at which you dispensed</p>

            <div style={{ background: "#f8fafc", borderRadius: 8, padding: 16, marginBottom: 20, border: "1px solid #e2e8f0" }}>
              <p style={{ margin: "0 0 6px" }}><strong>ATF:</strong> <span style={{ fontFamily: "monospace", letterSpacing: 1, fontWeight: 700 }}>{dispensingATF.atf_code}</span></p>
              <p style={{ margin: "0 0 6px" }}><strong>Driver:</strong> {dispensingATF.driver_name}</p>
              <p style={{ margin: "0 0 6px" }}><strong>Truck:</strong> {dispensingATF.plate_number}</p>
              <p style={{ margin: 0 }}><strong>Litres:</strong> {dispensingATF.litres}L</p>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Rate per Litre (₦) *</label>
              <div style={{ position: "relative" }}>
                <input type="text" inputMode="numeric" placeholder="e.g. 1,200" value={ratePerLitre} onChange={e => { setRatePerLitre(formatAmount(e.target.value)); setDispenseError("") }} style={inputStyle} />
              </div>
            </div>

            {ratePerLitre && parseAmount(ratePerLitre) > 0 && (
              <div style={{ background: "#f0f7ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
                <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#0070f3", fontWeight: 700 }}>
                  Total: ₦{(dispensingATF.litres * parseAmount(ratePerLitre)).toLocaleString()}
                </p>
              </div>
            )}

            {dispenseError && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 16, color: "#b91c1c", fontSize: FONT_SIZE.sm, fontWeight: 600 }}>{dispenseError}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => { setDispensingATF(null); setRatePerLitre(""); setDispenseError("") }} style={{ padding: "12px 16px", background: "white", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: FONT_SIZE.md, minHeight: 44 }}>
                Cancel
              </button>
              <button onClick={handleDispense} disabled={dispenseLoading} style={{ padding: "12px 16px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: dispenseLoading ? "not-allowed" : "pointer", fontWeight: 700, fontSize: FONT_SIZE.md, minHeight: 44, opacity: dispenseLoading ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {dispenseLoading ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} /> Confirming...</> : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invalidate Modal */}
      {invalidatingATF && (
        <div style={modalOverlay}>
          <div onClick={e => e.stopPropagation()} style={modalBox}>
            <h3 style={{ marginBottom: 6, color: "#ef4444", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>Invalidate ATF</h3>
            <p style={{ color: "#64748b", fontSize: FONT_SIZE.sm, marginBottom: 20 }}>
              <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#0f172a", letterSpacing: 1 }}>{invalidatingATF.atf_code}</span> — {invalidatingATF.litres}L for {invalidatingATF.driver_name}
            </p>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Reason *</label>
              <textarea value={invalidateReason} onChange={e => { setInvalidateReason(e.target.value); setInvalidateError("") }} placeholder="e.g. Only 100L available, requested 200L" rows={4} style={{ width: "100%", padding: "10px 12px", boxSizing: "border-box", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: FONT_SIZE.base, resize: "none", background: "white", color: "#0f172a", minHeight: 100 }} />
            </div>
            {invalidateError && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 16, color: "#b91c1c", fontSize: FONT_SIZE.sm, fontWeight: 600 }}>{invalidateError}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => { setInvalidatingATF(null); setInvalidateReason(""); setInvalidateError("") }} style={{ padding: "12px 16px", background: "white", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: FONT_SIZE.md, minHeight: 44 }}>
                Cancel
              </button>
              <button onClick={handleInvalidate} disabled={invalidateLoading} style={{ padding: "12px 16px", background: "#ef4444", color: "white", border: "none", borderRadius: 8, cursor: invalidateLoading ? "not-allowed" : "pointer", fontWeight: 700, fontSize: FONT_SIZE.md, minHeight: 44, opacity: invalidateLoading ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {invalidateLoading ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} /> Invalidating...</> : "Confirm Invalidate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm / Decline Deposit Modal */}
      {confirmingDeposit && (
        <div style={modalOverlay}>
          <div onClick={e => e.stopPropagation()} style={modalBox}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>Confirm Top-up</h3>
              <button onClick={() => setConfirmingDeposit(null)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 4, minHeight: 40, minWidth: 40, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            {(() => {
              const d = deposits.find(x => x.deposit_id === confirmingDeposit)
              if (!d) return null
              return (
                <>
                  <p style={{ margin: "0 0 28px", color: "#64748b", fontSize: FONT_SIZE.sm, lineHeight: 1.6 }}>
                    Did you receive <strong style={{ color: "#0f172a", fontSize: FONT_SIZE.base }}>₦{d.amount.toLocaleString()}</strong>
                    {d.note ? <> for <em>"{d.note}"</em></> : ""}?
                  </p>
                  <div style={{ display: "flex", flexDirection: isMobile ? "column-reverse" : "row", gap: 10 }}>
                    <button
                      onClick={() => declineDeposit(d)}
                      disabled={confirmLoading}
                      className="decline-btn"
                      style={{
                        flex: 1, padding: "14px 16px", minHeight: 48,
                        background: "#fef2f2", color: "#ef4444",
                        border: "1.5px solid #fecaca", borderRadius: 10,
                        cursor: confirmLoading ? "not-allowed" : "pointer",
                        fontWeight: 700, fontSize: FONT_SIZE.md,
                        opacity: confirmLoading ? 0.5 : 1,
                        transition: "all 0.2s"
                      }}
                    >
                      Decline
                    </button>
                    <button
                      onClick={() => confirmDeposit(d)}
                      disabled={confirmLoading}
                      style={{
                        flex: 1, padding: "14px 16px", minHeight: 48,
                        background: "#16a34a", color: "white",
                        border: "none", borderRadius: 10,
                        cursor: confirmLoading ? "not-allowed" : "pointer",
                        fontWeight: 700, fontSize: FONT_SIZE.md,
                        opacity: confirmLoading ? 0.6 : 1,
                        transition: "all 0.2s",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 8
                      }}
                    >
                      {confirmLoading ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} /> Processing...</> : "Confirm"}
                    </button>
                  </div>
                </>
              )
            })()}
            {depositError && (
              <div style={{ marginTop: 16, padding: 12, background: "rgba(239, 68, 68, 0.08)", border: "1.5px solid rgba(239, 68, 68, 0.3)", borderRadius: 10, fontSize: 14, color: "#dc2626", fontWeight: 500, textAlign: "center", lineHeight: 1.4 }}>
                {depositError}
              </div>
            )}
          </div>
        </div>
      )}

      <ReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        userId={manager?.manager_id || ""}
        userRole={Role.StationManager}
      />
    </div>
  )
}
