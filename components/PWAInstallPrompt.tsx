'use client';

import { useEffect, useRef, useState } from 'react';
import { usePWAInstall } from '@/app/hooks/usePWAInstall';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PWAInstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const { hasBeenPrompted, markAsPrompted } = usePWAInstall();
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if app is already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;

      // Only show if user hasn't been prompted before
      if (!hasBeenPrompted) {
        setShowPrompt(true);
        // Mark as prompted immediately
        markAsPrompted();
      }
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowPrompt(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [hasBeenPrompted, markAsPrompted]);

  const handleInstall = async () => {
    if (!deferredPrompt.current) return;

    try {
      await deferredPrompt.current.prompt();
      const { outcome } = await deferredPrompt.current.userChoice;

      if (outcome === 'accepted') {
        setIsInstalled(true);
        setShowPrompt(false);
      }

      deferredPrompt.current = null;
    } catch (error) {
      console.error('PWA installation error:', error);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    deferredPrompt.current = null;
  };

  if (!showPrompt || isInstalled) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        right: 0,
        zIndex: 9999,
        maxWidth: 380,
        animation: 'slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}
    >
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: 16,
          boxShadow:
            '0 10px 40px rgba(0, 0, 0, 0.16), 0 0 0 1px rgba(0, 0, 0, 0.08)',
          padding: 20,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: 12,
            gap: 12,
          }}
        >
          <div>
            <img
            src="/logo-192.png"
            alt="KbNL Logo"
            style={{ width: 48, height: 48 }}
            />
          </div>
          <div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: '#171717',
                lineHeight: 1.2,
              }}
            >
              Get KbNL App on Your Phone
            </div>
            <div
              style={{
                fontSize: 12,
                color: '#666',
                lineHeight: 1.2,
              }}
            >
              Faster & better experience
            </div>
          </div>
        </div>

        {/* Description */}
        <p
          style={{
            fontSize: 13,
            color: '#555',
            lineHeight: 1.5,
            margin: '12px 0 16px 0',
            fontWeight: 400,
          }}
        >
          Install the app for quick access, full screen experience, and better performance. 
        </p>

        {/* Benefits */}
        <ul
          style={{
            fontSize: 12,
            color: '#666',
            lineHeight: 1.6,
            margin: '12px 0 16px 0',
            paddingLeft: 18,
            listStyle: 'disc',
          }}
        >
          <li>No need to type the URL</li>
          <li>Easily access your favourite features</li>
          <li>Fast app-like experience</li>
        </ul>

        {/* Buttons */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginTop: 16,
          }}
        >
          <button
            onClick={handleInstall}
            style={{
              flex: 1,
              minHeight: 44,
              backgroundColor: '#0070f3',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
              boxShadow: '0 4px 12px rgba(0, 112, 243, 0.25)',
            }}
            onMouseEnter={(e) => {
              const target = e.currentTarget as HTMLButtonElement;
              target.style.boxShadow =
                '0 8px 20px rgba(0, 112, 243, 0.35)';
              target.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              const target = e.currentTarget as HTMLButtonElement;
              target.style.boxShadow =
                '0 4px 12px rgba(0, 112, 243, 0.25)';
              target.style.transform = 'translateY(0)';
            }}
          >
            Install App
          </button>
          <button
            onClick={handleDismiss}
            style={{
              flex: 1,
              minHeight: 44,
              backgroundColor: '#f5f5f5',
              color: '#666',
              border: 'none',
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
            onMouseEnter={(e) => {
              const target = e.currentTarget as HTMLButtonElement;
              target.style.backgroundColor = '#e8e8e8';
            }}
            onMouseLeave={(e) => {
              const target = e.currentTarget as HTMLButtonElement;
              target.style.backgroundColor = '#f5f5f5';
            }}
          >
            Maybe Later
          </button>
        </div>
      </div>

      {/* Keyframe animation */}
      <style>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}