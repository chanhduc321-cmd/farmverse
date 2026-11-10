import Phaser from 'phaser';
import { ripeAt, stageAt } from '../../shared/farm.mts';
import type { Crop, FarmAction, FarmResponse, Plot } from '../../shared/farm.mts';
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
  const rect = dialog.getBoundingClientRect();
  const isInDialog = (
    rect.top <= event.clientY &&
    event.clientY <= rect.top + rect.height &&
    rect.left <= event.clientX &&
    event.clientX <= rect.left + rect.width
  );
  if (!isInDialog) dialog.close();
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

type Panel = 'shop' | 'bag' | 'warehouse';
type Tool = { type: 'plant'; cropId: number } | { type: 'harvest' | 'clear' };
const panelInfo = {
  shop: { title: 'Tiệm hạt giống', description: 'Chọn giống cây cho mùa vụ mới.', icon: 2 },
  bag: { title: 'Túi hạt giống', description: 'Chọn hạt rồi bấm một ô đất để gieo.', icon: 12 },
  warehouse: { title: 'Kho nông sản', description: 'Bán nông sản đã thu hoạch để lấy xu.', icon: 8 },
};
let activePanel: Panel = 'shop';
let activeTool: Tool = { type: 'harvest' };
let busy = false;
let snapshot: FarmResponse;
let receivedAt = 0;
let crops: Crop[] = [];
const plotButtons: HTMLButtonElement[] = [];

async function request<T>(path: string, action?: FarmAction): Promise<T> {
  const response = await fetch(`/api/${path}`, action && {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(action),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(result?.error ?? 'Chưa kết nối được máy chủ HappyFarm.');
  }
  return await response.json() as T;
}

function setSnapshot(next: FarmResponse): void {
  snapshot = next;
  receivedAt = performance.now();
  coins.textContent = String(next.farm.coins);
  panelCoins.textContent = next.farm.coins.toLocaleString('vi-VN');
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
}

function updateToolHint(): void {
  buttons.forEach((button) => {
    if (button.hasAttribute('aria-pressed')) {
      button.setAttribute('aria-pressed', String(button.dataset.tool === activeTool.type));
    }
  });
  if (activeTool.type === 'plant') {
    const name = crops[activeTool.cropId - 1].name.toLowerCase();
    hint.textContent = `Đang chọn hạt ${name}. Bấm một ô trống để gieo.`;
  } else if (activeTool.type === 'clear') {
    hint.textContent = 'Bấm ô đã thu hoạch để dọn đất.';
  } else {
    hint.textContent = 'Mua hạt ở Tiệm hạt, chọn hạt trong Túi. Bấm cây chín để thu hoạch.';
  }
}

async function send(action: FarmAction): Promise<FarmResponse | undefined> {
  if (busy) return;
  busy = true;
  try {
    const result = await request<FarmResponse>('farm/actions', action);
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
    if (dialog.open) {
      panelFeedback.textContent = feedback.textContent;
      panelFeedback.classList.add('is-error');
    }
  } finally {
    busy = false;
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
    const locked = activePanel === 'shop' && snapshot.farm.level < crop.level;
    if (activePanel === 'shop') info.textContent = `${crop.buyPrice} xu / hạt`;
    if (activePanel === 'bag') info.textContent = `Còn ${seeds} hạt`;
    if (activePanel === 'warehouse') info.textContent = `${produce} trong kho · ${crop.sellPrice} xu / phần`;
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
    } else if (locked) {
      item.classList.add('item-locked');
      action.textContent = `Mở ở cấp ${crop.level}`;
      action.disabled = true;
    } else {
      const { stepper, quantity } = createQuantity(crop.name, activePanel === 'shop' ? 999 : Math.min(999, produce));
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

function createQuantity(name: string, max: number): { stepper: HTMLDivElement; quantity: HTMLInputElement } {
  const stepper = document.createElement('div');
  stepper.className = 'quantity-stepper';
  const quantity = document.createElement('input');
  quantity.type = 'number';
  quantity.inputMode = 'numeric';
  quantity.required = true;
  quantity.min = '1';
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
  decrease.onclick = () => { quantity.value = String(Math.max(1, Math.min(max, (quantity.valueAsNumber || 1) - 1))); };
  increase.onclick = () => { quantity.value = String(Math.max(1, Math.min(max, (quantity.valueAsNumber || 0) + 1))); };
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
  for (const tab of panelTabs) tab.onclick = () => showPanel(tab.dataset.panel as Panel);
  for (const button of buttons) {
    button.disabled = false;
    button.onclick = () => {
      const tool = button.dataset.tool;
      if (tool === 'theme') {
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
    button.onclick = async () => {
      const tool = activeTool;
      const previous = snapshot.farm;
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
        this.load.image(`crop-${crop.id}-${stage}`, asset(`${dir}/${stage}.png`));
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
      const gate = this.add.image(x - 40, y + 19, 'locked-gate').setOrigin(.5, .8);
      this.ground.add(gate);
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

    // Keep the chained gate from the middle of the sprite and align it with the plot edge.
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
      ? (viewWidth / width) * 1.15
      : Math.min(viewWidth / width, viewHeight / height, 1.25) * .84;
    const left = (viewWidth - width * zoom) / 2;
    const { fieldOffset } = themes[snapshot.farm.theme - 1];
    const top = isPortrait
      ? (viewHeight - height * zoom) / 2 + viewHeight * 0.04
      : (viewHeight - height * zoom) / 2 + viewHeight * fieldOffset;
    this.layoutBackground();
    this.ground.setPosition(left, top).setScale(zoom);
    [...positions, ...lockedPositions].forEach(([x, y], index) => {
      const button = plotButtons[index];
      button.style.left = `${left + x * zoom}px`;
      button.style.top = `${top + y * zoom}px`;
      button.style.width = `${tileWidth * zoom}px`;
      button.style.height = `${tileHeight * zoom}px`;
    });
  }

  update(): void {
    const theme = `theme-${snapshot.farm.theme}`;
    if (this.background.texture.key !== theme) {
      this.background.setTexture(theme);
      this.paintFieldBank();
      this.layout();
    }
    const now = snapshot.serverTime + performance.now() - receivedAt;
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
      if (visual.plant.texture.key !== frame) visual.plant.setTexture(frame); visual.plant.setScale(getCropScale(crop.id));
      const remaining = Math.ceil((ripeAt(crop, plot) - now) / 1_000);
      if (plot.harvested) status = 'Cần dọn đất';
      else if (stage === crop.stages) status = 'Đã chín';
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
  const [catalog, initial] = await Promise.all([
    request<Crop[]>('crops'),
    request<FarmResponse>('farm'),
  ]);
  crops = catalog;
  setSnapshot(initial);
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
  hint.textContent = 'Chưa kết nối được máy chủ HappyFarm. Kiểm tra backend rồi tải lại trang.';
});
