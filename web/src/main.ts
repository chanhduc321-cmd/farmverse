import Phaser from 'phaser';
import { inject } from '@vercel/analytics';
import { ACCOUNT_API, FARM_API, FERTILIZER_COST, ripeAt, stageAt } from '../../shared/farm.mts';
import type { Crop, FarmAction, FarmBatchRequest, FarmMutation, FarmResponse, FarmSessionResponse, Plot } from '../../shared/farm.mts';
import { applyFarmAction } from '../../shared/farm-rules.mts';
import { BatchQueueManager, FarmRateLimitError } from './batch-queue.ts';
import { createActivity } from './activity.ts';
import { beginNearAuth, consumeNearAuthResult } from './auth/near.ts';
import { initAnalytics, trackEvent } from './analytics.ts';
import { farmActionEvent } from './analytics-events.ts';
import { COMMUNITY_API } from '../../shared/community.mts';
import type { FarmVisit, PlayerPage, StealResponse } from '../../shared/community.mts';
import { createCommunity, createPlayerAvatar, playerPath } from './community.ts';
import { createMissions } from './missions.ts';
import { farmLoading } from './loading.ts';
import { createFarmPet, loadPetSprites } from './pets.ts';
import { mountTransactionHistory } from './transactions/history.ts';
import { mountFarmTradeVisit } from './trade-demo/farm-visit.ts';
import './style.css';

// Initialize Vercel Web Analytics
inject();

const width = 800;
const height = 600;
const tileWidth = 220;
const tileHeight = 108;
const cropScale = .52;
const getCropScale = (cropId: number) => (cropId <= 5 ? .52 : .95);
const toPosition = ([column, row]: number[]) => [
  400 + (column - row) * tileWidth / 2,
  214 + (column + row) * tileHeight / 2,
];
const positions = [[0, 1], [0, 0], [1, 0], [1, 1], [2, 0], [2, 1]].map(toPosition);
const lockedPositions = [[0, 2], [1, 2], [2, 2]].map(toPosition);
const themes = [
  { file: 'web-wide-dock.png', fieldOffset: 0, bank: ['#a5b44b', '#778d2b'] },
  { file: 'web-theme-2.jpg', fieldOffset: .1, bank: ['#a8bc49', '#7f982e'] },
  { file: 'web-theme-3.jpg', fieldOffset: .05, bank: ['#c0b44c', '#9d8d36'] },
  { file: 'web-theme-4.jpg', fieldOffset: .12, bank: ['#e7ae58', '#bd7c31'] },
];
const asset = (path: string) => `/${path}`;

function cropArt(crop: Crop) {
  const dir = `crops/crop${crop.id}`;
  const frame = (number: number) => `${dir}/stage-${number}.png`;
  return {
    seed: `${dir}/seed.png`,
    seedBag: `${dir}/seed_bag.png`,
    planted: `${dir}/planted.png`,
    harvested: `${dir}/cron_end.png`,
    produce: `${dir}/produce.png`,
    frame,
  };
}
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-tool]')];
const dialog = document.querySelector<HTMLDialogElement>('#inventory')!;
const panel = document.querySelector<HTMLDivElement>('#inventory-content')!;
const panelTabs = [...dialog.querySelectorAll<HTMLButtonElement>('[data-panel]')];
const panelCoins = dialog.querySelector<HTMLElement>('#inventory-coins')!;
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
});
const plotTargets = document.querySelector<HTMLDivElement>('#plot-targets')!;
const hint = document.querySelector<HTMLParagraphElement>('#hint')!;
const feedback = document.querySelector<HTMLParagraphElement>('#feedback')!;
const panelFeedback = document.querySelector<HTMLParagraphElement>('#panel-feedback')!;
const gameToast = document.querySelector<HTMLElement>('#game-toast');
const gameToastMsg = document.querySelector<HTMLElement>('#game-toast-msg');
const inventoryToast = document.querySelector<HTMLElement>('#inventory-toast');
const inventoryToastMsg = document.querySelector<HTMLElement>('#inventory-toast-msg');
let gameToastTimer: number | null = null;
let inventoryToastTimer: number | null = null;

function hideGameToast(): void {
  if (gameToastTimer !== null) {
    window.clearTimeout(gameToastTimer);
    gameToastTimer = null;
  }
  if (gameToast) {
    gameToast.hidden = true;
    gameToast.className = 'game-toast';
  }
}

function showGameToast(
  message: string,
  type: 'info' | 'success' | 'warning' | 'error' = 'info',
  durationMs: number = 2800
): void {
  if (!gameToast || !gameToastMsg) return;

  if (gameToastTimer !== null) {
    window.clearTimeout(gameToastTimer);
    gameToastTimer = null;
  }

  gameToastMsg.textContent = message;
  gameToast.className = `game-toast is-${type}`;
  gameToast.hidden = false;

  if (durationMs > 0) {
    gameToastTimer = window.setTimeout(() => {
      hideGameToast();
    }, durationMs);
  }
}

function hideInventoryToast(): void {
  if (inventoryToastTimer !== null) {
    window.clearTimeout(inventoryToastTimer);
    inventoryToastTimer = null;
  }
  if (inventoryToast) {
    inventoryToast.hidden = true;
    inventoryToast.className = 'modal-toast';
  }
}

function showInventoryToast(
  message: string,
  type: 'info' | 'success' | 'warning' | 'error' = 'info',
  durationMs: number = 2800
): void {
  if (!inventoryToast || !inventoryToastMsg) return;

  if (inventoryToastTimer !== null) {
    window.clearTimeout(inventoryToastTimer);
    inventoryToastTimer = null;
  }

  inventoryToastMsg.textContent = message;
  inventoryToast.className = `modal-toast is-${type}`;
  inventoryToast.hidden = false;

  if (durationMs > 0) {
    inventoryToastTimer = window.setTimeout(() => {
      hideInventoryToast();
    }, durationMs);
  }
}

function setFeedback(
  text: string,
  type: 'info' | 'success' | 'warning' | 'error' = 'info',
  durationMs: number = 2800
): void {
  feedback.textContent = text;
  if (!text) {
    hideGameToast();
  } else {
    showGameToast(text, type, durationMs);
  }
}
const coins = document.querySelector<HTMLElement>('#coins')!;
const level = document.querySelector<HTMLElement>('#level')!;
const xp = document.querySelector<HTMLElement>('#xp')!;
const xpBar = document.querySelector<HTMLProgressElement>('#xp-bar')!;
const fieldBar = document.querySelector<HTMLProgressElement>('#field-bar')!;
const fieldCount = document.querySelector<HTMLElement>('#field-count')!;
const field = document.querySelector<HTMLElement>('.field')!;
const visitHud = document.createElement('header');
visitHud.id = 'visit-hud';
visitHud.hidden = true;
visitHud.innerHTML = `
  <img class="visit-avatar" src="/face/face_1.png" alt="">
  <h2></h2>
  <button type="button" data-visit-refresh aria-label="Làm mới ruộng" title="Làm mới ruộng">↻</button>
  <button type="button" data-visit-exit aria-label="Về ruộng mình" title="Về ruộng mình"><img src="/icon/topbutton%20(8).png" alt=""><span>Về nhà</span></button>
`;
field.append(visitHud);
const visitTitle = visitHud.querySelector('h2')!;
const visitRefresh = visitHud.querySelector<HTMLButtonElement>('[data-visit-refresh]')!;
const visitExit = visitHud.querySelector<HTMLButtonElement>('[data-visit-exit]')!;
visitExit.hidden = true;
field.append(visitExit);

const accountDialog = document.querySelector<HTMLDialogElement>('#account')!;
const nearAuthButtons = accountDialog.querySelectorAll<HTMLButtonElement>('[data-near-auth]');
const hudAccountBtn = document.querySelector<HTMLButtonElement>('#hud-account-btn')!;
const hudName = document.querySelector<HTMLElement>('#hud-name')!;
const hudAccountBadge = document.querySelector<HTMLElement>('#hud-account-badge')!;
const menuAccountLabel = document.querySelector<HTMLElement>('#menu-account-label');
const accountTitle = document.querySelector<HTMLElement>('#account-title')!;
const accountDescription = document.querySelector<HTMLElement>('#account-description')!;
const accountNav = document.querySelector<HTMLElement>('#account-nav')!;
const accountTabs = [...accountDialog.querySelectorAll<HTMLButtonElement>('[data-account-tab]')];
const viewRegister = document.querySelector<HTMLElement>('#view-register')!;
const viewLogin = document.querySelector<HTMLElement>('#view-login')!;
const viewProfile = document.querySelector<HTMLElement>('#view-profile')!;
const viewUnavailable = document.querySelector<HTMLElement>('#view-unavailable')!;
const viewSyncError = document.querySelector<HTMLElement>('#view-sync-error')!;
const syncErrorText = document.querySelector<HTMLElement>('#sync-error-text')!;
const btnRetrySync = document.querySelector<HTMLButtonElement>('#btn-retry-sync')!;
const formRegister = document.querySelector<HTMLFormElement>('#form-register')!;
const formLogin = document.querySelector<HTMLFormElement>('#form-login')!;
const profileUsername = document.querySelector<HTMLElement>('#profile-username')!;
const unavailableText = document.querySelector<HTMLElement>('#unavailable-text')!;
const accountToast = document.querySelector<HTMLElement>('#account-toast');
const accountToastMsg = document.querySelector<HTMLElement>('#account-toast-msg');
const regUsernameInput = document.querySelector<HTMLInputElement>('#reg-username');
const regPasswordInput = document.querySelector<HTMLInputElement>('#reg-password');
const loginUsernameInput = document.querySelector<HTMLInputElement>('#login-username');
const loginPasswordInput = document.querySelector<HTMLInputElement>('#login-password');
const btnAccountLogout = document.querySelector<HTMLButtonElement>('#btn-account-logout')!;
const btnSubmitRegister = document.querySelector<HTMLButtonElement>('#btn-submit-register')!;
const btnSubmitLogin = document.querySelector<HTMLButtonElement>('#btn-submit-login')!;
let accountToastTimer: number | null = null;

function hideAccountToast(): void {
  if (accountToastTimer !== null) {
    window.clearTimeout(accountToastTimer);
    accountToastTimer = null;
  }
  if (accountToast) {
    accountToast.hidden = true;
    accountToast.className = 'account-toast';
  }
  if (accountToastMsg) accountToastMsg.textContent = '';
}

function showAccountToast(
  message: string,
  type: 'error' | 'info' | 'success' = 'error',
  inputToShake?: HTMLInputElement | null,
  durationMs: number = 3200
): void {
  if (!accountToast || !accountToastMsg) return;

  if (accountToastTimer !== null) {
    window.clearTimeout(accountToastTimer);
    accountToastTimer = null;
  }

  accountToastMsg.textContent = message;
  accountToast.className = `account-toast is-${type}`;
  accountToast.hidden = false;

  if (inputToShake) {
    inputToShake.classList.remove('is-invalid');
    void inputToShake.offsetWidth;
    inputToShake.classList.add('is-invalid');
    inputToShake.focus();
  }

  if (durationMs > 0) {
    accountToastTimer = window.setTimeout(() => {
      hideAccountToast();
    }, durationMs);
  }
}

function setAccountFeedback(
  text: string,
  type: 'error' | 'info' | '' = '',
  inputToShake?: HTMLInputElement | null
): void {
  if (!text) {
    hideAccountToast();
    [regUsernameInput, regPasswordInput, loginUsernameInput, loginPasswordInput].forEach((input) => {
      input?.classList.remove('is-invalid');
    });
    return;
  }
  showAccountToast(text, type === 'error' ? 'error' : 'info', inputToShake, type === 'info' ? 0 : 3500);
}

const plotTooltip = document.querySelector<HTMLDivElement>('#plot-tooltip')!;
const tooltipTitle = document.querySelector<HTMLElement>('#tooltip-title')!;
const tooltipBadge = document.querySelector<HTMLElement>('#tooltip-badge')!;
const tooltipDesc = document.querySelector<HTMLParagraphElement>('#tooltip-desc')!;
const tooltipMeta = document.querySelector<HTMLElement>('#tooltip-meta')!;
const tooltipXp = document.querySelector<HTMLElement>('#tooltip-xp')!;
const tooltipTimer = document.querySelector<HTMLElement>('#tooltip-timer')!;
const guideDialog = document.querySelector<HTMLElement>('#farm-guide')!;
const guideMessage = document.querySelector<HTMLElement>('#farm-guide-message')!;
const guideFeedback = document.querySelector<HTMLElement>('#farm-guide-feedback')!;
const guideAction = document.querySelector<HTMLButtonElement>('#guide-action')!;
const guideSkip = document.querySelector<HTMLButtonElement>('#guide-skip')!;
const guideStorageKey = 'farmverse-guide-dismissed';
let guideActive = false;
let guideChecked = false;
let guideHadProduce = false;
const guideShade = document.querySelector<HTMLElement>('#guide-shade')!;
const introducedAreas = new Set<Panel>();
let guidedPanel: Panel | undefined;
let guidePanelCompleted = false;
let guideSpotlight: HTMLElement | undefined;

