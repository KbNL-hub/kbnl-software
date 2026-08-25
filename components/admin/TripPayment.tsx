"use client"

import { useState, useEffect, useMemo } from "react"
import { Icon } from "@iconify/react"
import { supabase } from "@/lib/supabase"
import { apiMutate } from "@/lib/api-mutation"
import { usePermissions } from "@/lib/PermissionContext"
import { usePagination } from "@/lib/hooks/usePagination"
import { usePolling } from "@/lib/hooks/usePolling"
import PaginationControls from "@/components/PaginationControls"
import { LoadingState } from "@/components/admin/LoadingState"
import { EmptyState } from "@/components/admin/EmptyState"
import { useBreakpoint } from "@/app/hooks/useBreakpoint"
import { FONT_SIZE } from "@/lib/constants"

// 20 bags = 1 tonne across all truck sizes (20, 40/45, Dina, Tricycle)
const BAGS_PER_TONNE = 20

type Tab = "SC" | "MDD"

type ViewMode = "card" | "table"

type Notice = { type: "error" | "info" | "success"; text: string }

type TripPaymentRow = {
  id: string
  trip_id: string
  trip_type: Tab
  plate_number: string
  tonnage: number | null
  quantity_loaded: number
  value: number | null
  sc_rate: number | null
  location_id: string | null
  payment_expected: number | null
  created_at: string
  updated_at: string
  Trips?: {
    trip_status: string
    material_centre: string
    ATC: string | null
    order_no: string | null
    child_order_no: string | null
    driver_id: string | null
    product: string
  } | null
  locations?: { location: string; cost_per_ton: number } | null
  driver_name?: string
  stop_count?: number
}

type LocationRow = {
  id: string
  location: string
  cost_per_ton: number
}

type LocationDraft = { id?: string; location: string; cost_per_ton: string; removed?: boolean }

type TripDetail = {
  trip_id: string
  plate_number: string
  atc: string | null
  order_no: string | null
  child_order_no: string | null
  driver_name: string
  product: string
  material_centre: string
  created_at: string
  stop_count: number | null
}

type DriverRow = {
  driver_id: string
  full_name: string
}

function computeExpected(quantityLoaded: number, costPerTon: number): number {
  return Math.round(((quantityLoaded / BAGS_PER_TONNE) * costPerTon + Number.EPSILON) * 100) / 100
}

