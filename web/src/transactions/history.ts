import './history.css';
import { BLOCKCHAIN_API } from '../../../shared/blockchain.mts';
import type { BlockchainHistoryResponse, BlockchainTransaction, BlockchainTransactionStatus } from '../../../shared/blockchain.mts';

export interface TransactionHistoryHandle {
  refresh(): Promise<void>;
  reset(): void;
}

export interface MountTransactionHistoryOptions {
  mockResponse?: BlockchainHistoryResponse | null;
  fetcher?: typeof fetch;
}

export const OPERATION_LABELS: Record<string, string> = {
  account_activation: 'Khởi tạo ví',
  signature: 'Xác nhận ký',
  transfer: 'Chuyển tiền thử',
};

export const STATUS_LABELS: Record<BlockchainTransactionStatus, string> = {
  awaiting_signature: 'Chờ xác nhận',
  signing: 'Đang ký',
  prepared: 'Đã chuẩn bị',
  submitted: 'Chờ mạng xác nhận',
  confirmed: 'Thành công',
  failed: 'Thất bại',
  cancelled: 'Đã hủy',
  expired: 'Hết hạn',
};

export function getOperationLabel(op: string): string {
  return Object.hasOwn(OPERATION_LABELS, op) ? OPERATION_LABELS[op] : 'Giao dịch blockchain';
}

export function getStatusLabel(status: BlockchainTransactionStatus): string {
  return STATUS_LABELS[status] || status;
}

export function getStatusCategory(status: BlockchainTransactionStatus): 'confirmed' | 'pending' | 'failed' {
  switch (status) {
    case 'confirmed':
      return 'confirmed';
    case 'failed':
    case 'cancelled':
    case 'expired':
      return 'failed';
    default:
      return 'pending';
  }
}

export function formatAtomicAmount(atomic: string, decimals: number): string {
  if (!/^\d+$/.test(atomic) || !Number.isInteger(decimals) || decimals < 0 || decimals > 255) return '—';
  const digits = atomic.replace(/^0+(?=\d)/, '');
  if (decimals === 0) return digits;
  const padded = digits.padStart(decimals + 1, '0');
  const integer = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, '');
  return fraction ? `${integer}.${fraction}` : integer;
}

export function formatDateTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour12: false,
    }).format(date);
  } catch {
    return isoString;
  }
}

function isValidHttpsUrl(url: string | null): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function truncateMiddle(str: string, keep = 6): string {
  if (!str || str.length <= keep * 2 + 3) return str;
  return `${str.slice(0, keep)}...${str.slice(-keep)}`;
}

let nextPanelId = 0;

