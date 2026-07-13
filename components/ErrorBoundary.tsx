"use client"

import { Component, type ReactNode } from "react"
import { Icon } from "@iconify/react"
import { FONT_SIZE } from "@/lib/constants"

interface Props {
  children: ReactNode
  fallback?: ReactNode
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

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#f8fafc", fontFamily: "'Inter', sans-serif", padding: 24 }}>
          <div style={{ textAlign: "center", maxWidth: 400 }}>
            <Icon icon="mdi:alert-circle" width={48} color="#ef4444" style={{ marginBottom: 16, display: "block", margin: "0 auto 16px" }} />
            <h1 style={{ margin: "0 0 8px", fontSize: FONT_SIZE.xl, fontWeight: 700, color: "#0f172a" }}>Something went wrong</h1>
            <p style={{ margin: "0 0 24px", fontSize: FONT_SIZE.base, color: "#64748b" }}>
              {this.state.error?.message || "An unexpected error occurred"}
            </p>
            <button
              onClick={this.handleReset}
              style={{ padding: "10px 20px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: FONT_SIZE.sm }}
            >
              Try Again
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
