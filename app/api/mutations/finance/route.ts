import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { requireRole, handleApiError } from "@/lib/auth-middleware"
import { includes } from "@/lib/type-utils"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const ALLOWED_TABLES = ["customer_payments", "broker_credits", "store_sales", "store_supply_confirmations", "store_supply_lines", "cash_expenses", "cash_expense_items", "cash_offices", "cash_deposits", "admin_office_assignments", "Customers", "Brokers", "store_stock", "store_officers", "stock_verifications"] as const
const ALLOWED_RPCS = ["decrement_store_stock", "add_cash_deposit", "authorise_cash_expense"] as const

const TABLE_ROLES: Record<string, string[]> = {
  customer_payments: ["Broker", "Admin", "SuperAdmin", "DeskOfficer", "Supervisor"],
  broker_credits: ["Broker", "Admin", "SuperAdmin", "DeskOfficer"],
  store_sales: ["StoreOfficer", "Admin", "SuperAdmin", "Supervisor", "StoreSupervisor"],
  store_supply_confirmations: ["StoreOfficer", "Admin", "SuperAdmin", "StoreSupervisor"],
  store_supply_lines: ["StoreOfficer", "Admin", "SuperAdmin", "StoreSupervisor"],
  cash_expenses: ["CashOfficer", "Admin", "SuperAdmin", "Broker", "CashAuthorizer", "DeskOfficer"],
  cash_expense_items: ["CashOfficer", "Admin", "SuperAdmin", "Broker"],
  cash_offices: ["CashOfficer", "Admin", "SuperAdmin", "CashAuthorizer"],

  cash_deposits: ["CashOfficer", "Admin", "SuperAdmin"],
  admin_office_assignments: ["Admin", "SuperAdmin"],
  Customers: ["Broker", "Admin", "SuperAdmin", "CashOfficer", "DeskOfficer", "Supervisor"],
  Brokers: ["Broker", "Admin", "SuperAdmin", "DeskOfficer", "Supervisor"],
  store_stock: ["StoreOfficer", "Admin", "SuperAdmin", "Supervisor", "StoreSupervisor"],
  store_officers: ["Admin", "SuperAdmin"],
  stock_verifications: ["StoreSupervisor", "Admin", "SuperAdmin"],
}

const RPC_ROLES: Record<string, string[]> = {
  decrement_store_stock: ["StoreOfficer", "Admin", "SuperAdmin"],
  add_cash_deposit: ["CashOfficer", "Admin", "SuperAdmin", "Broker", "CashAuthorizer", "DeskOfficer"],
  authorise_cash_expense: ["Admin", "SuperAdmin", "Broker", "CashAuthorizer", "DeskOfficer"],
}

const RPC_PARAM_SCHEMAS: Record<string, string[]> = {
  decrement_store_stock: ["p_store", "p_product", "p_qty"],
  add_cash_deposit: ["p_office_name", "p_amount", "p_note", "p_deposited_by"],
  authorise_cash_expense: ["p_expense_id", "p_admin_id", "p_notes"],
}