export function mountTransactionHistory(
  container: HTMLElement,
  options?: MountTransactionHistoryOptions
): TransactionHistoryHandle {
  const root = document.createElement('div');
  root.className = 'tx-history-container';

  // Toggle button
  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'tx-history-toggle-btn';
  toggleBtn.setAttribute('aria-expanded', 'false');
  toggleBtn.innerHTML = `
    <span>Lịch sử giao dịch</span>
    <span class="tx-toggle-icon" aria-hidden="true">▼</span>
  `;

  // Panel
  const panel = document.createElement('div');
  panel.id = `transaction-history-${++nextPanelId}`;
  toggleBtn.setAttribute('aria-controls', panel.id);
  panel.className = 'tx-history-panel';
  panel.hidden = true;

  panel.innerHTML = `
    <div class="tx-history-header">
      <h4 class="tx-history-title">
        <span>Lịch sử giao dịch blockchain</span>
      </h4>
      <button type="button" class="tx-history-refresh-btn" title="Làm mới lịch sử">Làm mới</button>
    </div>
    <div class="tx-history-content"></div>
  `;

  root.appendChild(toggleBtn);
  root.appendChild(panel);
  container.appendChild(root);

  const refreshBtn = panel.querySelector<HTMLButtonElement>('.tx-history-refresh-btn')!;
  const contentArea = panel.querySelector<HTMLElement>('.tx-history-content')!;

  let isOpen = false;
  let activeAbortController: AbortController | null = null;
  let sessionToken = 0;

  function setOpen(open: boolean): void {
    isOpen = open;
    toggleBtn.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
  }

  function renderLoading(): void {
    contentArea.innerHTML = `
      <div class="tx-state-box tx-state-loading" role="status">
        <span class="tx-spinner" aria-hidden="true"></span>
        <span>Đang tải lịch sử giao dịch...</span>
      </div>
    `;
    refreshBtn.disabled = true;
  }

  function renderEmpty(): void {
    contentArea.innerHTML = `
      <div class="tx-state-box">
        <span>Chưa có giao dịch blockchain nào.</span>
      </div>
    `;
    refreshBtn.disabled = false;
  }

  function renderAuthRequired(): void {
    contentArea.innerHTML = `
      <div class="tx-state-box tx-state-error">
        <span>Vui lòng đăng nhập để xem lịch sử giao dịch.</span>
      </div>
    `;
    refreshBtn.disabled = false;
  }

  function renderError(message: string, allowRetry = true): void {
    contentArea.innerHTML = `
      <div class="tx-state-box tx-state-error" role="alert">
        <span>${message}</span>
        ${allowRetry ? '<button type="button" class="tx-retry-btn">Thử lại</button>' : ''}
      </div>
    `;
    refreshBtn.disabled = false;
    if (allowRetry) {
      const retryBtn = contentArea.querySelector<HTMLButtonElement>('.tx-retry-btn');
      retryBtn?.addEventListener('click', () => {
        void refresh();
      });
    }
  }

  function renderList(transactions: BlockchainTransaction[]): void {
    refreshBtn.disabled = false;
    if (transactions.length === 0) {
      renderEmpty();
      return;
    }

    const list = document.createElement('ul');
    list.className = 'tx-list';

    transactions.forEach(tx => {
      const item = document.createElement('li');
      item.className = 'tx-card';

      const opLabel = getOperationLabel(tx.operation);
      const statusLabel = getStatusLabel(tx.status);
      const statusCat = getStatusCategory(tx.status);
      const isTestnet = tx.network.toLowerCase().includes('testnet');
      const timeStr = formatDateTime(tx.createdAt);

      const decimals = tx.assetDecimals ?? (tx.asset === 'NEAR' ? 24 : undefined);
      const formattedAmount = decimals === undefined ? '—' : formatAtomicAmount(tx.amountAtomic, decimals);
      const isZeroAmount = formattedAmount === '0';
      const amountDisplay = isZeroAmount
        ? `0 ${tx.asset}`
        : `${formattedAmount} ${tx.asset}`;

      const feeFormatted = tx.feeAtomic !== null
        ? `${formatAtomicAmount(tx.feeAtomic, tx.feeDecimals ?? 24)} ${tx.feeAsset ?? 'NEAR'}`
        : '—';

      const hasValidExplorer = isValidHttpsUrl(tx.explorerUrl);

      item.innerHTML = `
        <div class="tx-card-header">
          <div class="tx-operation-wrap">
            <span class="tx-operation-name"></span>
            ${isTestnet ? '<span class="tx-badge tx-badge-net">Testnet</span>' : ''}
            <span class="tx-badge tx-badge-status-${statusCat}"></span>
          </div>
          <div class="tx-amount ${isZeroAmount ? 'is-zero' : ''}"></div>
        </div>

        <div class="tx-card-meta">
          <span class="tx-time"></span>
          <span class="tx-fee">Phí: <strong></strong></span>
        </div>

        <div class="tx-card-details">
          ${tx.senderAccountId ? `
            <div class="tx-detail-row">
              <span class="tx-detail-label">Ví gửi:</span>
              <span class="tx-detail-value" data-detail="senderAccountId"></span>
            </div>` : ''}
          ${tx.receiverAccountId ? `
            <div class="tx-detail-row">
              <span class="tx-detail-label">Ví nhận:</span>
              <span class="tx-detail-value" data-detail="receiverAccountId"></span>
            </div>` : ''}
          ${tx.sponsorAccountId && tx.sponsorAccountId !== tx.senderAccountId ? `
            <div class="tx-detail-row">
              <span class="tx-detail-label">Tài trợ gas:</span>
              <span class="tx-detail-value" data-detail="sponsorAccountId"></span>
            </div>` : ''}
          ${tx.transactionHash ? `
            <div class="tx-detail-row">
              <span class="tx-detail-label">Mã GD:</span>
              <span class="tx-detail-value" data-detail="transactionHash"></span>
            </div>` : ''}
          ${hasValidExplorer ? `
            <a target="_blank" rel="noopener noreferrer" class="tx-explorer-link">
              <span>Xem giao dịch</span>
              <span aria-hidden="true">↗</span>
            </a>` : ''}
        </div>
      `;

      item.querySelector('.tx-operation-name')!.textContent = opLabel;
      item.querySelector(`.tx-badge-status-${statusCat}`)!.textContent = statusLabel;
      item.querySelector('.tx-amount')!.textContent = amountDisplay;
      item.querySelector('.tx-time')!.textContent = timeStr;
      item.querySelector('.tx-fee strong')!.textContent = feeFormatted;
      for (const element of item.querySelectorAll<HTMLElement>('[data-detail]')) {
        const key = element.dataset.detail as 'senderAccountId' | 'receiverAccountId' | 'sponsorAccountId' | 'transactionHash';
        const value = tx[key]!;
        element.title = value;
        element.textContent = truncateMiddle(value, key === 'transactionHash' ? 8 : 10);
      }
      const explorer = item.querySelector<HTMLAnchorElement>('.tx-explorer-link');
      if (explorer) explorer.href = tx.explorerUrl!;

      list.appendChild(item);
    });

    contentArea.innerHTML = '';
    contentArea.appendChild(list);
  }

  async function refresh(): Promise<void> {
    const thisSession = ++sessionToken;

    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }

    renderLoading();

    // If a mock response is provided (for testing or fixtures)
    if (options?.mockResponse) {
      renderList(options.mockResponse.transactions);
      return;
    }

    const controller = new AbortController();
    activeAbortController = controller;

    const customFetcher = options?.fetcher ?? fetch;

    try {
      const url = `/api${BLOCKCHAIN_API.history.path}?limit=25`;
      const response = await customFetcher(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
      });

      if (thisSession !== sessionToken) return;

      if (response.status === 200) {
        const data = (await response.json()) as BlockchainHistoryResponse;
        if (thisSession !== sessionToken) return;
        renderList(Array.isArray(data.transactions) ? data.transactions : []);
      } else if (response.status === 401) {
        renderAuthRequired();
      } else if (response.status === 400) {
        renderError('Yêu cầu không hợp lệ. Vui lòng kiểm tra lại.', false);
      } else {
        renderError('Không thể tải lịch sử giao dịch. Vui lòng thử lại.', true);
      }
    } catch (err: unknown) {
      if (thisSession !== sessionToken) return;
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      renderError('Không thể tải lịch sử giao dịch. Vui lòng thử lại.', true);
    } finally {
      if (activeAbortController === controller) {
        activeAbortController = null;
      }
    }
  }

  function reset(): void {
    sessionToken++;
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
    setOpen(false);
    contentArea.innerHTML = '';
    refreshBtn.disabled = false;
  }

  toggleBtn.addEventListener('click', () => {
    const nextState = !isOpen;
    setOpen(nextState);
    if (nextState) {
      void refresh();
    }
  });

  refreshBtn.addEventListener('click', () => {
    void refresh();
  });

  return {
    refresh,
    reset,
  };
}
