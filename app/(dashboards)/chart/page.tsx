"use client"

import { useState, useEffect, useSyncExternalStore } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Icon } from "@iconify/react"
import Chart from "@/components/admin/Chart"
import ErrorBoundary from "@/components/ErrorBoundary"
import { Role } from "@/lib/roles"
import { FONT_SIZE } from "@/lib/constants"
import { PermissionProvider } from "@/lib/PermissionContext"

type UserProfile = {
  user_id: string
  role: string
  roles?: string[]
  full_name: string
  profile_picture_url?: string
}

export const dynamic = "force-dynamic"

const ALLOWED_ROLES: string[] = [Role.Admin, Role.SuperAdmin, Role.Broker, Role.DeskOfficer, Role.Supervisor]

export default function ChartPage() {
  const router = useRouter()
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )
  const [loading, setLoading] = useState(true)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function initUser() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { router.push("/login"); return }

        const { data: profile, error: profileError } = await supabase
          .from("Profiles")
          .select("user_id, role, full_name, profile_picture_url")
          .eq("user_id", session.user.id)
          .single()

        if (profileError || !profile) {
          setError("Failed to load user profile")
          setLoading(false)
          return
        }

        const { data: userRoles } = await supabase
          .from("UserRoles")
          .select("role")
          .eq("user_id", session.user.id)

        let roles = userRoles?.map(r => r.role) || []
        if (roles.length === 0) roles = [profile.role]

        const hasAccess = roles.some(r => ALLOWED_ROLES.includes(r))
        if (!hasAccess) {
          setError("You do not have permission to access this page")
          setLoading(false)
          return
        }

        const primaryRole = roles.find(r => ["Admin", "SuperAdmin"].includes(r)) ?? roles[0]
        setUserProfile({ ...profile, role: primaryRole, roles })
        setLoading(false)
      } catch (err) {
        console.error("Init error:", err)
        setError("An error occurred while loading your profile")
        setLoading(false)
      }
    }
    if (mounted) initUser()
  }, [mounted, router])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push("/login")
  }

  if (!mounted) {
    return <div style={{ display: "flex", minHeight: "100vh", background: "#f8fafc" }} />
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#f8fafc", fontFamily: "'Inter', sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid #e2e8f0", borderTopColor: "#0070f3", animation: "spin 1s linear infinite", margin: "0 auto 12px" }} />
          <p style={{ color: "#64748b", fontSize: FONT_SIZE.sm }}>Loading…</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (error || !userProfile) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#f8fafc", fontFamily: "'Inter', sans-serif", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 400 }}>
          <Icon icon="mdi:lock-alert" width={48} color="#ef4444" style={{ marginBottom: 16, display: "block" }} />
          <h1 style={{ margin: "0 0 8px", fontSize: FONT_SIZE.xl, fontWeight: 700, color: "#0f172a" }}>Access Denied</h1>
          <p style={{ margin: "0 0 24px", fontSize: FONT_SIZE.base, color: "#64748b" }}>
            {error || "You do not have permission to access this page."}
          </p>
          <button onClick={handleLogout} style={{ padding: "10px 20px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.sm }}>
            Go to Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      <PermissionProvider userId={userProfile.user_id} defaultRole={userProfile.role}>
        <ErrorBoundary label="Chart">
          <Chart userProfile={userProfile} />
        </ErrorBoundary>
      </PermissionProvider>
    </div>
  )
}
