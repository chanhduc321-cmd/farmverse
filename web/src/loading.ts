const screen = document.querySelector<HTMLElement>('#farm-loading')!;
const main = document.querySelector<HTMLElement>('main')!;
const message = document.querySelector<HTMLElement>('#farm-loading-message')!;
const progress = document.querySelector<HTMLProgressElement>('#farm-loading-progress')!;
const percent = document.querySelector<HTMLElement>('#farm-loading-percent')!;
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
  progress.hidden = percent.hidden = true;
  retry.hidden = false;
  retry.focus();
}

function updateProgress(value: number): void {
  progress.value = value;
  percent.textContent = `${value}%`;
}

export const farmLoading = {
  get failed() { return failed; },
  start(): void {
    deadline = window.setTimeout(() => fail('Tải nông trại quá lâu. Vui lòng thử lại.'), 45_000);
  },
  assets(count: number): void {
    total = count;
    message.textContent = 'Đang tải tài nguyên…';
    percent.hidden = false;
    updateProgress(0);
  },
  fileLoaded(): void {
    if (failed) return;
    loaded++;
    updateProgress(Math.min(99, Math.floor(loaded / total * 100)));
  },
  finish(): void {
    if (failed) return;
    clearTimeout(deadline);
    updateProgress(100);
    main.inert = false;
    screen.hidden = true;
  },
  fail,
};
