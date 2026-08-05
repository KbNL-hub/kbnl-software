"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Icon } from "@iconify/react"
import AdminPanel from "@/components/admin/AdminPanel"
import BrokerPanel from "@/components/broker/BrokerPanel"
import ErrorBoundary from "@/components/ErrorBoundary"
import { Role } from "@/lib/roles"
import { FONT_SIZE } from "@/lib/constants"

type UserProfile = {
  user_id: string
  role: string
  full_name: string
  profile_picture_url?: string
}

export const dynamic = "force-dynamic"

export default function AdminDashboard() {
  const router = useRouter()

  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const urlRole = searchParams.get("role")

  useEffect(() => { setMounted(true) }, [])

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

        // Check UserRoles for admin dashboard access
        const { data: userRoles } = await supabase
          .from("UserRoles")
          .select("role")
          .eq("user_id", session.user.id)

        let roles = userRoles?.map(r => r.role) || []
        // Fall back to Profiles.role for legacy users without UserRoles entries
        if (roles.length === 0) {
          roles = [profile.role]
        }
        const dashboardRoles = [Role.SuperAdmin, Role.Supervisor, Role.CashAuthorizer, Role.TruckAdmin, Role.DeskOfficer, Role.ATCOfficer, Role.Admin, Role.Broker]
        let dashboardRole: Role | undefined = dashboardRoles.find(r => roles.includes(r))
        const params = new URLSearchParams(window.location.search)
        const requestedRole = params.get("role") as Role | null
        if (requestedRole && roles.includes(requestedRole)) {
          dashboardRole = requestedRole
        }
        const hasAdminAccess = Boolean(dashboardRole)

        if (!hasAdminAccess) {
          setError("You do not have permission to access this dashboard")
          setLoading(false)
          return
        }

        let profilePictureUrl: string | undefined = profile.profile_picture_url
        if (dashboardRole === Role.Broker) {
          const { data: brokerData } = await supabase
            .from("Brokers")
            .select("profile_picture_url")
            .eq("broker_id", session.user.id)
            .single()
          if (brokerData?.profile_picture_url) profilePictureUrl = brokerData.profile_picture_url
        }

        setUserProfile({ ...profile, role: dashboardRole!, profile_picture_url: profilePictureUrl })
        setLoading(false)
      } catch (err) {
        console.error("Init error:", err)
        setError("An error occurred while loading your profile")
        setLoading(false)
      }
    }
    if (mounted) initUser()
  }, [mounted, router])

  useEffect(() => {
    if (urlRole) {
      setUserProfile(prev => prev && prev.role !== urlRole ? { ...prev, role: urlRole } : prev)
    }
  }, [urlRole])

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
            {error || "You do not have permission to access this dashboard."}
          </p>
          <button onClick={handleLogout} style={{ padding: "10px 20px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.sm }}>
            Go to Login
          </button>
        </div>
      </div>
    )
  }

  const renderDashboard = () => {
    const role = urlRole || userProfile.role
    switch (role) {
      case Role.Admin:
      case Role.SuperAdmin:
      case Role.Supervisor:
      case Role.CashAuthorizer:
      case Role.DeskOfficer:
      case Role.ATCOfficer:
        return (
          <ErrorBoundary label="Admin Panel">
            <AdminPanel userProfile={userProfile} initialRole={role} />
          </ErrorBoundary>
        )
      case Role.Broker:
        return (
          <ErrorBoundary label="Broker Panel">
            <BrokerPanel userProfile={userProfile} />
          </ErrorBoundary>
        )
      default:
        return <p style={{ color: "#888", fontSize: FONT_SIZE.base }}>Unknown user role: {role}</p>
    }
  }

  return <div style={{ minHeight: "100vh" }}>{renderDashboard()}</div>
}