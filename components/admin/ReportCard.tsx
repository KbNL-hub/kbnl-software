"use client"

import React from "react"

interface ReportCardProps {
  children: React.ReactNode
  onHoverChange?: (isHovered: boolean) => void
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

export function ReportCard({ children, onHoverChange }: ReportCardProps) {
  return (
    <div
      style={{
        background: "white",
        borderRadius: 12,
        padding: 16,
        border: "1px solid #e2e8f0",
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
        transition: "all 0.2s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.08)"
        e.currentTarget.style.borderColor = "#cbd5e1"
        onHoverChange?.(true)
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.05)"
        e.currentTarget.style.borderColor = "#e2e8f0"
        onHoverChange?.(false)
      }}
    >
      {children}
    </div>
  )
}

export function ReportCardField({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <p style={{ margin: 0, fontSize: fontSize.xs, color: "#94a3b8", fontWeight: 500 }}>{label}</p>
      <p style={{ margin: "4px 0 0", fontSize: fontSize.base, color: "#0f172a", fontWeight: 600 }}>{value}</p>
    </div>
  )
}

export function ReportCardSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <p style={{ margin: 0, fontSize: fontSize.xs, color: "#94a3b8", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.5px" }}>
        {title}
      </p>
      <div style={{ marginTop: 8 }}>{children}</div>
    </div>
  )
}
