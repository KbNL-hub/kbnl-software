"use client"

import { FONT_SIZE } from "@/lib/constants"
import { formatDateTime, formatTime } from "@/lib/date-utils"

type MaintenanceReport = {
  report_id: string
  plate_number: string
  manager_name: string
  maintenance_type: string
  maintenance_location: string | null
  amount: number
  notes: string | null
  status: "Pending" | "Validated" | "Rejected"
  rejection_reason: string | null
  reported_at: string
}

type BulkProcurement = {
  procurement_id: string
  item_name: string
  total_amount: number
  notes: string | null
  logged_at: string
  distributions: { plate_number: string; amount_allocated: number }[]
}

type FeedItem =
  | { kind: "report"; data: MaintenanceReport; date: string }
  | { kind: "procurement"; data: BulkProcurement; date: string }

type Props = {
  reports: MaintenanceReport[]
  procurements: BulkProcurement[]
  balanceMap: Record<string, number>
  filter: string
  setFilter: (v: string) => void
  feedPage: number
  setFeedPage: (v: number | ((p: number) => number)) => void
  filteredFeed: FeedItem[]
  filteredFeedAll: FeedItem[]
  feedTotalPages: number
  safeFeedPage: number
  lastUpdated: Date | null
  onRefresh: () => void
  onValidate: (report: MaintenanceReport) => void
  onReject: (report: MaintenanceReport) => void
  PAGE_SIZE: number
}

const maintenanceFilters = ["All", "Pending", "Validated", "Rejected", "Bulk Procurement"]

const filterColor = (filter: string, activeFilter: string) => {
  if (filter === "All") return { bg: activeFilter === "All" ? "rgba(0, 112, 243, 0.1)" : "white", color: activeFilter === "All" ? "#0070f3" : "#64748b", border: activeFilter === "All" ? "#0070f3" : "#e2e8f0" }
  if (filter === "Pending") return { bg: activeFilter === "Pending" ? "rgba(245, 166, 35, 0.1)" : "white", color: activeFilter === "Pending" ? "#f5a623" : "#64748b", border: activeFilter === "Pending" ? "#f5a623" : "#e2e8f0" }
  if (filter === "Validated") return { bg: activeFilter === "Validated" ? "rgba(22, 163, 74, 0.1)" : "white", color: activeFilter === "Validated" ? "#16a34a" : "#64748b", border: activeFilter === "Validated" ? "#16a34a" : "#e2e8f0" }
  if (filter === "Rejected") return { bg: activeFilter === "Rejected" ? "rgba(239, 68, 68, 0.1)" : "white", color: activeFilter === "Rejected" ? "#ef4444" : "#64748b", border: activeFilter === "Rejected" ? "#ef4444" : "#e2e8f0" }
  if (filter === "Bulk Procurement") return { bg: activeFilter === "Bulk Procurement" ? "rgba(124, 58, 237, 0.1)" : "white", color: activeFilter === "Bulk Procurement" ? "#7c3aed" : "#64748b", border: activeFilter === "Bulk Procurement" ? "#7c3aed" : "#e2e8f0" }
  return { bg: "white", color: "#64748b", border: "#e2e8f0" }
}

const statusColor = (status: string) => {
  switch (status) {
    case "Pending": return { bg: "#fff8e1", color: "#f5a623", border: "#fde68a" }
    case "Validated": return { bg: "#f0fff4", color: "#16a34a", border: "#86efac" }
    case "Rejected": return { bg: "#fef2f2", color: "#ef4444", border: "#fecaca" }
    default: return { bg: "#f8fafc", color: "#64748b", border: "#e2e8f0" }
  }
}

