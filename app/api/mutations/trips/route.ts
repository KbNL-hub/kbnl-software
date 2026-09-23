import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { requireRole, handleApiError, type AuthContext } from "@/lib/auth-middleware"
import { includes } from "@/lib/type-utils"
import {
  notifyBrokerNewTripStarted,
  notifyATCNewTripStarted,
  notifyAdminTripStarted,
  notifyAdminTripCompleted,
  notifyATCTripStatusChanged,
  notifyTruckOfficerTruckStatusChange,
  notifyATCDisputedStop,
  notifyAdminStopDisputed,
  notifyBrokerStopResolved,
  notifyBrokerRouteSet,
  notifyATCRouteSet,
  notifyAdminTruckRouteSet,
} from "@/lib/notifications"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const ALLOWED_TABLES = ["Trips", "Trucks", "dd_trips", "trip_load_more", "Stops", "Stop_Confirmations", "trip_discrepancies", "price_adjustments", "credit_approvals"] as const

const TABLE_ROLES: Record<string, string[]> = {
  Trips: ["Driver", "TruckOfficer", "Broker", "Admin", "SuperAdmin", "DeskOfficer", "ATCOfficer", "Supervisor"],
  Trucks: ["Driver", "TruckOfficer", "TruckAdmin", "Admin", "SuperAdmin", "ATCOfficer", "Supervisor"],
  Stops: ["Driver", "Broker", "StoreOfficer", "Admin", "SuperAdmin", "TruckAdmin", "ATCOfficer", "Supervisor", "CreditManager"],
  Stop_Confirmations: ["Broker", "Admin", "SuperAdmin"],
  trip_load_more: ["Driver", "Admin", "SuperAdmin"],
  trip_discrepancies: ["Driver", "Admin", "SuperAdmin", "TruckOfficer", "ATCOfficer"],
  dd_trips: ["Driver", "Admin", "SuperAdmin", "ATCOfficer", "DeskOfficer"],
  price_adjustments: ["Broker", "Admin", "SuperAdmin", "DeskOfficer", "CreditManager"],
  credit_approvals: ["Broker", "Admin", "SuperAdmin", "DeskOfficer", "CreditManager"],
}

function buildError(msg: string, status: number) {
  return NextResponse.json({ error: msg }, { status })
}

const ON_BEHALF_TRIP_ROLES = new Set(["TruckOfficer", "Broker", "Admin", "SuperAdmin", "DeskOfficer", "ATCOfficer", "Supervisor"])
const ACTIVE_TRIP_ERROR = "This driver already has an active trip. Wait for the driver to complete it or ask the driver to end their trip before starting another."

type DatabaseError = {
  code?: string
  message?: string
}

type PreparedTripInsert = {
  data: Record<string, unknown>
  conflict?: boolean
  error?: string
}

class MutationError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

function isDatabaseError(error: unknown): error is DatabaseError {
  return typeof error === "object" && error !== null && "code" in error
}

function getUniqueViolationMessage(error: unknown) {
  if (!isDatabaseError(error) || error.code !== "23505") return null

  const message = error.message || ""
  if (message.includes("trips_one_active_per_driver_idx")) return ACTIVE_TRIP_ERROR
  if (message.includes("trips_order_no_unique")) return "Order number has already been used."
  if (message.includes("trips_child_order_no_unique")) return "Child order number has already been used."
  if (message.includes("trips_atc_unique")) return "ATC number has already been used."
  if (message.includes("dd_trips_order_no_unique")) return "Order number has already been used."
  if (message.includes("dd_trips_child_order_no_unique")) return "Child order number has already been used."
  if (message.includes("dd_trips_atc_unique")) return "ATC number has already been used."
  return "A record with the same unique value already exists."
}

function buildMutationError(error: unknown) {
  const uniqueViolationMessage = getUniqueViolationMessage(error)
  if (uniqueViolationMessage) return buildError(uniqueViolationMessage, 409)

  const message = isDatabaseError(error) && error.message ? error.message : "Action failed"
  return buildError(message, 500)
}

function throwSubActionError(error: unknown): never {
  const uniqueViolationMessage = getUniqueViolationMessage(error)
  if (uniqueViolationMessage) throw new MutationError(uniqueViolationMessage, 409)
  throw new Error("Sub-action failed")
}

async function prepareTripInsert(data: Record<string, unknown>, auth: AuthContext): Promise<PreparedTripInsert> {
  const nextData = { ...data }
  const canStartOnBehalf = auth.roles.some(role => ON_BEHALF_TRIP_ROLES.has(role))

  if (auth.roles.includes("Driver") && !canStartOnBehalf) {
    nextData.driver_id = auth.userId
  }

  if (nextData.trip_status !== "In transit" && nextData.trip_status !== "On hold") {
    return { data: nextData }
  }

  const driverId = typeof nextData.driver_id === "string" ? nextData.driver_id : null
  if (!driverId) return { data: nextData }

  const { data: activeTrip, error } = await supabaseAdmin
    .from("Trips")
    .select("trip_id")
    .eq("driver_id", driverId)
    .in("trip_status", ["In transit", "On hold"])
    .limit(1)
    .maybeSingle()

  if (error) return { data: nextData, error: error.message }
  if (activeTrip) return { data: nextData, conflict: true }
  return { data: nextData }
}

