"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { formatAmount, parseAmount } from "@/lib/formatAmount"
import { Icon } from "@iconify/react"
import { useBreakpoint } from "@/app/hooks/useBreakpoint"

type MaintenanceReport = {
  report_id: string
  plate_number: string
  manager_name: string
  maintenance_type: string
  maintenance_location: string | null
  amount: number
  notes: string | null
  status: "Pending" | "Validated" | "Rejected"
  rejection_reason: string | null
  reported_at: string
}

type BulkProcurement = {
  procurement_id: string
  item_name: string
  total_amount: number
  notes: string | null
  logged_at: string
  distributions: { plate_number: string; amount_allocated: number }[]
}

type FeedItem =
  | { kind: "report"; data: MaintenanceReport; date: string }
  | { kind: "procurement"; data: BulkProcurement; date: string }

type ATF = {
  request_id: string
  atf_code: string | null
  plate_number: string
  driver_name: string
  officer_name: string
  company_name: string
  litres: number
  atf_status: string
  requested_at: string
  rate_per_litre: number | null
  total_amount: number | null
}

type TruckAdmin = {
  admin_id: string
  full_name: string
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

const statusColor = (status: string) => {
  switch (status) {
    case "Pending": return { bg: "#fff8e1", color: "#f5a623", border: "#fde68a" }
    case "Validated": return { bg: "#f0fff4", color: "#16a34a", border: "#86efac" }
    case "Rejected": return { bg: "#fef2f2", color: "#ef4444", border: "#fecaca" }
    default: return { bg: "#f8fafc", color: "#64748b", border: "#e2e8f0" }
  }
}

const atfStatusColor = (status: string) => {
  switch (status) {
    case "Pending": return { bg: "#fff8e1", color: "#f5a623", border: "#fde68a" }
    case "Authorised": return { bg: "#f0f7ff", color: "#0070f3", border: "#bfdbfe" }
    case "Dispensed": return { bg: "#f0f7ff", color: "#0070f3", border: "#bfdbfe" }
    case "Confirmed": return { bg: "#f0fff4", color: "#16a34a", border: "#86efac" }
    case "Invalidated": return { bg: "#fef2f2", color: "#ef4444", border: "#fecaca" }
    default: return { bg: "#f8fafc", color: "#64748b", border: "#e2e8f0" }
  }
}

const filterColor = (filter: string, activeFilter: string) => {
  if (filter === "All") return { bg: activeFilter === "All" ? "rgba(0, 112, 243, 0.1)" : "white", color: activeFilter === "All" ? "#0070f3" : "#64748b", border: activeFilter === "All" ? "#0070f3" : "#e2e8f0" }
  if (filter === "Pending") return { bg: activeFilter === "Pending" ? "rgba(245, 166, 35, 0.1)" : "white", color: activeFilter === "Pending" ? "#f5a623" : "#64748b", border: activeFilter === "Pending" ? "#f5a623" : "#e2e8f0" }
  if (filter === "Validated") return { bg: activeFilter === "Validated" ? "rgba(22, 163, 74, 0.1)" : "white", color: activeFilter === "Validated" ? "#16a34a" : "#64748b", border: activeFilter === "Validated" ? "#16a34a" : "#e2e8f0" }
  if (filter === "Rejected") return { bg: activeFilter === "Rejected" ? "rgba(239, 68, 68, 0.1)" : "white", color: activeFilter === "Rejected" ? "#ef4444" : "#64748b", border: activeFilter === "Rejected" ? "#ef4444" : "#e2e8f0" }
  if (filter === "Bulk Procurement") return { bg: activeFilter === "Bulk Procurement" ? "rgba(124, 58, 237, 0.1)" : "white", color: activeFilter === "Bulk Procurement" ? "#7c3aed" : "#64748b", border: activeFilter === "Bulk Procurement" ? "#7c3aed" : "#e2e8f0" }
  return { bg: "white", color: "#64748b", border: "#e2e8f0" }
}

const atfFilterColor = (filter: string, activeFilter: string) => {
  if (filter === "All") return { bg: activeFilter === "All" ? "rgba(0, 112, 243, 0.1)" : "white", color: activeFilter === "All" ? "#0070f3" : "#64748b", border: activeFilter === "All" ? "#0070f3" : "#e2e8f0" }
  if (filter === "Pending") return { bg: activeFilter === "Pending" ? "rgba(245, 166, 35, 0.1)" : "white", color: activeFilter === "Pending" ? "#f5a623" : "#64748b", border: activeFilter === "Pending" ? "#f5a623" : "#e2e8f0" }
  if (filter === "Authorised" || filter === "Dispensed") return { bg: activeFilter === filter ? "rgba(0, 112, 243, 0.1)" : "white", color: activeFilter === filter ? "#0070f3" : "#64748b", border: activeFilter === filter ? "#0070f3" : "#e2e8f0" }
  if (filter === "Confirmed") return { bg: activeFilter === "Confirmed" ? "rgba(22, 163, 74, 0.1)" : "white", color: activeFilter === "Confirmed" ? "#16a34a" : "#64748b", border: activeFilter === "Confirmed" ? "#16a34a" : "#e2e8f0" }
  if (filter === "Invalidated") return { bg: activeFilter === "Invalidated" ? "rgba(239, 68, 68, 0.1)" : "white", color: activeFilter === "Invalidated" ? "#ef4444" : "#64748b", border: activeFilter === "Invalidated" ? "#ef4444" : "#e2e8f0" }
  return { bg: "white", color: "#64748b", border: "#e2e8f0" }
}

function generateATFCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let code = "ATF-"
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

export default function TruckAdminDashboard() {
  const router = useRouter()
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"

  const fileInputRef = useRef<HTMLInputElement>(null)

  const [admin, setAdmin] = useState<TruckAdmin | null>(null)
  const [reports, setReports] = useState<MaintenanceReport[]>([])
  const [procurements, setProcurements] = useState<BulkProcurement[]>([])
  const [maintenanceBalance, setMaintenanceBalance] = useState<number | null>(null)
  const [atfs, setAtfs] = useState<ATF[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [tab, setTab] = useState<"reports" | "procurement" | "balance" | "atf">("reports")
  const [filter, setFilter] = useState("All")
  const [atfFilter, setAtfFilter] = useState("All")

  const [showPictureModal, setShowPictureModal] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [picturePreview, setPicturePreview] = useState<string | null>(null)
  const [pictureLoading, setPictureLoading] = useState(false)
  const [pictureError, setPictureError] = useState("")

  const [validating, setValidating] = useState<MaintenanceReport | null>(null)
  const [validateLoading, setValidateLoading] = useState(false)
  const [rejecting, setRejecting] = useState<MaintenanceReport | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [rejectError, setRejectError] = useState("")
  const [rejectLoading, setRejectLoading] = useState(false)

  const [authorisingATF, setAuthorisingATF] = useState<ATF | null>(null)
  const [authoriseLoading, setAuthoriseLoading] = useState(false)

  const [procItem, setProcItem] = useState("")
  const [procTotal, setProcTotal] = useState("")
  const [procNotes, setProcNotes] = useState("")
  const [procError, setProcError] = useState("")
  const [procLoading, setProcLoading] = useState(false)

  const [depositAmount, setDepositAmount] = useState("")
  const [depositNote, setDepositNote] = useState("")
  const [depositError, setDepositError] = useState("")
  const [depositLoading, setDepositLoading] = useState(false)

  const maintenanceFilters = ["All", "Pending", "Validated", "Rejected", "Bulk Procurement"]
  const atfFilters = ["All", "Pending", "Authorised", "Dispensed", "Confirmed", "Invalidated"]

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
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
      if (profile?.role !== "TruckAdmin") { router.push("/login"); return }

      const { data: adm } = await supabase.from("truck_admins").select("admin_id, full_name, profile_picture_url").eq("admin_id", user.id).single()
      if (!adm) { router.push("/login"); return }

      setAdmin(adm)

      await Promise.all([fetchReports(), fetchProcurements(), fetchMaintenanceBalance(), fetchATFs()])
      setLoading(false)
    }
    init()
  }, [])

  useEffect(() => {
    if (!admin) return
    const interval = setInterval(() => {
      fetchReports(); fetchProcurements(); fetchMaintenanceBalance(); fetchATFs()
    }, 30000)
    return () => clearInterval(interval)
  }, [admin])

  async function fetchMaintenanceBalance() {
    const { data } = await supabase.from("maintenance_balance").select("current_balance").eq("id", 1).single()
    if (data) setMaintenanceBalance(data.current_balance)
  }

  async function fetchReports() {
    const { data: raw } = await supabase
      .from("maintenance_reports")
      .select("report_id, plate_number, manager_id, maintenance_type, maintenance_location, amount, notes, status, rejection_reason, reported_at")
      .order("reported_at", { ascending: false })
    if (!raw) return

    const enriched = await Promise.all(raw.map(async r => {
      const { data: manager } = await supabase.from("truck_officers").select("full_name").eq("manager_id", r.manager_id).single()
      return { ...r, manager_name: manager?.full_name ?? "Unknown", maintenance_location: r.maintenance_location ?? null }
    }))
    setReports(enriched)
    setLastUpdated(new Date())
  }

  async function fetchProcurements() {
    const { data: raw } = await supabase.from("bulk_procurement").select("procurement_id, item_name, total_amount, notes, logged_at").order("logged_at", { ascending: false })
    if (!raw) return
    const enriched = await Promise.all(raw.map(async p => {
      const { data: dists } = await supabase.from("procurement_distributions").select("plate_number, amount_allocated").eq("procurement_id", p.procurement_id)
      return { ...p, distributions: dists || [] }
    }))
    setProcurements(enriched)
  }

  async function fetchATFs() {
    const { data: raw } = await supabase
      .from("fuel_requests")
      .select("request_id, atf_code, plate_number, driver_id, company_id, litres, atf_status, requested_at, rate_per_litre, total_amount, initiated_by")
      .order("requested_at", { ascending: false })
    if (!raw) return

    const enriched = await Promise.all(raw.map(async r => {
      const { data: driver } = await supabase.from("Drivers").select("full_name").eq("driver_id", r.driver_id).single()
      const { data: officer } = await supabase.from("truck_officers").select("full_name").eq("manager_id", r.initiated_by).single()
      const { data: company } = await supabase.from("fuel_companies").select("company_name").eq("company_id", r.company_id).single()
      return {
        ...r,
        driver_name: driver?.full_name ?? "Unknown",
        officer_name: officer?.full_name ?? "Unknown",
        company_name: company?.company_name ?? "Unknown",
      }
    }))
    setAtfs(enriched)
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
    if (!selectedFile || !admin) {
      setPictureError("Please select an image")
      return
    }

    setPictureLoading(true)
    setPictureError("")

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setPictureError("Session expired"); setPictureLoading(false); return }

      const fileExt = selectedFile.name.split(".").pop()
      const fileName = `${admin.admin_id}-${Date.now()}.${fileExt}`
      const filePath = `${admin.admin_id}/${fileName}`

      if (admin.profile_picture_url) {
        const oldPath = admin.profile_picture_url.split("/").slice(-2).join("/")
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
        .from("truck_admins")
        .update({ profile_picture_url: publicUrl })
        .eq("admin_id", admin.admin_id)

      if (updateError) { setPictureError("Failed to save profile"); setPictureLoading(false); return }

      setAdmin({ ...admin, profile_picture_url: publicUrl })

      setPictureLoading(false)
      setShowPictureModal(false)
      setSelectedFile(null)
      setPicturePreview(null)
    } catch (err) {
      setPictureError("Something went wrong")
      setPictureLoading(false)
    }
  }

  async function handleValidate() {
    if (!validating) return
    setValidateLoading(true)
    await supabase.from("maintenance_reports").update({ status: "Validated", validated_at: new Date().toISOString(), validated_by: admin?.admin_id }).eq("report_id", validating.report_id)
    const newBalance = Math.max(0, (maintenanceBalance ?? 0) - validating.amount)
    await supabase.from("maintenance_balance").update({ current_balance: newBalance, updated_at: new Date().toISOString() }).eq("id", 1)
    setMaintenanceBalance(newBalance)
    setValidateLoading(false)
    setValidating(null)
    fetchReports()
  }

  async function handleReject() {
    if (!rejecting) return
    if (!rejectReason.trim()) return setRejectError("Please provide a reason")
    setRejectLoading(true)
    await supabase.from("maintenance_reports").update({ status: "Rejected", rejection_reason: rejectReason.trim() }).eq("report_id", rejecting.report_id)
    setRejectLoading(false); setRejecting(null); setRejectReason(""); setRejectError("")
    fetchReports()
  }

  async function handleAuthoriseATF() {
    if (!authorisingATF) return
    setAuthoriseLoading(true)

    let code = generateATFCode()
    let attempts = 0
    while (attempts < 10) {
      const { data: existing } = await supabase.from("fuel_requests").select("request_id").eq("atf_code", code).single()
      if (!existing) break
      code = generateATFCode()
      attempts++
    }

    const { error } = await supabase
      .from("fuel_requests")
      .update({ atf_status: "Authorised", atf_code: code, authorised_by: admin?.admin_id })
      .eq("request_id", authorisingATF.request_id)

    setAuthoriseLoading(false)
    if (error) return
    setAuthorisingATF(null)
    fetchATFs()
  }

  async function handleDeposit() {
    const amount = parseAmount(depositAmount)
    if (!depositAmount || amount <= 0) return setDepositError("Enter a valid amount")
    setDepositLoading(true)
    const { error } = await supabase.from("maintenance_deposits").insert([{ amount, note: depositNote.trim() || null, deposited_by: admin?.admin_id }])
    if (error) { setDepositError("Failed to log deposit"); setDepositLoading(false); return }
    const newBalance = (maintenanceBalance ?? 0) + amount
    await supabase.from("maintenance_balance").update({ current_balance: newBalance, updated_at: new Date().toISOString() }).eq("id", 1)
    setMaintenanceBalance(newBalance)
    setDepositLoading(false); setDepositAmount(""); setDepositNote(""); setDepositError("")
  }

  async function handleLogProcurement() {
    if (!procItem.trim()) return setProcError("Enter item name")
    const totalNum = parseAmount(procTotal)
    if (!procTotal || totalNum <= 0) return setProcError("Enter a valid total amount")
    setProcLoading(true)
    const { data: procurement, error } = await supabase.from("bulk_procurement").insert([{ item_name: procItem.trim(), total_amount: totalNum, notes: procNotes.trim() || null, logged_by: admin?.admin_id }]).select().single()
    setProcLoading(false)
    if (error || !procurement) { setProcError("Failed to log procurement"); return }
    
    const newBalance = Math.max(0, (maintenanceBalance ?? 0) - totalNum)
    await supabase.from("maintenance_balance").update({ current_balance: newBalance, updated_at: new Date().toISOString() }).eq("id", 1)
    setMaintenanceBalance(newBalance)
    
    setProcItem(""); setProcTotal(""); setProcNotes(""); setProcError("")
    await fetchProcurements()
    setTab("reports"); setFilter("Bulk Procurement")
  }

  const feedItems: FeedItem[] = [
    ...reports.map(r => ({ kind: "report" as const, data: r, date: r.reported_at })),
    ...procurements.map(p => ({ kind: "procurement" as const, data: p, date: p.logged_at })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const filteredFeed = filter === "All" ? feedItems
    : filter === "Bulk Procurement" ? feedItems.filter(f => f.kind === "procurement")
    : feedItems.filter(f => f.kind === "report" && (f.data as MaintenanceReport).status === filter)

  const filteredATFs = atfFilter === "All" ? atfs : atfs.filter(a => a.atf_status === atfFilter)

  const chevron = (
    <Icon icon="mdi:chevron-down" width={18} color="#aaa"
      style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
    />
  )

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", paddingRight: 36,
    boxSizing: "border-box", borderRadius: 8,
    border: "1px solid #e2e8f0", fontSize: fontSize.base,
    background: "white", color: "#0f172a", minHeight: 48,
  }

  const labelStyle: React.CSSProperties = {
    fontWeight: 600, display: "block",
    marginBottom: 6, fontSize: fontSize.sm, color: "#475569"
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
                background: admin?.profile_picture_url ? "transparent" : "#f0f7ff",
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
              {admin?.profile_picture_url ? (
                <img src={admin.profile_picture_url} alt={admin.full_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ fontSize: isMobile ? 20 : 24, fontWeight: 700, color: "#0070f3" }}>
                  {admin?.full_name.charAt(0).toUpperCase()}
                </span>
              )}
              <div style={{ position: "absolute", inset: 0, background: "rgba(0, 0, 0, 0.4)", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0, transition: "opacity 0.2s" }} onMouseEnter={e => e.currentTarget.style.opacity = "1"} onMouseLeave={e => e.currentTarget.style.opacity = "0"}>
                <Icon icon="mdi:camera" width={20} height={20} color="white" />
              </div>
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: isMobile ? fontSize.lg : fontSize.xl, fontWeight: 700, color: "#0070f3" }}>
                {admin?.full_name}
              </h1>
              <p style={{ margin: "2px 0 0", fontSize: fontSize.sm, color: "#64748b" }}>Truck Admin</p>
            </div>
          </div>
          <button onClick={async () => { await supabase.auth.signOut(); router.push("/login") }} style={{ padding: "8px 16px", background: "rgba(239, 68, 68, 0.05)", color: "#ef4444", border: "1.5px solid #fecaca", borderRadius: 8, cursor: "pointer", fontSize: fontSize.sm, minHeight: 40, fontWeight: 600, transition: "all 0.2s" }} onMouseEnter={e => { e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)"; e.currentTarget.style.borderColor = "#fca5a5" }} onMouseLeave={e => { e.currentTarget.style.background = "rgba(239, 68, 68, 0.05)"; e.currentTarget.style.borderColor = "#fecaca" }}>
            Logout
          </button>
        </div>
      </div>

      <div style={{ padding: isMobile ? "16px" : "32px", maxWidth: 1200, margin: "0 auto" }}>

        {/* Balance Card */}
        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: isMobile ? 16 : 24, marginBottom: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <p style={{ margin: "0 0 8px 0", fontWeight: 600, fontSize: fontSize.sm, color: "#94a3b8", letterSpacing: 0.5 }}>Maintenance Balance</p>
          <p style={{ margin: 0, fontSize: isMobile ? fontSize["2xl"] : fontSize.xl, fontWeight: 700, color: "#0070f3" }}>
            ₦{maintenanceBalance !== null ? maintenanceBalance.toLocaleString() : "—"}
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
          {[
            { key: "reports", label: "Maintenance", icon: "mdi:wrench" },
            { key: "atf", label: "ATF", icon: "mdi:gas-station" },
            { key: "procurement", label: "Procurement", icon: "mdi:package" },
            { key: "balance", label: "Top Up", icon: "mdi:plus-circle" },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)} style={{ padding: "8px 16px", borderRadius: 8, fontSize: fontSize.sm, cursor: "pointer", border: `1.5px solid ${tab === t.key ? "" : "#e2e8f0"}`, background: tab === t.key ? "#171717" : "white", color: tab === t.key ? "white" : "#64748b", fontWeight: tab === t.key ? 600 : 500, transition: "all 0.2s", display: "flex", alignItems: "center", gap: 6, minHeight: 40 }} onMouseEnter={e => { if (tab !== t.key) { e.currentTarget.style.borderColor = "#cbd5e1"; e.currentTarget.style.background = "#f8fafc" } }} onMouseLeave={e => { if (tab !== t.key) { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.background = "white" } }}>
              <Icon icon={t.icon} width={16} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Reports Tab */}
        {tab === "reports" && (
          <div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
              {maintenanceFilters.map(f => {
                const { bg, color, border } = filterColor(f, filter)
                return (
                  <button key={f} onClick={() => setFilter(f)} style={{ padding: "6px 14px", borderRadius: 20, fontSize: fontSize.xs, cursor: "pointer", border: `1.5px solid ${border}`, background: bg, color, fontWeight: filter === f ? 600 : 500, transition: "all 0.2s", minHeight: 40 }} onMouseEnter={e => { if (filter !== f) { e.currentTarget.style.borderColor = "#cbd5e1" } }} onMouseLeave={e => { if (filter !== f) { e.currentTarget.style.borderColor = border } }}>
                    {f}
                  </button>
                )
              })}
              <div style={{ flex: 1 }} />
              {lastUpdated && <span style={{ fontSize: fontSize.xs, color: "#94a3b8" }}>Updated {lastUpdated.toLocaleTimeString()}</span>}
              <button onClick={() => { fetchReports(); fetchProcurements() }} style={{ padding: "6px 12px", fontSize: fontSize.xs, cursor: "pointer", borderRadius: 8, border: "1px solid #e2e8f0", background: "white", color: "#64748b", transition: "all 0.2s", fontWeight: 600 }} onMouseEnter={e => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1" }} onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#e2e8f0" }}>
                ↻
              </button>
            </div>

            {filteredFeed.length === 0 && <p style={{ color: "#64748b", fontSize: fontSize.base }}>No entries.</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {filteredFeed.map(item => {
                if (item.kind === "procurement") {
                  const p = item.data as BulkProcurement
                  return (
                    <div key={p.procurement_id} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", transition: "all 0.2s" }} onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)"; e.currentTarget.style.borderColor = "#cbd5e1" }} onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)"; e.currentTarget.style.borderColor = "#e2e8f0" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                        <div>
                          <p style={{ margin: 0, fontWeight: 700, fontSize: fontSize.lg, color: "#0f172a" }}>{p.item_name}</p>
                          <p style={{ margin: "4px 0 0", fontSize: fontSize.xs, color: "#94a3b8" }}>{new Date(p.logged_at).toLocaleString()}</p>
                        </div>
                        <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: fontSize.xs, background: "rgba(124, 58, 237, 0.1)", color: "#7c3aed", fontWeight: 700, border: "1px solid #7c3aed33" }}>Bulk Procurement</span>
                      </div>
                      <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px", marginBottom: 8, border: "1px solid #e2e8f0" }}>
                        <p style={{ margin: 0, fontSize: fontSize.xs, color: "#94a3b8" }}>Total Amount</p>
                        <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#0070f3", fontSize: fontSize.base }}>₦{p.total_amount.toLocaleString()}</p>
                      </div>
                      {p.notes && <p style={{ margin: 0, fontSize: fontSize.sm, color: "#64748b" }}><strong>Notes:</strong> {p.notes}</p>}
                    </div>
                  )
                }
                const r = item.data as MaintenanceReport
                const { bg, color, border } = statusColor(r.status)
                return (
                  <div key={r.report_id} style={{ background: "white", border: `1px solid ${border}`, borderRadius: 12, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", transition: "all 0.2s" }} onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)"; e.currentTarget.style.borderColor = "#cbd5e1" }} onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)"; e.currentTarget.style.borderColor = border }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <div>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: fontSize.lg, color: "#0f172a" }}>{r.plate_number}</p>
                        <p style={{ margin: "4px 0 0", fontSize: fontSize.sm, color: "#64748b" }}>{r.maintenance_type}</p>
                        {r.maintenance_location && <p style={{ margin: "4px 0 0", fontSize: fontSize.xs, color: "#94a3b8" }}>📍 {r.maintenance_location}</p>}
                        <p style={{ margin: "4px 0 0", fontSize: fontSize.xs, color: "#94a3b8" }}>By {r.manager_name}</p>
                      </div>
                      <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: fontSize.xs, background: bg, color, fontWeight: 700, whiteSpace: "nowrap", border: `1px solid ${color}33` }}>{r.status}</span>
                    </div>
                    <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px", marginBottom: 12, border: "1px solid #e2e8f0" }}>
                      <p style={{ margin: 0, fontSize: fontSize.xs, color: "#94a3b8" }}>Amount</p>
                      <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#0070f3", fontSize: fontSize.base }}>₦{r.amount.toLocaleString()}</p>
                    </div>
                    {r.notes && <p style={{ margin: "0 0 8px 0", fontSize: fontSize.sm, color: "#64748b" }}><strong>Notes:</strong> {r.notes}</p>}
                    {r.status === "Rejected" && r.rejection_reason && (
                      <div style={{ padding: "10px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, marginBottom: 12 }}>
                        <p style={{ margin: 0, fontSize: fontSize.sm, color: "#b91c1c", fontWeight: 600 }}>{r.rejection_reason}</p>
                      </div>
                    )}
                    {r.status === "Pending" && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <button onClick={() => setValidating(r)} style={{ padding: "10px 14px", background: "#16a34a", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: fontSize.sm, minHeight: 40, transition: "opacity 0.2s" }} onMouseEnter={e => e.currentTarget.style.opacity = "0.9"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                          Validate
                        </button>
                        <button onClick={() => { setRejecting(r); setRejectReason(""); setRejectError("") }} style={{ padding: "10px 14px", background: "white", color: "#ef4444", border: "1.5px solid #ef4444", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: fontSize.sm, minHeight: 40, transition: "all 0.2s" }} onMouseEnter={e => { e.currentTarget.style.background = "rgba(239, 68, 68, 0.05)"; e.currentTarget.style.borderColor = "#f87171" }} onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#ef4444" }}>
                          Reject
                        </button>
                      </div>
                    )}
                    <p style={{ margin: "8px 0 0", fontSize: fontSize.xs, color: "#94a3b8" }}>{new Date(r.reported_at).toLocaleString()}</p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ATF Tab */}
        {tab === "atf" && (
          <div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
              {atfFilters.map(f => {
                const { bg, color, border } = atfFilterColor(f, atfFilter)
                return (
                  <button key={f} onClick={() => setAtfFilter(f)} style={{ padding: "6px 14px", borderRadius: 20, fontSize: fontSize.xs, cursor: "pointer", border: `1.5px solid ${border}`, background: bg, color, fontWeight: atfFilter === f ? 600 : 500, transition: "all 0.2s", minHeight: 40 }} onMouseEnter={e => { if (atfFilter !== f) { e.currentTarget.style.borderColor = "#cbd5e1" } }} onMouseLeave={e => { if (atfFilter !== f) { e.currentTarget.style.borderColor = border } }}>
                    {f}
                  </button>
                )
              })}
              <div style={{ flex: 1 }} />
              <button onClick={fetchATFs} style={{ padding: "6px 12px", fontSize: fontSize.xs, cursor: "pointer", borderRadius: 8, border: "1px solid #e2e8f0", background: "white", color: "#64748b", transition: "all 0.2s", fontWeight: 600 }} onMouseEnter={e => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1" }} onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#e2e8f0" }}>
                ↻
              </button>
            </div>

            {filteredATFs.length === 0 && <p style={{ color: "#64748b", fontSize: fontSize.base }}>No ATFs found.</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {filteredATFs.map(atf => {
                const { bg, color, border } = atfStatusColor(atf.atf_status)
                return (
                  <div key={atf.request_id} style={{ background: "white", border: `1px solid ${border}`, borderRadius: 12, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", transition: "all 0.2s" }} onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)"; e.currentTarget.style.borderColor = "#cbd5e1" }} onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)"; e.currentTarget.style.borderColor = border }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <div>
                        {atf.atf_code ? <p style={{ margin: 0, fontWeight: 700, fontSize: fontSize.base, fontFamily: "monospace", letterSpacing: 1, color: "#0f172a" }}>{atf.atf_code}</p> : <p style={{ margin: 0, fontSize: fontSize.sm, color: "#94a3b8" }}>Awaiting authorisation</p>}
                        <p style={{ margin: "4px 0 0", fontSize: fontSize.sm, color: "#64748b" }}>{atf.plate_number} · {atf.driver_name}</p>
                        <p style={{ margin: "4px 0 0", fontSize: fontSize.xs, color: "#94a3b8" }}>Station: {atf.company_name}</p>
                        <p style={{ margin: "4px 0 0", fontSize: fontSize.xs, color: "#94a3b8" }}>Initiated by {atf.officer_name}</p>
                      </div>
                      <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: fontSize.xs, background: bg, color, fontWeight: 700, whiteSpace: "nowrap", border: `1px solid ${color}33` }}>{atf.atf_status}</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: atf.total_amount ? "1fr 1fr 1fr" : "1fr 1fr", gap: 10, marginBottom: 12 }}>
                      <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px", border: "1px solid #e2e8f0" }}>
                        <p style={{ margin: 0, fontSize: fontSize.xs, color: "#94a3b8" }}>Litres</p>
                        <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#0f172a", fontSize: fontSize.base }}>{atf.litres}L</p>
                      </div>
                      {atf.rate_per_litre && (
                        <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px", border: "1px solid #e2e8f0" }}>
                          <p style={{ margin: 0, fontSize: fontSize.xs, color: "#94a3b8" }}>Rate/L</p>
                          <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#0f172a", fontSize: fontSize.base }}>₦{atf.rate_per_litre.toLocaleString()}</p>
                        </div>
                      )}
                      {atf.total_amount && (
                        <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px", border: "1px solid #e2e8f0" }}>
                          <p style={{ margin: 0, fontSize: fontSize.xs, color: "#94a3b8" }}>Total</p>
                          <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#0070f3", fontSize: fontSize.base }}>₦{atf.total_amount.toLocaleString()}</p>
                        </div>
                      )}
                    </div>
                    {atf.atf_status === "Pending" && (
                      <button onClick={() => setAuthorisingATF(atf)} style={{ width: "100%", padding: "10px 14px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: fontSize.sm, minHeight: 40, transition: "opacity 0.2s" }} onMouseEnter={e => e.currentTarget.style.opacity = "0.9"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                        Authorise ATF
                      </button>
                    )}
                    <p style={{ margin: "8px 0 0", fontSize: fontSize.xs, color: "#94a3b8" }}>{new Date(atf.requested_at).toLocaleString()}</p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Procurement Tab */}
        {tab === "procurement" && (
          <div style={{ maxWidth: 600 }}>
            <h3 style={{ marginBottom: 20, color: "#0f172a", fontSize: fontSize.xl, fontWeight: 700 }}>Log Bulk Procurement</h3>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Item Name *</label>
              <input type="text" placeholder="e.g. Grease, Engine oil" value={procItem} onChange={e => { setProcItem(e.target.value); setProcError("") }} style={inputStyle} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Total Amount (₦) *</label>
              <input type="text" inputMode="numeric" placeholder="e.g. 150,000" value={procTotal} onChange={e => { setProcTotal(formatAmount(e.target.value)); setProcError("") }} style={inputStyle} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Notes (optional)</label>
              <textarea placeholder="Any additional details..." value={procNotes} onChange={e => setProcNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: "none", minHeight: 80, paddingRight: 12 }} />
            </div>
            {procError && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 16, color: "#b91c1c", fontSize: fontSize.sm, fontWeight: 600 }}>{procError}</div>}
            <button onClick={handleLogProcurement} disabled={procLoading} style={{ width: "100%", padding: "12px 16px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: procLoading ? "not-allowed" : "pointer", fontWeight: 700, fontSize: fontSize.md, minHeight: 48, opacity: procLoading ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {procLoading ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} /> Logging...</> : "Log Procurement"}
            </button>
          </div>
        )}

        {/* Balance Tab */}
        {tab === "balance" && (
          <div style={{ maxWidth: 600 }}>
            <h3 style={{ marginBottom: 20, color: "#0f172a", fontSize: fontSize.xl, fontWeight: 700 }}>Top Up maintenance balance</h3>
            <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20, marginBottom: 24 }}>
              <p style={{ margin: "0 0 8px 0", fontWeight: 600, fontSize: fontSize.sm, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>current balance</p>
              <p style={{ margin: 0, fontSize: fontSize.xl, fontWeight: 700, color: "#0070f3" }}>₦{maintenanceBalance !== null ? maintenanceBalance.toLocaleString() : "—"}</p>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Amount to Add (₦) *</label>
              <input type="text" inputMode="numeric" placeholder="e.g. 500,000" value={depositAmount} onChange={e => { setDepositAmount(formatAmount(e.target.value)); setDepositError("") }} style={inputStyle} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Note (optional)</label>
              <input type="text" placeholder="e.g. Monthly allocation" value={depositNote} onChange={e => setDepositNote(e.target.value)} style={inputStyle} />
            </div>
            {depositError && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 16, color: "#b91c1c", fontSize: fontSize.sm, fontWeight: 600 }}>{depositError}</div>}
            <button onClick={handleDeposit} disabled={depositLoading} style={{ width: "100%", padding: "12px 16px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: depositLoading ? "not-allowed" : "pointer", fontWeight: 700, fontSize: fontSize.md, minHeight: 48, opacity: depositLoading ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {depositLoading ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} /> Adding...</> : "Add to Balance"}
            </button>
          </div>
        )}
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

      {/* Authorise ATF Modal */}
      {authorisingATF && (
        <div style={modalOverlay}>
          <div onClick={e => e.stopPropagation()} style={modalBox}>
            <h3 style={{ marginBottom: 12, color: "#0f172a", fontSize: fontSize.xl, fontWeight: 700 }}>Authorise ATF?</h3>
            <p style={{ color: "#64748b", fontSize: fontSize.sm, marginBottom: 20 }}>A unique ATF code will be generated and sent to the driver and station manager.</p>
            <div style={{ background: "#f8fafc", borderRadius: 8, padding: 16, marginBottom: 24, border: "1px solid #e2e8f0" }}>
              <p style={{ margin: "0 0 6px" }}><strong>Truck:</strong> {authorisingATF.plate_number}</p>
              <p style={{ margin: "0 0 6px" }}><strong>Driver:</strong> {authorisingATF.driver_name}</p>
              <p style={{ margin: "0 0 6px" }}><strong>Station:</strong> {authorisingATF.company_name}</p>
              <p style={{ margin: 0 }}><strong>Litres:</strong> {authorisingATF.litres}L</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => setAuthorisingATF(null)} style={{ padding: "12px 16px", background: "white", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: fontSize.md, minHeight: 44 }}>
                Cancel
              </button>
              <button onClick={handleAuthoriseATF} disabled={authoriseLoading} style={{ padding: "12px 16px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: authoriseLoading ? "not-allowed" : "pointer", fontWeight: 700, fontSize: fontSize.md, minHeight: 44, opacity: authoriseLoading ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {authoriseLoading ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} /> Authorising...</> : "Yes, Authorise"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Validate Modal */}
      {validating && (
        <div style={modalOverlay}>
          <div onClick={e => e.stopPropagation()} style={modalBox}>
            <h3 style={{ marginBottom: 12, color: "#0f172a", fontSize: fontSize.xl, fontWeight: 700 }}>Validate Report?</h3>
            <div style={{ background: "#f8fafc", borderRadius: 8, padding: 16, marginBottom: 16, border: "1px solid #e2e8f0" }}>
              <p style={{ margin: "0 0 8px" }}><strong>Truck:</strong> {validating.plate_number}</p>
              <p style={{ margin: "0 0 8px" }}><strong>Type:</strong> {validating.maintenance_type}</p>
              {validating.maintenance_location && <p style={{ margin: "0 0 8px" }}><strong>Location:</strong> {validating.maintenance_location}</p>}
              <p style={{ margin: "0 0 8px" }}><strong>Officer:</strong> {validating.manager_name}</p>
              <p style={{ margin: 0 }}><strong>Amount:</strong> <span style={{ color: "#0070f3", fontWeight: 700 }}>₦{validating.amount.toLocaleString()}</span></p>
            </div>
            <p style={{ fontSize: fontSize.sm, color: "#64748b", marginBottom: 24 }}>
              Balance after: <strong style={{ color: (maintenanceBalance ?? 0) - validating.amount < 0 ? "#ef4444" : "#0f172a" }}>₦{Math.max(0, (maintenanceBalance ?? 0) - validating.amount).toLocaleString()}</strong>
              {(maintenanceBalance ?? 0) - validating.amount < 0 && <span style={{ color: "#ef4444", marginLeft: 8 }}>⚠️ Insufficient</span>}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => setValidating(null)} style={{ padding: "12px 16px", background: "white", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: fontSize.md, minHeight: 44 }}>
                Cancel
              </button>
              <button onClick={handleValidate} disabled={validateLoading} style={{ padding: "12px 16px", background: "#16a34a", color: "white", border: "none", borderRadius: 8, cursor: validateLoading ? "not-allowed" : "pointer", fontWeight: 700, fontSize: fontSize.md, minHeight: 44, opacity: validateLoading ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {validateLoading ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} /> Validating...</> : "Yes, Validate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejecting && (
        <div style={modalOverlay}>
          <div onClick={e => e.stopPropagation()} style={modalBox}>
            <h3 style={{ marginBottom: 12, color: "#0f172a", fontSize: fontSize.xl, fontWeight: 700 }}>Reject Report</h3>
            <p style={{ color: "#64748b", marginBottom: 16, fontSize: fontSize.sm }}><strong>{rejecting.plate_number}</strong> — {rejecting.maintenance_type}</p>
            <label style={labelStyle}>Reason *</label>
            <textarea value={rejectReason} onChange={e => { setRejectReason(e.target.value); setRejectError("") }} placeholder="e.g. Amount seems incorrect" rows={3} style={{ width: "100%", padding: "10px 12px", boxSizing: "border-box", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: fontSize.base, resize: "none", marginBottom: 8, background: "white", color: "#0f172a", minHeight: 80 }} />
            {rejectError && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 16, color: "#b91c1c", fontSize: fontSize.sm, fontWeight: 600 }}>{rejectError}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => setRejecting(null)} style={{ padding: "12px 16px", background: "white", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: fontSize.md, minHeight: 44 }}>
                Cancel
              </button>
              <button onClick={handleReject} disabled={rejectLoading} style={{ padding: "12px 16px", background: "#ef4444", color: "white", border: "none", borderRadius: 8, cursor: rejectLoading ? "not-allowed" : "pointer", fontWeight: 700, fontSize: fontSize.md, minHeight: 44, opacity: rejectLoading ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {rejectLoading ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} /> Rejecting...</> : "Confirm Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}