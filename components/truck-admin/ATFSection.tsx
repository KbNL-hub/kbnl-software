"use client"

import { FONT_SIZE } from "@/lib/constants"
import { formatDateTime } from "@/lib/date-utils"

type ATF = {
  request_id: string
  atf_code: string | null
  plate_number: string
  driver_name: string
  officer_name: string
  company_name: string
  litres: number
  atf_status: string
  requested_at: string
  rate_per_litre: number | null
  total_amount: number | null
  fuel_balance: number | null
  engine_type: string | null
}

type Props = {
  atfs: ATF[]
  atfFilter: string
  setAtfFilter: (v: string) => void
  filteredATFs: ATF[]
  filteredATFsAll: ATF[]
  safeAtfPage: number
  atfTotalPages: number
  setAtfPage: (v: number | ((p: number) => number)) => void
  atfPage: number
  onAuthorise: (atf: ATF) => void
  onInvalidate: (atf: ATF) => void
  onRefresh: () => void
  PAGE_SIZE: number
}

const atfFilters = ["All", "Pending", "Authorised", "Dispensed", "Confirmed", "Invalidated"]

const atfStatusColor = (status: string) => {
  switch (status) {
    case "Pending": return { bg: "#fff8e1", color: "#f5a623", border: "#fde68a" }
    case "Authorised": return { bg: "#f0f7ff", color: "#0070f3", border: "#bfdbfe" }
    case "Dispensed": return { bg: "#f0f7ff", color: "#0070f3", border: "#bfdbfe" }
    case "Confirmed": return { bg: "#f0fff4", color: "#16a34a", border: "#86efac" }
    case "Invalidated": return { bg: "#fef2f2", color: "#ef4444", border: "#fecaca" }
    default: return { bg: "#f8fafc", color: "#64748b", border: "#e2e8f0" }
  }
}

const remainingColor = (balance: number | null) => {
  if (balance == null) return { bg: "#f8fafc", color: "#64748b", border: "#e2e8f0" }
  if (balance <= 0) return { bg: "#fef2f2", color: "#ef4444", border: "#fecaca" }
  if (balance < 100) return { bg: "#fffbeb", color: "#b45309", border: "#fde68a" }
  return { bg: "#f0fdf4", color: "#16a34a", border: "#bbf7d0" }
}

const atfFilterColor = (filter: string, activeFilter: string) => {
  if (filter === "All") return { bg: activeFilter === "All" ? "rgba(0, 112, 243, 0.1)" : "white", color: activeFilter === "All" ? "#0070f3" : "#64748b", border: activeFilter === "All" ? "#0070f3" : "#e2e8f0" }
  if (filter === "Pending") return { bg: activeFilter === "Pending" ? "rgba(245, 166, 35, 0.1)" : "white", color: activeFilter === "Pending" ? "#f5a623" : "#64748b", border: activeFilter === "Pending" ? "#f5a623" : "#e2e8f0" }
  if (filter === "Authorised" || filter === "Dispensed") return { bg: activeFilter === filter ? "rgba(0, 112, 243, 0.1)" : "white", color: activeFilter === filter ? "#0070f3" : "#64748b", border: activeFilter === filter ? "#0070f3" : "#e2e8f0" }
  if (filter === "Confirmed") return { bg: activeFilter === "Confirmed" ? "rgba(22, 163, 74, 0.1)" : "white", color: activeFilter === "Confirmed" ? "#16a34a" : "#64748b", border: activeFilter === "Confirmed" ? "#16a34a" : "#e2e8f0" }
  if (filter === "Invalidated") return { bg: activeFilter === "Invalidated" ? "rgba(239, 68, 68, 0.1)" : "white", color: activeFilter === "Invalidated" ? "#ef4444" : "#64748b", border: activeFilter === "Invalidated" ? "#ef4444" : "#e2e8f0" }
  return { bg: "white", color: "#64748b", border: "#e2e8f0" }
}

