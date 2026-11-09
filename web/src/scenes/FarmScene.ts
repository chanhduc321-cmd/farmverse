import Phaser from 'phaser';
import type { FarmPlot, FarmSnapshot } from '../api';
import { farmApi, ApiError } from '../api';

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
  private cameraToggleText!: Phaser.GameObjects.Text;

  constructor() {
    super('FarmScene');
  }

  preload(): void {
    this.createPlaceholderTextures();
  }

  async create(): Promise<void> {
    // 1. Draw Field Background
    const bg = this.add.graphics();
    bg.fillStyle(0x274328, 1);
    bg.fillRect(0, 0, 800, 600);

    // Farm dirt boundary
    bg.fillStyle(0x355e3b, 1);
    bg.fillRoundedRect(80, 110, 640, 380, 16);
    bg.lineStyle(3, 0x1c311c, 0.8);
    bg.strokeRoundedRect(80, 110, 640, 380, 16);

    // 2. Header & HUD
    this.add.text(400, 28, 'FarmVerse — My Farm', {
      fontSize: '22px',
      color: '#f5eed7',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Top HUD Bar
    const hudBg = this.add.graphics();
    hudBg.fillStyle(0x1a291a, 0.9);
    hudBg.fillRoundedRect(80, 56, 640, 42, 8);
    hudBg.lineStyle(1, 0x486b4a, 0.6);
    hudBg.strokeRoundedRect(80, 56, 640, 42, 8);

    this.goldText = this.add.text(105, 77, '💰 GOLD: 0', {
      fontSize: '15px',
      color: '#f3c969',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5);

    this.siloText = this.add.text(260, 77, '🌾 Silo: 0 / 10', {
      fontSize: '14px',
      color: '#e4dcc4',
    }).setOrigin(0, 0.5);

    this.apiBadgeText = this.add.text(700, 77, 'API: Live Hono Server', {
      fontSize: '12px',
      color: '#8ec489',
    }).setOrigin(1, 0.5);

    // Toast message area
    this.toastText = this.add.text(400, 475, '', {
      fontSize: '13px',
      color: '#f3eed9',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // 3. Create 6 Plots (3 columns x 2 rows)
    const positions = [
      { id: 1, x: 190, y: 200 },
      { id: 2, x: 400, y: 200 },
      { id: 3, x: 610, y: 200 },
      { id: 4, x: 190, y: 340 },
      { id: 5, x: 400, y: 340 },
      { id: 6, x: 610, y: 340 },
    ];

    for (const pos of positions) {
      const container = this.add.container(pos.x, pos.y);

      const sprite = this.add.image(0, 0, 'plot_empty');
      sprite.setInteractive({ useHandCursor: true });

      const titleText = this.add.text(0, -32, `Plot #${pos.id}`, {
        fontSize: '13px',
        color: '#f8f4e6',
        fontStyle: 'bold',
      }).setOrigin(0.5);

      const statusText = this.add.text(0, 24, 'EMPTY', {
        fontSize: '12px',
        color: '#d4ccb8',
        align: 'center',
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

    // 4. Action Bar / Quick Sell Buttons
    this.createActionBar();

    // 5. Responsive Camera Controls (Overview / Focus & Touch Pan)
    this.createCameraControls();

    // 6. Initial Data Load
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
            visual.statusText.setText(`GROWING\n${seconds}s`);
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
    this.goldText.setText(`💰 GOLD: ${this.farm.gold}`);
    const totalSilo = this.farm.silo.counts.NORMAL + this.farm.silo.counts.GOLDEN;
    this.siloText.setText(
      `🌾 Silo: ${totalSilo}/${this.farm.silo.capacity} (N: ${this.farm.silo.counts.NORMAL}, G: ${this.farm.silo.counts.GOLDEN})`
    );

    if (farmApi.isUsingMock()) {
      this.apiBadgeText.setText('Mode: Client Mock Engine');
      this.apiBadgeText.setColor('#79b5f2');
    } else {
      this.apiBadgeText.setText('API: Live Hono Server');
      this.apiBadgeText.setColor('#79f28d');
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
      visual.sprite.setTexture('plot_empty');
      visual.statusText.setText('EMPTY\n[Tap to plant]');
      visual.statusText.setColor('#c2b89d');
    } else if (plot.state === 'GROWING') {
      visual.sprite.setTexture('plot_growing');
      const currentServerTime = this.getEstimatedServerTime();
      const remaining = Math.max(0, (plot.readyAtMs - currentServerTime) / 1000).toFixed(1);
      visual.statusText.setText(`GROWING\n${remaining}s`);
      visual.statusText.setColor('#8eed82');
    } else if (plot.state === 'READY') {
      visual.sprite.setTexture('plot_ready_normal');
      visual.statusText.setText('READY!\n[Tap to harvest]');
      visual.statusText.setColor('#ffd54f');
    } else if (plot.state === 'LOCKED') {
      visual.sprite.setTexture('plot_locked');
      visual.statusText.setText(`LOCKED\n[${plot.unlockCostGold} GOLD]`);
      visual.statusText.setColor('#9e9e9e');
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
        this.showFloatingText(x, y - 20, '🌱 Gieo hạt!', '#8eed82');
      } catch (err: unknown) {
        await this.handleApiError(err, 'Gieo hạt thất bại', x, y - 20);
      }
    } else if (plot.state === 'GROWING') {
      const currentServerTime = this.getEstimatedServerTime();
      const remaining = Math.max(0, (plot.readyAtMs - currentServerTime) / 1000).toFixed(1);
      this.showFloatingText(x, y - 20, `⏳ Còn ${remaining}s`, '#ffffff');
    } else if (plot.state === 'READY') {
      // Harvest action
      const totalSilo = this.farm.silo.counts.NORMAL + this.farm.silo.counts.GOLDEN;
      if (totalSilo >= this.farm.silo.capacity) {
        this.showFloatingText(x, y - 20, '⚠️ Silo đầy (10/10)!', '#ff9800');
        this.showToast('Silo đầy! Hãy bán bớt crop để có chỗ thu hoạch.', '#ff9800');
        return;
      }

      try {
        const result = await farmApi.harvest(plotId, this.farm.revision);
        this.setFarmSnapshot(result.farm);
        if (result.harvested === 'GOLDEN') {
          this.showFloatingText(x, y - 20, '✨ GOLDEN CROP! ✨', '#ffd700', 1.3);
        } else {
          this.showFloatingText(x, y - 20, '+1 Normal Crop', '#ffffff');
        }
      } catch (err: unknown) {
        await this.handleApiError(err, 'Thu hoạch thất bại', x, y - 20);
      }
    } else if (plot.state === 'LOCKED') {
      // Unlock action
      if (this.farm.gold < plot.unlockCostGold) {
        this.showFloatingText(x, y - 20, `Cần ${plot.unlockCostGold} GOLD!`, '#ff7043');
        this.showToast(`Bạn cần ${plot.unlockCostGold} GOLD để mở ô #${plotId}. Bán crop để kiếm GOLD!`, '#ff7043');
        return;
      }

      try {
        const farm = await farmApi.unlock(plotId, this.farm.revision);
        this.setFarmSnapshot(farm);
        this.showFloatingText(x, y - 20, `🔓 Mở ô #${plotId}! -${plot.unlockCostGold} G`, '#76ff03');
        this.showToast(`Đã mở thành công ô #${plotId}!`, '#76ff03');
      } catch (err: unknown) {
        await this.handleApiError(err, 'Mở ô thất bại', x, y - 20);
      }
    }
  }

  private createActionBar(): void {
    const bottomY = 535;

    // Quick Sell Normal Button
    this.sellNormalBtn = this.createButton(
      220,
      bottomY,
      'Bán Thường (+10 G)',
      0x4a6b47,
      async () => {
        try {
          const farm = await farmApi.quickSell('NORMAL', this.farm.revision);
          this.setFarmSnapshot(farm);
          this.showFloatingText(220, bottomY - 30, '+10 GOLD 💰', '#ffd54f');
        } catch (err: unknown) {
          await this.handleApiError(err, 'Không có Crop Thường để bán!', 220, bottomY - 30);
        }
      }
    );

    // Quick Sell Golden Button
    this.sellGoldenBtn = this.createButton(
      410,
      bottomY,
      'Bán Vàng (+30 G)',
      0x8c6d23,
      async () => {
        try {
          const farm = await farmApi.quickSell('GOLDEN', this.farm.revision);
          this.setFarmSnapshot(farm);
          this.showFloatingText(410, bottomY - 30, '+30 GOLD 💰✨', '#ffd700');
        } catch (err: unknown) {
          await this.handleApiError(err, 'Không có Crop Vàng để bán!', 410, bottomY - 30);
        }
      }
    );

    // BUG-03: Only display Reset Test Loop in mock mode!
    if (farmApi.isUsingMock()) {
      this.createButton(610, bottomY, 'Reset Test Loop', 0x3d3d3d, () => {
        const mockFarm = farmApi.resetMockSession();
        this.setFarmSnapshot(mockFarm);
        this.showToast('Đã đặt lại phiên chơi mock (0 GOLD, 2 ô trống, silo 0/10)', '#aed581');
      });
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

  private createButton(
    x: number,
    y: number,
    label: string,
    bgColor: number,
    onClick: () => void
  ): Phaser.GameObjects.Container {
    const btn = this.add.container(x, y);

    const bg = this.add.graphics();
    bg.fillStyle(bgColor, 1);
    bg.fillRoundedRect(-85, -20, 170, 40, 6);
    bg.lineStyle(1, 0xffffff, 0.3);
    bg.strokeRoundedRect(-85, -20, 170, 40, 6);

    const text = this.add.text(0, 0, label, {
      fontSize: '12px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    btn.add([bg, text]);
    btn.setSize(170, 40);
    btn.setInteractive({ useHandCursor: true });

    btn.on('pointerover', () => btn.setScale(1.04));
    btn.on('pointerout', () => btn.setScale(1.0));
    btn.on('pointerdown', onClick);

    return btn;
  }

  private showFloatingText(
    x: number,
    y: number,
    message: string,
    color: string,
    scale = 1.0
  ): void {
    const text = this.add.text(x, y, message, {
      fontSize: '14px',
      color,
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setScale(scale);

    this.tweens.add({
      targets: text,
      y: y - 40,
      alpha: 0,
      duration: 1000,
      ease: 'Power1',
      onComplete: () => text.destroy(),
    });
  }

  private showToast(message: string, color = '#f3eed9'): void {
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

    // Camera mode toggle button in Top HUD bar
    const toggleContainer = this.add.container(440, 77);
    const toggleBg = this.add.graphics();
    toggleBg.fillStyle(0x274328, 1);
    toggleBg.fillRoundedRect(-65, -13, 130, 26, 6);
    toggleBg.lineStyle(1, 0x5a8b5e, 0.8);
    toggleBg.strokeRoundedRect(-65, -13, 130, 26, 6);

    this.cameraToggleText = this.add.text(0, 0, '🌐 Góc rộng (Web)', {
      fontSize: '11px',
      color: '#e4dcc4',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    toggleContainer.add([toggleBg, this.cameraToggleText]);
    toggleContainer.setSize(130, 26);
    toggleContainer.setInteractive({ useHandCursor: true });

    toggleContainer.on('pointerover', () => toggleContainer.setScale(1.05));
    toggleContainer.on('pointerout', () => toggleContainer.setScale(1.0));
    toggleContainer.on('pointerdown', () => {
      this.isManualCameraOverride = true;
      const nextMode = this.cameraMode === 'OVERVIEW' ? 'FOCUS' : 'OVERVIEW';
      this.setCameraMode(nextMode, true);
      this.showToast(
        nextMode === 'FOCUS' ? '📐 Chế độ Cận cảnh (Mobile focus)' : '🌐 Chế độ Góc rộng (Web overview)',
        '#d4ccb8'
      );
    });

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

    if (this.cameraToggleText) {
      this.cameraToggleText.setText(mode === 'FOCUS' ? '📐 Cận cảnh (Mobile)' : '🌐 Góc rộng (Web)');
    }
  }

  private createPlaceholderTextures(): void {
    if (this.textures.exists('plot_empty')) return;

    const w = 150;
    const h = 95;

    // 1. PLOT EMPTY (Tilled soil)
    const gEmpty = this.make.graphics({ x: 0, y: 0 });
    gEmpty.fillStyle(0x3e240e, 1);
    gEmpty.fillRoundedRect(0, 0, w, h, 8);
    gEmpty.fillStyle(0x5c3716, 1);
    gEmpty.fillRoundedRect(4, 4, w - 8, h - 8, 6);
    // Soil furrows
    gEmpty.fillStyle(0x452910, 1);
    gEmpty.fillRoundedRect(14, 18, w - 28, 12, 4);
    gEmpty.fillRoundedRect(14, 42, w - 28, 12, 4);
    gEmpty.fillRoundedRect(14, 66, w - 28, 12, 4);
    gEmpty.generateTexture('plot_empty', w, h);
    gEmpty.destroy();

    // 2. PLOT GROWING (Soil with fresh green sprout)
    const gGrow = this.make.graphics({ x: 0, y: 0 });
    gGrow.fillStyle(0x3e240e, 1);
    gGrow.fillRoundedRect(0, 0, w, h, 8);
    gGrow.fillStyle(0x5c3716, 1);
    gGrow.fillRoundedRect(4, 4, w - 8, h - 8, 6);
    // Sprout stem & leaves
    gGrow.fillStyle(0x388e3c, 1);
    gGrow.fillRoundedRect(w / 2 - 3, 30, 6, 30, 2);
    gGrow.fillCircle(w / 2 - 12, 34, 10);
    gGrow.fillCircle(w / 2 + 12, 34, 10);
    gGrow.fillStyle(0x81c784, 1);
    gGrow.fillCircle(w / 2 - 10, 32, 6);
    gGrow.fillCircle(w / 2 + 10, 32, 6);
    gGrow.generateTexture('plot_growing', w, h);
    gGrow.destroy();

    // 3. PLOT READY NORMAL (Mature wheat/corn)
    const gReady = this.make.graphics({ x: 0, y: 0 });
    gReady.fillStyle(0x3e240e, 1);
    gReady.fillRoundedRect(0, 0, w, h, 8);
    gReady.fillStyle(0x5c3716, 1);
    gReady.fillRoundedRect(4, 4, w - 8, h - 8, 6);
    // Golden-amber stalks
    gReady.fillStyle(0xdca632, 1);
    gReady.fillRoundedRect(w / 2 - 4, 20, 8, 45, 3);
    gReady.fillCircle(w / 2, 22, 14);
    gReady.fillCircle(w / 2 - 14, 32, 11);
    gReady.fillCircle(w / 2 + 14, 32, 11);
    gReady.fillStyle(0xffe082, 1);
    gReady.fillCircle(w / 2, 20, 8);
    gReady.generateTexture('plot_ready_normal', w, h);
    gReady.destroy();

    // 4. PLOT LOCKED (Dark soil with padlock indicator)
    const gLocked = this.make.graphics({ x: 0, y: 0 });
    gLocked.fillStyle(0x24180d, 1);
    gLocked.fillRoundedRect(0, 0, w, h, 8);
    gLocked.fillStyle(0x382414, 1);
    gLocked.fillRoundedRect(4, 4, w - 8, h - 8, 6);
    // Lock body
    gLocked.fillStyle(0x8d6e63, 1);
    gLocked.fillRoundedRect(w / 2 - 14, 32, 28, 22, 4);
    // Lock shackle
    gLocked.lineStyle(4, 0xbcaaa4, 1);
    gLocked.strokeCircle(w / 2, 26, 10);
    gLocked.generateTexture('plot_locked', w, h);
    gLocked.destroy();
  }
}
