"use client"

import ModernInput from "@/components/ModernInput";
import SplashScreen from "@/components/SplashScreen";
import NotificationPermissionPrompt from "@/components/NotificationPermissionPrompt";
import { useState, useRef, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { Icon } from "@iconify/react"
import { useRouter } from "next/navigation"
import { getRoleDashboard } from "@/lib/permissions"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showSplash, setShowSplash] = useState(true)
  const [mode, setMode] = useState<"login" | "forgot-step1" | "forgot-step2">("login")
  const [forgotEmail, setForgotEmail] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmNewPassword, setConfirmNewPassword] = useState("")
  const [forgotMessage, setForgotMessage] = useState("")
  const [forgotLoading, setForgotLoading] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const router = useRouter()

  useEffect(() => {
    supabase.auth.signOut()
  }, [])

  const passwordInputRef = useRef<HTMLInputElement | null>(null)

  async function handleLogin() {
    if (loading) return
    if (!email || !password) return setMessage("Enter email and password")
    setLoading(true)
    setMessage("")

    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      setLoading(false)
      setMessage("Connection timed out. Please check your network and try again.")
    }, 15000)

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    clearTimeout(timer)
    if (timedOut) return

    if (error) {
      setMessage(error.message)
      setLoading(false)
      return
    }

    function isNetworkError(err: any) {
      const msg = err?.message?.toLowerCase() || ""
      return msg.includes("failed to fetch") ||
        msg.includes("networkerror") ||
        msg.includes("network error") ||
        msg.includes("timeout") ||
        msg.includes("fetch")
    }

    function queryWithTimeout<T>(promise: PromiseLike<{ data: T | null; error: any }>, ms = 10000): Promise<{ data: T | null; error: any }> {
      return Promise.race([
        promise,
        new Promise<{ data: null; error: { message: string } }>((resolve) =>
          setTimeout(() => resolve({ data: null, error: { message: "timeout" } }), ms)
        ),
      ])
    }

    // Fetch role from Profiles
    const profileResult = await queryWithTimeout<{ role: string; must_change_password: boolean; is_deactivated: boolean }>(
      supabase
        .from("Profiles")
        .select("role, must_change_password, is_deactivated")
        .eq("user_id", data.user.id)
        .single()
    )

    const profile = profileResult.data
    const profileError = profileResult.error

    if (profileError || !profile) {
      if (isNetworkError(profileError)) {
        setLoading(false)
        setMessage("Network error. Please check your connection and try again.")
        return
      }
      await supabase.auth.signOut()
      setMessage("Profile not found. Contact admin.")
      setLoading(false)
      return
    }

    if (profile.is_deactivated) {
      await supabase.auth.signOut()
      setMessage("Your account has been deactivated. Contact admin.")
      setLoading(false)
      return
    }

    if (profile.role === "Driver") {
      const driverResult = await queryWithTimeout<{ status: string }>(
        supabase
          .from("Drivers")
          .select("status")
          .eq("driver_id", data.user.id)
          .single()
      )

      const driverError = driverResult.error
      const driverData = driverResult.data

      if (driverError || !driverData) {
        if (isNetworkError(driverError)) {
          setLoading(false)
          setMessage("Network error. Please check your connection and try again.")
          return
        }
        await supabase.auth.signOut()
        setMessage("Unable to verify driver status. Contact admin.")
        setLoading(false)
        return
      }

      if (driverData?.status === "Suspended") {
        await supabase.auth.signOut()
        setMessage("Your account has been suspended. Contact admin.")
        setLoading(false)
        return
      }
    }

    // Check if user must change password
    if (profile.must_change_password) {
      setLoading(false)
      router.push("/auth/set-password")
      return
    }

    setLoading(false)

    // Route based on role
    const dashboard = getRoleDashboard(profile.role)
    if (dashboard === "/login") {
      await supabase.auth.signOut()
      setMessage("Unknown role. Contact admin.")
    } else {
      router.push(dashboard)
    }
  }

  function switchToForgotStep1() {
    setForgotEmail(email)
    setForgotMessage("")
    setNewPassword("")
    setConfirmNewPassword("")
    setMode("forgot-step1")
  }

  function switchToLogin() {
    setMode("login")
    setForgotMessage("")
    setForgotLoading(false)
  }

  function handleForgotStep1() {
    if (!forgotEmail) return setForgotMessage("Enter your email address")
    setMode("forgot-step2")
    setForgotMessage("")
  }

  async function handleForgotStep2() {
    if (forgotLoading) return
    if (!newPassword) return setForgotMessage("Enter a new password")
    if (newPassword.length < 6) return setForgotMessage("Password must be at least 6 characters")
    if (newPassword !== confirmNewPassword) return setForgotMessage("Passwords do not match")
    setForgotLoading(true)
    setForgotMessage("")

    try {
      const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail, newPassword }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setForgotMessage(data?.error || "Failed to reset password")
        return
      }
      setForgotMessage("Password reset successfully! You can now log in with your new password.")
      setTimeout(() => switchToLogin(), 2500)
    } catch {
      setForgotMessage("Network error. Please try again.")
    } finally {
      setForgotLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (e.currentTarget === passwordInputRef.current) {
        handleLogin()
      } else {
        passwordInputRef.current?.focus()
      }
    }
  }

  if (showSplash) {
    return <SplashScreen onComplete={() => setShowSplash(false)} logoSrc="/logo.png" companyName="KbNL" />
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
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        .login-container {
          animation: containerSlideIn 0.6s ease-out;
        }

        .logo-section {
          animation: fadeIn 0.6s ease-out;
        }

        .form-section {
          animation: fadeIn 0.6s ease-out 0.1s backwards;
          animation-fill-mode: forwards;
        }

        .input-group {
          animation: fadeIn 0.6s ease-out 0.2s backwards;
          animation-fill-mode: forwards;
        }

        .signin-button {
          animation: fadeIn 0.6s ease-out 0.3s backwards;
          animation-fill-mode: forwards;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .signin-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 12px 24px rgba(0, 112, 243, 0.24);
        }

        .signin-button:active:not(:disabled) {
          transform: translateY(0);
        }

        .message-container {
          animation: fadeIn 0.3s ease-out;
        }

        /* Hide browser native password reveal */
        input[type="password"]::-ms-reveal,
        input[type="password"]::-ms-clear {
          display: none;
        }
        input[type="password"]::-webkit-credentials-auto-fill-button {
          display: none !important;
        }

        .password-wrapper {
          position: relative;
        }

        .password-toggle {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #94a3b8;
          transition: color 0.2s ease;
          z-index: 1;
        }

        .password-toggle:hover {
          color: #171717;
        }
      `}</style>

      <div className="login-container" style={{
        width: "100%",
        maxWidth: 420,
        background: "white",
        borderRadius: 20,
        padding: "48px 40px",
        boxShadow: "0 20px 60px rgba(0, 0, 0, 0.08)",
        border: "1px solid rgba(0, 0, 0, 0.06)",
      }}>
        {/* Logo Section */}
        <div className="logo-section" style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginBottom: 40,
        }}>
          <div style={{
            width: 80,
            height: 80,
            borderRadius: 16,
            background: "linear-gradient(135deg, rgba(0, 112, 243, 0.1) 0%, rgba(0, 112, 243, 0.05) 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 20,
            border: "1px solid rgba(0, 112, 243, 0.15)",
          }}>
            <img
              src="/logo.png"
              alt="KbNL Logo"
              style={{
                width: "60%",
                height: "60%",
                objectFit: "contain",
              }}
              onError={(e) => {
                // Fallback: show initials if logo fails
                (e.currentTarget as HTMLImageElement).style.display = "none"
              }}
            />
          </div>
          <h1 style={{
            fontSize: 28,
            fontWeight: 700,
            color: "#171717",
            margin: "0 0 8px 0",
            letterSpacing: "-0.5px",
          }}>
            K<span style={{ fontSize: 16 }}>b</span>NL
          </h1>
          <p style={{
            fontSize: 14,
            color: "#888",
            margin: 0,
            fontWeight: 500,
            letterSpacing: "0.5px",
            textTransform: "uppercase",
            textAlign: "center",
          }}>
            Operations Management System
          </p>
        </div>

        {/* Form Section */}
        <div className="form-section">
          {mode === "login" ? (
            <>
              <div className="input-group" style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#171717", marginBottom: 8, letterSpacing: "0.3px", textTransform: "uppercase" }}>
                  Email Address
                </label>
                <ModernInput
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={handleKeyDown}
                  style={{ width: "100%", padding: "12px 16px", boxSizing: "border-box", fontSize: 16, border: "1.5px solid #e5e5e5", borderRadius: 10, background: "#f9f9f9", transition: "all 0.2s ease" }}
                  data-modern-input="migrated"
                />
              </div>

              <div className="input-group" style={{ marginBottom: 28 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#171717", marginBottom: 8, letterSpacing: "0.3px", textTransform: "uppercase" }}>
                  Password
                </label>
                <div className="password-wrapper">
                  <ModernInput
                    type={showPassword ? "text" : "password"}
                    ref={passwordInputRef}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={handleKeyDown}
                    style={{ width: "100%", padding: "12px 48px 12px 16px", boxSizing: "border-box", fontSize: 16, border: "1.5px solid #e5e5e5", borderRadius: 10, background: "#f9f9f9", transition: "all 0.2s ease" }}
                    data-modern-input="migrated"
                  />
                  <button type="button" className="password-toggle" onClick={() => setShowPassword((prev) => !prev)} aria-label={showPassword ? "Hide password" : "Show password"}>
                    <Icon icon={showPassword ? "mdi:eye-off" : "mdi:eye"} width={20} height={20} />
                  </button>
                </div>
              </div>

              <div style={{ textAlign: "right", marginBottom: 24, marginTop: -12 }}>
                <button type="button" onClick={switchToForgotStep1} style={{ background: "none", border: "none", color: "#0070f3", cursor: "pointer", fontSize: 13, fontWeight: 500, padding: 0 }}>
                  Forgot password?
                </button>
              </div>

              <button onClick={handleLogin} disabled={loading} className="signin-button" style={{ width: "100%", padding: 14, background: loading ? "#0070f3" : "#0070f3", color: "white", border: "none", borderRadius: 10, fontSize: 16, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.85 : 1, letterSpacing: "0.3px", position: "relative" }}>
                {loading ? (
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ animation: "spin 1s linear infinite" }}>
                      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                      <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="2" strokeDasharray="16" opacity="0.3" />
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="white" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    Signing in...
                  </span>
                ) : "Sign In"}
              </button>

              {message && (() => {
                const isErrorMsg = message.toLowerCase().includes("suspended") || message.toLowerCase().includes("error") || message.toLowerCase().includes("not found") || message.toLowerCase().includes("unknown") || message.toLowerCase().includes("unable") || message.toLowerCase().includes("timed out") || message.toLowerCase().includes("failed to fetch")
                return (
                  <div className="message-container" style={{ marginTop: 20, padding: 12, background: isErrorMsg ? "rgba(239, 68, 68, 0.08)" : "rgba(34, 197, 94, 0.08)", border: `1.5px solid ${isErrorMsg ? "rgba(239, 68, 68, 0.3)" : "rgba(34, 197, 94, 0.3)"}`, borderRadius: 10, fontSize: 14, color: isErrorMsg ? "#dc2626" : "#16a34a", fontWeight: 500, textAlign: "center", lineHeight: 1.4 }}>
                    {message}
                  </div>
                )
              })()}
            </>
          ) : mode === "forgot-step1" ? (
            <>
              <div className="input-group" style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#171717", marginBottom: 8, letterSpacing: "0.3px", textTransform: "uppercase" }}>
                  Email Address
                </label>
                <ModernInput
                  type="email"
                  placeholder="you@company.com"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  style={{ width: "100%", padding: "12px 16px", boxSizing: "border-box", fontSize: 16, border: "1.5px solid #e5e5e5", borderRadius: 10, background: "#f9f9f9", transition: "all 0.2s ease" }}
                  data-modern-input="migrated"
                />
              </div>

              <p style={{ margin: "0 0 20px", fontSize: 13, color: "#888", lineHeight: 1.5 }}>
                Enter your email to reset your password. If an account exists, you will be able to set a new password.
              </p>

              <button onClick={handleForgotStep1} disabled={forgotLoading} className="signin-button" style={{ width: "100%", padding: 14, background: "#0070f3", color: "white", border: "none", borderRadius: 10, fontSize: 16, fontWeight: 600, cursor: forgotLoading ? "not-allowed" : "pointer", opacity: forgotLoading ? 0.85 : 1, letterSpacing: "0.3px", position: "relative" }}>
                {forgotLoading ? (
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ animation: "spin 1s linear infinite" }}>
                      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                      <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="2" strokeDasharray="16" opacity="0.3" />
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="white" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    Checking...
                  </span>
                ) : "Continue"}
              </button>

              <div style={{ textAlign: "center", marginTop: 20 }}>
                <button type="button" onClick={switchToLogin} style={{ background: "none", border: "none", color: "#0070f3", cursor: "pointer", fontSize: 13, fontWeight: 500, padding: 0 }}>
                  Back to login
                </button>
              </div>

              {forgotMessage && (
                <div className="message-container" style={{ marginTop: 20, padding: 12, background: "rgba(239, 68, 68, 0.08)", border: "1.5px solid rgba(239, 68, 68, 0.3)", borderRadius: 10, fontSize: 14, color: "#dc2626", fontWeight: 500, textAlign: "center", lineHeight: 1.4 }}>
                  {forgotMessage}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="input-group" style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#171717", marginBottom: 8, letterSpacing: "0.3px", textTransform: "uppercase" }}>
                  New Password
                </label>
                <div className="password-wrapper">
                  <ModernInput
                    type={showNewPassword ? "text" : "password"}
                    placeholder="Min 6 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    style={{ width: "100%", padding: "12px 48px 12px 16px", boxSizing: "border-box", fontSize: 16, border: "1.5px solid #e5e5e5", borderRadius: 10, background: "#f9f9f9", transition: "all 0.2s ease" }}
                    data-modern-input="migrated"
                  />
                  <button type="button" className="password-toggle" onClick={() => setShowNewPassword((prev) => !prev)} aria-label={showNewPassword ? "Hide password" : "Show password"}>
                    <Icon icon={showNewPassword ? "mdi:eye-off" : "mdi:eye"} width={20} height={20} />
                  </button>
                </div>
              </div>

              <div className="input-group" style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#171717", marginBottom: 8, letterSpacing: "0.3px", textTransform: "uppercase" }}>
                  Confirm New Password
                </label>
                <div className="password-wrapper">
                  <ModernInput
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Re-enter new password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    style={{ width: "100%", padding: "12px 48px 12px 16px", boxSizing: "border-box", fontSize: 16, border: "1.5px solid #e5e5e5", borderRadius: 10, background: "#f9f9f9", transition: "all 0.2s ease" }}
                    data-modern-input="migrated"
                  />
                  <button type="button" className="password-toggle" onClick={() => setShowConfirmPassword((prev) => !prev)} aria-label={showConfirmPassword ? "Hide password" : "Show password"}>
                    <Icon icon={showConfirmPassword ? "mdi:eye-off" : "mdi:eye"} width={20} height={20} />
                  </button>
                </div>
              </div>

              <button onClick={handleForgotStep2} disabled={forgotLoading} className="signin-button" style={{ width: "100%", padding: 14, background: forgotLoading ? "#0070f3" : "#0070f3", color: "white", border: "none", borderRadius: 10, fontSize: 16, fontWeight: 600, cursor: forgotLoading ? "not-allowed" : "pointer", opacity: forgotLoading ? 0.85 : 1, letterSpacing: "0.3px", position: "relative" }}>
                {forgotLoading ? (
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ animation: "spin 1s linear infinite" }}>
                      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                      <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="2" strokeDasharray="16" opacity="0.3" />
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="white" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    Resetting...
                  </span>
                ) : "Reset Password"}
              </button>

              <div style={{ textAlign: "center", marginTop: 20 }}>
                <button type="button" onClick={switchToLogin} style={{ background: "none", border: "none", color: "#0070f3", cursor: "pointer", fontSize: 13, fontWeight: 500, padding: 0 }}>
                  Back to login
                </button>
              </div>

              {forgotMessage && (() => {
                const isSuccess = forgotMessage.includes("successfully")
                return (
                  <div className="message-container" style={{ marginTop: 20, padding: 12, background: isSuccess ? "rgba(34, 197, 94, 0.08)" : "rgba(239, 68, 68, 0.08)", border: `1.5px solid ${isSuccess ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)"}`, borderRadius: 10, fontSize: 14, color: isSuccess ? "#16a34a" : "#dc2626", fontWeight: 500, textAlign: "center", lineHeight: 1.4 }}>
                    {forgotMessage}
                  </div>
                )
              })()}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          marginTop: 32,
          paddingTop: 24,
          borderTop: "1px solid #e5e5e5",
          textAlign: "center",
          fontSize: 13,
          color: "#999",
          lineHeight: 1.6,
        }}>
          <p style={{ margin: 0 }}>For technical support, contact the admin team</p>
          <p style={{ margin: "4px 0 0 0", fontSize: 12 }}>© 2026 Kpaksbuddy Nigeria Limited</p>
          <p style={{ margin: "4px 0 0 0", fontSize: 12, color: "#0070f3" }}>Developed by: Alderton Burke & Partners</p>
        </div>
      </div>
      <NotificationPermissionPrompt />
    </div>
  );
}