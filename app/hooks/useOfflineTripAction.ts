"use client"

import { useCallback, useEffect, useState } from 'react';
import { apiMutate } from '@/lib/api-mutation';
import {
  savePendingTripAction,
  getPendingTripActionCount,
} from '@/lib/offline/tripsDb';

interface UseOfflineTripActionResult {
  submitAction: (
    type: 'stop' | 'discrepancy' | 'load_more',
    tripId: string,
    tableName: string,
    data: Record<string, unknown>
  ) => Promise<{ success: boolean; error?: string; offline?: boolean }>;
  isSubmitting: boolean;
  isOnline: boolean;
}

export function useOfflineTripAction(): UseOfflineTripActionResult {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const submitAction = useCallback(
    async (
      type: 'stop' | 'discrepancy' | 'load_more',
      tripId: string,
      tableName: string,
      data: Record<string, unknown>
    ) => {
      setIsSubmitting(true);

      try {
        if (isOnline) {
          console.log(`[Trip Action] Online - submitting ${type} immediately`);

          let result;
          if (type === 'load_more') {
            const { loaded_quantity, trip_status, updated_at } = data;
            result = await apiMutate("trips", {
              action: "update",
              table: "Trips",
              data: { loaded_quantity, trip_status, updated_at },
              filters: { trip_id: tripId },
            })
          } else {
            result = await apiMutate("trips", {
              action: "insert",
              table: tableName,
              data,
            })
          }

          if (result.error) {
            console.error(`[Trip Action] Submit failed:`, result.error);
            setIsSubmitting(false);
            return { success: false, error: result.error };
          }

          console.log(`[Trip Action] ${type} submitted successfully`);
          setIsSubmitting(false);
          return { success: true };
        }

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

export function usePendingTripCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let mounted = true;
    const refreshCount = async () => {
      const newCount = await getPendingTripActionCount();
      if (mounted) setCount(newCount);
    };

    window.addEventListener('online', refreshCount);
    refreshCount();

    return () => {
      mounted = false;
      window.removeEventListener('online', refreshCount);
    };
  }, []);

  return count;
}
