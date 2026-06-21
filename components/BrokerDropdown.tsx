"use client"

import { useEffect, useRef, useState } from "react"
import ModernInput from "@/components/ModernInput"
import { supabase } from "@/lib/supabase"
import { getCachedBrokers, cacheBrokers } from '@/lib/offline/tripsDb'

type Broker = { broker_id: string; broker_name: string; phone_number?: string | null }
type Props = { onSelect: (broker: Broker) => void }

export default function BrokerDropdown({ onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [brokers, setBrokers] = useState<Broker[]>([])
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Broker | null>(null)
  const [open, setOpen] = useState(false)
  const [isOnline, setIsOnline] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setIsOnline(navigator.onLine)
    window.addEventListener('online', () => setIsOnline(true))
    window.addEventListener('offline', () => setIsOnline(false))
    return () => {
      window.removeEventListener('online', () => setIsOnline(true))
      window.removeEventListener('offline', () => setIsOnline(false))
    }
  }, [])

  useEffect(() => {
    async function loadBrokers() {
      setLoading(true)
      try {
        if (isOnline) {
          // Try online fetch first
          const { data, error } = await supabase
            .from("Brokers")
            .select("broker_id, broker_name, phone_number")
            .order("broker_name", { ascending: true })
          
          if (!error && data) {
            setBrokers(data)
            // Cache for offline use
            await cacheBrokers(data)
          } else {
            // Fallback to cache if online fetch fails
            const cached = await getCachedBrokers()
            setBrokers(cached)
          }
        } else {
          // Offline: use cache
          const cached = await getCachedBrokers()
          setBrokers(cached)
        }
      } catch (error) {
        console.error('[BrokerDropdown] Error loading brokers:', error)
        // Try cache as last resort
        try {
          const cached = await getCachedBrokers()
          setBrokers(cached)
        } catch (cacheError) {
          console.error('[BrokerDropdown] Cache also failed:', cacheError)
          setBrokers([])
        }
      } finally {
        setLoading(false)
      }
    }

    loadBrokers()
  }, [isOnline])

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  const filtered = brokers.filter(b => b.broker_name.toLowerCase().includes(search.toLowerCase()))

  function handleSelect(broker: Broker) {
    setSelected(broker)
    setSearch(broker.broker_name)
    setOpen(false)
    onSelect(broker)
  }

  return (
    <div ref={containerRef} style={{ fontFamily: "Arial" }}>
      <div style={{ position: "relative", width: "100%" }}>
        <ModernInput
          type="text"
          placeholder={loading ? "Loading brokers..." : "Search broker..."}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setSelected(null); setOpen(true) }}
          onFocus={() => setOpen(true)}
          disabled={loading}
          style={{
            width: "100%", padding: "12px 14px", fontSize: 15,
            boxSizing: "border-box", borderRadius: 8,
            border: "1.5px solid #ccc",
            background: "white", color: "#171717",
            outline: "none", minHeight: 48,
            opacity: loading ? 0.6 : 1,
          }}
        />

        {!isOnline && brokers.length > 0 && (
          <div style={{
            position: "absolute", top: -28, right: 0,
            fontSize: 11, color: "#f5a623", fontWeight: "bold",
            background: "#fff8e1", padding: "4px 8px", borderRadius: 4,
          }}>
            📡 Using cached data
          </div>
        )}

        {open && filtered.length > 0 && (
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
                <div style={{ fontWeight: 500 }}>{broker.broker_name}</div>
                {broker.phone_number && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{broker.phone_number}</div>}
              </li>
            ))}
          </ul>
        )}

        {open && search && filtered.length === 0 && !loading && (
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