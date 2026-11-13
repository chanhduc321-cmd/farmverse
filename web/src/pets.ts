import Phaser from 'phaser';
import type { PetSpecies } from '../../shared/farm.mts';
import './pets.css';

const pets = {
  dog: { name: 'Chó', size: 176, foot: 158, idle: 'idle', reaction: 'happy', voice: 'Gâu!' },
  cat: { name: 'Mèo', size: 128, foot: 116, idle: 'happy', reaction: 'happy', voice: 'Meo!' },
  goose: { name: 'Ngỗng', size: 128, foot: 116, idle: 'peck', reaction: 'peck', voice: 'Quác!' },
} as const;
type Pet = PetSpecies;
const species = ['dog', 'cat', 'goose'] as const;
const clips = [
  ['dog', 'idle', 7], ['dog', 'happy', 7], ['dog', 'walk', 10], ['cat', 'happy', 8], ['cat', 'walk', 8],
  ['goose', 'walk', 8], ['goose', 'peck', 8],
  ['dog', 'guard', 7], ['cat', 'guard', 8], ['goose', 'guard', 8],
] as const;
const texture = (pet: Pet, clip: string) => `pet-${pet}-${clip}`;

export function loadPetSprites(loader: Phaser.Loader.LoaderPlugin): number {
  for (const [pet, clip] of clips) {
    const { size } = pets[pet];
    loader.spritesheet(texture(pet, clip), `/pets/${pet}/${pet}-${clip}.png`, {
      frameWidth: size, frameHeight: size,
    });
  }
  return clips.length;
}

