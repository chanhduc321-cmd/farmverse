import Phaser from 'phaser';

export const ASSETS = {
  // Farm & Plots
  PLOT_EMPTY: 'plot_empty',
  PLOT_GROWING: 'plot_growing',
  PLOT_READY_NORMAL: 'plot_ready_normal',
  PLOT_READY_GOLDEN: 'plot_ready_golden',
  PLOT_LOCKED: 'plot_locked',
  FARMHOUSE: 'farmhouse_tier1',
  SILO: 'silo_tier1',
  FISH_POND: 'fish_pond',
  FENCE_LOCKED: 'fence_locked',
  FENCE_OPEN: 'fence_open',

  // Store & Town Square
  MERCHANT_STALL: 'merchant_stall',
  NPC_MERCHANT: 'npc_merchant_idle',
  TOWN_SQUARE_GROUND: 'town_square_ground',
  STORE_SIGNBOARD: 'store_signboard',

  // Items & Currency
  CROP_NORMAL: 'crop_normal',
  CROP_GOLDEN: 'crop_golden',
  COIN_GOLD: 'coin_gold',
  TOKEN_NEAR: 'token_near',

  // UI & VFX
  HUD_SILO_ICON: 'hud_silo_icon',
  HUD_CART_ICON: 'hud_cart_icon',
  HUD_CAMERA_ICON: 'hud_camera_icon',
  ICON_LOCK: 'icon_lock',
  SPARKLE_EFFECT: 'sparkle_effect',
} as const;

/**
 * Origin specifications defined in docs/art/SPRITE_MANIFEST.md
 * Ensures ground footprints and feet alignment match with <1px delta across plot/fence states.
 */
export const ASSET_ORIGINS: Record<string, [number, number]> = {
  [ASSETS.PLOT_EMPTY]: [0.5, 0.7],
  [ASSETS.PLOT_GROWING]: [0.5, 0.7],
  [ASSETS.PLOT_READY_NORMAL]: [0.5, 0.75],
  [ASSETS.PLOT_READY_GOLDEN]: [0.5, 0.75],
  [ASSETS.PLOT_LOCKED]: [0.5, 0.7],
  [ASSETS.FARMHOUSE]: [0.5, 0.85],
  [ASSETS.SILO]: [0.5, 0.85],
  [ASSETS.FISH_POND]: [0.5, 0.7],
  [ASSETS.FENCE_LOCKED]: [0.5, 0.7],
  [ASSETS.FENCE_OPEN]: [0.5, 0.7],
  [ASSETS.MERCHANT_STALL]: [0.5, 0.85],
  [ASSETS.NPC_MERCHANT]: [0.5, 0.85],
  [ASSETS.TOWN_SQUARE_GROUND]: [0.5, 0.5],
  [ASSETS.STORE_SIGNBOARD]: [0.5, 0.8],
  [ASSETS.CROP_NORMAL]: [0.5, 0.5],
  [ASSETS.CROP_GOLDEN]: [0.5, 0.5],
  [ASSETS.COIN_GOLD]: [0.5, 0.5],
  [ASSETS.TOKEN_NEAR]: [0.5, 0.5],
  [ASSETS.HUD_SILO_ICON]: [0.5, 0.5],
  [ASSETS.HUD_CART_ICON]: [0.5, 0.5],
  [ASSETS.HUD_CAMERA_ICON]: [0.5, 0.5],
  [ASSETS.ICON_LOCK]: [0.5, 0.5],
  [ASSETS.SPARKLE_EFFECT]: [0.5, 0.5],
};

/**
 * Loads all 23 production-ready FarmVerse sprites into Phaser's Texture Manager.
 */
export function preloadAllGameAssets(scene: Phaser.Scene): void {
  for (const key of Object.values(ASSETS)) {
    if (!scene.textures.exists(key)) {
      scene.load.image(key, `assets/${key}.png`);
    }
  }
}

/**
 * Helper to apply manifest-defined origin to an Image or Sprite.
 */
export function applyAssetOrigin(image: Phaser.GameObjects.Image, key: string): void {
  const origin = ASSET_ORIGINS[key];
  if (origin) {
    image.setOrigin(origin[0], origin[1]);
  }
}
