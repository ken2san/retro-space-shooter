export type GameState = 'LOADING' | 'START' | 'PLAYING' | 'GAME_OVER' | 'VICTORY' | 'STAGE_CLEAR' | 'UPGRADE' | 'RELIC_SELECT';

export interface Bullet {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  damage?: number;
  size?: number;
  color?: string;
  isHoming?: boolean;
  isBeam?: boolean;
  deflected?: boolean;
  bounces?: number;
}

export interface Enemy {
  x: number;
  y: number;
  width: number;
  height: number;
  alive: boolean;
  type: number;
  isDiving: boolean;
  isReturning: boolean;
  diveX: number;
  diveY: number;
  originX: number;
  originY: number;
  diveType?: 'normal' | 'uturn' | 'zigzag' | 'sweep' | 'spread' | 'loop' | 'chase' | 'sine';
  turnY?: number;
  diveTime?: number;
  diveStartX?: number;
  diveStartY?: number;
  isBoss?: boolean;
  bossType?: BossType;
  health?: number;
  maxHealth?: number;
  phase?: number;
  moveDir?: number;
  lastShotTime?: number;
  laserHitTime?: number;
  isTurret?: boolean;
  isFinalBoss?: boolean;
  tractorBeamTimer: number;
  isTractorBeaming: boolean;
  tractorBeamX: number;
  state: 'ENTERING' | 'IN_FORMATION' | 'DIVING' | 'RETURNING' | 'TRACTOR_BEAM' | 'SWARM' | 'LASER' | 'DEAD' | 'BOSS';
  path?: { x: number, y: number }[];
  pathIndex?: number;
  entryDelay?: number;
  prevX?: number;
  prevY?: number;
  stunnedUntil: number;
  knockbackVX?: number;
  knockbackVY?: number;
  speedScale: number;
  amplitudeScale: number;
  shield?: number;
  maxShield?: number;
  tentacles?: {
    segments: { x: number, y: number, angle: number }[];
    baseAngle: number;
    targetAngle: number;
    length: number;
  }[];
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  type?: 'square' | 'line';
  rotation?: number;
  vr?: number;
  isWarp?: boolean;
}

export interface Trail {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  color: string;
  width: number;
}

export interface PowerUp {
  x: number;
  y: number;
  type: 'MULTISHOT' | 'SHIELD' | 'RAPIDFIRE' | 'REPAIR';
  life: number;
}

export interface Scrap {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

export interface Asteroid {
  x: number;
  y: number;
  dx: number;
  vx: number;
  vy: number;
  size: number;
  speed: number;
  rotation: number;
  vr: number;
  hp: number;
  vertices: number[];
}

export enum BossType {
  TRACTOR = 'TRACTOR',
  SWARM = 'SWARM',
  LASER = 'LASER',
  TENTACLE = 'TENTACLE'
}

export interface Obstacle {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'BUILDING' | 'WALL' | 'PILLAR' | 'TENTACLE' | 'TURRET_BLOCK' | 'WINDMILL' | 'BEAM_TURRET';
  hp: number;
  maxHp: number;
  color: string;
  lastShotTime?: number;
  lastCenterBonus?: number;
  segments?: { x: number, y: number, angle: number }[];
  baseX?: number;
  vx?: number;          // UNUSED — kept for backward compat
  chargeHits?: number;  // beam hits absorbed before burst (BUILDING chain reaction)
  trackLeft?: number;   // UNUSED — kept for backward compat
  trackRight?: number;  // UNUSED — kept for backward compat
  baseVy?: number;      // extra downward speed for mobile BEAM_TURRET (on top of scroll)
  haltUntil?: number;   // timestamp: mobile turret freezes while aiming before firing
  railPhase?: 0 | 1 | 2; // 0=descend, 1=slide horizontal, 2=descend again
  railTurnY?: number;   // canvas Y at which phase 0→1 triggers
  railTargetX?: number; // target block.x during horizontal slide (phase 1)
}

export interface DamageNumber {
  x: number;
  y: number;
  value: number;
  life: number;
  maxLife: number;
  color: string;
  isCrit?: boolean;
}

export interface TailSegment {
  x: number;
  y: number;
  vx: number;
  vy: number;
  lastHit?: number;
}

export interface Drone {
  angle: number;
  distance: number;
  lastShot: number;
}
