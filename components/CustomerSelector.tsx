"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

type Customer = { customer_id: string; full_name: string; phone_number: string }
type Props = { onSelect: (customer: Customer) => void }

export default function CustomerSelector({ onSelect }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Customer | null>(null)
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [newPhone, setNewPhone] = useState("")
  const [message, setMessage] = useState("")

  useEffect(() => { fetchCustomers() }, [])

  async function fetchCustomers() {
    const { data, error } = await supabase
      .from("Customers").select("customer_id, full_name, phone_number").order("full_name", { ascending: true })
    if (!error) setCustomers(data || [])
  }

  const filtered = customers.filter(c => c.full_name.toLowerCase().includes(search.toLowerCase()))

  function handleSelect(customer: Customer) {
    setSelected(customer); setSearch(customer.full_name)
    setOpen(false); setCreating(false); onSelect(customer)
  }

  async function handleCreate() {
    if (!newName.trim()) { setMessage("Customer name is required"); return }

    const { data, error } = await supabase
      .from("Customers").insert([{ full_name: newName, phone_number: newPhone || null }]).select().single()

    if (error) { setMessage("Failed to create customer"); return }

    await fetchCustomers()
    handleSelect(data)
    setNewName(""); setNewPhone(""); setCreating(false); setMessage("")
  }

  const fieldStyle: React.CSSProperties = {
    width: "100%", padding: "12px 14px", boxSizing: "border-box",
    borderRadius: 8, border: "1.5px solid #ccc",
    fontSize: 14, background: "white", color: "#171717",
    outline: "none", minHeight: 48,
  }

  return (
    <div style={{ fontFamily: "Arial" }}>
      <div style={{ position: "relative", width: "100%" }}>
        <input
          type="text"
          placeholder="Search customer..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setSelected(null); setOpen(true); setCreating(false) }}
          onFocus={() => setOpen(true)}
          style={{
            ...fieldStyle,
            border: selected ? "1.5px solid #0070f3" : "1.5px solid #ccc",
          }}
        />

        {open && search && (
          <ul style={{
            position: "absolute", top: "100%", left: 0, right: 0,
            background: "white", border: "1.5px solid #ccc", borderTop: "none",
            borderRadius: "0 0 8px 8px", listStyle: "none", margin: 0, padding: 0,
            maxHeight: 200, overflowY: "auto", zIndex: 10,
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)"
          }}>
            {filtered.map(c => (
              <li
                key={c.customer_id}
                onClick={() => handleSelect(c)}
                style={{ padding: "12px 14px", cursor: "pointer", borderBottom: "1px solid #eee", fontSize: 14, color: "#171717" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#f0f7ff")}
                onMouseLeave={e => (e.currentTarget.style.background = "white")}
              >
                {c.full_name}
              </li>
            ))}
            <li
              onClick={() => { setCreating(true); setOpen(false) }}
              style={{ padding: "12px 14px", cursor: "pointer", color: "#0070f3", fontWeight: "bold", borderTop: "1px solid #eee", fontSize: 14 }}
              onMouseEnter={e => (e.currentTarget.style.background = "#f0f7ff")}
              onMouseLeave={e => (e.currentTarget.style.background = "white")}
            >
              + Create new customer
            </li>
          </ul>
        )}
      </div>

      {creating && (
        <div style={{ marginTop: 12, padding: 16, border: "1.5px solid #ddd", borderRadius: 8, background: "#fafafa" }}>
          <p style={{ fontWeight: "bold", marginBottom: 12, fontSize: 14, color: "#171717" }}>New Customer</p>
          <input
            type="text"
            placeholder="Full name *"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            style={{ ...fieldStyle, marginBottom: 10 }}
          />
          <input
            type="text"
            placeholder="Phone number (optional)"
            value={newPhone}
            onChange={e => setNewPhone(e.target.value)}
            style={{ ...fieldStyle, marginBottom: 12 }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleCreate}
              style={{ flex: 1, padding: "10px 0", background: "#0070f3", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold", fontSize: 14, minHeight: 44 }}
            >
              Save Customer
            </button>
            <button
              onClick={() => setCreating(false)}
              style={{ flex: 1, padding: "10px 0", background: "white", border: "1.5px solid #ddd", borderRadius: 6, cursor: "pointer", fontSize: 14, minHeight: 44 }}
            >
              Cancel
            </button>
          </div>
          {message && <p style={{ color: "red", marginTop: 8, fontSize: 13 }}>{message}</p>}
        </div>
      )}

      {selected && !creating && (
        <p style={{ marginTop: 8, fontSize: 13, color: "#00aa00", fontWeight: "bold" }}>✅ {selected.full_name}</p>
      )}
    </div>
  )
}