import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { requireRole, handleApiError } from "@/lib/auth-middleware"
import { createRoleEntry, deleteRoleEntry } from "@/lib/role-tables"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ALLOWED_ROLES = ["Admin", "SuperAdmin", "Supervisor"]
const EDIT_ROLES = ["Admin", "SuperAdmin"]

async function listAllAuthUsers() {
  const allUsers: any[] = []
  let page = 1
  const perPage = 1000
  let total = 0

  do {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
    if (error) throw new Error(error.message)
    if (!data) break
    allUsers.push(...data.users)
    total = data.total || allUsers.length
    page++
  } while (allUsers.length < total)

  return allUsers
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireRole(req, ALLOWED_ROLES)
    const isReadOnly = auth.roles.some(r => r === "Supervisor") && !auth.roles.some(r => EDIT_ROLES.includes(r))

    const [authUsers, profiles, userRoles] = await Promise.all([
      listAllAuthUsers(),
      supabaseAdmin.from("Profiles").select("*"),
      supabaseAdmin.from("UserRoles").select("*"),
    ])

    const profileMap = new Map((profiles.data || []).map((p: any) => [p.user_id, p]))
    const rolesMap = new Map<string, string[]>()
    for (const ur of userRoles.data || []) {
      const existing = rolesMap.get(ur.user_id) || []
      existing.push(ur.role)
      rolesMap.set(ur.user_id, existing)
    }

    const users = authUsers.map((au: any) => {
      const profile = profileMap.get(au.id) || {}
      return {
        user_id: au.id,
        email: au.email,
        full_name: profile.full_name || au.user_metadata?.full_name || "",
        phone_number: profile.phone_number || "",
        role: profile.role || "",
        is_deactivated: profile.is_deactivated || false,
        must_change_password: profile.must_change_password || false,
        created_at: au.created_at,
        last_sign_in_at: au.last_sign_in_at,
        roles: rolesMap.get(au.id) || (profile.role ? [profile.role] : []),
      }
    })

    users.sort((a: any, b: any) => {
      if (a.is_deactivated !== b.is_deactivated) return a.is_deactivated ? 1 : -1
      return (a.full_name || "").localeCompare(b.full_name || "")
    })

    return NextResponse.json({ users, isReadOnly })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRole(req, EDIT_ROLES)

    const body = await req.json()
    const { action, userId, roles, companyId, storeName, officeName, assignedOffice } = body as {
      action: "deactivate" | "activate" | "reassign-roles"
      userId: string
      roles?: string[]
      companyId?: string
      storeName?: string
      officeName?: string
      assignedOffice?: string
    }

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 })
    }

    switch (action) {
      case "deactivate": {
        const { error } = await supabaseAdmin
          .from("Profiles")
          .update({ is_deactivated: true })
          .eq("user_id", userId)
        if (error) {
          return NextResponse.json({ error: "Failed to deactivate user" }, { status: 500 })
        }
        return NextResponse.json({ success: true })
      }

      case "activate": {
        const { error } = await supabaseAdmin
          .from("Profiles")
          .update({ is_deactivated: false })
          .eq("user_id", userId)
        if (error) {
          return NextResponse.json({ error: "Failed to activate user" }, { status: 500 })
        }
        return NextResponse.json({ success: true })
      }

      case "reassign-roles": {
        if (!roles || !Array.isArray(roles) || roles.length === 0) {
          return NextResponse.json({ error: "At least one role is required" }, { status: 400 })
        }

        const [{ data: currentRoles }, { data: profile }] = await Promise.all([
          supabaseAdmin.from("UserRoles").select("role").eq("user_id", userId),
          supabaseAdmin.from("Profiles").select("full_name, phone_number").eq("user_id", userId).single(),
        ])

        const oldRoles = new Set((currentRoles || []).map((r: any) => r.role))
        const newRoles = new Set(roles)

        const { error: rpcError } = await supabaseAdmin.rpc("reassign_user_roles", {
          p_user_id: userId,
          p_roles: roles,
        })

        if (rpcError) {
          return NextResponse.json({ error: "Failed to reassign roles" }, { status: 500 })
        }

        const addedRoles = roles.filter(r => !oldRoles.has(r))
        const removedRoles = [...oldRoles].filter(r => !newRoles.has(r))

        const extraData: Record<string, unknown> = {}
        if (companyId) extraData.company_id = companyId
        if (storeName) extraData.store_name = storeName
        if (officeName) extraData.office_name = officeName
        if (assignedOffice) extraData.assigned_office = assignedOffice

        const hasExtraData = Object.keys(extraData).length > 0

        const tableErrors: string[] = []

        for (const role of addedRoles) {
          if (profile) {
            const errMsg = await createRoleEntry(
              role,
              userId,
              { full_name: profile.full_name, phone_number: profile.phone_number },
              hasExtraData ? extraData : undefined
            )
            if (errMsg) {
              console.error(`Failed to create ${role} entry:`, errMsg)
              tableErrors.push(`Failed to create ${role} record: ${errMsg}`)
            }
          }
        }

        for (const role of removedRoles) {
          const errMsg = await deleteRoleEntry(role, userId)
          if (errMsg) {
            console.error(`Failed to delete ${role} entry:`, errMsg)
            tableErrors.push(`Failed to remove ${role} record: ${errMsg}`)
          }
        }

        if (tableErrors.length > 0) {
          return NextResponse.json({ success: true, roles, warnings: tableErrors })
        }

        return NextResponse.json({ success: true, roles })
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (err) {
    return handleApiError(err)
  }
}
