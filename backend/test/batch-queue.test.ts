import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FarmBatchMutation, FarmResponse } from '../../shared/farm.mts';
import { BatchQueueManager, FarmRateLimitError } from '../../web/src/batch-queue.ts';

function mockFarm(revision = 0): FarmResponse {
  return {
    farm: {
      revision,
      gold: 200,
      xp: 0,
      level: 1,
      theme: 1,
      seeds: {},
      produce: {},
      plots: [null, null, null, null, null, null],
      pet: 'dog',
    },
    serverTime: Date.now(),
  };
}

test('batch-size limit: flushes immediately when queue reaches 20 actions', async () => {
  const sentBatches: FarmBatchMutation[] = [];
  let currentRevision = 10;

  const queue = new BatchQueueManager({
    debounceMs: 300,
    maxWaitMs: 800,
    maxBatchSize: 20,
    getExpectedRevision: () => currentRevision,
    sendBatch: async (batch) => {
      sentBatches.push(batch);
      currentRevision += batch.actions.length;
      return mockFarm(currentRevision);
    },
    onSuccess: () => {},
    onError: () => {},
    onConflict: async () => {},
  });

  // Enqueue 19 actions rapidly
  for (let i = 0; i < 19; i++) {
    queue.enqueue({ type: 'plant', plot: 0, cropId: 1 });
  }

  // Not sent yet (waiting for 300ms debounce)
  assert.equal(sentBatches.length, 0);
  assert.equal(queue.length, 19);

  // 20th action enqueued -> triggers immediate flush!
  queue.enqueue({ type: 'plant', plot: 1, cropId: 1 });

  // Wait for the synchronous microtask / batch execution
  await new Promise(resolve => setTimeout(resolve, 10));

  assert.equal(sentBatches.length, 1);
  assert.equal(sentBatches[0].actions.length, 20);
  assert.equal(sentBatches[0].expectedRevision, 10);
  assert.equal(queue.length, 0);
});

test('trailing debounce: resets timer on rapid clicks and flushes after 300ms inactivity', async () => {
  const sentBatches: FarmBatchMutation[] = [];
  let currentRevision = 5;

  const queue = new BatchQueueManager({
    debounceMs: 300,
    maxWaitMs: 800,
    maxBatchSize: 20,
    getExpectedRevision: () => currentRevision,
    sendBatch: async (batch) => {
      sentBatches.push(batch);
      currentRevision += batch.actions.length;
      return mockFarm(currentRevision);
    },
    onSuccess: () => {},
    onError: () => {},
    onConflict: async () => {},
  });

  // Click 1 at t=0
  queue.enqueue({ type: 'water', plot: 0 });

  // Click 2 at t=100ms (within 300ms debounce)
  await new Promise(r => setTimeout(r, 100));
  queue.enqueue({ type: 'water', plot: 1 });
  assert.equal(sentBatches.length, 0);

  // Click 3 at t=200ms (within 300ms debounce)
  await new Promise(r => setTimeout(r, 100));
  queue.enqueue({ type: 'water', plot: 2 });
  assert.equal(sentBatches.length, 0);

  // Player stops clicking. Wait for trailing debounce (350ms)
  await new Promise(r => setTimeout(r, 350));

  assert.equal(sentBatches.length, 1);
  assert.equal(sentBatches[0].actions.length, 3);
  assert.equal(sentBatches[0].expectedRevision, 5);
});

