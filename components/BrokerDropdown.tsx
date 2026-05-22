"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

type Broker = {
  broker_id: string
  broker_name: string
}

type Props = {
    onSelect: (broker: Broker) => void
}

export default function BrokerDropdown({ onSelect }: Props) {
  const [brokers, setBrokers] = useState<Broker[]>([])
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Broker | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    async function fetchBrokers() {
      const { data, error } = await supabase
        .from("Brokers")
        .select("broker_id, broker_name")
        .order("broker_name", { ascending: true })

      if (!error) setBrokers(data || [])
    }
    fetchBrokers()
  }, [])

  const filtered = brokers.filter((b) =>
    b.broker_name.toLowerCase().includes(search.toLowerCase())
  )

  function handleSelect(broker: Broker) {
    setSelected(broker)
    setSearch(broker.broker_name)
    setOpen(false)
    onSelect(broker)
  }

  return (
    <div style={{ padding: 12, fontFamily: "Arial" }}>
      <h2>Select Broker</h2>

      <div style={{ position: "relative", width: 320 }}>
        <input
          type="text"
          placeholder="Search broker..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setSelected(null)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          style={{
            width: "100%",
            padding: 10,
            fontSize: 15,
            boxSizing: "border-box",
          }}
        />

        {open && search && filtered.length > 0 && (
          <ul
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              background: "white",
              border: "1px solid #ccc",
              borderTop: "none",
              listStyle: "none",
              margin: 0,
              padding: 0,
              maxHeight: 200,
              overflowY: "auto",
              zIndex: 10,
            }}
          >
            {filtered.map((broker) => (
              <li
                key={broker.broker_id}
                onClick={() => handleSelect(broker)}
                style={{
                  padding: "10px 12px",
                  cursor: "pointer",
                  borderBottom: "1px solid #eee",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "#f0f0f0")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "white")
                }
              >
                {broker.broker_name}
              </li>
            ))}
          </ul>
        )}

        {open && search && filtered.length === 0 && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              background: "white",
              border: "1px solid #ccc",
              borderTop: "none",
              padding: "10px 12px",
              color: "#999",
              fontSize: 14,
            }}
          >
            No broker found
          </div>
        )}
      </div>

      {selected && (
        <p style={{ marginTop: 20 }}>
          ✅ Selected: <strong>{selected.broker_name}</strong> (ID: {selected.broker_id})
        </p>
      )}
    </div>
  )
}