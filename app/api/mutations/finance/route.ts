import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { requireRole, handleApiError } from "@/lib/auth-middleware"
import { includes } from "@/lib/type-utils"
import {
  notifyDeskOfficerNewPayment,
  notifyBrokerPaymentPosted,
  notifyCashAuthorizerNewExpense,
  notifyCashOfficerExpenseActioned,
  notifyBrokerCreditUpdated,
  notifyDeskOfficerCreditAlert,
  notifyBrokerPendingStoreSale,
  notifyStoreOfficerPendingBrokerSale,
  notifyStoreSupervisorPendingBrokerSale,
  notifyAdminPendingStoreSale,
  notifyDeskOfficerStoreSaleNeedsAttention,
  notifyStoreOfficerSaleConfirmed,
  notifyBrokerSaleReturned,
  notifyBrokerStopReturned,
  notifyBrokerStoreSalePosted,
} from "@/lib/notifications"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const ALLOWED_TABLES = ["customer_payments", "broker_credits", "store_sales", "store_supply_confirmations", "store_supply_lines", "cash_expenses", "cash_expense_items", "cash_offices", "cash_deposits", "admin_office_assignments", "Customers", "Brokers", "store_stock", "store_officers", "stock_verifications", "price_adjustments", "credit_approvals", "customer_charts", "new_bookings", "booking_supply_events"] as const
const ALLOWED_RPCS = ["decrement_store_stock", "adjust_store_stock", "log_store_sale", "update_store_sale", "add_cash_deposit", "authorise_cash_expense", "create_transaction", "supply_booking"] as const

const TABLE_ROLES: Record<string, string[]> = {
  customer_payments: ["Broker", "Admin", "SuperAdmin", "DeskOfficer", "Supervisor"],
  broker_credits: ["Broker", "Admin", "SuperAdmin", "DeskOfficer"],
  store_sales: ["StoreOfficer", "Admin", "SuperAdmin", "Supervisor", "StoreSupervisor", "DeskOfficer", "CreditManager", "Broker"],
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
  price_adjustments: ["Broker", "Admin", "SuperAdmin", "DeskOfficer", "CreditManager"],
  credit_approvals: ["Broker", "Admin", "SuperAdmin", "DeskOfficer", "CreditManager"],
  customer_charts: ["Admin", "SuperAdmin", "Broker", "DeskOfficer"],
  new_bookings: ["Broker", "Admin", "SuperAdmin", "ATCOfficer"],
  booking_supply_events: ["Admin", "SuperAdmin", "ATCOfficer"],
}

const STORE_SALE_POSTING_ROLES = ["Admin", "SuperAdmin", "DeskOfficer", "Supervisor"]

// Who may reject a store sale. Rejecting a sale returns its bags to the
// shelf, so a store officer is excluded: they raise the sale, they do not
// void it. The broker may reject their own pending sale.
const STORE_SALE_REJECTION_ROLES = ["Admin", "SuperAdmin", "Supervisor", "DeskOfficer", "Broker"]

// Who may move a cash expense to 'Posted' (Desk Officer's Cash Movement
// Register) and who may reject one. Deliberately excludes CashOfficer: a cash
// officer raises the expense, they do not clear it.
const CASH_EXPENSE_POSTING_ROLES = ["Admin", "SuperAdmin", "DeskOfficer", "CashAuthorizer"]
const CASH_EXPENSE_RESOLUTION_ROLES = ["Admin", "SuperAdmin", "Broker", "CashAuthorizer", "DeskOfficer"]

const RPC_ROLES: Record<string, string[]> = {
  decrement_store_stock: ["StoreOfficer", "Admin", "SuperAdmin"],
  adjust_store_stock: ["StoreOfficer", "Admin", "SuperAdmin", "StoreSupervisor", "Supervisor"],
  log_store_sale: ["StoreOfficer", "Admin", "SuperAdmin"],
  update_store_sale: ["StoreOfficer", "Admin", "SuperAdmin"],
  add_cash_deposit: ["CashOfficer", "Admin", "SuperAdmin", "Broker", "CashAuthorizer", "DeskOfficer"],
  authorise_cash_expense: ["Admin", "SuperAdmin", "Broker", "CashAuthorizer", "DeskOfficer"],
  create_transaction: ["Admin", "SuperAdmin"],
  supply_booking: ["Admin", "SuperAdmin", "ATCOfficer"],
}

