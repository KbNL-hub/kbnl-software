"use client"

import TruckMonitorSection from "@/components/admin/TruckMonitorSection"

export default function MonitorTrucksSection() {
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, color: "#0f172a", fontSize: 24, fontWeight: 700 }}>Monitor Trucks</h2>
        <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 15 }}>
          Track all active trucks and view their routes.
        </p>
      </div>
      <TruckMonitorSection />
    </div>
  )
}