function buildError(msg: string, status: number) {
  return NextResponse.json({ error: msg }, { status })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(query: any, filters: Record<string, unknown>) {
  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value)) {
      if (value.length > 0) query = query.in(key, value)
    } else {
      query = query.eq(key, value)
    }
  }
  return query
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, table, data, filters, conflict, function: fnName, params, sub_actions } = body as {
      action: string
      table?: string
      data?: Record<string, unknown>
      filters?: Record<string, unknown>
      conflict?: string
      function?: string
      params?: Record<string, unknown>
      sub_actions?: Array<{
        action: string
        table: string
        data?: Record<string, unknown>
        filters?: Record<string, unknown>
        conflict?: string
      }>
    }

    if (action === "rpc") {
      if (!fnName || !includes(ALLOWED_RPCS, fnName)) {
        return buildError(`RPC function "${fnName}" is not supported by this endpoint`, 400)
      }
      const rolesForRpc = RPC_ROLES[fnName] || ["Admin"]
      await requireRole(req, rolesForRpc)
      const allowedKeys = RPC_PARAM_SCHEMAS[fnName] || []
      const safeParams = Object.fromEntries(
        Object.entries(params || {}).filter(([k]) => allowedKeys.includes(k))
      )
      const result = await supabaseAdmin.rpc(fnName, safeParams)
      if (result.error) {
        return buildError(result.error.message || "RPC failed", 500)
      }
      return NextResponse.json({ data: result.data })
    }

    if (action === "transaction") {
      if (!sub_actions || !Array.isArray(sub_actions) || sub_actions.length === 0) {
        return buildError("sub_actions array is required for transaction", 400)
      }
      for (const sa of sub_actions) {
        if (!["insert", "update", "delete", "upsert"].includes(sa.action)) {
          return buildError(`Invalid sub-action "${sa.action}"`, 400)
        }
        if (!includes(ALLOWED_TABLES, sa.table)) {
          return buildError(`Table "${sa.table}" is not supported by this endpoint`, 400)
        }
      }

      const completed: Array<{
        action: string
        table: string
        filters?: Record<string, unknown>
        result: unknown
        originalData?: Record<string, unknown>[]
      }> = []
      const results: unknown[] = []

      try {
        for (const sa of sub_actions) {
          let originalData: Record<string, unknown>[] | undefined
          if ((sa.action === "update" || sa.action === "delete") && sa.filters && Object.keys(sa.filters).length > 0) {
            let q = supabaseAdmin.from(sa.table).select("*")
            for (const [k, v] of Object.entries(sa.filters)) {
              q = q.eq(k, v)
            }
            const { data: prev } = await q
            if (prev && prev.length > 0) originalData = prev
          }

          let execResult: unknown
          switch (sa.action) {
            case "insert": {
              if (!sa.data) throw new Error("data is required for insert")
              const { data: r, error } = await supabaseAdmin.from(sa.table).insert([sa.data]).select()
              if (error) {
                console.error("Sub-action failed", error)
                throw new Error(error.message || "Sub-action failed")
              }
              execResult = r
              break
            }
            case "update": {
              if (!sa.data) throw new Error("data is required for update")
              if (!sa.filters || Object.keys(sa.filters).length === 0) {
                throw new Error("filters are required for update")
              }
              let q = supabaseAdmin.from(sa.table).update(sa.data)
              for (const [k, v] of Object.entries(sa.filters)) {
                q = q.eq(k, v)
              }
              const { data: r, error } = await q.select()
              if (error) {
                console.error("Sub-action failed", error)
                throw new Error(error.message || "Sub-action failed")
              }
              execResult = r
              break
            }
            case "delete": {
              if (!sa.filters || Object.keys(sa.filters).length === 0) {
                throw new Error("filters are required for delete")
              }
              let q = supabaseAdmin.from(sa.table).delete()
              for (const [k, v] of Object.entries(sa.filters)) {
                q = q.eq(k, v)
              }
              const { data: r, error } = await q.select()
              if (error) {
                console.error("Sub-action failed", error)
                throw new Error(error.message || "Sub-action failed")
              }
              execResult = r
              break
            }
            case "upsert": {
              if (!sa.data) throw new Error("data is required for upsert")
              const opts = sa.conflict ? { onConflict: sa.conflict } : {}
              const { data: r, error } = await supabaseAdmin.from(sa.table).upsert([sa.data], opts).select()
              if (error) {
                console.error("Sub-action failed", error)
                throw new Error(error.message || "Sub-action failed")
              }
              execResult = r
              break
            }
          }

          completed.push({ action: sa.action, table: sa.table, filters: sa.filters, result: execResult, originalData })
          results.push(execResult)
        }

        return NextResponse.json({ data: results })
      } catch (err) {
        for (let i = completed.length - 1; i >= 0; i--) {
          const c = completed[i]
          try {
            switch (c.action) {
              case "insert": {
                const arr = c.result as Record<string, unknown>[] | null
                if (arr && arr.length > 0) {
                  const pk = Object.keys(arr[0]).find(k => k.endsWith("_id") || k === "id") || Object.keys(arr[0])[0]
                  if (arr[0][pk] != null) {
                    await supabaseAdmin.from(c.table).delete().eq(pk, arr[0][pk])
                  }
                }
                break
              }
              case "update":
              case "upsert": {
                if (c.originalData && c.originalData.length > 0) {
                  let q = supabaseAdmin.from(c.table).update(c.originalData[0])
                  if (c.filters) {
                    for (const [k, v] of Object.entries(c.filters)) {
                      q = q.eq(k, v)
                    }
                  }
                  await q
                }
                break
              }
              case "delete": {
                if (c.originalData && c.originalData.length > 0) {
                  await supabaseAdmin.from(c.table).insert(c.originalData)
                }
                break
              }
            }
          } catch (rbErr) {
            console.error("Rollback failed:", c.table, rbErr)
          }
        }

        console.error("Transaction failed", err)
        return buildError("Transaction failed", 500)
      }
    }

    if (!table || !includes(ALLOWED_TABLES, table)) {
      return buildError(`Table "${table}" is not supported by this endpoint`, 400)
    }

    if (!["insert", "update", "delete", "upsert"].includes(action)) {
      return buildError(`Invalid action "${action}"`, 400)
    }

    const rolesForTable = TABLE_ROLES[table] || ["Admin"]
    await requireRole(req, rolesForTable)

    switch (action) {
      case "insert": {
        if (!data) return buildError("data is required for insert", 400)
        const { data: result, error } = await supabaseAdmin.from(table).insert([data]).select()
        if (error) {
          console.error("Mutation failed", error)
          return buildError("Action failed, try again. If the issue persists, kindly contact admin or submit a complaint.", 500)
        }
        return NextResponse.json({ data: result })
      }

      case "upsert": {
        if (!data) return buildError("data is required for upsert", 400)
        const upsertOptions = conflict ? { onConflict: conflict } : {}
        const { data: result, error } = await supabaseAdmin.from(table).upsert([data], upsertOptions).select()
        if (error) {
          console.error("Mutation failed", error)
          return buildError("Action failed, try again. If the issue persists, kindly contact admin or submit a complaint.", 500)
        }
        return NextResponse.json({ data: result })
      }

      case "update": {
        if (!data) return buildError("data is required for update", 400)
        if (!filters || Object.keys(filters).length === 0) {
          return buildError("filters are required for update", 400)
        }
        let query = supabaseAdmin.from(table).update(data)
        query = applyFilters(query, filters)
        const { data: result, error } = await query.select()
        if (error) {
          console.error("Mutation failed", error)
          return buildError("Action failed, try again. If the issue persists, kindly contact admin or submit a complaint.", 500)
        }
        return NextResponse.json({ data: result })
      }

      case "delete": {
        if (!filters || Object.keys(filters).length === 0) {
          return buildError("filters are required for delete", 400)
        }
        let query = supabaseAdmin.from(table).delete()
        query = applyFilters(query, filters)
        const { data: result, error } = await query.select()
        if (error) {
          console.error("Mutation failed", error)
          return buildError("Action failed, try again. If the issue persists, kindly contact admin or submit a complaint.", 500)
        }
        return NextResponse.json({ data: result })
      }
    }
  } catch (err) {
    return handleApiError(err)
  }
}
