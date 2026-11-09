import Phaser from 'phaser';
import type {
  FarmSnapshot,
  MerchantSnapshot,
} from '../api';
import { farmApi, merchantApi, ApiError } from '../api';
import { ASSETS, applyAssetOrigin, preloadAllGameAssets } from '../assets';
import {
  CASUAL_FONT,
  createCasualButton,
  createPillBadge,
} from '../ui';

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

    // 1. Draw Sunny Sky & Cobblestone Town Square Background
    this.createTownSquareBackground();

    // 2. Top Header Title & Floating HUD Badges
    this.createHeaderAndHUD();

    // 3. Panels: Merchant NPC & Stall (Left) & Active Offer Panel (Right)
    this.createMerchantPanel();
    this.createOfferPanel();

    // 4. Session Lost Modal (BUG-08)
    this.createSessionLostModal();

    // 5. Toast area
    this.toastText = this.add.text(400, 545, '', {
      fontFamily: CASUAL_FONT,
      fontSize: '13px',
      color: '#fff9e6',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3.5,
    }).setOrigin(0.5).setDepth(30);

    // 6. Initial Data Load
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
        this.offerReasonText.setColor('#c62828');
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

  private createTownSquareBackground(): void {
    const g = this.add.graphics();
    g.setDepth(0);

    // 1. Sunny sky gradient
    const steps = 10;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const r = Math.round(0x46 + (0x8d - 0x46) * t);
      const gr = Math.round(0x9f + (0xd0 - 0x9f) * t);
      const b = Math.round(0xe0 + (0xf2 - 0xe0) * t);
      g.fillStyle((r << 16) | (gr << 8) | b, 1);
      g.fillRect(0, (i * 600) / steps, 800, 600 / steps + 1);
    }

    // 2. Soft white clouds
    const drawCloud = (cx: number, cy: number, scale = 1.0) => {
      g.fillStyle(0xffffff, 0.7);
      g.fillCircle(cx, cy, 28 * scale);
      g.fillCircle(cx - 20 * scale, cy + 4 * scale, 18 * scale);
      g.fillCircle(cx + 22 * scale, cy + 5 * scale, 20 * scale);
      g.fillRoundedRect(cx - 30 * scale, cy + 4 * scale, 80 * scale, 22 * scale, 11 * scale);
    };
    drawCloud(130, 60, 1.1);
    drawCloud(420, 50, 1.3);
    drawCloud(710, 65, 0.9);

    // 3. Modular cobblestone pavement tiles across the plaza
    const tileLeft = this.add.image(225, 310, ASSETS.TOWN_SQUARE_GROUND).setScale(1.2).setAlpha(0.85).setDepth(1);
    applyAssetOrigin(tileLeft, ASSETS.TOWN_SQUARE_GROUND);
    const tileRight = this.add.image(575, 310, ASSETS.TOWN_SQUARE_GROUND).setScale(1.2).setAlpha(0.85).setDepth(1);
    applyAssetOrigin(tileRight, ASSETS.TOWN_SQUARE_GROUND);

    // Wooden border fence framing the plaza
    const border = this.add.graphics().setDepth(2);
    border.lineStyle(4, 0x6e411b, 0.9);
    border.strokeRoundedRect(35, 75, 730, 485, 18);
  }

  private createHeaderAndHUD(): void {
    // Title
    this.add.text(400, 16, 'FarmVerse — Thị Trấn & Cửa Hàng', {
      fontFamily: CASUAL_FONT,
      fontSize: '20px',
      color: '#fff9e6',
      fontStyle: 'bold',
      stroke: '#4a2c11',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(20);

    // 1. Gold Pill Badge (overlapping coin icon)
    const goldBadge = createPillBadge(this, 105, 48, 135, 34, ASSETS.COIN_GOLD, '0', '#d97706');
    this.playerGoldText = goldBadge.text;

    // 2. Silo Pill Badge (overlapping silo icon)
    const siloBadge = createPillBadge(this, 260, 48, 145, 34, ASSETS.HUD_SILO_ICON, 'Silo: 0 / 10', '#5c3716');
    this.playerSiloText = siloBadge.text;

    // 3. Back to Farm Button (Juicy green button on top right)
    const backBtn = createCasualButton({
      scene: this,
      x: 710,
      y: 48,
      w: 140,
      h: 34,
      label: 'Về Nông Trại',
      iconKey: ASSETS.HUD_CART_ICON,
      iconScale: 0.55,
      style: 'green',
      onClick: () => {
        this.scene.start('FarmScene');
      },
    });
    backBtn.setDepth(20);
  }

  private createMerchantPanel(): void {
    const px = 55;
    const py = 100;
    const pw = 335;
    const ph = 430;

    // Interactive Stall & NPC Container (MVP Contract requirement)
    const stallContainer = this.add.container(px, py).setDepth(10);

    // Panel Background (Cozy rustic wooden frame with warm cream parchment interior)
    const bg = this.add.graphics();
    // 3D bottom shadow
    bg.fillStyle(0x2d1a0b, 0.7);
    bg.fillRoundedRect(0, 3, pw, ph, 14);

    // Wooden frame
    bg.fillStyle(0x7a461b, 1);
    bg.fillRoundedRect(0, 0, pw, ph, 14);

    // Inner parchment
    bg.fillStyle(0xfffaec, 1);
    bg.fillRoundedRect(4, 4, pw - 8, ph - 8, 11);

    // Golden border
    bg.lineStyle(2, 0xffd54f, 0.9);
    bg.strokeRoundedRect(2, 2, pw - 4, ph - 4, 12);

    // Header wooden banner
    bg.fillStyle(0x8c5324, 1);
    bg.fillRoundedRect(10, 8, pw - 20, 30, 8);

    // Panel Title
    const title = this.add.text(pw / 2, 23, '🐺 THƯƠNG NHÂN SÓI CA', {
      fontFamily: CASUAL_FONT,
      fontSize: '15px',
      color: '#fff9e6',
      fontStyle: 'bold',
      stroke: '#4a2c11',
      strokeThickness: 3,
    }).setOrigin(0.5);

    // Merchant Stall & Blue Wolf Character Artwork (T-14 approved sprites)
    const stallSprite = this.add.image(pw / 2 + 10, 115, ASSETS.MERCHANT_STALL).setScale(0.8);
    applyAssetOrigin(stallSprite, ASSETS.MERCHANT_STALL);

    const npcSprite = this.add.image(pw / 2 - 35, 115, ASSETS.NPC_MERCHANT).setScale(0.82);
    applyAssetOrigin(npcSprite, ASSETS.NPC_MERCHANT);

    const signboard = this.add.image(pw - 35, 105, ASSETS.STORE_SIGNBOARD).setScale(0.72);
    applyAssetOrigin(signboard, ASSETS.STORE_SIGNBOARD);

    // Interactive callout badge on NPC
    const calloutBg = this.add.graphics();
    calloutBg.fillStyle(0x1976d2, 1);
    calloutBg.fillRoundedRect(pw / 2 - 125, 146, 250, 26, 8);
    calloutBg.lineStyle(1.5, 0x90caf9, 0.9);
    calloutBg.strokeRoundedRect(pw / 2 - 125, 146, 250, 26, 8);

    const calloutText = this.add.text(pw / 2, 159, '💬 Bấm vào Thương Nhân để Giao Dịch', {
      fontFamily: CASUAL_FONT,
      fontSize: '11px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Details at y = 180..265
    const textStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: CASUAL_FONT,
      fontSize: '12px',
      color: '#4a2c11',
      fontStyle: 'bold',
    };

    this.npcStatusText = this.add.text(25, 180, '• Trạng thái: Đang tải...', textStyle);
    this.npcBudgetText = this.add.text(25, 202, '• Ngân sách: ...', textStyle);
    this.npcInventoryText = this.add.text(25, 224, '• Kho hàng: ...', textStyle);
    this.npcDemandText = this.add.text(25, 246, '• Nhu cầu thị trường: ...', textStyle);
    this.npcPricingText = this.add.text(25, 268, '• Hệ số giá: ...', textStyle);

    // Rule summary box at y = 295..415 (Wooden parchment card)
    const infoBg = this.add.graphics();
    infoBg.fillStyle(0xf5eedb, 1);
    infoBg.fillRoundedRect(12, 292, pw - 24, 126, 8);
    infoBg.lineStyle(1.5, 0x8d5724, 0.5);
    infoBg.strokeRoundedRect(12, 292, pw - 24, 126, 8);

    const ruleHeader = this.add.text(22, 300, '📖 Quy tắc C02 Lite:', {
      fontFamily: CASUAL_FONT,
      fontSize: '11px',
      color: '#8d5724',
      fontStyle: 'bold',
    });

    const ruleText = [
      '• Thương nhân MUA nông sản của bạn',
      '  và BÁN nông sản của họ cho bạn.',
      '• Hệ số biến động theo tồn kho & nhu cầu.',
      '• Chống đầu cơ: Giá bán tối thiểu 30G,',
      '  giá mua tối đa 25G (Không mua rẻ bán đắt lặp).',
    ].join('\n');

    const ruleBody = this.add.text(22, 318, ruleText, {
      fontFamily: CASUAL_FONT,
      fontSize: '10.5px',
      color: '#5c3716',
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
      calloutBg.fillRoundedRect(pw / 2 - 125, 146, 250, 26, 8);
      calloutBg.lineStyle(1.5, 0xbbdefb, 1);
      calloutBg.strokeRoundedRect(pw / 2 - 125, 146, 250, 26, 8);
    });
    stallContainer.on('pointerout', () => {
      calloutBg.clear();
      calloutBg.fillStyle(0x1976d2, 1);
      calloutBg.fillRoundedRect(pw / 2 - 125, 146, 250, 26, 8);
      calloutBg.lineStyle(1.5, 0x90caf9, 0.9);
      calloutBg.strokeRoundedRect(pw / 2 - 125, 146, 250, 26, 8);
    });
    stallContainer.on('pointerdown', () => {
      this.openTradeDialog();
      this.showToast('Đã mở Quầy Giao Dịch cùng Thương Nhân Sói Ca!', '#81c784');
    });
  }

  private createOfferPanel(): void {
    const px = 410;
    const py = 100;
    const pw = 335;
    const ph = 430;

    this.tradePanelBg = this.add.graphics().setDepth(10);
    // Shadow
    this.tradePanelBg.fillStyle(0x2d1a0b, 0.7);
    this.tradePanelBg.fillRoundedRect(px, py + 3, pw, ph, 14);

    // Wooden Frame
    this.tradePanelBg.fillStyle(0x7a461b, 1);
    this.tradePanelBg.fillRoundedRect(px, py, pw, ph, 14);

    // Inner Parchment
    this.tradePanelBg.fillStyle(0xfffaec, 1);
    this.tradePanelBg.fillRoundedRect(px + 4, py + 4, pw - 8, ph - 8, 11);

    // Golden accent border
    this.tradePanelBg.lineStyle(2, 0xffd54f, 0.9);
    this.tradePanelBg.strokeRoundedRect(px + 2, py + 2, pw - 4, ph - 4, 12);

    // Header wooden banner
    this.tradePanelBg.fillStyle(0x8c5324, 1);
    this.tradePanelBg.fillRoundedRect(px + 10, py + 8, pw - 20, 30, 8);

    // Panel Title
    this.tradePanelTitle = this.add.text(px + pw / 2 - 20, py + 23, '📋 BÁO GIÁ THỊ TRƯỜNG', {
      fontFamily: CASUAL_FONT,
      fontSize: '15px',
      color: '#fff9e6',
      fontStyle: 'bold',
      stroke: '#4a2c11',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(11);

    // Close Dialog Button (✕ Đóng)
    this.closeTradeBtn = createCasualButton({
      scene: this,
      x: px + pw - 30,
      y: py + 23,
      w: 32,
      h: 28,
      label: '✕',
      style: 'red',
      onClick: () => this.closeTradeDialog(),
    });
    this.closeTradeBtn.setDepth(12);

    // Offer Container (Visible when active offer exists)
    this.offerContainer = this.add.container(px, py).setDepth(11);

    // Offer card background
    const badgeBg = this.add.graphics();
    badgeBg.fillStyle(0xf5eedb, 1);
    badgeBg.fillRoundedRect(16, 48, pw - 32, 252, 10);
    badgeBg.lineStyle(1.5, 0x8d5724, 0.6);
    badgeBg.strokeRoundedRect(16, 48, pw - 32, 252, 10);

    this.offerSideBadge = this.add.text(pw / 2, 70, 'ĐANG TẢI...', {
      fontFamily: CASUAL_FONT,
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#2e7d32',
      stroke: '#ffffff',
      strokeThickness: 2,
    }).setOrigin(0.5);

    // Item Crop Icon Sprite (T-14 approved item asset)
    this.offerCropImage = this.add.image(pw / 2, 120, ASSETS.CROP_NORMAL).setScale(0.9);
    applyAssetOrigin(this.offerCropImage, ASSETS.CROP_NORMAL);

    this.offerCropText = this.add.text(pw / 2, 165, '1x Normal Crop', {
      fontFamily: CASUAL_FONT,
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#4a2c11',
    }).setOrigin(0.5);

    // Price container with gold coin icon
    this.offerPriceCoin = this.add.image(pw / 2 - 45, 198, ASSETS.COIN_GOLD).setScale(0.65).setOrigin(0.5);
    this.offerPriceText = this.add.text(pw / 2 - 25, 198, '15 GOLD', {
      fontFamily: CASUAL_FONT,
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#d97706',
    }).setOrigin(0, 0.5);

    this.offerTimerText = this.add.text(pw / 2, 230, '⏳ Thời hạn: 20s', {
      fontFamily: CASUAL_FONT,
      fontSize: '13px',
      color: '#1565c0',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.offerReasonText = this.add.text(pw / 2, 265, '', {
      fontFamily: CASUAL_FONT,
      fontSize: '11px',
      color: '#c62828',
      align: 'center',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Accept Button (Juicy green 3D button)
    this.acceptBtn = createCasualButton({
      scene: this,
      x: 85,
      y: 330,
      w: 125,
      h: 40,
      label: 'Chấp Nhận',
      style: 'green',
      onClick: () => this.handleAcceptOffer(),
    });

    // Reject Button (Juicy red 3D button)
    this.rejectBtn = createCasualButton({
      scene: this,
      x: 250,
      y: 330,
      w: 125,
      h: 40,
      label: 'Từ Chối',
      style: 'red',
      onClick: () => this.handleRejectOffer(),
    });

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
      fontFamily: CASUAL_FONT,
      fontSize: '14px',
      color: '#5c3716',
      align: 'center',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(12);

    // BUG-07: Refresh state button (placed directly in scene at visible panel bottom)
    this.refreshBtn = createCasualButton({
      scene: this,
      x: px + pw / 2,
      y: py + 390,
      w: 170,
      h: 36,
      label: 'Tải Lại Dữ Liệu',
      style: 'wood',
      onClick: () => {
        this.lastRefreshedMilestoneMs = null;
        this.refreshMerchantState();
      },
    });
    this.refreshBtn.setDepth(15);

    // Open Trade Prompt Container (Shown when dialog is closed)
    this.openTradePromptContainer = this.add.container(px, py).setDepth(11);
    const promptBg = this.add.graphics();
    promptBg.fillStyle(0xfffaec, 1);
    promptBg.fillRoundedRect(0, 0, pw, ph, 14);
    promptBg.lineStyle(2, 0xffd54f, 0.9);
    promptBg.strokeRoundedRect(0, 0, pw, ph, 14);

    const promptText = this.add.text(
      pw / 2,
      ph / 2 - 40,
      '🐺 Thương Nhân Sói Ca đang ở sạp hàng.\n\nBấm vào Thương Nhân bên trái\nhoặc bấm nút dưới đây để giao dịch!',
      {
        fontFamily: CASUAL_FONT,
        fontSize: '13px',
        color: '#4a2c11',
        align: 'center',
        lineSpacing: 6,
        fontStyle: 'bold',
      }
    ).setOrigin(0.5);

    const openBtn = createCasualButton({
      scene: this,
      x: pw / 2,
      y: ph / 2 + 50,
      w: 195,
      h: 42,
      label: 'Mở Quầy Giao Dịch',
      style: 'blue',
      onClick: () => this.openTradeDialog(),
    });

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
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(-400, -300, 800, 600);

    const box = this.add.graphics();
    box.fillStyle(0xfffaec, 1);
    box.fillRoundedRect(-200, -110, 400, 220, 14);
    box.lineStyle(2, 0xe53935, 1);
    box.strokeRoundedRect(-200, -110, 400, 220, 14);

    const title = this.add.text(0, -65, '⚠️ PHIÊN CHƠI HẾT HẠN (401)', {
      fontFamily: CASUAL_FONT,
      fontSize: '16px',
      color: '#d32f2f',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const msg = this.add.text(
      0,
      -15,
      'Phiên chơi Guest chưa được khởi tạo hoặc cookie đã mất.\nVui lòng trở về Nông Trại để bắt đầu phiên mới.',
      {
        fontFamily: CASUAL_FONT,
        fontSize: '12px',
        color: '#4a2c11',
        align: 'center',
        lineSpacing: 6,
      }
    ).setOrigin(0.5);

    const recoverBtn = createCasualButton({
      scene: this,
      x: 0,
      y: 55,
      w: 220,
      h: 40,
      label: 'Khôi Phục Tại Nông Trại',
      style: 'green',
      onClick: () => {
        this.scene.start('FarmScene');
      },
    });

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
    this.playerGoldText.setText(`${farm.gold}`);
    this.playerSiloText.setText(
      `Silo: ${totalSilo}/${farm.silo.capacity} (N:${farm.silo.counts.NORMAL} G:${farm.silo.counts.GOLDEN})`
    );

    // 2. Update Merchant Panel
    const isOutOfBusiness = merchant.status === 'OUT_OF_BUSINESS';
    this.npcStatusText.setText(
      `• Trạng thái: ${isOutOfBusiness ? '🛑 TẠM DỪNG' : '🟢 Đang mở cửa'}`
    );
    this.npcStatusText.setColor(isOutOfBusiness ? '#c62828' : '#2e7d32');

    this.npcBudgetText.setText(`• Ngân sách NPC: ${merchant.goldBudget} GOLD`);

    const mInventoryTotal = merchant.inventory.counts.NORMAL + merchant.inventory.counts.GOLDEN;
    this.npcInventoryText.setText(
      `• Kho hàng: ${mInventoryTotal}/${merchant.inventory.capacity} (🌾 ${merchant.inventory.counts.NORMAL} | ✨ ${merchant.inventory.counts.GOLDEN})`
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
        this.offerSideBadge.setText('📥 NPC MUA LẠI NÔNG SẢN CỦA BẠN');
        this.offerSideBadge.setColor('#2e7d32');
      } else {
        this.offerSideBadge.setText('📤 NPC BÁN NÔNG SẢN CHO BẠN');
        this.offerSideBadge.setColor('#e65100');
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
        this.offerReasonText.setColor('#2e7d32');
      } else {
        this.acceptBtn.setAlpha(0.45);
        const reasonMsg = this.formatBlockReason(activeOffer.unavailableReason);
        this.offerReasonText.setText(`⚠️ ${reasonMsg}`);
        this.offerReasonText.setColor('#c62828');
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
      this.showToast('Báo giá đã hết hạn!', '#c62828');
      return;
    }

    if (!activeOffer.canAccept) {
      this.showToast(`Chưa đủ điều kiện: ${this.formatBlockReason(activeOffer.unavailableReason)}`, '#c62828');
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
      this.showToast(actionMsg, '#2e7d32');
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
      this.showToast('Báo giá đã hết hạn!', '#c62828');
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
      this.showToast('Đã từ chối báo giá này.', '#d97706');
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
      this.showToast(displayMsg, '#c62828');

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
      this.showToast(message, '#c62828');
    }
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
}
