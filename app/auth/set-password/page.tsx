"use client"

import ModernInput from "@/components/ModernInput"
import { useState, useEffect, useRef } from "react"
import { supabase } from "@/lib/supabase"
import { apiMutate } from "@/lib/api-mutation"
import { useRouter } from "next/navigation"
import { getRoleDashboard } from "@/lib/permissions"
import { getUserRoles } from "@/lib/auth-helpers"

export default function SetPasswordPage() {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [ready, setReady] = useState(false)
  const [isError, setIsError] = useState(false)
  const router = useRouter()
  const confirmRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace("/login")
        return
      }

      // Check must_change_password flag
      const { data: profile } = await supabase
        .from("Profiles")
        .select("must_change_password")
        .eq("user_id", session.user.id)
        .single()

      if (!profile?.must_change_password) {
        // Already set — redirect to dashboard
        const roles = await getUserRoles(session.user.id)
        const primaryRole = profile ? await supabase
          .from("Profiles")
          .select("role")
          .eq("user_id", session.user.id)
          .single()
          .then(r => r.data?.role) : null

        router.replace(primaryRole ? getRoleDashboard(primaryRole) : "/login")
        return
      }

      setReady(true)
    })
  }, [router])

  async function handleSetPassword() {
    if (!password) { setMessage("Enter a password"); setIsError(true); return }
    if (password.length < 6) { setMessage("Password must be at least 6 characters"); setIsError(true); return }
    if (password !== confirm) { setMessage("Passwords do not match"); setIsError(true); return }

    setSubmitting(true)
    setMessage("")

    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setMessage(error.message)
      setIsError(true)
      setSubmitting(false)
      return
    }

    // Clear must_change_password
    const { data: { user } } = await supabase.auth.getUser()
    const userId = user?.id
    if (userId) {
      await apiMutate("admin", { action: "update", table: "Profiles", data: { must_change_password: false }, filters: { user_id: userId } })

      // Activate role-specific status
      const { data: profile } = await supabase
        .from("Profiles")
        .select("role")
        .eq("user_id", userId)
        .single()

      const role = profile?.role
      if (role === "Driver") {
        await apiMutate("admin", { action: "update", table: "Drivers", data: { status: "Active" }, filters: { driver_id: userId } })
      } else if (role === "StationManager") {
        await apiMutate("admin", { action: "update", table: "station_managers", data: { status: "Active" }, filters: { manager_id: userId } })
      } else if (role === "TruckOfficer") {
        await apiMutate("admin", { action: "update", table: "truck_officers", data: { status: "Active" }, filters: { manager_id: userId } })
      } else if (role === "TruckAdmin") {
        await apiMutate("admin", { action: "update", table: "truck_admins", data: { status: "Active" }, filters: { admin_id: userId } })
      } else if (role === "StoreOfficer") {
        await apiMutate("admin", { action: "update", table: "store_officers", data: { status: "Active" }, filters: { officer_id: userId } })
      } else if (role === "CashOfficer") {
        await apiMutate("admin", { action: "update", table: "cash_officers", data: { status: "Active" }, filters: { clerk_id: userId } })
      } else if (role === "DeskOfficer") {
        await apiMutate("admin", { action: "update", table: "desk_officers", data: { status: "Active" }, filters: { officer_id: userId } })
      } else if (role === "ATCOfficer") {
        await apiMutate("admin", { action: "update", table: "atc_officers", data: { status: "Active" }, filters: { officer_id: userId } })
      }

      // Redirect to dashboard
      const dashboard = role ? getRoleDashboard(role) : "/login"
      setMessage("Password set! Redirecting...")
      setIsError(false)
      setTimeout(() => router.push(dashboard), 1500)
    } else {
      router.push("/login")
    }
    setSubmitting(false)
  }

  if (!ready) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #ffffff 0%, #f5f7fa 100%)",
        fontFamily: "'Segoe UI', 'Helvetica Neue', sans-serif",
      }}>
        <p style={{ color: "#888", fontSize: 15 }}>Checking...</p>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(135deg, #ffffff 0%, #f5f7fa 100%)",
      padding: "20px",
      fontFamily: "'Segoe UI', 'Helvetica Neue', sans-serif",
    }}>
      <style>{`
        @keyframes containerSlideIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .sp-container { animation: containerSlideIn 0.6s ease-out; }
        .sp-fade { animation: fadeIn 0.6s ease-out; }
      `}</style>

      <div className="sp-container" style={{
        width: "100%",
        maxWidth: 420,
        background: "white",
        borderRadius: 20,
        padding: "48px 40px",
        boxShadow: "0 20px 60px rgba(0, 0, 0, 0.08)",
        border: "1px solid rgba(0, 0, 0, 0.06)",
      }}>
        <div className="sp-fade" style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginBottom: 32,
        }}>
          <h1 style={{
            fontSize: 24,
            fontWeight: 700,
            color: "#171717",
            margin: "0 0 8px 0",
          }}>
            Set Your Password
          </h1>
          <p style={{
            fontSize: 14,
            color: "#888",
            margin: 0,
            textAlign: "center",
            lineHeight: 1.5,
          }}>
            This is your first login. Choose a new password.
          </p>
        </div>

        <div className="sp-fade">
          <div style={{ marginBottom: 16 }}>
            <label style={{
              display: "block",
              fontSize: 13,
              fontWeight: 600,
              color: "#171717",
              marginBottom: 8,
              letterSpacing: "0.3px",
              textTransform: "uppercase",
            }}>
              New Password
            </label>
            <ModernInput
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setMessage(""); setIsError(false) }}
              onKeyDown={(e) => { if (e.key === "Enter") confirmRef.current?.focus() }}
              style={{
                width: "100%",
                padding: "12px 16px",
                boxSizing: "border-box",
                fontSize: 16,
                border: "1.5px solid #e5e5e5",
                borderRadius: 10,
                background: "#f9f9f9",
                transition: "all 0.2s ease",
              }}
              data-modern-input="migrated"
            />
          </div>

          <div style={{ marginBottom: 28 }}>
            <label style={{
              display: "block",
              fontSize: 13,
              fontWeight: 600,
              color: "#171717",
              marginBottom: 8,
              letterSpacing: "0.3px",
              textTransform: "uppercase",
            }}>
              Confirm Password
            </label>
            <ModernInput
              ref={confirmRef}
              type="password"
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setMessage(""); setIsError(false) }}
              onKeyDown={(e) => { if (e.key === "Enter") handleSetPassword() }}
              style={{
                width: "100%",
                padding: "12px 16px",
                boxSizing: "border-box",
                fontSize: 16,
                border: "1.5px solid #e5e5e5",
                borderRadius: 10,
                background: "#f9f9f9",
                transition: "all 0.2s ease",
              }}
              data-modern-input="migrated"
            />
          </div>

          <button
            onClick={handleSetPassword}
            disabled={submitting}
            style={{
              width: "100%",
              padding: 14,
              background: "#0070f3",
              color: "white",
              border: "none",
              borderRadius: 10,
              fontSize: 16,
              fontWeight: 600,
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.85 : 1,
              letterSpacing: "0.3px",
            }}
          >
            {submitting ? "Saving..." : "Set Password"}
          </button>

          {message && (
            <div style={{
              marginTop: 20,
              padding: 12,
              background: isError ? "rgba(239, 68, 68, 0.08)" : "rgba(34, 197, 94, 0.08)",
              border: `1.5px solid ${isError ? "rgba(239, 68, 68, 0.3)" : "rgba(34, 197, 94, 0.3)"}`,
              borderRadius: 10,
              fontSize: 14,
              color: isError ? "#dc2626" : "#16a34a",
              fontWeight: 500,
              textAlign: "center",
              lineHeight: 1.4,
            }}>
              {message}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
