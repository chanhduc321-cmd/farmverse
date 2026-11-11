import Phaser from 'phaser';
import { ACCOUNT_API, FARM_API, FERTILIZER_COST, ripeAt, stageAt } from '../../shared/farm.mts';
import type { Crop, FarmAction, FarmMutation, FarmResponse, FarmSessionResponse, Plot } from '../../shared/farm.mts';
import { ACTIVITY_API } from '../../shared/activity.mts';
import type { ActivityPage } from '../../shared/activity.mts';
import { COMMUNITY_API } from '../../shared/community.mts';
import type { FarmVisit, PlayerPage, StealResponse } from '../../shared/community.mts';
import type { openOfflineFarm } from './offline-farm.ts';
import { createCommunity, createPlayerAvatar, playerPath } from './community.ts';
import { createMissions } from './missions.ts';
import { farmLoading } from './loading.ts';
import './style.css';

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
const gameToastIcon = document.querySelector<HTMLElement>('#game-toast-icon');
const inventoryToast = document.querySelector<HTMLElement>('#inventory-toast');
const inventoryToastMsg = document.querySelector<HTMLElement>('#inventory-toast-msg');
const inventoryToastIcon = document.querySelector<HTMLElement>('#inventory-toast-icon');
const activityDialog = document.querySelector<HTMLDialogElement>('#activity')!;
const activityOpenBtn = document.querySelector<HTMLButtonElement>('#activity-open');
const menuActivityBtn = document.querySelector<HTMLButtonElement>('#menu-activity-btn');
const activityUnreadBadge = document.querySelector<HTMLElement>('#activity-unread-badge');
const menuActivityBadge = document.querySelector<HTMLElement>('#menu-activity-badge');
const activityList = document.querySelector<HTMLUListElement>('#activity-list')!;
const activityEmpty = document.querySelector<HTMLElement>('#activity-empty')!;
const activityMoreBtn = document.querySelector<HTMLButtonElement>('#activity-more')!;
let activityNextOffset: number | null = null;
let activityThrough: string | undefined;
let activityLoadVersion = 0;
let activityLoading = false;
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
  if (gameToastIcon) {
    gameToastIcon.textContent =
      type === 'success' ? '✅' :
      type === 'error' ? '⚠️' :
      type === 'warning' ? '⚠️' : 'ℹ️';
  }
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
  if (inventoryToastIcon) {
    inventoryToastIcon.textContent =
      type === 'success' ? '✅' :
      type === 'error' ? '⚠️' :
      type === 'warning' ? '⚠️' : 'ℹ️';
  }
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
  <img class="visit-avatar" src="/face/1-1.GIF" alt="">
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
const accountToastIcon = document.querySelector<HTMLElement>('#account-toast-icon');
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
  if (accountToastIcon) {
    accountToastIcon.textContent = type === 'error' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️';
  }
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
const tooltipIcon = document.querySelector<HTMLElement>('#tooltip-icon')!;
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
type Tool = { type: 'plant'; cropId: number } | { type: 'harvest' | 'clear' | 'water' | 'fertilize' };
const panelInfo = {
  shop: { title: 'Tiệm hạt', description: 'Chọn giống và số hạt muốn mua.', icon: 2 },
  bag: { title: 'Túi hạt', description: 'Chọn hạt rồi bấm ô đất trống để gieo.', icon: 12 },
  warehouse: { title: 'Kho nông sản', description: 'Chọn nông sản và số quả muốn bán.', icon: 8 },
};
let activePanel: Panel = 'shop';
let activeTool: Tool = { type: 'harvest' };
let toolSelection = 0;
let activeAccountTab: 'register' | 'login' = 'register';
let accountSubmitting = false;
let sessionSynchronized = false;
let busy = false;
let snapshot: FarmResponse;
let session: FarmSessionResponse | undefined;
let activeTooltipPlot: number | null = null;
let lastGuideCheck = 0;
let receivedAt = 0;
let visit: FarmVisit | undefined;
let visitReceivedAt = 0;
let visitPending = false;
let crops: Crop[] = [];
let offlineFarm: ReturnType<typeof openOfflineFarm> | undefined;
const offlineMode = new URLSearchParams(location.search).get('demo') === 'offline';
const plotButtons: HTMLButtonElement[] = [];

async function request<T>(path: string, body?: unknown): Promise<T> {
  if (offlineMode) throw new Error('Tính năng này cần kết nối máy chủ.');
  const response = await fetch(`/api${path}`, body !== undefined ? {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  } : undefined);
  if (!response.ok) {
    const result = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(result?.error ?? 'Chưa kết nối được máy chủ FarmVerse.', { cause: response.status });
  }
  if (response.status === 204) {
    return undefined as unknown as T;
  }
  return await response.json() as T;
}

