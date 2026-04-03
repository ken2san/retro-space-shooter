import { CANVAS_WIDTH } from '../constants';
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

  if (isBossWave) {
    if (waveNum === 6) {
      // Level 3 Mid-Boss: Tractor Carrier (Galaga homage)
      const boss: Enemy = {
        ...createEnemy(CANVAS_WIDTH / 2 - 60, 80, 1),
        width: 120,
        height: 90,
        isBoss: true,
        bossType: BossType.TRACTOR,
        health: 1500,
        maxHealth: 1500,
        phase: 1,
        moveDir: 1,
        lastShotTime: 0,
      };
      enemies.push(boss);
      return { enemies, bossHealth: { current: 1500, max: 1500 }, playBossWarning: true };
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
        health: 5000,
        maxHealth: 5000,
        phase: 1,
        moveDir: 1,
        lastShotTime: 0,
      };
      enemies.push(boss);
      return { enemies, bossHealth: { current: 5000, max: 5000 }, playBossWarning: true };
    }

    const boss: Enemy = {
      ...createEnemy(CANVAS_WIDTH / 2 - 80, 80, 0),
      width: 160,
      height: 120,
      isBoss: true,
      bossType: BossType.SWARM,
      health: 2200,
      maxHealth: 2200,
      phase: 1,
      moveDir: 1,
      lastShotTime: 0,
    };
    enemies.push(boss);
    return { enemies, bossHealth: { current: 2200, max: 2200 }, playBossWarning: true };
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
    for (let i = 0; i < 8; i++) {
      enemies.push(createEnemy(60 + (i % 4) * 140, 60 + Math.floor(i / 4) * 70, i % 2 === 0 ? 1 : 4));
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
    if (waveNum === 4) {
      // Tentacle Boss (mid-boss)
      const boss = createEnemy(CANVAS_WIDTH / 2 - 50, 100, 3);
      boss.width = 100;
      boss.height = 100;
      boss.health = 1500 + waveRefCurrent * 100;
      boss.maxHealth = boss.health;
      boss.isBoss = true;
      boss.bossType = BossType.TENTACLE;
      boss.state = 'BOSS';
      boss.phase = 1;
      boss.tentacles = [
        { segments: [], baseAngle: 0, targetAngle: 0, length: 280 },
        { segments: [], baseAngle: Math.PI / 3, targetAngle: 0, length: 280 },
        { segments: [], baseAngle: (Math.PI * 2) / 3, targetAngle: 0, length: 280 },
        { segments: [], baseAngle: Math.PI, targetAngle: 0, length: 280 },
        { segments: [], baseAngle: (Math.PI * 4) / 3, targetAngle: 0, length: 280 },
        { segments: [], baseAngle: (Math.PI * 5) / 3, targetAngle: 0, length: 280 },
      ];
      boss.tentacles.forEach((tentacle) => {
        for (let i = 0; i < 16; i++) {
          tentacle.segments.push({ x: 0, y: 0, angle: 0 });
        }
      });
      enemies.push(boss);
      return {
        enemies,
        bossHealth: { current: boss.health, max: boss.health },
        playBossWarning: false,
      };
    }

    for (let i = 0; i < 8; i++) {
      const enemy = createEnemy(Math.random() * CANVAS_WIDTH, -50, i % 2 === 0 ? 2 : 4);
      enemy.state = 'DIVING';
      enemy.isDiving = true;
      enemy.diveX = (Math.random() - 0.5) * 4;
      enemy.diveY = 6;
      enemies.push(enemy);
    }
  } else if (stage === 5) {
    for (let i = 0; i < 15; i++) {
      enemies.push(createEnemy(50 + (i % 5) * 120, 60 + Math.floor(i / 5) * 60, i % 3));
    }
  }

  return { enemies, bossHealth: null, playBossWarning: false };
};
