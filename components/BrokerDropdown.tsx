"use client"

import { useEffect, useState } from "react"
import ModernInput from "@/components/ModernInput"
import { supabase } from "@/lib/supabase"

type Broker = { broker_id: string; broker_name: string }
type Props = { onSelect: (broker: Broker) => void }

export default function BrokerDropdown({ onSelect }: Props) {
  const [brokers, setBrokers] = useState<Broker[]>([])
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Broker | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    async function fetchBrokers() {
      const { data, error } = await supabase
        .from("Brokers").select("broker_id, broker_name").order("broker_name", { ascending: true })
      if (!error) setBrokers(data || [])
    }
    fetchBrokers()
  }, [])

  const filtered = brokers.filter(b => b.broker_name.toLowerCase().includes(search.toLowerCase()))

  function handleSelect(broker: Broker) {
    setSelected(broker); setSearch(broker.broker_name); setOpen(false); onSelect(broker)
  }

  return (
    <div style={{ fontFamily: "Arial" }}>
      <div style={{ position: "relative", width: "100%" }}>
        <ModernInput
          type="text"
          placeholder="Search broker..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setSelected(null); setOpen(true) }}
          onFocus={() => setOpen(true)}
          style={{
            width: "100%", padding: "12px 14px", fontSize: 15,
            boxSizing: "border-box", borderRadius: 8,
            border: "1.5px solid #ccc",
            background: "white", color: "#171717",
            outline: "none", minHeight: 48,
          }}
        />

        {open && search && filtered.length > 0 && (
          <ul style={{
            position: "absolute", top: "100%", left: 0, right: 0,
            background: "white", border: "1.5px solid #ccc", borderTop: "none",
            borderRadius: "0 0 8px 8px", listStyle: "none", margin: 0, padding: 0,
            maxHeight: 200, overflowY: "auto", zIndex: 10,
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)"
          }}>
            {filtered.map(broker => (
              <li
                key={broker.broker_id}
                onClick={() => handleSelect(broker)}
                style={{ padding: "12px 14px", cursor: "pointer", borderBottom: "1px solid #eee", fontSize: 14, color: "#171717" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#f0f7ff")}
                onMouseLeave={e => (e.currentTarget.style.background = "white")}
              >
                {broker.broker_name}
              </li>
            ))}
          </ul>
        )}

        {open && search && filtered.length === 0 && (
          <div style={{
            position: "absolute", top: "100%", left: 0, right: 0,
            background: "white", border: "1.5px solid #ccc", borderTop: "none",
            borderRadius: "0 0 8px 8px", padding: "12px 14px",
            color: "#999", fontSize: 14,
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)"
          }}>
            No broker found
          </div>
        )}
      </div>

      {selected && (
        <p style={{ marginTop: 8, fontSize: 13, color: "#00aa00", fontWeight: "bold" }}>
          ✅ {selected.broker_name}
        </p>
      )}
    </div>
  )
}