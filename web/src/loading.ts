const screen = document.querySelector<HTMLElement>('#farm-loading')!;
const main = document.querySelector<HTMLElement>('main')!;
const message = document.querySelector<HTMLElement>('#farm-loading-message')!;
const progress = document.querySelector<HTMLProgressElement>('#farm-loading-progress')!;
const retry = document.querySelector<HTMLButtonElement>('#farm-loading-retry')!;

let failed = false;
let loaded = 0;
let total = 0;
let deadline: number;

retry.onclick = () => location.reload();

function fail(reason: string): void {
  if (failed || screen.hidden) return;
  failed = true;
  clearTimeout(deadline);
  message.textContent = reason;
  progress.hidden = true;
  retry.hidden = false;
  retry.focus();
}

export const farmLoading = {
  get failed() { return failed; },
  start(): void {
    deadline = window.setTimeout(() => fail('Tải nông trại quá lâu. Vui lòng thử lại.'), 45_000);
  },
  assets(count: number): void {
    total = count;
    progress.value = 0;
  },
  fileLoaded(): void {
    if (failed) return;
    loaded++;
    progress.value = Math.min(99, Math.floor(loaded / total * 100));
  },
  finish(): void {
    if (failed) return;
    clearTimeout(deadline);
    progress.value = 100;
    main.inert = false;
    screen.hidden = true;
  },
  fail,
};
