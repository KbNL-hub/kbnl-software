"use client"

import { useState, useEffect } from "react"
import { Icon } from "@iconify/react"
import { supabase } from "@/lib/supabase"
import { useBreakpoint } from "@/app/hooks/useBreakpoint"
import { Role } from "@/lib/roles"
import { toTitleCase } from "@/lib/title-case"
import { formatDateTime } from "@/lib/date-utils"

type Props = {
  effectiveRole: string
  fullName: string
}

type StatCard = {
  key: string
  icon: string
  label: string
  value: number
  color: string
  isCurrency?: boolean
}

const PRODUCT_MANUFACTURER: Record<string, string> = {
  "Supaset": "HBM", "Supafix": "HBM", "Classic": "HBM",
  "BUA cement": "BUA",
  "3X": "Dangote", "Falcon": "Dangote",
}

const TRUCK_STATUS_CARDS: { status: string; icon: string; color: string }[] = [
  { status: "Loaded", icon: "mdi:truck", color: "#0070f3" },
  { status: "Empty", icon: "mdi:truck-outline", color: "#10b981" },
  { status: "To Plant", icon: "mdi:factory", color: "#8b5cf6" },
  { status: "Undergoing Repairs", icon: "mdi:wrench", color: "#f59e0b" },
  { status: "Decommissioned", icon: "mdi:truck-remove", color: "#ef4444" },
]

function getCurrentMonthRange() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString()
  return { from, to }
}

function getRoleGroup(role: string): "admin" | "desk" | "atc" | "cash" {
  if (role === Role.Admin || role === Role.SuperAdmin || role === Role.Supervisor) return "admin"
  if (role === Role.DeskOfficer) return "desk"
  if (role === Role.ATCOfficer) return "atc"
  if (role === Role.CashAuthorizer) return "cash"
  return "admin"
}

function formatValue(card: StatCard) {
  return card.isCurrency
    ? `\u20A6${card.value.toLocaleString()}`
    : card.value.toLocaleString()
}