type Panel = 'shop' | 'bag' | 'warehouse';
type CareTool = 'water' | 'fertilize';
type PlotAction = Extract<FarmAction, { plot: number }>;
const noFertilizer = 'Đã hết phân bón. Mua thêm ở Tiệm hạt.';
const panelInfo = {
  shop: { title: 'Tiệm hạt', description: 'Mua hạt giống và phân bón.', icon: 2 },
  bag: { title: 'Túi hạt', description: 'Chọn hạt rồi bấm ô đất trống để gieo.', icon: 12 },
  warehouse: { title: 'Kho nông sản', description: 'Chọn nông sản và số quả muốn bán.', icon: 8 },
};
let activePanel: Panel = 'shop';
let selectedCropId: number | undefined;
let activeCareTool: CareTool | undefined;
let activeAccountTab: 'register' | 'login' = 'register';
let accountSubmitting = false;
let sessionSynchronized = false;
let busy = false;
let snapshot: FarmResponse;
let confirmedRevision = 0;
let session: FarmSessionResponse | undefined;
let activeTooltipPlot: number | null = null;
let lastGuideCheck = 0;
let receivedAt = 0;
let visit: FarmVisit | undefined;
let visitReceivedAt = 0;
let visitPending = false;
let crops: Crop[] = [];
const plotButtons: HTMLButtonElement[] = [];