test('hard maxWait: continuous clicking forces flush at 800ms from first action', async () => {
  const sentBatches: FarmBatchMutation[] = [];
  let currentRevision = 0;

  const queue = new BatchQueueManager({
    debounceMs: 300,
    maxWaitMs: 800,
    maxBatchSize: 20,
    getExpectedRevision: () => currentRevision,
    sendBatch: async (batch) => {
      sentBatches.push(batch);
      currentRevision += batch.actions.length;
      return mockFarm(currentRevision);
    },
    onSuccess: () => {},
    onError: () => {},
    onConflict: async () => {},
  });

  const startTime = Date.now();
  // Click every 150ms for 900ms (without debounce ever expiring on its own)
  let count = 0;
  while (Date.now() - startTime < 950) {
    queue.enqueue({ type: 'water', plot: count % 6 });
    count++;
    await new Promise(r => setTimeout(r, 150));
  }

  // Because maxWait is 800ms, at least 1 batch MUST have flushed despite continuous clicking!
  assert.ok(sentBatches.length >= 1, `Expected at least 1 batch flushed under maxWait, got ${sentBatches.length}`);
  // Flush remaining
  await queue.flushAndWait();
});

test('single in-flight constraint: queues new actions while a batch is in-flight and preserves revision sequence', async () => {
  const sentBatches: FarmBatchMutation[] = [];
  let currentRevision = 100;
  let resolveInFlight: ((res: FarmResponse) => void) | undefined;

  const queue = new BatchQueueManager({
    debounceMs: 300,
    maxWaitMs: 800,
    maxBatchSize: 20,
    getExpectedRevision: () => currentRevision,
    sendBatch: (batch) => {
      sentBatches.push(batch);
      if (sentBatches.length === 1) {
        return new Promise<FarmResponse>((resolve) => {
          resolveInFlight = (resp) => {
            currentRevision = resp.farm.revision;
            resolve(resp);
          };
        });
      }
      currentRevision += batch.actions.length;
      return Promise.resolve(mockFarm(currentRevision));
    },
    onSuccess: () => {},
    onError: () => {},
    onConflict: async () => {},
  });

  // Action 1
  queue.enqueue({ type: 'plant', plot: 0, cropId: 1 });
  // Trigger flush
  void queue.flush();

  await Promise.resolve();
  assert.equal(sentBatches.length, 1);
  assert.equal(sentBatches[0].expectedRevision, 100);

  // While batch 1 is in-flight, enqueue actions 2 and 3
  queue.enqueue({ type: 'water', plot: 0 });
  queue.enqueue({ type: 'fertilize', plot: 0 });

  // Batch 2 must NOT be sent yet because only one batch can be in flight!
  assert.equal(sentBatches.length, 1);
  assert.equal(queue.length, 2);

  // Now resolve batch 1 with new revision 101
  resolveInFlight!(mockFarm(101));
  await new Promise(r => setTimeout(r, 10));

  // In-flight batch 1 is finished. Flush remaining actions.
  await queue.flushAndWait();

  assert.equal(sentBatches.length, 2);
  assert.equal(sentBatches[1].expectedRevision, 101, 'Batch 2 must use the confirmed revision from batch 1');
  assert.equal(sentBatches[1].actions.length, 2);
});

test('harvest and inventory orders stay in sequence before a dependent request', async () => {
  const executionOrder: string[] = [];
  let currentRevision = 20;

  const queue = new BatchQueueManager({
    debounceMs: 300,
    maxWaitMs: 800,
    maxBatchSize: 20,
    getExpectedRevision: () => currentRevision,
    sendBatch: async (batch) => {
      executionOrder.push(`batch_flush_revision_${batch.expectedRevision}_count_${batch.actions.length}`);
      currentRevision += batch.actions.length;
      return mockFarm(currentRevision);
    },
    onSuccess: () => {},
    onError: () => {},
    onConflict: async () => {},
  });

  queue.enqueue({ type: 'harvest', plot: 0 });
  queue.enqueue({ type: 'sell', cropId: 1, quantity: 1 });
  queue.enqueue({ type: 'buy', cropId: 1, quantity: 1 });

  await queue.flushAndWait();
  executionOrder.push(`claim_mission_revision_${currentRevision}`);

  assert.deepEqual(executionOrder, [
    'batch_flush_revision_20_count_3',
    'claim_mission_revision_23',
  ]);
});

