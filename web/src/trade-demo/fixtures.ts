import { getTradeDemoFixture, TRADE_DEMO_FIXTURES, type TradeDemoFixtureName } from '../../../shared/fixtures/trade-demo.mts';
import type {
  TradeDemoActionRequest,
  TradeDemoActionResponse,
  TradeDemoClient,
  TradeDemoOrder,
  TradeDemoOrderResponse,
  TradeDemoSnapshot,
} from '../../../shared/trade-demo.mts';

export { TRADE_DEMO_FIXTURES };

export interface FixtureClientOptions {
  initialScenario?: TradeDemoFixtureName;
  /** Latency simulation in ms (0 for instant test execution) */
  simulatedDelayMs?: number;
}

export interface FixtureTradeDemoClient extends TradeDemoClient {
  getCurrentScenario(): TradeDemoFixtureName;
  setScenario(name: TradeDemoFixtureName): TradeDemoSnapshot;
  getSnapshot(): TradeDemoSnapshot;
}

export function createFixtureTradeDemoClient(options?: FixtureClientOptions): FixtureTradeDemoClient {
  let currentScenarioName: TradeDemoFixtureName = options?.initialScenario ?? 'sellerOffer';
  let currentSnapshot: TradeDemoSnapshot = getTradeDemoFixture(currentScenarioName);
  let activeOrder: TradeDemoOrder | null = currentSnapshot.activeOrder ? structuredClone(currentSnapshot.activeOrder) : null;
  const delay = options?.simulatedDelayMs ?? 0;

  const wait = () => new Promise<void>((resolve) => (delay > 0 ? setTimeout(resolve, delay) : resolve()));

  function setScenario(name: TradeDemoFixtureName): TradeDemoSnapshot {
    currentScenarioName = name;
    currentSnapshot = getTradeDemoFixture(name);
    activeOrder = currentSnapshot.activeOrder ? structuredClone(currentSnapshot.activeOrder) : null;
    return structuredClone(currentSnapshot);
  }

  return {
    getCurrentScenario(): TradeDemoFixtureName {
      return currentScenarioName;
    },

    setScenario,

    getSnapshot(): TradeDemoSnapshot {
      return structuredClone(currentSnapshot);
    },

    async read(): Promise<TradeDemoSnapshot> {
      await wait();
      return structuredClone(currentSnapshot);
    },

    async accept(_request: TradeDemoActionRequest): Promise<TradeDemoActionResponse> {
      await wait();

      if (currentSnapshot.offer && !currentSnapshot.offer.canAccept) {
        const error = new Error(`Giao dịch không hợp lệ: ${currentSnapshot.offer.unavailableReason}`) as Error & { code?: string };
        error.code = currentSnapshot.offer.unavailableReason;
        throw error;
      }

      if (currentScenarioName === 'sellerOffer') {
        currentScenarioName = 'sellerPaymentPending';
        currentSnapshot = getTradeDemoFixture('sellerPaymentPending');
        activeOrder = structuredClone(currentSnapshot.activeOrder);
      } else if (currentScenarioName === 'buyerOffer') {
        currentScenarioName = 'buyerPaymentPending';
        currentSnapshot = getTradeDemoFixture('buyerPaymentPending');
        activeOrder = structuredClone(currentSnapshot.activeOrder);
      }

      return {
        snapshot: structuredClone(currentSnapshot),
        order: activeOrder ? structuredClone(activeOrder) : null,
      };
    },

    async skip(_request: TradeDemoActionRequest): Promise<TradeDemoActionResponse> {
      await wait();

      if (currentSnapshot.role === 'seller') {
        currentScenarioName = 'sellerSkipped';
        currentSnapshot = getTradeDemoFixture('sellerSkipped');
      } else {
        currentScenarioName = 'buyerSkipped';
        currentSnapshot = getTradeDemoFixture('buyerSkipped');
      }
      activeOrder = null;

      return {
        snapshot: structuredClone(currentSnapshot),
        order: null,
      };
    },

    async readOrder(_orderId: string): Promise<TradeDemoOrderResponse> {
      await wait();

      // Automatically advance status on read if simulating completion
      if (currentScenarioName === 'sellerPaymentPending') {
        currentScenarioName = 'sellerPaid';
        currentSnapshot = getTradeDemoFixture('sellerPaid');
        activeOrder = structuredClone(currentSnapshot.activeOrder);
      } else if (currentScenarioName === 'buyerPaymentPending' || currentScenarioName === 'buyerAwaitingApproval') {
        currentScenarioName = 'buyerCompleted';
        currentSnapshot = getTradeDemoFixture('buyerCompleted');
        activeOrder = structuredClone(currentSnapshot.activeOrder);
      }

      if (!activeOrder) {
        const error = new Error('Lệnh không tồn tại') as Error & { code?: string };
        error.code = 'ORDER_NOT_FOUND';
        throw error;
      }

      return {
        order: structuredClone(activeOrder),
        snapshot: structuredClone(currentSnapshot),
      };
    },
  };
}
