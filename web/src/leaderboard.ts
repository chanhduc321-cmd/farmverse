import type { WeeklyLeaderboard } from '../../shared/community.mts';
import type { PetSpecies } from '../../shared/farm.mts';
import './leaderboard.css';

const SITE_LABEL = 'nongtraimongmo.xyz';
const VIETNAM_OFFSET_MS = 7 * 3_600_000;
const petNames: Record<PetSpecies, string> = { dog: 'Chó', cat: 'Mèo', goose: 'Ngỗng' };

export interface LeaderboardRow { rank: number; username: string; detail: string }
export interface LeaderboardSection { title: string; empty: string; rows: LeaderboardRow[] }

function vietnamDate(timestamp: number): string {
  const date = new Date(timestamp + VIETNAM_OFFSET_MS);
  return `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Monday to Sunday of the leaderboard week in Vietnam time, e.g. `16/11 – 22/11`. */
export function formatWeekRange(weekStart: number, weekEnd: number): string {
  return `${vietnamDate(weekStart)} – ${vietnamDate(weekEnd - 1)}`;
}

export function leaderboardSections(board: WeeklyLeaderboard): LeaderboardSection[] {
  return [
    {
      title: 'Trùm trộm rau',
      empty: 'Tuần này chưa ai trộm được quả nào. Mở hàng đi!',
      rows: board.thieves.map((row, index) => ({
        rank: index + 1, username: row.username, detail: `${row.farms} vườn · ${row.fruit} quả`,
      })),
    },
    {
      title: 'Vườn bị trộm nhiều nhất',
      empty: 'Chưa vườn nào bị trộm. Yên bình quá!',
      rows: board.robbed.map((row, index) => ({
        rank: index + 1, username: row.username, detail: `${row.thieves} người · mất ${row.fruit} quả`,
      })),
    },
    {
      title: 'Thú cưng giữ vườn giỏi nhất',
      empty: 'Chưa thú cưng nào bắt được kẻ trộm.',
      rows: board.guards.map((row, index) => ({
        rank: index + 1, username: row.username,
        detail: `${petNames[row.pet]} · đuổi ${row.blockedVisitors} người`,
      })),
    },
  ];
}

/** The signed-in player's place among this week's thieves, if they are on the board. */
export function playerRank(board: WeeklyLeaderboard, username: string | undefined): number | undefined {
  const index = username ? board.thieves.findIndex(row => row.username === username) : -1;
  return index >= 0 ? index + 1 : undefined;
}

interface LeaderboardOptions {
  actions: HTMLElement;
  load(): Promise<WeeklyLeaderboard>;
  currentPlayer(): string | undefined;
  share(rank: number | undefined): Promise<string | undefined>;
  onOpen?(): void;
}

export function createLeaderboard(options: LeaderboardOptions): void {
  const opener = document.createElement('button');
  opener.type = 'button';
  opener.id = 'leaderboard-open';
  opener.className = 'hud-action-btn';
  opener.setAttribute('aria-label', 'Bảng xếp hạng tuần');
  opener.setAttribute('aria-haspopup', 'dialog');
  opener.title = 'Bảng xếp hạng trộm rau tuần này';
  opener.innerHTML = `
    <span class="hud-action-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 20h8"/>
      </svg>
    </span>`;
  options.actions.append(opener);

  const dialog = document.createElement('dialog');
  dialog.id = 'leaderboard';
  dialog.setAttribute('aria-labelledby', 'leaderboard-title');
  dialog.innerHTML = `
    <div class="leaderboard-card">
      <header class="leaderboard-header">
        <div>
          <p class="leaderboard-kicker">Nông Trại Mộng Mơ</p>
          <h2 id="leaderboard-title">Bảng xếp hạng tuần</h2>
          <p class="leaderboard-week"></p>
        </div>
        <form method="dialog"><button type="submit" class="leaderboard-close" aria-label="Đóng bảng xếp hạng">×</button></form>
      </header>
      <div class="leaderboard-body" aria-live="polite"></div>
      <footer class="leaderboard-footer">
        <span class="leaderboard-site">${SITE_LABEL}</span>
        <button type="button" class="leaderboard-share">Chia sẻ</button>
      </footer>
      <p class="leaderboard-status" role="status"></p>
    </div>`;
  document.body.append(dialog);
  const body = dialog.querySelector<HTMLElement>('.leaderboard-body')!;
  const week = dialog.querySelector<HTMLElement>('.leaderboard-week')!;
  const status = dialog.querySelector<HTMLElement>('.leaderboard-status')!;
  const shareButton = dialog.querySelector<HTMLButtonElement>('.leaderboard-share')!;
  let rank: number | undefined;
  let request = 0;

  function render(board: WeeklyLeaderboard): void {
    const player = options.currentPlayer();
    rank = playerRank(board, player);
    week.textContent = `Tuần ${formatWeekRange(board.weekStart, board.weekEnd)}`;
    body.replaceChildren(...leaderboardSections(board).map((section) => {
      const block = document.createElement('section');
      block.className = 'leaderboard-section';
      const heading = document.createElement('h3');
      heading.textContent = section.title;
      block.append(heading);
      if (!section.rows.length) {
        const empty = document.createElement('p');
        empty.className = 'leaderboard-empty';
        empty.textContent = section.empty;
        block.append(empty);
        return block;
      }
      const list = document.createElement('ol');
      for (const row of section.rows) {
        const item = document.createElement('li');
        item.classList.toggle('is-leader', row.rank === 1);
        item.classList.toggle('is-me', row.username === player);
        const place = document.createElement('span');
        place.className = 'leaderboard-rank';
        place.textContent = String(row.rank);
        const name = document.createElement('strong');
        name.textContent = row.username;
        const detail = document.createElement('span');
        detail.className = 'leaderboard-detail';
        detail.textContent = row.detail;
        item.append(place, name, detail);
        list.append(item);
      }
      block.append(list);
      return block;
    }));
  }

  opener.onclick = () => {
    if (dialog.open) return;
    const current = ++request;
    status.textContent = 'Đang tải bảng xếp hạng…';
    body.replaceChildren();
    week.textContent = '';
    dialog.showModal();
    options.onOpen?.();
    options.load().then((board) => {
      if (current !== request) return;
      render(board);
      status.textContent = '';
    }).catch((error: unknown) => {
      if (current !== request) return;
      status.textContent = error instanceof Error ? error.message : 'Chưa tải được bảng xếp hạng.';
    });
  };
  shareButton.onclick = () => {
    shareButton.disabled = true;
    void options.share(rank)
      .then((message) => { status.textContent = message ?? ''; })
      .catch(() => { status.textContent = 'Chưa chia sẻ được. Hãy thử lại.'; })
      .finally(() => { shareButton.disabled = false; });
  };
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
}
