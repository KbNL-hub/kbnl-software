"use client"

import React, { ReactNode } from "react"
import { Icon } from "@iconify/react"

type ProtectedSectionProps = {
  requiredRoles: string[]
  userRole?: string
  children: ReactNode
  fallback?: ReactNode
}

export default function ProtectedSection({
  requiredRoles,
  userRole,
  children,
  fallback,
}: ProtectedSectionProps) {
  const isAuthorized = userRole && requiredRoles.includes(userRole)

  if (!isAuthorized) {
    return fallback ? (
      <>{fallback}</>
    ) : (
      <div style={{
        padding: "40px 20px",
        textAlign: "center",
        background: "#fef2f2",
        borderRadius: 12,
        border: "1px solid #fecaca",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
      }}>
        <Icon icon="mdi:lock" width={32} color="#ef4444" />
        <div>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
            Not Authorized
          </p>
          <p style={{ margin: "6px 0 0", fontSize: 14, color: "#64748b" }}>
            You don&apos;t have permission to access this section.
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}