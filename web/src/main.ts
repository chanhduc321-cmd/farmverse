import Phaser from 'phaser';
import { ACCOUNT_API, FARM_API, ripeAt, stageAt } from '../../shared/farm.mts';
import type { Crop, FarmAction, FarmMutation, FarmResponse, FarmSessionResponse, Plot } from '../../shared/farm.mts';
import type { openOfflineFarm } from './offline-farm.ts';
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
const coins = document.querySelector<HTMLElement>('#coins')!;
const level = document.querySelector<HTMLElement>('#level')!;
const xp = document.querySelector<HTMLElement>('#xp')!;
const xpBar = document.querySelector<HTMLProgressElement>('#xp-bar')!;
const fieldBar = document.querySelector<HTMLProgressElement>('#field-bar')!;
const fieldCount = document.querySelector<HTMLElement>('#field-count')!;

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
const accountFeedback = document.querySelector<HTMLElement>('#account-feedback')!;
const btnAccountLogout = document.querySelector<HTMLButtonElement>('#btn-account-logout')!;
const btnSubmitRegister = document.querySelector<HTMLButtonElement>('#btn-submit-register')!;
const btnSubmitLogin = document.querySelector<HTMLButtonElement>('#btn-submit-login')!;

type Panel = 'shop' | 'bag' | 'warehouse';
type Tool = { type: 'plant'; cropId: number } | { type: 'harvest' | 'clear' };
const panelInfo = {
  shop: { title: 'Tiệm hạt giống', description: 'Chọn giống cây cho mùa vụ mới.', icon: 2 },
  bag: { title: 'Túi hạt giống', description: 'Chọn hạt rồi bấm một ô đất để gieo.', icon: 12 },
  warehouse: { title: 'Kho nông sản', description: 'Bán nông sản đã thu hoạch để lấy Gold.', icon: 8 },
};
let activePanel: Panel = 'shop';
let activeTool: Tool = { type: 'harvest' };
let activeAccountTab: 'register' | 'login' = 'register';
let accountSubmitting = false;
let sessionSynchronized = false;
let busy = false;
let snapshot: FarmResponse;
let session: FarmSessionResponse | undefined;
let receivedAt = 0;
let crops: Crop[] = [];
let offlineFarm: ReturnType<typeof openOfflineFarm> | undefined;
const plotButtons: HTMLButtonElement[] = [];

async function request<T>(path: string, body?: unknown): Promise<T> {
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
    updateToolHint();
  }
  if (dialog.open && activePanel !== 'shop') {
    renderPanel();
  }
}

function updateAccountButtons(): void {
  const pending = busy || accountSubmitting;
  btnSubmitRegister.disabled = pending;
  btnSubmitLogin.disabled = pending;
  btnAccountLogout.disabled = pending;
  btnRetrySync.disabled = pending;
}

function renderAccountView(): void {
  accountFeedback.textContent = '';
  accountFeedback.className = 'account-feedback';
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
    unavailableText.textContent = 'Bạn đang chơi bản demo offline. Tiến độ lưu trong trình duyệt và không dùng tài khoản.';
  } else if (session?.account) {
    viewSyncError.hidden = true;
    accountTitle.textContent = 'Tài khoản FarmVerse';
    accountDescription.textContent = 'Nông trại đã liên kết an toàn';
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
      ? 'Đăng ký để lưu vĩnh viễn nông trại'
      : 'Đăng nhập để mở lại nông trại';
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
  buttons.forEach((button) => {
    if (button.hasAttribute('aria-pressed')) {
      button.setAttribute('aria-pressed', String(button.dataset.tool === activeTool.type));
    }
  });
  if (activeTool.type === 'plant') {
    const name = crops[activeTool.cropId - 1].name.toLowerCase();
    hint.textContent = `Đang chọn hạt ${name}. Bấm ô trống để gieo hoặc cây chín để thu hoạch.`;
  } else if (activeTool.type === 'clear') {
    hint.textContent = 'Bấm ô đã thu hoạch để dọn đất.';
  } else {
    hint.textContent = 'Mua hạt ở Tiệm hạt, chọn hạt trong Túi. Bấm cây chín để thu hoạch.';
  }
}

