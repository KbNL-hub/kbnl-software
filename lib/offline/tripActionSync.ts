"use client"

import { apiMutate } from '@/lib/api-mutation';
import {
  getPendingTripActions,
  markTripActionSynced,
  updateTripActionError,
} from './tripsDb';

interface SyncResult {
  actionId: string;
  type: 'stop' | 'discrepancy' | 'load_more';
  success: boolean;
  error?: string;
}

export class TripActionSyncManager {
  private isSyncing = false;

  async syncAll(): Promise<SyncResult[]> {
    if (this.isSyncing) {
      console.log('[TripSync] Already syncing, skipping...');
      return [];
    }

    if (!navigator.onLine) {
      console.log('[TripSync] Offline, cannot sync');
      return [];
    }

    this.isSyncing = true;
    const results: SyncResult[] = [];

    try {
      const pending = await getPendingTripActions();
      console.log(`[TripSync] Syncing ${pending.length} pending trip actions...`);

      for (const action of pending) {
        const result = await this.syncAction(action);
        results.push(result);

        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      console.log('[TripSync] Sync complete:', results);
      return results;
    } finally {
      this.isSyncing = false;
    }
  }

  private async syncAction(action: {
    id: string;
    type: 'stop' | 'discrepancy' | 'load_more';
    data: Record<string, unknown>;
  }): Promise<SyncResult> {
    try {
      console.log(`[TripSync] Syncing ${action.type}: ${action.id}`);

      if (action.type === 'load_more') {
        const { trip_id, ...updateData } = action.data;
        const { error } = await apiMutate("trips", {
          action: "update",
          table: "Trips",
          data: updateData,
          filters: { trip_id },
        })

        if (error) {
          await updateTripActionError(action.id, error);
          return { actionId: action.id, type: action.type, success: false, error };
        }
      } else {
        const table = action.type === 'stop' ? 'Stops' : 'trip_discrepancies'
        const { error } = await apiMutate("trips", {
          action: "insert",
          table,
          data: action.data,
        })

        if (error) {
          await updateTripActionError(action.id, error);
          return { actionId: action.id, type: action.type, success: false, error };
        }
      }

      await markTripActionSynced(action.id);
      return { actionId: action.id, type: action.type, success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await updateTripActionError(action.id, message);
      return { actionId: action.id, type: action.type, success: false, error: message };
    }
  }
}

export const tripActionSyncManager = new TripActionSyncManager();

let _autoSyncInitialized = false;

export function initTripActionAutoSync() {
  if (_autoSyncInitialized) return;
  _autoSyncInitialized = true;

  window.addEventListener('online', async () => {
    console.log('[TripSync] Connection restored, syncing pending actions...');
    await tripActionSyncManager.syncAll();
  });
}