async function request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api${path}`, body !== undefined ? {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
    keepalive: path === FARM_API.batch.path,
  } : { signal });
  if (!response.ok) {
    if (path === FARM_API.batch.path && response.status === 429) {
      throw new FarmRateLimitError(response.headers.get('Retry-After'));
    }
    const result = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(result?.error ?? 'Chưa kết nối được máy chủ Nông Trại Mộng Mơ.', { cause: response.status });
  }
  if (response.status === 204) {
    return undefined as unknown as T;
  }
  return await response.json() as T;
}

let goldCountFrame = 0;
let activeScene: FarmScene | undefined;

function animateCoins(from: number, to: number): void {
  if (goldCountFrame) cancelAnimationFrame(goldCountFrame);
  if (reduceMotion.matches || from === to) {
    coins.textContent = String(to);
    return;
  }
  const startedAt = performance.now();
  const duration = 260;
  const tick = (now: number) => {
    const t = Math.min(1, (now - startedAt) / duration);
    const eased = 1 - (1 - t) * (1 - t);
    coins.textContent = String(Math.round(from + (to - from) * eased));
    if (t < 1) goldCountFrame = requestAnimationFrame(tick);
    else goldCountFrame = 0;
  };
  goldCountFrame = requestAnimationFrame(tick);
}

function bumpStat(element: HTMLElement | null): void {
  if (!element || reduceMotion.matches) return;
  element.classList.remove('is-bumped');
  void element.offsetWidth;
  element.classList.add('is-bumped');
}

function setSnapshot(next: FarmResponse | FarmSessionResponse, optimistic = false): void {
  const prevGold = snapshot?.farm.gold;
  const prevLevel = snapshot?.farm.level;
  snapshot = next;
  if (!optimistic) confirmedRevision = next.farm.revision;
  if ('accountsAvailable' in next) {
    if (!sessionSynchronized || session?.sessionKey !== next.sessionKey) {
      transactionHistory.reset();
      selectedCropId = undefined;
      activeCareTool = undefined;
      batchQueue.reset();
    }
    session = next;
    sessionSynchronized = true;
    const showNearDemo = next.nearDemoAvailable === true;
    nearAuthButtons.forEach(button => { button.hidden = !showNearDemo; });
    transactionHistoryContainer.hidden = !showNearDemo;
    if (showNearDemo) farmTradeVisit ??= mountFarmTradeVisit(field);
    activity.setSession(next.account?.username);
    updateToolHint();
  }
  receivedAt = performance.now();
  missions.update(next.farm);
  coins.textContent = String(next.farm.gold);
  if (prevGold !== undefined && prevGold !== next.farm.gold) {
    animateCoins(prevGold, next.farm.gold);
    bumpStat(coins.parentElement);
  }
  panelCoins.textContent = next.farm.gold.toLocaleString('vi-VN');
  level.textContent = String(next.farm.level);
  if (prevLevel !== undefined && prevLevel !== next.farm.level) {
    bumpStat(level.parentElement);
    if (next.farm.level > prevLevel) activeScene?.playLevelUp();
  }
  xpBar.max = next.farm.level * 200;
  xpBar.value = next.farm.xp;
  xp.textContent = `${xpBar.value}/${xpBar.max} XP`;
  fieldBar.value = next.farm.plots.filter(Boolean).length;
  fieldCount.textContent = `${fieldBar.value}/${fieldBar.max} ô`;
  const xpFill = document.querySelector<HTMLElement>('#xp-fill');
  if (xpFill) {
    const pct = Math.min(100, Math.round((next.farm.xp / (next.farm.level * 200)) * 100));
    xpFill.style.width = `${pct}%`;
  }
  const fieldFill = document.querySelector<HTMLElement>('#field-fill');
  if (fieldFill) {
    const pct = Math.min(100, Math.round((fieldBar.value / fieldBar.max) * 100));
    fieldFill.style.width = `${pct}%`;
  }

  // Cập nhật tên và trạng thái tài khoản trên HUD
  if (session?.account) {
    hudName.textContent = session.account.username;
    hudAccountBadge.textContent = 'Tài khoản';
    hudAccountBtn.classList.add('is-authenticated');
    hudAccountBtn.classList.remove('is-offline');
    if (menuAccountLabel) menuAccountLabel.textContent = session.account.username;
  } else {
    hudName.textContent = 'Khách';
    hudAccountBadge.textContent = 'Đăng nhập';
    hudAccountBtn.classList.remove('is-authenticated');
    if (session?.accountsAvailable) hudAccountBtn.classList.remove('is-offline');
    else hudAccountBtn.classList.add('is-offline');
    if (menuAccountLabel) menuAccountLabel.textContent = 'Tài khoản';
  }

  if (selectedCropId !== undefined && !(snapshot.farm.seeds[selectedCropId] > 0)) {
    selectedCropId = undefined;
  }
  updateToolHint();
  if (dialog.open) renderPanel();
  updateCommunityAccess();
}

function updateCommunityAccess(): void {
  const available = sessionSynchronized && Boolean(session?.account);
  farmTradeVisit?.setHome(available && session?.nearDemoAvailable && !visit ? session.sessionKey : undefined);
  community.updateAccess(available, busy || accountSubmitting);
  if (!available) {
    activity.setSession(undefined);
    transactionHistory.reset();
  }
  activity.setBlocked(busy || accountSubmitting);
  if (!available && visit) setVisit(undefined);
}

function setVisit(next: FarmVisit | undefined): void {
  const wasVisiting = Boolean(visit);
  hidePlotTooltip();
  visit = next;
  farmTradeVisit?.setHome(sessionSynchronized && session?.nearDemoAvailable && session.account && !next ? session.sessionKey : undefined);
  if (next) activeCareTool = undefined;
  visitReceivedAt = performance.now();
  activity.setAtHome(!next);
  field.classList.toggle('is-visiting', Boolean(next));
  visitHud.hidden = !next;
  visitExit.hidden = !next;
  updateToolHint();
  if (next) {
    const portrait = createPlayerAvatar();
    portrait.className = 'visit-avatar';
    visitHud.querySelector('.visit-avatar')!.replaceWith(portrait);
    visitTitle.textContent = next.username;
    visitTitle.setAttribute('aria-label', `Ruộng của ${next.username}`);
    visitTitle.title = `Ruộng của ${next.username}`;
    if (!wasVisiting) {
      setFeedback('');
      visitExit.focus();
    }
  } else {
    if (wasVisiting) {
      setFeedback('');
      community.focus();
    }
  }
}

async function runVisitAction(action: () => Promise<void>): Promise<void> {
  if (visitPending) return;
  visitPending = true;
  visitRefresh.disabled = true;
  visitExit.disabled = true;
  setFeedback('');
  try {
    await action();
  } catch (error) {
    if (error instanceof Error && error.cause === 401) await refreshCommunitySession();
    else setFeedback(error instanceof Error ? error.message : 'Chưa tải được ruộng.', 'error');
  } finally {
    visitPending = false;
    visitRefresh.disabled = false;
    visitExit.disabled = false;
  }
}

async function readVisit(username: string): Promise<FarmVisit> {
  return request<FarmVisit>(playerPath(COMMUNITY_API.visit, username));
}

async function openFarmVisit(username: string): Promise<FarmVisit> {
  await batchQueue.flushAndWait();
  const farmVisit = await readVisit(username);
  trackEvent('farm_visit');
  return farmVisit;
}

async function refreshVisit(username: string): Promise<void> {
  setVisit(await readVisit(username));
}

visitRefresh.onclick = () => {
  const current = visit;
  if (current) void runVisitAction(() => refreshVisit(current.username));
};
visitExit.onclick = () => setVisit(undefined);

function updateAccountButtons(): void {
  const pending = busy || accountSubmitting;
  nearAuthButtons.forEach(button => { button.disabled = pending || button.hidden; });
  btnSubmitRegister.disabled = pending;
  btnSubmitLogin.disabled = pending;
  btnAccountLogout.disabled = pending;
  btnRetrySync.disabled = pending;
  updateCommunityAccess();
}

nearAuthButtons.forEach(button => {
  button.addEventListener('click', () => {
    if (!session?.nearDemoAvailable || busy || accountSubmitting) return;
    nearAuthButtons.forEach(control => { control.disabled = true; });
    beginNearAuth();
  });
});

function renderAccountView(): void {
  setAccountFeedback('');
  if (!sessionSynchronized) {
    accountTitle.textContent = 'Chưa tải được phiên';
    accountDescription.textContent = 'Thao tác Farm đang tạm khóa để bảo vệ dữ liệu';
    accountNav.hidden = true;
    viewRegister.hidden = true;
    viewLogin.hidden = true;
    viewProfile.hidden = true;
    viewUnavailable.hidden = true;
    viewSyncError.hidden = false;
    syncErrorText.textContent = 'Không thể đồng bộ dữ liệu phiên nông trại từ máy chủ. Vui lòng bấm thử lại để tiếp tục chơi.';
  } else if (session?.account) {
    viewSyncError.hidden = true;
    accountTitle.textContent = 'Tài khoản Nông Trại Mộng Mơ';
    accountDescription.textContent = 'Nông trại đã liên kết với tài khoản';
    accountNav.hidden = true;
    viewRegister.hidden = true;
    viewLogin.hidden = true;
    viewProfile.hidden = false;
    viewUnavailable.hidden = true;
    profileUsername.textContent = session.account.username;
  } else if (session && !session.accountsAvailable) {
    viewSyncError.hidden = true;
    accountTitle.textContent = 'Tài khoản tạm gián đoạn';
    accountDescription.textContent = 'Tính năng tài khoản chưa khả dụng';
    accountNav.hidden = true;
    viewRegister.hidden = true;
    viewLogin.hidden = true;
    viewProfile.hidden = true;
    viewUnavailable.hidden = false;
    unavailableText.textContent = 'Chưa kết nối được tài khoản. Hãy thử lại sau.';
  } else {
    viewSyncError.hidden = true;
    accountTitle.textContent = 'Tài khoản Nông Trại Mộng Mơ';
    accountDescription.textContent = activeAccountTab === 'register'
      ? 'Tạo tài khoản để lưu nông trại đang chơi'
      : 'Đăng nhập vào nông trại của bạn';
    accountNav.hidden = false;
    viewProfile.hidden = true;
    viewUnavailable.hidden = true;
    for (const tab of accountTabs) {
      tab.setAttribute('aria-pressed', String(tab.dataset.accountTab === activeAccountTab));
    }
    viewRegister.hidden = activeAccountTab !== 'register';
    viewLogin.hidden = activeAccountTab !== 'login';
  }
}

function openAccountDialog(): void {
  hidePlotTooltip();
  renderAccountView();
  if (!accountDialog.open) {
    accountDialog.showModal();
    if (session?.account) {
      btnAccountLogout.focus();
    } else if (session?.accountsAvailable) {
      const input = activeAccountTab === 'register'
        ? document.querySelector<HTMLInputElement>('#reg-username')
        : document.querySelector<HTMLInputElement>('#login-username');
      input?.focus();
    }
  }
}

function farmTime(): number {
  return snapshot.serverTime + performance.now() - receivedAt;
}

function careUnavailable(tool: CareTool, plot: Plot | null, now: number): string | undefined {
  if (!plot || plot.harvested) return 'Chỉ chăm được cây đang lớn.';
  if (now >= ripeAt(crops[plot.cropId - 1], plot)) return 'Cây đã chín. Tắt công cụ để thu hoạch.';
  if (tool === 'water' && plot.watered) return 'Cây đã được tưới trong vụ này.';
  if (tool === 'fertilize' && plot.fertilized) return 'Cây đã được bón phân trong vụ này.';
  if (tool === 'fertilize' && !(snapshot.farm.fertilizer ?? 0)) return noFertilizer;
}

function updateToolHint(): void {
  const tool = !visit && sessionSynchronized ? activeCareTool : undefined;
  if (tool) field.dataset.careTool = tool;
  else delete field.dataset.careTool;
  buttons.forEach((button) => {
    if (button.hasAttribute('aria-pressed')) {
      button.setAttribute('aria-pressed', String(button.dataset.tool === tool));
    }
  });
  plotButtons.slice(0, positions.length).forEach((button, index) => {
    button.classList.toggle('is-care-target', Boolean(tool && !careUnavailable(tool, snapshot.farm.plots[index], farmTime())));
  });
  if (activeTooltipPlot !== null) updatePlotTooltipContent(activeTooltipPlot);
  updateGuidedTour();
  hint.textContent = guideActive || visit ? farmGuide() : '';
}

function finishGuidedTour(): void {
  guideActive = false;
  field.classList.remove('is-guided');
  field.classList.add('is-tour-ended');
  hint.textContent = '';
  guideMessage.textContent = '';
  guideFeedback.textContent = '';
  setFeedback('');
  hidePlotTooltip();
  guideDialog.hidden = true;
  guideShade.hidden = true;
  guidedPanel = undefined;
  document.querySelectorAll('.guide-pulse').forEach(target => target.classList.remove('guide-pulse'));
  try { localStorage.setItem(guideStorageKey, '1'); } catch { /* Continue without browser storage. */ }
  hudAccountBtn.focus();
}

function positionGuide(target?: HTMLElement): void {
  guideSpotlight = target;
  guideShade.hidden = !target;
  guideDialog.style.removeProperty('top');
  guideDialog.style.removeProperty('bottom');
  const bubbleHeight = guideDialog.getBoundingClientRect().height;
  if (!target) {
    guideDialog.style.top = innerHeight < 480 ? '8px' : 'max(90px, env(safe-area-inset-top))';
    return;
  }
  const rect = target.getBoundingClientRect();
  const left = Math.max(0, rect.left - 5);
  const top = Math.max(0, rect.top - 5);
  const right = Math.min(innerWidth, rect.right + 5);
  const bottom = Math.min(innerHeight, rect.bottom + 5);
  const regions = [
    [0, 0, innerWidth, top],
    [0, top, left, bottom - top],
    [right, top, innerWidth - right, bottom - top],
    [0, bottom, innerWidth, innerHeight - bottom],
  ];
  [...guideShade.children].forEach((part, index) => {
    const [x, y, width, height] = regions[index];
    Object.assign((part as HTMLElement).style, {
      left: x + 'px', top: y + 'px', width: width + 'px', height: height + 'px',
    });
  });
  const below = bottom + 14;
  const bubbleTop = below + bubbleHeight < innerHeight - 12 ? below : Math.max(8, top - bubbleHeight - 14);
  guideDialog.style.top = bubbleTop + 'px';
  guideDialog.classList.toggle('tail-down', bubbleTop < top);
}

function updateGuidedTour(): void {
  if (!snapshot || !plotButtons.length) return;
  if (!guideChecked) {
    guideChecked = true;
    guideActive = snapshot.farm.revision === 0;
    try {
      guideActive = guideActive && !localStorage.getItem(guideStorageKey);
      localStorage.setItem(guideStorageKey, '1');
    } catch { /* Continue without browser storage. */ }
  }
  field.classList.toggle('is-tour-ended', !guideActive);
  if (!guideActive) return;
  field.classList.add('is-guided');
  if (visit || !sessionSynchronized || accountSubmitting) {
    finishGuidedTour();
    return;
  }
  const produce = Object.values(snapshot.farm.produce).reduce((sum, count) => sum + count, 0);
  if (produce > 0) guideHadProduce = true;
  if (guideHadProduce && produce === 0 && snapshot.farm.revision === confirmedRevision) {
    trackEvent('tutorial_complete');
    finishGuidedTour();
    return;
  }
  if (document.querySelector('dialog[open]')) {
    guideDialog.hidden = true;
    guideShade.hidden = true;
    document.querySelectorAll('.guide-pulse').forEach(target => target.classList.remove('guide-pulse'));
    return;
  }
  const farm = snapshot.farm;
  const ripe = farm.plots.findIndex(plot => plot && !plot.harvested && farmTime() >= ripeAt(crops[plot.cropId - 1], plot));
  const harvested = farm.plots.findIndex(plot => plot?.harvested);
  const growing = farm.plots.some(plot => plot && !plot.harvested);
  let area: Panel | undefined;
  let plotTarget: number | undefined;
  let label = '';
  let message = '';
  let action = () => {};
  if (activeCareTool) {
    message = farmGuide();
  } else if (ripe >= 0) {
    message = 'Chín rồi! Chạm vào cây để hái quả nhé.';
    plotTarget = ripe;
  } else if (harvested >= 0) {
    message = 'Chạm gốc cây nhấp nháy để dọn đất cho vụ mới nhé!';
    plotTarget = harvested;
  } else if (produce > 0) {
    area = 'warehouse';
    label = 'Mở Kho nông sản';
    message = 'Mang quả vào Kho bán lấy Gold nào!';
  } else if (growing) {
    const nextRipe = Math.min(...farm.plots.filter(plot => plot && !plot.harvested)
      .map(plot => ripeAt(crops[plot!.cropId - 1], plot!)));
    message = `Cây đang lớn, còn ${Math.max(0, Math.ceil((nextRipe - farmTime()) / 1000))} giây. Bạn cứ khám phá ruộng nhé!`;
  } else if (selectedCropId !== undefined) {
    plotTarget = farm.plots.findIndex(plot => !plot);
    message = 'Hạt sẵn sàng rồi! Chạm ô đất nhấp nháy để gieo nhé.';
  } else if (Object.values(farm.seeds).some(count => count > 0)) {
    area = 'bag';
    label = 'Mở Túi hạt';
    message = 'Mở Túi, chọn hạt vừa mua để gieo nhé!';
  } else {
    area = 'shop';
    label = 'Mở Tiệm hạt';
    message = 'Chào bạn! Ghé Tiệm hạt mua một hạt Dâu tây để bắt đầu nhé.';
  }
  let spotlight: HTMLElement | undefined;
  const targets = new Set<HTMLElement>();
  if (area) {
    const next = area;
    action = () => showPanel(next);
    const target = buttons.find(button => button.dataset.tool === next && button.getClientRects().length > 0)
      ?? document.querySelector<HTMLElement>('#toggle-right')!;
    targets.add(target);
    if (!introducedAreas.has(next)) spotlight = target;
  }
  if (plotTarget !== undefined && plotTarget >= 0) targets.add(plotButtons[plotTarget]);
  document.querySelectorAll<HTMLElement>('[data-tool], .plot-targets button, #toggle-right')
    .forEach(target => target.classList.toggle('guide-pulse', targets.has(target)));
  guideMessage.textContent = message;
  guideAction.textContent = label;
  guideAction.hidden = !area;
  guideAction.disabled = busy;
  guideFeedback.textContent = feedback.textContent;
  guideAction.onclick = action;
  guideDialog.hidden = false;
  positionGuide(spotlight);
}

guideSkip.onclick = () => {
  trackEvent('tutorial_skip');
  finishGuidedTour();
};
dialog.addEventListener('close', () => {
  if (guideActive && guidedPanel && !guidePanelCompleted) finishGuidedTour();
  guidedPanel = undefined;
  guidePanelCompleted = false;
  updateToolHint();
});
window.addEventListener('pagehide', () => {
  if (guideActive) finishGuidedTour();
});
window.addEventListener('resize', () => { if (guideActive) updateGuidedTour(); });
document.addEventListener('focusin', event => {
  if (!guideActive || guideShade.hidden || !guideSpotlight) return;
  const target = event.target as Node;
  if (!guideDialog.contains(target) && !guideSpotlight.contains(target)) guideAction.focus();
});

function farmGuide(): string {
  if (visit) return 'Bấm vào ô có chữ “Lấy 1 quả”.';
  if (!snapshot || !crops.length) return 'Đang mở nông trại…';
  if (!sessionSynchronized) return 'Phiên chơi chưa đồng bộ. Thao tác Farm đang tạm khóa.';
  if (activeCareTool === 'water') return 'Chạm cây đang lớn để tưới miễn phí. Bấm lại nút để thoát.';
  if (activeCareTool === 'fertilize') return 'Chạm cây đang lớn để bón phân. Bấm lại nút để thoát.';

  const farm = snapshot.farm;
  const now = farmTime();

  // Count plot states for the 6 farming plots
  let ripeCount = 0;
  let harvestedCount = 0;
  let emptyCount = 0;
  let growingCount = 0;
  let minRemainingSeconds = Infinity;

  farm.plots.slice(0, 6).forEach((plot) => {
    if (!plot) {
      emptyCount++;
    } else if (plot.harvested) {
      harvestedCount++;
    } else {
      const crop = crops[plot.cropId - 1];
      const remaining = Math.max(0, Math.ceil((ripeAt(crop, plot) - now) / 1000));
      if (remaining <= 0) {
        ripeCount++;
      } else {
        growingCount++;
        if (remaining < minRemainingSeconds) minRemainingSeconds = remaining;
      }
    }
  });

  const totalSeeds = Object.values(farm.seeds).reduce((sum, count) => sum + count, 0);
  const totalProduce = Object.values(farm.produce).reduce((sum, count) => sum + count, 0);

  // Priority 1: Crops ripe and ready to harvest
  if (ripeCount > 0) {
    return `Có ${ripeCount} ô đã chín. Bấm vào ô để hái quả (+1 XP).`;
  }

  // Priority 2: Harvested plots need clearing
  if (harvestedCount > 0) {
    return `Có ${harvestedCount} ô cần dọn đất. Bấm vào gốc để dọn (+3 XP).`;
  }

  // Priority 3: Player actively holding seeds to plant
  if (selectedCropId !== undefined && emptyCount > 0) {
    const crop = crops[selectedCropId - 1];
    return `Đang chọn hạt ${crop.name}. Bấm vào ô đất trống để gieo (+5 XP).`;
  }

  // Priority 4: Player has seeds in bag and has empty plots to plant
  if (totalSeeds > 0 && emptyCount > 0) {
    return `Túi có ${totalSeeds} hạt giống. Mở Túi hạt và chọn hạt để gieo vào ${emptyCount} ô trống (+5 XP).`;
  }

  if (totalProduce > 0) {
    return `Có ${totalProduce} nông sản trong kho. Mở Kho nông sản để bán lấy Gold.`;
  }

  if (totalSeeds === 0 && emptyCount > 0) {
    const seed = crops.reduce((cheapest, crop) => crop.buyPrice < cheapest.buyPrice ? crop : cheapest);
    if (farm.gold >= seed.buyPrice) {
      return `Bạn có ${farm.gold} Gold. Vào Tiệm hạt mua hạt giống (ví dụ ${seed.name} ${seed.buyPrice} Gold).`;
    }
  }

  if (growingCount > 0) {
    return `${growingCount} ô đang lớn. Cây chín sớm nhất sau ${minRemainingSeconds}s.`;
  }

  return 'Chưa đủ Gold để mua hạt giống.';
}

function updatePlotTooltipContent(plotIndex: number): void {
  if (!snapshot || !crops.length) return;

  const plotNum = plotIndex + 1;
  const isLocked = plotIndex >= positions.length;

  if (isLocked) {
    tooltipTitle.textContent = `Ô đất ${plotNum}`;
    tooltipBadge.textContent = 'Đang khóa';
    tooltipBadge.className = 'plot-tooltip-badge badge-locked';
    tooltipDesc.textContent = 'Ô này chưa canh tác được.';
    tooltipMeta.hidden = true;
    return;
  }

  const plot = snapshot.farm.plots[plotIndex];
  const now = farmTime();
  const careIssue = activeCareTool && careUnavailable(activeCareTool, plot, now);

  if (!plot) {
    tooltipTitle.textContent = `Ô đất ${plotNum}`;
    tooltipBadge.textContent = 'Đất trống';
    tooltipBadge.className = 'plot-tooltip-badge';
    if (careIssue) {
      tooltipDesc.textContent = careIssue;
      tooltipMeta.hidden = true;
    } else if (selectedCropId !== undefined) {
      tooltipDesc.textContent = `Bấm để gieo ${crops[selectedCropId - 1].name} (-1 hạt)`;
      tooltipMeta.hidden = false;
      tooltipXp.textContent = '+5 XP khi gieo';
      tooltipTimer.textContent = 'Đất sẵn sàng';
    } else {
      tooltipDesc.textContent = 'Bấm để mở Túi hạt.';
      tooltipMeta.hidden = true;
    }
  } else if (plot.harvested) {
    tooltipTitle.textContent = `Ô đất ${plotNum} · Gốc cây`;
    tooltipBadge.textContent = 'Cần dọn đất';
    tooltipBadge.className = 'plot-tooltip-badge badge-harvested';
    tooltipDesc.textContent = careIssue ?? 'Bấm vào gốc để dọn đất.';
    tooltipMeta.hidden = false;
    tooltipXp.textContent = '+3 XP khi dọn';
    tooltipTimer.textContent = 'Cần dọn dẹp';
  } else {
    const crop = crops[plot.cropId - 1];
    const cropName = crop ? crop.name : 'Cây trồng';
    const remaining = Math.max(0, Math.ceil((ripeAt(crop, plot) - now) / 1000));
    if (remaining <= 0) {
      tooltipTitle.textContent = `Ô đất ${plotNum} · ${cropName}`;
      tooltipBadge.textContent = 'Đã chín!';
      tooltipBadge.className = 'plot-tooltip-badge badge-ripe';
      tooltipDesc.textContent = careIssue ?? 'Bấm vào cây để thu hoạch.';
      tooltipMeta.hidden = false;
      tooltipXp.textContent = '+1 XP';
      tooltipTimer.textContent = 'Sản lượng 10–29 quả';
    } else {
      const stage = stageAt(crop, plot, now);
      tooltipTitle.textContent = `Ô đất ${plotNum} · ${cropName}`;
      tooltipBadge.textContent = `Giai đoạn ${stage}/${crop.stages}`;
      tooltipBadge.className = 'plot-tooltip-badge badge-growing';
      const care = [
        plot.watered ? 'Đã tưới' : '',
        plot.fertilized ? 'Đã bón phân' : '',
      ].filter(Boolean);
      if (activeCareTool) {
        tooltipDesc.textContent = careIssue ?? (activeCareTool === 'water'
          ? 'Bấm để tưới miễn phí.'
          : 'Bấm để bón phân.');
      } else {
        tooltipDesc.textContent = care.length ? care.join(' · ') : 'Cây đang lớn khỏe mạnh.';
      }
      tooltipMeta.hidden = false;
      tooltipXp.textContent = 'Đang phát triển';
      tooltipTimer.textContent = `Còn ${remaining}s nữa chín`;
    }
  }
}

function positionPlotTooltip(plotIndex: number): void {
  const btn = plotButtons[plotIndex];
  const rect = btn.getBoundingClientRect();
  const fieldRect = field.getBoundingClientRect();

  const centerX = rect.left + rect.width / 2 - fieldRect.left;
  const topY = rect.top - fieldRect.top - 8;

  plotTooltip.style.left = `${centerX}px`;
  plotTooltip.style.top = `${topY}px`;
}

function showPlotTooltip(plotIndex: number): void {
  if (visit || !sessionSynchronized || document.querySelector('dialog[open]')) return;
  if (activeTooltipPlot !== plotIndex) {
    hidePlotTooltip();
    plotButtons[plotIndex].setAttribute('aria-describedby', plotTooltip.id);
  }
  activeTooltipPlot = plotIndex;
  updatePlotTooltipContent(plotIndex);
  positionPlotTooltip(plotIndex);
  plotTooltip.classList.add('is-visible');
  plotTooltip.setAttribute('aria-hidden', 'false');
}

function hidePlotTooltip(): void {
  if (activeTooltipPlot !== null) plotButtons[activeTooltipPlot].removeAttribute('aria-describedby');
  activeTooltipPlot = null;
  plotTooltip.classList.remove('is-visible');
  plotTooltip.setAttribute('aria-hidden', 'true');
}

function attachPlotTooltip(button: HTMLButtonElement, plot: number): void {
  button.addEventListener('pointerenter', (event) => {
    const focusedPlot = plotTargets.querySelector('button:focus-visible');
    if (event.pointerType === 'touch' || !focusedPlot || focusedPlot === button) showPlotTooltip(plot);
  });
  button.addEventListener('pointerleave', (event) => {
    if (event.pointerType !== 'touch' && activeTooltipPlot === plot && !button.matches(':focus-visible')) {
      hidePlotTooltip();
    }
  });
  button.addEventListener('focus', () => {
    if (button.matches(':focus-visible')) showPlotTooltip(plot);
  });
  button.addEventListener('blur', () => {
    if (activeTooltipPlot === plot) hidePlotTooltip();
  });
}

function initKeyboardShortcuts(): void {
  document.addEventListener('keydown', (event) => {
    if (farmTradeVisit?.isOpen()) return;
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    if (event.key === 'Escape') {
      if (guideActive) finishGuidedTour();
      if (dialog.open || accountDialog.open) event.preventDefault();
      if (dialog.open) dialog.close();
      if (accountDialog.open) accountDialog.close();
      hidePlotTooltip();
      if (activeCareTool) {
        activeCareTool = undefined;
        setFeedback('');
        updateToolHint();
      }
      return;
    }

    if (guideActive && !guideShade.hidden && /^[1-3]$/.test(event.key)) {
      event.preventDefault();
      return;
    }

    if (visit || document.querySelector('dialog[open]') || event.ctrlKey || event.altKey || event.metaKey || event.repeat) return;

    if (event.key === '1') {
      event.preventDefault();
      showPanel('shop');
    } else if (event.key === '2') {
      event.preventDefault();
      showPanel('bag');
    } else if (event.key === '3') {
      event.preventDefault();
      showPanel('warehouse');
    }
  });
}

const batchQueue = new BatchQueueManager({
  getExpectedRevision: () => confirmedRevision,
  sendBatch: (batch) => {
    const body: FarmBatchRequest = { ...batch, sessionKey: session!.sessionKey };
    return request<FarmResponse>(FARM_API.batch.path, body, AbortSignal.timeout(15_000));
  },
  onSuccess: (result, actions) => {
    for (const action of actions) trackFarmAction(action);
    confirmedRevision = result.farm.revision;
    const farm = structuredClone(result.farm);
    const now = result.serverTime;
    for (const action of batchQueue.pendingActions) {
      try {
        applyFarmAction(farm, { ...action, expectedRevision: farm.revision }, now, crops);
      } catch {
        // The server can validate this intent against the state at its next write.
        break;
      }
    }
    setSnapshot({ ...result, farm }, true);
    if (guideActive && guidedPanel === 'shop' && actions.some(action => action.type === 'buy')) {
      guidePanelCompleted = true;
      dialog.close();
    }
    if (!batchQueue.length && result.message) {
      const hasOrder = actions.some(action => action.type === 'buy' || action.type === 'buyFertilizer' || action.type === 'sell');
      const message = hasOrder && actions.length > 1 ? 'Đã lưu các thao tác nông trại.' : result.message;
      showFarmSyncFeedback(message, 'success');
    }
  },
  onError: (error) => {
    const message = error instanceof FarmRateLimitError
      ? error.message
      : 'Chưa lưu được thao tác. Hãy kiểm tra kết nối.';
    showFarmSyncFeedback(message, 'warning');
  },
  onConflict: async (error) => {
    sessionSynchronized = false;
    updateCommunityAccess();
    try {
      const latest = await request<FarmSessionResponse>(FARM_API.read.path, undefined, AbortSignal.timeout(15_000));
      setSnapshot(latest);
      const message = error instanceof Error ? error.message : 'Thao tác chưa được đồng bộ.';
      showFarmSyncFeedback(message, 'warning');
    } catch {
      updateToolHint();
      showFarmSyncFeedback('Chưa tải lại được nông trại. Mở Tài khoản để thử lại.', 'error');
    }
  },
});

function trackFarmAction(action: FarmAction): void {
  const event = farmActionEvent(action);
  trackEvent(event.name, event.params);
}

function showFarmSyncFeedback(message: string, type: 'success' | 'warning' | 'error'): void {
  setFeedback(message, type);
  if (dialog.open) {
    showInventoryToast(message, type);
    panelFeedback.textContent = message;
  }
}

function queueFarmAction(action: FarmAction): FarmResponse | undefined {
  if (visit || busy || accountSubmitting) return;
  if (!sessionSynchronized) {
    showFarmSyncFeedback('Chưa tải được phiên nông trại. Hãy kiểm tra kết nối và thử lại.', 'error');
    return;
  }
  try {
    const now = farmTime();
    const farm = structuredClone(snapshot.farm);
    const message = applyFarmAction(farm, { ...action, expectedRevision: farm.revision }, now, crops);
    if (farm.revision === snapshot.farm.revision) {
      showFarmSyncFeedback(message, 'success');
      return;
    }
    batchQueue.enqueue(action);
    const result: FarmResponse = { farm, serverTime: now, message };
    setSnapshot(result, true);
    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Thao tác gặp lỗi.';
    showFarmSyncFeedback(msg, 'error');
    return;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') batchQueue.flush();
});

window.addEventListener('pagehide', () => batchQueue.flush());
window.addEventListener('online', () => batchQueue.retry());

async function send(action: FarmAction): Promise<FarmResponse | undefined> {
  if (visit || busy || accountSubmitting) return;
  if (!sessionSynchronized) {
    setFeedback('Chưa tải được phiên nông trại. Hãy kiểm tra kết nối và thử lại.', 'error');
    if (dialog.open) {
      showInventoryToast('Chưa tải được phiên nông trại. Hãy kiểm tra kết nối và thử lại.', 'error');
      panelFeedback.textContent = feedback.textContent;
    }
    return;
  }
  busy = true;
  updateAccountButtons();
  let requestStarted = false;
  try {
    await batchQueue.flushAndWait();
    const mutation: FarmMutation = { ...action, expectedRevision: confirmedRevision };
    requestStarted = true;
    const result = await request<FarmResponse>(FARM_API[action.type].path, mutation);
    setSnapshot(result);
    trackFarmAction(action);
    if (result.message) {
      setFeedback(result.message, 'success');
      if (dialog.open) {
        showInventoryToast(result.message, 'success');
        panelFeedback.textContent = result.message;
      }
    }
    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Thao tác gặp lỗi.';
    setFeedback(msg, 'error');
    if (requestStarted && error instanceof Error && (error.cause === 401 || error.cause === 409)) {
      const latest = await request<FarmSessionResponse>(FARM_API.read.path).catch(() => undefined);
      if (latest) {
        setSnapshot(latest);
      }
    }
    if (dialog.open) {
      showInventoryToast(msg, 'error');
      panelFeedback.textContent = msg;
    }
  } finally {
    busy = false;
    updateAccountButtons();
    updateToolHint();
  }
}

function createInventoryCard(key: string, name: string, imagePath: string, summary: string) {
  const item = document.createElement('article');
  item.className = 'item';
  item.dataset.item = key;
  const art = document.createElement('div');
  art.className = 'item-art';
  const icon = document.createElement('img');
  icon.src = asset(imagePath);
  icon.alt = '';
  art.append(icon);
  const details = document.createElement('div');
  details.className = 'item-details';
  const title = document.createElement('h3');
  title.textContent = name;
  const info = document.createElement('small');
  info.textContent = summary;
  details.append(title, info);
  const controls = document.createElement('div');
  controls.className = 'item-controls';
  item.append(art, details, controls);
  return { item, controls };
}

function appendInventoryOrder(controls: HTMLElement, name: string, type: 'buy' | 'sell', max: number, submit: (quantity: number) => void): void {
  const { stepper, quantity } = createQuantity(name, max, type === 'buy' ? 1 : 0);
  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'item-action';
  action.textContent = type === 'buy' ? 'Mua' : 'Bán';
  action.setAttribute('aria-label', `${action.textContent} ${name}`);
  action.onclick = () => {
    if (!quantity.checkValidity()) {
      quantity.classList.remove('is-invalid');
      void quantity.offsetWidth;
      quantity.classList.add('is-invalid');
      showInventoryToast('Số lượng không hợp lệ.', 'error');
      return;
    }
    submit(quantity.valueAsNumber);
  };
  controls.append(stepper, action);
}

function renderPanel(): void {
  const { title, description, icon: panelIcon } = panelInfo[activePanel];
  dialog.querySelector('#inventory-title')!.textContent = title;
  dialog.querySelector('#inventory-description')!.textContent = description;
  dialog.querySelector<HTMLImageElement>('#inventory-icon')!.src = asset(`icon/topbutton%20(${panelIcon}).png`);
  for (const tab of panelTabs) tab.setAttribute('aria-pressed', String(tab.dataset.panel === activePanel));
  const previousScroll = panel.scrollTop;
  if (panel.dataset.panel !== activePanel) {
    panel.replaceChildren();
    panel.dataset.panel = activePanel;
  }
  const existing = new Map([...panel.querySelectorAll<HTMLElement>('[data-item]')]
    .map(item => [item.dataset.item!, item]));
  const cards: HTMLElement[] = [];
  if (activePanel === 'shop') {
    const summary = `${FERTILIZER_COST} Gold/bịch · Đang có ${snapshot.farm.fertilizer ?? 0} bịch`;
    const fertilizer = existing.get('fertilizer');
    if (fertilizer) {
      fertilizer.querySelector('small')!.textContent = summary;
      cards.push(fertilizer);
    } else {
      const { item, controls } = createInventoryCard('fertilizer', 'Phân bón', 'icon/fertilizer-sack.png', summary);
      appendInventoryOrder(controls, 'phân bón', 'buy', 99, quantity => queueFarmAction({ type: 'buyFertilizer', quantity }));
      cards.push(item);
    }
  }
  for (const crop of crops) {
    const seeds = snapshot.farm.seeds[crop.id] ?? 0;
    const produce = snapshot.farm.produce[crop.id] ?? 0;
    if (activePanel === 'bag' && seeds === 0) continue;
    if (activePanel === 'warehouse' && produce === 0) continue;

    const artPaths = cropArt(crop);
    const summary = activePanel === 'shop' ? `${crop.buyPrice} Gold/hạt · Cấp tham khảo ${crop.level}`
      : activePanel === 'bag' ? `Còn ${seeds} hạt` : `${produce} quả · ${crop.sellPrice} Gold/quả`;
    const key = String(crop.id);
    const current = existing.get(key);
    if (current) {
      current.querySelector('small')!.textContent = summary;
      const quantity = current.querySelector<HTMLInputElement>('input');
      if (activePanel === 'warehouse' && quantity) {
        const max = Math.min(999, produce);
        quantity.max = String(max);
        if (quantity.valueAsNumber > max) quantity.value = quantity.max;
      }
      cards.push(current);
      continue;
    }
    const { item, controls } = createInventoryCard(key, crop.name,
      activePanel === 'warehouse' ? artPaths.produce : artPaths.seedBag, summary);
    if (activePanel === 'bag') {
      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'item-action';
      action.textContent = 'Chọn gieo';
      action.setAttribute('aria-label', `Chọn gieo ${crop.name}`);
      action.onclick = () => {
        guidePanelCompleted = true;
        dialog.close();
        selectedCropId = crop.id;
        activeCareTool = undefined;
        updateToolHint();
      };
      controls.append(action);
    } else {
      const type = activePanel === 'shop' ? 'buy' : 'sell';
      appendInventoryOrder(controls, crop.name, type, type === 'buy' ? 99 : Math.min(999, produce),
        quantity => queueFarmAction({ type, cropId: crop.id, quantity }));
    }
    cards.push(item);
  }
  if (!cards.length) {
    if (panel.firstElementChild?.classList.contains('inventory-empty')) return;
    const empty = document.createElement('div');
    empty.className = 'inventory-empty';
    const icon = document.createElement('img');
    icon.src = asset(`icon/topbutton%20(${panelIcon}).png`);
    icon.alt = '';
    const label = document.createElement('h3');
    label.textContent = activePanel === 'bag' ? 'Chưa có hạt giống' : 'Chưa có nông sản';
    const note = document.createElement('p');
    note.textContent = activePanel === 'bag' ? 'Mua hạt giống trong Tiệm hạt.' : 'Thu hoạch cây chín để đưa nông sản về kho.';
    empty.append(icon, label, note);
    panel.replaceChildren(empty);
  } else {
    const visible = new Set(cards);
    for (const child of Array.from(panel.children)) {
      if (!visible.has(child as HTMLElement)) child.remove();
    }
    cards.forEach((card, index) => {
      const current = panel.children[index];
      if (current !== card) panel.insertBefore(card, current ?? null);
    });
  }
  panel.scrollTop = previousScroll;
}

function createQuantity(name: string, max: number, min: number): { stepper: HTMLDivElement; quantity: HTMLInputElement } {
  const stepper = document.createElement('div');
  stepper.className = 'quantity-stepper';
  const quantity = document.createElement('input');
  quantity.type = 'number';
  quantity.inputMode = 'numeric';
  quantity.required = true;
  quantity.min = String(min);
  quantity.max = String(max);
  quantity.value = '1';
  quantity.setAttribute('aria-label', `Số lượng ${name}`);
  const decrease = document.createElement('button');
  const increase = document.createElement('button');
  decrease.type = increase.type = 'button';
  decrease.textContent = '−';
  increase.textContent = '+';
  decrease.setAttribute('aria-label', `Giảm số lượng ${name}`);
  increase.setAttribute('aria-label', `Tăng số lượng ${name}`);
  decrease.onclick = () => {
    quantity.value = String(Math.max(min, Math.min(Number(quantity.max), (quantity.valueAsNumber || 0) - 1)));
    quantity.classList.remove('is-invalid');
  };
  increase.onclick = () => {
    quantity.value = String(Math.max(min, Math.min(Number(quantity.max), (quantity.valueAsNumber || 0) + 1)));
    quantity.classList.remove('is-invalid');
  };
  quantity.addEventListener('input', () => {
    quantity.classList.remove('is-invalid');
    hideInventoryToast();
  });
  stepper.append(decrease, quantity, increase);
  return { stepper, quantity };
}

function showPanel(next: Panel): void {
  if (guideActive) {
    introducedAreas.add(next);
    guidedPanel = next;
    guidePanelCompleted = false;
    guideDialog.hidden = true;
    guideShade.hidden = true;
  }
  hidePlotTooltip();
  hideInventoryToast();
  activePanel = next;
  panelFeedback.textContent = '';
  renderPanel();
  panel.scrollTop = 0;
  if (!dialog.open) dialog.showModal();
}

function openFertilizerShop(): void {
  activeCareTool = undefined;
  setFeedback('');
  showPanel('shop');
  updateToolHint();
  showInventoryToast(noFertilizer, 'info');
}

function initDrawers(): void {
  const hudToggle = document.querySelector<HTMLButtonElement>('#farm-hud-toggle')!;
  hudToggle.onclick = () => {
    const expanded = hudToggle.getAttribute('aria-expanded') !== 'true';
    hudToggle.setAttribute('aria-expanded', String(expanded));
    hudToggle.setAttribute('aria-label', expanded ? 'Thu gọn tiện ích Farm' : 'Mở tiện ích Farm');
  };
  const leftDrawer = document.querySelector<HTMLElement>('#drawer-left');
  const rightDrawer = document.querySelector<HTMLElement>('#drawer-right');
  const toggleLeft = document.querySelector<HTMLButtonElement>('#toggle-left');
  const toggleRight = document.querySelector<HTMLButtonElement>('#toggle-right');

  toggleLeft?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = leftDrawer?.classList.toggle('is-open');
    toggleLeft.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) {
      rightDrawer?.classList.remove('is-open');
      toggleRight?.setAttribute('aria-expanded', 'false');
    }
  });

  toggleRight?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = rightDrawer?.classList.toggle('is-open');
    toggleRight.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) {
      leftDrawer?.classList.remove('is-open');
      toggleLeft?.setAttribute('aria-expanded', 'false');
    }
  });

  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (leftDrawer?.classList.contains('is-open') && !leftDrawer.contains(target)) {
      leftDrawer.classList.remove('is-open');
      toggleLeft?.setAttribute('aria-expanded', 'false');
    }
    if (rightDrawer?.classList.contains('is-open') && !rightDrawer.contains(target)) {
      rightDrawer.classList.remove('is-open');
      toggleRight?.setAttribute('aria-expanded', 'false');
    }
  });
}

function attachControls(scene: FarmScene): void {
  initDrawers();
  accountDialog.addEventListener('click', (event) => {
    if (event.target === accountDialog) accountDialog.close();
  });
  if (accountToast) {
    accountToast.onclick = () => hideAccountToast();
  }
  [regUsernameInput, regPasswordInput, loginUsernameInput, loginPasswordInput].forEach((input) => {
    input?.addEventListener('input', () => {
      input.classList.remove('is-invalid');
      hideAccountToast();
    });
  });
  hudAccountBtn.onclick = () => openAccountDialog();
  for (const tab of accountTabs) {
    tab.onclick = () => {
      hideAccountToast();
      [regUsernameInput, regPasswordInput, loginUsernameInput, loginPasswordInput].forEach((input) => {
        input?.classList.remove('is-invalid');
      });
      activeAccountTab = tab.dataset.accountTab as 'register' | 'login';
      renderAccountView();
      const input = activeAccountTab === 'register'
        ? regUsernameInput
        : loginUsernameInput;
      input?.focus();
    };
  }

  function setAccountBusy(isBusy: boolean, statusText?: string): void {
    accountSubmitting = isBusy;
    updateAccountButtons();
    if (statusText) {
      setAccountFeedback(statusText, 'info');
    }
  }

  formRegister.onsubmit = async (event) => {
    event.preventDefault();
    if (busy || accountSubmitting) return;
    const usernameInput = regUsernameInput!;
    const passwordInput = regPasswordInput!;
    const username = usernameInput.value.trim().toLowerCase();
    const password = passwordInput.value;

    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      setAccountFeedback('Tên đăng nhập cần 3–24 chữ cái không dấu, chữ số hoặc dấu gạch dưới.', 'error', usernameInput);
      return;
    }
    if (password.length < 15 || password.length > 128) {
      setAccountFeedback('Mật khẩu cần từ 15–128 ký tự.', 'error', passwordInput);
      return;
    }

    setAccountBusy(true, 'Đang tạo tài khoản và lưu nông trại...');
    try {
      await batchQueue.flushAndWait();
      const res = await request<FarmSessionResponse>(ACCOUNT_API.register.path, { username, password });
      setSnapshot(res);
      trackEvent('sign_up', { method: 'password' });
      formRegister.reset();
      setFeedback(`Tài khoản ${res.account?.username ?? username} đã được tạo và lưu trữ nông trại!`, 'success');
      accountDialog.close();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Tạo tài khoản thất bại.';
      const targetInput = msg.toLowerCase().includes('tên đăng nhập') ? usernameInput : passwordInput;
      setAccountFeedback(msg, 'error', targetInput);
    } finally {
      setAccountBusy(false);
    }
  };

  formLogin.onsubmit = async (event) => {
    event.preventDefault();
    if (busy || accountSubmitting) return;
    const usernameInput = loginUsernameInput!;
    const passwordInput = loginPasswordInput!;
    const username = usernameInput.value.trim().toLowerCase();
    const password = passwordInput.value;

    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      setAccountFeedback('Tên đăng nhập cần 3–24 chữ cái không dấu, chữ số hoặc dấu gạch dưới.', 'error', usernameInput);
      return;
    }
    if (password.length < 15 || password.length > 128) {
      setAccountFeedback('Mật khẩu cần từ 15–128 ký tự.', 'error', passwordInput);
      return;
    }

    setAccountBusy(true, 'Đang đăng nhập...');
    try {
      await batchQueue.flushAndWait();
      const res = await request<FarmSessionResponse>(ACCOUNT_API.login.path, { username, password });
      setSnapshot(res);
      trackEvent('login', { method: 'password' });
      formLogin.reset();
      setFeedback(`Chào mừng ${res.account?.username ?? username} trở lại nông trại!`, 'success');
      accountDialog.close();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Đăng nhập thất bại.';
      setAccountFeedback(msg, 'error', passwordInput);
    } finally {
      setAccountBusy(false);
    }
  };

  btnAccountLogout.onclick = async () => {
    if (busy || accountSubmitting) return;
    setAccountBusy(true, 'Đang đăng xuất...');
    try {
      await batchQueue.flushAndWait();
      await request<void>(ACCOUNT_API.logout.path, {});
      batchQueue.reset();
      trackEvent('logout');
      session = undefined;
      sessionSynchronized = false;
      updateCommunityAccess();
      hudName.textContent = 'Khách';
      hudAccountBadge.textContent = 'Lỗi tải';
      hudAccountBtn.classList.remove('is-authenticated');
      hudAccountBtn.classList.add('is-offline');
      if (menuAccountLabel) menuAccountLabel.textContent = 'Khách';

      const guestSession = await request<FarmSessionResponse>(FARM_API.read.path);
      setSnapshot(guestSession);
      setFeedback('Đã đăng xuất. Bạn đang ở phiên Khách mới.', 'info');
      accountDialog.close();
    } catch (error) {
      setAccountFeedback(error instanceof Error ? error.message : 'Đăng xuất thất bại.', 'error');
      if (!sessionSynchronized) {
        setFeedback('Chưa tải được phiên nông trại. Hãy kiểm tra kết nối và thử lại.', 'error');
        hint.textContent = 'Phiên chơi chưa đồng bộ. Thao tác Farm đang tạm khóa.';
        renderAccountView();
      }
    } finally {
      setAccountBusy(false);
    }
  };

  btnRetrySync.onclick = async () => {
    if (busy || accountSubmitting) return;
    setAccountBusy(true, 'Đang tải lại phiên nông trại...');
    try {
      const res = await request<FarmSessionResponse>(FARM_API.read.path);
      setSnapshot(res);
      setFeedback('Đã kết nối và đồng bộ phiên nông trại thành công!', 'success');
      accountDialog.close();
    } catch (err) {
      setAccountFeedback(err instanceof Error ? err.message : 'Tải phiên thất bại. Vui lòng thử lại.', 'error');
      hudAccountBadge.textContent = 'Lỗi tải';
    } finally {
      setAccountBusy(false);
    }
  };

  for (const tab of panelTabs) tab.onclick = () => showPanel(tab.dataset.panel as Panel);
  for (const button of buttons) {
    button.disabled = false;
    button.onclick = () => {
      const tool = button.dataset.tool;
      if (tool === 'account') {
        openAccountDialog();
      } else if (tool === 'theme') {
        void queueFarmAction({ type: 'theme' });
      } else if (tool === 'water' || tool === 'fertilize') {
        if (tool === 'fertilize' && activeCareTool !== tool && !(snapshot.farm.fertilizer ?? 0)) {
          openFertilizerShop();
          return;
        }
        activeCareTool = activeCareTool === tool ? undefined : tool;
        setFeedback('');
        updateToolHint();
      } else if (tool === 'shop' || tool === 'bag' || tool === 'warehouse') {
        showPanel(tool);
      }
    };
  }
  positions.forEach((_, plot) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', `Ô đất ${plot + 1}`);
    button.onpointerenter = () => scene.highlightPlot(plot);
    button.onpointerleave = () => scene.highlightPlot();
    button.onfocus = () => {
      if (button.matches(':focus-visible')) scene.highlightPlot(plot);
    };
    button.onblur = () => scene.highlightPlot();
    attachPlotTooltip(button, plot);
    button.onkeydown = (event) => {
      if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
    };
    button.onclick = async (event) => {
      if (!sessionSynchronized) {
        setFeedback('Chưa tải được phiên nông trại. Hãy kiểm tra kết nối và thử lại.', 'error');
        return;
      }
      if (busy || event.detail > 1) return;
      const currentVisit = visit;
      if (currentVisit) {
        const crop = currentVisit.plots[plot];
        if (!crop?.canSteal) return;
        await runVisitAction(async () => {
          try {
            const action = { plot, plantedAt: crop.plantedAt };
            const result = await request<StealResponse>(playerPath(COMMUNITY_API.steal, currentVisit.username), action);
            setSnapshot(result);
            setVisit(result.visit);
            trackEvent('farm_steal', { blocked: Boolean(result.blocked) });
            if (result.blocked) {
              setFeedback('Pet giữ nhà đã chặn! Bạn chưa lấy được quả.', 'warning');
              scene.playPetGuard();
            } else {
              setFeedback(`Đã lấy 1 quả ${crops[crop.cropId - 1].name}. Xem trong Kho của bạn.`, 'success');
              scene.playPlotFeedback(plot, 'harvest', 1);
            }
          } catch (error) {
            if (error instanceof Error && error.cause === 409) {
              await refreshVisit(currentVisit.username).catch(() => undefined);
            }
            throw error;
          }
        });
        return;
      }
      const previous = snapshot.farm;
      const current = previous.plots[plot];
      const now = farmTime();
      if (event.pointerType === 'touch') showPlotTooltip(plot);
      let action: PlotAction;
      if (activeCareTool) {
        const issue = careUnavailable(activeCareTool, current, now);
        if (issue) {
          if (issue === noFertilizer) {
            openFertilizerShop();
            return;
          }
          showPlotTooltip(plot);
          setFeedback(issue, 'warning');
          return;
        }
        action = { type: activeCareTool, plot };
      } else if (current?.harvested) {
        action = { type: 'clear', plot };
      } else if (current) {
        if (now < ripeAt(crops[current.cropId - 1], current)) {
          showPlotTooltip(plot);
          return;
        }
        action = { type: 'harvest', plot };
      } else if (selectedCropId !== undefined) {
        action = { type: 'plant', cropId: selectedCropId, plot };
      } else {
        showPanel('bag');
        return;
      }

      const cropId = action.type === 'plant' ? action.cropId : current?.cropId;
      const previousProduce = cropId !== undefined ? (previous.produce[cropId] ?? 0) : 0;
      const result = queueFarmAction(action);
      if (!result) return;
      const amount = action.type === 'harvest' && cropId !== undefined
        ? (result.farm.produce[cropId] ?? 0) - previousProduce
        : 0;
      scene.playPlotFeedback(plot, action.type, amount);
    };
    plotTargets.append(button);
    plotButtons.push(button);
  });
  lockedPositions.forEach((_, index) => {
    const plotNumber = positions.length + index + 1;
    const plotIndex = positions.length + index;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'locked-plot';
    button.setAttribute('aria-label', `Ô đất ${plotNumber} · Đang khóa`);
    const badge = document.createElement('span');
    badge.className = 'plot-lock-badge';
    badge.textContent = 'Đang khóa';
    badge.setAttribute('aria-hidden', 'true');
    button.append(badge);
    attachPlotTooltip(button, plotIndex);
    button.onclick = () => {
      scene.wiggleLockedGate(index);
      showPlotTooltip(plotIndex);
      setFeedback(`Ô đất ${plotNumber} đang khóa.`, 'warning');
    };
    plotTargets.append(button);
    plotButtons.push(button);
  });
  initKeyboardShortcuts();
  document.addEventListener('pointerdown', (e) => {
    const target = e.target as HTMLElement;
    if (!target.closest('#plot-targets') && !target.closest('.bottom-dock') && !target.closest('.side-drawer') && !target.closest('.top-dropdown')) {
      hidePlotTooltip();
    }
  });
  if (gameToast) {
    gameToast.onclick = () => hideGameToast();
  }
  if (inventoryToast) {
    inventoryToast.onclick = () => hideInventoryToast();
  }
  dialog.addEventListener('close', () => {
    batchQueue.flush();
    hideInventoryToast();
    updateToolHint();
  });
  accountDialog.addEventListener('close', () => {
    hideAccountToast();
    [regUsernameInput, regPasswordInput, loginUsernameInput, loginPasswordInput].forEach((input) => {
      input?.classList.remove('is-invalid');
    });
    updateToolHint();
  });
  updateToolHint();
}

class FarmScene extends Phaser.Scene {
  private pet!: ReturnType<typeof createFarmPet>;
  private background!: Phaser.GameObjects.Image;
  private pondOverlay!: Phaser.GameObjects.Container;
  private ambientOverlay!: Phaser.GameObjects.Container;
  private ground!: Phaser.GameObjects.Container;
  private soilTiles: Phaser.GameObjects.Image[] = [];
  private lockedGates: Phaser.GameObjects.Image[] = [];
  private soilScale = 1;
  private highlightedPlot?: number;
  private visuals: { plant: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text }[] = [];
  private interfaceReady!: Promise<void>;
  private ready = false;
  private lastSparkleAt = 0;
  private lastPondRippleAt = 0;
  private lastAmbientAt = 0;
  private pondSpotIndex = 0;
  private lastPlotVisitKey = '';

  constructor() { super('Farm'); }

  playPetGuard(): void {
    this.pet.guard();
  }

  preload(): void {
    const textures: [key: string, path: string][] = [
      ...themes.map(({ file }, index): [string, string] => [`theme-${index + 1}`, `background/${file}`]),
      ['soil', 'soil/web-raised-bed.png'],
      ['locked-grass', 'soil/web-raised-grass.png'],
      ['fence-locked', 'soil/fence-locked.png'],
    ];
    const interfaceImages = new Map([...document.images]
      .filter(image => image.loading !== 'lazy' && !image.closest('#farm-loading'))
      .map(image => [image.src, image]));
    for (const crop of crops) {
      const art = cropArt(crop);
      const seedBag = new Image();
      seedBag.src = asset(art.seedBag);
      interfaceImages.set(seedBag.src, seedBag);
      const produce = new Image();
      produce.src = asset(art.produce);
      interfaceImages.set(produce.src, produce);
      textures.push([`crop-${crop.id}-0`, art.planted], [`crop-${crop.id}-end`, art.harvested]);
      for (let stage = 1; stage <= crop.stages; stage++) {
        const frame = stage === crop.stages ? crop.readyFrame : stage;
        textures.push([`crop-${crop.id}-${stage}`, art.frame(frame)]);
      }
    }

    this.load.on(Phaser.Loader.Events.FILE_COMPLETE, farmLoading.fileLoaded);
    this.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      console.error('Không tải được tài nguyên nông trại:', file.url);
      farmLoading.fail('Chưa tải được tài nguyên nông trại.');
    });
    for (const [key, path] of textures) this.load.image(key, asset(path));
    const petSprites = loadPetSprites(this.load);
    farmLoading.assets(textures.length + interfaceImages.size + petSprites);
    this.interfaceReady = Promise.all([...interfaceImages.values()].map(async image => {
      await image.decode();
      farmLoading.fileLoaded();
    })).then(() => {}).catch(error => {
      console.error('Không tải được ảnh giao diện nông trại:', error);
      farmLoading.fail('Chưa tải được ảnh giao diện nông trại.');
    });
  }

  create(): void {
    void this.interfaceReady.then(() => {
      if (farmLoading.failed) return;
      this.createFarm();
      this.ready = true;
      this.game.events.once(Phaser.Core.Events.POST_RENDER, () => {
        farmLoading.finish();
        if (farmLoading.failed) return;
        farmTradeVisit?.farmReady();
        trackEvent('game_boot', { load_ms: Math.round(performance.now()) });
        activity.start();
      });
    }).catch(error => {
      console.error('Không mở được cảnh nông trại:', error);
      farmLoading.fail('Chưa mở được nông trại.');
    });
  }

  private createFarm(): void {
    activeScene = this;
    this.background = this.add.image(0, 0, `theme-${snapshot.farm.theme}`);
    this.pondOverlay = this.add.container(0, 0);
    this.ambientOverlay = this.add.container(0, 0);
    this.ground = this.add.container(0, 0);
    this.paintFieldBank();
    this.ground.add(this.add.image(0, 0, 'field-bank').setOrigin(0));
    this.createPlotTextures();
    this.soilScale = (tileWidth - 8) / this.textures.get('soil').getSourceImage().width;
    this.soilTiles = positions.map(([x, y]) => this.add.image(x, y - 5, 'soil').setScale(this.soilScale));
    const grassScale = (tileWidth - 8) / this.textures.get('locked-grass').getSourceImage().width;
    const grassTiles = lockedPositions.map(([x, y]) => this.add.image(x, y - 3, 'locked-grass').setScale(grassScale));
    this.ground.add([...this.soilTiles, ...grassTiles].sort((a, b) => a.y - b.y));
    this.lockedGates = lockedPositions.map(([x, y]) => {
      const gate = this.add.image(x - 40, y + 19, 'locked-gate').setOrigin(.5, .8);
      this.ground.add(gate);
      return gate;
    });
    this.visuals = positions.map(([x, y]) => {
      const plant = this.add.image(x, y - 6, 'crop-1-0').setOrigin(.5, .84).setScale(cropScale).setVisible(false);
      const label = this.add.text(x, y + 16, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '15px',
        fontStyle: 'bold',
        color: '#fff8db',
        stroke: '#34241b',
        strokeThickness: 4,
      }).setOrigin(.5, 0);
      return { plant, label };
    });
    this.ground.add(this.visuals.map(({ plant }) => plant));
    this.ground.add(this.visuals.map(({ label }) => label));
    this.pet = createFarmPet(this, field, reduceMotion, async pet => queueFarmAction({ type: 'selectPet', pet }));
    attachControls(this);
    this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
    });
  }

  private paintFieldBank(): void {
    const texture = this.textures.exists('field-bank')
      ? this.textures.get('field-bank') as Phaser.Textures.CanvasTexture
      : this.textures.createCanvas('field-bank', width, height)!;
    const context = texture.getContext();
    const [x, y] = toPosition([1, 1]);
    const halfWidth = tileWidth * 1.5;
    const halfHeight = tileHeight * 1.5;
    const edge = new Path2D();
    edge.moveTo(-.05, -1.065);
    edge.bezierCurveTo(.035, -1.12, .13, -.99, .22, -.91);
    edge.bezierCurveTo(.49, -.64, .72, -.39, .99, -.12);
    edge.bezierCurveTo(1.095, -.02, 1.075, .075, .96, .16);
    edge.bezierCurveTo(.69, .39, .39, .76, .12, 1.02);
    edge.bezierCurveTo(.035, 1.11, -.06, 1.10, -.17, .98);
    edge.bezierCurveTo(-.45, .73, -.75, .42, -.98, .16);
    edge.bezierCurveTo(-1.09, .055, -1.08, -.035, -.98, -.13);
    edge.bezierCurveTo(-.71, -.43, -.35, -.75, -.05, -1.065);
    edge.closePath();
    const contour = new Path2D();
    contour.addPath(edge, new DOMMatrix([halfWidth, 0, 0, halfHeight, x, y]));

    const [light, shade] = themes[(visit?.theme ?? snapshot.farm.theme) - 1].bank;
    const gradient = context.createLinearGradient(x, y - halfHeight, x, y + halfHeight);
    gradient.addColorStop(0, light);
    gradient.addColorStop(1, shade);
    context.clearRect(0, 0, width, height);
    context.save();
    context.filter = 'blur(4px)';
    context.fillStyle = '#3c341e30';
    context.translate(0, 2);
    context.fill(contour);
    context.translate(0, -2);
    context.filter = 'blur(2px)';
    context.globalAlpha = .62;
    context.fillStyle = gradient;
    context.fill(contour);
    context.restore();
    texture.refresh();
  }

  private createPlotTextures(): void {
    if (this.textures.exists('soil-highlight')) return;
    const soil = this.textures.get('soil').getSourceImage() as HTMLImageElement;
    const highlight = this.textures.createCanvas('soil-highlight', soil.width, soil.height)!;
    const highlightContext = highlight.getContext();
    highlightContext.drawImage(soil, 0, 0);
    highlightContext.globalCompositeOperation = 'source-atop';
    highlightContext.fillStyle = 'rgba(255, 224, 150, .27)';
    highlightContext.fillRect(0, 0, soil.width, soil.height);
    highlight.refresh();

    const fence = this.textures.get('fence-locked').getSourceImage() as HTMLImageElement;
    const gateWidth = 62;
    const gateHeight = 61;
    const gateSlope = .22;
    const gateRise = Math.ceil(gateWidth * gateSlope);
    const gate = this.textures.createCanvas('locked-gate', gateWidth, gateHeight + gateRise)!;
    const gateContext = gate.getContext();
    gateContext.setTransform(-1, -gateSlope, 0, 1, gateWidth, gateRise);
    gateContext.drawImage(fence, 47, 10, gateWidth, gateHeight, 0, 0, gateWidth, gateHeight);
    gate.refresh();
  }

  highlightPlot(index?: number): void {
    if (this.highlightedPlot !== undefined) {
      const prev = this.soilTiles[this.highlightedPlot];
      prev.setTexture('soil');
      this.tweens.killTweensOf(prev);
      if (reduceMotion.matches) prev.setScale(this.soilScale);
      else this.tweens.add({ targets: prev, scale: this.soilScale, duration: 120, ease: 'Sine.Out' });
    }
    this.highlightedPlot = index;
    if (index !== undefined) {
      const next = this.soilTiles[index];
      next.setTexture('soil-highlight');
      this.tweens.killTweensOf(next);
      if (!reduceMotion.matches) {
        this.tweens.add({ targets: next, scale: this.soilScale * 1.025, duration: 120, ease: 'Sine.Out' });
      }
    }
  }

  private spawnRing(x: number, y: number, color: number, endScale = 1.4, duration = 380): void {
    const ring = this.add.circle(x, y, 14).setStrokeStyle(2.5, color, 0.9).setFillStyle(color, 0.14).setScale(0.35);
    this.ground.add(ring);
    this.tweens.add({
      targets: ring,
      scale: endScale,
      alpha: 0,
      duration,
      ease: 'Sine.Out',
      onComplete: () => ring.destroy(),
    });
  }

  private bouncePlant(index: number, targetScale: number, scaleX = 1.12, scaleY = 0.88): void {
    const { plant } = this.visuals[index];
    if (!plant.visible) return;
    this.tweens.killTweensOf(plant);
    plant.setScale(targetScale * scaleX, targetScale * scaleY);
    this.tweens.add({
      targets: plant,
      scaleX: targetScale,
      scaleY: targetScale,
      duration: 240,
      ease: 'Back.Out',
    });
  }

  playPlotFeedback(index: number, type: PlotAction['type'], amount: number): void {
    if (reduceMotion.matches) return;
    const [x, y] = positions[index];
    const plot = visit?.plots[index] ?? snapshot?.farm.plots[index];
    const stage = plot ? stageAt(crops[plot.cropId - 1], plot, farmTime()) : 1;
    const targetScale = plot ? (stage === 0 ? .85 : getCropScale(plot.cropId)) : cropScale;

    if (type === 'water') {
      this.spawnRing(x, y, 0x7bdcf5, 1.5, 400);
      for (let i = 0; i < 6; i++) {
        const dx = (i - 2.5) * 11;
        const drop = this.add.circle(x + dx, y - 42 - (i % 2) * 8, 2.5 + (i % 2), 0x7bdcf5);
        this.ground.add(drop);
        this.tweens.add({
          targets: drop,
          y: y - 2 + (i % 2) * 4,
          alpha: 0,
          duration: 320 + i * 25,
          ease: 'Quad.In',
          onComplete: () => drop.destroy(),
        });
      }
      this.bouncePlant(index, targetScale, 1.07, 0.92);
    } else if (type === 'fertilize') {
      this.spawnRing(x, y, 0xbce884, 1.45, 420);
      for (let i = 0; i < 6; i++) {
        const offset = i - 2.5;
        const dot = this.add.circle(x + offset * 9, y - 4, 2.2 + (i % 2), i % 2 === 0 ? 0xbce884 : 0xfff0a8);
        this.ground.add(dot);
        this.tweens.add({
          targets: dot,
          x: dot.x + offset * 6,
          y: y - 34 - (i % 3) * 6,
          alpha: 0,
          duration: 460,
          ease: 'Sine.Out',
          onComplete: () => dot.destroy(),
        });
      }
      this.bouncePlant(index, targetScale, 1.1, 0.9);
    } else if (type === 'harvest') {
      this.spawnRing(x, y, 0xffd675, 1.35, 340);
      for (let i = 0; i < 6; i++) {
        const offset = i - 2.5;
        const dot = this.add.circle(x + offset * 7, y - 10, 2.5 + (i % 2), 0xffd675);
        this.ground.add(dot);
        this.tweens.add({
          targets: dot,
          x: dot.x + offset * 12,
          y: y - 36 - (i % 2) * 8,
          alpha: 0,
          duration: 400,
          ease: 'Sine.Out',
          onComplete: () => dot.destroy(),
        });
      }
      this.bouncePlant(index, targetScale, 1.14, 0.86);
    } else if (type === 'clear') {
      for (let i = 0; i < 6; i++) {
        const offset = i - 2.5;
        const puff = this.add.circle(x + offset * 8, y, 3.2 + (i % 2), i % 2 === 0 ? 0xc89b6e : 0xe0b477, 0.85);
        this.ground.add(puff);
        this.tweens.add({
          targets: puff,
          x: puff.x + offset * 11,
          y: y - 16 - (i % 3) * 4,
          scale: 1.5,
          alpha: 0,
          duration: 420,
          ease: 'Sine.Out',
          onComplete: () => puff.destroy(),
        });
      }
    } else {
      for (let i = 0; i < 5; i++) {
        const offset = i - 2;
        const dot = this.add.circle(x + offset * 6, y + 2, 2 + i % 2, 0xe0b477);
        this.ground.add(dot);
        this.tweens.add({
          targets: dot, x: dot.x + offset * 10, y: y - 22 - i * 3,
          alpha: 0, duration: 380, ease: 'Sine.Out', onComplete: () => dot.destroy(),
        });
      }
      const { plant } = this.visuals[index];
      this.tweens.killTweensOf(plant);
      plant.setScale(targetScale * .72);
      this.tweens.add({ targets: plant, scaleX: targetScale, scaleY: targetScale, duration: 260, ease: 'Back.Out' });
    }

    if (amount > 0) {
      const count = this.add.text(x, y - 28, `+${amount}`, {
        fontFamily: 'system-ui, sans-serif', fontSize: '25px', fontStyle: 'bold',
        color: '#fff0a8', stroke: '#51301c', strokeThickness: 4,
      }).setOrigin(.5);
      this.ground.add(count);
      this.tweens.add({
        targets: count, y: y - 70, alpha: 0, duration: 730,
        ease: 'Sine.Out', onComplete: () => count.destroy(),
      });
    }
  }

  wiggleLockedGate(index: number): void {
    if (reduceMotion.matches) return;
    const gate = this.lockedGates[index];
    if (!gate) return;
    this.tweens.killTweensOf(gate);
    gate.setAngle(0);
    this.tweens.add({
      targets: gate,
      angle: { from: -6, to: 6 },
      duration: 65,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.InOut',
      onComplete: () => gate.setAngle(0),
    });
  }

  playLevelUp(): void {
    if (reduceMotion.matches || !this.ready) return;
    const [cx, cy] = [width / 2, height / 2 - 40];
    const palette = [0xffd700, 0xfff176, 0x83d84a, 0x7bdcf5];
    for (let i = 0; i < 14; i++) {
      const angle = (Math.PI * 2 * i) / 14;
      const dist = 55 + (i % 3) * 28;
      const star = this.add.circle(cx, cy, 3 + (i % 2), palette[i % palette.length]);
      this.ground.add(star);
      this.tweens.add({
        targets: star,
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist - 24,
        alpha: 0,
        scale: 0.3,
        duration: 720,
        ease: 'Cubic.Out',
        onComplete: () => star.destroy(),
      });
    }
    const banner = this.add.text(cx, cy - 12, 'LÊN CẤP!', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '30px',
      fontStyle: 'bold',
      color: '#ffe875',
      stroke: '#3c2512',
      strokeThickness: 5,
    }).setOrigin(.5).setScale(0.7);
    this.ground.add(banner);
    this.tweens.add({
      targets: banner,
      scale: 1,
      y: cy - 58,
      alpha: 0,
      duration: 1100,
      ease: 'Back.Out',
      onComplete: () => banner.destroy(),
    });
  }

  private layoutBackground(): void {
    const { width: viewWidth, height: viewHeight } = this.scale.gameSize;
    const scale = Math.max(viewWidth / this.background.width, viewHeight / this.background.height);
    this.background.setPosition(viewWidth / 2, viewHeight / 2).setScale(scale);
    const activeTheme = visit?.theme ?? snapshot.farm.theme;
    this.pondOverlay.setPosition(this.background.x, this.background.y).setScale(scale).setVisible(activeTheme >= 1 && activeTheme <= 4);
    this.ambientOverlay.setPosition(this.background.x, this.background.y).setScale(scale).setVisible(!reduceMotion.matches);
  }

  private spawnAmbientMote(): void {
    const activeTheme = visit?.theme ?? snapshot.farm.theme;
    const u = 0.12 + Math.random() * 0.76;
    const v = 0.14 + Math.random() * 0.65;
    const px = (u - 0.5) * this.background.width;
    const py = (v - 0.5) * this.background.height;
    const color = activeTheme === 3 ? 0xffe484 : activeTheme === 4 ? 0xffd07a : 0xfffbe0;
    const mote = this.add.circle(px, py, 1.8 + Math.random() * 1.4, color, 0);
    this.ambientOverlay.add(mote);
    this.tweens.add({
      targets: mote,
      x: px + (Math.random() - 0.5) * 48,
      y: py - 18 - Math.random() * 24,
      alpha: { from: 0, to: 0.65 },
      duration: 1300 + Math.random() * 700,
      yoyo: true,
      ease: 'Sine.InOut',
      onComplete: () => mote.destroy(),
    });
  }

  private spawnPondRipple(): void {
    const activeTheme = visit?.theme ?? snapshot.farm.theme;
    if (activeTheme === 1) {
      const spots: [number, number, number][] = [
        [0.15, 0.19, 1],
        [0.19, 0.11, 0.85],
        [0.25, 0.16, 0.9],
        [0.10, 0.29, 0.85],
        [0.09, 0.37, 0.8],
      ];
      const [u, v, size] = spots[this.pondSpotIndex % spots.length];
      this.pondSpotIndex += 1;
      const px = (u - 0.5) * this.background.width;
      const py = (v - 0.5) * this.background.height;

      const ripple = this.add.ellipse(px, py, 34 * size, 13 * size)
        .setStrokeStyle(1.8, 0xd8fbff, 0.55)
        .setFillStyle(0xd8fbff, 0.06)
        .setAngle(-12)
        .setScale(0.55);
      this.pondOverlay.add(ripple);
      this.tweens.add({
        targets: ripple,
        scaleX: 1.9,
        scaleY: 1.7,
        alpha: 0,
        duration: 1850,
        ease: 'Sine.Out',
        onComplete: () => ripple.destroy(),
      });

      const glint = this.add.ellipse(px + 10, py - 6, 16 * size, 3.2 * size, 0xffffff, 0)
        .setAngle(-18);
      this.pondOverlay.add(glint);
      this.tweens.add({
        targets: glint,
        x: glint.x + 14,
        y: glint.y - 4,
        alpha: { from: 0, to: 0.52 },
        duration: 600,
        yoyo: true,
        ease: 'Sine.InOut',
        onComplete: () => glint.destroy(),
      });
    } else if (activeTheme === 2) {
      const spots: [number, number][] = [[0.89, 0.30], [0.92, 0.42], [0.95, 0.54]];
      const [u, v] = spots[this.pondSpotIndex % spots.length];
      this.pondSpotIndex += 1;
      const px = (u - 0.5) * this.background.width;
      const py = (v - 0.5) * this.background.height;
      const glint = this.add.ellipse(px, py, 18, 3.5, 0xe8fbff, 0).setAngle(22);
      this.pondOverlay.add(glint);
      this.tweens.add({
        targets: glint,
        x: px + 10,
        y: py + 12,
        alpha: { from: 0, to: 0.6 },
        duration: 650,
        yoyo: true,
        ease: 'Sine.InOut',
        onComplete: () => glint.destroy(),
      });
    } else if (activeTheme === 3 || activeTheme === 4) {
      const u = activeTheme === 3 ? 0.34 + (this.pondSpotIndex % 4) * 0.08 : 0.36 + (this.pondSpotIndex % 4) * 0.09;
      const v = activeTheme === 3 ? 0.14 + (this.pondSpotIndex % 2) * 0.08 : 0.16 + (this.pondSpotIndex % 2) * 0.09;
      this.pondSpotIndex += 1;
      const px = (u - 0.5) * this.background.width;
      const py = (v - 0.5) * this.background.height;
      const spark = this.add.circle(px, py, 2.5, activeTheme === 3 ? 0xfff4b0 : 0xffcf70, 0);
      this.pondOverlay.add(spark);
      this.tweens.add({
        targets: spark,
        scale: 1.8,
        alpha: { from: 0, to: 0.75 },
        duration: 500,
        yoyo: true,
        ease: 'Sine.InOut',
        onComplete: () => spark.destroy(),
      });
    }
  }

  private layout(): void {
    const { width: viewWidth, height: viewHeight } = this.scale.gameSize;
    const isPortrait = viewWidth < viewHeight;

    const zoom = isPortrait
      ? Math.min((viewWidth / 680) * 0.98, 0.65)
      : Math.min(viewWidth / width, viewHeight / height, 1.25) * .84;
    const left = (viewWidth - width * zoom) / 2;
    const { fieldOffset } = themes[(visit?.theme ?? snapshot.farm.theme) - 1];
    const top = isPortrait
      ? (viewHeight - height * zoom) / 2 + 35
      : (viewHeight - height * zoom) / 2 + viewHeight * fieldOffset;
    this.layoutBackground();
    this.ground.setPosition(left, top).setScale(zoom);
    positions.concat(lockedPositions).forEach(([x, y], index) => {
      const button = plotButtons[index];
      if (button) {
        button.style.display = 'block';
        button.style.left = `${left + x * zoom}px`;
        button.style.top = `${top + y * zoom}px`;
        button.style.width = `${tileWidth * zoom}px`;
        button.style.height = `${tileHeight * zoom}px`;
      }
    });
    this.pet.layout();
    if (activeTooltipPlot !== null) {
      positionPlotTooltip(activeTooltipPlot);
    }
  }

  update(time: number, delta: number): void {
    if (!this.ready) return;
    const theme = `theme-${visit?.theme ?? snapshot.farm.theme}`;
    if (this.background.texture.key !== theme) {
      this.background.setTexture(theme);
      this.paintFieldBank();
      this.layout();
      if (!reduceMotion.matches) this.cameras.main.fadeIn(220, 20, 35, 22);
    }
    const now = visit ? visit.serverTime + performance.now() - visitReceivedAt : farmTime();
    const elapsed = performance.now();
    const visitKey = visit ? `visit:${visit.username}` : 'home';
    const animateStage = visitKey === this.lastPlotVisitKey;
    if (!animateStage && this.lastPlotVisitKey && !reduceMotion.matches) {
      this.cameras.main.fadeIn(220, 20, 35, 22);
    }
    this.lastPlotVisitKey = visitKey;
    const shouldSparkle = !reduceMotion.matches && elapsed - this.lastSparkleAt >= 900;
    if (shouldSparkle) this.lastSparkleAt = elapsed;
    if (!reduceMotion.matches && this.pondOverlay.visible && elapsed - this.lastPondRippleAt >= 850) {
      this.lastPondRippleAt = elapsed;
      this.spawnPondRipple();
    }
    if (!reduceMotion.matches && this.ambientOverlay.visible && elapsed - this.lastAmbientAt >= 750) {
      this.lastAmbientAt = elapsed;
      this.spawnAmbientMote();
    }

    this.visuals.forEach((visual, index) => {
      const hostPlot = visit?.plots[index];
      this.renderPlot(index, visit ? hostPlot ?? null : snapshot.farm.plots[index], now, visual, hostPlot, animateStage, elapsed, shouldSparkle);
    });
    if (!visit && elapsed - lastGuideCheck >= 500) {
      lastGuideCheck = elapsed;
      updateToolHint();
    }
    this.pet.update(time, delta, !visit, !visit && !guideActive, visit?.pet, snapshot.farm.pet);
  }

  private renderPlot(
    index: number,
    plot: Plot | null,
    now: number,
    visual: FarmScene['visuals'][number],
    hostPlot: FarmVisit['plots'][number] | undefined,
    animateStage: boolean,
    elapsed: number,
    shouldSparkle: boolean,
  ): void {
    let status = 'Đất trống';
    const wasVisible = visual.plant.visible;
    visual.plant.setVisible(Boolean(plot));
    visual.label.setVisible(Boolean(plot));
    if (plot) {
      const crop = crops[plot.cropId - 1];
      const stage = stageAt(crop, plot, now);
      const frame = `crop-${crop.id}-${plot.harvested ? 'end' : stage}`;
      const targetScale = stage === 0 ? .85 : getCropScale(crop.id);
      if (visual.plant.texture.key !== frame) {
        visual.plant.setTexture(frame);
        if (animateStage && wasVisible && !reduceMotion.matches) {
          this.tweens.killTweensOf(visual.plant);
          visual.plant.setScale(targetScale * .82);
          this.tweens.add({ targets: visual.plant, scaleX: targetScale, scaleY: targetScale, duration: 240, ease: 'Back.Out' });
        } else {
          visual.plant.setScale(targetScale);
        }
      }
      const remaining = Math.ceil((ripeAt(crop, plot) - now) / 1_000);
      const isRipe = !plot.harvested && (Boolean(hostPlot?.canSteal) || remaining <= 0);
      if (!reduceMotion.matches && !plot.harvested) {
        visual.plant.setAngle(Math.sin(elapsed * 0.0018 + index * 1.15) * 1.8);
        if (isRipe && !this.tweens.isTweening(visual.plant)) {
          const pulse = 1 + Math.sin(elapsed * 0.0045 + index) * 0.025;
          visual.plant.setScale(targetScale * pulse);
        }
        if (shouldSparkle && isRipe) {
          const [px, py] = positions[index];
          const sx = px + Math.sin(elapsed + index * 2) * 20;
          const sy = py - 24 - (index % 2) * 6;
          const sparkle = this.add.circle(sx, sy, 2, 0xfff2a6, 0.9);
          this.ground.add(sparkle);
          this.tweens.add({
            targets: sparkle,
            y: sy - 16,
            alpha: 0,
            scale: 0.4,
            duration: 550,
            ease: 'Sine.Out',
            onComplete: () => sparkle.destroy(),
          });
        }
      } else {
        visual.plant.setAngle(0);
      }
      if (plot.harvested) status = visit ? 'Đã hái' : 'Cần dọn đất';
      else if (hostPlot?.canSteal) status = `${hostPlot.remainingFruit} quả · Lấy 1 quả`;
      else if (hostPlot?.remainingFruit != null) status = `${hostPlot.remainingFruit} quả`;
      else if (remaining <= 0) status = 'Đã chín';
      else status = `${crop.name} · ${remaining}s`;
    } else {
      visual.plant.setAngle(0);
    }
    if (visual.label.text !== status) {
      visual.label.setText(status);
      visual.label.setColor(hostPlot?.canSteal || status === 'Đã chín' ? '#ffdc82' : '#fff8db');
      plotButtons[index].setAttribute('aria-label', `Ô đất ${index + 1} · ${status}`);
    }
    plotButtons[index].disabled = Boolean(visit) && !hostPlot?.canSteal;
  }
}

async function start(): Promise<void> {
  const connection = new AbortController();
  const timeout = window.setTimeout(() => connection.abort(), 8_000);
  let initial: FarmSessionResponse;
  try {
    [crops, initial] = await Promise.all([
      request<Crop[]>(FARM_API.catalog.path, undefined, connection.signal),
      request<FarmSessionResponse>(FARM_API.read.path, undefined, connection.signal),
    ]);
  } catch {
    connection.abort();
    farmLoading.fail('Chưa kết nối được máy chủ nông trại. Vui lòng thử lại.');
    return;
  } finally {
    clearTimeout(timeout);
  }
  setSnapshot(initial);
  if (farmLoading.failed) return;
  const nearAuthResult = consumeNearAuthResult();
  if (nearAuthResult && initial.nearDemoAvailable) {
    if (nearAuthResult === 'success' && initial.account) {
      setFeedback('Đã đăng nhập với Google.', 'success');
    } else {
      activeAccountTab = 'login';
      openAccountDialog();
      const message = nearAuthResult === 'unavailable'
        ? 'Đăng nhập Google chưa được cấu hình cho địa chỉ này.'
        : 'Chưa đăng nhập được với Google. Hãy thử lại.';
      showAccountToast(message, 'error', undefined, 0);
    }
  }
  new Phaser.Game({
    type: Phaser.CANVAS,
    parent: 'game',
    width,
    height,
    backgroundColor: '#6bae5e',
    scene: FarmScene,
    scale: { mode: Phaser.Scale.RESIZE },
  });
}

async function refreshCommunitySession(): Promise<void> {
  sessionSynchronized = false;
  updateCommunityAccess();
  try {
    setSnapshot(await request<FarmSessionResponse>(FARM_API.read.path));
    setFeedback('Hãy đăng nhập lại để thăm ruộng.', 'warning');
  } catch {
    openAccountDialog();
  }
}

const community = createCommunity({
  request,
  async listPlayers(list, query, offset) {
    const params = new URLSearchParams({ list, q: query, offset: String(offset) });
    return request<PlayerPage>(`${COMMUNITY_API.players}?${params}`);
  },
  visitFarm: openFarmVisit,
  openVisit: setVisit,
  refreshSession: refreshCommunitySession,
  signIn: () => {
    activeAccountTab = 'login';
    openAccountDialog();
  },
  notify: (msg, type) => setFeedback(msg, type),
});

const transactionHistoryContainer = document.createElement('div');
transactionHistoryContainer.hidden = true;
viewProfile.insertBefore(transactionHistoryContainer, btnAccountLogout);
const transactionHistory = mountTransactionHistory(transactionHistoryContainer);
let farmTradeVisit: ReturnType<typeof mountFarmTradeVisit> | undefined;

const missions = createMissions(field, farmTime,
  async claim => Boolean(await send({ type: 'claimMission', ...claim })),
  async () => Boolean(await send({ type: 'checkIn' })),
  step => {
    if (step === 'buy' || step === 'plant' || step === 'sell') {
      showPanel(step === 'buy' ? 'shop' : step === 'plant' ? 'bag' : 'warehouse');
      return;
    }

    activeCareTool = undefined;
    updateToolHint();
    const now = farmTime();
    const ripePlot = snapshot.farm.plots.findIndex(plot => plot && !plot.harvested
      && now >= ripeAt(crops[plot.cropId - 1], plot));
    if (ripePlot < 0) {
      setFeedback('Chưa có cây chín để thu hoạch.', 'info');
      return;
    }
    plotButtons[ripePlot].focus();
    showPlotTooltip(ripePlot);
  });

const activity = createActivity({
  openAccount() {
    showGameToast('Đăng nhập để xem nhật ký hoạt động.', 'warning');
    activeAccountTab = 'login';
    openAccountDialog();
  },
  notify(summary) {
    const notices: string[] = [];
    if (summary.recentVisitors.length) notices.push(`${summary.recentVisitors.join(', ')} đã ghé thăm.`);
    if (summary.recentStolenFruit > 0) notices.push(`Bạn bị lấy ${summary.recentStolenFruit} quả.`);
    if (summary.recentBlockedSteals > 0) notices.push(`Pet đã chặn ${summary.recentBlockedSteals} lượt lấy quả.`);
    showGameToast(notices.join(' ') || `Bạn có ${summary.unreadCount} hoạt động mới.`,
      summary.recentStolenFruit > 0 ? 'warning' : 'info', 4500);
  },
});
initAnalytics();
farmLoading.start();
void start().catch(error => {
  console.error('Không khởi động được nông trại:', error);
  farmLoading.fail('Chưa mở được nông trại.');
});
