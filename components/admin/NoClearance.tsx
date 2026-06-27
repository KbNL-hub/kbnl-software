"use client"

import { Icon } from "@iconify/react"
import { useRouter } from "next/navigation"

export default function NoClearance({ sectionLabel }: { sectionLabel?: string }) {
  const router = useRouter()

  const handleGoBack = () => {
    if (window.history.length > 1) {
      router.back()
      return
    }
    router.push("/")
  }

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "64px 24px",
      textAlign: "center",
      fontFamily: "'Inter', sans-serif",
    }}>
      <div style={{
        width: 72,
        height: 72,
        background: "rgba(239, 68, 68, 0.1)",
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 20,
      }}>
        <Icon icon="mdi:lock-alert" width={36} color="#ef4444" />
      </div>
      <h2 style={{ margin: "0 0 8px", color: "#0f172a", fontSize: 22, fontWeight: 700 }}>
        No Clearance
      </h2>
      <p style={{ margin: "0 0 24px", color: "#64748b", fontSize: 15, maxWidth: 400, lineHeight: 1.5 }}>
        {sectionLabel
          ? `You don't have clearance to access "${sectionLabel}". Contact your administrator if you need access.`
          : `You don't have clearance for this section. Contact your administrator if you need access.`}
      </p>
      <button
        onClick={handleGoBack}
        style={{
          padding: "10px 24px",
          background: "#0070f3",
          color: "white",
          border: "none",
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
          transition: "all 0.2s",
        }}
        onMouseEnter={(e) => e.currentTarget.style.opacity = "0.9"}
        onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
      >
        Go Back
      </button>
    </div>
  )
}