export default function ATFSection({
  atfFilter, setAtfFilter, filteredATFs, filteredATFsAll,
  safeAtfPage, atfTotalPages, setAtfPage,
  onAuthorise, onInvalidate, onRefresh, PAGE_SIZE,
}: Props) {
  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        {atfFilters.map(f => {
          const { bg, color, border } = atfFilterColor(f, atfFilter)
          return (
            <button key={f} onClick={() => setAtfFilter(f)} className="filter-btn" style={{ padding: "6px 14px", borderRadius: 20, fontSize: FONT_SIZE.xs, cursor: "pointer", border: `1.5px solid ${border}`, background: bg, color, fontWeight: atfFilter === f ? 600 : 500, transition: "all 0.2s", minHeight: 40 }}>
              {f}
            </button>
          )
        })}
        <div style={{ flex: 1 }} />
        <button onClick={onRefresh} className="refresh-btn" style={{ padding: "6px 12px", fontSize: FONT_SIZE.xs, cursor: "pointer", borderRadius: 8, border: "1px solid #e2e8f0", background: "white", color: "#64748b", transition: "all 0.2s", fontWeight: 600 }}>
          ↻
        </button>
      </div>

      {filteredATFs.length === 0 && <p style={{ color: "#64748b", fontSize: FONT_SIZE.base }}>No ATFs found.</p>}
      {filteredATFsAll.length > PAGE_SIZE && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 16 }}>
          <button disabled={safeAtfPage <= 1} onClick={() => setAtfPage(p => Math.max(1, p - 1))} style={{ padding: "6px 14px", background: safeAtfPage <= 1 ? "#f0f0f0" : "white", border: "1px solid #e2e8f0", borderRadius: 8, cursor: safeAtfPage <= 1 ? "not-allowed" : "pointer", fontSize: FONT_SIZE.xs, color: safeAtfPage <= 1 ? "#ccc" : "#64748b" }}>
            ← Previous
          </button>
          <span style={{ display: "flex", alignItems: "center", fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Page {safeAtfPage} of {atfTotalPages}</span>
          <button disabled={safeAtfPage >= atfTotalPages} onClick={() => setAtfPage(p => p + 1)} style={{ padding: "6px 14px", background: safeAtfPage >= atfTotalPages ? "#f0f0f0" : "white", border: "1px solid #e2e8f0", borderRadius: 8, cursor: safeAtfPage >= atfTotalPages ? "not-allowed" : "pointer", fontSize: FONT_SIZE.xs, color: safeAtfPage >= atfTotalPages ? "#ccc" : "#64748b" }}>
            Next →
          </button>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {filteredATFs.map(atf => {
          const { bg, color, border } = atfStatusColor(atf.atf_status)
          return (
            <div key={atf.request_id} className="card-hover" style={{ background: "white", border: `1px solid ${border}`, borderRadius: 12, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", transition: "all 0.2s" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  {atf.atf_code ? <p style={{ margin: 0, fontWeight: 700, fontSize: FONT_SIZE.base, fontFamily: "monospace", letterSpacing: 1, color: "#0f172a" }}>{atf.atf_code}</p> : <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#94a3b8" }}>Awaiting authorisation</p>}
                  <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.sm, color: "#64748b" }}>{atf.plate_number} · {atf.driver_name}</p>
                  <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Station: {atf.company_name}</p>
                  <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Initiated by {atf.officer_name}</p>
                </div>
                <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: FONT_SIZE.xs, background: bg, color, fontWeight: 700, whiteSpace: "nowrap", border: `1px solid ${color}33` }}>{atf.atf_status}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: atf.total_amount ? "1fr 1fr 1fr 1fr" : "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
                <div style={{ background: "#f0f7ff", borderRadius: 8, padding: "10px 12px", border: "1px solid #bfdbfe" }}>
                  <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#3b82f6" }}>Requested</p>
                  <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#1d4ed8", fontSize: FONT_SIZE.base }}>{atf.litres}L</p>
                </div>
                {atf.fuel_balance != null && (() => {
                  const rc = remainingColor(atf.fuel_balance)
                  return (
                    <div style={{ background: rc.bg, borderRadius: 8, padding: "10px 12px", border: `1px solid ${rc.border}` }}>
                      <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: rc.color }}>Remaining</p>
                      <p style={{ margin: "2px 0 0", fontWeight: 700, color: rc.color, fontSize: FONT_SIZE.base }}>{atf.fuel_balance}{atf.engine_type === "CNG" ? " bars" : "L"}</p>
                    </div>
                  )
                })()}
                {atf.rate_per_litre != null && (
                  <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px", border: "1px solid #e2e8f0" }}>
                    <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Rate/L</p>
                    <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#0f172a", fontSize: FONT_SIZE.base }}>₦{atf.rate_per_litre.toLocaleString()}</p>
                  </div>
                )}
                {atf.total_amount != null && (
                  <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px", border: "1px solid #e2e8f0" }}>
                    <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Total</p>
                    <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#0070f3", fontSize: FONT_SIZE.base }}>₦{atf.total_amount.toLocaleString()}</p>
                  </div>
                )}
              </div>
              {atf.atf_status === "Pending" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <button onClick={() => onAuthorise(atf)} className="btn-hover-opacity" style={{ padding: "10px 14px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: FONT_SIZE.sm, minHeight: 40, transition: "opacity 0.2s" }}>
                    Authorise ATF
                  </button>
                  <button onClick={() => onInvalidate(atf)} className="invalidate-btn" style={{ padding: "10px 14px", background: "white", color: "#ef4444", border: "1.5px solid #ef4444", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: FONT_SIZE.sm, minHeight: 40, transition: "all 0.2s" }}>
                    Invalidate
                  </button>
                </div>
              )}
              {atf.atf_status === "Authorised" && (
                <button onClick={() => onInvalidate(atf)} className="invalidate-btn" style={{ width: "100%", padding: "10px 14px", background: "white", color: "#ef4444", border: "1.5px solid #ef4444", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: FONT_SIZE.sm, minHeight: 40, transition: "all 0.2s" }}>
                  Invalidate
                </button>
              )}
              <p style={{ margin: "8px 0 0", fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>{formatDateTime(atf.requested_at)}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
