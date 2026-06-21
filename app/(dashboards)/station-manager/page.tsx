"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { formatAmount, parseAmount } from "@/lib/formatAmount"
import ModernInput from "@/components/ModernInput"
import { Icon } from "@iconify/react"
import { useBreakpoint } from "@/app/hooks/useBreakpoint"

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
}

type StationManager = {
  manager_id: string
  company_id: string
  profile_picture_url?: string
}

const fontSize = {
  xs: 12,
  sm: 13,
  base: 14,
  md: 15,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 28
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

  const fileInputRef = useRef<HTMLInputElement>(null)

  const [manager, setManager] = useState<StationManager | null>(null)
  const [companyName, setCompanyName] = useState("")
  const [currentBalance, setCurrentBalance] = useState<number | null>(null)
  const [lowThreshold, setLowThreshold] = useState<number>(0)
  const [atfs, setAtfs] = useState<ATF[]>([])
  const [deposits, setDeposits] = useState<FuelDeposit[]>([])
  const [filter, setFilter] = useState("All")
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const [showPictureModal, setShowPictureModal] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [picturePreview, setPicturePreview] = useState<string | null>(null)
  const [pictureLoading, setPictureLoading] = useState(false)
  const [pictureError, setPictureError] = useState("")

  const [dispensingATF, setDispensingATF] = useState<ATF | null>(null)
  const [ratePerLitre, setRatePerLitre] = useState("")
  const [dispenseError, setDispenseError] = useState("")
  const [dispenseLoading, setDispenseLoading] = useState(false)

  const [confirmingDeposit, setConfirmingDeposit] = useState<string | null>(null)
  const [confirmLoading, setConfirmLoading] = useState(false)

  const [invalidatingATF, setInvalidatingATF] = useState<ATF | null>(null)
  const [invalidateReason, setInvalidateReason] = useState("")
  const [invalidateError, setInvalidateError] = useState("")
  const [invalidateLoading, setInvalidateLoading] = useState(false)

  const filters = ["All", "Authorised", "Dispensed", "Confirmed", "Invalidated"]

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event === "SIGNED_OUT") router.push("/login")
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push("/login"); return }
      const user = session.user

      const { data: profile } = await supabase.from("Profiles").select("role").eq("user_id", user.id).single()
      if (profile?.role !== "StationManager") { router.push("/login"); return }

      const { data: mgr } = await supabase.from("station_managers").select("manager_id, company_id, profile_picture_url").eq("manager_id", user.id).single()
      if (!mgr) { router.push("/login"); return }

      setManager(mgr)
      await fetchCompanyData(mgr.company_id)
      await Promise.all([
        fetchATFs(mgr.company_id),
        fetchDeposits(mgr.company_id),
      ])
      setLoading(false)
    }
    init()
  }, [])

  useEffect(() => {
    if (!manager) return
    const interval = setInterval(() => {
      fetchCompanyData(manager.company_id)
      fetchATFs(manager.company_id)
      fetchDeposits(manager.company_id)
    }, 30000)
    return () => clearInterval(interval)
  }, [manager])

  async function fetchCompanyData(cId: string) {
    const { data } = await supabase.from("fuel_companies").select("company_name, current_balance, low_balance_threshold").eq("company_id", cId).single()
    if (data) { setCompanyName(data.company_name); setCurrentBalance(data.current_balance); setLowThreshold(data.low_balance_threshold) }
  }

  async function fetchATFs(cId: string) {
    const { data: raw } = await supabase
      .from("fuel_requests")
      .select("request_id, atf_code, plate_number, driver_id, litres, atf_status, requested_at, rate_per_litre, total_amount")
      .eq("company_id", cId)
      .order("requested_at", { ascending: false })

    if (!raw) return

    const enriched = await Promise.all(raw.map(async r => {
      const { data: driver } = await supabase.from("Drivers").select("full_name").eq("driver_id", r.driver_id).single()
      const { data: truck } = await supabase.from("Trucks").select("kbnl_truck_no").eq("plate_number", r.plate_number).single()
      return {
        ...r,
        driver_name: driver?.full_name ?? "Unknown",
        driver_id: r.driver_id,
        kbnl_truck_no: truck?.kbnl_truck_no ?? null,
      }
    }))

    setAtfs(enriched)
    setLastUpdated(new Date())
  }

  async function fetchDeposits(cId: string) {
    const { data } = await supabase
      .from("fuel_deposits")
      .select("deposit_id, amount, note, deposited_at")
      .eq("company_id", cId)
      .eq("status", "Pending")
      .order("deposited_at", { ascending: false })

    setDeposits(data || [])
    setLastUpdated(new Date())
  }

  async function confirmDeposit(deposit: FuelDeposit) {
    setConfirmLoading(true)

    const { data: fresh } = await supabase
      .from("fuel_deposits")
      .select("status")
      .eq("deposit_id", deposit.deposit_id)
      .single()

    if (!fresh || fresh.status !== "Pending") {
      setConfirmLoading(false)
      setConfirmingDeposit(null)
      fetchDeposits(manager?.company_id ?? "")
      return
    }

    const { error: updateError } = await supabase
      .from("fuel_deposits")
      .update({ status: "Confirmed", confirmed_at: new Date().toISOString() })
      .eq("deposit_id", deposit.deposit_id)

    if (updateError) { setConfirmLoading(false); return }

    const { data: company } = await supabase
      .from("fuel_companies")
      .select("current_balance")
      .eq("company_id", manager?.company_id)
      .single()

    const newBalance = (company?.current_balance ?? 0) + deposit.amount
    await supabase.from("fuel_companies").update({ current_balance: newBalance }).eq("company_id", manager?.company_id)
    setCurrentBalance(newBalance)

    setConfirmLoading(false)
    setConfirmingDeposit(null)
    fetchDeposits(manager?.company_id ?? "")
  }

  async function declineDeposit(deposit: FuelDeposit) {
    setConfirmLoading(true)

    const { data: fresh } = await supabase
      .from("fuel_deposits")
      .select("status")
      .eq("deposit_id", deposit.deposit_id)
      .single()

    if (!fresh || fresh.status !== "Pending") {
      setConfirmLoading(false)
      setConfirmingDeposit(null)
      fetchDeposits(manager?.company_id ?? "")
      return
    }

    await supabase
      .from("fuel_deposits")
      .update({ status: "Declined", declined_at: new Date().toISOString() })
      .eq("deposit_id", deposit.deposit_id)

    setConfirmLoading(false)
    setConfirmingDeposit(null)
    fetchDeposits(manager?.company_id ?? "")
  }

  function handleAvatarClick() {
    setPictureError("")
    setPicturePreview(null)
    setSelectedFile(null)
    setShowPictureModal(true)
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith("image/")) {
      setPictureError("Please select an image file")
      return
    }

    if (file.size > 1024 * 1024) {
      setPictureError("Image must be less than 1MB")
      return
    }

    setSelectedFile(file)
    setPictureError("")

    const reader = new FileReader()
    reader.onload = (event) => {
      setPicturePreview(event.target?.result as string)
    }
    reader.readAsDataURL(file)
  }

  async function handleUploadPicture() {
    if (!selectedFile || !manager) {
      setPictureError("Please select an image")
      return
    }

    setPictureLoading(true)
    setPictureError("")

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setPictureError("Session expired"); setPictureLoading(false); return }

      const fileExt = selectedFile.name.split(".").pop()
      const fileName = `${manager.manager_id}-${Date.now()}.${fileExt}`
      const filePath = `${manager.manager_id}/${fileName}`

      if (manager.profile_picture_url) {
        const oldPath = manager.profile_picture_url.split("/").slice(-2).join("/")
        await supabase.storage.from("profile-pictures").remove([oldPath])
      }

      const { error: uploadError } = await supabase.storage
        .from("profile-pictures")
        .upload(filePath, selectedFile, { upsert: false })

      if (uploadError) { setPictureError("Upload failed"); setPictureLoading(false); return }

      const { data: { publicUrl } } = supabase.storage
        .from("profile-pictures")
        .getPublicUrl(filePath)

      const { error: updateError } = await supabase
        .from("station_managers")
        .update({ profile_picture_url: publicUrl })
        .eq("manager_id", manager.manager_id)

      if (updateError) { setPictureError("Failed to save profile"); setPictureLoading(false); return }

      setManager({ ...manager, profile_picture_url: publicUrl })

      setPictureLoading(false)
      setShowPictureModal(false)
      setSelectedFile(null)
      setPicturePreview(null)
    } catch (err) {
      setPictureError("Something went wrong")
      setPictureLoading(false)
    }
  }

  async function handleDispense() {
    if (!dispensingATF) return
    const rate = parseAmount(ratePerLitre)
    if (!ratePerLitre || rate <= 0) return setDispenseError("Enter a valid rate per litre")

    const total = dispensingATF.litres * rate
    const isLow = currentBalance !== null && currentBalance < total
    if (isLow) return setDispenseError(`Insufficient balance — need ₦${total.toLocaleString()} but only ₦${currentBalance?.toLocaleString()} available`)

    setDispenseLoading(true)

    await supabase.from("fuel_requests").update({
      atf_status: "Dispensed",
      rate_per_litre: rate,
      total_amount: total,
      dispensed_at: new Date().toISOString(),
    }).eq("request_id", dispensingATF.request_id)

    const newBalance = (currentBalance ?? 0) - total
    await supabase.from("fuel_companies").update({ current_balance: newBalance }).eq("company_id", manager?.company_id)
    setCurrentBalance(newBalance)

    const { data: truck } = await supabase.from("Trucks").select("fuel_balance").eq("plate_number", dispensingATF.plate_number).single()
    if (truck) {
      await supabase.from("Trucks").update({ fuel_balance: truck.fuel_balance + dispensingATF.litres }).eq("plate_number", dispensingATF.plate_number)
    }

    setDispenseLoading(false)
    setDispensingATF(null)
    setRatePerLitre("")
    setDispenseError("")
    fetchATFs(manager?.company_id ?? "")
  }

  async function handleInvalidate() {
    if (!invalidatingATF) return
    if (!invalidateReason.trim()) return setInvalidateError("Provide a reason for invalidation")

    setInvalidateLoading(true)
    await supabase.from("fuel_requests").update({
      atf_status: "Invalidated",
      invalidation_reason: invalidateReason.trim(),
      invalidated_at: new Date().toISOString(),
    }).eq("request_id", invalidatingATF.request_id)

    setInvalidateLoading(false)
    setInvalidatingATF(null)
    setInvalidateReason("")
    setInvalidateError("")
    fetchATFs(manager?.company_id ?? "")
  }

  const filteredATFs = filter === "All" ? atfs : atfs.filter(a => a.atf_status === filter)
  const isLow = currentBalance !== null && currentBalance < lowThreshold

  const labelStyle: React.CSSProperties = {
    fontWeight: 600, display: "block",
    marginBottom: 6, fontSize: fontSize.sm, color: "#475569"
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", paddingRight: 36,
    boxSizing: "border-box", borderRadius: 8,
    border: "1px solid #e2e8f0", fontSize: fontSize.base,
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
        <p style={{ color: "#64748b", fontSize: fontSize.sm }}>Loading…</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "'Inter', sans-serif" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Profile Banner */}
      <div style={{ background: "white", borderBottom: "1px solid #e2e8f0", padding: isMobile ? "16px" : "24px 32px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", gap: isMobile ? 12 : 16, justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 12 : 16, flex: 1 }}>
            <div
              onClick={handleAvatarClick}
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
                position: "relative",
                overflow: "hidden",
                transition: "all 0.2s",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = "#0070f3"
                e.currentTarget.style.transform = "scale(1.05)"
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = "#bfdbfe"
                e.currentTarget.style.transform = "scale(1)"
              }}
            >
              {manager?.profile_picture_url ? (
                <img src={manager.profile_picture_url} alt={companyName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ fontSize: isMobile ? 20 : 24, fontWeight: 700, color: "#0070f3" }}>
                  {companyName.charAt(0).toUpperCase()}
                </span>
              )}
              <div style={{ position: "absolute", inset: 0, background: "rgba(0, 0, 0, 0.4)", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0, transition: "opacity 0.2s" }} onMouseEnter={e => e.currentTarget.style.opacity = "1"} onMouseLeave={e => e.currentTarget.style.opacity = "0"}>
                <Icon icon="mdi:camera" width={20} height={20} color="white" />
              </div>
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: isMobile ? fontSize.lg : fontSize.xl, fontWeight: 700, color: "#0070f3" }}>
                {companyName}
              </h1>
              <p style={{ margin: "2px 0 0", fontSize: fontSize.sm, color: "#64748b" }}>Station Manager</p>
            </div>
          </div>
          <button onClick={async () => { await supabase.auth.signOut(); router.push("/login") }} style={{ padding: "8px 16px", background: "rgba(239, 68, 68, 0.05)", color: "#ef4444", border: "1.5px solid #fecaca", borderRadius: 8, cursor: "pointer", fontSize: fontSize.sm, minHeight: 40, fontWeight: 600, transition: "all 0.2s" }} onMouseEnter={e => { e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)"; e.currentTarget.style.borderColor = "#fca5a5" }} onMouseLeave={e => { e.currentTarget.style.background = "rgba(239, 68, 68, 0.05)"; e.currentTarget.style.borderColor = "#fecaca" }}>
            Logout
          </button>
        </div>
      </div>

      <div style={{ padding: isMobile ? "16px" : "32px", maxWidth: 1200, margin: "0 auto" }}>

        {/* Balance Card */}
        <div style={{ background: isLow ? "#fff8e1" : "white", border: `1px solid ${isLow ? "#fde68a" : "#e2e8f0"}`, borderRadius: 12, padding: isMobile ? 16 : 24, marginBottom: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <p style={{ margin: "0 0 8px 0", fontWeight: 600, fontSize: fontSize.sm, color: "#94a3b8", letterSpacing: 0.5 }}>Available Balance</p>
          <p style={{ margin: 0, fontSize: isMobile ? fontSize["2xl"] : fontSize.xl, fontWeight: 700, color: isLow ? "#f5a623" : "#16a34a" }}>
            ₦{currentBalance !== null ? currentBalance.toLocaleString() : "—"}
          </p>
          {isLow && <p style={{ margin: "8px 0 0", fontSize: fontSize.sm, color: "#f5a623", fontWeight: 600 }}>⚠️ Below threshold (₦{lowThreshold.toLocaleString()})</p>}
        </div>

        {/* Pending Deposits */}
        {deposits.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: fontSize.base, fontWeight: 700, color: "#0f172a" }}>Pending Top-ups</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {deposits.map(d => (
                <div key={d.deposit_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: "14px 18px" }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: fontSize.lg, color: "#0f172a" }}>₦{d.amount.toLocaleString()}</p>
                    {d.note && <p style={{ margin: "4px 0 0", fontSize: fontSize.sm, color: "#64748b" }}>{d.note}</p>}
                    <p style={{ margin: "4px 0 0", fontSize: fontSize.xs, color: "#94a3b8" }}>{new Date(d.deposited_at).toLocaleString()}</p>
                  </div>
                  <button onClick={() => setConfirmingDeposit(d.deposit_id)} style={{ padding: "10px 18px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: fontSize.sm, whiteSpace: "nowrap", transition: "opacity 0.2s" }} onMouseEnter={e => e.currentTarget.style.opacity = "0.9"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
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
              <button key={f} onClick={() => setFilter(f)} style={{ padding: "6px 14px", borderRadius: 20, fontSize: fontSize.xs, cursor: "pointer", border: `1.5px solid ${border}`, background: bg, color, fontWeight: filter === f ? 600 : 500, transition: "all 0.2s", minHeight: 40 }} onMouseEnter={e => { if (filter !== f) { e.currentTarget.style.borderColor = "#cbd5e1" } }} onMouseLeave={e => { if (filter !== f) { e.currentTarget.style.borderColor = border } }}>
                {f}
              </button>
            )
          })}
          <div style={{ flex: 1 }} />
          {lastUpdated && <span style={{ fontSize: fontSize.xs, color: "#94a3b8", whiteSpace: "nowrap" }}>Updated {lastUpdated.toLocaleTimeString()}</span>}
          <button onClick={() => { fetchCompanyData(manager?.company_id ?? ""); fetchATFs(manager?.company_id ?? ""); fetchDeposits(manager?.company_id ?? "") }} style={{ padding: "6px 12px", fontSize: fontSize.xs, cursor: "pointer", borderRadius: 8, border: "1px solid #e2e8f0", background: "white", color: "#64748b", transition: "all 0.2s", fontWeight: 600 }} onMouseEnter={e => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1" }} onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#e2e8f0" }}>
            Refresh
          </button>
        </div>

        {filteredATFs.length === 0 && <p style={{ color: "#64748b", fontSize: fontSize.base }}>No {filter === "All" ? "" : filter.toLowerCase()} ATFs.</p>}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filteredATFs.map(atf => {
            const { bg, color, border } = atfStatusColor(atf.atf_status)
            return (
              <div key={atf.request_id} style={{ background: "white", border: `1px solid ${border}`, borderRadius: 12, padding: isMobile ? 16 : 20, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", transition: "all 0.2s" }} onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)"; e.currentTarget.style.borderColor = "#cbd5e1" }} onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)"; e.currentTarget.style.borderColor = border }}>

                {/* ATF Code */}
                <div style={{ background: "#f8fafc", borderRadius: 8, padding: "12px 14px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid #e2e8f0" }}>
                  <div>
                    <p style={{ margin: 0, fontSize: fontSize.xs, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>ATF Code</p>
                    <p style={{ margin: "4px 0 0", fontSize: fontSize.lg, fontWeight: 700, fontFamily: "monospace", letterSpacing: 2, color: "#0f172a" }}>{atf.atf_code}</p>
                  </div>
                  <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: fontSize.xs, background: bg, color, fontWeight: 700, border: `1px solid ${color}33` }}>{atf.atf_status}</span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div>
                    <p style={{ margin: 0, fontSize: fontSize.xs, color: "#94a3b8" }}>Driver</p>
                    <p style={{ margin: "2px 0 0", fontWeight: 700, fontSize: fontSize.base, color: "#0f172a" }}>{atf.driver_name}</p>
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: fontSize.xs, color: "#94a3b8" }}>Truck</p>
                    <p style={{ margin: "2px 0 0", fontWeight: 700, fontSize: fontSize.base, color: "#0f172a" }}>
                      {atf.plate_number}{atf.kbnl_truck_no ? ` · #${atf.kbnl_truck_no}` : ""}
                    </p>
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: fontSize.xs, color: "#94a3b8" }}>Litres Authorised</p>
                    <p style={{ margin: "2px 0 0", fontWeight: 700, fontSize: fontSize.lg, color: "#0070f3" }}>{atf.litres}L</p>
                  </div>
                  {atf.total_amount && (
                    <div>
                      <p style={{ margin: 0, fontSize: fontSize.xs, color: "#94a3b8" }}>Total Amount</p>
                      <p style={{ margin: "2px 0 0", fontWeight: 700, fontSize: fontSize.base, color: "#16a34a" }}>₦{atf.total_amount.toLocaleString()}</p>
                    </div>
                  )}
                </div>

                <p style={{ margin: "0 0 12px", fontSize: fontSize.xs, color: "#94a3b8" }}>{new Date(atf.requested_at).toLocaleString()}</p>

                {atf.atf_status === "Authorised" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <button onClick={() => { setDispensingATF(atf); setRatePerLitre(""); setDispenseError("") }} style={{ padding: "10px 14px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: fontSize.sm, minHeight: 40, transition: "opacity 0.2s" }} onMouseEnter={e => e.currentTarget.style.opacity = "0.9"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                      I've Dispensed
                    </button>
                    <button onClick={() => { setInvalidatingATF(atf); setInvalidateReason(""); setInvalidateError("") }} style={{ padding: "10px 14px", background: "white", color: "#ef4444", border: "1.5px solid #ef4444", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: fontSize.sm, minHeight: 40, transition: "all 0.2s" }} onMouseEnter={e => { e.currentTarget.style.background = "rgba(239, 68, 68, 0.05)"; e.currentTarget.style.borderColor = "#f87171" }} onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#ef4444" }}>
                      Invalidate
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Profile Picture Modal */}
      {showPictureModal && (
        <div onClick={() => { setShowPictureModal(false); setSelectedFile(null); setPicturePreview(null); setPictureError("") }} style={modalOverlay}>
          <div onClick={e => e.stopPropagation()} style={modalBox}>
            <h3 style={{ margin: "0 0 6px 0", fontSize: fontSize.xl, fontWeight: 700, color: "#0f172a" }}>Update Profile Picture</h3>
            <p style={{ margin: "0 0 20px 0", fontSize: fontSize.sm, color: "#64748b" }}>PNG, JPG up to 1MB</p>

            {picturePreview ? (
              <div style={{ marginBottom: 20 }}>
                <p style={{ margin: "0 0 8px 0", fontSize: fontSize.sm, fontWeight: 600, color: "#0f172a" }}>Preview</p>
                <img src={picturePreview} alt="Preview" style={{ width: "100%", height: 200, objectFit: "cover", borderRadius: 12, border: "2px solid #e2e8f0" }} />
              </div>
            ) : (
              <div onClick={() => fileInputRef.current?.click()} style={{ border: "2px dashed #0070f3", borderRadius: 12, padding: "32px 16px", cursor: "pointer", background: "#f0f7ff", transition: "all 0.2s", marginBottom: 20, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }} onMouseEnter={e => { e.currentTarget.style.background = "#e0efff"; e.currentTarget.style.borderColor = "#0055d4" }} onMouseLeave={e => { e.currentTarget.style.background = "#f0f7ff"; e.currentTarget.style.borderColor = "#0070f3" }}>
                <Icon icon="mdi:cloud-upload" width={40} height={40} color="#0070f3" style={{ marginBottom: 8 }} />
                <p style={{ margin: "0 0 4px 0", fontSize: fontSize.base, fontWeight: 700, color: "#0070f3" }}>Click to upload</p>
                <p style={{ margin: 0, fontSize: fontSize.sm, color: "#64748b" }}>or drag and drop</p>
              </div>
            )}

            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} style={{ display: "none" }} />

            {pictureError && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 16, color: "#b91c1c", fontSize: fontSize.sm, fontWeight: 600 }}>{pictureError}</div>}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => { setShowPictureModal(false); setSelectedFile(null); setPicturePreview(null); setPictureError("") }} style={{ padding: "12px 16px", background: "white", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: fontSize.md, minHeight: 44 }}>
                Cancel
              </button>
              <button onClick={handleUploadPicture} disabled={pictureLoading || !selectedFile} style={{ padding: "12px 16px", background: selectedFile ? "#0070f3" : "#bfdbfe", color: "white", border: "none", borderRadius: 8, cursor: selectedFile && !pictureLoading ? "pointer" : "not-allowed", fontWeight: 700, fontSize: fontSize.md, minHeight: 44, opacity: pictureLoading ? 0.7 : 1, transition: "opacity 0.2s" }}>
                {pictureLoading ? "Uploading..." : "Upload"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dispense Modal */}
      {dispensingATF && (
        <div style={modalOverlay}>
          <div onClick={e => e.stopPropagation()} style={modalBox}>
            <h3 style={{ marginBottom: 6, color: "#0f172a", fontSize: fontSize.xl, fontWeight: 700 }}>Confirm Dispensing</h3>
            <p style={{ color: "#64748b", fontSize: fontSize.sm, marginBottom: 20 }}>Enter the rate per litre at which you dispensed</p>

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
                <p style={{ margin: 0, fontSize: fontSize.sm, color: "#0070f3", fontWeight: 700 }}>
                  Total: ₦{(dispensingATF.litres * parseAmount(ratePerLitre)).toLocaleString()}
                </p>
              </div>
            )}

            {dispenseError && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 16, color: "#b91c1c", fontSize: fontSize.sm, fontWeight: 600 }}>{dispenseError}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => { setDispensingATF(null); setRatePerLitre(""); setDispenseError("") }} style={{ padding: "12px 16px", background: "white", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: fontSize.md, minHeight: 44 }}>
                Cancel
              </button>
              <button onClick={handleDispense} disabled={dispenseLoading} style={{ padding: "12px 16px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: dispenseLoading ? "not-allowed" : "pointer", fontWeight: 700, fontSize: fontSize.md, minHeight: 44, opacity: dispenseLoading ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {dispenseLoading ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} /> Confirming...</> : "Confirm Dispensed"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invalidate Modal */}
      {invalidatingATF && (
        <div style={modalOverlay}>
          <div onClick={e => e.stopPropagation()} style={modalBox}>
            <h3 style={{ marginBottom: 6, color: "#ef4444", fontSize: fontSize.xl, fontWeight: 700 }}>Invalidate ATF</h3>
            <p style={{ color: "#64748b", fontSize: fontSize.sm, marginBottom: 20 }}>
              <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#0f172a", letterSpacing: 1 }}>{invalidatingATF.atf_code}</span> — {invalidatingATF.litres}L for {invalidatingATF.driver_name}
            </p>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Reason *</label>
              <textarea value={invalidateReason} onChange={e => { setInvalidateReason(e.target.value); setInvalidateError("") }} placeholder="e.g. Only 100L available, requested 200L" rows={4} style={{ width: "100%", padding: "10px 12px", boxSizing: "border-box", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: fontSize.base, resize: "none", background: "white", color: "#0f172a", minHeight: 100 }} />
            </div>
            {invalidateError && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 16, color: "#b91c1c", fontSize: fontSize.sm, fontWeight: 600 }}>{invalidateError}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => { setInvalidatingATF(null); setInvalidateReason(""); setInvalidateError("") }} style={{ padding: "12px 16px", background: "white", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: fontSize.md, minHeight: 44 }}>
                Cancel
              </button>
              <button onClick={handleInvalidate} disabled={invalidateLoading} style={{ padding: "12px 16px", background: "#ef4444", color: "white", border: "none", borderRadius: 8, cursor: invalidateLoading ? "not-allowed" : "pointer", fontWeight: 700, fontSize: fontSize.md, minHeight: 44, opacity: invalidateLoading ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
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
              <h3 style={{ margin: 0, color: "#0f172a", fontSize: fontSize.xl, fontWeight: 700 }}>Confirm Top-up</h3>
              <button onClick={() => setConfirmingDeposit(null)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 4, minHeight: 40, minWidth: 40, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            {(() => {
              const d = deposits.find(x => x.deposit_id === confirmingDeposit)
              if (!d) return null
              return (
                <>
                  <p style={{ margin: "0 0 28px", color: "#64748b", fontSize: fontSize.sm, lineHeight: 1.6 }}>
                    Did you receive <strong style={{ color: "#0f172a", fontSize: fontSize.base }}>₦{d.amount.toLocaleString()}</strong>
                    {d.note ? <> for <em>"{d.note}"</em></> : ""}?
                  </p>
                  <div style={{ display: "flex", flexDirection: isMobile ? "column-reverse" : "row", gap: 10 }}>
                    <button
                      onClick={() => declineDeposit(d)}
                      disabled={confirmLoading}
                      style={{
                        flex: 1, padding: "14px 16px", minHeight: 48,
                        background: "#fef2f2", color: "#ef4444",
                        border: "1.5px solid #fecaca", borderRadius: 10,
                        cursor: confirmLoading ? "not-allowed" : "pointer",
                        fontWeight: 700, fontSize: fontSize.md,
                        opacity: confirmLoading ? 0.5 : 1,
                        transition: "all 0.2s"
                      }}
                      onMouseEnter={e => { if (!confirmLoading) { e.currentTarget.style.background = "#fee2e2"; e.currentTarget.style.borderColor = "#fca5a5" } }}
                      onMouseLeave={e => { if (!confirmLoading) { e.currentTarget.style.background = "#fef2f2"; e.currentTarget.style.borderColor = "#fecaca" } }}
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
                        fontWeight: 700, fontSize: fontSize.md,
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
          </div>
        </div>
      )}
    </div>
  )
}