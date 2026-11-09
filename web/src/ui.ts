import Phaser from 'phaser';

export const CASUAL_FONT = '"Fredoka", "Nunito", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export interface CasualButtonOptions {
  scene: Phaser.Scene;
  x: number;
  y: number;
  w?: number;
  h?: number;
  label: string;
  iconKey?: string;
  iconScale?: number;
  style?: 'wood' | 'green' | 'gold' | 'red' | 'blue';
  onClick: () => void;
}

const BUTTON_THEMES = {
  wood: {
    shadow: 0x422610,
    base: 0x824e23,
    highlight: 0xa46632,
    border: 0xffd54f,
    textColor: '#ffffff',
    textStroke: '#3a1f0a',
  },
  green: {
    shadow: 0x1b4e1c,
    base: 0x388e3c,
    highlight: 0x5cb85c,
    border: 0x81c784,
    textColor: '#ffffff',
    textStroke: '#143c14',
  },
  gold: {
    shadow: 0x7c5200,
    base: 0xd98200,
    highlight: 0xffb300,
    border: 0xffe082,
    textColor: '#ffffff',
    textStroke: '#4e3300',
  },
  red: {
    shadow: 0x5a1818,
    base: 0xb72b2b,
    highlight: 0xd9534f,
    border: 0xef9a9a,
    textColor: '#ffffff',
    textStroke: '#3e0e0e',
  },
  blue: {
    shadow: 0x0f3c6c,
    base: 0x1976d2,
    highlight: 0x42a5f5,
    border: 0x90caf9,
    textColor: '#ffffff',
    textStroke: '#0b2644',
  },
};

/**
 * Creates a juicy, 3D beveled casual farm button with tactile push down on click.
 */
export function createCasualButton(options: CasualButtonOptions): Phaser.GameObjects.Container {
  const {
    scene,
    x,
    y,
    w = 160,
    h = 42,
    label,
    iconKey,
    iconScale = 0.55,
    style = 'wood',
    onClick,
  } = options;

  const theme = BUTTON_THEMES[style];
  const container = scene.add.container(x, y);

  const gfx = scene.add.graphics();
  const radius = 12;

  // 1. Bottom 3D shadow (4px offset)
  gfx.fillStyle(theme.shadow, 1);
  gfx.fillRoundedRect(-w / 2, -h / 2 + 4, w, h, radius);

  // 2. Main button body
  gfx.fillStyle(theme.base, 1);
  gfx.fillRoundedRect(-w / 2, -h / 2, w, h - 2, radius);

  // 3. Top glossy/beveled highlight
  gfx.fillStyle(theme.highlight, 0.9);
  gfx.fillRoundedRect(-w / 2 + 3, -h / 2 + 2, w - 6, (h - 2) * 0.45, { tl: radius - 2, tr: radius - 2, bl: 4, br: 4 });

  // 4. Outer decorative border
  gfx.lineStyle(1.5, theme.border, 0.85);
  gfx.strokeRoundedRect(-w / 2, -h / 2, w, h - 2, radius);

  // Corner rivets for wooden buttons
  if (style === 'wood' || style === 'gold') {
    gfx.fillStyle(0xffe082, 0.9);
    gfx.fillCircle(-w / 2 + 8, -h / 2 + 8, 2);
    gfx.fillCircle(w / 2 - 8, -h / 2 + 8, 2);
    gfx.fillCircle(-w / 2 + 8, h / 2 - 8, 2);
    gfx.fillCircle(w / 2 - 8, h / 2 - 8, 2);
  }

  container.add(gfx);

  // Optional Icon
  let textOffsetX = 0;
  if (iconKey && scene.textures.exists(iconKey)) {
    const icon = scene.add.image(-w / 2 + 22, -1, iconKey).setScale(iconScale).setOrigin(0.5);
    container.add(icon);
    textOffsetX = 12;
  }

  // Label Text
  const text = scene.add.text(textOffsetX, -1, label, {
    fontFamily: CASUAL_FONT,
    fontSize: '13px',
    color: theme.textColor,
    fontStyle: 'bold',
    stroke: theme.textStroke,
    strokeThickness: 3.5,
  }).setOrigin(0.5);

  container.add(text);

  // Interactive handling with click push-down feedback
  container.setSize(w, h);
  container.setInteractive({ useHandCursor: true });

  container.on('pointerover', () => {
    container.setScale(1.03);
  });

  container.on('pointerout', () => {
    container.setScale(1.0);
    container.y = y;
  });

  container.on('pointerdown', () => {
    container.y = y + 2;
  });

  container.on('pointerup', () => {
    container.y = y;
    onClick();
  });

  return container;
}

