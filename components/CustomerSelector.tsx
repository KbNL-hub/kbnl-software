"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

type Customer = {
  customer_id: string
  full_name: string
  phone_number: string
}

type Props = {
  onSelect: (customer: Customer) => void
}

export default function CustomerSelector({ onSelect }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Customer | null>(null)
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [newPhone, setNewPhone] = useState("")
  const [message, setMessage] = useState("")

  useEffect(() => {
    fetchCustomers()
  }, [])

  async function fetchCustomers() {
    const { data, error } = await supabase
      .from("Customers")
      .select("customer_id, full_name, phone_number")
      .order("full_name", { ascending: true })

    if (!error) setCustomers(data || [])
  }

  const filtered = customers.filter((c) =>
    c.full_name.toLowerCase().includes(search.toLowerCase())
  )

  function handleSelect(customer: Customer) {
    setSelected(customer)
    setSearch(customer.full_name)
    setOpen(false)
    setCreating(false)
    onSelect(customer)
  }

  async function handleCreate() {
    if (!newName.trim()) {
      setMessage("Customer name is required")
      return
    }

    const { data, error } = await supabase
      .from("Customers")
      .insert([{ full_name: newName, phone_number: newPhone || null }])
      .select()
      .single()

    if (error) {
      setMessage("Failed to create customer")
      return
    }

    await fetchCustomers()
    handleSelect(data)
    setNewName("")
    setNewPhone("")
    setCreating(false)
    setMessage("")
  }

  return (
    <div>
      {/* <label style={{ fontWeight: "bold" }}>Customer *</label> */}

      <div style={{ position: "relative", width: 320, marginTop: 6 }}>
        <input
          type="text"
          placeholder="Search customer..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setSelected(null)
            setOpen(true)
            setCreating(false)
          }}
          onFocus={() => setOpen(true)}
          style={{ width: "100%", padding: 10, boxSizing: "border-box" }}
        />

        {open && search && (
          <ul style={{
            position: "absolute", top: "100%", left: 0, right: 0,
            background: "white", border: "1px solid #ccc", borderTop: "none",
            listStyle: "none", margin: 0, padding: 0,
            maxHeight: 200, overflowY: "auto", zIndex: 10,
          }}>
            {filtered.map((c) => (
              <li
                key={c.customer_id}
                onClick={() => handleSelect(c)}
                style={{ padding: "10px 12px", cursor: "pointer", borderBottom: "1px solid #eee" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f0f0f0")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "white")}
              >
                {c.full_name}
              </li>
            ))}

            <li
              onClick={() => { setCreating(true); setOpen(false) }}
              style={{
                padding: "10px 12px", cursor: "pointer",
                color: "#0070f3", fontWeight: "bold", borderTop: "1px solid #eee"
              }}
            >
              + Create new customer
            </li>
          </ul>
        )}
      </div>

      {creating && (
        <div style={{ marginTop: 12, padding: 16, border: "1px solid #ccc", width: 320 }}>
          <p style={{ fontWeight: "bold", marginBottom: 8 }}>New Customer</p>
          <input
            type="text"
            placeholder="Full name *"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            style={{ width: "100%", padding: 8, marginBottom: 8, boxSizing: "border-box" }}
          />
          <input
            type="text"
            placeholder="Phone number (optional)"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            style={{ width: "100%", padding: 8, marginBottom: 8, boxSizing: "border-box" }}
          />
          <button onClick={handleCreate} style={{ padding: "8px 16px", marginRight: 8 }}>
            Save Customer
          </button>
          <button onClick={() => setCreating(false)} style={{ padding: "8px 16px" }}>
            Cancel
          </button>
          {message && <p style={{ color: "red", marginTop: 8 }}>{message}</p>}
        </div>
      )}

      {selected && !creating && (
        <p style={{ marginTop: 8 }}>✅ <strong>{selected.full_name}</strong></p>
      )}
    </div>
  )
}