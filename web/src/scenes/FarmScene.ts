import Phaser from 'phaser';

export class FarmScene extends Phaser.Scene {
  private apiStatusText!: Phaser.GameObjects.Text;

  constructor() {
    super('FarmScene');
  }

  preload(): void {
    this.createPlaceholderTextures();
  }

  create(): void {
    // Background field
    const bg = this.add.graphics();
    bg.fillStyle(0x355e3b, 1); // Moss / grass green
    bg.fillRect(0, 0, 800, 600);

    // Subtle farm ground patch
    bg.fillStyle(0x406a44, 1);
    bg.fillRoundedRect(120, 140, 560, 360, 16);
    bg.lineStyle(2, 0x274328, 0.8);
    bg.strokeRoundedRect(120, 140, 560, 360, 16);

    // Header HUD
    this.add.text(400, 40, 'FarmVerse — My Farm', {
      fontSize: '24px',
      color: '#f5eed7',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(400, 72, 'P0 Baseline: 2 Usable Plots (Placeholder Sprites)', {
      fontSize: '14px',
      color: '#c2b89d',
    }).setOrigin(0.5);

    // Stats HUD Bar
    const hudBar = this.add.graphics();
    hudBar.fillStyle(0x1e301d, 0.85);
    hudBar.fillRoundedRect(140, 100, 520, 36, 8);

    this.add.text(170, 118, 'GOLD: 0', {
      fontSize: '14px',
      color: '#f3c969',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5);

    this.add.text(370, 118, 'Silo: 0 / 10', {
      fontSize: '14px',
      color: '#e4dcc4',
    }).setOrigin(0, 0.5);

    this.apiStatusText = this.add.text(530, 118, 'API: checking...', {
      fontSize: '12px',
      color: '#a3a092',
    }).setOrigin(0, 0.5);

    // Render Plot #1
    const plot1X = 290;
    const plot1Y = 320;
    this.add.image(plot1X, plot1Y, 'plot_empty');
    this.add.text(plot1X, plot1Y + 56, 'Plot #1: EMPTY', {
      fontSize: '13px',
      color: '#f7f4ea',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Render Plot #2
    const plot2X = 510;
    const plot2Y = 320;
    this.add.image(plot2X, plot2Y, 'plot_empty');
    this.add.text(plot2X, plot2Y + 56, 'Plot #2: EMPTY', {
      fontSize: '13px',
      color: '#f7f4ea',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Information banner at bottom
    this.add.text(400, 540, 'Ready for Phase 1 (Planting & Harvest loops)', {
      fontSize: '13px',
      color: '#8ea889',
    }).setOrigin(0.5);

    // Verify /api/health via Vite proxy
    this.checkApiHealth();
  }

  private createPlaceholderTextures(): void {
    if (this.textures.exists('plot_empty')) return;

    // Generate 140x90 placeholder plot texture with tilled earth appearance
    const g = this.make.graphics({ x: 0, y: 0 });

    // Outer tilled soil border
    g.fillStyle(0x4a2c11, 1);
    g.fillRoundedRect(0, 0, 140, 90, 10);

    // Main soil surface
    g.fillStyle(0x6a4019, 1);
    g.fillRoundedRect(4, 4, 132, 82, 8);

    // Furrow lines (soil grooves)
    g.fillStyle(0x523114, 1);
    g.fillRoundedRect(16, 18, 108, 10, 4);
    g.fillRoundedRect(16, 40, 108, 10, 4);
    g.fillRoundedRect(16, 62, 108, 10, 4);

    // Light soil highlights
    g.fillStyle(0x7d4e22, 1);
    g.fillRoundedRect(18, 16, 104, 3, 2);
    g.fillRoundedRect(18, 38, 104, 3, 2);
    g.fillRoundedRect(18, 60, 104, 3, 2);

    g.generateTexture('plot_empty', 140, 90);
    g.destroy();
  }

  private async checkApiHealth(): Promise<void> {
    try {
      const response = await fetch('/api/health');
      const data = await response.json();
      if (response.status === 200 && data.status === 'ok') {
        this.apiStatusText.setText('API: OK (200)');
        this.apiStatusText.setColor('#7cd976');
      } else if (response.status === 503) {
        this.apiStatusText.setText('API: Unavailable (503)');
        this.apiStatusText.setColor('#e0aa48');
      } else {
        this.apiStatusText.setText(`API: status ${response.status}`);
        this.apiStatusText.setColor('#e0aa48');
      }
    } catch {
      this.apiStatusText.setText('API: Offline');
      this.apiStatusText.setColor('#9e9e9e');
    }
  }
}
