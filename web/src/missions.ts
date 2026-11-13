import type { Farm } from '../../shared/farm.mts';
import { dailySaleTarget, firstMissionSteps, missionDay, missionGold, missionStatus } from '../../shared/progression.mts';
import type { MissionClaim } from '../../shared/progression.mts';
import './missions.css';

const firstLabels = ['Mua hạt ở Tiệm hạt', 'Chọn hạt và gieo', 'Hái cây chín', 'Bán quả trong Kho'] as const;
const stepActions: Array<'buy' | 'plant' | 'harvest' | 'sell'> = ['buy', 'plant', 'harvest', 'sell'];

export function createMissions(
  field: HTMLElement,
  time: () => number,
  claim: (mission: MissionClaim) => Promise<boolean>,
  attend: () => Promise<boolean>,
  navigate?: (step: 'buy' | 'plant' | 'harvest' | 'sell') => void,
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
      <section class="mission-section">
        <h3>Vụ đầu tiên <span class="mission-reward-tag">+${missionGold.first} Gold</span></h3>
        <ol class="mission-checklist" data-first-steps></ol>
        <button type="button" data-claim="first" hidden>Nhận ${missionGold.first} Gold</button>
        <p data-first-claimed class="mission-claimed-msg" hidden>✓ Đã hoàn thành vụ đầu tiên</p>
      </section>
      <section class="mission-section">
        <h3>Nhiệm vụ ngày <span class="mission-reward-tag">+${missionGold.daily} Gold</span></h3>
        <ul class="mission-checklist" data-daily-steps></ul>
        <button type="button" data-claim="daily" hidden>Nhận ${missionGold.daily} Gold</button>
        <p data-daily-claimed class="mission-claimed-msg" hidden>✓ Đã nhận thưởng hôm nay</p>
      </section>
      <p data-mission-feedback role="status"></p>
    </div>
    <div class="missions-body" data-streak-view hidden>
      <section class="streak-summary">
        <div class="streak-header">
          <strong data-streak>Chuỗi 0 ngày</strong>
          <span class="streak-subtitle">Điểm danh đều đặn mỗi ngày để nhận quà</span>
        </div>
        <ol class="streak-days" aria-label="Lịch quà điểm danh 7 ngày"></ol>
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
  const streakDaysList = panel.querySelector<HTMLOListElement>('.streak-days')!;
  const title = panel.querySelector<HTMLElement>('h2')!;
  const missionsView = panel.querySelector<HTMLElement>('[data-missions-view]')!;
  const streakView = panel.querySelector<HTMLElement>('[data-streak-view]')!;
  const firstStepsContainer = panel.querySelector<HTMLOListElement>('[data-first-steps]')!;
  const dailyStepsContainer = panel.querySelector<HTMLUListElement>('[data-daily-steps]')!;

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
    const firstPending = view.firstStep < firstMissionSteps.length;
    const dailyPending = !view.daily.harvested || view.daily.sold < dailySaleTarget;
    const missionsPending = ready || firstPending || dailyPending;

    opener.hidden = false;
    checkIn.hidden = false;
    opener.classList.toggle('reward-ready', ready);
    opener.classList.toggle('has-pending', missionsPending);
    checkIn.classList.toggle('has-pending', !view.checkedIn);

    const hudToggle = field.querySelector<HTMLButtonElement>('#farm-hud-toggle');
    hudToggle?.classList.toggle('has-attention', missionsPending || !view.checkedIn);

    opener.title = ready ? 'Có thưởng nhiệm vụ' : missionsPending ? 'Còn việc chưa xong' : 'Nhiệm vụ';
    opener.setAttribute('aria-label', ready ? 'Nhiệm vụ, có thưởng' : missionsPending ? 'Nhiệm vụ, còn việc' : 'Nhiệm vụ');

    // First mission checklist
    firstStepsContainer.innerHTML = firstLabels.map((label, index) => {
      const isDone = index < view.firstStep;
      const isActive = index === view.firstStep && !view.firstClaimed;
      if (isDone) {
        return `<li class="mission-step-item mission-done">
          <button type="button" class="mission-step-action is-done" disabled>
            <span class="step-check" aria-hidden="true">✓</span>
            <span class="step-label">${label}</span>
          </button>
        </li>`;
      }
      if (isActive) {
        return `<li class="mission-step-item is-active">
          <button type="button" class="mission-step-action is-active" data-action="${stepActions[index]}" title="Bấm để đến khu vực thực hiện">
            <span class="step-check" aria-hidden="true">○</span>
            <span class="step-label">${label}</span>
            <span class="step-arrow" aria-hidden="true">›</span>
          </button>
        </li>`;
      }
      return `<li class="mission-step-item is-locked">
        <button type="button" class="mission-step-action is-locked" disabled>
          <span class="step-check" aria-hidden="true">○</span>
          <span class="step-label">${label}</span>
        </button>
      </li>`;
    }).join('');

    first.hidden = !firstReady;
    firstClaimed.hidden = !view.firstClaimed;

    // Daily missions checklist
    const harvestDone = view.daily.harvested;
    const harvestBtn = harvestDone
      ? `<button type="button" class="mission-step-action is-done" disabled>
          <span class="step-check" aria-hidden="true">✓</span>
          <span class="step-label">Hái một ô · 1/1</span>
        </button>`
      : `<button type="button" class="mission-step-action is-active" data-action="harvest" title="Bấm để đến ô đất hái cây">
          <span class="step-check" aria-hidden="true">○</span>
          <span class="step-label">Hái một ô · 0/1</span>
          <span class="step-arrow" aria-hidden="true">›</span>
        </button>`;

    const sellDone = view.daily.sold >= dailySaleTarget;
    const sellBtn = sellDone
      ? `<button type="button" class="mission-step-action is-done" disabled>
          <span class="step-check" aria-hidden="true">✓</span>
          <span class="step-label">Bán ${dailySaleTarget} quả · ${view.daily.sold}/${dailySaleTarget}</span>
        </button>`
      : `<button type="button" class="mission-step-action is-active" data-action="sell" title="Bấm để mở Kho bán nông sản">
          <span class="step-check" aria-hidden="true">○</span>
          <span class="step-label">Bán ${dailySaleTarget} quả · ${view.daily.sold}/${dailySaleTarget}</span>
          <span class="step-arrow" aria-hidden="true">›</span>
        </button>`;

    dailyStepsContainer.innerHTML = `
      <li class="mission-step-item ${harvestDone ? 'mission-done' : 'is-active'}">${harvestBtn}</li>
      <li class="mission-step-item ${sellDone ? 'mission-done' : 'is-active'}">${sellBtn}</li>
    `;

    daily.hidden = rewardDay === undefined;
    daily.textContent = rewardDay === renderedDay ? `Nhận ${missionGold.daily} Gold`
      : `Nhận ${missionGold.daily} Gold từ ngày trước`;
    dailyClaimed.hidden = !view.daily.claimed;
    first.disabled = daily.disabled = claiming;

    // 7-day attendance grid (T-52)
    streak.textContent = `Chuỗi ${view.streak} ngày`;
    checkIn.title = view.checkedIn ? `Chuỗi ${view.streak} ngày (Đã điểm danh)` : `Chuỗi ${view.streak} ngày (Chưa điểm danh)`;
    checkIn.setAttribute('aria-label', view.checkedIn ? 'Điểm danh, đã xong hôm nay' : 'Điểm danh hôm nay');

    streakDaysList.innerHTML = view.attendanceDays.map(item => {
      let iconSrc = '/icon/streak-coin.png';
      let rewardText = `+${item.reward.amount} Gold`;
      if (item.reward.type === 'fertilizer') {
        iconSrc = '/icon/fertilizer-sack.png';
        rewardText = `+${item.reward.amount} Phân`;
      } else if (item.reward.type === 'seed') {
        iconSrc = `/crops/crop${item.reward.cropId}/seed.png`;
        rewardText = `+${item.reward.amount} Hạt dâu`;
      }

      let statusLabel = 'Sắp tới';
      if (item.status === 'claimed') statusLabel = 'Đã nhận';
      else if (item.status === 'checked-in') statusLabel = 'Đã điểm danh';
      else if (item.status === 'available') statusLabel = 'Hôm nay';

      const isToday = item.status === 'available';
      const isClaimed = item.status === 'claimed' || item.status === 'checked-in';
      const isDay7 = item.day === 7;

      return `<li class="streak-day-cell ${isClaimed ? 'checked' : ''} ${isToday ? 'is-today' : ''} ${isDay7 ? 'is-day-7' : ''}" data-day="${item.day}" aria-label="Ngày ${item.day}: ${rewardText}, ${statusLabel}">
        <span class="streak-day-num">Ngày ${item.day}${isDay7 ? ' ★' : ''}</span>
        <div class="streak-reward-icon-wrap">
          <img class="streak-reward-icon" src="${iconSrc}" alt="">
          <span class="streak-reward-amount">${rewardText}</span>
        </div>
        <span class="streak-status-badge ${item.status}">${statusLabel}</span>
      </li>`;
    }).join('');

    attendButton.disabled = attending || view.checkedIn;
    attendButton.textContent = view.checkedIn ? 'Đã điểm danh hôm nay' : 'Điểm danh hôm nay';
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
      const success = await attend();
      streakFeedback.textContent = success ? 'Điểm danh thành công! Quà đã được cộng vào tài khoản.' : 'Chưa điểm danh được. Hãy thử lại.';
    } finally {
      attending = false;
      render();
    }
  };

  panel.addEventListener('click', event => {
    if (event.target === panel) {
      panel.close();
      return;
    }
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
    if (btn && !btn.disabled) {
      const action = btn.dataset.action as 'buy' | 'plant' | 'harvest' | 'sell';
      if (action && navigate) {
        panel.close();
        navigate(action);
      }
    }
  });

  window.setInterval(() => { if (farm && missionDay(time()) !== renderedDay) render(); }, 1_000);

  return {
    update(next: Farm) {
      farm = next;
      render();
    },
  };
}
