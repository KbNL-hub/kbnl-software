import { createClient } from "@supabase/supabase-js"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type RoleTableEntry = {
  table: string
  pkColumn: string
  nameColumn: string
  extraFields?: string[]
}

export const ROLE_TABLE_META: Record<string, RoleTableEntry | null> = {
  SuperAdmin: null,
  Admin: null,
  Broker: { table: "Brokers", pkColumn: "broker_id", nameColumn: "broker_name" },
  Driver: { table: "Drivers", pkColumn: "driver_id", nameColumn: "full_name" },
  Supervisor: { table: "supervisors", pkColumn: "supervisor_id", nameColumn: "full_name" },
  StationManager: { table: "station_managers", pkColumn: "manager_id", nameColumn: "full_name", extraFields: ["company_id"] },
  TruckOfficer: { table: "truck_officers", pkColumn: "manager_id", nameColumn: "full_name" },
  TruckAdmin: { table: "truck_admins", pkColumn: "admin_id", nameColumn: "full_name" },
  StoreOfficer: { table: "store_officers", pkColumn: "officer_id", nameColumn: "full_name", extraFields: ["store_name"] },
  CashOfficer: { table: "cash_officers", pkColumn: "clerk_id", nameColumn: "full_name", extraFields: ["office_name"] },
  DeskOfficer: { table: "desk_officers", pkColumn: "officer_id", nameColumn: "full_name" },
  ATCOfficer: { table: "atc_officers", pkColumn: "officer_id", nameColumn: "full_name" },
  CashAuthorizer: { table: "cash_authorizers", pkColumn: "authorizer_id", nameColumn: "full_name" },
  StoreSupervisor: { table: "store_supervisors", pkColumn: "supervisor_id", nameColumn: "full_name", extraFields: ["store_names"] },
  CreditManager: { table: "credit_managers", pkColumn: "manager_id", nameColumn: "full_name" },
}

export async function createRoleEntry(
  role: string,
  userId: string,
  profile: { full_name: string; phone_number: string | null },
  extraData?: Record<string, unknown>,
  options?: { status?: string }
): Promise<string | null> {
  const meta = ROLE_TABLE_META[role]
  if (!meta) return null

  const row: Record<string, unknown> = {
    [meta.pkColumn]: userId,
    [meta.nameColumn]: profile.full_name,
    phone_number: profile.phone_number || null,
  }

  if (role === "CashOfficer") {
    row.status = options?.status || "Active"
  }

  if (extraData && meta.extraFields) {
    for (const key of meta.extraFields) {
      if (extraData[key] !== undefined && extraData[key] !== null) {
        row[key] = extraData[key]
      }
    }
  }

  const { error } = await supabaseAdmin
    .from(meta.table)
    .upsert(row, { onConflict: meta.pkColumn })

  if (error) return error.message

  // Handle junction table for CashAuthorizer assigned offices
  if (role === "CashAuthorizer" && extraData?.assigned_offices && Array.isArray(extraData.assigned_offices)) {
    const offices = [...new Set(extraData.assigned_offices as string[])]

    // Insert/upsert new assignments first (safe even if already present)
    if (offices.length > 0) {
      const rows = offices.map(office => ({ authorizer_id: userId, office_name: office }))
      const { error: insErr } = await supabaseAdmin
        .from("cash_authorizer_offices")
        .upsert(rows, { onConflict: "authorizer_id, office_name" })
      if (insErr) return insErr.message
    }

    // Delete stale assignments (offices no longer in the list)
    const { error: delErr } = await supabaseAdmin
      .from("cash_authorizer_offices")
      .delete()
      .eq("authorizer_id", userId)
      .not("office_name", "in", `(${offices.map(o => `"${o}"`).join(",")})`)
    if (delErr) return delErr.message
  }

  return null
}

export async function deleteRoleEntry(
  role: string,
  userId: string
): Promise<string | null> {
  const meta = ROLE_TABLE_META[role]
  if (!meta) return null

  // Delete junction table entries for CashAuthorizer
  if (role === "CashAuthorizer") {
    await supabaseAdmin
      .from("cash_authorizer_offices")
      .delete()
      .eq("authorizer_id", userId)
  }

  const { error } = await supabaseAdmin
    .from(meta.table)
    .delete()
    .eq(meta.pkColumn, userId)

  return error?.message || null
}
