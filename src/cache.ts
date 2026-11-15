import { CACHE_TTL_MS, type AccountId, type AccountSnapshot } from "./types.js";

interface CacheEntry {
  at: number;
  account: AccountSnapshot;
}

export class UsageCache {
  private readonly ttlMs: number;
  private readonly entries = new Map<AccountId, CacheEntry>();

  constructor(ttlMs = CACHE_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  get(accountId: AccountId, now = Date.now()): CacheEntry | undefined {
    const entry = this.entries.get(accountId);
    if (entry === undefined) return undefined;
    if (now - entry.at > this.ttlMs) return undefined;
    return entry;
  }

  peek(accountId: AccountId): CacheEntry | undefined {
    return this.entries.get(accountId);
  }

  set(accountId: AccountId, account: AccountSnapshot, now = Date.now()): void {
    this.entries.set(accountId, { at: now, account });
  }

  clear(): void {
    this.entries.clear();
  }
}
