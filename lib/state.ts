import * as crypto from 'node:crypto';
import { getLogLevel } from '../baml_client/config';
import type { Thread } from './agents/assistant';
import type { TrademarkEntry } from './tools/inpi_fetcher'; // Import TrademarkEntry type

// Simple in-memory cache for INPI results
// In a production system, consider Redis, a database, or a dedicated cache store
const inpiCache = new Map<string, TrademarkEntry[]>();
const CACHE_TTL_MS = 5 * 60 * 1000; // Cache results for 5 minutes

function setInpiCache(resultId: string, results: TrademarkEntry[]) {
  inpiCache.set(resultId, results);
  // Simple TTL mechanism
  setTimeout(() => {
    inpiCache.delete(resultId);
    if (getLogLevel() !== 'OFF') console.log(`Expired INPI cache for result ID: ${resultId}`);
  }, CACHE_TTL_MS);
}

function getInpiCache(resultId: string): TrademarkEntry[] | undefined {
  return inpiCache.get(resultId);
}


// you can replace this with any simple state management,
// e.g. redis, sqlite, postgres, etc
export class ThreadStore {
    private threads: Map<string, Thread> = new Map();

    create(thread: Thread): string {
        const id = crypto.randomUUID();
        this.threads.set(id, thread);
        return id;
    }

    get(id: string): Thread | undefined {
        return this.threads.get(id);
    }

    update(id: string, thread: Thread): void {
        this.threads.set(id, thread);
    }

    // --- INPI Cache Methods ---
    // These are static methods for simplicity in this example,
    // allowing handlers to access the cache without needing the store instance.

    static addInpiResults(results: TrademarkEntry[]): string {
        const resultId = crypto.randomUUID();
        setInpiCache(resultId, results);
        if (getLogLevel() !== 'OFF') console.log(`Cached INPI results under ID: ${resultId}`);
        return resultId;
    }

    static getInpiResults(resultId: string): TrademarkEntry[] | undefined {
        return getInpiCache(resultId);
    }
}