"use client"

import { FONT_SIZE } from "@/lib/constants"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { DataTable } from "./DataTable"
import { ExportActions } from "./ExportActions"
import { EmptyState } from "./EmptyState"
import { LoadingState } from "./LoadingState"
import { ReportModal } from "./ReportModal"
import { ReportCard, ReportCardField, ReportCardSection } from "./ReportCard"
import { QuickFilterPills } from "./QuickFilterPills"
import { DateRangeSelector } from "./DateRangeSelector"

// ── Types ──────────────────────────────────────────────────────────────────
type DriverSummary = {
  driver_id: string
  driver_name: string
  trips_count: number
  stops_count: number
  total_bags: number
  avg_bags_per_trip: number
}

type DriverTrip = {
  trip_id: string
  plate_number: string
  product: string
  material_centre: string
  loaded_quantity: number
  stops_count: number
  total_bags_offloaded: number
  trip_status: string
  created_at: string
}

type TruckSummary = {
  plate_number: string
  kbnl_truck_no: string | null
  truck_model: string
  maintenance_count: number
  total_maintenance_amount: number
  maintenance_breakdown: { type: string; count: number; amount: number }[]
  fuel_count: number
  total_litres: number
  total_fuel_amount: number
  completed_trips: number
  avg_litres_per_trip: number
}

type TruckMaintenance = {
  report_id: string
  maintenance_type: string
  maintenance_location: string | null
  amount: number
  status: string
  reported_at: string
  officer_name: string
}

type TruckFuel = {
  request_id: string
  driver_name: string
  litres: number
  total_amount: number
  confirmed_at: string
}

type BrokerSummary = {
  broker_id: string
  broker_name: string
  stops_count: number
  total_bags: number
  total_revenue: number
}

type BrokerStop = {
  stop_id: string
  plate_number: string
  customer_name: string | null
  quantity_offloaded: number
  price_per_bag: number | null
  revenue: number
  stop_time: string
}

type DrillDown =
  | { kind: "driver"; driver: DriverSummary; trips: DriverTrip[] }
  | { kind: "truck"; truck: TruckSummary; maintenance: TruckMaintenance[]; fuel: TruckFuel[] }
  | { kind: "broker"; broker: BrokerSummary; stops: BrokerStop[] }

type ViewMode = "card" | "table"

// ── Constants ──────────────────────────────────────────────────────────────


// ── Date helpers ───────────────────────────────────────────────────────────
function thisMonthRange() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString()
  return { from, to }
}

function thisYearRange() {
  const now = new Date()
  const from = new Date(now.getFullYear(), 0, 1).toISOString()
  const to = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999).toISOString()
  return { from, to }
}

function toEndOfDay(dateStr: string) {
  const d = new Date(dateStr)
  d.setHours(23, 59, 59, 999)
  return d.toISOString()
}

