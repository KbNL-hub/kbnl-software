"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import CustomerPayments from "@/components/CustomerPayments"

export default function BrokerPayments() {
  const [brokerId, setBrokerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function initBroker() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.href = "/login"; return }
    setBrokerId(session.user.id)
    setLoading(false)
  }

   
  useEffect(() => {
    initBroker()
  }, [])

  if (loading || !brokerId) {
    return <p style={{ color: "#888", fontSize: 15 }}>Loading…</p>
  }

  return <CustomerPayments brokerId={brokerId} />
}