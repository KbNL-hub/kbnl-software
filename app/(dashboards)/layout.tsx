import { ReactNode, Suspense } from "react"

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "white" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid #f0f0f0", borderTop: "3px solid #0070f3", animation: "spin 1s linear infinite", margin: "0 auto" }} />
            <p style={{ color: "#888", marginTop: 12, fontSize: 14 }}>Loading…</p>
          </div>
        </div>
      }
    >
      {children}
    </Suspense>
  )
}