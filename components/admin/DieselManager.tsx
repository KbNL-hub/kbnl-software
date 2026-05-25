"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { formatAmount, parseAmount } from "@/lib/formatAmount"

type FuelCompany = {
  company_id: string
  company_name: string
  current_balance: number
  low_balance_threshold: number
  created_at: string
}

type FuelRequest = {
  request_id: string
  driver_name: string
  company_name: string
  company_id: string
  litres: number
  rate_per_litre: number
  total_amount: number
  status: "Pending" | "Validated" | "Rejected"
  requested_at: string
}

const requestFilters = ["All", "Pending", "Validated", "Rejected"]

export default function DieselManager() {
  const [tab, setTab] = useState<"companies" | "requests">("companies")
  const [companies, setCompanies] = useState<FuelCompany[]>([])
  const [requests, setRequests] = useState<FuelRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [requestFilter, setRequestFilter] = useState("All")
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Add company
  const [showAddModal, setShowAddModal] = useState(false)
  const [newCompanyName, setNewCompanyName] = useState("")
  const [addError, setAddError] = useState("")
  const [addLoading, setAddLoading] = useState(false)

  // Edit company
  const [editingCompany, setEditingCompany] = useState<FuelCompany | null>(null)
  const [editName, setEditName] = useState("")
  const [editError, setEditError] = useState("")
  const [editLoading, setEditLoading] = useState(false)

  // Top-up
  const [toppingUp, setToppingUp] = useState<FuelCompany | null>(null)
  const [topUpAmount, setTopUpAmount] = useState("")
  const [topUpThreshold, setTopUpThreshold] = useState("")
  const [topUpNote, setTopUpNote] = useState("")
  const [topUpError, setTopUpError] = useState("")
  const [topUpLoading, setTopUpLoading] = useState(false)

  // Delete company
  const [deletingCompany, setDeletingCompany] = useState<FuelCompany | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Edit & Resubmit rejected request
  const [resubmitting, setResubmitting] = useState<FuelRequest | null>(null)
  const [resubmitLitres, setResubmitLitres] = useState("")
  const [resubmitRate, setResubmitRate] = useState("")
  const [resubmitError, setResubmitError] = useState("")
  const [resubmitLoading, setResubmitLoading] = useState(false)

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchRequests, 30000)
    return () => clearInterval(interval)
  }, [])

  async function fetchAll() {
    setLoading(true)
    await Promise.all([fetchCompanies(), fetchRequests()])
    setLoading(false)
  }

  async function fetchCompanies() {
    const { data } = await supabase
      .from("fuel_companies")
      .select("*")
      .order("created_at", { ascending: true })
    setCompanies(data || [])
  }

  async function fetchRequests() {
    const { data: requestsRaw } = await supabase
      .from("fuel_requests")
      .select("request_id, driver_id, company_id, litres, rate_per_litre, total_amount, status, requested_at")
      .order("requested_at", { ascending: false })

    if (!requestsRaw) return

    const enriched = await Promise.all(
      requestsRaw.map(async (r) => {
        const { data: driver } = await supabase
          .from("Drivers")
          .select("full_name")
          .eq("driver_id", r.driver_id)
          .single()

        const { data: company } = await supabase
          .from("fuel_companies")
          .select("company_name")
          .eq("company_id", r.company_id)
          .single()

        return {
          request_id: r.request_id,
          driver_name: driver?.full_name ?? "Unknown",
          company_name: company?.company_name ?? "Unknown",
          company_id: r.company_id,
          litres: r.litres,
          rate_per_litre: r.rate_per_litre,
          total_amount: r.total_amount,
          status: r.status,
          requested_at: r.requested_at,
        }
      })
    )

    setRequests(enriched)
    setLastUpdated(new Date())
  }

  async function handleAddCompany() {
    if (!newCompanyName.trim()) return setAddError("Company name is required")
    setAddLoading(true)
    const { error } = await supabase
      .from("fuel_companies")
      .insert([{ company_name: newCompanyName.trim() }])
    if (error) { setAddError("Failed to add company"); setAddLoading(false); return }
    setNewCompanyName("")
    setShowAddModal(false)
    setAddError("")
    setAddLoading(false)
    fetchCompanies()
  }

  async function handleEditCompany() {
    if (!editingCompany) return
    if (!editName.trim()) return setEditError("Company name is required")
    setEditLoading(true)
    const { error } = await supabase
      .from("fuel_companies")
      .update({ company_name: editName.trim() })
      .eq("company_id", editingCompany.company_id)
    if (error) { setEditError("Failed to update"); setEditLoading(false); return }
    setEditingCompany(null)
    setEditError("")
    setEditLoading(false)
    fetchCompanies()
  }

  async function handleTopUp() {
    if (!toppingUp) return
    if (!topUpAmount || parseAmount(topUpAmount) <= 0)
      return setTopUpError("Enter a valid amount")
    if (!topUpThreshold || parseAmount(topUpThreshold) <= 0)
      return setTopUpError("Enter a valid threshold")

    setTopUpLoading(true)
    const amount = parseAmount(topUpAmount)
    const threshold = parseAmount(topUpThreshold)
    const newBalance = toppingUp.current_balance + amount

    const { error: companyError } = await supabase
      .from("fuel_companies")
      .update({ current_balance: newBalance, low_balance_threshold: threshold })
      .eq("company_id", toppingUp.company_id)

    if (companyError) { setTopUpError("Failed to top up"); setTopUpLoading(false); return }

    await supabase.from("fuel_deposits").insert([{
      company_id: toppingUp.company_id,
      amount,
      note: topUpNote.trim() || null,
    }])

    setToppingUp(null)
    setTopUpAmount("")
    setTopUpThreshold("")
    setTopUpNote("")
    setTopUpError("")
    setTopUpLoading(false)
    fetchCompanies()
  }

  async function handleDeleteCompany() {
    if (!deletingCompany) return
    setDeleteLoading(true)
    await supabase.from("fuel_companies").delete().eq("company_id", deletingCompany.company_id)
    setDeletingCompany(null)
    setDeleteLoading(false)
    fetchCompanies()
  }

  async function handleResubmit() {
    if (!resubmitting) return
    if (!resubmitLitres || isNaN(Number(resubmitLitres)) || Number(resubmitLitres) <= 0)
      return setResubmitError("Enter valid litres")
    if (!resubmitRate || isNaN(Number(resubmitRate)) || Number(resubmitRate) <= 0)
      return setResubmitError("Enter valid rate per litre")

    setResubmitLoading(true)
    const { error } = await supabase
      .from("fuel_requests")
      .update({
        litres: Number(resubmitLitres),
        rate_per_litre: Number(resubmitRate),
        status: "Pending",
        rejection_reason: null,
      })
      .eq("request_id", resubmitting.request_id)

    if (error) { setResubmitError("Failed to resubmit"); setResubmitLoading(false); return }

    setResubmitting(null)
    setResubmitLitres("")
    setResubmitRate("")
    setResubmitError("")
    setResubmitLoading(false)
    fetchRequests()
  }

  const resubmitTotal = resubmitLitres && resubmitRate &&
    !isNaN(Number(resubmitLitres)) && !isNaN(Number(resubmitRate))
    ? Number(resubmitLitres) * Number(resubmitRate)
    : null

  const filteredRequests = requestFilter === "All"
    ? requests
    : requests.filter((r) => r.status === requestFilter)

  const statusColor = (status: string) => {
    switch (status) {
      case "Pending": return { bg: "#fff8e1", color: "#f5a623" }
      case "Validated": return { bg: "#00aa0022", color: "#00aa00" }
      case "Rejected": return { bg: "#ff444422", color: "#ff4444" }
      default: return { bg: "#eee", color: "#888" }
    }
  }

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>Diesel Manager</h2>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {(["companies", "requests"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "8px 20px", borderRadius: 20, fontSize: 13,
              cursor: "pointer", border: "1px solid #ddd",
              background: tab === t ? "#0070f3" : "white",
              color: tab === t ? "white" : "#333",
              fontWeight: tab === t ? "bold" : "normal",
              textTransform: "capitalize"
            }}
          >
            {t === "companies" ? "Fuel Companies" : "Fuel Requests"}
          </button>
        ))}
      </div>

      {loading && <p style={{ color: "#888" }}>Loading...</p>}

      {/* Companies Tab */}
      {!loading && tab === "companies" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
            <button
              onClick={() => { setShowAddModal(true); setAddError("") }}
              style={{
                padding: "8px 20px", background: "#0070f3", color: "white",
                border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14
              }}
            >
              + Add Company
            </button>
          </div>

          {companies.length === 0 && <p style={{ color: "#888" }}>No fuel companies added yet.</p>}

          <div style={{ display: "grid", gap: 12 }}>
            {companies.map((company) => {
              const isLow = company.current_balance < company.low_balance_threshold
              return (
                <div
                  key={company.company_id}
                  style={{
                    background: "white", border: `1px solid ${isLow ? "#f5a623" : "#eee"}`,
                    borderRadius: 10, padding: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.04)"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: "bold", fontSize: 16 }}>{company.company_name}</p>
                      <p style={{ margin: "6px 0 0", fontSize: 13, color: "#555" }}>
                        Balance:{" "}
                        <strong style={{ color: isLow ? "#f5a623" : "#00aa00" }}>
                          ₦{company.current_balance.toLocaleString()}
                        </strong>
                        {isLow && (
                          <span style={{
                            marginLeft: 8, fontSize: 11, background: "#fff8e1",
                            color: "#f5a623", padding: "2px 8px", borderRadius: 10,
                            fontWeight: "bold", border: "1px solid #f5a623"
                          }}>
                            ⚠️ Low
                          </span>
                        )}
                      </p>
                      <p style={{ margin: "4px 0 0", fontSize: 12, color: "#aaa" }}>
                        Threshold: ₦{company.low_balance_threshold.toLocaleString()}
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => { setToppingUp(company); setTopUpThreshold(String(company.low_balance_threshold)); setTopUpError("") }}
                        style={{ padding: "6px 14px", fontSize: 12, cursor: "pointer", background: "#00aa00", color: "white", border: "none", borderRadius: 6 }}
                      >
                        Top Up
                      </button>
                      <button
                        onClick={() => { setEditingCompany(company); setEditName(company.company_name); setEditError("") }}
                        style={{ padding: "6px 14px", fontSize: 12, cursor: "pointer", background: "white", border: "1px solid #ddd", borderRadius: 6 }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeletingCompany(company)}
                        style={{ padding: "6px 14px", fontSize: 12, cursor: "pointer", background: "#ff444422", color: "#ff4444", border: "1px solid #ff4444", borderRadius: 6 }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Requests Tab */}
      {!loading && tab === "requests" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {requestFilters.map((f) => (
                <button
                  key={f}
                  onClick={() => setRequestFilter(f)}
                  style={{
                    padding: "6px 14px", borderRadius: 20, fontSize: 13,
                    cursor: "pointer", border: "1px solid #ddd",
                    background: requestFilter === f ? "#0070f3" : "white",
                    color: requestFilter === f ? "white" : "#333",
                    fontWeight: requestFilter === f ? "bold" : "normal"
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: "#888", whiteSpace: "nowrap" }}>
              {lastUpdated && `Updated: ${lastUpdated.toLocaleTimeString()}`}
              <button
                onClick={fetchRequests}
                style={{ padding: "4px 12px", fontSize: 12, cursor: "pointer", borderRadius: 4, border: "1px solid #ddd", background: "white" }}
              >
                Refresh
              </button>
            </div>
          </div>

          {filteredRequests.length === 0 && <p style={{ color: "#888" }}>No requests found.</p>}

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "#f0f0f0", textAlign: "left" }}>
                  <th style={th}>Driver</th>
                  <th style={th}>Company</th>
                  <th style={th}>Litres</th>
                  <th style={th}>Rate/Litre</th>
                  <th style={th}>Total</th>
                  <th style={th}>Status</th>
                  <th style={th}>Requested</th>
                  <th style={th}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((r) => {
                  const { bg, color } = statusColor(r.status)
                  return (
                    <tr key={r.request_id} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={td}>{r.driver_name}</td>
                      <td style={td}>{r.company_name}</td>
                      <td style={td}>{r.litres.toLocaleString()}L</td>
                      <td style={td}>₦{r.rate_per_litre.toLocaleString()}</td>
                      <td style={td}><strong>₦{r.total_amount.toLocaleString()}</strong></td>
                      <td style={td}>
                        <span style={{ padding: "4px 10px", borderRadius: 12, fontSize: 12, background: bg, color, fontWeight: "bold" }}>
                          {r.status}
                        </span>
                      </td>
                      <td style={td}>{new Date(r.requested_at).toLocaleString()}</td>
                      <td style={td}>
                        {r.status === "Rejected" && (
                          <button
                            onClick={() => {
                              setResubmitting(r)
                              setResubmitLitres(String(r.litres))
                              setResubmitRate(String(r.rate_per_litre))
                              setResubmitError("")
                            }}
                            style={{
                              padding: "6px 12px", fontSize: 12, cursor: "pointer",
                              borderRadius: 4, border: "1px solid #0070f3",
                              color: "#0070f3", background: "white"
                            }}
                          >
                            Edit & Resubmit
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Company Modal */}
      {showAddModal && (
        <div onClick={() => setShowAddModal(false)} style={overlay}>
          <div onClick={(e) => e.stopPropagation()} style={modal}>
            <h3 style={{ marginBottom: 20 }}>Add Fuel Company</h3>
            <label style={label}>Company Name *</label>
            <input type="text" value={newCompanyName} onChange={(e) => { setNewCompanyName(e.target.value); setAddError("") }} onKeyDown={(e) => { if (e.key === "Enter") handleAddCompany() }} placeholder="e.g. NNPC, Total" style={input} autoFocus />
            {addError && <p style={errorText}>{addError}</p>}
            <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
              <button onClick={() => setShowAddModal(false)} style={cancelBtn}>Cancel</button>
              <button onClick={handleAddCompany} disabled={addLoading} style={primaryBtn}>{addLoading ? "Adding..." : "Add Company"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Company Modal */}
      {editingCompany && (
        <div onClick={() => setEditingCompany(null)} style={overlay}>
          <div onClick={(e) => e.stopPropagation()} style={modal}>
            <h3 style={{ marginBottom: 20 }}>Edit Company</h3>
            <label style={label}>Company Name *</label>
            <input type="text" value={editName} onChange={(e) => { setEditName(e.target.value); setEditError("") }} onKeyDown={(e) => { if (e.key === "Enter") handleEditCompany() }} style={input} autoFocus />
            {editError && <p style={errorText}>{editError}</p>}
            <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
              <button onClick={() => setEditingCompany(null)} style={cancelBtn}>Cancel</button>
              <button onClick={handleEditCompany} disabled={editLoading} style={primaryBtn}>{editLoading ? "Saving..." : "Save Changes"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Top Up Modal */}
      {toppingUp && (
        <div onClick={() => setToppingUp(null)} style={overlay}>
          <div onClick={(e) => e.stopPropagation()} style={modal}>
            <h3 style={{ marginBottom: 4 }}>Top Up — {toppingUp.company_name}</h3>
            <p style={{ color: "#888", fontSize: 13, marginBottom: 20 }}>Current balance: ₦{toppingUp.current_balance.toLocaleString()}</p>
            <label style={label}>Deposit Amount (₦) *</label>
            <input type="text" inputMode="numeric" value={topUpAmount} onChange={(e) => { setTopUpAmount(formatAmount(e.target.value)); setTopUpError("") }} placeholder="e.g. 500,000" style={input} autoFocus />
            <label style={{ ...label, marginTop: 16 }}>Low Balance Threshold (₦) *</label>
            <input type="text" inputMode="numeric" value={topUpThreshold} onChange={(e) => { setTopUpThreshold(formatAmount(e.target.value)); setTopUpError("") }} placeholder="e.g. 1,000,000" style={input} />
            <label style={{ ...label, marginTop: 16 }}>Note (optional)</label>
            <input type="text" value={topUpNote} onChange={(e) => setTopUpNote(e.target.value)} placeholder="e.g. March deposit" style={input} />
            {topUpError && <p style={errorText}>{topUpError}</p>}
            {topUpAmount && !isNaN(Number(topUpAmount)) && Number(topUpAmount) > 0 && (
              <p style={{ fontSize: 13, color: "#00aa00", marginTop: 12 }}>
                New balance will be: ₦{(toppingUp.current_balance + Number(topUpAmount)).toLocaleString()}
              </p>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
              <button onClick={() => setToppingUp(null)} style={cancelBtn}>Cancel</button>
              <button onClick={handleTopUp} disabled={topUpLoading} style={{ ...primaryBtn, background: "#00aa00" }}>{topUpLoading ? "Topping up..." : "Confirm Top Up"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deletingCompany && (
        <div onClick={() => setDeletingCompany(null)} style={overlay}>
          <div onClick={(e) => e.stopPropagation()} style={modal}>
            <h3 style={{ marginBottom: 12 }}>Delete Company?</h3>
            <p style={{ color: "#555", marginBottom: 24 }}>Are you sure you want to delete <strong>{deletingCompany.company_name}</strong>? This will also delete all associated deposit records.</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setDeletingCompany(null)} style={cancelBtn}>Cancel</button>
              <button onClick={handleDeleteCompany} disabled={deleteLoading} style={{ ...primaryBtn, background: "#ff4444" }}>{deleteLoading ? "Deleting..." : "Yes, Delete"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit & Resubmit Modal */}
      {resubmitting && (
        <div onClick={() => setResubmitting(null)} style={overlay}>
          <div onClick={(e) => e.stopPropagation()} style={modal}>
            <h3 style={{ marginBottom: 4 }}>Edit & Resubmit</h3>
            <p style={{ color: "#888", fontSize: 13, marginBottom: 20 }}>
              {resubmitting.driver_name} — {resubmitting.company_name}
            </p>
            <label style={label}>Litres *</label>
            <input type="number" value={resubmitLitres} onChange={(e) => { setResubmitLitres(e.target.value); setResubmitError("") }} style={input} autoFocus />
            <label style={{ ...label, marginTop: 16 }}>Rate per Litre (₦) *</label>
            <input type="number" value={resubmitRate} onChange={(e) => { setResubmitRate(e.target.value); setResubmitError("") }} style={input} />
            {resubmitTotal !== null && (
              <p style={{ fontSize: 13, color: "#0070f3", marginTop: 12 }}>
                New total: <strong>₦{resubmitTotal.toLocaleString()}</strong>
              </p>
            )}
            {resubmitError && <p style={errorText}>{resubmitError}</p>}
            <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
              <button onClick={() => setResubmitting(null)} style={cancelBtn}>Cancel</button>
              <button onClick={handleResubmit} disabled={resubmitLoading} style={primaryBtn}>{resubmitLoading ? "Resubmitting..." : "Resubmit Request"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = { padding: "12px 16px", fontWeight: "bold", fontSize: 13 }
const td: React.CSSProperties = { padding: "12px 16px" }
const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }
const modal: React.CSSProperties = { background: "white", borderRadius: 12, padding: 32, width: 440, maxWidth: "90vw", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }
const label: React.CSSProperties = { display: "block", fontWeight: "bold", marginBottom: 6, fontSize: 14 }
const input: React.CSSProperties = { width: "100%", padding: 10, boxSizing: "border-box", borderRadius: 6, border: "1px solid #ddd", fontSize: 14 }
const errorText: React.CSSProperties = { color: "red", fontSize: 13, marginTop: 8 }
const primaryBtn: React.CSSProperties = { flex: 1, padding: "10px 0", background: "#0070f3", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold" }
const cancelBtn: React.CSSProperties = { flex: 1, padding: "10px 0", background: "white", border: "1px solid #ddd", borderRadius: 6, cursor: "pointer" }