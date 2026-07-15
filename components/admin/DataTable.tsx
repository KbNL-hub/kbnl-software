"use client"

import { FONT_SIZE } from "@/lib/constants"

import React from "react"

interface Column<T> {
  key: keyof T & string
  label: string
  render?: (value: T[keyof T & string], row: T) => React.ReactNode
}



interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
}



export function DataTable<T>({ columns, rows, rowKey }: DataTableProps<T>) {
  return (
    <div style={{ overflowX: "auto", background: "white", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  padding: "12px 16px",
                  textAlign: "left",
                  fontSize: FONT_SIZE.xs,
                  fontWeight: 600,
                  color: "#64748b",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr
              key={rowKey(row)}
              style={{
                borderBottom: idx < rows.length - 1 ? "1px solid #e2e8f0" : "none",
                transition: "background 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {columns.map((col) => (
                <td
                  key={`${rowKey(row)}-${col.key}`}
                  style={{
                    padding: "12px 16px",
                    fontSize: FONT_SIZE.base,
                    color: "#0f172a",
                  }}
                >
                  {col.render ? col.render(row[col.key], row) : row[col.key] as React.ReactNode}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
