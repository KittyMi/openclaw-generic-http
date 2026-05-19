export interface NonceStore {
  tryUse(nonce: string, timestampEpochSeconds: number): boolean;
}

export interface InMemoryNonceStoreOptions {
  /**
   * Maximum allowed age window for accepted nonces, in seconds.
   *
   * Entries older than this window are evicted during normal insert/check
   * operations so the store stays bounded for the minimum viable runtime.
   */
  ttlSeconds?: number;

  /**
   * Clock source override for tests and deterministic validation flows.
   */
  nowEpochSeconds?: () => number;
}

const DEFAULT_TTL_SECONDS = 300;

/**
 * Small in-memory nonce store for local development and single-process
 * deployments. This is enough for the first runtime loop and can later be
 * replaced with Redis or another shared backing store without changing the
 * caller contract.
 */
export class InMemoryNonceStore implements NonceStore {
  private readonly ttlSeconds: number;
  private readonly nowEpochSeconds: () => number;
  private readonly entries = new Map<string, number>();

  constructor(options: InMemoryNonceStoreOptions = {}) {
    this.ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
    this.nowEpochSeconds = options.nowEpochSeconds ?? (() => Math.floor(Date.now() / 1000));
  }

  tryUse(nonce: string, timestampEpochSeconds: number): boolean {
    this.evictExpired();

    if (this.entries.has(nonce)) {
      return false;
    }

    this.entries.set(nonce, timestampEpochSeconds);
    return true;
  }

  private evictExpired(): void {
    const cutoff = this.nowEpochSeconds() - this.ttlSeconds;
    for (const [nonce, timestamp] of this.entries.entries()) {
      if (timestamp < cutoff) {
        this.entries.delete(nonce);
      }
    }
  }
}
