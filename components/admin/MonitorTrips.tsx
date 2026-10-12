"use client"

import { FONT_SIZE } from "@/lib/constants"
import { usePolling } from "@/lib/hooks/usePolling"
import CustomerSelector from "@/components/CustomerSelector"
import TripEditModal from "@/components/admin/TripEditModal"
import { fetchStores } from "@/lib/stores"

import { useState, useEffect, useCallback, useRef } from "react"
import PaginationControls from "@/components/PaginationControls"
import { Icon } from "@iconify/react"
import { supabase } from "@/lib/supabase"
import { selectInChunks } from "@/lib/supabase-batch"
import { fetchMonitorTripPage, type MonitorTripRow } from "@/lib/monitor-trips"
import { apiMutate } from "@/lib/api-mutation"
import { usePermissions } from "@/lib/PermissionContext"

type Stop = {
  stop_id: string
  stop_type: "customer" | "store"
  broker_id: string | null
  broker_name: string | null
  customer_id: string | null
  customer_name: string | null
  customer_phone: string | null
  quantity_offloaded: number
  latitude: number
  longitude: number
  stop_time: string
  stop_location: string
  store_name: string | null
  confirmed: boolean
  disputed: boolean
  dispute_reason: string | null
  confirmation_id: string | null
  confirmation_broker_id: string | null
  price_per_bag: number | null
  area: string | null
  company_price: number | null
  price_reason: string | null
  confirmed_at: string | null
  discount_status: string | null
  on_credit: boolean
  credit_approval_id: string | null
  credit_status: string | null
  is_credit_approved: boolean
}

type Discrepancy = {
  discrepancy_id: string
  shortage: number
  caked_bags: number
  notes: string | null
  reported_at: string
}

type LoadMoreEntry = {
  id: string
  quantity: number
  loading_point_type: string
  loading_point_name: string
  product: string
  created_at: string
}

type Trip = {
  trip_id: string
  plate_number: string
  driver_id: string
  driver_name: string
  driver_phone: string
  driver_status: string
  product: string
  material_centre: string
  loaded_quantity: number
  remaining: number
  stop_count: number
  stop_summary: StopSummary
  stops: Stop[]
  discrepancies: Discrepancy[]
  load_more_entries: LoadMoreEntry[]
  trip_status: string
  atc: string | null
  order_no: string | null
  child_order_no: string | null
  amount_charged: number | null
  payment_mode: string | null
  created_at: string
  completed_at: string | null
  isDD?: boolean
  recorded: boolean
  posted: boolean
  route_points: string[] | null
}

type ResolveStopForm = {
  stop_type: "customer" | "store"
  broker_id: string | null
  customer_id: string | null
  customer_name: string | null
  store_name: string | null
  quantity_offloaded: number
  stop_location: string
  stop_time: string
  isOriginal: boolean
  tempId: string
}

// Everything the list view needs to know about a trip's stops, computed from
// five columns instead of loading every stop row.
type StopSummary = {
  total: number
  confirmed: number
  pending: number
  disputed: number
  awaiting_review: number
  returned: number
}

function summariseStops(
  rows: { confirmed: boolean; disputed: boolean; discount_status: string | null }[],
): StopSummary {
  const summary: StopSummary = { total: rows.length, confirmed: 0, pending: 0, disputed: 0, awaiting_review: 0, returned: 0 }
  for (const row of rows) {
    const ds = row.discount_status ?? "none"
    if (row.disputed) summary.disputed += 1
    if (ds === "pending") summary.awaiting_review += 1
    else if (ds === "returned") summary.returned += 1
    else if (row.confirmed) summary.confirmed += 1
    else summary.pending += 1
  }
  return summary
}

type ViewMode = "card" | "table"

// The list query, kept in one object so that changing a filter and returning to
// page 1 are a single state update rather than two racing ones.
type ListQueryState = {
  status: string
  atc: string
  plate: string
  dateFrom: string
  dateTo: string
  page: number
}

const INITIAL_LIST_QUERY: ListQueryState = {
  status: "Active",
  atc: "",
  plate: "",
  dateFrom: "",
  dateTo: "",
  page: 0,
}

type StopConfirmation = {
  confirmation_id: string
  stop_id: string
  broker_id: string | null
  customer_id: string | null
  price_per_bag: number
  area: string | null
  company_price: number | null
  price_reason: string | null
  confirmed_at: string | null
}

type CreditApproval = { id: string; source_id: string; status: string; adjusted_price: number | null }

type FetchResult = { trips: Trip[]; pricingError: string | null }

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



const getPillStyle = (filter: string, isActive: boolean) => {
  if (!isActive) {
    return { bg: "white", textColor: "#64748b", borderColor: "#e2e8f0" }
  }
  
  if (filter === "All") {
    return { bg: "#171717", textColor: "white", borderColor: "#171717" }
  } else if (filter === "Active") {
    return { bg: "#eff6ff", textColor: "#0070f3", borderColor: "#0070f3" }
  } else if (filter === "Pending") {
    return { bg: "#fffbeb", textColor: "#f5a623", borderColor: "#f5a623" }
  } else if (filter === "Posted") {
    return { bg: "#f0fdf4", textColor: "#16a34a", borderColor: "#16a34a" }
  } else if (filter === "Disputed") {
    return { bg: "#fef2f2", textColor: "#ef4444", borderColor: "#ef4444" }
  }
  
  return { bg: "white", textColor: "#64748b", borderColor: "#e2e8f0" }
}

const filterOptions = ["All", "Active", "Pending", "Posted", "Disputed"]

export default function MonitorTrips() {
  const { isMobile } = useBreakpoint()
  const { getAccess } = usePermissions()
  const canEdit = getAccess("monitor-trips").canEdit
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState<ListQueryState>(INITIAL_LIST_QUERY)
  const [atcSearch, setAtcSearch] = useState("")
  const [plateSearch, setPlateSearch] = useState("")
  const [plateDropOpen, setPlateDropOpen] = useState(false)
  const [dateDropOpen, setDateDropOpen] = useState(false)
  const [dateMode, setDateMode] = useState<"single" | "range">("single")
  const hasActiveFilters = !!query.atc || !!query.plate || !!query.dateFrom || !!query.dateTo
  const [uniquePlates, setUniquePlates] = useState<string[]>([])
  const matchedPlates = plateSearch ? uniquePlates.filter(p => p.toLowerCase().includes(plateSearch.trim().toLowerCase())) : []
  const [viewMode, setViewMode] = useState<ViewMode>(isMobile ? "card" : "table")
  const [selectedDriver, setSelectedDriver] = useState<Pick<Trip, "driver_name" | "driver_phone" | "driver_status"> | null>(null)
  const [selectedStops, setSelectedStops] = useState<Stop[] | null>(null)
  const [selectedDiscrepancies, setSelectedDiscrepancies] = useState<Discrepancy[]>([])
  const [selectedLoadMore, setSelectedLoadMore] = useState<LoadMoreEntry[]>([])
  const [selectedPlate, setSelectedPlate] = useState("")
  const [selectedTrip, setSelectedTrip] = useState<Pick<Trip, "trip_id" | "plate_number" | "product" | "atc" | "order_no" | "child_order_no" | "amount_charged" | "payment_mode" | "trip_status" | "recorded" | "posted" | "isDD" | "remaining" | "loaded_quantity"> | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [postingTrip, setPostingTrip] = useState<string | null>(null)
  const [postLoading, setPostLoading] = useState(false)
  const [postError, setPostError] = useState("")
  const [resolvingDisputeReason, setResolvingDisputeReason] = useState<string | null>(null)
  const [resolvingStops, setResolvingStops] = useState<ResolveStopForm[]>([])
  const [resolveSubmitting, setResolveSubmitting] = useState(false)
  const [resolveLoading, setResolveLoading] = useState(false)
  const [resolveMessage, setResolveMessage] = useState("")
  const [listTotal, setListTotal] = useState(0)
  const [listStats, setListStats] = useState({ pending_record: 0, disputed_trip: 0 })
  const [allBrokers, setAllBrokers] = useState<{ broker_id: string; broker_name: string }[]>([])
  const [storeLocations, setStoreLocations] = useState<string[]>([])
  const [resolvingTripId, setResolvingTripId] = useState<string | null>(null)
  const [resolveOriginalQuantity, setResolveOriginalQuantity] = useState(0)
  const [showActionsDropdown, setShowActionsDropdown] = useState(false)
  const [isEditingTrip, setIsEditingTrip] = useState(false)
  const [pricingError, setPricingError] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailFailed, setDetailFailed] = useState(false)
  // Tracks which trip the modal is showing so the in-flight fetch in
  // openTripDetails can tell whether the modal has since been pointed
  // somewhere else.
  const detailTripIdRef = useRef<string | null>(null)
  // Incremented per list request so a slow response cannot overwrite the page
  // a newer request already loaded.
  const listSeqRef = useRef(0)
  const [serverQueryUnavailable, setServerQueryUnavailable] = useState(false)
  // Latched once the RPC is found so a transient error does not silently flip
  // the page back to the heavier browser-side query.
  const serverQueryRef = useRef(true)

// The list only renders per-trip counters, so stops are fetched as five
// aggregate columns. Everything stop-shaped (prices, broker/customer names,
// coordinates, confirmations) is loaded on demand for a single trip by
// fetchTripDetail when the user opens it.
async function fetchTrips(): Promise<FetchResult> {
  const { data: tripsData, error } = await supabase
    .from("Trips")
    .select("trip_id, plate_number, driver_id, product, material_centre, loaded_quantity, trip_status, ATC, order_no, child_order_no, amount_charged, payment_mode, created_at, updated_at, recorded, posted")
    .order("created_at", { ascending: false })

  if (error || !tripsData) return { trips: [], pricingError: null }

  const tripIds = tripsData.map(t => t.trip_id)

  const driverIds = tripsData.map(t => t.driver_id).filter(Boolean)
  const driverMap = new Map<string, { full_name: string; phone_number: string; status: string }>()
  if (driverIds.length > 0) {
    const { data: driversData } = await supabase
      .from("Drivers")
      .select("driver_id, full_name, phone_number, status")
      .in("driver_id", driverIds)
    for (const d of driversData || []) driverMap.set(d.driver_id, d)
  }

  const [stopsResult, discResult, loadMoreResult] = await Promise.all([
    selectInChunks(
      ids => supabase
        .from("Stops")
        .select("trip_id, quantity_offloaded, confirmed, disputed, discount_status")
        .in("trip_id", ids),
      tripIds,
    ),
    selectInChunks(
      ids => supabase
        .from("trip_discrepancies")
        .select("trip_id, shortage, caked_bags")
        .in("trip_id", ids),
      tripIds,
    ),
    selectInChunks(
      ids => supabase
        .from("trip_load_more")
        .select("id, trip_id, quantity, loading_point_type, loading_point_name, product, created_at")
        .in("trip_id", ids),
      tripIds,
    ),
  ])

  if (stopsResult.error) console.error("Failed to load trip stops", stopsResult.error)

  const stopsByTrip = new Map<string, typeof stopsResult.data>()
  for (const stop of stopsResult.data) {
    if (!stopsByTrip.has(stop.trip_id)) stopsByTrip.set(stop.trip_id, [])
    stopsByTrip.get(stop.trip_id)!.push(stop)
  }

  const discTotalsByTrip = new Map<string, { shortage: number; caked: number }>()
  for (const d of discResult.data) {
    const cur = discTotalsByTrip.get(d.trip_id) ?? { shortage: 0, caked: 0 }
    cur.shortage += d.shortage || 0
    cur.caked += d.caked_bags || 0
    discTotalsByTrip.set(d.trip_id, cur)
  }

  const loadMoreByTrip = new Map<string, LoadMoreEntry[]>()
  for (const lm of loadMoreResult.data) {
    if (!loadMoreByTrip.has(lm.trip_id)) loadMoreByTrip.set(lm.trip_id, [])
    loadMoreByTrip.get(lm.trip_id)!.push(lm)
  }

  const enriched: Trip[] = tripsData.map((trip) => {
    const driver = driverMap.get(trip.driver_id)
    const stopsRaw = stopsByTrip.get(trip.trip_id) || []
    const discTotals = discTotalsByTrip.get(trip.trip_id) ?? { shortage: 0, caked: 0 }

    const totalOffloaded = stopsRaw.reduce((sum, s) => sum + (s.quantity_offloaded || 0), 0)

    return {
      trip_id: trip.trip_id,
      plate_number: trip.plate_number,
      driver_id: trip.driver_id,
      driver_name: driver?.full_name ?? "Unknown",
      driver_phone: driver?.phone_number ?? "—",
      driver_status: driver?.status ?? "—",
      product: trip.product,
      material_centre: trip.material_centre,
      loaded_quantity: trip.loaded_quantity,
      remaining: trip.loaded_quantity - totalOffloaded - discTotals.shortage - discTotals.caked,
      stop_count: stopsRaw.length,
      stop_summary: summariseStops(stopsRaw),
      stops: [],
      discrepancies: [],
      load_more_entries: loadMoreByTrip.get(trip.trip_id) ?? [],
      trip_status: trip.trip_status,
      atc: trip.ATC ?? null,
      order_no: trip.order_no ?? null,
      child_order_no: trip.child_order_no ?? null,
      amount_charged: trip.amount_charged ?? null,
      payment_mode: trip.payment_mode ?? null,
      created_at: trip.created_at,
      completed_at: trip.trip_status === "Completed" ? trip.updated_at ?? null : null,
      recorded: trip.recorded ?? false,
      posted: trip.posted ?? false,
      route_points: null,
    }
  })

  return { trips: enriched, pricingError: null }
}