function FeaturedCard({ card, isMobile }: { card: StatCard; isMobile: boolean }) {
  return (
    <div
      style={{
        background: "#0070f3",
        borderRadius: 16,
        padding: isMobile ? "18px 16px" : "24px 28px",
        display: "flex",
        alignItems: "center",
        gap: isMobile ? 14 : 18,
        boxShadow: "0 4px 16px rgba(0, 112, 243, 0.25)",
        marginBottom: isMobile ? 12 : 16,
      }}
    >
      <div
        style={{
          width: isMobile ? 44 : 52,
          height: isMobile ? 44 : 52,
          borderRadius: 12,
          background: "rgba(255,255,255,0.18)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon icon={card.icon} width={isMobile ? 22 : 26} color="#ffffff" />
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{
          margin: 0,
          fontSize: isMobile ? 12 : 13,
          color: "rgba(255,255,255,0.75)",
          fontWeight: 500,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}>
          {card.label}
        </p>
        <p style={{
          margin: "4px 0 0",
          fontSize: isMobile ? 26 : 36,
          fontWeight: 800,
          color: "#ffffff",
          lineHeight: 1.1,
          letterSpacing: "-0.02em",
        }}>
          {formatValue(card)}
        </p>
      </div>
    </div>
  )
}

function CompanyCreditCard({ total, lastUpdated, isMobile }: { total: number; lastUpdated: string | null; isMobile: boolean }) {
  return (
    <div
      style={{
        background: "#eff6ff",
        border: "1.5px solid #0070f3",
        borderRadius: 16,
        padding: isMobile ? "14px 16px" : "18px 28px",
        display: "flex",
        alignItems: "center",
        gap: isMobile ? 12 : 16,
        marginBottom: isMobile ? 12 : 16,
      }}
    >
      <div
        style={{
          width: isMobile ? 38 : 44,
          height: isMobile ? 38 : 44,
          borderRadius: 11,
          background: "white",
          border: "1px solid #bfdbfe",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon icon="mdi:credit-card-outline" width={isMobile ? 20 : 24} color="#0070f3" />
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{
          margin: 0,
          fontSize: isMobile ? 11 : 12,
          color: "#171717",
          fontWeight: 600,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}>
          Company Credit (Active)
        </p>
        <p style={{
          margin: "3px 0 0",
          fontSize: isMobile ? 20 : 26,
          fontWeight: 800,
          color: "#0070f3",
          lineHeight: 1.2,
          letterSpacing: "-0.01em",
        }}>
          {"\u20A6"}{total.toLocaleString()}
        </p>
        {lastUpdated && (
          <p style={{ margin: "4px 0 0", fontSize: isMobile ? 10 : 11, color: "#64748b" }}>
            Last updated: {formatDateTime(lastUpdated)}
          </p>
        )}
      </div>
    </div>
  )
}

function TruckSummaryCard({ stats, isMobile }: { stats: StatCard[]; isMobile: boolean }) {
  const total = stats.reduce((sum, s) => sum + (s.value || 0), 0)
  return (
    <div
      style={{
        background: "white",
        borderRadius: 16,
        padding: isMobile ? "14px 16px" : "16px 24px",
        border: "1px solid #eef0f2",
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        alignItems: isMobile ? "flex-start" : "center",
        gap: isMobile ? 14 : 20,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 12 : 14, flexShrink: 0 }}>
        <div
          style={{
            width: isMobile ? 38 : 44,
            height: isMobile ? 38 : 44,
            borderRadius: 11,
            background: "#0070f314",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon icon="mdi:truck" width={isMobile ? 20 : 24} color="#0070f3" />
        </div>
        <div>
          <p style={{ margin: 0, fontSize: isMobile ? 11 : 12, color: "#64748b", fontWeight: 500 }}>
            Total Trucks
          </p>
          <p style={{
            margin: "2px 0 0",
            fontSize: isMobile ? 24 : 28,
            fontWeight: 800,
            color: "#0f172a",
            lineHeight: 1.2,
            letterSpacing: "-0.01em",
          }}>
            {total.toLocaleString()}
          </p>
        </div>
      </div>
      <div style={{
        display: "flex",
        flexWrap: "wrap",
        gap: isMobile ? 8 : 10,
        flex: 1,
        justifyContent: isMobile ? "flex-start" : "flex-end",
      }}>
        {stats.map(s => (
          <span key={s.key} style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 10px",
            borderRadius: 999,
            background: `${s.color}14`,
            fontSize: isMobile ? 11 : 12,
            fontWeight: 600,
            color: "#334155",
            whiteSpace: "nowrap",
          }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
            {s.label}
            <span style={{ fontWeight: 700, color: "#0f172a" }}>{s.value.toLocaleString()}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function StatCardComponent({ card, isMobile }: { card: StatCard; isMobile: boolean }) {
  return (
    <div
      style={{
        background: "white",
        borderRadius: 16,
        padding: isMobile ? "14px" : "16px 20px",
        border: "1px solid #eef0f2",
        display: "flex",
        alignItems: "center",
        gap: isMobile ? 12 : 14,
        transition: "all 0.15s ease",
        cursor: "default",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.07)"
        e.currentTarget.style.borderColor = "#e2e4e7"
        e.currentTarget.style.transform = "translateY(-1px)"
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = "none"
        e.currentTarget.style.borderColor = "#eef0f2"
        e.currentTarget.style.transform = "translateY(0)"
      }}
    >
      <div
        style={{
          width: isMobile ? 38 : 42,
          height: isMobile ? 38 : 42,
          borderRadius: 11,
          background: `${card.color}14`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon icon={card.icon} width={isMobile ? 18 : 20} color={card.color} />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{
          margin: 0,
          fontSize: isMobile ? 11 : 12,
          color: "#64748b",
          fontWeight: 500,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}>
          {card.label}
        </p>
        <p style={{
          margin: "3px 0 0",
          fontSize: isMobile ? 20 : 22,
          fontWeight: 700,
          color: "#0f172a",
          lineHeight: 1.2,
          letterSpacing: "-0.01em",
        }}>
          {formatValue(card)}
        </p>
      </div>
    </div>
  )
}

function SkeletonCards({ isMobile, count }: { isMobile: boolean; count: number }) {
  return (
    <div>
      <div
        style={{
          borderRadius: 16,
          padding: isMobile ? "18px 16px" : "24px 28px",
          display: "flex",
          alignItems: "center",
          gap: isMobile ? 14 : 18,
          background: "#f0f7ff",
          border: "1px solid #bfdbfe",
          marginBottom: isMobile ? 12 : 16,
        }}
      >
        <div style={{
          width: isMobile ? 44 : 52,
          height: isMobile ? 44 : 52,
          borderRadius: 12,
          background: "#dbeafe",
          flexShrink: 0,
        }} />
        <div style={{ flex: 1 }}>
          <div style={{ width: "35%", height: 11, borderRadius: 4, background: "#dbeafe", marginBottom: 8 }} />
          <div style={{ width: "55%", height: 24, borderRadius: 4, background: "#dbeafe" }} />
        </div>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(auto-fill, minmax(220px, 1fr))",
        gap: isMobile ? 10 : 12,
      }}>
        {Array.from({ length: Math.max(count - 1, 1) }).map((_, idx) => (
          <div key={idx} style={{
            background: "white",
            borderRadius: 16,
            padding: isMobile ? "14px" : "16px 20px",
            border: "1px solid #eef0f2",
            display: "flex",
            alignItems: "center",
            gap: isMobile ? 12 : 14,
          }}>
            <div style={{
              width: isMobile ? 38 : 42,
              height: isMobile ? 38 : 42,
              borderRadius: 11,
              background: "#f1f5f9",
              flexShrink: 0,
            }} />
            <div style={{ flex: 1 }}>
              <div style={{ width: "60%", height: 10, borderRadius: 4, background: "#f1f5f9", marginBottom: 7 }} />
              <div style={{ width: "40%", height: 18, borderRadius: 4, background: "#f1f5f9" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AdminDashboard({ effectiveRole, fullName }: Props) {
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"
  const [stats, setStats] = useState<StatCard[]>([])
  const [truckStats, setTruckStats] = useState<StatCard[]>([])
  const [productStats, setProductStats] = useState<StatCard[]>([])
  const [creditTotal, setCreditTotal] = useState(0)
  const [lastCreditUpdate, setLastCreditUpdate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const roleGroup = getRoleGroup(effectiveRole)

  async function fetchStats() {
    setLoading(true)
    setTruckStats([])
    setProductStats([])
    setCreditTotal(0)
    setLastCreditUpdate(null)
    try {
      const { from, to } = getCurrentMonthRange()

      if (roleGroup === "admin") {
        await fetchAdminStats(from, to)
      } else if (roleGroup === "desk") {
        await fetchDeskStats()
      } else if (roleGroup === "atc") {
        await fetchATCStats()
      } else if (roleGroup === "cash") {
        await fetchCashStats()
      }
    } catch (err) {
      console.error("Error fetching admin dashboard stats:", err)
    } finally {
      setLoading(false)
    }
  }

  async function fetchAdminStats(from: string, to: string) {
    const [
      stopsResult,
      storeSalesResult,
      activeTripsResult,
      totalTripsResult,
      usersResult,
      trucksResult,
      productTripsResult,
      creditsResult,
    ] = await Promise.all([
      supabase
        .from("Stops")
        .select("stop_id, quantity_offloaded")
        .eq("confirmed", true)
        .gte("stop_time", from)
        .lte("stop_time", to),
      supabase
        .from("store_sales")
        .select("quantity, total_amount")
        .eq("status", "Confirmed")
        .neq("sale_type", "truck_load_out")
        .gte("sold_at", from)
        .lte("sold_at", to),
      supabase
        .from("Trips")
        .select("trip_id", { count: "exact", head: true })
        .in("trip_status", ["In transit", "On hold"]),
      supabase
        .from("Trips")
        .select("trip_id", { count: "exact", head: true })
        .eq("trip_status", "Completed")
        .gte("created_at", from)
        .lte("created_at", to),
      supabase
        .from("Profiles")
        .select("user_id", { count: "exact", head: true })
        .eq("is_deactivated", false),
      supabase
        .from("Trucks")
        .select("status"),
      supabase
        .from("Trips")
        .select("product, loaded_quantity")
        .gte("created_at", from)
        .lte("created_at", to),
      supabase
        .from("broker_credits")
        .select("amount, updated_at")
        .eq("status", "Active"),
    ])

    const bagsFromStops = (stopsResult.data || []).reduce(
      (sum, s) => sum + (s.quantity_offloaded || 0), 0
    )
    const bagsFromStoreSales = (storeSalesResult.data || []).reduce(
      (sum, s) => sum + (s.quantity || 0), 0
    )
    const bagsSold = bagsFromStops + bagsFromStoreSales
    setCreditTotal(
      (creditsResult.data || []).reduce(
        (sum, c) => sum + (Number(c.amount) || 0), 0
      )
    )
    const creditData = creditsResult.data || []
    setLastCreditUpdate(
      creditData.length > 0
        ? creditData.reduce((latest: string, c: { updated_at: string }) => c.updated_at > latest ? c.updated_at : latest, creditData[0].updated_at)
        : null
    )

    let revenue = 0
    const stopIds = (stopsResult.data || []).map(s => s.stop_id)
    if (stopIds.length > 0) {
      const { data: confirmations } = await supabase
        .from("Stop_Confirmations")
        .select("stop_id, price_per_bag")
        .in("stop_id", stopIds)
      const priceMap: Record<string, number> = {}
      for (const c of confirmations || []) {
        priceMap[c.stop_id] = (priceMap[c.stop_id] || 0) + (c.price_per_bag || 0)
      }
      for (const stop of stopsResult.data || []) {
        revenue += (stop.quantity_offloaded || 0) * (priceMap[stop.stop_id] || 0)
      }
    }
    revenue += (storeSalesResult.data || []).reduce(
      (sum, s) => sum + (s.total_amount || 0), 0
    )

    const truckCounts: Record<string, number> = {}
    for (const t of trucksResult.data || []) {
      truckCounts[t.status] = (truckCounts[t.status] || 0) + 1
    }
    setTruckStats(
      TRUCK_STATUS_CARDS.map(cfg => ({
        key: `truck-${cfg.status.toLowerCase().replace(/\s+/g, "-")}`,
        icon: cfg.icon,
        label: cfg.status,
        value: truckCounts[cfg.status] || 0,
        color: cfg.color,
      }))
    )

    const productMap: Record<string, number> = {}
    for (const t of productTripsResult.data || []) {
      if (!t.product) continue
      const manufacturer = PRODUCT_MANUFACTURER[t.product]
      if (!manufacturer) continue
      productMap[manufacturer] = (productMap[manufacturer] || 0) + (t.loaded_quantity || 0)
    }
    const manufacturerCards: { name: string; icon: string; color: string }[] = [
      { name: "HBM", icon: "mdi:factory", color: "#0070f3" },
      { name: "Dangote", icon: "mdi:factory", color: "#10b981" },
      { name: "BUA", icon: "mdi:factory", color: "#8b5cf6" },
    ]
    setProductStats(
      manufacturerCards.map(cfg => ({
        key: `product-${cfg.name.toLowerCase()}`,
        icon: cfg.icon,
        label: `${cfg.name} (This Month)`,
        value: productMap[cfg.name] || 0,
        color: cfg.color,
      }))
    )

    setStats([
      { key: "revenue", icon: "mdi:cash-multiple", label: "Revenue (This Month)", value: revenue, color: "#10b981", isCurrency: true },
      { key: "bags", icon: "mdi:package-variant", label: "Bags Sold (This Month)", value: bagsSold, color: "#0070f3" },
      { key: "trips", icon: "mdi:truck-check", label: "Active Trips", value: activeTripsResult.count || 0, color: "#8b5cf6" },
      { key: "total-trips", icon: "mdi:check-decagram", label: "Total Trips (This Month)", value: totalTripsResult.count || 0, color: "#f59e0b" },
      { key: "users", icon: "mdi:account-group", label: "Active Users", value: usersResult.count || 0, color: "#ef4444" },
    ])
  }

  async function fetchDeskStats() {
    const [storeSalesResult, paymentsResult, complaintsResult, reportsResult, cashExpensesResult, tripsResult] = await Promise.all([
      supabase
        .from("store_sales")
        .select("sale_id", { count: "exact", head: true })
        .eq("status", "Pending"),
      supabase
        .from("customer_payments")
        .select("payment_id", { count: "exact", head: true })
        .eq("status", "Pending"),
      supabase
        .from("driver_complaints")
        .select("complaint_id", { count: "exact", head: true })
        .eq("resolved", false),
      supabase
        .from("reports")
        .select("id", { count: "exact", head: true })
        .eq("resolved", false),
      supabase
        .from("cash_expenses")
        .select("expense_id", { count: "exact", head: true })
        .eq("status", "Authorised"),
      supabase
        .from("Trips")
        .select("trip_id", { count: "exact", head: true })
        .eq("recorded", true)
        .eq("posted", false),
    ])

    setStats([
      { key: "store-sales", icon: "mdi:store-outline", label: "Pending Store Sales", value: storeSalesResult.count || 0, color: "#0070f3" },
      { key: "payments", icon: "mdi:cash-register", label: "Pending Payments", value: paymentsResult.count || 0, color: "#8b5cf6" },
      { key: "complaints", icon: "mdi:alert-circle", label: "Pending Complaints", value: (complaintsResult.count || 0) + (reportsResult.count || 0), color: "#f59e0b" },
      { key: "cash-expenses", icon: "mdi:cash-multiple", label: "Pending Cash Expenses", value: cashExpensesResult.count || 0, color: "#ef4444" },
      { key: "trips", icon: "mdi:map-marker-path", label: "Pending Trips", value: tripsResult.count || 0, color: "#10b981" },
    ])
  }

  async function fetchATCStats() {
    const [tripsResult, pendingConfirmResult, disputedResult] = await Promise.all([
      supabase
        .from("Trips")
        .select("trip_id", { count: "exact", head: true })
        .in("trip_status", ["In transit", "On hold"]),
      supabase
        .from("Stops")
        .select("stop_id", { count: "exact", head: true })
        .eq("confirmed", false),
      supabase
        .from("Stops")
        .select("stop_id", { count: "exact", head: true })
        .eq("disputed", true),
    ])

    setStats([
      { key: "trucks-transit", icon: "mdi:truck-check", label: "Trucks In Transit", value: tripsResult.count || 0, color: "#0070f3" },
      { key: "active-trips", icon: "mdi:road-variant", label: "Active Trips", value: tripsResult.count || 0, color: "#8b5cf6" },
      { key: "pending-confirm", icon: "mdi:clock-outline", label: "Pending Confirmation", value: pendingConfirmResult.count || 0, color: "#f59e0b" },
      { key: "disputed", icon: "mdi:alert", label: "Disputed Stops", value: disputedResult.count || 0, color: "#ef4444" },
    ])
  }

  async function fetchCashStats() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: authorizer } = await supabase
      .from("cash_authorizers")
      .select("assigned_office")
      .eq("authorizer_id", user.id)
      .maybeSingle()

    const query = supabase
      .from("cash_expenses")
      .select("expense_id", { count: "exact", head: true })
      .eq("status", "Pending")

    if (authorizer?.assigned_office) {
      query.eq("office_name", authorizer.assigned_office)
    }

    const { count } = await query

    setStats([
      { key: "expenses", icon: "mdi:cash-register", label: "Pending Expenses", value: count || 0, color: "#8b5cf6" },
    ])
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveRole])

  return (
    <div>
      <div style={{ marginBottom: isMobile ? 16 : 24 }}>
        <h1 style={{ margin: "0 0 2px", fontSize: isMobile ? 20 : 26, fontWeight: 700, color: "#1a1a1a" }}>
          Welcome back, {toTitleCase(fullName)}
        </h1>
        <p style={{ margin: 0, fontSize: isMobile ? 13 : 14, color: "#999" }}>
          Here&apos;s your overview
        </p>
      </div>

      {loading ? (
        <SkeletonCards isMobile={isMobile} count={stats.length || 5} />
      ) : (
        <div>
          {stats.length > 0 && (
            <FeaturedCard card={stats[0]} isMobile={isMobile} />
          )}
          {roleGroup === "admin" && creditTotal > 0 && (
            <CompanyCreditCard total={creditTotal} lastUpdated={lastCreditUpdate} isMobile={isMobile} />
          )}
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(auto-fill, minmax(220px, 1fr))",
            gap: isMobile ? 10 : 12,
          }}>
            {stats.slice(1).map(card => (
              <StatCardComponent key={card.key} card={card} isMobile={isMobile} />
            ))}
          </div>

          {productStats.length > 0 && (
            <div style={{ marginTop: isMobile ? 24 : 32 }}>
              <p style={{ margin: "0 0 10px", fontSize: isMobile ? 11 : 12, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>
                Product Volume by Manufacturer
              </p>
              <div style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(auto-fill, minmax(160px, 1fr))",
                gap: isMobile ? 10 : 12,
              }}>
                {productStats.map(card => (
                  <StatCardComponent key={card.key} card={card} isMobile={isMobile} />
                ))}
              </div>
            </div>
          )}

          {truckStats.length > 0 && (
            <div style={{ marginTop: isMobile ? 24 : 32 }}>
              <p style={{ margin: "0 0 10px", fontSize: isMobile ? 11 : 12, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>
                Trucks by Status
              </p>
              <TruckSummaryCard stats={truckStats} isMobile={isMobile} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
