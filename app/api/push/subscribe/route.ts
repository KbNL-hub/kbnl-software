import { NextRequest, NextResponse } from 'next/server'
import { saveSubscription, removeSubscription } from '@/lib/push'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { endpoint, keys, deviceId, role, oldEndpoint } = body

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json(
        { error: 'Missing subscription data' },
        { status: 400 }
      )
    }

    let userId: string | null = null
    let roles: string[] | null = role ? [role] : null

    const authHeader = req.headers.get('Authorization')
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7)
      const { data: { user } } = await supabaseAdmin.auth.getUser(token)
      if (user) {
        userId = user.id

        const { data: userRoles } = await supabaseAdmin
          .from('UserRoles')
          .select('role')
          .eq('user_id', user.id)

        if (userRoles && userRoles.length > 0) {
          roles = userRoles.map(r => r.role)
        } else {
          const { data: profile } = await supabaseAdmin
            .from('Profiles')
            .select('role')
            .eq('user_id', user.id)
            .maybeSingle()
          if (profile?.role) roles = [profile.role]
        }
      }
    }

    // Relink from old endpoint (pushsubscriptionchange in sw.js)
    let currentDeviceId = deviceId || null
    if (oldEndpoint && oldEndpoint !== endpoint) {
      const { data: oldRows } = await supabaseAdmin
        .from('push_subscriptions')
        .select('user_id, device_id, role')
        .eq('endpoint', oldEndpoint)
        .eq('is_active', true)

      if (oldRows && oldRows.length > 0) {
        const first = oldRows[0]
        if (!userId) userId = first.user_id
        if (!currentDeviceId) currentDeviceId = first.device_id
        const oldRoles = oldRows.map(r => r.role).filter((r): r is string => !!r)
        if ((!roles || roles.length === 0) && oldRoles.length > 0) roles = oldRoles
      }

      await removeSubscription(oldEndpoint)
    }

    const id = await saveSubscription(
      { endpoint, keys },
      userId,
      currentDeviceId,
      roles,
    )

    return NextResponse.json({ success: true, id })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[Push Subscribe] Error:', message)
    return NextResponse.json(
      { error: 'Failed to save subscription', detail: message },
      { status: 500 }
    )
  }
}