function setSnapshot(next: FarmResponse | FarmSessionResponse): void {
  snapshot = next;
  if ('accountsAvailable' in next) {
    if (!sessionSynchronized || session?.account?.username !== next.account?.username) {
      activeTool = { type: 'harvest' };
    }
    session = next;
    sessionSynchronized = true;
    updateToolHint();
  }
  if (offlineFarm) sessionSynchronized = true;
  receivedAt = performance.now();
  missions.update(next.farm);
  coins.textContent = String(next.farm.gold);
  panelCoins.textContent = next.farm.gold.toLocaleString('vi-VN');
  level.textContent = String(next.farm.level);
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
  if (offlineFarm) {
    hudName.textContent = 'Demo offline';
    hudAccountBadge.textContent = 'Offline';
    hudAccountBtn.classList.add('is-offline');
    hudAccountBtn.classList.remove('is-authenticated');
    if (menuAccountLabel) menuAccountLabel.textContent = 'Demo offline';
  } else if (session?.account) {
    hudName.textContent = session.account.username;
    hudAccountBadge.textContent = 'Tài khoản';
    hudAccountBtn.classList.add('is-authenticated');
    hudAccountBtn.classList.remove('is-offline');
    if (menuAccountLabel) menuAccountLabel.textContent = session.account.username;
  } else {
    hudName.textContent = 'Khách';
    hudAccountBadge.textContent = session?.accountsAvailable ? 'Đăng nhập' : 'RAM';
    hudAccountBtn.classList.remove('is-authenticated');
    if (session?.accountsAvailable) hudAccountBtn.classList.remove('is-offline');
    else hudAccountBtn.classList.add('is-offline');
    if (menuAccountLabel) menuAccountLabel.textContent = 'Tài khoản';
  }

  if (activeTool.type === 'plant' && !(snapshot.farm.seeds[activeTool.cropId] > 0)) {
    activeTool = { type: 'harvest' };
  }
  updateToolHint();
  if (dialog.open && activePanel !== 'shop') {
    renderPanel();
  }
  updateCommunityAccess();
}

function updateCommunityAccess(): void {
  const available = sessionSynchronized && Boolean(session?.account);
  const canVisit = available || Boolean(offlineFarm);
  community.updateAccess(canVisit, busy || accountSubmitting, Boolean(offlineFarm));
  if (activityOpenBtn) {
    activityOpenBtn.disabled = busy || accountSubmitting;
    activityOpenBtn.title = available ? 'Nhật ký hoạt động' : 'Đăng nhập để xem nhật ký hoạt động';
  }
  if (!available) {
    updateActivityBadges(0);
    if (activityDialog?.open) activityDialog.close();
  }
  if (!canVisit && visit) setVisit(undefined);
}

function setVisit(next: FarmVisit | undefined): void {
  const wasVisiting = Boolean(visit);
  hidePlotTooltip();
  visit = next;
  visitReceivedAt = performance.now();
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
      void checkActivitySummary(true);
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
  return offlineFarm ? offlineFarm.community.visit(username) : request<FarmVisit>(playerPath(COMMUNITY_API.visit, username));
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
  btnSubmitRegister.disabled = pending;
  btnSubmitLogin.disabled = pending;
  btnAccountLogout.disabled = pending;
  btnRetrySync.disabled = pending;
  updateCommunityAccess();
}