// ── Export helpers ────────────────────────────────────────────────────────
function downloadCSV(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const csv = [
    headers.join(","),
    ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? "")).join(","))
  ].join("\n")
  const blob = new Blob([csv], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function downloadXLSX(filename: string, rows: Record<string, unknown>[], sheetName: string) {
  if (!rows.length) return
  import("xlsx").then((XLSX) => {
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
    XLSX.writeFile(wb, filename)
  })
}

// ── Component ──────────────────────────────────────────────────────────────
export default function Reports() {
  const [isMobile, setIsMobile] = useState(false)
  const [, setIsDesktop] = useState(true)
  const [section, setSection] = useState<"drivers" | "trucks" | "brokers">("drivers")
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [dateError, setDateError] = useState("")
  const [loading, setLoading] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [quickFilter, setQuickFilter] = useState<"month" | "year" | "custom">("month")
  const [viewMode, setViewMode] = useState<ViewMode>("table")

  const [driverSummaries, setDriverSummaries] = useState<DriverSummary[]>([])
  const [truckSummaries, setTruckSummaries] = useState<TruckSummary[]>([])
  const [brokerSummaries, setBrokerSummaries] = useState<BrokerSummary[]>([])
  const [drillDown, setDrillDown] = useState<DrillDown | null>(null)
  const [drillLoading, setDrillLoading] = useState(false)

  // Responsive hook
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 640
      setIsMobile(mobile)
      setIsDesktop(!mobile)
      if (!hasLoaded) setViewMode(mobile ? "card" : "table")
    }

    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [hasLoaded])

  // Initialize with default filter
  useEffect(() => {
    applyQuickFilter("month")
  }, [])

  function applyQuickFilter(filter: "month" | "year") {
    setQuickFilter(filter)
    setDateError("")
    const range = filter === "month" ? thisMonthRange() : thisYearRange()
    setFromDate(range.from.slice(0, 10))
    setToDate(range.to.slice(0, 10))
  }

  function getRange() {
    if (quickFilter !== "custom") {
      return quickFilter === "month" ? thisMonthRange() : thisYearRange()
    }
    return {
      from: new Date(fromDate).toISOString(),
      to: toEndOfDay(toDate),
    }
  }

  async function handleGenerate() {
    if (quickFilter === "custom") {
      if (!fromDate || !toDate) return setDateError("Select both a from and to date")
      if (new Date(fromDate) > new Date(toDate)) return setDateError("From date cannot be after to date")
    }
    setDateError("")
    setLoading(true)
    setDrillDown(null)

    if (section === "drivers") await fetchDriverReports()
    else if (section === "trucks") await fetchTruckReports()
    else await fetchBrokerReports()

    setLoading(false)
    setHasLoaded(true)
  }

  // ── Driver reports ───────────────────────────────────────────────────────
  async function fetchDriverReports() {
    const { from, to } = getRange()

    const { data: drivers } = await supabase
      .from("Drivers")
      .select("driver_id, full_name")
      .order("full_name", { ascending: true })

    if (!drivers) return

    const summaries: DriverSummary[] = await Promise.all(drivers.map(async (d) => {
      const { data: trips } = await supabase
        .from("Trips")
        .select("trip_id, loaded_quantity")
        .eq("driver_id", d.driver_id)
        .gte("created_at", from)
        .lte("created_at", to)

      const tripIds = (trips || []).map(t => t.trip_id)
      let stops_count = 0
      let total_bags = 0

      if (tripIds.length > 0) {
        const { data: stops } = await supabase
          .from("Stops")
          .select("quantity_offloaded")
          .in("trip_id", tripIds)

        stops_count = (stops || []).length
        total_bags = (stops || []).reduce((sum, s) => sum + (s.quantity_offloaded || 0), 0)
      }

      const trips_count = trips?.length ?? 0

      return {
        driver_id: d.driver_id,
        driver_name: d.full_name,
        trips_count,
        stops_count,
        total_bags,
        avg_bags_per_trip: trips_count > 0 ? Math.round(total_bags / trips_count) : 0,
      }
    }))

    setDriverSummaries(summaries.filter(d => d.trips_count > 0))
  }

  async function fetchDriverDrillDown(driver: DriverSummary) {
    setDrillLoading(true)
    const { from, to } = getRange()

    const { data: tripsRaw } = await supabase
      .from("Trips")
      .select("trip_id, plate_number, product, material_centre, loaded_quantity, trip_status, created_at")
      .eq("driver_id", driver.driver_id)
      .gte("created_at", from)
      .lte("created_at", to)
      .order("created_at", { ascending: false })

    const trips: DriverTrip[] = await Promise.all((tripsRaw || []).map(async (t) => {
      const { data: stops } = await supabase
        .from("Stops")
        .select("quantity_offloaded")
        .eq("trip_id", t.trip_id)

      return {
        trip_id: t.trip_id,
        plate_number: t.plate_number,
        product: t.product,
        material_centre: t.material_centre,
        loaded_quantity: t.loaded_quantity,
        stops_count: (stops || []).length,
        total_bags_offloaded: (stops || []).reduce((sum, s) => sum + (s.quantity_offloaded || 0), 0),
        trip_status: t.trip_status,
        created_at: t.created_at,
      }
    }))

    setDrillDown({ kind: "driver", driver, trips })
    setDrillLoading(false)
  }

  // ── Truck reports ────────────────────────────────────────────────────────
  async function fetchTruckReports() {
    const { from, to } = getRange()

    const { data: trucks } = await supabase
      .from("Trucks")
      .select("plate_number, kbnl_truck_no, truck_model")
      .order("plate_number", { ascending: true })

    if (!trucks) return

    const summaries: TruckSummary[] = await Promise.all(trucks.map(async (t) => {
      // Maintenance
      const { data: maintenance } = await supabase
        .from("maintenance_reports")
        .select("maintenance_type, amount")
        .eq("plate_number", t.plate_number)
        .eq("status", "Validated")
        .gte("validated_at", from)
        .lte("validated_at", to)

      const maintenance_count = (maintenance || []).length
      const total_maintenance_amount = (maintenance || []).reduce((sum, m) => sum + m.amount, 0)

      // Breakdown by type
      const typeMap: Record<string, { count: number; amount: number }> = {}
      for (const m of maintenance || []) {
        if (!typeMap[m.maintenance_type]) typeMap[m.maintenance_type] = { count: 0, amount: 0 }
        typeMap[m.maintenance_type].count++
        typeMap[m.maintenance_type].amount += m.amount
      }
      const maintenance_breakdown = Object.entries(typeMap).map(([type, v]) => ({ type, ...v }))

      // Fuel
      const { data: fuel } = await supabase
        .from("fuel_requests")
        .select("litres, total_amount")
        .eq("plate_number", t.plate_number)
        .eq("atf_status", "Confirmed")
        .gte("confirmed_at", from)
        .lte("confirmed_at", to)

      const fuel_count = (fuel || []).length
      const total_litres = (fuel || []).reduce((sum, f) => sum + f.litres, 0)
      const total_fuel_amount = (fuel || []).reduce((sum, f) => sum + f.total_amount, 0)

      // Completed trips for avg fuel calc
      const { data: trips } = await supabase
        .from("Trips")
        .select("trip_id")
        .eq("plate_number", t.plate_number)
        .eq("trip_status", "Completed")
        .gte("created_at", from)
        .lte("created_at", to)

      const completed_trips = (trips || []).length
      const avg_litres_per_trip = completed_trips > 0 ? Math.round((total_litres / completed_trips) * 10) / 10 : 0

      return {
        plate_number: t.plate_number,
        kbnl_truck_no: t.kbnl_truck_no,
        truck_model: t.truck_model,
        maintenance_count,
        total_maintenance_amount,
        maintenance_breakdown,
        fuel_count,
        total_litres,
        total_fuel_amount,
        completed_trips,
        avg_litres_per_trip,
      }
    }))

    setTruckSummaries(summaries)
  }

  async function fetchTruckDrillDown(truck: TruckSummary) {
    setDrillLoading(true)
    const { from, to } = getRange()

    const { data: maintRaw } = await supabase
      .from("maintenance_reports")
      .select("report_id, maintenance_type, maintenance_location, amount, status, reported_at, manager_id")
      .eq("plate_number", truck.plate_number)
      .eq("status", "Validated")
      .gte("validated_at", from)
      .lte("validated_at", to)
      .order("reported_at", { ascending: false })

    const maintenance: TruckMaintenance[] = await Promise.all((maintRaw || []).map(async (m) => {
      const { data: officer } = await supabase
        .from("truck_officers")
        .select("full_name")
        .eq("manager_id", m.manager_id)
        .single()
      return {
        report_id: m.report_id,
        maintenance_type: m.maintenance_type,
        maintenance_location: m.maintenance_location,
        amount: m.amount,
        status: m.status,
        reported_at: m.reported_at,
        officer_name: officer?.full_name ?? "Unknown",
      }
    }))

    const { data: fuelRaw } = await supabase
      .from("fuel_requests")
      .select("request_id, driver_id, litres, total_amount, confirmed_at")
      .eq("plate_number", truck.plate_number)
      .eq("atf_status", "Confirmed")
      .gte("confirmed_at", from)
      .lte("confirmed_at", to)
      .order("confirmed_at", { ascending: false })

    const fuel: TruckFuel[] = await Promise.all((fuelRaw || []).map(async (f) => {
      const { data: driver } = await supabase
        .from("Drivers").select("full_name").eq("driver_id", f.driver_id).single()
      return {
        request_id: f.request_id,
        driver_name: driver?.full_name ?? "Unknown",
        litres: f.litres,
        total_amount: f.total_amount,
        confirmed_at: f.confirmed_at,
      }
    }))

    setDrillDown({ kind: "truck", truck, maintenance, fuel })
    setDrillLoading(false)
  }

  // ── Broker reports ────────────────────────────────────────────────────────
  async function fetchBrokerReports() {
    const { from, to } = getRange()

    const { data: brokers } = await supabase
      .from("Brokers")
      .select("broker_id, broker_name")
      .order("broker_name", { ascending: true })

    if (!brokers) return

    const summaries: BrokerSummary[] = await Promise.all(brokers.map(async (b) => {
      const { data: stops } = await supabase
        .from("Stops")
        .select("stop_id, quantity_offloaded")
        .eq("broker_id", b.broker_id)
        .eq("confirmed", true)
        .gte("stop_time", from)
        .lte("stop_time", to)

      const stopIds = (stops || []).map(s => s.stop_id)
      let total_revenue = 0

      if (stopIds.length > 0) {
        const { data: confirmations } = await supabase
          .from("Stop_Confirmations")
          .select("stop_id, price_per_bag")
          .in("stop_id", stopIds)

        const priceMap: Record<string, number> = {}
        if (confirmations) {
          for (const c of confirmations) {
            priceMap[c.stop_id] = c.price_per_bag ?? 0
          }
        }

        for (const stop of stops || []) {
          const price = priceMap[stop.stop_id] ?? 0
          total_revenue += stop.quantity_offloaded * price
        }
      }

      const stops_count = (stops || []).length
      const total_bags = (stops || []).reduce((sum, s) => sum + s.quantity_offloaded, 0)

      return {
        broker_id: b.broker_id,
        broker_name: b.broker_name,
        stops_count,
        total_bags,
        total_revenue,
      }
    }))

    setBrokerSummaries(summaries.filter(b => b.stops_count > 0))
  }

  async function fetchBrokerDrillDown(broker: BrokerSummary) {
    setDrillLoading(true)
    const { from, to } = getRange()

    const { data: stopsRaw } = await supabase
      .from("Stops")
      .select("stop_id, trip_id, quantity_offloaded, stop_time")
      .eq("broker_id", broker.broker_id)
      .eq("confirmed", true)
      .gte("stop_time", from)
      .lte("stop_time", to)
      .order("stop_time", { ascending: false })

    const stops: BrokerStop[] = await Promise.all((stopsRaw || []).map(async (s) => {
      const { data: trip } = await supabase
        .from("Trips")
        .select("plate_number")
        .eq("trip_id", s.trip_id)
        .single()

      const { data: confirmation } = await supabase
        .from("Stop_Confirmations")
        .select("price_per_bag")
        .eq("stop_id", s.stop_id)
        .single()

      const price = confirmation?.price_per_bag ?? 0
      const revenue = s.quantity_offloaded * price

      return {
        stop_id: s.stop_id,
        plate_number: trip?.plate_number ?? "—",
        customer_name: null,
        quantity_offloaded: s.quantity_offloaded,
        price_per_bag: price,
        revenue,
        stop_time: s.stop_time,
      }
    }))

    setDrillDown({ kind: "broker", broker, stops })
    setDrillLoading(false)
  }

  // ── Export helpers ────────────────────────────────────────────────────────
  function exportDriverSummary(format: "csv" | "xlsx") {
    const rows = driverSummaries.map((d) => ({
      Driver: d.driver_name,
      Trips: d.trips_count,
      Stops: d.stops_count,
      "Total Bags Delivered": d.total_bags,
      "Avg Bags per Trip": d.avg_bags_per_trip,
    }))
    if (format === "csv") downloadCSV("driver_summary.csv", rows)
    else downloadXLSX("driver_summary.xlsx", rows, "Driver Summary")
  }

  function exportDriverDetail(format: "csv" | "xlsx") {
    if (drillDown?.kind !== "driver") return
    const rows = drillDown.trips.map((t) => ({
      "Trip ID": t.trip_id,
      Plate: t.plate_number,
      Product: t.product,
      "Loading Point": t.material_centre,
      "Loaded (bags)": t.loaded_quantity,
      Stops: t.stops_count,
      "Bags Offloaded": t.total_bags_offloaded,
      Status: t.trip_status,
      Date: new Date(t.created_at).toLocaleDateString(),
    }))
    if (format === "csv") {
      downloadCSV(`${drillDown.driver.driver_name}_trips.csv`, rows)
    } else {
      downloadXLSX(`${drillDown.driver.driver_name}_trips.xlsx`, rows, "Trip Detail")
    }
  }

  function exportTruckSummary(format: "csv" | "xlsx") {
    const rows = truckSummaries.map((t) => ({
      Plate: t.plate_number,
      "KbNL No.": t.kbnl_truck_no ?? "—",
      Model: t.truck_model,
      "Completed Trips": t.completed_trips,
      "Maintenance Count": t.maintenance_count,
      "Total Maintenance (₦)": t.total_maintenance_amount,
      "Fuel Count": t.fuel_count,
      "Total Litres": t.total_litres,
      "Total Fuel (₦)": t.total_fuel_amount,
      "Avg Litres/Trip": t.avg_litres_per_trip,
    }))
    if (format === "csv") downloadCSV("truck_summary.csv", rows)
    else downloadXLSX("truck_summary.xlsx", rows, "Truck Summary")
  }

  function exportTruckDetail(format: "csv" | "xlsx") {
    if (drillDown?.kind !== "truck") return
    const maintRows = drillDown.maintenance.map((m) => ({
      Type: m.maintenance_type,
      Location: m.maintenance_location ?? "—",
      "Amount (₦)": m.amount,
      Officer: m.officer_name,
      Date: new Date(m.reported_at).toLocaleDateString(),
    }))
    const fuelRows = drillDown.fuel.map((f) => ({
      Driver: f.driver_name,
      Litres: f.litres,
      "Amount (₦)": f.total_amount,
      Date: new Date(f.confirmed_at).toLocaleDateString(),
    }))
    if (format === "csv") {
      downloadCSV(`${drillDown.truck.plate_number}_maintenance.csv`, maintRows)
      downloadCSV(`${drillDown.truck.plate_number}_fuel.csv`, fuelRows)
    } else {
      import("xlsx").then((XLSX) => {
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(maintRows), "Maintenance")
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fuelRows), "Fuel")
        XLSX.writeFile(wb, `${drillDown.truck.plate_number}_detail.xlsx`)
      })
    }
  }

  function exportBrokerSummary(format: "csv" | "xlsx") {
    const rows = brokerSummaries.map((b) => ({
      Broker: b.broker_name,
      "Confirmed Stops": b.stops_count,
      "Total Bags Sold": b.total_bags,
      "Total Revenue (₦)": b.total_revenue,
    }))
    if (format === "csv") downloadCSV("broker_summary.csv", rows)
    else downloadXLSX("broker_summary.xlsx", rows, "Broker Summary")
  }

  function exportBrokerDetail(format: "csv" | "xlsx") {
    if (drillDown?.kind !== "broker") return
    const rows = drillDown.stops.map((s) => ({
      "Stop ID": s.stop_id,
      Plate: s.plate_number,
      "Bags Offloaded": s.quantity_offloaded,
      "Price per Bag (₦)": s.price_per_bag ?? 0,
      "Revenue (₦)": s.revenue,
      Date: new Date(s.stop_time).toLocaleDateString(),
    }))
    if (format === "csv") {
      downloadCSV(`${drillDown.broker.broker_name}_stops.csv`, rows)
    } else {
      downloadXLSX(`${drillDown.broker.broker_name}_stops.xlsx`, rows, "Stop Detail")
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: isMobile ? "16px" : "32px", fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, color: "#0f172a", fontSize: isMobile ? FONT_SIZE["2xl"] : FONT_SIZE["3xl"], fontWeight: 700, letterSpacing: "-0.5px" }}>
          Reports
        </h1>
        <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: FONT_SIZE.base }}>
           {section === "drivers" ? "Driver performance metrics and trip summaries" : section === "trucks" ? "Truck health, maintenance, and fuel analytics" : "Broker sales and revenue summaries"}
        </p>
      </div>

      {/* Section Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {(["drivers", "trucks", "brokers"] as const).map((s) => (
          <button
            key={s}
            onClick={() => {
setSection(s)
setHasLoaded(false)
setDrillDown(null)
}}
            style={{
              padding: "8px 16px",
borderRadius: 20,
fontSize: FONT_SIZE.sm,
cursor: "pointer",
              border: section === s ? "" : "1.5px solid #e2e8f0",
              background: section === s ? "#171717" : "white",
              color: section === s ? "#f8fafc" : "#64748b",
              fontWeight: section === s ? 600 : 500,
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              if (section !== s) {
                e.currentTarget.style.background = "#f8fafc"
                e.currentTarget.style.borderColor = "#cbd5e1"
              }
            }}
            onMouseLeave={(e) => {
              if (section !== s) {
                e.currentTarget.style.background = "white"
                e.currentTarget.style.borderColor = "#e2e8f0"
              }
            }}
          >
            {s === "drivers" ? "Driver Performance" : s === "trucks" ? "Truck Health" : "Broker Sales"}
          </button>
        ))}
      </div>

      {/* Filters Card */}
      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: isMobile ? 16 : 20, marginBottom: 24, boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)" }}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: FONT_SIZE.xs, color: "#475569", fontWeight: 500, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Quick Filters
          </label>
          <QuickFilterPills
            options={[
              { id: "month", label: "This Month" },
              { id: "year", label: "This Year" },
              { id: "custom", label: "Custom Range" },
            ]}
            selectedId={quickFilter}
            onSelect={(id) => {
              setQuickFilter(id as "month" | "year" | "custom")
              if (id !== "custom") applyQuickFilter(id as "month" | "year")
            }}
          />
        </div>

                {quickFilter === "custom" && (
          <div style={{ marginBottom: 16 }}>
                          <label style={{ display: "block", fontSize: FONT_SIZE.xs, color: "#475569", fontWeight: 500, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Date Range
            </label>
            <DateRangeSelector
              fromDate={fromDate}
              toDate={toDate}
              onFromChange={setFromDate}
              onToChange={setToDate}
              error={dateError}
              isMobile={isMobile}
            />
          </div>
        )}

        <button
          onClick={handleGenerate}
          disabled={loading}
          style={{
            width: isMobile ? "100%" : "auto",
padding: "12px 16px",
background: "#0070f3",
color: "white",
border: "none",
borderRadius: 8,
cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 600,
            fontSize: FONT_SIZE.md,
            minHeight: 44,
            opacity: loading ? 0.7 : 1,
            transition: "all 0.2s ease",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
          onMouseEnter={(e) => {
            if (!loading) {
              e.currentTarget.style.transform = "translateY(-2px)"
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 112, 243, 0.25)"
            }
          }}
          onMouseLeave={(e) => {
            if (!loading) {
              e.currentTarget.style.transform = "translateY(0)"
              e.currentTarget.style.boxShadow = "none"
            }
          }}
        >
          {loading ? (
            <>
              <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", animation: "spin 1s linear infinite" }} />
              Generating...
            </>
          ) : (
            "Generate Report"
          )}
        </button>
      </div>

{/* Loading State */}
      {loading && <LoadingState message="Calculating report data..." />}

      {/* Empty State */}
      {!loading && !hasLoaded && <EmptyState icon="📊" title="No report generated" description="Select a date range and click 'Generate Report' to view data." />}

      {/* Driver Reports */}
      {!loading && hasLoaded && section === "drivers" && (
        <div>
          {driverSummaries.length === 0 ? (
            <EmptyState icon="👥" title="No data available" description="No drivers with trips found in this period." />
          ) : (
            <div>
              {/* Header with View Toggle */}
            <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 12, marginBottom: 16 }}>
              <div>
                  <h2 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.lg, fontWeight: 600 }}>Driver Summary</h2>
              <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: FONT_SIZE.sm }}>{driverSummaries.length} drivers</p>
              </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {/* View Toggle */}
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
}}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z" />
                      </svg>
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
                      }}
