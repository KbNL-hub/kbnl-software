"use client"

import { Component } from "react"
import { FONT_SIZE } from "@/lib/constants"
import { Icon } from "@iconify/react"

interface Props {
  children: React.ReactNode
  fallback?: React.ReactNode
  label?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.label ? ` ${this.props.label}` : ""}]`, error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div
          style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            minHeight: 240, padding: 32, textAlign: "center", color: "#64748b",
          }}
        >
          <Icon icon="mdi:alert-circle-outline" width={40} color="#ef4444" style={{ marginBottom: 12 }} />
          <p style={{ margin: "0 0 4px", fontSize: FONT_SIZE.base, fontWeight: 700, color: "#0f172a" }}>
            {this.props.label || "Something went wrong"}
          </p>
          <p style={{ margin: "0 0 16px", fontSize: FONT_SIZE.sm, color: "#94a3b8" }}>
            Try refreshing the page. If the problem persists, contact support.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "10px 20px", background: "#0070f3", color: "white",
              border: "none", borderRadius: 8, cursor: "pointer",
              fontWeight: 600, fontSize: FONT_SIZE.sm,
            }}
          >
            Reload Page
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
