"use client"

import { Icon } from "@iconify/react"

export type StatCard = {
  key: string
  icon: string
  label: string
  value: number
  color: string
  isCurrency?: boolean
}

export function formatValue(card: StatCard) {
  return card.isCurrency
    ? `\u20A6${card.value.toLocaleString()}`
    : card.value.toLocaleString()
}

function scaleFontSize(formatted: string, baseSize: number, minSize: number): number {
  if (formatted.length <= 10) return baseSize
  const extra = formatted.length - 10
  return Math.max(minSize, baseSize - Math.floor(extra / 2))
}

export function FeaturedCard({ card, isMobile }: { card: StatCard; isMobile: boolean }) {
  const display = formatValue(card)
  const fontSize = isMobile ? scaleFontSize(display, 26, 18) : 36

  return (
    <div
      style={{
        background: "#0070f3",
        borderRadius: 16,
        overflow: "hidden",
        padding: isMobile ? "18px 16px" : "24px 28px",
        display: "flex",
        alignItems: "center",
        gap: isMobile ? 14 : 18,
        boxShadow: "0 4px 16px rgba(0, 112, 243, 0.25)",
        marginBottom: isMobile ? 12 : 16,
      }}
    >
      <div
        style={{
          width: isMobile ? 44 : 52,
          height: isMobile ? 44 : 52,
          borderRadius: 12,
          background: "rgba(255,255,255,0.18)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon icon={card.icon} width={isMobile ? 22 : 26} color="#ffffff" />
      </div>
      <div style={{ minWidth: 0, flex: 1, overflow: "hidden" }}>
        <p style={{
          margin: 0,
          fontSize: isMobile ? 12 : 13,
          color: "rgba(255,255,255,0.75)",
          fontWeight: 500,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}>
          {card.label}
        </p>
        <p style={{
          margin: "4px 0 0",
          fontSize,
          fontWeight: 800,
          color: "#ffffff",
          lineHeight: 1.1,
          letterSpacing: "-0.02em",
          overflow: "hidden",
          whiteSpace: "nowrap",
        }}>
          {display}
        </p>
      </div>
    </div>
  )
}

export function StatCardComponent({ card, isMobile }: { card: StatCard; isMobile: boolean }) {
  const display = formatValue(card)
  const fontSize = isMobile ? scaleFontSize(display, 20, 13) : 22

  return (
    <div
      style={{
        background: "white",
        borderRadius: 16,
        overflow: "hidden",
        padding: isMobile ? "14px" : "16px 20px",
        border: "1px solid #eef0f2",
        display: "flex",
        alignItems: "center",
        gap: isMobile ? 12 : 14,
        transition: "all 0.15s ease",
        cursor: "default",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.07)"
        e.currentTarget.style.borderColor = "#e2e4e7"
        e.currentTarget.style.transform = "translateY(-1px)"
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = "none"
        e.currentTarget.style.borderColor = "#eef0f2"
        e.currentTarget.style.transform = "translateY(0)"
      }}
    >
      <div
        style={{
          width: isMobile ? 38 : 42,
          height: isMobile ? 38 : 42,
          borderRadius: 11,
          background: `${card.color}14`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon icon={card.icon} width={isMobile ? 18 : 20} color={card.color} />
      </div>
      <div style={{ minWidth: 0, flex: 1, overflow: "hidden" }}>
        <p style={{
          margin: 0,
          fontSize: isMobile ? 11 : 12,
          color: "#64748b",
          fontWeight: 500,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}>
          {card.label}
        </p>
        <p style={{
          margin: "3px 0 0",
          fontSize,
          fontWeight: 700,
          color: "#0f172a",
          lineHeight: 1.2,
          letterSpacing: "-0.01em",
          overflow: "hidden",
          whiteSpace: "nowrap",
        }}>
          {display}
        </p>
      </div>
    </div>
  )
}

export function SkeletonCards({ isMobile, count }: { isMobile: boolean; count: number }) {
  return (
    <div>
      <div
        style={{
          borderRadius: 16,
          padding: isMobile ? "18px 16px" : "24px 28px",
          display: "flex",
          alignItems: "center",
          gap: isMobile ? 14 : 18,
          background: "#f0f7ff",
          border: "1px solid #bfdbfe",
          marginBottom: isMobile ? 12 : 16,
        }}
      >
        <div style={{
          width: isMobile ? 44 : 52,
          height: isMobile ? 44 : 52,
          borderRadius: 12,
          background: "#dbeafe",
          flexShrink: 0,
        }} />
        <div style={{ flex: 1 }}>
          <div style={{ width: "35%", height: 11, borderRadius: 4, background: "#dbeafe", marginBottom: 8 }} />
          <div style={{ width: "55%", height: 24, borderRadius: 4, background: "#dbeafe" }} />
        </div>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(auto-fill, minmax(220px, 1fr))",
        gap: isMobile ? 10 : 12,
      }}>
        {Array.from({ length: Math.max(count - 1, 1) }).map((_, idx) => (
          <div key={idx} style={{
            background: "white",
            borderRadius: 16,
            padding: isMobile ? "14px" : "16px 20px",
            border: "1px solid #eef0f2",
            display: "flex",
            alignItems: "center",
            gap: isMobile ? 12 : 14,
          }}>
            <div style={{
              width: isMobile ? 38 : 42,
              height: isMobile ? 38 : 42,
              borderRadius: 11,
              background: "#f1f5f9",
              flexShrink: 0,
            }} />
            <div style={{ flex: 1 }}>
              <div style={{ width: "60%", height: 10, borderRadius: 4, background: "#f1f5f9", marginBottom: 7 }} />
              <div style={{ width: "40%", height: 18, borderRadius: 4, background: "#f1f5f9" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
