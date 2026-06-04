import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  const { email, fullName, phoneNumber, role, companyId, storeName, officeName } = await req.json()

  if (!email || !fullName || !role) {
    return NextResponse.json({ error: "Email, full name and role are required" }, { status: 400 })
  }

  if (role === "StationManager" && !companyId) {
    return NextResponse.json({ error: "Company is required for Station Manager" }, { status: 400 })
  }

  if (role === "StoreOfficer" && !storeName) {
    return NextResponse.json({ error: "Store is required for Store Officer" }, { status: 400 })
  }

  if (role === "OfficeClerk" && !officeName) {
    return NextResponse.json({ error: "Office is required for Office Clerk" }, { status: 400 })
  }

  const { data: userList, error: listError } = await supabaseAdmin.auth.admin.listUsers()
  if (listError) {
    return NextResponse.json({ error: "Failed to check existing users: " + listError.message }, { status: 500 })
  }

  const existingUser = userList.users.find(u => u.email?.toLowerCase() === email.toLowerCase())
  let userId = ""
  let isNewUser = false

  if (existingUser) {
    userId = existingUser.id
  } else {
    isNewUser = true
    const { data, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`
    })

    if (inviteError) {
      return NextResponse.json({ error: inviteError.message }, { status: 500 })
    }
    userId = data.user.id
  }

  console.log("Processing profile:", { userId, role, fullName, phoneNumber, isNewUser })

  if (isNewUser) {
    // Insert into Profiles
    const { error: profileError } = await supabaseAdmin.from("Profiles").insert([{
      user_id: userId,
      role,
      full_name: fullName,
      phone_number: phoneNumber || null,
    }])

    console.log("Profile error:", profileError)

    if (profileError) {
      return NextResponse.json({ error: "Invite sent but profile failed" }, { status: 500 })
    }
  }

  // If Driver, also insert into Drivers table
  if (role === "Driver") {
    const { error: driverError } = await supabaseAdmin.from("Drivers").insert([{
      driver_id: userId,
      full_name: fullName,
      phone_number: phoneNumber || null,
    }])
    console.log("Driver error:", driverError)
    if (driverError) {
      return NextResponse.json({ error: "Invite sent but driver record failed" }, { status: 500 })
    }
  }

  // If Broker, also insert into Brokers table
  if (role === "Broker") {
    const { error: brokerError } = await supabaseAdmin.from("Brokers").insert([{
      broker_id: userId,
      broker_name: fullName,
      phone_number: phoneNumber || null,
    }])
    console.log("Broker error:", brokerError)
    if (brokerError) {
      return NextResponse.json({ error: "Invite sent but broker record failed" }, { status: 500 })
    }
  }

  // If StationManager, also insert into station_managers table
  if (role === "StationManager") {
    const { error: smError } = await supabaseAdmin.from("station_managers").insert([{
      manager_id: userId,
      full_name: fullName,
      phone_number: phoneNumber || null,
      company_id: companyId,
    }])
    if (smError) {
      return NextResponse.json({ error: "Invite sent but station manager record failed" }, { status: 500 })
    }
  }

  if (role === "TruckOfficer") {
    const { error: mmError } = await supabaseAdmin.from("truck_officers").insert([{
      manager_id: userId,
      full_name: fullName,
      phone_number: phoneNumber || null,
    }])
    if (mmError) {
      return NextResponse.json({ error: "Invite sent but truck officer record failed" }, { status: 500 })
    }
  }

  if (role === "TruckAdmin") {
    const { error: taError } = await supabaseAdmin.from("truck_admins").insert([{
      admin_id: userId,
      full_name: fullName,
      phone_number: phoneNumber || null,
    }])
    if (taError) {
      return NextResponse.json({ error: "Invite sent but truck admin record failed" }, { status: 500 })
    }
  }

  if (role === "StoreOfficer") {
    if (!storeName) {
      return NextResponse.json({ error: "Store name is required for Store Officer" }, { status: 400 })
    }
    const { error: soError } = await supabaseAdmin.from("store_officers").insert([{
      officer_id: userId,
      full_name: fullName,
      phone_number: phoneNumber || null,
      store_name: storeName,
    }])
    if (soError) {
      return NextResponse.json({ error: "Invite sent but store officer record failed" }, { status: 500 })
    }
  }

  if (role === "OfficeClerk") {
    if (!officeName) {
      return NextResponse.json({ error: "Office name is required for Office Clerk" }, { status: 400 })
    }
    const { error: ocError } = await supabaseAdmin.from("office_clerks").insert([{
      clerk_id: userId,
      full_name: fullName,
      phone_number: phoneNumber || null,
      office_name: officeName,
      status: existingUser ? "Active" : "Invited"
    }])
    if (ocError) {
      return NextResponse.json({ error: "Invite sent but office clerk record failed" }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true })
}