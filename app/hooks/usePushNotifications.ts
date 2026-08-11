'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

async function getSWRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.ready
  } catch {
    return null
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Log the current service worker registration state for diagnostics.
function logSWState(reg: ServiceWorkerRegistration, tag: string) {
  console.log(`[Push] ${tag} SW state:`, {
    controller: navigator.serviceWorker.controller?.scriptURL || null,
    active: reg.active?.state || null,
    installing: reg.installing?.state || null,
    waiting: reg.waiting?.state || null,
    scope: reg.scope,
  })
}

// Wait until the service worker controls the page (or timeout). Some browsers
// require a controlling SW before pushManager.subscribe() will succeed.
async function waitForController(reg: ServiceWorkerRegistration, timeoutMs = 5000): Promise<boolean> {
  if (navigator.serviceWorker.controller) return true

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      navigator.serviceWorker.removeEventListener('controllerchange', onController)
      resolve(false)
    }, timeoutMs)

    function onController() {
      clearTimeout(timer)
      navigator.serviceWorker.removeEventListener('controllerchange', onController)
      resolve(true)
    }

    // Re-check immediately in case the controller was set between the first
    // check and the listener being attached.
    if (navigator.serviceWorker.controller) {
      clearTimeout(timer)
      resolve(true)
      return
    }

    navigator.serviceWorker.addEventListener('controllerchange', onController)
  })
}

// Guards against React StrictMode double-firing effects in dev, which can
// trigger concurrent pushManager.subscribe() calls (the second fails with
// AbortError "Registration failed - push service error").
let subscribeInFlight = false

// Some browsers keep a push subscription tied to a *stale* registration after
// the SW is replaced. That orphan can make Chrome's push service reject new
// subscriptions with AbortError "Registration failed - push service error".
// Try to unsubscribe from every registration's push manager, then retry.
async function clearOrphanedSubscriptions(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  try {
    const regs = await navigator.serviceWorker.getRegistrations()
    for (const r of regs) {
      try {
        const sub = await r.pushManager.getSubscription()
        if (sub) await sub.unsubscribe().catch(() => {})
      } catch {
        // ignore — registration may not have a push manager available
      }
    }
  } catch {
    // ignore
  }
}

// Create a browser push subscription. Retries transient AbortError failures
// (e.g. the service worker is mid-activation or the push service hiccups).
async function createBrowserSubscription(reg: ServiceWorkerRegistration): Promise<PushSubscription | null> {
  if (!VAPID_PUBLIC_KEY) {
    console.error('[Push] NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set. Cannot create subscription.')
    return null
  }

  const existing = await reg.pushManager.getSubscription().catch(() => null)
  if (existing) {
    logSWState(reg, 'existing-subscription')
    return existing
  }

  // Ensure the SW controls the page before subscribing.
  logSWState(reg, 'pre-subscribe')
  const controlled = await waitForController(reg)
  if (!controlled) {
    console.warn('[Push] SW does not control the page; subscribing anyway (may fail).')
  }

  const options = {
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const subscription = await reg.pushManager.subscribe(options)
      logSWState(reg, 'subscribed')
      return subscription
    } catch (err) {
      const name = (err as DOMException)?.name
      const isTransient = name === 'AbortError' || name === 'InvalidStateError'
      if (!isTransient) throw err
      logSWState(reg, `subscribe-failed-${name}`)
      // Clean up any orphaned subscriptions tied to stale registrations, which
      // is a common cause of persistent "Registration failed - push service
      // error" in Chrome after SW unregister/re-register cycles.
      if (attempt === 1) {
        console.warn('[Push] Attempting to clear orphaned push subscriptions...')
        await clearOrphanedSubscriptions()
      }
      if (attempt < 2) {
        console.warn(`[Push] subscribe() failed (${name}), retrying in ${500 * (attempt + 1)}ms...`)
        await sleep(500 * (attempt + 1))
      } else {
        throw err
      }
    }
  }
  return null
}

