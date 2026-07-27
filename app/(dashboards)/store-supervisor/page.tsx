"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { apiMutate } from "@/lib/api-mutation"
import RoleSwitcher from "@/components/RoleSwitcher"
import ReportModal from "@/components/ReportModal"
import ProfilePictureUpload from "@/components/ProfilePictureUpload"
import { FONT_SIZE, POLLING_INTERVAL } from "@/lib/constants"
import { useBreakpoint } from "@/app/hooks/useBreakpoint"
import { requireDashboardRole } from "@/lib/auth-helpers"
import { Role } from "@/lib/roles"
import { formatDateTime, formatTime } from "@/lib/date-utils"
import { useStops } from "@/lib/hooks/useStops"
import { Icon } from "@iconify/react"

type Supervisor = {
  supervisor_id: string
  full_name: string
  store_names: string[]
  profile_picture_url?: string
}

type StockBalance = { product: string; balance: number }

type VerificationRow = {
  product: string
  system_balance: number
  physical_count: string
  notes: string
}

type PastVerification = {
  verification_id: string
  verification_session_id: string
  product: string
  system_balance: number
  physical_count: number
  discrepancy: number
  notes: string | null
  verified_at: string
}

type Sale = {
  sale_id: string
  product: string
  quantity: number
  price_per_bag: number | null
  total_amount: number | null
  customer_name: string | null
  payment_mode: string
  delivery_mode: string
  tricycle_id: string | null
  truck_plate: string | null
  sold_at: string
  created_at: string
  broker_id: string | null
  status: string
  officer_id: string
}

type GroupedSale = {
  group_id: string
  customer_name: string | null
  payment_mode: string
  delivery_mode: string
  sold_at: string
  broker_id: string | null
  status: string
  lines: Sale[]
}

const PAYMENT_MODES = ["Cash", "Transfer", "POS", "Broker"]

