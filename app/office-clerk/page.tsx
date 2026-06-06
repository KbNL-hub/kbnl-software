"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import OfficeClerkPanel from "@/components/OfficeClerkPanel"

type Clerk = { clerk_id: string; full_name: string; office_name: string }

export default function OfficeClerkDashboard() {
  const router = useRouter()
  const [clerk, setClerk] = useState<Clerk | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.push("/login")
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push("/login"); return }

    // Verify role
    const { data: profile } = await supabase
      .from("Profiles").select("role").eq("user_id", session.user.id).single()
    if (profile?.role !== "OfficeClerk") { router.push("/login"); return }

    // Fetch clerk profile
    const { data: clerkData } = await supabase
      .from("office_clerks")
      .select("clerk_id, full_name, office_name")
      .eq("clerk_id", session.user.id)
      .single()

    if (!clerkData) { router.push("/login"); return }
    setClerk(clerkData)
    setLoading(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push("/login")
  }

  if (loading || !clerk) {
    return (
      <div style={{ minHeight: "100vh", background: "#f9f9f9", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Arial" }}>
        <p style={{ color: "#888" }}>Loading dashboard...</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f9f9f9", fontFamily: "Arial, sans-serif" }}>
      {/* Header */}
      <header style={{
        background: "#1a1a2e", color: "white", padding: "16px 40px",
        display: "flex", justifyContent: "space-between", alignItems: "center"
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>KbNL Office Expenses</h2>
          <p style={{ margin: "2px 0 0", color: "#aaa", fontSize: 13 }}>
            Welcome, <strong>{clerk.full_name}</strong> ({clerk.office_name} Office Clerk)
          </p>
        </div>
        <button
          onClick={handleLogout}
          style={{ padding: "8px 20px", background: "rgba(255, 68, 68,0.05)", color: "#ff4444", border: "1px solid #ff4444", borderRadius: 6, cursor: "pointer", fontSize: 14 }}
        >
          Logout
        </button>
      </header>

      {/* Reusable Expenses Panel */}
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "40px 20px" }}>
        <OfficeClerkPanel 
          clerkId={clerk.clerk_id} 
          officeName={clerk.office_name} 
          fullName={clerk.full_name} 
        />
      </div>
    </div>
  )
}
