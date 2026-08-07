"use client"

// components/TripOfflineIndicator.tsx
// Minimal indicator - only shows when offline or syncing trip actions

import { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';
import { getPendingTripActionCount } from '@/lib/offline/tripsDb';
import { tripActionSyncManager } from '@/lib/offline/tripActionSync';

export default function TripOfflineIndicator() {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  async function updatePendingCount() {
    try {
      const count = await getPendingTripActionCount();
      setPendingCount(count);
    } catch (error) {
      console.error('[TripOfflineIndicator] Error getting pending count:', error);
    }
  }

  useEffect(() => {
    // Check initial status
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsOnline(navigator.onLine);
    updatePendingCount();

    // Listen for online/offline
    const handleOnline = async () => {
      setIsOnline(true);
      // Trigger sync when reconnected
      setIsSyncing(true);
      await tripActionSyncManager.syncAll();
      await new Promise(resolve => setTimeout(resolve, 500)); // Wait for IndexedDB to update
      setIsSyncing(false);
      await updatePendingCount(); // Re-fetch to verify all synced
    };

    const handleOffline = () => {
      setIsOnline(false);
      updatePendingCount();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Don't show if everything is fine
  if (isOnline && pendingCount === 0 && !isSyncing) {
    return null;
  }

  const bgColor = !isOnline
    ? '#ef4444'
    : isSyncing
      ? '#f59e0b'
      : pendingCount > 0
        ? '#f59e0b'
        : '#10b981';

  const statusText = !isOnline 
    ? 'No internet — changes saved locally'
    : isSyncing 
      ? `Syncing ${pendingCount} trip action${pendingCount !== 1 ? 's' : ''}...`
      : pendingCount > 0 
        ? `${pendingCount} trip action${pendingCount !== 1 ? 's' : ''} synced ✓`
        : 'All synced';

  return (
    <>
      {/* Sticky indicator bar — doesn't overlay, scrolls with content */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          left: 0,
          right: 0,
          padding: '12px 16px',
          background: bgColor,
          color: 'white',
          fontSize: 13,
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 50,
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!isOnline && (
            <Icon icon="mdi:wifi-off" width={16} />
          )}
          {isOnline && isSyncing && (
            <Icon
              icon="mdi:loading"
              width={16}
              style={{ animation: 'spin 1s linear infinite' }}
            />
          )}
          {isOnline && !isSyncing && pendingCount > 0 && (
            <Icon icon="mdi:cloud-upload-outline" width={16} />
          )}
          {isOnline && !isSyncing && pendingCount === 0 && (
            <Icon icon="mdi:check-circle" width={16} />
          )}

          <span>{statusText}</span>
        </div>
      </div>

      {/* Push content down so indicator doesn't overlay */}
      <style>{`
        @keyframes spin { 
          from { transform: rotate(0deg); } 
          to { transform: rotate(360deg); } 
        }
      `}</style>
    </>
  );
}