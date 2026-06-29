import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { generateTempPassword } from "@/lib/auth-helpers"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ROLE_TABLES: Record<string, (userId: string, data: any) => Promise<string | null>> = {
  Driver: async (userId, { fullName, phoneNumber }) => {
    const { error } = await supabaseAdmin.from("Drivers").upsert(
      { driver_id: userId, full_name: fullName, phone_number: phoneNumber || null },
      { onConflict: "driver_id" }
    )
    return error?.message || null
  },
  Broker: async (userId, { fullName, phoneNumber }) => {
    const { error } = await supabaseAdmin.from("Brokers").upsert(
      { broker_id: userId, broker_name: fullName, phone_number: phoneNumber || null },
      { onConflict: "broker_id" }
    )
    return error?.message || null
  },
  StationManager: async (userId, { fullName, phoneNumber, companyId }) => {
    if (!companyId) return "Company is required for Station Manager"
    const { error } = await supabaseAdmin.from("station_managers").upsert(
      { manager_id: userId, full_name: fullName, phone_number: phoneNumber || null, company_id: companyId },
      { onConflict: "manager_id" }
    )
    return error?.message || null
  },
  TruckOfficer: async (userId, { fullName, phoneNumber }) => {
    const { error } = await supabaseAdmin.from("truck_officers").upsert(
      { manager_id: userId, full_name: fullName, phone_number: phoneNumber || null },
      { onConflict: "manager_id" }
    )
    return error?.message || null
  },
  TruckAdmin: async (userId, { fullName, phoneNumber }) => {
    const { error } = await supabaseAdmin.from("truck_admins").upsert(
      { admin_id: userId, full_name: fullName, phone_number: phoneNumber || null },
      { onConflict: "admin_id" }
    )
    return error?.message || null
  },
  StoreOfficer: async (userId, { fullName, phoneNumber, storeName }) => {
    if (!storeName) return "Store name is required for Store Officer"
    const { error } = await supabaseAdmin.from("store_officers").upsert(
      { officer_id: userId, full_name: fullName, phone_number: phoneNumber || null, store_name: storeName },
      { onConflict: "officer_id" }
    )
    return error?.message || null
  },
  CashOfficer: async (userId, { fullName, phoneNumber, officeName }) => {
    if (!officeName) return "Office is required for Cash Officer"
    const { error } = await supabaseAdmin.from("cash_officers").upsert(
      { clerk_id: userId, full_name: fullName, phone_number: phoneNumber || null, office_name: officeName, status: "Invited" },
      { onConflict: "clerk_id" }
    )
    return error?.message || null
  },
  DeskOfficer: async (userId, { fullName, phoneNumber }) => {
    const { error } = await supabaseAdmin.from("desk_officers").upsert(
      { officer_id: userId, full_name: fullName, phone_number: phoneNumber || null },
      { onConflict: "officer_id" }
    )
    return error?.message || null
  },
  ATCOfficer: async (userId, { fullName, phoneNumber }) => {
    const { error } = await supabaseAdmin.from("atc_officers").upsert(
      { officer_id: userId, full_name: fullName, phone_number: phoneNumber || null },
      { onConflict: "officer_id" }
    )
    return error?.message || null
  },
  Supervisor: async (userId, { fullName, phoneNumber }) => {
    const { error } = await supabaseAdmin.from("supervisors").upsert(
      { supervisor_id: userId, full_name: fullName, phone_number: phoneNumber || null },
      { onConflict: "supervisor_id" }
    )
    return error?.message || null
  },
  CashAuthorizer: async (userId, { fullName, phoneNumber, assignedOffice }) => {
    if (!assignedOffice) return "Assigned office is required for Cash Authorizer"
    const { error } = await supabaseAdmin.from("cash_authorizers").upsert(
      { authorizer_id: userId, full_name: fullName, phone_number: phoneNumber || null, assigned_office: assignedOffice },
      { onConflict: "authorizer_id" }
    )
    return error?.message || null
  },
}