test('429 honors Retry-After even when the player keeps clicking or reconnects', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 10_000 });
  const batches: FarmBatchMutation[] = [];
  const queue = new BatchQueueManager({
    getExpectedRevision: () => 4,
    sendBatch: async batch => {
      batches.push(batch);
      if (batches.length === 1) throw new FarmRateLimitError('3');
      return mockFarm(4 + batch.actions.length);
    },
    onSuccess: () => {},
    onError: () => {},
    onConflict: async () => assert.fail('Rate limiting must preserve pending orders'),
  });

  queue.enqueue({ type: 'buy', cropId: 1, quantity: 2 });
  await assert.rejects(queue.flushAndWait(), { cause: 429 });
  queue.enqueue({ type: 'buyFertilizer', quantity: 1 });
  queue.enqueue({ type: 'sell', cropId: 1, quantity: 3 });
  queue.retry();
  queue.flush();
  await assert.rejects(queue.flushAndWait(), /thử lại sau ít giây/);
  t.mock.timers.tick(2_999);
  assert.equal(batches.length, 1);

  t.mock.timers.tick(1);
  await queue.flushAndWait();
  assert.equal(batches.length, 2);
  assert.deepEqual(batches[1], {
    expectedRevision: 4,
    actions: [
      { type: 'buy', cropId: 1, quantity: 2 },
      { type: 'buyFertilizer', quantity: 1 },
      { type: 'sell', cropId: 1, quantity: 3 },
    ],
  });
});

test('failed batch retry & conflict reconciliation', async () => {
  let attempts = 0;
  let conflictHandled = false;

  const queue = new BatchQueueManager({
    debounceMs: 300,
    maxWaitMs: 800,
    maxBatchSize: 20,
    getExpectedRevision: () => 50,
    sendBatch: async (batch) => {
      attempts++;
      if (attempts === 1) {
        // Transient network error
        throw new Error('Network error (offline)');
      }
      if (attempts === 2) {
        // 409 Conflict
        throw new Error('Nông trại vừa thay đổi.', { cause: 409 });
      }
      return mockFarm(51);
    },
    onSuccess: () => {},
    onError: () => {},
    onConflict: async () => {
      conflictHandled = true;
    },
  });

  queue.enqueue({ type: 'clear', plot: 0 });

  // First flush fails with network error
  await assert.rejects(queue.flushAndWait(), /Network error/);
  assert.equal(attempts, 1);
  // Action was preserved in queue!
  assert.equal(queue.length, 1);

  await assert.rejects(queue.flushAndWait(), /thử lại sau ít giây/);
  assert.equal(attempts, 1);

  // Second flush fails with 409 conflict
  queue.retry();
  await assert.rejects(queue.flushAndWait(), /Nông trại vừa thay đổi/);
  assert.equal(attempts, 2);
  assert.equal(conflictHandled, true);
  // Queue was cleared after conflict to prevent stale retry loop
  assert.equal(queue.length, 0);
});

test('rapid clicking comparison: 20 rapid plant clicks count', async () => {
  let batchRequestsCount = 0;
  const queue = new BatchQueueManager({
    debounceMs: 300,
    maxWaitMs: 800,
    maxBatchSize: 20,
    getExpectedRevision: () => 0,
    sendBatch: async () => {
      batchRequestsCount++;
      return mockFarm(batchRequestsCount * 20);
    },
    onSuccess: () => {},
    onError: () => {},
    onConflict: async () => {},
  });

  // Enqueue 20 rapid plant actions
  for (let i = 0; i < 20; i++) {
    queue.enqueue({ type: 'plant', plot: i % 6, cropId: 1 });
  }

  await new Promise(r => setTimeout(r, 10));

  // The 20 rapid actions trigger exactly 1 batch request!
  assert.equal(batchRequestsCount, 1, '20 rapid clicks must be aggregated into exactly 1 batch request');
});
