import { NextRequest, NextResponse } from 'next/server'
import { removeSubscription } from '@/lib/push'
import { requireAuth, handleApiError } from '@/lib/auth-middleware'
import { createClient } from '@supabase/supabase-js'

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json()
    const { endpoint, deviceId } = body

    if (!endpoint) {
      return NextResponse.json(
        { error: 'Missing endpoint' },
        { status: 400 }
      )
    }

    const auth = await requireAuth(req)

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { data: row } = await supabaseAdmin
      .from('push_subscriptions')
      .select('user_id, device_id')
      .eq('endpoint', endpoint)
      .maybeSingle()

    if (!row) {
      return NextResponse.json({ success: true })
    }

    if (row.user_id) {
      if (row.user_id !== auth.userId) {
        return NextResponse.json(
          { error: 'You do not own this subscription' },
          { status: 403 }
        )
      }
    } else {
      if (!deviceId || row.device_id !== deviceId) {
        return NextResponse.json(
          { error: 'Device ownership could not be verified' },
          { status: 403 }
        )
      }
    }

    await removeSubscription(endpoint)

    return NextResponse.json({ success: true })
  } catch (err) {
    return handleApiError(err)
  }
}
