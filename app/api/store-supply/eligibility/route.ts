import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { requireRole, handleApiError } from "@/lib/auth-middleware"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Returns the stores that have an Active store officer. Monitor Trips treats a
// store missing from this list as eligible for an ATC supply confirmation. The
// list is read with the service role because the browser cannot rely on reading
// store_officers directly.
export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ["ATCOfficer", "Admin", "SuperAdmin"])

    const { data, error } = await supabaseAdmin
      .from("store_officers")
      .select("store_name")
      .eq("status", "Active")

    if (error) {
      console.error("Failed to load store officer eligibility", error)
      return NextResponse.json({ error: "Unable to load store eligibility" }, { status: 500 })
    }

    const stores = [...new Set(
      (data || [])
        .map(row => (typeof row.store_name === "string" ? row.store_name.trim() : ""))
        .filter(Boolean),
    )]

    return NextResponse.json({ active_officer_stores: stores })
  } catch (err) {
    return handleApiError(err)
  }
}
