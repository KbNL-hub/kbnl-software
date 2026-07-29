import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { requireAuth, handleApiError } from "@/lib/auth-middleware"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const ROLE_TABLE_MAP: Record<string, { table: string; idColumn: string }> = {
  Driver: { table: "Drivers", idColumn: "driver_id" },
  StationManager: { table: "station_managers", idColumn: "manager_id" },
  TruckOfficer: { table: "truck_officers", idColumn: "manager_id" },
  TruckAdmin: { table: "truck_admins", idColumn: "admin_id" },
  StoreOfficer: { table: "store_officers", idColumn: "officer_id" },
  CashOfficer: { table: "cash_officers", idColumn: "clerk_id" },
  DeskOfficer: { table: "desk_officers", idColumn: "officer_id" },
  ATCOfficer: { table: "atc_officers", idColumn: "officer_id" },
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req)
    const userId = auth.userId

    // Clear must_change_password
    const { error: profileError } = await supabaseAdmin
      .from("Profiles")
      .update({ must_change_password: false })
      .eq("user_id", userId)

    if (profileError) {
      return NextResponse.json({ error: "Failed to update profile" }, { status: 500 })
    }

    // Activate role-specific status
    const { data: profile } = await supabaseAdmin
      .from("Profiles")
      .select("role")
      .eq("user_id", userId)
      .single()

    const role = profile?.role
    if (role && ROLE_TABLE_MAP[role]) {
      const { table, idColumn } = ROLE_TABLE_MAP[role]
      await supabaseAdmin
        .from(table)
        .update({ status: "Active" })
        .eq(idColumn, userId)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return handleApiError(err)
  }
}
