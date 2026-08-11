"use client"

import { useState } from "react"
import { Icon } from "@iconify/react"
import { FONT_SIZE } from "@/lib/constants"
import { useBreakpoint } from "@/app/hooks/useBreakpoint"

const NOTICE_KEY = "kbnl_loadout_notice_seen"

type Props = { userId: string }

const cards = [
  {
    title: "Direct Sale",
    subtitle: "When a customer buys directly from the store",
    color: "#10b981",
    bg: "#ecfdf5",
    border: "#a7f3d0",
    icon: "mdi:account-cash",
    tips: [
      "Set the price per bag yourself",
      "Pick the customer (optional)",
      "Choose how goods leave: Self, Tricycle, or Truck",
      "Status: Confirmed immediately",
    ],
    formFields: [
      { label: "Supaset × 50", right: "₦10,500/bag" },
      { label: "Classic × 30", right: "₦12,000/bag" },
    ],
    formExtra: { label: "Customer", value: "John Customer" },
    formDelivery: "Self Pickup",
  },
  {
    title: "Truck Load Out",
    subtitle: "Loading goods onto a KBNL truck for a trip/dispatch",
    color: "#0070f3",
    bg: "#eff6ff",
    border: "#bfdbfe",
    icon: "mdi:truck-fast-outline",
    tips: [
      "For goods going on a trip — not one specific customer",
      "No price set by you (dispatch record)",
      "Select the truck being loaded",
      "Status: Confirmed · Payment: Load Out",
    ],
    formFields: [
      { label: "Supaset × 200", right: "—" },
      { label: "Supafix × 100", right: "—" },
    ],
    formExtra: { label: "Truck", value: "ABC-123-DE" },
    formDelivery: "Truck (locked)",
  },
  {
    title: "Broker-Linked Sale",
    subtitle: "When a broker is selling and will confirm the prices",
    color: "#f59e0b",
    bg: "#fffbeb",
    border: "#fde68a",
    icon: "mdi:handshake",
    tips: [
      "Products going to a specific customer via the broker",
      "Price set by the broker (not by you)",
      "Broker will confirm and set final prices",
      "Status: Pending until broker confirms",
    ],
    formFields: [
      { label: "3X × 50", right: "Price by broker" },
      { label: "Falcon × 30", right: "Price by broker" },
    ],
    formExtra: { label: "Broker", value: "Alhaji Musa" },
    formDelivery: "Truck",
  },
]

