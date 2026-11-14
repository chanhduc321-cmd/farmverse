import { tradeArt } from './assets.ts';
import { createDefaultTradeDemoClient, TradeRequestError } from './client.ts';
import { mountTradeDemo } from './trade.ts';

const returnKey = 'farmverse:trade-return';
const checkInterval = 8_000;

export function mountFarmTradeVisit(field: HTMLElement) {
  const client = createDefaultTradeDemoClient();
  const invite = document.createElement('button');
  invite.type = 'button';
  invite.className = 'farm-trade-invite';
  invite.hidden = true;
  invite.setAttribute('aria-haspopup', 'dialog');
  const portrait = document.createElement('img');
  portrait.loading = 'lazy';
  portrait.src = tradeArt.merchant;
  portrait.alt = '';
  const label = document.createElement('span');
  invite.append(portrait, label);
  field.append(invite);

  const dialog = document.createElement('dialog');
  dialog.className = 'farm-trade-dialog';
  dialog.setAttribute('aria-labelledby', 'trade-dialog-title');
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'farm-trade-close';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Đóng quầy nông sản');
  close.autofocus = true;
  dialog.append(close);
  document.body.append(dialog);

  let sessionKey: string | undefined;
  let visitRequest: AbortController | undefined;
  let visitTimer: number | undefined;
  let farmReady = false;
  let returnToTrade = sessionStorage.getItem(returnKey) === '1';
  sessionStorage.removeItem(returnKey);
  const trade = mountTradeDemo(dialog, {
    client,
    onSessionExpired() { setHome(undefined); },
    onRedirect(url) {
      sessionStorage.setItem(returnKey, '1');
      window.location.assign(url);
    },
  });

  function open() {
    if (!farmReady || !sessionKey || dialog.open || document.querySelector('dialog[open]')) return false;
    dialog.showModal();
    void trade.refresh();
    return true;
  }

  function cancelVisitCheck() {
    window.clearTimeout(visitTimer);
    visitTimer = undefined;
    visitRequest?.abort();
    visitRequest = undefined;
  }

  function checkAfter(delay: number) {
    window.clearTimeout(visitTimer);
    visitTimer = window.setTimeout(() => {
      visitTimer = undefined;
      void checkVisit();
    }, delay);
  }

  async function checkVisit() {
    if (!sessionKey || document.hidden || visitRequest) return;
    const controller = new AbortController();
    const { signal } = controller;
    visitRequest = controller;
    try {
      const state = await client.visit(signal);
      if (signal.aborted) return;
      const remaining = state.visit ? state.visit.arrivesAt - state.serverTime : 0;
      const arrived = Boolean(state.visit && remaining <= 0);
      invite.hidden = !(arrived || state.canRevisitStall);
      invite.classList.toggle('is-calling', arrived);
      label.textContent = state.visit && arrived
        ? state.visit.kind === 'sell_to_npc' ? 'Bạn có dâu bán không?' : 'Mình có dâu cho mâm quả!'
        : 'Quầy nông sản';
      if (returnToTrade && open()) returnToTrade = false;
      if (state.checkAgain) checkAfter(state.visit && !arrived ? remaining + 50 : checkInterval);
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof TradeRequestError && error.status === 401) {
        returnToTrade = false;
        setHome(undefined);
      } else if (error instanceof TradeRequestError && error.status === 409) {
        invite.hidden = true;
        returnToTrade = false;
      } else {
        checkAfter(checkInterval);
      }
    } finally {
      if (visitRequest === controller) visitRequest = undefined;
    }
  }

  function setHome(nextKey: string | undefined) {
    if (sessionKey === nextKey) return;
    sessionKey = nextKey;
    cancelVisitCheck();
    invite.hidden = true;
    if (dialog.open) dialog.close();
    trade.reset();
    void checkVisit();
  }

  invite.addEventListener('click', open);
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    trade.reset();
    if (!visitRequest) void checkVisit();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelVisitCheck();
    else void checkVisit();
  });
  return {
    setHome,
    farmReady() {
      farmReady = true;
      if (returnToTrade && open()) returnToTrade = false;
    },
  };
}
