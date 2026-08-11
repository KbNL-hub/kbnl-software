"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Icon } from "@iconify/react"
import RoleSwitcher from "@/components/RoleSwitcher"
import ReportModal from "@/components/ReportModal"
import { FONT_SIZE } from "@/lib/constants"
import { useBreakpoint } from "@/app/hooks/useBreakpoint"
import { requireDashboardRole } from "@/lib/auth-helpers"
import { Role } from "@/lib/roles"

type UserProfile = {
  user_id: string
  full_name: string
}

type SendState = "idle" | "sending" | "success" | "error"

type SingleTestState = "idle" | "testing" | "success" | "error"

type SwStatus = {
  supported: boolean
  registered: boolean
  active: boolean
  controller: boolean
  pushSupported: boolean
  permission: string
  hasSubscription: boolean
  swResponsive: boolean
} | null

function StatusPill({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <span style={{
      fontSize: FONT_SIZE.xs,
      padding: "3px 8px",
      borderRadius: 6,
      fontWeight: 500,
      background: ok ? "#f0fdf4" : "#fef2f2",
      color: ok ? "#16a34a" : "#ef4444",
      border: `1px solid ${ok ? "#bbf7d0" : "#fecaca"}`,
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: ok ? "#16a34a" : "#ef4444" }} />
      {label}
      {detail && detail !== "granted" && detail !== "denied" && `: ${detail}`}
    </span>
  )
}

type SubscriptionDiag = {
  id: string
  endpoint: string
  role: string | null
  isActive: boolean
  updatedAt: string
  status: "valid" | "expired" | "error"
  httpStatus?: number
  error?: string
}

type VapidInfo = {
  configured: boolean
  subject: string | null
  hasPublicKey: boolean
  hasPrivateKey: boolean
}

type DiagnosticsResult = {
  total: number
  valid: number
  expired: number
  errors: number
  cleanedUp: number
  subscriptions: SubscriptionDiag[]
  vapid: VapidInfo
} | null

