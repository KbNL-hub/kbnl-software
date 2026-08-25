import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { requireRole, handleApiError } from "@/lib/auth-middleware"
import { includes } from "@/lib/type-utils"
import {
  notifyTruckAdminNewSideTrip,
  notifyATCSideTripSubmitted,
  notifyComplaintResolved,
  notifyReportReplied,
  notifyBrokerPricesUpdated,
  notifyATCPricesUpdated,
  notifyAdminPricesUpdated,
} from "@/lib/notifications"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const ALLOWED_TABLES = ["Trucks", "tricycles", "reports", "driver_complaints", "truck_officers", "truck_admins", "cash_officers", "store_officers", "Brokers", "Profiles", "Drivers", "station_managers", "desk_officers", "atc_officers", "company_prices", "company_price_history", "side_trips", "fuel_estimates", "stores", "trip_payments", "locations", "sc_prices"] as const

const TABLE_ROLES: Record<string, string[]> = {
  Trucks: ["TruckAdmin", "TruckOfficer", "Admin", "SuperAdmin", "ATCOfficer", "Broker", "DeskOfficer", "Supervisor"],
  tricycles: ["TruckAdmin", "Admin", "SuperAdmin", "ATCOfficer", "Broker"],
  reports: ["Admin", "SuperAdmin"],
  driver_complaints: ["Admin", "SuperAdmin", "TruckAdmin", "Driver"],
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
  company_prices: ["Admin", "SuperAdmin", "ATCOfficer"],
  company_price_history: ["Admin", "SuperAdmin", "ATCOfficer"],
  side_trips: ["Admin", "SuperAdmin", "Supervisor", "ATCOfficer", "TruckAdmin", "Driver"],
  fuel_estimates: ["Admin", "SuperAdmin"],
  stores: ["Admin", "SuperAdmin"],
  trip_payments: ["Admin", "SuperAdmin", "ATCOfficer"],
  locations: ["Admin", "SuperAdmin", "ATCOfficer"],
  sc_prices: ["Admin", "SuperAdmin", "ATCOfficer"],
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

    if (!includes(ALLOWED_TABLES, table)) {
      return buildError(`Table "${table}" is not supported by this endpoint`, 400)
    }

    if (!["insert", "update", "delete", "upsert"].includes(action)) {
      return buildError(`Invalid action "${action}"`, 400)
    }

    const rolesForTable = TABLE_ROLES[table] || ["Admin"]
    await requireRole(req, rolesForTable)

    // sc_prices is a singleton config table — only update is permitted
    if (table === "sc_prices" && action !== "update") {
      return buildError("sc_prices can only be updated", 400)
    }

    switch (action) {
      case "insert": {
        if (!data) return buildError("data is required for insert", 400)
        const { data: result, error } = await supabaseAdmin.from(table).insert([data]).select()
        if (error) {
          console.error("Mutation failed", error)
          return buildError("Action failed, try again. If the issue persists, kindly contact admin or submit a complaint.", 500)
        }
        // Side Trip Submitted
        if (table === "side_trips" && result?.[0]) {
          const row = result[0] as Record<string, unknown>
          const driverName = (row.driver_name as string) || (data.driver_name as string) || "Driver"
          const plate = (row.plate_number as string) || (data.plate_number as string)
          if (plate) {
            notifyTruckAdminNewSideTrip(driverName, plate).catch(console.error)
            notifyATCSideTripSubmitted(driverName, plate).catch(console.error)
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
        // Company Prices Updated
        if (table === "company_prices") {
          notifyBrokerPricesUpdated().catch(console.error)
          notifyATCPricesUpdated().catch(console.error)
          notifyAdminPricesUpdated().catch(console.error)
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
        const row = result?.[0] as Record<string, unknown> | undefined

        // Complaint Resolved
        if (table === "driver_complaints" && data.resolved === true && row) {
          const driverId = row.driver_id as string
          const complaintId = (filters.complaint_id ?? row.complaint_id ?? row.id) as string
          if (driverId && complaintId) {
            notifyComplaintResolved(driverId, complaintId).catch(console.error)
          }
        }

        // Report Resolved
        if (table === "reports" && data.resolved === true && row) {
          const userId = row.user_id as string
          const reportId = (filters.id ?? row.id) as string
          if (userId && reportId) {
            notifyComplaintResolved(userId, reportId).catch(console.error)
          }
        }

        // Report Replied
        if (table === "reports" && data.admin_reply && row) {
          const userId = row.user_id as string
          const reportId = (filters.id ?? row.id) as string
          if (userId && reportId) {
            notifyReportReplied(userId, reportId).catch(console.error)
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
