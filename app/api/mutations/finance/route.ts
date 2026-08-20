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
} from "@/lib/notifications"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const ALLOWED_TABLES = ["customer_payments", "broker_credits", "store_sales", "store_supply_confirmations", "store_supply_lines", "cash_expenses", "cash_expense_items", "cash_offices", "cash_deposits", "admin_office_assignments", "Customers", "Brokers", "store_stock", "store_officers", "stock_verifications", "price_adjustments", "credit_approvals"] as const
const ALLOWED_RPCS = ["decrement_store_stock", "add_cash_deposit", "authorise_cash_expense", "create_transaction"] as const

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
}

const RPC_ROLES: Record<string, string[]> = {
  decrement_store_stock: ["StoreOfficer", "Admin", "SuperAdmin"],
  add_cash_deposit: ["CashOfficer", "Admin", "SuperAdmin", "Broker", "CashAuthorizer", "DeskOfficer"],
  authorise_cash_expense: ["Admin", "SuperAdmin", "Broker", "CashAuthorizer", "DeskOfficer"],
  create_transaction: ["Admin", "SuperAdmin"],
}

const RPC_PARAM_SCHEMAS: Record<string, string[]> = {
  decrement_store_stock: ["p_store", "p_product", "p_qty"],
  add_cash_deposit: ["p_office_name", "p_amount", "p_note", "p_deposited_by"],
  authorise_cash_expense: ["p_expense_id", "p_admin_id", "p_notes"],
  create_transaction: ["p_from_account", "p_to_account", "p_amount", "p_description", "p_created_by"],
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

function enforceBrokerScope(
  table: string,
  action: string,
  filters: Record<string, unknown> | undefined,
  auth: { userId: string; roles: string[] },
) {
  if (!isBrokerOnly(auth.roles)) return null
  if (table !== "store_sales") return null
  if (action !== "update" && action !== "delete") return null
  if (filters?.broker_id !== auth.userId) {
    return `Access denied for ${action} on ${table}`
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
      await requireRole(req, rolesForRpc)
      const allowedKeys = RPC_PARAM_SCHEMAS[fnName] || []
      const safeParams = Object.fromEntries(
        Object.entries(params || {}).filter(([k]) => allowedKeys.includes(k))
      )
      const result = await supabaseAdmin.rpc(fnName, safeParams)
      if (result.error) {
        return buildError(result.error.message || "RPC failed", 500)
      }
      // Cash Expense Authorised
      if (fnName === "authorise_cash_expense" && params) {
        const expenseId = params.p_expense_id as string
        if (expenseId) {
          // Look up expense details for the notification
          const { data: expense } = await supabaseAdmin
            .from("cash_expenses")
            .select("title, amount, officer_id")
            .eq("expense_id", expenseId)
            .single()
          if (expense) {
            const title = (expense as Record<string, unknown>).title as string || "Expense"
            const amount = (expense as Record<string, unknown>).amount as number || 0
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
        const brokerScopeError = enforceBrokerScope(sa.table, sa.action, sa.filters, auth)
        if (brokerScopeError) {
          return buildError(brokerScopeError, 403)
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

        // Fire notifications from completed transaction sub_actions
        for (const c of completed) {
          const rows = c.result as Record<string, unknown>[] | null
          if (!rows || rows.length === 0) continue
          const row = rows[0]

          // Customer Payment Logged (in transaction)
          if (c.table === "customer_payments" && c.action === "insert") {
            const customerName = row.customer_name as string || "Customer"
            const amount = row.amount as number || 0
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
            const amount = row.amount as number || 0
            if (brokerId) {
              notifyBrokerPaymentPosted(brokerId, customerName, amount).catch(console.error)
            }
          }

          // Store Sale Resubmitted / Confirmed (in transaction)
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

    const brokerScopeError = enforceBrokerScope(table, action, filters, auth)
    if (brokerScopeError) {
      return buildError(brokerScopeError, 403)
    }

    switch (action) {
      case "insert": {
        if (!data) return buildError("data is required for insert", 400)
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
          const amount = (row.amount as number) || (data.amount as number) || 0
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
          const amount = (row.amount as number) || (data.amount as number) || 0
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

        // Store Sale Created
        if (table === "store_sales" && row) {
          const status = (row.status as string) || (data.status as string)
          const brokerId = (row.broker_id as string) || (data.broker_id as string)
          const saleType = (row.sale_type as string) || (data.sale_type as string)
          const saleId = row.sale_id as string

          if (saleType === "truck_load_out") {
            // Load-outs are dispatch records, not sales — skip notifications
          } else if (status === "Pending" && brokerId) {
            const storeName = (row.store_name as string) || (data.store_name as string) || "Store"
            const brokerName = (row.broker_name as string) || (data.broker_name as string) || "Broker"
            notifyBrokerPendingStoreSale(brokerId, storeName).catch(console.error)
            notifyStoreOfficerPendingBrokerSale(storeName).catch(console.error)
            notifyStoreSupervisorPendingBrokerSale(storeName, brokerName).catch(console.error)
            notifyAdminPendingStoreSale(brokerName, storeName, 0).catch(console.error)
            notifyDeskOfficerStoreSaleNeedsAttention(saleId).catch(console.error)
          } else if (status === "Confirmed" && saleId) {
            notifyStoreOfficerSaleConfirmed(saleId).catch(console.error)
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

        // Customer Payment Posted
        if (table === "customer_payments" && data.status === "Posted" && row) {
          const brokerId = row.broker_id as string
          const customerName = row.customer_name as string || "Customer"
          const amount = row.amount as number || 0
          if (brokerId) {
            notifyBrokerPaymentPosted(brokerId, customerName, amount).catch(console.error)
          }
        }

        // Cash Expense Rejected
        if (table === "cash_expenses" && data.status === "Rejected" && row) {
          const expenseId = (filters.expense_id ?? row.expense_id) as string
          const title = row.title as string || "Expense"
          const amount = row.amount as number || 0
          if (expenseId) {
            notifyCashOfficerExpenseActioned(expenseId, "Rejected", title, amount).catch(console.error)
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