async function send(action: FarmAction): Promise<FarmResponse | undefined> {
  if (busy || accountSubmitting) return;
  if (!sessionSynchronized) {
    feedback.textContent = 'Chưa tải được phiên nông trại. Hãy kiểm tra kết nối và thử lại.';
    if (dialog.open) {
      panelFeedback.textContent = feedback.textContent;
      panelFeedback.classList.add('is-error');
    }
    return;
  }
  busy = true;
  updateAccountButtons();
  try {
    const mutation: FarmMutation = { ...action, expectedRevision: snapshot.farm.revision };
    const result = offlineFarm ? await offlineFarm.apply(mutation) : await request<FarmResponse>(FARM_API[action.type].path, mutation);
    setSnapshot(result);
    feedback.textContent = result.message ?? '';
    if (dialog.open) {
      if (activePanel !== 'shop') renderPanel();
      panelFeedback.textContent = feedback.textContent;
      panelFeedback.classList.remove('is-error');
    }
    return result;
  } catch (error) {
    feedback.textContent = error instanceof Error ? error.message : 'Thao tác gặp lỗi.';
    if (error instanceof Error && (error.cause === 401 || error.cause === 409)) {
      const latest = offlineFarm?.read() ?? await request<FarmSessionResponse>(FARM_API.read.path).catch(() => undefined);
      if (latest) {
        setSnapshot(latest);
        if (dialog.open) renderPanel();
      }
    }
    if (dialog.open) {
      panelFeedback.textContent = feedback.textContent;
      panelFeedback.classList.add('is-error');
    }
  } finally {
    busy = false;
    updateAccountButtons();
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
    if (activePanel === 'shop') info.textContent = `${crop.buyPrice} Gold / hạt · Cấp tham khảo ${crop.level}`;
    if (activePanel === 'bag') info.textContent = `Còn ${seeds} hạt`;
    if (activePanel === 'warehouse') info.textContent = `${produce} trong kho · ${crop.sellPrice} Gold / quả`;
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
        activeTool = { type: 'plant', cropId: crop.id };
        dialog.close();
        updateToolHint();
      };
    } else {
      const { stepper, quantity } = createQuantity(crop.name, activePanel === 'shop' ? 99 : Math.min(999, produce), activePanel === 'shop' ? 1 : 0);
      const type = activePanel === 'shop' ? 'buy' : 'sell';
      action.textContent = type === 'buy' ? 'Mua' : 'Bán';
      action.setAttribute('aria-label', `${action.textContent} ${crop.name}`);
      action.onclick = () => {
        if (quantity.reportValidity()) void send({ type, cropId: crop.id, quantity: quantity.valueAsNumber });
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
    label.textContent = activePanel === 'bag' ? 'Túi hạt đang trống' : 'Kho nông sản đang trống';
    const note = document.createElement('p');
    note.textContent = activePanel === 'bag' ? 'Ghé Tiệm hạt để chọn giống cây đầu tiên.' : 'Thu hoạch cây chín để đưa nông sản về kho.';
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
  decrease.onclick = () => { quantity.value = String(Math.max(min, Math.min(max, (quantity.valueAsNumber || 0) - 1))); };
  increase.onclick = () => { quantity.value = String(Math.max(min, Math.min(max, (quantity.valueAsNumber || 0) + 1))); };
  stepper.append(decrease, quantity, increase);
  return { stepper, quantity };
}

function showPanel(next: Panel): void {
  activePanel = next;
  panelFeedback.textContent = '';
  renderPanel();
  panel.scrollTop = 0;
  if (!dialog.open) dialog.showModal();
}

function initDrawers(): void {
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
  hudAccountBtn.onclick = () => openAccountDialog();
  for (const tab of accountTabs) {
    tab.onclick = () => {
      activeAccountTab = tab.dataset.accountTab as 'register' | 'login';
      renderAccountView();
      const input = activeAccountTab === 'register'
        ? document.querySelector<HTMLInputElement>('#reg-username')
        : document.querySelector<HTMLInputElement>('#login-username');
      input?.focus();
    };
  }

  function setAccountBusy(isBusy: boolean, statusText?: string): void {
    accountSubmitting = isBusy;
    updateAccountButtons();
    if (statusText) {
      accountFeedback.textContent = statusText;
      accountFeedback.className = 'account-feedback is-info';
    }
  }

  formRegister.onsubmit = async (event) => {
    event.preventDefault();
    if (busy || accountSubmitting) return;
    const usernameInput = document.querySelector<HTMLInputElement>('#reg-username')!;
    const passwordInput = document.querySelector<HTMLInputElement>('#reg-password')!;
    const username = usernameInput.value.trim().toLowerCase();
    const password = passwordInput.value;

    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      accountFeedback.textContent = 'Tên đăng nhập cần 3–24 chữ cái không dấu, chữ số hoặc dấu gạch dưới.';
      accountFeedback.className = 'account-feedback is-error';
      usernameInput.focus();
      return;
    }
    if (password.length < 15 || password.length > 128) {
      accountFeedback.textContent = 'Mật khẩu cần từ 15–128 ký tự.';
      accountFeedback.className = 'account-feedback is-error';
      passwordInput.focus();
      return;
    }

    setAccountBusy(true, 'Đang tạo tài khoản và lưu nông trại...');
    try {
      const res = await request<FarmSessionResponse>(ACCOUNT_API.register.path, { username, password });
      setSnapshot(res);
      formRegister.reset();
      feedback.textContent = `Tài khoản ${res.account?.username ?? username} đã được tạo và lưu trữ nông trại!`;
      accountDialog.close();
    } catch (error) {
      accountFeedback.textContent = error instanceof Error ? error.message : 'Tạo tài khoản thất bại.';
      accountFeedback.className = 'account-feedback is-error';
    } finally {
      setAccountBusy(false);
    }
  };

  formLogin.onsubmit = async (event) => {
    event.preventDefault();
    if (busy || accountSubmitting) return;
    const usernameInput = document.querySelector<HTMLInputElement>('#login-username')!;
    const passwordInput = document.querySelector<HTMLInputElement>('#login-password')!;
    const username = usernameInput.value.trim().toLowerCase();
    const password = passwordInput.value;

    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      accountFeedback.textContent = 'Tên đăng nhập cần 3–24 chữ cái không dấu, chữ số hoặc dấu gạch dưới.';
      accountFeedback.className = 'account-feedback is-error';
      usernameInput.focus();
      return;
    }
    if (password.length < 15 || password.length > 128) {
      accountFeedback.textContent = 'Mật khẩu cần từ 15–128 ký tự.';
      accountFeedback.className = 'account-feedback is-error';
      passwordInput.focus();
      return;
    }

    setAccountBusy(true, 'Đang đăng nhập...');
    try {
      const res = await request<FarmSessionResponse>(ACCOUNT_API.login.path, { username, password });
      setSnapshot(res);
      formLogin.reset();
      feedback.textContent = `Chào mừng ${res.account?.username ?? username} trở lại nông trại!`;
      accountDialog.close();
    } catch (error) {
      accountFeedback.textContent = error instanceof Error ? error.message : 'Đăng nhập thất bại.';
      accountFeedback.className = 'account-feedback is-error';
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
      hudName.textContent = 'Khách';
      hudAccountBadge.textContent = 'Lỗi tải';
      hudAccountBtn.classList.remove('is-authenticated');
      hudAccountBtn.classList.add('is-offline');
      if (menuAccountLabel) menuAccountLabel.textContent = 'Khách';

      const guestSession = await request<FarmSessionResponse>(FARM_API.read.path);
      setSnapshot(guestSession);
      feedback.textContent = 'Đã đăng xuất. Bạn đang ở phiên Khách mới.';
      accountDialog.close();
    } catch (error) {
      accountFeedback.textContent = error instanceof Error ? error.message : 'Đăng xuất thất bại.';
      accountFeedback.className = 'account-feedback is-error';
      if (!sessionSynchronized) {
        feedback.textContent = 'Chưa tải được phiên nông trại. Hãy kiểm tra kết nối và thử lại.';
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
      feedback.textContent = 'Đã kết nối và đồng bộ phiên nông trại thành công!';
      accountDialog.close();
    } catch (err) {
      accountFeedback.textContent = err instanceof Error ? err.message : 'Tải phiên thất bại. Vui lòng thử lại.';
      accountFeedback.className = 'account-feedback is-error';
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
      } else if (tool === 'harvest' || tool === 'clear') {
        activeTool = { type: tool };
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
    button.onclick = async (event) => {
      if (!sessionSynchronized) {
        feedback.textContent = 'Chưa tải được phiên nông trại. Hãy kiểm tra kết nối và thử lại.';
        return;
      }
      if (busy || event.detail > 1) return;
      const previous = snapshot.farm;
      const current = previous.plots[plot];
      const tool: Tool = activeTool.type === 'plant' && current && !current.harvested
        && farmTime() >= ripeAt(crops[current.cropId - 1], current)
        ? { type: 'harvest' }
        : activeTool;
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
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'locked-plot';
    button.setAttribute('aria-label', `Ô đất ${plotNumber} · Đang khóa`);
    const badge = document.createElement('span');
    badge.className = 'plot-lock-badge';
    badge.textContent = 'Đang khóa';
    badge.setAttribute('aria-hidden', 'true');
    button.append(badge);
    button.onclick = () => { feedback.textContent = `Ô đất ${plotNumber} đang khóa.`; };
    plotTargets.append(button);
    plotButtons.push(button);
  });
  updateToolHint();
}

class FarmScene extends Phaser.Scene {
  private background!: Phaser.GameObjects.Image;
  private ground!: Phaser.GameObjects.Container;
  private soilTiles: Phaser.GameObjects.Image[] = [];
  private highlightedPlot?: number;
  private visuals: { plant: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text }[] = [];

  constructor() { super('Farm'); }

  preload(): void {
    themes.forEach(({ file }, index) => this.load.image(`theme-${index + 1}`, asset(`background/${file}`)));
    this.load.image('soil', asset('soil/web-raised-bed.png'));
    this.load.image('locked-grass', asset('soil/web-raised-grass.png'));
    this.load.image('fence-locked', asset('soil/fence-locked.png'));
    for (const crop of crops) {
      const dir = `crops/crop${crop.id}`;
      this.load.image(`crop-${crop.id}-0`, asset(`${dir}/cron_start.png`));
      this.load.image(`crop-${crop.id}-end`, asset(`${dir}/cron_end.png`));
      for (let stage = 1; stage <= crop.stages; stage++) {
        const frame = stage === crop.stages ? crop.readyFrame : stage;
        this.load.image(`crop-${crop.id}-${stage}`, asset(`${dir}/${frame}.png`));
      }
    }
  }

  create(): void {
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

    const [light, shade] = themes[snapshot.farm.theme - 1].bank;
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
    const color = type === 'harvest' ? 0xffd675 : 0xe0b477;
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
    const { fieldOffset } = themes[snapshot.farm.theme - 1];
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
  }

  update(): void {
    const theme = `theme-${snapshot.farm.theme}`;
    if (this.background.texture.key !== theme) {
      this.background.setTexture(theme);
      this.paintFieldBank();
      this.layout();
    }
    const now = farmTime();
    this.visuals.forEach((visual, index) => this.renderPlot(index, snapshot.farm.plots[index], now, visual));
  }

  private renderPlot(index: number, plot: Plot | null, now: number, visual: FarmScene['visuals'][number]): void {
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
      if (plot.harvested) status = 'Cần dọn đất';
      else if (remaining <= 0) status = 'Đã chín';
      else status = `${crop.name} · ${remaining}s`;
    }
    if (visual.label.text !== status) {
      visual.label.setText(status);
      visual.label.setColor(status === 'Đã chín' ? '#ffdc82' : '#fff8db');
      plotButtons[index].setAttribute('aria-label', `Ô đất ${index + 1} · ${status}`);
    }
  }
}

async function start(): Promise<void> {
  if (new URLSearchParams(location.search).get('demo') === 'offline') {
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

void start().catch(() => {
  hint.textContent = 'Chưa kết nối được máy chủ FarmVerse. Kiểm tra backend rồi tải lại trang.';
});
