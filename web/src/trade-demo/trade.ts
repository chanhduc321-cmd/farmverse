import type { TradeDemoActionRequest, TradeDemoClient, TradeDemoSnapshot } from '../../../shared/trade-demo.mts';
import { tradeArt } from './assets.ts';
import { createDefaultTradeDemoClient, TradeRequestError } from './client.ts';
import { formatPaymentAmount, getOrderStatusText, getUnavailableReasonText } from './helpers.ts';
import { mountTradeDemoPnl } from './pnl.ts';
import './trade-demo.css';

export { createDefaultTradeDemoClient } from './client.ts';

export interface MountTradeDemoOptions {
  client?: TradeDemoClient;
  onSnapshot?: (snapshot: TradeDemoSnapshot) => void;
  onRedirect?: (url: string) => void;
  onSessionExpired?: () => void;
  pollIntervalMs?: number;
}

export interface TradeDemoHandle {
  refresh(): Promise<void>;
  reset(): void;
}

function safeApprovalUrl(value?: string): URL | undefined {
  if (!value) return;
  try {
    const url = new URL(value, location.origin);
    if (url.origin === location.origin && !url.username && !url.password && !url.hash && !url.search &&
        /^\/api\/account\/payments\/near\/[0-9a-f-]{36}\/authorize$/i.test(url.pathname)) return url;
  } catch { return; }
}

function safeExplorerUrl(value?: string | null): URL | undefined {
  if (!value) return;
  try {
    const url = new URL(value);
    if (url.origin === 'https://testnet.nearblocks.io' && !url.username && !url.password &&
        /^\/txns\/[1-9A-HJ-NP-Za-km-z]+$/.test(url.pathname)) return url;
  } catch { return; }
}

type Action = 'accept' | 'skip';
type Attempt = { action: Action; body: TradeDemoActionRequest };
type Control = { label: string; run: () => void; secondary?: boolean; disabled?: boolean };
const pending = new Set(['awaiting_approval', 'processing', 'verifying']);

