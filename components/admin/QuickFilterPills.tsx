"use client"

import { FONT_SIZE } from "@/lib/constants"

import React from "react"

interface QuickFilterPillsProps {
  options: Array<{ id: string; label: string }>
  selectedId: string
  onSelect: (id: string) => void
}



export function QuickFilterPills({ options, selectedId, onSelect }: QuickFilterPillsProps) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {options.map((opt) => {
        const isSelected = selectedId === opt.id
        return (
          <button
            key={opt.id}
            onClick={() => onSelect(opt.id)}
            style={{
              padding: "8px 14px",
              borderRadius: 20,
              fontSize: FONT_SIZE.sm,
              cursor: "pointer",
              border: isSelected ? "1.5px solid #0070f3" : "1.5px solid #e2e8f0",
              background: isSelected ? "#eff6ff" : "white",
              color: isSelected ? "#0070f3" : "#64748b",
              fontWeight: isSelected ? 600 : 500,
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              if (!isSelected) {
                e.currentTarget.style.background = "#f8fafc"
                e.currentTarget.style.borderColor = "#cbd5e1"
              }
            }}
            onMouseLeave={(e) => {
              if (!isSelected) {
                e.currentTarget.style.background = "white"
                e.currentTarget.style.borderColor = "#e2e8f0"
              }
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
