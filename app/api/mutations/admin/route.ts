import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { requireRole, handleApiError } from "@/lib/auth-middleware"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const ALLOWED_TABLES = ["Trucks", "tricycles", "reports", "driver_complaints", "truck_officers", "truck_admins", "cash_officers", "store_officers", "Brokers", "Profiles", "Drivers", "station_managers", "desk_officers", "atc_officers", "company_prices", "company_price_history"] as const

const TABLE_ROLES: Record<string, string[]> = {
  Trucks: ["TruckAdmin", "TruckOfficer", "Admin", "SuperAdmin", "ATCOfficer", "Broker", "DeskOfficer", "Supervisor"],
  tricycles: ["TruckAdmin", "Admin", "SuperAdmin", "ATCOfficer", "Broker"],
  reports: ["Admin", "SuperAdmin"],
  driver_complaints: ["Admin", "SuperAdmin", "TruckAdmin"],
  truck_officers: ["TruckAdmin", "Admin", "SuperAdmin", "ATCOfficer"],
  truck_admins: ["Admin", "SuperAdmin"],
  cash_officers: ["Admin", "SuperAdmin"],
  store_officers: ["Admin", "SuperAdmin"],
  Brokers: ["Broker", "Admin", "SuperAdmin", "DeskOfficer"],
  Profiles: ["Admin", "SuperAdmin"],
  Drivers: ["Admin", "SuperAdmin", "ATCOfficer", "Broker", "TruckAdmin"],
  station_managers: ["Admin", "SuperAdmin"],
  desk_officers: ["Admin", "SuperAdmin"],
  atc_officers: ["Admin", "SuperAdmin"],
  company_prices: ["Admin", "SuperAdmin"],
  company_price_history: ["Admin", "SuperAdmin"],
}

function buildError(msg: string, status: number) {
  return NextResponse.json({ error: msg }, { status })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, table, data, filters, conflict } = body as {
      action: string
      table: string
      data?: Record<string, unknown>
      filters?: Record<string, unknown>
      conflict?: string
    }

    if (!ALLOWED_TABLES.includes(table as any)) {
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
