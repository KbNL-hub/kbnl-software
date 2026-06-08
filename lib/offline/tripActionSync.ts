"use client"

// lib/offline/tripActionSync.ts
// Automatically syncs pending trip actions when connection returns

import { supabase } from '@/lib/supabase';
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

  /**
   * Sync all pending trip actions
   * Call this when connection returns
   */
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

        // Small delay between items
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      console.log('[TripSync] Sync complete:', results);
      return results;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Sync a single action
   */
  private async syncAction(action: {
    id: string;
    type: 'stop' | 'discrepancy' | 'load_more';
    data: Record<string, any>;
  }): Promise<SyncResult> {
    try {
      console.log(`[TripSync] Syncing ${action.type}: ${action.id}`);

      if (action.type === 'load_more') {
        const { trip_id, ...updateData } = action.data;
        const { error } = await supabase
          .from('Trips')
          .update(updateData)
          .eq('trip_id', trip_id);
        
        if (error) {
          await updateTripActionError(action.id, error.message);
          return { actionId: action.id, type: action.type, success: false, error: error.message };
        }
      } else {
        // stops and discrepancies use INSERT
        const { error } = await supabase
          .from(this.getTableName(action.type))
          .insert([action.data]);

        if (error) {
          await updateTripActionError(action.id, error.message);
          return { actionId: action.id, type: action.type, success: false, error: error.message };
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

  /**
   * Get table name for action type
   */
  private getTableName(type: 'stop' | 'discrepancy' | 'load_more'): string {
    switch (type) {
      case 'stop':
        return 'Stops';
      case 'discrepancy':
        return 'trip_discrepancies';
      case 'load_more':
        return 'Trips'; // Load more updates the Trips table
      default:
        return '';
    }
  }
}

// Export singleton
export const tripActionSyncManager = new TripActionSyncManager();

/**
 * Initialize auto-sync on connection
 * Call this once in a useEffect at app load
 */
export function initTripActionAutoSync() {
  window.addEventListener('online', async () => {
    console.log('[TripSync] Connection restored, syncing pending actions...');
    await tripActionSyncManager.syncAll();
  });
}