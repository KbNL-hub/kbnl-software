import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  const { email, fullName, phoneNumber } = await req.json()

  if (!email || !fullName) {
    return NextResponse.json({ error: "Email and full name are required" }, { status: 400 })
  }

  // Invite user
  const { data, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email)

  if (inviteError) {
    return NextResponse.json({ error: inviteError.message }, { status: 500 })
  }

  const userId = data.user.id

  // Insert into Drivers
  const { error: driverError } = await supabaseAdmin.from("Drivers").insert([{
    driver_id: userId,
    full_name: fullName,
    phone_number: phoneNumber || null,
  }])

  if (driverError) {
    return NextResponse.json({ error: "Invite sent but driver record failed" }, { status: 500 })
  }

  // Insert into Profiles
  const { error: profileError } = await supabaseAdmin.from("Profiles").insert([{
    user_id: userId,
    role: "Driver",
    full_name: fullName,
    phone_number: phoneNumber || null,
  }])

  if (profileError) {
    return NextResponse.json({ error: "Invite sent but profile failed" }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}