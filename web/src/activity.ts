import { ACTIVITY_API } from '../../shared/activity.mts';
import type { ActivityEvent, ActivityPage, ActivitySummary } from '../../shared/activity.mts';

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

function renderActivity(event: ActivityEvent): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'activity-item';
  li.classList.toggle('is-unread', event.isUnread);

  const content = document.createElement('div');
  content.className = 'activity-item-content';

  const title = document.createElement('div');
  title.className = 'activity-item-title';

  const name = document.createElement('strong');
  name.className = 'visitor-name';
  name.textContent = event.visitorName;
  title.append(name, ' ');

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
  } else if (event.type === 'pet_block') {
    const actionText = document.createElement('span');
    actionText.textContent = `bị Pet chặn khi định hái ${event.cropName ?? 'nông sản'} tại Ô ${event.plot ?? '?'}. Quả vẫn còn nguyên.`;
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
  li.append(content);
  return li;
}

const syncInterval = 30_000;
const pageSize = 20;

export function createActivity(options: {
  openAccount: () => void;
  notify: (summary: ActivitySummary) => void;
}) {
  const dialog = document.querySelector<HTMLDialogElement>('#activity')!;
  const openButton = document.querySelector<HTMLButtonElement>('#activity-open')!;
  const menuButton = document.querySelector<HTMLButtonElement>('#menu-activity-btn')!;
  const badges = document.querySelectorAll<HTMLElement>('#activity-unread-badge, #menu-activity-badge');
  const list = dialog.querySelector<HTMLUListElement>('#activity-list')!;
  const empty = dialog.querySelector<HTMLElement>('#activity-empty')!;
  const more = dialog.querySelector<HTMLButtonElement>('#activity-more')!;
  const feedback = dialog.querySelector<HTMLElement>('#activity-feedback')!;
  const newEvents = dialog.querySelector<HTMLButtonElement>('#activity-new') ?? document.createElement('button');
  if (!newEvents.isConnected) {
    newEvents.type = 'button';
    newEvents.id = 'activity-new';
    newEvents.textContent = 'Có hoạt động mới';
    newEvents.className = more.className;
    newEvents.hidden = true;
    more.before(newEvents);
  }

  let account: string | undefined;
  let session = new AbortController();
  let started = false;
  let atHome = true;
  let blocked = true;
  let pending = false;
  let timer: number | undefined;
  let nextSyncAt = 0;
  let cache: ActivityPage | undefined;
  let etag: string | null = null;
  let lastNotified: string | undefined;
  let through: string | undefined;
  let nextOffset: number | null = null;
  let unreadThrough: ActivityEvent | undefined;
  let rendered = false;
  let syncError = '';

  function updateBadges(count: number): void {
    for (const badge of badges) {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.hidden = count === 0;
    }
    openButton.setAttribute('aria-label', count ? `Nhật ký hoạt động, ${count} chưa đọc` : 'Nhật ký hoạt động');
  }

  function updateControls(): void {
    const newId = cache?.events[0]?.id;
    newEvents.hidden = !rendered || !newId || newId === through;
    more.hidden = nextOffset === null;
    more.disabled = newEvents.disabled = pending;
  }

  function canSync(): boolean {
    return started && Boolean(account) && atHome && !blocked && !document.hidden;
  }

  function schedule(): void {
    window.clearTimeout(timer);
    if (canSync() && !pending) {
      timer = window.setTimeout(() => void sync(), Math.max(0, nextSyncAt - performance.now()));
    }
  }

  function resetView(): void {
    list.replaceChildren();
    list.hidden = empty.hidden = true;
    through = unreadThrough = undefined;
    nextOffset = null;
    rendered = false;
    updateControls();
  }

  function showPage(page: ActivityPage, first: boolean): void {
    if (first) {
      resetView();
      through = page.events[0]?.id;
      rendered = true;
    }
    list.append(...page.events.map(renderActivity));
    list.hidden = list.childElementCount === 0;
    empty.hidden = !list.hidden;
    nextOffset = page.nextOffset;
    if (page.events.some(event => event.isUnread)) unreadThrough = page.events[0];
    feedback.textContent = '';
    updateControls();
  }

  async function activityRequest(path: string, signal: AbortSignal, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    headers.set('X-Farm-Account', account!);
    const response = await fetch(`/api${path}`, {
      ...init, headers, cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
    });
    if (response.status === 401 && !signal.aborted) {
      setSession(undefined);
      throw new Error('Phiên nông trại đã thay đổi. Hãy tải lại trang.');
    }
    if (!response.ok && response.status !== 304) {
      const result = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(result?.error ?? 'Chưa tải được nhật ký.');
    }
    return response;
  }

  async function run(operation: (signal: AbortSignal) => Promise<void>): Promise<void> {
    if (pending || !account) return;
    const { signal } = session;
    pending = true;
    updateControls();
    try {
      await operation(signal);
    } catch (error) {
      if (!signal.aborted) {
        const message = error instanceof Error && error.name !== 'TimeoutError' ? error.message : 'Kết nối nhật ký quá lâu.';
        if (dialog.open) feedback.textContent = message;
        if (!cache) syncError = message;
      }
    } finally {
      if (!signal.aborted) {
        pending = false;
        updateControls();
        schedule();
      }
    }
  }

  async function acknowledge(signal: AbortSignal): Promise<void> {
    const displayed = unreadThrough;
    if (!displayed || !dialog.open || document.hidden) return;
    const response = await activityRequest(ACTIVITY_API.markRead, signal, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ through: displayed.id }),
    });
    const result = await response.json() as { unreadCount: number };
    if (signal.aborted) return;
    if (unreadThrough === displayed) unreadThrough = undefined;
    if (cache) {
      for (const event of cache.events) {
        if (event.createdAt < displayed.createdAt
          || (event.createdAt === displayed.createdAt && BigInt(event.id) <= BigInt(displayed.id))) {
          event.isUnread = false;
        }
      }
    }
    updateBadges(result.unreadCount);
  }

  async function sync(): Promise<void> {
    if (!canSync() || pending) return;
    if (performance.now() < nextSyncAt) {
      schedule();
      return;
    }
    nextSyncAt = performance.now() + syncInterval;
    await run(async signal => {
      const headers = etag ? { 'If-None-Match': etag } : undefined;
      const response = await activityRequest(`${ACTIVITY_API.read}?limit=${pageSize}`, signal, { headers });
      if (response.status !== 304) {
        const page = await response.json() as ActivityPage;
        if (signal.aborted) return;
        cache = page;
        etag = response.headers.get('ETag');
        syncError = '';
        updateBadges(page.unreadCount);
        const newest = page.events[0]?.id;
        if (newest && newest !== lastNotified) {
          lastNotified = newest;
          if (page.unreadCount && !dialog.open && !document.hidden) options.notify(page.summary);
        }
        if (dialog.open && !rendered) showPage(page, true);
      }
      await acknowledge(signal);
    });
  }

  function open(): void {
    if (blocked || !atHome || dialog.open) return;
    if (!account) {
      options.openAccount();
      return;
    }
    resetView();
    if (cache) showPage(cache, true);
    else feedback.textContent = syncError || 'Đang tải nhật ký…';
    dialog.showModal();
    if (unreadThrough) void run(acknowledge);
  }

  function setSession(username: string | undefined): void {
    if (account === username) return;
    session.abort();
    session = new AbortController();
    account = username;
    pending = false;
    cache = undefined;
    etag = null;
    lastNotified = undefined;
    nextSyncAt = 0;
    syncError = '';
    if (dialog.open) dialog.close();
    resetView();
    updateBadges(0);
    openButton.title = account ? 'Nhật ký hoạt động' : 'Đăng nhập để xem nhật ký hoạt động';
    schedule();
  }

  openButton.addEventListener('click', open);
  menuButton.addEventListener('click', () => {
    document.querySelector('#drawer-left')?.classList.remove('is-open');
    document.querySelector('#toggle-left')?.setAttribute('aria-expanded', 'false');
    open();
  });
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  newEvents.addEventListener('click', () => {
    if (!cache || pending) return;
    showPage(cache, true);
    if (unreadThrough) void run(acknowledge);
  });
  more.addEventListener('click', () => {
    if (nextOffset === null || !through) return;
    const offset = nextOffset;
    const anchor = through;
    void run(async signal => {
      const response = await activityRequest(`${ACTIVITY_API.read}?offset=${offset}&limit=${pageSize}&through=${anchor}`, signal);
      const page = await response.json() as ActivityPage;
      if (!signal.aborted && dialog.open && through === anchor && nextOffset === offset) {
        showPage(page, false);
        await acknowledge(signal);
      }
    });
  });
  document.addEventListener('visibilitychange', () => {
    if (dialog.open && !document.hidden && unreadThrough) void run(acknowledge);
    schedule();
  });

  return {
    start() {
      started = true;
      schedule();
    },
    setSession,
    setBlocked(value: boolean) {
      if (value === blocked) return;
      blocked = value;
      openButton.disabled = value;
      schedule();
    },
    setAtHome(value: boolean) {
      atHome = value;
      schedule();
    },
  };
}