async function fetchDdTrips(): Promise<FetchResult> {
  const { data: ddTripsData, error } = await supabase
    .from("dd_trips")
    .select("dd_trip_id, plate_number, driver_name, driver_phone, product, loading_point, loaded_quantity, trip_status, atc, order_no, child_order_no, route_points, created_at, recorded, posted, posted_at")
    .order("created_at", { ascending: false })

  if (error || !ddTripsData) return { trips: [], pricingError: null }

  const ddTripIds = ddTripsData.map(t => t.dd_trip_id)

  const [ddStopsResult, ddDiscResult, ddLoadMoreResult] = await Promise.all([
    selectInChunks(
      ids => supabase
        .from("Stops")
        .select("trip_id, quantity_offloaded, confirmed, disputed, discount_status")
        .in("trip_id", ids),
      ddTripIds,
    ),
    selectInChunks(
      ids => supabase
        .from("trip_discrepancies")
        .select("trip_id, shortage, caked_bags")
        .in("trip_id", ids),
      ddTripIds,
    ),
    selectInChunks(
      ids => supabase
        .from("trip_load_more")
        .select("id, trip_id, quantity, loading_point_type, loading_point_name, product, created_at")
        .in("trip_id", ids),
      ddTripIds,
    ),
  ])

  if (ddStopsResult.error) console.error("Failed to load side trip stops", ddStopsResult.error)

  const stopsByTrip = new Map<string, typeof ddStopsResult.data>()
  for (const stop of ddStopsResult.data) {
    if (!stopsByTrip.has(stop.trip_id)) stopsByTrip.set(stop.trip_id, [])
    stopsByTrip.get(stop.trip_id)!.push(stop)
  }

  const discTotalsByTrip = new Map<string, { shortage: number; caked: number }>()
  for (const d of ddDiscResult.data) {
    const cur = discTotalsByTrip.get(d.trip_id) ?? { shortage: 0, caked: 0 }
    cur.shortage += d.shortage || 0
    cur.caked += d.caked_bags || 0
    discTotalsByTrip.set(d.trip_id, cur)
  }

  const loadMoreByTrip = new Map<string, LoadMoreEntry[]>()
  for (const lm of ddLoadMoreResult.data) {
    if (!loadMoreByTrip.has(lm.trip_id)) loadMoreByTrip.set(lm.trip_id, [])
    loadMoreByTrip.get(lm.trip_id)!.push(lm)
  }

  const ddTrips: Trip[] = ddTripsData.map((ddTrip) => {
    const stopsRaw = stopsByTrip.get(ddTrip.dd_trip_id) || []
    const discTotals = discTotalsByTrip.get(ddTrip.dd_trip_id) ?? { shortage: 0, caked: 0 }

    const totalOffloaded = stopsRaw.reduce((sum, s) => sum + (s.quantity_offloaded || 0), 0)

    return {
      trip_id: ddTrip.dd_trip_id,
      plate_number: ddTrip.plate_number,
      driver_id: "",
      driver_name: ddTrip.driver_name ?? "DD Driver",
      driver_phone: ddTrip.driver_phone ?? "—",
      driver_status: "Active",
      product: ddTrip.product,
      material_centre: ddTrip.loading_point,
      loaded_quantity: ddTrip.loaded_quantity,
      remaining: ddTrip.loaded_quantity - totalOffloaded - discTotals.shortage - discTotals.caked,
      stop_count: stopsRaw.length,
      stop_summary: summariseStops(stopsRaw),
      stops: [],
      discrepancies: [],
      load_more_entries: loadMoreByTrip.get(ddTrip.dd_trip_id) ?? [],
      trip_status: ddTrip.trip_status,
      atc: ddTrip.atc ?? null,
      order_no: ddTrip.order_no ?? null,
      child_order_no: ddTrip.child_order_no ?? null,
      amount_charged: null,
      payment_mode: null,
      created_at: ddTrip.created_at,
      completed_at: ddTrip.trip_status === "Completed" ? ddTrip.posted_at ?? null : null,
      isDD: true,
      recorded: ddTrip.recorded ?? false,
      posted: ddTrip.posted ?? false,
      route_points: ddTrip.route_points ?? null,
    }
  })

  return { trips: ddTrips, pricingError: null }
}


  // Loads everything the stops-detail modal needs for exactly one trip: full
  // stop rows, their confirmations, and the credit/customers/brokers needed to
  // label them. Runs on click rather than on every poll.
  async function fetchTripDetail(tripId: string): Promise<{ stops: Stop[]; discrepancies: Discrepancy[]; pricingError: string | null }> {
    const { data: allStopsRaw, error: stopsError } = await supabase
      .from("Stops")
      .select("stop_id, trip_id, quantity_offloaded, latitude, longitude, stop_time, stop_location, broker_id, customer_id, confirmed, disputed, dispute_reason, store_name, stop_type, discount_status, on_credit, credit_approval_id")
      .eq("trip_id", tripId)
      .order("stop_time", { ascending: true })

    // A failed read must not look like a trip with no stops, so let it reach
    // openTripDetails' catch rather than degrading to an empty list.
    if (stopsError) throw stopsError

    const allStops = allStopsRaw ?? []
    const stopIds = allStops.map(s => s.stop_id).filter(Boolean)

    const brokerIds = [...new Set(allStops.filter(s => s.stop_type === "customer").map(s => s.broker_id).filter(Boolean))]
    const customerIds = [...new Set(allStops.filter(s => s.stop_type === "customer" && s.customer_id).map(s => s.customer_id).filter(Boolean))]

    const [brokerRes, customerRes, confirmationsRes, creditRes, discRes] = await Promise.all([
      brokerIds.length > 0
        ? supabase.from("Brokers").select("broker_id, broker_name").in("broker_id", brokerIds)
        : Promise.resolve({ data: [], error: null }),
      customerIds.length > 0
        ? supabase.from("Customers").select("customer_id, full_name, phone_number").in("customer_id", customerIds)
        : Promise.resolve({ data: [], error: null }),
      stopIds.length > 0
        ? selectInChunks<StopConfirmation>(
            ids => supabase
              .from("Stop_Confirmations")
              .select("confirmation_id, stop_id, broker_id, customer_id, price_per_bag, area, company_price, price_reason, confirmed_at")
              .in("stop_id", ids)
              .order("confirmed_at", { ascending: false }),
            stopIds,
          )
        : Promise.resolve({ data: [] as StopConfirmation[], error: null }),
      stopIds.length > 0
        ? selectInChunks(
            ids => supabase
              .from("credit_approvals")
              .select("id, source_id, status, adjusted_price")
              .eq("source_type", "stop")
              .in("source_id", ids),
            stopIds,
          )
        : Promise.resolve({ data: [] as CreditApproval[], error: null }),
      supabase
        .from("trip_discrepancies")
        .select("discrepancy_id, trip_id, shortage, caked_bags, notes, reported_at")
        .eq("trip_id", tripId)
        .order("reported_at", { ascending: true }),
    ])

    // Same reasoning as the Stops read: a failed query must not read as
    // "this trip reported no discrepancies".
    if (discRes.error) throw discRes.error

    const brokerMap = new Map<string, string>((brokerRes.data ?? []).map(b => [b.broker_id, b.broker_name]))
    const customerMap = new Map<string, { full_name: string; phone_number: string | null }>(
      (customerRes.data ?? []).map(c => [c.customer_id, c])
    )
    const confirmationMap = new Map<string, StopConfirmation>()
    for (const c of confirmationsRes.data) {
      if (!confirmationMap.has(c.stop_id)) confirmationMap.set(c.stop_id, c)
    }
    const creditApprovalMap = new Map<string, CreditApproval>()
    for (const ca of creditRes.data) creditApprovalMap.set(ca.source_id, ca)

    const pricingErrors: string[] = []
    if (confirmationsRes.error) {
      console.error("Failed to load stop prices", confirmationsRes.error)
      pricingErrors.push("stop prices")
    }
    if (creditRes.error) {
      console.error("Failed to load credit approvals", creditRes.error)
      pricingErrors.push("credit approvals")
    }

    const stops: Stop[] = allStops.map((stop) => {
      let broker_name = null
      let customer_name = null
      let customer_phone = null

      if (stop.stop_type === "customer") {
        const broker = stop.broker_id ? brokerMap.get(stop.broker_id) : undefined
        broker_name = broker ?? "Unknown"

        if (stop.customer_id) {
          const customer = customerMap.get(stop.customer_id)
          customer_name = customer?.full_name ?? "Not provided"
          customer_phone = customer?.phone_number ?? null
        } else {
          customer_name = "Not provided"
        }
      }

      const confirmation = confirmationMap.get(stop.stop_id)
      const creditApproval = creditApprovalMap.get(stop.stop_id)

      return {
        stop_id: stop.stop_id,
        stop_type: stop.stop_type,
        broker_id: stop.broker_id ?? null,
        broker_name,
        customer_id: stop.customer_id ?? null,
        customer_name,
        customer_phone,
        quantity_offloaded: stop.quantity_offloaded,
        latitude: stop.latitude,
        longitude: stop.longitude,
        stop_time: stop.stop_time,
        stop_location: stop.stop_location,
        store_name: stop.store_name ?? null,
        confirmed: stop.confirmed,
        disputed: stop.disputed,
        dispute_reason: stop.dispute_reason,
        confirmation_id: confirmation?.confirmation_id ?? null,
        confirmation_broker_id: confirmation?.broker_id ?? null,
        price_per_bag: confirmation?.price_per_bag ?? null,
        area: confirmation?.area ?? null,
        company_price: confirmation?.company_price ?? null,
        price_reason: confirmation?.price_reason ?? null,
        confirmed_at: confirmation?.confirmed_at ?? null,
        discount_status: stop.discount_status ?? "none",
        on_credit: stop.on_credit || !!creditApproval,
        credit_approval_id: stop.credit_approval_id ?? creditApproval?.id ?? null,
        credit_status: creditApproval?.status ?? null,
        is_credit_approved: creditApproval?.status === "Approved",
      }
    })

    return {
      stops,
      discrepancies: (discRes.data ?? []) as Discrepancy[],
      pricingError: pricingErrors.length > 0 ? pricingErrors.join(" and ") : null,
    }
  }

