"use client"

import { FONT_SIZE } from "@/lib/constants"

import React from "react"

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description: string
}



export function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "64px 24px",
        background: "white",
        borderRadius: 12,
        border: "1px solid #e2e8f0",
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
      }}
    >
      {icon && <div style={{ fontSize: 32, marginBottom: 12 }}>{icon}</div>}
      <h3 style={{ margin: "0 0 8px", color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 600 }}>{title}</h3>
      <p style={{ color: "#64748b", fontSize: FONT_SIZE.base, margin: 0 }}>{description}</p>
    </div>
  )
}
