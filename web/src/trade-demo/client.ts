import { TRADE_DEMO_API } from '../../../shared/trade-demo.mts';
import type {
  TradeDemoActionResponse, TradeDemoClient, TradeDemoErrorResponse, TradeDemoOrderResponse,
  TradeDemoSnapshot, TradeDemoVisitResponse,
} from '../../../shared/trade-demo.mts';

export class TradeRequestError extends Error {
  constructor(readonly status: number, readonly detail?: TradeDemoErrorResponse['error']) {
    super(detail?.message ?? 'Chưa kết nối được với quầy. Hãy thử lại.');
  }
}

export function createDefaultTradeDemoClient(baseUrl = '/api'): TradeDemoClient & {
  visit(signal?: AbortSignal): Promise<TradeDemoVisitResponse>;
} {
  async function request<T>(route: { method: string; path: string }, signal?: AbortSignal, body?: unknown): Promise<T> {
    const response = await fetch(baseUrl + route.path, {
      method: route.method, credentials: 'same-origin', signal,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const payload: TradeDemoErrorResponse | undefined = await response.json().catch(() => undefined);
      throw new TradeRequestError(response.status, payload?.error);
    }
    return response.json();
  }

  return {
    read: signal => request<TradeDemoSnapshot>(TRADE_DEMO_API.read, signal),
    visit: signal => request<TradeDemoVisitResponse>(TRADE_DEMO_API.visit, signal),
    accept: (body, signal) => request<TradeDemoActionResponse>(TRADE_DEMO_API.accept, signal, body),
    skip: (body, signal) => request<TradeDemoActionResponse>(TRADE_DEMO_API.skip, signal, body),
    readOrder: (orderId, signal) => request<TradeDemoOrderResponse>({
      ...TRADE_DEMO_API.order, path: TRADE_DEMO_API.order.path.replace(':orderId', encodeURIComponent(orderId)),
    }, signal),
  };
}