// Shape returned by list_monitor_trips into the Trip the render code expects.
// stops/discrepancies stay empty here; they are fetched for one trip on click.
function toTrip(row: MonitorTripRow): Trip {
  return {
    trip_id: row.trip_id,
    plate_number: row.plate_number,
    driver_id: row.driver_id ?? "",
    driver_name: row.driver_name,
    driver_phone: row.driver_phone,
    driver_status: row.driver_status,
    product: row.product,
    material_centre: row.material_centre,
    loaded_quantity: Number(row.loaded_quantity),
    remaining: Number(row.remaining),
    stop_count: row.stop_count,
    stop_summary: row.stop_summary,
    stops: [],
    discrepancies: [],
    load_more_entries: (row.load_more ?? []) as LoadMoreEntry[],
    trip_status: row.trip_status,
    atc: row.atc,
    order_no: row.order_no,
    child_order_no: row.child_order_no,
    amount_charged: row.amount_charged,
    payment_mode: row.payment_mode,
    created_at: row.created_at,
    completed_at: row.completed_at,
    isDD: row.is_dd,
    recorded: row.recorded,
    posted: row.posted,
    route_points: row.route_points,
  }
}

// "ok"          fresh response applied
// "stale"       superseded by a newer request; leave state alone
// "unavailable" the RPC is not installed; the caller should use the legacy path
// "error"       the query failed; keep the rows already on screen
type ListLoadOutcome = "ok" | "stale" | "unavailable" | "error"

const loadServerPage = useCallback(async (): Promise<ListLoadOutcome> => {
  const seq = ++listSeqRef.current
  const result = await fetchMonitorTripPage({
    status: query.status,
    search: query.atc,
    plate: query.plate,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    dateMode,
    page: query.page,
  })

  // A filter, page change or poll may have superseded this request while it was
  // in flight; applying it now would show the wrong page.
  if (seq !== listSeqRef.current) return "stale"

  if (!result.ok) {
    if (result.unavailable) {
      serverQueryRef.current = false
      setServerQueryUnavailable(true)
      return "unavailable"
    }
    console.error("Monitor trips query failed", result.error)
    return "error"
  }

  setTrips(result.data.items.map(toTrip))
  setListTotal(result.data.total)
  setListStats(result.data.stats)
  setUniquePlates(result.data.plates)
  return "ok"
}, [query.status, query.atc, query.plate, query.dateFrom, query.dateTo, query.page, dateMode])

// Browser-side path used when migration 060 has not been applied yet. Pulls
// every trip and filters here, exactly as the page did before.
const loadBrowserPage = useCallback(async () => {
  const [normal, dd] = await Promise.all([
    fetchTrips().catch(() => ({ trips: [] as Trip[], pricingError: null })),
    fetchDdTrips().catch(() => ({ trips: [] as Trip[], pricingError: null })),
  ])
  const ddTripIds = new Set(dd.trips.map(t => t.trip_id))
  const allTrips = [...normal.trips.filter(t => !ddTripIds.has(t.trip_id)), ...dd.trips]
  setTrips(allTrips)
  setPricingError(normal.pricingError ?? dd.pricingError)
  setUniquePlates([...new Set(allTrips.map(t => t.plate_number))].sort())
  setListStats({
    pending_record: allTrips.filter(t => !t.recorded).length,
    disputed_trip: allTrips.filter(t => t.stop_summary.disputed > 0).length,
  })
  return true
}, [])

const loadAll = useCallback(async () => {
  // Await first so that no setState can run synchronously in the mount effect.
  const outcome: ListLoadOutcome = serverQueryRef.current ? await loadServerPage() : "unavailable"

  if (outcome !== "unavailable") {
    // "stale" was superseded by a newer request and "error" is transient, so
    // both keep the rows already on screen.
    if (outcome === "ok") setLastUpdated(new Date())
    setLoading(false)
    return
  }

  // Only a missing function is worth re-reading every trip for.
  await loadBrowserPage()
  setLastUpdated(new Date())
  setLoading(false)
}, [loadServerPage, loadBrowserPage])

  // Opens the stops modal immediately from the summary already in memory, then
  // fills in the detail for that one trip. Stops, prices and customer names are
  // no longer carried on every poll.
  async function openTripDetails(trip: Trip) {
    setSelectedPlate(trip.plate_number)
    setSelectedTrip({
      trip_id: trip.trip_id,
      plate_number: trip.plate_number,
      product: trip.product,
      atc: trip.atc,
      order_no: trip.order_no,
      child_order_no: trip.child_order_no,
      amount_charged: trip.amount_charged,
      payment_mode: trip.payment_mode,
      trip_status: trip.trip_status,
      recorded: trip.recorded,
      posted: trip.posted,
      isDD: trip.isDD,
      remaining: trip.remaining,
      loaded_quantity: trip.loaded_quantity,
    })
    setSelectedStops([])
    setSelectedDiscrepancies([])
    // fetchTripDetail does not load additional loads; the list already carries
    // them, so clearing this would hide them from the modal for good.
    setSelectedLoadMore(trip.load_more_entries)
    setPricingError(null)
    setPostError("")
    setDetailFailed(false)
    setShowActionsDropdown(false)
    detailTripIdRef.current = trip.trip_id
    setDetailLoading(true)

    try {
      const detail = await fetchTripDetail(trip.trip_id)
      // A poll may have swapped the list out from under us while this was in
      // flight; only apply the result if the modal is still on the same trip.
      if (detailTripIdRef.current !== trip.trip_id) return
      setSelectedStops(detail.stops)
      setSelectedDiscrepancies(detail.discrepancies)
      setPricingError(detail.pricingError)
    } catch (err) {
      console.error("Failed to load trip detail", err)
      // The modal renders its own message for this, so postError stays
      // reserved for action-level failures such as Record Trip.
      if (detailTripIdRef.current === trip.trip_id) {
        setDetailFailed(true)
      }
    } finally {
      if (detailTripIdRef.current === trip.trip_id) setDetailLoading(false)
    }
  }


  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Text filters now cost a round trip, so debounce them before they are
  // applied to the query. The timeout keeps the setState out of the effect
  // body, which would otherwise trigger a cascading render.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(prev => {
        if (prev.atc === atcSearch && prev.plate === plateSearch) return prev
        return { ...prev, atc: atcSearch, plate: plateSearch, page: 0 }
      })
    }, 350)
    return () => clearTimeout(timer)
  }, [atcSearch, plateSearch])

  usePolling(loadAll, 120000)

  function handlePostTripClick() {
    if (!selectedStops || !selectedTrip) return
    if (pricingError) {
      setPostError(`Couldn't load ${pricingError}, so prices can't be verified. Retry in a moment.`)
      return
    }
    const allConfirmed = selectedStops.length > 0
      && selectedStops.every((s) => s.confirmed)
      && !selectedStops.some((s) => s.disputed)
      && selectedStops.every((s) => s.stop_type === "store" || (s.price_per_bag !== null && s.price_per_bag > 0))
      && selectedTrip.remaining === 0
    if (!allConfirmed) return
    setPostError("")
    setPostingTrip(selectedTrip.trip_id)
  }

  // Fetch brokers and stores for the resolve modal
