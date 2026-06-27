"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { getRoleDashboard } from "@/lib/permissions"

type Props = {
  currentRole: string
  style?: React.CSSProperties
  onRoleSwitch?: (newRole: string) => void
}

const LABELS: Record<string, string> = {
  Admin: "Admin",
  SuperAdmin: "Super Admin",
  Supervisor: "Supervisor",
  CashAuthorizer: "Cash Authorizer",
  Broker: "Broker",
  TruckAdmin: "Truck Admin",
  DeskOfficer: "Desk Officer",
  ATCOfficer: "ATC Officer",
  Driver: "Driver",
  StationManager: "Station Manager",
  TruckOfficer: "Truck Officer",
  StoreOfficer: "Store Officer",
  CashOfficer: "Cash Officer",
}

export default function RoleSwitcher({ currentRole, style, onRoleSwitch }: Props) {
  const router = useRouter()
  const [userRoles, setUserRoles] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true

    const loadRoles = async (userId?: string) => {
      if (!userId || !active) return
      const { data } = await supabase
        .from("UserRoles")
        .select("role")
        .eq("user_id", userId)

      if (active && data) setUserRoles(data.map(r => r.role))
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      loadRoles(session?.user.id)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      loadRoles(session?.user.id)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const allRoles = [currentRole, ...userRoles.filter(r => r !== currentRole)]
  const uniqueRoles = [...new Set(allRoles)]

  const pillBg = style?.color?.startsWith("rgba(255")
    ? "rgba(255,255,255,0.12)"
    : "rgba(100,116,139,0.1)"
  const pillBorder = style?.color?.startsWith("rgba(255")
    ? "rgba(255,255,255,0.25)"
    : "rgba(100,116,139,0.2)"
  const pillBgHover = style?.color?.startsWith("rgba(255")
    ? "rgba(255,255,255,0.22)"
    : "rgba(100,116,139,0.18)"

  if (uniqueRoles.length <= 1) {
    return <span style={style}>{LABELS[currentRole] || currentRole}</span>
  }

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          ...style,
          background: pillBg,
          border: `1px solid ${pillBorder}`,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "3px 10px",
          borderRadius: 100,
          lineHeight: 1.4,
          transition: "background 0.2s",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = pillBgHover }}
        onMouseLeave={e => { e.currentTarget.style.background = pillBg }}
      >
        {LABELS[currentRole] || currentRole}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "none" }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 999,
            background: "white",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
            minWidth: 150,
            padding: 6,
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "4px 10px 6px", fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Switch role
          </div>
          {uniqueRoles.map(r => {
            const target = getRoleDashboard(r)
            if (target === "/login") return null
            return (
              <button
                key={r}
                onClick={() => {
                  if (r === currentRole) {
                    setOpen(false)
                    return
                  }
                  onRoleSwitch?.(r)
                  router.push(target)
                  setOpen(false)
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  padding: "8px 10px",
                  textAlign: "left",
                  background: r === currentRole ? "#f0f7ff" : "transparent",
                  color: r === currentRole ? "#0070f3" : "#0f172a",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 13,
                  borderRadius: 6,
                  fontWeight: r === currentRole ? 600 : 400,
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => { if (r !== currentRole) e.currentTarget.style.background = "#f8fafc" }}
                onMouseLeave={e => { if (r !== currentRole) e.currentTarget.style.background = "transparent" }}
              >
                <span>{LABELS[r] || r}</span>
                {r === currentRole && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0070f3" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
