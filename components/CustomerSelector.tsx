"use client"

import { useEffect, useState } from "react"
import { Icon } from "@iconify/react"
import ModernInput from "@/components/ModernInput"
import { supabase } from "@/lib/supabase"
import { apiMutate } from "@/lib/api-mutation"
import { getCachedCustomers, cacheCustomers } from '@/lib/offline/tripsDb'
import { generateCustomerId } from '@/lib/customerUtils'

export type Customer = { customer_id: string; full_name: string; phone_number: string; is_new?: boolean; isNew?: boolean }
type Props = { onSelect: (customer: Customer) => void; allowUnsavedNew?: boolean; initialValue?: string }

export default function CustomerSelector({ onSelect, allowUnsavedNew, initialValue }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState(initialValue || "")
  const [selected, setSelected] = useState<Customer | null>(null)
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [newPhone, setNewPhone] = useState("")
  const [message, setMessage] = useState("")
  const [isOnline, setIsOnline] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsOnline(navigator.onLine)
    window.addEventListener('online', () => setIsOnline(true))
    window.addEventListener('offline', () => setIsOnline(false))
    return () => {
      window.removeEventListener('online', () => setIsOnline(true))
      window.removeEventListener('offline', () => setIsOnline(false))
    }
  }, [])

  useEffect(() => {
    async function loadCustomers() {
      setLoading(true)
      try {
        if (isOnline) {
          // Try online fetch first
          const { data, error } = await supabase
            .from("Customers")
            .select("customer_id, full_name, phone_number, is_new")
            .order("full_name", { ascending: true })
          
          if (!error && data) {
            setCustomers(data)
            // Cache for offline use
            await cacheCustomers(data)
          } else {
            // Fallback to cache if online fetch fails
            const cached = await getCachedCustomers()
            setCustomers(cached)
          }
        } else {
          // Offline: use cache
          const cached = await getCachedCustomers()
          setCustomers(cached)
        }
      } catch (error) {
        console.error('[CustomerSelector] Error loading customers:', error)
        // Try cache as last resort
        try {
          const cached = await getCachedCustomers()
          setCustomers(cached)
        } catch (cacheError) {
          console.error('[CustomerSelector] Cache also failed:', cacheError)
          setCustomers([])
        }
      } finally {
        setLoading(false)
      }
    }

    loadCustomers()
  }, [isOnline])

  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!initialValue) {
      setSelected(null)
      setSearch("")
      return
    }
    if (customers.length === 0) return
    const match = customers.find(c => c.full_name === initialValue)
    if (match) {
      if (!selected || selected.customer_id !== match.customer_id) setSelected(match)
    }
    setSearch(initialValue)
  }, [initialValue, customers])
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  const filtered = customers.filter(c => (c.full_name || "").toLowerCase().includes((search || "").toLowerCase()))

  function handleSelect(customer: Customer) {
    setSelected(customer)
    setSearch(customer.full_name)
    setOpen(false)
    setCreating(false)
    onSelect(customer)
  }

  async function handleCreate() {
    if (!newName.trim()) { setMessage("Customer name is required"); return }
    if (!newPhone.trim()) { setMessage("Phone number is required"); return }

    if (allowUnsavedNew) {
      const tempCustomer = { customer_id: "", full_name: newName, phone_number: newPhone || "", isNew: true }
      handleSelect(tempCustomer)
      setNewName("")
      setNewPhone("")
      setCreating(false)
      setMessage("")
      return
    }

    if (!isOnline) {
      setMessage("⚠️ Internet required to create new customers")
      return
    }

    try {
      const customerId = await generateCustomerId()
      const { data, error } = await apiMutate<Customer[]>(
        "finance",
        {
          action: "insert",
          table: "Customers",
          data: { customer_id: customerId, full_name: newName, phone_number: newPhone || null, is_new: true }
        }
      )

      if (error) {
        setMessage("Failed to create customer")
        return
      }

      // Refresh cache after creating
      const { data: allCustomers, error: fetchError } = await supabase
        .from("Customers")
        .select("customer_id, full_name, phone_number, is_new")
        .order("full_name", { ascending: true })
      
      if (!fetchError && allCustomers) {
        setCustomers(allCustomers)
        await cacheCustomers(allCustomers)
      }

      const createdCustomer =
        data?.[0] ??
        allCustomers?.find(customer => customer.customer_id === customerId)
      if (!createdCustomer) {
        setMessage("Customer created. Refresh to select it.")
        return
      }
      handleSelect(createdCustomer)
      setNewName("")
      setNewPhone("")
      setCreating(false)
      setMessage("")
    } catch {
      setMessage("Network error, please try again")
    }
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
        <ModernInput
          type="text"
          placeholder={loading ? "Loading customers..." : "Search customer..."}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setSelected(null); setOpen(true); setCreating(false) }}
          onFocus={() => setOpen(true)}
          disabled={loading}
          style={{ ...fieldStyle, opacity: loading ? 0.6 : 1 }}
        />

        {!isOnline && customers.length > 0 && (
          <div style={{
            position: "absolute", top: -28, right: 0,
            fontSize: 11, color: "#f5a623", fontWeight: "bold",
            background: "#fff8e1", padding: "4px 8px", borderRadius: 4,
          }}>
            📡 Using cached data
          </div>
        )}

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
                style={{ padding: "12px 14px", cursor: "pointer", borderBottom: "1px solid #eee", fontSize: 14, color: "#171717", display: "flex", alignItems: "center", justifyContent: "space-between" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#f0f7ff")}
                onMouseLeave={e => (e.currentTarget.style.background = "white")}
              >
                <span>{c.full_name}</span>
                {c.is_new && (
                  <span style={{ fontSize: 10, padding: "2px 6px", background: "#fef3c7", color: "#92400e", borderRadius: 4, fontWeight: "bold" }}>NEW</span>
                )}
              </li>
            ))}
            {isOnline && (
              <li
                onClick={() => { setCreating(true); setOpen(false) }}
                style={{ padding: "12px 14px", cursor: "pointer", color: "#0070f3", fontWeight: "bold", borderTop: "1px solid #eee", fontSize: 14 }}
                onMouseEnter={e => (e.currentTarget.style.background = "#f0f7ff")}
                onMouseLeave={e => (e.currentTarget.style.background = "white")}
              >
                + Create new customer
              </li>
            )}
          </ul>
        )}
      </div>

      {creating && (
        <div style={{ marginTop: 12, padding: 16, border: "1.5px solid #ddd", borderRadius: 8, background: "#fafafa" }}>
          <p style={{ fontWeight: "bold", marginBottom: 12, fontSize: 14, color: "#171717" }}>New Customer</p>
          <ModernInput
            type="text"
            placeholder="Full name *"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            style={{ ...fieldStyle, marginBottom: 10 }}
          />
          <ModernInput
            type="text"
            placeholder="Phone number *"
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
        <div style={{ marginTop: 8, padding: "8px 12px", background: "#f0f7ff", borderRadius: 6, fontSize: 13, color: "#0070f3", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
          <Icon icon="mdi:check-circle" width={16} />
          Selected: {selected.full_name}
          {selected.is_new && (
            <span style={{ fontSize: 10, padding: "2px 6px", background: "#fef3c7", color: "#92400e", borderRadius: 4, fontWeight: "bold" }}>NEW</span>
          )}
        </div>
      )}
    </div>
  )
}