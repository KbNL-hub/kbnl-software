"use client"

import { Icon } from "@iconify/react"
import { FONT_SIZE } from "@/lib/constants"
import { formatAmount } from "@/lib/formatAmount"

type Props = {
  procItem: string
  setProcItem: (v: string) => void
  procTotal: string
  setProcTotal: (v: string) => void
  procNotes: string
  setProcNotes: (v: string) => void
  procError: string
  procLoading: boolean
  onLogProcurement: () => void
}

export default function ProcurementSection({
  procItem, setProcItem, procTotal, setProcTotal, procNotes, setProcNotes,
  procError, procLoading, onLogProcurement,
}: Props) {
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", paddingRight: 36,
    boxSizing: "border-box", borderRadius: 8,
    border: "1px solid #e2e8f0", fontSize: FONT_SIZE.base,
    background: "white", color: "#0f172a", minHeight: 48,
  }

  const labelStyle: React.CSSProperties = {
    fontWeight: 600, display: "block",
    marginBottom: 6, fontSize: FONT_SIZE.sm, color: "#475569"
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <h3 style={{ marginBottom: 20, color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>Log Bulk Procurement</h3>
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Item Name *</label>
        <input type="text" placeholder="e.g. Grease, Engine oil" value={procItem} onChange={e => setProcItem(e.target.value)} style={inputStyle} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Total Amount (₦) *</label>
        <input type="text" inputMode="numeric" placeholder="e.g. 150,000" value={procTotal} onChange={e => setProcTotal(formatAmount(e.target.value))} style={inputStyle} />
      </div>
      <div style={{ marginBottom: 20 }}>
        <label style={labelStyle}>Notes (optional)</label>
        <textarea placeholder="Any additional details..." value={procNotes} onChange={e => setProcNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: "none", minHeight: 80, paddingRight: 12 }} />
      </div>
      {procError && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 16, color: "#b91c1c", fontSize: FONT_SIZE.sm, fontWeight: 600 }}>{procError}</div>}
      <button onClick={onLogProcurement} disabled={procLoading} style={{ width: "100%", padding: "12px 16px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: procLoading ? "not-allowed" : "pointer", fontWeight: 700, fontSize: FONT_SIZE.md, minHeight: 48, opacity: procLoading ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        {procLoading ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} /> Logging...</> : "Log Procurement"}
      </button>
    </div>
  )
}
