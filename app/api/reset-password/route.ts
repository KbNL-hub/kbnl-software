import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  try {
    const { email, newPassword } = await req.json()

    if (!email || !newPassword) {
      return NextResponse.json({ error: "Email and new password are required" }, { status: 400 })
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 })
    }

    let user = null
    let page = 1
    const perPage = 1000

    while (!user) {
      const { data: users } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
      if (!users?.users?.length) break
      user = users.users.find(u => u.email === email) ?? null
      if (users.users.length < perPage) break
      page++
    }

    if (!user) {
      return NextResponse.json({ error: "No account found with that email" }, { status: 404 })
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password: newPassword,
    })

    if (updateError) {
      return NextResponse.json({ error: "Failed to reset password. Please try again." }, { status: 500 })
    }

    await supabaseAdmin
      .from("Profiles")
      .update({ must_change_password: false })
      .eq("user_id", user.id)

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}