function formatMoney(n: number | null | undefined): string {
  if (n == null) return "—"
  return `₦${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

function formatDateTime(s: string): string {
  return new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

// Order no (with optional child) takes priority; ATC is the fallback
function formatTripRef(row: TripPaymentRow): string {
  if (row.Trips?.order_no) {
    return row.Trips.child_order_no ? `${row.Trips.order_no} / ${row.Trips.child_order_no}` : row.Trips.order_no
  }
  return row.Trips?.ATC || "—"
}

const STATUS_STYLES: Record<string, { color: string; bg: string }> = {
  "In transit": { color: "#0369a1", bg: "#f0f7ff" },
  "On hold": { color: "#b45309", bg: "#fffbeb" },
  Completed: { color: "#15803d", bg: "#f0fff4" },
}

const NOTICE_STYLES: Record<Notice["type"], { bg: string; border: string; color: string; icon: string }> = {
  error: { bg: "#fef2f2", border: "#fecaca", color: "#b91c1c", icon: "mdi:alert-circle" },
  info: { bg: "#eff6ff", border: "#bfdbfe", color: "#1d4ed8", icon: "mdi:information-outline" },
  success: { bg: "#f0fff4", border: "#86efac", color: "#166534", icon: "mdi:check-circle" },
}

function StatCard({ icon, tintBg, tintFg, label, value, sub }: {
  icon: string
  tintBg: string
  tintFg: string
  label: string
  value: string
  sub?: { text: string; color?: string }
}) {
  return (
    <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: tintBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon icon={icon} width={19} color={tintFg} />
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: FONT_SIZE.xs, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</p>
        <p style={{ margin: "2px 0 0", fontSize: FONT_SIZE.lg, fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</p>
        {sub && <p style={{ margin: "1px 0 0", fontSize: FONT_SIZE.xs, fontWeight: 600, color: sub.color || "#94a3b8" }}>{sub.text}</p>}
      </div>
    </div>
  )
}

export default function TripPayment() {
  const { getAccess } = usePermissions()
  const canEdit = getAccess("trip-payment").canEdit
  const isMobile = useBreakpoint() === "mobile"

  const [tab, setTab] = useState<Tab>("SC")
  const [rows, setRows] = useState<TripPaymentRow[]>([])
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [search, setSearch] = useState("")
  const [viewMode, setViewMode] = useState<ViewMode>(isMobile ? "card" : "table")

  // MDD pending edits: payment row id -> newly selected location id
  const [mddEdits, setMddEdits] = useState<Record<string, string>>({})
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())

  // Manage locations modal
  const [showLocationsModal, setShowLocationsModal] = useState(false)
  const [drafts, setDrafts] = useState<LocationDraft[]>([])
  const [savingLocations, setSavingLocations] = useState(false)

  // Trip details modal
  const [selectedTrip, setSelectedTrip] = useState<TripDetail | null>(null)

  // SC price modal
  const [scPriceId, setScPriceId] = useState<string | null>(null)
  const [scRate, setScRate] = useState<number>(600)
  const [showScPriceModal, setShowScPriceModal] = useState(false)
  const [scPriceDraft, setScPriceDraft] = useState("")
  const [savingScPrice, setSavingScPrice] = useState(false)

  async function fetchData(silent = false) {
    if (!silent) setLoading(true)
    const [paymentsRes, locationsRes, driversRes, stopsRes, scPriceRes] = await Promise.all([
      supabase
        .from("trip_payments")
        .select("*, Trips(trip_status, material_centre, ATC, order_no, child_order_no, driver_id, product), locations(location, cost_per_ton)")
        .order("created_at", { ascending: false })
        .limit(2000),
      supabase.from("locations").select("*").order("location", { ascending: true }),
      supabase.from("Drivers").select("driver_id, full_name"),
      supabase.from("Stops").select("trip_id"),
      supabase.from("sc_prices").select("id, rate_per_bag").limit(1).single(),
    ])
    const driverMap = new Map<string, string>()
    for (const d of (driversRes.data || []) as DriverRow[]) driverMap.set(d.driver_id, d.full_name)
    const stopCounts = new Map<string, number>()
    for (const s of (stopsRes.data || []) as { trip_id: string }[]) stopCounts.set(s.trip_id, (stopCounts.get(s.trip_id) || 0) + 1)
    const enriched = ((paymentsRes.data || []) as unknown as TripPaymentRow[]).map(r => ({
      ...r,
      driver_name: r.Trips?.driver_id ? driverMap.get(r.Trips.driver_id) || "—" : "—",
      stop_count: stopCounts.get(r.trip_id) ?? 0,
    }))
    const scRow = scPriceRes.data as { id: string; rate_per_bag: number } | null
    if (scRow) { setScPriceId(scRow.id); setScRate(Number(scRow.rate_per_bag) || 600) }
    setRows(enriched)
    setLocations((locationsRes.data || []) as LocationRow[])
    if (!silent) setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData()
  }, [])

  usePolling(() => fetchData(true), 120000)

  // Auto-dismiss success/info notices; errors stay until the next action
  useEffect(() => {
    if (!notice || notice.type === "error") return
    const timer = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(timer)
  }, [notice])

  function openLocationsModal() {
    setDrafts([
      ...locations.map(l => ({ id: l.id, location: l.location, cost_per_ton: String(l.cost_per_ton) })),
      { location: "", cost_per_ton: "" },
    ])
    setNotice(null)
    setShowLocationsModal(true)
  }

  function updateDraft(index: number, patch: Partial<LocationDraft>) {
    setDrafts(prev => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)))
    setNotice(null)
  }

  function removeNewDraft(index: number) {
    setDrafts(prev => prev.filter((_, i) => i !== index))
    setNotice(null)
  }

  function toggleRemoveDraft(draft: LocationDraft) {
    setDrafts(prev => prev.map(d => (d === draft ? { ...d, removed: !d.removed } : d)))
    setNotice(null)
  }

  function addDraftRow() {
    setDrafts(prev => [...prev, { location: "", cost_per_ton: "" }])
  }

  async function handleSaveLocations() {
    if (!canEdit || savingLocations) return
    const active = drafts.filter(d => !d.removed)
    const news = active.filter(d => !d.id)
    const updates = active.filter(d => d.id)
    const removals = drafts.filter(d => d.removed && d.id)

    if (news.some(d => !d.location.trim())) return setNotice({ type: "error", text: "Enter a name for every new location" })
    if ([...news, ...updates].some(d => d.cost_per_ton !== "" && isNaN(parseFloat(d.cost_per_ton)))) {
      return setNotice({ type: "error", text: "Cost per ton must be a valid number" })
    }
    if (news.length === 0 && updates.length === 0 && removals.length === 0) {
      setShowLocationsModal(false)
      return
    }

    setSavingLocations(true)
    setNotice(null)

    for (const d of updates) {
      const original = locations.find(l => l.id === d.id)
      const cost = d.cost_per_ton === "" ? 0 : parseFloat(d.cost_per_ton)
      if (original && original.location === d.location.trim() && original.cost_per_ton === cost) continue
      const { error } = await apiMutate("admin", {
        action: "update", table: "locations",
        data: { location: d.location.trim(), cost_per_ton: cost, updated_at: new Date().toISOString() },
        filters: { id: d.id },
      })
      if (error) { setSavingLocations(false); return setNotice({ type: "error", text: `Failed to update ${d.location}: ${error}` }) }
    }

    for (const d of news) {
      const { error } = await apiMutate("admin", {
        action: "insert", table: "locations",
        data: { location: d.location.trim(), cost_per_ton: d.cost_per_ton === "" ? 0 : parseFloat(d.cost_per_ton) },
      })
      if (error) { setSavingLocations(false); return setNotice({ type: "error", text: `Failed to add ${d.location}: ${error}` }) }
    }

    for (const d of removals) {
      const { error } = await apiMutate("admin", { action: "delete", table: "locations", filters: { id: d.id } })
      if (error) { setSavingLocations(false); return setNotice({ type: "error", text: `Failed to remove ${d.location}: ${error}` }) }
    }

    setSavingLocations(false)
    setShowLocationsModal(false)
    await fetchData()
    setNotice({ type: "success", text: "Locations updated" })
  }

  async function handleSaveScPrice() {
    if (!canEdit || savingScPrice || !scPriceId) return
    const rate = parseFloat(scPriceDraft)
    if (isNaN(rate) || rate <= 0) return setNotice({ type: "error", text: "Enter a valid price per bag" })
    setSavingScPrice(true)
    setNotice(null)
    const { error } = await apiMutate("admin", {
      action: "update", table: "sc_prices",
      data: { rate_per_bag: rate, updated_at: new Date().toISOString() },
      filters: { id: scPriceId },
    })
    setSavingScPrice(false)
    if (error) return setNotice({ type: "error", text: `Failed to update price: ${error}` })
    setShowScPriceModal(false)
    await fetchData()
    setNotice({ type: "success", text: `SC rate updated to ₦${rate.toLocaleString()}/bag` })
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r =>
      r.trip_type === tab &&
      (!q || r.plate_number.toLowerCase().includes(q)),
    )
  }, [rows, tab, search])

  const totals = useMemo(() => ({
    trips: filtered.length,
    bags: filtered.reduce((sum, r) => sum + (r.quantity_loaded || 0), 0),
    scValue: filtered.reduce((sum, r) => sum + (r.value || 0), 0),
    mddExpected: filtered.reduce((sum, r) => sum + (r.payment_expected ?? 0), 0),
    mddPending: filtered.filter(r => r.payment_expected == null).length,
  }), [filtered])

  const { page, setPage, totalPages, paginatedItems, totalItems } = usePagination(filtered)

  function switchTab(next: Tab) {
    setTab(next); setSearch(""); setPage(0); setMddEdits({}); setNotice(null)
  }

  function handleSelectLocation(paymentId: string, locationId: string) {
    setMddEdits(prev => {
      const next = { ...prev }
      if (locationId) next[paymentId] = locationId
      else delete next[paymentId]
      return next
    })
    setNotice(null)
  }

  async function handleUpdateExpected(row: TripPaymentRow) {
    if (!canEdit || savingIds.has(row.id)) return
    const locationId = mddEdits[row.id]
    if (!locationId) return

    const location = locations.find(l => l.id === locationId)
    if (!location) return setNotice({ type: "error", text: "Selected location not found" })

    setSavingIds(prev => new Set(prev).add(row.id))
    const { error } = await apiMutate("admin", {
      action: "update", table: "trip_payments",
      data: {
        location_id: locationId,
        payment_expected: computeExpected(row.quantity_loaded, location.cost_per_ton),
        updated_at: new Date().toISOString(),
      },
      filters: { id: row.id },
    })
    setSavingIds(prev => {
      const next = new Set(prev)
      next.delete(row.id)
      return next
    })
    if (error) return setNotice({ type: "error", text: `Failed to save: ${error}` })
    setMddEdits(prev => {
      const next = { ...prev }
      delete next[row.id]
      return next
    })
    await fetchData()
    setNotice({ type: "success", text: `Payment expected updated for ${row.plate_number}` })
  }

  function previewExpected(row: TripPaymentRow): number | null {
    const locationId = mddEdits[row.id] ?? row.location_id
    if (!locationId) return null
    const location = locations.find(l => l.id === locationId)
    return location ? computeExpected(row.quantity_loaded, location.cost_per_ton) : row.payment_expected
  }

  function openTripDetail(row: TripPaymentRow) {
    setSelectedTrip({
      trip_id: row.trip_id,
      plate_number: row.plate_number,
      atc: row.Trips?.ATC ?? null,
      order_no: row.Trips?.order_no ?? null,
      child_order_no: row.Trips?.child_order_no ?? null,
      driver_name: row.driver_name || "—",
      product: row.Trips?.product || "—",
      material_centre: row.Trips?.material_centre || "—",
      created_at: row.created_at,
      stop_count: row.stop_count ?? 0,
    })
  }

  const thStyle = { padding: "12px 16px", textAlign: "left" as const, fontSize: FONT_SIZE.xs, fontWeight: 600, color: "#64748b", textTransform: "uppercase" as const, letterSpacing: 0.5, whiteSpace: "nowrap" as const }
  const tdStyle = { padding: "12px 16px", fontSize: FONT_SIZE.sm, color: "#334155", verticalAlign: "middle" as const }
  const tdRight = { ...tdStyle, textAlign: "right" as const, fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap" as const }
  const selectStyle = { padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1", background: "white", fontSize: FONT_SIZE.sm, color: "#0f172a", width: "100%", minWidth: 170 }

  const statCards = tab === "SC"
    ? [
        { icon: "mdi:truck-outline", tintBg: "#eff6ff", tintFg: "#0369a1", label: "Trips", value: totals.trips.toLocaleString(), sub: undefined as { text: string; color?: string } | undefined },
        { icon: "mdi:package-variant", tintBg: "#fffbeb", tintFg: "#b45309", label: "Bags", value: totals.bags.toLocaleString(), sub: undefined },
        { icon: "mdi:currency-ngn", tintBg: "#f0fdf4", tintFg: "#16a34a", label: `Total Value`, value: formatMoney(totals.scValue), sub: undefined },
      ]
    : [
        { icon: "mdi:truck-outline", tintBg: "#eff6ff", tintFg: "#0369a1", label: "Trips", value: totals.trips.toLocaleString(), sub: undefined as { text: string; color?: string } | undefined },
        { icon: "mdi:package-variant", tintBg: "#fffbeb", tintFg: "#b45309", label: "Bags", value: totals.bags.toLocaleString(), sub: undefined },
        {
          icon: "mdi:currency-ngn", tintBg: "#f0fdf4", tintFg: "#16a34a", label: "Total Payment Expected", value: formatMoney(totals.mddExpected),
          sub: totals.mddPending > 0 ? { text: `${totals.mddPending} awaiting location`, color: "#b45309" } : { text: "All locations assigned", color: "#15803d" },
        },
      ]

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, color: "#0f172a", fontSize: "24px", fontWeight: 700 }}>Trip Payment</h2>
        <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.sm, color: "#64748b" }}>
          Payments for SC & MDD trips
        </p>
      </div>

      {/* Summary cards: value card full-width on top, trips + bags side-by-side below */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
        <StatCard {...statCards[2]} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <StatCard {...statCards[0]} />
          <StatCard {...statCards[1]} />
        </div>
      </div>

      {/* Trip type switcher */}
      <div style={{ display: "flex", background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 4, gap: 0, marginBottom: 24 }}>
        <button
          onClick={() => switchTab("SC")}
          style={{
            flex: 1, padding: "10px 16px",
            background: tab === "SC" ? "#0070f3" : "transparent",
            color: tab === "SC" ? "white" : "#64748b",
            border: "none", borderRadius: 8,
            cursor: "pointer", fontWeight: tab === "SC" ? 700 : 500,
            fontSize: FONT_SIZE.sm,
            transition: "all 0.2s ease",
            minHeight: 40,
          }}
        >
          SC
        </button>
        <button
          onClick={() => switchTab("MDD")}
          style={{
            flex: 1, padding: "10px 16px",
            background: tab === "MDD" ? "#0070f3" : "transparent",
            color: tab === "MDD" ? "white" : "#64748b",
            border: "none", borderRadius: 8,
            cursor: "pointer", fontWeight: tab === "MDD" ? 700 : 500,
            fontSize: FONT_SIZE.sm,
            transition: "all 0.2s ease",
            minHeight: 40,
          }}
        >
          MDD
        </button>
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div style={{ position: "relative", width: "100%", maxWidth: isMobile ? "none" : 320 }}>
          <Icon icon="mdi:magnify" width={18} color="#94a3b8" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
          <input
            type="text"
            className="tp-focus"
            placeholder="Search plate number…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0) }}
            style={{ width: "100%", padding: "10px 32px 10px 34px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: FONT_SIZE.sm, background: "white", color: "#0f172a" }}
          />
          {search && (
            <button onClick={() => { setSearch(""); setPage(0) }} aria-label="Clear search" className="btn-hover-opacity-8" style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 4, display: "flex" }}>
              <Icon icon="mdi:close-circle" width={16} />
            </button>
          )}
        </div>

        {/* Desktop: grouped on the right · Mobile: own row, toggle left / CTA right */}
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, marginLeft: "auto", ...(isMobile ? { width: "100%", justifyContent: "space-between" } : {}) }}>
          {!loading && paginatedItems.length > 0 && (
            <div style={{ display: "flex", background: "white", border: "1px solid #e2e8f0", borderRadius: 8, padding: 4, gap: 0, flexShrink: 0 }}>
              <button
                onClick={() => setViewMode("card")}
                style={{
                  padding: "8px 12px",
                  background: viewMode === "card" ? "#0070f3" : "transparent",
                  color: viewMode === "card" ? "white" : "#64748b",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: FONT_SIZE.xs,
                  fontWeight: 600,
                  minWidth: 44,
                  height: 40,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s"
                }}
                title="Card view"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z"/></svg>
              </button>
              <button
                onClick={() => setViewMode("table")}
                style={{
                  padding: "8px 12px",
                  background: viewMode === "table" ? "#0070f3" : "transparent",
                  color: viewMode === "table" ? "white" : "#64748b",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: FONT_SIZE.xs,
                  fontWeight: 600,
                  minWidth: 44,
                  height: 40,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s"
                }}
                title="Table view"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 4h18v2H3V4zm0 7h18v2H3v-2zm0 7h18v2H3v-2z"/></svg>
              </button>
            </div>
          )}

          {canEdit && tab === "MDD" && (
            <button onClick={openLocationsModal} className="btn-hover-opacity-8" style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", background: "#f5a623", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: FONT_SIZE.sm, minHeight: 40 }}>
              <Icon icon="mdi:map-marker-radius" width={16} /> Manage Locations
            </button>
          )}
          {canEdit && tab === "SC" && (
            <button onClick={() => { setScPriceDraft(String(scRate)); setShowScPriceModal(true) }} className="btn-hover-opacity-8" style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", background: "#f5a623", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: FONT_SIZE.sm, minHeight: 40 }}>
              <Icon icon="mdi:currency-ngn" width={16} /> Update Price
            </button>
          )}
        </div>
      </div>

      {/* Notice */}
      {notice && (
        <div role="status" style={{ padding: 12, background: NOTICE_STYLES[notice.type].bg, border: `1px solid ${NOTICE_STYLES[notice.type].border}`, borderRadius: 8, marginBottom: 16, color: NOTICE_STYLES[notice.type].color, fontSize: FONT_SIZE.sm, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon icon={NOTICE_STYLES[notice.type].icon} width={16} />{notice.text}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <LoadingState message="Loading trip payments…" />
      ) : paginatedItems.length === 0 ? (
        <EmptyState
          icon={<Icon icon="mdi:truck-check-outline" width={44} color="#cbd5e1" />}
          title={`No ${tab} trip payments yet`}
          description="Trips appear here automatically once drivers start them."
        />
      ) : (
        <>
          {/* Card View */}
          {viewMode === "card" && (
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
              {paginatedItems.map(row => {
                const status = row.Trips?.trip_status || ""
                const s = STATUS_STYLES[status] || { color: "#64748b", bg: "#f1f5f9" }
                const editedLocationId = mddEdits[row.id]
                const effectiveLocationId = editedLocationId ?? row.location_id ?? ""
                const hasUnsavedPick = editedLocationId != null && editedLocationId !== row.location_id
                const savedLocation = locations.find(l => l.id === row.location_id)
                const preview = previewExpected(row)
                const saving = savingIds.has(row.id)

                return (
                  <div key={row.id} style={{ background: "white", borderRadius: 12, padding: 20, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", transition: "all 0.2s ease" }} onMouseEnter={e => !isMobile && (e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)", e.currentTarget.style.borderColor = "#cbd5e1")} onMouseLeave={e => !isMobile && (e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)", e.currentTarget.style.borderColor = "#e2e8f0")}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <h3 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.lg, fontWeight: 700 }}>{row.plate_number}</h3>
                          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 12, background: tab === "SC" ? "#e0f2fe" : "#f3e5f5", color: tab === "SC" ? "#0369a1" : "#7c3aed", fontWeight: 700, border: `1px solid ${tab === "SC" ? "#7dd3fc" : "#d8b4fe"}` }}>{tab}</span>
                        </div>
                        {formatTripRef(row) !== "—" && (
                          <button
                            onClick={() => openTripDetail(row)}
                            className="btn-hover-opacity-8"
                            style={{ background: "none", border: "none", padding: 0, color: "#0070f3", cursor: "pointer", fontWeight: 500, fontSize: FONT_SIZE.xs, textDecoration: "underline", textUnderlineOffset: 2 }}
                            title="View trip details"
                          >
                            {formatTripRef(row)}
                          </button>
                        )}
                      </div>
                      <span style={{ padding: "4px 10px", borderRadius: 999, background: s.bg, color: s.color, fontSize: FONT_SIZE.xs, fontWeight: 700, whiteSpace: "nowrap" }}>
                        {status || "—"}
                      </span>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
                      <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px" }}>
                        <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#64748b" }}>Tonnage</p>
                        <p style={{ margin: "2px 0 0", fontWeight: 600, color: "#0f172a", fontSize: FONT_SIZE.md }}>{row.tonnage != null && row.tonnage > 0 ? `${Number(row.tonnage).toLocaleString()} T` : "—"}</p>
                      </div>
                      <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px" }}>
                        <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#64748b" }}>{tab === "SC" ? "Quantity Loaded" : "No. of Bags"}</p>
                        <p style={{ margin: "2px 0 0", fontWeight: 600, color: "#0f172a", fontSize: FONT_SIZE.md }}>{`${row.quantity_loaded.toLocaleString()} bags`}</p>
                      </div>
                      <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px" }}>
                        <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#64748b" }}>Stops</p>
                        <p style={{ margin: "2px 0 0", fontWeight: 600, color: "#0f172a", fontSize: FONT_SIZE.md }}>{row.stop_count ?? 0}</p>
                      </div>
                    </div>

                    {tab === "SC" ? (
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>
                        <span style={{ fontSize: FONT_SIZE.xs, color: "#16a34a", fontWeight: 600 }}>Value</span>
                        <span style={{ fontWeight: 700, color: "#15803d", fontSize: FONT_SIZE.md }}>{formatMoney(row.value)}</span>
                      </div>
                    ) : (
                      <>
                        <div style={{ marginBottom: 12 }}>
                          <p style={{ margin: "0 0 6px", fontSize: FONT_SIZE.xs, color: "#94a3b8", fontWeight: 500 }}>Location</p>
                          {!canEdit ? (
                            savedLocation
                              ? <p style={{ margin: 0, fontSize: FONT_SIZE.sm, fontWeight: 600, color: "#0f172a" }}>{savedLocation.location} <span style={{ fontWeight: 400, color: "#94a3b8" }}>· ₦{Number(savedLocation.cost_per_ton).toLocaleString()}/ton</span></p>
                              : <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#94a3b8" }}>—</p>
                          ) : locations.length === 0 ? (
                            <button onClick={openLocationsModal} className="btn-hover-opacity-8" style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 12px", borderRadius: 8, border: "1px dashed #cbd5e1", background: "white", color: "#0070f3", cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.xs }}>
                              <Icon icon="mdi:plus" width={13} /> Add locations
                            </button>
                          ) : (
                            <select
                              className="tp-focus"
                              value={effectiveLocationId}
                              onChange={e => handleSelectLocation(row.id, e.target.value)}
                              style={{ ...selectStyle, minWidth: 0 }}
                            >
                              <option value="">Select location…</option>
                              {locations.map(l => <option key={l.id} value={l.id}>{l.location} · ₦{Number(l.cost_per_ton).toLocaleString()}/ton</option>)}
                            </select>
                          )}
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, background: preview == null && !hasUnsavedPick ? "#fffbeb" : "#f0fdf4", border: `1px solid ${preview == null && !hasUnsavedPick ? "#fde68a" : "#bbf7d0"}`, borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>
                          <span style={{ fontSize: FONT_SIZE.xs, color: preview == null && !hasUnsavedPick ? "#b45309" : "#16a34a", fontWeight: 600 }}>Payment Expected</span>
                          {preview == null && !hasUnsavedPick ? (
                            <span style={{ padding: "4px 10px", borderRadius: 999, background: "white", color: "#b45309", fontSize: FONT_SIZE.xs, fontWeight: 700 }}>Awaiting location</span>
                          ) : (
                            <span title={hasUnsavedPick ? "Unsaved — click Update" : undefined} style={{ fontWeight: 700, color: hasUnsavedPick ? "#0070f3" : "#15803d", fontSize: FONT_SIZE.md }}>{formatMoney(preview)}</span>
                          )}
                        </div>

                        {canEdit && hasUnsavedPick && (
                          <button
                            onClick={() => handleUpdateExpected(row)}
                            disabled={saving}
                            aria-label={`Update payment expected for ${row.plate_number}`}
                            className="btn-hover-opacity-8"
                            style={{ width: "100%", justifyContent: "center", marginBottom: 14, padding: "9px 12px", borderRadius: 8, border: "none", background: saving ? "#93c5fd" : "#0070f3", color: "white", cursor: saving ? "not-allowed" : "pointer", fontWeight: 700, fontSize: FONT_SIZE.sm, display: "flex", alignItems: "center", gap: 6 }}
                          >
                            {saving
                              ? <><Icon icon="mdi:loading" width={14} className="tp-spin" /> Saving…</>
                              : <><Icon icon="mdi:check" width={14} /> Update Payment Expected</>}
                          </button>
                        )}
                      </>
                    )}

                    <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 10 }}>
                      <span style={{ fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>{formatDateTime(row.created_at)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Table View */}
          {viewMode === "table" && (
          <div style={{ overflowX: "auto", background: "white", border: "1px solid #e2e8f0", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: tab === "MDD" ? 900 : 780 }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                  <th style={thStyle}>Truck</th>
                  <th style={thStyle}>ATC / Order</th>
                  <th style={{ ...thStyle, textAlign: "right" as const }}>Tonnage</th>
                  <th style={{ ...thStyle, textAlign: "right" as const }}>{tab === "SC" ? "Quantity Loaded" : "No. of Bags"}</th>
                  {tab === "SC" ? (
                    <th style={{ ...thStyle, textAlign: "right" as const }}>Value</th>
                  ) : (
                    <>
                      <th style={thStyle}>Location</th>
                      <th style={{ ...thStyle, textAlign: "right" as const }}>Payment Expected</th>
                    </>
                  )}
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Status</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map(row => {
                  const status = row.Trips?.trip_status || ""
                  const s = STATUS_STYLES[status] || { color: "#64748b", bg: "#f1f5f9" }
                  const savedLocationId = row.location_id
                  const editedLocationId = mddEdits[row.id]
                  const effectiveLocationId = editedLocationId ?? savedLocationId ?? ""
                  const hasUnsavedPick = editedLocationId != null && editedLocationId !== savedLocationId
                  const savedLocation = locations.find(l => l.id === savedLocationId)
                  const preview = previewExpected(row)
                  const saving = savingIds.has(row.id)

                  return (
                    <tr key={row.id} className="tp-row" style={{ borderBottom: "1px solid #f1f5f9", transition: "background 0.15s ease" }}>
                      <td style={{ ...tdStyle, fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap" }}>{row.plate_number}</td>
                      <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                        {formatTripRef(row) === "—" ? (
                          <span style={{ color: "#94a3b8" }}>—</span>
                        ) : (
                          <button
                            onClick={() => openTripDetail(row)}
                            className="btn-hover-opacity-8"
                            style={{ background: "none", border: "none", padding: 0, color: "#0070f3", cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.sm, textDecoration: "underline", textUnderlineOffset: 3 }}
                          >
                            {formatTripRef(row)}
                          </button>
                        )}
                      </td>
                      <td style={tdRight}>{row.tonnage != null && row.tonnage > 0 ? `${Number(row.tonnage).toLocaleString()} T` : "—"}</td>
                      <td style={tdRight}>{`${row.quantity_loaded.toLocaleString()} bags`}</td>
                      {tab === "SC" ? (
                        <td style={tdRight}>{formatMoney(row.value)}</td>
                      ) : (
                        <>
                          <td style={tdStyle}>
                            {!canEdit ? (
                              savedLocation
                                ? <span style={{ fontWeight: 600, color: "#0f172a" }}>{savedLocation.location}</span>
                                : <span style={{ color: "#94a3b8" }}>—</span>
                            ) : locations.length === 0 ? (
                              <button onClick={openLocationsModal} className="btn-hover-opacity-8" style={{ display: "flex", alignItems: "center", gap: 4, padding: "7px 12px", borderRadius: 8, border: "1px dashed #cbd5e1", background: "white", color: "#0070f3", cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.xs }}>
                                <Icon icon="mdi:plus" width={13} /> Add locations
                              </button>
                            ) : (
                              <select
                                className="tp-focus"
                                value={effectiveLocationId}
                                onChange={e => handleSelectLocation(row.id, e.target.value)}
                                style={selectStyle}
                              >
                                <option value="">Select location…</option>
                                {locations.map(l => <option key={l.id} value={l.id}>{l.location} · ₦{Number(l.cost_per_ton).toLocaleString()}/ton</option>)}
                              </select>
                            )}
                            {savedLocation && canEdit && locations.length > 0 && (
                              <p style={{ margin: "4px 2px 0", fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>₦{Number(savedLocation.cost_per_ton).toLocaleString()}/ton</p>
                            )}
                          </td>
                          <td style={tdRight}>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                              {preview == null && !hasUnsavedPick ? (
                                <span style={{ padding: "4px 10px", borderRadius: 999, background: "#fffbeb", color: "#b45309", fontSize: FONT_SIZE.xs, fontWeight: 700, whiteSpace: "nowrap" }}>Awaiting location</span>
                              ) : (
                                <span title={hasUnsavedPick ? "Unsaved — click Update" : undefined} style={{ color: hasUnsavedPick ? "#0070f3" : "#0f172a" }}>{formatMoney(preview)}</span>
                              )}
                              {canEdit && hasUnsavedPick && (
                                <button
                                  onClick={() => handleUpdateExpected(row)}
                                  disabled={saving}
                                  aria-label={`Update payment expected for ${row.plate_number}`}
                                  className="btn-hover-opacity-8"
                                  style={{ padding: "7px 12px", borderRadius: 8, border: "none", background: saving ? "#93c5fd" : "#0070f3", color: "white", cursor: saving ? "not-allowed" : "pointer", fontWeight: 700, fontSize: FONT_SIZE.xs, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 4 }}
                                >
                                  {saving
                                    ? <Icon icon="mdi:loading" width={13} className="tp-spin" />
                                    : <Icon icon="mdi:check" width={13} />}
                                  Update
                                </button>
                              )}
                            </div>
                          </td>
                        </>
                      )}
                      <td style={{ ...tdStyle, whiteSpace: "nowrap", color: "#64748b", fontSize: FONT_SIZE.xs }}>{formatDateTime(row.created_at)}</td>
                      <td style={tdStyle}>
                        <span style={{ padding: "4px 10px", borderRadius: 999, background: s.bg, color: s.color, fontSize: FONT_SIZE.xs, fontWeight: 700, whiteSpace: "nowrap" }}>
                          {status || "—"}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: "#f8fafc", borderTop: "2px solid #e2e8f0" }}>
                  <td style={{ ...tdStyle, fontWeight: 700, color: "#0f172a" }}>{`${totals.trips.toLocaleString()} trips`}</td>
                  <td style={tdStyle} />
                  <td style={tdStyle} />
                  <td style={{ ...tdRight, textAlign: "right" as const }}>{`${totals.bags.toLocaleString()} bags`}</td>
                  {tab === "SC" ? (
                    <td style={{ ...tdRight, textAlign: "right" as const }}>{formatMoney(totals.scValue)}</td>
                  ) : (
                    <>
                      <td style={tdStyle}>
                        <span style={{ padding: "3px 10px", borderRadius: 999, background: totals.mddPending > 0 ? "#fffbeb" : "#f0fff4", color: totals.mddPending > 0 ? "#b45309" : "#15803d", fontSize: FONT_SIZE.xs, fontWeight: 700, whiteSpace: "nowrap" }}>
                          {totals.mddPending > 0 ? `${totals.mddPending} awaiting location` : "All assigned"}
                        </span>
                      </td>
                      <td style={{ ...tdRight, textAlign: "right" as const }}>{formatMoney(totals.mddExpected)}</td>
                    </>
                  )}
                  <td style={tdStyle} />
                  <td style={tdStyle} />
                </tr>
              </tfoot>
            </table>
          </div>
          )}
          <PaginationControls page={page} totalPages={totalPages} totalItems={totalItems} onPageChange={setPage} />
        </>
      )}

      {/* Manage Locations Modal */}
      {showLocationsModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Manage locations"
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => !savingLocations && setShowLocationsModal(false)}
        >
          <div style={{ background: "white", borderRadius: 14, width: "100%", maxWidth: 560, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 50px rgba(0,0,0,0.25)" }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: "18px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "white", zIndex: 1 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: FONT_SIZE.lg, fontWeight: 700, color: "#0f172a" }}>Manage Locations</h3>
                <p style={{ margin: "2px 0 0", fontSize: FONT_SIZE.xs, color: "#64748b" }}>Used to calculate MDD payment</p>
              </div>
              <button onClick={() => setShowLocationsModal(false)} disabled={savingLocations} aria-label="Close" className="btn-hover-opacity-8" style={{ background: "none", border: "none", cursor: savingLocations ? "not-allowed" : "pointer", color: "#64748b", padding: 4 }}>
                <Icon icon="mdi:close" width={20} />
              </button>
            </div>

            <div style={{ padding: 20 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 12, paddingLeft: 4 }}>
                <span style={{ flex: 1, fontSize: FONT_SIZE.xs, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4 }}>Location</span>
                <span style={{ width: 150, fontSize: FONT_SIZE.xs, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4 }}>Cost Per Ton (₦)</span>
                <span style={{ width: 34 }} />
              </div>

              {drafts.map((d, i) => (
                <div key={d.id ?? `new-${i}`} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                  <input
                    type="text"
                    className="tp-focus"
                    placeholder="e.g. Ugep"
                    value={d.location}
                    disabled={savingLocations || d.removed}
                    onChange={e => updateDraft(i, { location: e.target.value })}
                    style={{
                      flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: 8, border: d.removed ? "1px dashed #fecaca" : "1px solid #e2e8f0",
                      fontSize: FONT_SIZE.sm, background: d.id ? "#f8fafc" : "#f0fdf4", color: "#0f172a",
                      opacity: d.removed ? 0.55 : 1, textDecoration: d.removed ? "line-through" : "none",
                    }}
                  />
                  <input
                    type="number"
                    min={0}
                    step="any"
                    className="tp-focus"
                    placeholder="0"
                    value={d.cost_per_ton}
                    disabled={savingLocations || d.removed}
                    onChange={e => updateDraft(i, { cost_per_ton: e.target.value.replace(/[^0-9.]/g, "") })}
                    style={{ width: 150, padding: "10px 12px", borderRadius: 8, border: d.removed ? "1px dashed #fecaca" : "1px solid #e2e8f0", fontSize: FONT_SIZE.sm, background: d.id ? "#f8fafc" : "#f0fdf4", color: "#0f172a", opacity: d.removed ? 0.55 : 1 }}
                  />
                  {d.id ? (
                    <button
                      onClick={() => toggleRemoveDraft(d)}
                      disabled={savingLocations}
                      aria-label={d.removed ? `Undo removal of ${d.location}` : `Remove ${d.location}`}
                      title={d.removed ? "Undo removal" : "Remove location"}
                      className="btn-hover-opacity-8"
                      style={{ width: 34, height: 38, display: "flex", alignItems: "center", justifyContent: "center", background: d.removed ? "#eff6ff" : "#fef2f2", border: `1px solid ${d.removed ? "#bfdbfe" : "#fecaca"}`, borderRadius: 8, cursor: savingLocations ? "not-allowed" : "pointer", color: d.removed ? "#0070f3" : "#ef4444", flexShrink: 0 }}
                    >
                      <Icon icon={d.removed ? "mdi:undo-variant" : "mdi:trash-can-outline"} width={16} />
                    </button>
                  ) : (
                    <button
                      onClick={() => removeNewDraft(i)}
                      disabled={savingLocations}
                      aria-label="Discard new location row"
                      title="Discard row"
                      className="btn-hover-opacity-8"
                      style={{ width: 34, height: 38, display: "flex", alignItems: "center", justifyContent: "center", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, cursor: savingLocations ? "not-allowed" : "pointer", color: "#64748b", flexShrink: 0 }}
                    >
                      <Icon icon="mdi:close" width={16} />
                    </button>
                  )}
                </div>
              ))}

              <button onClick={addDraftRow} disabled={savingLocations} className="btn-hover-opacity-8" style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px dashed #cbd5e1", borderRadius: 8, padding: "10px 14px", cursor: savingLocations ? "not-allowed" : "pointer", color: "#0070f3", fontWeight: 700, fontSize: FONT_SIZE.sm, width: "100%", justifyContent: "center" }}>
                <Icon icon="mdi:plus" width={16} /> Add Another Location
              </button>
            </div>

            <div style={{ position: "sticky", bottom: 0, background: "white", borderTop: "1px solid #e2e8f0", padding: "14px 20px", display: "flex", gap: 10 }}>
              <button onClick={() => setShowLocationsModal(false)} disabled={savingLocations} className="btn-hover-opacity-8" style={{ flex: 1, padding: "12px 16px", borderRadius: 10, border: "1px solid #e2e8f0", background: "white", color: "#475569", cursor: savingLocations ? "not-allowed" : "pointer", fontWeight: 700, fontSize: FONT_SIZE.sm }}>
                Cancel
              </button>
              <button onClick={handleSaveLocations} disabled={savingLocations} className="btn-hover-opacity-8" style={{ flex: 1, padding: "12px 16px", borderRadius: 10, border: "none", background: savingLocations ? "#93c5fd" : "#0070f3", color: "white", cursor: savingLocations ? "not-allowed" : "pointer", fontWeight: 700, fontSize: FONT_SIZE.sm, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {savingLocations
                  ? <><Icon icon="mdi:loading" width={16} className="tp-spin" /> Saving…</>
                  : <><Icon icon="mdi:content-save-outline" width={16} /> Save Changes</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SC Price Modal */}
      {showScPriceModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Update SC price"
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => !savingScPrice && setShowScPriceModal(false)}
        >
          <div style={{ background: "white", borderRadius: 14, width: "100%", maxWidth: 400, boxShadow: "0 20px 50px rgba(0,0,0,0.25)" }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: "18px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: FONT_SIZE.lg, fontWeight: 700, color: "#0f172a" }}>SC Price Per Bag</h3>
                <p style={{ margin: "2px 0 0", fontSize: FONT_SIZE.xs, color: "#64748b" }}>Applied to all new SC trips</p>
              </div>
              <button onClick={() => setShowScPriceModal(false)} disabled={savingScPrice} aria-label="Close" className="btn-hover-opacity-8" style={{ background: "none", border: "none", cursor: savingScPrice ? "not-allowed" : "pointer", color: "#64748b", padding: 4 }}>
                <Icon icon="mdi:close" width={20} />
              </button>
            </div>

            <div style={{ padding: 20 }}>
              <label style={{ display: "block", marginBottom: 6, fontSize: FONT_SIZE.xs, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4 }}>Price per bag (₦)</label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: FONT_SIZE.sm, color: "#64748b", fontWeight: 600 }}>₦</span>
                <input
                  type="number"
                  min={1}
                  step="any"
                  className="tp-focus"
                  value={scPriceDraft}
                  disabled={savingScPrice}
                  onChange={e => setScPriceDraft(e.target.value.replace(/[^0-9.]/g, ""))}
                  style={{ width: "100%", padding: "10px 12px 10px 28px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: FONT_SIZE.sm, background: "white", color: "#0f172a", fontWeight: 600 }}
                  autoFocus
                />
              </div>
              <p style={{ margin: "8px 0 0", fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Current: ₦{scRate.toLocaleString()}/bag</p>
            </div>

            <div style={{ padding: "14px 20px", borderTop: "1px solid #e2e8f0", display: "flex", gap: 10 }}>
              <button onClick={() => setShowScPriceModal(false)} disabled={savingScPrice} className="btn-hover-opacity-8" style={{ flex: 1, padding: "12px 16px", borderRadius: 10, border: "1px solid #e2e8f0", background: "white", color: "#475569", cursor: savingScPrice ? "not-allowed" : "pointer", fontWeight: 700, fontSize: FONT_SIZE.sm }}>
                Cancel
              </button>
              <button onClick={handleSaveScPrice} disabled={savingScPrice} className="btn-hover-opacity-8" style={{ flex: 1, padding: "12px 16px", borderRadius: 10, border: "none", background: savingScPrice ? "#93c5fd" : "#0070f3", color: "white", cursor: savingScPrice ? "not-allowed" : "pointer", fontWeight: 700, fontSize: FONT_SIZE.sm, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {savingScPrice
                  ? <><Icon icon="mdi:loading" width={16} className="tp-spin" /> Saving…</>
                  : <><Icon icon="mdi:content-save-outline" width={16} /> Save Changes</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Trip Details Modal */}
      {selectedTrip && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Trip details"
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => setSelectedTrip(null)}
        >
          <div style={{ background: "white", borderRadius: 14, width: "100%", maxWidth: 440, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 50px rgba(0,0,0,0.25)" }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: "18px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "white", zIndex: 1 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: FONT_SIZE.lg, fontWeight: 700, color: "#0f172a" }}>Trip Details</h3>
                <p style={{ margin: "2px 0 0", fontSize: FONT_SIZE.xs, color: "#64748b" }}>{selectedTrip.plate_number}</p>
              </div>
              <button onClick={() => setSelectedTrip(null)} aria-label="Close" className="btn-hover-opacity-8" style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", padding: 4 }}>
                <Icon icon="mdi:close" width={20} />
              </button>
            </div>

            <div style={{ padding: 20 }}>
              {/* Reference block */}
              {selectedTrip.order_no || selectedTrip.atc ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
                  <Icon icon="mdi:file-document-outline" width={18} color="#0369a1" />
                  <div style={{ minWidth: 0 }}>
                    {selectedTrip.order_no ? (
                      <>
                        <p style={{ margin: 0, fontSize: FONT_SIZE.sm, fontWeight: 700, color: "#0f172a" }}>Order No: {selectedTrip.order_no}</p>
                        {selectedTrip.child_order_no && (
                          <p style={{ margin: "2px 0 0", fontSize: FONT_SIZE.sm, color: "#0369a1" }}>Child Order No: {selectedTrip.child_order_no}</p>
                        )}
                      </>
                    ) : (
                      <p style={{ margin: 0, fontSize: FONT_SIZE.sm, fontWeight: 700, color: "#0f172a" }}>ATC No: {selectedTrip.atc}</p>
                    )}
                  </div>
                </div>
              ) : null}

              {/* Detail rows */}
              <div style={{ display: "flex", flexDirection: "column" }}>
                {[
                  { icon: "mdi:account-outline", label: "Driver", value: selectedTrip.driver_name },
                  { icon: "mdi:truck-outline", label: "Truck", value: selectedTrip.plate_number },
                  { icon: "mdi:package-variant-closed", label: "Product", value: selectedTrip.product },
                  { icon: "mdi:map-marker-outline", label: "Loading Point", value: selectedTrip.material_centre },
                  { icon: "mdi:calendar-outline", label: "Date", value: formatDateTime(selectedTrip.created_at) },
                ].map(item => (
                  <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 4px", borderBottom: "1px solid #f1f5f9" }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Icon icon={item.icon} width={16} color="#64748b" />
                    </div>
                    <span style={{ width: 96, fontSize: FONT_SIZE.xs, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.4, flexShrink: 0 }}>{item.label}</span>
                    <span style={{ fontSize: FONT_SIZE.sm, fontWeight: 600, color: "#0f172a", wordBreak: "break-word" }}>{item.value}</span>
                  </div>
                ))}

                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 4px" }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Icon icon="mdi:map-marker-multiple-outline" width={16} color="#64748b" />
                    </div>
                    <span style={{ width: 96, fontSize: FONT_SIZE.xs, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.4, flexShrink: 0 }}>Stops</span>
                    <span style={{ padding: "3px 12px", borderRadius: 999, background: "#f0fdf4", color: "#15803d", fontSize: FONT_SIZE.sm, fontWeight: 700 }}>{selectedTrip.stop_count}</span>
                  </div>
              </div>
            </div>

            <div style={{ position: "sticky", bottom: 0, background: "white", borderTop: "1px solid #e2e8f0", padding: "14px 20px" }}>
              <button onClick={() => setSelectedTrip(null)} className="btn-hover-opacity-8" style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: "none", background: "#0070f3", color: "white", cursor: "pointer", fontWeight: 700, fontSize: FONT_SIZE.sm }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .tp-row:hover { background: #f8fafc; }
        .tp-spin { animation: spin 1s linear infinite; }
        .tp-focus:focus { outline: none; border-color: #0070f3; box-shadow: 0 0 0 3px rgba(0, 112, 243, 0.12); }
      `}</style>
    </div>
  )
}
