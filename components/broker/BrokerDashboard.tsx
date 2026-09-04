"use client"

import { useState, useEffect } from "react"
import { Icon } from "@iconify/react"
import { supabase } from "@/lib/supabase"
import { useBreakpoint } from "@/app/hooks/useBreakpoint"
import { toTitleCase } from "@/lib/title-case"

type Props = {
  userId: string
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

function getCurrentMonthRange() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const paymentFrom = `${y}-${m}-01`
  const paymentTo = `${y}-${m}-${String(lastDay).padStart(2, "0")}`
  return { from, to, paymentFrom, paymentTo }
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

export default function BrokerDashboard({ userId, fullName }: Props) {
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"
  const [stats, setStats] = useState<StatCard[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchStats() {
    setLoading(true)
    try {
      const { from, to, paymentFrom, paymentTo } = getCurrentMonthRange()

      const [
        stopsResult,
        storeSalesResult,
        paymentsResult,
        creditsResult,
        activeTripsResult,
      ] = await Promise.all([
        supabase
          .from("Stops")
          .select("stop_id, quantity_offloaded")
          .eq("broker_id", userId)
          .eq("confirmed", true)
          .gte("stop_time", from)
          .lte("stop_time", to),
        supabase
          .from("store_sales")
          .select("total_quantity, total_amount")
          .eq("broker_id", userId)
          .eq("status", "Confirmed")
          .gte("sold_at", from)
          .lte("sold_at", to),
        supabase
          .from("customer_payments")
          .select("amount")
          .eq("broker_id", userId)
          .eq("status", "Posted")
          .gte("payment_date", paymentFrom)
          .lte("payment_date", paymentTo),
        supabase
          .from("broker_credits")
          .select("amount")
          .eq("broker_id", userId)
          .eq("status", "Active"),
        supabase
          .from("Trips")
          .select("trip_id", { count: "exact", head: true })
          .in("trip_status", ["In transit", "On hold"]),
      ])

      const bagsFromStops = (stopsResult.data || []).reduce(
        (sum, s) => sum + (s.quantity_offloaded || 0), 0
      )
      const bagsFromStoreSales = (storeSalesResult.data || []).reduce(
        (sum, s) => sum + (s.total_quantity || 0), 0
      )
      const bagsSold = bagsFromStops + bagsFromStoreSales

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

      const totalPayments = (paymentsResult.data || []).reduce(
        (sum, p) => sum + (p.amount || 0), 0
      )

      const activeCredits = (creditsResult.data || []).reduce(
        (sum, c) => sum + (c.amount || 0), 0
      )

      const activeTrips = activeTripsResult.count || 0

      setStats([
        { key: "revenue", icon: "mdi:cash-multiple", label: "Revenue (This Month)", value: revenue, color: "#10b981", isCurrency: true },
        { key: "bags", icon: "mdi:package-variant", label: "Bags Sold (This Month)", value: bagsSold, color: "#0070f3" },
        { key: "payments", icon: "mdi:bank-transfer-in", label: "Payments (This Month)", value: totalPayments, color: "#8b5cf6", isCurrency: true },
        { key: "credits", icon: "mdi:credit-card-outline", label: "Active Credits", value: activeCredits, color: "#f59e0b", isCurrency: true },
        { key: "trips", icon: "mdi:truck-check", label: "Active Trips", value: activeTrips, color: "#ef4444" },
      ])
    } catch (err) {
      console.error("Error fetching broker dashboard stats:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

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
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(auto-fill, minmax(220px, 1fr))",
            gap: isMobile ? 10 : 12,
          }}>
            {stats.slice(1).map(card => (
              <StatCardComponent key={card.key} card={card} isMobile={isMobile} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
