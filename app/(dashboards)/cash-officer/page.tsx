"use client"

import Image from "next/image"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Icon } from "@iconify/react"
import RoleSwitcher from "@/components/RoleSwitcher"
import CashOfficerPanel from "@/components/CashOfficerPanel"
import ReportModal from "@/components/ReportModal"
import ProfilePictureUpload from "@/components/ProfilePictureUpload"
import { FONT_SIZE } from "@/lib/constants"
import { useBreakpoint } from "@/app/hooks/useBreakpoint"
import { requireDashboardRole } from "@/lib/auth-helpers"
import { Role } from "@/lib/roles"

type Clerk = { clerk_id: string; full_name: string; office_name: string; profile_picture_url?: string }

export default function CashOfficerDashboard() {
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"
  const router = useRouter()

  const [clerk, setClerk] = useState<Clerk | null>(null)
  const [loading, setLoading] = useState(true)
  const [showPictureModal, setShowPictureModal] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [avatarHover, setAvatarHover] = useState(false)

  async function init() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push("/login"); return }

    const hasRole = await requireDashboardRole(session.user.id, Role.CashOfficer)
    if (!hasRole) { router.push("/login"); return }

    const { data: profile } = await supabase
      .from("Profiles").select("full_name").eq("user_id", session.user.id).single()

    if (profile) {
      const { data: clerkData } = await supabase
        .from("cash_officers")
        .select("clerk_id, full_name, office_name, profile_picture_url")
        .eq("clerk_id", session.user.id)
        .single()

      if (clerkData) {
        setClerk(clerkData)
      } else {
        setClerk({ clerk_id: session.user.id, full_name: profile.full_name, office_name: "" })
      }
    }

    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { init() }, [])

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "'Inter', sans-serif" }}>
      <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid #e2e8f0", borderTopColor: "#0070f3", animation: "spin 1s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "'Inter', sans-serif" }}>

      {/* Profile Banner */}
      <div style={{ background: "white", borderBottom: "1px solid #e2e8f0", padding: isMobile ? "16px" : "24px 32px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", gap: isMobile ? 12 : 16, justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 12 : 16, flex: 1 }}>
            <div
              onClick={() => setShowPictureModal(true)}
              onMouseEnter={() => setAvatarHover(true)}
              onMouseLeave={() => setAvatarHover(false)}
              style={{
                width: isMobile ? 48 : 56,
                height: isMobile ? 48 : 56,
                borderRadius: "50%",
                background: clerk?.profile_picture_url ? "transparent" : "#f0f7ff",
                border: "2px solid #bfdbfe",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                cursor: "pointer",
                position: "relative",
                overflow: "hidden",
                transition: "all 0.2s",
              }}
            >
              {clerk?.profile_picture_url ? (
                <Image
                  src={clerk.profile_picture_url}
                  alt={clerk.full_name}
                  width={48}
                  height={48}
                  unoptimized
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <span style={{ fontSize: isMobile ? 20 : 24, fontWeight: 700, color: "#0070f3" }}>
                  {clerk?.full_name?.charAt(0).toUpperCase()}
                </span>
              )}
              <div
                style={{
                  position: "absolute", inset: 0, background: "rgba(0, 0, 0, 0.4)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  opacity: avatarHover ? 1 : 0, transition: "opacity 0.2s",
                }}
              >
                <Icon icon="mdi:camera" width={20} height={20} color="white" />
              </div>
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: isMobile ? FONT_SIZE.lg : FONT_SIZE.xl, fontWeight: 700, color: "#0070f3" }}>
                {clerk?.full_name || ""}
              </h1>
              <RoleSwitcher currentRole={Role.CashOfficer} style={{ margin: "2px 0 0", fontSize: FONT_SIZE.sm, color: "#64748b" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setShowReportModal(true)}
              style={{ padding: "8px 14px", background: "#fff8e1", color: "#f5a623", border: "1.5px solid #f8ad5c", borderRadius: 8, cursor: "pointer", fontSize: FONT_SIZE.sm, minHeight: 40, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s", whiteSpace: "nowrap" }}
            >
              <Icon icon="mdi:alert-circle-outline" width={16} />
              {!isMobile && "Report"}
            </button>
            <button
              onClick={async () => { await supabase.auth.signOut(); router.push("/login") }}
              style={{ padding: "8px 16px", background: "rgba(239, 68, 68, 0.05)", color: "#ef4444", border: "1.5px solid #fecaca", borderRadius: 6, cursor: "pointer", fontSize: FONT_SIZE.sm, fontWeight: 600, transition: "all 0.2s", minHeight: 40, whiteSpace: "nowrap" }}
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ padding: isMobile ? "16px" : "32px", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ marginBottom: 40 }}>
          <CashOfficerPanel 
            clerkId={clerk?.clerk_id || ""} 
            officeName={clerk?.office_name || ""} 
            fullName={clerk?.full_name || ""} 
          />
        </div>
      </div>

      <ProfilePictureUpload
        isOpen={showPictureModal}
        onClose={() => setShowPictureModal(false)}
        userId={clerk?.clerk_id || ""}
        table="cash_officers"
        idField="clerk_id"
        currentUrl={clerk?.profile_picture_url}
        onSuccess={(url) => setClerk(prev => prev ? { ...prev, profile_picture_url: url } : prev)}
      />

      <ReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        userId={clerk?.clerk_id || ""}
        userRole={Role.CashOfficer}
      />
    </div>
  )
}