export async function POST(req: Request) {
  const { email, fullName, phoneNumber, role, roles, companyId, storeName, officeName, assignedOffice, openingBalance } = await req.json()

  if (!email || !fullName) {
    return NextResponse.json({ error: "Email and full name are required" }, { status: 400 })
  }

  // Accept single `role` or array `roles` for backward compatibility
  const selectedRoles: string[] = roles && Array.isArray(roles) && roles.length > 0
    ? roles
    : role ? [role] : []

  if (selectedRoles.length === 0) {
    return NextResponse.json({ error: "At least one role is required" }, { status: 400 })
  }

  const invalidRoles = selectedRoles.filter((r) => !(r in ROLE_TABLES))
  if (invalidRoles.length > 0) {
    return NextResponse.json(
      { error: `Unsupported role(s): ${invalidRoles.join(", ")}` },
      { status: 400 }
    )
  }

  // Check if user already exists in auth (paginate to find)
  const { data: userList, error: listError } = await supabaseAdmin.auth.admin.listUsers()
  if (listError) {
    return NextResponse.json({ error: "Failed to check existing users: " + listError.message }, { status: 500 })
  }

  let existingUser = userList.users.find(u => u.email?.toLowerCase() === email.toLowerCase())
  if (!existingUser && userList.total > userList.users.length) {
    const perPage = userList.users.length
    const totalPages = Math.ceil(userList.total / perPage)
    for (let page = 2; page <= totalPages; page++) {
      const { data: nextPage } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
      existingUser = nextPage?.users.find(u => u.email?.toLowerCase() === email.toLowerCase())
      if (existingUser) break
    }
  }
  let tempPassword: string | null = null
  let userId = ""

  if (existingUser) {
    userId = existingUser.id
  } else {
    tempPassword = generateTempPassword()
    const { data, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    })
    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 500 })
    }
    userId = data.user.id
  }

  // Upsert profile for both new and existing users
  const { error: profileError } = await supabaseAdmin.from("Profiles").upsert(
    {
      user_id: userId,
      role: selectedRoles[0],
      full_name: fullName,
      phone_number: phoneNumber || null,
      must_change_password: true,
    },
    { onConflict: "user_id" }
  )
  if (profileError) {
    return NextResponse.json({ error: "Failed to save profile" }, { status: 500 })
  }

  // Insert into UserRoles for each selected role
  for (const r of selectedRoles) {
    const { error: roleError } = await supabaseAdmin.from("UserRoles").upsert(
      { user_id: userId, role: r },
      { onConflict: "user_id, role" }
    )
    if (roleError) {
      console.error(`Failed to insert role ${r} for user ${userId}:`, roleError)
      return NextResponse.json({ error: `Failed to provision role ${r}` }, { status: 500 })
    }
  }

  // Insert into role-specific tables
  const dataArgs = { fullName, phoneNumber, companyId, storeName, officeName, assignedOffice }
  for (const r of selectedRoles) {
    const handler = ROLE_TABLES[r]
    if (handler) {
      const errMsg = await handler(userId, dataArgs)
      if (errMsg) {
        console.error(`Failed to insert ${r} record:`, errMsg)
        return NextResponse.json({ error: errMsg }, { status: 400 })
      }
    }
  }

  // Insert opening stock balance if provided
  if (storeName && openingBalance && openingBalance.length > 0) {
    for (const line of openingBalance) {
      if (line.product && parseInt(line.quantity) > 0) {
        const { error: stockError } = await supabaseAdmin.from("store_stock").upsert(
          {
            store_name: storeName,
            product: line.product,
            balance: parseInt(line.quantity),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "store_name, product" }
        )
        if (stockError) {
          console.error(`Failed to insert opening balance for ${line.product}:`, stockError)
        }
      }
    }
  }

  return NextResponse.json({ success: true, ...(tempPassword ? { tempPassword } : {}), userId })
}