// Send the browser subscription to our API so it can be persisted.
async function persistSubscription(subscription: PushSubscription): Promise<boolean> {
  const sub = JSON.parse(JSON.stringify(subscription))
  const { data: { session } } = await supabase.auth.getSession()

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`
  }

  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      endpoint: sub.endpoint,
      keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    }),
  })

  return res.ok
}

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const hasNotification = typeof Notification !== 'undefined'

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (hasNotification) setPermission(Notification.permission)
      setIsSubscribed(false)
      setLoading(false)
      return
    }

    if (hasNotification) setPermission(Notification.permission)

    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((subscription) => {
        setIsSubscribed(!!subscription)
        setLoading(false)
      }).catch(() => {
        setLoading(false)
      })
    }).catch(() => {
      setLoading(false)
    })
  }, [])

  const subscribe = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false

    if (subscribeInFlight) return false
    subscribeInFlight = true

    try {
      if (typeof Notification === 'undefined') return false
      const result = await Notification.requestPermission()
      setPermission(result)

      if (result !== 'granted') return false

      const reg = await getSWRegistration()
      if (!reg || !reg.active) return false

      const subscription = await createBrowserSubscription(reg)
      if (!subscription) return false

      const ok = await persistSubscription(subscription)
      if (!ok) {
        console.error('[Push] Server rejected subscription')
        await subscription.unsubscribe().catch(() => {})
        setIsSubscribed(false)
        return false
      }

      setIsSubscribed(true)
      return true
    } catch (err) {
      console.error('[Push] Subscribe failed:', err)
      return false
    } finally {
      subscribeInFlight = false
    }
  }, [])

  const unsubscribe = useCallback(async () => {
    if (!('serviceWorker' in navigator)) return false

    try {
      const reg = await getSWRegistration()
      if (!reg) return false

      const subscription = await reg.pushManager.getSubscription()

      if (!subscription) return true

      const endpoint = subscription.endpoint
      const { data: { session } } = await supabase.auth.getSession()

      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      await subscription.unsubscribe()

      await fetch('/api/push/unsubscribe', {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ endpoint }),
      })

      setIsSubscribed(false)
      return true
    } catch (err) {
      console.error('[Push] Unsubscribe failed:', err)
      return false
    }
  }, [])

  const reSubscribe = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

    // Skip if a subscribe is already in flight (StrictMode double-fire guard).
    if (subscribeInFlight) return

    subscribeInFlight = true

    try {
      const reg = await getSWRegistration()
      if (!reg || !reg.active) return

      // If permission is not granted yet, there's nothing to re-subscribe.
      if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
        return
      }

      const subscription = await createBrowserSubscription(reg)
      if (!subscription) return

      const ok = await persistSubscription(subscription)
      if (!ok) {
        console.error('[Push] Re-subscribe rejected by server')
      } else {
        setIsSubscribed(true)
        // Clean up stale subscriptions from old sessions
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.access_token) {
          fetch('/api/push/cleanup', {
            method: 'POST',
            headers: { Authorization: `Bearer ${session.access_token}` },
          }).then(res => res.json()).then(data => {
            if (data.cleaned > 0) {
              console.log(`[Push] Cleaned up ${data.cleaned} stale subscription(s), ${data.remaining} remaining`)
            }
          }).catch(() => {})
        }
      }
    } catch (err) {
      const name = (err as DOMException)?.name
      const msg = (err as Error)?.message || ''
      if (name === 'AbortError' && msg.includes('push service')) {
        console.error(
          '[Push] Re-subscribe failed: Chrome push service rejected the subscription. ' +
          'Clear site data for this origin (Settings > Privacy > Clear browsing data > ' +
          '"Cookies and other site data"), then reload and log in again.'
        )
      } else {
        console.error('[Push] Re-subscribe failed:', err)
      }
    } finally {
      subscribeInFlight = false
    }
  }, [])

  return {
    permission,
    isSubscribed,
    loading,
    subscribe,
    unsubscribe,
    reSubscribe,
    isSupported: typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined',
  }
}