>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M3 4h18v2H3V4zm0 7h18v2H3v-2zm0 7h18v2H3v-2z" />
                      </svg>
                    </button>
                </div>
              <ExportActions onExportCSV={() => exportDriverSummary("csv")} onExportXLSX={() => exportDriverSummary("xlsx")} />
                </div>
          </div>

          {/* Card/Table Views */}
          {viewMode === "card" ? (
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
                  {driverSummaries.map((driver) => (
                    <ReportCard key={driver.driver_id}>
                <div>
                  <div style={{ marginBottom: 12 }}>
                          <h3 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.lg, fontWeight: 600 }}>{driver.driver_name}</h3>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "12px 0", borderTop: "1px solid #f1f5f9", borderBottom: "1px solid #f1f5f9" }}>
                          <ReportCardField label="Trips" value={driver.trips_count} />
                          <ReportCardField label="Stops" value={driver.stops_count} />
                          <ReportCardField label="Bags" value={driver.total_bags} />
                          <ReportCardField label="Avg/Trip" value={driver.avg_bags_per_trip} />
                </div>
<button
                          onClick={() => fetchDriverDrillDown(driver)}
                          style={{
                            width: "100%",
                            marginTop: 12,
                            padding: "10px 14px",
                            background: "#0070f3",
                            color: "white",
                            border: "none",
                            borderRadius: 8,
                            cursor: "pointer",
                            fontWeight: 600,
                            fontSize: FONT_SIZE.md,
                            minHeight: 40,
                            transition: "all 0.2s ease",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "#0057c7"
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "#0070f3"
                          }}
                        >
                          View Trips
                        </button>
              </div>
              </ReportCard>
                  ))}
              </div>
) : (
                <DataTable
                  columns={[
                    { key: "driver_name", label: "Driver" },
                    { key: "trips_count", label: "Trips" },
                    { key: "stops_count", label: "Stops" },
                    { key: "total_bags", label: "Bags Delivered" },
                    { key: "avg_bags_per_trip", label: "Avg Bags/Trip" },
                    {
                      key: "actions",
                      label: "Actions",
                      render: (_value, driver: DriverSummary) => (
                        <button
                          onClick={() => fetchDriverDrillDown(driver)}
                          style={{
                            padding: "6px 10px",
                            background: "white",
                            color: "#0070f3",
                            border: "1px solid #e2e8f0",
                            borderRadius: 6,
                            cursor: "pointer",
                            fontWeight: 500,
                            fontSize: FONT_SIZE.xs,
                            transition: "all 0.2s ease",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "#eff6ff"
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "white"
                          }}
                        >
                          View Trips
                        </button>
                      ),
                    },
                  ]}
                  rows={driverSummaries}
                  rowKey={(row) => row.driver_id}
                />
              )}
            </div>
          )}

          {/* Driver Detail Modal */}
          <ReportModal
            isOpen={drillDown?.kind === "driver" && !drillLoading}
            onClose={() => setDrillDown(null)}
            title={`${drillDown?.kind === "driver" ? drillDown.driver.driver_name : ""} — Trip Details`}
            subtitle={drillDown?.kind === "driver" ? `${drillDown.trips.length} trips in period` : ""}
            isMobile={isMobile}
            actions={
              drillDown?.kind === "driver" ? (
                <ExportActions onExportCSV={() => exportDriverDetail("csv")} onExportXLSX={() => exportDriverDetail("xlsx")} />
              ) : null
            }
          >
            {drillDown?.kind === "driver" && (
              <DataTable
                columns={[
                  {
                    key: "created_at",
                    label: "Date",
                    render: (value) => new Date(value as string).toLocaleDateString(),
                  },
                  { key: "plate_number", label: "Plate" },
                  { key: "product", label: "Product" },
                  { key: "material_centre", label: "Loading Point" },
                  { key: "loaded_quantity", label: "Loaded" },
                  { key: "stops_count", label: "Stops" },
                  { key: "total_bags_offloaded", label: "Delivered" },
                  {
                    key: "trip_status",
                    label: "Status",
                    render: (value) => (
                      <span
                        style={{
                          padding: "4px 8px",
                          borderRadius: 12,
                          fontSize: FONT_SIZE.xs,
                          fontWeight: 600,
                          background:
                            value === "Completed"
                              ? "#f0fdf4"
                              : value === "In transit"
                                ? "#eff6ff"
                                : "#fef3c7",
                          color: value === "Completed" ? "#16a34a" : value === "In transit" ? "#0070f3" : "#d97706",
                        }}
                      >
                        {value}
                      </span>
                    ),
                  },
                ]}
                rows={drillDown.trips}
                rowKey={(row) => row.trip_id}
              />
            )}
          </ReportModal>
        </div>
      )}

      {/* Broker Reports */}
      {!loading && hasLoaded && section === "brokers" && (
        <div>
          {brokerSummaries.length === 0 ? (
            <EmptyState icon="🤝" title="No data available" description="No brokers with confirmed stops found in this period." />
          ) : (
            <div>
              <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 12, marginBottom: 16 }}>
                <div>
                  <h2 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.lg, fontWeight: 600 }}>Broker Summary</h2>
                  <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: FONT_SIZE.sm }}>{brokerSummaries.length} brokers</p>
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", background: "white", border: "1px solid #e2e8f0", borderRadius: 8, padding: 4, gap: 0 }}>
                    <button
                      onClick={() => setViewMode("card")}
                      style={{
                        padding: "8px 12px", background: viewMode === "card" ? "#0070f3" : "transparent",
                        color: viewMode === "card" ? "white" : "#64748b", border: "none", borderRadius: 6,
                        cursor: "pointer", fontSize: FONT_SIZE.xs, fontWeight: 600,
                        minWidth: 44, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z" /></svg>
                    </button>
                    <button
                      onClick={() => setViewMode("table")}
                      style={{
                        padding: "8px 12px", background: viewMode === "table" ? "#0070f3" : "transparent",
                        color: viewMode === "table" ? "white" : "#64748b", border: "none", borderRadius: 6,
                        cursor: "pointer", fontSize: FONT_SIZE.xs, fontWeight: 600,
                        minWidth: 44, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 4h18v2H3V4zm0 7h18v2H3v-2zm0 7h18v2H3v-2z" /></svg>
                    </button>
                  </div>
                  <ExportActions onExportCSV={() => exportBrokerSummary("csv")} onExportXLSX={() => exportBrokerSummary("xlsx")} />
                </div>
              </div>

              {viewMode === "card" ? (
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
                  {brokerSummaries.map((broker) => (
                    <ReportCard key={broker.broker_id}>
                      <div>
                        <div style={{ marginBottom: 12 }}>
                          <h3 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.lg, fontWeight: 600 }}>{broker.broker_name}</h3>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "12px 0", borderTop: "1px solid #f1f5f9", borderBottom: "1px solid #f1f5f9" }}>
                          <ReportCardField label="Confirmed Stops" value={broker.stops_count} />
                          <ReportCardField label="Bags Sold" value={broker.total_bags} />
                          <ReportCardField label="Revenue" value={`₦${broker.total_revenue.toLocaleString()}`} />
                        </div>
                        <button
                          onClick={() => fetchBrokerDrillDown(broker)}
                          style={{
                            width: "100%", marginTop: 12, padding: "10px 14px",
                            background: "#0070f3", color: "white", border: "none", borderRadius: 8,
                            cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, minHeight: 40,
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = "#0057c7"}
                          onMouseLeave={(e) => e.currentTarget.style.background = "#0070f3"}
                        >
                          View Stops
                        </button>
                      </div>
                    </ReportCard>
                  ))}
                </div>
              ) : (
                <DataTable
                  columns={[
                    { key: "broker_name", label: "Broker" },
                    { key: "stops_count", label: "Confirmed Stops" },
                    { key: "total_bags", label: "Bags Sold" },
                    {
                      key: "total_revenue",
                      label: "Revenue",
                      render: (value) => `₦${(value as number).toLocaleString()}`,
                    },
                    {
                      key: "actions",
                      label: "Actions",
                      render: (_value, broker: BrokerSummary) => (
                        <button
                          onClick={() => fetchBrokerDrillDown(broker)}
                          style={{
                            padding: "6px 10px", background: "white", color: "#0070f3",
                            border: "1px solid #e2e8f0", borderRadius: 6, cursor: "pointer",
                            fontWeight: 500, fontSize: FONT_SIZE.xs,
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = "#eff6ff"}
                          onMouseLeave={(e) => e.currentTarget.style.background = "white"}
                        >
                          View Stops
                        </button>
                      ),
                    },
                  ]}
                  rows={brokerSummaries}
                  rowKey={(row) => row.broker_id}
                />
              )}
            </div>
          )}

          <ReportModal
            isOpen={drillDown?.kind === "broker" && !drillLoading}
            onClose={() => setDrillDown(null)}
            title={`${drillDown?.kind === "broker" ? drillDown.broker.broker_name : ""} — Stop Details`}
            subtitle={drillDown?.kind === "broker" ? `${drillDown.stops.length} confirmed stops in period` : ""}
            isMobile={isMobile}
            actions={
              drillDown?.kind === "broker" ? (
                <ExportActions onExportCSV={() => exportBrokerDetail("csv")} onExportXLSX={() => exportBrokerDetail("xlsx")} />
              ) : null
            }
          >
            {drillDown?.kind === "broker" && (
              <DataTable
                columns={[
                  {
                    key: "stop_time",
                    label: "Date",
                    render: (value) => new Date(value as string).toLocaleDateString(),
                  },
                  { key: "plate_number", label: "Plate" },
                  { key: "quantity_offloaded", label: "Bags" },
                  {
                    key: "price_per_bag",
                    label: "Price/Bag",
                    render: (value) => `₦${((value as number) ?? 0).toLocaleString()}`,
                  },
                  {
                    key: "revenue",
                    label: "Revenue",
                    render: (value) => `₦${(value as number).toLocaleString()}`,
                  },
                ]}
                rows={drillDown.stops}
                rowKey={(row) => row.stop_id}
              />
            )}
          </ReportModal>
        </div>
      )}

      {/* Truck Reports */}
      {!loading && hasLoaded && section === "trucks" && (
        <div>
          {truckSummaries.length === 0 ? (
            <EmptyState icon="🚗" title="No data available" description="No trucks found in this period." />
          ) : (
            <div>
              {/* Header with View Toggle */}
            <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 12, marginBottom: 16 }}>
              <div>
                  <h2 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.lg, fontWeight: 600 }}>Truck Summary</h2>
                  <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: FONT_SIZE.sm }}>{truckSummaries.length} trucks</p>
