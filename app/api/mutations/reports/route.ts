import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { requireAuth, handleApiError } from "@/lib/auth-middleware"
import { notifyDeskOfficerNewComplaint } from "@/lib/notifications"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function buildError(msg: string, status: number) {
  return NextResponse.json({ error: msg }, { status })
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req)

    const body = await req.json()
    const { data } = body as {
      data?: Record<string, unknown>
    }

    if (!data) return buildError("data is required", 400)

    const { data: result, error } = await supabaseAdmin.from("reports").insert([data]).select()
    if (error) {
      console.error("Mutation failed", error)
      return buildError("Action failed, try again. If the issue persists, kindly contact admin or submit a complaint.", 500)
    }
    // Report Submitted
    if (result?.[0]) {
      const reportId = result[0].id as string
      if (reportId) {
        notifyDeskOfficerNewComplaint(reportId).catch(console.error)
      }
    }
    return NextResponse.json({ data: result })
  } catch (err) {
    return handleApiError(err)
  }
}
