"use client"

import { FONT_SIZE } from "@/lib/constants"

import React, { useState } from "react"

interface DateRangeSelectorProps {
  fromDate: string
  toDate: string
  onFromChange: (date: string) => void
  onToChange: (date: string) => void
  error?: string
  isMobile?: boolean
}



export function DateRangeSelector({ fromDate, toDate, onFromChange, onToChange, error }: DateRangeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)

  const dateLabel = fromDate && toDate ? `${fromDate} to ${toDate}` : fromDate ? fromDate : "Select dates"

  return (
    <div style={{ position: "relative", flex: "1 1 200px" }}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "white",
          border: error ? "1.5px solid #ef4444" : fromDate ? "1.5px solid #0070f3" : "1px solid #e2e8f0",
          borderRadius: 8,
          padding: "8px 12px",
          cursor: "pointer",
          userSelect: "none",
          transition: "all 0.2s ease",
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          style={{ color: error ? "#ef4444" : fromDate ? "#0070f3" : "#888", flexShrink: 0 }}
        >
          <path d="M3 9h18M3 9V7c0-1 1-2 2-2h14c1 0 2 1 2 2v2m0 0v10c0 1-1 2-2 2H5c-1 0-2-1-2-2v-10" strokeWidth="2" strokeLinecap="round" />
          <path d="M9 2v5M15 2v5" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span style={{ fontSize: FONT_SIZE.sm, color: fromDate ? "#333" : "#aaa", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {dateLabel}
        </span>
        {fromDate && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onFromChange("")
              onToChange("")
            }}
            style={{ border: "none", background: "none", cursor: "pointer", color: "#aaa", padding: 0, lineHeight: 1 }}
          >
            ✕
          </button>
        )}
      </div>

      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            background: "white",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            padding: 16,
            zIndex: 50,
            boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
            minWidth: 280,
          }}
        >
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: FONT_SIZE.xs, color: "#475569", fontWeight: 500, marginBottom: 6 }}>
              From Date
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                onFromChange(e.target.value)
              }}
              style={{
                width: "100%",
                padding: "8px 10px",
                border: "1px solid #e2e8f0",
                borderRadius: 6,
                fontSize: FONT_SIZE.sm,
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: FONT_SIZE.xs, color: "#475569", fontWeight: 500, marginBottom: 6 }}>
              To Date
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                onToChange(e.target.value)
              }}
              style={{
                width: "100%",
                padding: "8px 10px",
                border: "1px solid #e2e8f0",
                borderRadius: 6,
                fontSize: FONT_SIZE.sm,
                boxSizing: "border-box",
              }}
            />
          </div>

          {error && (
            <div style={{ padding: "8px 10px", background: "#fef2f2", borderLeft: "3px solid #ef4444", borderRadius: 4, fontSize: FONT_SIZE.xs, color: "#b91c1c" }}>
              {error}
            </div>
          )}

          <button
            onClick={() => setIsOpen(false)}
            style={{
              marginTop: 12,
              padding: "6px 12px",
              background: "#0070f3",
              color: "white",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: FONT_SIZE.sm,
              fontWeight: 500,
              width: "100%",
            }}
          >
            Apply
          </button>
        </div>
      )}
    </div>
  )
}
