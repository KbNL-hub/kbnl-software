"use client"

import { FONT_SIZE } from "@/lib/constants"
import { useEffect, useRef, useState, type CSSProperties } from "react"
import { Icon } from "@iconify/react"
import { supabase } from "@/lib/supabase"
import { apiMutate } from "@/lib/api-mutation"

export type ConfirmSupplyResult = {
  success: boolean
  confirmation_id: string
  stop_id: string
  store_name: string
  total_quantity: number
  discrepancy_quantity: number
  confirmed_at: string
  confirmed_by_name: string
  confirmed_by_role: string
}

type Props = {
  stopId: string
  storeName: string
  product: string
  offloadedQuantity: number
  onClose: () => void
  onConfirmed: (result: ConfirmSupplyResult) => void
}

type SupplyLine = {
  product: string
  quantity: string
}

const INPUT_STYLE: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  fontSize: FONT_SIZE.sm,
  color: "#0f172a",
  background: "white",
  boxSizing: "border-box",
  outline: "none",
}

const LABEL_STYLE: CSSProperties = {
  display: "block",
  marginBottom: 6,
  color: "#475569",
  fontSize: FONT_SIZE.xs,
  fontWeight: 600,
}

export default function ConfirmStoreSupplyModal({
  stopId,
  storeName,
  product,
  offloadedQuantity,
  onClose,
  onConfirmed,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const [lines, setLines] = useState<SupplyLine[]>([{
    product,
    quantity: offloadedQuantity > 0 ? String(offloadedQuantity) : "",
  }])
  const [products, setProducts] = useState<string[]>(product ? [product] : [])
  const [note, setNote] = useState("")
  // Set when the server rejects the submission for a missing note. That means
  // the server's offloaded quantity differs from the stale value this modal
  // loaded, so the note field must appear even though the local totals match.
  const [notePrompt, setNotePrompt] = useState(false)
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false

    async function loadProducts() {
      const { data, error: productsError } = await supabase.rpc("get_products")
      if (cancelled) return

      if (productsError) {
        console.error("Failed to load products", productsError)
        setLoadingProducts(false)
        return
      }

      const list = (data || [])
        .map((row: { value?: string }) => (row.value || "").trim())
        .filter(Boolean)

      if (product && !list.includes(product)) list.unshift(product)
      setProducts(list)
      setLoadingProducts(false)
    }

    void loadProducts()
    return () => { cancelled = true }
  }, [product])

  useEffect(() => {
    if (!previousFocusRef.current && document.activeElement instanceof HTMLElement) {
      previousFocusRef.current = document.activeElement
    }

    const dialog = dialogRef.current
    if (!dialog) return

    const focusable = dialog.querySelector<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    )
    ;(focusable ?? dialog).focus()

    return () => {
      const previousFocus = previousFocusRef.current
      if (previousFocus?.isConnected) previousFocus.focus()
      previousFocusRef.current = null
    }
  }, [])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !submitting) onClose()
      if (event.key !== "Tab") return

      const dialog = dialogRef.current
      if (!dialog) return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      )).filter(element => element.getClientRects().length > 0)

      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onClose, submitting])

  const enteredTotal = lines.reduce((sum, line) => {
    const quantity = Number(line.quantity)
    return sum + (Number.isFinite(quantity) ? quantity : 0)
  }, 0)
  const discrepancy = enteredTotal - offloadedQuantity
  const hasDiscrepancy = discrepancy !== 0
  const requiresNote = hasDiscrepancy || notePrompt

  function updateLine(index: number, field: keyof SupplyLine, value: string) {
    setLines(prev => prev.map((line, i) => i === index ? { ...line, [field]: value } : line))
    setError("")
  }

  function addLine() {
    setLines(prev => [...prev, { product: "", quantity: "" }])
    setError("")
  }

  function removeLine(index: number) {
    setLines(prev => prev.length === 1 ? prev : prev.filter((_, i) => i !== index))
    setError("")
  }

  async function handleSubmit() {
    setError("")

    const parsed = lines.map(line => ({
      product: line.product.trim(),
      quantity: Number(line.quantity),
    }))

    if (parsed.some(line => !line.product)) {
      setError("Select a product for each line.")
      return
    }
    if (parsed.some(line => !Number.isInteger(line.quantity) || line.quantity <= 0 || line.quantity > 2147483647)) {
      setError("Enter a valid quantity for each line.")
      return
    }

    const keys = parsed.map(line => line.product.toLowerCase())
    if (new Set(keys).size !== keys.length) {
      setError("Each product can only appear once. Merge duplicate lines.")
      return
    }

    const total = parsed.reduce((sum, line) => sum + line.quantity, 0)
    if ((total - offloadedQuantity !== 0 || notePrompt) && !note.trim()) {
      setError("Add a note explaining why the quantity differs from the driver's offloaded quantity.")
      return
    }

    setSubmitting(true)
    const { data, error: submitError } = await apiMutate<ConfirmSupplyResult>("trips", {
      action: "confirm_store_supply",
      data: {
        stop_id: stopId,
        lines: parsed,
        discrepancy_note: (total - offloadedQuantity !== 0 || notePrompt) ? note.trim() : "",
      },
    })
    setSubmitting(false)

    if (submitError || !data) {
      if (submitError && /note/i.test(submitError)) setNotePrompt(true)
      setError(submitError || "Failed to confirm supply.")
      return
    }

    onConfirmed(data)
  }

  return (
    <div
      onClick={() => { if (!submitting) onClose() }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.6)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 300,
        padding: 16,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Confirm store supply"
        tabIndex={-1}
        onClick={event => event.stopPropagation()}
        style={{
          background: "white",
          borderRadius: 12,
          padding: 28,
          width: "100%",
          maxWidth: 540,
          maxHeight: "92vh",
          overflowY: "auto",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 20 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: "#f0fdf4", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon icon="mdi:clipboard-check-outline" width={20} color="#059669" />
              </div>
              <h3 style={{ margin: 0, color: "#0f172a", fontSize: FONT_SIZE.xl, fontWeight: 700 }}>
                Confirm Store Supply
              </h3>
            </div>
            <p style={{ margin: 0, color: "#64748b", fontSize: FONT_SIZE.sm }}>
              {storeName}
            </p>
          </div>
          <button
            onClick={() => { if (!submitting) onClose() }}
            aria-label="Close"
            style={{ background: "none", border: "none", color: "#94a3b8", cursor: submitting ? "not-allowed" : "pointer", padding: 0, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 14px", marginBottom: 20 }}>
          <p style={{ margin: 0, color: "#475569", fontSize: FONT_SIZE.sm, lineHeight: 1.5 }}>
            This store has no active store officer. Confirming marks the stop as
            confirmed and adds the bags below to store stock.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
          {lines.map((line, index) => (
            <div key={index} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 90px 36px", gap: 8, alignItems: "end" }}>
              <div>
                {index === 0 && <label style={LABEL_STYLE}>Product</label>}
                <select
                  value={line.product}
                  onChange={event => updateLine(index, "product", event.target.value)}
                  disabled={loadingProducts || submitting}
                  style={INPUT_STYLE}
                >
                  <option value="">{loadingProducts ? "Loading products..." : "Select product"}</option>
                  {products.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div>
                {index === 0 && <label style={LABEL_STYLE}>Bags</label>}
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={line.quantity}
                  onChange={event => updateLine(index, "quantity", event.target.value)}
                  disabled={submitting}
                  placeholder="0"
                  style={INPUT_STYLE}
                />
              </div>
              <button
                onClick={() => removeLine(index)}
                disabled={lines.length === 1 || submitting}
                aria-label={`Remove line ${index + 1}`}
                title={lines.length === 1 ? "At least one line is required" : "Remove line"}
                style={{
                  width: 36,
                  height: 40,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  background: lines.length === 1 || submitting ? "#f8fafc" : "white",
                  color: lines.length === 1 || submitting ? "#cbd5e1" : "#ef4444",
                  cursor: lines.length === 1 || submitting ? "not-allowed" : "pointer",
                }}
              >
                <Icon icon="mdi:close" width={16} />
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={addLine}
          disabled={submitting}
          style={{
            width: "100%",
            padding: "10px 14px",
            marginBottom: 20,
            background: "white",
            color: submitting ? "#94a3b8" : "#0070f3",
            border: "1.5px dashed #bfdbfe",
            borderRadius: 8,
            cursor: submitting ? "not-allowed" : "pointer",
            fontWeight: 600,
            fontSize: FONT_SIZE.sm,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <Icon icon="mdi:plus" width={16} />
          Add Product
        </button>

        <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: FONT_SIZE.sm, padding: "4px 0" }}>
            <span style={{ color: "#64748b" }}>Driver offloaded</span>
            <span style={{ color: "#0f172a", fontWeight: 600 }}>{offloadedQuantity} bags</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: FONT_SIZE.sm, padding: "4px 0" }}>
            <span style={{ color: "#64748b" }}>You entered</span>
            <span style={{ color: "#0f172a", fontWeight: 600 }}>{enteredTotal} bags</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: FONT_SIZE.sm, padding: "4px 0" }}>
            <span style={{ color: "#64748b" }}>Difference</span>
            <span style={{ color: hasDiscrepancy ? "#c2410c" : "#16a34a", fontWeight: 700 }}>
              {hasDiscrepancy ? (discrepancy > 0 ? `+${discrepancy}` : discrepancy) : "None"}
            </span>
          </div>
        </div>

        {requiresNote && (
          <div style={{ background: "#fff7ed", border: "1px solid #fdba74", borderRadius: 8, padding: 12, marginBottom: 16 }}>
            <label style={{ ...LABEL_STYLE, color: "#c2410c", marginBottom: 8 }}>
              Note (required because the totals differ)
            </label>
            <textarea
              value={note}
              onChange={event => { setNote(event.target.value); setError("") }}
              disabled={submitting}
              rows={3}
              placeholder="Explain the difference"
              style={{ ...INPUT_STYLE, resize: "vertical", fontFamily: "inherit" }}
            />
          </div>
        )}

        {error && (
          <p style={{ margin: "0 0 16px", padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, color: "#b91c1c", fontSize: FONT_SIZE.sm }}>
            {error}
          </p>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <button
            onClick={onClose}
            disabled={submitting}
            style={{
              padding: "12px 16px",
              background: "white",
              color: submitting ? "#94a3b8" : "#475569",
              border: "1.5px solid #e2e8f0",
              borderRadius: 8,
              cursor: submitting ? "not-allowed" : "pointer",
              fontWeight: 600,
              fontSize: FONT_SIZE.md,
              minHeight: 44,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || loadingProducts}
            style={{
              padding: "12px 16px",
              background: submitting || loadingProducts ? "#94a3b8" : "#059669",
              color: "white",
              border: "none",
              borderRadius: 8,
              cursor: submitting || loadingProducts ? "not-allowed" : "pointer",
              fontWeight: 600,
              fontSize: FONT_SIZE.md,
              minHeight: 44,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <Icon icon="mdi:check-circle" width={18} />
            {submitting ? "Confirming..." : "Confirm Supply"}
          </button>
        </div>
      </div>
    </div>
  )
}
