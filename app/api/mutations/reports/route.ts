import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

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
    const { data } = body as {
      data?: Record<string, unknown>
    }

    if (!data) return buildError("data is required", 400)

    const { data: result, error } = await supabaseAdmin.from("reports").insert([data]).select()
    if (error) {
      console.error("Mutation failed", error)
      return buildError("Mutation failed", 500)
    }
    return NextResponse.json({ data: result })
  } catch (err) {
    console.error("Mutation error", err)
    return buildError("Internal server error", 500)
  }
}
