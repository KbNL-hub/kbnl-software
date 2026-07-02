"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Icon } from "@iconify/react"
import dynamic from "next/dynamic"
import { supabase } from "@/lib/supabase"
import { apiMutate } from "@/lib/api-mutation"
import RoleSwitcher from "@/components/RoleSwitcher"
import { useBreakpoint } from "@/app/hooks/useBreakpoint"
import { toTitleCase } from "@/lib/title-case"

const SECTION_IMPORTS = {
  trips: () => import("@/components/broker/BrokerActiveTrips"),
  stops: () => import("@/components/broker/MyStops"),
  payments: () => import("@/components/broker/CustomerPayments"),
  credits: () => import("@/components/broker/BrokerCreditsView"),
  expenses: () => import("@/components/CashOfficerPanel"),
} as const

type SectionKey = keyof typeof SECTION_IMPORTS

const SECTION_COMPONENTS: Partial<Record<SectionKey, React.ComponentType<any>>> = {}
for (const key of Object.keys(SECTION_IMPORTS) as SectionKey[]) {
  SECTION_COMPONENTS[key] = dynamic(SECTION_IMPORTS[key])
}

const BASE_NAV_ITEMS = [
  { label: "Active Trips",        key: "trips",    icon: "mdi:truck-fast" },
  { label: "My Stops",            key: "stops",    icon: "mdi:truck-delivery" },
  { label: "Customer Payments",   key: "payments", icon: "mdi:cash-register" },
  { label: "My Credits",          key: "credits",  icon: "mdi:credit-card" },
]

type Props = {
  userProfile: {
    user_id: string
    role: string
    full_name: string
    profile_picture_url?: string
  }
}

const fontSize = {
  xs: 12, sm: 13, base: 14, md: 15, lg: 16, xl: 20, "2xl": 24, "3xl": 28
}

