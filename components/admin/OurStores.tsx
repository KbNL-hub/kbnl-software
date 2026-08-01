"use client"

import { FONT_SIZE } from "@/lib/constants"
import { usePolling } from "@/lib/hooks/usePolling"
import React, { useState, useEffect, useCallback, useRef } from "react"
import { supabase } from "@/lib/supabase"
import { apiMutate } from "@/lib/api-mutation"
import ModernInput from "@/components/ModernInput"
import { usePermissions } from "@/lib/PermissionContext"
import { invalidateStoreCache } from "@/lib/stores"
import { useBreakpoint } from "@/app/hooks/useBreakpoint"

type StoreRow = {
  store_id: string
  store_name: string
  created_at: string
}

type OfficerInfo = {
  officer_id: string
  full_name: string
  phone_number: string | null
  store_name: string
}

type StockInfo = {
  store_name: string
  total_balance: number
  products: { product: string; balance: number }[]
}

type ViewMode = "card" | "table"

export default function OurStores() {
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"

  const { getAccess } = usePermissions()
  const canEdit = getAccess("our-stores").canEdit
  const canView = getAccess("our-stores").canView

  const [stores, setStores] = useState<StoreRow[]>([])
  const [officers, setOfficers] = useState<OfficerInfo[]>([])
  const [stockData, setStockData] = useState<StockInfo[]>([])
  const [allProducts, setAllProducts] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>("card")

  const [showAddModal, setShowAddModal] = useState(false)
  const [showStockModal, setShowStockModal] = useState(false)
  const [editingStore, setEditingStore] = useState<StoreRow | null>(null)
  const [expandedStore, setExpandedStore] = useState<string | null>(null)

  const [newStoreName, setNewStoreName] = useState("")
  const [editProducts, setEditProducts] = useState<{ product: string; balance: string }[]>([])
  const [originalProducts, setOriginalProducts] = useState<string[]>([])
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const nameRef = useRef<HTMLInputElement>(null)

  const loadAll = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true)

    const [storesRes, officersRes, stockRes, productsRes] = await Promise.all([
      supabase.from("stores").select("store_id, store_name, created_at").order("store_name"),
      supabase.from("store_officers").select("officer_id, full_name, phone_number, store_name").eq("status", "Active"),
      supabase.from("store_stock").select("store_name, product, balance"),
      supabase.rpc("get_products"),
    ])

    setStores(storesRes.data || [])
    setOfficers(officersRes.data || [])
    if (productsRes.data) setAllProducts(productsRes.data.map((r: { value: string }) => r.value))

    const stockMap = new Map<string, { product: string; balance: number }[]>()
    for (const row of stockRes.data || []) {
      const arr = stockMap.get(row.store_name) || []
      arr.push({ product: row.product, balance: row.balance })
      stockMap.set(row.store_name, arr)
    }

    const aggregated: StockInfo[] = []
    for (const [storeName, products] of stockMap) {
      aggregated.push({
        store_name: storeName,
        total_balance: products.reduce((sum, p) => sum + p.balance, 0),
        products,
      })
    }
    setStockData(aggregated)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  usePolling(() => loadAll(false), 120000)

  function closeModals() {
    setShowAddModal(false)
    setShowStockModal(false)
    setEditingStore(null)
    setNewStoreName("")
    setEditProducts([])
    setOriginalProducts([])
    setMessage("")
  }

  function getOfficer(storeName: string) {
    return officers.find(o => o.store_name === storeName)
  }

  function getStock(storeName: string) {
    return stockData.find(s => s.store_name === storeName)
  }

  async function handleAddStore() {
    if (!canEdit) return
    if (!newStoreName.trim()) return setMessage("Store name is required")

    const trimmed = newStoreName.trim()
    if (stores.some(s => s.store_name.toLowerCase() === trimmed.toLowerCase())) {
      return setMessage("A store with this name already exists")
    }

    setSubmitting(true)
    try {
      const { error } = await apiMutate("admin", {
        action: "insert",
        table: "stores",
        data: { store_name: trimmed },
      })
      if (error) {
        setMessage("Failed to add store")
        return
      }
      invalidateStoreCache()
      closeModals()
      loadAll()
    } catch {
      setMessage("Network error, please try again")
    } finally {
      setSubmitting(false)
    }
  }

  function openStockModal(store: StoreRow) {
    const stock = getStock(store.store_name)
    setEditingStore(store)
    if (stock && stock.products.length > 0) {
      setOriginalProducts(stock.products.map(p => p.product))
      setEditProducts(stock.products.map(p => ({
        product: p.product,
        balance: String(p.balance),
      })))
    } else {
      setOriginalProducts([])
      setEditProducts([{ product: "", balance: "" }])
    }
    setShowStockModal(true)
    setMessage("")
  }

  async function handleSaveStock() {
    if (!canEdit || !editingStore) return

    const valid = editProducts.filter(p => p.product.trim() && p.balance !== "")
    if (valid.length === 0) return setMessage("Add at least one product with a balance")

    setSubmitting(true)
    try {
      for (const line of valid) {
        const qty = parseInt(line.balance, 10)
        if (isNaN(qty) || qty < 0) {
          setMessage(`Invalid balance for ${line.product}`)
          setSubmitting(false)
          return
        }

        const { data: existing } = await supabase
          .from("store_stock")
          .select("balance")
          .eq("store_name", editingStore.store_name)
          .eq("product", line.product.trim())
          .single()

        if (existing) {
          const { error } = await apiMutate("finance", {
            action: "update",
            table: "store_stock",
            data: { balance: qty, updated_at: new Date().toISOString() },
            filters: { store_name: editingStore.store_name, product: line.product.trim() },
          })
          if (error) {
            setMessage("Failed to update stock")
            setSubmitting(false)
            return
          }
        } else {
          const { error } = await apiMutate("finance", {
            action: "insert",
            table: "store_stock",
            data: {
              store_name: editingStore.store_name,
              product: line.product.trim(),
              balance: qty,
            },
          })
          if (error) {
            setMessage("Failed to save stock")
            setSubmitting(false)
            return
          }
        }
      }

      const savedProducts = new Set(valid.map(v => v.product.trim()))
      for (const origProduct of originalProducts) {
        if (!savedProducts.has(origProduct)) {
          await apiMutate("finance", {
            action: "delete",
            table: "store_stock",
            filters: { store_name: editingStore.store_name, product: origProduct },
          })
        }
      }

      closeModals()
      loadAll(false)
    } catch {
      setMessage("Network error, please try again")
    } finally {
      setSubmitting(false)
    }
  }

  if (!canView) return null

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    boxSizing: "border-box",
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    fontSize: FONT_SIZE.base,
    background: "white",
    color: "#0f172a",
    minHeight: 48,
    transition: "border-color 0.2s ease",
  }

  const labelStyle: React.CSSProperties = {
    display: "block",
    marginBottom: 6,
    color: "#475569",
    fontSize: FONT_SIZE.sm,
    fontWeight: 500,
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        padding: isMobile ? "16px" : "32px",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          justifyContent: "space-between",
          alignItems: isMobile ? "flex-start" : "center",
          gap: 16,
          marginBottom: 32,
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              color: "#0f172a",
              fontSize: isMobile ? FONT_SIZE["2xl"] : FONT_SIZE["3xl"],
              fontWeight: 700,
              letterSpacing: "-0.5px",
            }}
          >
            Our Stores
          </h1>
          <p
            style={{
              margin: "8px 0 0",
              color: "#64748b",
              fontSize: FONT_SIZE.base,
            }}
          >
            View and manage all store locations, officers, and stock balances.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            width: isMobile ? "100%" : "auto",
          }}
        >
          {/* View Toggle */}
          {stores.length > 0 && (
            <div
              style={{
                display: "flex",
                background: "white",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                padding: 4,
                gap: 0,
              }}
            >
              <button
                onClick={() => setViewMode("card")}
                style={{
                  padding: "8px 12px",
                  background: viewMode === "card" ? "#0070f3" : "transparent",
                  color: viewMode === "card" ? "white" : "#64748b",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: FONT_SIZE.xs,
                  fontWeight: 600,
                  transition: "all 0.2s ease",
                  minWidth: 44,
                  height: 40,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                title="Card view"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode("table")}
                style={{
                  padding: "8px 12px",
                  background: viewMode === "table" ? "#0070f3" : "transparent",
                  color: viewMode === "table" ? "white" : "#64748b",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: FONT_SIZE.xs,
                  fontWeight: 600,
                  transition: "all 0.2s ease",
                  minWidth: 44,
                  height: 40,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                title="Table view"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 4h18v2H3V4zm0 7h18v2H3v-2zm0 7h18v2H3v-2z" />
                </svg>
              </button>
            </div>
          )}

          {/* Add Store Button */}
          {canEdit && (
            <button
              onClick={() => {
                setShowAddModal(true)
                setMessage("")
              }}
              style={{
                padding: isMobile ? "10px 16px" : "12px 20px",
                background: "#0070f3",
                color: "white",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                fontWeight: 600,
                fontSize: FONT_SIZE.md,
                flex: isMobile ? 1 : "0 0 auto",
                boxShadow: "0 4px 12px rgba(0, 112, 243, 0.2)",
                transition: "all 0.2s ease",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                minHeight: 40,
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => {
                if (!isMobile) (e.currentTarget.style.transform = "translateY(-2px)")
              }}
              onMouseLeave={(e) => {
                if (!isMobile) (e.currentTarget.style.transform = "none")
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2c5.5 0 10 4.5 10 10s-4.5 10-10 10S2 17.5 2 12 6.5 2 12 2m0 2c-4.4 0-8 3.6-8 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8m3.5 9h-3v3h-1v-3h-3v-1h3v-3h1v3h3v1z" />
              </svg>
              Add Store
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "64px 0" }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              border: "3px solid #e2e8f0",
              borderTopColor: "#0070f3",
              animation: "spin 1s linear infinite",
            }}
          />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : stores.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "64px 24px",
            background: "white",
            borderRadius: 12,
            border: "1px solid #e2e8f0",
            boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              background: "#f1f5f9",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          <h3
            style={{
              margin: "0 0 8px",
              color: "#0f172a",
              fontSize: FONT_SIZE.xl,
              fontWeight: 600,
            }}
          >
            No stores yet
          </h3>
          <p
            style={{
              color: "#64748b",
              fontSize: FONT_SIZE.base,
              margin: "0 0 24px",
              maxWidth: 400,
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            Add your first store to get started. Stores will appear here with their assigned officers and stock balances.
          </p>
          {canEdit && (
            <button
              onClick={() => {
                setShowAddModal(true)
                setMessage("")
              }}
              style={{
                padding: "10px 20px",
                background: "white",
                color: "#0f172a",
                border: "1px solid #cbd5e1",
                borderRadius: 8,
                cursor: "pointer",
                fontWeight: 500,
                fontSize: FONT_SIZE.base,
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#f8fafc" }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "white" }}
            >
              Add First Store
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Card View */}
          {viewMode === "card" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {stores.map((store) => {
                const officer = getOfficer(store.store_name)
                const stock = getStock(store.store_name)
                return (
                  <div
                    key={store.store_id}
                    style={{
                      background: "white",
                      borderRadius: 12,
                      padding: 16,
                      border: "1px solid #e2e8f0",
                      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.08)"
                      e.currentTarget.style.borderColor = "#cbd5e1"
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.05)"
                      e.currentTarget.style.borderColor = "#e2e8f0"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                          <div
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 10,
                              background: "#f0f7ff",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0070f3" strokeWidth="2">
                              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                              <polyline points="9 22 9 12 15 12 15 22" />
                            </svg>
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <h3
                              style={{
                                margin: 0,
                                color: "#0f172a",
                                fontSize: FONT_SIZE.lg,
                                fontWeight: 600,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {store.store_name}
                            </h3>
                          </div>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 50 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                              <circle cx="12" cy="7" r="4" />
                            </svg>
                            <span style={{ color: "#64748b", fontSize: FONT_SIZE.sm }}>
                              {officer ? (
                                <span>
                                  <span style={{ color: "#0f172a", fontWeight: 500 }}>{officer.full_name}</span>
                                  {officer.phone_number && (
                                    <span style={{ marginLeft: 6, color: "#94a3b8" }}>
                                      {officer.phone_number}
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span style={{ fontStyle: "italic", color: "#94a3b8" }}>Unassigned</span>
                              )}
                            </span>
                          </div>

                          {stock && stock.products.length > 0 ? (
                            <div
                              onClick={() => setExpandedStore(expandedStore === store.store_name ? null : store.store_name)}
                              style={{
                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                padding: "8px 12px", borderRadius: 8, cursor: "pointer",
                                background: expandedStore === store.store_name ? "#f0f7ff" : "#f8fafc",
                                border: `1px solid ${expandedStore === store.store_name ? "#bfdbfe" : "#e2e8f0"}`,
                                transition: "all 0.2s ease", marginTop: 4,
                              }}
                              onMouseEnter={e => { if (expandedStore !== store.store_name) e.currentTarget.style.background = "#f1f5f9" }}
                              onMouseLeave={e => { if (expandedStore !== store.store_name) e.currentTarget.style.background = "#f8fafc" }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                                  <line x1="7" y1="7" x2="7.01" y2="7" />
                                </svg>
                                <span style={{ color: "#0f172a", fontWeight: 600, fontSize: FONT_SIZE.md }}>
                                  {stock.total_balance.toLocaleString()}
                                </span>
                                <span style={{ color: "#64748b", fontSize: FONT_SIZE.sm }}>bags</span>
                                <span style={{ color: "#94a3b8", fontSize: FONT_SIZE.xs }}>
                                  ({stock.products.length} product{stock.products.length !== 1 ? "s" : ""})
                                </span>
                              </div>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" style={{ transform: expandedStore === store.store_name ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", flexShrink: 0 }}>
                                <polyline points="6 9 12 15 18 9" />
                              </svg>
                            </div>
                          ) : (
                            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", fontSize: FONT_SIZE.sm, color: "#94a3b8", fontStyle: "italic" }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
                                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                                <line x1="7" y1="7" x2="7.01" y2="7" />
                              </svg>
                              No stock
                            </div>
                          )}

                          {expandedStore === store.store_name && stock && stock.products.length > 0 && (
                            <div style={{ marginTop: 6, padding: "10px 12px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                              {stock.products.map(p => (
                                <div key={p.product} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: FONT_SIZE.xs, borderBottom: "1px dashed #e2e8f0" }}>
                                  <span style={{ color: "#475569" }}>{p.product}</span>
                                  <span style={{ fontWeight: 600, color: "#0f172a" }}>{p.balance.toLocaleString()} bags</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Edit Stock Button */}
                      {canEdit && (
                        <button
                          onClick={() => openStockModal(store)}
                          style={{
                            padding: "8px 16px",
                            background: "white",
                            color: "#0070f3",
                            border: "1px solid #0070f3",
                            borderRadius: 8,
                            cursor: "pointer",
                            fontWeight: 600,
                            fontSize: FONT_SIZE.sm,
                            transition: "all 0.2s ease",
                            whiteSpace: "nowrap",
                            flexShrink: 0,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "#f0f7ff"
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "white"
                          }}
                        >
                          Edit Stock
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Table View */}
          {viewMode === "table" && (
            <div
              style={{
                background: "white",
                borderRadius: 12,
                border: "1px solid #e2e8f0",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
                overflowX: "auto",
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    {["Store Name", "Assigned Officer", "Phone", "Stock Balance", ...(canEdit ? ["Actions"] : [])].map(
                      (header) => (
                        <th
                          key={header}
                          style={{
                            padding: "12px 16px",
                            fontWeight: 600,
                            fontSize: FONT_SIZE.xs,
                            color: "#64748b",
                            textTransform: "uppercase",
                            letterSpacing: "0.5px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {header}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {stores.map((store, idx) => {
                    const officer = getOfficer(store.store_name)
                    const stock = getStock(store.store_name)
                    const isExpanded = expandedStore === store.store_name
                    return (
                      <React.Fragment key={store.store_id}>
                      <tr
                        style={{
                          borderBottom: idx === stores.length - 1 ? "none" : "1px solid #e2e8f0",
                          transition: "background 0.2s ease",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <td style={{ padding: "12px 16px", fontSize: FONT_SIZE.base, fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap" }}>
                          {store.store_name}
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: FONT_SIZE.base, color: officer ? "#0f172a" : "#94a3b8", fontStyle: officer ? "normal" : "italic" }}>
                          {officer ? officer.full_name : "Unassigned"}
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: FONT_SIZE.base, color: "#64748b" }}>
                          {officer?.phone_number || "—"}
                        </td>
                        <td
                          style={{ padding: "12px 16px", fontSize: FONT_SIZE.base, fontWeight: 600, color: "#0f172a", cursor: stock && stock.total_balance > 0 ? "pointer" : "default" }}
                          onClick={() => { if (stock && stock.total_balance > 0) setExpandedStore(expandedStore === store.store_name ? null : store.store_name) }}
                        >
                          {stock && stock.total_balance > 0 ? (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                              <span>
                                {stock.total_balance.toLocaleString()}
                                <span style={{ fontWeight: 400, color: "#64748b", marginLeft: 4 }}>bags</span>
                              </span>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" style={{ transform: expandedStore === store.store_name ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", flexShrink: 0 }}>
                                <polyline points="6 9 12 15 18 9" />
                              </svg>
                            </div>
                          ) : (
                            <span style={{ color: "#94a3b8", fontStyle: "italic", fontWeight: 400 }}>—</span>
                          )}
                        </td>
                        {canEdit && (
                          <td style={{ padding: "12px 16px" }}>
                            <button
                              onClick={() => openStockModal(store)}
                              style={{
                                padding: "6px 14px",
                                background: "white",
                                color: "#0070f3",
                                border: "1px solid #0070f3",
                                borderRadius: 6,
                                cursor: "pointer",
                                fontWeight: 600,
                                fontSize: FONT_SIZE.xs,
                                transition: "all 0.2s ease",
                                whiteSpace: "nowrap",
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = "#f0f7ff" }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = "white" }}
                            >
                              Edit Stock
                            </button>
                          </td>
                        )}
                      </tr>
                      {isExpanded && stock && stock.products.length > 0 && (
                        <tr>
                          <td colSpan={canEdit ? 5 : 4} style={{ padding: "0 16px 12px" }}>
                            <div style={{ padding: "10px 12px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                              {stock.products.map(p => (
                                <div key={p.product} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: FONT_SIZE.xs, borderBottom: "1px dashed #e2e8f0" }}>
                                  <span style={{ color: "#475569" }}>{p.product}</span>
                                  <span style={{ fontWeight: 600, color: "#0f172a" }}>{p.balance.toLocaleString()} bags</span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Add Store Modal */}
      {showAddModal && (
        <div
          onClick={closeModals}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white",
              borderRadius: 16,
              padding: 32,
              width: "100%",
              maxWidth: 420,
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h3 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>
                Add New Store
              </h3>
              <button
                onClick={closeModals}
                style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 4 }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 24 }}>
              <div>
                <label style={labelStyle}>Store Name *</label>
                <ModernInput
                  ref={nameRef}
                  type="text"
                  placeholder="e.g. Lagos Outlet"
                  value={newStoreName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewStoreName(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>

            {message && (
              <div
                style={{
                  padding: 12,
                  background: "#fef2f2",
                  borderLeft: "4px solid #ef4444",
                  borderRadius: 4,
                  marginBottom: 24,
                  color: "#b91c1c",
                  fontSize: FONT_SIZE.sm,
                }}
              >
                {message}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button
                onClick={closeModals}
                style={{
                  padding: "12px 16px",
                  background: "white",
                  border: "1px solid #cbd5e1",
                  color: "#475569",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: 15,
                  minHeight: 44,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddStore}
                disabled={submitting}
                style={{
                  padding: "12px 16px",
                  background: "#0070f3",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  cursor: submitting ? "not-allowed" : "pointer",
                  fontWeight: 700,
                  fontSize: 15,
                  minHeight: 44,
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? "Adding..." : "Add Store"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Stock Modal */}
      {showStockModal && editingStore && (
        <div
          onClick={closeModals}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white",
              borderRadius: 16,
              padding: 32,
              width: "100%",
              maxWidth: 480,
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <div>
                <h3 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>
                  Edit Stock
                </h3>
                <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: FONT_SIZE.sm }}>
                  {editingStore.store_name}
                </p>
              </div>
              <button
                onClick={closeModals}
                style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 4 }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 24 }}>
              {editProducts.map((line, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 120px auto",
                    gap: 8,
                    alignItems: "end",
                  }}
                >
                  <div>
                    {idx === 0 && <label style={labelStyle}>Product *</label>}
                    <select
                      value={line.product}
                      onChange={(e) => {
                        const next = [...editProducts]
                        next[idx].product = e.target.value
                        setEditProducts(next)
                      }}
                      style={{
                        ...inputStyle,
                        appearance: "none",
                        background: "#f9f9f9 url(\"data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%23999' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\") no-repeat right 14px center",
                      }}
                    >
                      <option value="">Select product</option>
                      {allProducts.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    {idx === 0 && <label style={labelStyle}>Balance *</label>}
                    <ModernInput
                      type="number"
                      placeholder="0"
                      value={line.balance}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const next = [...editProducts]
                        next[idx].balance = e.target.value
                        setEditProducts(next)
                      }}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    {idx === 0 && <label style={{ ...labelStyle, visibility: "hidden" }}>.</label>}
                    {editProducts.length > 1 && (
                      <button
                        onClick={() => {
                          setEditProducts(editProducts.filter((_, i) => i !== idx))
                        }}
                        style={{
                          width: 48,
                          height: 48,
                          background: "#fef2f2",
                          border: "1px solid #fecaca",
                          borderRadius: 8,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#ef4444",
                          transition: "all 0.2s ease",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "#fee2e2" }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "#fef2f2" }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}

              <button
                onClick={() => setEditProducts([...editProducts, { product: "", balance: "" }])}
                style={{
                  padding: "10px 16px",
                  background: "#f8fafc",
                  border: "1px dashed #cbd5e1",
                  borderRadius: 8,
                  cursor: "pointer",
                  color: "#475569",
                  fontWeight: 500,
                  fontSize: FONT_SIZE.sm,
                  transition: "all 0.2s ease",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#f1f5f9"
                  e.currentTarget.style.borderColor = "#94a3b8"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#f8fafc"
                  e.currentTarget.style.borderColor = "#cbd5e1"
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add Product
              </button>
            </div>

            {message && (
              <div
                style={{
                  padding: 12,
                  background: "#fef2f2",
                  borderLeft: "4px solid #ef4444",
                  borderRadius: 4,
                  marginBottom: 24,
                  color: "#b91c1c",
                  fontSize: FONT_SIZE.sm,
                }}
              >
                {message}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button
                onClick={closeModals}
                style={{
                  padding: "12px 16px",
                  background: "white",
                  border: "1px solid #cbd5e1",
                  color: "#475569",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: 15,
                  minHeight: 44,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveStock}
                disabled={submitting}
                style={{
                  padding: "12px 16px",
                  background: "#0070f3",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  cursor: submitting ? "not-allowed" : "pointer",
                  fontWeight: 700,
                  fontSize: 15,
                  minHeight: 44,
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? "Saving..." : "Save Stock"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
