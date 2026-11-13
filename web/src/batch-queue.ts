import { FARM_BATCH_LIMIT } from '../../shared/farm.mts';
import type { FarmAction, FarmBatchMutation, FarmResponse } from '../../shared/farm.mts';

export class FarmRateLimitError extends Error {
  readonly retryAfterMs: number;

  constructor(retryAfter: string | null) {
    super('Đang có nhiều yêu cầu. Nông trại sẽ thử lưu lại sau.', { cause: 429 });
    const value = retryAfter?.trim();
    const delay = value && /^\d+$/.test(value)
      ? Number(value) * 1_000
      : Date.parse(value ?? '') - Date.now();
    this.retryAfterMs = Number.isFinite(delay) ? Math.max(0, delay) : 10_000;
  }
}

interface BatchQueueConfig {
  debounceMs?: number;
  maxWaitMs?: number;
  maxBatchSize?: number;
  sendBatch: (batch: FarmBatchMutation) => Promise<FarmResponse>;
  onSuccess: (result: FarmResponse, actions: readonly FarmAction[]) => void;
  onError: (error: unknown) => void;
  onConflict: (error: unknown) => Promise<void>;
  getExpectedRevision: () => number;
}

export class BatchQueueManager {
  private queue: FarmAction[] = [];
  private baseRevision: number | undefined;
  private queueStartedAt: number | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inFlight: Promise<void> | undefined;
  private drain: Promise<void> | undefined;
  private generation = 0;
  private retryAt = 0;
  private rateLimitedUntil = 0;
  private retries = 0;

  private readonly debounceMs: number;
  private readonly maxWaitMs: number;
  private readonly maxBatchSize: number;

  constructor(private readonly config: BatchQueueConfig) {
    this.debounceMs = config.debounceMs ?? 300;
    this.maxWaitMs = config.maxWaitMs ?? 800;
    this.maxBatchSize = Math.min(config.maxBatchSize ?? FARM_BATCH_LIMIT, FARM_BATCH_LIMIT);
  }

  get length(): number {
    return this.queue.length;
  }

  get pendingActions(): readonly FarmAction[] {
    return this.queue;
  }

  enqueue(action: FarmAction): void {
    this.baseRevision ??= this.config.getExpectedRevision();
    this.queueStartedAt ??= Date.now();
    this.queue.push(action);
    if (this.retries > 3 && Date.now() >= this.retryAt) this.retries = 0;
    this.schedule();
  }

  private schedule(): void {
    clearTimeout(this.timer);
    if (this.inFlight || this.drain || !this.queue.length || this.retries > 3) return;

    const now = Date.now();
    const waiting = now - (this.queueStartedAt ?? now);
    const batchDelay = this.queue.length >= this.maxBatchSize
      ? 0
      : Math.min(this.debounceMs, this.maxWaitMs - waiting);
    const delay = Math.max(batchDelay, this.retryAt - now, 0);
    if (delay === 0) {
      this.flush();
    } else {
      this.timer = setTimeout(() => {
        if (Date.now() < this.retryAt) this.schedule();
        else this.flush();
      }, Math.min(delay, 2_147_483_647));
    }
  }

  flush(): void {
    if (this.drain || this.retries > 3 || Date.now() < this.retryAt) return;
    void this.sendNext().catch(() => undefined);
  }

  retry(): void {
    this.retries = 0;
    this.retryAt = this.rateLimitedUntil;
    this.schedule();
  }

  private sendNext(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    clearTimeout(this.timer);
    if (!this.queue.length) return Promise.resolve();

    const generation = this.generation;
    const actions = this.queue.splice(0, this.maxBatchSize);
    const batch = { expectedRevision: this.baseRevision ?? this.config.getExpectedRevision(), actions };
    if (!this.queue.length) this.queueStartedAt = undefined;

    const send = async () => {
      if (generation !== this.generation) return;
      let result: FarmResponse;
      try {
        result = await this.config.sendBatch(batch);
      } catch (error) {
        if (generation !== this.generation) throw error;
        const status = error instanceof Error ? error.cause : undefined;
        if (typeof status === 'number' && status >= 400 && status < 500 && status !== 429) {
          this.queue = [];
          this.baseRevision = undefined;
          this.queueStartedAt = undefined;
          this.retries = 0;
          this.retryAt = 0;
          await this.config.onConflict(error);
        } else {
          this.queue.unshift(...actions);
          this.retries++;
          const backoff = 500 * 2 ** Math.min(this.retries - 1, 2);
          const now = Date.now();
          if (error instanceof FarmRateLimitError) {
            this.rateLimitedUntil = now + Math.max(backoff, error.retryAfterMs);
          }
          this.retryAt = Math.max(now + backoff, this.rateLimitedUntil);
          this.config.onError(error);
        }
        throw error;
      }
      if (generation !== this.generation) return;
      this.baseRevision = result.farm.revision;
      this.retries = 0;
      this.retryAt = 0;
      this.config.onSuccess(result, actions);
    };

    // Keep the lock until the response has been reconciled, even if the session changes.
    this.inFlight = Promise.resolve().then(send).finally(() => {
      this.inFlight = undefined;
      if (!this.queue.length) {
        this.baseRevision = undefined;
        this.queueStartedAt = undefined;
      }
      this.schedule();
    });
    return this.inFlight;
  }

  flushAndWait(): Promise<void> {
    if (this.drain) return this.drain;
    const drain = async () => {
      while (this.inFlight || this.queue.length) {
        if (!this.inFlight && Date.now() < this.retryAt) {
          throw new Error('Chưa lưu được thao tác. Hãy thử lại sau ít giây.');
        }
        await this.sendNext();
      }
    };
    this.drain = drain().finally(() => {
      this.drain = undefined;
      this.schedule();
    });
    return this.drain;
  }

  reset(): void {
    clearTimeout(this.timer);
    this.generation++;
    this.queue = [];
    this.baseRevision = undefined;
    this.queueStartedAt = undefined;
    this.retries = 0;
    this.retryAt = this.rateLimitedUntil;
  }
}
