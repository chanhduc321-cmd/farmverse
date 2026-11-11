import type { Farm } from '../../shared/farm.mts';
import { dailySaleTarget, firstMissionSteps, missionDay, missionGold, missionStatus } from '../../shared/progression.mts';
import type { MissionClaim } from '../../shared/progression.mts';
import './missions.css';

const firstLabels = ['Mua hạt ở Tiệm hạt', 'Chọn hạt và gieo', 'Hái cây chín', 'Bán quả trong Kho'];

export function createMissions(
  field: HTMLElement,
  time: () => number,
  claim: (mission: MissionClaim) => Promise<boolean>,
  attend: () => Promise<boolean>,
) {
  const actions = field.querySelector('.farm-hud-actions')!;
  function addButton(id: string, icon: string, label: string) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = id;
    button.className = 'hud-action-btn';
    button.hidden = true;
    button.setAttribute('aria-haspopup', 'dialog');
    const symbol = document.createElement('img');
    symbol.className = 'hud-action-icon';
    symbol.src = icon;
    symbol.alt = '';
    button.setAttribute('aria-label', label);
    button.append(symbol);
    actions.prepend(button);
    return button;
  }
  const opener = addButton('missions-open', '/icon/mission-board.png', 'Nhiệm vụ');
  const checkIn = addButton('streak-open', '/icon/streak-calendar.png', 'Điểm danh');

  const panel = document.createElement('dialog');
  panel.id = 'missions';
  panel.setAttribute('aria-labelledby', 'missions-title');
  panel.innerHTML = `
    <header>
      <h2 id="missions-title">Nhiệm vụ</h2>
      <form method="dialog"><button class="inventory-close" aria-label="Đóng nhiệm vụ">×</button></form>
    </header>
    <div class="missions-body" data-missions-view>
      <section>
        <h3>Vụ đầu tiên <span>+${missionGold.first} Gold</span></h3>
        <ol>${firstLabels.map(label => `<li>${label}</li>`).join('')}</ol>
        <button type="button" data-claim="first" hidden>Nhận ${missionGold.first} Gold</button>
        <p data-first-claimed hidden>Đã nhận thưởng</p>
      </section>
      <section>
        <h3>Nhiệm vụ ngày <span>+${missionGold.daily} Gold</span></h3>
        <ul>
          <li data-harvest></li>
          <li data-sell></li>
        </ul>
        <button type="button" data-claim="daily" hidden>Nhận ${missionGold.daily} Gold</button>
        <p data-daily-claimed hidden>Đã nhận thưởng hôm nay</p>
      </section>
      <p data-mission-feedback role="status"></p>
    </div>
    <div class="missions-body" data-streak-view hidden>
      <section class="streak-summary">
        <strong data-streak></strong>
        <ol class="streak-days" aria-label="Chuỗi điểm danh 7 ngày">
          ${Array.from({ length: 7 }, (_, index) => `<li><span data-day-mark aria-hidden="true">${index === 6 ? '<img src="/icon/streak-coin.png" alt="">' : '○'}</span><small>Ngày ${index + 1}</small></li>`).join('')}
        </ol>
        <button type="button" data-attend>Điểm danh hôm nay</button>
        <p data-streak-feedback role="status"></p>
      </section>
    </div>
  `;
  document.body.append(panel);
  const first = panel.querySelector<HTMLButtonElement>('[data-claim=first]')!;
  const daily = panel.querySelector<HTMLButtonElement>('[data-claim=daily]')!;
  const status = panel.querySelector<HTMLElement>('[data-mission-feedback]')!;
  const firstClaimed = panel.querySelector<HTMLElement>('[data-first-claimed]')!;
  const dailyClaimed = panel.querySelector<HTMLElement>('[data-daily-claimed]')!;
  const streak = panel.querySelector<HTMLElement>('[data-streak]')!;
  const attendButton = panel.querySelector<HTMLButtonElement>('[data-attend]')!;
  const streakFeedback = panel.querySelector<HTMLElement>('[data-streak-feedback]')!;
  const streakDays = panel.querySelectorAll<HTMLElement>('.streak-days li');
  const title = panel.querySelector<HTMLElement>('h2')!;
  const missionsView = panel.querySelector<HTMLElement>('[data-missions-view]')!;
  const streakView = panel.querySelector<HTMLElement>('[data-streak-view]')!;
  const harvest = panel.querySelector<HTMLElement>('[data-harvest]')!;
  const sell = panel.querySelector<HTMLElement>('[data-sell]')!;
  const steps = missionsView.querySelectorAll<HTMLElement>('ol li');
  let farm: Farm | undefined;
  let renderedDay: number | undefined;
  let rewardDay: number | undefined;
  let claiming = false;
  let attending = false;

  function render() {
    if (!farm) return;
    const now = time();
    renderedDay = missionDay(now);
    const view = missionStatus(farm, now);
    rewardDay = view.rewardDay;
    const firstReady = view.firstStep === firstMissionSteps.length && !view.firstClaimed;
    const ready = firstReady || rewardDay !== undefined;
    opener.hidden = false;
    checkIn.hidden = false;
    opener.classList.toggle('reward-ready', ready);
    opener.title = ready ? 'Có thưởng nhiệm vụ' : firstLabels[view.firstStep] ?? 'Nhiệm vụ';
    opener.setAttribute('aria-label', ready ? 'Nhiệm vụ, có thưởng' : 'Nhiệm vụ');
    steps.forEach((step, index) => step.classList.toggle('mission-done', index < view.firstStep));
    first.hidden = !firstReady;
    firstClaimed.hidden = !view.firstClaimed;
    streak.textContent = `Chuỗi ${view.streak} ngày`;
    checkIn.title = streak.textContent;
    const completed = view.streak === 0 ? 0 : (view.streak - 1) % 7 + 1;
    streakDays.forEach((cell, index) => {
      const done = index < completed;
      cell.classList.toggle('checked', done);
      cell.setAttribute('aria-label', `Ngày ${index + 1}, ${done ? 'đã điểm danh' : 'chưa điểm danh'}`);
      if (index < 6) cell.querySelector('[data-day-mark]')!.textContent = done ? '✓' : '○';
    });
    attendButton.disabled = attending || view.checkedIn;
    attendButton.textContent = view.checkedIn ? 'Đã điểm danh hôm nay' : 'Điểm danh hôm nay';
    harvest.textContent = `Hái một ô · ${Number(view.daily.harvested)}/1`;
    sell.textContent = `Bán ${dailySaleTarget} quả · ${view.daily.sold}/${dailySaleTarget}`;
    daily.hidden = rewardDay === undefined;
    daily.textContent = rewardDay === renderedDay ? `Nhận ${missionGold.daily} Gold`
      : `Nhận ${missionGold.daily} Gold từ ngày trước`;
    dailyClaimed.hidden = !view.daily.claimed;
    first.disabled = daily.disabled = claiming;
  }

  async function receive(mission: MissionClaim) {
    if (claiming) return;
    claiming = true;
    render();
    const received = await claim(mission);
    status.textContent = received ? `Đã nhận ${missionGold[mission.mission]} Gold.`
      : 'Chưa nhận được thưởng. Hãy kiểm tra tiến độ rồi thử lại.';
    claiming = false;
    render();
  }

  first.onclick = () => void receive({ mission: 'first' });
  daily.onclick = () => { if (rewardDay !== undefined) void receive({ mission: 'daily', day: rewardDay }); };
  function open(showStreak: boolean) {
    render();
    status.textContent = '';
    streakFeedback.textContent = '';
    title.textContent = showStreak ? 'Điểm danh' : 'Nhiệm vụ';
    missionsView.hidden = showStreak;
    streakView.hidden = !showStreak;
    if (!panel.open) panel.showModal();
    else panel.querySelector<HTMLButtonElement>('.inventory-close')!.focus();
  }
  opener.onclick = () => open(false);
  checkIn.onclick = () => open(true);
  attendButton.onclick = async () => {
    attending = true;
    render();
    try {
      streakFeedback.textContent = await attend() ? '' : 'Chưa điểm danh được. Hãy thử lại.';
    } finally {
      attending = false;
      render();
    }
  };
  panel.addEventListener('click', event => { if (event.target === panel) panel.close(); });
  window.setInterval(() => { if (farm && missionDay(time()) !== renderedDay) render(); }, 1_000);

  return {
    update(next: Farm) {
      farm = next;
      render();
    },
  };
}
