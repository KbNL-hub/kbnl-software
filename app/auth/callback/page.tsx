"use client"

import { useState, useRef, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"

export default function SetPassword() {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [ready, setReady] = useState(false)
  const router = useRouter()
  const confirmRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Supabase automatically handles the token in the URL
    // We just need to confirm a session exists
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setReady(true)
      } else {
        setMessage("Invalid or expired invite link.")
      }
    })
  }, [])

  async function handleSetPassword() {
    if (!password) return setMessage("Enter a password")
    if (password.length < 6) return setMessage("Password must be at least 6 characters")
    if (password !== confirm) return setMessage("Passwords do not match")

    setSubmitting(true)

    const { error } = await supabase.auth.updateUser({ password })

    setSubmitting(false)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage("✅ Password set! Redirecting...")
    setTimeout(() => router.push("/login"), 2000)
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
        <h2 style={{ marginBottom: 8, textAlign: "center" }}>Set Your Password</h2>
        <p style={{ color: "#888", fontSize: 13, textAlign: "center", marginBottom: 24 }}>
          Choose a password to activate your account
        </p>

        {!ready && !message && (
          <p style={{ textAlign: "center", color: "#888" }}>Verifying invite link...</p>
        )}

        {message && !ready && (
          <p style={{ color: "red", textAlign: "center" }}>{message}</p>
        )}

        {ready && (
          <>
            <input
              type="password"
              placeholder="New password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setMessage("") }}
              onKeyDown={(e) => { if (e.key === "Enter") confirmRef.current?.focus() }}
              style={{ width: "100%", padding: 10, marginBottom: 12, boxSizing: "border-box" }}
            />

            <input
              ref={confirmRef}
              type="password"
              placeholder="Confirm password"
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setMessage("") }}
              onKeyDown={(e) => { if (e.key === "Enter") handleSetPassword() }}
              style={{ width: "100%", padding: 10, marginBottom: 20, boxSizing: "border-box" }}
            />

            <button
              onClick={handleSetPassword}
              disabled={submitting}
              style={{
                width: "100%", padding: "12px 0", background: "#0070f3",
                color: "white", border: "none", borderRadius: 6,
                fontSize: 16, cursor: submitting ? "not-allowed" : "pointer"
              }}
            >
              {submitting ? "Saving..." : "Set Password"}
            </button>

            {message && (
              <p style={{
                marginTop: 16, fontWeight: "bold", textAlign: "center",
                color: message.startsWith("✅") ? "green" : "red"
              }}>
                {message}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}