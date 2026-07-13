"use client"

import { FONT_SIZE } from "@/lib/constants"

import React from "react"

interface ExportActionsProps {
  onExportCSV: () => void
  onExportXLSX: () => void
  disabled?: boolean
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
          fontSize: FONT_SIZE.sm,
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
          fontSize: FONT_SIZE.sm,
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