export function createFarmPet(
  scene: Phaser.Scene,
  field: HTMLElement,
  reduceMotion: MediaQueryList,
  selectPet: (pet: Pet) => Promise<unknown>,
) {
  // Shadow ellipse at (0, 0) in corner container beneath the pet sprite
  const shadow = scene.add.ellipse(0, 0, 48, 18, 0x122410, 0.38).setVisible(false);
  const sprite = scene.add.sprite(0, 0, texture('dog', 'idle'), 0).setVisible(false);
  const corner = scene.add.container(0, 0, [shadow, sprite]);
  const dock = field.querySelector<HTMLElement>('.bottom-dock')!;

  for (const [pet, clip, count] of clips) {
    const key = texture(pet, clip);
    if (!scene.anims.exists(key)) {
      scene.anims.create({ key, frames: scene.anims.generateFrameNumbers(key, { end: count - 1 }), frameRate: 8 });
    }
  }

  const opener = document.createElement('button');
  opener.type = 'button';
  opener.className = 'hud-action-btn farm-pet-open';
  opener.innerHTML = '<img class="hud-action-icon" src="/icon/pet-picker.png" alt="">';
  opener.setAttribute('aria-label', 'Chọn Pet');
  opener.setAttribute('aria-haspopup', 'dialog');
  opener.hidden = true;
  field.querySelector('.farm-hud-actions')!.append(opener);

  const hit = document.createElement('button');
  hit.type = 'button';
  hit.className = 'farm-pet-hit';
  hit.title = 'Chạm để vuốt ve, giữ rồi kéo để di chuyển';
  hit.hidden = true;
  const bubble = document.createElement('span');
  bubble.className = 'farm-pet-bubble';
  bubble.setAttribute('role', 'status');
  bubble.hidden = true;
  field.append(hit, bubble);

  const dialog = document.createElement('dialog');
  dialog.className = 'farm-pet-picker';
  dialog.setAttribute('aria-labelledby', 'farm-pet-title');
  dialog.innerHTML = `<form method="dialog">
    <header><h2 id="farm-pet-title">Đổi Pet</h2>
      <button value="close" class="inventory-close" aria-label="Đóng">×</button></header>
    <div class="farm-pet-options">
      ${species.map(pet => `<button value="${pet}">
        <span class="farm-pet-portrait farm-pet-portrait--${pet}" aria-hidden="true"></span>
        ${pets[pet].name}
      </button>`).join('')}
    </div>
  </form>`;
  document.body.append(dialog);

  opener.onclick = () => {
    dialog.returnValue = '';
    dialog.showModal();
  };
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });

  let chosen: Pet = 'dog';
  let shown: Pet = chosen;
  let reactionUntil = 0;
  let guardUntil = 0;
  let displaySize = 90;
  let home = { x: 44, y: 0 };
  let placed = false;
  let patrolTime = 0;
  let patrolLeft = 0;
  let patrolRight = 0;
  let press: {
    id: number; x: number; y: number; started: number;
    originX: number; originY: number; dragging: boolean; reacted: boolean;
  } | undefined;
  let suppressClick = false;

  function updateShadowSize(pet: Pet) {
    const shadowW = Math.round(displaySize * (pet === 'dog' ? 0.48 : 0.42));
    const shadowH = Math.round(shadowW * 0.38);
    shadow.setSize(shadowW, shadowH);
  }

  function say(message: string, duration = 1650) {
    bubble.textContent = message;
    reactionUntil = scene.time.now + duration;
  }

  function canDrop(x: number, y: number) {
    const bounds = field.getBoundingClientRect();
    const half = displaySize / 2 + 4;
    const left = bounds.left + x - half;
    const right = bounds.left + x + half;
    const top = bounds.top + y - displaySize;
    const bottom = bounds.top + y + 8;
    if (left < bounds.left || right > bounds.right || top < bounds.top || bottom > bounds.bottom) return false;
    return ![...field.querySelectorAll('.plot-targets button, .bottom-dock, .meters, .farm-hud-menu')].some(element => {
      const box = element.getBoundingClientRect();
      return left < box.right && right > box.left && top < box.bottom && bottom > box.top;
    });
  }

  function stand(pet: Pet) {
    sprite.anims.stop();
    sprite.anims.timeScale = 1;
    sprite.setTexture(texture(pet, pets[pet].idle), 0).setAngle(0);
  }

  function showPet(pet: Pet) {
    shown = pet;
    const { name, size, foot } = pets[pet];
    stand(pet);
    sprite.setOrigin(.5, foot / size).setScale(displaySize / size);
    updateShadowSize(pet);
    hit.setAttribute('aria-label', `Vuốt ve ${name.toLowerCase()}`);
    reactionUntil = 0;
    guardUntil = 0;
  }
  showPet(chosen);

  dialog.addEventListener('close', () => {
    const selection = dialog.returnValue;
    const pet = species.find(option => option === selection);
    if (pet) {
      void selectPet(pet);
    }
  });

  function resetPatrol() {
    const { x, y } = corner;
    const offsets = [24, 16, 8];
    patrolLeft = offsets.find(offset => canDrop(x - offset, y)) ?? 0;
    patrolRight = offsets.find(offset => canDrop(x + offset, y)) ?? 0;
    patrolTime = 0;
    sprite.setPosition(0, 0);
    shadow.setPosition(0, 0);
  }

  function petReaction() {
    if (!sprite.visible) return;
    stand(chosen);
    const { voice, reaction } = pets[chosen];
    say(`${voice} Thích quá ♥`);
    if (!reduceMotion.matches) sprite.play(texture(chosen, reaction));
  }

  hit.onclick = event => {
    if (!suppressClick || event.detail === 0) petReaction();
    suppressClick = false;
  };
  hit.onpointerdown = event => {
    if (!event.isPrimary || event.button !== 0) return;
    suppressClick = false;
    press = {
      id: event.pointerId, x: event.clientX, y: event.clientY, started: performance.now(),
      originX: corner.x + sprite.x, originY: corner.y + sprite.y,
      dragging: false, reacted: false,
    };
    hit.setPointerCapture(event.pointerId);
    if (sprite.anims.isPlaying && sprite.anims.currentAnim?.key === texture(chosen, 'walk')) stand(chosen);
  };
  hit.onpointermove = event => {
    if (!press || press.id !== event.pointerId || press.reacted) return;
    const dx = event.clientX - press.x;
    const dy = event.clientY - press.y;
    if (!press.dragging) {
      if (Math.hypot(dx, dy) < 10) return;
      if (performance.now() - press.started < 240) {
        if (event.pointerType === 'touch') {
          press.reacted = suppressClick = true;
          petReaction();
        }
        return;
      }
      press.dragging = suppressClick = true;
      stand(chosen);
      sprite.setPosition(0, 0);
      shadow.setPosition(0, 0).setAlpha(0.2).setScale(0.85);
      hit.classList.add('is-dragging');
      say('Đặt mình ở đây nhé!', Infinity);
    }
    corner.setPosition(
      Phaser.Math.Clamp(press.originX + dx, displaySize / 2 + 4, field.clientWidth - displaySize / 2 - 4),
      Phaser.Math.Clamp(press.originY + dy, displaySize, field.clientHeight - 8),
    );
  };
  hit.onpointerup = event => {
    if (!press || press.id !== event.pointerId || !press.dragging) return;
    placed = canDrop(corner.x, corner.y);
    if (!placed) corner.setPosition(home.x, home.y);
    resetPatrol();
    shadow.setAlpha(0.38).setScale(1);
    say(placed ? 'Ở đây vui quá!' : 'Mình về góc nhé!');
    press = undefined;
    hit.classList.remove('is-dragging');
  };
  hit.onlostpointercapture = () => {
    if (press?.dragging) {
      placed = false;
      corner.setPosition(home.x, home.y);
      resetPatrol();
      reactionUntil = 0;
      shadow.setAlpha(0.38).setScale(1);
      hit.classList.remove('is-dragging');
    }
    press = undefined;
  };

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    opener.remove();
    hit.remove();
    bubble.remove();
    dialog.remove();
  });

  return {
    guard() {
      stand(shown);
      say(`${pets[shown].voice} Có mình giữ nhà rồi!`, 2400);
      guardUntil = reactionUntil;
      if (!reduceMotion.matches) sprite.play(texture(shown, 'guard'));
    },
    layout() {
      const bounds = field.getBoundingClientRect();
      const dockTop = dock.getBoundingClientRect().top;
      displaySize = bounds.width >= 900 && bounds.height >= 550 ? 120 : bounds.width <= 480 ? 90 : 100;
      sprite.setScale(displaySize / pets[shown].size);
      updateShadowSize(shown);
      const hitSize = Math.max(52, Math.round(displaySize * .72));
      hit.style.width = hit.style.height = `${hitSize}px`;

      // Smart placement: beside the path near the field plots, easily visible
      const firstPlot = field.querySelector<HTMLButtonElement>('.plot-targets button');
      let targetX = Math.round(displaySize / 2 + 18);
      let targetY = Math.round(dockTop - bounds.top - 16);

      if (firstPlot) {
        const plotBox = firstPlot.getBoundingClientRect();
        // Candidate 1: to the left of the farm plots along the pathway
        const pathX = Math.round(plotBox.left - bounds.left - displaySize * 0.58);
        const pathY = Math.round(plotBox.top - bounds.top + displaySize * 0.45);
        if (canDrop(pathX, pathY)) {
          targetX = pathX;
          targetY = pathY;
        } else {
          // Candidate 2: along the path in front of the dock
          const altX = Math.round(bounds.width * 0.22);
          const altY = Math.round(dockTop - bounds.top - displaySize * 0.22);
          if (canDrop(altX, altY)) {
            targetX = altX;
            targetY = altY;
          }
        }
      }

      home = { x: targetX, y: targetY };
      if (!placed || !canDrop(corner.x, corner.y)) {
        placed = false;
        corner.setPosition(home.x, home.y);
      }
      resetPatrol();
    },
    update(now: number, delta: number, atHome: boolean, interactive: boolean, hostPet?: Pet, ownPet: Pet = 'dog') {
      chosen = ownPet;
      opener.hidden = !interactive;
      const shouldVisible = atHome || !!hostPet;
      sprite.setVisible(shouldVisible);
      shadow.setVisible(shouldVisible);
      hit.hidden = !interactive;
      bubble.hidden = !sprite.visible || now >= reactionUntil;
      if (!sprite.visible) return;
      const pet = atHome ? chosen : hostPet!;
      if (shown !== pet) showPet(pet);
      if (guardUntil && now >= guardUntil) {
        guardUntil = 0;
        stand(pet);
      }

      if (now < guardUntil) {
        sprite.setAngle(0);
      } else if (!press && !reduceMotion.matches) {
        patrolTime += Math.min(delta, 50);
        const phase = patrolTime / 390;
        const motion = Math.sin(phase);
        const direction = Math.cos(phase);

        // Deceleration when approaching the turnaround point
        const speedFactor = Math.min(1, Math.max(0.18, Math.abs(direction) / 0.35));

        sprite.setX(motion * (motion < 0 ? patrolLeft : patrolRight));
        shadow.setX(sprite.x);

        // Turn flip smoothly when clearly in motion direction (avoid rapid flip at 0)
        if (direction < -0.15) {
          sprite.setFlipX(true);
        } else if (direction > 0.15) {
          sprite.setFlipX(false);
        }

        const walking = patrolLeft + patrolRight > 0;
        const anim = sprite.anims;
        const walk = texture(pet, 'walk');
        if (walking && !anim.isPlaying) sprite.play({ key: walk, repeat: -1 });
        if (anim.isPlaying && anim.currentAnim?.key === walk) {
          if (walking) anim.timeScale = Math.max(0.2, speedFactor * 1.1);
          else stand(pet);
        }
      } else if (!press) {
        // Stopped when reduceMotion matches or idle
        sprite.setX(0);
        shadow.setX(0);
        if (sprite.anims.isPlaying && sprite.anims.currentAnim?.key === texture(pet, 'walk')) stand(pet);
        sprite.setAngle(0);
      }

      const x = corner.x + sprite.x;
      const y = corner.y + sprite.y;
      hit.style.left = `${x}px`;
      hit.style.top = `${y - displaySize * .38}px`;
      if (!bubble.hidden) {
        const bubbleBelow = y < displaySize + 40;
        const halfWidth = Math.min(bubble.offsetWidth / 2 + 8, field.clientWidth / 2);
        const bubbleX = Phaser.Math.Clamp(x, halfWidth, field.clientWidth - halfWidth);
        bubble.classList.toggle('is-below', bubbleBelow);
        bubble.style.left = `${bubbleX}px`;
        bubble.style.top = `${bubbleBelow ? y + 10 : y - displaySize - 4}px`;
        bubble.style.setProperty('--pet-tail-x', `calc(50% + ${x - bubbleX}px)`);
      }
    },
  };
}
