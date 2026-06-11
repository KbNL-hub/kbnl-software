"use client"

import React from "react"

interface LoadingStateProps {
  message?: string
}

export function LoadingState({ message = "Loading..." }: LoadingStateProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "64px 24px", minHeight: 200 }}>
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          border: "3px solid #e2e8f0",
          borderTopColor: "#0070f3",
          animation: "spin 1s linear infinite",
          marginBottom: 16,
        }}
      />
      <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>{message}</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
