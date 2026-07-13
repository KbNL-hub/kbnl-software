import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { requireRole, handleApiError } from "@/lib/auth-middleware"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const ALLOWED_TABLES = ["fuel_requests", "fuel_companies", "fuel_deposits", "truck_fuel_expenses"] as const
const ALLOWED_RPCS = ["confirm_fuel_receipt", "confirm_fuel_deposit", "invalidate_atf", "decline_fuel_deposit", "dispense_fuel"] as const

const TABLE_ROLES: Record<string, string[]> = {
  fuel_requests: ["TruckOfficer", "TruckAdmin", "StationManager", "Admin", "SuperAdmin"],
  fuel_companies: ["StationManager", "TruckAdmin", "Admin", "SuperAdmin"],
  fuel_deposits: ["StationManager", "Admin", "SuperAdmin"],
  truck_fuel_expenses: ["TruckOfficer", "Admin", "SuperAdmin"],
}

const RPC_ROLES: Record<string, string[]> = {
  confirm_fuel_receipt: ["Driver", "Admin", "SuperAdmin"],
  confirm_fuel_deposit: ["StationManager", "Admin", "SuperAdmin"],
  decline_fuel_deposit: ["StationManager", "Admin", "SuperAdmin"],
  invalidate_atf: ["TruckAdmin", "StationManager", "Admin", "SuperAdmin"],
  dispense_fuel: ["StationManager", "Admin", "SuperAdmin"],
}

function buildError(msg: string, status: number) {
  return NextResponse.json({ error: msg }, { status })
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
      const result = await supabaseAdmin.rpc(fnName as any, {
        ...params,
        p_user_id: auth.userId,
        p_role: auth.primaryRole,
      })
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
        for (const [key, value] of Object.entries(filters)) {
          query = query.eq(key, value)
        }
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
        for (const [key, value] of Object.entries(filters)) {
          query = query.eq(key, value)
        }
        const { data: result, error } = await query.select()
        if (error) {
          console.error("Mutation failed", error)
          return buildError("Mutation failed", 500)
        }
        return NextResponse.json({ data: result })
      }
    }
  } catch (err) {
    return handleApiError(err)
  }
}
