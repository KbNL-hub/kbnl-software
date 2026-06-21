"use client"

import ModernInput from "@/components/ModernInput";
import SplashScreen from "@/components/SplashScreen";
import { useState, useRef, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const [showSplash, setShowSplash] = useState(true)
  const router = useRouter()

  useEffect(() => {
    supabase.auth.signOut()
  }, [])

  const passwordInputRef = useRef<HTMLInputElement | null>(null)

  async function handleLogin() {
    if (!email || !password) return setMessage("Enter email and password")
    setLoading(true)
    setMessage("")

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setMessage(error.message)
      setLoading(false)
      return
    }

    // Fetch role from Profiles
    const { data: profile, error: profileError } = await supabase
      .from("Profiles")
      .select("role")
      .eq("user_id", data.user.id)
      .single()

    if (profileError || !profile) {
      setMessage("Profile not found. Contact admin.")
      setLoading(false)
      return
    }

    if (profile.role === "Driver") {
      const { data: driverData } = await supabase
        .from("Drivers")
        .select("status")
        .eq("driver_id", data.user.id)
        .single()

      if (driverData?.status === "Suspended") {
        await supabase.auth.signOut()
        setMessage("Your account has been suspended. Contact admin.")
        setLoading(false)
        return
      }
    }

    setLoading(false)

    // Route based on role
    if (profile.role === "Admin") {
      router.push("/admin")
    } else if (profile.role === "Driver") {
      router.push("/driver")
    } else if (profile.role === "Broker") {
      router.push("/admin")
    } else if (profile.role === "StationManager") {
      router.push("/station-manager")
    } else if (profile.role === "TruckOfficer") {
      router.push("/truck-officer")
    } else if (profile.role === "TruckAdmin") {
      router.push("/truck-admin")
    } else if (profile.role === "StoreOfficer") {
      router.push("/store-officer")
    } else if (profile.role === "CashOfficer") {
      router.push("/cash-officer")
    } else {
      setMessage("Unknown role. Contact admin.")
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
          <div className="input-group" style={{
            marginBottom: 16,
          }}>
            <label style={{
              display: "block",
              fontSize: 13,
              fontWeight: 600,
              color: "#171717",
              marginBottom: 8,
              letterSpacing: "0.3px",
              textTransform: "uppercase",
            }}>
              Email Address
            </label>
            <ModernInput
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
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

          <div className="input-group" style={{
            marginBottom: 28,
          }}>
            <label style={{
              display: "block",
              fontSize: 13,
              fontWeight: 600,
              color: "#171717",
              marginBottom: 8,
              letterSpacing: "0.3px",
              textTransform: "uppercase",
            }}>
              Password
            </label>
            <ModernInput
              type="password"
              ref={passwordInputRef}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
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
            onClick={handleLogin}
            disabled={loading}
            className="signin-button"
            style={{
              width: "100%",
              padding: 14,
              background: loading ? "#0070f3" : "#0070f3",
              color: "white",
              border: "none",
              borderRadius: 10,
              fontSize: 16,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.85 : 1,
              letterSpacing: "0.3px",
              position: "relative",
            }}
          >
            {loading ? (
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{
                  animation: "spin 1s linear infinite",
                }}>
                  <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                  <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="2" strokeDasharray="16" opacity="0.3" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="white" strokeWidth="2" strokeLinecap="round" />
                </svg>
                Signing in...
              </span>
            ) : (
              "Sign In"
            )}
          </button>

          {message && (
            <div className="message-container" style={{
              marginTop: 20,
              padding: 12,
              background: message.toLowerCase().includes("suspended") || message.toLowerCase().includes("error") ? "rgba(239, 68, 68, 0.08)" : "rgba(34, 197, 94, 0.08)",
              border: `1.5px solid ${message.toLowerCase().includes("suspended") || message.toLowerCase().includes("error") ? "rgba(239, 68, 68, 0.3)" : "rgba(34, 197, 94, 0.3)"}`,
              borderRadius: 10,
              fontSize: 14,
              color: message.toLowerCase().includes("suspended") || message.toLowerCase().includes("error") ? "#dc2626" : "#16a34a",
              fontWeight: 500,
              textAlign: "center",
              lineHeight: 1.4,
            }}>
              {message}
            </div>
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
    </div>
  );
}