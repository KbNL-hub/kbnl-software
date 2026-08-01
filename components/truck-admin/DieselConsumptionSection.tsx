"use client"

import { Icon } from "@iconify/react"
import { FONT_SIZE } from "@/lib/constants"
import { formatDateTime } from "@/lib/date-utils"
import { useFuelExpenses } from "@/lib/hooks/useFuelExpenses"
import { useState } from "react"

type ViewMode = "card" | "table"

const atfStatusColor = (status: string) => {
  switch (status) {
    default: return { bg: "#f8fafc", color: "#64748b", border: "#e2e8f0" }
  }
}

export default function DieselConsumptionSection() {
  const { data: fuelExpenses, loading } = useFuelExpenses()
  const [viewMode, setViewMode] = useState<ViewMode>("card")

  const totalLitres = fuelExpenses.reduce((sum, e) => sum + e.litres, 0)

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", paddingRight: 36,
    boxSizing: "border-box", borderRadius: 8,
    border: "1px solid #e2e8f0", fontSize: FONT_SIZE.base,
    background: "white", color: "#0f172a", minHeight: 48,
  }

  return (
    <div>
      <style>{`
        .diesel-row:hover { background: #f8fafc !important; }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>Diesel Consumption</h2>
          <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.sm, color: "#64748b" }}>
            Fuel consumption logged by truck officers
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ textAlign: "right" }}>
              <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Total Litres</p>
              <p style={{ margin: 0, fontSize: FONT_SIZE.lg, fontWeight: 700, color: "#0070f3" }}>{totalLitres.toLocaleString()}L</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Entries</p>
              <p style={{ margin: 0, fontSize: FONT_SIZE.lg, fontWeight: 700, color: "#0f172a" }}>{fuelExpenses.length}</p>
            </div>
          </div>
          {!loading && fuelExpenses.length > 0 && (
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
                <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: "2px solid #e2e8f0", color: "#475569", fontWeight: 600, fontSize: FONT_SIZE.xs, textTransform: "uppercase", letterSpacing: 0.5 }}>Date</th>
              </tr>
            </thead>
            <tbody>
              {fuelExpenses.map(expense => (
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
                  <td style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0", color: "#64748b", fontSize: FONT_SIZE.xs }}>
                    {expense.material_centre && expense.product ? `${expense.material_centre} · ${expense.product}` : "—"}
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
          {fuelExpenses.map(expense => (
            <div key={expense.expense_id} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: FONT_SIZE.base, color: "#0f172a" }}>
                    {expense.plate_number}
                    {expense.kbnl_truck_no && <span style={{ color: "#94a3b8", fontWeight: 500 }}> · #{expense.kbnl_truck_no}</span>}
                  </p>
                  {expense.location && <p style={{ margin: "2px 0 0", fontSize: FONT_SIZE.xs, color: "#64748b" }}>📍 {expense.location}</p>}
                  <p style={{ margin: "2px 0 0", fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>By {expense.officer_name}</p>
                </div>
                <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: FONT_SIZE.sm, background: "#f0f7ff", color: "#0070f3", fontWeight: 700, border: "1px solid #bfdbfe" }}>{expense.litres}L</span>
              </div>
              {expense.material_centre && expense.product && (
                <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.xs, color: "#64748b" }}>
                  Trip: {expense.material_centre} · {expense.product}
                </p>
              )}
              {expense.notes && <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.xs, color: "#64748b" }}>Notes: {expense.notes}</p>}
              <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>{formatDateTime(expense.logged_at)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
