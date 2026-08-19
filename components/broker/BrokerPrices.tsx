"use client"

import { useState, useEffect } from "react"
import { Icon } from "@iconify/react"
import { supabase } from "@/lib/supabase"
import { usePagination } from "@/lib/hooks/usePagination"
import PaginationControls from "@/components/PaginationControls"

const PRODUCTS = ["BUA cement", "Falcon", "3X", "Supaset", "Supafix", "Classic"]
const AREAS = ["Calabar to Obubra", "Ikom to Obudu", "Akwa-Ibom", "East"]

type PriceRow = { area: string; product: string; price: number }
type HistoryRow = {
  id: string; area: string; product: string; old_price: number; new_price: number;
  changed_by: string | null; changed_at: string; change_group_id: string
}

function useBreakpoint() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640)
    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])
  return isMobile
}

const fz = { xs: 12, sm: 13, base: 14, md: 15, lg: 16, xl: 20, "2xl": 24 }

export default function BrokerPrices() {
  const isMobile = useBreakpoint()
  const [prices, setPrices] = useState<Record<string, Record<string, number>>>({})
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [profiles, setProfiles] = useState<Record<string, string>>({})
  const [selectedArea, setSelectedArea] = useState(AREAS[0])
  const [loading, setLoading] = useState(true)
  const [historyExpanded, setHistoryExpanded] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  async function fetchData() {
    const [priceRes, historyRes] = await Promise.all([
      supabase.from("company_prices").select("*"),
      supabase.from("company_price_history").select("*").order("changed_at", { ascending: false }),
    ])
    const priceMap: Record<string, Record<string, number>> = {}
    for (const area of AREAS) priceMap[area] = {}
    for (const p of (priceRes.data || []) as PriceRow[]) {
      if (!priceMap[p.area]) priceMap[p.area] = {}
      priceMap[p.area][p.product] = p.price
    }
    setPrices(priceMap)

    const historyRows = (historyRes.data || []) as HistoryRow[]
    setHistory(historyRows)

    const userIds = new Set<string>()
    for (const h of historyRows) if (h.changed_by) userIds.add(h.changed_by)
    if (userIds.size > 0) {
      const { data: profileData } = await supabase
        .from("Profiles").select("user_id, full_name").in("user_id", [...userIds])
      const pmap: Record<string, string> = {}
      for (const p of (profileData || [])) pmap[p.user_id] = p.full_name
      setProfiles(pmap)
    }
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchData() }, [])

  const groupedHistory = groupHistory(history)

  const { page, setPage, totalPages, paginatedItems, totalItems } = usePagination(groupedHistory)

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid #e2e8f0", borderTopColor: "#0070f3", animation: "spin 1s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }
  const areaPrices = prices[selectedArea] || {}

  return (
    <div>
      <h2 style={{ margin: "0 0 6px", color: "#0f172a", fontSize: isMobile ? fz.xl : 20, fontWeight: 700 }}>Company Prices</h2>
      <p style={{ margin: "0 0 16px", color: "#64748b", fontSize: fz.sm }}>Current cement product prices, grouped by area.</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 20, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 8 }}>
        {AREAS.map(area => {
          const isActive = selectedArea === area
          return (
            <button
              key={area}
              onClick={() => setSelectedArea(area)}
              style={{
                padding: isMobile ? "9px 16px" : "7px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer",
                border: `1.5px solid ${isActive ? "#0070f3" : "#e2e8f0"}`,
                background: isActive ? "rgba(0,112,243,0.1)" : "white",
                color: isActive ? "#0070f3" : "#64748b",
                fontWeight: isActive ? 600 : 500,
                minHeight: 38, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
                transition: "all 0.2s ease",
              }}
            >
              {area}
            </button>
          )
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(240px, 1fr))", gap: 10, marginBottom: 24 }}>
        {PRODUCTS.map(product => {
          const currentPrice = areaPrices[product] ?? 0
          return (
            <div key={product} style={{ background: "white", borderRadius: 10, padding: 16, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
              <p style={{ margin: "0 0 4px", fontSize: fz.xs, color: "#94a3b8" }}>{product}</p>
              <p style={{ margin: 0, fontSize: fz.xl, fontWeight: 700, color: "#0f172a" }}>₦{currentPrice.toLocaleString()}<span style={{ fontSize: fz.xs, color: "#94a3b8", fontWeight: 400 }}>/bag</span></p>
            </div>
          )
        })}
      </div>

      {/* Price History */}
      <div style={{ background: "white", borderRadius: 10, border: "1px solid #e2e8f0", overflow: "hidden" }}>
        <button
          onClick={() => setHistoryExpanded(!historyExpanded)}
          style={{
            width: "100%", padding: "14px 16px", background: "none", border: "none",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            cursor: "pointer", color: "#0f172a", fontSize: fz.base, fontWeight: 600, textAlign: "left",
          }}
        >
          <span>Price History ({groupedHistory.length} changes)</span>
          <Icon icon={historyExpanded ? "mdi:chevron-up" : "mdi:chevron-down"} width={18} />
        </button>

        {historyExpanded && (
          <div style={{ padding: "0 16px 16px", borderTop: "1px solid #e2e8f0" }}>
            {groupedHistory.length === 0 ? (
              <p style={{ color: "#94a3b8", fontSize: fz.sm, textAlign: "center", padding: "16px 0" }}>No price changes yet.</p>
            ) : (
              paginatedItems.map(group => {
                const isGroupExpanded = expandedGroups.has(group.change_group_id)
                const first = group.items[0]
                const changedBy = first.changed_by ? profiles[first.changed_by] || "Unknown" : "System"
                const changedAt = new Date(first.changed_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })

                return (
                  <div key={group.change_group_id} style={{ borderBottom: "1px solid #f1f5f9", padding: "10px 0" }}>
                    <button
                      onClick={() => {
                        const next = new Set(expandedGroups)
                        if (next.has(group.change_group_id)) next.delete(group.change_group_id)
                        else next.add(group.change_group_id)
                        setExpandedGroups(next)
                      }}
                      style={{ width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 0" }}
                    >
                      <div>
                        <p style={{ margin: 0, color: "#0f172a", fontSize: fz.sm, fontWeight: 600 }}>Changed by {changedBy}</p>
                        <p style={{ margin: "2px 0 0", color: "#94a3b8", fontSize: fz.xs }}>{changedAt} · {group.items.length} product{group.items.length !== 1 ? "s" : ""}</p>
                      </div>
                      <Icon icon={isGroupExpanded ? "mdi:chevron-up" : "mdi:chevron-down"} width={16} color="#94a3b8" />
                    </button>
                    {isGroupExpanded && (
                      <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                        {group.items.map(item => (
                          <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: "#f8fafc", borderRadius: 6 }}>
                            <span style={{ fontSize: fz.sm, color: "#0f172a", whiteSpace: "nowrap" }}>{item.product}<span style={{ color: "#94a3b8", fontSize: fz.xs }}>{item.area ? ` · ${item.area}` : ""}</span></span>
                            <span style={{ fontSize: fz.sm, color: "#64748b" }}>₦{item.old_price.toLocaleString()} → <strong style={{ color: "#0f172a" }}>₦{item.new_price.toLocaleString()}</strong></span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>

      {groupedHistory.length > 0 && (
        <PaginationControls page={page} totalPages={totalPages} totalItems={totalItems} onPageChange={setPage} />
      )}
    </div>
  )
}

function groupHistory(rows: HistoryRow[]) {
  const groups: { change_group_id: string; items: HistoryRow[] }[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    if (seen.has(row.change_group_id)) {
      const g = groups.find(g => g.change_group_id === row.change_group_id)
      if (g) g.items.push(row)
    } else {
      seen.add(row.change_group_id)
      groups.push({ change_group_id: row.change_group_id, items: [row] })
    }
  }
  return groups
}
