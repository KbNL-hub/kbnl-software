"use client"

// hooks/useOfflineTripAction.ts
// Conditional hook: online = instant submit, offline = save locally

import { useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  savePendingTripAction,
  getPendingTripActionCount,
} from '@/lib/offline/tripsDb';

interface UseOfflineTripActionResult {
  submitAction: (
    type: 'stop' | 'discrepancy' | 'load_more',
    tripId: string,
    tableName: string,
    data: Record<string, any>
  ) => Promise<{ success: boolean; error?: string; offline?: boolean }>;
  isSubmitting: boolean;
  isOnline: boolean;
}

export function useOfflineTripAction(): UseOfflineTripActionResult {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Detect online/offline
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => setIsOnline(true));
    window.addEventListener('offline', () => setIsOnline(false));
  }

  const submitAction = useCallback(
    async (
      type: 'stop' | 'discrepancy' | 'load_more',
      tripId: string,
      tableName: string,
      data: Record<string, any>
    ) => {
      setIsSubmitting(true);

      try {
        // ONLINE: Submit immediately
        if (isOnline) {
          console.log(`[Trip Action] Online - submitting ${type} immediately`);

          let result;
          if (type === 'load_more') {
            // load_more: UPDATE existing Trips record
            const { loaded_quantity, trip_status, updated_at } = data;
            result = await supabase
              .from(tableName)
              .update({ loaded_quantity, trip_status, updated_at })
              .eq('trip_id', tripId);
          } else {
            // stop & discrepancy: INSERT new records
            result = await supabase
              .from(tableName)
              .insert([data]);
          }

          if (result.error) {
            console.error(`[Trip Action] Submit failed:`, result.error);
            setIsSubmitting(false);
            return { success: false, error: result.error.message };
          }

          console.log(`[Trip Action] ${type} submitted successfully`);
          setIsSubmitting(false);
          return { success: true };
        }

        // OFFLINE: Save locally
        console.log(`[Trip Action] Offline - saving ${type} locally`);
        await savePendingTripAction(type, tripId, data);
        setIsSubmitting(false);
        return { success: true, offline: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Trip Action] Error:`, error);
        setIsSubmitting(false);
        return { success: false, error: message };
      }
    },
    [isOnline]
  );

  return {
    submitAction,
    isSubmitting,
    isOnline,
  };
}

// Hook to get pending count (for indicator badge)
export function usePendingTripCount(): number {
  const [count, setCount] = useState(0);

  if (typeof window !== 'undefined') {
    // Update count when online
    window.addEventListener('online', async () => {
      const newCount = await getPendingTripActionCount();
      setCount(newCount);
    });

    // Update on mount
    getPendingTripActionCount().then(setCount);
  }

  return count;
}