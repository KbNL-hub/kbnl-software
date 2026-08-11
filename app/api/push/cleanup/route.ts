import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { createClient } from '@supabase/supabase-js'
import webPush from 'web-push'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
const vapidSubject = process.env.VAPID_SUBJECT

function ensureVapid() {
  if (!vapidSubject || !vapidPublicKey || !vapidPrivateKey) return false
  webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
  return true
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req)
    const vapidOk = ensureVapid()

    const { data: subs, error } = await supabaseAdmin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', auth.userId)
      .eq('is_active', true)

    if (error) throw error
    if (!subs || subs.length === 0) {
      return NextResponse.json({ cleaned: 0, remaining: 0 })
    }

    let cleaned = 0

    if (vapidOk) {
      const results = await Promise.allSettled(
        subs.map(async (sub) => {
          try {
            await webPush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              JSON.stringify({ title: '', body: '', tag: '__cleanup__' }),
              { TTL: 0 }
            )
            return { id: sub.id, valid: true }
          } catch (err: unknown) {
            const statusCode = (err as { statusCode?: number }).statusCode
            if (statusCode === 404 || statusCode === 410) {
              return { id: sub.id, valid: false }
            }
            return { id: sub.id, valid: true }
          }
        })
      )

      const staleIds = results
        .filter((r): r is PromiseFulfilledResult<{ id: string; valid: false }> =>
          r.status === 'fulfilled' && !r.value.valid
        )
        .map(r => r.value.id)

      if (staleIds.length > 0) {
        await supabaseAdmin
          .from('push_subscriptions')
          .update({ is_active: false })
          .in('id', staleIds)
        cleaned = staleIds.length
      }
    }

    const { count } = await supabaseAdmin
      .from('push_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', auth.userId)
      .eq('is_active', true)

    return NextResponse.json({ cleaned, remaining: count ?? 0 })
  } catch (err) {
    console.error('[Push Cleanup] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Cleanup failed' },
      { status: 500 }
    )
  }
}
