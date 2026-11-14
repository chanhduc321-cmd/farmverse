import { COMMUNITY_API, COMMUNITY_SEARCH_MIN } from '../../shared/community.mts';
import type { FarmVisit, PlayerList, PlayerPage } from '../../shared/community.mts';
import './community.css';

interface CommunityOptions {
  request<T>(path: string, body?: unknown): Promise<T>;
  listPlayers(list: PlayerList, query: string, offset: number, signal: AbortSignal): Promise<PlayerPage>;
  visitFarm(username: string): Promise<FarmVisit>;
  openVisit(visit: FarmVisit): void;
  refreshSession(): Promise<void>;
  signIn(): void;
  notify?(message: string, type?: 'info' | 'success' | 'warning' | 'error'): void;
}

const listLabels: Record<PlayerList, string> = {
  friends: 'Bạn bè', residents: 'Cư dân', invitations: 'Lời mời',
};
const pageCacheTtl = 15_000;
const pageCacheCapacity = 24;

export function playerPath(path: string, username: string): string {
  return path.replace(':username', encodeURIComponent(username));
}

function makeButton(text: string, click: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.onclick = click;
  return button;
}

export function createPlayerAvatar(): HTMLImageElement {
  const portrait = document.createElement('img');
  portrait.src = '/face/face_1.png';
  portrait.alt = '';
  portrait.className = 'community-avatar';
  return portrait;
}

