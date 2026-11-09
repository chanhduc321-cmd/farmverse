import Phaser from 'phaser';
import type { FarmPlot, FarmSnapshot } from '../api';
import { farmApi, ApiError } from '../api';
import { ASSETS, applyAssetOrigin, preloadAllGameAssets } from '../assets';
import {
  CASUAL_FONT,
  createCasualButton,
  createPillBadge,
  drawSkyAndFloatingIsland,
} from '../ui';

interface PlotVisual {
  id: number;
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
  titleText: Phaser.GameObjects.Text;
  statusText: Phaser.GameObjects.Text;
}

export class FarmScene extends Phaser.Scene {
  private farm!: FarmSnapshot;
  private plotVisuals: Map<number, PlotVisual> = new Map();

  // Time tracking for monotonic countdown (BUG-04)
  private snapshotServerTimeMs = 0;
  private snapshotReceivedLocalMs = 0;

  // HUD elements
  private goldText!: Phaser.GameObjects.Text;
  private siloText!: Phaser.GameObjects.Text;
  private apiBadgeText!: Phaser.GameObjects.Text;
  private sellNormalBtn!: Phaser.GameObjects.Container;
  private sellGoldenBtn!: Phaser.GameObjects.Container;
  private toastText!: Phaser.GameObjects.Text;

  // Responsive camera mode (Overview / Focus)
  private cameraMode: 'OVERVIEW' | 'FOCUS' = 'OVERVIEW';
  private isManualCameraOverride = false;
  private cameraBtnContainer!: Phaser.GameObjects.Container;

  constructor() {
    super('FarmScene');
  }

  preload(): void {
    preloadAllGameAssets(this);
  }

  async create(): Promise<void> {
    // 1. Draw Illustrated Sunny Sky, Floating Clouds & 3D Isometric Floating Island (Farmery Style)
    drawSkyAndFloatingIsland(this);

    // 2. Island Scenery Props (Approved T-14 sprites matching approved_style.png)
    // Cozy Farmhouse Cottage on upper-left
    const farmhouse = this.add.image(105, 175, ASSETS.FARMHOUSE).setScale(0.88).setDepth(3);
    applyAssetOrigin(farmhouse, ASSETS.FARMHOUSE);

    // Rustic Grain Silo on upper-right
    const silo = this.add.image(700, 175, ASSETS.SILO).setScale(0.88).setDepth(3);
    applyAssetOrigin(silo, ASSETS.SILO);

    // Garden Koi Pond on lower-left
    const fishPond = this.add.image(95, 415, ASSETS.FISH_POND).setScale(0.85).setDepth(3);
    applyAssetOrigin(fishPond, ASSETS.FISH_POND);

    // Wooden Fence with Open Gate on lower-right (path toward town square)
    const fence = this.add.image(705, 415, ASSETS.FENCE_OPEN).setScale(0.88).setDepth(3);
    applyAssetOrigin(fence, ASSETS.FENCE_OPEN);

    // 3. Top Header Title & Floating HUD Badges
    this.createHeaderAndHUD();

    // Toast message area
    this.toastText = this.add.text(400, 485, '', {
      fontFamily: CASUAL_FONT,
      fontSize: '14px',
      color: '#fff9e6',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3.5,
    }).setOrigin(0.5).setDepth(25);

    // 4. Create 6 Plots (3 columns x 2 rows)
    const positions = [
      { id: 1, x: 235, y: 215 },
      { id: 2, x: 400, y: 215 },
      { id: 3, x: 565, y: 215 },
      { id: 4, x: 235, y: 345 },
      { id: 5, x: 400, y: 345 },
      { id: 6, x: 565, y: 345 },
    ];

    for (const pos of positions) {
      const container = this.add.container(pos.x, pos.y);
      container.setDepth(5);

      const sprite = this.add.image(0, 0, ASSETS.PLOT_EMPTY);
      applyAssetOrigin(sprite, ASSETS.PLOT_EMPTY);
      sprite.setInteractive({ useHandCursor: true });

      const titleText = this.add.text(0, -44, `Plot #${pos.id}`, {
        fontFamily: CASUAL_FONT,
        fontSize: '13px',
        color: '#fff5db',
        fontStyle: 'bold',
        stroke: '#361e0b',
        strokeThickness: 3.5,
      }).setOrigin(0.5);

      const statusText = this.add.text(0, 32, 'Trống\n[Gieo hạt]', {
        fontFamily: CASUAL_FONT,
        fontSize: '11px',
        color: '#e0d5ba',
        align: 'center',
        stroke: '#2e1b0c',
        strokeThickness: 3,
      }).setOrigin(0.5);

      container.add([sprite, titleText, statusText]);

      // Hover feedback
      sprite.on('pointerover', () => {
        container.setScale(1.04);
      });
      sprite.on('pointerout', () => {
        container.setScale(1.0);
      });

      // Click action (using pointerup with drag threshold to support drag-to-pan)
      sprite.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        const dragDist = Phaser.Math.Distance.Between(pointer.downX, pointer.downY, pointer.upX, pointer.upY);
        if (dragDist > 8) return;
        this.handlePlotClick(pos.id);
      });

