import { NextRequest, NextResponse } from 'next/server'
import { saveSubscription, linkSubscriptionToUser } from '@/lib/push'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { endpoint, keys, deviceId, role } = body

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json(
        { error: 'Missing subscription data' },
        { status: 400 }
      )
    }

    let userId: string | null = null
    let userRole = role || null

    const authHeader = req.headers.get('Authorization')
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7)
      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      )
      const { data: { user } } = await supabaseAdmin.auth.getUser(token)
      if (user) {
        userId = user.id

        const { data: roles } = await supabaseAdmin
          .from('UserRoles')
          .select('role')
          .eq('user_id', user.id)
          .order('role', { ascending: true })

        if (roles && roles.length > 0) {
          userRole = roles[0].role
        } else {
          const { data: profile } = await supabaseAdmin
            .from('Profiles')
            .select('role')
            .eq('user_id', user.id)
            .single()
          userRole = profile?.role || null
        }
      }
    }

    const id = await saveSubscription(
      { endpoint, keys },
      userId,
      deviceId || null,
      userRole,
    )

    if (userId && deviceId) {
      await linkSubscriptionToUser(endpoint, userId, userRole || '')
    }

    return NextResponse.json({ success: true, id })
  } catch (err) {
    console.error('[Push Subscribe] Error:', err)
    return NextResponse.json(
      { error: 'Failed to save subscription' },
      { status: 500 }
    )
  }
}
