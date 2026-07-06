import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const ALLOWED_TABLES = ["customer_payments", "broker_credits", "store_sales", "store_supply_confirmations", "store_supply_lines", "cash_expenses", "cash_expense_items", "cash_offices", "cash_deposits", "admin_office_assignments", "Customers", "Brokers", "store_stock", "store_officers"] as const

async function authorizeUser(token: string) {
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return null
  return user
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
  const authHeader = req.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) return buildError("Unauthorized", 401)

  const user = await authorizeUser(authHeader.slice(7))
  if (!user) return buildError("Unauthorized", 401)

  try {
    const body = await req.json()
    const { action, table, data, filters, conflict } = body as {
      action: string
      table?: string
      data?: Record<string, unknown>
      filters?: Record<string, unknown>
      conflict?: string
    }

    if (!table || !ALLOWED_TABLES.includes(table as any)) {
      return buildError(`Table "${table}" is not supported by this endpoint`, 400)
    }

    if (!["insert", "update", "delete", "upsert"].includes(action)) {
      return buildError(`Invalid action "${action}"`, 400)
    }

    switch (action) {
      case "insert": {
        if (!data) return buildError("data is required for insert", 400)
        const { data: result, error } = await supabaseAdmin.from(table).insert([data]).select()
        if (error) {
          console.error("Mutation failed", error)
          return buildError("Mutation failed", 500)
        }
        return NextResponse.json({ data: result })
      }

      case "upsert": {
        if (!data) return buildError("data is required for upsert", 400)
        const upsertOptions = conflict ? { onConflict: conflict } : {}
        const { data: result, error } = await supabaseAdmin.from(table).upsert([data], upsertOptions).select()
        if (error) {
          console.error("Mutation failed", error)
          return buildError("Mutation failed", 500)
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
          return buildError("Mutation failed", 500)
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
          return buildError("Mutation failed", 500)
        }
        return NextResponse.json({ data: result })
      }
    }
  } catch (err) {
    console.error("Mutation error", err)
    return buildError("Internal server error", 500)
  }
}
