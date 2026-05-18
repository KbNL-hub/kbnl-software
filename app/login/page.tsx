"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleLogin() {
    if (!email || !password) return setMessage("Enter email and password")
    setLoading(true)

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

    setLoading(false)

    if (profileError || !profile) {
      setMessage("Profile not found. Contact admin.")
      return
    }

    if (profile.role === "Admin") {
      router.push("/admin")
    } else if (profile.role === "Driver") {
      router.push("/driver")
    }
  }

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", minHeight: "100vh", fontFamily: "Arial"
    }}>
      <div style={{
        width: 320, padding: 32, border: "1px solid #ddd",
        borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.08)"
      }}>
        <h2 style={{ marginBottom: 24, textAlign: "center" }}>Sign In</h2>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: "100%", padding: 10, marginBottom: 12, boxSizing: "border-box" }}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: "100%", padding: 10, marginBottom: 20, boxSizing: "border-box" }}
        />

        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            width: "100%", padding: "12px 0", background: "#0070f3",
            color: "white", border: "none", borderRadius: 6,
            fontSize: 16, cursor: loading ? "not-allowed" : "pointer"
          }}
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>

        {message && (
          <p style={{ marginTop: 16, color: "red", textAlign: "center", fontSize: 14 }}>
            {message}
          </p>
        )}
      </div>
    </div>
  )
}