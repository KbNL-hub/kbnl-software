import webPush from 'web-push'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY!
const vapidSubject = process.env.VAPID_SUBJECT!

webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

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
  deviceId: string | null,
  role: string | null,
) {
  const { endpoint, keys } = subscription

  const { data: existing } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id')
    .eq('endpoint', endpoint)
    .single()

  if (existing) {
    const updateData: Record<string, unknown> = {
      p256dh: keys.p256dh,
      auth: keys.auth,
      is_active: true,
      updated_at: new Date().toISOString(),
    }
    if (userId) updateData.user_id = userId
    if (deviceId) updateData.device_id = deviceId
    if (role) updateData.role = role

    const { error } = await supabaseAdmin
      .from('push_subscriptions')
      .update(updateData)
      .eq('id', existing.id)

    if (error) throw error
    return existing.id
  }

  const { data, error } = await supabaseAdmin
    .from('push_subscriptions')
    .insert({
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      user_id: userId,
      device_id: deviceId,
      role,
      is_active: true,
    })
    .select('id')
    .single()

  if (error) throw error
  return data.id
}

export async function removeSubscription(endpoint: string) {
  const { error } = await supabaseAdmin
    .from('push_subscriptions')
    .update({ is_active: false })
    .eq('endpoint', endpoint)

  if (error) throw error
}

export async function linkSubscriptionToUser(endpoint: string, userId: string, role: string) {
  const { error } = await supabaseAdmin
    .from('push_subscriptions')
    .update({ user_id: userId, role, updated_at: new Date().toISOString() })
    .eq('endpoint', endpoint)
    .eq('is_active', true)

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
  return (data || []).map(row => ({
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
