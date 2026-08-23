import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { requireRole, handleApiError } from "@/lib/auth-middleware"
import { includes } from "@/lib/type-utils"
import {
  notifyTruckAdminNewATFRequest,
  notifyTruckOfficerATFActioned,
  notifyDriverATFAuthorised,
  notifyDriverATFInvalidated,
  notifyTruckAdminATFRequestActioned,
  notifyTruckAdminFuelTopUp,
} from "@/lib/notifications"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const ALLOWED_TABLES = ["fuel_requests", "fuel_companies", "fuel_deposits", "truck_fuel_expenses"] as const
const ALLOWED_RPCS = ["confirm_fuel_receipt", "add_fuel_deposit", "invalidate_atf", "approve_fuel_expense", "reject_fuel_expense", "log_fuel_expense"] as const

const TABLE_ROLES: Record<string, string[]> = {
  fuel_requests: ["TruckOfficer", "TruckAdmin", "Admin", "SuperAdmin"],
  fuel_companies: ["TruckAdmin", "Admin", "SuperAdmin"],
  fuel_deposits: ["Admin", "SuperAdmin"],
  truck_fuel_expenses: ["TruckOfficer", "Admin", "SuperAdmin"],
}

const RPC_ROLES: Record<string, string[]> = {
  confirm_fuel_receipt: ["Driver", "Admin", "SuperAdmin"],
  add_fuel_deposit: ["Admin", "SuperAdmin"],
  invalidate_atf: ["TruckAdmin", "Admin", "SuperAdmin"],
  approve_fuel_expense: ["TruckAdmin", "Admin", "SuperAdmin"],
  reject_fuel_expense: ["TruckAdmin", "Admin", "SuperAdmin"],
  log_fuel_expense: ["TruckOfficer", "Admin", "SuperAdmin"],
}

const RPC_PARAM_SCHEMAS: Record<string, string[]> = {
  confirm_fuel_receipt: ["p_request_id", "p_driver_id", "p_rate"],
  add_fuel_deposit: ["p_company_id", "p_amount", "p_note"],
  invalidate_atf: ["p_request_id", "p_reason", "p_status_filter"],
  approve_fuel_expense: ["p_expense_id", "p_admin_id", "p_notes"],
  reject_fuel_expense: ["p_expense_id", "p_admin_id", "p_reason"],
  log_fuel_expense: ["p_manager_id", "p_plate_number", "p_trip_id", "p_litres", "p_notes", "p_location"],
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
      if (!fnName || !includes(ALLOWED_RPCS, fnName)) {
        return buildError(`RPC function "${fnName}" is not supported by this endpoint`, 400)
      }
      const rolesForRpc = RPC_ROLES[fnName] || ["Admin"]
      await requireRole(req, rolesForRpc)
      const allowedKeys = RPC_PARAM_SCHEMAS[fnName] || []
      const safeParams = Object.fromEntries(
        Object.entries(params || {}).filter(([k]) => allowedKeys.includes(k))
      )

      if (fnName === "confirm_fuel_receipt") {
        const requestId = safeParams.p_request_id as string
        const { data: request } = await supabaseAdmin
          .from("fuel_requests")
          .select("plate_number, initiated_by")
          .eq("request_id", requestId)
          .single()

        const result = await supabaseAdmin.rpc(fnName, safeParams)
        if (result.error) {
          return buildError(result.error.message || "RPC failed", 500)
        }
        if (result.data?.success && request) {
          const plate = request.plate_number
          notifyTruckAdminATFRequestActioned(requestId, plate, "Confirmed").catch(console.error)
          notifyTruckOfficerATFActioned(requestId, plate, "Confirmed").catch(console.error)
        }
        return NextResponse.json({ data: result.data })
      }

      if (fnName === "invalidate_atf") {
        const requestId = safeParams.p_request_id as string
        const { data: request } = await supabaseAdmin
          .from("fuel_requests")
          .select("driver_id, plate_number")
          .eq("request_id", requestId)
          .single()

        const result = await supabaseAdmin.rpc(fnName, safeParams)
        if (result.error) {
          return buildError(result.error.message || "RPC failed", 500)
        }
        if (result.data?.success && request) {
          const plate = request.plate_number
          notifyTruckOfficerATFActioned(requestId, plate, "Invalidated").catch(console.error)
          if (request.driver_id) {
            notifyDriverATFInvalidated(request.driver_id, plate, safeParams.p_reason as string || "No reason provided").catch(console.error)
          }
        }
        return NextResponse.json({ data: result.data })
      }

      if (fnName === "add_fuel_deposit") {
        const companyId = safeParams.p_company_id as string
        const amount = safeParams.p_amount as number
        const { data: company } = await supabaseAdmin
          .from("fuel_companies")
          .select("company_name")
          .eq("company_id", companyId)
          .single()

        const result = await supabaseAdmin.rpc(fnName, safeParams)
        if (result.error) {
          return buildError(result.error.message || "RPC failed", 500)
        }
        if (result.data?.success && company) {
          notifyTruckAdminFuelTopUp(company.company_name, amount).catch(console.error)
        }
        return NextResponse.json({ data: result.data })
      }

      if (fnName === "approve_fuel_expense" || fnName === "reject_fuel_expense") {
        const result = await supabaseAdmin.rpc(fnName, safeParams)
        if (result.error) {
          return buildError(result.error.message || "RPC failed", 500)
        }
        return NextResponse.json({ data: result.data })
      }

      if (fnName === "log_fuel_expense") {
        const result = await supabaseAdmin.rpc(fnName, safeParams)
        if (result.error) {
          return buildError(result.error.message || "RPC failed", 500)
        }
        return NextResponse.json({ data: result.data })
      }

      const result = await supabaseAdmin.rpc(fnName, safeParams)
      if (result.error) {
        return buildError(result.error.message || "RPC failed", 500)
      }
      return NextResponse.json({ data: result.data })
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
        if (table === "fuel_requests" && result?.[0]) {
          const row = result[0]
          if (row.atf_status === "Pending") {
            notifyTruckAdminNewATFRequest(row.request_id, row.plate_number).catch(console.error)
          }
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
        for (const [key, value] of Object.entries(filters)) {
          query = query.eq(key, value)
        }
        const { data: result, error } = await query.select()
        if (error) {
          console.error("Mutation failed", error)
          return buildError("Action failed, try again. If the issue persists, kindly contact admin or submit a complaint.", 500)
        }
        if (table === "fuel_requests" && data.atf_status === "Authorised" && result?.[0]) {
          const row = result[0]
          const requestId = row.request_id
          const plate = row.plate_number
          notifyTruckOfficerATFActioned(requestId, plate, "Authorised").catch(console.error)
          if (row.driver_id) {
            notifyDriverATFAuthorised(row.driver_id, plate).catch(console.error)
          }
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
          return buildError("Action failed, try again. If the issue persists, kindly contact admin or submit a complaint.", 500)
        }
        return NextResponse.json({ data: result })
      }
    }
  } catch (err) {
    return handleApiError(err)
  }
}
