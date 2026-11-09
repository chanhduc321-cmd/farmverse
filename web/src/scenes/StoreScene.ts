import Phaser from 'phaser';
import type {
  FarmSnapshot,
  MerchantSnapshot,
} from '../api';
import { farmApi, merchantApi, ApiError } from '../api';

export class StoreScene extends Phaser.Scene {
  private farm: FarmSnapshot | null = null;
  private merchant: MerchantSnapshot | null = null;

  // Time tracking for monotonic countdown
  private snapshotServerTimeMs = 0;
  private snapshotReceivedLocalMs = 0;

  // UI Elements
  private playerGoldText!: Phaser.GameObjects.Text;
  private playerSiloText!: Phaser.GameObjects.Text;

  private npcStatusText!: Phaser.GameObjects.Text;
  private npcBudgetText!: Phaser.GameObjects.Text;
  private npcInventoryText!: Phaser.GameObjects.Text;
  private npcDemandText!: Phaser.GameObjects.Text;
  private npcPricingText!: Phaser.GameObjects.Text;

  private offerContainer!: Phaser.GameObjects.Container;
  private offerSideBadge!: Phaser.GameObjects.Text;
  private offerCropText!: Phaser.GameObjects.Text;
  private offerPriceText!: Phaser.GameObjects.Text;
  private offerTimerText!: Phaser.GameObjects.Text;
  private offerReasonText!: Phaser.GameObjects.Text;
  private acceptBtn!: Phaser.GameObjects.Container;
  private rejectBtn!: Phaser.GameObjects.Container;
  private noOfferText!: Phaser.GameObjects.Text;

  private toastText!: Phaser.GameObjects.Text;

  constructor() {
    super('StoreScene');
  }