async function fetchResolveData() {
    if (allBrokers.length === 0) {
      const { data } = await supabase.from("Brokers").select("broker_id, broker_name").order("broker_name")
      setAllBrokers(data || [])
    }
    if (storeLocations.length === 0) {
      const stores = await fetchStores()
      setStoreLocations(stores)
    }
  }

  async function openResolveModal(stop: Stop, tripId: string) {
    setResolveLoading(true)
    await fetchResolveData()
    setResolvingTripId(tripId)
    setResolvingDisputeReason(stop.dispute_reason)
    setResolveOriginalQuantity(stop.quantity_offloaded)

    const initialStop: ResolveStopForm = {
      stop_type: stop.stop_type,
      broker_id: stop.broker_id,
      customer_id: stop.customer_id,
      customer_name: stop.customer_name,
      store_name: stop.store_name,
      quantity_offloaded: stop.quantity_offloaded,
      stop_location: stop.stop_location,
      stop_time: stop.stop_time,
      isOriginal: true,
      tempId: stop.stop_id,
    }
    setResolvingStops([initialStop])
    setResolveMessage("")
    setResolveLoading(false)
  }

  function closeResolveModal() {
    setResolvingStops([])
    setResolveMessage("")
    setResolvingTripId(null)
    setResolvingDisputeReason(null)
  }

  function addResolveStop() {
    // Add a new empty stop form for splitting
    const newStop: ResolveStopForm = {
      stop_type: "customer",
      broker_id: null,
      customer_id: null,
      customer_name: null,
      store_name: null,
      quantity_offloaded: 0,
      stop_location: "",
      stop_time: new Date().toISOString(),
      isOriginal: false,
      tempId: `temp-${crypto.randomUUID()}`,
    }
    setResolvingStops(prev => [...prev, newStop])
  }

  function removeResolveStop(tempId: string) {
    setResolvingStops(prev => prev.filter(s => s.tempId !== tempId))
  }

  function updateResolveStop(tempId: string, field: keyof ResolveStopForm, value: unknown) {
    setResolvingStops(prev => prev.map(s => 
      s.tempId === tempId ? { ...s, [field]: value } : s
    ))
  }

  // Calculate total quantity across all resolve stops
  const totalResolveQuantity = resolvingStops.reduce((sum, s) => sum + (s.quantity_offloaded || 0), 0)
  const isOverLimit = totalResolveQuantity > resolveOriginalQuantity && resolveOriginalQuantity > 0

  async function handleResolveStops() {
    if (resolvingStops.length === 0) return
    if (isOverLimit) {
      setResolveMessage(`Total quantity (${totalResolveQuantity}) cannot exceed original disputed quantity (${resolveOriginalQuantity})`)
      return
    }
    for (const [idx, stop] of resolvingStops.entries()) {
      const label = stop.isOriginal ? "Original stop" : `Additional stop ${idx}`
      if (stop.quantity_offloaded <= 0) {
        setResolveMessage(`${label}: quantity must be greater than 0`)
        return
      }
      if (stop.stop_type === "customer" && !stop.broker_id) {
        setResolveMessage(`${label}: select a broker`)
        return
      }
      if (stop.stop_type === "customer" && !stop.stop_location.trim()) {
        setResolveMessage(`${label}: enter a stop location`)
        return
      }
      if (stop.stop_type === "store" && !stop.store_name) {
        setResolveMessage(`${label}: select a store`)
        return
      }
    }

    setResolveSubmitting(true)
    setResolveMessage("")

    try {
      const originalStop = resolvingStops.find(s => s.isOriginal)
      if (!originalStop) throw new Error("Original stop not found")

      // Update the original stop
      const originalUpdateData: Record<string, unknown> = {
        disputed: false,
        dispute_reason: null,
        disputed_by: null,
        confirmed: false,
        quantity_offloaded: originalStop.quantity_offloaded,
        stop_type: originalStop.stop_type,
        stop_location: originalStop.stop_type === "store" ? originalStop.store_name : originalStop.stop_location,
        stop_time: originalStop.stop_time,
      }

      if (originalStop.stop_type === "customer") {
        originalUpdateData.broker_id = originalStop.broker_id
        originalUpdateData.customer_id = originalStop.customer_id
        originalUpdateData.store_name = null
      } else {
        originalUpdateData.broker_id = null
        originalUpdateData.customer_id = null
        originalUpdateData.store_name = originalStop.store_name
      }

      const { error: updateError } = await apiMutate("trips", {
        action: "update",
        table: "Stops",
        data: originalUpdateData,
        filters: { stop_id: originalStop.tempId },
      })

      if (updateError) {
        setResolveMessage("Failed to update original stop")
        return
      }

      // Create additional stops
      const additionalStops = resolvingStops.filter(s => !s.isOriginal)
      if (!resolvingTripId) throw new Error("Trip ID not found")
      
      for (const stop of additionalStops) {
        const newStopData: Record<string, unknown> = {
          trip_id: resolvingTripId,
          stop_type: stop.stop_type,
          quantity_offloaded: stop.quantity_offloaded,
          stop_location: stop.stop_type === "store" ? stop.store_name : stop.stop_location,
          stop_time: stop.stop_time,
        }

        if (stop.stop_type === "customer") {
          newStopData.broker_id = stop.broker_id
          newStopData.customer_id = stop.customer_id
          newStopData.store_name = null
        } else {
          newStopData.broker_id = null
          newStopData.customer_id = null
          newStopData.store_name = stop.store_name
        }

        const { error: insertError } = await apiMutate("trips", {
          action: "insert",
          table: "Stops",
          data: newStopData,
        })

        if (insertError) {
          const msg = typeof insertError === "string" ? insertError : (insertError as { message?: string })?.message ?? "Unknown error"
          setResolveMessage(`Failed to create additional stop: ${msg}`)
          return
        }
      }

      closeResolveModal()
      loadAll()
    } catch {
      setResolveMessage("Network error, please try again")
    } finally {
      setResolveSubmitting(false)
    }
  }

  async function confirmPostTrip() {
    if (!postingTrip || !selectedTrip) return
    setPostLoading(true)
    setPostError("")

    try {
      const isDD = (selectedTrip as Trip).isDD
      const { error } = await apiMutate("trips", {
        action: "record_trip",
        data: {
          trip_id: postingTrip,
          is_dd: isDD,
        },
      })

      if (error) {
        console.error("PostTrip update failed:", error)
        setPostError(error)
        return
      }
      setPostingTrip(null)
      closeModals()
      loadAll()
    } catch (err) {
      console.error("PostTrip exception:", err)
      setPostError(err instanceof Error ? err.message : "Failed to record trip. Please try again.")
    } finally {
      setPostLoading(false)
    }
  }

  const disputedTripCount = listStats.disputed_trip
  const pendingRecordCount = listStats.pending_record

  // On the server-query path `trips` is already the current page. On the
  // browser-side fallback the page still has to slice the full list locally.
  const PAGE_SIZE = 100
  const usingServerQuery = !serverQueryUnavailable
  const locallyFiltered = usingServerQuery
    ? trips
    : (query.status === "All"
      ? trips
      : query.status === "Active"
      ? trips.filter((t) => t.trip_status === "In transit" || t.trip_status === "On hold")
      : query.status === "Pending"
      ? trips.filter((t) => !t.recorded)
      : query.status === "Posted"
      ? trips.filter((t) => t.recorded)
      : query.status === "Disputed"
      ? trips.filter((t) => t.stop_summary.disputed > 0)
      : trips
    ).filter((t) => {
      if (!query.atc) return true
      const q = query.atc.trim().toLowerCase()
      return (t.atc ?? "").toLowerCase().includes(q) || (t.child_order_no ?? "").toLowerCase().includes(q)
    })
      .filter((t) => !query.plate || t.plate_number.toLowerCase().includes(query.plate.trim().toLowerCase()))
      .filter((t) => {
        const tripDate = t.created_at.slice(0, 10)
        if (dateMode === "single") return !query.dateFrom || tripDate === query.dateFrom
        return (!query.dateFrom || tripDate >= query.dateFrom) && (!query.dateTo || tripDate <= query.dateTo)
      })

  const totalItems = usingServerQuery ? listTotal : locallyFiltered.length
  const totalPages = Math.ceil(totalItems / PAGE_SIZE) || 1
  const safePage = Math.min(query.page, totalPages - 1)
  const paginatedItems = usingServerQuery
    ? trips
    : locallyFiltered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  function closeModals() {
    setSelectedDriver(null)
    setSelectedTrip(null)
    setSelectedStops(null)
    setSelectedDiscrepancies([])
    setSelectedLoadMore([])
    setSelectedPlate("")
    setPostingTrip(null)
    setShowActionsDropdown(false)
    setIsEditingTrip(false)
    setPostError("")
    setDetailLoading(false)
    setDetailFailed(false)
    detailTripIdRef.current = null
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: isMobile ? "16px" : "32px", fontFamily: "'Inter', sans-serif" }}>
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, color: "#0f172a", fontSize: isMobile ? FONT_SIZE["2xl"] : FONT_SIZE["3xl"], fontWeight: 700, letterSpacing: "-0.5px" }}>
            Monitor Trips
          </h1>
          <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: FONT_SIZE.base }}>
            Track active trips and manage stops.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, width: isMobile ? "100%" : "auto" }}>
          {trips.length > 0 && (
            <div style={{ display: "flex", background: "white", border: "1px solid #e2e8f0", borderRadius: 8, padding: 4, gap: 0 }}>
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
          <button
            onClick={loadAll}
            style={{
              padding: "8px 12px",
              background: "white",
              color: "#64748b",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: FONT_SIZE.xs,
              fontWeight: 500,
              minHeight: 40,
              minWidth: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s"
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1" }}
            onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#e2e8f0" }}
            title="Refresh"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36M20.49 15a9 9 0 0 1-14.85 3.36"/></svg>
          </button>
        </div>
      </div>

      {serverQueryUnavailable && (
        <div style={{ margin: "0 0 20px 0", padding: "12px 14px", background: "#fff7ed", border: "1px solid #fdba74", borderRadius: 8 }}>
          <p style={{ margin: 0, color: "#c2410c", fontSize: FONT_SIZE.sm, fontWeight: 600 }}>
            Running the legacy trip query
          </p>
          <p style={{ margin: "4px 0 0", color: "#9a3412", fontSize: FONT_SIZE.xs }}>
            Migration 060 has not been applied, so this list is loading every trip and filtering in the browser.
            Apply <code>supabase/migrations/060_monitor_trips_list.sql</code> to switch to the paged query.
          </p>
        </div>
      )}

      {lastUpdated && (
        <p style={{ margin: "0 0 20px 0", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>
          Updated: {lastUpdated.toLocaleTimeString()}
        </p>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24, overflowX: "auto", paddingBottom: 4 }}>
        {filterOptions.map((option) => {
          const isActive = query.status === option
          const pill = getPillStyle(option, isActive)
          return (
            <button
              key={option}
              onClick={() => setQuery(prev => ({ ...prev, status: option, page: 0 }))}
              style={{
                padding: "8px 14px",
                borderRadius: 24,
                fontSize: FONT_SIZE.sm,
                cursor: "pointer",
                border: `1.5px solid ${pill.borderColor}`,
                background: pill.bg,
                color: pill.textColor,
                fontWeight: isActive ? 600 : 500,
                transition: "all 0.2s",
                whiteSpace: "nowrap"
              }}
              onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1" } }}
              onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#e2e8f0" } }}
            >
              {option}
              {option === "Pending" && !isActive && pendingRecordCount > 0 && (
                <span style={{ display: "inline-flex", marginLeft: 6, width: 8, height: 8, borderRadius: "50%", background: "#f5a623" }} />
              )}
              {option === "Pending" && isActive && pendingRecordCount > 0 && (
                <span style={{ display: "inline-flex", marginLeft: 6, background: "#fffbeb", color: "#f5a623", borderRadius: 10, padding: "0 6px", fontSize: 11, fontWeight: 700, lineHeight: "18px", minWidth: 18, justifyContent: "center" }}>
                  {pendingRecordCount}
                </span>
              )}
              {option === "Disputed" && !isActive && disputedTripCount > 0 && (
                <span style={{ display: "inline-flex", marginLeft: 6, width: 8, height: 8, borderRadius: "50%", background: "#ef4444" }} />
              )}
              {option === "Disputed" && isActive && disputedTripCount > 0 && (
                <span style={{ display: "inline-flex", marginLeft: 6, background: "#fef2f2", color: "#ef4444", borderRadius: 10, padding: "0 6px", fontSize: 11, fontWeight: 700, lineHeight: "18px", minWidth: 18, justifyContent: "center" }}>
                  {disputedTripCount}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: isMobile ? "1 1 100%" : "1 1 200px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "white", border: `1.5px solid ${atcSearch ? "#0070f3" : "#e2e8f0"}`, borderRadius: 8, padding: 0 }}>
            <Icon icon="mdi:file-document-outline" style={{ color: atcSearch ? "#0070f3" : "#888", flexShrink: 0, marginLeft: 12 }} />
            <input
              type="text"
              placeholder="Search ATC, child order no."
              value={atcSearch}
              onChange={e => setAtcSearch(e.target.value)}
              style={{ border: "none", outline: "none", fontSize: FONT_SIZE.sm, width: "100%", color: "#333", background: "transparent", padding: "10px 12px" }}
            />
            {atcSearch && (
              <button onClick={() => setAtcSearch("")} style={{ border: "none", background: "none", cursor: "pointer", color: "#aaa", padding: 0, lineHeight: 1, marginRight: 12, flexShrink: 0 }}>✕</button>
            )}
          </div>
        </div>

        <div style={{ position: "relative", flex: isMobile ? "1 1 100%" : "1 1 180px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "white", border: `1.5px solid ${plateSearch ? "#0070f3" : "#e2e8f0"}`, borderRadius: 8, padding: 0 }}>
            <Icon icon="mdi:truck-outline" style={{ color: plateSearch ? "#0070f3" : "#888", flexShrink: 0, marginLeft: 12 }} />
            <input
              type="text"
              placeholder="Search truck number…"
              value={plateSearch}
              onChange={e => { setPlateSearch(e.target.value); setPlateDropOpen(true) }}
              onFocus={() => setPlateDropOpen(true)}
              onBlur={() => setTimeout(() => setPlateDropOpen(false), 150)}
              style={{ border: "none", outline: "none", fontSize: FONT_SIZE.sm, width: "100%", color: "#333", background: "transparent", padding: "10px 12px" }}
            />
            {plateSearch && (
              <button onClick={() => { setPlateSearch(""); setPlateDropOpen(false) }} style={{ border: "none", background: "none", cursor: "pointer", color: "#aaa", padding: 0, lineHeight: 1, marginRight: 12, flexShrink: 0 }}>✕</button>
            )}
          </div>
          {plateDropOpen && matchedPlates.length > 0 && (
            <ul style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "white", border: "1px solid #e2e8f0", borderRadius: 8, listStyle: "none", margin: 0, padding: 4, maxHeight: 200, overflowY: "auto", zIndex: 50, boxShadow: "0 4px 16px rgba(0,0,0,0.1)" }}>
              {matchedPlates.map(p => (
                <li
                  key={p}
                  onMouseDown={() => { setPlateSearch(p); setPlateDropOpen(false) }}
                  style={{ padding: "8px 12px", cursor: "pointer", fontSize: FONT_SIZE.sm, color: "#333", borderRadius: 6 }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#f5f5f5")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  {p}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={{ position: "relative", flex: isMobile ? "1 1 100%" : "1 1 200px" }}>
          <div
            onClick={() => setDateDropOpen(o => !o)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "white",
              border: `1.5px solid ${query.dateFrom ? "#0070f3" : "#e2e8f0"}`,
              borderRadius: 8,
              padding: "8px 12px",
              cursor: "pointer",
              userSelect: "none",
              minHeight: 40,
              boxSizing: "border-box",
            }}
          >
            <Icon icon="mdi:calendar-outline" style={{ color: query.dateFrom ? "#0070f3" : "#888", flexShrink: 0 }} />
            <span style={{ fontSize: FONT_SIZE.sm, color: query.dateFrom ? "#333" : "#aaa", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {query.dateFrom ? (dateMode === "range" && query.dateTo ? `${query.dateFrom} → ${query.dateTo}` : query.dateFrom) : "Filter by date…"}
            </span>
            {query.dateFrom ? (
              <button
                onClick={e => { e.stopPropagation(); setQuery(prev => ({ ...prev, dateFrom: "", dateTo: "", page: 0 })); setDateMode("single"); setDateDropOpen(false) }}
                style={{ border: "none", background: "none", cursor: "pointer", color: "#aaa", padding: 0, lineHeight: 1, flexShrink: 0 }}
              >
                ✕
              </button>
            ) : (
              <Icon icon="mdi:chevron-down" style={{ color: "#aaa", fontSize: 16, transition: "transform 0.15s", transform: dateDropOpen ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }} />
            )}
          </div>

          {dateDropOpen && (
            <div style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              right: 0,
              background: "white",
              border: "1px solid #e2e8f0",
              borderRadius: 10,
              padding: 16,
              zIndex: 50,
              boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
              minWidth: isMobile ? "auto" : 260,
            }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                {(["single", "range"] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => { setDateMode(m); setQuery(prev => ({ ...prev, dateFrom: "", dateTo: "", page: 0 })) }}
                    style={{
                      flex: 1,
                      padding: "5px 0",
                      border: "none",
                      borderRadius: 6,
                      cursor: "pointer",
                      fontSize: FONT_SIZE.xs,
                      fontWeight: "bold",
                      background: dateMode === m ? "#0070f3" : "#f0f0f0",
                      color: dateMode === m ? "white" : "#666",
                      transition: "all 0.15s"
                    }}
                  >
                    {m === "single" ? "Single day" : "Date range"}
                  </button>
                ))}
              </div>

              {dateMode === "single" ? (
                <div>
                  <label style={{ display: "block", fontSize: FONT_SIZE.xs, color: "#888", marginBottom: 4 }}>Select date</label>
                  <input
                    type="date"
                    value={query.dateFrom}
                    onChange={e => { setQuery(prev => ({ ...prev, dateFrom: e.target.value, page: 0 })); setDateDropOpen(false) }}
                    style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: FONT_SIZE.sm, color: "#333", boxSizing: "border-box" }}
                    autoFocus
                  />
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div>
                    <label style={{ display: "block", fontSize: FONT_SIZE.xs, color: "#888", marginBottom: 4 }}>From</label>
                    <input type="date" value={query.dateFrom} onChange={e => setQuery(prev => ({ ...prev, dateFrom: e.target.value, page: 0 }))} style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: FONT_SIZE.sm, color: "#333", boxSizing: "border-box" }} autoFocus />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: FONT_SIZE.xs, color: "#888", marginBottom: 4 }}>To</label>
                    <input type="date" value={query.dateTo} min={query.dateFrom || undefined} onChange={e => setQuery(prev => ({ ...prev, dateTo: e.target.value, page: 0 }))} style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: FONT_SIZE.sm, color: "#333", boxSizing: "border-box" }} />
                  </div>
                  {query.dateFrom && query.dateTo && (
                    <button onClick={() => setDateDropOpen(false)} style={{ padding: "8px 0", background: "#0070f3", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontSize: FONT_SIZE.sm, fontWeight: "bold" }}>
                      Apply Range
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {hasActiveFilters && (
          <button
            onClick={() => { setAtcSearch(""); setPlateSearch(""); setQuery(prev => ({ ...prev, atc: "", plate: "", dateFrom: "", dateTo: "", page: 0 })); setDateMode("single") }}
            style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "white", color: "#64748b", fontSize: FONT_SIZE.sm, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", minHeight: 40, transition: "all 0.2s" }}
            onMouseEnter={e => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1" }}
            onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#e2e8f0" }}
          >
            <Icon icon="mdi:filter-remove-outline" style={{ fontSize: 16 }} />
            Clear filters
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "64px 0" }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid #e2e8f0", borderTopColor: "#0070f3", animation: "spin 1s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : totalItems === 0 ? (
        <div style={{ textAlign: "center", padding: "64px 24px", background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)" }}>
          <div style={{ width: 64, height: 64, background: "#f1f5f9", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2"/></svg>
          </div>
          <h3 style={{ margin: "0 0 8px", color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 600 }}>No trips found</h3>
          <p style={{ color: "#64748b", fontSize: FONT_SIZE.base, margin: 0 }}>
            {hasActiveFilters ? "No trips match your filters." : query.status === "All" ? "No trips in the system." : `No trips with status "${query.status}".`}
          </p>
        </div>
      ) : (
        <>
          {/* Card View */}
          {viewMode === "card" && (
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
              {paginatedItems.map((trip) => {
                const { confirmed, pending, disputed, awaiting_review: awaitingReview, returned } = trip.stop_summary

                return (
                  <div key={trip.trip_id} style={{ background: "white", borderRadius: 12, padding: 20, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)", transition: "all 0.2s ease" }} onMouseEnter={e => !isMobile && (e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.08)", e.currentTarget.style.borderColor = "#cbd5e1")} onMouseLeave={e => !isMobile && (e.currentTarget.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.05)", e.currentTarget.style.borderColor = "#e2e8f0")}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <h3 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.lg, fontWeight: 700 }}>{trip.plate_number}</h3>
                            {trip.isDD ? (
                              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 12, background: "#f3e5f5", color: "#7c3aed", fontWeight: 700, border: "1px solid #d8b4fe" }}>DD</span>
                            ) : (
                              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 12, background: "#e0f2fe", color: "#0369a1", fontWeight: 700, border: "1px solid #7dd3fc" }}>SC/MDD</span>
                            )}
                          </div>
                        <p style={{ margin: 0, color: "#0070f3", fontSize: FONT_SIZE.sm, cursor: "pointer", textDecoration: "underline", fontWeight: 500 }} onClick={() => setSelectedDriver({ driver_name: trip.driver_name, driver_phone: trip.driver_phone, driver_status: trip.driver_status })}>
                          {trip.driver_name}
                        </p>
                      </div>
                      <span style={{ padding: "6px 12px", borderRadius: 16, fontSize: FONT_SIZE.xs, fontWeight: 600, background: trip.recorded ? "#f0fdf4" : "#fffbeb", color: trip.recorded ? "#16a34a" : "#f5a623", border: `1.5px solid ${trip.recorded ? "#16a34a" : "#f5a623"}`, whiteSpace: "nowrap" }}>
                        {trip.recorded ? "Recorded" : "Pending"}
                      </span>
                    </div>

                    <div style={{ marginBottom: 16, padding: "8px 12px", borderRadius: 8, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                      <span style={{ fontSize: FONT_SIZE.xs, color: "#94a3b8", fontWeight: 500 }}>Trip status</span>
                      <p style={{ margin: "2px 0 0", fontSize: FONT_SIZE.sm, fontWeight: 600, color: trip.trip_status === "In transit" ? "#0070f3" : trip.trip_status === "On hold" ? "#f5a623" : trip.trip_status === "Completed" ? "#16a34a" : "#475569" }}>
                        {trip.trip_status}
                      </p>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #f1f5f9" }}>
                      <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#475569" }}><span style={{ color: "#94a3b8", width: 70, display: "inline-block" }}>Product:</span> <span style={{ fontWeight: 500 }}>{trip.product}</span></p>
                      <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#475569" }}><span style={{ color: "#94a3b8", width: 70, display: "inline-block" }}>Centre:</span> {trip.material_centre}</p>
                      {trip.order_no ? (
                        <>
                          <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#475569" }}><span style={{ color: "#94a3b8", width: 70, display: "inline-block" }}>Order No:</span> {trip.order_no}</p>
                          {trip.child_order_no && <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#475569" }}><span style={{ color: "#94a3b8", width: 70, display: "inline-block" }}>Child:</span> {trip.child_order_no}</p>}
                        </>
                      ) : (
                        <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#475569" }}><span style={{ color: "#94a3b8", width: 70, display: "inline-block" }}>ATC:</span> {trip.atc || "N/A"}</p>
                      )}
                      <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#475569" }}><span style={{ color: "#94a3b8", width: 70, display: "inline-block" }}>Route:</span> {trip.route_points && trip.route_points.length > 0 ? (
                          <span style={{ color: "#0f172a", wordBreak: "break-word" }}>{trip.route_points.join(" → ")}</span>
                        ) : (
                          <span style={{ color: "#cbd5e1", fontStyle: "italic" }}>Not set</span>
                        )}</p>
                      {trip.amount_charged && <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#475569" }}><span style={{ color: "#94a3b8", width: 70, display: "inline-block" }}>Charged:</span> ₦{trip.amount_charged.toLocaleString()}</p>}
                      {trip.payment_mode && <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#475569" }}><span style={{ color: "#94a3b8", width: 70, display: "inline-block" }}>Payment:</span> {trip.payment_mode}</p>}
                      <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#475569" }}><span style={{ color: "#94a3b8", width: 70, display: "inline-block" }}>Trip started:</span> {new Date(trip.created_at).toLocaleString()}</p>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                      <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px" }}>
                        <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#64748b" }}>Loaded</p>
                        <p style={{ margin: "2px 0 0", fontWeight: 600, color: "#0f172a", fontSize: FONT_SIZE.md }}>{trip.loaded_quantity} bags</p>
                      </div>
                      <div style={{ background: trip.remaining === 0 ? "#fef2f2" : trip.remaining < trip.loaded_quantity * 0.2 ? "#fffbeb" : "#f0fdf4", borderRadius: 8, padding: "10px 12px", border: `1px solid ${trip.remaining === 0 ? "#fecaca" : trip.remaining < trip.loaded_quantity * 0.2 ? "#fde68a" : "#bbf7d0"}` }}>
                        <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: trip.remaining === 0 ? "#ef4444" : trip.remaining < trip.loaded_quantity * 0.2 ? "#f5a623" : "#16a34a" }}>Remaining</p>
                        <p style={{ margin: "2px 0 0", fontWeight: 700, color: trip.remaining === 0 ? "#b91c1c" : trip.remaining < trip.loaded_quantity * 0.2 ? "#b45309" : "#15803d", fontSize: FONT_SIZE.md }}>{trip.remaining} bags</p>
                      </div>
                    </div>

                    {trip.load_more_entries.length > 0 && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12, padding: 10, background: "#fffbeb", borderRadius: 8, border: "1px solid #fde68a" }}>
                        {trip.load_more_entries.map((entry) => (
                          <div key={entry.id} style={{ fontSize: FONT_SIZE.xs }}>
                            <p style={{ margin: 0, color: "#b45309", fontWeight: 600 }}>{entry.loading_point_name}</p>
                            <p style={{ margin: "2px 0 0", color: "#92400e" }}>{entry.product} <span style={{ fontWeight: 700 }}>+{entry.quantity}</span></p>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <span style={{ fontSize: FONT_SIZE.sm, color: "#64748b", fontWeight: 500 }}>{trip.stop_count} stops</span>
                        {confirmed > 0 && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#16a34a" }} title={`${confirmed} confirmed`} />}
                        {pending > 0 && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f5a623" }} title={`${pending} pending`} />}
                        {disputed > 0 && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444" }} title={`${disputed} disputed`} />}
                        {awaitingReview > 0 && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#0070f3" }} title={`${awaitingReview} awaiting review`} />}
                        {returned > 0 && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#d97706" }} title={`${returned} returned`} />}
                      </div>
                      
                      <button
                        onClick={() => openTripDetails(trip)}
                        style={{ padding: "8px 16px", background: "#f0f7ff", color: "#0070f3", border: "1px solid #bfdbfe", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.sm, transition: "all 0.2s" }}
                        onMouseEnter={e => { e.currentTarget.style.background = "#e0efff" }}
                        onMouseLeave={e => { e.currentTarget.style.background = "#f0f7ff" }}
                      >
                        Details
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Table View */}
          {viewMode === "table" && (
            <div style={{ background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", minWidth: 800 }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Plate</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Driver</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Product</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Centre</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>ATC / Order</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Route</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Charged</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Payment</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Loaded</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Remaining</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Stops</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Status</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Posting</th>
                    <th style={{ padding: "12px 16px", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Started</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((trip) => {
                    const { confirmed, pending, disputed, awaiting_review: awaitingReview, returned } = trip.stop_summary

                    return (
                      <tr key={trip.trip_id} style={{ borderBottom: "1px solid #e2e8f0", transition: "background 0.2s ease" }} onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 600 }}>
                          {trip.plate_number}
                          {trip.isDD ? (
                            <span style={{ marginLeft: 8, fontSize: 10, padding: "2px 8px", borderRadius: 12, background: "#f3e5f5", color: "#7c3aed", fontWeight: 700, border: "1px solid #d8b4fe" }}>DD</span>
                          ) : (
                            <span style={{ marginLeft: 8, fontSize: 10, padding: "2px 8px", borderRadius: 12, background: "#e0f2fe", color: "#0369a1", fontWeight: 700, border: "1px solid #7dd3fc" }}>SC/MDD</span>
                          )}
                        </td>
                        <td style={{ padding: "12px 16px", color: "#0070f3", fontSize: FONT_SIZE.base, cursor: "pointer", textDecoration: "underline" }} onClick={() => setSelectedDriver({ driver_name: trip.driver_name, driver_phone: trip.driver_phone, driver_status: trip.driver_status })}>
                          {trip.driver_name}
                        </td>
                        <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: FONT_SIZE.base }}>{trip.product}</td>
                        <td style={{ padding: "12px 16px", color: "#64748b", fontSize: FONT_SIZE.sm }}>{trip.material_centre}</td>
                        <td style={{ padding: "12px 16px", color: "#64748b", fontSize: FONT_SIZE.sm }}>{trip.order_no ? `${trip.order_no}${trip.child_order_no ? ` / ${trip.child_order_no}` : ""}` : trip.atc || "N/A"}</td>
                        <td style={{ padding: "12px 16px", color: trip.route_points && trip.route_points.length > 0 ? "#0f172a" : "#cbd5e1", fontSize: FONT_SIZE.sm, fontStyle: trip.route_points && trip.route_points.length > 0 ? "normal" : "italic" }}>
                          {trip.route_points && trip.route_points.length > 0 ? trip.route_points.join(" → ") : "Not set"}
                        </td>
                        <td style={{ padding: "12px 16px", color: "#059669", fontSize: FONT_SIZE.base, fontWeight: 500 }}>{trip.amount_charged ? `₦${trip.amount_charged.toLocaleString()}` : "—"}</td>
                        <td style={{ padding: "12px 16px", color: "#64748b", fontSize: FONT_SIZE.sm }}>{trip.payment_mode || "—"}</td>
                        <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 500 }}>{trip.loaded_quantity}</td>
                        <td style={{ padding: "12px 16px", color: trip.remaining === 0 ? "#ef4444" : trip.remaining < trip.loaded_quantity * 0.2 ? "#f5a623" : "#16a34a", fontSize: FONT_SIZE.base, fontWeight: 600 }}>{trip.remaining}</td>
                        <td style={{ padding: "12px 16px", cursor: "pointer" }} onClick={() => openTripDetails(trip)}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <span style={{ color: "#0070f3", fontSize: FONT_SIZE.sm, fontWeight: 500, textDecoration: "underline" }}>{trip.stop_count} {trip.stop_count === 1 ? "stop" : "stops"}</span>
                            {confirmed > 0 && <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "2px 6px", background: "#f0fdf4", borderRadius: 12 }}><Icon icon="mdi:check-circle" width="12" height="12" style={{ color: "#16a34a" }} /><span style={{ fontSize: 10, color: "#16a34a", fontWeight: "bold" }}>{confirmed}</span></div>}
                            {pending > 0 && <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "2px 6px", background: "#fffbeb", borderRadius: 12 }}><Icon icon="mdi:clock-outline" width="12" height="12" style={{ color: "#f5a623" }} /><span style={{ fontSize: 10, color: "#f5a623", fontWeight: "bold" }}>{pending}</span></div>}
                            {disputed > 0 && <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "2px 6px", background: "#fef2f2", borderRadius: 12 }}><Icon icon="mdi:alert-circle" width="12" height="12" style={{ color: "#ef4444" }} /><span style={{ fontSize: 10, color: "#ef4444", fontWeight: "bold" }}>{disputed}</span></div>}
                            {awaitingReview > 0 && <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "2px 6px", background: "#eff6ff", borderRadius: 12 }}><Icon icon="mdi:eye-outline" width="12" height="12" style={{ color: "#0070f3" }} /><span style={{ fontSize: 10, color: "#0070f3", fontWeight: "bold" }}>{awaitingReview}</span></div>}
                            {returned > 0 && <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "2px 6px", background: "#fffbeb", borderRadius: 12 }}><Icon icon="mdi:rotate-3d-variant" width="12" height="12" style={{ color: "#d97706" }} /><span style={{ fontSize: 10, color: "#d97706", fontWeight: "bold" }}>{returned}</span></div>}
                            {trip.load_more_entries.length > 0 && <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "2px 6px", background: "#fffbeb", borderRadius: 12 }}><Icon icon="mdi:package-variant-closed" width="12" height="12" style={{ color: "#f59e0b" }} /><span style={{ fontSize: 10, color: "#f59e0b", fontWeight: "bold" }}>+{trip.load_more_entries.reduce((s, e) => s + e.quantity, 0)}</span></div>}
                          </div>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{ padding: "6px 10px", borderRadius: 14, fontSize: FONT_SIZE.xs, fontWeight: 600, background: trip.trip_status === "In transit" ? "#eff6ff" : trip.trip_status === "On hold" ? "#fffbeb" : trip.trip_status === "Completed" ? "#f0fdf4" : "#f1f5f9", color: trip.trip_status === "In transit" ? "#0070f3" : trip.trip_status === "On hold" ? "#f5a623" : trip.trip_status === "Completed" ? "#16a34a" : "#475569", border: `1.5px solid ${trip.trip_status === "In transit" ? "#0070f3" : trip.trip_status === "On hold" ? "#f5a623" : trip.trip_status === "Completed" ? "#16a34a" : "#cbd5e1"}` }}>
                            {trip.trip_status}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{ padding: "6px 10px", borderRadius: 14, fontSize: FONT_SIZE.xs, fontWeight: 600, background: trip.recorded ? "#f0fdf4" : "#fffbeb", color: trip.recorded ? "#16a34a" : "#f5a623", border: `1.5px solid ${trip.recorded ? "#16a34a" : "#f5a623"}` }}>
                            {trip.recorded ? "Recorded" : "Pending"}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>{new Date(trip.created_at).toLocaleString()}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {totalItems > 0 && (
        <PaginationControls page={safePage} totalPages={totalPages} totalItems={totalItems} onPageChange={next => setQuery(prev => ({ ...prev, page: next }))} />
      )}

      {(selectedDriver || selectedStops) && (
        <div onClick={closeModals} style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 100, padding: isMobile ? 0 : 24, animation: "fadeIn 0.2s ease-out" }}>
          <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: isMobile ? "20px 20px 0 0" : 12, padding: isMobile ? "28px 20px" : 32, width: "100%", maxWidth: 500, maxHeight: isMobile ? "90vh" : "80vh", overflowY: "auto", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)", animation: "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)" }}>

            {selectedDriver && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                  <h3 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>Driver Info</h3>
                  <button onClick={closeModals} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 0, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", transition: "color 0.2s" }} onMouseEnter={e => e.currentTarget.style.color = "#64748b"} onMouseLeave={e => e.currentTarget.style.color = "#94a3b8"}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
                  <div>
                    <p style={{ margin: "0 0 4px 0", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>Full Name</p>
                    <p style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 500 }}>{selectedDriver.driver_name}</p>
                  </div>
                  <div>
                    <p style={{ margin: "0 0 4px 0", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>Phone</p>
                    <p style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 500 }}>{selectedDriver.driver_phone}</p>
                  </div>
                  <div>
                    <p style={{ margin: "0 0 4px 0", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>Status</p>
                    <p style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 500 }}>{selectedDriver.driver_status}</p>
                  </div>
                </div>

                <button onClick={closeModals} style={{ width: "100%", padding: "12px 16px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, minHeight: 44 }}>
                  Close
                </button>
              </>
            )}

            {selectedStops && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <div>
                    <h3 style={{ margin: "0 0 4px 0", color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>Stops</h3>
                    <p style={{ margin: 0, color: "#94a3b8", fontSize: FONT_SIZE.sm }}>{selectedPlate}</p>
                  </div>
                  <button onClick={closeModals} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 0, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", transition: "color 0.2s" }} onMouseEnter={e => e.currentTarget.style.color = "#64748b"} onMouseLeave={e => e.currentTarget.style.color = "#94a3b8"}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                </div>

                {selectedTrip?.order_no ? (
                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 14px", marginBottom: 8 }}>
                    <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#0f172a" }}><strong>Order No:</strong> {selectedTrip.order_no}</p>
                    {selectedTrip.child_order_no && <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.sm, color: "#0f172a" }}><strong>Child Order No:</strong> {selectedTrip.child_order_no}</p>}
                  </div>
                ) : selectedTrip?.atc ? (
                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 14px", marginBottom: 8 }}>
                    <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#0f172a" }}><strong>ATC:</strong> {selectedTrip.atc}</p>
                  </div>
                ) : null}

                {selectedTrip?.amount_charged && (
                  <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "12px 14px", marginBottom: 16, display: "flex", gap: 24 }}>
                    <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#0f172a" }}><strong>Amount Charged:</strong> ₦{selectedTrip.amount_charged.toLocaleString()}</p>
                    <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#0f172a" }}><strong>Payment Mode:</strong> {selectedTrip.payment_mode}</p>
                  </div>
                )}

                {pricingError && (
                  <div style={{ background: "#fff7ed", border: "1px solid #fdba74", borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>

                    <p style={{ margin: 0, color: "#c2410c", fontSize: FONT_SIZE.sm, fontWeight: 600 }}>
                      Couldn&apos;t load {pricingError} for these stops
                    </p>
                    <p style={{ margin: "4px 0 0", color: "#9a3412", fontSize: FONT_SIZE.xs }}>
                      Prices shown below may be incomplete. This is a loading failure, not missing data — retry in a moment.
                    </p>
                  </div>
                )}

                {detailLoading ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "24px 0", color: "#64748b", fontSize: FONT_SIZE.base }}>
                    <div style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid #e2e8f0", borderTopColor: "#0070f3", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
                    Loading stops…
                  </div>
                ) : detailFailed ? (
                  // selectedStops is still the empty placeholder here, so this
                  // must not read as "this trip has no stops".
                  <p style={{ color: "#c2410c", fontSize: FONT_SIZE.base, fontWeight: 600 }}>
                    Stops couldn&apos;t be loaded for this trip. Close and try again.
                  </p>
                ) : selectedStops.length === 0 && selectedDiscrepancies.length === 0 ? (
                  <p style={{ color: "#94a3b8", fontSize: FONT_SIZE.base }}>No stops logged yet.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
                    {selectedStops.map((stop, index) => (
                      <div key={stop.stop_id} style={{ padding: 14, border: `1px solid ${stop.disputed ? "#fca5a5" : stop.discount_status === "returned" ? "#fcd34d" : stop.discount_status === "pending" ? "#93c5fd" : stop.confirmed ? "#86efac" : "#e2e8f0"}`, borderRadius: 8, background: stop.disputed ? "#fef2f2" : stop.discount_status === "returned" ? "#fffbeb" : stop.discount_status === "pending" ? "#eff6ff" : stop.confirmed ? "#f0fdf4" : "#f8fafc" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                          <div>
                            <p style={{ margin: "0 0 4px 0", color: "#0f172a", fontSize: FONT_SIZE.base, fontWeight: 600 }}>Stop {index + 1}</p>
                            <span style={{ fontSize: FONT_SIZE.xs, padding: "3px 8px", borderRadius: 4, background: stop.stop_type === "customer" ? "#eff6ff" : "#f3e5f5", color: stop.stop_type === "customer" ? "#0070f3" : "#7c3aed" }}>
                              {stop.stop_type === "customer" ? "Customer" : "Store"}
                            </span>
                          </div>
                          {stop.disputed && <span style={{ fontSize: FONT_SIZE.xs, padding: "4px 10px", background: "#fef2f2", borderRadius: 16, color: "#ef4444", fontWeight: 600 }}>Disputed</span>}
                          {!stop.disputed && stop.discount_status === "pending" && <span style={{ fontSize: FONT_SIZE.xs, padding: "4px 10px", background: "#eff6ff", borderRadius: 16, color: "#0070f3", fontWeight: 600 }}>Awaiting Review</span>}
                          {!stop.disputed && stop.discount_status === "returned" && <span style={{ fontSize: FONT_SIZE.xs, padding: "4px 10px", background: "#fffbeb", borderRadius: 16, color: "#d97706", fontWeight: 600 }}>Returned</span>}
                          {!stop.disputed && stop.discount_status !== "pending" && stop.discount_status !== "returned" && stop.confirmed && <span style={{ fontSize: FONT_SIZE.xs, padding: "4px 10px", background: "#f0fdf4", borderRadius: 16, color: "#16a34a", fontWeight: 600 }}>Confirmed</span>}
                          {!stop.disputed && stop.discount_status !== "pending" && stop.discount_status !== "returned" && !stop.confirmed && <span style={{ fontSize: FONT_SIZE.xs, padding: "4px 10px", background: "#fffbeb", borderRadius: 16, color: "#f5a623", fontWeight: 600 }}>Pending</span>}
                        </div>

                        {stop.stop_type === "customer" && (
                          <>
                            <p style={{ margin: "6px 0", color: "#475569", fontSize: FONT_SIZE.sm }}><strong>Broker:</strong> <span style={{ color: "#0f172a" }}>{stop.broker_name}</span></p>
                            <p style={{ margin: "6px 0", color: "#475569", fontSize: FONT_SIZE.sm }}><strong>Customer:</strong> <span style={{ color: "#0f172a" }}>{stop.customer_name}{stop.customer_phone ? ` (${stop.customer_phone})` : ""}</span></p>
                          </>
                        )}

                        {stop.stop_type === "store" && (
                          <p style={{ margin: "6px 0", color: "#475569", fontSize: FONT_SIZE.sm }}><strong>Store:</strong> <span style={{ color: "#0f172a" }}>{stop.stop_location}</span></p>
                        )}

                        <p style={{ margin: "6px 0", color: "#475569", fontSize: FONT_SIZE.sm }}><strong>Offloaded:</strong> <span style={{ color: "#0f172a" }}>{stop.quantity_offloaded} bags</span></p>
                        {stop.stop_type === "customer" && stop.price_per_bag !== null && stop.price_per_bag > 0 && <p style={{ margin: "6px 0", color: "#475569", fontSize: FONT_SIZE.sm }}><strong>Price:</strong> <span style={{ color: "#0f172a" }}>₦{stop.price_per_bag.toLocaleString()}/bag</span>{stop.area ? ` · ${stop.area}` : ""}</p>}
                        {stop.stop_type === "customer" && (!stop.price_per_bag || stop.price_per_bag <= 0) && !pricingError && !stop.confirmed && stop.discount_status !== "pending" && stop.credit_status !== "Pending" && <p style={{ margin: "6px 0", color: "#c2410c", fontSize: FONT_SIZE.sm, fontWeight: 600 }}>Price required before recording</p>}
                        {stop.stop_type === "customer" && (!stop.price_per_bag || stop.price_per_bag <= 0) && !pricingError && stop.confirmed && <p style={{ margin: "6px 0", color: "#b45309", fontSize: FONT_SIZE.sm, fontWeight: 600 }}>No price was recorded for this stop</p>}
                        {stop.stop_type === "customer" && (
                          <span style={{ display: "inline-block", marginTop: 4, padding: "4px 12px", borderRadius: 6, fontSize: FONT_SIZE.xs, fontWeight: 600, background: stop.is_credit_approved ? "#eff6ff" : "#f0fdf4", color: stop.is_credit_approved ? "#0070f3" : "#16a34a", border: stop.is_credit_approved ? "1px solid #93c5fd" : "1px solid #86efac" }}>{stop.is_credit_approved ? "Credit" : "Cash"}</span>
                        )}

                        {stop.disputed && stop.dispute_reason && (
                          <div style={{ marginTop: 10, padding: 12, background: "#fff5f5", borderRadius: 6, border: "1px solid #fecaca" }}>
                            <p style={{ margin: "0 0 6px 0", fontSize: FONT_SIZE.xs, color: "#ef4444", fontWeight: 600 }}>Dispute Reason:</p>
                            <p style={{ margin: "0 0 10px 0", fontSize: FONT_SIZE.sm, color: "#7f1d1d" }}>{stop.dispute_reason}</p>

                            <div style={{ marginBottom: 10 }}>
                              <p style={{ margin: "0 0 6px 0", fontSize: FONT_SIZE.xs, fontWeight: 600, color: "#0f172a" }}>Bags Offloaded:</p>
                              <span style={{ fontSize: FONT_SIZE.sm, color: "#0f172a" }}>{stop.quantity_offloaded} bags</span>
                            </div>

                            <button
                              onClick={() => openResolveModal(stop, selectedTrip?.trip_id || "")}
                              disabled={!canEdit}
                              style={{
                                width: "100%", padding: "8px 0", marginTop: 10,
                                background: canEdit ? "#0070f3" : "#94a3b8",
                                color: "white", border: "none", borderRadius: 6,
                                cursor: canEdit ? "pointer" : "not-allowed",
                                fontSize: FONT_SIZE.sm, fontWeight: 600,
                                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                              }}
                            >
                              <Icon icon="mdi:check-circle" width={16} />
                              Resolve Dispute
                            </button>
                          </div>
                        )}

                        <p style={{ margin: "10px 0 0 0", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>{new Date(stop.stop_time).toLocaleString()}</p>
                      </div>
                    ))}

                    {selectedDiscrepancies.map((d, index) => (
                      <div key={d.discrepancy_id} style={{ padding: 14, border: "1px solid #fcd34d", borderRadius: 8, background: "#fffbeb" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <p style={{ margin: 0, fontSize: FONT_SIZE.base, fontWeight: 600, color: "#0f172a" }}>Discrepancy {index + 1}</p>
                          <span style={{ fontSize: FONT_SIZE.xs, padding: "4px 10px", background: "#fffbeb", borderRadius: 16, color: "#b45309", fontWeight: 600, border: "1px solid #f5a623" }}>Reported</span>
                        </div>
                        {d.shortage > 0 && <p style={{ margin: "6px 0", color: "#ef4444", fontWeight: 600, fontSize: FONT_SIZE.base }}>Shortage: {d.shortage} bags</p>}
                        {d.caked_bags > 0 && <p style={{ margin: "6px 0", color: "#475569", fontSize: FONT_SIZE.sm }}><strong>Caked:</strong> <span style={{ color: "#0f172a" }}>{d.caked_bags} bags</span></p>}
                        {d.notes && <p style={{ margin: "6px 0", fontSize: FONT_SIZE.sm, color: "#475569" }}><strong>Notes:</strong> <span style={{ color: "#0f172a" }}>{d.notes}</span></p>}
                        <p style={{ margin: "10px 0 0 0", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>{new Date(d.reported_at).toLocaleString()}</p>
                      </div>
                    ))}

                    {selectedLoadMore.length > 0 && (
                      <>
                        <p style={{ fontWeight: 700, margin: "16px 0 12px 0", fontSize: FONT_SIZE.base, color: "#0f172a" }}>Additional Loads ({selectedLoadMore.length})</p>
                        {selectedLoadMore.map((entry) => (
                          <div key={entry.id} style={{ padding: 14, border: "1px solid #fde68a", borderRadius: 8, background: "#fffbeb" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                              <div>
                                <p style={{ margin: "0 0 4px 0", fontWeight: 600, fontSize: FONT_SIZE.sm, color: "#0f172a" }}>{entry.loading_point_name}</p>
                                <span style={{ fontSize: FONT_SIZE.xs, padding: "3px 8px", borderRadius: 4, background: "#fef3c7", color: "#b45309" }}>{entry.loading_point_type}</span>
                              </div>
                              <p style={{ margin: 0, fontWeight: 700, fontSize: FONT_SIZE.base, color: "#f59e0b" }}>+{entry.quantity}</p>
                            </div>
                            <p style={{ margin: "8px 0 0 0", color: "#475569", fontSize: FONT_SIZE.sm }}><strong>Product:</strong> <span style={{ color: "#0f172a" }}>{entry.product}</span></p>
                            <p style={{ margin: "6px 0 0 0", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>{new Date(entry.created_at).toLocaleString()}</p>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, position: "relative" }}>
                  {postError && !postingTrip && (
                    <p style={{ gridColumn: "1 / -1", margin: "0 0 10px", padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, color: "#b91c1c", fontSize: FONT_SIZE.sm }}>{postError}</p>
                  )}
                  {selectedTrip && !selectedTrip.recorded && (() => {
                    const allConfirmed = selectedStops && selectedStops.length > 0 && selectedStops.every((s) => s.confirmed) && !selectedStops.some((s) => s.disputed) && selectedStops.every((s) => s.stop_type === "store" || (s.price_per_bag !== null && s.price_per_bag > 0)) && selectedTrip.remaining === 0
                    const canAttempt = allConfirmed || !!pricingError
                    return (
                      <div style={{ position: "relative" }}>
                        <button
                          onClick={() => setShowActionsDropdown(prev => !prev)}
                          disabled={!canEdit}
                          style={{
                            width: "100%",
                            padding: "12px 16px",
                            background: !canEdit ? "#f1f5f9" : showActionsDropdown ? "#f0f7ff" : "white",
                            color: !canEdit ? "#94a3b8" : "#0070f3",
                            border: "1.5px solid",
                            borderColor: !canEdit ? "#e2e8f0" : showActionsDropdown ? "#93c5fd" : "#bfdbfe",
                            borderRadius: 8,
                            cursor: !canEdit ? "not-allowed" : "pointer",
                            fontWeight: 600,
                            fontSize: FONT_SIZE.md,
                            minHeight: 44,
                            transition: "all 0.2s",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 6,
                          }}
                          onMouseEnter={e => { if (canEdit) e.currentTarget.style.background = "#eff6ff" }}
                          onMouseLeave={e => { if (canEdit && !showActionsDropdown) e.currentTarget.style.background = "white" }}
                        >
                          Actions
                          <Icon icon={showActionsDropdown ? "mdi:chevron-up" : "mdi:chevron-down"} width={18} />
                        </button>
                        {showActionsDropdown && (
                          <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "white", border: "1px solid #e2e8f0", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", zIndex: 50, overflow: "hidden" }}>
                            <button
                              onClick={() => { setShowActionsDropdown(false); handlePostTripClick() }}
                              disabled={!canAttempt}
                              style={{
                                width: "100%",
                                padding: "10px 16px",
                                background: "white",
                                color: !canAttempt ? "#94a3b8" : allConfirmed ? "#16a34a" : "#b45309",
                                border: "none",
                                cursor: !canAttempt ? "not-allowed" : "pointer",
                                fontWeight: 600,
                                fontSize: FONT_SIZE.sm,
                                textAlign: "left",
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                              }}
                              onMouseEnter={e => { if (allConfirmed) e.currentTarget.style.background = "#f0fdf4" }}
                              onMouseLeave={e => { e.currentTarget.style.background = "white" }}
                              title={pricingError ? `Couldn't load ${pricingError}` : !allConfirmed ? "All stops must be confirmed and priced, none disputed, and all bags offloaded" : ""}
                            >
                              <Icon icon="mdi:check-circle-outline" width={18} />
                              Record Trip
                            </button>
                            <button
                              onClick={() => { setShowActionsDropdown(false); setIsEditingTrip(true) }}
                              disabled={detailLoading || detailFailed}
                              title={detailLoading ? "Loading stops…" : detailFailed ? "Stops could not be loaded — close and try again" : ""}
                              style={{
                                width: "100%",
                                padding: "10px 16px",
                                background: "white",
                                color: detailLoading || detailFailed ? "#94a3b8" : "#0070f3",
                                border: "none",
                                borderTop: "1px solid #f1f5f9",
                                cursor: detailLoading || detailFailed ? "not-allowed" : "pointer",
                                fontWeight: 600,
                                fontSize: FONT_SIZE.sm,
                                textAlign: "left",
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                              }}
                              onMouseEnter={e => { if (!detailLoading && !detailFailed) e.currentTarget.style.background = "#eff6ff" }}
                              onMouseLeave={e => e.currentTarget.style.background = "white"}
                            >
                              <Icon icon="mdi:pencil-outline" width={18} />
                              Edit Trip
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                  {selectedTrip && selectedTrip.recorded && (
                    <div style={{ padding: "12px 16px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>
                      <span style={{ color: "#16a34a", fontWeight: 600, fontSize: FONT_SIZE.md }}>Recorded</span>
                    </div>
                  )}
                  <button onClick={closeModals} style={{ padding: "12px 16px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, minHeight: 44, transition: "opacity 0.2s" }} onMouseEnter={e => e.currentTarget.style.opacity = "0.9"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {postingTrip && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 24, animation: "fadeIn 0.2s ease-out" }}>
          <div style={{ background: "white", borderRadius: 12, padding: 32, width: "100%", maxWidth: 420, boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)", animation: "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)" }}>
            <h3 style={{ margin: "0 0 12px 0", color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>Record Trip?</h3>
            <p style={{ margin: "0 0 24px 0", color: "#64748b", fontSize: FONT_SIZE.base, lineHeight: 1.5 }}>
              This will mark the trip as <strong>Recorded</strong>. All customer stops must be confirmed and priced, all bags must be accounted for, and no stop can be disputed.
            </p>
            {postError && <p style={{ margin: "0 0 16px", padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, color: "#b91c1c", fontSize: FONT_SIZE.sm }}>{postError}</p>}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => setPostingTrip(null)} disabled={postLoading} style={{ padding: "12px 16px", background: "white", color: "#475569", border: "1px solid #cbd5e1", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, minHeight: 44, transition: "background 0.2s" }} onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"} onMouseLeave={e => e.currentTarget.style.background = "white"}>
                Cancel
              </button>
              <button onClick={confirmPostTrip} disabled={postLoading || !canEdit} style={{ padding: "12px 16px", background: postLoading || !canEdit ? "#94a3b8" : "#16a34a", color: "white", border: "none", borderRadius: 8, cursor: postLoading || !canEdit ? "not-allowed" : "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, opacity: postLoading || !canEdit ? 0.7 : 1, minHeight: 44, transition: "background 0.2s" }} onMouseEnter={e => !postLoading && canEdit && (e.currentTarget.style.background = "#15803d")} onMouseLeave={e => !postLoading && canEdit && (e.currentTarget.style.background = "#16a34a")}>
                {postLoading ? "Recording..." : "Yes, Record Trip"}
              </button>
            </div>
          </div>
        </div>
      )}

      {resolvingStops.length > 0 && (
        <div onClick={closeResolveModal} style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 200, padding: isMobile ? 0 : 24, animation: "fadeIn 0.2s ease-out" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: isMobile ? "20px 20px 0 0" : 12, padding: isMobile ? "28px 20px" : 32, width: "100%", maxWidth: 560, maxHeight: isMobile ? "90vh" : "85vh", overflowY: "auto", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)", animation: "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)" }}>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h3 style={{ margin: "0 0 4px 0", color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>Resolve Dispute</h3>
                <p style={{ margin: 0, color: "#94a3b8", fontSize: FONT_SIZE.sm }}>Edit and split stops as needed</p>
              </div>
              <button onClick={closeResolveModal} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 0, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {resolveLoading && (
              <div style={{ display: "flex", justifyContent: "center", padding: "32px 0" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid #e2e8f0", borderTopColor: "#0070f3", animation: "spin 1s linear infinite" }} />
              </div>
            )}

            {!resolveLoading && resolvingDisputeReason && (
              <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, marginBottom: 20 }}>
                <p style={{ margin: "0 0 4px 0", fontSize: FONT_SIZE.xs, color: "#ef4444", fontWeight: 600 }}>Dispute Reason</p>
                <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#7f1d1d" }}>{resolvingDisputeReason}</p>
              </div>
            )}

            {!resolveLoading && resolvingStops.map((rs, idx) => {
              return (
                <div key={rs.tempId} style={{ border: `1.5px solid ${rs.isOriginal ? "#e2e8f0" : "#c7d2fe"}`, borderRadius: 10, padding: 16, marginBottom: 16, background: rs.isOriginal ? "#f8fafc" : "#f5f3ff" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <span style={{ fontWeight: 700, fontSize: FONT_SIZE.sm, color: "#0f172a" }}>
                      {rs.isOriginal ? "Original Stop" : `Additional Stop ${idx}`}
                    </span>
                    {!rs.isOriginal && (
                      <button onClick={() => removeResolveStop(rs.tempId)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", padding: 4, display: "flex", alignItems: "center", fontSize: FONT_SIZE.xs, fontWeight: 600 }}>
                        <Icon icon="mdi:close-circle" width={18} /> Remove
                      </button>
                    )}
                  </div>

                  {/* Stop Type Toggle */}
                  <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                    {(["customer", "store"] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => updateResolveStop(rs.tempId, "stop_type", type)}
                        style={{
                          flex: 1, padding: "8px 0", borderRadius: 6, cursor: "pointer",
                          border: `1.5px solid ${rs.stop_type === type ? "#0070f3" : "#e2e8f0"}`,
                          fontSize: FONT_SIZE.xs, fontWeight: rs.stop_type === type ? 700 : 500,
                          background: rs.stop_type === type ? "#0070f3" : "white",
                          color: rs.stop_type === type ? "white" : "#475569",
                          transition: "all 0.15s"
                        }}
                      >
                        {type === "customer" ? "Customer" : "Store"}
                      </button>
                    ))}
                  </div>

                  {/* Customer stop fields */}
                  {rs.stop_type === "customer" && (
                    <>
                      <div style={{ marginBottom: 12 }}>
                        <label style={{ display: "block", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#475569", marginBottom: 4 }}>Broker *</label>
                        <select
                          value={rs.broker_id || ""}
                          onChange={e => updateResolveStop(rs.tempId, "broker_id", e.target.value || null)}
                          style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 6, fontSize: FONT_SIZE.sm, boxSizing: "border-box", background: "white" }}
                        >
                          <option value="">Select broker...</option>
                          {allBrokers.map(b => (
                            <option key={b.broker_id} value={b.broker_id}>{b.broker_name}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ marginBottom: 12 }}>
                        <label style={{ display: "block", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#475569", marginBottom: 4 }}>Customer</label>
                        <CustomerSelector
                          onSelect={(c) => updateResolveStop(rs.tempId, "customer_id", c.customer_id || null)}
                          initialValue={rs.customer_name || ""}
                        />
                      </div>
                      <div style={{ marginBottom: 12 }}>
                        <label style={{ display: "block", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#475569", marginBottom: 4 }}>Stop Location *</label>
                        <input
                          type="text"
                          value={rs.stop_location}
                          onChange={e => updateResolveStop(rs.tempId, "stop_location", e.target.value)}
                          placeholder="e.g. Aba Road, beside GTBank"
                          style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 6, fontSize: FONT_SIZE.sm, boxSizing: "border-box" }}
                        />
                      </div>
                    </>
                  )}

                  {/* Store stop fields */}
                  {rs.stop_type === "store" && (
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: "block", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#475569", marginBottom: 4 }}>Store *</label>
                      <select
                        value={rs.store_name || ""}
                        onChange={e => updateResolveStop(rs.tempId, "store_name", e.target.value || null)}
                        style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 6, fontSize: FONT_SIZE.sm, boxSizing: "border-box", background: "white" }}
                      >
                        <option value="">Select store...</option>
                        {storeLocations.map(loc => (
                          <option key={loc} value={loc}>{loc}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Quantity */}
                  <div style={{ marginBottom: 0 }}>
                    <label style={{ display: "block", fontWeight: 600, fontSize: FONT_SIZE.xs, color: "#475569", marginBottom: 4 }}>Bags Offloaded *</label>
                    <input
                      type="number"
                      min={1}
                      value={rs.quantity_offloaded || ""}
                      onChange={e => {
                        const val = parseInt(e.target.value) || 0
                        updateResolveStop(rs.tempId, "quantity_offloaded", val)
                      }}
                      placeholder="e.g. 200"
                      style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 6, fontSize: FONT_SIZE.sm, boxSizing: "border-box" }}
                    />
                  </div>
                </div>
              )
            })}

            {/* Quantity summary */}
            <div style={{ padding: "10px 14px", background: isOverLimit ? "#fef2f2" : "#f0fdf4", border: `1.5px solid ${isOverLimit ? "#fecaca" : "#bbf7d0"}`, borderRadius: 8, marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: FONT_SIZE.sm, color: isOverLimit ? "#b91c1c" : "#15803d", fontWeight: 500 }}>Total Bags</span>
              <span style={{ fontSize: FONT_SIZE.base, fontWeight: 700, color: isOverLimit ? "#b91c1c" : "#15803d" }}>
                {totalResolveQuantity} / {resolveOriginalQuantity}
              </span>
            </div>
            {isOverLimit && (
              <div style={{ padding: "8px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, marginBottom: 12 }}>
                <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#b91c1c", fontWeight: 600 }}>
                  Total quantity ({totalResolveQuantity}) cannot exceed original disputed quantity ({resolveOriginalQuantity})
                </p>
              </div>
            )}

            {/* Add Another Stop */}
            <button
              onClick={addResolveStop}
              style={{
                width: "100%", padding: "10px 0", marginBottom: 16,
                background: "white", color: "#0070f3", border: "1.5px dashed #0070f3",
                borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.sm,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                transition: "all 0.15s"
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "#eff6ff" }}
              onMouseLeave={e => { e.currentTarget.style.background = "white" }}
            >
              <Icon icon="mdi:plus-circle" width={18} />
              Add Another Stop
            </button>

            {resolveMessage && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#ef4444", marginBottom: 14, fontSize: FONT_SIZE.sm, padding: "8px 12px", background: "#fef2f2", borderRadius: 6, border: "1px solid #fecaca" }}>
                <Icon icon="mdi:alert-circle" width={16} />
                {resolveMessage}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={closeResolveModal} disabled={resolveSubmitting || resolveLoading} style={{ padding: "12px 16px", background: "white", color: "#475569", border: "1px solid #cbd5e1", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, minHeight: 44 }}>
                Cancel
              </button>
              <button onClick={handleResolveStops} disabled={resolveSubmitting || resolveLoading || isOverLimit} style={{ padding: "12px 16px", background: resolveSubmitting || resolveLoading || isOverLimit ? "#94a3b8" : "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: resolveSubmitting || resolveLoading || isOverLimit ? "not-allowed" : "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {resolveLoading ? "Loading..." : resolveSubmitting ? "Saving..." : "Save & Resolve"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Editing writes the full stop set back, so it must never be reachable
          while selectedStops is still the empty placeholder. */}
      {isEditingTrip && selectedTrip && selectedStops && !detailLoading && !detailFailed && (
        <TripEditModal
          trip={{
            trip_id: selectedTrip.trip_id,
            plate_number: selectedTrip.plate_number,
            product: selectedTrip.product,
            loaded_quantity: selectedTrip.loaded_quantity,
            stops: selectedStops,
            discrepancies: selectedDiscrepancies,
          }}
          isMobile={isMobile}
          canEdit={canEdit}
          onClose={() => { closeModals(); loadAll() }}
        />
      )}
    </div>
  )
}