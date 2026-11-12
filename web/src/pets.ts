import Phaser from 'phaser';
import type { PetSpecies } from '../../shared/farm.mts';
import './pets.css';

const pets = {
  dog: { name: 'Chó', size: 176, foot: 158, idle: 'idle', reaction: 'happy', voice: 'Gâu!' },
  cat: { name: 'Mèo', size: 128, foot: 116, idle: 'happy', reaction: 'happy', voice: 'Meo!', walk: true },
  goose: { name: 'Ngỗng', size: 128, foot: 116, idle: 'peck', reaction: 'peck', voice: 'Quác!', walk: true },
} as const;
type Pet = PetSpecies;
const species = ['dog', 'cat', 'goose'] as const;
const clips = [
  ['dog', 'idle', 7], ['dog', 'happy', 7], ['cat', 'happy', 8], ['cat', 'walk', 8],
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
  const sprite = scene.add.sprite(0, 0, texture('dog', 'idle'), 0).setVisible(false);
  const corner = scene.add.container(0, 0, [sprite]);
  const dock = field.querySelector<HTMLElement>('.bottom-dock')!;
  const profile = field.querySelector<HTMLElement>('.meters')!;
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
      const hitSize = Math.max(52, Math.round(displaySize * .72));
      hit.style.width = hit.style.height = `${hitSize}px`;
      const x = displaySize / 2 + 12;
      const cornerCrowded = [...field.querySelectorAll('.plot-targets button')].some(button => {
        const plot = button.getBoundingClientRect();
        return plot.left < bounds.left + displaySize + 34 && plot.right > bounds.left + 8
          && plot.bottom > dockTop - displaySize - 26 && plot.top < dockTop;
      });
      const foot = cornerCrowded ? profile.getBoundingClientRect().bottom + displaySize + 26 : dockTop - 12;
      home = { x, y: foot - bounds.top };
      if (!placed || !canDrop(corner.x, corner.y)) {
        placed = false;
        corner.setPosition(home.x, home.y);
      }
      resetPatrol();
    },
    update(now: number, delta: number, atHome: boolean, interactive: boolean, hostPet?: Pet, ownPet: Pet = 'dog') {
      chosen = ownPet;
      opener.hidden = !interactive;
      sprite.setVisible(atHome || !!hostPet);
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
        sprite.setX(motion * (motion < 0 ? patrolLeft : patrolRight));
        const direction = Math.cos(phase);
        sprite.setFlipX(direction < 0);
        if ('walk' in pets[pet]) {
          const walking = patrolLeft + patrolRight > 0;
          const anim = sprite.anims;
          const walk = texture(pet, 'walk');
          if (walking && !anim.isPlaying) sprite.play({ key: walk, repeat: -1 });
          if (anim.isPlaying && anim.currentAnim?.key === walk) {
            if (walking) anim.timeScale = Math.max(.35, Math.abs(direction));
            else stand(pet);
          }
        } else {
          sprite.setAngle(Math.sin(patrolTime / 82) * 3);
        }
      } else if (!press) {
        sprite.setX(0);
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
