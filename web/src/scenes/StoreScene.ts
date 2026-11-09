import Phaser from 'phaser';
import type {
  FarmSnapshot,
  MerchantSnapshot,
} from '../api';
import { farmApi, merchantApi, ApiError } from '../api';
import { ASSETS, applyAssetOrigin, preloadAllGameAssets } from '../assets';

export class StoreScene extends Phaser.Scene {
  private farm: FarmSnapshot | null = null;
  private merchant: MerchantSnapshot | null = null;

  // Time tracking for monotonic countdown
  private snapshotServerTimeMs = 0;
  private snapshotReceivedLocalMs = 0;

  // Milestone refresh tracking (BUG-07)
  private isFetching = false;
  private lastRefreshedMilestoneMs: number | null = null;
  private isSubmittingAction = false;

  // Session recovery tracking (BUG-08)
  private sessionLost = false;
  private isRecoveringSession = false;
  private sessionLostModal!: Phaser.GameObjects.Container;

  // UI Elements
  private playerGoldText!: Phaser.GameObjects.Text;
  private playerSiloText!: Phaser.GameObjects.Text;

  private npcStatusText!: Phaser.GameObjects.Text;
  private npcBudgetText!: Phaser.GameObjects.Text;
  private npcInventoryText!: Phaser.GameObjects.Text;
  private npcDemandText!: Phaser.GameObjects.Text;
  private npcPricingText!: Phaser.GameObjects.Text;

  // Trade Dialog (MVP Contract: click NPC/Stall to open)
  private isTradeDialogOpen = true;
  private tradePanelBg!: Phaser.GameObjects.Graphics;
  private tradePanelTitle!: Phaser.GameObjects.Text;
  private closeTradeBtn!: Phaser.GameObjects.Container;
  private refreshBtn!: Phaser.GameObjects.Container;
  private openTradePromptContainer!: Phaser.GameObjects.Container;

  private offerContainer!: Phaser.GameObjects.Container;
  private offerSideBadge!: Phaser.GameObjects.Text;
  private offerCropImage!: Phaser.GameObjects.Image;
  private offerCropText!: Phaser.GameObjects.Text;
  private offerPriceCoin!: Phaser.GameObjects.Image;
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

  preload(): void {
    preloadAllGameAssets(this);
  }

