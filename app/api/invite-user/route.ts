import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  const { email, fullName, phoneNumber, role } = await req.json()

  if (!email || !fullName || !role) {
    return NextResponse.json({ error: "Email, full name and role are required" }, { status: 400 })
  }

  const { data, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`
  })

  if (inviteError) {
    return NextResponse.json({ error: inviteError.message }, { status: 500 })
  }

  const userId = data.user.id

  // Insert into Profiles
  const { error: profileError } = await supabaseAdmin.from("Profiles").insert([{
    user_id: userId,
    role,
    full_name: fullName,
    phone_number: phoneNumber || null,
  }])

  if (profileError) {
    return NextResponse.json({ error: "Invite sent but profile failed" }, { status: 500 })
  }

  // If Driver, also insert into Drivers table
  if (role === "Driver") {
    const { error: driverError } = await supabaseAdmin.from("Drivers").insert([{
      driver_id: userId,
      full_name: fullName,
      phone_number: phoneNumber || null,
    }])

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

    if (brokerError) {
      return NextResponse.json({ error: "Invite sent but broker record failed" }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true })
}