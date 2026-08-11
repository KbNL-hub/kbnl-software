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
  if (!vapidSubject || !vapidPublicKey || !vapidPrivateKey) {
    throw new Error('VAPID not configured')
  }
  webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId') || auth.userId

    const vapidConfigured = !!(vapidSubject && vapidPublicKey && vapidPrivateKey)

    const { data: subs, error } = await supabaseAdmin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth, role, is_active, updated_at, user_id')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })

    if (error) throw error

    let diagnostics: {
      id: string; endpoint: string; role: string | null; isActive: boolean
      updatedAt: string; status: 'valid' | 'expired' | 'error'
      httpStatus?: number; error?: string
    }[] = []

    if (vapidConfigured) {
      ensureVapid()
      diagnostics = await Promise.all(
        (subs || []).map(sub => checkSub(sub))
      )
    } else {
      diagnostics = (subs || []).map(sub => ({
        id: sub.id,
        endpoint: shorten(sub.endpoint),
        role: sub.role,
        isActive: sub.is_active,
        updatedAt: sub.updated_at,
        status: 'error' as const,
        httpStatus: undefined,
        error: 'VAPID not configured on server',
      }))
    }

    const expiredIds = diagnostics
      .filter(d => d.status === 'expired')
      .map(d => d.id)

    if (expiredIds.length > 0) {
      await supabaseAdmin
        .from('push_subscriptions')
        .update({ is_active: false })
        .in('id', expiredIds)
    }

    return NextResponse.json({
      userId,
      vapid: {
        configured: vapidConfigured,
        subject: vapidSubject || null,
        hasPublicKey: !!vapidPublicKey,
        hasPrivateKey: !!vapidPrivateKey,
      },
      total: diagnostics.length,
      valid: diagnostics.filter(d => d.status === 'valid').length,
      expired: diagnostics.filter(d => d.status === 'expired').length,
      errors: diagnostics.filter(d => d.status === 'error').length,
      cleanedUp: expiredIds.length,
      subscriptions: diagnostics,
    })
  } catch (err) {
    console.error('[Push Debug] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Debug failed' },
      { status: 500 }
    )
  }
}

// POST: Send a real notification to a single subscription and report exact result
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req)
    const body = await req.json()
    const { subscriptionId, title, body: msgBody, url } = body

    if (!subscriptionId) {
      return NextResponse.json({ error: 'Missing subscriptionId' }, { status: 400 })
    }

    const { data: sub, error } = await supabaseAdmin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth, user_id')
      .eq('id', subscriptionId)
      .eq('user_id', auth.userId)
      .single()

    if (error || !sub) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 })
    }

    ensureVapid()

    const message = JSON.stringify({
      title: title || 'Debug Test',
      body: msgBody || 'Direct subscription test',
      icon: '/logo-192.png',
      url: url || '/test-notifications',
      tag: 'debug-test',
    })

    try {
      await webPush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        message,
        { TTL: 60 * 60 }
      )
      return NextResponse.json({ success: true, subscriptionId, result: 'delivered' })
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number }).statusCode
      const body = (err as { body?: string }).body
      return NextResponse.json({
        success: false,
        subscriptionId,
        httpStatus: statusCode,
        error: body || (err as Error).message,
      })
    }
  } catch (err) {
    console.error('[Push Debug] POST Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Debug failed' },
      { status: 500 }
    )
  }
}

function shorten(endpoint: string) {
  return endpoint.length > 60
    ? endpoint.substring(0, 30) + '...' + endpoint.substring(endpoint.length - 25)
    : endpoint
}

async function checkSub(sub: {
  id: string; endpoint: string; p256dh: string; auth: string
  role: string | null; is_active: boolean; updated_at: string
}) {
  try {
    await webPush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify({ title: '__probe__', body: '', tag: '__probe__' }),
      { TTL: 0 }
    )
    return {
      id: sub.id,
      endpoint: shorten(sub.endpoint),
      role: sub.role,
      isActive: sub.is_active,
      updatedAt: sub.updated_at,
      status: 'valid' as const,
    }
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode
    const message = (err as { message?: string }).message || ''
    return {
      id: sub.id,
      endpoint: shorten(sub.endpoint),
      role: sub.role,
      isActive: sub.is_active,
      updatedAt: sub.updated_at,
      status: (statusCode === 404 || statusCode === 410 ? 'expired' : 'error') as 'expired' | 'error',
      httpStatus: statusCode,
      error: message.substring(0, 150),
    }
  }
}