export default function StoreSupervisorDashboard() {
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"
  const router = useRouter()

  const [supervisor, setSupervisor] = useState<Supervisor | null>(null)
  const [selectedStore, setSelectedStore] = useState("")
  const [stock, setStock] = useState<StockBalance[]>([])
  const [loading, setLoading] = useState(true)
  const [noStoresAssigned, setNoStoresAssigned] = useState(false)
  const [tab, setTab] = useState<"verify" | "supplies" | "sales" | "history">("verify")
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [showReportModal, setShowReportModal] = useState(false)
  const [showPictureModal, setShowPictureModal] = useState(false)

  // Verification state
  const [verificationRows, setVerificationRows] = useState<VerificationRow[]>([])
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [verifyError, setVerifyError] = useState("")
  const [verifySuccess, setVerifySuccess] = useState(false)

  // Past verifications
  const [pastVerifications, setPastVerifications] = useState<PastVerification[]>([])
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  // Sales state
  const [sales, setSales] = useState<Sale[]>([])
  const [salesPage, setSalesPage] = useState(1)
  const [salesPaymentFilter, setSalesPaymentFilter] = useState("")
  const [salesSortByAdded, setSalesSortByAdded] = useState(false)
  const PAGE_SIZE = 50

  // Stops (supplies) - read-only
  const [stopsFilter, setStopsFilter] = useState<{ store_name: string; pending: boolean } | null>(null)
  const { data: stopsFromHook, refetch: refetchStops } = useStops(stopsFilter ?? undefined)
  const [confirmedStops, setConfirmedStops] = useState<any[]>([])
  const [stopsPage, setStopsPage] = useState(1)

  // Profile picture
  const [profilePicUrl, setProfilePicUrl] = useState<string | undefined>()

  // Initialize
  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push("/login"); return }

      const hasRole = await requireDashboardRole(session.user.id, Role.StoreSupervisor)
      if (!hasRole) { router.push("/login"); return }

      const { data: profile } = await supabase.from("Profiles").select("full_name, profile_picture_url").eq("user_id", session.user.id).single()
      const { data: sup } = await supabase.from("store_supervisors").select("supervisor_id, full_name, store_names, profile_picture_url").eq("supervisor_id", session.user.id).single()

      const name = sup?.full_name || profile?.full_name || ""
      const picUrl = sup?.profile_picture_url || profile?.profile_picture_url
      const stores = sup?.store_names || []

      setSupervisor({
        supervisor_id: session.user.id,
        full_name: name,
        store_names: stores,
        profile_picture_url: picUrl,
      })
      setProfilePicUrl(picUrl)

      if (stores.length > 0) {
        setSelectedStore(stores[0])
      } else {
        setNoStoresAssigned(true)
      }

      setLoading(false)
    }
    init()
  }, [router])

  // Fetch data when store changes
  useEffect(() => {
    if (!selectedStore) return
    fetchStock(selectedStore)
    fetchSales(selectedStore)
    fetchPastVerifications(selectedStore)
    setStopsFilter({ store_name: selectedStore, pending: false })
    setExpandedGroups(new Set())
    setLastUpdated(new Date())
  }, [selectedStore])

  // Polling
  useEffect(() => {
    if (!selectedStore) return
    const interval = setInterval(() => {
      fetchStock(selectedStore)
      fetchSales(selectedStore)
      fetchPastVerifications(selectedStore)
      refetchStops()
      setLastUpdated(new Date())
    }, POLLING_INTERVAL)
    return () => clearInterval(interval)
  }, [selectedStore, refetchStops])

  // Confirmed stops
  useEffect(() => {
    if (stopsFromHook) {
      const confirmed = (stopsFromHook as any[]).filter((s: any) => s.confirmed && !s.disputed)
      setConfirmedStops(confirmed)
    }
  }, [stopsFromHook])

  // Initialize verification rows when stock loads
  useEffect(() => {
    if (stock.length > 0 && verificationRows.length === 0) {
      setVerificationRows(stock.map(s => ({
        product: s.product,
        system_balance: s.balance,
        physical_count: "",
        notes: "",
      })))
    }
  }, [stock])

  async function fetchStock(storeName: string) {
    const { data } = await supabase
      .from("store_stock")
      .select("product, balance")
      .eq("store_name", storeName)
      .order("product", { ascending: true })
    setStock(data || [])
  }

  async function fetchSales(storeName: string) {
    const { data } = await supabase
      .from("store_sales")
      .select("sale_id, product, quantity, price_per_bag, total_amount, customer_name, payment_mode, delivery_mode, tricycle_id, truck_plate, sold_at, created_at, broker_id, status, officer_id")
      .eq("store_name", storeName)
      .order("sold_at", { ascending: false })
    setSales(data || [])
  }

  async function fetchPastVerifications(storeName: string) {
    const { data } = await supabase
      .from("stock_verifications")
      .select("verification_id, verification_session_id, product, system_balance, physical_count, discrepancy, notes, verified_at")
      .eq("store_name", storeName)
      .order("verified_at", { ascending: false })
      .limit(100)
    setPastVerifications(data || [])
  }

  function updateVerificationRow(index: number, field: "physical_count" | "notes", value: string) {
    setVerificationRows(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r))
    setVerifyError("")
    setVerifySuccess(false)
  }

  async function handleSubmitVerification() {
    if (!supervisor) return

    const rowsToSubmit = verificationRows.filter(r => r.physical_count !== "")
    if (rowsToSubmit.length === 0) {
      setVerifyError("Enter physical count for at least one product")
      return
    }

    for (const row of rowsToSubmit) {
      const count = parseInt(row.physical_count)
      if (isNaN(count) || count < 0) {
        setVerifyError(`Invalid physical count for ${row.product}`)
        return
      }
    }

    setVerifyLoading(true)
    setVerifyError("")

    try {
      const sessionId = crypto.randomUUID()
      for (const row of rowsToSubmit) {
        const { error } = await apiMutate("finance", {
          action: "insert",
          table: "stock_verifications",
          data: {
            supervisor_id: supervisor.supervisor_id,
            store_name: selectedStore,
            product: row.product,
            system_balance: row.system_balance,
            physical_count: parseInt(row.physical_count),
            notes: row.notes || null,
            verification_session_id: sessionId,
          },
        })
        if (error) {
          setVerifyError(`Failed to save verification for ${row.product}: ${error}`)
          setVerifyLoading(false)
          return
        }
      }

      setVerifySuccess(true)
      setVerificationRows(stock.map(s => ({
        product: s.product,
        system_balance: s.balance,
        physical_count: "",
        notes: "",
      })))
      await fetchPastVerifications(selectedStore)
      setTimeout(() => setVerifySuccess(false), 3000)
    } catch {
      setVerifyError("Network error while saving verifications")
    } finally {
      setVerifyLoading(false)
    }
  }

  function getStatusColor(status: string) {
    if (status === "Pending") return "#d97706"
    if (status === "Confirmed") return "#16a34a"
    return "#dc2626"
  }

  // Group sales
  const groupedSales: GroupedSale[] = (() => {
    let filtered = sales
    if (salesPaymentFilter) {
      filtered = filtered.filter(s => s.payment_mode === salesPaymentFilter)
    }
    const sorted = [...filtered].sort((a, b) => {
      if (salesSortByAdded) return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      return new Date(b.sold_at).getTime() - new Date(a.sold_at).getTime()
    })

    const groups: GroupedSale[] = []
    for (const sale of sorted) {
      const key = `${sale.sold_at}_${sale.customer_name}_${sale.payment_mode}_${sale.delivery_mode}_${sale.broker_id}_${sale.status}`
      const existing = groups.find(g => g.group_id === key)
      if (existing) {
        existing.lines.push(sale)
      } else {
        groups.push({
          group_id: key,
          customer_name: sale.customer_name,
          payment_mode: sale.payment_mode,
          delivery_mode: sale.delivery_mode,
          sold_at: sale.sold_at,
          broker_id: sale.broker_id,
          status: sale.status,
          lines: [sale],
        })
      }
    }
    return groups
  })()

  // Group past verifications by session ID
  const groupedVerifications: { key: string; verified_at: string; items: PastVerification[] }[] = (() => {
    const sorted = [...pastVerifications].sort((a, b) => new Date(b.verified_at).getTime() - new Date(a.verified_at).getTime())
    const groups: { key: string; verified_at: string; items: PastVerification[] }[] = []
    for (const v of sorted) {
      const existing = groups.find(g => g.key === v.verification_session_id)
      if (existing) {
        existing.items.push(v)
      } else {
        groups.push({ key: v.verification_session_id, verified_at: v.verified_at, items: [v] })
      }
    }
    return groups
  })()

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', sans-serif" }}>
        <p style={{ color: "#94a3b8", fontSize: FONT_SIZE.base }}>Loading...</p>
      </div>
    )
  }

  if (noStoresAssigned) {
    return (
      <div style={{ minHeight: "100vh", background: "#f5f5f7", fontFamily: "'Inter', sans-serif" }}>
        <div style={{
          background: "linear-gradient(135deg, #0f0f1e 0%, #1a1a2e 100%)",
          padding: isMobile ? "16px" : "16px 32px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", gap: isMobile ? 12 : 16, justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 12 : 16 }}>
              <div style={{
                width: isMobile ? 40 : 48, height: isMobile ? 40 : 48, borderRadius: "50%",
                background: profilePicUrl ? "transparent" : "rgba(255,255,255,0.15)",
                border: "2px solid rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, overflow: "hidden",
              }}>
                {profilePicUrl ? (
                  <img src={profilePicUrl} alt={supervisor?.full_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ fontSize: isMobile ? 18 : 20, fontWeight: 700, color: "#fff" }}>{supervisor?.full_name.charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div>
                <h1 style={{ margin: 0, fontSize: isMobile ? FONT_SIZE.lg : FONT_SIZE.xl, fontWeight: 700, color: "#fff" }}>{supervisor?.full_name}</h1>
                <RoleSwitcher currentRole={Role.StoreSupervisor} style={{ margin: "2px 0 0", fontSize: FONT_SIZE.sm, color: "rgba(255,255,255,0.7)" }} />
              </div>
            </div>
            <button
              onClick={async () => { await supabase.auth.signOut(); router.push("/login") }}
              style={{
                padding: "8px 16px",
                background: "rgba(255, 85, 85, 0.2)",
                color: "#ff5555",
                border: "1.5px solid rgba(255, 85, 85, 0.3)",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: FONT_SIZE.sm,
                fontWeight: 600,
                minHeight: 40,
                whiteSpace: "nowrap",
                display: "flex",
                alignItems: "center",
                gap: 6,
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(255, 85, 85, 0.3)";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255, 85, 85, 0.5)"
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(255, 85, 85, 0.2)";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255, 85, 85, 0.3)"
              }}
            >
              <Icon icon="mdi:logout" width={16} />
              Logout
            </button>
          </div>
        </div>
        <div style={{ padding: isMobile ? "16px" : "32px", maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: isMobile ? 24 : 40, textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(245, 158, 11, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <Icon icon="mdi:store-alert" width={28} color="#f59e0b" />
            </div>
            <h2 style={{ margin: "0 0 8px", fontSize: FONT_SIZE.xl, fontWeight: 700, color: "#0f172a" }}>No Stores Assigned</h2>
            <p style={{ margin: "0 0 4px", fontSize: FONT_SIZE.base, color: "#64748b", lineHeight: 1.6 }}>
              You don&apos;t have any stores assigned to your account yet.
            </p>
            <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#94a3b8" }}>
              Contact your admin to assign stores to your profile.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f7", fontFamily: "'Inter', sans-serif" }}>
      {/* Profile Banner */}
      <div style={{
        background: "linear-gradient(135deg, #0f0f1e 0%, #1a1a2e 100%)",
        padding: isMobile ? "16px" : "16px 32px",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", gap: isMobile ? 12 : 16, justifyContent: "space-between", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 12 : 16 }}>
            <div style={{
              width: isMobile ? 40 : 48, height: isMobile ? 40 : 48, borderRadius: "50%",
              background: profilePicUrl ? "transparent" : "rgba(255,255,255,0.15)",
              border: "2px solid rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, overflow: "hidden", cursor: "pointer",
            }} onClick={() => setShowPictureModal(true)}>
              {profilePicUrl ? (
                <img src={profilePicUrl} alt={supervisor?.full_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ fontSize: isMobile ? 18 : 20, fontWeight: 700, color: "#fff" }}>{supervisor?.full_name.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: isMobile ? FONT_SIZE.lg : FONT_SIZE.xl, fontWeight: 700, color: "#fff" }}>{supervisor?.full_name}</h1>
              <RoleSwitcher currentRole={Role.StoreSupervisor} style={{ margin: "2px 0 0", fontSize: FONT_SIZE.sm, color: "rgba(255,255,255,0.7)" }} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Store Switcher */}
            {supervisor && supervisor.store_names.length > 1 && (
              <select
                value={selectedStore}
                onChange={e => { setSelectedStore(e.target.value); setVerificationRows([]); setVerifySuccess(false); setVerifyError("") }}
                style={{
                  padding: "8px 12px", borderRadius: 8, fontSize: FONT_SIZE.sm,
                  border: "1.5px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.1)",
                  color: "#fff", cursor: "pointer", appearance: "none",
                  backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
                  backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center", paddingRight: 30,
                }}
              >
                {supervisor.store_names.map(s => <option key={s} value={s} style={{ color: "#000", background: "#fff" }}>{s}</option>)}
              </select>
            )}
            <button onClick={() => setShowReportModal(true)} style={{ padding: "8px 14px", background: "rgba(245, 166, 35, 0.15)", color: "#f5a623", border: "1px solid rgba(245, 166, 35, 0.3)", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.sm, display: "flex", alignItems: "center", gap: 6, minHeight: 36, whiteSpace: "nowrap" }}>
              <Icon icon="mdi:alert-circle-outline" width={16} />
              {!isMobile && "Report"}
            </button>
            <button
              onClick={async () => { await supabase.auth.signOut(); router.push("/login") }}
              style={{
                padding: "8px 16px",
                background: "rgba(255, 85, 85, 0.2)",
                color: "#ff5555",
                border: "1.5px solid rgba(255, 85, 85, 0.3)",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: FONT_SIZE.sm,
                fontWeight: 600,
                minHeight: 40,
                whiteSpace: "nowrap",
                display: "flex",
                alignItems: "center",
                gap: 6,
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(255, 85, 85, 0.3)";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255, 85, 85, 0.5)"
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(255, 85, 85, 0.2)";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255, 85, 85, 0.3)"
              }}
            >
              <Icon icon="mdi:logout" width={16} />
              Logout
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding: isMobile ? "16px" : "32px", maxWidth: 1200, margin: "0 auto" }}>
        {/* Stock Summary */}
        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: isMobile ? 16 : 24, marginBottom: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              {selectedStore && (
                <p style={{ margin: "0 0 2px", fontSize: FONT_SIZE.xs, fontWeight: 600, color: "#0070f3", textTransform: "uppercase", letterSpacing: "0.5px" }}>{selectedStore}</p>
              )}
              <p style={{ margin: 0, fontWeight: 700, fontSize: FONT_SIZE.lg, color: "#0f172a" }}>Stock Balance</p>
            </div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: FONT_SIZE.lg, color: "#0f172a" }}>
              Total: <span style={{ color: "#0070f3" }}>{stock.reduce((sum, s) => sum + s.balance, 0).toLocaleString()}</span> <span style={{ fontSize: FONT_SIZE.sm, fontWeight: 500, color: "#64748b" }}>bags</span>
            </p>
          </div>
          {stock.length === 0 ? (
            <p style={{ color: "#64748b", fontSize: FONT_SIZE.base, margin: 0 }}>No stock recorded yet.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
              {stock.map(s => (
                <div key={s.product} style={{ background: "#f0f7ff", border: "1.5px solid #bfdbfe", borderRadius: 8, padding: "12px 14px" }}>
                  <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#64748b" }}>{s.product}</p>
                  <p style={{ margin: "6px 0 0", fontWeight: 700, fontSize: FONT_SIZE["2xl"], color: s.balance === 0 ? "#ef4444" : s.balance < 50 ? "#f5a623" : "#0070f3" }}>
                    {s.balance}<span style={{ fontSize: FONT_SIZE.xs, fontWeight: 500, color: "#64748b", marginLeft: 4 }}>bags</span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
          {([
            { key: "verify" as const, label: "Verify Stock" },
            { key: "supplies" as const, label: "Supplies" },
            { key: "sales" as const, label: "Sales" },
            { key: "history" as const, label: "Verification History" },
          ]).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: "8px 16px", borderRadius: 6, fontSize: FONT_SIZE.sm, cursor: "pointer",
                border: `1.5px solid ${tab === t.key ? "" : "#e2e8f0"}`,
                background: tab === t.key ? "#171717" : "white",
                color: tab === t.key ? "white" : "#64748b",
                fontWeight: tab === t.key ? 600 : 500, transition: "all 0.2s", minHeight: 40,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Verify Stock Tab */}
        {tab === "verify" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
              <div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: FONT_SIZE.lg, color: "#0f172a" }}>Stock Verification</p>
                <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.sm, color: "#64748b" }}>Enter physical counts after inspecting the store</p>
              </div>
              {lastUpdated && (
                <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Updated: {formatTime(lastUpdated)}</p>
              )}
            </div>

            {stock.length === 0 ? (
              <p style={{ color: "#64748b", fontSize: FONT_SIZE.base }}>No stock to verify.</p>
            ) : (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
                  {verificationRows.map((row, i) => {
                    const discrepancy = row.physical_count !== "" ? parseInt(row.physical_count) - row.system_balance : null
                    return (
                      <div key={row.product} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                          <div>
                            <p style={{ margin: 0, fontWeight: 700, fontSize: FONT_SIZE.lg, color: "#0f172a" }}>{row.product}</p>
                            <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.sm, color: "#64748b" }}>
                              System balance: <strong style={{ color: row.system_balance === 0 ? "#ef4444" : row.system_balance < 50 ? "#f5a623" : "#0070f3" }}>{row.system_balance}</strong> bags
                            </p>
                          </div>
                          {discrepancy !== null && discrepancy !== 0 && (
                            <span style={{
                              padding: "4px 10px", borderRadius: 6, fontSize: FONT_SIZE.xs, fontWeight: 700,
                              background: discrepancy > 0 ? "#ecfdf5" : "#fef2f2",
                              color: discrepancy > 0 ? "#16a34a" : "#dc2626",
                            }}>
                              {discrepancy > 0 ? "+" : ""}{discrepancy} bags
                            </span>
                          )}
                          {discrepancy !== null && discrepancy === 0 && (
                            <span style={{ padding: "4px 10px", borderRadius: 6, fontSize: FONT_SIZE.xs, fontWeight: 700, background: "#ecfdf5", color: "#16a34a" }}>
                              Matched
                            </span>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                          <div style={{ flex: 1, minWidth: 150 }}>
                            <label style={{ display: "block", fontSize: FONT_SIZE.xs, fontWeight: 600, color: "#475569", marginBottom: 4 }}>Physical Count *</label>
                            <input
                              type="number"
                              min="0"
                              placeholder="Enter count"
                              value={row.physical_count}
                              onChange={e => updateVerificationRow(i, "physical_count", e.target.value)}
                              onKeyDown={e => { if (e.key === "-" || e.key === "e") e.preventDefault() }}
                              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid #e5e5e5", fontSize: FONT_SIZE.base, boxSizing: "border-box", background: "#f9f9f9" }}
                            />
                          </div>
                          <div style={{ flex: 2, minWidth: 200 }}>
                            <label style={{ display: "block", fontSize: FONT_SIZE.xs, fontWeight: 600, color: "#475569", marginBottom: 4 }}>Notes (optional)</label>
                            <input
                              type="text"
                              placeholder="e.g. damaged bags, spilled"
                              value={row.notes}
                              onChange={e => updateVerificationRow(i, "notes", e.target.value)}
                              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid #e5e5e5", fontSize: FONT_SIZE.base, boxSizing: "border-box", background: "#f9f9f9" }}
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {verifyError && (
                  <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 16, color: "#b91c1c", fontSize: FONT_SIZE.sm }}>{verifyError}</div>
                )}
                {verifySuccess && (
                  <div style={{ padding: 12, background: "#ecfdf5", borderLeft: "4px solid #16a34a", borderRadius: 4, marginBottom: 16, color: "#166534", fontSize: FONT_SIZE.sm }}>Verification saved successfully.</div>
                )}

                <button
                  onClick={handleSubmitVerification}
                  disabled={verifyLoading || verificationRows.every(r => r.physical_count === "")}
                  style={{
                    width: "100%", padding: "14px 20px",
                    background: verifyLoading ? "#94a3b8" : "#0070f3",
                    color: "white", border: "none", borderRadius: 10,
                    fontSize: FONT_SIZE.md, fontWeight: 700, cursor: verifyLoading ? "not-allowed" : "pointer",
                    opacity: verifyLoading || verificationRows.every(r => r.physical_count === "") ? 0.6 : 1,
                    transition: "all 0.2s",
                  }}
                >
                  {verifyLoading ? "Saving..." : "Submit Verification"}
                </button>
              </>
            )}
          </div>
        )}

        {/* Supplies Tab (read-only) */}
        {tab === "supplies" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: FONT_SIZE.lg, color: "#0f172a" }}>Supply Records ({confirmedStops.length})</p>
              <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>
                {lastUpdated && `Updated: ${formatTime(lastUpdated)}`}
                <button onClick={refetchStops} style={{ padding: "6px 12px", fontSize: FONT_SIZE.xs, cursor: "pointer", borderRadius: 6, border: "1px solid #e2e8f0", background: "white", color: "#64748b" }}>Refresh</button>
              </div>
            </div>

            {confirmedStops.length === 0 && <p style={{ color: "#64748b", fontSize: FONT_SIZE.base }}>No supply records yet.</p>}

            {confirmedStops.length > PAGE_SIZE && (
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 16 }}>
                <button disabled={stopsPage <= 1} onClick={() => setStopsPage(p => Math.max(1, p - 1))} style={{ padding: "6px 14px", background: stopsPage <= 1 ? "#f0f0f0" : "white", border: "1px solid #e2e8f0", borderRadius: 8, cursor: stopsPage <= 1 ? "not-allowed" : "pointer", fontSize: FONT_SIZE.xs, color: stopsPage <= 1 ? "#ccc" : "#64748b" }}>← Previous</button>
                <span style={{ display: "flex", alignItems: "center", fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Page {stopsPage} of {Math.ceil(confirmedStops.length / PAGE_SIZE)}</span>
                <button disabled={stopsPage >= Math.ceil(confirmedStops.length / PAGE_SIZE)} onClick={() => setStopsPage(p => p + 1)} style={{ padding: "6px 14px", background: stopsPage >= Math.ceil(confirmedStops.length / PAGE_SIZE) ? "#f0f0f0" : "white", border: "1px solid #e2e8f0", borderRadius: 8, cursor: stopsPage >= Math.ceil(confirmedStops.length / PAGE_SIZE) ? "not-allowed" : "pointer", fontSize: FONT_SIZE.xs, color: stopsPage >= Math.ceil(confirmedStops.length / PAGE_SIZE) ? "#ccc" : "#64748b" }}>Next →</button>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {confirmedStops.slice(0, stopsPage * PAGE_SIZE).map((stop: any) => (
                <div key={stop.stop_id} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: FONT_SIZE.lg, color: "#0f172a" }}>{stop.plate_number || "—"}</p>
                      <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.sm, color: "#64748b" }}>{stop.driver_name || "—"}</p>
                      <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>{stop.stop_time ? formatDateTime(stop.stop_time) : "—"}</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ margin: "0 0 4px 0", fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Bags delivered</p>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: FONT_SIZE["2xl"], color: "#0070f3" }}>{stop.quantity_offloaded}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sales Tab (read-only) */}
        {tab === "sales" && (
          <div>
            <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 12, marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  onClick={() => setSalesSortByAdded(!salesSortByAdded)}
                  style={{ padding: "8px 12px", borderRadius: 8, fontSize: FONT_SIZE.xs, cursor: "pointer", border: "1.5px solid #e2e8f0", background: "white", color: "#64748b", fontWeight: 500 }}
                >
                  Sort: {salesSortByAdded ? "Date Added" : "Sale Date"}
                </button>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {PAYMENT_MODES.map(mode => (
                    <button
                      key={mode}
                      onClick={() => setSalesPaymentFilter(salesPaymentFilter === mode ? "" : mode)}
                      style={{
                        padding: "6px 12px", borderRadius: 20, fontSize: FONT_SIZE.xs, cursor: "pointer",
                        border: `1.5px solid ${salesPaymentFilter === mode ? "#0070f3" : "#e2e8f0"}`,
                        background: salesPaymentFilter === mode ? "#0070f3" : "white",
                        color: salesPaymentFilter === mode ? "white" : "#64748b",
                        fontWeight: salesPaymentFilter === mode ? 600 : 500, transition: "all 0.15s",
                      }}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
              {lastUpdated && <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Updated: {formatTime(lastUpdated)}</p>}
            </div>

            {groupedSales.length === 0 && <p style={{ color: "#64748b", fontSize: FONT_SIZE.base }}>No sales records.</p>}

            {groupedSales.length > PAGE_SIZE && (
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 16 }}>
                <button disabled={salesPage <= 1} onClick={() => setSalesPage(p => Math.max(1, p - 1))} style={{ padding: "6px 14px", background: salesPage <= 1 ? "#f0f0f0" : "white", border: "1px solid #e2e8f0", borderRadius: 8, cursor: salesPage <= 1 ? "not-allowed" : "pointer", fontSize: FONT_SIZE.xs, color: salesPage <= 1 ? "#ccc" : "#64748b" }}>← Previous</button>
                <span style={{ display: "flex", alignItems: "center", fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Page {salesPage} of {Math.ceil(groupedSales.length / PAGE_SIZE)}</span>
                <button disabled={salesPage >= Math.ceil(groupedSales.length / PAGE_SIZE)} onClick={() => setSalesPage(p => p + 1)} style={{ padding: "6px 14px", background: salesPage >= Math.ceil(groupedSales.length / PAGE_SIZE) ? "#f0f0f0" : "white", border: "1px solid #e2e8f0", borderRadius: 8, cursor: salesPage >= Math.ceil(groupedSales.length / PAGE_SIZE) ? "not-allowed" : "pointer", fontSize: FONT_SIZE.xs, color: salesPage >= Math.ceil(groupedSales.length / PAGE_SIZE) ? "#ccc" : "#64748b" }}>Next →</button>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {groupedSales.slice(0, salesPage * PAGE_SIZE).map(sale => {
                const totalAmount = sale.lines.reduce((sum, l) => sum + (l.total_amount || 0), 0)
                const totalBags = sale.lines.reduce((sum, l) => sum + l.quantity, 0)
                return (
                  <div key={sale.group_id} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: FONT_SIZE.lg, color: "#0f172a" }}>{sale.customer_name || "Walk-in"}</p>
                        <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>{sale.sold_at ? formatDateTime(sale.sold_at) : "—"}</p>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        {totalAmount > 0 && <p style={{ margin: 0, fontWeight: 700, fontSize: FONT_SIZE.lg, color: "#16a34a" }}>₦{totalAmount.toLocaleString()}</p>}
                        <span style={{ fontSize: FONT_SIZE.xs, padding: "3px 8px", borderRadius: 6, background: "#f0f7ff", color: "#0070f3", fontWeight: 600, display: "inline-block", marginTop: 4 }}>{sale.payment_mode}</span>
                      </div>
                    </div>

                    {sale.broker_id && (
                      <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px", marginBottom: 10, border: "1px solid #e2e8f0" }}>
                        <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Status</p>
                        <span style={{ fontSize: FONT_SIZE.xs, padding: "4px 10px", borderRadius: 6, background: sale.status === "Pending" ? "#fffbeb" : sale.status === "Confirmed" ? "#ecfdf5" : "#fef2f2", color: getStatusColor(sale.status), fontWeight: 600, display: "inline-block", marginTop: 4 }}>
                          {sale.status}
                        </span>
                      </div>
                    )}

                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {sale.lines.map(line => (
                        <div key={line.sale_id} style={{ display: "grid", gridTemplateColumns: line.price_per_bag !== null ? "1.4fr 0.7fr 0.9fr" : "1.4fr 0.7fr", gap: 8 }}>
                          <div style={{ background: "#f8fafc", borderRadius: 8, padding: "8px 12px" }}>
                            <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Product</p>
                            <p style={{ margin: "2px 0 0", fontWeight: 600, fontSize: FONT_SIZE.base, color: "#0f172a" }}>{line.product}</p>
                          </div>
                          <div style={{ background: "#f8fafc", borderRadius: 8, padding: "8px 12px" }}>
                            <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Bags</p>
                            <p style={{ margin: "2px 0 0", fontWeight: 600, fontSize: FONT_SIZE.base, color: "#0f172a" }}>{line.quantity}</p>
                          </div>
                          {line.price_per_bag !== null && (
                            <div style={{ background: "#f8fafc", borderRadius: 8, padding: "8px 12px" }}>
                              <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Price/Bag</p>
                              <p style={{ margin: "2px 0 0", fontWeight: 600, fontSize: FONT_SIZE.base, color: "#0f172a" }}>₦{line.price_per_bag.toLocaleString()}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Verification History Tab */}
        {tab === "history" && (
          <div>
            <p style={{ margin: "0 0 16px 0", fontWeight: 700, fontSize: FONT_SIZE.lg, color: "#0f172a" }}>Verification History</p>
            {groupedVerifications.length === 0 && <p style={{ color: "#64748b", fontSize: FONT_SIZE.base }}>No verifications yet.</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {groupedVerifications.map(group => {
                const isExpanded = expandedGroups.has(group.key)
                const matchedCount = group.items.filter(v => v.discrepancy === 0).length
                const mismatchedCount = group.items.filter(v => v.discrepancy !== 0).length
                return (
                  <div key={group.key} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                    <button
                      onClick={() => setExpandedGroups(prev => {
                        const next = new Set(prev)
                        if (next.has(group.key)) next.delete(group.key)
                        else next.add(group.key)
                        return next
                      })}
                      style={{
                        width: "100%", padding: isMobile ? "14px 16px" : "16px 20px",
                        background: isExpanded ? "#f8fafc" : "white",
                        border: "none", borderBottom: isExpanded ? "1px solid #e2e8f0" : "none",
                        cursor: "pointer", textAlign: "left",
                        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                        <Icon
                          icon={isExpanded ? "mdi:chevron-down" : "mdi:chevron-right"}
                          width={20}
                          color="#64748b"
                          style={{ flexShrink: 0, transition: "transform 0.2s" }}
                        />
                        <div style={{ minWidth: 0 }}>
                          <p style={{ margin: 0, fontWeight: 600, fontSize: FONT_SIZE.base, color: "#0f172a" }}>{formatDateTime(group.verified_at)}</p>
                          <p style={{ margin: "2px 0 0", fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>
                            {group.items.length} product{group.items.length !== 1 ? "s" : ""}
                            {matchedCount > 0 && <span style={{ color: "#16a34a" }}> · {matchedCount} matched</span>}
                            {mismatchedCount > 0 && <span style={{ color: "#dc2626" }}> · {mismatchedCount} mismatched</span>}
                          </p>
                        </div>
                      </div>
                    </button>
                    {isExpanded && (
                      <div style={{ padding: isMobile ? "12px 16px" : "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
                        {group.items.map(v => (
                          <div key={v.verification_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "10px 14px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                            <div style={{ minWidth: 0 }}>
                              <p style={{ margin: 0, fontWeight: 600, fontSize: FONT_SIZE.base, color: "#0f172a" }}>{v.product}</p>
                              <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: FONT_SIZE.sm, color: "#64748b" }}>
                                <span>System: <strong>{v.system_balance}</strong></span>
                                <span>Physical: <strong>{v.physical_count}</strong></span>
                              </div>
                              {v.notes && <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.xs, color: "#94a3b8", fontStyle: "italic" }}>{v.notes}</p>}
                            </div>
                            {v.discrepancy !== 0 && (
                              <span style={{
                                padding: "4px 10px", borderRadius: 6, fontSize: FONT_SIZE.xs, fontWeight: 700, flexShrink: 0, marginLeft: 12,
                                background: v.discrepancy > 0 ? "#ecfdf5" : "#fef2f2",
                                color: v.discrepancy > 0 ? "#16a34a" : "#dc2626",
                              }}>
                                {v.discrepancy > 0 ? "+" : ""}{v.discrepancy}
                              </span>
                            )}
                            {v.discrepancy === 0 && (
                              <span style={{ padding: "4px 10px", borderRadius: 6, fontSize: FONT_SIZE.xs, fontWeight: 700, background: "#ecfdf5", color: "#16a34a", flexShrink: 0, marginLeft: 12 }}>Matched</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <ReportModal isOpen={showReportModal} onClose={() => setShowReportModal(false)} userId={supervisor?.supervisor_id || ""} userRole={Role.StoreSupervisor} />

      <ProfilePictureUpload
        isOpen={showPictureModal}
        onClose={() => setShowPictureModal(false)}
        userId={supervisor?.supervisor_id || ""}
        table="store_supervisors"
        idField="supervisor_id"
        currentUrl={profilePicUrl}
        onSuccess={(url) => setProfilePicUrl(url)}
      />
    </div>
  )
}
