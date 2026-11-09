import Phaser from 'phaser';
import { FarmScene } from './scenes/FarmScene';
import { StoreScene } from './scenes/StoreScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: 800,
  height: 600,
  backgroundColor: '#355e3b',
  scene: [FarmScene, StoreScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

new Phaser.Game(config);