const RPC_PARAM_SCHEMAS: Record<string, string[]> = {
  decrement_store_stock: ["p_store", "p_product", "p_qty"],
  adjust_store_stock: ["p_store", "p_product", "p_delta"],
  log_store_sale: ["p_sale"],
  update_store_sale: ["p_sale_id", "p_sale"],
  add_cash_deposit: ["p_office_name", "p_amount", "p_note", "p_deposited_by"],
  authorise_cash_expense: ["p_expense_id", "p_admin_id", "p_notes"],
  create_transaction: ["p_from_account", "p_to_account", "p_amount", "p_description", "p_created_by"],
  supply_booking: ["p_booking_id", "p_bags", "p_supply_date", "p_supplied_by", "p_idempotency_key"],
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

function isBrokerOnly(roles: string[]) {
  return roles.includes("Broker") &&
    !roles.some(r => ["Admin", "SuperAdmin", "DeskOfficer", "Supervisor", "CreditManager", "StoreOfficer", "StoreSupervisor"].includes(r))
}

function isBookingBroker(roles: string[]) {
  return roles.includes("Broker") &&
    !roles.some(r => ["Admin", "SuperAdmin"].includes(r))
}

function toAmount(value: unknown): number {
  return Number(value) || 0
}

/**
 * Guards status transitions that must not be made by a generic write.
 *
 * Both the single-update path and the transaction sub-action path call this,
 * so a status cannot be changed by going around the dedicated endpoints.
 * Returns an error to send back, or null when the transition is allowed.
 */
function validateStatusTransition(
  table: string,
  action: string,
  data: Record<string, unknown> | undefined,
  roles: string[],
): { error: string; status: number } | null {
  if (!data) return null
  const status = data.status as string | undefined
  if (!status) return null

  if (table === "cash_expenses") {
    // A cash expense only moves through its own endpoints: the authorisation
    // RPC, which is the only path that also moves the office balance, and the
    // dedicated post and reject branches in the update path. Any other status
    // change is refused, so the expense state machine cannot be bypassed.
    if (action === "insert") {
      if (status !== "Pending") {
        return { error: `A new cash expense must be created as Pending, not ${status}`, status: 400 }
      }
      return null
    }
    if (status === "Authorised") {
      return { error: "Cash expenses can only be authorised through the authorisation endpoint", status: 400 }
    }
    return { error: `Cash expenses cannot be changed to ${status} here; use the dedicated endpoint`, status: 400 }
  }

  // Rejecting a sale returns its bags to the shelf, so it is limited to the
  // roles that may void a sale.
  if (table === "store_sales" && status === "Rejected") {
    if (!roles.some(r => STORE_SALE_REJECTION_ROLES.includes(r))) {
      return { error: "You do not have permission to reject store sales", status: 403 }
    }
  }

  return null
}

// store_sales.total_amount is 0 for broker sales logged before prices are
// entered, so fall back to recomputing from the items array.
function storeSaleAmount(row: Record<string, unknown>): number {
  const total = toAmount(row.total_amount)
  if (total > 0) return total
  const items = Array.isArray(row.items) ? (row.items as Array<Record<string, unknown>>) : []
  return items.reduce(
    (sum, item) => sum + (toAmount(item.quantity) * toAmount(item.price_per_bag)),
    0,
  )
}

async function enforceBrokerScope(
  table: string,
  action: string,
  filters: Record<string, unknown> | undefined,
  data: Record<string, unknown> | undefined,
  auth: { userId: string; roles: string[] },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any,
) {
  if (table === "new_bookings") {
    if (!isBookingBroker(auth.roles)) return null
    if (action === "upsert") return "Brokers cannot upsert bookings"
    if (action === "insert") {
      if (data) data.broker_id = auth.userId
      return null
    }
    if (action !== "update" && action !== "delete") return null
    if (data?.status === "supplied" && auth.roles.includes("ATCOfficer")) return null
    if (data?.status === "partial" && auth.roles.includes("ATCOfficer")) return null
    const bookingId = filters?.id as string | undefined
    if (!bookingId) return `Access denied for ${action} on ${table}`
    if (!supabaseClient) return `Access denied for ${action} on ${table}`
    const { data: row, error } = await supabaseClient
      .from("new_bookings")
      .select("broker_id")
      .eq("id", bookingId)
      .single()
    if (error || !row || (row as Record<string, unknown>).broker_id !== auth.userId) {
      return `Access denied for ${action} on ${table}`
    }
    if (filters) filters.broker_id = auth.userId
    return null
  }

  if (!isBrokerOnly(auth.roles)) return null
  if (table !== "store_sales" && table !== "customer_charts") return null
  if (action !== "update" && action !== "delete") return null
  if (filters?.broker_id !== auth.userId) {
    return `Access denied for ${action} on ${table}`
  }
  return null
}

function enforceBookingAuthorization(
  data: Record<string, unknown> | undefined,
  auth: { userId: string; roles: string[] },
  action?: string,
) {
  if (!data) return null
  const isAdmin = auth.roles.some(r => ["Admin", "SuperAdmin"].includes(r))
  const hasATC = auth.roles.includes("ATCOfficer") && !isAdmin
  const hasBroker = isBookingBroker(auth.roles)
  const isATCOnly = hasATC && !hasBroker
  const isBrokerATC = hasATC && hasBroker

  // ATC-only officers (not brokers): restrict to supply fields for updates
  if (isATCOnly && action !== "insert") {
    if ("status" in data && data.status !== "supplied" && data.status !== "partial") {
      return "ATC Officers can only mark bookings as supplied or partial"
    }
    const allowed = ["status", "supply_date", "supplied_by", "bags_supplied"]
    for (const key of Object.keys(data)) {
      if (!allowed.includes(key)) return "ATC Officers can only update supply fields"
    }
    return null
  }

  // Brokers (with or without ATC role): apply broker rules
  if (hasBroker) {
    if (action === "upsert") return "Brokers cannot upsert bookings"
    const isSupplyOp = isBrokerATC && (data.status === "supplied" || data.status === "partial")
    if (isSupplyOp) {
      const supplyAllowed = ["status", "supply_date", "supplied_by", "bags_supplied"]
      for (const key of Object.keys(data)) {
        if (!supplyAllowed.includes(key)) return "Supply operations can only modify status, supply_date, supplied_by, or bags_supplied"
      }
    }
    const forbidden = ["reviewed_by", "reviewed_at"]
    if (action !== "insert") forbidden.push("broker_id")
    if (!isSupplyOp && action === "update") {
      forbidden.push("status", "supplied_by", "supply_date", "bags_supplied")
    }
    for (const f of forbidden) {
      delete data[f]
    }
    if (!isSupplyOp) {
      const companyPrice = data.company_price as number | null
      const ratePerBag = data.rate_per_bag as number
      if (companyPrice == null || companyPrice === 0 || (ratePerBag && ratePerBag !== companyPrice)) {
        data.status = "awaiting_review"
      } else {
        data.status = "pending"
      }
    }
    return null
  }

  return null
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
      const rpcAuth = await requireRole(req, rolesForRpc)
      const allowedKeys = RPC_PARAM_SCHEMAS[fnName] || []
      let safeParams = Object.fromEntries(
        Object.entries(params || {}).filter(([k]) => allowedKeys.includes(k))
      )

      // A sale is always recorded against the authenticated user, never a
      // client supplied officer id.
      if (fnName === "log_store_sale") {
        const sale = { ...((safeParams.p_sale as Record<string, unknown> | undefined) || {}) }
        sale.officer_id = rpcAuth.userId
        safeParams = { ...safeParams, p_sale: sale }
      }

      // Store officers may only move stock for their own store. The RPC takes
      // the store name from the payload, so the check has to happen here.
      // Admins, supervisors and store supervisors are not store officers and
      // are not scoped this way.
      if (fnName === "log_store_sale" || fnName === "update_store_sale" || fnName === "adjust_store_stock") {
        const isStoreOfficer = rpcAuth.roles.includes("StoreOfficer")
        const isPrivileged = rpcAuth.roles.some(r => ["Admin", "SuperAdmin"].includes(r))
        if (isStoreOfficer && !isPrivileged) {
          const { data: officerRow } = await supabaseAdmin
            .from("store_officers")
            .select("store_name")
            .eq("officer_id", rpcAuth.userId)
            .maybeSingle()
          const officerStore = (officerRow as Record<string, unknown> | null)?.store_name as string | undefined
          if (!officerStore) {
            return buildError("No store is assigned to your account", 403)
          }
          let targetStore: string | undefined
          if (fnName === "log_store_sale") {
            targetStore = (safeParams.p_sale as Record<string, unknown> | undefined)?.store_name as string | undefined
          } else if (fnName === "adjust_store_stock") {
            targetStore = safeParams.p_store as string | undefined
          } else {
            const { data: saleRow } = await supabaseAdmin
              .from("store_sales")
              .select("store_name")
              .eq("sale_id", safeParams.p_sale_id as string)
              .maybeSingle()
            targetStore = (saleRow as Record<string, unknown> | null)?.store_name as string | undefined
          }
          if (targetStore !== officerStore) {
            return buildError("You can only manage stock for your own store", 403)
          }
        }
      }

      const result = await supabaseAdmin.rpc(fnName, safeParams)
      if (result.error) {
        const message = result.error.message || "RPC failed"
        // The stock functions raise a readable message when the shelf cannot
        // cover a movement. That is a business rule, not a server fault.
        if (message.includes("insufficient_stock")) {
          return buildError(message.replace("insufficient_stock:", "").trim() || "Not enough stock", 400)
        }
        return buildError(message, 500)
      }
      // Store Sale Logged — the sale row and every stock deduction were
      // committed together by log_store_sale, so by this point the sale
      // definitely exists and the stock definitely moved.
      if (fnName === "log_store_sale") {
        const payload = (result.data ?? null) as Record<string, unknown> | null
        if (payload && payload.success === false) {
          const reason = (payload.error as string) || "failed"
          if (reason === "insufficient_stock") {
            const product = (payload.product as string) || "stock"
            const available = toAmount(payload.available)
            const required = toAmount(payload.required)
            return buildError(
              `Insufficient ${product} stock — ${available} available, ${required} required. Nothing was saved.`,
              400,
            )
          }
          return buildError(`Could not log sale: ${reason}. Nothing was saved.`, 400)
        }

        const sale = (payload?.sale ?? null) as Record<string, unknown> | null
        const saleId = (payload?.sale_id ?? sale?.sale_id) as string | undefined
        if (sale && saleId) {
          const status = sale.status as string
          const brokerId = sale.broker_id as string
          const saleType = sale.sale_type as string
          const storeName = (sale.store_name as string) || "Store"

          if (saleType !== "truck_load_out") {
            if (status === "Pending" && brokerId) {
              const brokerName = (sale.broker_name as string) || "Broker"
              notifyBrokerPendingStoreSale(brokerId, storeName).catch(console.error)
              notifyStoreOfficerPendingBrokerSale(storeName).catch(console.error)
              notifyStoreSupervisorPendingBrokerSale(storeName, brokerName).catch(console.error)
              notifyAdminPendingStoreSale(brokerName, storeName, 0).catch(console.error)
              notifyDeskOfficerStoreSaleNeedsAttention(saleId).catch(console.error)
            } else if (status === "Confirmed") {
              notifyStoreOfficerSaleConfirmed(saleId).catch(console.error)
            }
          }
        }
      }

      // Store Sale Edited — the sale row and every stock movement it implies
      // were committed together by update_store_sale.
      if (fnName === "update_store_sale") {
        const payload = (result.data ?? null) as Record<string, unknown> | null
        if (payload && payload.success === false) {
          const reason = (payload.error as string) || "failed"
          if (reason === "insufficient_stock") {
            const product = (payload.product as string) || "stock"
            const available = toAmount(payload.available)
            const required = toAmount(payload.required)
            return buildError(
              `Insufficient ${product} — only ${available} bags available, ${required} needed. Nothing was changed.`,
              400,
            )
          }
          return buildError(`Could not update sale: ${reason}. Nothing was changed.`, 400)
        }

        const sale = (payload?.sale ?? null) as Record<string, unknown> | null
        const saleId = (payload?.sale_id ?? sale?.sale_id) as string | undefined
        if (sale && saleId) {
          const status = sale.status as string
          const brokerId = sale.broker_id as string
          const saleType = sale.sale_type as string
          const storeName = (sale.store_name as string) || "Store"

          if (saleType !== "truck_load_out") {
            if (status === "Pending" && brokerId) {
              const brokerName = (sale.broker_name as string) || "Broker"
              notifyBrokerPendingStoreSale(brokerId, storeName).catch(console.error)
              notifyStoreOfficerPendingBrokerSale(storeName).catch(console.error)
              notifyStoreSupervisorPendingBrokerSale(storeName, brokerName).catch(console.error)
              notifyAdminPendingStoreSale(brokerName, storeName, 0).catch(console.error)
              notifyDeskOfficerStoreSaleNeedsAttention(saleId).catch(console.error)
            } else if (status === "Confirmed") {
              notifyStoreOfficerSaleConfirmed(saleId).catch(console.error)
            }
          }
        }
      }

      // Cash Expense Authorised
      if (fnName === "authorise_cash_expense" && params) {
        const expenseId = params.p_expense_id as string
        if (expenseId) {
          // Look up expense details for the notification
          const { data: expense } = await supabaseAdmin
            .from("cash_expenses")
            .select("title, total_amount")
            .eq("expense_id", expenseId)
            .single()
          if (expense) {
            const title = (expense as Record<string, unknown>).title as string || "Expense"
            const amount = toAmount((expense as Record<string, unknown>).total_amount ?? (expense as Record<string, unknown>).amount)
            notifyCashOfficerExpenseActioned(expenseId, "Authorised", title, amount).catch(console.error)
          }
        }
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
        // A sale has to be recorded through log_store_sale so that the stock is
        // deducted in the same transaction. The compensating rollback in this
        // path cannot put a deduction back, so an insert here is not safe.
        if (sa.table === "store_sales" && sa.action === "insert") {
          return buildError("Store sales must be recorded through the log sale endpoint so the stock is deducted in the same transaction", 400)
        }
      }

      const auth = await requireRole(req, ["Broker", "Admin", "SuperAdmin", "DeskOfficer", "Supervisor", "StoreOfficer", "StoreSupervisor", "CashOfficer", "CashAuthorizer", "CreditManager"])

      for (const sa of sub_actions) {
        const rolesForTable = TABLE_ROLES[sa.table] || ["Admin"]
        if (!auth.roles.some(r => rolesForTable.includes(r))) {
          return buildError(`Access denied for ${sa.action} on ${sa.table}`, 403)
        }
        if (sa.table === "credit_approvals" && sa.action !== "insert" && isBrokerOnly(auth.roles)) {
          return buildError("Brokers cannot modify or delete credit approvals", 403)
        }
        if (sa.table === "customer_charts" && sa.action !== "insert" && !auth.roles.some(r => ["Admin", "SuperAdmin"].includes(r))) {
          return buildError("Only admins can modify or delete chart records", 403)
        }
        if (sa.table === "booking_supply_events" && sa.action !== "insert" && auth.roles.includes("ATCOfficer") && !auth.roles.some(r => ["Admin", "SuperAdmin"].includes(r))) {
          return buildError("ATC Officers can only insert supply events", 403)
        }
        if (sa.table === "store_sales" && sa.action === "update" && sa.data?.status === "Posted") {
          if (!auth.roles.some(r => STORE_SALE_POSTING_ROLES.includes(r))) {
            return buildError("You do not have permission to post store sales", 403)
          }
          // Set posted_by and posted_at server-side, enforce atomic status predicate
          sa.data.posted_by = auth.userId
          sa.data.posted_at = new Date().toISOString()
        }
        // The same status rules as the single-update path, so a transaction
        // cannot be used to go around the dedicated endpoints.
        const transitionError = validateStatusTransition(sa.table, sa.action, sa.data, auth.roles)
        if (transitionError) {
          return buildError(transitionError.error, transitionError.status)
        }
        const brokerScopeError = await enforceBrokerScope(sa.table, sa.action, sa.filters, sa.data, auth, supabaseAdmin)
        if (brokerScopeError) {
          return buildError(brokerScopeError, 403)
        }
        if (sa.table === "new_bookings" && (sa.action === "update" || sa.action === "insert")) {
          const bookingAuthError = enforceBookingAuthorization(sa.data, auth, sa.action)
          if (bookingAuthError) {
            return buildError(bookingAuthError, 403)
          }
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
              // Atomic posting predicate: only transition from Confirmed, reject truck_load_out
              if (sa.table === "store_sales" && sa.data.status === "Posted") {
                q = q.eq("status", "Confirmed").neq("sale_type", "truck_load_out")
              }
              for (const [k, v] of Object.entries(sa.filters)) {
                q = q.eq(k, v)
              }
              const { data: r, error } = await q.select()
              if (error) {
                console.error("Sub-action failed", error)
                throw new Error(error.message || "Sub-action failed")
              }
              if (sa.table === "store_sales" && sa.data.status === "Posted" && (!r || r.length === 0)) {
                throw new Error("Sale is not in Confirmed status or is a truck load out")
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

        // Fire notifications from completed transaction sub_actions
        for (const c of completed) {
          const rows = c.result as Record<string, unknown>[] | null
          if (!rows || rows.length === 0) continue
          const row = rows[0]

          // Customer Payment Logged (in transaction)
          if (c.table === "customer_payments" && c.action === "insert") {
            const customerName = row.customer_name as string || "Customer"
            const amount = toAmount(row.amount)
            const brokerId = row.broker_id as string
            notifyDeskOfficerNewPayment(customerName, amount).catch(console.error)
            if (brokerId) {
              notifyBrokerPaymentPosted(brokerId, customerName, amount).catch(console.error)
            }
          }

          // Customer Payment Posted (in transaction)
          if (c.table === "customer_payments" && c.action === "update" && row.status === "Posted") {
            const brokerId = row.broker_id as string
            const customerName = row.customer_name as string || "Customer"
            const amount = toAmount(row.amount)
            if (brokerId) {
              notifyBrokerPaymentPosted(brokerId, customerName, amount).catch(console.error)
            }
          }

          // Store Sale Resubmitted / Confirmed / Posted (in transaction)
          if (c.table === "store_sales" && c.action === "update") {
            const saleId = row.sale_id as string
            const brokerId = row.broker_id as string
            const saleType = row.sale_type as string
            if (saleType !== "truck_load_out") {
              if (row.status === "Pending" && brokerId) {
                const storeName = row.store_name as string || "Store"
                const brokerName = row.broker_name as string || "Broker"
                notifyBrokerPendingStoreSale(brokerId, storeName).catch(console.error)
                notifyStoreOfficerPendingBrokerSale(storeName).catch(console.error)
                notifyStoreSupervisorPendingBrokerSale(storeName, brokerName).catch(console.error)
                notifyAdminPendingStoreSale(brokerName, storeName, 0).catch(console.error)
                notifyDeskOfficerStoreSaleNeedsAttention(saleId).catch(console.error)
              } else if (row.status === "Confirmed" && saleId) {
                notifyStoreOfficerSaleConfirmed(saleId).catch(console.error)
              } else if (row.status === "Posted" && brokerId) {
                const storeName = row.store_name as string || "Store"
                const amount = storeSaleAmount(row)
                notifyBrokerStoreSalePosted(brokerId, storeName, amount).catch(console.error)
              }
            }
          }
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

        const errAny = err as Record<string, unknown>
        console.error("Transaction failed:", {
          message: errAny?.message || String(err),
          code: errAny?.code,
          details: errAny?.details,
          hint: errAny?.hint,
          failedAtSubAction: completed.length,
          completedTables: completed.map(c => `${c.action}:${c.table}`),
          subActionTables: sub_actions.map(sa => `${sa.action}:${sa.table}:${JSON.stringify(sa.filters || {})}`),
        })
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
    const auth = await requireRole(req, rolesForTable)

    if (table === "credit_approvals" && action !== "insert" && isBrokerOnly(auth.roles)) {
      return buildError("Brokers cannot modify or delete credit approvals", 403)
    }

    if (table === "customer_charts" && action !== "insert" && !auth.roles.some(r => ["Admin", "SuperAdmin"].includes(r))) {
      return buildError("Only admins can modify or delete chart records", 403)
    }

    const brokerScopeError = await enforceBrokerScope(table, action, filters, data, auth, supabaseAdmin)
    if (brokerScopeError) {
      return buildError(brokerScopeError, 403)
    }

    if (table === "new_bookings" && (action === "update" || action === "insert")) {
      const bookingAuthError = enforceBookingAuthorization(data, auth, action)
      if (bookingAuthError) {
        return buildError(bookingAuthError, 403)
      }
    }

    if (table === "booking_supply_events" && action !== "insert" && auth.roles.includes("ATCOfficer") && !auth.roles.some(r => ["Admin", "SuperAdmin"].includes(r))) {
      return buildError("ATC Officers can only insert supply events", 403)
    }

    switch (action) {
      case "insert": {
        if (!data) return buildError("data is required for insert", 400)

        // A store sale must never be written without its stock moving with it.
        // Sales are recorded through the log_store_sale RPC, which inserts the
        // sale and deducts the stock in one transaction and applies the role,
        // store and officer checks that belong with it. A generic insert would
        // skip all of that.
        if (table === "store_sales") {
          return buildError("Store sales must be recorded through the log_store_sale endpoint", 400)
        }

        const { data: result, error } = await supabaseAdmin.from(table).insert([data]).select()
        if (error) {
          console.error("Mutation failed", error)
          if (process.env.NODE_ENV === 'development') {
            const errAny = error as unknown as Record<string, unknown>
            return buildError(`DB Error: ${errAny.message || String(error)} (code: ${errAny.code}, details: ${errAny.details}, hint: ${errAny.hint})`, 500)
          }
          return buildError("Action failed, try again. If the issue persists, kindly contact admin or submit a complaint.", 500)
        }
        const row = result?.[0] as Record<string, unknown> | undefined

        // Customer Payment Logged
        if (table === "customer_payments" && row) {
          const customerName = (row.customer_name as string) || (data.customer_name as string) || "Customer"
          const amount = toAmount(row.amount ?? data.amount)
          const brokerId = (row.broker_id as string) || (data.broker_id as string)
          notifyDeskOfficerNewPayment(customerName, amount).catch(console.error)
          if (brokerId) {
            notifyBrokerPaymentPosted(brokerId, customerName, amount).catch(console.error)
          }
        }

        // Cash Expense Created
        if (table === "cash_expenses" && row) {
          const expenseId = row.expense_id as string
          const title = (row.title as string) || (data.title as string) || "Expense"
          const amount = toAmount(row.total_amount ?? row.amount ?? data.total_amount ?? data.amount)
          if (expenseId) {
            notifyCashAuthorizerNewExpense(expenseId, "Cash Officer", title, amount).catch(console.error)
          }
        }

        // Broker Credit Created/Updated
        if (table === "broker_credits" && row) {
          const brokerId = (row.broker_id as string) || (data.broker_id as string)
          const customerName = (row.customer_name as string) || (data.customer_name as string) || "Customer"
          if (brokerId) {
            notifyBrokerCreditUpdated(brokerId, customerName).catch(console.error)
          }
          notifyDeskOfficerCreditAlert(customerName).catch(console.error)
        }

        // Store Sale Created is handled above, inside the log_store_sale
        // branch, so the sale and its stock deduction are notified together.

        return NextResponse.json({ data: result })
      }

      case "upsert": {
        if (!data) return buildError("data is required for upsert", 400)
        const upsertOptions = conflict ? { onConflict: conflict } : {}
        const { data: result, error } = await supabaseAdmin.from(table).upsert([data], upsertOptions).select()
        if (error) {
          console.error("Mutation failed", error)
          if (process.env.NODE_ENV === 'development') {
            const errAny = error as unknown as Record<string, unknown>
            return buildError(`DB Error: ${errAny.message || String(error)} (code: ${errAny.code}, details: ${errAny.details}, hint: ${errAny.hint})`, 500)
          }
          return buildError("Action failed, try again. If the issue persists, kindly contact admin or submit a complaint.", 500)
        }
        return NextResponse.json({ data: result })
      }

      case "update": {
        if (!data) return buildError("data is required for update", 400)
        if (!filters || Object.keys(filters).length === 0) {
          return buildError("filters are required for update", 400)
        }

        // Store Sale Rejected — a rejected sale is void, so the bags it took
        // go back on the shelf. That movement is made by the database trigger
        // trg_store_sales_stock_sync, in the same transaction as this update,
        // so the sale and the stock can never disagree. Who may reject is
        // decided by validateStatusTransition below, which the transaction
        // path uses as well.

        // Store Sale Posted — dedicated atomic posting transition
        if (table === "store_sales" && data.status === "Posted") {
          if (!auth.roles.some(r => STORE_SALE_POSTING_ROLES.includes(r))) {
            return buildError("You do not have permission to post store sales", 403)
          }
          // Set posted_by and posted_at server-side
          data.posted_by = auth.userId
          data.posted_at = new Date().toISOString()
          // Atomic predicate: only transition from Confirmed, reject truck_load_out
          let postQuery = supabaseAdmin.from(table).update(data)
            .eq("status", "Confirmed")
            .neq("sale_type", "truck_load_out")
          for (const [k, v] of Object.entries(filters)) {
            postQuery = postQuery.eq(k, v)
          }
          const { data: postResult, error: postError } = await postQuery.select()
          if (postError) {
            console.error("Store sale post failed", postError)
            return buildError("Failed to post store sale. Try again.", 500)
          }
          if (!postResult || postResult.length === 0) {
            return buildError("Sale is not in Confirmed status or is a truck load out", 400)
          }
          // Notify broker for every updated sale
          for (const postRow of postResult || []) {
            const saleRow = postRow as Record<string, unknown>
            const brokerId = saleRow.broker_id as string
            const storeName = saleRow.store_name as string || "Store"
            const amount = storeSaleAmount(saleRow)
            if (brokerId) {
              notifyBrokerStoreSalePosted(brokerId, storeName, amount).catch(console.error)
            }
          }
          return NextResponse.json({ data: postResult })
        }

        // Cash Expense status transitions.
        //
        // A cash expense moves Pending -> Authorised -> Posted, or
        // Pending -> Rejected. 'Authorised' must go through
        // authorise_cash_expense, which is the only path that also deducts the
        // office balance. 'Posted' may only be applied to an already-Authorised
        // expense, and 'Rejected' only to a still-Pending one. Without those
        // predicates an already-Authorised or Posted expense could be flipped
        // back to 'Rejected' by a stray update, which is what made posted
        // expenses render as rejected on the drill-down.
        if (table === "cash_expenses" && data.status === "Posted") {
          if (!auth.roles.some(r => CASH_EXPENSE_POSTING_ROLES.includes(r))) {
            return buildError("You do not have permission to post cash expenses", 403)
          }
          // Stamp the poster server side rather than trusting the client.
          data.posted_by = auth.userId
          data.posted_at = new Date().toISOString()
          let postQuery = supabaseAdmin.from(table).update(data).eq("status", "Authorised")
          for (const [k, v] of Object.entries(filters)) {
            postQuery = postQuery.eq(k, v)
          }
          const { data: postResult, error: postError } = await postQuery.select()
          if (postError) {
            console.error("Cash expense post failed", postError)
            return buildError("Failed to post expense. Try again.", 500)
          }
          if (!postResult || postResult.length === 0) {
            return buildError("Expense is not in Authorised status", 400)
          }
          return NextResponse.json({ data: postResult })
        }

        if (table === "cash_expenses" && data.status === "Rejected") {
          if (!auth.roles.some(r => CASH_EXPENSE_RESOLUTION_ROLES.includes(r))) {
            return buildError("You do not have permission to reject cash expenses", 403)
          }
          // A cash officer cannot reject their own expense.
          const rejectId = (filters.expense_id ?? filters.id) as string | undefined
          if (!rejectId) {
            return buildError("expense_id is required to reject an expense", 400)
          }
          const { data: existingRows } = await supabaseAdmin
            .from(table)
            .select("expense_id, clerk_id, status")
            .eq("expense_id", rejectId)
          const existing = existingRows?.[0] as Record<string, unknown> | undefined
          if (existing && existing.clerk_id === auth.userId) {
            return buildError("You cannot reject your own expense", 403)
          }
          if (existing && existing.status !== "Pending") {
            return buildError(`Expense is already ${existing.status} and cannot be rejected`, 400)
          }
          // Only a Pending expense may be rejected.
          let rejectQuery = supabaseAdmin.from(table).update(data).eq("status", "Pending")
          for (const [k, v] of Object.entries(filters)) {
            rejectQuery = rejectQuery.eq(k, v)
          }
          const { data: rejectResult, error: rejectError } = await rejectQuery.select()
          if (rejectError) {
            console.error("Cash expense reject failed", rejectError)
            return buildError("Failed to reject expense. Try again.", 500)
          }
          if (!rejectResult || rejectResult.length === 0) {
            return buildError("Expense is not in Pending status and cannot be rejected", 400)
          }
          const rejectedRow = rejectResult[0] as Record<string, unknown>
          const expenseId = (filters.expense_id ?? rejectedRow.expense_id) as string
          const title = (rejectedRow.title as string) || "Expense"
          const amount = toAmount(rejectedRow.total_amount ?? rejectedRow.amount)
          if (expenseId) {
            notifyCashOfficerExpenseActioned(expenseId, "Rejected", title, amount).catch(console.error)
          }
          return NextResponse.json({ data: rejectResult })
        }

        // The status rules that apply to every write path: a cash expense may
        // not be authorised by a generic write, and rejecting a sale needs a
        // role that may void a sale.
        const transitionError = validateStatusTransition(table, action, data, auth.roles)
        if (transitionError) {
          return buildError(transitionError.error, transitionError.status)
        }

        let query = supabaseAdmin.from(table).update(data)
        query = applyFilters(query, filters)
        const { data: result, error } = await query.select()
        if (error) {
          console.error("Mutation failed", error)
          if (process.env.NODE_ENV === 'development') {
            const errAny = error as unknown as Record<string, unknown>
            return buildError(`DB Error: ${errAny.message || String(error)} (code: ${errAny.code}, details: ${errAny.details}, hint: ${errAny.hint})`, 500)
          }
          return buildError("Action failed, try again. If the issue persists, kindly contact admin or submit a complaint.", 500)
        }
        const row = result?.[0] as Record<string, unknown> | undefined

        // A stock update that matched no row is a silent failure: PostgREST
        // reports no error, the caller believes the balance moved, and the
        // stock ledger silently drifts. Fail loudly instead.
        if (table === "store_stock" && (!result || result.length === 0)) {
          return buildError("Stock row not found - nothing was changed", 400)
        }

        // Customer Payment Posted
        if (table === "customer_payments" && data.status === "Posted" && row) {
          const brokerId = row.broker_id as string
          const customerName = row.customer_name as string || "Customer"
          const amount = toAmount(row.amount)
          if (brokerId) {
            notifyBrokerPaymentPosted(brokerId, customerName, amount).catch(console.error)
          }
        }

        // Broker Credit Updated
        if (table === "broker_credits" && row) {
          const brokerId = row.broker_id as string
          const customerName = row.customer_name as string || "Customer"
          if (brokerId) {
            notifyBrokerCreditUpdated(brokerId, customerName).catch(console.error)
          }
        }

        // Store Sale Resubmitted / Confirmed
        if (table === "store_sales" && row) {
          const saleId = row.sale_id as string
          const brokerId = row.broker_id as string
          const saleType = row.sale_type as string
          if (saleType !== "truck_load_out") {
            if (data.status === "Pending" && brokerId) {
              const storeName = row.store_name as string || "Store"
              const brokerName = row.broker_name as string || "Broker"
              notifyBrokerPendingStoreSale(brokerId, storeName).catch(console.error)
              notifyStoreOfficerPendingBrokerSale(storeName).catch(console.error)
              notifyStoreSupervisorPendingBrokerSale(storeName, brokerName).catch(console.error)
              notifyAdminPendingStoreSale(brokerName, storeName, 0).catch(console.error)
              notifyDeskOfficerStoreSaleNeedsAttention(saleId).catch(console.error)
            } else if (data.status === "Confirmed" && saleId) {
              notifyStoreOfficerSaleConfirmed(saleId).catch(console.error)
            }
          }
        }

        // Price Adjustment Denied – notify broker to edit price
        if (table === "price_adjustments" && data.status === "Denied" && row) {
          const brokerId = row.broker_id as string
          const denialReason = (data.denial_reason as string) || "No reason provided"
          const sourceType = row.source_type as string
          const groupId = row.group_id as string | null
          if (brokerId) {
            if (sourceType === "store_sale") {
              // Deduplicate: for grouped denials, only notify once per group
              let skipNotify = false
              if (groupId) {
                const { data: existingDenied } = await supabaseAdmin
                  .from("price_adjustments")
                  .select("id")
                  .eq("group_id", groupId)
                  .eq("status", "Denied")
                  .neq("id", row.id)
                if (existingDenied && existingDenied.length > 0) skipNotify = true
              }

              if (!skipNotify) {
                const sourceId = row.source_id as string
                const { data: sale, error: saleErr } = await supabaseAdmin.from("store_sales").select("store_name").eq("sale_id", sourceId).single()
                const storeName = !saleErr && sale ? (sale as Record<string, unknown>).store_name as string || "Store" : "Store"
                notifyBrokerSaleReturned(brokerId, storeName, denialReason).catch(console.error)
              }
            } else {
              notifyBrokerStopReturned(brokerId, row.area as string || "", denialReason).catch(console.error)
            }
          }
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
          if (process.env.NODE_ENV === 'development') {
            const errAny = error as unknown as Record<string, unknown>
            return buildError(`DB Error: ${errAny.message || String(error)} (code: ${errAny.code}, details: ${errAny.details}, hint: ${errAny.hint})`, 500)
          }
          return buildError("Action failed, try again. If the issue persists, kindly contact admin or submit a complaint.", 500)
        }
        return NextResponse.json({ data: result })
      }
    }
  } catch (err) {
    return handleApiError(err)
  }
}