function renderAccountView(): void {
  setAccountFeedback('');
  if (!sessionSynchronized && !offlineFarm) {
    accountTitle.textContent = 'Chưa tải được phiên';
    accountDescription.textContent = 'Thao tác Farm đang tạm khóa để bảo vệ dữ liệu';
    accountNav.hidden = true;
    viewRegister.hidden = true;
    viewLogin.hidden = true;
    viewProfile.hidden = true;
    viewUnavailable.hidden = true;
    viewSyncError.hidden = false;
    syncErrorText.textContent = 'Không thể đồng bộ dữ liệu phiên nông trại từ máy chủ. Vui lòng bấm thử lại để tiếp tục chơi.';
  } else if (offlineFarm) {
    viewSyncError.hidden = true;
    accountTitle.textContent = 'Bản chơi Demo offline';
    accountDescription.textContent = 'Tiến độ được lưu cục bộ trong trình duyệt';
    accountNav.hidden = true;
    viewRegister.hidden = true;
    viewLogin.hidden = true;
    viewProfile.hidden = true;
    viewUnavailable.hidden = false;
    unavailableText.textContent = 'Tiến độ chỉ giữ trong tab này. Tải lại trang để bắt đầu lượt thử mới.';
  } else if (session?.account) {
    viewSyncError.hidden = true;
    accountTitle.textContent = 'Tài khoản FarmVerse';
    accountDescription.textContent = 'Nông trại đã liên kết với tài khoản';
    accountNav.hidden = true;
    viewRegister.hidden = true;
    viewLogin.hidden = true;
    viewProfile.hidden = false;
    viewUnavailable.hidden = true;
    profileUsername.textContent = session.account.username;
  } else if (session && !session.accountsAvailable) {
    viewSyncError.hidden = true;
    accountTitle.textContent = 'Chế độ Khách (RAM)';
    accountDescription.textContent = 'Tính năng tài khoản chưa khả dụng';
    accountNav.hidden = true;
    viewRegister.hidden = true;
    viewLogin.hidden = true;
    viewProfile.hidden = true;
    viewUnavailable.hidden = false;
    unavailableText.textContent = 'Hệ thống tài khoản cần PostgreSQL để lưu trữ. Hiện backend đang chạy ở chế độ RAM.';
  } else {
    viewSyncError.hidden = true;
    accountTitle.textContent = 'Tài khoản FarmVerse';
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

function updateToolHint(): void {
  const message = farmGuide(() => {});
  buttons.forEach((button) => {
    if (button.hasAttribute('aria-pressed')) {
      button.setAttribute('aria-pressed', String(button.dataset.tool === activeTool.type));
    }
  });
  if (activeTooltipPlot !== null) updatePlotTooltipContent(activeTooltipPlot);
  updateGuidedTour();
  hint.textContent = guideActive || visit ? message : '';
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
  if (!offlineMode) {
    try { localStorage.setItem(guideStorageKey, '1'); } catch { /* Continue without browser storage. */ }
  }
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
    if (!offlineMode) {
      try {
        guideActive = guideActive && !localStorage.getItem(guideStorageKey);
        localStorage.setItem(guideStorageKey, '1');
      } catch { /* Continue without browser storage. */ }
    }
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
  if (guideHadProduce && produce === 0) {
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
  let toolTarget: 'harvest' | 'clear' | undefined;
  let label = '';
  let message = '';
  let action = () => {};
  if (ripe >= 0) {
    message = activeTool.type === 'clear'
      ? 'Chọn Thu hoạch rồi chạm vào cây chín để hái quả nhé!'
      : 'Chín rồi! Chạm vào cây để hái quả nhé.';
    if (activeTool.type === 'clear') toolTarget = 'harvest';
    else plotTarget = ripe;
  } else if (harvested >= 0) {
    message = activeTool.type === 'clear'
      ? 'Chạm gốc cây nhấp nháy để dọn đất cho vụ mới nhé!'
      : 'Chọn Xẻng rồi chạm gốc cây để dọn đất cho vụ mới nhé!';
    if (activeTool.type !== 'clear') toolTarget = 'clear';
    else plotTarget = harvested;
  } else if (produce > 0) {
    area = 'warehouse';
    label = 'Mở Kho nông sản';
    message = 'Mang quả vào Kho bán lấy Gold nào!';
  } else if (growing) {
    const nextRipe = Math.min(...farm.plots.filter(plot => plot && !plot.harvested)
      .map(plot => ripeAt(crops[plot!.cropId - 1], plot!)));
    message = `Cây đang lớn, còn ${Math.max(0, Math.ceil((nextRipe - farmTime()) / 1000))} giây. Bạn cứ khám phá ruộng nhé!`;
  } else if (activeTool.type === 'plant') {
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
  if (toolTarget) buttons.filter(button => button.dataset.tool === toolTarget)
    .forEach(button => targets.add(button));
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

guideSkip.onclick = finishGuidedTour;
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

function farmGuide(highlightTool: (tool: string) => void): string {
  if (visit) return 'Bấm vào ô có chữ “Lấy 1 quả”.';
  if (!snapshot || !crops.length) return 'Đang mở nông trại…';
  if (!sessionSynchronized && !offlineFarm) return 'Phiên chơi chưa đồng bộ. Thao tác Farm đang tạm khóa.';

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
    highlightTool('harvest');
    return activeTool.type === 'clear'
      ? `Có ${ripeCount} ô đã chín. Chọn Thu hoạch (Phím 5), rồi bấm ô để hái quả (+1 XP).`
      : `Có ${ripeCount} ô đã chín. Bấm vào ô để hái quả (+1 XP).`;
  }

  // Priority 2: Harvested plots need clearing with shovel
  if (harvestedCount > 0) {
    highlightTool('clear');
    return `Có ${harvestedCount} ô cần dọn đất. Chọn Xẻng rồi bấm ô để dọn gốc (+3 XP).`;
  }

  // Priority 3: Player actively holding seeds to plant
  if (activeTool.type === 'plant' && emptyCount > 0) {
    const crop = crops[activeTool.cropId - 1];
    return `Đang chọn hạt ${crop.name}. Bấm vào ô đất trống để gieo (+5 XP).`;
  }

  // Priority 4: Player has seeds in bag and has empty plots to plant
  if (totalSeeds > 0 && emptyCount > 0) {
    highlightTool('bag');
    return `Túi có ${totalSeeds} hạt giống. Mở Túi hạt và chọn hạt để gieo vào ${emptyCount} ô trống (+5 XP).`;
  }

  if (totalProduce > 0) {
    highlightTool('warehouse');
    return `Có ${totalProduce} nông sản trong kho. Mở Kho nông sản để bán lấy Gold.`;
  }

  if (totalSeeds === 0 && emptyCount > 0) {
    const seed = crops.reduce((cheapest, crop) => crop.buyPrice < cheapest.buyPrice ? crop : cheapest);
    if (farm.gold >= seed.buyPrice) {
      highlightTool('shop');
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
    tooltipIcon.textContent = '🔒';
    tooltipTitle.textContent = `Ô đất ${plotNum}`;
    tooltipBadge.textContent = 'Đang khóa';
    tooltipBadge.className = 'plot-tooltip-badge badge-locked';
    tooltipDesc.textContent = 'Ô này chưa canh tác được.';
    tooltipMeta.hidden = true;
    return;
  }

  const plot = snapshot.farm.plots[plotIndex];
  const now = farmTime();

  if (!plot) {
    tooltipIcon.textContent = '🌱';
    tooltipTitle.textContent = `Ô đất ${plotNum}`;
    tooltipBadge.textContent = 'Đất trống';
    tooltipBadge.className = 'plot-tooltip-badge';
    if (activeTool.type === 'plant') {
      const crop = crops[activeTool.cropId - 1];
      const cropName = crop ? crop.name : 'hạt giống';
      tooltipDesc.textContent = `Bấm để gieo ${cropName} (-1 hạt)`;
      tooltipMeta.hidden = false;
      tooltipXp.textContent = '⭐ +5 XP khi gieo';
      tooltipTimer.textContent = 'Đất sẵn sàng';
    } else {
      const totalSeeds = Object.values(snapshot.farm.seeds).reduce((sum, c) => sum + c, 0);
      if (totalSeeds > 0) {
        tooltipDesc.textContent = 'Mở Túi hạt (Phím 2) để chọn giống gieo.';
      } else {
        tooltipDesc.textContent = 'Mở Tiệm hạt (Phím 1) để mua giống cây.';
      }
      tooltipMeta.hidden = true;
    }
  } else if (plot.harvested) {
    tooltipIcon.textContent = '🧹';
    tooltipTitle.textContent = `Ô đất ${plotNum} · Gốc cây`;
    tooltipBadge.textContent = 'Cần dọn đất';
    tooltipBadge.className = 'plot-tooltip-badge badge-harvested';
    tooltipDesc.textContent = activeTool.type === 'clear'
      ? 'Bấm để dọn sạch gốc cây bằng Xẻng'
      : 'Chọn Xẻng (Phím 4) rồi bấm vào ô để dọn gốc';
    tooltipMeta.hidden = false;
    tooltipXp.textContent = '⭐ +3 XP khi dọn';
    tooltipTimer.textContent = 'Cần dọn dẹp';
  } else {
    const crop = crops[plot.cropId - 1];
    const cropName = crop ? crop.name : 'Cây trồng';
    const remaining = Math.max(0, Math.ceil((ripeAt(crop, plot) - now) / 1000));
    if (remaining <= 0) {
      tooltipIcon.textContent = '✨';
      tooltipTitle.textContent = `Ô đất ${plotNum} · ${cropName}`;
      tooltipBadge.textContent = 'Đã chín!';
      tooltipBadge.className = 'plot-tooltip-badge badge-ripe';
      tooltipDesc.textContent = activeTool.type === 'clear'
        ? 'Chọn Thu hoạch (Phím 5), rồi bấm ô để hái quả.'
        : 'Bấm vào ô để thu hoạch nông sản về kho.';
      tooltipMeta.hidden = false;
      tooltipXp.textContent = '⭐ +1 XP';
      tooltipTimer.textContent = 'Sản lượng 10–29 quả';
    } else {
      const stage = stageAt(crop, plot, now);
      tooltipIcon.textContent = '🌿';
      tooltipTitle.textContent = `Ô đất ${plotNum} · ${cropName}`;
      tooltipBadge.textContent = `Giai đoạn ${stage}/${crop.stages}`;
      tooltipBadge.className = 'plot-tooltip-badge badge-growing';
      const care = [
        plot.watered ? 'Đã tưới' : '',
        plot.fertilized ? 'Đã bón phân' : '',
      ].filter(Boolean);
      tooltipDesc.textContent = care.length ? care.join(' · ') : 'Cây đang lớn khỏe mạnh.';
      tooltipMeta.hidden = false;
      tooltipXp.textContent = 'Đang phát triển';
      tooltipTimer.textContent = `⏳ Còn ${remaining}s nữa chín`;
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

function selectTool(tool: Tool): void {
  activeTool = tool;
  toolSelection++;
  updateToolHint();
}

function initKeyboardShortcuts(): void {
  document.addEventListener('keydown', (event) => {
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
      return;
    }

    if (guideActive && !guideShade.hidden && /^[1-5]$/.test(event.key)) {
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
    } else if (event.key === '4') {
      event.preventDefault();
      selectTool({ type: 'clear' });
    } else if (event.key === '5') {
      event.preventDefault();
      selectTool({ type: 'harvest' });
    }
  });
}

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
  try {
    const mutation: FarmMutation = { ...action, expectedRevision: snapshot.farm.revision };
    const result = offlineFarm ? await offlineFarm.apply(mutation) : await request<FarmResponse>(FARM_API[action.type].path, mutation);
    setSnapshot(result);
    if (result.message) {
      setFeedback(result.message, 'success');
      if (dialog.open) {
        showInventoryToast(result.message, 'success');
        panelFeedback.textContent = result.message;
      }
    }
    if (guideActive && action.type === 'buy' && guidedPanel === 'shop') {
      guidePanelCompleted = true;
      dialog.close();
    }
    if (dialog.open) {
      if (activePanel !== 'shop') renderPanel();
    }
    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Thao tác gặp lỗi.';
    setFeedback(msg, 'error');
    if (error instanceof Error && (error.cause === 401 || error.cause === 409)) {
      const latest = offlineFarm?.read() ?? await request<FarmSessionResponse>(FARM_API.read.path).catch(() => undefined);
      if (latest) {
        setSnapshot(latest);
        if (dialog.open) renderPanel();
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

function renderPanel(): void {
  const { title, description, icon: panelIcon } = panelInfo[activePanel];
  dialog.querySelector('#inventory-title')!.textContent = title;
  dialog.querySelector('#inventory-description')!.textContent = description;
  dialog.querySelector<HTMLImageElement>('#inventory-icon')!.src = asset(`icon/topbutton%20(${panelIcon}).png`);
  for (const tab of panelTabs) tab.setAttribute('aria-pressed', String(tab.dataset.panel === activePanel));
  const cards = document.createDocumentFragment();
  for (const crop of crops) {
    const seeds = snapshot.farm.seeds[crop.id] ?? 0;
    const produce = snapshot.farm.produce[crop.id] ?? 0;
    if (activePanel === 'bag' && seeds === 0) continue;
    if (activePanel === 'warehouse' && produce === 0) continue;

    const item = document.createElement('article');
    item.className = 'item';
    const art = document.createElement('div');
    art.className = 'item-art';
    const icon = document.createElement('img');
    icon.src = asset(`crops/crop${crop.id}/seed.png`);
    icon.alt = '';
    art.append(icon);
    const details = document.createElement('div');
    details.className = 'item-details';
    const name = document.createElement('h3');
    name.textContent = crop.name;
    const info = document.createElement('small');
    if (activePanel === 'shop') info.textContent = `${crop.buyPrice} Gold/hạt · Cấp tham khảo ${crop.level}`;
    if (activePanel === 'bag') info.textContent = `Còn ${seeds} hạt`;
    if (activePanel === 'warehouse') info.textContent = `${produce} quả · ${crop.sellPrice} Gold/quả`;
    details.append(name, info);

    const controls = document.createElement('div');
    controls.className = 'item-controls';
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'item-action';
    if (activePanel === 'bag') {
      action.textContent = 'Chọn gieo';
      action.setAttribute('aria-label', `Chọn gieo ${crop.name}`);
      action.onclick = () => {
        guidePanelCompleted = true;
        dialog.close();
        selectTool({ type: 'plant', cropId: crop.id });
      };
    } else {
      const { stepper, quantity } = createQuantity(crop.name, activePanel === 'shop' ? 99 : Math.min(999, produce), activePanel === 'shop' ? 1 : 0);
      const type = activePanel === 'shop' ? 'buy' : 'sell';
      action.textContent = type === 'buy' ? 'Mua' : 'Bán';
      action.setAttribute('aria-label', `${action.textContent} ${crop.name}`);
      action.onclick = () => {
        if (!quantity.checkValidity()) {
          quantity.classList.remove('is-invalid');
          void quantity.offsetWidth;
          quantity.classList.add('is-invalid');
          showInventoryToast('Số lượng không hợp lệ.', 'error');
          return;
        }
        void send({ type, cropId: crop.id, quantity: quantity.valueAsNumber });
      };
      controls.append(stepper);
    }
    controls.append(action);
    item.append(art, details, controls);
    cards.append(item);
  }
  if (!cards.firstChild) {
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
    cards.append(empty);
  }
  const previousScroll = panel.scrollTop;
  panel.replaceChildren(cards);
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
    quantity.value = String(Math.max(min, Math.min(max, (quantity.valueAsNumber || 0) - 1)));
    quantity.classList.remove('is-invalid');
  };
  increase.onclick = () => {
    quantity.value = String(Math.max(min, Math.min(max, (quantity.valueAsNumber || 0) + 1)));
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

function formatRelativeTime(timestampMs: number, nowMs: number = Date.now()): string {
  const diffSec = Math.max(0, Math.floor((nowMs - timestampMs) / 1000));
  if (diffSec < 45) return 'Vừa xong';
  if (diffSec < 3600) {
    const mins = Math.max(1, Math.floor(diffSec / 60));
    return `${mins} phút trước`;
  }
  if (diffSec < 86400) {
    const hours = Math.floor(diffSec / 3600);
    return `${hours} giờ trước`;
  }
  const days = Math.floor(diffSec / 86400);
  if (days === 1) {
    const date = new Date(timestampMs);
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `Hôm qua ${hh}:${mm}`;
  }
  if (days < 7) return `${days} ngày trước`;
  const date = new Date(timestampMs);
  const dd = String(date.getDate()).padStart(2, '0');
  const MM = String(date.getMonth() + 1).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${dd}/${MM} ${hh}:${mm}`;
}

function updateActivityBadges(unreadCount: number): void {
  const badgeText = unreadCount > 99 ? '99+' : String(unreadCount);
  if (activityUnreadBadge) {
    activityUnreadBadge.textContent = badgeText;
    activityUnreadBadge.hidden = unreadCount <= 0;
  }
  if (menuActivityBadge) {
    menuActivityBadge.textContent = badgeText;
    menuActivityBadge.hidden = unreadCount <= 0;
  }
}

async function checkActivitySummary(notifyToast: boolean = true): Promise<void> {
  if (!session?.account || offlineFarm) {
    updateActivityBadges(0);
    return;
  }
  const requestedSession = session;
  const loadVersion = activityLoadVersion;
  try {
    const page = await request<ActivityPage>(`${ACTIVITY_API.read}?limit=1`);
    if (session !== requestedSession || activityLoadVersion !== loadVersion || activityDialog.open) return;
    const { summary } = page;
    updateActivityBadges(summary.unreadCount);

    if (notifyToast && summary.unreadCount > 0) {
      const notices: string[] = [];
      if (summary.recentVisitors.length) notices.push(`${summary.recentVisitors.join(', ')} đã ghé thăm.`);
      if (summary.recentStolenFruit > 0) notices.push(`Bạn bị lấy ${summary.recentStolenFruit} quả.`);
      showGameToast(notices.join(' ') || `Bạn có ${summary.unreadCount} hoạt động mới.`,
        summary.recentStolenFruit > 0 ? 'warning' : 'info', 4500);
    }
  } catch (err) {
    console.warn('Không tải được tóm tắt nhật ký:', err);
  }
}

function openActivityDialog(): void {
  if (!session?.account) {
    showGameToast('Đăng nhập để xem nhật ký hoạt động.', 'warning');
    activeAccountTab = 'login';
    openAccountDialog();
    return;
  }
  activityDialog.showModal();
  activityNextOffset = null;
  activityThrough = undefined;
  activityList.replaceChildren();
  activityEmpty.hidden = true;
  activityMoreBtn.hidden = true;
  void loadActivities(0, true);
}

async function loadActivities(offset: number, resetList: boolean = false): Promise<void> {
  if (activityLoading && !resetList) return;
  const loadVersion = ++activityLoadVersion;
  const requestedSession = session;
  const feedback = activityDialog.querySelector<HTMLElement>('#activity-feedback')!;
  feedback.textContent = '';
  activityLoading = true;
  if (activityMoreBtn) activityMoreBtn.disabled = true;

  try {
    const through = activityThrough ? `&through=${activityThrough}` : '';
    const page = await request<ActivityPage>(`${ACTIVITY_API.read}?offset=${offset}&limit=20${through}`);
    if (session !== requestedSession || activityLoadVersion !== loadVersion || !activityDialog.open) return;
    if (resetList) {
      activityList.replaceChildren();
      activityThrough = page.events[0]?.id;
    }

    if (offset === 0 && !page.events.length) {
      activityEmpty.hidden = false;
      activityList.hidden = true;
    } else {
      activityEmpty.hidden = true;
      activityList.hidden = false;
      for (const event of page.events) {
        const li = document.createElement('li');
        li.className = `activity-item ${event.type === 'steal' ? 'activity-steal' : 'activity-visit'} ${event.isUnread ? 'is-unread' : ''}`;

        const iconBox = document.createElement('div');
        iconBox.className = 'activity-item-icon-box';
        iconBox.innerHTML = event.type === 'steal' ? '<span class="act-icon">🧺</span>' : '<span class="act-icon">👣</span>';

        const content = document.createElement('div');
        content.className = 'activity-item-content';

        const title = document.createElement('div');
        title.className = 'activity-item-title';

        const name = document.createElement('strong');
        name.className = 'visitor-name';
        name.textContent = event.visitorName;
        title.append(name);

        if (event.type === 'steal') {
          const actionText = document.createElement('span');
          actionText.append(
            document.createTextNode('đã hái '),
            Object.assign(document.createElement('strong'), {
              className: 'stolen-amount',
              textContent: `${event.amount ?? 1} quả ${event.cropName ?? 'nông sản'}`,
            }),
            document.createTextNode(' tại '),
            Object.assign(document.createElement('span'), {
              className: 'plot-tag',
              textContent: `Ô ${event.plot ?? '?'}`,
            })
          );
          title.append(actionText);
        } else {
          const actionText = document.createElement('span');
          actionText.textContent = 'đã ghé thăm nông trại';
          title.append(actionText);
        }

        const meta = document.createElement('div');
        meta.className = 'activity-item-meta';

        const time = document.createElement('time');
        time.className = 'activity-time';
        time.dateTime = new Date(event.createdAt).toISOString();
        time.textContent = formatRelativeTime(event.createdAt);
        meta.append(time);

        if (event.isUnread) {
          const unreadPill = document.createElement('span');
          unreadPill.className = 'unread-pill';
          unreadPill.textContent = 'Mới';
          meta.append(unreadPill);
        }

        content.append(title, meta);
        li.append(iconBox, content);
        activityList.append(li);
      }
    }

    activityNextOffset = page.nextOffset;
    if (activityMoreBtn) {
      activityMoreBtn.hidden = activityNextOffset === null;
    }
    if (resetList) {
      updateActivityBadges(page.unreadCount);
      if (activityThrough && page.unreadCount > 0) {
        const result = await request<{ unreadCount: number }>(ACTIVITY_API.markRead, { through: activityThrough });
        if (session === requestedSession && activityLoadVersion === loadVersion) updateActivityBadges(result.unreadCount);
      }
    }
  } catch (error) {
    if (session === requestedSession && activityLoadVersion === loadVersion) {
      feedback.textContent = error instanceof Error ? error.message : 'Chưa tải được nhật ký.';
    }
  } finally {
    if (activityLoadVersion === loadVersion) {
      activityLoading = false;
      if (activityMoreBtn) activityMoreBtn.disabled = false;
    }
  }
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

function initActivityControls(): void {
  activityOpenBtn?.addEventListener('click', openActivityDialog);
  menuActivityBtn?.addEventListener('click', () => {
    const leftDrawer = document.querySelector<HTMLElement>('#drawer-left');
    const toggleLeft = document.querySelector<HTMLButtonElement>('#toggle-left');
    leftDrawer?.classList.remove('is-open');
    toggleLeft?.setAttribute('aria-expanded', 'false');
    openActivityDialog();
  });
  activityMoreBtn?.addEventListener('click', () => {
    if (activityNextOffset !== null) void loadActivities(activityNextOffset);
  });
  activityDialog?.addEventListener('click', (event) => {
    if (event.target === activityDialog) activityDialog.close();
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
      const res = await request<FarmSessionResponse>(ACCOUNT_API.register.path, { username, password });
      setSnapshot(res);
      formRegister.reset();
      setFeedback(`Tài khoản ${res.account?.username ?? username} đã được tạo và lưu trữ nông trại!`, 'success');
      accountDialog.close();
      void checkActivitySummary(false);
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
      const res = await request<FarmSessionResponse>(ACCOUNT_API.login.path, { username, password });
      setSnapshot(res);
      formLogin.reset();
      setFeedback(`Chào mừng ${res.account?.username ?? username} trở lại nông trại!`, 'success');
      accountDialog.close();
      void checkActivitySummary(true);
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
      await request<void>(ACCOUNT_API.logout.path, {});
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
      updateActivityBadges(0);
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
        void send({ type: 'theme' });
      } else if (tool === 'harvest' || tool === 'clear' || tool === 'water' || tool === 'fertilize') {
        selectTool({ type: tool });
        if (tool === 'water') setFeedback('Chạm cây đang lớn để tưới miễn phí.', 'info');
        if (tool === 'fertilize') setFeedback(`Chạm cây đang lớn để bón phân · ${FERTILIZER_COST} Gold.`, 'info');
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
    let lastToolSelection: number | undefined;
    button.onclick = async (event) => {
      if (!sessionSynchronized) {
        setFeedback('Chưa tải được phiên nông trại. Hãy kiểm tra kết nối và thử lại.', 'error');
        return;
      }
      if (busy) return;
      const currentVisit = visit;
      if (currentVisit) {
        const crop = currentVisit.plots[plot];
        if (!crop?.canSteal || event.detail > 1) return;
        await runVisitAction(async () => {
          try {
            const action = { plot, plantedAt: crop.plantedAt };
            const result = offlineFarm
              ? offlineFarm.community.steal(currentVisit.username, action)
              : await request<StealResponse>(playerPath(COMMUNITY_API.steal, currentVisit.username), action);
            setSnapshot(result);
            setVisit(result.visit);
            setFeedback(`Đã lấy 1 quả ${crops[crop.cropId - 1].name}. Xem trong Kho của bạn.`, 'success');
            scene.playPlotFeedback(plot, 'harvest', 1);
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
      if (event.pointerType === 'touch') showPlotTooltip(plot);
      const tool: Tool = activeTool.type === 'plant' && current && !current.harvested
        && farmTime() >= ripeAt(crops[current.cropId - 1], current)
        ? { type: 'harvest' }
        : activeTool;
      if (event.detail > 1 && lastToolSelection === toolSelection) return;
      lastToolSelection = toolSelection;
      const result = await send({ ...tool, plot });
      if (!result) return;
      const cropId = previous.plots[plot]?.cropId;
      const amount = tool.type === 'harvest' && cropId !== undefined
        ? (result.farm.produce[cropId] ?? 0) - (previous.produce[cropId] ?? 0)
        : 0;
      scene.playPlotFeedback(plot, tool.type, amount);
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
  private background!: Phaser.GameObjects.Image;
  private ground!: Phaser.GameObjects.Container;
  private soilTiles: Phaser.GameObjects.Image[] = [];
  private highlightedPlot?: number;
  private visuals: { plant: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text }[] = [];
  private interfaceReady!: Promise<void>;
  private ready = false;

  constructor() { super('Farm'); }

  preload(): void {
    const textures: [key: string, path: string][] = [
      ...themes.map(({ file }, index): [string, string] => [`theme-${index + 1}`, `background/${file}`]),
      ['soil', 'soil/web-raised-bed.png'],
      ['locked-grass', 'soil/web-raised-grass.png'],
      ['fence-locked', 'soil/fence-locked.png'],
    ];
    const interfaceImages = new Map([...document.images].map(image => [image.src, image]));
    for (const crop of crops) {
      const dir = `crops/crop${crop.id}`;
      const seed = new Image();
      seed.src = asset(`${dir}/seed.png`);
      interfaceImages.set(seed.src, seed);
      textures.push([`crop-${crop.id}-0`, `${dir}/cron_start.png`], [`crop-${crop.id}-end`, `${dir}/cron_end.png`]);
      for (let stage = 1; stage <= crop.stages; stage++) {
        const frame = stage === crop.stages ? crop.readyFrame : stage;
        textures.push([`crop-${crop.id}-${stage}`, `${dir}/${frame}.png`]);
      }
    }

    farmLoading.assets(textures.length + interfaceImages.size);
    this.load.on(Phaser.Loader.Events.FILE_COMPLETE, farmLoading.fileLoaded);
    this.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      console.error('Không tải được tài nguyên FarmVerse:', file.url);
      farmLoading.fail('Chưa tải được tài nguyên nông trại.');
    });
    for (const [key, path] of textures) this.load.image(key, asset(path));
    this.interfaceReady = Promise.all([...interfaceImages.values()].map(async image => {
      await image.decode();
      farmLoading.fileLoaded();
    })).then(() => {}).catch(error => {
      console.error('Không tải được ảnh giao diện FarmVerse:', error);
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
        if (!farmLoading.failed && session?.account) void checkActivitySummary(true);
      });
    }).catch(error => {
      console.error('Không mở được cảnh nông trại:', error);
      farmLoading.fail('Chưa mở được nông trại.');
    });
  }

  private createFarm(): void {
    this.background = this.add.image(0, 0, `theme-${snapshot.farm.theme}`);
    this.ground = this.add.container(0, 0);
    this.paintFieldBank();
    this.ground.add(this.add.image(0, 0, 'field-bank').setOrigin(0));
    this.createPlotTextures();
    const soilScale = (tileWidth - 8) / this.textures.get('soil').getSourceImage().width;
    this.soilTiles = positions.map(([x, y]) => this.add.image(x, y - 5, 'soil').setScale(soilScale));
    const grassScale = (tileWidth - 8) / this.textures.get('locked-grass').getSourceImage().width;
    const grassTiles = lockedPositions.map(([x, y]) => this.add.image(x, y - 3, 'locked-grass').setScale(grassScale));
    this.ground.add([...this.soilTiles, ...grassTiles].sort((a, b) => a.y - b.y));
    for (const [x, y] of lockedPositions) {
      this.ground.add(this.add.image(x - 40, y + 19, 'locked-gate').setOrigin(.5, .8));
    }
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
    if (this.highlightedPlot !== undefined) this.soilTiles[this.highlightedPlot].setTexture('soil');
    this.highlightedPlot = index;
    if (index !== undefined) this.soilTiles[index].setTexture('soil-highlight');
  }

  playPlotFeedback(index: number, type: Tool['type'], amount: number): void {
    if (reduceMotion.matches) return;
    const [x, y] = positions[index];
    const color = type === 'water' ? 0x7bdcf5
      : type === 'fertilize' ? 0xbce884
      : type === 'harvest' ? 0xffd675 : 0xe0b477;
    for (let i = 0; i < 5; i++) {
      const offset = i - 2;
      const dot = this.add.circle(x + offset * 6, y + 2, 2 + i % 2, color);
      this.ground.add(dot);
      this.tweens.add({
        targets: dot, x: dot.x + offset * 10, y: y - 22 - i * 3,
        alpha: 0, duration: 380, ease: 'Sine.Out', onComplete: () => dot.destroy(),
      });
    }
    if (type === 'plant') {
      const { plant } = this.visuals[index];
      this.tweens.killTweensOf(plant);
      plant.setScale(cropScale * .78);
      this.tweens.add({ targets: plant, scaleX: cropScale, scaleY: cropScale, duration: 240, ease: 'Sine.Out' });
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

  private layoutBackground(): void {
    const { width: viewWidth, height: viewHeight } = this.scale.gameSize;
    const scale = Math.max(viewWidth / this.background.width, viewHeight / this.background.height);
    this.background.setPosition(viewWidth / 2, viewHeight / 2).setScale(scale);
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
    if (activeTooltipPlot !== null) {
      positionPlotTooltip(activeTooltipPlot);
    }
  }

  update(): void {
    if (!this.ready) return;
    const theme = `theme-${visit?.theme ?? snapshot.farm.theme}`;
    if (this.background.texture.key !== theme) {
      this.background.setTexture(theme);
      this.paintFieldBank();
      this.layout();
    }
    const now = visit ? visit.serverTime + performance.now() - visitReceivedAt : farmTime();
    this.visuals.forEach((visual, index) => {
      const hostPlot = visit?.plots[index];
      this.renderPlot(index, visit ? hostPlot ?? null : snapshot.farm.plots[index], now, visual, hostPlot);
    });
    const elapsed = performance.now();
    if (!visit && elapsed - lastGuideCheck >= 500) {
      lastGuideCheck = elapsed;
      updateToolHint();
    }
  }

  private renderPlot(
    index: number,
    plot: Plot | null,
    now: number,
    visual: FarmScene['visuals'][number],
    hostPlot?: FarmVisit['plots'][number],
  ): void {
    let status = 'Đất trống';
    visual.plant.setVisible(Boolean(plot));
    visual.label.setVisible(Boolean(plot));
    if (plot) {
      const crop = crops[plot.cropId - 1];
      const stage = stageAt(crop, plot, now);
      const frame = `crop-${crop.id}-${plot.harvested ? 'end' : stage}`;
      if (visual.plant.texture.key !== frame) {
        visual.plant.setTexture(frame).setScale(getCropScale(crop.id));
      }
      const remaining = Math.ceil((ripeAt(crop, plot) - now) / 1_000);
      if (plot.harvested) status = visit ? 'Đã hái' : 'Cần dọn đất';
      else if (hostPlot?.canSteal) status = `${hostPlot.remainingFruit} quả · Lấy 1 quả`;
      else if (hostPlot?.remainingFruit != null) status = `${hostPlot.remainingFruit} quả`;
      else if (remaining <= 0) status = 'Đã chín';
      else status = `${crop.name} · ${remaining}s`;
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
  if (offlineMode) {
    const { openOfflineFarm } = await import('./offline-farm.ts');
    offlineFarm = openOfflineFarm();
    crops = offlineFarm.catalog;
    setSnapshot(offlineFarm.initial);
  } else {
    const [catalog, initial] = await Promise.all([
      request<Crop[]>(FARM_API.catalog.path),
      request<FarmSessionResponse>(FARM_API.read.path),
    ]);
    crops = catalog;
    setSnapshot(initial);
  }
  if (farmLoading.failed) return;
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
    if (offlineFarm) return offlineFarm.community.listFriends(query);
    const params = new URLSearchParams({ list, q: query, offset: String(offset) });
    return request<PlayerPage>(`${COMMUNITY_API.players}?${params}`);
  },
  visitFarm: readVisit,
  openVisit: setVisit,
  refreshSession: refreshCommunitySession,
  signIn: () => {
    activeAccountTab = 'login';
    openAccountDialog();
  },
  notify: (msg, type) => setFeedback(msg, type),
});

const missions = createMissions(field, farmTime,
  async claim => Boolean(await send({ type: 'claimMission', ...claim })),
  async () => Boolean(await send({ type: 'checkIn' })));

initActivityControls();
farmLoading.start();
void start().catch(error => {
  console.error('Không khởi động được FarmVerse:', error);
  farmLoading.fail(offlineMode ? 'Chưa mở được bản chơi offline.' : 'Chưa kết nối được máy chủ FarmVerse.');
});
