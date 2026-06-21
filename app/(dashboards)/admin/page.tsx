"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Icon } from "@iconify/react"
import AdminPanel from "@/components/admin/AdminPanel"
import BrokerPanel from "@/components/broker/BrokerPanel"

type UserProfile = {
  user_id: string
  role: string
  full_name: string
  profile_picture_url?: string
}

const fontSize = {
  xs: 12, sm: 13, base: 14, md: 15, lg: 16, xl: 20, "2xl": 24, "3xl": 28
}

export const dynamic = "force-dynamic"

export default function AdminDashboard() {
  const router = useRouter()

  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    async function initUser() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { router.push("/login"); return }

        const { data: profile, error: profileError } = await supabase
          .from("Profiles")
          .select("user_id, role, full_name")
          .eq("user_id", session.user.id)
          .single()

        if (profileError || !profile) {
          setError("Failed to load user profile")
          setLoading(false)
          return
        }

        const authorizedRoles = ["Admin", "Broker", "TruckAdmin"]
        if (!authorizedRoles.includes(profile.role)) {
          setError("You do not have permission to access this dashboard")
          setLoading(false)
          return
        }

        let profilePictureUrl: string | undefined
        if (profile.role === "Broker") {
          const { data: brokerData } = await supabase
            .from("brokers")
            .select("profile_picture_url")
            .eq("broker_id", session.user.id)
            .single()
          if (brokerData?.profile_picture_url) profilePictureUrl = brokerData.profile_picture_url
        }

        setUserProfile({ ...profile, profile_picture_url: profilePictureUrl })
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.push("/login")
    })
    return () => subscription.unsubscribe()
  }, [router])

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
          <p style={{ color: "#64748b", fontSize: fontSize.sm }}>Loading…</p>
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
          <h1 style={{ margin: "0 0 8px", fontSize: fontSize.xl, fontWeight: 700, color: "#0f172a" }}>Access Denied</h1>
          <p style={{ margin: "0 0 24px", fontSize: fontSize.base, color: "#64748b" }}>
            {error || "You do not have permission to access this dashboard."}
          </p>
          <button onClick={handleLogout} style={{ padding: "10px 20px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: fontSize.sm }}>
            Go to Login
          </button>
        </div>
      </div>
    )
  }

  const renderDashboard = () => {
    switch (userProfile.role) {
      case "Admin":
      case "TruckAdmin":
        return <AdminPanel userProfile={userProfile} />
      case "Broker":
        return <BrokerPanel userProfile={userProfile} />
      default:
        return <p style={{ color: "#888", fontSize: fontSize.base }}>Unknown user role: {userProfile.role}</p>
    }
  }

  return <div style={{ minHeight: "100vh" }}>{renderDashboard()}</div>
}