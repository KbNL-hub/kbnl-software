"use client"

import { useEffect, useState } from "react"

interface SplashScreenProps {
  onComplete: () => void
  logoSrc?: string
  companyName?: string
}

export default function SplashScreen({ onComplete, logoSrc = "/logo.png", companyName = "KbNL" }: SplashScreenProps) {
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false)
      setTimeout(onComplete, 500) // Wait for fade out animation
    }, 2800)

    return () => clearTimeout(timer)
  }, [onComplete])

  if (!isVisible) return null

  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "0 24px",
      width: "100%",
      background: "linear-gradient(135deg, #ffffff 0%, #f5f7fa 100%)",
      zIndex: 9999,
      animation: "fadeOut 0.5s ease-out forwards",
      animationDelay: "2.5s",
    }}>
      <style>{`
        @keyframes fadeOut {
          from {
            opacity: 1;
            visibility: visible;
          }
          to {
            opacity: 0;
            visibility: hidden;
          }
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes pulse {
          0% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.8;
            transform: scale(1.05);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }

        .splash-logo {
          animation: slideUp 0.6s ease-out;
        }

        .splash-text {
          animation: slideUp 0.6s ease-out 0.2s backwards;
          animation-fill-mode: forwards;
        }

        .splash-subtitle {
          animation: slideUp 0.6s ease-out 0.4s backwards;
          animation-fill-mode: forwards;
        }

        .splash-loader {
          animation: pulse 2s ease-in-out infinite;
          animation-delay: 0.8s;
        }
      `}</style>

      {/* Logo Container */}
      <div className="splash-logo" style={{
        marginBottom: 24,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 120,
        height: 120,
        borderRadius: "24px",
        background: "rgba(0, 112, 243, 0.08)",
        padding: 12,
      }}>
        <img
          src={logoSrc}
          alt={companyName}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
          }}
          onError={(e) => {
            // Fallback if logo doesn't load
            (e.target as HTMLImageElement).style.display = "none"
          }}
        />
      </div>

      {/* Company Name */}
      <h1 className="splash-text" style={{
        fontSize: 32,
        fontWeight: 700,
        color: "#171717",
        margin: 0,
        textAlign: "center",
        letterSpacing: "-0.5px",
        fontFamily: "'Segoe UI', 'Helvetica Neue', sans-serif",
      }}>
        Kpaksbuddy Nig Ltd
      </h1>

      {/* Tagline */}
      <p className="splash-subtitle" style={{
        fontSize: 14,
        color: "#888",
        marginTop: 8,
        marginBottom: 48,
        fontWeight: 500,
        letterSpacing: "0.5px",
        textTransform: "uppercase",
        textAlign: "center",
        maxWidth: 360,
      }}>
        Company Operations Management System
      </p>

      {/* Loader Dots */}
      <div className="splash-loader" style={{
        display: "flex",
        gap: 8,
        justifyContent: "center",
      }}>
        <div style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "#0070f3",
          animation: "pulse 1.5s ease-in-out 0s infinite",
        }} />
        <div style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "#0070f3",
          animation: "pulse 1.5s ease-in-out 0.2s infinite",
        }} />
        <div style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "#0070f3",
          animation: "pulse 1.5s ease-in-out 0.4s infinite",
        }} />
      </div>
    </div>
  )
}