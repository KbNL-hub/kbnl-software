"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"

type FuelCompany = {
  company_id: string
  company_name: string
}

type Truck = {
  plate_number: string
}

type Props = {
  driverId: string
  onBack: () => void
}

export default function BuyDiesel({ driverId, onBack }: Props) {
  const [companies, setCompanies] = useState<FuelCompany[]>([])
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [companyId, setCompanyId] = useState("")
  const [selectedPlate, setSelectedPlate] = useState("")
  const [litres, setLitres] = useState("")
  const [rate, setRate] = useState("")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    async function fetchData() {
      const { data: companiesData } = await supabase
        .from("fuel_companies")
        .select("company_id, company_name")
        .order("company_name", { ascending: true })
      setCompanies(companiesData || [])

      // Same truck list as start trip — Empty trucks not on an active trip
      const activeTripPlates = (await supabase
        .from("Trips")
        .select("plate_number")
        .in("trip_status", ["In transit", "On hold"])
      ).data?.map(t => t.plate_number) || []

      const { data: trucksData } = await supabase
        .from("Trucks")
        .select("plate_number")
        .eq("status", "Empty")
        .not("plate_number", "in", `(${activeTripPlates.join(",") || "NULL"})`)
        .order("plate_number", { ascending: true })

      setTrucks(trucksData || [])
    }
    fetchData()
  }, [])

  const total = litres && rate && !isNaN(Number(litres)) && !isNaN(Number(rate))
    ? Number(litres) * Number(rate)
    : null

  async function handleSubmit() {
    if (!selectedPlate) return setMessage("Select a truck")
    if (!companyId) return setMessage("Select a fuel company")
    if (!litres || isNaN(Number(litres)) || Number(litres) <= 0) return setMessage("Enter valid litres")
    if (!rate || isNaN(Number(rate)) || Number(rate) <= 0) return setMessage("Enter valid rate per litre")

    setSubmitting(true)
    const { error } = await supabase
      .from("fuel_requests")
      .insert([{
        driver_id: driverId,
        company_id: companyId,
        litres: Number(litres),
        rate_per_litre: Number(rate),
        plate_number: selectedPlate,
      }])

    if (error) {
      setMessage("Failed to submit request. Try again.")
      setSubmitting(false)
      return
    }

    setSubmitting(false)
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div style={{ textAlign: "center", paddingTop: 60 }}>
        <p style={{ fontSize: 48, marginBottom: 16 }}>✅</p>
        <h2 style={{ marginBottom: 8 }}>Request Submitted</h2>
        <p style={{ color: "#888", marginBottom: 40 }}>
          Your diesel request has been sent. The station manager will validate it.
        </p>
        <button
          onClick={onBack}
          style={{ padding: "12px 32px", background: "#0070f3", color: "white", border: "none", borderRadius: 8, fontSize: 16, cursor: "pointer", fontWeight: "bold" }}
        >
          Back to Dashboard
        </button>
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={onBack}
        style={{ background: "none", border: "none", color: "#0070f3", cursor: "pointer", marginBottom: 16, padding: 0 }}
      >
        ← Back
      </button>
      <h2 style={{ marginBottom: 24 }}>Buy Diesel</h2>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>Truck *</label>
        <select
          value={selectedPlate}
          onChange={(e) => { setSelectedPlate(e.target.value); setMessage("") }}
          style={{ width: "100%", padding: 10, boxSizing: "border-box", borderRadius: 6, border: "1px solid #ddd" }}
        >
          <option value="">Select truck</option>
          {trucks.map((t) => (
            <option key={t.plate_number} value={t.plate_number}>{t.plate_number}</option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>Fuel Station *</label>
        <select
          value={companyId}
          onChange={(e) => { setCompanyId(e.target.value); setMessage("") }}
          style={{ width: "100%", padding: 10, boxSizing: "border-box", borderRadius: 6, border: "1px solid #ddd" }}
        >
          <option value="">Select station</option>
          {companies.map((c) => (
            <option key={c.company_id} value={c.company_id}>{c.company_name}</option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>Litres *</label>
        <input
          type="number"
          value={litres}
          onChange={(e) => { setLitres(e.target.value); setMessage("") }}
          placeholder="e.g. 100"
          style={{ width: "100%", padding: 10, boxSizing: "border-box", borderRadius: 6, border: "1px solid #ddd" }}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>Rate per Litre (₦) *</label>
        <input
          type="number"
          value={rate}
          onChange={(e) => { setRate(e.target.value); setMessage("") }}
          placeholder="e.g. 1200"
          style={{ width: "100%", padding: 10, boxSizing: "border-box", borderRadius: 6, border: "1px solid #ddd" }}
        />
      </div>

      {total !== null && (
        <div style={{ background: "#f0f7ff", border: "1px solid #0070f3", borderRadius: 8, padding: "12px 16px", marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 14, color: "#0070f3" }}>
            Total: <strong>₦{total.toLocaleString()}</strong>
          </p>
        </div>
      )}

      {message && <p style={{ color: "red", fontSize: 13, marginBottom: 16 }}>{message}</p>}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        style={{ width: "100%", padding: "14px 0", background: "#0070f3", color: "white", border: "none", borderRadius: 8, fontSize: 16, cursor: submitting ? "not-allowed" : "pointer", fontWeight: "bold" }}
      >
        {submitting ? "Submitting..." : "Submit Request"}
      </button>
    </div>
  )
}