// Trip Payment feature constants
const SC_RATE_FALLBACK = 600
const BAGS_PER_TONNE = 20

/**
 * Creates the trip_payments row for a newly started trip.
 * - SC: value is computed as current SC rate × quantity_loaded (rate fetched from sc_prices).
 * - MDD: value/payment_expected stay null until an admin selects a location.
 * Tonnage is derived from quantity_loaded (20 bags = 1 tonne).
 * Failures are logged but never block the trip from starting.
 */
async function createTripPaymentRecord(row: Record<string, unknown>) {
  try {
    const tripId = row.trip_id as string
    const plate = row.plate_number as string
    if (!tripId || !plate) return
    const tripType = row.trip_type === "MDD" ? "MDD" : "SC"
    const quantityLoaded = Math.max(0, Math.round(Number(row.loaded_quantity) || 0))

    let scRate = SC_RATE_FALLBACK
    if (tripType === "SC") {
      const { data } = await supabaseAdmin.from("sc_prices").select("rate_per_bag").limit(1).single()
      if (data?.rate_per_bag) scRate = Number(data.rate_per_bag)
    }

    const { error } = await supabaseAdmin.from("trip_payments").insert({
      trip_id: tripId,
      trip_type: tripType,
      plate_number: plate,
      tonnage: Math.round(quantityLoaded / BAGS_PER_TONNE),
      quantity_loaded: quantityLoaded,
      value: tripType === "SC" ? scRate * quantityLoaded : null,
      sc_rate: tripType === "SC" ? scRate : null,
    })
    if (error) console.error("Failed to create trip payment record", error)
  } catch (err) {
    console.error("Failed to create trip payment record", err)
  }
}