export default function TestNotificationsPage() {
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"
  const router = useRouter()

  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [sendState, setSendState] = useState<SendState>("idle")
  const [sendResult, setSendResult] = useState<string | null>(null)
  const [showReportModal, setShowReportModal] = useState(false)
  const [subscriptionCount, setSubscriptionCount] = useState<number | null>(null)
  const [diagResult, setDiagResult] = useState<DiagnosticsResult>(null)
  const [diagRunning, setDiagRunning] = useState(false)
  const [swStatus, setSwStatus] = useState<SwStatus>(null)
  const [singleTestState, setSingleTestState] = useState<SingleTestState>("idle")
  const [singleTestResult, setSingleTestResult] = useState<string | null>(null)

  async function init() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push("/login"); return }

    const hasRole = await requireDashboardRole(session.user.id, Role.SuperAdmin)
    if (!hasRole) { router.push("/login"); return }

    const { data: profile } = await supabase
      .from("Profiles")
      .select("full_name")
      .eq("user_id", session.user.id)
      .single()

    setUser({
      user_id: session.user.id,
      full_name: profile?.full_name || "Super Admin",
    })

    const { count } = await supabase
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", session.user.id)
      .eq("is_active", true)

    setSubscriptionCount(count ?? 0)
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => { init() }, [])

  // Check client-side SW status
  useEffect(() => {
    async function checkSw() {
      const status: SwStatus = {
        supported: false,
        registered: false,
        active: false,
        controller: false,
        pushSupported: false,
        permission: "default",
        hasSubscription: false,
        swResponsive: false,
      }

      if (!("serviceWorker" in navigator)) {
        setSwStatus(status)
        return
      }
      status.supported = true
      status.controller = !!navigator.serviceWorker.controller

      if (typeof Notification !== "undefined") {
        status.permission = Notification.permission
        status.pushSupported = "PushManager" in window
      }

      try {
        const reg = await navigator.serviceWorker.ready
        status.registered = true
        status.active = !!reg.active

        if (status.pushSupported) {
          const sub = await reg.pushManager.getSubscription()
          status.hasSubscription = !!sub
        }

        // PING the SW to verify it's responsive
        if (navigator.serviceWorker.controller && reg.active) {
          const pong = await new Promise<boolean>((resolve) => {
            const timeout = setTimeout(() => resolve(false), 2000)
            const handler = (event: MessageEvent) => {
              if (event.data?.type === "PONG") {
                clearTimeout(timeout)
                navigator.serviceWorker.removeEventListener("message", handler)
                resolve(true)
              }
            }
            navigator.serviceWorker.addEventListener("message", handler)
            reg.active!.postMessage({ type: "PING" })
          })
          status.swResponsive = pong
          if (!pong) {
            console.warn("[SW] PING timed out - SW not responding")
          }
        }
      } catch { /* ignore */ }

      setSwStatus(status)
    }
    checkSw()
  }, [])

  async function testSingleSub(subscriptionId: string) {
    setSingleTestState("testing")
    setSingleTestResult(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const res = await fetch("/api/push/debug", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          subscriptionId,
          title: "Single Sub Test",
          body: "Direct test to one subscription",
          url: "/test-notifications",
        }),
      })
      const data = await res.json()

      if (data.success) {
        setSingleTestState("success")
        setSingleTestResult(`Delivered to subscription ${subscriptionId.substring(0, 8)}...`)
      } else {
        setSingleTestState("error")
        setSingleTestResult(`HTTP ${data.httpStatus}: ${data.error || "unknown"}`)
      }
    } catch (err) {
      setSingleTestState("error")
      setSingleTestResult(err instanceof Error ? err.message : "Unknown error")
    }
  }

  async function runDiagnostics() {
    if (!user || diagRunning) return
    setDiagRunning(true)
    setDiagResult(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const res = await fetch(`/api/push/debug?userId=${user.user_id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = await res.json()
      if (res.ok) {
        setDiagResult(data)
        // Update active count after cleanup
        setSubscriptionCount(data.valid)
      }
    } catch (err) {
      console.error("Diagnostics failed:", err)
    } finally {
      setDiagRunning(false)
    }
  }

  async function sendTestNotification() {
    if (!user || sendState === "sending") return

    setSendState("sending")
    setSendResult(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setSendState("error")
        setSendResult("No active session")
        return
      }

      const res = await fetch("/api/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          title: "Test Notification",
          body: "This is a test notification from the debug panel.",
          url: "/test-notifications",
          targetUserId: user.user_id,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setSendState("error")
        setSendResult(data.error || `HTTP ${res.status}`)
        return
      }

      setSendState("success")
      setSendResult(`Sent to ${data.total} subscription(s): ${data.sent} delivered, ${data.failed} failed`)
    } catch (err) {
      setSendState("error")
      setSendResult(err instanceof Error ? err.message : "Unknown error")
    }
  }

  // Reset send state after 4 seconds
  useEffect(() => {
    if (sendState === "success" || sendState === "error") {
      const timer = setTimeout(() => {
        setSendState("idle")
        setSendResult(null)
      }, 4000)
      return () => clearTimeout(timer)
    }
  }, [sendState])

  // Reset single test state after 4 seconds
  useEffect(() => {
    if (singleTestState === "success" || singleTestState === "error") {
      const timer = setTimeout(() => {
        setSingleTestState("idle")
        setSingleTestResult(null)
      }, 4000)
      return () => clearTimeout(timer)
    }
  }, [singleTestState])

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
            <div style={{
              width: isMobile ? 48 : 56, height: isMobile ? 48 : 56, borderRadius: "50%",
              background: "#f0f7ff", border: "2px solid #bfdbfe",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <span style={{ fontSize: isMobile ? 20 : 24, fontWeight: 700, color: "#0070f3" }}>
                {user?.full_name?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: isMobile ? FONT_SIZE.lg : FONT_SIZE.xl, fontWeight: 700, color: "#0070f3" }}>
                {user?.full_name}
              </h1>
              <RoleSwitcher currentRole={Role.SuperAdmin} style={{ margin: "2px 0 0", fontSize: FONT_SIZE.sm, color: "#64748b" }} />
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
      <div style={{ padding: isMobile ? "16px" : "32px", maxWidth: 800, margin: "0 auto" }}>

        {/* Subscription Status Card */}
        <div style={{
          background: "white", borderRadius: 16, border: "1px solid #e2e8f0",
          padding: isMobile ? "20px" : "28px 32px", marginBottom: 24,
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <Icon icon="mdi:bell-outline" width={22} height={22} color="#0070f3" />
            <h2 style={{ margin: 0, fontSize: FONT_SIZE.lg, fontWeight: 700, color: "#0f172a" }}>
              Push Subscription Status
            </h2>
          </div>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
            <div style={{ flex: "1 1 200px", padding: "14px 16px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: FONT_SIZE.sm, color: "#64748b", marginBottom: 4 }}>Active Subscriptions</div>
              <div style={{ fontSize: FONT_SIZE.xl, fontWeight: 700, color: subscriptionCount && subscriptionCount > 0 ? "#16a34a" : "#ef4444" }}>
                {subscriptionCount !== null ? subscriptionCount : "..."}
              </div>
            </div>
            <div style={{ flex: "1 1 200px", padding: "14px 16px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: FONT_SIZE.sm, color: "#64748b", marginBottom: 4 }}>User ID</div>
              <div style={{ fontSize: FONT_SIZE.sm, fontWeight: 600, color: "#0f172a", wordBreak: "break-all", fontFamily: "monospace" }}>
                {user?.user_id}
              </div>
            </div>
          </div>

          {/* Client-Side SW Status */}
          {swStatus && (
            <div style={{ marginBottom: 16, padding: "12px 16px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: FONT_SIZE.sm, fontWeight: 600, color: "#0f172a" }}>Browser Status</span>
                {!swStatus.controller && swStatus.registered && (
                  <button
                    onClick={() => window.location.reload()}
                    style={{
                      padding: "3px 10px",
                      fontSize: FONT_SIZE.xs,
                      fontWeight: 600,
                      background: "#fef2f2",
                      color: "#ef4444",
                      border: "1px solid #fecaca",
                      borderRadius: 4,
                      cursor: "pointer",
                    }}
                  >
                    Reload to fix controller
                  </button>
                )}
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <StatusPill label="SW Support" ok={swStatus.supported} />
                <StatusPill label="Registered" ok={swStatus.registered} />
                <StatusPill label="Active" ok={swStatus.active} />
                <StatusPill label="Controller" ok={swStatus.controller} />
                <StatusPill label="Responsive" ok={swStatus.swResponsive} />
                <StatusPill label="Push API" ok={swStatus.pushSupported} />
                <StatusPill label="Permission" ok={swStatus.permission === "granted"} detail={swStatus.permission} />
                <StatusPill label="Subscribed" ok={swStatus.hasSubscription} />
              </div>
            </div>
          )}

          {/* VAPID Status */}
          {diagResult?.vapid && (
            <div style={{ marginBottom: 16, padding: "12px 16px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: FONT_SIZE.sm, fontWeight: 600, color: "#0f172a", marginBottom: 8 }}>Server VAPID Config</div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <StatusPill label="Configured" ok={diagResult.vapid.configured} />
                <StatusPill label="Public Key" ok={diagResult.vapid.hasPublicKey} />
                <StatusPill label="Private Key" ok={diagResult.vapid.hasPrivateKey} />
                {diagResult.vapid.subject && (
                  <span style={{ fontSize: FONT_SIZE.xs, padding: "3px 8px", borderRadius: 6, background: "rgba(0,112,243,0.08)", color: "#0070f3" }}>
                    {diagResult.vapid.subject}
                  </span>
                )}
              </div>
            </div>
          )}

          <button
            onClick={runDiagnostics}
            disabled={diagRunning}
            style={{
              padding: "10px 20px",
              background: diagRunning ? "#e2e8f0" : "#f0f7ff",
              color: diagRunning ? "#94a3b8" : "#0070f3",
              border: "1.5px solid #bfdbfe",
              borderRadius: 8,
              cursor: diagRunning ? "not-allowed" : "pointer",
              fontSize: FONT_SIZE.sm,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 8,
              transition: "all 0.2s",
            }}
          >
            <Icon
              icon={diagRunning ? "mdi:loading" : "mdi:magnify-scan"}
              width={16}
              style={diagRunning ? { animation: "spin 1s linear infinite" } : {}}
            />
            {diagRunning ? "Checking subscriptions..." : "Run Diagnostics"}
          </button>

          {/* Diagnostics Results */}
          {diagResult && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                {diagResult.valid > 0 && (
                  <span style={{ padding: "4px 10px", borderRadius: 6, fontSize: FONT_SIZE.xs, fontWeight: 600, background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0" }}>
                    {diagResult.valid} valid
                  </span>
                )}
                {diagResult.expired > 0 && (
                  <span style={{ padding: "4px 10px", borderRadius: 6, fontSize: FONT_SIZE.xs, fontWeight: 600, background: "#fef2f2", color: "#ef4444", border: "1px solid #fecaca" }}>
                    {diagResult.expired} expired (cleaned up)
                  </span>
                )}
                {diagResult.errors > 0 && (
                  <span style={{ padding: "4px 10px", borderRadius: 6, fontSize: FONT_SIZE.xs, fontWeight: 600, background: "#fff8e1", color: "#f5a623", border: "1px solid #f8ad5c" }}>
                    {diagResult.errors} errors
                  </span>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {diagResult.subscriptions.filter(s => s.status === "valid").map((sub) => (
                  <div key={sub.id} style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: "1px solid #bbf7d0",
                    background: "#f0fdf4",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <Icon icon="mdi:check-circle" width={14} color="#16a34a" />
                      <span style={{ fontSize: FONT_SIZE.xs, fontWeight: 600, color: "#0f172a", textTransform: "uppercase" }}>
                        {sub.status}
                      </span>
                      {sub.role && (
                        <span style={{ fontSize: FONT_SIZE.xs, padding: "1px 6px", borderRadius: 4, background: "rgba(0,112,243,0.1)", color: "#0070f3", fontWeight: 500 }}>
                          {sub.role}
                        </span>
                      )}
                      <button
                        onClick={() => testSingleSub(sub.id)}
                        disabled={singleTestState === "testing"}
                        style={{
                          marginLeft: "auto",
                          padding: "2px 10px",
                          fontSize: FONT_SIZE.xs,
                          fontWeight: 600,
                          background: "#0070f3",
                          color: "white",
                          border: "none",
                          borderRadius: 4,
                          cursor: singleTestState === "testing" ? "not-allowed" : "pointer",
                        }}
                      >
                        Test
                      </button>
                    </div>
                    <div style={{ fontSize: FONT_SIZE.xs, color: "#64748b", fontFamily: "monospace", wordBreak: "break-all" }}>
                      {sub.endpoint}
                    </div>
                    <div style={{ fontSize: FONT_SIZE.xs, color: "#94a3b8", marginTop: 2 }}>
                      Updated: {new Date(sub.updatedAt).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>

              {diagResult.errors > 0 && (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                  {diagResult.subscriptions.filter(s => s.status === "error").map((sub) => (
                    <div key={sub.id} style={{
                      padding: "10px 14px",
                      borderRadius: 8,
                      border: "1px solid #f8ad5c",
                      background: "#fff8e1",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <Icon icon="mdi:alert" width={14} color="#f5a623" />
                        <span style={{ fontSize: FONT_SIZE.xs, fontWeight: 600, color: "#0f172a", textTransform: "uppercase" }}>error</span>
                        {sub.httpStatus && (
                          <span style={{ fontSize: FONT_SIZE.xs, padding: "1px 6px", borderRadius: 4, background: "rgba(245,166,35,0.15)", color: "#f5a623", fontWeight: 500 }}>
                            HTTP {sub.httpStatus}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: FONT_SIZE.xs, color: "#64748b", fontFamily: "monospace", wordBreak: "break-all" }}>
                        {sub.endpoint}
                      </div>
                      {sub.error && (
                        <div style={{ fontSize: FONT_SIZE.xs, color: "#92400e", marginTop: 2 }}>
                          {sub.error}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Single Test Result */}
          {singleTestResult && (
            <div style={{
              marginTop: 12,
              padding: "10px 14px",
              borderRadius: 8,
              fontSize: FONT_SIZE.sm,
              fontWeight: 500,
              background: singleTestState === "success" ? "#f0fdf4" : "#fef2f2",
              color: singleTestState === "success" ? "#16a34a" : "#ef4444",
              border: `1px solid ${singleTestState === "success" ? "#bbf7d0" : "#fecaca"}`,
            }}>
              {singleTestResult}
            </div>
          )}
        </div>

        {/* Test Notification CTA Card */}
        <div style={{
          background: "white", borderRadius: 16, border: "1px solid #e2e8f0",
          padding: isMobile ? "20px" : "28px 32px", marginBottom: 24,
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <Icon icon="mdi:send-check-outline" width={22} height={22} color="#0070f3" />
            <h2 style={{ margin: 0, fontSize: FONT_SIZE.lg, fontWeight: 700, color: "#0f172a" }}>
              Send Test Notification
            </h2>
          </div>

          <p style={{ margin: "0 0 20px", fontSize: FONT_SIZE.base, color: "#64748b", lineHeight: 1.6 }}>
            Click the button below to send a push notification to your device.
            This tests the full notification pipeline from API to browser.
          </p>

          <button
            onClick={sendTestNotification}
            disabled={sendState === "sending"}
            style={{
              padding: "14px 32px",
              background: sendState === "sending"
                ? "#94a3b8"
                : sendState === "success"
                  ? "#16a34a"
                  : sendState === "error"
                    ? "#ef4444"
                    : "#0070f3",
              color: "white",
              border: "none",
              borderRadius: 10,
              cursor: sendState === "sending" ? "not-allowed" : "pointer",
              fontSize: FONT_SIZE.md,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 10,
              transition: "all 0.2s",
              minHeight: 52,
              width: isMobile ? "100%" : "auto",
              justifyContent: "center",
            }}
          >
            <Icon
              icon={
                sendState === "sending"
                  ? "mdi:loading"
                  : sendState === "success"
                    ? "mdi:check-circle"
                    : sendState === "error"
                      ? "mdi:close-circle"
                      : "mdi:bell-ring-outline"
              }
              width={20}
              height={20}
              style={sendState === "sending" ? { animation: "spin 1s linear infinite" } : {}}
            />
            {sendState === "sending"
              ? "Sending..."
              : sendState === "success"
                ? "Delivered!"
                : sendState === "error"
                  ? "Failed"
                  : "Send Test Notification"
            }
          </button>

          {/* Result message */}
          {sendResult && (
            <div style={{
              marginTop: 16,
              padding: "12px 16px",
              borderRadius: 8,
              fontSize: FONT_SIZE.sm,
              fontWeight: 500,
              background: sendState === "success" ? "#f0fdf4" : "#fef2f2",
              color: sendState === "success" ? "#16a34a" : "#ef4444",
              border: `1px solid ${sendState === "success" ? "#bbf7d0" : "#fecaca"}`,
            }}>
              {sendResult}
            </div>
          )}
        </div>

        {/* Info Card */}
        <div style={{
          background: "#f0f7ff", borderRadius: 16, border: "1px solid #bfdbfe",
          padding: isMobile ? "16px" : "20px 24px",
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <Icon icon="mdi:information-outline" width={20} height={20} color="#0070f3" style={{ marginTop: 2, flexShrink: 0 }} />
            <div style={{ fontSize: FONT_SIZE.sm, color: "#1e40af", lineHeight: 1.6 }}>
              <strong>How this works:</strong> The button sends a request to <code style={{ background: "rgba(0,112,243,0.1)", padding: "1px 5px", borderRadius: 4 }}>/api/push/send</code> with your user ID as the target. The server queries all active push subscriptions for your user and delivers the notification via the Web Push API. If you don&apos;t receive the notification, check that your browser has granted notification permission and that the service worker is registered.
            </div>
          </div>
        </div>
      </div>

      <ReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        userId={user?.user_id || ""}
        userRole={Role.SuperAdmin}
      />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
