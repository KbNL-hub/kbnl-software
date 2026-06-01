"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase"

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
  validated_at: string
}

type DrillDown =
  | { kind: "driver"; driver: DriverSummary; trips: DriverTrip[] }
  | { kind: "truck"; truck: TruckSummary; maintenance: TruckMaintenance[]; fuel: TruckFuel[] }

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

// ── CSV / XLSX export helpers ──────────────────────────────────────────────
function downloadCSV(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const csv = [
    headers.join(","),
    ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? "")).join(","))
  ].join("\n")
  const blob = new Blob([csv], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function downloadXLSX(filename: string, rows: Record<string, unknown>[], sheetName: string) {
  if (!rows.length) return
  import("xlsx").then(XLSX => {
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
    XLSX.writeFile(wb, filename)
  })
}

// ── Component ──────────────────────────────────────────────────────────────
export default function Reports() {
  const [section, setSection] = useState<"drivers" | "trucks">("drivers")
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [dateError, setDateError] = useState("")
  const [loading, setLoading] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [quickFilter, setQuickFilter] = useState<"custom" | "month" | "year">("custom")

  const [driverSummaries, setDriverSummaries] = useState<DriverSummary[]>([])
  const [truckSummaries, setTruckSummaries] = useState<TruckSummary[]>([])
  const [drillDown, setDrillDown] = useState<DrillDown | null>(null)
  const [drillLoading, setDrillLoading] = useState(false)

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
    else await fetchTruckReports()

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
        .eq("status", "Validated")
        .gte("validated_at", from)
        .lte("validated_at", to)

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
      .select("request_id, driver_id, litres, total_amount, validated_at")
      .eq("plate_number", truck.plate_number)
      .eq("status", "Validated")
      .gte("validated_at", from)
      .lte("validated_at", to)
      .order("validated_at", { ascending: false })

    const fuel: TruckFuel[] = await Promise.all((fuelRaw || []).map(async (f) => {
      const { data: driver } = await supabase
        .from("Drivers").select("full_name").eq("driver_id", f.driver_id).single()
      return {
        request_id: f.request_id,
        driver_name: driver?.full_name ?? "Unknown",
        litres: f.litres,
        total_amount: f.total_amount,
        validated_at: f.validated_at,
      }
    }))

    setDrillDown({ kind: "truck", truck, maintenance, fuel })
    setDrillLoading(false)
  }

  // ── Export helpers ────────────────────────────────────────────────────────
  function exportDriverSummary(format: "csv" | "xlsx") {
    const rows = driverSummaries.map(d => ({
      "Driver": d.driver_name,
      "Trips": d.trips_count,
      "Stops": d.stops_count,
      "Total Bags Delivered": d.total_bags,
      "Avg Bags per Trip": d.avg_bags_per_trip,
    }))
    format === "csv"
      ? downloadCSV("driver_summary.csv", rows)
      : downloadXLSX("driver_summary.xlsx", rows, "Driver Summary")
  }

  function exportDriverDetail(format: "csv" | "xlsx") {
    if (drillDown?.kind !== "driver") return
    const rows = drillDown.trips.map(t => ({
      "Trip ID": t.trip_id,
      "Plate": t.plate_number,
      "Product": t.product,
      "Loading Point": t.material_centre,
      "Loaded (bags)": t.loaded_quantity,
      "Stops": t.stops_count,
      "Bags Offloaded": t.total_bags_offloaded,
      "Status": t.trip_status,
      "Date": new Date(t.created_at).toLocaleDateString(),
    }))
    format === "csv"
      ? downloadCSV(`${drillDown.driver.driver_name}_trips.csv`, rows)
      : downloadXLSX(`${drillDown.driver.driver_name}_trips.xlsx`, rows, "Trip Detail")
  }

  function exportTruckSummary(format: "csv" | "xlsx") {
    const rows = truckSummaries.map(t => ({
      "Plate": t.plate_number,
      "KbNL No.": t.kbnl_truck_no ?? "—",
      "Model": t.truck_model,
      "Completed Trips": t.completed_trips,
      "Maintenance Count": t.maintenance_count,
      "Total Maintenance (₦)": t.total_maintenance_amount,
      "Fuel Count": t.fuel_count,
      "Total Litres": t.total_litres,
      "Total Fuel (₦)": t.total_fuel_amount,
      "Avg Litres/Trip": t.avg_litres_per_trip,
    }))
    format === "csv"
      ? downloadCSV("truck_summary.csv", rows)
      : downloadXLSX("truck_summary.xlsx", rows, "Truck Summary")
  }

  function exportTruckDetail(format: "csv" | "xlsx") {
    if (drillDown?.kind !== "truck") return
    const maintRows = drillDown.maintenance.map(m => ({
      "Type": m.maintenance_type,
      "Location": m.maintenance_location ?? "—",
      "Amount (₦)": m.amount,
      "Officer": m.officer_name,
      "Date": new Date(m.reported_at).toLocaleDateString(),
    }))
    const fuelRows = drillDown.fuel.map(f => ({
      "Driver": f.driver_name,
      "Litres": f.litres,
      "Amount (₦)": f.total_amount,
      "Date": new Date(f.validated_at).toLocaleDateString(),
    }))
    if (format === "csv") {
      downloadCSV(`${drillDown.truck.plate_number}_maintenance.csv`, maintRows)
      downloadCSV(`${drillDown.truck.plate_number}_fuel.csv`, fuelRows)
    } else {
      import("xlsx").then(XLSX => {
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(maintRows), "Maintenance")
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fuelRows), "Fuel")
        XLSX.writeFile(wb, `${drillDown.truck.plate_number}_detail.xlsx`)
      })
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>Reports</h2>

      {/* Section tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {(["drivers", "trucks"] as const).map(s => (
          <button
            key={s}
            onClick={() => { setSection(s); setHasLoaded(false); setDrillDown(null) }}
            style={{
              padding: "8px 24px", borderRadius: 20, fontSize: 14, cursor: "pointer",
              border: "1px solid #ddd",
              background: section === s ? "#1a1a2e" : "white",
              color: section === s ? "white" : "#333",
              fontWeight: section === s ? "bold" : "normal"
            }}
          >
            {s === "drivers" ? "Driver Performance" : "Truck Health"}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ background: "white", border: "1px solid #eee", borderRadius: 12, padding: 24, marginBottom: 24, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
        {/* Quick filters */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {(["month", "year", "custom"] as const).map(f => (
            <button
              key={f}
              onClick={() => { setQuickFilter(f); if (f !== "custom") applyQuickFilter(f as "month" | "year") }}
              style={{
                padding: "6px 16px", borderRadius: 20, fontSize: 13, cursor: "pointer",
                border: "1px solid #ddd",
                background: quickFilter === f ? "#0070f3" : "white",
                color: quickFilter === f ? "white" : "#333",
                fontWeight: quickFilter === f ? "bold" : "normal"
              }}
            >
              {f === "month" ? "This Month" : f === "year" ? "This Year" : "Custom Range"}
            </button>
          ))}
        </div>

        {/* Custom date inputs */}
        {quickFilter === "custom" && (
          <div style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 13, color: "#888", marginBottom: 6 }}>From</label>
              <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setDateError("") }} style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #ddd", fontSize: 14 }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 13, color: "#888", marginBottom: 6 }}>To</label>
              <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setDateError("") }} style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #ddd", fontSize: 14 }} />
            </div>
          </div>
        )}

        {dateError && <p style={{ color: "red", fontSize: 13, marginBottom: 12 }}>{dateError}</p>}

        <button
          onClick={handleGenerate}
          disabled={loading}
          style={{ padding: "8px 24px", background: "#0070f3", color: "white", border: "none", borderRadius: 6, cursor: loading ? "not-allowed" : "pointer", fontWeight: "bold", fontSize: 14 }}
        >
          {loading ? "Generating..." : "Generate Report"}
        </button>
      </div>

      {loading && <p style={{ color: "#888" }}>Calculating...</p>}

      {/* ── Driver Performance ── */}
      {!loading && hasLoaded && section === "drivers" && (
        <div>
          {/* Summary table */}
          <div style={{ background: "white", border: "1px solid #eee", borderRadius: 12, padding: 24, marginBottom: 24, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <p style={{ margin: 0, fontWeight: "bold", fontSize: 15 }}>Driver Summary</p>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => exportDriverSummary("csv")} style={exportBtn}>Export CSV</button>
                <button onClick={() => exportDriverSummary("xlsx")} style={exportBtn}>Export Excel</button>
              </div>
            </div>

            {driverSummaries.length === 0
              ? <p style={{ color: "#888" }}>No trips found in this period.</p>
              : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                    <thead>
                      <tr style={{ background: "#f0f0f0", textAlign: "left" }}>
                        <th style={th}>Driver</th>
                        <th style={th}>Trips</th>
                        <th style={th}>Stops</th>
                        <th style={th}>Bags Delivered</th>
                        <th style={th}>Avg Bags/Trip</th>
                        <th style={th}>Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {driverSummaries.map(d => (
                        <tr key={d.driver_id} style={{ borderBottom: "1px solid #eee" }}>
                          <td style={td}><strong>{d.driver_name}</strong></td>
                          <td style={td}>{d.trips_count}</td>
                          <td style={td}>{d.stops_count}</td>
                          <td style={td}>{d.total_bags.toLocaleString()}</td>
                          <td style={td}>{d.avg_bags_per_trip.toLocaleString()}</td>
                          <td style={td}>
                            <button
                              onClick={() => fetchDriverDrillDown(d)}
                              style={{ padding: "4px 12px", fontSize: 12, cursor: "pointer", borderRadius: 4, border: "1px solid #0070f3", color: "#0070f3", background: "white" }}
                            >
                              View Trips
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }
          </div>

          {/* Driver drill-down */}
          {drillLoading && <p style={{ color: "#888" }}>Loading trips...</p>}
          {drillDown?.kind === "driver" && !drillLoading && (
            <div style={{ background: "white", border: "1px solid #eee", borderRadius: 12, padding: 24, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <p style={{ margin: 0, fontWeight: "bold", fontSize: 15 }}>{drillDown.driver.driver_name} — Trip Detail</p>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: "#888" }}>{drillDown.trips.length} trips in period</p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => exportDriverDetail("csv")} style={exportBtn}>Export CSV</button>
                  <button onClick={() => exportDriverDetail("xlsx")} style={exportBtn}>Export Excel</button>
                </div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ background: "#f0f0f0", textAlign: "left" }}>
                      <th style={th}>Date</th>
                      <th style={th}>Plate</th>
                      <th style={th}>Product</th>
                      <th style={th}>Loading Point</th>
                      <th style={th}>Loaded</th>
                      <th style={th}>Stops</th>
                      <th style={th}>Delivered</th>
                      <th style={th}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drillDown.trips.map(t => (
                      <tr key={t.trip_id} style={{ borderBottom: "1px solid #eee" }}>
                        <td style={td}>{new Date(t.created_at).toLocaleDateString()}</td>
                        <td style={td}><strong>{t.plate_number}</strong></td>
                        <td style={td}>{t.product}</td>
                        <td style={td}>{t.material_centre}</td>
                        <td style={td}>{t.loaded_quantity}</td>
                        <td style={td}>{t.stops_count}</td>
                        <td style={td}>{t.total_bags_offloaded}</td>
                        <td style={td}>
                          <span style={{
                            padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: "bold",
                            background: t.trip_status === "Completed" ? "#00aa0022" : t.trip_status === "In transit" ? "#0070f322" : "#f5a62322",
                            color: t.trip_status === "Completed" ? "#00aa00" : t.trip_status === "In transit" ? "#0070f3" : "#f5a623"
                          }}>
                            {t.trip_status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Truck Health ── */}
      {!loading && hasLoaded && section === "trucks" && (
        <div>
          <div style={{ background: "white", border: "1px solid #eee", borderRadius: 12, padding: 24, marginBottom: 24, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <p style={{ margin: 0, fontWeight: "bold", fontSize: 15 }}>Truck Summary</p>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => exportTruckSummary("csv")} style={exportBtn}>Export CSV</button>
                <button onClick={() => exportTruckSummary("xlsx")} style={exportBtn}>Export Excel</button>
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ background: "#f0f0f0", textAlign: "left" }}>
                    <th style={th}>Truck</th>
                    <th style={th}>Completed Trips</th>
                    <th style={th}>Maintenance Events</th>
                    <th style={th}>Total Maintenance</th>
                    <th style={th}>Fuel Events</th>
                    <th style={th}>Total Litres</th>
                    <th style={th}>Total Fuel Cost</th>
                    <th style={th}>Avg L/Trip</th>
                    <th style={th}>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {truckSummaries.map(t => (
                    <tr key={t.plate_number} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={td}>
                        <strong>{t.plate_number}</strong>
                        {t.kbnl_truck_no && <span style={{ marginLeft: 6, fontSize: 12, color: "#888" }}>· #{t.kbnl_truck_no}</span>}
                        <br />
                        <span style={{ fontSize: 12, color: "#888" }}>{t.truck_model}</span>
                      </td>
                      <td style={td}>{t.completed_trips}</td>
                      <td style={td}>
                        <span style={{ color: t.maintenance_count > 5 ? "#ff4444" : t.maintenance_count > 2 ? "#f5a623" : "#333", fontWeight: t.maintenance_count > 2 ? "bold" : "normal" }}>
                          {t.maintenance_count}
                        </span>
                      </td>
                      <td style={td}>₦{t.total_maintenance_amount.toLocaleString()}</td>
                      <td style={td}>{t.fuel_count}</td>
                      <td style={td}>{t.total_litres.toLocaleString()}L</td>
                      <td style={td}>₦{t.total_fuel_amount.toLocaleString()}</td>
                      <td style={td}>{t.avg_litres_per_trip}L</td>
                      <td style={td}>
                        <button
                          onClick={() => fetchTruckDrillDown(t)}
                          style={{ padding: "4px 12px", fontSize: 12, cursor: "pointer", borderRadius: 4, border: "1px solid #0070f3", color: "#0070f3", background: "white" }}
                        >
                          View Detail
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Truck drill-down */}
          {drillLoading && <p style={{ color: "#888" }}>Loading detail...</p>}
          {drillDown?.kind === "truck" && !drillLoading && (
            <div style={{ background: "white", border: "1px solid #eee", borderRadius: 12, padding: 24, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div>
                  <p style={{ margin: 0, fontWeight: "bold", fontSize: 15 }}>
                    {drillDown.truck.plate_number}{drillDown.truck.kbnl_truck_no ? ` · #${drillDown.truck.kbnl_truck_no}` : ""} — Detail
                  </p>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: "#888" }}>{drillDown.truck.truck_model}</p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => exportTruckDetail("csv")} style={exportBtn}>Export CSV</button>
                  <button onClick={() => exportTruckDetail("xlsx")} style={exportBtn}>Export Excel</button>
                </div>
              </div>

              {/* Maintenance breakdown */}
              {drillDown.truck.maintenance_breakdown.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <p style={{ fontWeight: "bold", fontSize: 13, marginBottom: 8 }}>Maintenance by Type</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                    {drillDown.truck.maintenance_breakdown.map(b => (
                      <div key={b.type} style={{ background: "#f9f9f9", border: "1px solid #eee", borderRadius: 8, padding: "8px 14px" }}>
                        <p style={{ margin: 0, fontSize: 12, color: "#888" }}>{b.type}</p>
                        <p style={{ margin: "2px 0 0", fontWeight: "bold", fontSize: 13 }}>{b.count}× · ₦{b.amount.toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Maintenance log */}
              <p style={{ fontWeight: "bold", fontSize: 13, marginBottom: 8 }}>Maintenance Log</p>
              {drillDown.maintenance.length === 0
                ? <p style={{ color: "#888", fontSize: 13, marginBottom: 16 }}>No validated maintenance in this period.</p>
                : (
                  <div style={{ overflowX: "auto", marginBottom: 24 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: "#f0f0f0", textAlign: "left" }}>
                          <th style={th}>Date</th>
                          <th style={th}>Type</th>
                          <th style={th}>Location</th>
                          <th style={th}>Amount</th>
                          <th style={th}>Officer</th>
                        </tr>
                      </thead>
                      <tbody>
                        {drillDown.maintenance.map(m => (
                          <tr key={m.report_id} style={{ borderBottom: "1px solid #eee" }}>
                            <td style={td}>{new Date(m.reported_at).toLocaleDateString()}</td>
                            <td style={td}>{m.maintenance_type}</td>
                            <td style={td}>{m.maintenance_location ?? "—"}</td>
                            <td style={td}>₦{m.amount.toLocaleString()}</td>
                            <td style={td}>{m.officer_name}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              }

              {/* Fuel log */}
              <p style={{ fontWeight: "bold", fontSize: 13, marginBottom: 8 }}>Fuel Log</p>
              {drillDown.fuel.length === 0
                ? <p style={{ color: "#888", fontSize: 13 }}>No validated fuel requests in this period.</p>
                : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: "#f0f0f0", textAlign: "left" }}>
                          <th style={th}>Date</th>
                          <th style={th}>Driver</th>
                          <th style={th}>Litres</th>
                          <th style={th}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {drillDown.fuel.map(f => (
                          <tr key={f.request_id} style={{ borderBottom: "1px solid #eee" }}>
                            <td style={td}>{new Date(f.validated_at).toLocaleDateString()}</td>
                            <td style={td}>{f.driver_name}</td>
                            <td style={td}>{f.litres}L</td>
                            <td style={td}>₦{f.total_amount.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              }
            </div>
          )}
        </div>
      )}

      {!loading && !hasLoaded && (
        <div style={{ textAlign: "center", paddingTop: 60, color: "#888" }}>
          <p style={{ fontSize: 32, marginBottom: 12 }}>📊</p>
          <p>Select a section and date range, then click Generate Report.</p>
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = { padding: "12px 16px", fontWeight: "bold", fontSize: 13 }
const td: React.CSSProperties = { padding: "12px 16px" }
const exportBtn: React.CSSProperties = { padding: "6px 14px", fontSize: 12, cursor: "pointer", borderRadius: 4, border: "1px solid #ddd", background: "white", color: "#333" }