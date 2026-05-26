"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"

type TruckReport = {
  plate_number: string
  truck_model: string
  revenue: number
  maintenance_expenses: number
  procurement_expenses: number
  diesel_expenses: number
  total_expenses: number
  net: number
}

type FleetSummary = {
  total_revenue: number
  total_expenses: number
  net: number
}

export default function Reports() {
  const [truckReports, setTruckReports] = useState<TruckReport[]>([])
  const [fleetSummary, setFleetSummary] = useState<FleetSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [dateError, setDateError] = useState("")
  const [hasLoaded, setHasLoaded] = useState(false)

  async function fetchReports() {
    if (!fromDate || !toDate) return setDateError("Select both a from and to date")
    if (new Date(fromDate) > new Date(toDate)) return setDateError("From date cannot be after to date")
    setDateError("")
    setLoading(true)

    const from = new Date(fromDate).toISOString()
    const to = new Date(toDate)
    to.setHours(23, 59, 59, 999)
    const toISO = to.toISOString()

    // Fetch all trucks
    const { data: trucks } = await supabase
      .from("Trucks")
      .select("plate_number, truck_model")
      .order("plate_number", { ascending: true })

    if (!trucks) { setLoading(false); return }

    const reports: TruckReport[] = await Promise.all(
      trucks.map(async (truck) => {
        // --- REVENUE ---
        // Get all stops for trips with this truck
        const { data: stops } = await supabase
          .from("Stops")
          .select("stop_id, quantity_offloaded, trip_id")
          .eq("confirmed", true)

        // Filter stops belonging to trips with this plate
        const { data: tripIds } = await supabase
          .from("Trips")
          .select("trip_id")
          .eq("plate_number", truck.plate_number)

        const truckTripIds = new Set((tripIds || []).map(t => t.trip_id))
        const truckStops = (stops || []).filter(s => truckTripIds.has(s.trip_id))
        const truckStopIds = truckStops.map(s => s.stop_id)

        let revenue = 0
        if (truckStopIds.length > 0) {
          const { data: confirmations } = await supabase
            .from("Stop_Confirmations")
            .select("stop_id, price_per_bag, customer_id")
            .in("stop_id", truckStopIds)
            .gte("confirmed_at", from)
            .lte("confirmed_at", toISO)

          // Match confirmations to stops for quantity
          revenue = (confirmations || []).reduce((sum, conf) => {
            const stop = truckStops.find(s => s.stop_id === conf.stop_id)
            return sum + (conf.price_per_bag * (stop?.quantity_offloaded ?? 0))
          }, 0)
        }

        // --- MAINTENANCE EXPENSES ---
        const { data: maintenance } = await supabase
          .from("maintenance_reports")
          .select("amount")
          .eq("plate_number", truck.plate_number)
          .eq("status", "Validated")
          .gte("validated_at", from)
          .lte("validated_at", toISO)

        const maintenance_expenses = (maintenance || []).reduce((sum, m) => sum + m.amount, 0)

        // --- PROCUREMENT EXPENSES ---
        const { data: procDists } = await supabase
          .from("procurement_distributions")
          .select("amount_allocated, procurement_id")
          .eq("plate_number", truck.plate_number)

        let procurement_expenses = 0
        if (procDists && procDists.length > 0) {
          const procIds = procDists.map(d => d.procurement_id)
          const { data: procs } = await supabase
            .from("bulk_procurement")
            .select("procurement_id, logged_at")
            .in("procurement_id", procIds)
            .gte("logged_at", from)
            .lte("logged_at", toISO)

          const validProcIds = new Set((procs || []).map(p => p.procurement_id))
          procurement_expenses = procDists
            .filter(d => validProcIds.has(d.procurement_id))
            .reduce((sum, d) => sum + d.amount_allocated, 0)
        }

        // --- DIESEL EXPENSES ---
        const { data: diesel } = await supabase
          .from("fuel_requests")
          .select("total_amount")
          .eq("plate_number", truck.plate_number)
          .eq("status", "Validated")
          .gte("validated_at", from)
          .lte("validated_at", toISO)

        const diesel_expenses = (diesel || []).reduce((sum, d) => sum + d.total_amount, 0)

        const total_expenses = maintenance_expenses + procurement_expenses + diesel_expenses
        const net = revenue - total_expenses

        return {
          plate_number: truck.plate_number,
          truck_model: truck.truck_model,
          revenue,
          maintenance_expenses,
          procurement_expenses,
          diesel_expenses,
          total_expenses,
          net,
        }
      })
    )

    const summary: FleetSummary = {
      total_revenue: reports.reduce((sum, r) => sum + r.revenue, 0),
      total_expenses: reports.reduce((sum, r) => sum + r.total_expenses, 0),
      net: reports.reduce((sum, r) => sum + r.net, 0),
    }

    setTruckReports(reports)
    setFleetSummary(summary)
    setLoading(false)
    setHasLoaded(true)
  }

  const netColor = (net: number) => net >= 0 ? "#00aa00" : "#ff4444"

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>Reports</h2>

      {/* Date Range Filter */}
      <div style={{
        background: "white", border: "1px solid #eee", borderRadius: 12,
        padding: 24, marginBottom: 24, boxShadow: "0 2px 8px rgba(0,0,0,0.04)"
      }}>
        <p style={{ margin: "0 0 16px", fontWeight: "bold", fontSize: 15 }}>Date Range</p>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={{ display: "block", fontSize: 13, color: "#888", marginBottom: 6 }}>From</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => { setFromDate(e.target.value); setDateError("") }}
              style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #ddd", fontSize: 14 }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 13, color: "#888", marginBottom: 6 }}>To</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => { setToDate(e.target.value); setDateError("") }}
              style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #ddd", fontSize: 14 }}
            />
          </div>
          <button
            onClick={fetchReports}
            disabled={loading}
            style={{
              padding: "8px 24px", background: "#0070f3", color: "white",
              border: "none", borderRadius: 6, cursor: loading ? "not-allowed" : "pointer",
              fontWeight: "bold", fontSize: 14
            }}
          >
            {loading ? "Loading..." : "Generate Report"}
          </button>
        </div>
        {dateError && <p style={{ color: "red", fontSize: 13, marginTop: 10, margin: 0 }}>{dateError}</p>}
      </div>

      {loading && <p style={{ color: "#888" }}>Calculating...</p>}

      {!loading && hasLoaded && fleetSummary && (
        <>
          {/* Fleet Summary */}
          <div style={{
            background: "#1a1a2e", borderRadius: 12, padding: 24,
            marginBottom: 24, color: "white"
          }}>
            <p style={{ margin: "0 0 16px", fontWeight: "bold", fontSize: 16, color: "#aaa" }}>Fleet Summary</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              <div>
                <p style={{ margin: 0, fontSize: 12, color: "#aaa" }}>Total Revenue</p>
                <p style={{ margin: "4px 0 0", fontWeight: "bold", fontSize: 22, color: "#00aa00" }}>
                  ₦{fleetSummary.total_revenue.toLocaleString()}
                </p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 12, color: "#aaa" }}>Total Expenses</p>
                <p style={{ margin: "4px 0 0", fontWeight: "bold", fontSize: 22, color: "#ff4444" }}>
                  ₦{fleetSummary.total_expenses.toLocaleString()}
                </p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 12, color: "#aaa" }}>Net Profit / Loss</p>
                <p style={{ margin: "4px 0 0", fontWeight: "bold", fontSize: 22, color: fleetSummary.net >= 0 ? "#00ff88" : "#ff6666" }}>
                  {fleetSummary.net >= 0 ? "+" : ""}₦{fleetSummary.net.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Per-Truck Reports */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {truckReports.map((truck) => (
              <div
                key={truck.plate_number}
                style={{
                  background: "white", border: `1px solid ${truck.net >= 0 ? "#00aa0022" : "#ff444422"}`,
                  borderRadius: 12, padding: 24, boxShadow: "0 2px 8px rgba(0,0,0,0.04)"
                }}
              >
                {/* Truck header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: "bold", fontSize: 16 }}>{truck.plate_number}</p>
                    <p style={{ margin: "2px 0 0", fontSize: 13, color: "#888" }}>{truck.truck_model}</p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ margin: 0, fontSize: 12, color: "#888" }}>Net</p>
                    <p style={{ margin: "2px 0 0", fontWeight: "bold", fontSize: 18, color: netColor(truck.net) }}>
                      {truck.net >= 0 ? "+" : ""}₦{truck.net.toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Revenue vs Expenses grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                  <div style={{ background: "#f0fff4", borderRadius: 8, padding: "12px 16px", border: "1px solid #00aa0022" }}>
                    <p style={{ margin: 0, fontSize: 11, color: "#888" }}>Revenue</p>
                    <p style={{ margin: "4px 0 0", fontWeight: "bold", fontSize: 15, color: "#00aa00" }}>
                      ₦{truck.revenue.toLocaleString()}
                    </p>
                  </div>
                  <div style={{ background: "#fff5f5", borderRadius: 8, padding: "12px 16px", border: "1px solid #ff444422" }}>
                    <p style={{ margin: 0, fontSize: 11, color: "#888" }}>Total Expenses</p>
                    <p style={{ margin: "4px 0 0", fontWeight: "bold", fontSize: 15, color: "#ff4444" }}>
                      ₦{truck.total_expenses.toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Expense breakdown */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  <div style={{ background: "#f9f9f9", borderRadius: 6, padding: "8px 12px" }}>
                    <p style={{ margin: 0, fontSize: 11, color: "#888" }}>Maintenance</p>
                    <p style={{ margin: "2px 0 0", fontWeight: "bold", fontSize: 13 }}>
                      ₦{truck.maintenance_expenses.toLocaleString()}
                    </p>
                  </div>
                  <div style={{ background: "#f9f9f9", borderRadius: 6, padding: "8px 12px" }}>
                    <p style={{ margin: 0, fontSize: 11, color: "#888" }}>Procurement</p>
                    <p style={{ margin: "2px 0 0", fontWeight: "bold", fontSize: 13 }}>
                      ₦{truck.procurement_expenses.toLocaleString()}
                    </p>
                  </div>
                  <div style={{ background: "#f9f9f9", borderRadius: 6, padding: "8px 12px" }}>
                    <p style={{ margin: 0, fontSize: 11, color: "#888" }}>Diesel</p>
                    <p style={{ margin: "2px 0 0", fontWeight: "bold", fontSize: 13 }}>
                      ₦{truck.diesel_expenses.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {!loading && !hasLoaded && (
        <div style={{ textAlign: "center", paddingTop: 60, color: "#888" }}>
          <p style={{ fontSize: 32, marginBottom: 12 }}>📊</p>
          <p>Select a date range and click Generate Report to see profitability data.</p>
        </div>
      )}
    </div>
  )
}