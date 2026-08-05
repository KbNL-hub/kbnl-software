import webPush from 'web-push'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
const vapidSubject = process.env.VAPID_SUBJECT

let vapidConfigured = false

function ensureVapid() {
  if (vapidConfigured) return
  if (!vapidSubject || !vapidPublicKey || !vapidPrivateKey) {
    throw new Error('Push is not configured: VAPID_SUBJECT, NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are required')
  }
  webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
  vapidConfigured = true
}

export interface PushSubscription {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export interface SendNotificationOptions {
  title: string
  body: string
  icon?: string
  url?: string
  tag?: string
}

export async function saveSubscription(
  subscription: PushSubscription,
  userId: string | null,
  roles: string[] | null,
) {
  const { endpoint, keys } = subscription
  const now = new Date().toISOString()

  const roleValues: (string | null)[] = roles && roles.length > 0 ? roles : [null]

  const rows = roleValues.map(role => ({
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    is_active: true,
    updated_at: now,
    user_id: userId,
    role,
  }))

  const { data, error } = await supabaseAdmin
    .from('push_subscriptions')
    .upsert(rows, { onConflict: 'endpoint,role' })
    .select('id')

  if (error) throw error

  // Remove stale role rows for this endpoint that are no longer in the target role set
  if (roles && roles.length > 0) {
    const { error: deleteError } = await supabaseAdmin
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint)
      .or(`role.is.null,role.not.in.(${roles.map(r => `"${r}"`).join(',')})`)
    if (deleteError) throw deleteError
  }

  return data?.[0]?.id
}

export async function removeSubscription(endpoint: string) {
  const { error } = await supabaseAdmin
    .from('push_subscriptions')
    .update({ is_active: false })
    .eq('endpoint', endpoint)

  if (error) throw error
}

export async function sendNotification(
  subscription: PushSubscription,
  payload: SendNotificationOptions,
) {
  const message = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || '/logo-192.png',
    url: payload.url || '/',
    tag: payload.tag || 'kbnl-notification',
  })

  try {
    ensureVapid()
    await webPush.sendNotification(
      subscription,
      message,
      { TTL: 60 * 60 } // 1 hour TTL
    )
    return true
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode
    if (statusCode === 404 || statusCode === 410) {
      await removeSubscription(subscription.endpoint)
    }
    console.error('[Push] Send failed:', statusCode || err)
    return false
  }
}

export async function getSubscriptionsByRole(role: string) {
  const { data, error } = await supabaseAdmin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('role', role)
    .eq('is_active', true)

  if (error) throw error
  return (data || []).map(row => ({
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth },
  }))
}

export async function getSubscriptionsByUserId(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId)
    .eq('is_active', true)

  if (error) throw error
  const seen = new Set<string>()
  return (data || []).filter(row => {
    if (seen.has(row.endpoint)) return false
    seen.add(row.endpoint)
    return true
  }).map(row => ({
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth },
  }))
}

export async function sendToRole(
  role: string,
  payload: SendNotificationOptions,
) {
  const subscriptions = await getSubscriptionsByRole(role)
  let sent = 0
  let failed = 0

  const results = await Promise.allSettled(
    subscriptions.map(sub => sendNotification(sub, payload))
  )

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) sent++
    else failed++
  }

  return { sent, failed, total: subscriptions.length }
}

export async function sendToUser(
  userId: string,
  payload: SendNotificationOptions,
) {
  const subscriptions = await getSubscriptionsByUserId(userId)
  let sent = 0
  let failed = 0

  const results = await Promise.allSettled(
    subscriptions.map(sub => sendNotification(sub, payload))
  )

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) sent++
    else failed++
  }

  return { sent, failed, total: subscriptions.length }
}