      this.plotVisuals.set(pos.id, {
        id: pos.id,
        container,
        sprite,
        titleText,
        statusText,
      });
    }

    // 5. Action Bar / Quick Sell Buttons (Juicy 3D Casual Farm Buttons)
    this.createActionBar();

    // 6. Responsive Camera Controls
    this.createCameraControls();

    // 7. Initial Data Load
    await this.refreshFarm();
  }

  update(): void {
    if (!this.farm) return;

    // BUG-04: Monotonic countdown based on serverTimeMs + performance.now() elapsed time
    const currentServerTime = this.getEstimatedServerTime();

    for (let i = 0; i < this.farm.plots.length; i++) {
      const plot = this.farm.plots[i];
      if (plot.state === 'GROWING') {
        const remainingMs = Math.max(0, plot.readyAtMs - currentServerTime);
        const visual = this.plotVisuals.get(plot.id);
        if (visual) {
          if (remainingMs > 0) {
            const seconds = (remainingMs / 1000).toFixed(1);
            visual.statusText.setText(`ĐANG LỚN\n${seconds}s`);
            visual.statusText.setColor('#8eed82');
          } else {
            // Automatically transitions to READY
            this.farm.plots[i] = { id: plot.id, state: 'READY' };
            this.updatePlotDisplay(this.farm.plots[i]);
          }
        }
      }
    }
  }

  private createHeaderAndHUD(): void {
    // Cheerful Title Banner
    this.add.text(400, 16, 'FarmVerse — Nông Trại Sói Ca', {
      fontFamily: CASUAL_FONT,
      fontSize: '20px',
      color: '#fff9e6',
      fontStyle: 'bold',
      stroke: '#4a2c11',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(20);

    // 1. Gold Pill Badge (overlapping coin icon)
    const goldBadge = createPillBadge(this, 105, 48, 135, 34, ASSETS.COIN_GOLD, '0', '#d97706');
    this.goldText = goldBadge.text;

    // 2. Silo Pill Badge (overlapping silo icon)
    const siloBadge = createPillBadge(this, 260, 48, 145, 34, ASSETS.HUD_SILO_ICON, 'Silo: 0 / 10', '#5c3716');
    this.siloText = siloBadge.text;

    // 3. Camera Mode Toggle Button in HUD
    this.cameraBtnContainer = createCasualButton({
      scene: this,
      x: 420,
      y: 48,
      w: 135,
      h: 34,
      label: 'Góc rộng',
      iconKey: ASSETS.HUD_CAMERA_ICON,
      iconScale: 0.55,
      style: 'wood',
      onClick: () => {
        this.isManualCameraOverride = true;
        const nextMode = this.cameraMode === 'OVERVIEW' ? 'FOCUS' : 'OVERVIEW';
        this.setCameraMode(nextMode, true);
        this.showToast(
          nextMode === 'FOCUS' ? '📐 Chế độ Cận cảnh (Mobile focus)' : '🌐 Chế độ Góc rộng (Web overview)',
          '#fff9e6'
        );
      },
    });
    this.cameraBtnContainer.setDepth(20);

    // 4. API / Mock Badge (Top-right)
    const apiPill = this.add.container(710, 48).setDepth(20);
    const apiBg = this.add.graphics();
    apiBg.fillStyle(0x1e331e, 0.85);
    apiBg.fillRoundedRect(-65, -14, 130, 28, 14);
    apiBg.lineStyle(1.5, 0x5a8b5e, 0.8);
    apiBg.strokeRoundedRect(-65, -14, 130, 28, 14);

    this.apiBadgeText = this.add.text(0, 0, '🟢 Live Server', {
      fontFamily: CASUAL_FONT,
      fontSize: '11px',
      color: '#8ec489',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    apiPill.add([apiBg, this.apiBadgeText]);
  }

  private setFarmSnapshot(farm: FarmSnapshot): void {
    this.farm = farm;
    this.snapshotServerTimeMs = farm.serverTimeMs;
    this.snapshotReceivedLocalMs = performance.now();
    this.renderFarmState();
  }

  private getEstimatedServerTime(): number {
    const elapsed = performance.now() - this.snapshotReceivedLocalMs;
    return this.snapshotServerTimeMs + elapsed;
  }

  private async refreshFarm(): Promise<void> {
    try {
      const farm = await farmApi.getFarm();
      this.setFarmSnapshot(farm);
    } catch (err: unknown) {
      await this.handleApiError(err, 'Không thể tải trạng thái nông trại');
    }
  }

  private renderFarmState(): void {
    // Update HUD
    this.goldText.setText(`${this.farm.gold}`);
    const totalSilo = this.farm.silo.counts.NORMAL + this.farm.silo.counts.GOLDEN;
    this.siloText.setText(
      `Silo: ${totalSilo}/${this.farm.silo.capacity} (N:${this.farm.silo.counts.NORMAL} G:${this.farm.silo.counts.GOLDEN})`
    );

    if (farmApi.isUsingMock()) {
      this.apiBadgeText.setText('🟡 Mock Engine');
      this.apiBadgeText.setColor('#ffe082');
    } else {
      this.apiBadgeText.setText('🟢 Live Server');
      this.apiBadgeText.setColor('#8eed82');
    }

    // Update each plot
    for (const plot of this.farm.plots) {
      this.updatePlotDisplay(plot);
    }

    // Update Quick Sell button states
    this.updateQuickSellButtons();
  }

  private updatePlotDisplay(plot: FarmPlot): void {
    const visual = this.plotVisuals.get(plot.id);
    if (!visual) return;

    if (plot.state === 'EMPTY') {
      visual.sprite.setTexture(ASSETS.PLOT_EMPTY);
      applyAssetOrigin(visual.sprite, ASSETS.PLOT_EMPTY);
      visual.statusText.setText('Trống\n[Gieo hạt]');
      visual.statusText.setColor('#e0d5ba');
    } else if (plot.state === 'GROWING') {
      visual.sprite.setTexture(ASSETS.PLOT_GROWING);
      applyAssetOrigin(visual.sprite, ASSETS.PLOT_GROWING);
      const currentServerTime = this.getEstimatedServerTime();
      const remaining = Math.max(0, (plot.readyAtMs - currentServerTime) / 1000).toFixed(1);
      visual.statusText.setText(`ĐANG LỚN\n${remaining}s`);
      visual.statusText.setColor('#8eed82');
    } else if (plot.state === 'READY') {
      visual.sprite.setTexture(ASSETS.PLOT_READY_NORMAL);
      applyAssetOrigin(visual.sprite, ASSETS.PLOT_READY_NORMAL);
      visual.statusText.setText('CHÍN RỒI!\n[Thu hoạch]');
      visual.statusText.setColor('#ffd54f');
    } else if (plot.state === 'LOCKED') {
      visual.sprite.setTexture(ASSETS.PLOT_LOCKED);
      applyAssetOrigin(visual.sprite, ASSETS.PLOT_LOCKED);
      visual.statusText.setText(`KHÓA\n[${plot.unlockCostGold} GOLD]`);
      visual.statusText.setColor('#cfd8dc');
    }
  }

  private async handlePlotClick(plotId: number): Promise<void> {
    const plot = this.farm?.plots.find((p: FarmPlot) => p.id === plotId);
    if (!plot) return;

    const visual = this.plotVisuals.get(plotId);
    const pos = visual?.container;
    const x = pos ? pos.x : 400;
    const y = pos ? pos.y : 300;

    if (plot.state === 'EMPTY') {
      // Plant action (Free)
      try {
        const farm = await farmApi.plant(plotId, this.farm.revision);
        this.setFarmSnapshot(farm);
        this.showFloatingText(x, y - 25, '🌱 Gieo hạt!', '#8eed82');
      } catch (err: unknown) {
        await this.handleApiError(err, 'Gieo hạt thất bại', x, y - 25);
      }
    } else if (plot.state === 'GROWING') {
      const currentServerTime = this.getEstimatedServerTime();
      const remaining = Math.max(0, (plot.readyAtMs - currentServerTime) / 1000).toFixed(1);
      this.showFloatingText(x, y - 25, `⏳ Còn ${remaining}s`, '#ffffff');
    } else if (plot.state === 'READY') {
      // Harvest action
      const totalSilo = this.farm.silo.counts.NORMAL + this.farm.silo.counts.GOLDEN;
      if (totalSilo >= this.farm.silo.capacity) {
        this.showFloatingText(x, y - 25, '⚠️ Silo đầy (10/10)!', '#ff9800');
        this.showToast('Silo đã đầy! Hãy bán bớt lúa để thu hoạch thêm.', '#ff9800');
        return;
      }

      try {
        const result = await farmApi.harvest(plotId, this.farm.revision);
        this.setFarmSnapshot(result.farm);
        if (result.harvested === 'GOLDEN') {
          this.showFloatingText(x, y - 25, '✨ LÚA VÀNG! ✨', '#ffd700', 1.3);
          this.spawnHarvestSparkles(x, y);
        } else {
          this.showFloatingText(x, y - 25, '+1 Lúa Thường 🌾', '#ffffff');
        }
      } catch (err: unknown) {
        await this.handleApiError(err, 'Thu hoạch thất bại', x, y - 25);
      }
    } else if (plot.state === 'LOCKED') {
      // Unlock action
      if (this.farm.gold < plot.unlockCostGold) {
        this.showFloatingText(x, y - 25, `Cần ${plot.unlockCostGold} GOLD!`, '#ff7043');
        this.showToast(`Bạn cần ${plot.unlockCostGold} GOLD để mở ô #${plotId}. Bán nông sản để kiếm thêm GOLD!`, '#ff7043');
        return;
      }

      try {
        const farm = await farmApi.unlock(plotId, this.farm.revision);
        this.setFarmSnapshot(farm);
        this.showFloatingText(x, y - 25, `🔓 Mở ô #${plotId}! -${plot.unlockCostGold} G`, '#76ff03');
        this.showToast(`Đã mở thành công ô đất #${plotId}!`, '#76ff03');
      } catch (err: unknown) {
        await this.handleApiError(err, 'Mở ô thất bại', x, y - 25);
      }
    }
  }

  private spawnHarvestSparkles(x: number, y: number): void {
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const dist = Phaser.Math.Between(25, 45);
      const targetX = x + Math.cos(angle) * dist;
      const targetY = y + Math.sin(angle) * dist - 15;

      const sparkle = this.add.image(x, y - 10, ASSETS.SPARKLE_EFFECT).setScale(0.3).setAlpha(1).setDepth(20);
      this.tweens.add({
        targets: sparkle,
        x: targetX,
        y: targetY,
        scale: 0.85,
        alpha: 0,
        duration: 800 + i * 50,
        ease: 'Cubic.easeOut',
        onComplete: () => sparkle.destroy(),
      });
    }
  }

  private createActionBar(): void {
    const bottomY = 550;
    const isMock = farmApi.isUsingMock();

    const normalX = isMock ? 125 : 160;
    const goldenX = isMock ? 285 : 340;
    const storeX = isMock ? 465 : 565;

    // Quick Sell Normal Button (Juicy green 3D button)
    this.sellNormalBtn = createCasualButton({
      scene: this,
      x: normalX,
      y: bottomY,
      w: 155,
      h: 44,
      label: 'Bán Thường (+10G)',
      iconKey: ASSETS.CROP_NORMAL,
      iconScale: 0.48,
      style: 'green',
      onClick: async () => {
        try {
          const farm = await farmApi.quickSell('NORMAL', this.farm.revision);
          this.setFarmSnapshot(farm);
          this.showFloatingText(normalX, bottomY - 35, '+10 GOLD 💰', '#ffd54f');
        } catch (err: unknown) {
          await this.handleApiError(err, 'Không có Lúa Thường trong Silo để bán!', normalX, bottomY - 35);
        }
      },
    }).setDepth(15);

    // Quick Sell Golden Button (Juicy golden 3D button)
    this.sellGoldenBtn = createCasualButton({
      scene: this,
      x: goldenX,
      y: bottomY,
      w: 155,
      h: 44,
      label: 'Bán Vàng (+30G)',
      iconKey: ASSETS.CROP_GOLDEN,
      iconScale: 0.48,
      style: 'gold',
      onClick: async () => {
        try {
          const farm = await farmApi.quickSell('GOLDEN', this.farm.revision);
          this.setFarmSnapshot(farm);
          this.showFloatingText(goldenX, bottomY - 35, '+30 GOLD 💰✨', '#ffd700');
        } catch (err: unknown) {
          await this.handleApiError(err, 'Không có Lúa Vàng trong Silo để bán!', goldenX, bottomY - 35);
        }
      },
    }).setDepth(15);

    // Navigation to Town Square / Store Scene (Juicy blue 3D button)
    createCasualButton({
      scene: this,
      x: storeX,
      y: bottomY,
      w: 195,
      h: 44,
      label: 'Cửa Hàng Sói Ca',
      iconKey: ASSETS.HUD_CART_ICON,
      iconScale: 0.58,
      style: 'blue',
      onClick: () => {
        this.scene.start('StoreScene');
      },
    }).setDepth(15);

    // BUG-03: Only display Reset Test Loop in mock mode!
    if (isMock) {
      createCasualButton({
        scene: this,
        x: 690,
        y: bottomY,
        w: 125,
        h: 44,
        label: 'Reset Mock',
        style: 'wood',
        onClick: () => {
          const mockFarm = farmApi.resetMockSession();
          this.setFarmSnapshot(mockFarm);
          this.showToast('Đã đặt lại phiên chơi mock (0 GOLD, 2 ô trống, silo 0/10)', '#aed581');
        },
      }).setDepth(15);
    }
  }

  private updateQuickSellButtons(): void {
    if (!this.farm) return;
    const hasNormal = this.farm.silo.counts.NORMAL > 0;
    const hasGolden = this.farm.silo.counts.GOLDEN > 0;

    this.sellNormalBtn.setAlpha(hasNormal ? 1.0 : 0.45);
    this.sellGoldenBtn.setAlpha(hasGolden ? 1.0 : 0.45);
  }

  private async handleApiError(
    err: unknown,
    fallbackMsg: string,
    floatingX?: number,
    floatingY?: number
  ): Promise<void> {
    if (err instanceof ApiError) {
      const codeStr = err.code ? `[${err.code}] ` : '';
      const displayMsg = `${codeStr}${err.message}`;
      this.showToast(displayMsg, '#ff5252');

      if (floatingX !== undefined && floatingY !== undefined) {
        this.showFloatingText(floatingX, floatingY, `⚠️ ${err.code || 'Lỗi'}`, '#ff5252');
      }

      // BUG-02 Requirement: For 401 or 409, reload Farm from server before retrying
      if (err.status === 401 || err.status === 409) {
        await this.refreshFarm();
      }
    } else {
      const message = (err as Error)?.message || fallbackMsg;
      this.showToast(message, '#ff5252');
      if (floatingX !== undefined && floatingY !== undefined) {
        this.showFloatingText(floatingX, floatingY, '⚠️ Lỗi', '#ff5252');
      }
    }
  }

  private showFloatingText(
    x: number,
    y: number,
    message: string,
    color: string,
    scale = 1.0
  ): void {
    const text = this.add.text(x, y, message, {
      fontFamily: CASUAL_FONT,
      fontSize: '14px',
      color,
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3.5,
    }).setOrigin(0.5).setScale(scale).setDepth(30);

    this.tweens.add({
      targets: text,
      y: y - 40,
      alpha: 0,
      duration: 1000,
      ease: 'Power1',
      onComplete: () => text.destroy(),
    });
  }

  private showToast(message: string, color = '#fff9e6'): void {
    this.toastText.setText(message);
    this.toastText.setColor(color);

    this.time.delayedCall(4000, () => {
      if (this.toastText.text === message) {
        this.toastText.setText('');
      }
    });
  }

  private createCameraControls(): void {
    this.cameras.main.setBounds(0, 0, 800, 600);

    // Drag-to-pan in Focus mode
    let isDragging = false;
    this.input.on('pointerdown', () => {
      if (this.cameraMode === 'FOCUS') {
        isDragging = true;
      }
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!isDragging || !pointer.isDown) return;
      const zoom = this.cameras.main.zoom;
      const dx = (pointer.x - pointer.prevPosition.x) / zoom;
      const dy = (pointer.y - pointer.prevPosition.y) / zoom;
      this.cameras.main.scrollX -= dx;
      this.cameras.main.scrollY -= dy;
    });

    this.input.on('pointerup', () => {
      isDragging = false;
    });

    // Initial detection & Resize listener
    const isPortrait = window.innerWidth < window.innerHeight;
    this.setCameraMode(isPortrait ? 'FOCUS' : 'OVERVIEW', false);

    const onResize = () => {
      if (this.isManualCameraOverride) return;
      const portrait = window.innerWidth < window.innerHeight;
      const desiredMode = portrait ? 'FOCUS' : 'OVERVIEW';
      if (desiredMode !== this.cameraMode) {
        this.setCameraMode(desiredMode, true);
      }
    };
    window.addEventListener('resize', onResize);
    this.events.once('shutdown', () => {
      window.removeEventListener('resize', onResize);
    });
  }

  private setCameraMode(mode: 'OVERVIEW' | 'FOCUS', smooth = true): void {
    this.cameraMode = mode;
    const targetZoom = mode === 'FOCUS' ? 1.3 : 1.0;
    const targetCenterX = 400;
    const targetCenterY = mode === 'FOCUS' ? 270 : 300;

    if (smooth) {
      this.cameras.main.zoomTo(targetZoom, 300, 'Sine.easeInOut');
      this.cameras.main.pan(targetCenterX, targetCenterY, 300, 'Sine.easeInOut');
    } else {
      this.cameras.main.setZoom(targetZoom);
      this.cameras.main.centerOn(targetCenterX, targetCenterY);
    }
  }
}
