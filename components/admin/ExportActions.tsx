"use client"

import React from "react"

interface ExportActionsProps {
  onExportCSV: () => void
  onExportXLSX: () => void
  disabled?: boolean
}

const fontSize = {
  xs: 12,
  sm: 13,
  base: 14,
  md: 15,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 28,
}

export function ExportActions({ onExportCSV, onExportXLSX, disabled = false }: ExportActionsProps) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button
        onClick={onExportCSV}
        disabled={disabled}
        style={{
          padding: "8px 12px",
          background: "white",
          color: "#64748b",
          border: "1px solid #e2e8f0",
          borderRadius: 6,
          cursor: disabled ? "not-allowed" : "pointer",
          fontWeight: 500,
          fontSize: fontSize.sm,
          opacity: disabled ? 0.5 : 1,
          transition: "all 0.2s ease",
        }}
        onMouseEnter={(e) => {
          if (!disabled) {
            e.currentTarget.style.borderColor = "#cbd5e1"
            e.currentTarget.style.background = "#f8fafc"
          }
        }}
        onMouseLeave={(e) => {
          if (!disabled) {
            e.currentTarget.style.borderColor = "#e2e8f0"
            e.currentTarget.style.background = "white"
          }
        }}
      >
        Export CSV
      </button>
      <button
        onClick={onExportXLSX}
        disabled={disabled}
        style={{
          padding: "8px 12px",
          background: "white",
          color: "#64748b",
          border: "1px solid #e2e8f0",
          borderRadius: 6,
          cursor: disabled ? "not-allowed" : "pointer",
          fontWeight: 500,
          fontSize: fontSize.sm,
          opacity: disabled ? 0.5 : 1,
          transition: "all 0.2s ease",
        }}
        onMouseEnter={(e) => {
          if (!disabled) {
            e.currentTarget.style.borderColor = "#cbd5e1"
            e.currentTarget.style.background = "#f8fafc"
          }
        }}
        onMouseLeave={(e) => {
          if (!disabled) {
            e.currentTarget.style.borderColor = "#e2e8f0"
            e.currentTarget.style.background = "white"
          }
        }}
      >
        Export Excel
      </button>
    </div>
  )
}