export default function MaintenanceSection({
  balanceMap, filter, setFilter,
  setFeedPage, filteredFeed, filteredFeedAll,
  feedTotalPages, safeFeedPage, lastUpdated, onRefresh,
  onValidate, onReject, PAGE_SIZE,
}: Props) {
  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        {maintenanceFilters.map(f => {
          const { bg, color, border } = filterColor(f, filter)
          return (
            <button key={f} onClick={() => setFilter(f)} className="filter-btn" style={{ padding: "6px 14px", borderRadius: 20, fontSize: FONT_SIZE.xs, cursor: "pointer", border: `1.5px solid ${border}`, background: bg, color, fontWeight: filter === f ? 600 : 500, transition: "all 0.2s", minHeight: 40 }}>
              {f}
            </button>
          )
        })}
        <div style={{ flex: 1 }} />
        {lastUpdated && <span style={{ fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Updated {formatTime(lastUpdated)}</span>}
        <button onClick={onRefresh} className="refresh-btn" style={{ padding: "6px 12px", fontSize: FONT_SIZE.xs, cursor: "pointer", borderRadius: 8, border: "1px solid #e2e8f0", background: "white", color: "#64748b", transition: "all 0.2s", fontWeight: 600 }}>
          ↻
        </button>
      </div>

      {filteredFeed.length === 0 && <p style={{ color: "#64748b", fontSize: FONT_SIZE.base }}>No entries.</p>}
      {filteredFeedAll.length > PAGE_SIZE && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 16 }}>
          <button disabled={safeFeedPage <= 1} onClick={() => setFeedPage(p => Math.max(1, p - 1))} style={{ padding: "6px 14px", background: safeFeedPage <= 1 ? "#f0f0f0" : "white", border: "1px solid #e2e8f0", borderRadius: 8, cursor: safeFeedPage <= 1 ? "not-allowed" : "pointer", fontSize: FONT_SIZE.xs, color: safeFeedPage <= 1 ? "#ccc" : "#64748b" }}>
            ← Previous
          </button>
          <span style={{ display: "flex", alignItems: "center", fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Page {safeFeedPage} of {feedTotalPages}</span>
          <button disabled={safeFeedPage >= feedTotalPages} onClick={() => setFeedPage(p => p + 1)} style={{ padding: "6px 14px", background: safeFeedPage >= feedTotalPages ? "#f0f0f0" : "white", border: "1px solid #e2e8f0", borderRadius: 8, cursor: safeFeedPage >= feedTotalPages ? "not-allowed" : "pointer", fontSize: FONT_SIZE.xs, color: safeFeedPage >= feedTotalPages ? "#ccc" : "#64748b" }}>
            Next →
          </button>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {filteredFeed.map(item => {
          if (item.kind === "procurement") {
            const p = item.data as BulkProcurement
            return (
              <div key={p.procurement_id} className="card-hover" style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", transition: "all 0.2s" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: FONT_SIZE.lg, color: "#0f172a" }}>{p.item_name}</p>
                    <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>{formatDateTime(p.logged_at)}</p>
                  </div>
                  <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: FONT_SIZE.xs, background: "rgba(124, 58, 237, 0.1)", color: "#7c3aed", fontWeight: 700, border: "1px solid #7c3aed33" }}>Bulk Procurement</span>
                </div>
                <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px", marginBottom: 8, border: "1px solid #e2e8f0" }}>
                  <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Total Amount</p>
                  <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#0070f3", fontSize: FONT_SIZE.base }}>₦{p.total_amount.toLocaleString()}</p>
                  {balanceMap[p.procurement_id] !== undefined && (
                    <span style={{ marginTop: 4, fontSize: FONT_SIZE.xs, fontWeight: 600, color: "#16a34a", background: "#f0fdf4", padding: "2px 8px", borderRadius: 4, display: "inline-block" }}>
                      Balance after: ₦{balanceMap[p.procurement_id].toLocaleString()}
                    </span>
                  )}
                </div>
                {p.notes && <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#64748b" }}><strong>Notes:</strong> {p.notes}</p>}
              </div>
            )
          }
          const r = item.data as MaintenanceReport
          const { bg, color, border } = statusColor(r.status)
          return (
            <div key={r.report_id} className="card-hover" style={{ background: "white", border: `1px solid ${border}`, borderRadius: 12, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", transition: "all 0.2s" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: FONT_SIZE.lg, color: "#0f172a" }}>{r.plate_number}</p>
                  <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.sm, color: "#64748b" }}>{r.maintenance_type}</p>
                  {r.maintenance_location && <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>📍 {r.maintenance_location}</p>}
                  <p style={{ margin: "4px 0 0", fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>By {r.manager_name}</p>
                </div>
                <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: FONT_SIZE.xs, background: bg, color, fontWeight: 700, whiteSpace: "nowrap", border: `1px solid ${color}33` }}>{r.status}</span>
              </div>
              <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px", marginBottom: 12, border: "1px solid #e2e8f0" }}>
                <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>Amount</p>
                <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#0070f3", fontSize: FONT_SIZE.base }}>₦{r.amount.toLocaleString()}</p>
                {r.status === "Validated" && balanceMap[r.report_id] !== undefined && (
                  <span style={{ marginTop: 4, fontSize: FONT_SIZE.xs, fontWeight: 600, color: "#16a34a", background: "#f0fdf4", padding: "2px 8px", borderRadius: 4, display: "inline-block" }}>
                    Balance after: ₦{balanceMap[r.report_id].toLocaleString()}
                  </span>
                )}
              </div>
              {r.notes && <p style={{ margin: "0 0 8px 0", fontSize: FONT_SIZE.sm, color: "#64748b" }}><strong>Notes:</strong> {r.notes}</p>}
              {r.status === "Rejected" && r.rejection_reason && (
                <div style={{ padding: "10px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, marginBottom: 12 }}>
                  <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#b91c1c", fontWeight: 600 }}>{r.rejection_reason}</p>
                </div>
              )}
              {r.status === "Pending" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <button onClick={() => onValidate(r)} className="btn-hover-opacity" style={{ padding: "10px 14px", background: "#16a34a", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: FONT_SIZE.sm, minHeight: 40, transition: "opacity 0.2s" }}>
                    Validate
                  </button>
                  <button onClick={() => onReject(r)} className="invalidate-btn" style={{ padding: "10px 14px", background: "white", color: "#ef4444", border: "1.5px solid #ef4444", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: FONT_SIZE.sm, minHeight: 40, transition: "all 0.2s" }}>
                    Reject
                  </button>
                </div>
              )}
              <p style={{ margin: "8px 0 0", fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>{formatDateTime(r.reported_at)}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