export function mountTradeDemo(container: HTMLElement, options: MountTradeDemoOptions = {}): TradeDemoHandle {
  const client = options.client ?? createDefaultTradeDemoClient();
  const redirect = options.onRedirect ?? ((url: string) => window.location.assign(url));
  const root = document.createElement('article');
  root.className = 'trade-card';
  root.innerHTML = '<div class="trade-scene" aria-hidden="true"><img class="trade-stone" alt=""><img class="trade-stall" alt=""><img class="trade-merchant" alt=""></div>' +
    '<div class="trade-contents"><div class="trade-dialogue"><h2 id="trade-dialog-title">Quầy nông sản</h2><p class="trade-message" role="status"></p></div>' +
    '<div class="trade-basket" hidden></div><div class="trade-price" hidden><img alt=""><strong></strong></div>' +
    '<div class="trade-actions"></div><a class="trade-receipt" target="_blank" rel="noopener noreferrer" hidden>Xem giao dịch</a><div class="trade-ledger"></div></div>';
  container.append(root);

  const get = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  for (const illustration of root.querySelectorAll('img')) illustration.loading = 'lazy';
  get<HTMLImageElement>('.trade-stone').src = tradeArt.stone;
  get<HTMLImageElement>('.trade-stall').src = tradeArt.stall;
  get<HTMLImageElement>('.trade-merchant').src = tradeArt.merchant;
  get<HTMLImageElement>('.trade-price img').src = tradeArt.strawberry;
  const title = get('h2');
  const message = get('.trade-message');
  const price = get('.trade-price');
  const basket = get('.trade-basket');
  const actions = get('.trade-actions');
  const receipt = get<HTMLAnchorElement>('.trade-receipt');
  const pnl = mountTradeDemoPnl(get('.trade-ledger'));

  let lifetime: AbortController | undefined;
  let snapshot: TradeDemoSnapshot | undefined;
  let busy = false;
  let timer: number | undefined;
  let orderId: string | undefined;
  let retry: Attempt | undefined;

  function stopTimer() {
    window.clearTimeout(timer);
    timer = undefined;
  }

  function setControls(...controls: Control[]) {
    const focused = Array.from(actions.children).indexOf(document.activeElement as HTMLElement);
    actions.replaceChildren(...controls.map(control => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = control.secondary ? 'trade-secondary' : 'trade-primary';
      button.textContent = control.label;
      button.disabled = Boolean(control.disabled);
      button.addEventListener('click', control.run);
      return button;
    }));
    if (focused >= 0) (actions.children[focused] as HTMLButtonElement | undefined)?.focus({ preventScroll: true });
  }

  function hint(text: string) {
    if (message.textContent !== text) message.textContent = text;
  }

  function renderBasket(current: TradeDemoSnapshot) {
    basket.hidden = current.role !== 'buyer';
    if (basket.hidden) return;
    const { filled, required, badge } = current.basket;
    const label = document.createElement('span');
    label.textContent = 'Mâm quả · ' + filled + '/' + required;
    basket.replaceChildren(label);
    for (let index = 0; index < required; index++) {
      const slot = document.createElement('span');
      slot.className = 'trade-slot';
      slot.setAttribute('aria-hidden', 'true');
      if (index < filled) {
        const fruit = document.createElement('img');
        fruit.alt = '';
        fruit.src = index === 2 ? tradeArt.strawberry : '/crops/crop' + (index + 2) + '/produce.png';
        slot.append(fruit);
      } else {
        slot.classList.add('trade-slot-empty');
      }
      basket.append(slot);
    }
    if (badge) {
      const reward = document.createElement('strong');
      const icon = document.createElement('img');
      icon.src = tradeArt.badge;
      icon.alt = '';
      reward.className = 'trade-badge';
      reward.append(icon, badge.name);
      basket.append(reward);
    }
  }

  function render(current: TradeDemoSnapshot) {
    snapshot = current;
    const { offer, activeOrder, offerDismissed, role, stage } = current;
    const isSeller = role === 'seller';
    pnl.render(current.pnl);
    renderBasket(current);
    title.textContent = 'Quầy nông sản';
    price.hidden = !offer;
    if (offer) get('.trade-price strong').textContent = formatPaymentAmount(offer.amount);
    const explorer = safeExplorerUrl(activeOrder?.payment?.explorerUrl);
    receipt.hidden = !explorer;
    if (explorer) receipt.href = explorer.href;
    else receipt.removeAttribute('href');

    if (activeOrder && pending.has(activeOrder.status)) {
      orderId = activeOrder.id;
      const approval = safeApprovalUrl(activeOrder.payment?.requiredAction?.url);
      hint(activeOrder.status === 'awaiting_approval'
        ? 'Xác nhận khoản mua để mình giao quả dâu cho bạn nhé.'
        : 'Mình đang kiểm tra giao dịch. Bạn có thể quay lại quầy để xem kết quả.');
      if (activeOrder.status === 'awaiting_approval') {
        price.hidden = false;
        get('.trade-price strong').textContent = formatPaymentAmount(activeOrder.amount);
      }
      setControls(...(approval ? [{ label: 'Tiếp tục xác nhận', run: () => redirect(approval.href) }] : []));
    } else {
      orderId = undefined;
      if (offerDismissed) {
        hint('Bạn đã bỏ qua lời mời.');
        setControls();
      } else if (offer) {
        title.textContent = isSeller ? 'Mình mua dâu nhé?' : 'Quả cuối cho mâm mùa vụ';
        const speech = isSeller
          ? 'Bạn đổi một quả dâu lấy ' + formatPaymentAmount(offer.amount) + ' nhé?'
          : 'Mâm của bạn còn thiếu một quả dâu. Mua quả này để hoàn thành mâm và nhận huy hiệu nhé?';
        const failedOrder = activeOrder && ['failed', 'cancelled', 'expired'].includes(activeOrder.status);
        hint(!offer.canAccept ? getUnavailableReasonText(offer.unavailableReason)
          : (failedOrder ? getOrderStatusText(activeOrder.status) + '. ' : '') + speech);
        setControls(
          { label: isSeller ? 'Đổi dâu' : 'Mua dâu', run: () => void act('accept'), disabled: !offer.canAccept },
          { label: 'Bỏ qua', run: () => void act('skip'), secondary: true },
        );
      } else {
        const text = isSeller && activeOrder?.status === 'succeeded'
          ? 'Mình đã nhận quả dâu và gửi ' + formatPaymentAmount(activeOrder.amount) + ' cho bạn.'
          : stage === 'completed' ? 'Bạn đã hoàn thành mâm quả mùa vụ.'
          : 'Mình đang chờ dâu về quầy. Bạn ghé lại sau nhé.';
        hint(text);
        setControls();
      }
    }
    options.onSnapshot?.(current);
  }

  function queue(delay = options.pollIntervalMs ?? 4_000) {
    stopTimer();
    const waitingForStock = snapshot?.role === 'buyer' && snapshot.stage === 'awaiting_seller' && !snapshot.offerDismissed;
    if (lifetime && !document.hidden && (orderId || waitingForStock)) {
      timer = window.setTimeout(() => void refresh(), delay);
    }
  }

  async function load(signal: AbortSignal) {
    const current = orderId ? (await client.readOrder(orderId, signal)).snapshot : await client.read(signal);
    if (!signal.aborted) render(current);
  }

  async function recover(error: unknown, signal: AbortSignal, attempt?: Attempt) {
    if (signal.aborted) return;
    const issue = error instanceof TradeRequestError ? error : undefined;
    if (issue?.status === 401) {
      reset();
      hint('Hãy đăng nhập lại để ghé quầy.');
      options.onSessionExpired?.();
      return;
    }
    if (issue?.detail?.code === 'PAYMENT_UNCONFIRMED' && issue.detail.orderId) {
      orderId = issue.detail.orderId;
      retry = undefined;
      price.hidden = true;
      hint('Đang xác minh giao dịch. Bạn có thể kiểm tra lại cùng lệnh.');
      setControls({ label: 'Kiểm tra giao dịch', run: () => void refresh(), secondary: true });
      return;
    }
    if (issue?.status === 409 && issue.detail?.code !== 'RUN_REQUIRED' && attempt) {
      retry = undefined;
      try {
        await load(signal);
        if (!signal.aborted) hint(issue.message);
        return;
      } catch (reloadError) {
        await recover(reloadError, signal);
        return;
      }
    }
    if (issue?.status === 404) orderId = undefined;
    retry = attempt && (!issue || issue.status >= 500) ? attempt : undefined;
    hint(issue?.message ?? 'Mất kết nối với quầy. Hãy thử lại.');
    setControls({ label: 'Thử lại', run: () => retry ? void act(retry.action) : void refresh() });
  }

  async function run(work: (signal: AbortSignal) => Promise<void>, attempt?: Attempt) {
    if (!lifetime || busy || document.hidden) return;
    const { signal } = lifetime;
    stopTimer();
    busy = true;
    if (attempt) for (const button of actions.querySelectorAll('button')) button.disabled = true;
    try {
      await work(signal);
    } catch (error) {
      if (!signal.aborted) await recover(error, signal, attempt);
    } finally {
      if (!signal.aborted) {
        busy = false;
        queue();
      }
    }
  }

  function act(action: Action) {
    if (!snapshot?.offer || busy) return;
    const attempt = retry ?? { action, body: {
      runId: snapshot.runId, offerId: snapshot.offer.id, requestId: crypto.randomUUID(), expectedRevision: snapshot.revision,
    } };
    return run(async signal => {
      const result = await client[action](attempt.body, signal);
      if (signal.aborted) return;
      retry = undefined;
      render(result.snapshot);
      const url = safeApprovalUrl(result.order?.payment?.requiredAction?.url);
      if (action === 'accept' && url) redirect(url.href);
    }, attempt);
  }

  function refresh() {
    lifetime ??= new AbortController();
    return run(load);
  }

  function reset() {
    lifetime?.abort();
    lifetime = undefined;
    stopTimer();
    snapshot = undefined;
    busy = false;
    retry = undefined;
    orderId = undefined;
    title.textContent = 'Quầy nông sản';
    hint('Đang mở quầy…');
    price.hidden = basket.hidden = receipt.hidden = true;
    receipt.removeAttribute('href');
    basket.replaceChildren();
    setControls();
    pnl.reset();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopTimer();
    else if (lifetime && !retry) void refresh();
  });
  reset();
  return { refresh, reset };
}