/**
 * Draws the sunny sky, floating clouds, and a 3D isometric floating island terrain.
 */
export function drawSkyAndFloatingIsland(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  g.setDepth(0);

  // 1. Sunny Sky Gradient (Azure blue to soft bright cyan horizon)
  const skySteps = 12;
  const skyHeight = 600;
  for (let i = 0; i < skySteps; i++) {
    const t = i / (skySteps - 1);
    // Interpolate from deep sunny sky #469fe0 to bright horizon cyan #9de2fb
    const r = Math.round(0x46 + (0x9d - 0x46) * t);
    const gr = Math.round(0x9f + (0xe2 - 0x9f) * t);
    const b = Math.round(0xe0 + (0xfb - 0xe0) * t);
    const color = (r << 16) | (gr << 8) | b;

    g.fillStyle(color, 1);
    g.fillRect(0, (i * skyHeight) / skySteps, 800, skyHeight / skySteps + 1);
  }

  // 2. Fluffy White Floating Clouds in the background
  const drawCloud = (cx: number, cy: number, scale = 1.0) => {
    g.fillStyle(0xffffff, 0.78);
    g.fillCircle(cx, cy, 32 * scale);
    g.fillCircle(cx - 24 * scale, cy + 4 * scale, 22 * scale);
    g.fillCircle(cx + 26 * scale, cy + 6 * scale, 24 * scale);
    g.fillCircle(cx + 48 * scale, cy + 12 * scale, 18 * scale);
    g.fillRoundedRect(cx - 36 * scale, cy + 6 * scale, 96 * scale, 26 * scale, 14 * scale);
  };

  drawCloud(120, 85, 0.9);
  drawCloud(420, 65, 1.2);
  drawCloud(700, 95, 0.85);
  drawCloud(260, 130, 0.65);
  drawCloud(620, 140, 0.7);

  // 3. 3D Isometric Floating Island Earth Cliff (Cutaway Layers)
  // Polygon points for the island top surface
  const topPoints = [
    { x: 400, y: 125 }, // Top vertex
    { x: 745, y: 285 }, // Right vertex
    { x: 400, y: 475 }, // Bottom vertex
    { x: 55, y: 285 },  // Left vertex
  ];

  const cliffDepth = 75;

  // Under-island 3D earth strata (Left & Right cliff faces)
  // Left cliff face
  g.fillStyle(0x4a2c14, 1);
  g.fillPoints([
    { x: 55, y: 285 },
    { x: 400, y: 475 },
    { x: 400, y: 475 + cliffDepth },
    { x: 55, y: 285 + cliffDepth },
  ], true);

  // Right cliff face (lighter afternoon sun highlight)
  g.fillStyle(0x6d4420, 1);
  g.fillPoints([
    { x: 400, y: 475 },
    { x: 745, y: 285 },
    { x: 745, y: 285 + cliffDepth },
    { x: 400, y: 475 + cliffDepth },
  ], true);

  // Cliff bottom tapered keel (floating island bottom tip)
  g.fillStyle(0x3a210d, 1);
  g.fillTriangle(55, 285 + cliffDepth, 400, 475 + cliffDepth, 240, 560);
  g.fillTriangle(400, 475 + cliffDepth, 745, 285 + cliffDepth, 520, 555);
  g.fillTriangle(240, 560, 520, 555, 400, 575);

  // Embedded rounded river stones in the cliff
  const drawStone = (sx: number, sy: number, rx: number, ry: number) => {
    g.fillStyle(0x2d190b, 0.6);
    g.fillEllipse(sx, sy + 2, rx + 1, ry + 1);
    g.fillStyle(0x9e9587, 0.95);
    g.fillEllipse(sx, sy, rx, ry);
    g.fillStyle(0xd5ccbd, 0.9);
    g.fillEllipse(sx - 1, sy - 1, rx * 0.55, ry * 0.55);
  };

  drawStone(140, 345, 14, 10);
  drawStone(270, 410, 18, 12);
  drawStone(360, 480, 15, 11);
  drawStone(460, 485, 20, 14);
  drawStone(580, 420, 16, 12);
  drawStone(680, 345, 14, 9);
  drawStone(320, 525, 13, 9);
  drawStone(480, 530, 12, 8);

  // Tiny floating satellite rocks below the island
  const drawFloatingRock = (fx: number, fy: number, size: number) => {
    g.fillStyle(0x5c3818, 1);
    g.fillRoundedRect(fx, fy, size, size * 0.85, 4);
    g.fillStyle(0x76c442, 1);
    g.fillRoundedRect(fx, fy - 2, size, 4, 2);
  };
  drawFloatingRock(110, 495, 18);
  drawFloatingRock(675, 485, 22);
  drawFloatingRock(410, 585, 15);

  // 4. Lush Grass Top Surface
  // Dark grass outer border
  g.fillStyle(0x387820, 1);
  g.fillPoints(topPoints, true);

  // Inner vibrant emerald/lime grass lawn
  const innerGrass = [
    { x: 400, y: 132 },
    { x: 737, y: 285 },
    { x: 400, y: 467 },
    { x: 63, y: 285 },
  ];
  g.fillStyle(0x62ba33, 1);
  g.fillPoints(innerGrass, true);

  // Top sunny grass highlight sheen
  const sunGrass = [
    { x: 400, y: 136 },
    { x: 728, y: 285 },
    { x: 400, y: 458 },
    { x: 72, y: 285 },
  ];
  g.fillStyle(0x78cf3f, 1);
  g.fillPoints(sunGrass, true);

  // 5. Winding Cobblestone Walkway (Path from Farmhouse to Plots and Market)
  g.fillStyle(0xc5bbaa, 0.95);
  // Pathway curve points
  const pathPoints = [
    { x: 190, y: 270 },
    { x: 260, y: 285 },
    { x: 390, y: 285 },
    { x: 530, y: 290 },
    { x: 620, y: 310 },
    { x: 690, y: 380 },
    { x: 670, y: 400 },
    { x: 600, y: 330 },
    { x: 470, y: 305 },
    { x: 330, y: 300 },
    { x: 220, y: 290 },
    { x: 175, y: 280 },
  ];
  g.fillPoints(pathPoints, true);
  g.lineStyle(1.5, 0x8a7e6c, 0.7);
  g.strokePoints(pathPoints, true);

  // 6. Central Tilled Furrow Bed for the 6 plots
  g.fillStyle(0x3a220e, 1);
  g.fillRoundedRect(148, 145, 504, 260, 16);

  g.fillStyle(0x563417, 1);
  g.fillRoundedRect(152, 149, 496, 252, 14);

  // Soil furrows texture
  g.fillStyle(0x432811, 0.9);
  for (let row = 0; row < 6; row++) {
    g.fillRoundedRect(165, 160 + row * 40, 470, 18, 6);
  }
}

