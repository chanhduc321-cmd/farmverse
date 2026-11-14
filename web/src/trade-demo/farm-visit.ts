import { tradeArt } from './assets.ts';
import { createDefaultTradeDemoClient, TradeRequestError } from './client.ts';
import { mountTradeDemo } from './trade.ts';

const stallHash = '#quay-nong-san';
const screenName = 'Hội chợ nông sản';
const returnKey = 'farmverse:trade-return';
const checkInterval = 8_000;

export function mountFarmTradeVisit(field: HTMLElement) {
  const client = createDefaultTradeDemoClient();
  const farm = field.closest('main')!;
  const invite = document.createElement('button');
  invite.type = 'button';
  invite.className = 'farm-trade-invite';
  invite.hidden = true;
  const portrait = document.createElement('img');
  portrait.loading = 'lazy';
  portrait.src = tradeArt.merchant;
  portrait.alt = '';
  const label = document.createElement('span');
  invite.append(portrait, label);
  field.append(invite);

  const screen = document.createElement('main');
  screen.className = 'farm-trade-screen';
  screen.hidden = true;
  screen.setAttribute('aria-labelledby', 'trade-screen-title');
  screen.innerHTML = '<header class="farm-trade-header"><button type="button" class="farm-trade-back">← Về ruộng</button>' +
    '<h1 id="trade-screen-title"></h1></header>';
  screen.querySelector('h1')!.textContent = screenName;
  const back = screen.querySelector('button')!;
  document.body.append(screen);

  let sessionKey: string | undefined;
  let visitRequest: AbortController | undefined;
  let visitTimer: number | undefined;
  let farmReady = false;
  let canOpen = false;
  let returnSession: string | null = null;
  try {
    returnSession = sessionStorage.getItem(returnKey);
    sessionStorage.removeItem(returnKey);
  } catch { /* Fragment navigation still works without session storage. */ }
  const trade = mountTradeDemo(screen, {
    client,
    onSessionExpired() { setHome(undefined); },
    onRedirect(url) {
      try {
        if (sessionKey) sessionStorage.setItem(returnKey, sessionKey);
      } catch { /* The player can reopen the stall from the farm. */ }
      window.location.assign(url);
    },
  });

  function clearStallUrl() {
    if (location.hash !== stallHash) return;
    const url = new URL(location.href);
    url.hash = '';
    history.replaceState(null, '', url);
  }

  function hideScreen(restoreFocus: boolean) {
    if (screen.hidden) return false;
    screen.hidden = true;
    farm.inert = false;
    farm.classList.remove('is-stall-open');
    trade.reset();
    if (restoreFocus && !invite.hidden) invite.focus({ preventScroll: true });
    return true;
  }

  function syncScreen() {
    const returning = Boolean(sessionKey && returnSession === sessionKey);
    if (location.hash !== stallHash && !returning) {
      if (hideScreen(true)) void checkVisit();
      return;
    }
    if (!farmReady || !sessionKey || !canOpen || !screen.hidden || document.querySelector('dialog[open]')) return;
    if (returning) {
      returnSession = null;
      if (location.hash !== stallHash) history.pushState({ farmTradeEntry: true }, '', stallHash);
    }
    cancelVisitCheck();
    farm.inert = true;
    farm.classList.add('is-stall-open');
    screen.hidden = false;
    screen.scrollTop = 0;
    back.focus({ preventScroll: true });
    void trade.refresh();
  }

  function leave() {
    if (screen.hidden) return;
    if (history.state?.farmTradeEntry) history.back();
    else {
      clearStallUrl();
      syncScreen();
    }
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
    if (!sessionKey || !screen.hidden || document.hidden || visitRequest) return;
    const controller = new AbortController();
    const { signal } = controller;
    visitRequest = controller;
    try {
      const state = await client.visit(signal);
      if (signal.aborted) return;
      const remaining = state.visit ? state.visit.arrivesAt - state.serverTime : 0;
      const arrived = Boolean(state.visit && remaining <= 0);
      canOpen = arrived || state.canRevisitStall;
      invite.hidden = !canOpen;
      invite.classList.toggle('is-calling', arrived);
      label.textContent = state.visit && arrived
        ? state.visit.kind === 'sell_to_npc' ? 'Bạn có dâu bán không?' : 'Mình có dâu cho mâm quả!'
        : screenName;
      syncScreen();
      if (signal.aborted) return;
      if (!canOpen && !state.checkAgain) clearStallUrl();
      if (state.checkAgain) checkAfter(state.visit && !arrived ? remaining + 50 : checkInterval);
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof TradeRequestError && [401, 404].includes(error.status)) {
        setHome(undefined);
      } else if (error instanceof TradeRequestError && error.status === 409) {
        returnSession = null;
        canOpen = false;
        invite.hidden = true;
        clearStallUrl();
        hideScreen(false);
      } else {
        checkAfter(checkInterval);
      }
    } finally {
      if (visitRequest === controller) visitRequest = undefined;
    }
  }

  function setHome(nextKey: string | undefined) {
    if (!nextKey || (sessionKey && sessionKey !== nextKey)) {
      returnSession = null;
      clearStallUrl();
    }
    if (sessionKey === nextKey) return;
    sessionKey = nextKey;
    canOpen = false;
    cancelVisitCheck();
    hideScreen(false);
    invite.hidden = true;
    void checkVisit();
  }

  invite.addEventListener('click', () => {
    if (!farmReady || !canOpen || document.querySelector('dialog[open]')) return;
    if (location.hash !== stallHash) history.pushState({ farmTradeEntry: true }, '', stallHash);
    syncScreen();
  });
  back.addEventListener('click', leave);
  screen.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    leave();
  });
  window.addEventListener('popstate', syncScreen);
  window.addEventListener('hashchange', syncScreen);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelVisitCheck();
    else void checkVisit();
  });
  return {
    isOpen: () => !screen.hidden,
    setHome,
    farmReady() {
      farmReady = true;
      syncScreen();
    },
  };
}
