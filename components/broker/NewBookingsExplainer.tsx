"use client"

import { useState } from "react"
import { Icon } from "@iconify/react"
import { FONT_SIZE } from "@/lib/constants"
import { useBreakpoint } from "@/app/hooks/useBreakpoint"

const NOTICE_KEY = "kbnl_new_bookings_explainer_seen"

type Props = { userId: string }

const sections = [
  {
    key: "create",
    icon: "mdi:book-plus",
    title: "Create a Booking",
    subtitle: "Log a customer's intended supply",
    color: "#0070f3",
    bg: "#eff6ff",
    border: "#bfdbfe",
  },
  {
    key: "pricing",
    icon: "mdi:tune-variant",
    title: "Smart Pricing",
    subtitle: "Rate auto-fills from the company price",
    color: "#7c3aed",
    bg: "#f5f3ff",
    border: "#ddd6fe",
  },
  {
    key: "track",
    icon: "mdi:state-machine",
    title: "Track Status",
    subtitle: "Follow every booking to supplied",
    color: "#059669",
    bg: "#ecfdf5",
    border: "#a7f3d0",
  },
]

export default function NewBookingsExplainer({ userId }: Props) {
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

  const total = sections.length + 1
  const section = sections[current - 1]

  const pill = (label: string, color: string) => (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "4px 10px", borderRadius: 14, fontSize: FONT_SIZE.xs,
      fontWeight: 600, background: `${color}1f`, color,
      whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  )

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(15, 23, 42, 0.72)",
        backdropFilter: "blur(8px)",
        display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center",
        padding: isMobile ? 0 : 24,
      }}
      onClick={dismiss}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "white", borderRadius: isMobile ? "26px 26px 0 0" : 18,
          width: "100%", maxWidth: isMobile ? "100%" : 560,
          maxHeight: isMobile ? "94vh" : "90vh", overflowY: "auto",
          boxShadow: "0 25px 60px -12px rgba(0, 0, 0, 0.35)",
        }}
      >
        {isMobile && <div style={{ width: 40, height: 4, background: "#e2e8f0", borderRadius: 2, margin: "12px auto 0" }} />}

        <div style={{ padding: isMobile ? "20px 20px 24px" : "30px 30px 26px" }}>

          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
            <div>
              <p style={{ margin: "0 0 5px", fontSize: FONT_SIZE.xs, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.6px" }}>
                {current === 0 ? "New feature" : `${current} of ${total - 1}`}
              </p>
              <h2 style={{ margin: 0, fontSize: isMobile ? 21 : 20, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>
                {current === 0 ? "Introducing New Bookings" : section.title}
              </h2>
            </div>
            <button
              onClick={dismiss}
              style={{ background: "#f1f5f9", border: "none", cursor: "pointer", color: "#64748b", padding: 6, borderRadius: 8, display: "flex", transition: "all 0.2s" }}
              onMouseEnter={e => { e.currentTarget.style.background = "#e2e8f0"; e.currentTarget.style.color = "#0f172a" }}
              onMouseLeave={e => { e.currentTarget.style.background = "#f1f5f9"; e.currentTarget.style.color = "#64748b" }}
              aria-label="Close"
            >
              <Icon icon="mdi:close" width={18} />
            </button>
          </div>

          {/* Progress dots */}
          <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 22 }}>
            {Array.from({ length: total }, (_, i) => (
              <div
                key={i}
                style={{
                  width: i === current ? 26 : 8, height: 8, borderRadius: 4,
                  background: i === current ? "#0070f3" : "#e2e8f0",
                  transition: "all 0.3s", cursor: "pointer",
                }}
                onClick={() => setCurrent(i)}
              />
            ))}
          </div>

          {current === 0 ? (
            /* ————— INTRO / OVERVIEW ————— */
            <div>
              <div style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "16px 18px", borderRadius: 14,
                background: "#0070f3",
                border: "1px solid #c7d2fe", marginBottom: 16,
              }}>
                <div style={{
                  width: 46, height: 46, borderRadius: 12, background: "white",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  boxShadow: "0 2px 8px rgba(0,112,243,0.15)",
                }}>
                  <Icon icon="mdi:book-plus" width={24} color="#0070f3" />
                </div>
                <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "white", lineHeight: 1.55 }}>
                  <strong style={{ color: "white" }}>New Bookings </strong> lets you log an intended supply for a customer ahead of time.
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {sections.map((s, i) => (
                  <div
                    key={s.key}
                    onClick={() => setCurrent(i + 1)}
                    style={{
                      padding: "14px 16px", background: s.bg, borderRadius: 12,
                      border: `1.5px solid ${s.border}`, cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 12,
                      transition: "transform 0.2s, box-shadow 0.2s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 6px 16px rgba(15,23,42,0.08)" }}
                    onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none" }}
                  >
                    <div style={{
                      width: 42, height: 42, borderRadius: 11, background: "white",
                      border: `1.5px solid ${s.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                      <Icon icon={s.icon} width={21} color={s.color} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: FONT_SIZE.base, color: "#0f172a" }}>{s.title}</p>
                      <p style={{ margin: "2px 0 0", fontSize: FONT_SIZE.xs, color: "#64748b" }}>{s.subtitle}</p>
                    </div>
                    <Icon icon="mdi:chevron-right" width={18} color="#94a3b8" />
                  </div>
                ))}
              </div>

              <p style={{ margin: "14px 0 0", fontSize: FONT_SIZE.xs, color: "#94a3b8", textAlign: "center", lineHeight: 1.4 }}>
                Tap any card to learn more
              </p>
            </div>
          ) : current === 1 ? (
            /* ————— CREATE A BOOKING ————— */
            <div>
              {/* Fake form illustration */}
              <div style={{ background: "#f8fafc", border: `1.5px solid ${section.border}`, borderRadius: 12, padding: 16, marginBottom: 18 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: section.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon icon={section.icon} width={16} color={section.color} />
                  </div>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: FONT_SIZE.base, color: "#0f172a" }}>New Booking</p>
                </div>

                <FormRow label="Customer">
                  <FakeInput icon="mdi:account" text="John Customer" />
                </FormRow>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                  <FormRow label="Area">
                    <FakeSelect text="Calabar to Obubra" />
                  </FormRow>
                  <FormRow label="Product">
                    <FakeSelect text="Supaset" />
                  </FormRow>
                </div>

                <FormRow label="Location">
                  <FakeInput icon="mdi:map-marker" text="Watt Market, Calabar" />
                </FormRow>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                  <FormRow label="Number of Bags">
                    <FakeInput icon="mdi:package-variant" text="200" />
                  </FormRow>
                  <FormRow label="Rate / Bag">
                    <FakeInput icon="mdi:currency-ngn" text="10,500" accent="#059669" />
                  </FormRow>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "white", borderRadius: 8, border: "1px solid #f1f5f9" }}>
                  <span style={{ fontSize: FONT_SIZE.xs, color: "#64748b", fontWeight: 600 }}>Total Amount</span>
                  <span style={{ fontSize: FONT_SIZE.md, fontWeight: 800, color: "#0070f3" }}>₦2,100,000</span>
                </div>
              </div>

              <Tips items={[
                { icon: "mdi:account-search", text: "Pick the customer — the booking is logged under their name." },
                { icon: "mdi:map-marker-radius", text: "Area + product determine the rate. Location is where it will be supplied." },
                { icon: "mdi:calculator", text: "Total = bags × rate, calculated for you automatically." },
                { icon: "mdi:calendar-check", text: "Set the payment date so the payment can be confirmed faster." },
              ]} />

              <Actions onBack={() => setCurrent(c => c - 1)} onNext={() => setCurrent(c => c + 1)} />
            </div>
          ) : current === 2 ? (
            /* ————— SMART PRICING ————— */
            <div>
              {/* Pricing flow illustration */}
              <div style={{ background: "#f8fafc", border: `1.5px solid ${section.border}`, borderRadius: 12, padding: 16, marginBottom: 18 }}>

                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: section.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon icon={section.icon} width={16} color={section.color} />
                  </div>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: FONT_SIZE.base, color: "#0f172a" }}>How your rate is set</p>
                </div>

                {/* Company price match */}
                <FlowStep>
                  <FlowNum color="#059669">1</FlowNum>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: FONT_SIZE.sm, color: "#0f172a" }}>Rate = company price</p>
                    <p style={{ margin: "2px 0 5px", fontSize: FONT_SIZE.xs, color: "#64748b" }}>Selecting the area &amp; product auto-fills the rate for you.</p>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {pill("Pending", "#0070f3")}
                      {pill("No review needed", "#64748b")}
                    </div>
                  </div>
                </FlowStep>

                <div style={{ textAlign: "center", margin: "6px 0" }}>
                  <Icon icon="mdi:arrow-down" width={20} color="#cbd5e1" />
                </div>

                {/* Different price */}
                <FlowStep>
                  <FlowNum color="#f59e0b">2</FlowNum>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: FONT_SIZE.sm, color: "#0f172a" }}>You sell at a different price</p>
                    <p style={{ margin: "2px 0 5px", fontSize: FONT_SIZE.xs, color: "#64748b" }}>Tick “Sold at a different price”, add a reason (≦ discount).</p>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {pill("Awaiting Review", "#d97706")}
                      {pill("Needs admin approval", "#ef4444")}
                    </div>
                  </div>
                </FlowStep>

                <div style={{ textAlign: "center", margin: "6px 0" }}>
                  <Icon icon="mdi:arrow-down" width={20} color="#cbd5e1" />
                </div>

                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", background: "white", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                  <div style={{ color: "#0f172a", fontWeight: 700, fontSize: FONT_SIZE.sm }}>Tip</div>
                  <div style={{ fontSize: FONT_SIZE.xs, color: "#64748b", lineHeight: 1.5, flex: 1 }}>
                    Using the company price means the booking is approved instantly. A custom price needs admin review — always explain it to avoid delays.
                  </div>
                </div>
              </div>

              <Tips items={[
                { icon: "mdi:check-decagram", text: "Matching the company price → booking is <strong>Pending</strong> and moves straight to supply." },
                { icon: "mdi:clock-alert", text: "Different price → status is <strong>Awaiting Review</strong> until an admin approves." },
              ]} html />

              <Actions onBack={() => setCurrent(c => c - 1)} onNext={() => setCurrent(c => c + 1)} />
            </div>
          ) : (
            /* ————— TRACK STATUS ————— */
            <div>
              <div style={{ background: "#f8fafc", border: `1.5px solid ${section.border}`, borderRadius: 12, padding: 16, marginBottom: 18 }}>

                {/* Lifecycle flow */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 0, flexWrap: isMobile ? "wrap" : "nowrap" }}>
                  <StatusNode color="#0070f3" bg="#eff6ff" icon="mdi:clock-outline" label="Pending" />
                  <FlowArrow />
                  <StatusNode color="#d97706" bg="#fffbeb" icon="mdi:clock-alert-outline" label="Awaiting Review" />
                  <FlowArrow />
                  <StatusNode color="#059669" bg="#ecfdf5" icon="mdi:check-circle" label="Supplied" />
                </div>

                <div style={{ margin: "16px 0 0", paddingTop: 14, borderTop: "1px dashed #e2e8f0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <Icon icon="mdi:refresh" width={15} color="#ef4444" />
                    <p style={{ margin: 0, fontSize: FONT_SIZE.sm, fontWeight: 700, color: "#0f172a" }}>Rejected?</p>
                  </div>
                  <p style={{ margin: 0, fontSize: FONT_SIZE.xs, color: "#64748b", lineHeight: 1.55 }}>
                    If an admin rejects a booking you&apos;ll see the reason. Fix the details and tap <strong style={{ color: "#0070f3" }}>Resubmit</strong> to send it back for review.
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
                <StatusRow icon="mdi:clock-outline" color="#0070f3" bg="#eff6ff" title="Pending" desc="Approved & awaiting supply. You can still edit it." />
                <StatusRow icon="mdi:clock-alert-outline" color="#d97706" bg="#fffbeb" title="Awaiting Review" desc="Custom price — waiting for the admin to approve." />
                <StatusRow icon="mdi:close-circle" color="#dc2626" bg="#fef2f2" title="Rejected" desc="Review the reason, edit, and resubmit." />
                <StatusRow icon="mdi:check-circle" color="#059669" bg="#ecfdf5" title="Supplied" desc="Delivery completed. You&apos;re all set." />
              </div>

              <Actions onBack={() => setCurrent(c => c - 1)} onNext={dismiss} last />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ————— Sub-components (static, inline illustration helpers) ————— */

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <p style={{ margin: "0 0 4px", fontSize: 10, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.4px" }}>{label}</p>
      {children}
    </div>
  )
}

function FakeInput({ icon, text, accent }: { icon: string; text: string; accent?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 11px", background: "white", borderRadius: 7, border: "1px solid #f1f5f9" }}>
      <Icon icon={icon} width={15} color="#94a3b8" />
      <span style={{ fontSize: FONT_SIZE.sm, color: accent || "#0f172a", fontWeight: accent ? 700 : 500 }}>{text}</span>
    </div>
  )
}

function FakeSelect({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "9px 11px", background: "white", borderRadius: 7, border: "1px solid #f1f5f9" }}>
      <span style={{ fontSize: FONT_SIZE.sm, color: "#0f172a", fontWeight: 500 }}>{text}</span>
      <Icon icon="mdi:chevron-down" width={15} color="#94a3b8" />
    </div>
  )
}

function Tips({ items, html }: { items: { icon: string; text: string }[]; html?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#eff6ff", border: "1px solid #bfdbfe", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
            <Icon icon={item.icon} width={13} color="#0070f3" />
          </div>
          {html ? (
            <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#334155", lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: item.text }} />
          ) : (
            <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#334155", lineHeight: 1.5 }}>{item.text}</p>
          )}
        </div>
      ))}
    </div>
  )
}
function Actions({ onBack, onNext, last }: { onBack?: () => void; onNext: () => void; last?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {onBack && (
        <button
          onClick={onBack}
          style={{
            padding: "12px 0", flex: 1, background: "white", border: "1.5px solid #e2e8f0",
            borderRadius: 10, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.md, color: "#475569",
            transition: "all 0.2s", minHeight: 46,
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "#cbd5e1"; e.currentTarget.style.background = "#f8fafc" }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.background = "white" }}
        >
          Back
        </button>
      )}
      <button
        onClick={onNext}
        style={{
          padding: "12px 0", flex: 1, background: "#0070f3", color: "white",
          border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 600,
          fontSize: FONT_SIZE.md, transition: "background 0.2s", minHeight: 46, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        }}
        onMouseEnter={e => e.currentTarget.style.background = "#0057c7"}
        onMouseLeave={e => e.currentTarget.style.background = "#0070f3"}
      >
        {last ? (<><Icon icon="mdi:check" width={17} /> Got it</>) : "Next"}
      </button>
    </div>
  )
}

function FlowStep({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", background: "white", borderRadius: 10, border: "1px solid #e2e8f0" }}>
      {children}
    </div>
  )
}

function FlowNum({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div style={{
      width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
      background: `${color}1f`, color, fontWeight: 800, fontSize: FONT_SIZE.sm,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {children}
    </div>
  )
}

function FlowArrow() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "8px 2px 0", flexShrink: 0, minWidth: 18 }}>
      <Icon icon="mdi:chevron-right" width={16} color="#cbd5e1" />
    </div>
  )
}

function StatusNode({ color, bg, icon, label }: { color: string; bg: string; icon: string; label: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
      <div style={{
        width: 44, height: 44, borderRadius: "50%", background: bg, border: `1.5px solid ${color}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon icon={icon} width={19} color={color} />
      </div>
      <span style={{ fontSize: FONT_SIZE.xs, fontWeight: 700, color: color, textAlign: "center", lineHeight: 1.2 }}>
        {label.split(" ")[0]}
        {label.includes(" ") && <><br />{label.split(" ").slice(1).join(" ")}</>}
      </span>
    </div>
  )
}

function StatusRow({ icon, color, bg, title, desc }: { icon: string; color: string; bg: string; title: string; desc: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
      <div style={{ width: 30, height: 30, borderRadius: 8, background: bg, border: `1px solid ${color}55`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
        <Icon icon={icon} width={15} color={color} />
      </div>
      <div>
        <p style={{ margin: 0, fontSize: FONT_SIZE.sm, fontWeight: 700, color: "#0f172a" }}>{title}</p>
        <p style={{ margin: "1px 0 0", fontSize: FONT_SIZE.xs, color: "#64748b", lineHeight: 1.5 }}>{desc}</p>
      </div>
    </div>
  )
}
