import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { requireRole, handleApiError } from "@/lib/auth-middleware"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const ALLOWED_TABLES = ["customer_payments", "broker_credits", "store_sales", "store_supply_confirmations", "store_supply_lines", "cash_expenses", "cash_expense_items", "cash_offices", "cash_deposits", "admin_office_assignments", "Customers", "Brokers", "store_stock", "store_officers", "stock_verifications"] as const
const ALLOWED_RPCS = ["decrement_store_stock"] as const

const TABLE_ROLES: Record<string, string[]> = {
  customer_payments: ["Broker", "Admin", "SuperAdmin", "DeskOfficer", "Supervisor"],
  broker_credits: ["Broker", "Admin", "SuperAdmin", "DeskOfficer"],
  store_sales: ["StoreOfficer", "Admin", "SuperAdmin", "Supervisor", "StoreSupervisor"],
  store_supply_confirmations: ["StoreOfficer", "Admin", "SuperAdmin", "StoreSupervisor"],
  store_supply_lines: ["StoreOfficer", "Admin", "SuperAdmin", "StoreSupervisor"],
  cash_expenses: ["CashOfficer", "Admin", "SuperAdmin", "Broker", "CashAuthorizer", "DeskOfficer"],
  cash_expense_items: ["CashOfficer", "Admin", "SuperAdmin", "Broker"],
  cash_offices: ["CashOfficer", "Admin", "SuperAdmin"],

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
}

const RPC_PARAM_SCHEMAS: Record<string, string[]> = {
  decrement_store_stock: ["p_store", "p_product", "p_qty"],
}

function buildError(msg: string, status: number) {
  return NextResponse.json({ error: msg }, { status })
}

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
    const { action, table, data, filters, conflict, function: fnName, params } = body as {
      action: string
      table?: string
      data?: Record<string, unknown>
      filters?: Record<string, unknown>
      conflict?: string
      function?: string
      params?: Record<string, unknown>
    }

    if (action === "rpc") {
      if (!fnName || !ALLOWED_RPCS.includes(fnName as any)) {
        return buildError(`RPC function "${fnName}" is not supported by this endpoint`, 400)
      }
      const rolesForRpc = RPC_ROLES[fnName] || ["Admin"]
      const auth = await requireRole(req, rolesForRpc)
      const allowedKeys = RPC_PARAM_SCHEMAS[fnName] || []
      const safeParams = Object.fromEntries(
        Object.entries(params || {}).filter(([k]) => allowedKeys.includes(k))
      )
      const result = await supabaseAdmin.rpc(fnName as any, safeParams)
      if (result.error) {
        return buildError(result.error.message || "RPC failed", 500)
      }
      return NextResponse.json({ data: result.data })
    }

    if (!table || !ALLOWED_TABLES.includes(table as any)) {
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
