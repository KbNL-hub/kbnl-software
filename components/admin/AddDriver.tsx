"use client"
import ModernInput from "@/components/ModernInput";

import { useState, useRef } from "react"
import InviteSuccessCard from "@/components/admin/InviteSuccessCard"
import { usePermissions } from "@/lib/PermissionContext"

export default function AddDriver() {
  const { getAccess } = usePermissions()
  const canEdit = getAccess("add-driver").canEdit

  const [fullName, setFullName] = useState("")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [inviteResult, setInviteResult] = useState<{ tempPassword: string; email: string } | null>(null)

  const phoneRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)

  async function handleSubmit() {
    if (!fullName.trim()) return setMessage("Full name is required")
    if (!email.trim()) return setMessage("Email is required")

    setSubmitting(true)

    try {
      const res = await fetch("/api/invite-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, fullName, phoneNumber, role: "Driver" }),
      })

      const result = await res.json()

      if (!res.ok) {
        setMessage("Failed: " + result.error)
        return
      }

      setInviteResult({ tempPassword: result.tempPassword, email })
      setMessage("")
    } catch {
      setMessage("Network error, please try again")
    } finally {
      setSubmitting(false)
    }
  }

  if (inviteResult) {
    return (
      <div style={{ maxWidth: 400 }}>
        <InviteSuccessCard
          tempPassword={inviteResult.tempPassword}
          email={inviteResult.email}
          onClose={() => { setInviteResult(null); setFullName(""); setPhoneNumber(""); setEmail("") }}
        />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 400 }}>
      <h2 style={{ marginBottom: 24 }}>Add New Driver</h2>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>
          Full Name *
        </label>
        <ModernInput
          type="text"
          placeholder="e.g. John Doe"
          value={fullName}
          onChange={(e) => { setFullName(e.target.value); setMessage("") }}
          onKeyDown={(e) => { if (e.key === "Enter") phoneRef.current?.focus() }}
          style={{ width: "100%", padding: 10, boxSizing: "border-box" }}
          data-modern-input="migrated"
          readOnly={!canEdit} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>
          Phone Number
        </label>
        <ModernInput
          ref={phoneRef}
          type="text"
          placeholder="e.g. 08012345678"
          value={phoneNumber}
          onChange={(e) => { setPhoneNumber(e.target.value); setMessage("") }}
          onKeyDown={(e) => { if (e.key === "Enter") emailRef.current?.focus() }}
          style={{ width: "100%", padding: 10, boxSizing: "border-box" }}
          data-modern-input="migrated"
          readOnly={!canEdit} />
      </div>
      <div style={{ marginBottom: 24 }}>
        <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>
          Email Address *
        </label>
        <ModernInput
          ref={emailRef}
          type="email"
          placeholder="e.g. driver@example.com"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setMessage("") }}
          onKeyDown={(e) => { if (e.key === "Enter") handleSubmit() }}
          style={{ width: "100%", padding: 10, boxSizing: "border-box" }}
          data-modern-input="migrated"
          readOnly={!canEdit} />
      </div>
      <button
        onClick={handleSubmit}
        disabled={submitting || !canEdit}
        style={{
          width: "100%", padding: "12px 0", background: submitting || !canEdit ? "#94a3b8" : "#0070f3",
          color: "white", border: "none", borderRadius: 6,
          fontSize: 16, cursor: submitting || !canEdit ? "not-allowed" : "pointer"
        }}
      >
        {submitting ? "Sending Invite..." : "Add Driver"}
      </button>
      {message && (
        <p style={{
          marginTop: 16, fontWeight: "bold",
          color: message.startsWith("✅") ? "green" : "red"
        }}>
          {message}
        </p>
      )}
    </div>
  );
}