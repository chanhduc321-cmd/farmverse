import Phaser from 'phaser';
import type { FarmPlot, FarmSnapshot } from '../api';
import { farmApi, ApiError } from '../api';
import { ASSETS, applyAssetOrigin, preloadAllGameAssets } from '../assets';

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
    preloadAllGameAssets(this);
  }

  async create(): Promise<void> {
    // 1. Draw Field Background with warm casual grass tones
    const bg = this.add.graphics();
    // Ambient forest green backdrop
    bg.fillStyle(0x274328, 1);
    bg.fillRect(0, 0, 800, 600);

    // Warm lush island meadow
    bg.fillStyle(0x386139, 1);
    bg.fillRoundedRect(40, 95, 720, 420, 20);
    bg.lineStyle(3, 0x1f3820, 0.9);
    bg.strokeRoundedRect(40, 95, 720, 420, 20);

    // Central tilled earth patch for farming plots
    bg.fillStyle(0x4a2e16, 0.95);
    bg.fillRoundedRect(150, 145, 500, 265, 16);
    bg.lineStyle(2, 0x331f0e, 0.8);
    bg.strokeRoundedRect(150, 145, 500, 265, 16);

    // 2. Island Scenery Props (Approved T-14 sprites)
    // Cozy Farmhouse Cottage on upper-left
    const farmhouse = this.add.image(95, 165, ASSETS.FARMHOUSE).setScale(0.82).setDepth(2);
    applyAssetOrigin(farmhouse, ASSETS.FARMHOUSE);

    // Rustic Grain Silo on upper-right
    const silo = this.add.image(705, 165, ASSETS.SILO).setScale(0.85).setDepth(2);
    applyAssetOrigin(silo, ASSETS.SILO);

    // Garden Koi Pond on lower-left
    const fishPond = this.add.image(95, 430, ASSETS.FISH_POND).setScale(0.8).setDepth(2);
    applyAssetOrigin(fishPond, ASSETS.FISH_POND);

    // Wooden Fence with Open Gate on lower-right (path toward town square)
    const fence = this.add.image(705, 430, ASSETS.FENCE_OPEN).setScale(0.85).setDepth(2);
    applyAssetOrigin(fence, ASSETS.FENCE_OPEN);

    // 3. Header & HUD
    this.add.text(400, 26, 'FarmVerse — My Farm', {
      fontSize: '22px',
      color: '#f5eed7',
      fontStyle: 'bold',
      stroke: '#1b2e1c',
      strokeThickness: 3,
    }).setOrigin(0.5);

    // Top HUD Bar
    this.createTopHUD();

    // Toast message area
    this.toastText = this.add.text(400, 480, '', {
      fontSize: '13px',
      color: '#f3eed9',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(15);

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
        fontSize: '13px',
        color: '#f8f4e6',
        fontStyle: 'bold',
        stroke: '#1c120a',
        strokeThickness: 3,
      }).setOrigin(0.5);

      const statusText = this.add.text(0, 32, 'EMPTY\n[Gieo hạt]', {
        fontSize: '11px',
        color: '#e0d5ba',
        align: 'center',
        stroke: '#1c120a',
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

    // 5. Action Bar / Quick Sell Buttons
    this.createActionBar();

    // 6. Responsive Camera Controls (Overview / Focus & Touch Pan)
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

  private createTopHUD(): void {
    const hudBg = this.add.graphics();
    hudBg.fillStyle(0x1a291a, 0.92);
    hudBg.fillRoundedRect(50, 50, 700, 42, 8);
    hudBg.lineStyle(1, 0x486b4a, 0.7);
    hudBg.strokeRoundedRect(50, 50, 700, 42, 8);
    hudBg.setDepth(10);

    // Gold icon + text
    this.add.image(75, 71, ASSETS.COIN_GOLD).setScale(0.55).setOrigin(0.5).setDepth(11);
    this.goldText = this.add.text(95, 71, '0', {
      fontSize: '15px',
      color: '#f3c969',
      fontStyle: 'bold',
      stroke: '#241600',
      strokeThickness: 2,
    }).setOrigin(0, 0.5).setDepth(11);

    // Silo icon + text
    this.add.image(210, 71, ASSETS.HUD_SILO_ICON).setScale(0.65).setOrigin(0.5).setDepth(11);
    this.siloText = this.add.text(230, 71, 'Silo: 0 / 10', {
      fontSize: '13px',
      color: '#e4dcc4',
      stroke: '#1a291a',
      strokeThickness: 2,
    }).setOrigin(0, 0.5).setDepth(11);

    this.apiBadgeText = this.add.text(730, 71, 'API: Live Hono Server', {
      fontSize: '11px',
      color: '#8ec489',
    }).setOrigin(1, 0.5).setDepth(11);
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
      `Silo: ${totalSilo}/${this.farm.silo.capacity} (N: ${this.farm.silo.counts.NORMAL}, G: ${this.farm.silo.counts.GOLDEN})`
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
      visual.sprite.setTexture(ASSETS.PLOT_EMPTY);
      applyAssetOrigin(visual.sprite, ASSETS.PLOT_EMPTY);
      visual.statusText.setText('EMPTY\n[Gieo hạt]');
      visual.statusText.setColor('#e0d5ba');
    } else if (plot.state === 'GROWING') {
      visual.sprite.setTexture(ASSETS.PLOT_GROWING);
      applyAssetOrigin(visual.sprite, ASSETS.PLOT_GROWING);
      const currentServerTime = this.getEstimatedServerTime();
      const remaining = Math.max(0, (plot.readyAtMs - currentServerTime) / 1000).toFixed(1);
      visual.statusText.setText(`GROWING\n${remaining}s`);
      visual.statusText.setColor('#8eed82');
    } else if (plot.state === 'READY') {
      visual.sprite.setTexture(ASSETS.PLOT_READY_NORMAL);
      applyAssetOrigin(visual.sprite, ASSETS.PLOT_READY_NORMAL);
      visual.statusText.setText('READY!\n[Thu hoạch]');
      visual.statusText.setColor('#ffd54f');
    } else if (plot.state === 'LOCKED') {
      visual.sprite.setTexture(ASSETS.PLOT_LOCKED);
      applyAssetOrigin(visual.sprite, ASSETS.PLOT_LOCKED);
      visual.statusText.setText(`LOCKED\n[${plot.unlockCostGold} GOLD]`);
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
        this.showToast('Silo đầy! Hãy bán bớt crop để có chỗ thu hoạch.', '#ff9800');
        return;
      }

      try {
        const result = await farmApi.harvest(plotId, this.farm.revision);
        this.setFarmSnapshot(result.farm);
        if (result.harvested === 'GOLDEN') {
          this.showFloatingText(x, y - 25, '✨ GOLDEN CROP! ✨', '#ffd700', 1.3);
          this.spawnHarvestSparkles(x, y);
        } else {
          this.showFloatingText(x, y - 25, '+1 Normal Crop 🌾', '#ffffff');
        }
      } catch (err: unknown) {
        await this.handleApiError(err, 'Thu hoạch thất bại', x, y - 25);
      }
    } else if (plot.state === 'LOCKED') {
      // Unlock action
      if (this.farm.gold < plot.unlockCostGold) {
        this.showFloatingText(x, y - 25, `Cần ${plot.unlockCostGold} GOLD!`, '#ff7043');
        this.showToast(`Bạn cần ${plot.unlockCostGold} GOLD để mở ô #${plotId}. Bán crop để kiếm GOLD!`, '#ff7043');
        return;
      }

      try {
        const farm = await farmApi.unlock(plotId, this.farm.revision);
        this.setFarmSnapshot(farm);
        this.showFloatingText(x, y - 25, `🔓 Mở ô #${plotId}! -${plot.unlockCostGold} G`, '#76ff03');
        this.showToast(`Đã mở thành công ô #${plotId}!`, '#76ff03');
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
        scale: 0.8,
        alpha: 0,
        duration: 800 + i * 50,
        ease: 'Cubic.easeOut',
        onComplete: () => sparkle.destroy(),
      });
    }
  }

  private createActionBar(): void {
    const bottomY = 540;
    const isMock = farmApi.isUsingMock();

    const normalX = isMock ? 135 : 175;
    const goldenX = isMock ? 295 : 365;
    const storeX = isMock ? 475 : 590;

    // Quick Sell Normal Button with crop_normal icon
    this.sellNormalBtn = this.createButtonWithIcon(
      normalX,
      bottomY,
      'Bán Thường (+10 G)',
      ASSETS.CROP_NORMAL,
      0x4a6b47,
      async () => {
        try {
          const farm = await farmApi.quickSell('NORMAL', this.farm.revision);
          this.setFarmSnapshot(farm);
          this.showFloatingText(normalX, bottomY - 30, '+10 GOLD 💰', '#ffd54f');
        } catch (err: unknown) {
          await this.handleApiError(err, 'Không có Crop Thường để bán!', normalX, bottomY - 30);
        }
      },
      155,
      40
    );

    // Quick Sell Golden Button with crop_golden icon
    this.sellGoldenBtn = this.createButtonWithIcon(
      goldenX,
      bottomY,
      'Bán Vàng (+30 G)',
      ASSETS.CROP_GOLDEN,
      0x8c6d23,
      async () => {
        try {
          const farm = await farmApi.quickSell('GOLDEN', this.farm.revision);
          this.setFarmSnapshot(farm);
          this.showFloatingText(goldenX, bottomY - 30, '+30 GOLD 💰✨', '#ffd700');
        } catch (err: unknown) {
          await this.handleApiError(err, 'Không có Crop Vàng để bán!', goldenX, bottomY - 30);
        }
      },
      155,
      40
    );

    // Navigation to Town Square / Store Scene with hud_cart_icon
    this.createButtonWithIcon(
      storeX,
      bottomY,
      'Đến Cửa Hàng (Store)',
      ASSETS.HUD_CART_ICON,
      0x1565c0,
      () => {
        this.scene.start('StoreScene');
      },
      185,
      40
    );

    // BUG-03: Only display Reset Test Loop in mock mode!
    if (isMock) {
      this.createButton(
        660,
        bottomY,
        'Reset Mock',
        0x3d3d3d,
        () => {
          const mockFarm = farmApi.resetMockSession();
          this.setFarmSnapshot(mockFarm);
          this.showToast('Đã đặt lại phiên chơi mock (0 GOLD, 2 ô trống, silo 0/10)', '#aed581');
        },
        125,
        40
      );
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
    onClick: () => void,
    w = 170,
    h = 40
  ): Phaser.GameObjects.Container {
    const btn = this.add.container(x, y).setDepth(10);

    const bg = this.add.graphics();
    bg.fillStyle(bgColor, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 6);
    bg.lineStyle(1, 0xffffff, 0.3);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 6);

    const text = this.add.text(0, 0, label, {
      fontSize: '12px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    btn.add([bg, text]);
    btn.setSize(w, h);
    btn.setInteractive({ useHandCursor: true });

    btn.on('pointerover', () => btn.setScale(1.04));
    btn.on('pointerout', () => btn.setScale(1.0));
    btn.on('pointerdown', onClick);

    return btn;
  }

  private createButtonWithIcon(
    x: number,
    y: number,
    label: string,
    iconKey: string,
    bgColor: number,
    onClick: () => void,
    w = 170,
    h = 40
  ): Phaser.GameObjects.Container {
    const btn = this.add.container(x, y).setDepth(10);

    const bg = this.add.graphics();
    bg.fillStyle(bgColor, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 6);
    bg.lineStyle(1, 0xffffff, 0.3);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 6);

    const icon = this.add.image(-w / 2 + 18, 0, iconKey).setScale(0.48).setOrigin(0.5);
    const text = this.add.text(8, 0, label, {
      fontSize: '11px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    btn.add([bg, icon, text]);
    btn.setSize(w, h);
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
    }).setOrigin(0.5).setScale(scale).setDepth(25);

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
    const toggleContainer = this.add.container(450, 71).setDepth(11);
    const toggleBg = this.add.graphics();
    toggleBg.fillStyle(0x274328, 1);
    toggleBg.fillRoundedRect(-65, -13, 130, 26, 6);
    toggleBg.lineStyle(1, 0x5a8b5e, 0.8);
    toggleBg.strokeRoundedRect(-65, -13, 130, 26, 6);

    const cameraIcon = this.add.image(-48, 0, ASSETS.HUD_CAMERA_ICON).setScale(0.55).setOrigin(0.5);
    this.cameraToggleText = this.add.text(8, 0, 'Góc rộng (Web)', {
      fontSize: '11px',
      color: '#e4dcc4',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    toggleContainer.add([toggleBg, cameraIcon, this.cameraToggleText]);
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
      this.cameraToggleText.setText(mode === 'FOCUS' ? 'Cận cảnh (Mobile)' : 'Góc rộng (Web)');
    }
  }
}