function isBrokerOnly(roles: string[]) {
  return roles.includes("Broker") &&
    !roles.some(r => ["Admin", "SuperAdmin", "DeskOfficer", "Supervisor", "CreditManager", "StoreOfficer", "StoreSupervisor"].includes(r))
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, table, data, filters, conflict, sub_actions } = body as {
      action: string
      table?: string
      data?: Record<string, unknown>
      filters?: Record<string, unknown>
      conflict?: string
      sub_actions?: Array<{
        action: string
        table: string
        data?: Record<string, unknown>
        filters?: Record<string, unknown>
        conflict?: string
      }>
    }
    let auth: AuthContext | null = null

    if (action !== "transaction") {
      if (!table || !includes(ALLOWED_TABLES, table)) {
        return buildError(`Table "${table}" is not supported by this endpoint`, 400)
      }
      if (!["insert", "update", "delete", "upsert"].includes(action)) {
        return buildError(`Invalid action "${action}"`, 400)
      }
      const rolesForTable = TABLE_ROLES[table] || ["Admin"]
      auth = await requireRole(req, rolesForTable)
      if (table === "credit_approvals" && action !== "insert" && isBrokerOnly(auth.roles)) {
        return buildError("Brokers cannot modify or delete credit approvals", 403)
      }
    } else {
      if (!sub_actions || !Array.isArray(sub_actions) || sub_actions.length === 0) {
        return buildError("sub_actions array is required for transaction", 400)
      }
      auth = await requireRole(req, ["Driver", "Broker", "TruckOfficer", "Admin", "SuperAdmin", "ATCOfficer", "DeskOfficer"])
      for (const sa of sub_actions || []) {
        const rolesForTable = TABLE_ROLES[sa.table] || ["Admin"]
        if (!auth.roles.some(r => rolesForTable.includes(r))) {
          return buildError(`Access denied for ${sa.action} on ${sa.table}`, 403)
        }
        if (sa.table === "credit_approvals" && sa.action !== "insert" && isBrokerOnly(auth.roles)) {
          return buildError("Brokers cannot modify or delete credit approvals", 403)
        }
      }
    }

    if (!auth) return buildError("Authentication required", 401)

    switch (action) {
      case "insert": {
        if (!data) return buildError("data is required for insert", 400)
        let insertData = data
        if (table === "Trips") {
          const prepared = await prepareTripInsert(data, auth)
          if (prepared.conflict) return buildError(ACTIVE_TRIP_ERROR, 409)
          if (prepared.error) return buildError(prepared.error, 500)
          insertData = prepared.data
        }
        const { data: result, error } = await supabaseAdmin.from(table!).insert([insertData]).select()
        if (error) {
          console.error("Mutation failed", error)
          return buildMutationError(error)
        }
        // Trip Started
        if (table === "Trips" && result?.[0]) {
          const row = result[0] as Record<string, unknown>
          createTripPaymentRecord(row).catch(console.error)
          if (row.trip_status === "In transit" && row.material_centre) {
            const tripId = row.trip_id as string
            const plate = row.plate_number as string
            const mc = row.material_centre as string
            notifyBrokerNewTripStarted(tripId, mc).catch(console.error)
            notifyATCNewTripStarted(tripId, plate, mc).catch(console.error)
            notifyAdminTripStarted(tripId, plate, mc).catch(console.error)
          }
        }
        return NextResponse.json({ data: result })
      }

      case "upsert": {
        if (!data) return buildError("data is required for upsert", 400)
        const upsertOptions = conflict ? { onConflict: conflict } : {}
        const { data: result, error } = await supabaseAdmin.from(table!).upsert([data], upsertOptions).select()
        if (error) {
          console.error("Mutation failed", error)
          return buildMutationError(error)
        }
        return NextResponse.json({ data: result })
      }

      case "update": {
        if (!data) return buildError("data is required for update", 400)
        if (!filters || Object.keys(filters).length === 0) {
          return buildError("filters are required for update", 400)
        }
        let query = supabaseAdmin.from(table!).update(data)
        for (const [key, value] of Object.entries(filters)) {
          query = query.eq(key, value)
        }
        const { data: result, error } = await query.select()
        if (error) {
          console.error("Mutation failed", error)
          return buildMutationError(error)
        }
        const row = result?.[0] as Record<string, unknown> | undefined

        // Trip Completed
        if (table === "Trips" && data.trip_status === "Completed" && row) {
          const tripId = (filters.trip_id ?? row.trip_id) as string
          const plate = row.plate_number as string
          notifyAdminTripCompleted(tripId, plate).catch(console.error)
          notifyATCTripStatusChanged(tripId, plate, "Completed").catch(console.error)
        }

        // Trip Status Changed (hold/resume)
        if (table === "Trips" && data.trip_status && data.trip_status !== "Completed" && row) {
          const tripId = (filters.trip_id ?? row.trip_id) as string
          const plate = row.plate_number as string
          notifyATCTripStatusChanged(tripId, plate, data.trip_status as string).catch(console.error)
        }

        // Truck Status Changed
        if (table === "Trucks" && data.status && row) {
          const plate = (filters.plate_number ?? row.plate_number) as string
          notifyTruckOfficerTruckStatusChange(plate, data.status as string).catch(console.error)
        }

        // Stop Disputed
        if (table === "Stops" && data.disputed === true && row) {
          const plate = row.plate_number as string
          const brokerName = (data.disputed_by as string) || "Broker"
          notifyATCDisputedStop(plate, brokerName).catch(console.error)
          notifyAdminStopDisputed(plate, brokerName).catch(console.error)
        }

        // Stop Resolved (dispute removed)
        if (table === "Stops" && data.disputed === false && row) {
          const plate = row.plate_number as string
          const brokerId = row.broker_id as string
          if (brokerId) {
            notifyBrokerStopResolved(brokerId, plate).catch(console.error)
          }
        }

        // Route Set (dd_trips)
        if (table === "dd_trips" && data.route_points && row) {
          const tripId = (filters.dd_trip_id ?? row.dd_trip_id) as string
          const plate = row.plate_number as string
          const loadingPoint = (row.loading_point as string) || ""
          if (plate) {
            notifyBrokerRouteSet(tripId, plate).catch(console.error)
            notifyATCRouteSet(tripId, plate, loadingPoint).catch(console.error)
            notifyAdminTruckRouteSet(tripId, plate, loadingPoint).catch(console.error)
          }
        }

        return NextResponse.json({ data: result })
      }

      case "delete": {
        if (!filters || Object.keys(filters).length === 0) {
          return buildError("filters are required for delete", 400)
        }
        let query = supabaseAdmin.from(table!).delete()
        for (const [key, value] of Object.entries(filters)) {
          query = query.eq(key, value)
        }
        const { data: result, error } = await query.select()
        if (error) {
          console.error("Mutation failed", error)
          return buildMutationError(error)
        }
        return NextResponse.json({ data: result })
      }

      case "transaction": {
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
          if (sa.table === "Trips" && sa.action === "insert" && sa.data) {
            const prepared = await prepareTripInsert(sa.data, auth)
            if (prepared.conflict) return buildError(ACTIVE_TRIP_ERROR, 409)
            if (prepared.error) return buildError(prepared.error, 500)
            sa.data = prepared.data
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
                  throwSubActionError(error)
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
                  throwSubActionError(error)
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
                  throwSubActionError(error)
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
                  throwSubActionError(error)
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
          if (err instanceof MutationError) return buildError(err.message, err.status)
          return buildError("Transaction failed", 500)
        }
      }

      default:
        return buildError(`Invalid action "${action}"`, 400)
    }
  } catch (err) {
    return handleApiError(err)
  }
}
