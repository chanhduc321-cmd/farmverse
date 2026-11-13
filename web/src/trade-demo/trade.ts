import type {
  TradeDemoActionRequest,
  TradeDemoActionResponse,
  TradeDemoClient,
  TradeDemoOrderResponse,
  TradeDemoSnapshot,
} from '../../../shared/trade-demo.mts';
import {
  formatDateTime,
  formatPaymentAmount,
  getOrderStatusText,
  getUnavailableReasonText,
  truncateAccountId,
} from './helpers.ts';
import './trade-demo.css';

export interface MountTradeDemoOptions {
  client?: TradeDemoClient;
  onSnapshot?: (snapshot: TradeDemoSnapshot) => void;
  onRedirect?: (url: string) => void;
  pollIntervalMs?: number;
}

export interface TradeDemoHandle {
  refresh(): Promise<void>;
  reset(): void;
}

export function createDefaultTradeDemoClient(baseUrl = '/api'): TradeDemoClient {
  return {
    async read(): Promise<TradeDemoSnapshot> {
      const res = await fetch(`${baseUrl}/trade-demo`, {
        method: 'GET',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const message = err?.error?.message || `Lỗi tải trạng thái giao dịch (${res.status})`;
        const error = new Error(message) as Error & { code?: string; status?: number };
        error.code = err?.error?.code;
        error.status = res.status;
        throw error;
      }
      return res.json();
    },

    async accept(request: TradeDemoActionRequest): Promise<TradeDemoActionResponse> {
      const res = await fetch(`${baseUrl}/trade-demo/accept`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(request),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const message = err?.error?.message || `Lỗi chấp nhận giao dịch (${res.status})`;
        const error = new Error(message) as Error & { code?: string; status?: number; orderId?: string };
        error.code = err?.error?.code;
        error.status = res.status;
        error.orderId = err?.error?.orderId;
        throw error;
      }
      return res.json();
    },

    async skip(request: TradeDemoActionRequest): Promise<TradeDemoActionResponse> {
      const res = await fetch(`${baseUrl}/trade-demo/skip`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(request),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const message = err?.error?.message || `Lỗi bỏ qua lời mời (${res.status})`;
        const error = new Error(message) as Error & { code?: string; status?: number };
        error.code = err?.error?.code;
        error.status = res.status;
        throw error;
      }
      return res.json();
    },

    async readOrder(orderId: string): Promise<TradeDemoOrderResponse> {
      const res = await fetch(`${baseUrl}/trade-demo/orders/${encodeURIComponent(orderId)}`, {
        method: 'GET',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const message = err?.error?.message || `Lỗi kiểm tra trạng thái đơn (${res.status})`;
        const error = new Error(message) as Error & { code?: string; status?: number; orderId?: string };
        error.code = err?.error?.code;
        error.status = res.status;
        error.orderId = err?.error?.orderId ?? orderId;
        throw error;
      }
      return res.json();
    },
  };
}

function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return '30000000-0000-4000-8000-' + Math.random().toString(16).slice(2, 14).padStart(12, '0');
}

export function mountTradeDemo(
  container: HTMLElement,
  options?: MountTradeDemoOptions
): TradeDemoHandle {
  const client: TradeDemoClient = options?.client ?? createDefaultTradeDemoClient();
  const pollIntervalMs = options?.pollIntervalMs ?? 2500;

  const root = document.createElement('div');
  root.className = 'trade-demo-container';
  container.appendChild(root);

  let sessionToken = 0;
  let activeAbortController: AbortController | null = null;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let currentSnapshot: TradeDemoSnapshot | null = null;
  let inFlightAction = false;
  let lastActionRequestId: string | null = null;
  let lastActionType: 'accept' | 'skip' | null = null;

  function clearPollTimer(): void {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  }

  function scheduleNextPoll(action: () => Promise<void>, delayMs: number = pollIntervalMs): void {
    clearPollTimer();
    if (document.hidden) return; // Tab is inactive, pause polling

    pollTimer = setTimeout(() => {
      void action();
    }, delayMs);
  }

  function handleVisibilityChange(): void {
    if (document.hidden) {
      clearPollTimer();
    } else {
      // Tab became visible again; immediately refresh server state
      void refresh();
    }
  }

  document.addEventListener('visibilitychange', handleVisibilityChange);

  function renderLoading(message = 'Đang tải dữ liệu giao dịch...'): void {
    root.innerHTML = `
      <div class="trade-card">
        <div class="trade-state-box trade-state-loading" role="status">
          <span class="trade-spinner" aria-hidden="true"></span>
          <span>${message}</span>
        </div>
      </div>
    `;
  }

  function renderError(message: string, allowRetry = true): void {
    root.innerHTML = `
      <div class="trade-card">
        <div class="trade-state-box trade-state-error" role="alert">
          <span class="trade-state-icon" aria-hidden="true">⚠️</span>
          <div class="trade-error-content">
            <span class="trade-error-message">${message}</span>
            ${allowRetry ? '<button type="button" class="trade-btn trade-btn-primary trade-btn-retry">Thử lại</button>' : ''}
          </div>
        </div>
      </div>
    `;

    if (allowRetry) {
      const retryBtn = root.querySelector<HTMLButtonElement>('.trade-btn-retry');
      retryBtn?.addEventListener('click', () => {
        void refresh();
      });
    }
  }

  async function executeAction(actionType: 'accept' | 'skip', isRetry = false): Promise<void> {
    if (!currentSnapshot || inFlightAction) return;

    const offer = currentSnapshot.offer;
    if (!offer) return;

    if (actionType === 'accept' && !offer.canAccept) return;

    inFlightAction = true;
    const currentToken = sessionToken;

    // Reuse last requestId if retrying same action, otherwise generate new UUID v4
    if (!isRetry || !lastActionRequestId || lastActionType !== actionType) {
      lastActionRequestId = generateRequestId();
      lastActionType = actionType;
    }
    const requestId = lastActionRequestId;

    // Update button states to show progress
    const acceptBtn = root.querySelector<HTMLButtonElement>('.trade-btn-accept');
    const skipBtn = root.querySelector<HTMLButtonElement>('.trade-btn-skip');
    if (acceptBtn) acceptBtn.disabled = true;
    if (skipBtn) skipBtn.disabled = true;

    const targetBtn = actionType === 'accept' ? acceptBtn : skipBtn;
    if (targetBtn) {
      targetBtn.innerHTML = `<span class="trade-spinner-sm" aria-hidden="true"></span> Đang gửi...`;
    }

    try {
      const request: TradeDemoActionRequest = {
        runId: currentSnapshot.runId,
        offerId: offer.id,
        requestId,
        expectedRevision: currentSnapshot.revision,
      };

      const response = actionType === 'accept' ? await client.accept(request) : await client.skip(request);

      if (currentToken !== sessionToken) return;

      inFlightAction = false;
      currentSnapshot = response.snapshot;
      options?.onSnapshot?.(currentSnapshot);

      // Handle redirect if returned by backend
      const redirectUrl = response.order?.payment?.requiredAction?.url;
      if (redirectUrl) {
        if (options?.onRedirect) {
          options.onRedirect(redirectUrl);
        } else {
          try {
            window.location.assign(redirectUrl);
          } catch {
            // In restricted test environments, fallback safely
          }
        }
      }

      renderSnapshot(currentSnapshot);
      managePolling(currentSnapshot);
    } catch (err: unknown) {
      if (currentToken !== sessionToken) return;
      inFlightAction = false;

      const error = err as Error & { code?: string; orderId?: string };
      const errorMessage = error.message || 'Thao tác không thành công. Vui lòng thử lại.';

      // Render inline error notice or error card
      const noticeArea = root.querySelector<HTMLElement>('.trade-action-notice');
      if (noticeArea) {
        noticeArea.innerHTML = `
          <div class="trade-alert trade-alert-error" role="alert">
            <span>${errorMessage}</span>
            <button type="button" class="trade-btn trade-btn-sm trade-btn-retry-action">Thử lại</button>
          </div>
        `;
        const retryBtn = noticeArea.querySelector<HTMLButtonElement>('.trade-btn-retry-action');
        retryBtn?.addEventListener('click', () => {
          void executeAction(actionType, true);
        });
      } else {
        renderError(errorMessage, true);
      }

      if (acceptBtn) acceptBtn.disabled = !offer.canAccept;
      if (skipBtn) skipBtn.disabled = false;
      if (targetBtn) {
        targetBtn.textContent = actionType === 'accept' ? (currentSnapshot.role === 'seller' ? 'Đổi' : 'Mua') : 'Bỏ qua';
      }
    }
  }

  function renderSnapshot(snapshot: TradeDemoSnapshot): void {
    const isSeller = snapshot.role === 'seller';
    const roleLabel = isSeller ? 'Farmer A · Bán cho NPC' : 'Farmer B · Mua từ NPC';
    const walletBalanceText = snapshot.wallet.balance ? formatPaymentAmount(snapshot.wallet.balance) : 'Đang khởi tạo...';
    const walletAccountText = truncateAccountId(snapshot.wallet.identity.accountId);

    // Basket state
    const basketFilled = snapshot.basket.filled;
    const basketTotal = snapshot.basket.required;
    const isBasketComplete = basketFilled >= basketTotal;

    // Check if buyer is waiting for NPC stock
    const isBuyerWaitingForStock = !isSeller && snapshot.offer === null && !isBasketComplete && snapshot.activeOrder === null;

    let offerSectionHtml = '';
    if (snapshot.offer) {
      const offer = snapshot.offer;
      const canAccept = offer.canAccept;
      const amountFormatted = formatPaymentAmount(offer.amount);
      const actionButtonLabel = isSeller ? 'Đổi' : 'Mua';
      const promptText = isSeller
        ? 'Đổi 1 Dâu tây lấy 1 USDC?'
        : 'Mâm quả thiếu 1 Dâu tây. Dùng 1,5 USDC để hoàn thiện và nhận badge?';

      offerSectionHtml = `
        <div class="trade-offer-box">
          <div class="trade-item-preview">
            <img src="/crops/crop1/produce.png" alt="Dâu tây" class="trade-crop-img" onerror="this.style.display='none'" />
            <div class="trade-crop-info">
              <span class="trade-crop-name font-bold">1 Dâu tây</span>
              <span class="trade-crop-price font-mono font-bold">${amountFormatted}</span>
            </div>
          </div>
          <p class="trade-offer-prompt">${promptText}</p>
          ${
            !canAccept
              ? `<div class="trade-alert trade-alert-warning" role="alert">
                  <span class="trade-alert-icon" aria-hidden="true">ℹ️</span>
                  <span>${getUnavailableReasonText(offer.unavailableReason)}</span>
                </div>`
              : ''
          }
          <div class="trade-actions-row">
            <button
              type="button"
              class="trade-btn trade-btn-primary trade-btn-accept"
              ${!canAccept || inFlightAction ? 'disabled' : ''}
              aria-label="${actionButtonLabel} 1 Dâu tây với giá ${amountFormatted}"
            >
              ${actionButtonLabel}
            </button>
            <button
              type="button"
              class="trade-btn trade-btn-secondary trade-btn-skip"
              ${inFlightAction ? 'disabled' : ''}
              aria-label="Bỏ qua lời mời"
            >
              Bỏ qua
            </button>
          </div>
          <div class="trade-action-notice"></div>
        </div>
      `;
    } else if (isBuyerWaitingForStock) {
      offerSectionHtml = `
        <div class="trade-waiting-box" role="status">
          <div class="trade-basket-view">
            <div class="trade-basket-slots" aria-label="Mâm quả ${basketFilled} trên ${basketTotal}">
              <div class="trade-slot trade-slot-filled" title="Trái cây 1">🍉</div>
              <div class="trade-slot trade-slot-filled" title="Trái cây 2">🥭</div>
              <div class="trade-slot trade-slot-empty trade-slot-pulse" title="Đang thiếu Dâu tây">🍓</div>
            </div>
            <div class="trade-basket-status">
              <span class="trade-basket-progress font-bold">Mâm quả ${basketFilled}/${basketTotal}</span>
              <span class="trade-waiting-text">Đang chờ NPC có quả...</span>
            </div>
          </div>
          <div class="trade-waiting-indicator">
            <span class="trade-spinner-sm" aria-hidden="true"></span>
            <span>Tự động kiểm tra nguồn hàng từ NPC...</span>
          </div>
        </div>
      `;
    } else if (snapshot.offerDismissed && !snapshot.activeOrder) {
      offerSectionHtml = `
        <div class="trade-dismissed-box" role="status">
          <span class="trade-dismissed-icon" aria-hidden="true">✓</span>
          <span class="trade-dismissed-text">Đã bỏ qua lời mời giao dịch.</span>
          <button type="button" class="trade-btn trade-btn-sm trade-btn-refresh-offer">Làm mới</button>
        </div>
      `;
    }

    // Active order section
    let orderSectionHtml = '';
    const activeOrder = snapshot.activeOrder;
    if (activeOrder) {
      const orderStatus = activeOrder.status;
      const isFailed = orderStatus === 'failed';
      const isProcessing = orderStatus === 'processing' || orderStatus === 'verifying' || orderStatus === 'awaiting_approval';
      const isPaymentConfirmed = activeOrder.payment?.status === 'confirmed';

      let statusDescription = getOrderStatusText(orderStatus);
      if (isProcessing && isPaymentConfirmed) {
        statusDescription = 'Thanh toán đã xác nhận trên blockchain. Đang chờ hệ thống áp dụng vật phẩm...';
      }

      orderSectionHtml = `
        <div class="trade-order-card trade-order-${orderStatus}">
          <div class="trade-order-header">
            <span class="trade-order-badge badge-${orderStatus}">${getOrderStatusText(orderStatus)}</span>
            <span class="trade-order-id font-mono">Đơn #${truncateAccountId(activeOrder.id, 4)}</span>
          </div>
          <p class="trade-order-desc">${statusDescription}</p>
          ${
            isFailed && activeOrder.error
              ? `<div class="trade-alert trade-alert-error" role="alert">
                  <span>${activeOrder.error.message}</span>
                </div>`
              : ''
          }
          ${
            activeOrder.payment?.explorerUrl
              ? `<a href="${activeOrder.payment.explorerUrl}" target="_blank" rel="noopener noreferrer" class="trade-explorer-link">
                  Xem giao dịch trên Blockchain Explorer ↗
                </a>`
              : ''
          }
          ${
            isProcessing
              ? `<div class="trade-polling-status">
                  <span class="trade-spinner-sm" aria-hidden="true"></span>
                  <span>Đang đồng bộ trạng thái đơn...</span>
                </div>`
              : ''
          }
        </div>
      `;
    }

    // Badge section when completed
    let badgeSectionHtml = '';
    if (isBasketComplete && snapshot.basket.badge) {
      const badge = snapshot.basket.badge;
      badgeSectionHtml = `
        <div class="trade-badge-celebration" role="region" aria-label="Huy hiệu mùa vụ">
          <div class="trade-badge-glow"></div>
          <div class="trade-badge-icon-box">
            <img src="/icon/streak-coin.png" alt="Huy hiệu" class="trade-badge-icon" onerror="this.innerHTML='🏅'" />
          </div>
          <div class="trade-badge-details">
            <span class="trade-badge-tag">MÂM QUẢ HOÀN TẤT</span>
            <h4 class="trade-badge-name">${badge.name}</h4>
            <p class="trade-badge-awarded">Nhận vào: ${formatDateTime(badge.awardedAt)}</p>
          </div>
        </div>
      `;
    }

    root.innerHTML = `
      <div class="trade-card">
        <header class="trade-header">
          <div class="trade-header-title-row">
            <div class="trade-header-title">
              <span class="trade-logo" aria-hidden="true">🍓</span>
              <h3 class="trade-title">Giao dịch USDC Testnet</h3>
            </div>
            <span class="trade-role-chip">${roleLabel}</span>
          </div>
          <div class="trade-wallet-chip" aria-label="Thông tin ví người chơi">
            <div class="trade-wallet-indicator ${snapshot.wallet.status === 'ready' ? 'is-ready' : 'is-warning'}"></div>
            <span class="trade-wallet-account font-mono">${walletAccountText}</span>
            <span class="trade-wallet-divider">|</span>
            <span class="trade-wallet-balance font-bold font-mono">${walletBalanceText}</span>
          </div>
        </header>

        <div class="trade-body">
          ${offerSectionHtml}
          ${orderSectionHtml}
          ${badgeSectionHtml}
        </div>
      </div>
    `;

    // Bind event listeners
    const acceptBtn = root.querySelector<HTMLButtonElement>('.trade-btn-accept');
    acceptBtn?.addEventListener('click', () => {
      void executeAction('accept');
    });

    const skipBtn = root.querySelector<HTMLButtonElement>('.trade-btn-skip');
    skipBtn?.addEventListener('click', () => {
      void executeAction('skip');
    });

    const refreshOfferBtn = root.querySelector<HTMLButtonElement>('.trade-btn-refresh-offer');
    refreshOfferBtn?.addEventListener('click', () => {
      void refresh();
    });
  }

  function managePolling(snapshot: TradeDemoSnapshot): void {
    clearPollTimer();

    const activeOrder = snapshot.activeOrder;
    const isOrderInProgress = activeOrder && (
      activeOrder.status === 'awaiting_approval' ||
      activeOrder.status === 'processing' ||
      activeOrder.status === 'verifying'
    );

    const isBuyerWaitingForStock = snapshot.role === 'buyer' && !snapshot.offer && snapshot.basket.filled < 3 && snapshot.stage !== 'completed';

    if (isOrderInProgress && activeOrder) {
      scheduleNextPoll(async () => {
        try {
          const orderResponse = await client.readOrder(activeOrder.id);
          currentSnapshot = orderResponse.snapshot;
          options?.onSnapshot?.(currentSnapshot);
          renderSnapshot(currentSnapshot);
          managePolling(currentSnapshot);
        } catch {
          // If polling fails or 503, retry next cycle
          scheduleNextPoll(() => refresh(), pollIntervalMs);
        }
      }, pollIntervalMs);
    } else if (isBuyerWaitingForStock) {
      scheduleNextPoll(async () => {
        try {
          const freshSnapshot = await client.read();
          currentSnapshot = freshSnapshot;
          options?.onSnapshot?.(currentSnapshot);
          renderSnapshot(currentSnapshot);
          managePolling(currentSnapshot);
        } catch {
          scheduleNextPoll(() => refresh(), 3000);
        }
      }, 3000);
    }
  }

  async function refresh(): Promise<void> {
    sessionToken++;
    const currentToken = sessionToken;

    if (activeAbortController) {
      activeAbortController.abort();
    }
    activeAbortController = new AbortController();

    try {
      renderLoading();
      const snapshot = await client.read();
      if (currentToken !== sessionToken) return;

      currentSnapshot = snapshot;
      options?.onSnapshot?.(snapshot);
      renderSnapshot(snapshot);
      managePolling(snapshot);
    } catch (err: unknown) {
      if (currentToken !== sessionToken) return;
      const error = err as Error & { status?: number };
      if (error.status === 401) {
        renderError('Vui lòng đăng nhập vào FarmVerse để tiếp tục giao dịch.', false);
      } else {
        renderError(error.message || 'Không thể tải dữ liệu giao dịch.', true);
      }
    }
  }

  function reset(): void {
    sessionToken++;
    clearPollTimer();

    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }

    document.removeEventListener('visibilitychange', handleVisibilityChange);

    currentSnapshot = null;
    inFlightAction = false;
    lastActionRequestId = null;
    lastActionType = null;
    root.innerHTML = '';
  }

  // Initial fetch
  void refresh();

  return {
    refresh,
    reset,
  };
}
