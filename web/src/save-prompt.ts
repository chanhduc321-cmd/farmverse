import './save-prompt.css';

const STORAGE_KEY = 'farmverse-save-prompt';
type PromptStage = 'idle' | 'pending' | 'settled';

export interface SavePromptState {
  /** A guest finished a harvest; the prompt becomes due unless it was already answered. */
  noteHarvest(): void;
  isDue(): boolean;
  /** The prompt was answered or the farm now belongs to an account. */
  settle(): void;
}

/**
 * Tracks whether a guest should be asked to keep their farm. Guest progress lives behind a
 * browser cookie, so it is lost when an in-app browser drops its cookies or the link is
 * reopened in another browser. Falls back to memory when storage is unavailable.
 */
export function createSavePromptState(storage: Pick<Storage, 'getItem' | 'setItem'>): SavePromptState {
  let stage: PromptStage = 'idle';
  try {
    const saved = storage.getItem(STORAGE_KEY);
    if (saved === 'pending' || saved === 'settled') stage = saved;
  } catch { /* Continue without browser storage. */ }

  function save(next: PromptStage): void {
    stage = next;
    try { storage.setItem(STORAGE_KEY, next); } catch { /* Continue without browser storage. */ }
  }

  return {
    noteHarvest(): void { if (stage === 'idle') save('pending'); },
    isDue: () => stage === 'pending',
    settle(): void { if (stage !== 'settled') save('settled'); },
  };
}

interface SavePromptOptions {
  container: HTMLElement;
  /** True when nothing else (tour, dialog, visit) is competing for the player's attention. */
  canShow(): boolean;
  createAccount(): void;
  track(action: 'shown' | 'accept' | 'dismiss'): void;
}

export function createSavePrompt(options: SavePromptOptions) {
  const state = createSavePromptState(window.localStorage);
  const card = document.createElement('aside');
  card.id = 'save-prompt';
  card.hidden = true;
  card.setAttribute('aria-live', 'polite');
  card.setAttribute('aria-label', 'Giữ lại nông trại');
  card.innerHTML = `
    <p><strong>Giữ vườn này lại nhé!</strong> Tạo tài khoản để không mất rau khi đóng ứng dụng và để bạn bè vào thăm vườn.</p>
    <div class="save-prompt-actions">
      <button type="button" data-save-accept>Tạo tài khoản</button>
      <button type="button" data-save-later>Để sau</button>
    </div>`;
  options.container.append(card);

  function close(): void {
    card.hidden = true;
    state.settle();
  }
  card.querySelector<HTMLButtonElement>('[data-save-accept]')!.onclick = () => {
    options.track('accept');
    close();
    options.createAccount();
  };
  card.querySelector<HTMLButtonElement>('[data-save-later]')!.onclick = () => {
    options.track('dismiss');
    close();
  };

  return {
    noteHarvest(): void { state.noteHarvest(); },
    /** Shows the prompt when it is due and the screen is free; hides it while something else is in front. */
    refresh(isGuest: boolean): void {
      if (!isGuest) {
        if (!card.hidden || state.isDue()) close();
        return;
      }
      const show = state.isDue() && options.canShow();
      if (show && card.hidden) options.track('shown');
      card.hidden = !show;
    },
  };
}