export default function StoreOfficerLoadOutNotice({ userId }: Props) {
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"
  const [visible, setVisible] = useState(() => {
    if (!userId || typeof window === "undefined") return false
    return !localStorage.getItem(NOTICE_KEY)
  })
  const [current, setCurrent] = useState(0)

  function dismiss() {
    localStorage.setItem(NOTICE_KEY, "true")
    setVisible(false)
    setCurrent(0)
  }

  if (!visible) return null

  const card = cards[current - 1]
  const isLast = current === cards.length

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(15, 23, 42, 0.7)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center",
        padding: isMobile ? 0 : 24,
      }}
      onClick={dismiss}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "white", borderRadius: isMobile ? "24px 24px 0 0" : 16,
          width: "100%", maxWidth: isMobile ? "100%" : 520,
          maxHeight: isMobile ? "94vh" : "88vh", overflowY: "auto",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.3)",
        }}
      >
        {/* Drag handle (mobile) */}
        {isMobile && <div style={{ width: 40, height: 4, background: "#e2e8f0", borderRadius: 2, margin: "12px auto 0" }} />}

        <div style={{ padding: isMobile ? "20px 20px 24px" : "28px 28px 24px" }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <p style={{ margin: "0 0 4px", fontSize: FONT_SIZE.xs, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                {current === 0 ? "Getting started" : `${current} of ${cards.length}`}
              </p>
              <h2 style={{ margin: 0, fontSize: isMobile ? 20 : 18, fontWeight: 700, color: "#0f172a" }}>
                {current === 0 ? "How to log sales" : card.title}
              </h2>
            </div>
            <button
              onClick={dismiss}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 4, display: "flex", transition: "color 0.2s" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#475569")}
              onMouseLeave={e => (e.currentTarget.style.color = "#94a3b8")}
            >
              <Icon icon="mdi:close" width={22} />
            </button>
          </div>

          {/* Progress dots */}
          <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 24 }}>
            {Array.from({ length: cards.length + 1 }, (_, i) => (
              <div
                key={i}
                style={{
                  width: i === current ? 24 : 8, height: 8, borderRadius: 4,
                  background: i === current ? "#0070f3" : "#e2e8f0",
                  transition: "all 0.3s", cursor: "pointer",
                }}
                onClick={() => setCurrent(i)}
              />
            ))}
          </div>

          {/* Card content */}
          {current === 0 ? (
            /* Intro card — overview of all 3 types */
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {cards.map((c, i) => (
                <div
                  key={i}
                  onClick={() => setCurrent(i + 1)}
                  style={{
                    padding: "14px 16px", background: c.bg, borderRadius: 10,
                    border: `1.5px solid ${c.border}`, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 12, transition: "transform 0.2s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-1px)")}
                  onMouseLeave={e => (e.currentTarget.style.transform = "none")}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: 10, background: "white",
                    border: `1.5px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    <Icon icon={c.icon} width={20} color={c.color} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: FONT_SIZE.base, color: "#0f172a" }}>{c.title}</p>
                    <p style={{ margin: "2px 0 0", fontSize: FONT_SIZE.xs, color: "#64748b" }}>{c.subtitle}</p>
                  </div>
                  <Icon icon="mdi:chevron-right" width={18} color="#94a3b8" />
                </div>
              ))}
              <p style={{ margin: "8px 0 0", fontSize: FONT_SIZE.xs, color: "#94a3b8", textAlign: "center", lineHeight: 1.4 }}>
                Tap any card to learn more
              </p>
            </div>
          ) : (
            /* Detail card — mini form UI + tips */
            <div>
              {/* Mini form UI illustration */}
              <div style={{
                background: "#f8fafc", border: `1.5px solid ${card.border}`,
                borderRadius: 10, padding: isMobile ? "14px 14px" : "16px 18px", marginBottom: 18,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: 8, background: card.bg,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Icon icon={card.icon} width={17} color={card.color} />
                  </div>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: FONT_SIZE.base, color: "#0f172a" }}>{card.title}</p>
                    <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#94a3b8" }}>{card.subtitle}</p>
                  </div>
                </div>

                {/* Simulated form header row */}
                <div style={{
                  background: "white", borderRadius: 6, padding: "8px 10px", marginBottom: 8,
                  display: "flex", justifyContent: "space-between", fontSize: FONT_SIZE.xs, color: "#94a3b8", border: "1px solid #f1f5f9",
                }}>
                  <span>Product</span>
                  {card.title !== "Broker-Linked Sale" && <span>{card.title === "Truck Load Out" ? "" : "Price/Bag"}</span>}
                  {card.title === "Broker-Linked Sale" && <span>Price</span>}
                </div>

                {/* Simulated product lines */}
                {card.formFields.map((f, i) => (
                  <div
                    key={i}
                    style={{
                      background: "white", borderRadius: 6, padding: "10px 10px", marginBottom: 6,
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      border: "1px solid #f1f5f9", fontSize: FONT_SIZE.sm,
                    }}
                  >
                    <span style={{ fontWeight: 600, color: "#0f172a" }}>{f.label}</span>
                    <span style={{
                      color: f.right === "—" ? "#94a3b8" : f.right.includes("broker") ? "#f59e0b" : "#10b981",
                      fontWeight: 500, fontStyle: f.right === "—" || f.right.includes("broker") ? "italic" : "normal",
                    }}>
                      {f.right}
                    </span>
                  </div>
                ))}

                {/* Simulated extra field */}
                <div style={{
                  background: "white", borderRadius: 6, padding: "8px 10px", marginTop: 10,
                  border: "1px solid #f1f5f9", display: "flex", gap: 10,
                }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 10, color: "#94a3b8" }}>{card.formExtra.label}</p>
                    <p style={{ margin: "2px 0 0", fontSize: FONT_SIZE.sm, fontWeight: 500, color: "#0f172a" }}>{card.formExtra.value}</p>
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 10, color: "#94a3b8" }}>Delivery</p>
                    <p style={{ margin: "2px 0 0", fontSize: FONT_SIZE.sm, fontWeight: 500, color: card.color }}>{card.formDelivery}</p>
                  </div>
                </div>
              </div>

              {/* Tips */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
                {card.tips.map((tip, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: "50%", background: card.bg,
                      border: `1.5px solid ${card.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1,
                    }}>
                      <Icon icon="mdi:check" width={12} color={card.color} />
                    </div>
                    <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#334155", lineHeight: 1.5 }}>{tip}</p>
                  </div>
                ))}
              </div>

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 8 }}>
                {current > 1 && (
                  <button
                    onClick={() => setCurrent(c => c - 1)}
                    style={{
                      padding: "12px 0", flex: 1, background: "white", border: "1.5px solid #e2e8f0",
                      borderRadius: 10, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, color: "#475569",
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "#cbd5e1"; e.currentTarget.style.background = "#f8fafc" }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.background = "white" }}
                  >
                    Back
                  </button>
                )}
                <button
                  onClick={() => isLast ? dismiss() : setCurrent(c => c + 1)}
                  style={{
                    padding: "12px 0", flex: 1, background: "#0070f3", color: "white",
                    border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 600,
                    fontSize: FONT_SIZE.md, transition: "background 0.2s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#0057c7")}
                  onMouseLeave={e => (e.currentTarget.style.background = "#0070f3")}
                >
                  {isLast ? "Got it" : "Next"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
