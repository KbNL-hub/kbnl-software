"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { formatAmount, parseAmount } from "@/lib/formatAmount"

type Officer = { officer_id: string; full_name: string; store_name: string }

type PendingStop = {
  stop_id: string
  plate_number: string
  driver_name: string
  quantity_offloaded: number
  stop_time: string
  trip_id: string
}

type StockBalance = {
  product: string
  balance: number
}

type Sale = {
  sale_id: string
  product: string
  quantity: number
  price_per_bag: number
  total_amount: number
  customer_name: string | null
  payment_mode: string
  sold_at: string
}

type SupplyLine = { product: string; quantity: string }

const PAYMENT_MODES = ["Cash", "Transfer", "POS", "Credit"]

export default function StoreOfficerDashboard() {
  const router = useRouter()
  const [officer, setOfficer] = useState<Officer | null>(null)
  const [pendingStops, setPendingStops] = useState<PendingStop[]>([])
  const [stock, setStock] = useState<StockBalance[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<"supply" | "sales" | "stock">("supply")
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Supply confirmation modal
  const [confirmingStop, setConfirmingStop] = useState<PendingStop | null>(null)
  const [supplyLines, setSupplyLines] = useState<SupplyLine[]>([{ product: "", quantity: "" }])
  const [confirmError, setConfirmError] = useState("")
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [allProducts, setAllProducts] = useState<string[]>([])

  // Log sale modal
  const [showSaleModal, setShowSaleModal] = useState(false)
  const [saleProduct, setSaleProduct] = useState("")
  const [saleQty, setSaleQty] = useState("")
  const [salePrice, setSalePrice] = useState("")
  const [saleCustomer, setSaleCustomer] = useState("")
  const [salePayment, setSalePayment] = useState("")
  const [saleError, setSaleError] = useState("")
  const [saleLoading, setSaleLoading] = useState(false)

  // Sales filter
  const [salesFilter, setSalesFilter] = useState("All")

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.push("/login")
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push("/login"); return }

    const { data: profile } = await supabase
      .from("Profiles").select("role").eq("user_id", session.user.id).single()
    if (profile?.role !== "StoreOfficer") { router.push("/login"); return }

    const { data: officerData } = await supabase
      .from("store_officers")
      .select("officer_id, full_name, store_name")
      .eq("officer_id", session.user.id)
      .single()
    if (!officerData) { router.push("/login"); return }

    setOfficer(officerData)

    const { data: productsData } = await supabase.rpc("get_products")
    if (productsData) setAllProducts(productsData.map((r: { value: string }) => r.value))

    await Promise.all([
      fetchPendingStops(officerData.store_name),
      fetchStock(officerData.store_name),
      fetchSales(officerData.officer_id),
    ])
    setLoading(false)
  }

  useEffect(() => {
    if (!officer) return
    const interval = setInterval(() => {
      fetchPendingStops(officer.store_name)
      fetchStock(officer.store_name)
      setLastUpdated(new Date())
    }, 30000)
    return () => clearInterval(interval)
  }, [officer])

  async function fetchPendingStops(storeName: string) {
    const { data: stops } = await supabase
      .from("Stops")
      .select("stop_id, trip_id, quantity_offloaded, stop_time, stop_location")
      .eq("stop_location", storeName)
      .eq("confirmed", false)
      .eq("disputed", false)
      .order("stop_time", { ascending: false })

    if (!stops) return

    const enriched = await Promise.all(stops.map(async (s) => {
      const { data: trip } = await supabase
        .from("Trips").select("plate_number, driver_id").eq("trip_id", s.trip_id).single()
      const { data: driver } = trip?.driver_id
        ? await supabase.from("Drivers").select("full_name").eq("driver_id", trip.driver_id).single()
        : { data: null }

      return {
        stop_id: s.stop_id,
        trip_id: s.trip_id,
        plate_number: trip?.plate_number ?? "Unknown",
        driver_name: (driver as any)?.full_name ?? "Unknown",
        quantity_offloaded: s.quantity_offloaded,
        stop_time: s.stop_time,
      }
    }))

    setPendingStops(enriched)
    setLastUpdated(new Date())
  }

  async function fetchStock(storeName: string) {
    const { data } = await supabase
      .from("store_stock")
      .select("product, balance")
      .eq("store_name", storeName)
      .order("product", { ascending: true })
    setStock(data || [])
  }

  async function fetchSales(officerId: string) {
    const { data } = await supabase
      .from("store_sales")
      .select("sale_id, product, quantity, price_per_bag, total_amount, customer_name, payment_mode, sold_at")
      .eq("officer_id", officerId)
      .order("sold_at", { ascending: false })
    setSales(data || [])
  }

  // Supply line helpers
  function addSupplyLine() {
    setSupplyLines([...supplyLines, { product: "", quantity: "" }])
  }

  function removeSupplyLine(index: number) {
    if (supplyLines.length === 1) return
    setSupplyLines(supplyLines.filter((_, i) => i !== index))
  }

  function updateSupplyLine(index: number, field: "product" | "quantity", value: string) {
    setSupplyLines(supplyLines.map((l, i) => i === index ? { ...l, [field]: value } : l))
    setConfirmError("")
  }

  async function handleConfirmSupply() {
    if (!confirmingStop || !officer) return

    // Validate lines
    const totalInLines = supplyLines.reduce((sum, l) => sum + (parseInt(l.quantity) || 0), 0)
    if (supplyLines.some(l => !l.product)) return setConfirmError("Select a product for each line")
    if (supplyLines.some(l => !l.quantity || parseInt(l.quantity) <= 0)) return setConfirmError("Enter a valid quantity for each line")
    if (totalInLines !== confirmingStop.quantity_offloaded) return setConfirmError(`Total quantity in lines (${totalInLines}) must equal bags delivered (${confirmingStop.quantity_offloaded})`)

    // Check for duplicate products
    const products = supplyLines.map(l => l.product)
    if (new Set(products).size !== products.length) return setConfirmError("Duplicate products — merge them into one line")

    setConfirmLoading(true)

    // Insert supply confirmation
    const { data: confirmation, error: confError } = await supabase
      .from("store_supply_confirmations")
      .insert([{
        stop_id: confirmingStop.stop_id,
        officer_id: officer.officer_id,
        store_name: officer.store_name,
      }])
      .select()
      .single()

    if (confError || !confirmation) { setConfirmError("Failed to confirm supply"); setConfirmLoading(false); return }

    // Insert supply lines
    const { error: linesError } = await supabase
      .from("store_supply_lines")
      .insert(supplyLines.map(l => ({
        confirmation_id: confirmation.confirmation_id,
        product: l.product,
        quantity: parseInt(l.quantity),
      })))

    if (linesError) { setConfirmError("Supply confirmed but product lines failed"); setConfirmLoading(false); return }

    // Mark stop as confirmed
    await supabase.from("Stops").update({ confirmed: true }).eq("stop_id", confirmingStop.stop_id)

    // Update stock balances per product (upsert)
    for (const line of supplyLines) {
      const qty = parseInt(line.quantity)
      const { data: existing } = await supabase
        .from("store_stock")
        .select("balance")
        .eq("store_name", officer.store_name)
        .eq("product", line.product)
        .single()

      if (existing) {
        await supabase
          .from("store_stock")
          .update({ balance: existing.balance + qty, updated_at: new Date().toISOString() })
          .eq("store_name", officer.store_name)
          .eq("product", line.product)
      } else {
        await supabase
          .from("store_stock")
          .insert([{ store_name: officer.store_name, product: line.product, balance: qty }])
      }
    }

    setConfirmLoading(false)
    setConfirmingStop(null)
    setSupplyLines([{ product: "", quantity: "" }])
    setConfirmError("")
    await Promise.all([
      fetchPendingStops(officer.store_name),
      fetchStock(officer.store_name),
    ])
  }

  async function handleLogSale() {
    if (!officer) return
    if (!saleProduct) return setSaleError("Select a product")
    const qty = parseInt(saleQty)
    if (!saleQty || qty <= 0) return setSaleError("Enter a valid quantity")
    const price = parseAmount(salePrice)
    if (!salePrice || price <= 0) return setSaleError("Enter a valid price per bag")
    if (!salePayment) return setSaleError("Select a payment mode")

    // Check stock
    const stockItem = stock.find(s => s.product === saleProduct)
    if (!stockItem || stockItem.balance < qty) return setSaleError(`Insufficient stock — only ${stockItem?.balance ?? 0} bags of ${saleProduct} available`)

    setSaleLoading(true)

    const { error: saleErr } = await supabase.from("store_sales").insert([{
      officer_id: officer.officer_id,
      store_name: officer.store_name,
      product: saleProduct,
      quantity: qty,
      price_per_bag: price,
      customer_name: saleCustomer.trim() || null,
      payment_mode: salePayment,
    }])

    if (saleErr) { setSaleError("Failed to log sale"); setSaleLoading(false); return }

    // Deduct from stock
    await supabase
      .from("store_stock")
      .update({ balance: stockItem.balance - qty, updated_at: new Date().toISOString() })
      .eq("store_name", officer.store_name)
      .eq("product", saleProduct)

    setSaleLoading(false)
    setShowSaleModal(false)
    setSaleProduct(""); setSaleQty(""); setSalePrice(""); setSaleCustomer(""); setSalePayment(""); setSaleError("")
    await Promise.all([fetchSales(officer.officer_id), fetchStock(officer.store_name)])
  }

  const filteredSales = salesFilter === "All"
    ? sales
    : sales.filter(s => s.product === salesFilter)

  const uniqueProducts = [...new Set(sales.map(s => s.product))]

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "Arial" }}>
      <p style={{ color: "#888" }}>Loading...</p>
    </div>
  )

  return (
    <div style={{ minHeight: "100vh", background: "#f9f9f9", fontFamily: "Arial" }}>

      {/* Header */}
      <div style={{ background: "white", borderBottom: "1px solid #eee", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Store Officer</h2>
          <p style={{ margin: 0, fontSize: 13, color: "#888" }}>{officer?.full_name} · {officer?.store_name}</p>
        </div>
        <button
          onClick={async () => { await supabase.auth.signOut(); router.push("/login") }}
          style={{ padding: "8px 20px", background: "#ff4444", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14 }}
        >
          Logout
        </button>
      </div>

      <div style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>

        {/* Stock Summary */}
        <div style={{ background: "white", border: "1px solid #eee", borderRadius: 12, padding: 20, marginBottom: 24, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
          <p style={{ margin: "0 0 12px", fontWeight: "bold", fontSize: 15 }}>Stock Balance</p>
          {stock.length === 0
            ? <p style={{ color: "#888", fontSize: 13, margin: 0 }}>No stock recorded yet.</p>
            : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {stock.map(s => (
                  <div key={s.product} style={{ background: "#f0f7ff", border: "1px solid #0070f322", borderRadius: 8, padding: "10px 16px", minWidth: 120 }}>
                    <p style={{ margin: 0, fontSize: 12, color: "#888" }}>{s.product}</p>
                    <p style={{ margin: "4px 0 0", fontWeight: "bold", fontSize: 20, color: s.balance === 0 ? "#ff4444" : s.balance < 50 ? "#f5a623" : "#0070f3" }}>
                      {s.balance}
                      <span style={{ fontSize: 12, fontWeight: "normal", color: "#888" }}> bags</span>
                    </p>
                  </div>
                ))}
              </div>
            )
          }
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {(["supply", "sales", "stock"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "8px 20px", borderRadius: 20, fontSize: 13, cursor: "pointer",
                border: "1px solid #ddd",
                background: tab === t ? "#0070f3" : "white",
                color: tab === t ? "white" : "#333",
                fontWeight: tab === t ? "bold" : "normal",
                position: "relative"
              }}
            >
              {t === "supply" ? "Incoming Supplies" : t === "sales" ? "Sales" : "Stock History"}
              {t === "supply" && pendingStops.length > 0 && (
                <span style={{
                  position: "absolute", top: -6, right: -6,
                  background: "#ff4444", color: "white", borderRadius: "50%",
                  width: 18, height: 18, fontSize: 11, fontWeight: "bold",
                  display: "flex", alignItems: "center", justifyContent: "center"
                }}>
                  {pendingStops.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Supply Tab */}
        {tab === "supply" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <p style={{ margin: 0, fontWeight: "bold" }}>Pending Supplies ({pendingStops.length})</p>
              <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: "#888" }}>
                {lastUpdated && `Updated: ${lastUpdated.toLocaleTimeString()}`}
                <button onClick={() => officer && fetchPendingStops(officer.store_name)} style={{ padding: "4px 12px", fontSize: 12, cursor: "pointer", borderRadius: 4, border: "1px solid #ddd", background: "white" }}>
                  Refresh
                </button>
              </div>
            </div>

            {pendingStops.length === 0 && <p style={{ color: "#888" }}>No pending supplies.</p>}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {pendingStops.map(stop => (
                <div key={stop.stop_id} style={{ background: "white", border: "1px solid #eee", borderRadius: 10, padding: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: "bold", fontSize: 15 }}>{stop.plate_number}</p>
                      <p style={{ margin: "4px 0 0", fontSize: 13, color: "#555" }}>{stop.driver_name}</p>
                      <p style={{ margin: "4px 0 0", fontSize: 12, color: "#aaa" }}>{new Date(stop.stop_time).toLocaleString()}</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ margin: 0, fontSize: 12, color: "#888" }}>Bags delivered</p>
                      <p style={{ margin: "2px 0 0", fontWeight: "bold", fontSize: 22, color: "#0070f3" }}>{stop.quantity_offloaded}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setConfirmingStop(stop); setSupplyLines([{ product: "", quantity: "" }]); setConfirmError("") }}
                    style={{ width: "100%", padding: "10px 0", background: "#0070f3", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold", fontSize: 14 }}
                  >
                    Confirm Supply
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sales Tab */}
        {tab === "sales" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["All", ...uniqueProducts].map(f => (
                  <button
                    key={f}
                    onClick={() => setSalesFilter(f)}
                    style={{
                      padding: "6px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer",
                      border: "1px solid #ddd",
                      background: salesFilter === f ? "#0070f3" : "white",
                      color: salesFilter === f ? "white" : "#333",
                      fontWeight: salesFilter === f ? "bold" : "normal"
                    }}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <button
                onClick={() => { setShowSaleModal(true); setSaleError("") }}
                style={{ padding: "8px 16px", background: "#0070f3", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold", fontSize: 13 }}
              >
                + Log Sale
              </button>
            </div>

            {filteredSales.length === 0 && <p style={{ color: "#888" }}>No sales logged yet.</p>}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {filteredSales.map(sale => (
                <div key={sale.sale_id} style={{ background: "white", border: "1px solid #eee", borderRadius: 10, padding: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: "bold", fontSize: 15 }}>{sale.product}</p>
                      {sale.customer_name && <p style={{ margin: "4px 0 0", fontSize: 13, color: "#555" }}>{sale.customer_name}</p>}
                      <p style={{ margin: "4px 0 0", fontSize: 12, color: "#aaa" }}>{new Date(sale.sold_at).toLocaleString()}</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ margin: 0, fontWeight: "bold", fontSize: 18, color: "#00aa00" }}>₦{sale.total_amount.toLocaleString()}</p>
                      <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 10, background: "#f0f0f0", color: "#555" }}>{sale.payment_mode}</span>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div style={{ background: "#f9f9f9", borderRadius: 6, padding: "8px 12px" }}>
                      <p style={{ margin: 0, fontSize: 11, color: "#888" }}>Bags Sold</p>
                      <p style={{ margin: 0, fontWeight: "bold" }}>{sale.quantity}</p>
                    </div>
                    <div style={{ background: "#f9f9f9", borderRadius: 6, padding: "8px 12px" }}>
                      <p style={{ margin: 0, fontSize: 11, color: "#888" }}>Price/Bag</p>
                      <p style={{ margin: 0, fontWeight: "bold" }}>₦{sale.price_per_bag.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stock History Tab */}
        {tab === "stock" && (
          <div>
            <p style={{ fontWeight: "bold", marginBottom: 16 }}>Current Stock by Product</p>
            {stock.length === 0 && <p style={{ color: "#888" }}>No stock data yet.</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {stock.map(s => (
                <div key={s.product} style={{ background: "white", border: "1px solid #eee", borderRadius: 10, padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <p style={{ margin: 0, fontWeight: "bold", fontSize: 15 }}>{s.product}</p>
                  <p style={{ margin: 0, fontWeight: "bold", fontSize: 20, color: s.balance === 0 ? "#ff4444" : s.balance < 50 ? "#f5a623" : "#0070f3" }}>
                    {s.balance} <span style={{ fontSize: 13, fontWeight: "normal", color: "#888" }}>bags</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Confirm Supply Modal */}
      {confirmingStop && (
        <div onClick={() => { setConfirmingStop(null); setSupplyLines([{ product: "", quantity: "" }]); setConfirmError("") }} style={overlay}>
          <div onClick={e => e.stopPropagation()} style={{ ...modal, width: 500 }}>
            <h3 style={{ marginBottom: 4 }}>Confirm Supply</h3>
            <p style={{ color: "#888", fontSize: 13, marginBottom: 4 }}>
              {confirmingStop.plate_number} · {confirmingStop.driver_name}
            </p>
            <p style={{ color: "#555", fontSize: 13, marginBottom: 20 }}>
              Total bags delivered: <strong>{confirmingStop.quantity_offloaded}</strong>
            </p>

            <p style={{ fontWeight: "bold", fontSize: 14, marginBottom: 8 }}>Breakdown by Product *</p>
            <p style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>Total must equal bags delivered</p>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {supplyLines.map((line, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <select
                    value={line.product}
                    onChange={e => updateSupplyLine(i, "product", e.target.value)}
                    style={{ flex: 2, padding: 10, borderRadius: 6, border: "1px solid #ddd", fontSize: 14 }}
                  >
                    <option value="">Select product</option>
                    {allProducts.map(p => (<option key={p} value={p}>{p}</option>))}
                  </select>
                  <input
                    type="number"
                    placeholder="Qty"
                    value={line.quantity}
                    onChange={e => updateSupplyLine(i, "quantity", e.target.value)}
                    style={{ flex: 1, padding: 10, borderRadius: 6, border: "1px solid #ddd", fontSize: 14 }}
                  />
                  {supplyLines.length > 1 && (
                    <button onClick={() => removeSupplyLine(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ff4444", fontSize: 18, lineHeight: 1 }}>✕</button>
                  )}
                </div>
              ))}
            </div>

            {/* Running total */}
            <div style={{ padding: "8px 12px", background: "#f9f9f9", borderRadius: 6, marginBottom: 16 }}>
              <p style={{ margin: 0, fontSize: 13 }}>
                Total entered: <strong style={{
                  color: supplyLines.reduce((s, l) => s + (parseInt(l.quantity) || 0), 0) === confirmingStop.quantity_offloaded ? "#00aa00" : "#f5a623"
                }}>
                  {supplyLines.reduce((s, l) => s + (parseInt(l.quantity) || 0), 0)}
                </strong> / {confirmingStop.quantity_offloaded}
              </p>
            </div>

            <button
              onClick={addSupplyLine}
              style={{ width: "100%", padding: "8px 0", background: "white", border: "1px dashed #0070f3", color: "#0070f3", borderRadius: 6, cursor: "pointer", fontSize: 13, marginBottom: 20 }}
            >
              + Add Product Line
            </button>

            {confirmError && <p style={{ color: "red", fontSize: 13, marginBottom: 12 }}>{confirmError}</p>}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setConfirmingStop(null); setSupplyLines([{ product: "", quantity: "" }]); setConfirmError("") }} style={cancelBtn}>Cancel</button>
              <button onClick={handleConfirmSupply} disabled={confirmLoading} style={primaryBtn}>
                {confirmLoading ? "Confirming..." : "Confirm Supply"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Log Sale Modal */}
      {showSaleModal && (
        <div onClick={() => { setShowSaleModal(false); setSaleProduct(""); setSaleQty(""); setSalePrice(""); setSaleCustomer(""); setSalePayment(""); setSaleError("") }} style={overlay}>
          <div onClick={e => e.stopPropagation()} style={modal}>
            <h3 style={{ marginBottom: 20 }}>Log Sale</h3>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Product *</label>
              <select value={saleProduct} onChange={e => { setSaleProduct(e.target.value); setSaleError("") }} style={inputStyle}>
                <option value="">Select product</option>
                {stock.filter(s => s.balance > 0).map(s => (
                  <option key={s.product} value={s.product}>{s.product} ({s.balance} bags available)</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Quantity (bags) *</label>
              <input type="number" placeholder="e.g. 50" value={saleQty} onChange={e => { setSaleQty(e.target.value); setSaleError("") }} style={inputStyle} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Price per Bag (₦) *</label>
              <input type="text" inputMode="numeric" placeholder="e.g. 12,000" value={salePrice} onChange={e => { setSalePrice(formatAmount(e.target.value)); setSaleError("") }} style={inputStyle} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Customer Name (optional)</label>
              <input type="text" placeholder="e.g. Emeka Okafor" value={saleCustomer} onChange={e => { setSaleCustomer(e.target.value) }} style={inputStyle} />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={labelStyle}>Payment Mode *</label>
              <select value={salePayment} onChange={e => { setSalePayment(e.target.value); setSaleError("") }} style={inputStyle}>
                <option value="">Select payment mode</option>
                {PAYMENT_MODES.map(m => (<option key={m} value={m}>{m}</option>))}
              </select>
            </div>

            {saleError && <p style={{ color: "red", fontSize: 13, marginBottom: 12 }}>{saleError}</p>}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setShowSaleModal(false); setSaleProduct(""); setSaleQty(""); setSalePrice(""); setSaleCustomer(""); setSalePayment(""); setSaleError("") }} style={cancelBtn}>Cancel</button>
              <button onClick={handleLogSale} disabled={saleLoading} style={primaryBtn}>
                {saleLoading ? "Logging..." : "Log Sale"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }
const modal: React.CSSProperties = { background: "white", borderRadius: 12, padding: 32, width: 420, maxWidth: "90vw", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }
const labelStyle: React.CSSProperties = { display: "block", fontWeight: "bold", marginBottom: 6, fontSize: 14 }
const inputStyle: React.CSSProperties = { width: "100%", padding: 10, boxSizing: "border-box", borderRadius: 6, border: "1px solid #ddd", fontSize: 14 }
const primaryBtn: React.CSSProperties = { flex: 1, padding: "10px 0", background: "#0070f3", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold" }
const cancelBtn: React.CSSProperties = { flex: 1, padding: "10px 0", background: "white", border: "1px solid #ddd", borderRadius: 6, cursor: "pointer" }