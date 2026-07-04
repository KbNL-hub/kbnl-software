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

    if (action === "batch_confirm") {
      const { sale_ids, broker_id, prices, sale_qty_map } = body as {
        action: "batch_confirm"
        sale_ids: string[]
        broker_id: string
        prices: Record<string, number>
        sale_qty_map: Record<string, number>
      }

      if (!sale_ids?.length || !broker_id || !prices) {
        return buildError("sale_ids, broker_id, and prices are required", 400)
      }

      const confirmed: string[] = []
      const errors: { sale_id: string; error: string }[] = []

      for (const sale_id of sale_ids) {
        const price = prices[sale_id]
        const qty = sale_qty_map[sale_id]
        if (price == null || qty == null) {
          errors.push({ sale_id, error: "Missing price or quantity" })
          continue
        }

        const { error: updateError } = await supabaseAdmin
          .from("store_sales")
          .update({ price_per_bag: price, total_amount: price * qty, status: "Confirmed" })
          .eq("sale_id", sale_id)
          .eq("status", "Pending")
          .eq("broker_id", broker_id)

        if (updateError) {
          errors.push({ sale_id, error: updateError.message })
        } else {
          confirmed.push(sale_id)
        }
      }

      return NextResponse.json({ data: { confirmed, errors } })
    }

    if (action === "batch_reject") {
      const { sale_ids, broker_id, rejection_reason } = body as {
        action: "batch_reject"
        sale_ids: string[]
        broker_id: string
        rejection_reason?: string
      }

      if (!sale_ids?.length || !broker_id) {
        return buildError("sale_ids and broker_id are required", 400)
      }

      const updateData: Record<string, unknown> = { status: "Rejected" }
      if (rejection_reason) updateData.rejection_reason = rejection_reason

      const { data: result, error } = await supabaseAdmin
        .from("store_sales")
        .update(updateData)
        .in("sale_id", sale_ids)
        .eq("status", "Pending")
        .eq("broker_id", broker_id)
        .select("sale_id")

      if (error) {
        return buildError("Batch reject failed", 500)
      }
      return NextResponse.json({ data: result })
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
