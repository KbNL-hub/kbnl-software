"use client"

import { FONT_SIZE } from "@/lib/constants"

type Props = {
  open: boolean
  title: string
  entityName: string
  warnings: string[]
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
  disabled?: boolean
  confirmLabel?: string
  error?: string
}

export default function ConfirmDeleteModal({
  open,
  title,
  entityName,
  warnings,
  onConfirm,
  onCancel,
  loading = false,
  disabled = false,
  confirmLabel = "Yes, Delete",
  error,
}: Props) {
  if (!open) return null

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.6)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: 24,
        animation: "fadeIn 0.2s ease-out",
      }}
    >
      <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white",
          borderRadius: 16,
          padding: 32,
          width: "100%",
          maxWidth: 460,
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          animation: "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <div
            style={{
              width: 64,
              height: 64,
              background: "#fef2f2",
              color: "#ef4444",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 20,
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          </div>

          <h3 style={{ margin: "0 0 8px", color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>
            {title}
          </h3>
          <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: FONT_SIZE.base, lineHeight: 1.5 }}>
            Are you sure you want to delete <strong>{entityName}</strong>? This action cannot be undone.
          </p>

          {warnings.length > 0 && (
            <div
              style={{
                width: "100%",
                padding: 14,
                background: "#fffbeb",
                border: "1px solid #fde68a",
                borderRadius: 8,
                marginBottom: 20,
                textAlign: "left",
              }}
            >
              <p style={{ margin: "0 0 8px", fontSize: FONT_SIZE.sm, fontWeight: 700, color: "#92400e" }}>
                This will also permanently delete:
              </p>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: FONT_SIZE.sm, color: "#92400e", lineHeight: 1.8 }}>
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {error && (
            <div
              style={{
                width: "100%",
                padding: 12,
                background: "#fef2f2",
                borderLeft: "4px solid #ef4444",
                borderRadius: 4,
                marginBottom: 20,
                color: "#b91c1c",
                fontSize: FONT_SIZE.sm,
                textAlign: "left",
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, width: "100%" }}>
            <button
              onClick={onCancel}
              disabled={loading}
              style={{
                padding: "12px 16px",
                background: "white",
                color: "#475569",
                border: "1px solid #cbd5e1",
                borderRadius: 8,
                cursor: loading ? "not-allowed" : "pointer",
                fontWeight: 600,
                fontSize: FONT_SIZE.md,
                minHeight: 44,
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.background = "#f8fafc"
                  e.currentTarget.style.borderColor = "#0070f3"
                  e.currentTarget.style.color = "#0070f3"
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "white"
                e.currentTarget.style.borderColor = "#cbd5e1"
                e.currentTarget.style.color = "#475569"
              }}
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={loading || disabled}
              style={{
                padding: "12px 16px",
                background: loading || disabled ? "#94a3b8" : "#ef4444",
                color: "white",
                border: "none",
                borderRadius: 8,
                cursor: loading || disabled ? "not-allowed" : "pointer",
                fontWeight: 600,
                fontSize: FONT_SIZE.md,
                opacity: loading || disabled ? 0.7 : 1,
                minHeight: 44,
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                if (!loading && !disabled) e.currentTarget.style.background = "#dc2626"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = loading || disabled ? "#94a3b8" : "#ef4444"
              }}
            >
              {loading ? "Deleting..." : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
