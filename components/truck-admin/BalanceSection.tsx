"use client"

import { Icon } from "@iconify/react"
import { FONT_SIZE } from "@/lib/constants"
import { formatAmount } from "@/lib/formatAmount"

type Props = {
  maintenanceBalance: number | null
  depositAmount: string
  setDepositAmount: (v: string) => void
  depositNote: string
  setDepositNote: (v: string) => void
  depositError: string
  depositLoading: boolean
  onDeposit: () => void
}

export default function BalanceSection({
  maintenanceBalance, depositAmount, setDepositAmount, depositNote, setDepositNote,
  depositError, depositLoading, onDeposit,
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
      <h3 style={{ marginBottom: 20, color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>Top Up maintenance balance</h3>
      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <p style={{ margin: "0 0 8px 0", fontWeight: 600, fontSize: FONT_SIZE.sm, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>current balance</p>
        <p style={{ margin: 0, fontSize: FONT_SIZE.xl, fontWeight: 700, color: "#0070f3" }}>₦{maintenanceBalance !== null ? maintenanceBalance.toLocaleString() : "—"}</p>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Amount to Add (₦) *</label>
        <input type="text" inputMode="numeric" placeholder="e.g. 500,000" value={depositAmount} onChange={e => setDepositAmount(formatAmount(e.target.value))} style={inputStyle} />
      </div>
      <div style={{ marginBottom: 20 }}>
        <label style={labelStyle}>Note (optional)</label>
        <input type="text" placeholder="e.g. Monthly allocation" value={depositNote} onChange={e => setDepositNote(e.target.value)} style={inputStyle} />
      </div>
      {depositError && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 16, color: "#b91c1c", fontSize: FONT_SIZE.sm, fontWeight: 600 }}>{depositError}</div>}
      <button onClick={onDeposit} disabled={depositLoading} style={{ width: "100%", padding: "12px 16px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: depositLoading ? "not-allowed" : "pointer", fontWeight: 700, fontSize: FONT_SIZE.md, minHeight: 48, opacity: depositLoading ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        {depositLoading ? <><Icon icon="mdi:loading" width={16} style={{ animation: "spin 1s linear infinite" }} /> Adding...</> : "Add to Balance"}
      </button>
    </div>
  )
}
