"use client"

// lib/offline/tripsDb.ts
// Simplified IndexedDB for TRIPS + reference data (brokers, customers)

interface PendingTripAction {
  id: string;
  type: 'stop' | 'discrepancy' | 'load_more';
  tripId: string;
  data: Record<string, any>;
  timestamp: number;
  synced: 0 | 1;
  syncAttempts: number;
  lastError?: string;
}

interface CachedBroker {
  broker_id: string;
  broker_name: string;
}

interface CachedCustomer {
  customer_id: string;
  full_name: string;
  phone_number: string;
}

const DB_NAME = 'KbNL_Trips';
const DB_VERSION = 2; // ← BUMPED to trigger upgrade for new stores
const STORE_NAME = 'pending_trip_actions';
const BROKER_STORE = 'cached_brokers';
const CUSTOMER_STORE = 'cached_customers';

// Single consolidated initialization for all stores
function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Trip actions store
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('synced', 'synced', { unique: false });
        store.createIndex('tripId', 'tripId', { unique: false });
        store.createIndex('type', 'type', { unique: false });
      }

      // Brokers cache
      if (!db.objectStoreNames.contains(BROKER_STORE)) {
        db.createObjectStore(BROKER_STORE, { keyPath: 'broker_id' });
      }

      // Customers cache
      if (!db.objectStoreNames.contains(CUSTOMER_STORE)) {
        db.createObjectStore(CUSTOMER_STORE, { keyPath: 'customer_id' });
      }
    };
  });
}

// ── TRIP ACTIONS ──

// Save a pending trip action
export async function savePendingTripAction(
  type: 'stop' | 'discrepancy' | 'load_more',
  tripId: string,
  data: Record<string, any>
): Promise<string> {
  const db = await initDB();
  const id = `${type}-${tripId}-${Date.now()}`;

  const action: PendingTripAction = {
    id,
    type,
    tripId,
    data,
    timestamp: Date.now(),
    synced: 0,
    syncAttempts: 0,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.add(action);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(id);
  });
}

// Get all unsynced pending actions
export async function getPendingTripActions(): Promise<PendingTripAction[]> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('synced');
    const request = index.getAll(0); // 0 = unsynced

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

// Get pending actions for a specific trip
export async function getPendingActionsByTrip(tripId: string): Promise<PendingTripAction[]> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('tripId');
    const request = index.getAll(tripId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const all = request.result;
      const unsynced = all.filter(a => a.synced === 0);
      resolve(unsynced);
    };
  });
}

// Mark as synced
export async function markTripActionSynced(id: string): Promise<void> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const action = request.result as PendingTripAction;
      if (action) {
        action.synced = 1;
        action.syncAttempts += 1;
        const updateRequest = store.put(action);
        updateRequest.onerror = () => reject(updateRequest.error);
        updateRequest.onsuccess = () => resolve();
      }
    };
  });
}

// Update error
export async function updateTripActionError(id: string, error: string): Promise<void> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const action = request.result as PendingTripAction;
      if (action) {
        action.lastError = error;
        action.syncAttempts += 1;
        const updateRequest = store.put(action);
        updateRequest.onerror = () => reject(updateRequest.error);
        updateRequest.onsuccess = () => resolve();
      }
    };
  });
}

// Delete action
export async function deletePendingTripAction(id: string): Promise<void> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// Get pending count
export async function getPendingTripActionCount(): Promise<number> {
  const actions = await getPendingTripActions();
  return actions.length;
}

// Clear all offline cache for a specific trip
export async function clearOfflineTripData(tripId: string): Promise<void> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('tripId');
    const request = index.getAll(tripId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const actions = request.result;
      
      // Delete each action for this trip
      for (const action of actions) {
        store.delete(action.id);
      }
      
      console.log(`[OfflineDB] Cleared ${actions.length} offline actions for trip ${tripId}`);
      resolve();
    };
  });
}

// ── BROKERS ──

// Cache brokers
export async function cacheBrokers(brokers: CachedBroker[]): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([BROKER_STORE], 'readwrite');
    const store = tx.objectStore(BROKER_STORE);
    
    // Clear old data first
    const clearRequest = store.clear();
    
    clearRequest.onsuccess = () => {
      // Add new data
      for (const broker of brokers) {
        store.add(broker);
      }
      resolve();
    };
    
    clearRequest.onerror = () => reject(clearRequest.error);
    tx.onerror = () => reject(tx.error);
  });
}

// Get cached brokers
export async function getCachedBrokers(): Promise<CachedBroker[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([BROKER_STORE], 'readonly');
    const store = tx.objectStore(BROKER_STORE);
    const request = store.getAll();
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

// ── CUSTOMERS ──

// Cache customers
export async function cacheCustomers(customers: CachedCustomer[]): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([CUSTOMER_STORE], 'readwrite');
    const store = tx.objectStore(CUSTOMER_STORE);
    
    // Clear old data first
    const clearRequest = store.clear();
    
    clearRequest.onsuccess = () => {
      // Add new data
      for (const customer of customers) {
        store.add(customer);
      }
      resolve();
    };
    
    clearRequest.onerror = () => reject(clearRequest.error);
    tx.onerror = () => reject(tx.error);
  });
}

// Get cached customers
export async function getCachedCustomers(): Promise<CachedCustomer[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([CUSTOMER_STORE], 'readonly');
    const store = tx.objectStore(CUSTOMER_STORE);
    const request = store.getAll();
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}