'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
const DEVICE_ID_KEY = 'kbnl_device_id'

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

function getDeviceId(): string {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY)
  if (!deviceId) {
    deviceId = crypto.randomUUID()
    localStorage.setItem(DEVICE_ID_KEY, deviceId)
  }
  return deviceId
}

async function getSWRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.ready
  } catch {
    return null
  }
}

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const hasNotification = typeof Notification !== 'undefined'

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
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

    try {
      if (!VAPID_PUBLIC_KEY) {
        console.error('[Push] NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set. Add it to your environment and rebuild.')
        return false
      }

      if (typeof Notification === 'undefined') return false
      const result = await Notification.requestPermission()
      setPermission(result)

      if (result !== 'granted') return false

      const reg = await getSWRegistration()
      if (!reg) return false

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })

      const sub = JSON.parse(JSON.stringify(subscription))
      const deviceId = getDeviceId()

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
          deviceId,
        }),
      })

      if (!res.ok) {
        console.error('[Push] Server rejected subscription:', res.status)
        await subscription.unsubscribe().catch(() => {})
        setIsSubscribed(false)
        return false
      }

      setIsSubscribed(true)
      return true
    } catch (err) {
      console.error('[Push] Subscribe failed:', err)
      return false
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
        body: JSON.stringify({ endpoint, deviceId: getDeviceId() }),
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

    try {
      const reg = await getSWRegistration()
      if (!reg) return

      const subscription = await reg.pushManager.getSubscription()
      if (!subscription) return

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
          deviceId: getDeviceId(),
        }),
      })

      if (!res.ok) {
        console.error('[Push] Re-subscribe rejected by server:', res.status)
      }
    } catch (err) {
      console.error('[Push] Re-subscribe failed:', err)
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
