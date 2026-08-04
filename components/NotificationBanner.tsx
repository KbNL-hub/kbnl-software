'use client'

import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'

const BANNER_DISMISSED_KEY = 'kbnl_notif_banner_dismissed'

export default function NotificationBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const dismissed = localStorage.getItem(BANNER_DISMISSED_KEY)
    if (!dismissed) setVisible(true)
  }, [])

  if (!visible) return null

  function dismiss() {
    localStorage.setItem(BANNER_DISMISSED_KEY, 'true')
    setVisible(false)
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 9999,
      background: 'linear-gradient(135deg, #0070f3 0%, #0051c7 100%)',
      color: 'white',
      padding: '14px 20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
    }}>
      <Icon icon="mdi:bell-ring-outline" width={22} style={{ flexShrink: 0 }} />
      <p style={{
        margin: 0,
        fontSize: 14,
        fontWeight: 500,
        textAlign: 'center',
        lineHeight: 1.4,
      }}>
        <strong>Stay updated!</strong> KbNL will ask for permission to send you notifications.
        Please accept to receive important updates about your work.
      </p>
      <button
        onClick={dismiss}
        style={{
          background: 'rgba(255,255,255,0.2)',
          border: 'none',
          color: 'white',
          borderRadius: 8,
          padding: '8px 16px',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        Got it
      </button>
    </div>
  )
}