export function createCommunity(options: CommunityOptions) {
  let sessionKey: string | undefined;
  const opener = makeButton('', () => {
    if (!sessionKey) {
      options.signIn();
      return;
    }
    dialog.showModal();
    void run(() => loadPlayers(0));
  });
  opener.id = 'community-open';
  opener.setAttribute('aria-label', 'Bạn bè và Cư dân');
  const icon = document.createElement('img');
  icon.className = 'hud-action-icon';
  icon.src = '/icon/farm-friends.png';
  icon.alt = '';
  opener.replaceChildren(icon);
  opener.setAttribute('aria-haspopup', 'dialog');
  const field = document.querySelector<HTMLElement>('.field')!;
  let hudRow = field.querySelector<HTMLElement>('.farm-hud-row');
  if (!hudRow) {
    hudRow = document.createElement('div');
    hudRow.className = 'farm-hud-row';
    hudRow.append(field.querySelector('.meters')!);
    field.append(hudRow);
  }
  const actions = hudRow.querySelector<HTMLElement>('.farm-hud-actions');
  if (actions) {
    actions.append(opener);
  } else {
    hudRow.append(opener);
  }

  const dialog = document.createElement('dialog');
  dialog.id = 'community';
  dialog.setAttribute('aria-labelledby', 'community-title');
  dialog.innerHTML = `
    <div class="community-shell">
      <header class="community-header">
        <h2 id="community-title">Hàng xóm</h2>
        <form method="dialog"><button type="submit" aria-label="Đóng thăm ruộng">×</button></form>
      </header>
      <div class="community-body">
        <section class="community-directory">
          <nav class="community-tabs" aria-label="Danh sách người chơi"></nav>
          <form class="community-search" role="search">
            <input type="search" aria-label="Tên người chơi" placeholder="Tìm người chơi…" maxlength="24" autocapitalize="none">
            <button type="submit" aria-label="Tìm kiếm" title="Tìm kiếm"><span class="community-search-icon" aria-hidden="true"></span></button>
          </form>
          <ul class="community-players"></ul>
          <button type="button" class="community-more" hidden>Xem thêm</button>
        </section>
      </div>
      <p class="community-status" role="status"></p>
    </div>
  `;
  document.body.append(dialog);
  const closeButton = dialog.querySelector<HTMLButtonElement>('.community-header button')!;
  const body = dialog.querySelector<HTMLElement>('.community-body')!;
  const tabs = dialog.querySelector<HTMLElement>('.community-tabs')!;
  const search = dialog.querySelector<HTMLInputElement>('input')!;
  const players = dialog.querySelector<HTMLUListElement>('.community-players')!;
  const more = dialog.querySelector<HTMLButtonElement>('.community-more')!;
  const status = dialog.querySelector<HTMLParagraphElement>('.community-status')!;
  let list: PlayerList = 'friends';
  let query = '';
  let nextOffset: number | null = null;
  let pending = false;
  let accessBlocked = false;
  let pageRequest: AbortController | undefined;
  const pages = new Map<string, { data: PlayerPage; expiresAt: number }>();

  async function run(operation: () => Promise<void>): Promise<void> {
    if (pending) return;
    const operationSession = sessionKey;
    pending = true;
    opener.disabled = true;
    body.inert = true;
    closeButton.disabled = true;
    status.textContent = '';
    status.classList.remove('is-error');
    try {
      await operation();
    } catch (error) {
      if (operationSession !== sessionKey) return;
      const msg = error instanceof Error ? error.message : 'Chưa tải được dữ liệu.';
      status.textContent = msg;
      status.classList.add('is-error');
      options.notify?.(msg, 'error');
      if (error instanceof Error && error.cause === 401) await options.refreshSession();
    } finally {
      pending = false;
      opener.disabled = accessBlocked;
      body.inert = false;
      closeButton.disabled = false;
    }
  }

  async function loadPlayers(offset: number): Promise<void> {
    if (offset === 0) {
      players.replaceChildren();
      more.hidden = true;
      nextOffset = null;
    }
    const cacheKey = `${list}:${query}:${offset}`;
    const cached = pages.get(cacheKey);
    const request = new AbortController();
    pageRequest = request;
    let page: PlayerPage;
    try {
      if (cached && cached.expiresAt > Date.now()) {
        page = cached.data;
      } else {
        page = await options.listPlayers(list, query, offset, request.signal);
        if (request.signal.aborted) return;
        pages.delete(cacheKey);
        if (pages.size >= pageCacheCapacity) pages.delete(pages.keys().next().value!);
        pages.set(cacheKey, { data: page, expiresAt: Date.now() + pageCacheTtl });
      }
    } finally {
      if (pageRequest === request) pageRequest = undefined;
    }
    for (const { username } of page.players) {
      const row = document.createElement('li');
      const open = makeButton(username, () => void run(async () => {
        const currentSession = sessionKey;
        const visit = await options.visitFarm(username);
        if (currentSession !== sessionKey) return;
        dialog.close();
        options.openVisit(visit);
      }));
      open.className = 'community-player';
      open.setAttribute('aria-label', `Thăm ruộng ${username}`);
      open.title = `Thăm ruộng ${username}`;
      const name = document.createElement('span');
      name.className = 'community-player-name';
      name.textContent = username;
      open.replaceChildren(createPlayerAvatar(), name);
      row.append(open);
      if (list !== 'friends') {
        const invitation = list === 'invitations';
        const action = invitation ? 'Xác nhận' : 'Kết bạn';
        const button = makeButton(invitation ? '✓' : '+', () => void run(async () => {
          const currentSession = sessionKey;
          const path = invitation ? COMMUNITY_API.confirm : COMMUNITY_API.invite;
          await options.request<void>(playerPath(path, username), {});
          if (currentSession !== sessionKey) return;
          pages.clear();
          if (invitation) await loadPlayers(0);
          else {
            button.textContent = '✓';
            button.setAttribute('aria-label', `Đã mời ${username}`);
            button.title = 'Đã gửi lời mời';
            button.disabled = true;
          }
          status.textContent = invitation ? `Đã kết bạn với ${username}.` : `Đã gửi lời mời cho ${username}.`;
        }));
        button.setAttribute('aria-label', `${action} ${username}`);
        button.title = `${action} ${username}`;
        button.className = 'community-friend-action';
        row.append(button);
      }
      players.append(row);
    }
    if (offset === 0 && !page.players.length) {
      const empty = document.createElement('li');
      empty.className = 'community-empty';
      const symbol = document.createElement('span');
      symbol.className = 'community-empty-icon';
      symbol.setAttribute('aria-hidden', 'true');
      symbol.append(createPlayerAvatar());
      const message = document.createElement('p');
      message.textContent = query ? 'Không tìm thấy người chơi.'
        : list === 'invitations' ? 'Chưa có lời mời.'
        : list === 'friends' ? 'Tìm bạn mới trong Cư dân nhé!' : 'Chưa có cư dân.';
      empty.append(symbol, message);
      players.append(empty);
    }
    nextOffset = page.nextOffset;
    more.hidden = nextOffset === null;
  }

  for (const kind of ['friends', 'residents', 'invitations'] as const) {
    const tab = makeButton(listLabels[kind], () => void run(async () => {
      if (kind === list && !query) return;
      list = kind;
      query = '';
      search.value = '';
      for (const button of tabs.children) button.setAttribute('aria-pressed', String(button === tab));
      await loadPlayers(0);
    }));
    tab.setAttribute('aria-pressed', String(kind === list));
    tab.dataset.playerList = kind;
    tabs.append(tab);
  }
  const searchWrap = search.closest<HTMLElement>('.community-search');
  search.form!.onsubmit = event => {
    event.preventDefault();
    void run(async () => {
      const term = search.value.trim().toLowerCase();
      if (!/^[a-z0-9_]{0,24}$/.test(term)) {
        if (searchWrap) {
          searchWrap.classList.remove('is-invalid');
          void searchWrap.offsetWidth;
          searchWrap.classList.add('is-invalid');
        }
        options.notify?.('Tên đăng nhập cần 0–24 ký tự chữ không dấu, số hoặc gạch dưới.', 'error');
        throw new Error('Dùng tên đăng nhập gồm chữ không dấu, số và dấu gạch dưới.');
      }
      if (term && term.length < COMMUNITY_SEARCH_MIN) {
        throw new Error(`Nhập ít nhất ${COMMUNITY_SEARCH_MIN} ký tự để tìm người chơi.`);
      }
      query = term;
      await loadPlayers(0);
    });
  };
  search.addEventListener('input', () => {
    searchWrap?.classList.remove('is-invalid');
  });
  more.onclick = () => {
    if (nextOffset !== null) void run(() => loadPlayers(nextOffset!));
  };
  dialog.addEventListener('cancel', event => { if (pending) event.preventDefault(); });
  dialog.addEventListener('click', event => { if (event.target === dialog && !pending) dialog.close(); });

  return {
    focus: () => opener.focus(),
    updateAccess(nextSessionKey: string | undefined, blocked: boolean) {
      if (nextSessionKey !== sessionKey) {
        sessionKey = nextSessionKey;
        pageRequest?.abort();
        pages.clear();
        players.replaceChildren();
        more.hidden = true;
        nextOffset = null;
        if (dialog.open) dialog.close();
        list = 'friends';
        query = search.value = '';
        for (const button of tabs.querySelectorAll('button')) {
          button.setAttribute('aria-pressed', String(button.dataset.playerList === list));
        }
      }
      accessBlocked = blocked;
      opener.disabled = blocked || pending;
      opener.title = sessionKey ? 'Mở danh sách Bạn bè và Cư dân' : 'Đăng nhập để thăm ruộng và kết bạn';
    },
  };
}
