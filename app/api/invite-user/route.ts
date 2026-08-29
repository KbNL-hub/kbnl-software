import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { generateTempPassword } from "@/lib/auth-helpers"
import { createRoleEntry, ROLE_TABLE_META } from "@/lib/role-tables"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  const { email, fullName, phoneNumber, role, roles, companyId, storeName, storeNames, officeName, assignedOffices, openingBalance } = await req.json()

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

  const invalidRoles = selectedRoles.filter((r) => !(r in ROLE_TABLE_META))
  if (invalidRoles.length > 0) {
    return NextResponse.json(
      { error: `Unsupported role(s): ${invalidRoles.join(", ")}` },
      { status: 400 }
    )
  }

  // Validate required extra fields BEFORE provisioning any user records
  if (selectedRoles.includes("StationManager") && !companyId) {
    return NextResponse.json({ error: "Company is required for Station Manager" }, { status: 400 })
  }
  if (selectedRoles.includes("StoreOfficer") && !storeName) {
    return NextResponse.json({ error: "Store name is required for Store Officer" }, { status: 400 })
  }
  if (selectedRoles.includes("CashOfficer") && !officeName) {
    return NextResponse.json({ error: "Office is required for Cash Officer" }, { status: 400 })
  }
  if (selectedRoles.includes("CashAuthorizer")) {
    if (!assignedOffices || !Array.isArray(assignedOffices) || assignedOffices.length === 0) {
      return NextResponse.json({ error: "At least one assigned office is required for Cash Authorizer" }, { status: 400 })
    }
    const unique = new Set(assignedOffices)
    if (unique.size !== assignedOffices.length) {
      return NextResponse.json({ error: "Duplicate offices are not allowed for Cash Authorizer" }, { status: 400 })
    }
  }
  if (selectedRoles.includes("StoreSupervisor") && (!storeNames || !Array.isArray(storeNames) || storeNames.length === 0)) {
    return NextResponse.json({ error: "At least one store is required for Store Supervisor" }, { status: 400 })
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
    return NextResponse.json(
      { error: "A user with this email already exists. Use Manage Users to reassign roles." },
      { status: 409 }
    )
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
  const extraData: Record<string, unknown> = {}
  if (companyId) extraData.company_id = companyId
  if (storeName) extraData.store_name = storeName
  if (storeNames && Array.isArray(storeNames) && storeNames.length > 0) extraData.store_names = storeNames
  if (officeName) extraData.office_name = officeName
  if (assignedOffices && Array.isArray(assignedOffices) && assignedOffices.length > 0) extraData.assigned_offices = assignedOffices

  const hasExtraData = Object.keys(extraData).length > 0

  for (const r of selectedRoles) {
    const errMsg = await createRoleEntry(
      r,
      userId,
      { full_name: fullName, phone_number: phoneNumber || null },
      hasExtraData ? extraData : undefined,
      r === "CashOfficer" ? { status: "Invited" } : undefined
    )
    if (errMsg) {
      console.error(`Failed to insert ${r} record:`, errMsg)
      return NextResponse.json({ error: errMsg }, { status: 400 })
    }
  }

  // Insert opening stock balance if provided (only seed missing rows)
  if (
    selectedRoles.includes("StoreOfficer") &&
    storeName &&
    Array.isArray(openingBalance) &&
    openingBalance.length > 0
  ) {
    for (const line of openingBalance) {
      if (line.product && parseInt(line.quantity) > 0) {
        const { data: existing } = await supabaseAdmin
          .from("store_stock")
          .select("product")
          .eq("store_name", storeName)
          .eq("product", line.product)
          .maybeSingle()

        if (existing) continue

        const { error: stockError } = await supabaseAdmin.from("store_stock").insert(
          {
            store_name: storeName,
            product: line.product,
            balance: parseInt(line.quantity),
            updated_at: new Date().toISOString(),
          }
        )
        if (stockError) {
          console.error(`Failed to insert opening balance for ${line.product}:`, stockError)
          return NextResponse.json({ error: `Failed to set opening balance for ${line.product}` }, { status: 500 })
        }
      }
    }
  }

  return NextResponse.json({ success: true, ...(tempPassword ? { tempPassword } : {}), userId })
}
