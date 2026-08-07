'use client'

import { useState, useEffect, useRef } from 'react'
import { Icon } from '@iconify/react'
import { usePushNotifications } from '@/app/hooks/usePushNotifications'

const PROMPT_DISMISSED_AT_KEY = 'kbnl_notif_prompt_dismissed_at'
const RE_PROMPT_INTERVAL_MS = 48 * 60 * 60 * 1000 // 48 hours

function msSinceDismissal(): number | null {
  const raw = localStorage.getItem(PROMPT_DISMISSED_AT_KEY)
  if (!raw) return null
  const at = Number(raw)
  if (!Number.isFinite(at)) return null
  return Date.now() - at
}

export default function NotificationPermissionPrompt() {
  const { permission, isSubscribed, subscribe, isSupported, loading } = usePushNotifications()
  const [visible, setVisible] = useState(false)
  const [subscribing, setSubscribing] = useState(false)
  const [showDeniedHint, setShowDeniedHint] = useState(false)
  const primaryBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (loading || !isSupported) return
    if (permission === 'granted' || isSubscribed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisible(false)
      setShowDeniedHint(false)
      return
    }

    if (permission === 'denied') {
      const elapsed = msSinceDismissal()
      if (elapsed === null) {
        setShowDeniedHint(true)
        return
      }
      if (elapsed >= RE_PROMPT_INTERVAL_MS) {
        setShowDeniedHint(true)
      }
      return
    }

    const elapsed = msSinceDismissal()
    if (elapsed !== null && elapsed < RE_PROMPT_INTERVAL_MS) return

    setVisible(true)
  }, [permission, isSubscribed, loading, isSupported])

  useEffect(() => {
    if (primaryBtnRef.current) primaryBtnRef.current.focus()
  }, [visible, showDeniedHint])

  if (!visible && !showDeniedHint) return null
  if (!isSupported) return null

  function dismiss() {
    localStorage.setItem(PROMPT_DISMISSED_AT_KEY, String(Date.now()))
    setVisible(false)
    setShowDeniedHint(false)
  }

  async function handleAllow() {
    setSubscribing(true)
    const result = await subscribe()
    setSubscribing(false)
    if (result) {
      setVisible(false)
      setShowDeniedHint(false)
    }
  }

  if (showDeniedHint) {
    return (
      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby="notif-deny-title"
        style={{
          position: 'fixed',
          bottom: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9998,
          background: 'white',
          borderRadius: 16,
          boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
          padding: '24px 28px',
          maxWidth: 420,
          width: 'calc(100% - 32px)',
          textAlign: 'center',
        }}
      >
        <div style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: '#fef2f2',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px',
        }}>
          <Icon icon="mdi:bell-off-outline" width={24} color="#ef4444" />
        </div>
        <h3
          id="notif-deny-title"
          style={{
            margin: '0 0 8px',
            fontSize: 18,
            fontWeight: 700,
            color: '#1a1a1a',
          }}
        >
          Notifications Blocked
        </h3>
        <p style={{
          margin: '0 0 12px',
          fontSize: 14,
          color: '#64748b',
          lineHeight: 1.5,
        }}>
          Notifications are currently blocked in your browser. To enable them:
        </p>
        <ol style={{
          margin: '0 0 20px',
          padding: '0 0 0 20px',
          fontSize: 13,
          color: '#64748b',
          lineHeight: 1.8,
          textAlign: 'left',
        }}>
          <li>Click the lock icon <Icon icon="mdi:lock-outline" width={14} style={{ verticalAlign: -2 }} /> in the address bar</li>
          <li>Find <strong>Notifications</strong> and set to <strong>Allow</strong></li>
          <li>Refresh this page</li>
        </ol>
        <button
          ref={primaryBtnRef}
          onClick={dismiss}
          style={{
            background: '#f1f5f9',
            border: 'none',
            borderRadius: 10,
            padding: '10px 20px',
            fontSize: 14,
            fontWeight: 600,
            color: '#64748b',
            cursor: 'pointer',
          }}
        >
          Got it
        </button>
      </div>
    )
  }

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="notif-prompt-title"
      style={{
        position: 'fixed',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9998,
        background: 'white',
        borderRadius: 16,
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
        padding: '24px 28px',
        maxWidth: 400,
        width: 'calc(100% - 32px)',
        textAlign: 'center',
      }}
    >
      <div style={{
        width: 48,
        height: 48,
        borderRadius: '50%',
        background: '#f0f7ff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 16px',
      }}>
        <Icon icon="mdi:bell-outline" width={24} color="#0070f3" />
      </div>
      <h3
        id="notif-prompt-title"
        style={{
          margin: '0 0 8px',
          fontSize: 18,
          fontWeight: 700,
          color: '#1a1a1a',
        }}
      >
        Enable Notifications
      </h3>
      <p style={{
        margin: '0 0 20px',
        fontSize: 14,
        color: '#64748b',
        lineHeight: 1.5,
      }}>
        Get real-time updates about trips, payments, and important alerts.
        You won&apos;t miss anything important.
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        <button
          onClick={dismiss}
          style={{
            background: '#f1f5f9',
            border: 'none',
            borderRadius: 10,
            padding: '10px 20px',
            fontSize: 14,
            fontWeight: 600,
            color: '#64748b',
            cursor: 'pointer',
          }}
        >
          Not now
        </button>
        <button
          ref={primaryBtnRef}
          onClick={handleAllow}
          disabled={subscribing}
          style={{
            background: '#0070f3',
            border: 'none',
            borderRadius: 10,
            padding: '10px 24px',
            fontSize: 14,
            fontWeight: 600,
            color: 'white',
            cursor: subscribing ? 'wait' : 'pointer',
            opacity: subscribing ? 0.7 : 1,
          }}
        >
          {subscribing ? 'Enabling...' : 'Enable'}
        </button>
      </div>
    </div>
  )
}