  create(): void {
    // 1. Draw Town Square Plaza Background
    const bg = this.add.graphics();
    // Dark cobblestone plaza floor
    bg.fillStyle(0x23272a, 1);
    bg.fillRect(0, 0, 800, 600);

    // Inner Plaza Pavement
    bg.fillStyle(0x36393f, 1);
    bg.fillRoundedRect(40, 45, 720, 520, 16);
    bg.lineStyle(2, 0x4f545c, 0.8);
    bg.strokeRoundedRect(40, 45, 720, 520, 16);

    // 2. Header Bar with Back Button
    this.createHeader();

    // 3. Top Player HUD
    this.createPlayerHUD();

    // 4. Panels: Merchant Panel (Left) & Active Offer Panel (Right)
    this.createMerchantPanel();
    this.createOfferPanel();

    // 5. Toast area
    this.toastText = this.add.text(400, 540, '', {
      fontSize: '13px',
      color: '#f3eed9',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // 6. Initial Data Load
    this.refreshMerchantState();
  }

  update(): void {
    if (!this.merchant || !this.farm) return;

    const currentServerTime = this.getEstimatedServerTime();
    const activeOffer = this.merchant.offers.find((o) => o.expiresAtMs > currentServerTime);

    if (activeOffer) {
      const remainingMs = Math.max(0, activeOffer.expiresAtMs - currentServerTime);
      const seconds = (remainingMs / 1000).toFixed(1);
      this.offerTimerText.setText(`⏳ Thời hạn: ${seconds}s`);

      if (remainingMs <= 0) {
        // Expired -> trigger refresh
        this.refreshMerchantState();
      }
    } else if (this.merchant.cooldownUntilMs && this.merchant.cooldownUntilMs > currentServerTime) {
      const cooldownMs = Math.max(0, this.merchant.cooldownUntilMs - currentServerTime);
      const seconds = (cooldownMs / 1000).toFixed(1);
      this.noOfferText.setText(`⏳ Thương nhân đang nghỉ giữa hiệp (${seconds}s)...`);
      if (cooldownMs <= 0) {
        this.refreshMerchantState();
      }
    }
  }

  private createHeader(): void {
    // Back to Farm Button
    const backBtn = this.createButton(
      120,
      25,
      '🌾 Về Nông Trại',
      0x388e3c,
      () => {
        this.scene.start('FarmScene');
      },
      140,
      32
    );
    backBtn.setDepth(10);

    // Title
    this.add.text(400, 25, 'FarmVerse — Town Square & Store', {
      fontSize: '20px',
      color: '#f5eed7',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // API badge
    this.add.text(
      740,
      25,
      farmApi.isUsingMock() ? 'Chế độ: Mock Test' : 'API: Live Hono Server',
      {
        fontSize: '11px',
        color: farmApi.isUsingMock() ? '#ffd54f' : '#8ec489',
      }
    ).setOrigin(1, 0.5);
  }

  private createPlayerHUD(): void {
    const hudBg = this.add.graphics();
    hudBg.fillStyle(0x202225, 0.95);
    hudBg.fillRoundedRect(60, 55, 680, 40, 8);
    hudBg.lineStyle(1, 0x5a626a, 0.6);
    hudBg.strokeRoundedRect(60, 55, 680, 40, 8);

    this.playerGoldText = this.add.text(80, 75, '💰 Ví GOLD: 0', {
      fontSize: '14px',
      color: '#f3c969',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5);

    this.playerSiloText = this.add.text(260, 75, '🌾 Silo: 0 / 10 (Thường: 0 | Vàng: 0)', {
      fontSize: '13px',
      color: '#e4dcc4',
    }).setOrigin(0, 0.5);
  }

  private createMerchantPanel(): void {
    const px = 60;
    const py = 110;
    const pw = 330;
    const ph = 410;

    const bg = this.add.graphics();
    bg.fillStyle(0x2f3136, 0.95);
    bg.fillRoundedRect(px, py, pw, ph, 12);
    bg.lineStyle(1, 0x40444b, 0.8);
    bg.strokeRoundedRect(px, py, pw, ph, 12);

    // Panel Title
    this.add.text(px + pw / 2, py + 24, '🐺 THƯƠNG NHÂN SÓI CA', {
      fontSize: '15px',
      color: '#e0a96d',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Divider
    bg.lineStyle(1, 0x4f545c, 0.5);
    bg.lineBetween(px + 20, py + 45, px + pw - 20, py + 45);

    // Details
    const textStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: '13px',
      color: '#dcddde',
    };

    this.npcStatusText = this.add.text(px + 25, py + 65, '• Trạng thái: Đang tải...', textStyle);
    this.npcBudgetText = this.add.text(px + 25, py + 98, '• Ngân sách: ...', textStyle);
    this.npcInventoryText = this.add.text(px + 25, py + 131, '• Kho hàng NPC: ...', textStyle);
    this.npcDemandText = this.add.text(px + 25, py + 164, '• Nhu cầu thị trường: ...', textStyle);
    this.npcPricingText = this.add.text(px + 25, py + 197, '• Hệ số giá: ...', textStyle);

    // Rule summary box
    const infoBg = this.add.graphics();
    infoBg.fillStyle(0x202225, 0.8);
    infoBg.fillRoundedRect(px + 20, py + 235, pw - 40, 150, 8);

    this.add.text(px + 30, py + 245, '📖 Quy tắc C02 Lite:', {
      fontSize: '12px',
      color: '#f3c969',
      fontStyle: 'bold',
    });

    const ruleText = [
      '• Thương nhân MUA nông sản của bạn',
      '  và BÁN nông sản của họ cho bạn.',
      '• Hệ số giá biến động tự động theo',
      '  ngân sách, kho hàng và nhu cầu.',
      '• Chống đầu cơ: Giá bán tối thiểu 30G,',
      '  giá mua tối đa 25G (Không mua rẻ bán đắt lặp).',
    ].join('\n');

    this.add.text(px + 30, py + 270, ruleText, {
      fontSize: '11px',
      color: '#b9bbbe',
      lineSpacing: 4,
    });
  }

  private createOfferPanel(): void {
    const px = 410;
    const py = 110;
    const pw = 330;
    const ph = 410;

    const bg = this.add.graphics();
    bg.fillStyle(0x2f3136, 0.95);
    bg.fillRoundedRect(px, py, pw, ph, 12);
    bg.lineStyle(1, 0x40444b, 0.8);
    bg.strokeRoundedRect(px, py, pw, ph, 12);

    // Panel Title
    this.add.text(px + pw / 2, py + 24, '📋 BÁO GIÁ THỊ TRƯỜNG', {
      fontSize: '15px',
      color: '#80cbc4',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Divider
    bg.lineStyle(1, 0x4f545c, 0.5);
    bg.lineBetween(px + 20, py + 45, px + pw - 20, py + 45);

    // Offer Container (Visible when active offer exists)
    this.offerContainer = this.add.container(px, py);

    // Badge background
    const badgeBg = this.add.graphics();
    badgeBg.fillStyle(0x202225, 1);
    badgeBg.fillRoundedRect(20, 60, pw - 40, 220, 10);
    badgeBg.lineStyle(1, 0x5a626a, 0.6);
    badgeBg.strokeRoundedRect(20, 60, pw - 40, 220, 10);

    this.offerSideBadge = this.add.text(pw / 2, 85, 'ĐANG TẢI...', {
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#81c784',
    }).setOrigin(0.5);

    this.offerCropText = this.add.text(pw / 2, 120, '1x Normal Crop', {
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);

    this.offerPriceText = this.add.text(pw / 2, 155, '💰 Giá: 15 GOLD', {
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#ffd54f',
    }).setOrigin(0.5);

    this.offerTimerText = this.add.text(pw / 2, 195, '⏳ Thời hạn: 20s', {
      fontSize: '13px',
      color: '#90caf9',
    }).setOrigin(0.5);

    this.offerReasonText = this.add.text(pw / 2, 235, '', {
      fontSize: '12px',
      color: '#ff8a80',
      align: 'center',
    }).setOrigin(0.5);

    // Accept Button
    this.acceptBtn = this.createButton(
      85,
      320,
      '✅ Chấp Nhận',
      0x2e7d32,
      () => this.handleAcceptOffer(),
      120,
      38
    );

    // Reject Button
    this.rejectBtn = this.createButton(
      245,
      320,
      '❌ Từ Chối',
      0xc62828,
      () => this.handleRejectOffer(),
      120,
      38
    );

    this.offerContainer.add([
      badgeBg,
      this.offerSideBadge,
      this.offerCropText,
      this.offerPriceText,
      this.offerTimerText,
      this.offerReasonText,
      this.acceptBtn,
      this.rejectBtn,
    ]);

    // No offer placeholder text
    this.noOfferText = this.add.text(px + pw / 2, py + 180, '⏳ Đang tải dữ liệu báo giá...', {
      fontSize: '14px',
      color: '#b0bec5',
      align: 'center',
    }).setOrigin(0.5);

    // Refresh state button
    this.createButton(
      px + pw / 2,
      py + 360,
      '🔄 Tải Lại Dữ Liệu',
      0x455a64,
      () => this.refreshMerchantState(),
      160,
      34
    );
  }

  private async refreshMerchantState(): Promise<void> {
    try {
      const response = await merchantApi.getMerchantState();
      this.setSnapshots(response.farm, response.merchant);
    } catch (err: unknown) {
      await this.handleApiError(err, 'Không thể tải trạng thái cửa hàng');
    }
  }

  private setSnapshots(farm: FarmSnapshot, merchant: MerchantSnapshot): void {
    this.farm = farm;
    this.merchant = merchant;

    this.snapshotServerTimeMs = farm.serverTimeMs;
    this.snapshotReceivedLocalMs = performance.now();

    // 1. Update Player HUD
    const totalSilo = farm.silo.counts.NORMAL + farm.silo.counts.GOLDEN;
    this.playerGoldText.setText(`💰 Ví GOLD: ${farm.gold}`);
    this.playerSiloText.setText(
      `🌾 Silo: ${totalSilo} / ${farm.silo.capacity} (Thường: ${farm.silo.counts.NORMAL} | Vàng: ${farm.silo.counts.GOLDEN})`
    );

    // 2. Update Merchant Panel
    const isOutOfBusiness = merchant.status === 'OUT_OF_BUSINESS';
    this.npcStatusText.setText(
      `• Trạng thái: ${isOutOfBusiness ? '🛑 TẠM DỪNG KINH DOANH' : '🟢 Đang hoạt động'}`
    );
    this.npcStatusText.setColor(isOutOfBusiness ? '#e57373' : '#81c784');

    this.npcBudgetText.setText(`• Ngân sách NPC: ${merchant.goldBudget} GOLD`);

    const mInventoryTotal = merchant.inventory.counts.NORMAL + merchant.inventory.counts.GOLDEN;
    this.npcInventoryText.setText(
      `• Kho hàng NPC: ${mInventoryTotal} / ${merchant.inventory.capacity} (🌾 ${merchant.inventory.counts.NORMAL} | ✨ ${merchant.inventory.counts.GOLDEN})`
    );

    this.npcDemandText.setText(`• Nhu cầu thị trường: ${merchant.demand} / 10`);
    this.npcPricingText.setText(
      `• Hệ số giá: Mua x${merchant.pricing.buyMultiplier} | Bán x${merchant.pricing.sellMultiplier}`
    );

    // 3. Update Offers Panel
    const currentServerTime = this.getEstimatedServerTime();
    const activeOffer = merchant.offers.find((o) => o.expiresAtMs > currentServerTime);

    if (activeOffer) {
      this.offerContainer.setVisible(true);
      this.noOfferText.setVisible(false);

      if (activeOffer.side === 'BUY') {
        this.offerSideBadge.setText('📥 NPC MUA LẠI NÔNG SẢN CỦA BẠN');
        this.offerSideBadge.setColor('#81c784');
      } else {
        this.offerSideBadge.setText('📤 NPC BÁN NÔNG SẢN CHO BẠN');
        this.offerSideBadge.setColor('#ffb74d');
      }

      const cropName =
        activeOffer.crop === 'GOLDEN' ? '✨ Golden Crop (Lúa vàng)' : '🌾 Normal Crop (Lúa thường)';
      this.offerCropText.setText(`Số lượng: 1x ${cropName}`);
      this.offerPriceText.setText(`💰 Giá giao dịch: ${activeOffer.priceGold} GOLD`);

      // Can accept or block reason
      if (activeOffer.canAccept) {
        this.acceptBtn.setAlpha(1.0);
        this.offerReasonText.setText('Đủ điều kiện thực hiện giao dịch!');
        this.offerReasonText.setColor('#81c784');
      } else {
        this.acceptBtn.setAlpha(0.45);
        const reasonMsg = this.formatBlockReason(activeOffer.unavailableReason);
        this.offerReasonText.setText(`⚠️ ${reasonMsg}`);
        this.offerReasonText.setColor('#ff8a80');
      }
    } else {
      this.offerContainer.setVisible(false);
      this.noOfferText.setVisible(true);

      if (merchant.cooldownUntilMs && merchant.cooldownUntilMs > currentServerTime) {
        const remaining = Math.max(0, (merchant.cooldownUntilMs - currentServerTime) / 1000).toFixed(1);
        this.noOfferText.setText(`⏳ Thương nhân đang nghỉ giữa hiệp (${remaining}s)...`);
      } else if (isOutOfBusiness) {
        this.noOfferText.setText('🛑 Thương nhân đã hết vốn và tạm dừng giao dịch.');
      } else {
        this.noOfferText.setText('⏳ Đang chờ thương nhân tính toán báo giá mới...');
      }
    }
  }

  private async handleAcceptOffer(): Promise<void> {
    if (!this.merchant || !this.farm) return;
    const currentServerTime = this.getEstimatedServerTime();
    const activeOffer = this.merchant.offers.find((o) => o.expiresAtMs > currentServerTime);
    if (!activeOffer) {
      this.showToast('Báo giá đã hết hạn!', '#ff8a80');
      return;
    }

    if (!activeOffer.canAccept) {
      this.showToast(`Chưa đủ điều kiện: ${this.formatBlockReason(activeOffer.unavailableReason)}`, '#ff8a80');
      return;
    }

    try {
      const result = await merchantApi.acceptOffer(
        activeOffer.id,
        this.farm.revision,
        this.merchant.revision
      );
      this.setSnapshots(result.farm, result.merchant);
      const isBuy = activeOffer.side === 'BUY';
      const actionMsg = isBuy
        ? `Đã bán 1 ${activeOffer.crop} cho NPC! +${activeOffer.priceGold} GOLD 💰`
        : `Đã mua 1 ${activeOffer.crop} từ NPC! -${activeOffer.priceGold} GOLD 🌾`;
      this.showToast(actionMsg, '#81c784');
    } catch (err: unknown) {
      await this.handleApiError(err, 'Chấp nhận báo giá thất bại');
    }
  }

  private async handleRejectOffer(): Promise<void> {
    if (!this.merchant || !this.farm) return;
    const currentServerTime = this.getEstimatedServerTime();
    const activeOffer = this.merchant.offers.find((o) => o.expiresAtMs > currentServerTime);
    if (!activeOffer) {
      this.showToast('Báo giá đã hết hạn!', '#ff8a80');
      return;
    }

    try {
      const result = await merchantApi.rejectOffer(
        activeOffer.id,
        this.farm.revision,
        this.merchant.revision
      );
      this.setSnapshots(result.farm, result.merchant);
      this.showToast('Đã từ chối báo giá này.', '#ffd54f');
    } catch (err: unknown) {
      await this.handleApiError(err, 'Từ chối báo giá thất bại');
    }
  }

  private formatBlockReason(reason: string | null): string {
    switch (reason) {
      case 'CROP_UNAVAILABLE':
        return 'Bạn không có nông sản này trong Silo';
      case 'INSUFFICIENT_GOLD':
        return 'Bạn không có đủ GOLD';
      case 'SILO_FULL':
        return 'Kho Silo của bạn đã đầy (10/10)';
      case 'MERCHANT_INSUFFICIENT_GOLD':
        return 'Thương nhân không đủ GOLD';
      case 'MERCHANT_CROP_UNAVAILABLE':
        return 'Thương nhân không còn nông sản này';
      case 'MERCHANT_FULL':
        return 'Kho thương nhân đã đầy';
      default:
        return reason || 'Chưa đủ điều kiện';
    }
  }

  private getEstimatedServerTime(): number {
    if (!this.snapshotServerTimeMs) return Date.now();
    const elapsedLocalMs = performance.now() - this.snapshotReceivedLocalMs;
    return this.snapshotServerTimeMs + elapsedLocalMs;
  }

  private async handleApiError(err: unknown, fallbackMsg: string): Promise<void> {
    if (err instanceof ApiError) {
      const codeStr = err.code ? `[${err.code}] ` : '';
      const displayMsg = `${codeStr}${err.message}`;
      this.showToast(displayMsg, '#ff5252');

      // Refresh on 401 or 409
      if (err.status === 401 || err.status === 409) {
        await this.refreshMerchantState();
      }
    } else {
      const message = (err as Error)?.message || fallbackMsg;
      this.showToast(message, '#ff5252');
    }
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

  private createButton(
    x: number,
    y: number,
    label: string,
    bgColor: number,
    onClick: () => void,
    w = 140,
    h = 36
  ): Phaser.GameObjects.Container {
    const btn = this.add.container(x, y);

    const bg = this.add.graphics();
    bg.fillStyle(bgColor, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 6);
    bg.lineStyle(1, 0xffffff, 0.3);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 6);

    const text = this.add.text(0, 0, label, {
      fontSize: '13px',
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
}
