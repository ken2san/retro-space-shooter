import { CANVAS_WIDTH, isMobile } from '../constants';
import { BossType, Enemy } from '../types';

type BossHealth = { current: number; max: number };

export type BuildWaveEnemiesResult = {
  enemies: Enemy[];
  bossHealth: BossHealth | null;
  playBossWarning: boolean;
};

export const createEnemy = (
  x: number,
  y: number,
  type: number,
  delay: number = 0,
  path?: { x: number; y: number }[]
): Enemy => {
  // Add random jitter to reduce perfect overlap in formations.
  const jitterX = (Math.random() - 0.5) * 30;
  const jitterY = (Math.random() - 0.5) * 30;

  return {
    x: (path ? path[0].x : x) + jitterX,
    y: (path ? path[0].y : y) + jitterY,
    width: 35,
    height: 35,
    alive: true,
    type,
    isDiving: false,
    isReturning: false,
    diveX: 0,
    diveY: 0,
    originX: x + jitterX,
    originY: y + jitterY,
    diveType: 'normal',
    turnY: 0,
    diveTime: 0,
    diveStartX: 0,
    diveStartY: 0,
    state: path ? 'ENTERING' : 'IN_FORMATION',
    path,
    pathIndex: 0,
    entryDelay: delay,
    tractorBeamTimer: 0,
    isTractorBeaming: false,
    tractorBeamX: 0,
    stunnedUntil: 0,
    knockbackVX: 0,
    knockbackVY: 0,
    speedScale: type === 0 ? 1.5 : type === 1 ? 1.2 : type === 2 ? 0.7 : type === 4 ? 0.9 : 1.0,
    amplitudeScale: type === 0 ? 0.8 : type === 1 ? 1.5 : type === 2 ? 0.5 : type === 4 ? 0.7 : 1.2,
    shield: type === 4 ? 20 : 0,
    maxShield: type === 4 ? 20 : 0,
  };
};

export const buildWaveEnemies = (
  waveNum: number,
  waveRefCurrent: number
): BuildWaveEnemiesResult => {
  const enemies: Enemy[] = [];
  const stage = Math.min(5, Math.ceil(waveNum / 2));
  const isBossWave = waveNum === 6 || waveNum === 8 || waveNum === 10;
  // Mobile devices have lower sustained fire rate — reduce boss HP to keep kill time reasonable.
  const bossHpScale = isMobile ? 0.75 : 1.0;

  if (isBossWave) {
    if (waveNum === 6) {
      // Level 3 Mid-Boss: Tractor Carrier (Galaga homage)
      const boss: Enemy = {
        ...createEnemy(CANVAS_WIDTH / 2 - 60, 80, 1),
        width: 120,
        height: 90,
        isBoss: true,
        bossType: BossType.TRACTOR,
        health: Math.round(1500 * bossHpScale),
        maxHealth: Math.round(1500 * bossHpScale),
        phase: 1,
        moveDir: 1,
        lastShotTime: 0,
      };
      enemies.push(boss);
      return { enemies, bossHealth: { current: boss.health!, max: boss.maxHealth! }, playBossWarning: true };
    }

    if (waveNum === 10) {
      // Level 5 Final Boss: The Core (Mothership)
      const boss: Enemy = {
        ...createEnemy(CANVAS_WIDTH / 2 - 100, 80, 2),
        width: 200,
        height: 160,
        isBoss: true,
        bossType: BossType.LASER,
        isFinalBoss: true,
        health: Math.round(5000 * bossHpScale),
        maxHealth: Math.round(5000 * bossHpScale),
        phase: 1,
        moveDir: 1,
        lastShotTime: 0,
      };
      enemies.push(boss);
      return { enemies, bossHealth: { current: boss.health!, max: boss.maxHealth! }, playBossWarning: true };
    }

    const boss: Enemy = {
      ...createEnemy(CANVAS_WIDTH / 2 - 80, 80, 0),
      width: 160,
      height: 120,
      isBoss: true,
      bossType: BossType.SWARM,
      health: Math.round(2200 * bossHpScale),
      maxHealth: Math.round(2200 * bossHpScale),
      phase: 1,
      moveDir: 1,
      lastShotTime: 0,
    };
    enemies.push(boss);
    return { enemies, bossHealth: { current: boss.health!, max: boss.maxHealth! }, playBossWarning: true };
  }

  if (stage === 1) {
    const count = waveNum === 1 ? 12 : 18;
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / 6);
      const col = i % 6;
      enemies.push(createEnemy(80 + col * 80, 60 + row * 60, 0));
    }
  } else if (stage === 2) {
    for (let i = 0; i < 15; i++) {
      enemies.push(createEnemy(80 + (i % 5) * 100, 60 + Math.floor(i / 5) * 70, 0));
    }
  } else if (stage === 3) {
    // Fewer enemies — Stage 3 is about dodging turret fire and windmill formations
    for (let i = 0; i < 2; i++) {
      enemies.push(createEnemy(80 + i * 280, 110, i % 2 === 0 ? 1 : 4));
    }
    for (let i = 0; i < 2; i++) {
      const turret = createEnemy(150 + i * 200, 220, 1);
      turret.isTurret = true;
      turret.width = 50;
      turret.height = 50;
      turret.health = 80;
      enemies.push(turret);
    }
  } else if (stage === 4) {
    // Stage 4 "Chase": V-wedge formation attack.
    // The tip (interceptor) enters first; inner scouts and outer heavies unfold on either side
    // with staggered entry delays. Once all reach IN_FORMATION, the existing formation dive
    // system drives coordinated leader + wingman attack runs automatically.
    // The survival-spawn system in App.tsx fills the pressure gap as formation members are killed.
    const cx = CANVAS_WIDTH / 2;
    const vSlots: { fx: number; fy: number; type: number; delay: number }[] = [
      { fx: cx,        fy: 120, type: 1, delay: 0   },  // tip — interceptor, leads the V
      { fx: cx - 95,   fy:  90, type: 0, delay: 200 },  // left inner — scout
      { fx: cx + 95,   fy:  90, type: 0, delay: 200 },  // right inner — scout
      { fx: cx - 195,  fy:  62, type: 2, delay: 400 },  // left outer — heavy
      { fx: cx + 195,  fy:  62, type: 2, delay: 400 },  // right outer — heavy
    ];
    vSlots.forEach(({ fx, fy, type, delay }) => {
      // Path: [off-screen start, formation slot] — ENTERING state flies from y=-80 to fy.
      // originX/originY (from fx/fy args) is used by IN_FORMATION lerp to hold position.
      enemies.push(createEnemy(fx, fy, type, delay, [{ x: fx, y: -80 }, { x: fx, y: fy }]));
    });
  } else if (stage === 5) {
    for (let i = 0; i < 15; i++) {
      enemies.push(createEnemy(50 + (i % 5) * 120, 60 + Math.floor(i / 5) * 60, i % 3));
    }
  }

  return { enemies, bossHealth: null, playBossWarning: false };
};
