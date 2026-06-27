"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Icon } from "@iconify/react"
import RoleSwitcher from "@/components/RoleSwitcher"
import CashOfficerPanel from "@/components/CashOfficerPanel"
import ReportModal from "@/components/ReportModal"

type Clerk = { clerk_id: string; full_name: string; office_name: string; profile_picture_url?: string }

function useBreakpoint() {
  const [isDesktop, setIsDesktop] = useState(false)
  const [isMobile, setIsMobile] = useState(true)

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640)
      setIsDesktop(window.innerWidth >= 640)
    }

    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  return { isMobile, isDesktop }
}

const fontSize = {
  xs: 12,
  sm: 13,
  base: 14,
  md: 15,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 28
}

export default function CashOfficerDashboard() {
  const { isMobile, isDesktop } = useBreakpoint()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [clerk, setClerk] = useState<Clerk | null>(null)
  const [loading, setLoading] = useState(true)

  // Profile picture upload states
  const [showPictureModal, setShowPictureModal] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [picturePreview, setPicturePreview] = useState<string | null>(null)
  const [pictureLoading, setPictureLoading] = useState(false)
  const [pictureError, setPictureError] = useState("")

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

  // Profile picture upload handlers
  function handleAvatarClick() {
    setPictureError("")
    setPicturePreview(null)
    setSelectedFile(null)
    setShowPictureModal(true)
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setPictureError("Please select an image file")
      return
    }

    // Validate file size (max 1MB)
    if (file.size > 1 * 1024 * 1024) {
      setPictureError("Image must be less than 1MB")
      return
    }

    setSelectedFile(file)
    setPictureError("")

    // Create preview
    const reader = new FileReader()
    reader.onload = (event) => {
      setPicturePreview(event.target?.result as string)
    }
    reader.readAsDataURL(file)
  }

  async function handleUploadPicture() {
    if (!selectedFile || !clerk) {
      setPictureError("Please select an image")
      return
    }

    setPictureLoading(true)
    setPictureError("")

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setPictureError("Session expired"); setPictureLoading(false); return }

      const fileExt = selectedFile.name.split(".").pop()
      const fileName = `${clerk.clerk_id}-${Date.now()}.${fileExt}`
      const filePath = `${clerk.clerk_id}/${fileName}`

      // Delete old picture if exists
      if (clerk.profile_picture_url) {
        const oldPath = clerk.profile_picture_url.split("/").slice(-2).join("/")
        await supabase.storage.from("profile-pictures").remove([oldPath])
      }

      // Upload new picture
      const { error: uploadError } = await supabase.storage
        .from("profile-pictures")
        .upload(filePath, selectedFile, { upsert: false })

      if (uploadError) { setPictureError("Upload failed"); setPictureLoading(false); return }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("profile-pictures")
        .getPublicUrl(filePath)

      // Update clerk profile
      const { error: updateError } = await supabase
        .from("cash_officers")
        .update({ profile_picture_url: publicUrl })
        .eq("clerk_id", clerk.clerk_id)

      if (updateError) { setPictureError("Failed to save profile"); setPictureLoading(false); return }

      // Update local state
      setClerk({ ...clerk, profile_picture_url: publicUrl })

      // Close modal
      setPictureLoading(false)
      setShowPictureModal(false)
      setSelectedFile(null)
      setPicturePreview(null)
    } catch (err) {
      setPictureError("Something went wrong")
      setPictureLoading(false)
    }
  }

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
              onClick={handleAvatarClick}
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
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = "#0070f3"
                e.currentTarget.style.transform = "scale(1.05)"
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = "#bfdbfe"
                e.currentTarget.style.transform = "scale(1)"
              }}
            >
              {clerk?.profile_picture_url ? (
                <img
                  src={clerk.profile_picture_url}
                  alt={clerk.full_name}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              ) : (
                <span style={{ fontSize: isMobile ? 20 : 24, fontWeight: 700, color: "#0070f3" }}>
                  {clerk?.full_name.charAt(0).toUpperCase()}
                </span>
              )}
              {/* Camera overlay hint */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(0, 0, 0, 0.4)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: 0,
                  transition: "opacity 0.2s",
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = "1"}
                onMouseLeave={e => e.currentTarget.style.opacity = "0"}
              >
                <Icon icon="mdi:camera" width={20} height={20} color="white" />
              </div>
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: isMobile ? fontSize.lg : fontSize.xl, fontWeight: 700, color: "#0070f3" }}>
                {clerk?.full_name}
              </h1>
              <RoleSwitcher currentRole="CashOfficer" style={{ margin: "2px 0 0", fontSize: fontSize.sm, color: "#64748b" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setShowReportModal(true)}
              style={{ padding: "8px 14px", background: "#fff8e1", color: "#f5a623", border: "1.5px solid #f8ad5c", borderRadius: 8, cursor: "pointer", fontSize: fontSize.sm, minHeight: 40, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s", whiteSpace: "nowrap" }}
              onMouseEnter={e => { e.currentTarget.style.background = "#fff0e1"; e.currentTarget.style.borderColor = "#f8ad5c" }}
              onMouseLeave={e => { e.currentTarget.style.background = "#fff8e1"; e.currentTarget.style.borderColor = "#f8ad5c" }}
            >
              <Icon icon="mdi:alert-circle-outline" width={16} />
              {!isMobile && "Report"}
            </button>
            <button
              onClick={async () => { await supabase.auth.signOut(); router.push("/login") }}
              style={{ padding: "8px 16px", background: "rgba(239, 68, 68, 0.05)", color: "#ef4444", border: "1.5px solid #fecaca", borderRadius: 6, cursor: "pointer", fontSize: fontSize.sm, fontWeight: 600, transition: "all 0.2s", minHeight: 40, whiteSpace: "nowrap" }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)"; e.currentTarget.style.borderColor = "#fca5a5" }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(239, 68, 68, 0.05)"; e.currentTarget.style.borderColor = "#fecaca" }}
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

      {/* Profile Picture Upload Modal */}
      {showPictureModal && (
        <div onClick={() => { setShowPictureModal(false); setSelectedFile(null); setPicturePreview(null); setPictureError("") }} style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 100, padding: isMobile ? 0 : 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: isMobile ? "20px 20px 0 0" : 12, padding: isMobile ? "28px 20px" : 32, width: "100%", maxWidth: 420, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)" }}>
            <h3 style={{ margin: "0 0 6px 0", fontSize: fontSize.xl, fontWeight: 700, color: "#0f172a" }}>Update Profile Picture</h3>
            <p style={{ margin: "0 0 20px 0", fontSize: fontSize.sm, color: "#64748b" }}>Click to upload or drag and drop. PNG, JPG up to 1MB.</p>

            {/* Preview or Upload Area */}
            {picturePreview ? (
              <div style={{ marginBottom: 20 }}>
                <p style={{ margin: "0 0 8px 0", fontSize: fontSize.sm, fontWeight: 600, color: "#0f172a" }}>Preview</p>
                <img
                  src={picturePreview}
                  alt="Preview"
                  style={{
                    width: "100%",
                    height: 200,
                    objectFit: "cover",
                    borderRadius: 12,
                    border: "2px solid #e2e8f0",
                  }}
                />
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: "1.5px dashed #0070f3",
                  borderRadius: 12,
                  padding: "32px 16px",
                  cursor: "pointer",
                  background: "#f0f7ff",
                  transition: "all 0.2s",
                  marginBottom: 20,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = "#e0efff"
                  e.currentTarget.style.borderColor = "#0055d4"
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = "#f0f7ff"
                  e.currentTarget.style.borderColor = "#0070f3"
                }}
              >
                <Icon icon="mdi:cloud-upload" width={40} height={40} color="#0070f3" style={{ marginBottom: 8 }} />
                <p style={{ margin: "0 0 4px 0", fontSize: fontSize.base, fontWeight: 600, color: "#0070f3" }}>
                  Click to upload
                </p>
                <p style={{ margin: 0, fontSize: fontSize.sm, color: "#64748b" }}>
                  or drag and drop
                </p>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              style={{ display: "none" }}
            />

            {pictureError && (
              <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 16, color: "#b91c1c", fontSize: fontSize.sm }}>
                {pictureError}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button
                onClick={() => { setShowPictureModal(false); setSelectedFile(null); setPicturePreview(null); setPictureError("") }}
                style={{ padding: "12px 16px", background: "white", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: fontSize.md, minHeight: 44 }}
              >
                Cancel
              </button>
              <button
                onClick={handleUploadPicture}
                disabled={pictureLoading || !selectedFile}
                style={{
                  padding: "12px 16px",
                  background: selectedFile ? "#0070f3" : "#bfdbfe",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  cursor: selectedFile && !pictureLoading ? "pointer" : "not-allowed",
                  fontWeight: 600,
                  fontSize: fontSize.md,
                  minHeight: 44,
                  opacity: pictureLoading ? 0.7 : 1,
                }}
              >
                {pictureLoading ? "Uploading..." : "Upload"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        userId={clerk?.clerk_id || ""}
        userRole="CashOfficer"
      />
    </div>
  )
}