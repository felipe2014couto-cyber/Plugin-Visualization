import type { PiTrendSeries } from './piDataSource';

export const TREND_PERSISTENT_CACHE_TTL_MS = 5 * 60 * 1000;
export const TREND_PERSISTENT_CACHE_MAX_ENTRIES = 160;

export interface TrendPersistentCache {
  get(key: string): Promise<PiTrendSeries | undefined>;
  set(key: string, series: PiTrendSeries): Promise<void>;
}

interface StoredTrendSeries {
  key: string;
  storedAt: number;
  series: PiTrendSeries;
}

const DATABASE_NAME = 'pims-vision-trend-cache';
const DATABASE_VERSION = 1;
const STORE_NAME = 'series';

class NoopTrendPersistentCache implements TrendPersistentCache {
  async get(_key: string): Promise<PiTrendSeries | undefined> {
    return undefined;
  }

  async set(_key: string, _series: PiTrendSeries): Promise<void> {
    // The application must remain usable in browsers where IndexedDB is unavailable.
  }
}

class IndexedDbTrendPersistentCache implements TrendPersistentCache {
  private database: Promise<IDBDatabase> | undefined;

  async get(key: string): Promise<PiTrendSeries | undefined> {
    try {
      const database = await this.open();
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const record = await requestAsPromise<StoredTrendSeries | undefined>(transaction.objectStore(STORE_NAME).get(key));
      if (!record) {
        return undefined;
      }
      if (Date.now() - record.storedAt > TREND_PERSISTENT_CACHE_TTL_MS) {
        void this.remove(key);
        return undefined;
      }
      return record.series;
    } catch {
      return undefined;
    }
  }

  async set(key: string, series: PiTrendSeries): Promise<void> {
    try {
      const database = await this.open();
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.put({ key, storedAt: Date.now(), series } as StoredTrendSeries);
      const records = await requestAsPromise<StoredTrendSeries[]>(store.getAll());
      const oldestFirst = records.sort((left, right) => left.storedAt - right.storedAt);
      const expiredBefore = Date.now() - TREND_PERSISTENT_CACHE_TTL_MS;
      const freshRecords = oldestFirst.filter((record) => record.storedAt >= expiredBefore);
      const expiredRecords = oldestFirst.filter((record) => record.storedAt < expiredBefore);
      const overflow = Math.max(0, freshRecords.length - TREND_PERSISTENT_CACHE_MAX_ENTRIES);
      for (const record of [...expiredRecords, ...freshRecords.slice(0, overflow)]) {
        store.delete(record.key);
      }
      await transactionAsPromise(transaction);
    } catch {
      // Storage quota and private-browsing failures must not affect live trends.
    }
  }

  private async remove(key: string): Promise<void> {
    try {
      const database = await this.open();
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(key);
      await transactionAsPromise(transaction);
    } catch {
      // Best-effort expiry cleanup.
    }
  }

  private open(): Promise<IDBDatabase> {
    if (!this.database) {
      this.database = new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains(STORE_NAME)) {
            database.createObjectStore(STORE_NAME, { keyPath: 'key' });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    return this.database;
  }
}

let browserCache: TrendPersistentCache | undefined;

export function getTrendPersistentCache(): TrendPersistentCache {
  if (!browserCache) {
    browserCache = typeof indexedDB === 'undefined'
      ? new NoopTrendPersistentCache()
      : new IndexedDbTrendPersistentCache();
  }
  return browserCache;
}

function requestAsPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionAsPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
