"use client"

import { useState } from "react"

type Props = {
  tempPassword: string
  email: string
  onClose: () => void
}

export default function InviteSuccessCard({ tempPassword, email, onClose }: Props) {
  const [copied, setCopied] = useState(false)

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(tempPassword)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const el = document.createElement("textarea")
      el.value = tempPassword
      document.body.appendChild(el)
      el.select()
      document.execCommand("copy")
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div style={{ textAlign: "center", padding: "8px 0" }}>
      <div style={{
        width: 48, height: 48, borderRadius: "50%",
        background: "rgba(34, 197, 94, 0.1)",
        display: "flex", alignItems: "center", justifyContent: "center",
        margin: "0 auto 12px",
      }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>

      <h3 style={{ margin: "0 0 4px", color: "#0f172a", fontSize: 18, fontWeight: 700 }}>
        User Created
      </h3>
      <p style={{ margin: "0 0 16px", color: "#64748b", fontSize: 13 }}>
        {email}
      </p>

      <div style={{
        background: "#f0f7ff",
        border: "1.5px dashed #0070f3",
        borderRadius: 10,
        padding: "16px 20px",
        marginBottom: 16,
      }}>
        <p style={{ margin: "0 0 6px", color: "#0c4a6e", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
          Temporary Password
        </p>
        <p style={{
          margin: "0 0 10px",
          fontSize: 22,
          fontWeight: 700,
          color: "#0070f3",
          fontFamily: "'Fira Code', 'Cascadia Code', monospace",
          letterSpacing: "0.5px",
        }}>
          {tempPassword}
        </p>
        <button
          onClick={copyPassword}
          style={{
            padding: "6px 16px",
            background: copied ? "#16a34a" : "#0070f3",
            color: "white",
            border: "none",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.2s",
          }}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      <div style={{
        background: "#fffbeb",
        border: "1px solid #fcd34d",
        borderRadius: 8,
        padding: "10px 14px",
        marginBottom: 20,
        textAlign: "left",
      }}>
        <p style={{ margin: 0, fontSize: 12, color: "#78350f", lineHeight: 1.5 }}>
          ⚠️ Share this password securely. They'll be asked to change it on first login.
        </p>
      </div>

      <button
        onClick={onClose}
        style={{
          padding: "8px 20px",
          background: "#0f172a",
          color: "white",
          border: "none",
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Done
      </button>
    </div>
  )
}
