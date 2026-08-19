"use client"

import { FONT_SIZE } from "@/lib/constants"

type Props = {
  page: number
  totalPages: number
  totalItems: number
  onPageChange: (page: number) => void
}

export default function PaginationControls({ page, totalPages, totalItems, onPageChange }: Props) {
  if (totalPages <= 1) return null

  const start = page * 100 + 1
  const end = Math.min((page + 1) * 100, totalItems)

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 0", marginTop: 8, borderTop: "1px solid #e2e8f0", flexWrap: "wrap", gap: 12 }}>
      <p style={{ margin: 0, color: "#64748b", fontSize: FONT_SIZE.sm }}>
        Showing <span style={{ fontWeight: 600, color: "#0f172a" }}>{start}–{end}</span> of <span style={{ fontWeight: 600, color: "#0f172a" }}>{totalItems}</span> records
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button
          onClick={() => onPageChange(0)}
          disabled={page === 0}
          style={{
            padding: "6px 10px", borderRadius: 6, border: "1px solid #e2e8f0", background: "white",
            color: page === 0 ? "#cbd5e1" : "#475569", cursor: page === 0 ? "not-allowed" : "pointer",
            fontSize: FONT_SIZE.xs, fontWeight: 500, minHeight: 32, minWidth: 32,
            display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s",
          }}
          title="First page"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>
        </button>

        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 0}
          style={{
            padding: "6px 10px", borderRadius: 6, border: "1px solid #e2e8f0", background: "white",
            color: page === 0 ? "#cbd5e1" : "#475569", cursor: page === 0 ? "not-allowed" : "pointer",
            fontSize: FONT_SIZE.xs, fontWeight: 500, minHeight: 32, minWidth: 32,
            display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s",
          }}
          title="Previous page"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>

        <span style={{ padding: "6px 12px", fontSize: FONT_SIZE.sm, color: "#475569", fontWeight: 500, background: "#f8fafc", borderRadius: 6, border: "1px solid #e2e8f0", minWidth: 44, textAlign: "center" }}>
          {page + 1} / {totalPages}
        </span>

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages - 1}
          style={{
            padding: "6px 10px", borderRadius: 6, border: "1px solid #e2e8f0", background: "white",
            color: page >= totalPages - 1 ? "#cbd5e1" : "#475569", cursor: page >= totalPages - 1 ? "not-allowed" : "pointer",
            fontSize: FONT_SIZE.xs, fontWeight: 500, minHeight: 32, minWidth: 32,
            display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s",
          }}
          title="Next page"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>

        <button
          onClick={() => onPageChange(totalPages - 1)}
          disabled={page >= totalPages - 1}
          style={{
            padding: "6px 10px", borderRadius: 6, border: "1px solid #e2e8f0", background: "white",
            color: page >= totalPages - 1 ? "#cbd5e1" : "#475569", cursor: page >= totalPages - 1 ? "not-allowed" : "pointer",
            fontSize: FONT_SIZE.xs, fontWeight: 500, minHeight: 32, minWidth: 32,
            display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s",
          }}
          title="Last page"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>
        </button>
      </div>
    </div>
  )
}