export default function BrokerPanel({ userProfile }: Props) {
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"
  const isTablet = bp === "tablet"
  const isNarrow = isMobile || isTablet

  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [active, setActive] = useState("")
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const bannerRef = useRef<HTMLDivElement>(null)
  const [bannerHeight, setBannerHeight] = useState(64)

  // Measure actual banner height for mobile drawer offset
  useEffect(() => {
    const el = bannerRef.current
    if (!el) return
    const update = () => setBannerHeight(el.offsetHeight)
    const ro = new ResizeObserver(update)
    ro.observe(el)
    update()
    return () => ro.disconnect()
  }, [])

  // Dual-role state
  const [isDualRole, setIsDualRole] = useState(false)
  const [clerkOfficeName, setClerkOfficeName] = useState("")

  // Profile picture state
  const [profilePicUrl, setProfilePicUrl] = useState<string | undefined>(userProfile.profile_picture_url)
  const [showPictureModal, setShowPictureModal] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [picturePreview, setPicturePreview] = useState<string | null>(null)
  const [pictureLoading, setPictureLoading] = useState(false)
  const [pictureError, setPictureError] = useState("")

  useEffect(() => {
    if (!isNarrow) setDrawerOpen(false)
  }, [isNarrow])

  useEffect(() => {
    ;(async () => {
      const { data: clerkRecord } = await supabase
        .from("cash_officers").select("office_name")
        .eq("clerk_id", userProfile.user_id).eq("status", "Active").single()
      if (clerkRecord) {
        setIsDualRole(true)
        setClerkOfficeName(clerkRecord.office_name)
      }
    })()
  }, [userProfile.user_id])

  function handleAvatarClick() {
    setPictureError("")
    setPicturePreview(null)
    setSelectedFile(null)
    setShowPictureModal(true)
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) { setPictureError("Please select an image file"); return }
    if (file.size > 1024 * 1024) { setPictureError("Image must be less than 1MB"); return }
    setSelectedFile(file)
    setPictureError("")
    const reader = new FileReader()
    reader.onload = (event) => setPicturePreview(event.target?.result as string)
    reader.readAsDataURL(file)
  }

  async function handleUploadPicture() {
    if (!selectedFile) { setPictureError("Please select an image"); return }
    setPictureLoading(true)
    setPictureError("")
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setPictureError("Session expired"); setPictureLoading(false); return }
      const fileExt = selectedFile.name.split(".").pop()
      const fileName = `${userProfile.user_id}-${Date.now()}.${fileExt}`
      const filePath = `${userProfile.user_id}/${fileName}`

      const { error: uploadError } = await supabase.storage.from("profile-pictures").upload(filePath, selectedFile, { upsert: false })
      if (uploadError) { setPictureError("Upload failed"); setPictureLoading(false); return }
      const { data: { publicUrl } } = supabase.storage.from("profile-pictures").getPublicUrl(filePath)

      const { error: updateError } = await apiMutate("admin", { action: "update", table: "Brokers", data: { profile_picture_url: publicUrl }, filters: { broker_id: userProfile.user_id } })
      if (updateError) {
        await supabase.storage.from("profile-pictures").remove([filePath])
        setPictureError("Failed to save profile")
        setPictureLoading(false)
        return
      }

      if (profilePicUrl) {
        const oldPath = profilePicUrl.split("/").slice(-2).join("/")
        await supabase.storage.from("profile-pictures").remove([oldPath])
      }

      setProfilePicUrl(publicUrl)
      setPictureLoading(false)
      setShowPictureModal(false)
      setSelectedFile(null)
      setPicturePreview(null)
    } catch (err) {
      setPictureError("Something went wrong")
      setPictureLoading(false)
    }
  }

  function navigate(key: string) {
    setActive(key)
    SECTION_IMPORTS[key as SectionKey]?.()
    if (isNarrow) setDrawerOpen(false)
    window.history.pushState(null, '', `${window.location.pathname}?section=${key}`)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push("/login")
  }

  const NAV_ITEMS = useMemo(() => {
    if (isDualRole) {
      return [
        ...BASE_NAV_ITEMS,
        { label: "Cash Expenses", key: "expenses", icon: "mdi:cash-multiple" },
      ]
    }
    return BASE_NAV_ITEMS
  }, [isDualRole])

  // Sync initial section from URL and preload its chunk
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const section = params.get('section')
    const validKeys = NAV_ITEMS.map(n => n.key)
    if (section && validKeys.includes(section)) {
      setActive(section)
      SECTION_IMPORTS[section as SectionKey]?.()
    }
  }, [NAV_ITEMS])

  // Handle browser back/forward between sections
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search)
      const section = params.get('section')
      const validKeys = NAV_ITEMS.map(n => n.key)
      setActive(section && validKeys.includes(section) ? section : "")
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [NAV_ITEMS])

  const activeLabel = NAV_ITEMS.find(n => n.key === active)?.label ?? "Broker Panel"

  function handleToggleSidebar() {
    if (isNarrow) {
      setDrawerOpen(true)
    } else {
      setSidebarOpen(!sidebarOpen)
    }
  }

  function renderContent() {
    const Component = active ? SECTION_COMPONENTS[active as SectionKey] : undefined
    if (Component) {
      if (active === "expenses") {
        return <Component clerkId={userProfile.user_id} officeName={clerkOfficeName} fullName={userProfile.full_name} />
      }
      return <Component />
    }
    return (
      <div>
        <h1 style={{ marginBottom: 8, fontSize: isMobile ? 22 : 28, color: "#171717" }}>Welcome, {toTitleCase(userProfile.full_name)}</h1>
        <p style={{ color: "#888", fontSize: 15 }}>Select a section from the {isNarrow ? "menu" : "sidebar"}.</p>
      </div>
    )
  }

  function NavItem({ item, showLabel }: { item: typeof NAV_ITEMS[0]; showLabel: boolean }) {
    const isActive = active === item.key

    return (
      <button
        onClick={() => navigate(item.key)}
        title={!showLabel ? item.label : undefined}
        style={{
          background: isActive ? "rgba(255,255,255,0.12)" : "transparent",
          color: isActive ? "#fff" : "#aaa",
          border: "none",
          textAlign: "left",
          padding: showLabel ? "11px 16px" : "11px 0",
          cursor: "pointer",
          fontSize: 14,
          display: "flex",
          alignItems: "center",
          gap: showLabel ? 12 : 0,
          width: "100%",
          whiteSpace: "nowrap",
          overflow: "hidden",
          minHeight: 44,
          transition: "all 0.2s ease",
          borderRadius: showLabel ? "8px" : "0px",
          marginLeft: showLabel ? "8px" : "0px",
          marginRight: showLabel ? "8px" : "0px",
          justifyContent: showLabel ? "flex-start" : "center",
          position: "relative",
        }}
        onMouseEnter={(e) => {
          if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"
          if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = "#ccc"
        }}
        onMouseLeave={(e) => {
          if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "transparent"
          if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = "#aaa"
        }}
      >
        <span style={{ position: "relative", flexShrink: 0, display: "flex", alignItems: "center" }}>
          <Icon icon={item.icon} width={18} height={18} />
        </span>

        {showLabel && (
          <span style={{ flex: 1, fontSize: 14, fontWeight: isActive ? 600 : 500 }}>{item.label}</span>
        )}
      </button>
    )
  }

  const modalOverlay: React.CSSProperties = {
    position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)",
    backdropFilter: "blur(4px)",
    display: "flex", alignItems: isMobile ? "flex-end" : "center",
    justifyContent: "center", zIndex: 100, padding: isMobile ? 0 : 24
  }

  const modalBox: React.CSSProperties = {
    background: "white",
    borderRadius: isMobile ? "20px 20px 0 0" : 12,
    padding: isMobile ? "28px 20px" : 32,
    width: "100%",
    maxWidth: 480,
    maxHeight: "90vh",
    overflowY: "auto",
    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)"
  }

  return (
    <>
      <style>{`
        ::-webkit-scrollbar { width: 10px; height: 10px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, 0.2); border-radius: 5px; border: 2px solid transparent; background-clip: padding-box; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(0, 0, 0, 0.35); background-clip: padding-box; }
        * { scrollbar-width: thin; scrollbar-color: rgba(0, 0, 0, 0.2) transparent; }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", fontFamily: "'Inter', sans-serif", background: "#f5f5f7", height: "100dvh", overflow: "hidden" }}>

        {/* ══ PROFILE BANNER ══ */}
        <div ref={bannerRef} style={{
          background: "linear-gradient(135deg, #0f0f1e 0%, #1a1a2e 100%)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          padding: isMobile ? "12px 16px" : "16px 32px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          flexShrink: 0,
        }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", gap: isMobile ? 12 : 16, justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 12 : 16 }}>
              <div
                onClick={handleAvatarClick}
                style={{
                  width: isMobile ? 40 : 48,
                  height: isMobile ? 40 : 48,
                  borderRadius: "50%",
                  background: profilePicUrl ? "transparent" : "rgba(255,255,255,0.15)",
                  border: "2px solid rgba(255,255,255,0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  cursor: "pointer",
                  overflow: "hidden",
                  transition: "all 0.2s",
                  position: "relative",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#fff"; e.currentTarget.style.transform = "scale(1.05)" }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)"; e.currentTarget.style.transform = "scale(1)" }}
              >
                {profilePicUrl ? (
                  <img src={profilePicUrl} alt={userProfile.full_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ fontSize: isMobile ? 18 : 20, fontWeight: 700, color: "#fff" }}>
                    {userProfile.full_name.charAt(0).toUpperCase()}
                  </span>
                )}
                <div style={{ position: "absolute", inset: 0, background: "rgba(0, 0, 0, 0.4)", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0, transition: "opacity 0.2s" }} onMouseEnter={e => e.currentTarget.style.opacity = "1"} onMouseLeave={e => e.currentTarget.style.opacity = "0"}>
                  <Icon icon="mdi:camera" width={16} color="white" />
                </div>
              </div>
              <div>
                <h1 style={{ margin: 0, fontSize: isMobile ? 15 : 18, fontWeight: 700, color: "#fff" }}>
                  {userProfile.full_name}
                </h1>
                <RoleSwitcher currentRole={userProfile.role} style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.7)" }} />
              </div>
            </div>
            {isNarrow && (
              <button
                onClick={() => setDrawerOpen(true)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "rgba(255,255,255,0.6)",
                  cursor: "pointer",
                  padding: "8px",
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  transition: "all 0.2s",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "#fff" }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.6)" }}
              >
                <Icon icon="mdi:menu" width={22} />
              </button>
            )}
          </div>
        </div>

        {/* ══ BODY: SIDEBAR + CONTENT ══ */}
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>

          {/* ══ DESKTOP SIDEBAR ══ */}
          {!isNarrow && (
            <div style={{
              width: sidebarOpen ? 260 : 70,
              height: "100%",
              minHeight: 0,
              background: "linear-gradient(135deg, #0f0f1e 0%, #1a1a2e 100%)",
              color: "white",
              display: "flex",
              flexDirection: "column",
              transition: "width 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              flexShrink: 0,
              borderRight: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "2px 0 12px rgba(0,0,0,0.1)",
              overflowY: "hidden",
            }}>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", padding: "20px 16px", gap: 12, flexShrink: 0 }}>
                <button
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  style={{
                    background: "rgba(255,255,255,0.1)",
                    border: "none",
                    color: "#aaa",
                    cursor: "pointer",
                    padding: "8px",
                    borderRadius: "8px",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.15)";
                    (e.currentTarget as HTMLButtonElement).style.color = "#fff"
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.1)";
                    (e.currentTarget as HTMLButtonElement).style.color = "#aaa"
                  }}
                >
                  <Icon icon={sidebarOpen ? "mdi:chevron-left" : "mdi:chevron-right"} width={20} />
                </button>
                {sidebarOpen && (
                  <h2 style={{ margin: 0, fontSize: 16, color: "#fff", whiteSpace: "nowrap", fontWeight: "700", letterSpacing: "-0.3px" }}>
                    Broker Panel
                  </h2>
                )}
              </div>

              {/* Nav items */}
              <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", paddingBottom: 16 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingLeft: sidebarOpen ? 8 : 0 }}>
                  {NAV_ITEMS.map(item => (
                    <NavItem key={item.key} item={item} showLabel={sidebarOpen} />
                  ))}
                </div>
              </div>

              {/* Logout button */}
              <div style={{ padding: "12px 8px 20px", borderTop: "1px solid rgba(255,255,255,0.1)", flexShrink: 0 }}>
                <button
                  onClick={handleLogout}
                  style={{
                    width: "100%",
                    padding: "11px 0",
                    background: "rgba(255, 85, 85, 0.2)",
                    color: "#ff5555",
                    border: "1.5px solid rgba(255, 85, 85, 0.3)",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontWeight: "600",
                    fontSize: 13,
                    minHeight: 44,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(255, 85, 85, 0.3)";
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255, 85, 85, 0.5)"
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(255, 85, 85, 0.2)";
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255, 85, 85, 0.3)"
                  }}
                >
                  <Icon icon="mdi:logout" width={16} />
                  {sidebarOpen && "Logout"}
                </button>
              </div>
            </div>
          )}

          {/* ══ MAIN CONTENT ══ */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>

            {/* Mobile drawer overlay */}
            {isNarrow && drawerOpen && (
              <div
                onClick={() => setDrawerOpen(false)}
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(0,0,0,0.6)",
                  zIndex: 50,
                }}
              />
            )}

            {/* Mobile drawer */}
            {isNarrow && (
              <div style={{
                position: "fixed",
                top: bannerHeight,
                left: 0,
                width: drawerOpen ? "85%" : "0%",
                maxWidth: 300,
                height: `calc(100dvh - ${bannerHeight}px)`,
                background: "linear-gradient(135deg, #0f0f1e 0%, #1a1a2e 100%)",
                color: "white",
                display: "flex",
                flexDirection: "column",
                zIndex: 60,
                transition: "width 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                boxShadow: drawerOpen ? "2px 0 12px rgba(0,0,0,0.2)" : "none",
                overflow: "hidden",
              }}>
                <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "8px 8px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {NAV_ITEMS.map(item => (
                      <NavItem key={item.key} item={item} showLabel={true} />
                    ))}
                  </div>
                </div>

                {/* Logout button in drawer */}
                <div style={{ padding: "16px 12px 24px", borderTop: "1px solid rgba(255,255,255,0.1)", flexShrink: 0 }}>
                  <button
                    onClick={handleLogout}
                    style={{
                      width: "100%",
                      padding: "12px 0",
                      background: "rgba(255, 85, 85, 0.2)",
                      color: "#ff5555",
                      border: "1.5px solid rgba(255, 85, 85, 0.3)",
                      borderRadius: 8,
                      cursor: "pointer",
                      fontWeight: "600",
                      fontSize: 14,
                      minHeight: 48,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = "rgba(255, 85, 85, 0.3)";
                      (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255, 85, 85, 0.5)"
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = "rgba(255, 85, 85, 0.2)";
                      (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255, 85, 85, 0.3)"
                    }}
                  >
                    <Icon icon="mdi:logout" width={18} />
                    Logout
                  </button>
                </div>
              </div>
            )}

            {/* Content area */}
            <div style={{ flex: 1, padding: isNarrow ? "20px 16px 40px" : "48px", overflow: "auto" }}>
              {renderContent()}
            </div>
          </div>
        </div>
      </div>

      {/* Profile Picture Upload Modal */}
      {showPictureModal && (
        <div onClick={() => { setShowPictureModal(false); setSelectedFile(null); setPicturePreview(null); setPictureError("") }} style={modalOverlay}>
          <div onClick={e => e.stopPropagation()} style={modalBox}>
            <h3 style={{ margin: "0 0 6px 0", fontSize: fontSize.xl, fontWeight: 700, color: "#0f172a" }}>Update Profile Picture</h3>
            <p style={{ margin: "0 0 20px 0", fontSize: fontSize.sm, color: "#64748b" }}>PNG, JPG up to 1MB</p>

            {picturePreview ? (
              <div style={{ marginBottom: 20 }}>
                <p style={{ margin: "0 0 8px 0", fontSize: fontSize.sm, fontWeight: 600, color: "#0f172a" }}>Preview</p>
                <img src={picturePreview} alt="Preview" style={{ width: "100%", height: 200, objectFit: "cover", borderRadius: 12, border: "2px solid #e2e8f0" }} />
              </div>
            ) : (
              <div onClick={() => fileInputRef.current?.click()} style={{ border: "2px dashed #0070f3", borderRadius: 12, padding: "32px 16px", cursor: "pointer", background: "#f0f7ff", transition: "all 0.2s", marginBottom: 20, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }} onMouseEnter={e => { e.currentTarget.style.background = "#e0efff"; e.currentTarget.style.borderColor = "#0055d4" }} onMouseLeave={e => { e.currentTarget.style.background = "#f0f7ff"; e.currentTarget.style.borderColor = "#0070f3" }}>
                <Icon icon="mdi:cloud-upload" width={40} height={40} color="#0070f3" style={{ marginBottom: 8 }} />
                <p style={{ margin: "0 0 4px 0", fontSize: fontSize.base, fontWeight: 700, color: "#0070f3" }}>Click to upload</p>
                <p style={{ margin: 0, fontSize: fontSize.sm, color: "#64748b" }}>or drag and drop</p>
              </div>
            )}

            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} style={{ display: "none" }} />

            {pictureError && <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 16, color: "#b91c1c", fontSize: fontSize.sm, fontWeight: 600 }}>{pictureError}</div>}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => { setShowPictureModal(false); setSelectedFile(null); setPicturePreview(null); setPictureError("") }} style={{ padding: "12px 16px", background: "white", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: fontSize.md, minHeight: 44 }}>
                Cancel
              </button>
              <button onClick={handleUploadPicture} disabled={pictureLoading || !selectedFile} style={{ padding: "12px 16px", background: selectedFile ? "#0070f3" : "#bfdbfe", color: "white", border: "none", borderRadius: 8, cursor: selectedFile && !pictureLoading ? "pointer" : "not-allowed", fontWeight: 700, fontSize: fontSize.md, minHeight: 44, opacity: pictureLoading ? 0.7 : 1, transition: "opacity 0.2s" }}>
                {pictureLoading ? "Uploading..." : "Upload"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}