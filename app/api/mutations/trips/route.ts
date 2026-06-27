import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const ALLOWED_TABLES = ["Trips", "Trucks", "dd_trips", "trip_load_more", "Stops", "Stop_Confirmations", "trip_discrepancies"] as const

async function authorizeUser(token: string) {
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return null
  return user
}

function buildError(msg: string, status: number) {
  return NextResponse.json({ error: msg }, { status })
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) return buildError("Unauthorized", 401)

  const user = await authorizeUser(authHeader.slice(7))
  if (!user) return buildError("Unauthorized", 401)

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

    if (action !== "transaction") {
      if (!table || !ALLOWED_TABLES.includes(table as any)) {
        return buildError(`Table "${table}" is not supported by this endpoint`, 400)
      }
      if (!["insert", "update", "delete", "upsert"].includes(action)) {
        return buildError(`Invalid action "${action}"`, 400)
      }
    }

    switch (action) {
      case "insert": {
        if (!data) return buildError("data is required for insert", 400)
        const { data: result, error } = await supabaseAdmin.from(table!).insert([data]).select()
        if (error) {
          console.error("Mutation failed", error)
          return buildError("Mutation failed", 500)
        }
        return NextResponse.json({ data: result })
      }

      case "upsert": {
        if (!data) return buildError("data is required for upsert", 400)
        const upsertOptions = conflict ? { onConflict: conflict } : {}
        const { data: result, error } = await supabaseAdmin.from(table!).upsert([data], upsertOptions).select()
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
        let query = supabaseAdmin.from(table!).update(data)
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
        let query = supabaseAdmin.from(table!).delete()
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

      case "transaction": {
        if (!sub_actions || !Array.isArray(sub_actions) || sub_actions.length === 0) {
          return buildError("sub_actions array is required for transaction", 400)
        }
        for (const sa of sub_actions) {
          if (!["insert", "update", "delete", "upsert"].includes(sa.action)) {
            return buildError(`Invalid sub-action "${sa.action}"`, 400)
          }
          if (!ALLOWED_TABLES.includes(sa.table as any)) {
            return buildError(`Table "${sa.table}" is not supported by this endpoint`, 400)
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
                  throw new Error("Sub-action failed")
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
                  throw new Error("Sub-action failed")
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
                  throw new Error("Sub-action failed")
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
                  throw new Error("Sub-action failed")
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
          return buildError("Transaction failed", 500)
        }
      }

      default:
        return buildError(`Invalid action "${action}"`, 400)
    }
  } catch (err) {
    console.error("Mutation error", err)
    return buildError("Internal server error", 500)
  }
}