</div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {/* View Toggle */}
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
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z" />
                      </svg>
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
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M3 4h18v2H3V4zm0 7h18v2H3v-2zm0 7h18v2H3v-2z" />
                      </svg>
                    </button>
                  </div>
                  <ExportActions onExportCSV={() => exportTruckSummary("csv")} onExportXLSX={() => exportTruckSummary("xlsx")} />
              </div>
            </div>

            {/* Card/Table Views */}
              {viewMode === "card" ? (
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
                  {truckSummaries.map((truck) => (
                    <ReportCard key={truck.plate_number}>
                      <div>
                        <div style={{ marginBottom: 12 }}>
                      <h3 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.lg, fontWeight: 600 }}>
                            {truck.plate_number}
                            {truck.kbnl_truck_no && <span style={{ fontSize: FONT_SIZE.sm, color: "#64748b", fontWeight: 400 }}> · #{truck.kbnl_truck_no}</span>}
                        </h3>
                        <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: FONT_SIZE.sm }}>{truck.truck_model}</p>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "12px 0", borderTop: "1px solid #f1f5f9", borderBottom: "1px solid #f1f5f9" }}>
                          <ReportCardField label="Completed Trips" value={truck.completed_trips} />
                          <ReportCardField label="Maintenance" value={truck.maintenance_count} />
                      <ReportCardField label="Total Litres" value={truck.total_litres} />
                      <ReportCardField label="Avg L/Trip" value={truck.avg_litres_per_trip} />
                      </div>
                        <button
                          onClick={() => fetchTruckDrillDown(truck)}
                          style={{
                            width: "100%",
                            marginTop: 12,
                            padding: "10px 14px",
                            background: "#0070f3",
                            color: "white",
                            border: "none",
                            borderRadius: 8,
                            cursor: "pointer",
                            fontWeight: 600,
                            fontSize: FONT_SIZE.md,
                            minHeight: 40,
                            transition: "all 0.2s ease",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "#0057c7"
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "#0070f3"
}}
                        >
                          View Detail
                        </button>
                      </div>
                    </ReportCard>
                  ))}
                            </div>
) : (
                <DataTable
                  columns={[
                    {
                      key: "plate_number",
                      label: "Truck",
                      render: (_value, truck: TruckSummary) => (
                        <div>
                          <div style={{ fontWeight: 600, color: "#0f172a" }}>{truck.plate_number}</div>
                          {truck.kbnl_truck_no && (
                            <div style={{ fontSize: FONT_SIZE.xs, color: "#64748b" }}>#{truck.kbnl_truck_no}</div>
                          )}
                          <div style={{ fontSize: FONT_SIZE.xs, color: "#64748b" }}>{truck.truck_model}</div>
          </div>
),
                    },
                    { key: "completed_trips", label: "Completed Trips" },
                    { key: "maintenance_count", label: "Maintenance" },
                    {
                      key: "total_maintenance_amount",
                      label: "Total Maintenance",
                      render: (value) => `₦${(value as number).toLocaleString()}`,
                    },
                    { key: "fuel_count", label: "Fuel Events" },
                    {
                      key: "total_litres",
                      label: "Litres",
                      render: (value) => `${(value as number).toLocaleString()}L`,
                    },
                    {
                      key: "total_fuel_amount",
                      label: "Fuel Cost",
                      render: (value) => `₦${(value as number).toLocaleString()}`,
                    },
                    { key: "avg_litres_per_trip", label: "Avg L/Trip" },
                    {
                      key: "actions",
                      label: "Actions",
                      render: (_value, truck: TruckSummary) => (
                        <button
                          onClick={() => fetchTruckDrillDown(truck)}
                          style={{
                            padding: "6px 10px",
                            background: "white",
                            color: "#0070f3",
                            border: "1px solid #e2e8f0",
                            borderRadius: 6,
                            cursor: "pointer",
                            fontWeight: 500,
                            fontSize: FONT_SIZE.xs,
                            transition: "all 0.2s ease",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "#eff6ff"
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "white"
                          }}
                        >
                          View Detail
                        </button>
                      ),
                    },
                  ]}
                  rows={truckSummaries}
                  rowKey={(row) => row.plate_number}
                />
              )}
            </div>
          )}

          {/* Truck Detail Modal */}
          <ReportModal
            isOpen={drillDown?.kind === "truck" && !drillLoading}
            onClose={() => setDrillDown(null)}
            title={`${drillDown?.kind === "truck" ? drillDown.truck.plate_number : ""} — Details`}
            subtitle={drillDown?.kind === "truck" ? drillDown.truck.truck_model : ""}
            isMobile={isMobile}
            actions={
              drillDown?.kind === "truck" ? (
                <ExportActions onExportCSV={() => exportTruckDetail("csv")} onExportXLSX={() => exportTruckDetail("xlsx")} />
              ) : null
            }
          >
            {drillDown?.kind === "truck" && (
                <div>
                  {/* Summary Metrics */}
                <div style={{ marginBottom: 20, padding: "12px 0", borderBottom: "1px solid #e2e8f0" }}>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12 }}>
                    <ReportCardField label="Completed Trips" value={drillDown.truck.completed_trips} />
                    <ReportCardField label="Total Litres" value={drillDown.truck.total_litres} />
                <ReportCardField label="Avg L/Trip" value={drillDown.truck.avg_litres_per_trip} />
                    <ReportCardField label="Maintenance Events" value={drillDown.truck.maintenance_count} />
                </div>
              </div>

              {/* Maintenance Breakdown Pills */}
              {drillDown.truck.maintenance_breakdown.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <p style={{ margin: "0 0 12px", fontSize: FONT_SIZE.xs, color: "#475569", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.5px" }}>
Maintenance by Type
</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {drillDown.truck.maintenance_breakdown.map((b) => (
                      <div
key={b.type}
style={{
                            padding: "6px 12px",
background: "#f8fafc",
border: "1px solid #e2e8f0",
borderRadius: 6,
                            fontSize: FONT_SIZE.xs,
                          }}
>
                        <div style={{ fontWeight: 600, color: "#0f172a" }}>{b.count}×</div>
                        <div style={{ color: "#64748b", marginTop: 2 }}>{b.type}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Maintenance Table */}
              {drillDown.maintenance.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <p style={{ margin: "0 0 12px", fontSize: FONT_SIZE.xs, color: "#475569", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      Maintenance Log
                    </p>
                    <DataTable
                      columns={[
                        {
                          key: "reported_at",
                          label: "Date",
                          render: (value) => new Date(value as string).toLocaleDateString(),
                        },
                        { key: "maintenance_type", label: "Type" },
                        { key: "maintenance_location", label: "Location" },
                        {
                          key: "amount",
                          label: "Amount",
                          render: (value) => `₦${(value as number).toLocaleString()}`,
                        },
                        { key: "officer_name", label: "Officer" },
                      ]}
                      rows={drillDown.maintenance}
                      rowKey={(row) => row.report_id}
                    />
                  </div>
                )}

              {/* Fuel Table */}
                {drillDown.fuel.length > 0 && (
                  <div>
                    <p style={{ margin: "0 0 12px", fontSize: FONT_SIZE.xs, color: "#475569", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      Fuel Log
                    </p>
                    <DataTable
                      columns={[
                        {
                          key: "Confirmed_at",
                          label: "Date",
                          render: (value) => new Date(value as string).toLocaleDateString(),
                        },
                        { key: "driver_name", label: "Driver" },
                        {
                          key: "litres",
                          label: "Litres",
                          render: (value) => `${value}L`,
                        },
                        {
                          key: "total_amount",
                          label: "Amount",
                          render: (value) => `₦${(value as number).toLocaleString()}`,
                        },
                      ]}
                      rows={drillDown.fuel}
                      rowKey={(row) => row.request_id}
                    />
            </div>
          )}
        </div>
      )}
</ReportModal>
        </div>
      )}
    </div>
  )
}