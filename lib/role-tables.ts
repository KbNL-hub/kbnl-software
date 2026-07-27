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
  CashAuthorizer: { table: "cash_authorizers", pkColumn: "authorizer_id", nameColumn: "full_name", extraFields: ["assigned_office"] },
  StoreSupervisor: { table: "store_supervisors", pkColumn: "supervisor_id", nameColumn: "full_name", extraFields: ["store_names"] },
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

  return error?.message || null
}

export async function deleteRoleEntry(
  role: string,
  userId: string
): Promise<string | null> {
  const meta = ROLE_TABLE_META[role]
  if (!meta) return null

  const { error } = await supabaseAdmin
    .from(meta.table)
    .delete()
    .eq(meta.pkColumn, userId)

  return error?.message || null
}