/**
 * Creates a cheerful casual HUD pill badge with overlapping icon and friendly font.
 */
export function createPillBadge(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w = 140,
  h = 36,
  iconKey: string,
  initialText: string,
  textColor = '#d97706'
): { container: Phaser.GameObjects.Container; text: Phaser.GameObjects.Text } {
  const container = scene.add.container(x, y).setDepth(20);

  const gfx = scene.add.graphics();
  const radius = h / 2;

  // Bottom 3D shadow
  gfx.fillStyle(0x28190c, 0.7);
  gfx.fillRoundedRect(-w / 2, -h / 2 + 3, w, h, radius);

  // Wooden frame
  gfx.fillStyle(0x75431b, 1);
  gfx.fillRoundedRect(-w / 2, -h / 2, w, h - 1, radius);

  // Inner cream pill
  gfx.fillStyle(0xfffaee, 1);
  gfx.fillRoundedRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 7, radius - 2);

  // Golden accent rim
  gfx.lineStyle(1.5, 0xffd54f, 0.85);
  gfx.strokeRoundedRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 3, radius);

  container.add(gfx);

  // Overlapping Icon on the left
  if (scene.textures.exists(iconKey)) {
    const icon = scene.add.image(-w / 2 + 16, 0, iconKey).setScale(0.68).setOrigin(0.5);
    container.add(icon);
  }

  // Value text in friendly Fredoka font
  const text = scene.add.text(14, 0, initialText, {
    fontFamily: CASUAL_FONT,
    fontSize: '13px',
    color: textColor,
    fontStyle: 'bold',
  }).setOrigin(0.5);

  container.add(text);

  return { container, text };
}