  create(): void {
    this.sessionLost = false;
    this.isRecoveringSession = false;
    this.isFetching = false;
    this.lastRefreshedMilestoneMs = null;
    this.isSubmittingAction = false;

    // 1. Draw Town Square Plaza Background with cobblestone ground
    const bg = this.add.graphics();
    // Ambient dark floor
    bg.fillStyle(0x1a1c1e, 1);
    bg.fillRect(0, 0, 800, 600);

    // Modular cobblestone pavement tiles across the plaza (T-14 ground asset)
    const tileLeft = this.add.image(235, 310, ASSETS.TOWN_SQUARE_GROUND).setScale(1.18).setAlpha(0.6);
    applyAssetOrigin(tileLeft, ASSETS.TOWN_SQUARE_GROUND);
    const tileRight = this.add.image(565, 310, ASSETS.TOWN_SQUARE_GROUND).setScale(1.18).setAlpha(0.6);
    applyAssetOrigin(tileRight, ASSETS.TOWN_SQUARE_GROUND);

    // Inner Plaza Pavement border
    bg.fillStyle(0x272a2e, 0.45);
    bg.fillRoundedRect(40, 45, 720, 520, 16);
    bg.lineStyle(2, 0x4f545c, 0.8);
    bg.strokeRoundedRect(40, 45, 720, 520, 16);

    // 2. Header Bar with Back Button
    this.createHeader();

    // 3. Top Player HUD
    this.createPlayerHUD();

    // 4. Panels: Merchant NPC & Stall (Left) & Active Offer Panel (Right)
    this.createMerchantPanel();
    this.createOfferPanel();

    // 5. Session Lost Modal (BUG-08)
    this.createSessionLostModal();

    // 6. Toast area
    this.toastText = this.add.text(400, 540, '', {
      fontSize: '13px',
      color: '#f3eed9',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(20);

    // 7. Initial Data Load
    this.refreshMerchantState();
  }

  update(): void {
    if (this.sessionLost || !this.merchant || !this.farm) return;

    const currentServerTime = this.getEstimatedServerTime();
    const hasOffer = this.merchant.offers.length > 0;
    const currentOffer = hasOffer ? this.merchant.offers[0] : null;

    if (currentOffer) {
      if (currentOffer.expiresAtMs > currentServerTime) {
        const remainingMs = currentOffer.expiresAtMs - currentServerTime;
        const seconds = (remainingMs / 1000).toFixed(1);
        this.offerTimerText.setText(`⏳ Thời hạn: ${seconds}s`);
      } else {
        // BUG-07: Offer expired — disable action buttons and trigger milestone refresh
        this.offerTimerText.setText('⏳ Thời hạn: 0.0s (Hết hạn)');
        this.acceptBtn.setAlpha(0.45);
        this.rejectBtn.setAlpha(0.45);
        this.offerReasonText.setText('⚠️ Báo giá đã hết hạn, đang tải báo giá mới...');
        this.offerReasonText.setColor('#ff8a80');
        this.triggerMilestoneRefresh(currentOffer.expiresAtMs);
      }
    } else {
      // BUG-07: Auto-refresh when cooldown or nextOfferAtMs elapses
      if (this.merchant.cooldownUntilMs) {
        if (currentServerTime >= this.merchant.cooldownUntilMs) {
          this.noOfferText.setText('⏳ Hết thời gian nghỉ, đang tải báo giá mới...');
          this.triggerMilestoneRefresh(this.merchant.cooldownUntilMs);
        } else {
          const remaining = Math.max(0, (this.merchant.cooldownUntilMs - currentServerTime) / 1000).toFixed(1);
          this.noOfferText.setText(`⏳ Thương nhân đang nghỉ giữa hiệp (${remaining}s)...`);
        }
      } else if (this.merchant.nextOfferAtMs) {
        if (currentServerTime >= this.merchant.nextOfferAtMs) {
          this.noOfferText.setText('⏳ Đang tải báo giá mới...');
          this.triggerMilestoneRefresh(this.merchant.nextOfferAtMs);
        } else {
          const remaining = Math.max(0, (this.merchant.nextOfferAtMs - currentServerTime) / 1000).toFixed(1);
          this.noOfferText.setText(`⏳ Báo giá tiếp theo sau ${remaining}s...`);
        }
      } else if (this.merchant.status === 'OUT_OF_BUSINESS') {
        this.noOfferText.setText('🛑 Thương nhân đã hết vốn và tạm dừng giao dịch.');
      } else {
        this.noOfferText.setText('⏳ Đang chờ thương nhân tính toán báo giá mới...');
        this.triggerMilestoneRefresh(Math.floor(currentServerTime / 5000) * 5000);
      }
    }
  }

  // BUG-07: Trigger auto-refresh once per milestone to prevent duplicate GET spam
  private triggerMilestoneRefresh(milestoneMs: number): void {
    if (this.isFetching || this.lastRefreshedMilestoneMs === milestoneMs) return;
    this.lastRefreshedMilestoneMs = milestoneMs;
    this.refreshMerchantState();
  }

  private createHeader(): void {
    // Back to Farm Button with hud_cart_icon
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
      stroke: '#1b2e1c',
      strokeThickness: 2,
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

    // Gold icon + text
    this.add.image(80, 75, ASSETS.COIN_GOLD).setScale(0.55).setOrigin(0.5);
    this.playerGoldText = this.add.text(98, 75, '0 GOLD', {
      fontSize: '14px',
      color: '#f3c969',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5);

    // Silo icon + text
    this.add.image(260, 75, ASSETS.HUD_SILO_ICON).setScale(0.65).setOrigin(0.5);
    this.playerSiloText = this.add.text(280, 75, 'Silo: 0 / 10 (Thường: 0 | Vàng: 0)', {
      fontSize: '13px',
      color: '#e4dcc4',
    }).setOrigin(0, 0.5);
  }

  private createMerchantPanel(): void {
    const px = 60;
    const py = 110;
    const pw = 330;
    const ph = 410;

    // Interactive Stall & NPC Container (MVP Contract requirement)
    const stallContainer = this.add.container(px, py);

    const bg = this.add.graphics();
    bg.fillStyle(0x282b30, 0.95);
    bg.fillRoundedRect(0, 0, pw, ph, 12);
    bg.lineStyle(2, 0x5a626a, 0.8);
    bg.strokeRoundedRect(0, 0, pw, ph, 12);

    // Panel Title
    const title = this.add.text(pw / 2, 20, '🐺 THƯƠNG NHÂN SÓI CA', {
      fontSize: '15px',
      color: '#e0a96d',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Merchant Stall & Blue Wolf Character Sprite Artworks (T-14 approved assets)
    const stallSprite = this.add.image(pw / 2 + 10, 115, ASSETS.MERCHANT_STALL).setScale(0.78);
    applyAssetOrigin(stallSprite, ASSETS.MERCHANT_STALL);

    const npcSprite = this.add.image(pw / 2 - 35, 115, ASSETS.NPC_MERCHANT).setScale(0.8);
    applyAssetOrigin(npcSprite, ASSETS.NPC_MERCHANT);

    const signboard = this.add.image(pw - 35, 105, ASSETS.STORE_SIGNBOARD).setScale(0.7);
    applyAssetOrigin(signboard, ASSETS.STORE_SIGNBOARD);

    // Interactive callout badge on NPC
    const calloutBg = this.add.graphics();
    calloutBg.fillStyle(0x1565c0, 1);
    calloutBg.fillRoundedRect(pw / 2 - 120, 148, 240, 24, 6);
    const calloutText = this.add.text(pw / 2, 160, '💬 Bấm vào Thương Nhân để Giao Dịch', {
      fontSize: '11px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Details at y = 182..265
    const textStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: '12px',
      color: '#dcddde',
    };

    this.npcStatusText = this.add.text(25, 185, '• Trạng thái: Đang tải...', textStyle);
    this.npcBudgetText = this.add.text(25, 206, '• Ngân sách: ...', textStyle);
    this.npcInventoryText = this.add.text(25, 227, '• Kho hàng: ...', textStyle);
    this.npcDemandText = this.add.text(25, 248, '• Nhu cầu thị trường: ...', textStyle);
    this.npcPricingText = this.add.text(25, 269, '• Hệ số giá: ...', textStyle);

    // Rule summary box at y = 295..395
    const infoBg = this.add.graphics();
    infoBg.fillStyle(0x1e2124, 0.85);
    infoBg.fillRoundedRect(15, 296, pw - 30, 100, 8);

    const ruleHeader = this.add.text(25, 304, '📖 Quy tắc C02 Lite:', {
      fontSize: '11px',
      color: '#f3c969',
      fontStyle: 'bold',
    });

    const ruleText = [
      '• Thương nhân MUA nông sản của bạn',
      '  và BÁN nông sản của họ cho bạn.',
      '• Hệ số biến động theo tồn kho & nhu cầu.',
      '• Chống đầu cơ: Giá bán tối thiểu 30G,',
      '  giá mua tối đa 25G (Không mua rẻ bán đắt lặp).',
    ].join('\n');

    const ruleBody = this.add.text(25, 322, ruleText, {
      fontSize: '10px',
      color: '#b9bbbe',
      lineSpacing: 3,
    });

    stallContainer.add([
      bg,
      title,
      stallSprite,
      npcSprite,
      signboard,
      calloutBg,
      calloutText,
      this.npcStatusText,
      this.npcBudgetText,
      this.npcInventoryText,
      this.npcDemandText,
      this.npcPricingText,
      infoBg,
      ruleHeader,
      ruleBody,
    ]);

    // BUG-10: Make entire NPC Stall clickable to open Trade Dialog.
    // Phaser Container normalizes hit test coordinates by adding displayOriginX/Y (width*0.5, height*0.5).
    // Therefore hitArea rectangle must start at (pw/2, ph/2) to map exactly to [0, pw] and [0, ph] in local bounds.
    stallContainer.setSize(pw, ph);
    stallContainer.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(pw / 2, ph / 2, pw, ph),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
    });

    stallContainer.on('pointerover', () => {
      calloutBg.clear();
      calloutBg.fillStyle(0x1e88e5, 1);
      calloutBg.fillRoundedRect(pw / 2 - 120, 148, 240, 24, 6);
      bg.lineStyle(2, 0x80cbc4, 1);
      bg.strokeRoundedRect(0, 0, pw, ph, 12);
    });
    stallContainer.on('pointerout', () => {
      calloutBg.clear();
      calloutBg.fillStyle(0x1565c0, 1);
      calloutBg.fillRoundedRect(pw / 2 - 120, 148, 240, 24, 6);
      bg.lineStyle(2, 0x5a626a, 0.8);
      bg.strokeRoundedRect(0, 0, pw, ph, 12);
    });
    stallContainer.on('pointerdown', () => {
      this.openTradeDialog();
      this.showToast('Đã mở Quầy Giao Dịch cùng Thương Nhân Sói Ca!', '#81c784');
    });
  }

  private createOfferPanel(): void {
    const px = 410;
    const py = 110;
    const pw = 330;
    const ph = 410;

    this.tradePanelBg = this.add.graphics();
    this.tradePanelBg.fillStyle(0x282b30, 0.95);
    this.tradePanelBg.fillRoundedRect(px, py, pw, ph, 12);
    this.tradePanelBg.lineStyle(2, 0x40444b, 0.8);
    this.tradePanelBg.strokeRoundedRect(px, py, pw, ph, 12);

    // Panel Title
    this.tradePanelTitle = this.add.text(px + pw / 2 - 20, py + 22, '📋 BÁO GIÁ THỊ TRƯỜNG', {
      fontSize: '15px',
      color: '#80cbc4',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Close Dialog Button (✕ Đóng)
    this.closeTradeBtn = this.createButton(
      px + pw - 35,
      py + 22,
      '✕',
      0x4f545c,
      () => this.closeTradeDialog(),
      30,
      24
    );

    // Offer Container (Visible when active offer exists)
    this.offerContainer = this.add.container(px, py);

    // Badge background
    const badgeBg = this.add.graphics();
    badgeBg.fillStyle(0x202225, 1);
    badgeBg.fillRoundedRect(20, 52, pw - 40, 240, 10);
    badgeBg.lineStyle(1, 0x5a626a, 0.6);
    badgeBg.strokeRoundedRect(20, 52, pw - 40, 240, 10);

    this.offerSideBadge = this.add.text(pw / 2, 75, 'ĐANG TẢI...', {
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#81c784',
    }).setOrigin(0.5);

    // Item Crop Icon Sprite (T-14 item asset)
    this.offerCropImage = this.add.image(pw / 2, 120, ASSETS.CROP_NORMAL).setScale(0.85);
    applyAssetOrigin(this.offerCropImage, ASSETS.CROP_NORMAL);

    this.offerCropText = this.add.text(pw / 2, 162, '1x Normal Crop', {
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);

    // Price container with gold coin icon
    this.offerPriceCoin = this.add.image(pw / 2 - 50, 192, ASSETS.COIN_GOLD).setScale(0.6).setOrigin(0.5);
    this.offerPriceText = this.add.text(pw / 2 - 32, 192, '15 GOLD', {
      fontSize: '17px',
      fontStyle: 'bold',
      color: '#ffd54f',
    }).setOrigin(0, 0.5);

    this.offerTimerText = this.add.text(pw / 2, 224, '⏳ Thời hạn: 20s', {
      fontSize: '12px',
      color: '#90caf9',
    }).setOrigin(0.5);

    this.offerReasonText = this.add.text(pw / 2, 255, '', {
      fontSize: '11px',
      color: '#ff8a80',
      align: 'center',
    }).setOrigin(0.5);

    // Accept Button
    this.acceptBtn = this.createButton(
      85,
      315,
      '✅ Chấp Nhận',
      0x2e7d32,
      () => this.handleAcceptOffer(),
      120,
      36
    );

    // Reject Button
    this.rejectBtn = this.createButton(
      245,
      315,
      '❌ Từ Chối',
      0xc62828,
      () => this.handleRejectOffer(),
      120,
      36
    );

    this.offerContainer.add([
      badgeBg,
      this.offerSideBadge,
      this.offerCropImage,
      this.offerCropText,
      this.offerPriceCoin,
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

    // BUG-07: Refresh state button (placed directly in scene at visible panel bottom)
    this.refreshBtn = this.createButton(
      px + pw / 2,
      py + 370,
      '🔄 Tải Lại Dữ Liệu',
      0x455a64,
      () => {
        this.lastRefreshedMilestoneMs = null;
        this.refreshMerchantState();
      },
      160,
      34
    );
    this.refreshBtn.setDepth(5);

    // Open Trade Prompt Container (Shown when dialog is closed)
    this.openTradePromptContainer = this.add.container(px, py);
    const promptBg = this.add.graphics();
    promptBg.fillStyle(0x2f3136, 0.9);
    promptBg.fillRoundedRect(0, 0, pw, ph, 12);
    promptBg.lineStyle(1, 0x4f545c, 0.8);
    promptBg.strokeRoundedRect(0, 0, pw, ph, 12);

    const promptText = this.add.text(
      pw / 2,
      ph / 2 - 40,
      '🐺 Thương Nhân Sói Ca đang ở sạp hàng.\n\nBấm vào Thương Nhân bên trái\nhoặc bấm nút dưới đây để giao dịch!',
      {
        fontSize: '13px',
        color: '#dcddde',
        align: 'center',
        lineSpacing: 6,
      }
    ).setOrigin(0.5);

    const openBtn = this.createButton(
      pw / 2,
      ph / 2 + 50,
      '🛍️ Mở Quầy Giao Dịch',
      0x1565c0,
      () => this.openTradeDialog(),
      180,
      38
    );

    this.openTradePromptContainer.add([promptBg, promptText, openBtn]);
    this.openTradePromptContainer.setVisible(false);
  }

  private openTradeDialog(): void {
    this.isTradeDialogOpen = true;
    this.tradePanelBg.setVisible(true);
    this.tradePanelTitle.setVisible(true);
    this.closeTradeBtn.setVisible(true);
    this.refreshBtn.setVisible(true);
    this.openTradePromptContainer.setVisible(false);
    if (this.merchant) {
      this.updateOfferVisibility();
    }
  }

  private closeTradeDialog(): void {
    this.isTradeDialogOpen = false;
    this.tradePanelBg.setVisible(false);
    this.tradePanelTitle.setVisible(false);
    this.closeTradeBtn.setVisible(false);
    this.refreshBtn.setVisible(false);
    this.offerContainer.setVisible(false);
    this.noOfferText.setVisible(false);
    this.openTradePromptContainer.setVisible(true);
  }

  // BUG-08: Dedicated Session Lost Modal stopping recursive retries
  private createSessionLostModal(): void {
    this.sessionLostModal = this.add.container(400, 300);
    this.sessionLostModal.setDepth(100);

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.8);
    overlay.fillRect(-400, -300, 800, 600);

    const box = this.add.graphics();
    box.fillStyle(0x26292d, 1);
    box.fillRoundedRect(-200, -110, 400, 220, 12);
    box.lineStyle(2, 0xe53935, 1);
    box.strokeRoundedRect(-200, -110, 400, 220, 12);

    const title = this.add.text(0, -65, '⚠️ PHIÊN CHƠI HẾT HẠN (401)', {
      fontSize: '16px',
      color: '#ff5252',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const msg = this.add.text(
      0,
      -15,
      'Phiên chơi Guest chưa được khởi tạo hoặc cookie đã mất.\nVui lòng trở về Nông Trại để bắt đầu phiên mới.',
      {
        fontSize: '12px',
        color: '#e0e0e0',
        align: 'center',
        lineSpacing: 6,
      }
    ).setOrigin(0.5);

    const recoverBtn = this.createButton(
      0,
      55,
      '🌾 Khôi Phục Tại Nông Trại',
      0x2e7d32,
      () => {
        this.scene.start('FarmScene');
      },
      220,
      40
    );

    this.sessionLostModal.add([overlay, box, title, msg, recoverBtn]);
    this.sessionLostModal.setVisible(false);
  }

  private async refreshMerchantState(): Promise<void> {
    if (this.sessionLost || this.isFetching) return;
    this.isFetching = true;

    try {
      const response = await merchantApi.getMerchantState();
      this.isRecoveringSession = false;
      this.sessionLost = false;
      this.sessionLostModal.setVisible(false);
      this.setSnapshots(response.farm, response.merchant);
    } catch (err: unknown) {
      await this.handleApiError(err, 'Không thể tải trạng thái cửa hàng');
      // BUG-07: On error (such as 503 or transient network issue),
      // reset milestone tracker after 3s so update() can auto-retry without spinning
      this.time.delayedCall(3000, () => {
        this.lastRefreshedMilestoneMs = null;
      });
    } finally {
      this.isFetching = false;
    }
  }

  private setSnapshots(farm: FarmSnapshot, merchant: MerchantSnapshot): void {
    this.farm = farm;
    this.merchant = merchant;

    this.snapshotServerTimeMs = farm.serverTimeMs;
    this.snapshotReceivedLocalMs = performance.now();

    // 1. Update Player HUD
    const totalSilo = farm.silo.counts.NORMAL + farm.silo.counts.GOLDEN;
    this.playerGoldText.setText(`${farm.gold} GOLD`);
    this.playerSiloText.setText(
      `Silo: ${totalSilo} / ${farm.silo.capacity} (🌾 ${farm.silo.counts.NORMAL} | ✨ ${farm.silo.counts.GOLDEN})`
    );

    // 2. Update Merchant Panel
    const isOutOfBusiness = merchant.status === 'OUT_OF_BUSINESS';
    this.npcStatusText.setText(
      `• Trạng thái: ${isOutOfBusiness ? '🛑 TẠM DỪNG' : '🟢 Hoạt động'}`
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
    this.updateOfferVisibility();
  }

  private updateOfferVisibility(): void {
    if (!this.merchant || !this.isTradeDialogOpen) return;

    const currentServerTime = this.getEstimatedServerTime();
    const activeOffer = this.merchant.offers.find((o) => o.expiresAtMs > currentServerTime);
    const isOutOfBusiness = this.merchant.status === 'OUT_OF_BUSINESS';

    if (activeOffer) {
      this.offerContainer.setVisible(true);
      this.noOfferText.setVisible(false);

      if (activeOffer.side === 'BUY') {
        this.offerSideBadge.setText('📥 NPC MUA LẠI CỦA BẠN');
        this.offerSideBadge.setColor('#81c784');
      } else {
        this.offerSideBadge.setText('📤 NPC BÁN CHO BẠN');
        this.offerSideBadge.setColor('#ffb74d');
      }

      // Update crop item visual
      if (activeOffer.crop === 'GOLDEN') {
        this.offerCropImage.setTexture(ASSETS.CROP_GOLDEN);
        this.offerCropText.setText('1x Golden Crop (Lúa vàng ✨)');
      } else {
        this.offerCropImage.setTexture(ASSETS.CROP_NORMAL);
        this.offerCropText.setText('1x Normal Crop (Lúa thường 🌾)');
      }

      this.offerPriceText.setText(`${activeOffer.priceGold} GOLD`);

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

      // BUG-12: Restore Reject button alpha to 1.0 when active offer is available
      this.rejectBtn.setAlpha(1.0);
    } else {
      this.offerContainer.setVisible(false);
      this.noOfferText.setVisible(true);

      if (this.merchant.cooldownUntilMs && this.merchant.cooldownUntilMs > currentServerTime) {
        const remaining = Math.max(0, (this.merchant.cooldownUntilMs - currentServerTime) / 1000).toFixed(1);
        this.noOfferText.setText(`⏳ Thương nhân đang nghỉ giữa hiệp (${remaining}s)...`);
      } else if (this.merchant.nextOfferAtMs && this.merchant.nextOfferAtMs > currentServerTime) {
        const remaining = Math.max(0, (this.merchant.nextOfferAtMs - currentServerTime) / 1000).toFixed(1);
        this.noOfferText.setText(`⏳ Báo giá tiếp theo sau ${remaining}s...`);
      } else if (isOutOfBusiness) {
        this.noOfferText.setText('🛑 Thương nhân đã hết vốn và tạm dừng giao dịch.');
      } else {
        this.noOfferText.setText('⏳ Đang chờ thương nhân tính toán báo giá mới...');
      }
    }
  }

  private async handleAcceptOffer(): Promise<void> {
    // BUG-11: Guard against double-click concurrent requests
    if (this.isSubmittingAction || !this.merchant || !this.farm) return;
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

    this.isSubmittingAction = true;
    this.acceptBtn.setAlpha(0.45);
    this.rejectBtn.setAlpha(0.45);

    try {
      const result = await merchantApi.acceptOffer(
        activeOffer.id,
        this.farm.revision,
        this.merchant.revision
      );
      this.lastRefreshedMilestoneMs = null;
      this.setSnapshots(result.farm, result.merchant);
      const isBuy = activeOffer.side === 'BUY';
      const actionMsg = isBuy
        ? `Đã bán 1 ${activeOffer.crop} cho NPC! +${activeOffer.priceGold} GOLD 💰`
        : `Đã mua 1 ${activeOffer.crop} từ NPC! -${activeOffer.priceGold} GOLD 🌾`;
      this.showToast(actionMsg, '#81c784');
    } catch (err: unknown) {
      await this.handleApiError(err, 'Chấp nhận báo giá thất bại');
    } finally {
      this.isSubmittingAction = false;
      this.updateOfferVisibility();
    }
  }

  private async handleRejectOffer(): Promise<void> {
    // BUG-11: Guard against double-click concurrent requests
    if (this.isSubmittingAction || !this.merchant || !this.farm) return;
    const currentServerTime = this.getEstimatedServerTime();
    const activeOffer = this.merchant.offers.find((o) => o.expiresAtMs > currentServerTime);
    if (!activeOffer) {
      this.showToast('Báo giá đã hết hạn!', '#ff8a80');
      return;
    }

    this.isSubmittingAction = true;
    this.acceptBtn.setAlpha(0.45);
    this.rejectBtn.setAlpha(0.45);

    try {
      const result = await merchantApi.rejectOffer(
        activeOffer.id,
        this.farm.revision,
        this.merchant.revision
      );
      this.lastRefreshedMilestoneMs = null;
      this.setSnapshots(result.farm, result.merchant);
      this.showToast('Đã từ chối báo giá này.', '#ffd54f');
    } catch (err: unknown) {
      await this.handleApiError(err, 'Từ chối báo giá thất bại');
    } finally {
      this.isSubmittingAction = false;
      this.updateOfferVisibility();
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

  // BUG-08: Stop recursive 401 loops, attempt single recovery via Farm, or halt and display modal
  private async handleApiError(err: unknown, fallbackMsg: string): Promise<void> {
    if (err instanceof ApiError) {
      const codeStr = err.code ? `[${err.code}] ` : '';
      const displayMsg = `${codeStr}${err.message}`;
      this.showToast(displayMsg, '#ff5252');

      if (err.status === 401) {
        if (!this.isRecoveringSession) {
          this.isRecoveringSession = true;
          try {
            // Attempt single recovery: get Farm snapshot to create session cookie
            await farmApi.getFarm();
            const res = await merchantApi.getMerchantState();
            this.sessionLost = false;
            this.isRecoveringSession = false;
            this.sessionLostModal.setVisible(false);
            this.setSnapshots(res.farm, res.merchant);
            return;
          } catch {
            // Recovery failed
          }
        }

        // STOP retries completely! Show session lost modal
        this.sessionLost = true;
        this.sessionLostModal.setVisible(true);
        return;
      }

      // Refresh on 409 (STALE_FARM / STALE_MERCHANT)
      if (err.status === 409) {
        this.lastRefreshedMilestoneMs = null;
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
