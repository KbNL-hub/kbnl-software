"use client"

import { useState, useEffect } from "react"
import { Icon } from "@iconify/react"
import { supabase } from "@/lib/supabase"
import { apiMutate } from "@/lib/api-mutation"
import { usePermissions } from "@/lib/PermissionContext"

const PRODUCTS = ["BUA cement", "Falcon", "3X", "Supaset", "Supafix", "Classic"]
const AREAS = ["Calabar to Obubra", "Ikom to Obudu", "Akwa-Ibom", "East"]

type PriceRow = { area: string; product: string; price: number; updated_at: string; updated_by: string | null }
type HistoryRow = {
  id: string; area: string; product: string; old_price: number; new_price: number;
  changed_by: string | null; changed_at: string; change_group_id: string
}

function useBreakpoint() {
  const [isMobile, setIsMobile] = useState(false)
  const [isTablet, setIsTablet] = useState(false)
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640)
      setIsTablet(window.innerWidth >= 640 && window.innerWidth < 1024)
    }
    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])
  return { isMobile, isTablet }
}

const fz = { xs: 12, sm: 13, base: 14, md: 15, lg: 16, xl: 20, "2xl": 24, "3xl": 28 }

export default function CompanyPrices() {
  const { getAccess } = usePermissions()
  const canEdit = getAccess("company-prices").canEdit
  const bp = useBreakpoint()
  const isMobile = bp.isMobile

  const [prices, setPrices] = useState<Record<string, Record<string, number>>>({})
  const [changedPrices, setChangedPrices] = useState<Record<string, string>>({})
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [profiles, setProfiles] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [historyExpanded, setHistoryExpanded] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set([AREAS[0]]))

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
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

  function handleChangePrice(area: string, product: string, value: string) {
    const key = `${area}|${product}`
    const digits = value.replace(/[^0-9]/g, "")
    if (digits === "") {
      const next = { ...changedPrices }
      delete next[key]
      setChangedPrices(next)
    } else {
      setChangedPrices(prev => ({ ...prev, [key]: digits }))
    }
    setMessage("")
  }

  function toggleArea(area: string) {
    const next = new Set(expandedAreas)
    if (next.has(area)) next.delete(area)
    else next.add(area)
    setExpandedAreas(next)
  }

  function hasChanges() { return Object.keys(changedPrices).length > 0 }

  async function handleSave() {
    if (!canEdit || !hasChanges()) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setMessage("Session expired"); return }

    setSaving(true)
    setMessage("")
    const changeGroupId = crypto.randomUUID()

    for (const [key, newPriceStr] of Object.entries(changedPrices)) {
      const [area, product] = key.split("|")
      const newPrice = parseInt(newPriceStr)
      if (isNaN(newPrice) || newPrice < 0) { setMessage(`Invalid price for ${product} in ${area}`); setSaving(false); return }

      const oldPrice = prices[area]?.[product] ?? 0

      const { error: upsertError } = await apiMutate("admin", {
        action: "upsert", table: "company_prices",
        data: { area, product, price: newPrice, updated_by: user.id },
        conflict: "area,product",
      })
      if (upsertError) { setMessage(`Failed to update ${product} (${area}): ${upsertError}`); setSaving(false); return }

      const { error: histError } = await apiMutate("admin", {
        action: "insert", table: "company_price_history",
        data: { area, product, old_price: oldPrice, new_price: newPrice, changed_by: user.id, change_group_id: changeGroupId },
      })
      if (histError) { setMessage(`History failed for ${product} (${area}): ${histError}`); setSaving(false); return }
    }

    setChangedPrices({})
    await fetchData()
    setSaving(false)
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", boxSizing: "border-box", borderRadius: 8,
    border: "1.5px solid #e0e0e0", fontSize: fz.base, background: "white", color: "#171717", minHeight: 42,
  }

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "64px 0" }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid #e2e8f0", borderTopColor: "#0070f3", animation: "spin 1s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  const groupedHistory = groupHistory(history)

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: isMobile ? "16px" : "32px", fontFamily: "'Inter', sans-serif" }}>
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 12, marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, color: "#0f172a", fontSize: isMobile ? fz["2xl"] : fz["3xl"], fontWeight: 700, letterSpacing: "-0.5px" }}>Company Prices</h1>
          <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: fz.base }}>Manage cement product prices per bag, grouped by area.</p>
        </div>
      </div>

      {message && (
        <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 20, color: "#b91c1c", fontSize: fz.sm }}>{message}</div>
      )}

      {/* ── Area Accordion Cards ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
        {AREAS.map(area => {
          const isAreaExpanded = expandedAreas.has(area)
          const areaPrices = prices[area] || {}

          return (
            <div key={area} style={{
              background: "white", borderRadius: 12, border: "1px solid #e2e8f0",
              boxShadow: isAreaExpanded ? "0 4px 12px rgba(0,0,0,0.08)" : "0 1px 3px rgba(0,0,0,0.05)",
              overflow: "hidden", transition: "box-shadow 0.2s",
            }}>
              {/* Area header */}
              <button
                onClick={() => toggleArea(area)}
                style={{
                  width: "100%", padding: isMobile ? "16px" : "18px 20px",
                  background: isAreaExpanded ? "#f0f7ff" : "white",
                  border: "none", display: "flex", alignItems: "center", justifyContent: "space-between",
                  cursor: "pointer", textAlign: "left", transition: "background 0.2s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: isAreaExpanded ? "#0070f3" : "#f1f5f9",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "background 0.2s",
                  }}>
                    <Icon
                      icon="mdi:map-marker-radius"
                      width={20}
                      color={isAreaExpanded ? "white" : "#64748b"}
                    />
                  </div>
                  <div>
                    <p style={{ margin: 0, color: "#0f172a", fontSize: isMobile ? fz.base : fz.lg, fontWeight: 600 }}>{area}</p>
                    <p style={{ margin: "2px 0 0", color: "#94a3b8", fontSize: fz.xs }}>
                      {PRODUCTS.length} products · {PRODUCTS.filter(p => areaPrices[p] && areaPrices[p] > 0).length} priced
                    </p>
                  </div>
                </div>
                <Icon icon={isAreaExpanded ? "mdi:chevron-up" : "mdi:chevron-down"} width={22} color="#64748b" />
              </button>

              {/* Drill-down: Product grid */}
              {isAreaExpanded && (
                <div style={{ padding: isMobile ? "0 16px 16px" : "0 20px 20px", borderTop: "1px solid #f1f5f9" }}>
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))",
                    gap: 12, marginTop: 16,
                  }}>
                    {PRODUCTS.map(product => {
                      const currentPrice = areaPrices[product] ?? 0
                      const key = `${area}|${product}`
                      const pendingNewPrice = changedPrices[key]
                      const isChanged = pendingNewPrice !== undefined

                      return (
                        <div key={product} style={{
                          background: "white", borderRadius: 10, padding: 16,
                          border: `1px solid ${isChanged ? "#0070f3" : "#e2e8f0"}`,
                          boxShadow: isChanged ? "0 0 0 2px rgba(0,112,243,0.15)" : "0 1px 3px rgba(0,0,0,0.05)",
                          transition: "all 0.2s",
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                            <h4 style={{ margin: 0, color: "#0f172a", fontSize: fz.base, fontWeight: 600 }}>{product}</h4>
                            {isChanged && <span style={{ padding: "2px 6px", background: "#eff6ff", color: "#0070f3", borderRadius: 5, fontSize: fz.xs - 1, fontWeight: 600 }}>Changed</span>}
                          </div>
                          <p style={{ margin: "0 0 4px", fontSize: fz.xs, color: "#94a3b8" }}>Current Price</p>
                          <p style={{ margin: 0, fontSize: fz.xl, fontWeight: 700, color: "#0f172a" }}>₦{currentPrice.toLocaleString()}</p>

                          {canEdit && (
                            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #f1f5f9" }}>
                              <label style={{ display: "block", marginBottom: 5, color: "#475569", fontSize: fz.xs, fontWeight: 500 }}>
                                {isChanged ? `Old: ₦${currentPrice.toLocaleString()}` : "New Price"}
                              </label>
                              <div style={{ display: "flex", gap: 6 }}>
                                <input
                                  type="text" inputMode="numeric"
                                  placeholder="Enter new price"
                                  value={pendingNewPrice !== undefined ? parseInt(pendingNewPrice).toLocaleString() : ""}
                                  onChange={e => handleChangePrice(area, product, e.target.value)}
                                  style={{ ...inputStyle, minHeight: 38, fontSize: fz.sm }}
                                />
                                {isChanged && (
                                  <button
                                    onClick={() => handleChangePrice(area, product, "")}
                                    style={{ padding: "6px 10px", background: "transparent", border: "1px solid #e2e8f0", borderRadius: 6, cursor: "pointer", color: "#94a3b8", flexShrink: 0 }}
                                    title="Cancel change"
                                  >
                                    <Icon icon="mdi:close" width={16} />
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {canEdit && (
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges()}
          style={{
            width: "100%", padding: "12px 16px",
            background: saving || !hasChanges() ? "#94a3b8" : "#0070f3",
            color: "white", border: "none", borderRadius: 8,
            cursor: saving || !hasChanges() ? "not-allowed" : "pointer",
            fontWeight: 600, fontSize: fz.md, minHeight: 44,
            transition: "opacity 0.2s", opacity: saving || !hasChanges() ? 0.7 : 1,
            marginBottom: 24,
          }}
        >
          {saving ? "Saving..." : `Save ${Object.keys(changedPrices).length} Change${Object.keys(changedPrices).length !== 1 ? "s" : ""}`}
        </button>
      )}

      {/* Price History */}
      <div style={{ background: "white", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
        <button
          onClick={() => setHistoryExpanded(!historyExpanded)}
          style={{
            width: "100%", padding: "16px 20px", background: "none", border: "none",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            cursor: "pointer", color: "#0f172a", fontSize: fz.lg, fontWeight: 600, textAlign: "left",
          }}
        >
          <span>Price History ({groupedHistory.length} changes)</span>
          <Icon icon={historyExpanded ? "mdi:chevron-up" : "mdi:chevron-down"} width={20} />
        </button>

        {historyExpanded && (
          <div style={{ padding: "0 20px 20px", borderTop: "1px solid #e2e8f0" }}>
            {groupedHistory.length === 0 ? (
              <p style={{ color: "#94a3b8", fontSize: fz.sm, textAlign: "center", padding: "20px 0" }}>No price changes yet.</p>
            ) : (
              groupedHistory.map(group => {
                const isGroupExpanded = expandedGroups.has(group.change_group_id)
                const first = group.items[0]
                const changedBy = first.changed_by ? profiles[first.changed_by] || "Unknown" : "System"
                const changedAt = new Date(first.changed_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })

                return (
                  <div key={group.change_group_id} style={{ borderBottom: "1px solid #f1f5f9", padding: "12px 0" }}>
                    <button
                      onClick={() => {
                        const next = new Set(expandedGroups)
                        if (next.has(group.change_group_id)) next.delete(group.change_group_id)
                        else next.add(group.change_group_id)
                        setExpandedGroups(next)
                      }}
                      style={{ width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}
                    >
                      <div>
                        <p style={{ margin: 0, color: "#0f172a", fontSize: fz.sm, fontWeight: 600 }}>Changed by {changedBy}</p>
                        <p style={{ margin: "2px 0 0", color: "#94a3b8", fontSize: fz.xs }}>{changedAt} · {group.items.length} product{group.items.length !== 1 ? "s" : ""}</p>
                      </div>
                      <Icon icon={isGroupExpanded ? "mdi:chevron-up" : "mdi:chevron-down"} width={18} color="#94a3b8" />
                    </button>
                    {isGroupExpanded && (
                      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                        {group.items.map(item => (
                          <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                              <span style={{ color: "#0f172a", fontSize: fz.sm, fontWeight: 500, whiteSpace: "nowrap" }}>{item.product}</span>
                              {item.area && <span style={{ color: "#94a3b8", fontSize: fz.xs, whiteSpace: "nowrap" }}>· {item.area}</span>}
                            </div>
                            <span style={{ color: "#64748b", fontSize: fz.sm, whiteSpace: "nowrap" }}>
                              ₦{item.old_price.toLocaleString()} → <strong style={{ color: "#0f172a" }}>₦{item.new_price.toLocaleString()}</strong>
                            </span>
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
