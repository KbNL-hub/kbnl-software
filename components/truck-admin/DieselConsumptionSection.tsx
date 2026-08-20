"use client"

import { Icon } from "@iconify/react"
import { FONT_SIZE } from "@/lib/constants"
import { formatDateTime, formatDate } from "@/lib/date-utils"
import { useFuelExpenses } from "@/lib/hooks/useFuelExpenses"
import { useState } from "react"
import { usePagination } from "@/lib/hooks/usePagination"
import { useBreakpoint } from "@/app/hooks/useBreakpoint"
import { supabase } from "@/lib/supabase"
import PaginationControls from "@/components/PaginationControls"

type ViewMode = "card" | "table"

type TripDetail = {
  trip_id: string
  plate_number: string
  kbnl_truck_no: string | null
  driver_name: string
  driver_phone: string
  product: string
  material_centre: string
  loaded_quantity: number
  trip_status: string
  created_at: string
  completed_at: string | null
  order_no: string | null
  child_order_no: string | null
  atc: string | null
  stop_count: number
}

export default function DieselConsumptionSection() {
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"
  const { data: fuelExpenses, loading } = useFuelExpenses()
  const [viewMode, setViewMode] = useState<ViewMode>("card")
  const { page, setPage, totalPages, paginatedItems, totalItems } = usePagination(fuelExpenses)

  const totalLitres = fuelExpenses.reduce((sum, e) => sum + e.litres, 0)

  const [selectedTrip, setSelectedTrip] = useState<TripDetail | null>(null)
  const [tripLoading, setTripLoading] = useState(false)

  async function handleTripClick(tripId: string | null) {
    if (!tripId) return
    setTripLoading(true)
    setSelectedTrip(null)

    try {
      const { data: trip } = await supabase
        .from("Trips")
        .select("trip_id, plate_number, driver_id, product, material_centre, loaded_quantity, trip_status, created_at, updated_at, order_no, child_order_no, ATC")
        .eq("trip_id", tripId)
        .single()

      if (!trip) { setTripLoading(false); return }

      const [{ data: driver }, { count: stopCount }] = await Promise.all([
        trip.driver_id
          ? supabase.from("Drivers").select("full_name, phone_number").eq("driver_id", trip.driver_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase.from("Stops").select("stop_id", { count: "exact", head: true }).eq("trip_id", tripId),
      ])

      const { data: truck } = await supabase
        .from("Trucks")
        .select("kbnl_truck_no")
        .eq("plate_number", trip.plate_number)
        .single()

      setSelectedTrip({
        trip_id: trip.trip_id,
        plate_number: trip.plate_number,
        kbnl_truck_no: truck?.kbnl_truck_no ?? null,
        driver_name: driver?.full_name ?? "Unknown",
        driver_phone: driver?.phone_number ?? "—",
        product: trip.product,
        material_centre: trip.material_centre,
        loaded_quantity: trip.loaded_quantity,
        trip_status: trip.trip_status,
        created_at: trip.created_at,
        completed_at: trip.trip_status === "Completed" ? trip.updated_at ?? null : null,
        order_no: trip.order_no ?? null,
        child_order_no: trip.child_order_no ?? null,
        atc: trip.ATC ?? null,
        stop_count: stopCount ?? 0,
      })
    } finally {
      setTripLoading(false)
    }
  }

  function closeTripModal() {
    setSelectedTrip(null)
  }

  return (
    <div>
      <style>{`
        .diesel-row:hover { background: #f8fafc !important; }
        .trip-link { color: #0070f3; cursor: pointer; text-decoration: underline; text-decoration-style: dotted; text-underline-offset: 2px; }
        .trip-link:hover { text-decoration-style: solid; }
      `}</style>

      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>Diesel Consumption</h2>
        <p style={{ margin: "4px 0 16px", fontSize: FONT_SIZE.sm, color: "#64748b" }}>
          Fuel consumption logged by truck officers
        </p>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 160, background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#94a3b8", fontWeight: 500 }}>Total Litres</p>
            <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE["2xl"], fontWeight: 700, color: "#0070f3" }}>{totalLitres.toLocaleString()}L</p>
          </div>
          <div style={{ flex: 1, minWidth: 160, background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#94a3b8", fontWeight: 500 }}>Entries</p>
            <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE["2xl"], fontWeight: 700, color: "#0f172a" }}>{fuelExpenses.length}</p>
          </div>
          {!loading && fuelExpenses.length > 0 && (
            <div style={{ display: "flex", background: "white", border: "1px solid #e2e8f0", borderRadius: 8, padding: 4, gap: 0, alignSelf: "flex-start", marginTop: isMobile ? 4 : 0 }}>
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
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", border: "3px solid #e2e8f0", borderTopColor: "#0070f3", animation: "spin 1s linear infinite" }} />
        </div>
      ) : fuelExpenses.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 24px" }}>
          <Icon icon="mdi:fuel" width={48} color="#cbd5e1" style={{ marginBottom: 12 }} />
          <p style={{ margin: 0, color: "#64748b", fontSize: FONT_SIZE.base }}>No fuel expenses logged yet</p>
        </div>
      ) : viewMode === "table" ? (
        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FONT_SIZE.sm }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: "2px solid #e2e8f0", color: "#475569", fontWeight: 600, fontSize: FONT_SIZE.xs, textTransform: "uppercase", letterSpacing: 0.5 }}>Truck</th>
                <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: "2px solid #e2e8f0", color: "#475569", fontWeight: 600, fontSize: FONT_SIZE.xs, textTransform: "uppercase", letterSpacing: 0.5 }}>Location</th>
                <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: "2px solid #e2e8f0", color: "#475569", fontWeight: 600, fontSize: FONT_SIZE.xs, textTransform: "uppercase", letterSpacing: 0.5 }}>Litres</th>
                <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: "2px solid #e2e8f0", color: "#475569", fontWeight: 600, fontSize: FONT_SIZE.xs, textTransform: "uppercase", letterSpacing: 0.5 }}>Officer</th>
                <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: "2px solid #e2e8f0", color: "#475569", fontWeight: 600, fontSize: FONT_SIZE.xs, textTransform: "uppercase", letterSpacing: 0.5 }}>Trip</th>
                <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: "2px solid #e2e8f0", color: "#475569", fontWeight: 600, fontSize: FONT_SIZE.xs, textTransform: "uppercase", letterSpacing: 0.5 }}>Trip Date</th>
                <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: "2px solid #e2e8f0", color: "#475569", fontWeight: 600, fontSize: FONT_SIZE.xs, textTransform: "uppercase", letterSpacing: 0.5 }}>Logged At</th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map(expense => (
                <tr key={expense.expense_id} style={{ transition: "background 0.15s" }} className="diesel-row">
                  <td style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0" }}>
                    <span style={{ fontWeight: 600, color: "#0f172a" }}>{expense.plate_number}</span>
                    {expense.kbnl_truck_no && <span style={{ color: "#94a3b8", fontSize: FONT_SIZE.xs }}> · #{expense.kbnl_truck_no}</span>}
                  </td>
                  <td style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0", color: "#64748b", fontSize: FONT_SIZE.xs }}>
                    {expense.location || "—"}
                  </td>
                  <td style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0" }}>
                    <span style={{ padding: "2px 8px", borderRadius: 4, background: "#f0f7ff", color: "#0c4a6e", fontSize: FONT_SIZE.xs, fontWeight: 600 }}>{expense.litres}L</span>
                  </td>
                  <td style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0", color: "#64748b", fontSize: FONT_SIZE.xs }}>
                    {expense.officer_name}
                  </td>
                  <td style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0" }}>
                    {expense.trip_id && expense.material_centre && expense.product ? (
                      <span className="trip-link" style={{ fontSize: FONT_SIZE.xs }} onClick={() => handleTripClick(expense.trip_id)}>
                        {expense.material_centre} · {expense.product}
                      </span>
                    ) : (
                      <span style={{ color: "#94a3b8", fontSize: FONT_SIZE.xs }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>
                    {expense.trip_created_at ? formatDate(expense.trip_created_at) : "—"}
                  </td>
                  <td style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0", color: "#94a3b8", fontSize: FONT_SIZE.xs }}>
                    {formatDateTime(expense.logged_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {paginatedItems.map(expense => (
            <div key={expense.expense_id} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: FONT_SIZE.base, color: "#0f172a" }}>
                    {expense.plate_number}
                    {expense.kbnl_truck_no && <span style={{ color: "#94a3b8", fontWeight: 500 }}> · #{expense.kbnl_truck_no}</span>}
                  </p>
                  {expense.location && <p style={{ margin: "2px 0 0", fontSize: FONT_SIZE.xs, color: "#64748b" }}>📍 {expense.location}</p>}
                  <p style={{ margin: "2px 0 0", fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>By {expense.officer_name}</p>
                </div>
                <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: FONT_SIZE.sm, background: "#f0f7ff", color: "#0070f3", fontWeight: 700, border: "1px solid #bfdbfe", flexShrink: 0 }}>{expense.litres}L</span>
              </div>
              {expense.trip_id && expense.material_centre && expense.product && (
                <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.xs, color: "#64748b" }}>
                  Trip: <span className="trip-link" onClick={() => handleTripClick(expense.trip_id)}>{expense.material_centre} · {expense.product}</span>
                </p>
              )}
              {expense.notes && <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.xs, color: "#64748b" }}>Notes: {expense.notes}</p>}
              <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
                {expense.trip_created_at && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>
                    <Icon icon="mdi:calendar-outline" width={14} /> Trip: {formatDate(expense.trip_created_at)}
                  </span>
                )}
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>
                  <Icon icon="mdi:clock-outline" width={14} /> Logged: {formatDateTime(expense.logged_at)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      {fuelExpenses.length > 0 && (
        <PaginationControls page={page} totalPages={totalPages} totalItems={totalItems} onPageChange={setPage} />
      )}

      {/* Trip Detail Modal */}
      {(selectedTrip || tripLoading) && (
        <div
          onClick={closeTripModal}
          style={{
            position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center",
            zIndex: 100, padding: isMobile ? 0 : 24, animation: "fadeIn 0.2s ease-out"
          }}
        >
          <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "white", borderRadius: isMobile ? "20px 20px 0 0" : 12,
              padding: isMobile ? "28px 20px" : 32, width: "100%", maxWidth: 520,
              maxHeight: "90vh", overflowY: "auto",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
              animation: "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
            }}
          >
            {tripLoading && !selectedTrip && (
              <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", border: "3px solid #e2e8f0", borderTopColor: "#0070f3", animation: "spin 1s linear infinite" }} />
              </div>
            )}

            {selectedTrip && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                  <div>
                    <h3 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>{selectedTrip.plate_number}</h3>
                    {selectedTrip.kbnl_truck_no && <p style={{ margin: "2px 0 0", color: "#94a3b8", fontSize: FONT_SIZE.sm }}>#{selectedTrip.kbnl_truck_no}</p>}
                  </div>
                  <button onClick={closeTripModal} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 0, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", transition: "color 0.2s" }} onMouseEnter={e => e.currentTarget.style.color = "#64748b"} onMouseLeave={e => e.currentTarget.style.color = "#94a3b8"}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "#f8fafc", borderRadius: 8 }}>
                    <span style={{ color: "#94a3b8", fontSize: FONT_SIZE.sm }}>Driver</span>
                    <span style={{ fontWeight: 600, color: "#0f172a", fontSize: FONT_SIZE.sm }}>{selectedTrip.driver_name}</span>
                  </div>
                  {selectedTrip.driver_phone !== "—" && (
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "#f8fafc", borderRadius: 8 }}>
                      <span style={{ color: "#94a3b8", fontSize: FONT_SIZE.sm }}>Phone</span>
                      <span style={{ fontWeight: 600, color: "#0f172a", fontSize: FONT_SIZE.sm }}>{selectedTrip.driver_phone}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "#f8fafc", borderRadius: 8 }}>
                    <span style={{ color: "#94a3b8", fontSize: FONT_SIZE.sm }}>Product</span>
                    <span style={{ fontWeight: 600, color: "#0f172a", fontSize: FONT_SIZE.sm }}>{selectedTrip.product}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "#f8fafc", borderRadius: 8 }}>
                    <span style={{ color: "#94a3b8", fontSize: FONT_SIZE.sm }}>Loading Point</span>
                    <span style={{ fontWeight: 600, color: "#0f172a", fontSize: FONT_SIZE.sm }}>{selectedTrip.material_centre}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "#f8fafc", borderRadius: 8 }}>
                    <span style={{ color: "#94a3b8", fontSize: FONT_SIZE.sm }}>Loaded</span>
                    <span style={{ fontWeight: 600, color: "#0070f3", fontSize: FONT_SIZE.sm }}>{selectedTrip.loaded_quantity} bags</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "#f8fafc", borderRadius: 8 }}>
                    <span style={{ color: "#94a3b8", fontSize: FONT_SIZE.sm }}>Stops</span>
                    <span style={{ fontWeight: 600, color: "#0f172a", fontSize: FONT_SIZE.sm }}>{selectedTrip.stop_count}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "#f8fafc", borderRadius: 8 }}>
                    <span style={{ color: "#94a3b8", fontSize: FONT_SIZE.sm }}>Status</span>
                    <span style={{ fontWeight: 600, color: selectedTrip.trip_status === "Completed" ? "#16a34a" : "#0070f3", fontSize: FONT_SIZE.sm }}>{selectedTrip.trip_status}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "#f8fafc", borderRadius: 8 }}>
                    <span style={{ color: "#94a3b8", fontSize: FONT_SIZE.sm }}>Trip Date</span>
                    <span style={{ fontWeight: 600, color: "#0f172a", fontSize: FONT_SIZE.sm }}>{formatDate(selectedTrip.created_at)}</span>
                  </div>
                  {selectedTrip.completed_at && (
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "#f8fafc", borderRadius: 8 }}>
                      <span style={{ color: "#94a3b8", fontSize: FONT_SIZE.sm }}>Completed</span>
                      <span style={{ fontWeight: 600, color: "#16a34a", fontSize: FONT_SIZE.sm }}>{formatDate(selectedTrip.completed_at)}</span>
                    </div>
                  )}
                  {selectedTrip.order_no && (
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "#f8fafc", borderRadius: 8 }}>
                      <span style={{ color: "#94a3b8", fontSize: FONT_SIZE.sm }}>Order No</span>
                      <span style={{ fontWeight: 600, color: "#0f172a", fontSize: FONT_SIZE.sm }}>{selectedTrip.order_no}{selectedTrip.child_order_no ? ` / ${selectedTrip.child_order_no}` : ""}</span>
                    </div>
                  )}
                  {selectedTrip.atc && !selectedTrip.order_no && (
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "#f8fafc", borderRadius: 8 }}>
                      <span style={{ color: "#94a3b8", fontSize: FONT_SIZE.sm }}>ATC</span>
                      <span style={{ fontWeight: 600, color: "#0f172a", fontSize: FONT_SIZE.sm }}>{selectedTrip.atc}</span>
                    </div>
                  )}
                </div>

                <button onClick={closeTripModal} style={{ width: "100%", padding: "12px 16px", background: "white", color: "#475569", border: "1px solid #cbd5e1", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, minHeight: 44, transition: "all 0.2s" }} onMouseEnter={e => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#0070f3"; e.currentTarget.style.color = "#0070f3" }} onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#cbd5e1"; e.currentTarget.style.color = "#475569" }}>
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
