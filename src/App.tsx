/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Rocket, Trophy, Play, RotateCcw, Loader2, Zap, Maximize2, Shield, Cpu, Heart, Users, Activity, MousePointer2 } from 'lucide-react';
import { generateGameAssets } from './services/assetGenerator';
import { audio } from './services/audio';
import {
  CANVAS_WIDTH, CANVAS_HEIGHT, PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_SPEED,
  SLINGSHOT_THRESHOLD, GRAZE_DISTANCE, MAX_OVERDRIVE, BULLET_SPEED,
  ENEMY_DIVE_SPEED, ENEMY_BULLET_SPEED, ENEMY_ROWS, ENEMY_COLS, ENEMY_SPACING,
  isMobile, isIOS, isIOSStandalone, MAX_PARTICLES, MAX_TRAILS, MAX_BULLETS, MAX_ENEMY_BULLETS, ENABLE_SHADOWS,
} from './constants';
import {
  GameState, SlingshotWallMode, Bullet, Enemy, Particle, Trail, PowerUp, Scrap, Asteroid,
  BossType, Obstacle, DamageNumber, TailSegment, Drone,
} from './types';
import NeonShip from './components/NeonShip';
import GameHud from './components/GameHud';
import SlingshotModeWheel from './components/SlingshotModeWheel';
import StageTitleOverlay from './components/StageTitleOverlay';
import TutorialOverlay from './components/TutorialOverlay';
import { buildWaveEnemies, createEnemy } from './game/enemies';
import { bindInputListeners } from './hooks/useInput';
import { LEVEL_UP_OPTIONS, RELIC_LABELS, RELIC_OPTIONS, UpgradeOption, pickRandomOptions } from './game/upgrades';
import { getStageFromWave, getStageLabelFromWave, getSurvivalDurationFromStage, isSurvivalStage } from './game/stage';
import { XP_PER_SCRAP, applyXpGain } from './game/progression';

const getPercentile = (values: number[], percentile: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((percentile / 100) * sorted.length) - 1;
  const index = Math.min(sorted.length - 1, Math.max(0, rank));
  return sorted[index];
};
const TOUCH_DOUBLE_TAP_WINDOW_MS = 460;
const TOUCH_SLINGSHOT_CHARGE_DEADZONE = 18;
const TOUCH_SLINGSHOT_RESISTANCE = 0.3;
const TOUCH_INPUT_VELOCITY_SMOOTHING = 0.55;
const INPUT_WATCHDOG_RELEASE_MS = 280;
const INPUT_WATCHDOG_HARD_RELEASE_MS = 1200;
const INPUT_DEBUG_MIN_LOG_INTERVAL_MS = 120;

const VFX_PARTICLE_DESKTOP_MULTIPLIER = 0.75;
const VFX_PARTICLE_MOBILE_MULTIPLIER = 0.18;
const VFX_TRAIL_SPAWN_INTERVAL_MS = 20;
const VFX_TRAIL_ALPHA = 0.32;
const VFX_SLINGSHOT_TRAIL_ALPHA = 0.42;
const SLINGSHOT_SHIELD_MIN_PULL = 18;
const SLINGSHOT_SHIELD_MIN_RADIUS = 42;
const SLINGSHOT_SHIELD_MAX_RADIUS = 122;
const SLINGSHOT_SHIELD_THICKNESS = 18;
const SLINGSHOT_SHIELD_HALF_ARC = Math.PI / 2;
const SLINGSHOT_SHIELD_STUN_MS = 420;
const SLINGSHOT_SHIELD_DIVE_STUN_MS = 720;
const SLINGSHOT_SHIELD_KNOCKBACK = 16;
const SLINGSHOT_SHIELD_DIVE_KNOCKBACK = 26;
const SLINGSHOT_SHIELD_BOSS_KNOCKBACK = 6;
const SLINGSHOT_SHIELD_OBSTACLE_RECOIL = 14;
const SLINGSHOT_SHIELD_WALL_RECOIL = 18;
const SLINGSHOT_SHIELD_OBSTACLE_RECOIL_MS = 90;
const SLINGSHOT_ATTACK_OBSTACLE_HIT_MS = 80;
const SLINGSHOT_DEFENSE_ONLY_MAX_PULL = 72;
const SLINGSHOT_DEFENSE_ONLY_GUARD_MS = 360;
const SLINGSHOT_GUARD_COOLDOWN_MS = 1200;
const SLINGSHOT_GUARD_SMALL_MS = 280;
const SLINGSHOT_GUARD_LARGE_MS = 450;
const SLINGSHOT_COMBO_WINDOW_MS = 1200;
const SLINGSHOT_ATTACK_PREVIEW_THRESHOLD = SLINGSHOT_THRESHOLD + 30;
const AUTO_SPACE_COOLDOWN_MS = 1500;
const AUTO_SPACE_HARD_ENEMY_RADIUS = 210;
const AUTO_SPACE_BULLET_RADIUS = 240;
const AUTO_SPACE_MIN_HARD_ENEMIES = 4;
const AUTO_SPACE_MIN_BULLETS = 7;
const AUTO_SPACE_ENEMY_PUSH = 64;
const AUTO_SPACE_BULLET_CLEAR_MAX = 8;
const TENTACLE_SHIELD_DEFLECT_COOLDOWN_MS = 110;
const TENTACLE_SHIELD_DEFLECT_STUN_MS = 140;
const TENTACLE_SHIELD_DEFLECT_KNOCKBACK = 5;
const RAIN_TENTACLE_DEFLECT_COOLDOWN_MS = 140;
const RAIN_TENTACLE_DEFLECT_PUSH = 56;
const RAIN_TENTACLE_DEFLECT_LIFT = 22;
// Slingshot tier thresholds and landing distances expressed in screen pixels.
// getSlingshotLandingDistance converts to/from canvas pixels using canvasScaleRef,
// so the physical finger effort and visual jump feel the same on any screen size.
const SLINGSHOT_TIER1_SCREEN_THRESH = 44;   // screen px of pull past preview threshold
const SLINGSHOT_TIER2_SCREEN_THRESH = 104;
const SLINGSHOT_TIER3_SCREEN_THRESH = 168;
const SLINGSHOT_TIER1_SCREEN_LAND = 160;    // screen px of movement on release
const SLINGSHOT_TIER2_SCREEN_LAND = 304;
const SLINGSHOT_TIER3_SCREEN_LAND = 448;
const SLINGSHOT_TIER4_SCREEN_LAND = 544;
const PRECISION_FOLLOW_BASE_LERP = 0.2;
const PRECISION_FOLLOW_DRAG_LERP = 0.34;
const PRECISION_FOLLOW_CATCHUP_LERP = 0.46;
const PRECISION_FOLLOW_MAX_LERP = 0.58;
const SLINGSHOT_DRAG_CURVE_DISTANCE = 120;
const PRECISION_COAST_STOP_SPEED = 0.08;
const PRECISION_COAST_DAMPING = 0.88;
const SOLID_CONTACT_VELOCITY_DAMPING = 0.35;
const SOLID_CONTACT_TANGENT_DAMPING = 0.78;
const REPAIR_POWERUP_HEAL = 15;
const REPAIR_POWERUP_BASE_DROP_CHANCE = 0.04;
const REPAIR_POWERUP_LOW_HP_THRESHOLD = 40;
const REPAIR_POWERUP_LOW_HP_MULTIPLIER = 1.5;
const REPAIR_POWERUP_DROP_COOLDOWN_MS = 10000;
const REPAIR_POWERUP_MAX_DURING_BOSS = 1;

/** Claims the first dead slot in pool and assigns bullet data. Returns false if pool is full. */
function spawnBullet(
  pool: Bullet[],
  data: { x: number; y: number; vx?: number; vy?: number; damage?: number; size?: number; color?: string; isHoming?: boolean; isBeam?: boolean; deflected?: boolean; bounces?: number }
): boolean {
  for (let i = 0; i < pool.length; i++) {
    if (!pool[i].alive) {
      const b = pool[i];
      b.alive = true; b.x = data.x; b.y = data.y;
      b.vx = data.vx; b.vy = data.vy; b.damage = data.damage;
      b.size = data.size; b.color = data.color;
      b.isHoming = data.isHoming; b.isBeam = data.isBeam;
      b.deflected = data.deflected; b.bounces = data.bounces;
      return true;
    }
  }
  return false;
}

/** Claims the first dead slot in pool and assigns scrap data. Returns false if pool is full. */
function spawnScrap(
  pool: Scrap[],
  data: { x: number; y: number; vx: number; vy: number; life: number }
): boolean {
  for (let i = 0; i < pool.length; i++) {
    if (!pool[i].alive) {
      const s = pool[i];
      s.alive = true; s.x = data.x; s.y = data.y;
      s.vx = data.vx; s.vy = data.vy; s.life = data.life;
      return true;
    }
  }
  return false;
}

function getVictoryRank(score: number): { rank: string; color: string; shadow: string; label: string } {
  if (score >= 100000) return { rank: 'S', color: '#ffcc00', shadow: '0 0 50px rgba(255,204,0,0.9), 0 0 100px rgba(255,204,0,0.4)', label: 'LEGENDARY' };
  if (score >= 60000)  return { rank: 'A', color: '#00ffcc', shadow: '0 0 50px rgba(0,255,204,0.9), 0 0 100px rgba(0,255,204,0.4)', label: 'ELITE' };
  if (score >= 30000)  return { rank: 'B', color: '#9977ff', shadow: '0 0 50px rgba(153,119,255,0.9), 0 0 100px rgba(153,119,255,0.4)', label: 'VETERAN' };
  if (score >= 10000)  return { rank: 'C', color: '#ff8800', shadow: '0 0 50px rgba(255,136,0,0.9)', label: 'SOLDIER' };
  return { rank: 'D', color: '#888888', shadow: '0 0 20px rgba(136,136,136,0.5)', label: 'RECRUIT' };
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasScaleRef = useRef(1); // rect.height / CANVAS_HEIGHT — updated in pointer event handlers
  const [gameState, setGameState] = useState<GameState>('LOADING');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => parseInt(localStorage.getItem('neon:highScore') || '0', 10));
  const [victoryDisplayScore, setVictoryDisplayScore] = useState(0);
  const [wave, setWave] = useState(1);
  const [sectorName, setSectorName] = useState('Outer Rim');
  const [scrapCount, setScrapCount] = useState(0);
  const [integrity, setIntegrity] = useState(100);
  const lastContinuousSpawnTime = useRef(0);
  const integrityRef = useRef(100);
  const [wallMode, setWallMode] = useState<SlingshotWallMode>('OD_CHARGE');
  const wallModeRef = useRef<SlingshotWallMode>('OD_CHARGE');
  const [isWheelOpen, setIsWheelOpen] = useState(false);
  const isWheelOpenRef = useRef(false);
  const [level, setLevel] = useState(1);
  const [xp, setXp] = useState(0);
  const [xpToNextLevel, setXpToNextLevel] = useState(200);
  const levelRef = useRef(1);
  const xpRef = useRef(0);
  const xpToNextLevelRef = useRef(200);

  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeOptions, setUpgradeOptions] = useState<UpgradeOption[]>([]);
  const pendingLevelUpRef = useRef(0); // level-ups queued while boss wave clears
  const [assets, setAssets] = useState<Record<string, HTMLImageElement>>({});
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const TUTORIAL_SEEN_KEY = 'neon:tutorial-seen';
  const [showTutorial, setShowTutorial] = useState(false);

  const [hasWingman, setHasWingman] = useState(false);
  const wingmanRef = useRef(false);
  const wingmanPos = useRef({ x: 0, y: 0 });
  const wingmanLastShotTime = useRef(0);

  // Dev-only god mode
  const godModeRef = useRef(false);
  const [godMode, setGodMode] = useState(false);

  // Debug mode: enabled via ?debug=1 URL param (works in prod for device testing)
  const debugMode = new URLSearchParams(window.location.search).get('debug') === '1';

  // Game state refs for the loop
  const waveRef = useRef(1);
  const invulnerableUntil = useRef(0);
  const playerPos = useRef({ x: CANVAS_WIDTH / 2 - PLAYER_WIDTH / 2, y: CANVAS_HEIGHT - 80 });
  const targetPos = useRef({ x: CANVAS_WIDTH / 2 - PLAYER_WIDTH / 2, y: CANVAS_HEIGHT - 80 });
  const playerVel = useRef({ x: 0, y: 0 }); // Added velocity for inertia
  const prevPlayerPos = useRef({ x: CANVAS_WIDTH / 2 - PLAYER_WIDTH / 2, y: CANVAS_HEIGHT - 80 });
  const playerTilt = useRef(0);
  const playerScale = useRef({ x: 1, y: 1 });
  const inputVel = useRef({ x: 0, y: 0 });
  const inputHistory = useRef<{ x: number, y: number, t: number }[]>([]);
  const isSnapping = useRef(0); // Counter for frames of reduced damping
  const lastInputPos = useRef({ x: 0, y: 0 });
  const lastInputTime = useRef(0);
  const asteroidSpawnTimer = useRef(0);
  const lastAsteroidX = useRef(0);
  const timeScale = useRef(1.0);
  const grazeCount = useRef(0);
  const isDualFighter = useRef(false);
  const isHacked = useRef(false);
  const hackStartTime = useRef(0);
  const bullets = useRef<Bullet[]>(
    Array.from({ length: MAX_BULLETS }, () => ({ alive: false as boolean | undefined, x: 0, y: 0 }))
  );
  const enemyBullets = useRef<Bullet[]>(
    Array.from({ length: MAX_ENEMY_BULLETS }, () => ({ alive: false as boolean | undefined, x: 0, y: 0 }))
  );
  const enemies = useRef<Enemy[]>([]);
  const firepowerRef = useRef(1);
  const speedRef = useRef(1);
  const magnetRef = useRef(1);
  const critChanceRef = useRef(0);
  const regenRef = useRef(0);
  const chainLightningRef = useRef(0);
  const drones = useRef<Drone[]>([]);
  const damageNumbers = useRef<DamageNumber[]>([]);
  const particles = useRef<Particle[]>([]);
  const trails = useRef<Trail[]>([]);
  const shake = useRef(0);
  const flash = useRef(0);
  const glitch = useRef(0);
  const hitStopTimer = useRef(0);
  const offscreenCanvas = useRef<HTMLCanvasElement | null>(null);
  const offscreenCtx = useRef<CanvasRenderingContext2D | null>(null);
  const keysPressed = useRef<Record<string, boolean>>({});
  const lastShotTime = useRef(0);
  const lastDiveTime = useRef(0);
  const lastTimeRef = useRef(Date.now());
  const dtRef = useRef(1.0);
  const requestRef = useRef<number | null>(null);
  const comboRef = useRef(0);
  const lastHitTime = useRef(0);
  const stars = useRef<{x: number, y: number, size: number, speed: number, opacity: number}[]>([]);
  const [combo, setCombo] = useState(0);
  // Session performance tracking (for GAME_OVER stats display)
  const shotsFiredRef = useRef(0);
  const shotsHitRef = useRef(0);
  const hitsTakenRef = useRef(0);
  const maxComboRef = useRef(0);
  const gameSessionStartRef = useRef(0);
  // useRef (not useState) so the game loop always writes to the live object.
  // setGameState('GAME_OVER') triggers the re-render; at that point the ref is already populated.
  const gameOverStatsRef = useRef<{
    survivalMs: number;
    shotsFired: number;
    shotsHit: number;
    hitsTaken: number;
    maxCombo: number;
    grazes: number;
    sectorsReached: number;
  } | null>(null);
  const [victoryStats, setVictoryStats] = useState<{
    survivalMs: number;
    shotsFired: number;
    shotsHit: number;
    hitsTaken: number;
    maxCombo: number;
    grazes: number;
  } | null>(null);
  const trippyIntensity = useRef(0);
  const pulseRef = useRef(0);
  const [relics, setRelics] = useState<{id: string, label: string}[]>([]);
  const relicsRef = useRef<{id: string, label: string}[]>([]);
  const [waveTitle, setWaveTitle] = useState(false);
  const [bossHealth, setBossHealth] = useState<{current: number, max: number} | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasSaveData, setHasSaveData] = useState(false);
  const [perfStats, setPerfStats] = useState({
    fpsP50: 0,
    fpsP95: 0,
    frameMsP50: 0,
    frameMsP95: 0,
    enemies: 0,
    bullets: 0,
    enemyBullets: 0,
    particles: 0,
  });

  // Touch & Mouse Movement Refs
  const touchStartPos = useRef({ x: 0, y: 0 });
  const mouseAnchorPos = useRef<{ x: number, y: number } | null>(null);
  const currentMousePos = useRef({ x: 0, y: 0 });
  const physicalMousePos = useRef({ x: 0, y: 0 });
  const playerStartPos = useRef({ x: 0, y: 0 });
  const isSlingshotCharged = useRef(false);
  const isSlingshotMode = useRef(false);
  const isTouching = useRef(false);
  const isMouseDown = useRef(false);
  const touchPoints = useRef<Record<number, { x: number, y: number }>>({});
  const lastTapTime = useRef(0);
  const pointerTapTimer = useRef<number | null>(null); // timer to detect orphaned pointerdowns
  // Armed state used by touch flow when slingshot is released before charging.
  const slingshotArmed = useRef(false);
  const slingshotArmedExpiry = useRef(0);
  const slingshotArmedPos = useRef<{ x: number, y: number } | null>(null);
  const isVirtualDragActive = useRef(false);
  const virtualDragReleaseTimer = useRef<number | null>(null);
  const lastInputActivityAt = useRef(0);
  const inputDebugLogEnabledRef = useRef(false);
  const lastInputDebugLogAtRef = useRef(0);
  const lastInputDebugSnapshotRef = useRef('');
  // Idle-fire: fire slingshot when mousemove stops (finger lifted on trackpad before OS sends mouseup)
  const idleFireTimer = useRef<number | null>(null);
  // Timestamp of the last idle-fire discharge — used to suppress phantom drag
  // re-synthesis in mouse-down-missed-detected for 500ms after idle-fire.
  const lastIdleFireAt = useRef(0);
  const slingshotAttackUntil = useRef(0);
  const slingshotTravelUntil = useRef(0);
  // Short-lived guard (~400ms) to block the phantom mousedown macOS sends
  // after slingshot fires. Kept separate from slingshotAttackUntil so that
  // legitimate new drag attempts after 400ms are NOT blocked.
  const slingshotPhantomGuardUntil = useRef(0);
  const slingshotGuardUntil = useRef(0);
  const slingshotGuardCooldownUntil = useRef(0);
  const slingshotShieldAngle = useRef(-Math.PI / 2);
  const slingshotShieldRadius = useRef(56);
  const slingshotShieldFxAt = useRef(0);
  const slingshotShieldObstacleRecoilAt = useRef(0);
  const slingshotObstacleKickAt = useRef(0);

  // Power-up & Overdrive State
  const powerUps = useRef<PowerUp[]>([]);
  const lastRepairDropAt = useRef(0);
  const lastBossHealthUpdateAt = useRef(0);
  const repairDropsDuringBossRef = useRef(0);
  const activeEffects = useRef<Record<string, number>>({});
  const overdriveGauge = useRef(0);
  const odReadyRef = useRef(false);
  const [overdrive, setOverdrive] = useState(0);
  const [isOverdriveActive, setIsOverdriveActive] = useState(false);
  const isOverdriveActiveRef = useRef(false);
  const overdriveEndTime = useRef(0);
  const pauseStartTime = useRef(0);
  const hasFollowerRef = useRef(false);
  const ambushSide = useRef<'left' | 'right'>(Math.random() > 0.5 ? 'left' : 'right');

  // Warp Transition State
  const isWarping = useRef(false);
  const scraps = useRef<Scrap[]>(
    Array.from({ length: isMobile ? 100 : 250 }, () => ({ alive: false as boolean | undefined, x: 0, y: 0, vx: 0, vy: 0, life: 0 }))
  );
  const asteroids = useRef<Asteroid[]>([]);
  const obstacles = useRef<Obstacle[]>([]);
  const lastObstacleTime = useRef(0);
  const obstaclePattern = useRef(0);
  const warpFactor = useRef(0);
  const warpStartTime = useRef(0);
  const slingshotTrails = useRef<{x: number, y: number, alpha: number}[]>([]);
  const slingshotTrajectory = useRef<{x1: number, y1: number, x2: number, y2: number, alpha: number} | null>(null);
  const slingshotLandingTarget = useRef<{x: number, y: number} | null>(null);
  const tailSegments = useRef<TailSegment[]>([]);
  const followerHistory = useRef<{x: number, y: number}[]>([]);
  const isHackedRef = useRef(false);
  const stageStartTime = useRef(0);
  const ambushTimer = useRef(0);
  const lastGrazeAt = useRef(0);
  const lastTrailSpawnAt = useRef(0);
  const lastSparkAt = useRef(0);
  const lastTractorBeamDamageAt = useRef(0);
  const frameTimeSamplesMs = useRef<number[]>([]);
  const fpsSamples = useRef<number[]>([]);
  const lastPerfUiUpdateAt = useRef(0);
  const renderLoadTierRef = useRef(0); // 0=full, 1=reduced, 2=minimal
  const simulationLoadTierRef = useRef(0); // 0=full, 1=reduced, 2=critical
  const frameCounterRef = useRef(0);
  const [survivalTime, setSurvivalTime] = useState(30);
  const survivalTimerRef = useRef(30);
  const [isWarpingState, setIsWarpingState] = useState(false);
  const [stageProgress, setStageProgress] = useState(0);
  const wavePeakAliveRef = useRef(1);
  const waveHasBossRef = useRef(false);
  const victoryPendingRef = useRef(false);
  const lastProgressUiUpdateAt = useRef(0);
  const lastAutoSpaceAt = useRef(0);
  const lastTentacleShieldDeflectAt = useRef(0);
  const lastRainTentacleDeflectAt = useRef(0);
  const blocks = useRef<Obstacle[]>([]);
  const lastBlockRowY = useRef(0);

  // Initialize stars and offscreen canvas
  useEffect(() => {
    const suppressNativeSelection = (e: Event) => {
      e.preventDefault();
    };

    // On iOS Safari inside itch.io iframe, long press / double tap can still open
    // native selection UI unless these events are actively suppressed.
    window.addEventListener('contextmenu', suppressNativeSelection);
    document.addEventListener('selectstart', suppressNativeSelection);
    document.addEventListener('dragstart', suppressNativeSelection);
    document.addEventListener('gesturestart', suppressNativeSelection as EventListener, { passive: false });
    document.addEventListener('gesturechange', suppressNativeSelection as EventListener, { passive: false });
    document.addEventListener('gestureend', suppressNativeSelection as EventListener, { passive: false });

    stars.current = Array.from({ length: isMobile ? 60 : 100 }, () => ({
      x: Math.random() * CANVAS_WIDTH,
      y: Math.random() * CANVAS_HEIGHT,
      size: Math.random() * 2 + 1,
      speed: Math.random() * 2 + 0.5,
      opacity: Math.random() * 0.5 + 0.2
    }));

    // Initialize offscreen canvas for post-processing
    offscreenCanvas.current = document.createElement('canvas');
    offscreenCanvas.current.width = CANVAS_WIDTH;
    offscreenCanvas.current.height = CANVAS_HEIGHT;
    offscreenCtx.current = offscreenCanvas.current.getContext('2d');

    return () => {
      window.removeEventListener('contextmenu', suppressNativeSelection);
      document.removeEventListener('selectstart', suppressNativeSelection);
      document.removeEventListener('dragstart', suppressNativeSelection);
      document.removeEventListener('gesturestart', suppressNativeSelection as EventListener);
      document.removeEventListener('gesturechange', suppressNativeSelection as EventListener);
      document.removeEventListener('gestureend', suppressNativeSelection as EventListener);
    };
  }, []);

  useEffect(() => {
    const saveData = localStorage.getItem('neon_defender_save');
    if (saveData) {
      setHasSaveData(true);
    }
  }, []);

  const saveGame = () => {
    const saveData = {
      wave: waveRef.current,
      score: score,
      scrapCount: scrapCount,
      level: levelRef.current,
      xp: xpRef.current,
      xpToNextLevel: xpToNextLevelRef.current,
      relics: relicsRef.current,
      stats: {
        firepower: firepowerRef.current,
        speed: speedRef.current,
        magnet: magnetRef.current,
        critChance: critChanceRef.current,
        regen: regenRef.current,
        chainLightning: chainLightningRef.current
      }
    };
    localStorage.setItem('neon_defender_save', JSON.stringify(saveData));
    setHasSaveData(true);
  };

  const loadGame = () => {
    const saveDataStr = localStorage.getItem('neon_defender_save');
    if (!saveDataStr) return;

    const saveData = JSON.parse(saveDataStr);

    setScore(saveData.score);
    const clampedWave = Math.min(saveData.wave, 10);
    setWave(clampedWave);
    waveRef.current = clampedWave;
    setScrapCount(saveData.scrapCount);
    setLevel(saveData.level);
    levelRef.current = saveData.level;
    setXp(saveData.xp);
    xpRef.current = saveData.xp;
    setXpToNextLevel(saveData.xpToNextLevel);
    xpToNextLevelRef.current = saveData.xpToNextLevel;
    setRelics(saveData.relics);
    relicsRef.current = saveData.relics;

    firepowerRef.current = saveData.stats.firepower;
    speedRef.current = saveData.stats.speed;
    magnetRef.current = saveData.stats.magnet;
    critChanceRef.current = saveData.stats.critChance;
    regenRef.current = saveData.stats.regen;
    chainLightningRef.current = saveData.stats.chainLightning;

    // Check for specific relics that need initialization
    if (relicsRef.current.some(r => r.id === 'WINGMAN')) {
      setHasWingman(true);
      wingmanRef.current = true;
    }
    const droneCount = relicsRef.current.filter(r => r.id === 'DRONE').length;
    for(let i=0; i<droneCount; i++) {
      drones.current.push({ angle: Math.random() * Math.PI * 2, distance: 60, lastShot: 0 });
    }

    setGameState('PLAYING');
    initEnemies(clampedWave);
    audio.init();
    const stage = Math.min(5, Math.ceil(clampedWave / 2));
    audio.playBGM(stage);
    audio.playStageStart();
  };

  // Detect touch device and handle resize
  useEffect(() => {
    const checkTouch = () => {
      const hasTouch = (
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
      );
      setIsTouchDevice(hasTouch);
    };

    checkTouch();
    window.addEventListener('resize', checkTouch);

    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      window.removeEventListener('resize', checkTouch);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const [showIosHint, setShowIosHint] = useState(false);

  const toggleFullscreen = () => {
    if (isIOS) {
      setShowIosHint(h => !h);
      return;
    }
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  // Play victory fanfare + animate score count-up when VICTORY screen appears
  useEffect(() => {
    if (gameState === 'VICTORY') {
      audio.playVictoryFanfare();
      setVictoryDisplayScore(0);
      // Delay count-up to match stats panel reveal at 1.4s
      const target = score;
      const timeoutId = setTimeout(() => {
        const duration = 1600;
        const startTime = performance.now();
        let rafId: number;
        function tick(now: number) {
          const progress = Math.min((now - startTime) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
          setVictoryDisplayScore(Math.round(target * eased));
          if (progress < 1) rafId = requestAnimationFrame(tick);
        }
        rafId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafId);
      }, 1400);
      return () => clearTimeout(timeoutId);
    } else {
      setVictoryDisplayScore(0);
    }
  }, [gameState, score]);

  // Load assets on mount
  useEffect(() => {
    const loadAssets = async () => {
      try {
        const base64Assets = await generateGameAssets();
        const loadedImages: Record<string, HTMLImageElement> = {};

        const loadPromises = Object.entries(base64Assets).map(([name, src]) => {
          return new Promise<void>((resolve) => {
            const img = new Image();
            img.src = src;
            img.onload = () => {
              loadedImages[name] = img;
              resolve();
            };
            img.onerror = () => {
              console.warn(`Failed to load asset: ${name}`);
              resolve(); // Resolve anyway to avoid hanging
            };
          });
        });

        await Promise.all(loadPromises);
        setAssets(loadedImages);
        setGameState('START');
        if (!localStorage.getItem('neon:tutorial-seen')) {
          setShowTutorial(true);
          localStorage.setItem('neon:tutorial-seen', '1');
        }
      } catch (error) {
        console.error('Failed to generate assets:', error);
        setGameState('START');
      }
    };

    loadAssets();
  }, []);

  const createExplosion = (x: number, y: number, color: string, count: number) => {
    if (particles.current.length > MAX_PARTICLES) return;
    const finalCount = isMobile
      ? Math.ceil(count * VFX_PARTICLE_MOBILE_MULTIPLIER)
      : Math.ceil(count * VFX_PARTICLE_DESKTOP_MULTIPLIER);
    for (let i = 0; i < finalCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 10;
      particles.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 30 + Math.random() * 30,
        maxLife: 60,
        color: color,
        size: 2 + Math.random() * 4,
        type: Math.random() > 0.5 ? 'square' : 'line',
        rotation: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.2
      });
    }
  };

  const handlePlayerHit = () => {
    if (godModeRef.current) return;
    if (Date.now() < invulnerableUntil.current) return;
    hitsTakenRef.current++;

    const damage = 20; // 5 hits to die
    const newIntegrity = Math.max(0, integrityRef.current - damage);
    integrityRef.current = newIntegrity;
    setIntegrity(newIntegrity);

    // Lose wingman on hit
    if (wingmanRef.current) {
      setHasWingman(false);
      wingmanRef.current = false;
      createExplosion(wingmanPos.current.x + PLAYER_WIDTH / 2, wingmanPos.current.y + PLAYER_HEIGHT / 2, '#ff33cc', isMobile ? 10 : 30);
    }

    isHackedRef.current = false; // Clear hacked state on hit

    if (newIntegrity <= 0) {
      gameOverStatsRef.current = {
        survivalMs: Date.now() - gameSessionStartRef.current,
        shotsFired: shotsFiredRef.current,
        shotsHit: shotsHitRef.current,
        hitsTaken: hitsTakenRef.current,
        maxCombo: maxComboRef.current,
        grazes: grazeCount.current,
        sectorsReached: waveRef.current,
      };
      setGameState('GAME_OVER');
      setBossHealth(null);
      audio.playGameOver();
    } else {
      audio.playPlayerHit();
      invulnerableUntil.current = Date.now() + 2000;
      flash.current = 1.0;
      shake.current = 20;
    }

    createExplosion(playerPos.current.x + PLAYER_WIDTH / 2, playerPos.current.y + PLAYER_HEIGHT / 2, '#00ffcc', 50);
  };

  const initEnemies = (waveNum: number) => {
    const { enemies: newEnemies, bossHealth, playBossWarning } = buildWaveEnemies(waveNum, waveRef.current);
    if (playBossWarning) audio.playBossWarning();
    setBossHealth(bossHealth);
    enemies.current = newEnemies;
  };

  const handleScrapCollection = (s: Scrap) => {
    setScrapCount(prev => prev + 1);
    setScore(prev => prev + 10);
    const progress = applyXpGain(
      {
        level: levelRef.current,
        xp: xpRef.current,
        xpToNextLevel: xpToNextLevelRef.current,
      },
      XP_PER_SCRAP
    );

    levelRef.current = progress.next.level;
    xpRef.current = progress.next.xp;
    xpToNextLevelRef.current = progress.next.xpToNextLevel;
    setLevel(levelRef.current);
    setXp(xpRef.current);
    setXpToNextLevel(xpToNextLevelRef.current);

    if (progress.didLevelUp && !victoryPendingRef.current) {
      // Suppress level-up if the boss wave just cleared — queue it for after the transition
      const bossWaveCleared = waveHasBossRef.current && !enemies.current.some(e => e.alive && e.isBoss);
      if (bossWaveCleared) {
        pendingLevelUpRef.current += 1;
      } else {
        triggerLevelUp();
      }
    }

    audio.playScrap();
    createExplosion(s.x, s.y, '#00ffcc', 5);
  };

  const triggerLevelUp = () => {
    if (victoryPendingRef.current) return; // never show upgrade after final boss
    setUpgradeOptions(pickRandomOptions(LEVEL_UP_OPTIONS, 3));
    setShowUpgrade(true);
    setGameState('UPGRADE');
    pauseStartTime.current = Date.now();
    audio.playUpgrade();
  };

  const resetInputGestureState = () => {
    if (pointerTapTimer.current !== null) {
      window.clearTimeout(pointerTapTimer.current);
      pointerTapTimer.current = null;
    }
    if (virtualDragReleaseTimer.current !== null) {
      window.clearTimeout(virtualDragReleaseTimer.current);
      virtualDragReleaseTimer.current = null;
    }
    if (idleFireTimer.current !== null) {
      window.clearTimeout(idleFireTimer.current);
      idleFireTimer.current = null;
    }

    isMouseDown.current = false;
    isTouching.current = false;
    isSlingshotMode.current = false;
    isSlingshotCharged.current = false;
    isVirtualDragActive.current = false;

    if (document.pointerLockElement === canvasRef.current) {
      document.exitPointerLock();
    }

    mouseAnchorPos.current = null;
    slingshotArmed.current = false;
    slingshotArmedExpiry.current = 0;
    slingshotArmedPos.current = null;
    touchPoints.current = {};

    lastTapTime.current = 0;
    inputVel.current = { x: 0, y: 0 };
    inputHistory.current = [];
    slingshotGuardUntil.current = 0;
    slingshotGuardCooldownUntil.current = 0;
    slingshotShieldAngle.current = -Math.PI / 2;
    slingshotShieldRadius.current = 56;
    slingshotShieldObstacleRecoilAt.current = 0;
    slingshotObstacleKickAt.current = 0;
    lastInputActivityAt.current = 0;
  };

  const normalizeAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

  const getSlingshotShieldState = (now: number) => {
    const anchor = mouseAnchorPos.current || (isTouching.current ? { x: touchStartPos.current.x, y: touchStartPos.current.y } : null);
    const isDraggingShield = (isMouseDown.current || isTouching.current || isVirtualDragActive.current) && isSlingshotMode.current && anchor;

    if (isDraggingShield && anchor) {
      const rawDx = anchor.x - currentMousePos.current.x;
      const rawDy = anchor.y - currentMousePos.current.y;
      const pullDist = Math.sqrt(rawDx * rawDx + rawDy * rawDy);

      if (pullDist >= SLINGSHOT_SHIELD_MIN_PULL) {
        const angle = Math.atan2(rawDy, rawDx);
        const diameter = Math.min(SLINGSHOT_SHIELD_MAX_RADIUS * 2, SLINGSHOT_SHIELD_MIN_RADIUS * 2 + pullDist * 0.9);
        const radius = diameter * 0.5;
        slingshotShieldAngle.current = angle;
        slingshotShieldRadius.current = radius;
        return {
          active: true,
          angle,
          radius,
          thickness: SLINGSHOT_SHIELD_THICKNESS,
          alpha: Math.min(0.92, 0.36 + pullDist / 220),
        };
      }
    }

    if (now < slingshotGuardUntil.current) {
      return {
        active: true,
        angle: slingshotShieldAngle.current,
        radius: slingshotShieldRadius.current,
        thickness: SLINGSHOT_SHIELD_THICKNESS,
        alpha: 0.42,
      };
    }

    return {
      active: false,
      angle: slingshotShieldAngle.current,
      radius: slingshotShieldRadius.current,
      thickness: SLINGSHOT_SHIELD_THICKNESS,
      alpha: 0,
    };
  };

  const getSlingshotLandingDistance = (pullDist: number) => {
    const scale = canvasScaleRef.current;
    const attackDist = Math.max(0, pullDist - SLINGSHOT_ATTACK_PREVIEW_THRESHOLD);
    if (attackDist <= 0) return SLINGSHOT_THRESHOLD;

    // Convert canvas-pixel pull to screen pixels for device-agnostic thresholds.
    // Same physical drag effort produces the same tier on any screen size.
    const attackScreen = attackDist * scale;
    let landingScreen: number;
    if (attackScreen < SLINGSHOT_TIER1_SCREEN_THRESH) landingScreen = SLINGSHOT_TIER1_SCREEN_LAND;
    else if (attackScreen < SLINGSHOT_TIER2_SCREEN_THRESH) landingScreen = SLINGSHOT_TIER2_SCREEN_LAND;
    else if (attackScreen < SLINGSHOT_TIER3_SCREEN_THRESH) landingScreen = SLINGSHOT_TIER3_SCREEN_LAND;
    else landingScreen = SLINGSHOT_TIER4_SCREEN_LAND;

    return landingScreen / scale;
  };

  const getCurvedSlingshotDisplacement = (rawDx: number, rawDy: number, resistance: number) => {
    const dist = Math.sqrt(rawDx * rawDx + rawDy * rawDy);
    if (dist <= 0) {
      return { dx: 0, dy: 0, dist: 0 };
    }

    const normalized = Math.min(1, dist / SLINGSHOT_DRAG_CURVE_DISTANCE);
    const eased = 1 - (1 - normalized) * (1 - normalized);
    const curvedResistance = resistance * (0.72 + eased * 0.4);

    return {
      dx: rawDx * curvedResistance,
      dy: rawDy * curvedResistance,
      dist,
    };
  };

  const getPlayerInputCenter = () => ({
    x: playerPos.current.x + PLAYER_WIDTH / 2,
    y: playerPos.current.y + PLAYER_HEIGHT / 2,
  });

  const requestSlingshotPointerLock = () => {
    if (isMobile) return;
    const canvas = canvasRef.current;
    if (!canvas || typeof canvas.requestPointerLock !== 'function') return;
    if (document.pointerLockElement === canvas) return;
    canvas.requestPointerLock();
  };

  const releaseSlingshotPointerLock = () => {
    if (document.pointerLockElement === canvasRef.current) {
      document.exitPointerLock();
    }
  };

  const beginDesktopSlingshot = (effectX: number, effectY: number, enablePointerLock: boolean) => {
    isSlingshotMode.current = true;
    isSlingshotCharged.current = false;
    isVirtualDragActive.current = false;
    if (virtualDragReleaseTimer.current !== null) {
      window.clearTimeout(virtualDragReleaseTimer.current);
      virtualDragReleaseTimer.current = null;
    }

    const center = getPlayerInputCenter();
    mouseAnchorPos.current = center;
    currentMousePos.current = center;
    playerStartPos.current = { x: playerPos.current.x, y: playerPos.current.y };
    inputVel.current = { x: 0, y: 0 };
    inputHistory.current = [{ x: center.x, y: center.y, t: Date.now() }];

    if (enablePointerLock) {
      requestSlingshotPointerLock();
    }

    audio.playSlingshot?.();
    shake.current = Math.max(shake.current, 5);
    createExplosion(effectX, effectY, '#00ffcc', 20);
    timeScale.current = 0.2;
    setTimeout(() => { if (!isOverdriveActiveRef.current) timeScale.current = 1.0; }, 100);
  };

  const startNextWave = () => {
    resetInputGestureState();
    if (isOverdriveActiveRef.current && pauseStartTime.current > 0) {
      overdriveEndTime.current += (Date.now() - pauseStartTime.current);
    }
    pauseStartTime.current = 0;

    waveRef.current += 1;

    // Wave 10 is the final wave. If we somehow end up here past it, go to VICTORY.
    if (waveRef.current > 10) {
      victoryPendingRef.current = true;
      setVictoryStats({
        survivalMs: Date.now() - gameSessionStartRef.current,
        shotsFired: shotsFiredRef.current,
        shotsHit: shotsHitRef.current,
        hitsTaken: hitsTakenRef.current,
        maxCombo: maxComboRef.current,
        grazes: grazeCount.current,
      });
      setGameState('VICTORY');
      return;
    }

    setGameState('PLAYING');
    setWave(waveRef.current);

    // Deliver any level-up queued while the boss wave was clearing
    if (pendingLevelUpRef.current > 0) {
      pendingLevelUpRef.current = 0;
      setTimeout(triggerLevelUp, 500);
    }

    const stage = getStageFromWave(waveRef.current);
    setSectorName(getStageLabelFromWave(waveRef.current));

    initEnemies(waveRef.current);
    waveHasBossRef.current = enemies.current.some(e => e.alive && e.isBoss);
    wavePeakAliveRef.current = Math.max(1, enemies.current.filter(e => e.alive).length);
    setStageProgress(0);

    stageStartTime.current = 0;
    survivalTimerRef.current = getSurvivalDurationFromStage(stage);
    setSurvivalTime(getSurvivalDurationFromStage(stage));
    blocks.current = [];
    for (const s of scraps.current) s.alive = false;
    asteroids.current = [];

    setWaveTitle(true);
    audio.playStageStart();
    audio.playBGM(stage);
    setTimeout(() => setWaveTitle(false), 2000);

    setTimeout(() => {
      isWarping.current = false;
      warpFactor.current = 0;
      setIsWarpingState(false);
    }, 1000);
  };

  const triggerRelicSelection = () => {
    // Exclude already-owned relics; fall back to full pool if exhausted.
    const ownedIds = new Set(relicsRef.current.map(r => r.id));
    const available = RELIC_OPTIONS.filter(r => !ownedIds.has(r.id));
    setUpgradeOptions(pickRandomOptions(available.length > 0 ? available : RELIC_OPTIONS, 4));
    setShowUpgrade(true);
    setGameState('RELIC_SELECT');
    pauseStartTime.current = Date.now();
    audio.playUpgrade();
  };

  const handleUpgrade = (id: string) => {
    if (RELIC_LABELS[id]) {
      const newRelic = { id, label: RELIC_LABELS[id] };
      setRelics(prev => [...prev, newRelic]);
      relicsRef.current.push(newRelic);
    }

    switch (id) {
      case 'FIREPOWER': firepowerRef.current += 0.5; break;
      case 'SPEED': speedRef.current += 0.2; break;
      case 'MAGNET': magnetRef.current += 0.5; break;
      case 'CRIT': critChanceRef.current += 0.1; break;
      case 'REGEN': regenRef.current += 0.5; break;
      case 'CHAIN': chainLightningRef.current += 0.2; break;
      case 'CHRONO': /* Handled in kill logic */ break;
      case 'EMP': /* Handled in hit logic */ break;
      case 'FRENZY': /* Handled in overdrive logic */ break;
      case 'FOLLOWER':
        // Disabled: Follower Pods are too expensive on mobile — re-enable when optimized.
        // hasFollowerRef.current = true;
        // const startX = wingmanRef.current ? wingmanPos.current.x + PLAYER_WIDTH / 2 : playerPos.current.x + PLAYER_WIDTH / 2;
        // const startY = wingmanRef.current ? wingmanPos.current.y + PLAYER_HEIGHT / 2 : playerPos.current.y + PLAYER_HEIGHT / 2;
        // followerHistory.current = Array(200).fill({ x: startX, y: startY });
        break;
      case 'WINGMAN':
        setHasWingman(true);
        wingmanRef.current = true;
        wingmanPos.current = { x: playerPos.current.x + 50, y: playerPos.current.y + 10 };
        break;
      case 'DRONE':
        drones.current.push({ angle: Math.random() * Math.PI * 2, distance: 60, lastShot: 0 });
        break;
      case 'SHIELD_REGEN':
        activeEffects.current['SHIELD'] = Date.now() + 10000;
        break;
    }

    // Resume overdrive timer if active
    if (isOverdriveActiveRef.current && pauseStartTime.current > 0) {
      overdriveEndTime.current += (Date.now() - pauseStartTime.current);
    }
    pauseStartTime.current = 0; // Reset after use

    setShowUpgrade(false);
    saveGame(); // Auto-save on upgrade/stage clear

    if (gameState === 'UPGRADE') {
      setGameState('PLAYING');
    } else {
      startNextWave();
    }
  };

  const generateMazeRow = () => {
    const currentStage = getStageFromWave(waveRef.current);
    // Stage 1 is obstacle-free (tutorial); Stage 2+ get environmental hazards.
    if (currentStage < 2) return;

    const rowY = -100;
    const blockWidth = CANVAS_WIDTH / 10;
    const blockHeight = 100;

    // Density increases with stage and wave
    let wallDensity = 0.02;
    let destructibleDensity = 0.05;
    let tentacleChance = 0;

    if (currentStage === 2) {
      // Asteroid Belt: one tentacle on screen at a time (windmill-style guard).
      // This gives a clear "surprise hazard" feel without cluttering the asteroid field.
      wallDensity = 0;
      destructibleDensity = 0;
      const hasTentacleOnScreen = blocks.current.some(b => b.type === 'TENTACLE' && b.y < CANVAS_HEIGHT);
      tentacleChance = hasTentacleOnScreen ? 0 : 0.04;
    }

    if (currentStage === 3) {
      // Stage 3 "Turret Run": structured turret/windmill formations on indestructible walls.
      // No destructibles — difficulty comes from navigating formations + turret fire.
      type Slot = null | 'WALL' | 'TURRET_BLOCK' | 'WINDMILL';
      // Windmill (armLen=290px) is always centred on the canvas. The blade sweep covers
      // nearly the full width — the player must time passage, not dodge horizontally.
      // Guard: only one windmill on screen at a time — wait until the previous one scrolls
      // off the bottom of the canvas (y >= CANVAS_HEIGHT) before spawning the next.
      // This ensures blades (armLen=290px each, 580px total) never overlap.
      const recentWindmill = blocks.current.some(b => b.type === 'WINDMILL' && b.y > -5 && b.y < CANVAS_HEIGHT);
      const windmillLayouts: Slot[][] = [
        // Single windmill — always centred (x is overridden in the push below)
        [null, null, null, null, null, 'WINDMILL', null, null, null, null],
      ];
      const quietLayouts: Slot[][] = [
        // Two turrets — inner flanks
        [null, 'TURRET_BLOCK', null, null, null, null, null, null, 'TURRET_BLOCK', null],
        // Single turret — left
        [null, null, 'TURRET_BLOCK', null, null, null, null, null, null, null],
        // Single turret — right
        [null, null, null, null, null, null, null, 'TURRET_BLOCK', null, null],
        // Breather rows (3 — weighted to space out action)
        [null, null, null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null, null, null],
      ];
      const pool = recentWindmill ? quietLayouts : [...windmillLayouts, ...quietLayouts];
      const layout = pool[Math.floor(Math.random() * pool.length)];
      for (let i = 0; i < 10; i++) {
        const slotType = layout[i];
        if (!slotType) continue;
        blocks.current.push({
          id: Date.now() + i,
          // WINDMILL is always placed at the exact canvas centre regardless of slot index
          x: slotType === 'WINDMILL' ? CANVAS_WIDTH / 2 - blockWidth / 2 : i * blockWidth,
          y: rowY,
          width: blockWidth,
          height: blockHeight,
          type: slotType,
          hp: slotType === 'TURRET_BLOCK' ? 5 : 999,
          maxHp: slotType === 'TURRET_BLOCK' ? 5 : 999,
          color: slotType === 'WINDMILL' ? '#00ffaa' : slotType === 'TURRET_BLOCK' ? '#ff9900' : '#1a1a2e',
          lastShotTime: 0,
        });
      }
      return;
    } else if (currentStage === 5) {
      // Final Front: low density — the stage challenge comes from the boss and enemy fire,
      // not from wall density. Keep paths readable at all times.
      wallDensity = 0.04;
      destructibleDensity = 0.08;
      tentacleChance = 0; // No tentacles — too much at once with boss fight
    } else if (currentStage === 4) {
      // Stage 4 "Chase": canyon corridor patterns.
      // Fixed BEAM_TURRETs (edge slots 0/9) are bolted to canyon walls.
      // Mobile BEAM_TURRETs (middle slots) slide horizontally on rails laid across the row's walls.
      const layouts: (null | 'WALL' | 'BUILDING' | 'BEAM_TURRET')[][] = [
        ['WALL', 'WALL', null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null, 'WALL', 'WALL'],
        [null, null, null, 'WALL', 'WALL', 'WALL', 'WALL', null, null, null],
        ['WALL', 'WALL', null, null, 'WALL', 'WALL', null, null, 'WALL', 'WALL'],
        [null, 'BUILDING', 'BUILDING', 'BUILDING', 'BUILDING', 'BUILDING', 'BUILDING', 'BUILDING', 'BUILDING', null],
        ['WALL', null, null, null, null, null, null, null, null, 'WALL'],
        ['BEAM_TURRET', null, null, null, null, null, null, null, null, 'BEAM_TURRET'],
        ['BEAM_TURRET', 'WALL', null, null, null, null, null, null, 'WALL', 'BEAM_TURRET'],
        ['WALL', null, null, null, 'BEAM_TURRET', null, null, null, null, 'WALL'],
        ['WALL', null, 'BUILDING', null, 'BEAM_TURRET', null, 'BUILDING', null, null, 'WALL'],
        ['WALL', null, null, 'BEAM_TURRET', null, null, 'BEAM_TURRET', null, null, 'WALL'],
        [null, null, null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null, null, null],
      ];
      const layout = layouts[Math.floor(Math.random() * layouts.length)];
      for (let i = 0; i < 10; i++) {
        const slotType = layout[i];
        if (!slotType) continue;
        // Mobile: BEAM_TURRET in non-edge slots slides on rail between nearest walls
        const isMobile = slotType === 'BEAM_TURRET' && i > 0 && i < 9;
        let trackLeft: number | undefined;
        let trackRight: number | undefined;
        if (isMobile) {
          let tL = 0;
          for (let li = i - 1; li >= 0; li--) {
            if (layout[li] === 'WALL') { tL = (li + 1) * blockWidth; break; }
          }
          let tR = CANVAS_WIDTH;
          for (let ri = i + 1; ri < 10; ri++) {
            if (layout[ri] === 'WALL') { tR = ri * blockWidth; break; }
          }
          trackLeft = tL;
          trackRight = tR - blockWidth;
        }
        blocks.current.push({
          id: Date.now() + i,
          x: i * blockWidth,
          // Mobile turret spawns one block-height above the wall row so it sits on top
          y: isMobile ? rowY - blockHeight : rowY,
          width: blockWidth,
          height: blockHeight,
          type: slotType,
          hp: slotType === 'WALL' ? 999 : slotType === 'BEAM_TURRET' ? 50 : 10,
          maxHp: slotType === 'WALL' ? 999 : slotType === 'BEAM_TURRET' ? 50 : 10,
          color: slotType === 'WALL' ? '#1a1a2e' : slotType === 'BEAM_TURRET' ? '#00ffdd' : '#33ccff',
          lastShotTime: 0,
          vx: isMobile ? (Math.random() < 0.5 ? 0.5 : -0.5) : undefined,
          trackLeft,
          trackRight,
          haltUntil: 0,
        });
      }
      return;
    }

    for (let i = 0; i < 10; i++) {
      const rand = Math.random();
      if (rand < wallDensity) {
        // Indestructible Wall
        blocks.current.push({
          id: Date.now() + i,
          x: i * blockWidth,
          y: rowY,
          width: blockWidth,
          height: blockHeight,
          type: 'WALL',
          hp: 999,
          maxHp: 999,
          color: '#1a1a2e'
        });
      } else if (rand < wallDensity + destructibleDensity) {
        // Destructible Block
        const isCore = Math.random() < 0.1;
        blocks.current.push({
          id: Date.now() + i,
          x: i * blockWidth,
          y: rowY,
          width: blockWidth,
          height: blockHeight,
          type: isCore ? 'PILLAR' : 'BUILDING', // Using PILLAR as Core
          hp: isCore ? 1 : 10,
          maxHp: isCore ? 1 : 10,
          color: isCore ? '#ff3366' : '#33ccff'
        });
      } else if (rand < wallDensity + destructibleDensity + tentacleChance) {
        // Tentacle (R-Type style)
        const segments = [];
        for (let j = 0; j < 8; j++) {
          segments.push({ x: 0, y: j * 20, angle: 0 });
        }
        blocks.current.push({
          id: Date.now() + i,
          x: i * blockWidth + blockWidth / 2,
          y: rowY,
          width: 40,
          height: 160,
          type: 'TENTACLE',
          hp: 30,
          maxHp: 30,
          color: '#ff3366',
          segments: segments,
          baseX: i * blockWidth + blockWidth / 2
        });
      }
    }
  };

  const triggerChainExplosion = (source: Obstacle) => {
    audio.playExplosion(source.x);
    createExplosion(source.x + source.width / 2, source.y + source.height / 2, source.color, 40);
    setScore(s => s + 500);

    // Find adjacent destructible blocks
    blocks.current.forEach(block => {
      if (block.hp > 0 && block.type !== 'WALL') {
        const dx = Math.abs(block.x - source.x);
        const dy = Math.abs(block.y - source.y);
        if (dx <= source.width + 5 && dy <= source.height + 5) {
          // Chain reaction delay
          setTimeout(() => {
            if (block.hp > 0) {
              block.hp = 0;
              triggerChainExplosion(block);
            }
          }, 100);
        }
      }
    });
  };

  const getInputDebugSnapshot = () => ({
    mouse: isMouseDown.current ? 1 : 0,
    touch: isTouching.current ? 1 : 0,
    touchPointCount: Object.keys(touchPoints.current).length,
    virtual: isVirtualDragActive.current ? 1 : 0,
    sling: isSlingshotMode.current ? 1 : 0,
    charged: isSlingshotCharged.current ? 1 : 0,
    armed: slingshotArmed.current ? 1 : 0,
    anchor: mouseAnchorPos.current ? 1 : 0,
    idleMs: lastInputActivityAt.current > 0 ? Math.max(0, Date.now() - lastInputActivityAt.current) : -1,
  });

  const logInputDebug = (event: string, details: Record<string, unknown> = {}) => {
    if (!inputDebugLogEnabledRef.current) return;

    const now = Date.now();
    if (event === 'state-change' && now - lastInputDebugLogAtRef.current < INPUT_DEBUG_MIN_LOG_INTERVAL_MS) {
      return;
    }

    const snapshot = getInputDebugSnapshot();
    console.info('[NEON][InputDebug]', {
      event,
      ts: new Date(now).toISOString(),
      gameState,
      wave: waveRef.current,
      stage: getStageFromWave(waveRef.current),
      ...snapshot,
      ...details,
    });

    if (event === 'state-change') {
      lastInputDebugLogAtRef.current = now;
    }
  };

  const logTouchDebug = (event: string, touchCount: number, details: Record<string, unknown> = {}) => {
    if (!inputDebugLogEnabledRef.current) return;

    const now = Date.now();
    const snapshot = getInputDebugSnapshot();
    console.info('[NEON][TouchDebug]', {
      event,
      ts: new Date(now).toISOString(),
      touchCount,
      gameState,
      wave: waveRef.current,
      stage: getStageFromWave(waveRef.current),
      ...snapshot,
      ...details,
    });
    lastInputDebugLogAtRef.current = now;
  };

  const startGame = () => {
    audio.init();
    audio.playBGM(1);
    resetInputGestureState();
    setScore(0);
    setWave(1);
    setSectorName(getStageLabelFromWave(1));
    setScrapCount(0);
    setLevel(1);
    setXp(0);
    setXpToNextLevel(100);
    setRelics([]);
    relicsRef.current = [];
    levelRef.current = 1;
    xpRef.current = 0;
    xpToNextLevelRef.current = 200;
    setXpToNextLevel(200);
    setShowUpgrade(false);
    setBossHealth(null);
    firepowerRef.current = 1;
    speedRef.current = 1;
    magnetRef.current = 1;
    critChanceRef.current = 0;
    regenRef.current = 0;
    chainLightningRef.current = 0;
    drones.current = [];
    damageNumbers.current = [];
    integrityRef.current = 100;
    setIntegrity(100);
    waveRef.current = 1;
    victoryPendingRef.current = false;
    pendingLevelUpRef.current = 0;
    setHasWingman(false);
    wingmanRef.current = false;
    isHackedRef.current = false;
    hasFollowerRef.current = false;
    tailSegments.current = [];
    followerHistory.current = [];
    invulnerableUntil.current = 0;
    slingshotGuardUntil.current = 0;
    slingshotGuardCooldownUntil.current = 0;
    slingshotShieldAngle.current = -Math.PI / 2;
    slingshotShieldRadius.current = 56;
    slingshotShieldObstacleRecoilAt.current = 0;
    slingshotObstacleKickAt.current = 0;
    playerPos.current = { x: CANVAS_WIDTH / 2 - PLAYER_WIDTH / 2, y: CANVAS_HEIGHT - 80 };
    targetPos.current = { x: CANVAS_WIDTH / 2 - PLAYER_WIDTH / 2, y: CANVAS_HEIGHT - 80 };
    for (const b of bullets.current) b.alive = false;
    for (const b of enemyBullets.current) b.alive = false;
    particles.current = [];
    trails.current = [];
    powerUps.current = [];
    lastRepairDropAt.current = 0;
    repairDropsDuringBossRef.current = 0;
    for (const s of scraps.current) s.alive = false;
    asteroids.current = [];
    blocks.current = [];
    obstacles.current = [];
    lastObstacleTime.current = 0;
    survivalTimerRef.current = 30;
    setSurvivalTime(30);
    shake.current = 0;
    flash.current = 0;
    initEnemies(1);
    waveHasBossRef.current = enemies.current.some(e => e.alive && e.isBoss);
    wavePeakAliveRef.current = Math.max(1, enemies.current.filter(e => e.alive).length);
    setStageProgress(0);
    lastInputDebugSnapshotRef.current = '';
    logInputDebug('game-start', {
      source: 'startGame',
      userAgent: navigator.userAgent,
    });
    // Reset session stats
    shotsFiredRef.current = 0;
    shotsHitRef.current = 0;
    hitsTakenRef.current = 0;
    maxComboRef.current = 0;
    grazeCount.current = 0;
    gameSessionStartRef.current = Date.now();
    gameOverStatsRef.current = null;
    setVictoryStats(null);
    audio.playStageStart();
    setGameState('PLAYING');
  };

  useEffect(() => {
    inputDebugLogEnabledRef.current = debugMode;
    if (debugMode) {
      console.info('[NEON][debug] enabled. Disable by removing ?debug=1 from URL.');
      logInputDebug('logging-enabled', { source: 'query' });
    }
  }, []);

  // Input handling
  useEffect(() => {
    const markInputActivity = () => {
      lastInputActivityAt.current = Date.now();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyS', 'KeyA', 'KeyD'].includes(e.code)) {
        e.preventDefault();
      }
      keysPressed.current[e.code] = true;

      // Dev-only god mode toggle
      if (debugMode && !e.repeat && e.code === 'KeyG') {
        const next = !godModeRef.current;
        godModeRef.current = next;
        setGodMode(next);
        if (next) {
          integrityRef.current = 100;
          setIntegrity(100);
        }
      }

      // Debug: Alt+1…5  →  jump to the first wave of that stage
      if (debugMode && !e.repeat && e.altKey &&
          ['Digit1','Digit2','Digit3','Digit4','Digit5'].includes(e.code)) {
        e.preventDefault();
        const stageNum = parseInt(e.code.replace('Digit', ''));
        // startNextWave does waveRef.current += 1, so prime it one below the target.
        waveRef.current = (stageNum - 1) * 2; // wave 1,3,5,7,9 for stages 1-5
        startNextWave();
      }

      // Debug: Alt+6  →  jump directly to VICTORY (ending) for testing
      if (debugMode && !e.repeat && e.altKey && e.code === 'Digit6') {
        e.preventDefault();
        audio.stopBGM();
        victoryPendingRef.current = true;
        setBossHealth(null);
        for (const b of bullets.current) b.alive = false;
        for (const b of enemyBullets.current) b.alive = false;
        setVictoryStats({
          survivalMs: Date.now() - gameSessionStartRef.current,
          shotsFired: shotsFiredRef.current,
          shotsHit: shotsHitRef.current,
          hitsTaken: hitsTakenRef.current,
          maxCombo: maxComboRef.current,
          grazes: grazeCount.current,
        });
        setGameState('VICTORY');
      }

      // Tab: open/close wall mode wheel
      if (e.code === 'Tab') {
        e.preventDefault();
        if (gameState !== 'PLAYING') return;
        isWheelOpenRef.current ? closeWheel() : openWheel();
        return;
      }

      // Allow Ctrl to trigger Slingshot Mode during an active drag
      if (!e.repeat && (e.code === 'ControlLeft' || e.code === 'ControlRight') && isMouseDown.current && !isSlingshotMode.current) {
        markInputActivity();
        beginDesktopSlingshot(physicalMousePos.current.x, physicalMousePos.current.y, false);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyS', 'KeyA', 'KeyD'].includes(e.code)) {
        e.preventDefault();
      }
      keysPressed.current[e.code] = false;
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (gameState !== 'PLAYING' || showUpgrade) return;
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      markInputActivity();
      logInputDebug('pointer-down', {
        pointerType: e.pointerType,
        button: e.button,
        buttons: e.buttons,
        ctrl: e.ctrlKey ? 1 : 0,
      });

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      canvasScaleRef.current = rect.height / CANVAS_HEIGHT;
      const x = ((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
      const y = ((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;
      currentMousePos.current = { x, y };

      const now = Date.now();
      const ctrlPressed = e.ctrlKey || keysPressed.current['ControlLeft'] || keysPressed.current['ControlRight'];

      if (pointerTapTimer.current !== null) {
        window.clearTimeout(pointerTapTimer.current);
      }

      // Some macOS multi-finger gestures emit pointerdown but swallow mousedown.
      // If that happens, promote this into a short-lived virtual drag so movement remains responsive.
      pointerTapTimer.current = window.setTimeout(() => {
        pointerTapTimer.current = null;
        if (isMouseDown.current || isTouching.current || showUpgrade || gameState !== 'PLAYING') return;
        if (slingshotPhantomGuardUntil.current > Date.now()) {
          currentMousePos.current = { x, y };
          return;
        }

        isMouseDown.current = true;
        isVirtualDragActive.current = true;
        playerStartPos.current = { x: playerPos.current.x, y: playerPos.current.y };
        mouseAnchorPos.current = { x, y };
        inputHistory.current = [{ x, y, t: now }];

        if (ctrlPressed) {
          beginDesktopSlingshot(x, y, false);
        } else {
          isSlingshotMode.current = false;
          isSlingshotCharged.current = false;
        }

        logInputDebug('pointer-virtual-drag-start', {
          pointerType: e.pointerType,
          x: Math.round(x),
          y: Math.round(y),
          slingshot: isSlingshotMode.current ? 1 : 0,
        });
      }, 24);
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (gameState !== 'PLAYING' || showUpgrade) return;
      e.preventDefault();
      markInputActivity();
      if (idleFireTimer.current !== null) {
        window.clearTimeout(idleFireTimer.current);
        idleFireTimer.current = null;
      }

      const touchCount = e.touches.length;
      logTouchDebug('touchstart', touchCount, {
        totalTouches: e.touches.length,
        changedCount: e.changedTouches.length,
      });

      const now = Date.now();
      const isDoubleTap = now - lastTapTime.current < TOUCH_DOUBLE_TAP_WINDOW_MS;
      lastTapTime.current = now;
      const isArmed = slingshotArmed.current && now < slingshotArmedExpiry.current;

      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        touchPoints.current[touch.identifier] = { x: touch.clientX, y: touch.clientY };
      }

      // Two-finger tap for Overdrive
      if (e.touches.length >= 2) {
        if (overdriveGauge.current >= MAX_OVERDRIVE && !isOverdriveActiveRef.current) {
          activateOverdrive();
        }
      }

      const touch = e.touches[0];
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        canvasScaleRef.current = rect.height / CANVAS_HEIGHT;
        const x = ((touch.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
        const y = ((touch.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;
        touchStartPos.current = { x, y };
        currentMousePos.current = { x, y };
        // If armed or double tap, enter Slingshot Mode
        if (isArmed || isDoubleTap) {
          slingshotArmed.current = false;
          slingshotArmedPos.current = null;
          isSlingshotMode.current = true;
          mouseAnchorPos.current = { x, y }; // Use touch point as visual anchor
          playerStartPos.current = { x: playerPos.current.x, y: playerPos.current.y };
          audio.playSlingshot?.(); // Small feedback sound
          shake.current = Math.max(shake.current, 5); // Stronger initial shake
          createExplosion(x, y, '#00ffcc', 20); // Bigger visual ping

          // Brief time slow/freeze for tactile feedback
          timeScale.current = 0.2;
          setTimeout(() => { if (!isOverdriveActiveRef.current) timeScale.current = 1.0; }, 100);
        } else {
          isSlingshotMode.current = false;
          playerStartPos.current = { x: playerPos.current.x, y: playerPos.current.y };
        }
        inputHistory.current = [{ x, y, t: Date.now() }];
      }

      isTouching.current = true;
      keysPressed.current['TouchFire'] = true;
    };

    const clearVirtualDragReleaseTimer = () => {
      if (virtualDragReleaseTimer.current !== null) {
        window.clearTimeout(virtualDragReleaseTimer.current);
        virtualDragReleaseTimer.current = null;
      }
    };

    const armSlingshotAtCurrentPos = () => {
      slingshotArmed.current = true;
      slingshotArmedExpiry.current = Date.now() + 2500;
      slingshotArmedPos.current = { x: currentMousePos.current.x, y: currentMousePos.current.y };
      isSlingshotMode.current = false;
    };

    const scheduleVirtualDragRelease = () => {
      clearVirtualDragReleaseTimer();
      // Short timer: covers the case where mouseup is not fired by OS (Mac 3-finger drag)
      // 40ms is nearly imperceptible but prevents false-release during fast movement
      virtualDragReleaseTimer.current = window.setTimeout(() => {
        if (!isVirtualDragActive.current) return;

        if (isSlingshotMode.current) {
          if (isSlingshotCharged.current) {
            handleSlingshot();
            slingshotArmed.current = false;
            slingshotArmedPos.current = null;
          } else {
            isSlingshotMode.current = false;
            isSlingshotCharged.current = false;
          }
        }

        isVirtualDragActive.current = false;
        isMouseDown.current = false;
        mouseAnchorPos.current = null;
      }, 40);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isTouching.current || showUpgrade) return;
      e.preventDefault();
      markInputActivity();

      const touch = e.touches[0];
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        canvasScaleRef.current = rect.height / CANVAS_HEIGHT;
        const x = ((touch.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
        const y = ((touch.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;

        // Debug: log multi-touch warnings
        if (e.touches.length > 1 && !inputDebugLogEnabledRef.current) {
          // Silently track for anomaly detection
        } else if (e.touches.length > 1) {
          logTouchDebug('touchmove-multitouch', e.touches.length, {
            primaryX: Math.round(x),
            primaryY: Math.round(y),
            targetX: Math.round(targetPos.current.x),
            targetY: Math.round(targetPos.current.y),
          });
        }

        // Track input velocity with smoothing
        const now = Date.now();
        inputHistory.current.push({ x, y, t: now });
        if (inputHistory.current.length > 5) inputHistory.current.shift();

        if (inputHistory.current.length >= 2) {
          const first = inputHistory.current[0];
          const last = inputHistory.current[inputHistory.current.length - 1];
          const dt = (last.t - first.t) / 1000;
          if (dt > 0) {
            const nextVelocityX = (last.x - first.x) / dt;
            const nextVelocityY = (last.y - first.y) / dt;
            inputVel.current.x = (inputVel.current.x * TOUCH_INPUT_VELOCITY_SMOOTHING) + (nextVelocityX * (1 - TOUCH_INPUT_VELOCITY_SMOOTHING));
            inputVel.current.y = (inputVel.current.y * TOUCH_INPUT_VELOCITY_SMOOTHING) + (nextVelocityY * (1 - TOUCH_INPUT_VELOCITY_SMOOTHING));
          }
        }

        currentMousePos.current = { x, y };

        // Match web behavior on mobile: once a charged slingshot drag stops moving,
        // fire it without waiting for touchend so guard cannot be held indefinitely.
        if (isTouching.current && isSlingshotMode.current && isSlingshotCharged.current) {
          if (idleFireTimer.current !== null) {
            window.clearTimeout(idleFireTimer.current);
          }
          idleFireTimer.current = window.setTimeout(() => {
            if (isTouching.current && isSlingshotMode.current && isSlingshotCharged.current) {
              handleSlingshot();
              slingshotArmed.current = false;
              slingshotArmedPos.current = null;
              isTouching.current = false;
              keysPressed.current['TouchFire'] = false;
              mouseAnchorPos.current = null;
            }
            idleFireTimer.current = null;
          }, 80);
        } else if (idleFireTimer.current !== null) {
          window.clearTimeout(idleFireTimer.current);
          idleFireTimer.current = null;
        }

        if (isSlingshotMode.current && mouseAnchorPos.current) {
          // SLINGSHOT MODE: Rubber band logic
          const rawDx = (x - mouseAnchorPos.current.x);
          const rawDy = (y - mouseAnchorPos.current.y);
          const curvedDisplacement = getCurvedSlingshotDisplacement(rawDx, rawDy, TOUCH_SLINGSHOT_RESISTANCE);
          const dist = curvedDisplacement.dist;

          if (dist > TOUCH_SLINGSHOT_CHARGE_DEADZONE) {
            isSlingshotCharged.current = true;
          }

          if (dist <= SLINGSHOT_DEFENSE_ONLY_MAX_PULL) {
            targetPos.current.x = playerStartPos.current.x;
            targetPos.current.y = playerStartPos.current.y;
          } else {
            targetPos.current.x = Math.max(0, Math.min(CANVAS_WIDTH - PLAYER_WIDTH, playerStartPos.current.x + curvedDisplacement.dx));
            targetPos.current.y = Math.max(0, Math.min(CANVAS_HEIGHT - PLAYER_HEIGHT, playerStartPos.current.y + curvedDisplacement.dy));
          }
        } else {
          // PRECISION MODE: 1:1 Movement
          const rawDx = (x - touchStartPos.current.x);
          const rawDy = (y - touchStartPos.current.y);
          targetPos.current.x = Math.max(0, Math.min(CANVAS_WIDTH - PLAYER_WIDTH, playerStartPos.current.x + rawDx));
          targetPos.current.y = Math.max(0, Math.min(CANVAS_HEIGHT - PLAYER_HEIGHT, playerStartPos.current.y + rawDy));
        }
      }
    };

    const handleSlingshot = () => {
      releaseSlingshotPointerLock();
      const anchor = mouseAnchorPos.current || (isTouching.current ? { x: touchStartPos.current.x, y: touchStartPos.current.y } : null);
      if (!anchor) {
        isSlingshotMode.current = false;
        isSlingshotCharged.current = false;
        return;
      }

      const centerX = playerPos.current.x + PLAYER_WIDTH / 2;
      const centerY = playerPos.current.y + PLAYER_HEIGHT / 2;

      const homeX = playerStartPos.current.x + PLAYER_WIDTH / 2;
      const homeY = playerStartPos.current.y + PLAYER_HEIGHT / 2;

      // Physical direction for the snap
      const dx = homeX - centerX;
      const dy = homeY - centerY;
      const physicalDist = Math.sqrt(dx * dx + dy * dy);

      // Virtual Tension
      const inputDx = anchor.x - currentMousePos.current.x;
      const inputDy = anchor.y - currentMousePos.current.y;
      const inputDist = Math.sqrt(inputDx * inputDx + inputDy * inputDy);

      // CANCEL CHECK: If released very close to anchor, don't fire
      if (inputDist < 25) {
        logInputDebug('slingshot-cancel', {
          inputDist: Math.round(inputDist),
        });
        slingshotTravelUntil.current = 0;
        slingshotLandingTarget.current = null;
        isSlingshotCharged.current = false;
        isSlingshotMode.current = false;
        return;
      }

      const dist = Math.max(physicalDist, inputDist);
      const mag = Math.sqrt(inputDx * inputDx + inputDy * inputDy) || 1;
      const dirX = inputDx / mag;
      const dirY = inputDy / mag;
      slingshotShieldAngle.current = Math.atan2(dirY, dirX);
      slingshotShieldRadius.current = Math.min(SLINGSHOT_SHIELD_MAX_RADIUS, (SLINGSHOT_SHIELD_MIN_RADIUS * 2 + inputDist * 0.9) * 0.5);

      // Flick Detection
      const inputSpeed = Math.sqrt(inputVel.current.x ** 2 + inputVel.current.y ** 2);
      const isFlick = inputSpeed > 400;
      const isDefenseOnlyRelease = isSlingshotCharged.current
        && inputDist <= SLINGSHOT_DEFENSE_ONLY_MAX_PULL;

      // If not charged or not in slingshot mode, just settle
      if (!isSlingshotCharged.current || !isSlingshotMode.current) {
        isSnapping.current = 0;
        slingshotTravelUntil.current = 0;
        slingshotLandingTarget.current = null;
        isSlingshotCharged.current = false;
        isSlingshotMode.current = false;
        return;
      }

      const tryActivateSlingshotGuard = (durationMs: number) => {
        const now = Date.now();
        if (now < slingshotGuardCooldownUntil.current) return;
        slingshotGuardUntil.current = Math.max(slingshotGuardUntil.current, now + durationMs);
        slingshotGuardCooldownUntil.current = now + SLINGSHOT_GUARD_COOLDOWN_MS;
      };

      if (isDefenseOnlyRelease) {
        logInputDebug('slingshot-defense-release', {
          inputDist: Math.round(inputDist),
        });
        playerVel.current.x = 0;
        playerVel.current.y = 0;
        slingshotTravelUntil.current = 0;
        slingshotLandingTarget.current = null;
        targetPos.current.x = playerPos.current.x;
        targetPos.current.y = playerPos.current.y;
        isSnapping.current = 0;
        tryActivateSlingshotGuard(SLINGSHOT_DEFENSE_ONLY_GUARD_MS);
        createExplosion(centerX, centerY, '#00ffcc', isMobile ? 2 : 4);
        shake.current = Math.max(shake.current, 1.5);
        audio.playSlingshot?.();
        inputVel.current = { x: 0, y: 0 };
        inputHistory.current = [];
        isSlingshotCharged.current = false;
        isSlingshotMode.current = false;
        return;
      }

      // Defense and attack are mutually exclusive: block attack while guard is active.
      // Player must let the guard window expire before firing.
      if (slingshotGuardUntil.current > Date.now()) {
        isSlingshotCharged.current = false;
        isSlingshotMode.current = false;
        return;
      }

      // Deterministic landing: snap destination is fixed on the threshold ring.
      // This makes the stop point predictable while dragging.
      const landingDistance = getSlingshotLandingDistance(dist);
      const landingCenterX = homeX + dirX * landingDistance;
      const landingCenterY = homeY + dirY * landingDistance;
      targetPos.current = {
        x: Math.max(0, Math.min(CANVAS_WIDTH - PLAYER_WIDTH, landingCenterX - PLAYER_WIDTH / 2)),
        y: Math.max(CANVAS_HEIGHT * 0.1, Math.min(CANVAS_HEIGHT - PLAYER_HEIGHT, landingCenterY - PLAYER_HEIGHT / 2))
      };

      // 1. DEADZONE / ADJUSTMENT MODE (Small pull)
      if (dist < SLINGSHOT_ATTACK_PREVIEW_THRESHOLD) {
        slingshotTravelUntil.current = 0;
        slingshotLandingTarget.current = null;
        if (isMobile) {
          if (dist > 20) {
            const pullRatio = Math.min(dist / (SLINGSHOT_THRESHOLD + 30), 1);
            const baseSpeed = 8 + pullRatio * 12;
            const flickBoost = isFlick ? Math.min((inputSpeed - 400) / 1600, 0.4) : 0;
            const speed = baseSpeed * (1 + flickBoost);
            // Keep launch direction tied to slingshot direction; flick only boosts speed.
            playerVel.current.x = dirX * speed;
            playerVel.current.y = dirY * speed;

            createExplosion(centerX, centerY, '#00ffcc', isMobile ? 3 : 6);
            shake.current = Math.max(shake.current, 2);
            audio.playSlingshot?.();
            isSnapping.current = 8;
            tryActivateSlingshotGuard(SLINGSHOT_GUARD_SMALL_MS);
          }
        } else {
          if (isFlick && dist > 20) {
            const flickPower = Math.min(inputSpeed / 1000, 2.0);
            const speed = 25 + flickPower * 40;
            playerVel.current.x = dirX * speed;
            playerVel.current.y = dirY * speed;

            createExplosion(centerX, centerY, '#00ffcc', isMobile ? 3 : 6);
            shake.current = Math.max(shake.current, 2);
            audio.playSlingshot?.();
            isSnapping.current = 15;
            tryActivateSlingshotGuard(SLINGSHOT_GUARD_SMALL_MS);
          } else if (dist > 50) {
            const speed = 15 + (dist / SLINGSHOT_THRESHOLD) * 25;
            playerVel.current.x = dirX * speed;
            playerVel.current.y = dirY * speed;
            audio.playSlingshot?.();
            isSnapping.current = 10;
            tryActivateSlingshotGuard(SLINGSHOT_GUARD_SMALL_MS);
          }
        }
      }
      // 2. ATTACK MODE (Large pull)
      else if (dist >= SLINGSHOT_ATTACK_PREVIEW_THRESHOLD) {
        slingshotLandingTarget.current = {
          x: targetPos.current.x,
          y: targetPos.current.y,
        };
        const attackDist = dist - SLINGSHOT_ATTACK_PREVIEW_THRESHOLD;
        const tensionRatio = Math.min(attackDist / 350, 3.5);
        const totalPower = Math.pow(tensionRatio, 1.7);

        const baseSnapSpeed = isMobile ? 14 : 45;
        const speed = isMobile
          ? Math.min(46, baseSnapSpeed + (totalPower * 24))
          : baseSnapSpeed + (totalPower * 85);

        // Combine with flick if in similar direction
        let finalVelX = dirX * speed;
        let finalVelY = dirY * speed;

        if (isFlick) {
          const dot = (dirX * inputVel.current.x + dirY * inputVel.current.y) / inputSpeed;
          if (dot > 0.5) { // Flicking in the same direction as snap
            finalVelX += (inputVel.current.x / inputSpeed) * (speed * 0.3);
            finalVelY += (inputVel.current.y / inputSpeed) * (speed * 0.3);
          }
        }

        playerVel.current.x = finalVelX;
        playerVel.current.y = finalVelY;

        logInputDebug('slingshot-attack-release', {
          pullDist: Math.round(dist),
          inputSpeed: Math.round(inputSpeed),
          power: Number(totalPower.toFixed(2)),
          speed: Math.round(Math.sqrt(finalVelX * finalVelX + finalVelY * finalVelY)),
        });

        const attackDuration = 500 + (totalPower * 700);
        slingshotAttackUntil.current = Date.now() + attackDuration;
        slingshotTravelUntil.current = Date.now() + (isMobile ? (230 + totalPower * 120) : attackDuration);
        slingshotPhantomGuardUntil.current = Date.now() + 400;
        invulnerableUntil.current = Date.now() + (attackDuration * 0.7);
        tryActivateSlingshotGuard(SLINGSHOT_GUARD_LARGE_MS);

        shake.current = Math.max(shake.current, 6 + totalPower * 15);

        // Set trajectory visual
        slingshotTrajectory.current = {
          x1: playerPos.current.x + PLAYER_WIDTH / 2,
          y1: playerPos.current.y + PLAYER_HEIGHT / 2,
          x2: playerPos.current.x + PLAYER_WIDTH / 2 + dirX * 500,
          y2: playerPos.current.y + PLAYER_HEIGHT / 2 + dirY * 500,
          alpha: 1.0
        };
        flash.current = totalPower > 0.8 ? 0.15 : 0;

        audio.playSlingshot?.();
        if (totalPower > 0.5) audio.playOverdrive?.();

        isSnapping.current = isMobile ? 12 : 20; // Longer snap phase for big attacks

        const shockwaveRadius = 150 + (totalPower * 200);
        enemyBullets.current.forEach(b => {
          if (!b.alive) return;
          const bdx = b.x - centerX;
          const bdy = b.y - centerY;
          if (Math.sqrt(bdx*bdx + bdy*bdy) < shockwaveRadius) {
            b.alive = false;
            if (!isMobile) createExplosion(b.x, b.y, '#ffffff', 3);
          }
        });

        const trailCount = Math.floor(isMobile ? 2 : 4 + totalPower * 5);
        for (let i = 0; i < trailCount; i++) {
          setTimeout(() => {
            createExplosion(playerPos.current.x + PLAYER_WIDTH/2, playerPos.current.y + PLAYER_HEIGHT/2, '#00ffcc', isMobile ? 4 : 15);
          }, i * 20);
        }
      }

      inputVel.current = { x: 0, y: 0 };
      inputHistory.current = [];
      isSlingshotCharged.current = false;
      isSlingshotMode.current = false; // Reset mode after fire
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const remainingTouchCount = e.touches.length;
      logTouchDebug('touchend', remainingTouchCount, {
        changedCount: e.changedTouches.length,
        isTouchingNow: isTouching.current,
      });

      markInputActivity();
      if (idleFireTimer.current !== null) {
        window.clearTimeout(idleFireTimer.current);
        idleFireTimer.current = null;
      }
      if (isTouching.current) {
        if (isSlingshotMode.current && !isSlingshotCharged.current) {
          // Double-tap released before drag: keep a short armed window for the next touch-drag.
          armSlingshotAtCurrentPos();
        } else {
          handleSlingshot();
          slingshotArmed.current = false;
          slingshotArmedPos.current = null;
        }
      }
      for (let i = 0; i < e.changedTouches.length; i++) {
        delete touchPoints.current[e.changedTouches[i].identifier];
      }
      if (e.touches.length === 0) {
        isTouching.current = false;
        keysPressed.current['TouchFire'] = false;
        logTouchDebug('touchend-all-released', 0, {
          isTouchingAfter: isTouching.current,
        });
      } else {
        // Multi-touch: some fingers still down
        logTouchDebug('touchend-partial', e.touches.length, {
          remainingFingers: e.touches.length,
        });
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (gameState !== 'PLAYING' || showUpgrade) return;
      markInputActivity();
      if (pointerTapTimer.current !== null) {
        window.clearTimeout(pointerTapTimer.current);
        pointerTapTimer.current = null;
      }
      logInputDebug('mouse-down', {
        button: e.button,
        buttons: e.buttons,
        ctrl: e.ctrlKey ? 1 : 0,
      });
      isVirtualDragActive.current = false;
      clearVirtualDragReleaseTimer();

      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        canvasScaleRef.current = rect.height / CANVAS_HEIGHT;
        const now = Date.now();
        const isRightClick = e.button === 2 || (e.button === 0 && e.ctrlKey);

        // If already dragging and right-click/ctrl-click, force slingshot mode
        if (isMouseDown.current && isRightClick) {
          const x = ((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
          const y = ((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;
          physicalMousePos.current = { x, y };
          beginDesktopSlingshot(x, y, true);
          return;
        }

        // Block the phantom mousedown macOS sends ~192ms after slingshot fires.
        // Use slingshotPhantomGuardUntil (400ms) rather than the full attack
        // window so legitimate new drags after 400ms are not blocked.
        if (slingshotPhantomGuardUntil.current > now) {
          const x = ((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
          const y = ((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;
          currentMousePos.current = { x, y };
          return;
        }

        isMouseDown.current = true;
        const x = ((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
        const y = ((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;

        currentMousePos.current = { x, y };
        physicalMousePos.current = { x, y };
        playerStartPos.current = { x: playerPos.current.x, y: playerPos.current.y };
        inputHistory.current = [{ x, y, t: now }];

        // Armed state: double-tap on trackpad sets armed, next mousedown triggers slingshot
        const isArmed = slingshotArmed.current && now < slingshotArmedExpiry.current;
        if (isArmed) {
          slingshotArmed.current = false;
          slingshotArmedPos.current = null;
          beginDesktopSlingshot(x, y, true);
        } else if (isRightClick) {
          beginDesktopSlingshot(x, y, true);
        } else {
          isSlingshotMode.current = false;
          mouseAnchorPos.current = { x, y }; // Still need anchor for relative movement
        }
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (gameState !== 'PLAYING' || showUpgrade) return;
      markInputActivity();

      // Web/trackpad safety: if mousedown is swallowed but a drag is in progress,
      // synthesize drag start from the first move packet that reports button state.
      if (!isMouseDown.current && !isTouching.current && (e.buttons & 1) === 1) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          canvasScaleRef.current = rect.height / CANVAS_HEIGHT;
          const x = ((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
          const y = ((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;
          const now = Date.now();

          // If slingshot is currently in-flight OR idle-fire just discharged (<500ms ago),
          // only track cursor position — re-enabling drag would synthesize a false anchor
          // that freezes the ship (anchor=cursor → targetPos=playerPos).
          // Roll lastIdleFireAt while attack is still active so the 500ms grace window
          // starts from attack-end, not from idle-fire time (covers long-pull attacks).
          if (slingshotTravelUntil.current > now || slingshotAttackUntil.current > now || now - lastIdleFireAt.current < 500) {
            currentMousePos.current = { x, y };
            if (slingshotAttackUntil.current > now) lastIdleFireAt.current = now;
          } else {
            isMouseDown.current = true;
            isVirtualDragActive.current = false;
            clearVirtualDragReleaseTimer();
            currentMousePos.current = { x, y };
            mouseAnchorPos.current = { x, y };
            playerStartPos.current = { x: playerPos.current.x, y: playerPos.current.y };
            inputHistory.current = [{ x, y, t: now }];

            const ctrlHeld = e.ctrlKey || keysPressed.current['ControlLeft'] || keysPressed.current['ControlRight'];
            isSlingshotMode.current = ctrlHeld;
            isSlingshotCharged.current = false;
            if (ctrlHeld) {
              audio.playSlingshot?.();
              shake.current = Math.max(shake.current, 5);
              createExplosion(x, y, '#00ffcc', 20);
              timeScale.current = 0.2;
              setTimeout(() => { if (!isOverdriveActiveRef.current) timeScale.current = 1.0; }, 100);
            }

            logInputDebug('mouse-down-missed-detected', {
              buttons: e.buttons,
              ctrl: ctrlHeld ? 1 : 0,
              x: Math.round(x),
              y: Math.round(y),
            });
          }
        }
      }

      // Web/trackpad safety: if mouseup was swallowed by gesture handling,
      // force-release stale drag state when no button is currently pressed.
      if (isMouseDown.current && !isVirtualDragActive.current && e.buttons === 0 && !isTouching.current) {
        logInputDebug('mouse-up-missed-detected', {
          buttons: e.buttons,
          x: Math.round(e.clientX),
          y: Math.round(e.clientY),
        });
        handleMouseUp();
      }

      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        canvasScaleRef.current = rect.height / CANVAS_HEIGHT;
        const x = ((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
        const y = ((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;
        const previousPhysical = { ...physicalMousePos.current };
        physicalMousePos.current = { x, y };

        let effectiveX = x;
        let effectiveY = y;

        if (isMouseDown.current && isSlingshotMode.current && mouseAnchorPos.current && !isTouching.current) {
          const deltaX = document.pointerLockElement === canvasRef.current
            ? (e.movementX / rect.width) * CANVAS_WIDTH
            : x - previousPhysical.x;
          const deltaY = document.pointerLockElement === canvasRef.current
            ? (e.movementY / rect.height) * CANVAS_HEIGHT
            : y - previousPhysical.y;

          currentMousePos.current = {
            x: Math.max(0, Math.min(CANVAS_WIDTH, currentMousePos.current.x + deltaX)),
            y: Math.max(0, Math.min(CANVAS_HEIGHT, currentMousePos.current.y + deltaY)),
          };
          effectiveX = currentMousePos.current.x;
          effectiveY = currentMousePos.current.y;
        } else {
          currentMousePos.current = { x, y };
        }

        // Track velocity for flick detection (same as touch)
        const now = Date.now();
        inputHistory.current.push({ x: effectiveX, y: effectiveY, t: now });
        if (inputHistory.current.length > 5) inputHistory.current.shift();
        if (inputHistory.current.length >= 2) {
          const first = inputHistory.current[0];
          const last = inputHistory.current[inputHistory.current.length - 1];
          const dt = (last.t - first.t) / 1000;
          if (dt > 0) {
            inputVel.current.x = (last.x - first.x) / dt;
            inputVel.current.y = (last.y - first.y) / dt;
          }
        }

        if (isVirtualDragActive.current) {
          scheduleVirtualDragRelease();
        }

        // Idle-fire: macOS 3-finger drag delays mouseup by ~1s, so fire when mousemove stops.
        // 80ms gives a brief "release" feel before firing — not instant, but not sluggish.
        if (isMouseDown.current && isSlingshotMode.current && isSlingshotCharged.current) {
          if (idleFireTimer.current !== null) window.clearTimeout(idleFireTimer.current);
          idleFireTimer.current = window.setTimeout(() => {
            if (isMouseDown.current && isSlingshotMode.current && isSlingshotCharged.current) {
              handleSlingshot();
              slingshotArmed.current = false;
              slingshotArmedPos.current = null;
              isVirtualDragActive.current = false;
              isMouseDown.current = false;
              mouseAnchorPos.current = null;
              lastIdleFireAt.current = Date.now();
            }
            idleFireTimer.current = null;
          }, 80);
        }

        if (isMouseDown.current && mouseAnchorPos.current) {
          // If the player starts a normal drag right after slingshot, prioritize control feel.
          if (!isSlingshotMode.current && isSnapping.current > 0) {
            isSnapping.current = 0;
            playerVel.current.x = 0;
            playerVel.current.y = 0;
          }

          if (isSlingshotMode.current) {
            const rawDx = (effectiveX - mouseAnchorPos.current.x);
            const rawDy = (effectiveY - mouseAnchorPos.current.y);
            const curvedDisplacement = getCurvedSlingshotDisplacement(rawDx, rawDy, 0.25);
            const dist = curvedDisplacement.dist;

            if (dist > 22) isSlingshotCharged.current = true;

            if (dist <= SLINGSHOT_DEFENSE_ONLY_MAX_PULL) {
              targetPos.current.x = playerStartPos.current.x;
              targetPos.current.y = playerStartPos.current.y;
            } else {
              targetPos.current.x = Math.max(0, Math.min(CANVAS_WIDTH - PLAYER_WIDTH, playerStartPos.current.x + curvedDisplacement.dx));
              targetPos.current.y = Math.max(0, Math.min(CANVAS_HEIGHT - PLAYER_HEIGHT, playerStartPos.current.y + curvedDisplacement.dy));
            }
          } else {
            const rawDx = (effectiveX - mouseAnchorPos.current.x);
            const rawDy = (effectiveY - mouseAnchorPos.current.y);
            targetPos.current.x = Math.max(0, Math.min(CANVAS_WIDTH - PLAYER_WIDTH, playerStartPos.current.x + rawDx));
            targetPos.current.y = Math.max(0, Math.min(CANVAS_HEIGHT - PLAYER_HEIGHT, playerStartPos.current.y + rawDy));
          }
        }
      }
    };

    const handleMouseUp = () => {
      markInputActivity();

      // Avoid duplicate mouseup handling when release was already synthesized.
      if (!isMouseDown.current && !isVirtualDragActive.current) {
        return;
      }

      if (pointerTapTimer.current !== null) {
        window.clearTimeout(pointerTapTimer.current);
        pointerTapTimer.current = null;
      }

      logInputDebug('mouse-up', {
        virtual: isVirtualDragActive.current ? 1 : 0,
        slingshot: isSlingshotMode.current ? 1 : 0,
        charged: isSlingshotCharged.current ? 1 : 0,
      });
      releaseSlingshotPointerLock();
      isVirtualDragActive.current = false;
      clearVirtualDragReleaseTimer();
      if (idleFireTimer.current !== null) { window.clearTimeout(idleFireTimer.current); idleFireTimer.current = null; }
      if (isMouseDown.current) {
        if (isSlingshotMode.current && isSlingshotCharged.current) {
          // Charged: fire immediately, matching mobile touchend behavior (zero delay)
          handleSlingshot();
          slingshotArmed.current = false;
          slingshotArmedPos.current = null;
        } else if (isSlingshotMode.current && !isSlingshotCharged.current) {
          // Ctrl slingshot not charged enough: cancel without re-arming.
          isSlingshotMode.current = false;
          isSlingshotCharged.current = false;
          slingshotArmed.current = false;
          slingshotArmedPos.current = null;
        } else {
          // Normal precision drag released
          handleSlingshot();
          slingshotArmed.current = false;
          slingshotArmedPos.current = null;
        }
      }
      isMouseDown.current = false;
      mouseAnchorPos.current = null;
    };

    const handleBlur = () => {
      markInputActivity();
      if (pointerTapTimer.current !== null) {
        window.clearTimeout(pointerTapTimer.current);
        pointerTapTimer.current = null;
      }
      clearVirtualDragReleaseTimer();
      if (idleFireTimer.current !== null) { window.clearTimeout(idleFireTimer.current); idleFireTimer.current = null; }
      isVirtualDragActive.current = false;
      isMouseDown.current = false;
      isTouching.current = false;
      isSlingshotMode.current = false;
      isSlingshotCharged.current = false;
      slingshotArmed.current = false;
      slingshotArmedPos.current = null;
      mouseAnchorPos.current = null;
      keysPressed.current = {};
    };

    const unbindInputListeners = bindInputListeners({
      onKeyDown: handleKeyDown,
      onKeyUp: handleKeyUp,
      onPointerDown: handlePointerDown,
      onMouseDown: handleMouseDown,
      onMouseMove: handleMouseMove,
      onMouseUp: handleMouseUp,
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      onBlur: handleBlur,
    });

    return () => {
      unbindInputListeners();
      clearVirtualDragReleaseTimer();
      if (idleFireTimer.current !== null) { window.clearTimeout(idleFireTimer.current); idleFireTimer.current = null; }
    };
  }, [gameState, showUpgrade]);

    const handleGraze = (x: number, y: number) => {
      const now = Date.now();
      if (now - lastGrazeAt.current < 50) return; // Throttle independent of frame rate
      lastGrazeAt.current = now;
      audio.playGraze();
      grazeCount.current++;
      setScore(s => s + 10);

    // Brief slow motion effect (resets after 150ms, matching other hit-stop patterns)
    timeScale.current = 0.8;
    setTimeout(() => { if (!isOverdriveActiveRef.current) timeScale.current = 1.0; }, 150);

    // Spark particles
    for (let i = 0; i < 2; i++) {
      particles.current.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 5,
        vy: (Math.random() - 0.5) * 5,
        life: 10,
        maxLife: 10,
        color: '#ffffff',
        size: 1,
        type: 'line'
      });
    }
  };

  const activateOverdrive = () => {
    overdriveGauge.current = 0;
    setOverdrive(0);
    odReadyRef.current = false;
    isOverdriveActiveRef.current = true;
    setIsOverdriveActive(true);
    const hasFrenzy = relicsRef.current.some(r => r.id === 'FRENZY');
    const duration = hasFrenzy ? 9000 : 6000; // Base 6s; FRENZY extends to 9s (+50%)
    overdriveEndTime.current = Date.now() + duration;
    shake.current = 30;
    flash.current = 0.5;
    audio.playOverdrive();

    // Tactical benefit: Grant temporary shield on activation
    activeEffects.current['SHIELD'] = Math.max(activeEffects.current['SHIELD'] || 0, Date.now() + 3000);
  };

  const openWheel = useCallback(() => {
    if (isWheelOpenRef.current) return;
    isWheelOpenRef.current = true;
    pauseStartTime.current = Date.now();
    setIsWheelOpen(true);
  }, []);

  const closeWheel = useCallback(() => {
    if (!isWheelOpenRef.current) return;
    if (isOverdriveActiveRef.current && pauseStartTime.current > 0) {
      overdriveEndTime.current += (Date.now() - pauseStartTime.current);
    }
    pauseStartTime.current = 0;
    isWheelOpenRef.current = false;
    setIsWheelOpen(false);
  }, []);

  // Confetti burst — callback ref, fires when the canvas mounts (VICTORY screen)
  const confettiCallback = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = canvas.offsetWidth || window.innerWidth;
    canvas.height = canvas.offsetHeight || window.innerHeight;
    const W = canvas.width;
    const H = canvas.height;
    const colors = ['#00ffcc', '#ff00c8', '#ffcc00', '#00ff85', '#ff6633', '#66aaff', '#ffffff'];
    // Shape types: 0=rect, 1=circle, 2=diamond
    const particles = Array.from({ length: 110 }, (_, i) => ({
      x: Math.random() * W,
      y: -20 - Math.random() * 120,                 // start above screen
      vx: (Math.random() - 0.5) * 5,
      vy: 2.5 + Math.random() * 4.5,                // fall downward
      color: colors[i % colors.length],
      alpha: 0.85 + Math.random() * 0.15,
      size: 6 + Math.random() * 8,
      rot: Math.random() * Math.PI * 2,
      rotV: (Math.random() - 0.5) * 0.18,
      shape: i % 3,                                  // 0=rect 1=circle 2=diamond
      sway: Math.random() * Math.PI * 2,             // phase for horizontal sway
      swaySpeed: 0.03 + Math.random() * 0.03,
    }));
    // Also add 24 upward-burst particles from center-bottom (celebration pop)
    const centerX = W / 2;
    const centerY = H * 0.45;
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      const speed = 5 + Math.random() * 8;
      particles.push({
        x: centerX + (Math.random() - 0.5) * 40,
        y: centerY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 4,
        color: colors[i % colors.length],
        alpha: 1,
        size: 5 + Math.random() * 6,
        rot: Math.random() * Math.PI * 2,
        rotV: (Math.random() - 0.5) * 0.25,
        shape: i % 3,
        sway: 0,
        swaySpeed: 0,
      });
    }
    let frame = 0;
    let rafId: number;
    function draw() {
      ctx!.clearRect(0, 0, W, H);
      let anyAlive = false;
      for (const p of particles) {
        if (p.alpha <= 0) continue;
        p.x += p.vx + Math.sin(p.sway) * 0.8;
        p.y += p.vy;
        p.vy += 0.12;                           // gravity
        p.vx *= 0.995;
        p.rot += p.rotV;
        p.sway += p.swaySpeed;
        if (frame > 90) p.alpha = Math.max(0, p.alpha - 0.012);
        if (p.y > H + 20) p.alpha = 0;
        if (p.alpha <= 0) continue;
        anyAlive = true;
        ctx!.save();
        ctx!.globalAlpha = p.alpha;
        ctx!.fillStyle = p.color;
        ctx!.shadowColor = p.color;
        ctx!.shadowBlur = 10;
        ctx!.translate(p.x, p.y);
        ctx!.rotate(p.rot);
        if (p.shape === 0) {
          ctx!.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else if (p.shape === 1) {
          ctx!.beginPath();
          ctx!.arc(0, 0, p.size / 2.5, 0, Math.PI * 2);
          ctx!.fill();
        } else {
          ctx!.beginPath();
          ctx!.moveTo(0, -p.size / 2);
          ctx!.lineTo(p.size / 2.5, 0);
          ctx!.lineTo(0, p.size / 2);
          ctx!.lineTo(-p.size / 2.5, 0);
          ctx!.closePath();
          ctx!.fill();
        }
        ctx!.restore();
      }
      frame++;
      if (anyAlive) rafId = requestAnimationFrame(draw);
    }
    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Game Loop
  const update = () => {
    // Hit stop logic
    const now = Date.now();
    if (now < hitStopTimer.current) return;

    const dt = dtRef.current;
    const simulationTier = simulationLoadTierRef.current;
    const isReducedSim = simulationTier >= 1;
    const isCriticalSim = simulationTier >= 2;

    // Cache frequently used .current arrays for performance
    const enemiesArr = enemies.current;
    const bulletsArr = bullets.current;
    const enemyBulletsArr = enemyBullets.current;
    const blocksArr = blocks.current;
    const asteroidsArr = asteroids.current;
    const particlesArr = particles.current;
    const powerUpsArr = powerUps.current;
    const scrapsArr = scraps.current;
    const dronesArr = drones.current;
    const trailsArr = trails.current;
    const damageNumbersArr = damageNumbers.current;
    // Suppress hitstop entirely while a boss is alive — prevents laser beam stutter
    // caused by bullets hitting non-boss enemies (e.g. SWARM) during the boss wave.
    const bossAlive = enemiesArr.some(e => e.alive && e.isBoss);

    // Warp logic should run even if not in PLAYING state (e.g. STAGE_CLEAR)
    if (isWarping.current) {
      const elapsed = Date.now() - warpStartTime.current;
      if (elapsed < 1400) {
        const t = Math.min(1, elapsed / 1400);
        // Quadratic easing in - starts slow, then accelerates
        warpFactor.current = t * t;
        glitch.current = Math.max(glitch.current, warpFactor.current * 10);
        shake.current = Math.max(shake.current, warpFactor.current * 3);
      } else {
        warpFactor.current = Math.max(0, warpFactor.current - 0.05 * dt);
      }
    } else {
      warpFactor.current = Math.max(0, warpFactor.current - 0.05 * dt);
    }

    // Decay effects - Move BEFORE early return so they don't get stuck
    if (glitch.current > 0) glitch.current *= (1 - 0.1 * dt);
    if (shake.current > 0) shake.current *= (1 - 0.15 * dt);
    if (shake.current < 0.5) shake.current = 0;
    if (flash.current > 0) flash.current -= 0.04 * dt;
    if (flash.current < 0) flash.current = 0;

    const currentStage = getStageFromWave(waveRef.current);

    // Update trippy intensity
    const isBossActive = enemies.current.some(e => e.isBoss && e.alive);
    pulseRef.current = audio.getPulse();
    const targetTrippy = (isBossActive ? 0.25 : 0) + (currentStage >= 4 ? 0.2 : 0);
    trippyIntensity.current += (targetTrippy - trippyIntensity.current) * 0.05 * dt;
    // Add beat pulse to trippy intensity
    const effectiveTrippy = trippyIntensity.current + pulseRef.current * 0.15 * trippyIntensity.current;

    if (gameState !== 'PLAYING' || showUpgrade || isWheelOpenRef.current) return;

    // Cache relic lookups — avoids O(n × relics) cost inside enemy/bullet loops
    const hasEMP        = relicsRef.current.some(r => r.id === 'EMP');
    const hasChrono     = relicsRef.current.some(r => r.id === 'CHRONO');
    const hasFrenzy     = relicsRef.current.some(r => r.id === 'FRENZY');
    const hasShieldRegen = relicsRef.current.some(r => r.id === 'SHIELD_REGEN');

    // Input watchdog: recover from macOS gesture paths that leave drag flags stuck.
    const watchdogNow = now;
    if (lastInputActivityAt.current > 0) {
      const idleMs = watchdogNow - lastInputActivityAt.current;
      const staleVirtualDrag = isVirtualDragActive.current && idleMs > INPUT_WATCHDOG_RELEASE_MS;
      const staleMouseDrag = isMouseDown.current && !isTouching.current && idleMs > INPUT_WATCHDOG_HARD_RELEASE_MS;
      if (staleVirtualDrag || staleMouseDrag) {
        isVirtualDragActive.current = false;
        isMouseDown.current = false;
        isTouching.current = false;
        isSlingshotMode.current = false;
        isSlingshotCharged.current = false;
        mouseAnchorPos.current = null;
        keysPressed.current['TouchFire'] = false;
        inputVel.current = { x: 0, y: 0 };
        inputHistory.current = [];
        logInputDebug('watchdog-reset', {
          idleMs,
          staleVirtualDrag,
          staleMouseDrag,
        });
      }
    }

    const inputSnapshotKey = [
      isMouseDown.current ? 1 : 0,
      isTouching.current ? 1 : 0,
      isVirtualDragActive.current ? 1 : 0,
      isSlingshotMode.current ? 1 : 0,
      isSlingshotCharged.current ? 1 : 0,
      slingshotArmed.current ? 1 : 0,
      mouseAnchorPos.current ? 1 : 0,
    ].join('|');
    if (inputSnapshotKey !== lastInputDebugSnapshotRef.current) {
      lastInputDebugSnapshotRef.current = inputSnapshotKey;
      logInputDebug('state-change');
    }

    // Keep object counts within a soft budget when frame time worsens.
    // Mobile caps are tighter to match MAX_ENEMY_BULLETS / MAX_PARTICLES constants.
    const particleCap = isMobile
      ? (isCriticalSim ? 80  : isReducedSim ? 120 : 150)
      : (isCriticalSim ? 520 : isReducedSim ? 760 : 1000);
    if (particles.current.length > particleCap) {
      particles.current.splice(0, particles.current.length - particleCap);
    }

    const isAsteroidBelt = currentStage === 2;
    const isFinalFront = currentStage === 5;
    const stageFlowScale = isAsteroidBelt ? (isMobile ? 0.82 : 0.9) : 1;
    const worldSpeedScale = timeScale.current * stageFlowScale;

    // Apply slow-mo recovery
    if (timeScale.current < 1.0 && !isOverdriveActiveRef.current) {
      timeScale.current = Math.min(1.0, timeScale.current + 0.005 * dt);
    }

    // Overdrive Tactical Slow-mo: Enemies move slower while player is in Overdrive
    if (isOverdriveActiveRef.current) {
      timeScale.current = 0.6;
    }

    // SHIELD_REGEN: auto-recharge shield every 20s when consumed
    if (hasShieldRegen) {
      const shieldNow = Date.now();
      const shieldActive = activeEffects.current['SHIELD'] > shieldNow;
      if (!shieldActive) {
        if (!activeEffects.current['SHIELD_RECHARGE']) {
          activeEffects.current['SHIELD_RECHARGE'] = shieldNow + 20000;
        } else if (shieldNow > activeEffects.current['SHIELD_RECHARGE']) {
          activeEffects.current['SHIELD'] = shieldNow + 10000;
          activeEffects.current['SHIELD_RECHARGE'] = 0;
        }
      } else {
        activeEffects.current['SHIELD_RECHARGE'] = 0;
      }
    }

    // Spawn Asteroids
    if ((isAsteroidBelt || isFinalFront) && !isWarping.current) {
      const spawnRate = isAsteroidBelt ? (isMobile ? 0.006 : 0.014) : (isMobile ? 0.008 : 0.02);
      const maxAsteroids = isAsteroidBelt ? (isMobile ? 8 : 12) : (isMobile ? 12 : 20);
      if (asteroids.current.length < maxAsteroids && Math.random() < spawnRate) {
        const rawSize = 30 + Math.random() * 60;
        const sizeScale = isAsteroidBelt ? (isMobile ? 0.72 : 0.86) : 1;
        const size = Math.max(22, rawSize * sizeScale);
        const vertexCount = isMobile ? 5 : 8;
        const vertices = [];
        for (let i = 0; i < vertexCount; i++) {
          vertices.push(0.8 + Math.random() * 0.4);
        }
        const baseSpeed = 2 + Math.random() * 3;
        let spawnX: number, spawnY: number, spawnDx: number, spawnSpeed: number;
        if (isAsteroidBelt) {
          const edge = Math.floor(Math.random() * 3); // 0=top, 1=left, 2=right
          if (edge === 1) {
            spawnX = -100; spawnY = Math.random() * CANVAS_HEIGHT;
            spawnDx = baseSpeed; spawnSpeed = (Math.random() - 0.5) * 2;
          } else if (edge === 2) {
            spawnX = CANVAS_WIDTH + 100; spawnY = Math.random() * CANVAS_HEIGHT;
            spawnDx = -baseSpeed; spawnSpeed = (Math.random() - 0.5) * 2;
          } else {
            spawnX = Math.random() * CANVAS_WIDTH; spawnY = -100;
            spawnDx = (Math.random() - 0.5) * 3; spawnSpeed = baseSpeed;
          }
        } else {
          spawnX = Math.random() * CANVAS_WIDTH; spawnY = -100;
          spawnDx = 0; spawnSpeed = baseSpeed;
        }
        const pcx = playerPos.current.x + PLAYER_WIDTH / 2;
        const pcy = playerPos.current.y + PLAYER_HEIGHT / 2;
        const spawnDist = Math.sqrt((spawnX - pcx) ** 2 + (spawnY - pcy) ** 2);
        if (spawnDist >= 200) {
          asteroids.current.push({
            x: spawnX,
            y: spawnY,
            dx: spawnDx,
            vx: 0,
            vy: 0,
            size,
            speed: spawnSpeed,
            rotation: Math.random() * Math.PI * 2,
            vr: (Math.random() - 0.5) * 0.05,
            hp: Math.floor(size / 10),
            vertices
          });
        }
      }
    }

    // Wingman Logic
    if (wingmanRef.current) {
      const wingmanTargetX = playerPos.current.x + 50;
      const wingmanTargetY = playerPos.current.y + 10;

      // Smooth follow
      const wdx = wingmanTargetX - wingmanPos.current.x;
      const wdy = wingmanTargetY - wingmanPos.current.y;
      wingmanPos.current.x += wdx * 0.1 * dt;
      wingmanPos.current.y += wdy * 0.1 * dt;

      // Wingman firing — uses its own timer so it fires at 150ms regardless of player fire rate
      if (gameState === 'PLAYING') {
        const wingmanNow = Date.now();
        const wingmanFireInterval = isOverdriveActiveRef.current ? 75 : 150;
        if (wingmanNow - wingmanLastShotTime.current > wingmanFireInterval) {
          wingmanLastShotTime.current = wingmanNow;
          spawnBullet(bullets.current, {
            x: wingmanPos.current.x + PLAYER_WIDTH / 2 - 2,
            y: wingmanPos.current.y,
            vx: 0, vy: -10, damage: firepowerRef.current, color: '#ff33cc'
          });
        }
      }

      // Wingman collision with enemy bullets
      for (let _wi = 0; _wi < enemyBullets.current.length; _wi++) {
        const bullet = enemyBullets.current[_wi];
        if (!bullet.alive) continue;
        if (!wingmanRef.current) break;
        const dx = bullet.x - (wingmanPos.current.x + PLAYER_WIDTH / 2);
        const dy = bullet.y - (wingmanPos.current.y + PLAYER_HEIGHT / 2);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 15) {
          bullet.alive = false;
          createExplosion(wingmanPos.current.x + PLAYER_WIDTH / 2, wingmanPos.current.y + PLAYER_HEIGHT / 2, '#ff33cc', 30);
          audio.playExplosion(wingmanPos.current.x);
          setHasWingman(false);
          wingmanRef.current = false;
        }
      }

      // Wingman collision with enemies
      if (wingmanRef.current) {
        enemies.current.forEach((enemy) => {
          if (!wingmanRef.current) return;
          if (enemy.alive &&
              enemy.x < wingmanPos.current.x + PLAYER_WIDTH &&
              enemy.x + enemy.width > wingmanPos.current.x &&
              enemy.y < wingmanPos.current.y + PLAYER_HEIGHT &&
              enemy.y + enemy.height > wingmanPos.current.y) {
            createExplosion(wingmanPos.current.x + PLAYER_WIDTH / 2, wingmanPos.current.y + PLAYER_HEIGHT / 2, '#ff33cc', 30);
            audio.playExplosion(wingmanPos.current.x);
            setHasWingman(false);
            wingmanRef.current = false;
            // Also damage the enemy slightly
            enemy.health! -= 50;
            if (enemy.health! <= 0) {
              enemy.alive = false;
              createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#ff3366', 50);
            }
          }
        });
      }
    }

    // Player movement with Lerp
    const speedMultiplier = 1 + (speedRef.current - 1) * 0.15;
    const currentSpeed = (isOverdriveActiveRef.current ? PLAYER_SPEED * 1.5 : PLAYER_SPEED) * speedMultiplier * dt;

    // Relative Movement Input
    let moveX = 0;
    let moveY = 0;

    if (keysPressed.current['ArrowLeft'] || keysPressed.current['KeyA']) moveX -= 1;
    if (keysPressed.current['ArrowRight'] || keysPressed.current['KeyD']) moveX += 1;
    if (keysPressed.current['ArrowUp'] || keysPressed.current['KeyW']) moveY -= 1;
    if (keysPressed.current['ArrowDown'] || keysPressed.current['KeyS']) moveY += 1;

    if (moveX !== 0 || moveY !== 0) {
      const mag = Math.sqrt(moveX * moveX + moveY * moveY);
      targetPos.current.x = Math.max(0, Math.min(CANVAS_WIDTH - PLAYER_WIDTH, targetPos.current.x + (moveX / mag) * currentSpeed));
      targetPos.current.y = Math.max(CANVAS_HEIGHT * 0.2, Math.min(CANVAS_HEIGHT - PLAYER_HEIGHT - 20, targetPos.current.y + (moveY / mag) * currentSpeed));
    }

    // Hacked Jitter
    if (isHackedRef.current) {
      targetPos.current.x += (Math.random() - 0.5) * 15 * dt;
      targetPos.current.y += (Math.random() - 0.5) * 15 * dt;
    }

    // Update Slingshot Trails
    if (Date.now() < slingshotAttackUntil.current) {
      slingshotTrails.current.push({
        x: playerPos.current.x + PLAYER_WIDTH / 2,
        y: playerPos.current.y + PLAYER_HEIGHT / 2,
        alpha: 1.0
      });
    }
    slingshotTrails.current = slingshotTrails.current
      .map(t => ({ ...t, alpha: t.alpha - 0.15 }))
      .filter(t => t.alpha > 0);

    // Update Slingshot Trajectory
    if (slingshotTrajectory.current) {
      slingshotTrajectory.current.alpha -= 0.05;
      if (slingshotTrajectory.current.alpha <= 0) slingshotTrajectory.current = null;
    }

    // --- Player Movement Logic (Simplified) ---

    // Snapshot position before any movement this frame (used for swept collision detection)
    prevPlayerPos.current.x = playerPos.current.x;
    prevPlayerPos.current.y = playerPos.current.y;

    const isDragging = isMouseDown.current || isTouching.current;

    // 1. DAMPING & FRICTION (Only for Slingshot Snap)
    if (isSnapping.current > 0) {
      playerVel.current.x *= 0.98;
      playerVel.current.y *= 0.98;
      isSnapping.current--;
      // When snapping ends and no finger is down, sync targetPos to current position
      // so the precision lerp doesn't pull the ship back toward the fire-time target.
      if (isMobile && isSnapping.current === 0 && !isDragging) {
        const isLargePullAttack = Date.now() < slingshotAttackUntil.current;
        if (!isLargePullAttack) {
          targetPos.current = { x: playerPos.current.x, y: playerPos.current.y };
        }
      }
    } else {
      // Very high friction for precision mode to feel responsive
      playerVel.current.x *= 0.85;
      playerVel.current.y *= 0.85;
    }

    // 2. TARGET FOLLOWING (Precision Mode)
    if (!isSlingshotMode.current && isSnapping.current <= 0) {
      // Smoothed follow in precision mode to feel more physical and less "teleporty"
      // Guard: skip while isSnapping so slingshot velocity isn't zeroed immediately after firing.
      const remainingAttackMs = slingshotAttackUntil.current - Date.now();
      const remainingTravelMs = slingshotTravelUntil.current - Date.now();
      const landingTarget = slingshotLandingTarget.current;
      const isLargePullAttack = isMobile && landingTarget && remainingTravelMs > 0;
      if (isLargePullAttack) {
        const dx = landingTarget.x - playerPos.current.x;
        const dy = landingTarget.y - playerPos.current.y;
        const frameMs = dt * (1000 / 60);
        const progress = Math.min(1, frameMs / Math.max(16, remainingTravelMs));
        playerPos.current.x += dx * progress;
        playerPos.current.y += dy * progress;

        if (progress >= 1 || (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5)) {
          playerPos.current.x = landingTarget.x;
          playerPos.current.y = landingTarget.y;
          slingshotTravelUntil.current = 0;
          slingshotLandingTarget.current = null;
        }
      } else {
        if (landingTarget && remainingTravelMs <= 0) {
          playerPos.current.x = landingTarget.x;
          playerPos.current.y = landingTarget.y;
          slingshotTravelUntil.current = 0;
          slingshotLandingTarget.current = null;
        }
        const dx = targetPos.current.x - playerPos.current.x;
        const dy = targetPos.current.y - playerPos.current.y;
        const followDist = Math.sqrt(dx * dx + dy * dy);
        let lerpFactor = PRECISION_FOLLOW_BASE_LERP;

        if (isDragging) {
          lerpFactor = PRECISION_FOLLOW_DRAG_LERP;
        }
        if (followDist > 18) {
          lerpFactor = Math.max(lerpFactor, PRECISION_FOLLOW_CATCHUP_LERP);
        }
        if (followDist > 72) {
          lerpFactor = PRECISION_FOLLOW_MAX_LERP;
        }
        lerpFactor *= dt;

        playerPos.current.x += (targetPos.current.x - playerPos.current.x) * lerpFactor;
        playerPos.current.y += (targetPos.current.y - playerPos.current.y) * lerpFactor;
      }
      if (isDragging) {
        playerVel.current = { x: 0, y: 0 };
      } else {
        // Keep a short, cheap post-slingshot coast so the ship eases into a stop.
        const speed = Math.sqrt(playerVel.current.x * playerVel.current.x + playerVel.current.y * playerVel.current.y);
        if (speed <= PRECISION_COAST_STOP_SPEED) {
          playerVel.current = { x: 0, y: 0 };
        } else {
          playerVel.current.x *= PRECISION_COAST_DAMPING;
          playerVel.current.y *= PRECISION_COAST_DAMPING;
        }
      }
    } else if (isSlingshotMode.current && !isDragging) {
      // Active slingshot drag released but mode still active: pull toward targetPos
      const dx = targetPos.current.x - playerPos.current.x;
      const dy = targetPos.current.y - playerPos.current.y;
      playerVel.current.x += dx * 0.4 * dt;
      playerVel.current.y += dy * 0.4 * dt;
    }
    // else: isSnapping > 0 after firing — velocity coasts freely, no targetPos attraction

    // 3. APPLY VELOCITY
    playerPos.current.x += playerVel.current.x * dt;
    playerPos.current.y += playerVel.current.y * dt;

    // 4. WALL COLLISION (Simple)
    if (playerPos.current.x < 0) {
      playerPos.current.x = 0;
      playerVel.current.x = 0;
    } else if (playerPos.current.x > CANVAS_WIDTH - PLAYER_WIDTH) {
      playerPos.current.x = CANVAS_WIDTH - PLAYER_WIDTH;
      playerVel.current.x = 0;
    }

    if (playerPos.current.y < 0) {
      playerPos.current.y = 0;
      playerVel.current.y = 0;
    } else if (playerPos.current.y > CANVAS_HEIGHT - PLAYER_HEIGHT) {
      playerPos.current.y = CANVAS_HEIGHT - PLAYER_HEIGHT;
      playerVel.current.y = 0;
    }

    // Update tilt based on horizontal velocity or snap direction
    const pullX = isMouseDown.current || isTouching.current ? (currentMousePos.current.x - (mouseAnchorPos.current?.x || touchStartPos.current.x)) : 0;
    let targetTilt = (playerVel.current.x * 0.05) + (pullX * 0.001);
    if (isSnapping.current > 0) {
      // During snap, point nose towards velocity vector
      targetTilt = Math.atan2(playerVel.current.x, -playerVel.current.y) * 0.5;
    }
    playerTilt.current += (targetTilt - playerTilt.current) * 0.15 * dt;

    // Overdrive Ramming Logic
    if (isOverdriveActiveRef.current) {
      const ramRect = {
        x: playerPos.current.x,
        y: playerPos.current.y,
        w: PLAYER_WIDTH,
        h: PLAYER_HEIGHT
      };

      enemies.current.forEach(enemy => {
        if (enemy.alive &&
            ramRect.x < enemy.x + enemy.width &&
            ramRect.x + ramRect.w > enemy.x &&
            ramRect.y < enemy.y + enemy.height &&
            ramRect.y + ramRect.h > enemy.y) {
          enemy.health = 0;
          enemy.alive = false;
          // Bigger explosion during Overdrive
          const explosionSize = isOverdriveActiveRef.current ? 60 : 30;
          createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#ff3366', explosionSize);
          setScore(s => s + 500);
          audio.playExplosion(enemy.x);

          // Drop scrap during ramming
          const scrapCount = isOverdriveActiveRef.current ? 5 : 1;
          for (let i = 0; i < scrapCount; i++) {
            spawnScrap(scraps.current, {
              x: enemy.x + enemy.width / 2,
              y: enemy.y + enemy.height / 2,
              vx: (Math.random() - 0.5) * 8,
              vy: (Math.random() - 0.5) * 8,
              life: 1
            });
          }
        }
      });

      blocks.current.forEach(block => {
        if (block.hp > 0 &&
            ramRect.x < block.x + block.width &&
            ramRect.x + ramRect.w > block.x &&
            ramRect.y < block.y + block.height &&
            ramRect.y + ramRect.h > block.y) {
          if (block.type !== 'WALL') {
            block.hp = 0;
            triggerChainExplosion(block);
          }
        }
      });
    }

    const isMoving = Math.abs(targetPos.current.x - playerPos.current.x) > 0.1 || Math.abs(targetPos.current.y - playerPos.current.y) > 0.1;

    // Add trail
    const trailNow = Date.now();
    if (isMoving && trailNow - lastTrailSpawnAt.current > VFX_TRAIL_SPAWN_INTERVAL_MS && trails.current.length < MAX_TRAILS) {
      lastTrailSpawnAt.current = trailNow;
      trails.current.push({
        x: playerPos.current.x + PLAYER_WIDTH / 2,
        y: playerPos.current.y + PLAYER_HEIGHT / 2,
        life: 15,
        maxLife: 15,
        color: '#00ffcc',
        width: PLAYER_WIDTH * 0.6
      });
    }

    // Update trails
    const trailList = trails.current;
    for (let i = trailList.length - 1; i >= 0; i--) {
      trailList[i].life -= 1 * dt;
      if (trailList[i].life <= 0) {
        trailList.splice(i, 1);
      }
    }

    // Update Power-ups
    const powerUpList = powerUps.current;
    for (let i = powerUpList.length - 1; i >= 0; i--) {
      const p = powerUpList[i];
      p.y += 1.5 * dt;

      // Collision with player
      const dx = (playerPos.current.x + PLAYER_WIDTH / 2) - p.x;
      const dy = (playerPos.current.y + PLAYER_HEIGHT / 2) - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 30) {
        if (p.type === 'REPAIR') {
          integrityRef.current = Math.min(100, integrityRef.current + REPAIR_POWERUP_HEAL);
          setIntegrity(integrityRef.current);
        } else {
          activeEffects.current[p.type] = Date.now() + 8000; // 8 seconds
        }
        p.life = 0;
        audio.playPowerUp?.(); // Optional sound
        setScore(s => s + 500);
      }

      if (p.y >= CANVAS_HEIGHT || p.life <= 0) {
        powerUpList.splice(i, 1);
      }
    }

    // Update Scraps
    const sList = scraps.current;
    const magnetRangeSq = (() => { const r = 150 + (magnetRef.current - 1) * 60; return r * r; })();
    const magnetPullStrength = (0.5 + (magnetRef.current - 1) * 0.2) * dt;
    for (let i = 0; i < sList.length; i++) {
      const s = sList[i];
      if (!s.alive) continue;
      const dx = (playerPos.current.x + PLAYER_WIDTH / 2) - s.x;
      const dy = (playerPos.current.y + PLAYER_HEIGHT / 2) - s.y;
      const distSq = dx * dx + dy * dy;

      // At critical sim tier, skip magnet pull — player can still collect by proximity
      if (!isCriticalSim && distSq < magnetRangeSq) {
        // Magnet effect — only compute sqrt when inside range
        const dist = Math.sqrt(distSq);
        s.vx += (dx / dist) * magnetPullStrength;
        s.vy += (dy / dist) * magnetPullStrength;
      }

      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const sFric = 1 - 0.05 * dt; s.vx *= sFric; s.vy *= sFric;
      s.y += 1 * dt; // Drift down

      if (distSq < 30 * 30) {
        handleScrapCollection(s);
        s.life = 0;
      }

      if (s.y >= CANVAS_HEIGHT || s.life <= 0) {
        s.alive = false;
      }
    }

    // Update Damage Numbers
    damageNumbers.current.forEach(dn => dn.life -= 1);
    damageNumbers.current = damageNumbers.current.filter(dn => dn.life > 0);

    // Update Drones
    drones.current.forEach(drone => {
      drone.angle += 0.05;
      const now = Date.now();
      if (now - drone.lastShot > 500) {
        drone.lastShot = now;
        const dx = playerPos.current.x + PLAYER_WIDTH / 2 + Math.cos(drone.angle) * drone.distance;
        const dy = playerPos.current.y + PLAYER_HEIGHT / 2 + Math.sin(drone.angle) * drone.distance;
        spawnBullet(bullets.current, {
          x: dx,
          y: dy,
          vx: 0,
          vy: -12,
          damage: firepowerRef.current * 0.5,
          size: 3
        });
        audio.playShoot(dx);
      }
    });

    // Nano-Repair (Regen)
    if (regenRef.current > 0 && integrityRef.current < 100) {
      integrityRef.current = Math.min(100, integrityRef.current + (regenRef.current * 0.01));
      setIntegrity(integrityRef.current);
    }

    const frameNow = Date.now();
    const shieldState = getSlingshotShieldState(frameNow);
    const playerCenterX = playerPos.current.x + PLAYER_WIDTH / 2;
    const playerCenterY = playerPos.current.y + PLAYER_HEIGHT / 2;
    const emitSlingshotShieldImpact = (x: number, y: number, intensity = 1) => {
      if (frameNow - slingshotShieldFxAt.current < 90) return;
      slingshotShieldFxAt.current = frameNow;
      createExplosion(x, y, '#00ffcc', Math.max(2, Math.round(2 + intensity * 2)));
      shake.current = Math.max(shake.current, 1.5 + intensity * 1.5);
    };
    const doesShieldCatchPoint = (x: number, y: number, padding = 0) => {
      if (!shieldState.active) return false;
      const dx = x - playerCenterX;
      const dy = y - playerCenterY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angleOffset = Math.abs(normalizeAngle(Math.atan2(dy, dx) - shieldState.angle));
      const shieldInnerRadius = Math.max(18, shieldState.radius - shieldState.thickness * 1.35 - padding);
      const shieldOuterRadius = shieldState.radius + shieldState.thickness + padding;
      return angleOffset <= SLINGSHOT_SHIELD_HALF_ARC && dist >= shieldInnerRadius && dist <= shieldOuterRadius;
    };
    const doesShieldCatchRect = (x: number, y: number, width: number, height: number, padding = 0) => {
      if (!shieldState.active) return false;
      const closestX = Math.max(x, Math.min(playerCenterX, x + width));
      const closestY = Math.max(y, Math.min(playerCenterY, y + height));

      if (closestX === playerCenterX && closestY === playerCenterY) {
        return doesShieldCatchPoint(x + width / 2, y + height / 2, Math.max(width, height) * 0.35 + padding);
      }

      return doesShieldCatchPoint(closestX, closestY, padding);
    };
    // Previous-position shield check: catches enemies the shield swept through this frame
    const prevShieldCX = prevPlayerPos.current.x + PLAYER_WIDTH / 2;
    const prevShieldCY = prevPlayerPos.current.y + PLAYER_HEIGHT / 2;
    const doesShieldCatchAtPrev = (x: number, y: number, width: number, height: number, padding = 0) => {
      if (!shieldState.active) return false;
      const cx = Math.max(x, Math.min(prevShieldCX, x + width));
      const cy = Math.max(y, Math.min(prevShieldCY, y + height));
      const ddx = (cx === prevShieldCX && cy === prevShieldCY) ? (x + width / 2) - prevShieldCX : cx - prevShieldCX;
      const ddy = (cx === prevShieldCX && cy === prevShieldCY) ? (y + height / 2) - prevShieldCY : cy - prevShieldCY;
      const ddist = Math.sqrt(ddx * ddx + ddy * ddy);
      const aoff = Math.abs(normalizeAngle(Math.atan2(ddy, ddx) - shieldState.angle));
      const inner = Math.max(18, shieldState.radius - shieldState.thickness * 1.35 - padding);
      const outer = shieldState.radius + shieldState.thickness + padding;
      return aoff <= SLINGSHOT_SHIELD_HALF_ARC && ddist >= inner && ddist <= outer;
    };
    const isSlingshotAttacking = frameNow < slingshotAttackUntil.current;
    odReadyRef.current = overdriveGauge.current >= MAX_OVERDRIVE && !isOverdriveActiveRef.current;
    const registerSlingshotCombo = (basePoints: number) => {
      if (!isSlingshotAttacking) return;

      if (frameNow - lastHitTime.current < SLINGSHOT_COMBO_WINDOW_MS) {
        comboRef.current += 1;
      } else {
        comboRef.current = 1;
      }
      lastHitTime.current = frameNow;
      setCombo(comboRef.current);
      shotsHitRef.current++;
      if (comboRef.current > maxComboRef.current) maxComboRef.current = comboRef.current;

      const comboBonus = Math.floor(basePoints * (comboRef.current - 1) * 0.15);
      setScore((s) => s + basePoints + comboBonus);

      if (!isOverdriveActiveRef.current) {
        const gaugeGain = Math.min(3.5, 1.4 + comboRef.current * 0.25);
        overdriveGauge.current = Math.min(MAX_OVERDRIVE, overdriveGauge.current + gaugeGain);
        setOverdrive(overdriveGauge.current);
      }
    };
    // Wall (enemy/block deflect) always requires Stage 2+ (gauge >= 25), both during drag and guard window.
    const isShieldObstacleRecoilPhase = shieldState.active && !isSlingshotAttacking && overdriveGauge.current >= 25;
    const getShieldObstacleCollision = (x: number, y: number, width: number, height: number, padding = 0) => {
      if (!shieldState.active) return null;
      const caught = doesShieldCatchRect(x, y, width, height, padding) || doesShieldCatchAtPrev(x, y, width, height, padding);
      if (!caught) return null;

      const centerX = x + width / 2;
      const centerY = y + height / 2;
      const dx = playerCenterX - centerX;
      const dy = playerCenterY - centerY;
      const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      return { centerX, centerY, dx, dy, dist };
    };
    const getObstacleImpact = (x: number, y: number, width: number, height: number) => {
      const centerX = x + width / 2;
      const centerY = y + height / 2;
      const dx = playerCenterX - centerX;
      const dy = playerCenterY - centerY;
      const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      return { centerX, centerY, dx, dy, dist };
    };
    const syncPlayerDragState = (displacementX: number, displacementY: number) => {
      playerPos.current.x += displacementX;
      playerPos.current.y += displacementY;
      playerStartPos.current.x += displacementX;
      playerStartPos.current.y += displacementY;
      targetPos.current.x += displacementX;
      targetPos.current.y += displacementY;
    };
    const dampPlayerVelocityAgainstNormal = (normalX: number, normalY: number) => {
      const normalVelocity = playerVel.current.x * normalX + playerVel.current.y * normalY;
      if (normalVelocity < 0) {
        playerVel.current.x -= normalX * normalVelocity * (1 + SOLID_CONTACT_VELOCITY_DAMPING);
        playerVel.current.y -= normalY * normalVelocity * (1 + SOLID_CONTACT_VELOCITY_DAMPING);
      }

      const tangentX = -normalY;
      const tangentY = normalX;
      const retainedNormalVelocity = Math.max(0, playerVel.current.x * normalX + playerVel.current.y * normalY);
      const tangentVelocity = playerVel.current.x * tangentX + playerVel.current.y * tangentY;
      playerVel.current.x = normalX * retainedNormalVelocity + tangentX * tangentVelocity * SOLID_CONTACT_TANGENT_DAMPING;
      playerVel.current.y = normalY * retainedNormalVelocity + tangentY * tangentVelocity * SOLID_CONTACT_TANGENT_DAMPING;
    };
    const resolvePlayerRectCollision = (rectX: number, rectY: number, rectWidth: number, rectHeight: number, padding = 0) => {
      const playerLeft = playerPos.current.x;
      const playerRight = playerPos.current.x + PLAYER_WIDTH;
      const playerTop = playerPos.current.y;
      const playerBottom = playerPos.current.y + PLAYER_HEIGHT;
      const expandedLeft = rectX - padding;
      const expandedRight = rectX + rectWidth + padding;
      const expandedTop = rectY - padding;
      const expandedBottom = rectY + rectHeight + padding;

      if (
        playerRight <= expandedLeft ||
        playerLeft >= expandedRight ||
        playerBottom <= expandedTop ||
        playerTop >= expandedBottom
      ) {
        return false;
      }

      const overlapLeft = playerRight - expandedLeft;
      const overlapRight = expandedRight - playerLeft;
      const overlapTop = playerBottom - expandedTop;
      const overlapBottom = expandedBottom - playerTop;

      const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
      let displacementX = 0;
      let displacementY = 0;
      let normalX = 0;
      let normalY = 0;

      if (minOverlap === overlapLeft) {
        displacementX = -overlapLeft;
        normalX = -1;
      } else if (minOverlap === overlapRight) {
        displacementX = overlapRight;
        normalX = 1;
      } else if (minOverlap === overlapTop) {
        displacementY = -overlapTop;
        normalY = -1;
      } else {
        displacementY = overlapBottom;
        normalY = 1;
      }

      syncPlayerDragState(displacementX, displacementY);
      dampPlayerVelocityAgainstNormal(normalX, normalY);
      return true;
    };
    const resolvePlayerCircleCollision = (centerX: number, centerY: number, radius: number, padding = 0) => {
      const playerCenterX = playerPos.current.x + PLAYER_WIDTH / 2;
      const playerCenterY = playerPos.current.y + PLAYER_HEIGHT / 2;
      const dx = playerCenterX - centerX;
      const dy = playerCenterY - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
      const minDist = radius + Math.max(PLAYER_WIDTH, PLAYER_HEIGHT) * 0.42 + padding;

      if (dist >= minDist) {
        return false;
      }

      const normalX = dx / dist;
      const normalY = dy / dist;
      const overlap = minDist - dist;
      syncPlayerDragState(normalX * overlap, normalY * overlap);
      dampPlayerVelocityAgainstNormal(normalX, normalY);
      return true;
    };
    const applyShieldObstacleRecoil = (
      collision: { centerX: number; centerY: number; dx: number; dy: number; dist: number },
      recoil: number,
      impact: number,
      odCost: number,
    ) => {
      if (frameNow - slingshotShieldObstacleRecoilAt.current < SLINGSHOT_SHIELD_OBSTACLE_RECOIL_MS) return;
      slingshotShieldObstacleRecoilAt.current = frameNow;
      const recoilX = (collision.dx / collision.dist) * recoil;
      const recoilY = (collision.dy / collision.dist) * recoil;
      const displacementX = (collision.dx / collision.dist) * Math.min(14, recoil * 0.8);
      const displacementY = (collision.dy / collision.dist) * Math.min(14, recoil * 0.8);
      playerVel.current.x += recoilX;
      playerVel.current.y += recoilY;
      syncPlayerDragState(displacementX, displacementY);
      isSnapping.current = Math.max(isSnapping.current, 4);
      emitSlingshotShieldImpact(collision.centerX, collision.centerY, impact);
      overdriveGauge.current = Math.max(0, overdriveGauge.current - odCost);
      setOverdrive(overdriveGauge.current);
    };
    const stopSlingshotAttack = () => {
      slingshotAttackUntil.current = 0;
      slingshotTravelUntil.current = 0;
      slingshotLandingTarget.current = null;
    };
    const applySlingshotWallBounce = (
      collision: { centerX: number; centerY: number; dx: number; dy: number; dist: number },
      impact: number,
    ) => {
      if (frameNow - slingshotObstacleKickAt.current < SLINGSHOT_ATTACK_OBSTACLE_HIT_MS) return;
      slingshotObstacleKickAt.current = frameNow;
      const recoil = SLINGSHOT_SHIELD_WALL_RECOIL * 0.9;
      const recoilX = (collision.dx / collision.dist) * recoil;
      const recoilY = (collision.dy / collision.dist) * recoil;
      const displacementX = (collision.dx / collision.dist) * Math.min(12, recoil * 0.7);
      const displacementY = (collision.dy / collision.dist) * Math.min(12, recoil * 0.7);
      playerVel.current.x = recoilX;
      playerVel.current.y = recoilY;
      syncPlayerDragState(displacementX, displacementY);
      isSnapping.current = Math.max(isSnapping.current, 6);
      emitSlingshotShieldImpact(collision.centerX, collision.centerY, impact);
      overdriveGauge.current = Math.max(0, overdriveGauge.current - 4);
      setOverdrive(overdriveGauge.current);
      stopSlingshotAttack();
    };
    const applySlingshotObstacleKick = (
      collision: { centerX: number; centerY: number; dx: number; dy: number; dist: number },
      impact: number,
      overdriveGain: number,
      onHit: () => void,
    ) => {
      if (frameNow - slingshotObstacleKickAt.current < SLINGSHOT_ATTACK_OBSTACLE_HIT_MS) return;
      slingshotObstacleKickAt.current = frameNow;
      emitSlingshotShieldImpact(collision.centerX, collision.centerY, impact);
      overdriveGauge.current = Math.min(MAX_OVERDRIVE, overdriveGauge.current + overdriveGain);
      setOverdrive(overdriveGauge.current);
      onHit();
    };
    const applyShieldRainTentacleDeflect = (
      block: Obstacle,
      collision: { centerX: number; centerY: number; dx: number; dy: number; dist: number },
      impact: number,
      overdriveCost: number,
    ) => {
      if (frameNow - lastRainTentacleDeflectAt.current < RAIN_TENTACLE_DEFLECT_COOLDOWN_MS) return;
      lastRainTentacleDeflectAt.current = frameNow;

      const pushX = (collision.dx / collision.dist) * RAIN_TENTACLE_DEFLECT_PUSH;
      const nextX = Math.max(24, Math.min(CANVAS_WIDTH - block.width - 24, block.x + pushX));
      block.x = nextX;
      if (block.baseX !== undefined) {
        block.baseX = Math.max(24, Math.min(CANVAS_WIDTH - block.width - 24, block.baseX + pushX));
      }

      // Lift tentacle slightly so the player gets an immediate recovery lane.
      block.y -= RAIN_TENTACLE_DEFLECT_LIFT;

      if (block.segments) {
        const nudge = (collision.dx / collision.dist) * 12;
        block.segments.forEach((seg, idx) => {
          seg.x += nudge * (1 - idx * 0.06);
          seg.angle += (collision.dx / collision.dist) * 0.22;
        });
      }

      emitSlingshotShieldImpact(collision.centerX, collision.centerY, impact);
      overdriveGauge.current = Math.max(0, overdriveGauge.current - overdriveCost);
      setOverdrive(overdriveGauge.current);
      isSnapping.current = Math.max(isSnapping.current, 5);
    };

    // Energy wall: absorb enemy bullets caught in the shield arc during slingshot drag.
    // Each absorbed bullet charges the OD gauge. When already OD-ready, the first
    // absorption triggers Overdrive immediately.
    // Guard window (post-release) intentionally excluded: absorption requires active drag.
    if (shieldState.active && !isSlingshotAttacking && !isOverdriveActiveRef.current && isSlingshotMode.current && isDragging) {
      const ENERGY_WALL_BULLET_GAIN = 2; // ~50 bullets to full; each of 4 stages = ~12 bullets
      const ENERGY_WALL_HP_GAIN = 1;     // +1 integrity per bullet absorbed in HP_ABSORB mode
      // Track accumulated changes so we can batch React state updates after the filter.
      // Calling setOverdrive/setIntegrity per-bullet during a dense boss volley causes
      // 30–50 re-renders per drag, which stalls the game loop on mobile.
      let odGainedThisPass = 0;
      let hpGainedThisPass = 0;
      let overdriveFiredThisPass = false;
      for (let _ebi = 0; _ebi < enemyBullets.current.length; _ebi++) {
        const b = enemyBullets.current[_ebi];
        if (!b.alive) continue;
        if (b.isBeam) continue; // Beams are deflected by shield, not absorbed
        if (!doesShieldCatchPoint(b.x, b.y, 20)) continue;
        if (wallModeRef.current === 'HP_ABSORB') {
          if (integrityRef.current >= 100) {
            // HP full: fall back to OD charge without switching mode
            if (odReadyRef.current && !overdriveFiredThisPass) {
              overdriveFiredThisPass = true;
              activateOverdrive();
              b.alive = false; continue;
            }
            overdriveGauge.current = Math.min(MAX_OVERDRIVE, overdriveGauge.current + ENERGY_WALL_BULLET_GAIN);
            odGainedThisPass += ENERGY_WALL_BULLET_GAIN;
            if (overdriveGauge.current >= MAX_OVERDRIVE) {
              flash.current = Math.max(flash.current, 0.25);
            }
            createExplosion(b.x, b.y, '#ffcc00', 2);
          } else {
            const healed = Math.min(100, integrityRef.current + ENERGY_WALL_HP_GAIN);
            hpGainedThisPass += healed - integrityRef.current;
            integrityRef.current = healed;
            createExplosion(b.x, b.y, '#00ffcc', 2);
          }
          b.alive = false; continue;
        }
        // OD_CHARGE (default)
        if (odReadyRef.current && !overdriveFiredThisPass) {
          overdriveFiredThisPass = true;
          activateOverdrive();
          b.alive = false; continue;
        }
        overdriveGauge.current = Math.min(MAX_OVERDRIVE, overdriveGauge.current + ENERGY_WALL_BULLET_GAIN);
        odGainedThisPass += ENERGY_WALL_BULLET_GAIN;
        if (overdriveGauge.current >= MAX_OVERDRIVE) {
          flash.current = Math.max(flash.current, 0.25);
        }
        createExplosion(b.x, b.y, '#ffcc00', 2);
        b.alive = false; continue;
      }
      // Flush batched state updates — one React render instead of one per bullet.
      if (odGainedThisPass > 0) setOverdrive(overdriveGauge.current);
      if (hpGainedThisPass > 0) setIntegrity(integrityRef.current);
      odReadyRef.current = overdriveGauge.current >= MAX_OVERDRIVE && !isOverdriveActiveRef.current;
    }

    // Slingshot bullet wake: push nearby enemy bullets outward while the player is in flight.
    // Bullets are deflected (not destroyed) — they scatter sideways, creating visible lanes.
    if (isSlingshotAttacking) {
      const wakeRadius = 72;
      enemyBullets.current.forEach(b => {
        if (!b.alive) return;
        const wdx = b.x - playerCenterX;
        const wdy = b.y - playerCenterY;
        const wDist = Math.sqrt(wdx * wdx + wdy * wdy);
        if (wDist < wakeRadius && wDist > 0) {
          const falloff = 1 - wDist / wakeRadius;
          const force = 9 * falloff;
          b.vx = (b.vx || 0) + (wdx / wDist) * force;
          b.vy = (b.vy || 0) + (wdy / wDist) * force;
          // Clamp pushed bullets to a sane speed so they don't fly off instantly
          const spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
          if (spd > 7) { b.vx = (b.vx / spd) * 7; b.vy = (b.vy / spd) * 7; }
        }
      });
    }

    // Maze Generation (Canyon)
    // Stage 3: slow (windmill/turret choreography needs read time)
    // Stage 4: moderate canyon chase — faster than S3, readable corridors
    // Stage 5+: fast (boss wave, obstacles are background pressure not puzzle)
    const scrollSpeed = (currentStage === 3 ? 0.65 : currentStage === 4 ? 0.9 : 3) * worldSpeedScale;
    lastBlockRowY.current += scrollSpeed;
    // Stage 5 spawns rows half as often — high scroll speed already brings blocks fast enough.
    const rowSpawnThreshold = currentStage === 5 ? 200 : 100;
    if (lastBlockRowY.current > rowSpawnThreshold) {
      lastBlockRowY.current = 0;
      generateMazeRow();
    }

    blocks.current.forEach(block => {
      block.y += scrollSpeed;

      // Tentacle movement
      if (block.type === 'TENTACLE' && block.segments && block.baseX !== undefined) {
        const time = Date.now() / 1000;
        block.x = block.baseX + Math.sin(time * 2 + block.id) * 50;
        block.segments.forEach((seg, i) => {
          seg.x = Math.sin(time * 3 + i * 0.5 + block.id) * 30;
          seg.angle = Math.sin(time * 2 + i * 0.3) * 0.5;
        });
      }

      // Collision with player / shield
      const overlapsPlayer = (
        playerPos.current.x < block.x + block.width &&
        playerPos.current.x + PLAYER_WIDTH > block.x &&
        playerPos.current.y < block.y + block.height &&
        playerPos.current.y + PLAYER_HEIGHT > block.y
      );
      const blockImpact = overlapsPlayer ? getObstacleImpact(block.x, block.y, block.width, block.height) : null;
      const tentacleShieldCollision = (block.type === 'TENTACLE' && block.segments)
        ? block.segments
          .map((seg) => {
            const centerX = block.x + seg.x;
            const centerY = block.y + seg.y;
            const caught = doesShieldCatchPoint(centerX, centerY, 10);
            if (!caught) return null;
            const dx = playerCenterX - centerX;
            const dy = playerCenterY - centerY;
            const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
            return { centerX, centerY, dx, dy, dist };
          })
          .find((collision) => collision !== null)
        : null;

      if (block.hp > 0 && isSlingshotAttacking && blockImpact) {
        if (block.type === 'WALL' || block.type === 'WINDMILL') {
          applySlingshotWallBounce(blockImpact, 1.15);
        } else {
          applySlingshotObstacleKick(blockImpact, 1.25, 1.8, () => {
            const damage = block.type === 'TENTACLE' ? 8 : Math.max(4, Math.ceil(block.maxHp * 0.5));
            block.hp -= damage;
            if (block.hp <= 0) {
              triggerChainExplosion(block);
              registerSlingshotCombo(block.type === 'TENTACLE' ? 180 : 140);
            }
          });
        }
      } else if (block.hp > 0 && !isOverdriveActiveRef.current && Date.now() > invulnerableUntil.current) {
        const shieldCollision = tentacleShieldCollision || getShieldObstacleCollision(block.x, block.y, block.width, block.height, 12);

        if (shieldCollision && isShieldObstacleRecoilPhase) {
          if (block.type === 'TENTACLE') {
            applyShieldRainTentacleDeflect(block, shieldCollision, 1.25, 5);
          } else {
            applyShieldObstacleRecoil(
              shieldCollision,
              (block.type === 'WALL' || block.type === 'WINDMILL') ? SLINGSHOT_SHIELD_WALL_RECOIL : SLINGSHOT_SHIELD_OBSTACLE_RECOIL,
              1.1,
              6,
            );
          }
          if (block.type !== 'WALL' && block.type !== 'WINDMILL') {
            block.hp -= 1;
            if (block.hp <= 0) {
              triggerChainExplosion(block);
            }
          }
        } else if (overlapsPlayer) {
          // WINDMILL body is physically passable — blades are the hazard (checked below).
          if (block.type !== 'WINDMILL') {
            resolvePlayerRectCollision(block.x, block.y, block.width, block.height, 2);
          }
          if (shieldCollision && isShieldObstacleRecoilPhase) {
            if (block.type === 'TENTACLE') {
              applyShieldRainTentacleDeflect(block, shieldCollision, 1.2, 4);
            }
            playerVel.current.x += (shieldCollision.dx / shieldCollision.dist) * 4;
            playerVel.current.y += (shieldCollision.dy / shieldCollision.dist) * 4;
            if (block.type !== 'WALL' && block.type !== 'WINDMILL') {
              block.hp -= 1;
              if (block.hp <= 0) {
                triggerChainExplosion(block);
              }
            }
            if (block.type !== 'TENTACLE') {
              emitSlingshotShieldImpact(shieldCollision.centerX, shieldCollision.centerY, 1.1);
              overdriveGauge.current = Math.max(0, overdriveGauge.current - 6);
              setOverdrive(overdriveGauge.current);
            }
          } else if (block.type !== 'WINDMILL') {
            handlePlayerHit();
          }
        }
      }

      // Windmill blade timing hazard — runs for all player states, including slingshot attack.
      if (block.type === 'WINDMILL' && block.hp > 0 && !isOverdriveActiveRef.current) {
        const wcx = block.x + block.width / 2;
        const wcy = block.y + block.height / 2;
        const armLen = block.height * 2.9;
        const pCx = playerPos.current.x + PLAYER_WIDTH / 2;
        const pCy = playerPos.current.y + PLAYER_HEIGHT / 2;
        const wdx = pCx - wcx;
        const wdy = pCy - wcy;
        const wDist = Math.sqrt(wdx * wdx + wdy * wdy);
        if (wDist < armLen + PLAYER_WIDTH * 0.4 && wDist > 6) {
          const playerAngle = Math.atan2(wdy, wdx);
          const rot = frameNow * 0.00025 + (block.id % 100) * 0.9;
          for (let k = 0; k < 2; k++) {
            const bladeAngle = rot + k * Math.PI;
            const diff = Math.abs(normalizeAngle(playerAngle - bladeAngle));
            if (diff < 0.17) {
              if (isSlingshotAttacking) {
                applySlingshotWallBounce(getObstacleImpact(block.x, block.y, block.width, block.height), 1.3);
              } else if (frameNow > invulnerableUntil.current) {
                handlePlayerHit();
              }
              break;
            }
          }
        }
        // Center passage bonus: threading through the hub earns a score flash (+200).
        if (wDist < 30 && frameNow - (block.lastCenterBonus ?? 0) > 2000) {
          block.lastCenterBonus = frameNow;
          setScore(s => s + 200);
          createExplosion(wcx, wcy, '#ffff00', 6);
          flash.current = Math.max(flash.current, 0.25);
        }
      }

      // Collision with bullets
      bullets.current.forEach(bullet => {
        if (!bullet.alive) return;
        if (block.hp > 0 &&
            bullet.x > block.x && bullet.x < block.x + block.width &&
            bullet.y > block.y && bullet.y < block.y + block.height) {
          if (block.type !== 'WALL' && block.type !== 'WINDMILL') {
            block.hp -= (bullet.damage || 1);
            bullet.alive = false;
            if (block.hp <= 0) {
              triggerChainExplosion(block);
            }
          } else if (block.type !== 'WINDMILL') {
            bullet.alive = false; // Indestructible block (WALL)
          }
          // WINDMILL body is transparent to bullets; blade arc check below.
        }
      });
      // Windmill blade destroys any bullet (player or enemy) that enters the swept arc.
      // Under load, stride the check — missing one frame has no fairness impact at 60fps+.
      if (block.type === 'WINDMILL' && block.hp > 0) {
        const windmillStride = isCriticalSim ? 3 : isReducedSim ? 2 : 1;
        if (frameCounterRef.current % windmillStride === 0) {
          const wbcx = block.x + block.width / 2;
          const wbcy = block.y + block.height / 2;
          const wbArm = block.height * 2.9;
          const wbRot = frameNow * 0.00025 + (block.id % 100) * 0.9;
          const hitsWindmillBlade = (bx: number, by: number) => {
            const ddx = bx - wbcx;
            const ddy = by - wbcy;
            const dd = ddx * ddx + ddy * ddy;
            if (dd > wbArm * wbArm || dd < 16) return false;
            const bAngle = Math.atan2(ddy, ddx);
            for (let k = 0; k < 2; k++) {
              if (Math.abs(normalizeAngle(bAngle - (wbRot + k * Math.PI))) < 0.15) return true;
            }
            return false;
          };
          bullets.current.forEach(b => { if (b.alive && hitsWindmillBlade(b.x, b.y)) b.alive = false; });
          enemyBullets.current.forEach(b => { if (b.alive && b.y < CANVAS_HEIGHT + 50 && hitsWindmillBlade(b.x, b.y)) b.alive = false; });
        }
      }
    });
    // TURRET_BLOCK shooting: aim and fire at player
    {
      const now = Date.now();

      // Slingshot stagger: passing close to a turret during attack disrupts it for 3s.
      // The player discovers they can fly past turrets to suppress fire without destroying them.
      if (isSlingshotAttacking) {
        const staggerRadius = 90;
        blocks.current.forEach(block => {
          if (block.type !== 'TURRET_BLOCK' || block.hp <= 0) return;
          const cx = block.x + block.width / 2;
          const cy = block.y + block.height / 2;
          const sdx = playerCenterX - cx;
          const sdy = playerCenterY - cy;
          if (Math.sqrt(sdx * sdx + sdy * sdy) < staggerRadius) {
            // Push lastShotTime forward so it can't fire for 3 extra seconds
            block.lastShotTime = Math.max(block.lastShotTime ?? 0, now + 3000);
            createExplosion(cx, cy, '#ff9900', 3);
          }
        });
      }

      blocks.current.forEach(block => {
        if (block.type !== 'TURRET_BLOCK' || block.hp <= 0) return;
        if (block.y < -block.height || block.y > CANVAS_HEIGHT) return;
        if (now - (block.lastShotTime ?? 0) < 2000) return;
        block.lastShotTime = now;
        const cx = block.x + block.width / 2;
        const cy = block.y + block.height / 2;
        const tx = playerPos.current.x + PLAYER_WIDTH / 2;
        const ty = playerPos.current.y + PLAYER_HEIGHT / 2;
        const dx = tx - cx;
        const dy = ty - cy;
        const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const speed = 3;
        // Spawn bullet at barrel tip (matches render: tr + 14px from center)
        const tr = Math.min(block.width, block.height) * 0.26;
        const barrelTip = tr + 14;
        spawnBullet(enemyBullets.current, {
          x: cx + (dx / dist) * barrelTip,
          y: cy + (dy / dist) * barrelTip,
          vx: (dx / dist) * speed,
          vy: (dy / dist) * speed,
          damage: 20,
          color: '#ff9900',
          size: 5,
        });
      });
    }

    // BEAM_TURRET: fires from turret center aimed at the player every 3.5s.
    // Mobile variant: 700ms before firing it halts (haltUntil latch), telegraphing the shot.
    {
      const now = Date.now();
      const FIRE_INTERVAL = 3500;
      const HALT_LEAD = 700; // ms before fire when mobile turret freezes to aim
      blocks.current.forEach(block => {
        if (block.type !== 'BEAM_TURRET' || block.hp <= 0) return;
        if (block.y < -block.height || block.y > CANVAS_HEIGHT) return;
        const timeSinceShot = now - (block.lastShotTime ?? 0);
        const isMobile = block.vx !== undefined;
        if (isMobile && timeSinceShot >= FIRE_INTERVAL - HALT_LEAD && !block.haltUntil) {
          block.haltUntil = now + HALT_LEAD;
        }
        // Not yet time to fire
        if (timeSinceShot < FIRE_INTERVAL) return;
        // Mobile: still in halt (shouldn't normally happen since HALT_LEAD <= 700ms, but guard it)
        if (isMobile && block.haltUntil && now < block.haltUntil) return;
        // Fire
        block.lastShotTime = now;
        block.haltUntil = undefined; // clear for next cycle
        const cx = block.x + block.width / 2;
        const cy = block.y + block.height / 2;
        const tx = playerPos.current.x + PLAYER_WIDTH / 2;
        const ty = playerPos.current.y + PLAYER_HEIGHT / 2;
        const dx = tx - cx;
        const dy = ty - cy;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const speed = 3.8;
        const hexR = Math.min(block.width, block.height) * 0.28;
        const aimAngle = Math.atan2(dy, dx);
        spawnBullet(enemyBullets.current, {
          x: cx + Math.cos(aimAngle) * (hexR + 14),
          y: cy + Math.sin(aimAngle) * (hexR + 14),
          vx: (dx / dist) * speed,
          vy: (dy / dist) * speed,
          damage: 25,
          color: '#00ffdd',
          size: 9,
          isBeam: true,
          bounces: 0,
        });
      });
    }

    // Deflected beam ricochet: bounces off WALL blocks, damages/destroys everything else.
    // Beams also damage alive enemies on contact.
    for (let bi = enemyBullets.current.length - 1; bi >= 0; bi--) {
      const b = enemyBullets.current[bi];
      if (!b.alive) continue;
      if (!b.deflected || !b.isBeam) continue;
      const MAX_BEAM_BOUNCES = 7;

      // vs blocks
      let removeBeam = false;
      for (let ki = 0; ki < blocks.current.length; ki++) {
        const block = blocks.current[ki];
        if (block.hp <= 0) continue;
        if (b.x < block.x || b.x > block.x + block.width ||
            b.y < block.y || b.y > block.y + block.height) continue;

        if (block.type === 'WALL') {
          // Ricochet: determine collision axis by minimum overlap, reflect that component
          const overlapL = b.x - block.x;
          const overlapR = block.x + block.width - b.x;
          const overlapT = b.y - block.y;
          const overlapB = block.y + block.height - b.y;
          const minH = Math.min(overlapL, overlapR);
          const minV = Math.min(overlapT, overlapB);
          if (minH <= minV) {
            b.vx = -(b.vx ?? 0);
            b.x += (b.vx > 0 ? overlapR : -overlapL); // push out
          } else {
            b.vy = -(b.vy ?? 0);
            b.y += (b.vy > 0 ? overlapB : -overlapT);
          }
          b.bounces = (b.bounces ?? 0) + 1;
          if (b.bounces >= MAX_BEAM_BOUNCES) removeBeam = true;
          break;
        } else if (block.type === 'BUILDING') {
          // BUILDING absorbs beam energy — burst-explodes on 2nd hit, chain-damaging neighbours
          block.chargeHits = (block.chargeHits ?? 0) + 1;
          if (block.chargeHits >= 2) {
            // Burst: destroy this block and damage all blocks within ~1.5 block-widths
            block.hp = 0;
            createExplosion(block.x + block.width / 2, block.y + block.height / 2, '#ffcc00', 55);
            audio.playExplosion(block.x + block.width / 2);
            setScore(s => s + 400);
            const bx = block.x + block.width / 2;
            const by = block.y + block.height / 2;
            for (let ni = 0; ni < blocks.current.length; ni++) {
              const nb = blocks.current[ni];
              if (nb === block || nb.hp <= 0 || nb.type === 'WALL') continue;
              const ndx = (nb.x + nb.width / 2) - bx;
              const ndy = (nb.y + nb.height / 2) - by;
              if (Math.sqrt(ndx * ndx + ndy * ndy) < block.width * 1.8) {
                nb.hp -= nb.type === 'BEAM_TURRET' ? 999 : 15;
                if (nb.hp <= 0) {
                  createExplosion(nb.x + nb.width / 2, nb.y + nb.height / 2, nb.type === 'BEAM_TURRET' ? '#00ffdd' : '#ffcc00', 35);
                  audio.playExplosion(nb.x + nb.width / 2);
                  setScore(s => s + (nb.type === 'BEAM_TURRET' ? 800 : 200));
                }
              }
            }
            removeBeam = true;
          } else {
            // First hit: beam is absorbed; block glows (chargeHits drives render)
            removeBeam = true;
          }
          break;
        } else {
          // Other destructible (BEAM_TURRET direct hit, PILLAR, etc.)
          block.hp -= block.type === 'BEAM_TURRET' ? 999 : 30;
          if (block.hp <= 0) {
            createExplosion(block.x + block.width / 2, block.y + block.height / 2,
              block.type === 'BEAM_TURRET' ? '#00ffdd' : block.color, 40);
            audio.playExplosion(block.x + block.width / 2);
            setScore(s => s + (block.type === 'BEAM_TURRET' ? 800 : 200));
          }
          removeBeam = true;
          break;
        }
      }
      if (removeBeam) { b.alive = false; continue; }

      // vs alive enemies
      for (let ei = 0; ei < enemies.current.length; ei++) {
        const e = enemies.current[ei];
        if (!e.alive || e.state === 'ENTERING') continue;
        if (b.x > e.x && b.x < e.x + e.width && b.y > e.y && b.y < e.y + e.height) {
          const dmg = 50;
          if (e.isBoss) {
            if (e.health !== undefined) {
              e.health -= dmg;
              if (e.health <= 0) {
                e.alive = false;
                createExplosion(e.x + e.width / 2, e.y + e.height / 2, '#00ffdd', 80);
                audio.playExplosion(e.x + e.width / 2);
                setScore(s => s + 2000);
              }
            }
          } else {
            e.alive = false;
            createExplosion(e.x + e.width / 2, e.y + e.height / 2, '#00ffdd', 30);
            audio.playExplosion(e.x + e.width / 2);
            setScore(s => s + 150);
          }
          b.alive = false;
          break;
        }
      }
    }
    {
      const now = Date.now();
      blocks.current.forEach(turret => {
        if (turret.type !== 'BEAM_TURRET' || turret.hp <= 0 || !turret.vx) return;
        const halting = now < (turret.haltUntil ?? 0);
        if (halting) return;
        turret.x += turret.vx * worldSpeedScale * dt;
        if (turret.trackLeft !== undefined && turret.trackRight !== undefined) {
          if (turret.x < turret.trackLeft)  { turret.x = turret.trackLeft;  turret.vx =  Math.abs(turret.vx); }
          if (turret.x > turret.trackRight) { turret.x = turret.trackRight; turret.vx = -Math.abs(turret.vx); }
        } else {
          if (turret.x < 0)                           { turret.x = 0;                           turret.vx =  Math.abs(turret.vx); }
          if (turret.x + turret.width > CANVAS_WIDTH)  { turret.x = CANVAS_WIDTH - turret.width;  turret.vx = -Math.abs(turret.vx); }
        }
      });
    }

    blocks.current = blocks.current.filter(b => b.y < CANVAS_HEIGHT + 100);

    asteroids.current.forEach(a => {
      // Skip dead or far-off-screen asteroids — the filter below will clean them up next tick.
      if (a.hp <= 0) return;
      const margin = a.size + 50;
      if (a.y > CANVAS_HEIGHT + margin || a.y < -margin || a.x < -margin || a.x > CANVAS_WIDTH + margin) return;

      // Movement with inertia
      a.x += (a.dx + a.vx) * worldSpeedScale * dt;
      a.y += (a.speed + a.vy) * worldSpeedScale * dt;
      a.rotation += a.vr * worldSpeedScale * dt;

      // Friction for vx/vy — linear approximation of pow(0.98, dt); exact at dt=1, accurate within 0.3% for dt<3.
      const friction = 1 - 0.02 * dt;
      a.vx *= friction;
      a.vy *= friction;

      // Repulsion Field (Passive)
      // If player is close, push asteroid away slowly
      const pdx = a.x - (playerPos.current.x + PLAYER_WIDTH / 2);
      const pdy = a.y - (playerPos.current.y + PLAYER_HEIGHT / 2);
      const pdist = Math.sqrt(pdx * pdx + pdy * pdy);
      if (pdist < 150) {
        const force = (150 - pdist) / 150 * 1.2;
        a.vx += (pdx / pdist) * force;
        a.vy += (pdy / pdist) * force;
      }

      // Overdrive Gravity Pulse (Active)
      if (isOverdriveActiveRef.current && pdist < 300) {
        const force = (300 - pdist) / 300 * 4;
        a.vx -= (pdx / pdist) * force;
        a.vy -= (pdy / pdist) * force;
        // Also damage slightly
        if (Math.random() > 0.9) a.hp -= 1;
      }

      // Collision with player
      const dx = (playerPos.current.x + PLAYER_WIDTH / 2) - a.x;
      const dy = (playerPos.current.y + PLAYER_HEIGHT / 2) - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < a.size * 0.5) {
        if (isSlingshotAttacking || isOverdriveActiveRef.current) {
          if (a.hp > 0) {
            a.hp = 0;
            createExplosion(a.x, a.y, '#00ffcc', 25);
            audio.playExplosion(a.x);
            registerSlingshotCombo(120);
          }
        } else if (doesShieldCatchPoint(a.x, a.y, a.size * 0.5)) {
          resolvePlayerCircleCollision(a.x, a.y, a.size * 0.5, 2);
          const pushDist = Math.max(1, dist);
          a.vx -= (dx / pushDist) * 6;
          a.vy -= (dy / pushDist) * 6;
          playerVel.current.x += (dx / pushDist) * 1.5;
          playerVel.current.y += (dy / pushDist) * 1.5;
          emitSlingshotShieldImpact(a.x, a.y, 1.2);
          overdriveGauge.current = Math.max(0, overdriveGauge.current - 8);
          setOverdrive(overdriveGauge.current);
        } else if (Date.now() > invulnerableUntil.current) {
          resolvePlayerCircleCollision(a.x, a.y, a.size * 0.5, 2);
          handlePlayerHit();
          a.hp = 0; // Destroy on impact
        }
      }

      // Collision with enemies (Kinetic Weapon) — skip if asteroid is barely moving
      const combinedVelCheck = a.vx * a.vx + a.vy * a.vy;
      enemies.current.forEach(e => {
        if (!e.alive) return;
        if (combinedVelCheck < 1) return; // too slow to deal damage, skip
        const edx = e.x + e.width / 2 - a.x;
        const edy = e.y + e.height / 2 - a.y;
        const edist = Math.sqrt(edx * edx + edy * edy);

        if (edist < a.size + e.width / 2) {
          const combinedVel = Math.sqrt(combinedVelCheck);
          const damage = Math.floor(combinedVel * a.size * 0.5);
          e.health! -= damage;
          createExplosion(e.x + e.width / 2, e.y + e.height / 2, '#ffffff', 10);
          if (e.health! <= 0) {
            e.alive = false;
            createExplosion(e.x + e.width / 2, e.y + e.height / 2, '#ff3366', 30);
            audio.playExplosion(e.x);
          }
          // Asteroid loses some momentum
          a.vx *= 0.5;
          a.vy *= 0.5;
        }
      });

      // Collision with bullets — early-out if bullet is far from asteroid bounds
      bullets.current.forEach(b => {
        if (!b.alive) return;
        const bdx = b.x - a.x;
        const bdy = b.y - a.y;
        if (Math.abs(bdx) > a.size || Math.abs(bdy) > a.size) return; // cheap AABB pre-check
        const bdist = Math.sqrt(bdx * bdx + bdy * bdy);
        if (bdist < a.size) {
          a.hp -= (b.damage || 1);

          // Kinetic Push: Bullet transfers momentum to asteroid
          const pushForce = 2;
          a.vx += (b.vx || 0) * 0.1 * pushForce;
          a.vy += (b.vy || -10) * 0.1 * pushForce;

          b.alive = false; // Remove bullet

          // Hit feedback: small flash particles
          if (Math.random() > 0.5) {
            particles.current.push({
              x: b.x,
              y: b.y,
              vx: (Math.random() - 0.5) * 4,
              vy: (Math.random() - 0.5) * 4,
              life: 10,
              maxLife: 10,
              color: '#ffffff',
              size: 2
            });
          }

          if (a.hp <= 0) {
            audio.playExplosion(a.x);

            // Drop scrap from asteroids
            const scrapCount = Math.floor(a.size / 20);
            for (let i = 0; i < scrapCount; i++) {
              spawnScrap(scraps.current, {
                x: a.x,
                y: a.y,
                vx: (Math.random() - 0.5) * 6,
                vy: (Math.random() - 0.5) * 6,
                life: 1
              });
            }

            // Splitting Logic: If size is large enough, spawn smaller fragments
            if (a.size > 40) {
              const numFragments = isAsteroidBelt
                ? (Math.random() < 0.6 ? 1 : 2) // Stage 2 fairness: fewer splits
                : Math.floor(Math.random() * 2) + 2; // 2-3 fragments
              const fragCap = isAsteroidBelt ? (isMobile ? 8 : 12) : (isMobile ? 12 : 20);
              for(let i=0; i<numFragments; i++) {
                if (asteroids.current.length >= fragCap) break;
                const fragSize = a.size * 0.5;
                const angle = (i / numFragments) * Math.PI * 2 + Math.random() * 0.5;
                const fragVertices = [];
                for (let j = 0; j < 8; j++) {
                  fragVertices.push(0.8 + Math.random() * 0.4);
                }
                asteroids.current.push({
                  x: a.x + Math.cos(angle) * (a.size / 2),
                  y: a.y + Math.sin(angle) * (a.size / 2),
                  dx: 0,
                  vx: Math.cos(angle) * 5,
                  vy: Math.sin(angle) * 5,
                  size: fragSize,
                  speed: a.speed * (isAsteroidBelt ? 1.05 : 1.2), // Stage 2 fairness: softer fragment chase
                  rotation: Math.random() * Math.PI * 2,
                  vr: (Math.random() - 0.5) * 0.1,
                  hp: Math.floor(fragSize / 10),
                  vertices: fragVertices
                });
              }
            }

            // Destruction particles (Neon burst)
            for (let i = 0; i < 15; i++) {
              particles.current.push({
                x: a.x,
                y: a.y,
                vx: (Math.random() - 0.5) * 8,
                vy: (Math.random() - 0.5) * 8,
                life: 30,
                maxLife: 30,
                color: isAsteroidBelt ? '#00ffcc' : '#888888',
                size: Math.random() * 3 + 1
              });
            }
            setScore(s => s + 100);
          }
        }
      });
    });
    asteroids.current = asteroids.current.filter(a => a.hp > 0 && a.y < CANVAS_HEIGHT + 200 && a.y > -200 && a.x > -200 && a.x < CANVAS_WIDTH + 200);

    // Update Obstacles (disabled in Stage 5: blocks system already provides terrain;
    // combining both creates an unbeatable obstacle density.)
    if (false && currentStage === 5 && !isWarping.current) {
      const now = Date.now();
      if (now - lastObstacleTime.current > 3000) {
        lastObstacleTime.current = now;
        obstaclePattern.current = (obstaclePattern.current + 1) % 4;

        // Generate pattern
        if (obstaclePattern.current === 0) {
          // Left wall
          obstacles.current.push({ id: now, x: 0, y: -200, width: 200, height: 150, type: 'WALL', hp: 50, maxHp: 50, color: '#ff3366' });
          // Right wall
          obstacles.current.push({ id: now + 1, x: CANVAS_WIDTH - 200, y: -200, width: 200, height: 150, type: 'WALL', hp: 50, maxHp: 50, color: '#ff3366' });
        } else if (obstaclePattern.current === 1) {
          // Center pillar
          obstacles.current.push({ id: now, x: CANVAS_WIDTH / 2 - 100, y: -200, width: 200, height: 200, type: 'BUILDING', hp: 100, maxHp: 100, color: '#33ccff' });
        } else if (obstaclePattern.current === 2) {
          // Zigzag
          obstacles.current.push({ id: now, x: 100, y: -200, width: 150, height: 150, type: 'PILLAR', hp: 30, maxHp: 30, color: '#ffcc00' });
          obstacles.current.push({ id: now + 1, x: CANVAS_WIDTH - 250, y: -400, width: 150, height: 150, type: 'PILLAR', hp: 30, maxHp: 30, color: '#ffcc00' });
        } else {
          // Narrow corridor
          obstacles.current.push({ id: now, x: 0, y: -200, width: CANVAS_WIDTH / 2 - 60, height: 300, type: 'WALL', hp: 200, maxHp: 200, color: '#ff3366' });
          obstacles.current.push({ id: now + 1, x: CANVAS_WIDTH / 2 + 60, y: -200, width: CANVAS_WIDTH / 2 - 60, height: 300, type: 'WALL', hp: 200, maxHp: 200, color: '#ff3366' });
        }
      }
    }

    obstacles.current.forEach(obs => {
      obs.y += 2; // Scroll down

      // Collision with player / shield
      const px = playerPos.current.x;
      const py = playerPos.current.y;
      const overlapsPlayer = px + PLAYER_WIDTH > obs.x && px < obs.x + obs.width &&
        py + PLAYER_HEIGHT > obs.y && py < obs.y + obs.height;
      const obstacleImpact = overlapsPlayer ? getObstacleImpact(obs.x, obs.y, obs.width, obs.height) : null;
      const shieldCollision = !isOverdriveActiveRef.current && Date.now() > invulnerableUntil.current
        ? getShieldObstacleCollision(obs.x, obs.y, obs.width, obs.height, 12)
        : null;
      if (obs.hp > 0 && isSlingshotAttacking && obstacleImpact) {
        if (obs.type === 'WALL') {
          applySlingshotWallBounce(obstacleImpact, 1.25);
        } else {
          applySlingshotObstacleKick(obstacleImpact, 1.35, 2.2, () => {
            const damage = obs.type === 'BUILDING' ? 18 : 10;
            obs.hp -= damage;
            if (obs.hp <= 0) {
              audio.playExplosion(obs.x + obs.width / 2);
              createExplosion(obs.x + obs.width / 2, obs.y + obs.height / 2, obs.color, 20);
              registerSlingshotCombo(obs.type === 'BUILDING' ? 240 : 180);
            }
          });
        }
      } else if (shieldCollision && isShieldObstacleRecoilPhase) {
        applyShieldObstacleRecoil(
          shieldCollision,
          obs.type === 'WALL' ? SLINGSHOT_SHIELD_WALL_RECOIL : SLINGSHOT_SHIELD_OBSTACLE_RECOIL,
          1.2,
          6,
        );
        if (obs.type !== 'WALL') {
          obs.hp -= 2;
          if (obs.hp <= 0) {
            audio.playExplosion(obs.x + obs.width / 2);
            createExplosion(obs.x + obs.width / 2, obs.y + obs.height / 2, obs.color, 20);
            setScore(s => s + 200);
          }
        }
      } else if (overlapsPlayer && Date.now() > invulnerableUntil.current) {
        resolvePlayerRectCollision(obs.x, obs.y, obs.width, obs.height, 2);
        if (shieldCollision) {
          playerVel.current.x += (shieldCollision.dx / shieldCollision.dist) * 4;
          playerVel.current.y += (shieldCollision.dy / shieldCollision.dist) * 4;
          if (obs.type !== 'WALL') {
            obs.hp -= 2;
            if (obs.hp <= 0) {
              audio.playExplosion(obs.x + obs.width / 2);
              createExplosion(obs.x + obs.width / 2, obs.y + obs.height / 2, obs.color, 20);
              setScore(s => s + 200);
            }
          }
          emitSlingshotShieldImpact(shieldCollision.centerX, shieldCollision.centerY, 1.2);
          overdriveGauge.current = Math.max(0, overdriveGauge.current - 6);
          setOverdrive(overdriveGauge.current);
        } else {
          handlePlayerHit();
        }
      }

      // Collision with wingman
      if (wingmanRef.current) {
        const wx = wingmanPos.current.x;
        const wy = wingmanPos.current.y;
        if (wx + PLAYER_WIDTH > obs.x && wx < obs.x + obs.width &&
            wy + PLAYER_HEIGHT > obs.y && wy < obs.y + obs.height) {
          setHasWingman(false);
          wingmanRef.current = false;
          createExplosion(wx + PLAYER_WIDTH / 2, wy + PLAYER_HEIGHT / 2, '#ff33cc', 30);
          audio.playExplosion(wx);
        }
      }

      // Collision with bullets
      bullets.current.forEach(b => {
        if (!b.alive) return;
        if (b.x > obs.x && b.x < obs.x + obs.width &&
            b.y > obs.y && b.y < obs.y + obs.height) {
          obs.hp -= (b.damage || 1);
          b.alive = false; // Remove bullet
          if (obs.hp <= 0) {
            audio.playExplosion(obs.x + obs.width / 2);
            createExplosion(obs.x + obs.width / 2, obs.y + obs.height / 2, obs.color, 20);
            setScore(s => s + 200);
          }
        }
      });
    });
    obstacles.current = obstacles.current.filter(obs => obs.y < CANVAS_HEIGHT + 400 && obs.hp > 0);

    // Overdrive Logic
    if (isOverdriveActiveRef.current) {
      const now = Date.now();
      if (now > overdriveEndTime.current) {
        isOverdriveActiveRef.current = false;
        setIsOverdriveActive(false);
        overdriveGauge.current = 0;
        setOverdrive(0);
        shake.current = 10;
        audio.playPowerDown(); // Add a sound for ending
      } else {
        const totalDuration = hasFrenzy ? 15000 : 10000;
        const elapsed = totalDuration - (overdriveEndTime.current - now);
        const remainingPercent = Math.max(0, 100 - (elapsed / totalDuration) * 100);

        // Sync ref and state
        overdriveGauge.current = remainingPercent;
        setOverdrive(remainingPercent);

        // Visual feedback
        if (Math.random() > 0.8) {
          glitch.current = 0.3;
        }
      }
    }

    // Update shake & flash
      // (Moved to beginning of update loop)

    // Shooting
    const isRapid = (activeEffects.current['RAPIDFIRE'] > Date.now()) || isOverdriveActiveRef.current;
    const shootInterval = isOverdriveActiveRef.current ? (isMobile ? 100 : 80) : isRapid ? 120 : 250;

    if (gameState === 'PLAYING') {
      const now = Date.now();
      if (now - lastShotTime.current > shootInterval) {
        const isMulti = activeEffects.current['MULTISHOT'] > Date.now();
        const isOver = isOverdriveActiveRef.current;
        const bulletDamage = 1 + (firepowerRef.current - 1) * 0.5;
        const bulletSize = 4 + (firepowerRef.current - 1) * 2;

        if (isOver) {
          // Super Overdrive Shot — mobile fires 3-spread to save bullet/collision cost
          const spreadRange = isMobile ? 1 : 2; // mobile: -1..1 (3 bullets), desktop: -2..2 (5)
          for (let i = -spreadRange; i <= spreadRange; i++) {
            spawnBullet(bullets.current, {
              x: playerPos.current.x + PLAYER_WIDTH / 2 - bulletSize / 2 + i * 15,
              y: playerPos.current.y,
              vx: i * 0.5,
              vy: -BULLET_SPEED * 1.5,
              damage: bulletDamage * 1.5,
              size: bulletSize * 1.2
            });
          }
        } else if (isMulti) {
          spawnBullet(bullets.current, { x: playerPos.current.x + PLAYER_WIDTH / 2 - 10, y: playerPos.current.y, damage: bulletDamage, size: bulletSize });
          spawnBullet(bullets.current, { x: playerPos.current.x + PLAYER_WIDTH / 2 + 6, y: playerPos.current.y, damage: bulletDamage, size: bulletSize });
          spawnBullet(bullets.current, { x: playerPos.current.x + PLAYER_WIDTH / 2 - 2, y: playerPos.current.y - 10, damage: bulletDamage, size: bulletSize });
        } else {
          spawnBullet(bullets.current, {
            x: playerPos.current.x + PLAYER_WIDTH / 2 - bulletSize / 2,
            y: playerPos.current.y,
            damage: bulletDamage,
            size: bulletSize
          });
        }
        audio.playShoot(playerPos.current.x + PLAYER_WIDTH / 2);
        shotsFiredRef.current++;
        lastShotTime.current = now;
      }
    }

    // Update bullets
    const bulletList = bullets.current;
    for (let i = 0; i < bulletList.length; i++) {
      const b = bulletList[i];
      if (!b.alive) continue;
      b.x += (b.vx || 0) * timeScale.current * dt;
      b.y += (b.vy || -BULLET_SPEED) * timeScale.current * dt;

      if (b.y < -20 || b.y > CANVAS_HEIGHT + 20) {
        b.alive = false;
      }
    }

    // Update enemy bullets
    const currentEnemyBulletSpeed = (ENEMY_BULLET_SPEED + waveRef.current * 0.2) * worldSpeedScale;
    const enemyBulletList = enemyBullets.current;
    for (let i = 0; i < enemyBulletList.length; i++) {
      const b = enemyBulletList[i];
      if (!b.alive) continue;
      let vx = b.vx || 0;
      let vy = b.vy || currentEnemyBulletSpeed;

      if (b.isHoming) {
        const dx = (playerPos.current.x + PLAYER_WIDTH / 2) - b.x;
        const dy = (playerPos.current.y + PLAYER_HEIGHT / 2) - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0) {
          vx += (dx / dist) * 0.1 * dt;
          vy += (dy / dist) * 0.1 * dt;
        }

        // Cap speed
        const speed = Math.sqrt(vx * vx + vy * vy);
        if (speed > 4) {
          vx = (vx / speed) * 4;
          vy = (vy / speed) * 4;
        }
      }

      b.vx = vx;
      b.vy = vy;
      b.x += vx * worldSpeedScale * dt;
      b.y += vy * stageFlowScale * dt;

      // Deflected beams ricochet off canvas edges (up to max bounces)
      if (b.isBeam && b.deflected) {
        const MAX_BEAM_BOUNCES = 7;
        if (b.x < 0) { b.x = 0; b.vx = Math.abs(b.vx ?? 0); b.bounces = (b.bounces ?? 0) + 1; }
        else if (b.x > CANVAS_WIDTH) { b.x = CANVAS_WIDTH; b.vx = -Math.abs(b.vx ?? 0); b.bounces = (b.bounces ?? 0) + 1; }
        if (b.y < 0) { b.y = 0; b.vy = Math.abs(b.vy ?? 0); b.bounces = (b.bounces ?? 0) + 1; }
        else if (b.y > CANVAS_HEIGHT) { b.y = CANVAS_HEIGHT; b.vy = -Math.abs(b.vy ?? 0); b.bounces = (b.bounces ?? 0) + 1; }
        if ((b.bounces ?? 0) >= MAX_BEAM_BOUNCES) { b.alive = false; continue; }
      } else if (b.y > CANVAS_HEIGHT + 20 || b.y < -30 || b.x < -20 || b.x > CANVAS_WIDTH + 20) {
        b.alive = false;
      }
    }

    // Enemy random shooting
    const shootChance = Math.min(0.02 + waveRef.current * 0.005, 0.1);
    if (Math.random() < shootChance) {
      const aliveEnemies = enemies.current.filter(e => e.alive);
      if (aliveEnemies.length > 0) {
        const shooter = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];

        // Calculate angle towards player
        const dx = (playerPos.current.x + PLAYER_WIDTH / 2) - (shooter.x + shooter.width / 2);
        const dy = playerPos.current.y - (shooter.y + shooter.height);
        const distance = Math.sqrt(dx * dx + dy * dy);
        const baseAngle = Math.atan2(dy, dx);

        const shootPattern = (type: number) => {
          const bullets: any[] = [];
          if (type === 0) { // Scout: Single shot
            bullets.push({
              x: shooter.x + shooter.width / 2 - 2,
              y: shooter.y + shooter.height,
              vx: (dx / distance) * currentEnemyBulletSpeed,
              vy: (dy / distance) * currentEnemyBulletSpeed
            });
          } else if (type === 1) { // Interceptor: 2-shot burst
            for (let i = 0; i < 2; i++) {
              setTimeout(() => {
                if (!shooter.alive) return;
                spawnBullet(enemyBullets.current, {
                  x: shooter.x + shooter.width / 2 - 2,
                  y: shooter.y + shooter.height,
                  vx: (dx / distance) * currentEnemyBulletSpeed * 1.2,
                  vy: (dy / distance) * currentEnemyBulletSpeed * 1.2
                });
                audio.playEnemyShoot(shooter.x + shooter.width / 2);
              }, i * 150);
            }
          } else if (type === 2) { // Heavy: 3-way spread
            for (let i = -1; i <= 1; i++) {
              const angle = baseAngle + (i * 0.2);
              bullets.push({
                x: shooter.x + shooter.width / 2 - 2,
                y: shooter.y + shooter.height,
                vx: Math.cos(angle) * currentEnemyBulletSpeed * 0.8,
                vy: Math.sin(angle) * currentEnemyBulletSpeed * 0.8
              });
            }
          } else if (type === 3) { // Elite: 5-way aimed spread
            for (let i = -2; i <= 2; i++) {
              const angle = baseAngle + (i * 0.15);
              bullets.push({
                x: shooter.x + shooter.width / 2 - 2,
                y: shooter.y + shooter.height,
                vx: Math.cos(angle) * currentEnemyBulletSpeed,
                vy: Math.sin(angle) * currentEnemyBulletSpeed
              });
            }
          } else if (type === 4) { // Shielded: Rapid 3-shot burst
            for (let i = 0; i < 3; i++) {
              setTimeout(() => {
                if (!shooter.alive) return;
                spawnBullet(enemyBullets.current, {
                  x: shooter.x + shooter.width / 2 - 2,
                  y: shooter.y + shooter.height,
                  vx: (dx / distance) * currentEnemyBulletSpeed * 1.5,
                  vy: (dy / distance) * currentEnemyBulletSpeed * 1.5
                });
                audio.playEnemyShoot(shooter.x + shooter.width / 2);
              }, i * 100);
            }
          }
          return bullets;
        };

        const newBullets = shootPattern(shooter.type);
        newBullets.forEach(b => spawnBullet(enemyBullets.current, b));
        if (newBullets.length > 0) audio.playEnemyShoot(shooter.x + shooter.width / 2);
      }
    }

    // Update enemies formation
    const currentEnemyDiveSpeed = (ENEMY_DIVE_SPEED + waveRef.current * 0.2) * worldSpeedScale * dt;
    const formationOffset = (Math.sin(Date.now() / 1200) * 60);
    const currentTime = Date.now();

    enemies.current.forEach((enemy) => {
      if (!enemy.alive) return;

      enemy.prevX = enemy.x;
      enemy.prevY = enemy.y;

      // Stunned enemies drift on residual knockback, then resume normal behavior.
      if (enemy.stunnedUntil && enemy.stunnedUntil > currentTime) {
        enemy.x += (enemy.knockbackVX || 0) * dt;
        enemy.y += (enemy.knockbackVY || 0) * dt;
        const kbFric = 1 - 0.1 * dt;
        enemy.knockbackVX = (enemy.knockbackVX || 0) * kbFric;
        enemy.knockbackVY = (enemy.knockbackVY || 0) * kbFric;
        return;
      }

      enemy.knockbackVX = 0;
      enemy.knockbackVY = 0;

      // Graze Detection
      const edx = (playerPos.current.x + PLAYER_WIDTH / 2) - (enemy.x + enemy.width / 2);
      const edy = (playerPos.current.y + PLAYER_HEIGHT / 2) - (enemy.y + enemy.height / 2);
      const edist = Math.sqrt(edx * edx + edy * edy);
      if (edist < GRAZE_DISTANCE + 20 && edist > 25) {
        handleGraze(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2);
      }

      if (enemy.state === 'ENTERING') {
        if (enemy.entryDelay! > 0) {
          enemy.entryDelay! -= 16;
          return;
        }

        const target = enemy.path![enemy.pathIndex!];
        const dx = target.x - enemy.x;
        const dy = target.y - enemy.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 8) {
          enemy.pathIndex!++;
          if (enemy.pathIndex! >= enemy.path!.length) {
            enemy.state = 'IN_FORMATION';
          }
        } else {
          enemy.x += (dx / dist) * 8 * dt;
          enemy.y += (dy / dist) * 8 * dt;
        }
        return;
      }

      // Boss Logic
      if (enemy.isBoss) {
        // Boss Movement & Phase Logic
        if (enemy.y < enemy.originY) {
          enemy.y += 1 * dt; // Entry (frame-rate independent)
        } else {
          // Horizontal movement
          let moveSpeed = enemy.bossType === BossType.LASER ? 0.5 : 1.5;
          if (enemy.phase === 3) moveSpeed *= 1.5;

          enemy.x += (enemy.moveDir || 1) * moveSpeed * dt;
          if (enemy.x < 50 || enemy.x > CANVAS_WIDTH - enemy.width - 50) {
            enemy.moveDir = (enemy.moveDir || 1) * -1;
          }

          // LASER boss: sinusoidal float between originY and originY+50.
          // Using (sin+1)*25 keeps y always >= originY so the entry-descent
          // guard above never re-triggers and causes the "catching" stutter.
          if (enemy.bossType === BossType.LASER) {
            enemy.y = enemy.originY + (Math.sin(currentTime * 0.0007) + 1) * 25;
          }

          // Phase logic
          if (enemy.health! < enemy.maxHealth! * 0.3) enemy.phase = 3;
          else if (enemy.health! < enemy.maxHealth! * 0.6) enemy.phase = 2;

          // Boss specific behaviors
          if (enemy.bossType === BossType.TRACTOR) {
            enemy.tractorBeamTimer += dt * (1000 / 60) * timeScale.current;
            if (!enemy.isTractorBeaming && enemy.tractorBeamTimer > 3000) {
              enemy.isTractorBeaming = true;
              enemy.tractorBeamTimer = 0;
              enemy.tractorBeamX = enemy.x + enemy.width / 2;
              audio.playTractorBeam();
            }
            if (enemy.isTractorBeaming) {
              if (enemy.tractorBeamTimer > 3000) {
                enemy.isTractorBeaming = false;
                enemy.tractorBeamTimer = 0;
                isHackedRef.current = false;
              }
              const beamWidth = 120;
              const px = playerPos.current.x + PLAYER_WIDTH / 2;
              const py = playerPos.current.y + PLAYER_HEIGHT / 2;
              if (Math.abs(px - enemy.tractorBeamX!) < beamWidth / 2 && py > enemy.y) {
                playerPos.current.x += (enemy.tractorBeamX! - px) * 0.05;
                if (currentTime - lastTractorBeamDamageAt.current > 500) {
                  lastTractorBeamDamageAt.current = currentTime;
                  handlePlayerHit();
                }
                isHackedRef.current = true;
                glitch.current = 15;
              }
            }
          } else if (enemy.bossType === BossType.SWARM) {
            // Spawns small fast enemies (capped to avoid runaway array growth)
            let liveSubCount = 0;
            for (let si = 0; si < enemies.current.length; si++) {
              const e = enemies.current[si];
              if (e.alive && !e.isBoss) liveSubCount++;
            }
            // At reduced sim tier, cap sub-enemies at 4 — halves chase/render cost during SWARM fight.
            const swarmSubCap = isReducedSim ? 4 : 8;
            if (liveSubCount < swarmSubCap && currentTime - (enemy.lastShotTime || 0) > (enemy.phase === 3 ? 1400 : 2600)) {
              enemy.lastShotTime = currentTime;
              for (let i = 0; i < 2; i++) {
                const offsetX = (Math.random() - 0.5) * 60;
                const offsetY = (Math.random() - 0.5) * 40;
                const chaseTargetX = Math.max(40, Math.min(CANVAS_WIDTH - 40, playerPos.current.x + PLAYER_WIDTH / 2 + (Math.random() - 0.5) * 80));
                const chaseTargetY = Math.max(120, Math.min(CANVAS_HEIGHT * 0.72, playerPos.current.y + PLAYER_HEIGHT / 2 + (Math.random() - 0.5) * 60));
                const swarmEnemy: Enemy = {
                  ...createEnemy(enemy.x + enemy.width / 2 + offsetX, enemy.y + enemy.height + offsetY, 0),
                  isDiving: true,
                  diveType: 'chase',
                  // Keep chase targets near the player so attack runs stay hittable.
                  diveX: chaseTargetX,
                  diveY: chaseTargetY,
                  state: 'DIVING'
                };
                enemies.current.push(swarmEnemy);
              }
              audio.playDive(enemy.x);
            }
          } else if (enemy.bossType === BossType.TENTACLE) {
            // Tentacle Boss logic
            const time = currentTime / 1000;
            const tentacleCollisionStride = renderLoadTierRef.current === 2 ? 3 : renderLoadTierRef.current === 1 ? 2 : 1;
            enemy.x = CANVAS_WIDTH / 2 - enemy.width / 2 + Math.sin(time * 0.5) * 120;
            enemy.y = 100 + Math.cos(time * 0.3) * 40;

            if (enemy.tentacles) {
              enemy.tentacles.forEach((tentacle, tIdx) => {
                // Base rotation of the whole core
                const coreRotation = time * 0.4;
                tentacle.targetAngle = tentacle.baseAngle + coreRotation + Math.sin(time * 0.8 + tIdx) * 1.2;

                let prevX = enemy.x + enemy.width / 2;
                let prevY = enemy.y + enemy.height / 2;
                let currentAngle = tentacle.targetAngle;

                tentacle.segments.forEach((seg, sIdx) => {
                  const segLen = tentacle.length / tentacle.segments.length;
                  // Wavy motion for each segment
                  seg.angle = currentAngle + Math.sin(time * 2.5 + sIdx * 0.6) * 0.25;
                  seg.x = prevX + Math.cos(seg.angle) * segLen;
                  seg.y = prevY + Math.sin(seg.angle) * segLen;

                  const shieldCaughtTentacle = !isSlingshotAttacking && doesShieldCatchPoint(seg.x, seg.y, 8);
                  if (shieldCaughtTentacle && frameNow - lastTentacleShieldDeflectAt.current > TENTACLE_SHIELD_DEFLECT_COOLDOWN_MS) {
                    lastTentacleShieldDeflectAt.current = frameNow;

                    const tdx = seg.x - playerCenterX;
                    const tdy = seg.y - playerCenterY;
                    const tdist = Math.max(1, Math.sqrt(tdx * tdx + tdy * tdy));
                    const nx = tdx / tdist;
                    const ny = tdy / tdist;

                    seg.x += nx * 18;
                    seg.y += ny * 18;
                    seg.angle = Math.atan2(ny, nx);
                    tentacle.targetAngle += nx * 0.2;

                    enemy.knockbackVX = nx * TENTACLE_SHIELD_DEFLECT_KNOCKBACK;
                    enemy.knockbackVY = ny * (TENTACLE_SHIELD_DEFLECT_KNOCKBACK * 0.8);
                    enemy.stunnedUntil = Math.max(enemy.stunnedUntil || 0, currentTime + TENTACLE_SHIELD_DEFLECT_STUN_MS);

                    emitSlingshotShieldImpact(seg.x, seg.y, 1.15);
                    overdriveGauge.current = Math.max(0, overdriveGauge.current - 5);
                    setOverdrive(overdriveGauge.current);
                  }

                  // Collision with player
                  if (!shieldCaughtTentacle && sIdx % tentacleCollisionStride === 0) {
                    const pdx = (playerPos.current.x + PLAYER_WIDTH / 2) - seg.x;
                    const pdy = (playerPos.current.y + PLAYER_HEIGHT / 2) - seg.y;
                    if ((pdx * pdx + pdy * pdy) < 400 && invulnerableUntil.current < currentTime) {
                      handlePlayerHit();
                    }
                  }

                  prevX = seg.x;
                  prevY = seg.y;
                  currentAngle = seg.angle;
                });
              });
            }

            // Shooting from tentacle tips
            if (currentTime - (enemy.lastShotTime || 0) > 1800) {
              enemy.lastShotTime = currentTime;
              enemy.tentacles?.forEach(t => {
                const tip = t.segments[t.segments.length - 1];
                const dx = (playerPos.current.x + PLAYER_WIDTH / 2) - tip.x;
                const dy = (playerPos.current.y + PLAYER_HEIGHT / 2) - tip.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                spawnBullet(enemyBullets.current, {
                  x: tip.x, y: tip.y,
                  vx: (dx / dist) * 3.5, vy: (dy / dist) * 3.5
                });
              });
              audio.playEnemyShoot(enemy.x);
            }
          } else if (enemy.bossType === BossType.LASER) {
            // tractorBeamTimer is updated in loop() before hitstop — never freezes.
            const angle = (enemy.tractorBeamTimer / 1000) * Math.PI;
            // At reduced sim tier, cap to 2 beams — matches the render cap so player
            // is never hit by beams that are not drawn.
            const laserCount = (enemy.phase === 3 && !isReducedSim) ? 4 : 2;

            for (let i = 0; i < laserCount; i++) {
              const laserAngle = angle + (i * Math.PI * 2 / laserCount);
              const lx = enemy.x + enemy.width / 2;
              const ly = enemy.y + enemy.height / 2;

              // Check collision with player
              const px = playerPos.current.x + PLAYER_WIDTH / 2;
              const py = playerPos.current.y + PLAYER_HEIGHT / 2;

              const dx = px - lx;
              const dy = py - ly;
              const dist = Math.sqrt(dx * dx + dy * dy);
              const playerAngle = Math.atan2(dy, dx);

              let diff = Math.abs(playerAngle - laserAngle) % (Math.PI * 2);
              if (diff > Math.PI) diff = Math.PI * 2 - diff;

              // Keep hit width closer to the visible core so the boss stays readable.
              const hitThreshold = Math.max(enemy.phase === 3 ? 0.09 : 0.075, 30 / Math.max(dist, 1));
              if (diff < hitThreshold && dist < 1000 && dist > 50) {
                shake.current = 5;
                // Slightly slower tick to leave room for recovery while crossing a beam.
                if (!enemy.laserHitTime) enemy.laserHitTime = 0;
                if (currentTime - enemy.laserHitTime > 280) {
                  enemy.laserHitTime = currentTime;
                  handlePlayerHit();
                }
              }
            }
          }

          // General Boss Shooting
          let shootInterval = enemy.phase === 3 ? 600 : enemy.phase === 2 ? 1000 : 1500;
          if (enemy.bossType === BossType.SWARM) {
            shootInterval += 400;
          }
          if (currentTime - (enemy.lastShotTime || 0) > shootInterval) {
            enemy.lastShotTime = currentTime;
            audio.playEnemyShoot(enemy.x + enemy.width / 2);
            // Spread shot
            const count = enemy.bossType === BossType.SWARM
              ? (enemy.phase === 3 ? 5 : 3)
              : (enemy.phase === 3 ? 7 : 5);
            for (let i = 0; i < count; i++) {
              const angle = (Math.PI / count) * i + Math.PI / 4;
              spawnBullet(enemyBullets.current, {
                x: enemy.x + enemy.width / 2,
                y: enemy.y + enemy.height,
                vx: Math.cos(angle) * 4,
                vy: Math.sin(angle) * 4
              });
            }
          }
        }
        return;
      }

      if (enemy.isTurret) {
        const shootInterval = 2000 - Math.min(1000, waveRef.current * 50);
        if (currentTime - (enemy.lastShotTime || 0) > shootInterval) {
          enemy.lastShotTime = currentTime;
          audio.playEnemyShoot(enemy.x + enemy.width / 2);
          const dx = (playerPos.current.x + PLAYER_WIDTH / 2) - (enemy.x + enemy.width / 2);
          const dy = playerPos.current.y - (enemy.y + enemy.height / 2);
          const dist = Math.sqrt(dx * dx + dy * dy);
          spawnBullet(enemyBullets.current, {
            x: enemy.x + enemy.width / 2,
            y: enemy.y + enemy.height / 2,
            vx: (dx / dist) * 3,
            vy: (dy / dist) * 3
          });
        }
        return;
      }

      enemy.originY += (0.01 + (waveRef.current * 0.002)) * dt;

      if (!enemy.isDiving && !enemy.isReturning) {
        if (enemy.state === 'IN_FORMATION') {
          // Smoothly interpolate to the formation position instead of snapping
          const targetX = enemy.originX + formationOffset;
          const targetY = enemy.originY;
          // Slower lerp to allow separation force to win
          enemy.x += (targetX - enemy.x) * 0.05 * dt;
          enemy.y += (targetY - enemy.y) * 0.05 * dt;
        }
      } else if (enemy.isDiving) {
        enemy.diveTime = (enemy.diveTime || 0) + 1 * dt;

        if (enemy.diveTime < 0) {
          // Waiting to dive, smoothly follow formation instead of snapping
          const targetX = enemy.originX + formationOffset;
          const targetY = enemy.originY;
          enemy.x += (targetX - enemy.x) * 0.1 * dt;
          enemy.y += (targetY - enemy.y) * 0.1 * dt;
          enemy.diveStartX = enemy.x;
          enemy.diveStartY = enemy.y;
          return;
        }

        if (enemy.diveType === 'loop') {
          const t = enemy.diveTime;
          const prevT = t - 1 * dt;

          const loopRadius = 70 * enemy.amplitudeScale;
          const loopSpeed = 0.08 * enemy.speedScale;
          const loopDuration = Math.PI * 2 / loopSpeed;

          const getLoopPos = (time: number) => {
            const cappedAngle = Math.max(0, Math.min(time * loopSpeed, Math.PI * 2));
            const direction = (enemy.diveX || 1) > 0 ? 1 : -1;
            const ox = Math.sin(cappedAngle) * loopRadius * direction;
            const oy = (1 - Math.cos(cappedAngle)) * loopRadius;

            let cy = enemy.diveStartY || enemy.originY;
            if (time <= loopDuration) {
              cy += Math.max(0, time) * currentEnemyDiveSpeed * 0.4 * enemy.speedScale;
            } else {
              cy += loopDuration * currentEnemyDiveSpeed * 0.4 * enemy.speedScale + (time - loopDuration) * currentEnemyDiveSpeed * enemy.speedScale;
            }

            return {
              x: (enemy.diveStartX || enemy.originX) + (enemy.diveX || 0) * time + ox,
              y: cy + oy
            };
          };

          const p1 = getLoopPos(prevT);
          const p2 = getLoopPos(t);

          // Apply the DELTA (change in position) instead of absolute assignment.
          // This allows the separation force from the previous frame to persist.
          enemy.x += (p2.x - p1.x);
          enemy.y += (p2.y - p1.y);

          // Fail-safe: if loop dive takes too long, force a return to formation.
          // Prevents off-screen looping enemies from stalling wave flow.
          if (t > loopDuration + 70) {
            enemy.isDiving = false;
            enemy.isReturning = true;
            enemy.state = 'RETURNING';
            enemy.diveTime = 0;
          }
        } else if (enemy.diveType === 'chase') {
          const chaseLockFrames = 30;
          const chaseAbortFrames = 96;
          const chaseReachDistance = 18;
          const chaseExitY = CANVAS_HEIGHT + 80;
          const liveTargetX = Math.max(40, Math.min(CANVAS_WIDTH - 40, playerPos.current.x + PLAYER_WIDTH / 2));
          const liveTargetY = Math.max(120, Math.min(CANVAS_HEIGHT * 0.72, playerPos.current.y + PLAYER_HEIGHT / 2));

          if (enemy.diveTime < chaseLockFrames) {
            enemy.diveX = (enemy.diveX || liveTargetX) * 0.82 + liveTargetX * 0.18;
            enemy.diveY = (enemy.diveY || liveTargetY) * 0.82 + liveTargetY * 0.18;
          } else {
            enemy.diveX = enemy.x;
            enemy.diveY = chaseExitY;
          }

          // Under reduced sim, use stride sampling for chase enemies (skip sqrt every frame)
          const chaseEnemyStride = isCriticalSim ? 4 : isReducedSim ? 2 : 1;
          const shouldUpdateChase = frameCounterRef.current % chaseEnemyStride === 0;

          if (shouldUpdateChase) {
            const dx = (enemy.diveX || 0) - enemy.x;
            const dy = (enemy.diveY || 0) - enemy.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > chaseReachDistance) {
              enemy.x += (dx / dist) * enemy.speedScale * currentEnemyDiveSpeed * 1.5 * dt;
              enemy.y += (dy / dist) * enemy.speedScale * currentEnemyDiveSpeed * 1.5 * dt;
            } else {
              enemy.diveX = enemy.x;
              enemy.diveY = chaseExitY;
              enemy.y += currentEnemyDiveSpeed * enemy.speedScale * 1.35 * dt;
            }
          } else {
            // Keep position unchanged this frame
            enemy.y += currentEnemyDiveSpeed * enemy.speedScale * dt;
          }

          if (enemy.diveTime > chaseAbortFrames) {
            enemy.isDiving = false;
            enemy.isReturning = true;
            enemy.state = 'RETURNING';
            enemy.diveTime = 0;
          }
        } else {
          enemy.y += currentEnemyDiveSpeed * enemy.speedScale * dt;

          if (enemy.diveType === 'zigzag') {
            enemy.x += (enemy.diveX + Math.sin(enemy.diveTime / 10) * 4 * enemy.amplitudeScale) * dt;
          } else if (enemy.diveType === 'sweep') {
            enemy.x += (enemy.diveX + Math.sin(enemy.diveTime / 40) * 6 * enemy.amplitudeScale) * dt;
          } else if (enemy.diveType === 'sine') {
            enemy.x += (enemy.diveX + Math.sin(enemy.diveTime / 15) * 8 * enemy.amplitudeScale) * dt;
            enemy.y += currentEnemyDiveSpeed * 0.8 * enemy.speedScale * dt;
          } else if (enemy.diveType === 'spread') {
            enemy.x += enemy.diveX * dt;
          } else {
            enemy.x += (enemy.diveX + Math.sin(enemy.diveTime / 20) * 2 * enemy.amplitudeScale) * dt;
          }
        }

        if (enemy.diveType === 'uturn' && enemy.turnY && enemy.y > enemy.turnY) {
          enemy.isDiving = false;
          enemy.isReturning = true;
          enemy.state = 'RETURNING';
        } else if (enemy.diveType === 'chase') {
          if (enemy.y > CANVAS_HEIGHT + 80 || enemy.x < -140 || enemy.x > CANVAS_WIDTH + 140) {
            enemy.isDiving = false;
            enemy.isReturning = true;
            enemy.state = 'RETURNING';
            enemy.diveTime = 0;
          }
        } else if (enemy.y > CANVAS_HEIGHT) {
          enemy.y = -40;
          enemy.isDiving = false;
          enemy.isReturning = true;
          enemy.state = 'RETURNING';
        }
      } else if (enemy.isReturning) {
        const targetX = enemy.originX + formationOffset;
        const targetY = enemy.originY;

        const dx = targetX - enemy.x;
        const dy = targetY - enemy.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < currentEnemyDiveSpeed) {
          enemy.isReturning = false;
          enemy.state = 'IN_FORMATION';
          // No snapping, let the IN_FORMATION lerp handle the final alignment
        } else {
          enemy.x += (dx / dist) * currentEnemyDiveSpeed;
          enemy.y += (dy / dist) * currentEnemyDiveSpeed;
        }
      }
    });

    // Final Separation Pass (Post-movement)
    // This ensures enemies don't overlap even if their formulas try to put them in the same spot
    // Mobile: skip every other frame at tier 0–1; skip entirely at tier 2 (saves O(n²) work).
    const runSeparation = !isMobile
      ? true
      : isCriticalSim ? false : frameCounterRef.current % 2 === 0;
    if (runSeparation) enemies.current.forEach((enemy) => {
      if (!enemy.alive || enemy.state === 'ENTERING' || enemy.isBoss) return;

      enemies.current.forEach((other) => {
        if (enemy === other || !other.alive || other.state === 'ENTERING' || other.isBoss) return;

        const dx = enemy.x - other.x;
        const dy = enemy.y - other.y;
        let distSq = dx * dx + dy * dy;
        const minDist = 38; // Slightly larger than enemy width (35)

        if (distSq < minDist * minDist) {
          let dist = Math.sqrt(distSq);
          let moveX, moveY;

          if (dist < 0.1) {
            const angle = Math.random() * Math.PI * 2;
            moveX = Math.cos(angle) * 5; // Explosive push for perfect overlap
            moveY = Math.sin(angle) * 5;
          } else {
            // Very strong force to ensure separation during fast movement
            const force = (minDist - dist) / minDist * 3.5;
            moveX = (dx / dist) * force + (Math.random() - 0.5) * 0.5; // Add jitter
            moveY = (dy / dist) * force + (Math.random() - 0.5) * 0.5;
          }

          // ONLY move the visual position.
          // NEVER modify originX/Y here.
          enemy.x += moveX;
          enemy.y += moveY;

          if (enemy.isDiving) {
            if (enemy.diveStartX != null) enemy.diveStartX += moveX;
            if (enemy.diveStartY != null) enemy.diveStartY += moveY;
          }
        }
      });
    });

    // Enemy-block collision pass: enemies are deflected by WALLs and destroy
    // destructible blocks on contact (same as the player, but enemies don't
    // take damage from blocks). Only run when maze blocks are present.
    if (blocks.current.length > 0) {
      enemies.current.forEach((enemy) => {
        if (!enemy.alive || enemy.isBoss || enemy.state === 'ENTERING') return;

        for (const block of blocks.current) {
          if (block.hp <= 0) continue;
          if (
            enemy.x + enemy.width <= block.x || enemy.x >= block.x + block.width ||
            enemy.y + enemy.height <= block.y || enemy.y >= block.y + block.height
          ) continue;

          if (block.type === 'WALL' || block.type === 'TURRET_BLOCK' || block.type === 'WINDMILL') {
            // Push enemy out horizontally; persist via diveStartX so the next
            // frame's movement formula doesn't immediately snap them back.
            const overlapL = (enemy.x + enemy.width) - block.x;
            const overlapR = (block.x + block.width) - enemy.x;
            const push = overlapL < overlapR ? -overlapL : overlapR;
            enemy.x += push;
            if (enemy.diveStartX != null) enemy.diveStartX += push;
          } else if (block.type !== 'TENTACLE') {
            // Enemy rams through destructible blocks, destroying them.
            block.hp = 0;
            triggerChainExplosion(block);
          }
        }
      });
    }

    // Formation dive
    const currentDiveTime = Date.now();
    const diveInterval = Math.max(1500, 3200 - waveRef.current * 150);
    if (currentDiveTime - lastDiveTime.current > diveInterval) {
      const aliveEnemies = enemies.current.filter(e => e.alive && e.state === 'IN_FORMATION');
      if (aliveEnemies.length > 0) {
        // Pick a leader
        const leader = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];

        // Find wingmen (closest enemies to the leader)
        const others = aliveEnemies.filter(e => e !== leader);
        others.sort((a, b) => {
          const distA = Math.abs(a.originX - leader.originX) + Math.abs(a.originY - leader.originY);
          const distB = Math.abs(b.originX - leader.originX) + Math.abs(b.originY - leader.originY);
          return distA - distB;
        });

        const maxSquadSize = Math.min(8, 3 + Math.floor(waveRef.current / 2));
        const squadSize = Math.min(Math.floor(Math.random() * maxSquadSize) + 1, aliveEnemies.length);
        const squad = [leader];
        for (let i = 0; i < squadSize - 1; i++) {
          squad.push(others[i]);
        }

        const diveTypes = ['loop', 'normal', 'uturn', 'zigzag', 'sweep', 'spread'];
        // Unlock more dive types as waves progress
        const availableTypesCount = Math.min(diveTypes.length, 2 + Math.floor(waveRef.current / 2));
        const availableTypes = diveTypes.slice(0, availableTypesCount);

        // Pick dive type based on leader's type
        let diveType: any;
        if (leader.type === 0) { // Scout: Fast & Simple
          diveType = Math.random() > 0.5 ? 'normal' : 'sweep';
        } else if (leader.type === 1) { // Interceptor: Agile
          diveType = Math.random() > 0.5 ? 'zigzag' : 'uturn';
        } else if (leader.type === 2) { // Heavy: Steady
          diveType = Math.random() > 0.5 ? 'spread' : 'sine';
        } else { // Elite: Complex
          diveType = Math.random() > 0.5 ? 'loop' : 'zigzag';
        }

        // Fallback to available types if chosen type isn't unlocked yet
        if (!availableTypes.includes(diveType)) {
          diveType = availableTypes[Math.floor(Math.random() * availableTypes.length)];
        }

        const turnY = playerPos.current.y - 150 + Math.random() * 100;
        const baseDiveX = (playerPos.current.x - leader.x) / 120;

        squad.forEach((diver, index) => {
          diver.isDiving = true;
          diver.state = 'DIVING';
          // Add significant jitter to diveTime to stagger the dive
          diver.diveTime = -index * 20 + (Math.random() - 0.5) * 25; // Increased stagger
          diver.diveStartX = diver.x + (Math.random() - 0.5) * 20; // More jitter
          diver.diveStartY = diver.y + (Math.random() - 0.5) * 20; // Add jitter to Y too

          diver.speedScale = 0.85 + Math.random() * 0.3; // More speed variance
          diver.amplitudeScale = 0.7 + Math.random() * 0.6; // More movement variance

          if (diveType === 'spread') {
            // Spread out from the center
            const spreadFactor = (index - (squadSize - 1) / 2) * 2.5;
            diver.diveX = baseDiveX + spreadFactor;
          } else {
            // Add jitter to diveX even in parallel formation
            diver.diveX = baseDiveX + (Math.random() - 0.5) * 0.8;
          }

          diver.diveType = diveType;
          diver.turnY = turnY;
        });

        lastDiveTime.current = currentDiveTime;
        audio.playDive(leader.x + leader.width / 2);
      }
    }

    // Collision detection
    const hasAliveBoss = enemies.current.some(e => e.alive && e.isBoss);
    if (!hasAliveBoss) {
      repairDropsDuringBossRef.current = 0;
    }
    const playerBullets = bullets.current;

    for (let i = 0; i < playerBullets.length; i++) {
      const bullet = playerBullets[i];
      if (!bullet.alive) continue;

      for (let j = 0; j < enemies.current.length; j++) {
        const enemy = enemies.current[j];
        if (!enemy.alive) continue;
        if (enemy.state === 'ENTERING') continue; // Immune while forming up (Galaga-style)
        if (bullet.x > enemy.x && bullet.x < enemy.x + enemy.width &&
            bullet.y > enemy.y && bullet.y < enemy.y + enemy.height) {

          let damage = (bullet.damage || 1) * 10;
          let isCrit = false;
          if (Math.random() < critChanceRef.current) {
            damage *= 2;
            isCrit = true;
          }

          // Damage Number
          damageNumbers.current.push({
            x: enemy.x + enemy.width / 2 + (Math.random() - 0.5) * 20,
            y: enemy.y,
            value: damage,
            life: 30,
            maxLife: 30,
            color: isCrit ? '#ffcc00' : '#ffffff',
            isCrit
          });

          // Tesla Arc (Chain Lightning)
          if (chainLightningRef.current > 0) {
            enemies.current.forEach(e => {
              if (!e.alive || e === enemy) return;
              const edx = enemy.x - e.x;
              const edy = enemy.y - e.y;
              const edist = Math.sqrt(edx * edx + edy * edy);
              if (edist < 100) {
                const chainDamage = damage * chainLightningRef.current;
                if (e.isBoss) {
                  e.health! -= chainDamage;
                } else {
                  e.health! = (e.health || 10) - chainDamage;
                  if (e.health! <= 0) e.alive = false;
                }
                createExplosion(e.x + e.width / 2, e.y + e.height / 2, '#00ffff', 3);
              }
            });
          }

          // Hit stop (milliseconds) — skip while any boss is alive: rapid fire on bosses or
          // on SWARM enemies during a boss wave causes repeated 33ms freezes that visibly
          // stutter the laser beam rotation.
          if (!enemy.isBoss && !bossAlive) hitStopTimer.current = Date.now() + 33;

          // EMP Burst
          if (hasEMP && Math.random() < 0.1) {
            enemy.stunnedUntil = Date.now() + 2000;
            createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#ff3366', 10);
          }

          if (enemy.isBoss) {
            enemy.health! -= damage;
            // Throttle React state update: during Overdrive ≈75 hits/s → 60ms cap prevents
            // that many re-renders from stalling the game loop on mobile.
            const bossNow = Date.now();
            if (bossNow - lastBossHealthUpdateAt.current >= (isMobile ? 60 : 16)) {
              setBossHealth({ current: enemy.health!, max: enemy.maxHealth! });
              lastBossHealthUpdateAt.current = bossNow;
            }
            bullet.alive = false;
            audio.playEnemyHit(enemy.x + enemy.width / 2);
            flash.current = 0.2;

            if (enemy.health! <= 0) {
              enemy.alive = false;

              // Chrono Trigger
              if (hasChrono && !isOverdriveActiveRef.current && Math.random() < 0.15) {
                timeScale.current = 0.3;
              }

              setBossHealth(null);
              setScore(s => s + 5000 * (waveRef.current / 5));

              // Reward Dual Fighter if hacked by Mid-Boss
              if (waveRef.current === 6 && isHackedRef.current) {
                setHasWingman(true);
                wingmanRef.current = true;
                wingmanPos.current = { x: playerPos.current.x, y: playerPos.current.y };
                isHackedRef.current = false; // Clear hack status
              }

              if (enemy.isFinalBoss) {
                victoryPendingRef.current = true;
                setVictoryStats({
                  survivalMs: Date.now() - gameSessionStartRef.current,
                  shotsFired: shotsFiredRef.current,
                  shotsHit: shotsHitRef.current,
                  hitsTaken: hitsTakenRef.current,
                  maxCombo: maxComboRef.current,
                  grazes: grazeCount.current,
                });
                setGameState('VICTORY');
              }

              audio.playExplosion(enemy.x + enemy.width / 2);
              createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#ff33cc', 100);

              // Drop many scraps
              for (let i = 0; i < 20; i++) {
                spawnScrap(scraps.current, {
                  x: enemy.x + enemy.width / 2,
                  y: enemy.y + enemy.height / 2,
                  vx: (Math.random() - 0.5) * 10,
                  vy: (Math.random() - 0.5) * 10,
                  life: 1
                });
              }

              // Big explosion
              createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#ff33cc', 100);
              shake.current = 30;
            }
            return;
          }

          enemy.alive = false;

          // Overdrive Chain Explosion
          if (isOverdriveActiveRef.current) {
            createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#ff3366', 50);
            // Damage nearby enemies
            enemies.current.forEach(other => {
              if (!other.alive || other === enemy) return;
              const dx = (other.x + other.width/2) - (enemy.x + enemy.width/2);
              const dy = (other.y + other.height/2) - (enemy.y + enemy.height/2);
              const dist = Math.sqrt(dx*dx + dy*dy);
              if (dist < 150) {
                other.health = (other.health || 0) - 50;
                if (other.health <= 0) other.alive = false;
              }
            });
          }

          // Chrono Trigger — suppressed during boss wave: repeated SWARM kills would make
          // timeScale spike to 0.3 repeatedly, causing the laser beam to visually stutter.
          if (hasChrono && !isOverdriveActiveRef.current && !bossAlive && Math.random() < 0.15) {
            timeScale.current = 0.3;
          }
          bullet.alive = false;

          // Drop scrap
          const scrapChance = isOverdriveActiveRef.current ? 1.0 : 0.6;
          const scrapCount = isOverdriveActiveRef.current ? 3 : 1;
          if (Math.random() < scrapChance) {
            for (let k = 0; k < scrapCount; k++) {
              spawnScrap(scraps.current, {
                x: enemy.x + enemy.width / 2,
                y: enemy.y + enemy.height / 2,
                vx: (Math.random() - 0.5) * (isOverdriveActiveRef.current ? 8 : 4),
                vy: (Math.random() - 0.5) * (isOverdriveActiveRef.current ? 8 : 4),
                life: 1
              });
            }
          }

          // Combo system
          const now = Date.now();
          if (now - lastHitTime.current < 1000) {
            comboRef.current += 1;
          } else {
            comboRef.current = 1;
          }
          lastHitTime.current = now;
          setCombo(comboRef.current);
          shotsHitRef.current++;
          if (comboRef.current > maxComboRef.current) maxComboRef.current = comboRef.current;

          const basePoints = enemy.isDiving ? 250 : 100;
          const comboBonus = Math.floor(basePoints * (comboRef.current - 1) * 0.1);
          setScore((s) => s + basePoints + comboBonus);

          // Emergency repair drop: low chance, cooldown-gated, with low-HP bias.
          if (integrityRef.current < 100) {
            const repairDropNow = Date.now();
            const lowHpBonus = integrityRef.current <= REPAIR_POWERUP_LOW_HP_THRESHOLD
              ? REPAIR_POWERUP_LOW_HP_MULTIPLIER
              : 1;
            const repairDropChance = REPAIR_POWERUP_BASE_DROP_CHANCE * lowHpBonus;
            const repairCooldownReady = repairDropNow - lastRepairDropAt.current >= REPAIR_POWERUP_DROP_COOLDOWN_MS;
            const bossRepairCapReached = hasAliveBoss && repairDropsDuringBossRef.current >= REPAIR_POWERUP_MAX_DURING_BOSS;

            if (repairCooldownReady && !bossRepairCapReached && Math.random() < repairDropChance) {
              powerUps.current.push({
                x: enemy.x + enemy.width / 2,
                y: enemy.y + enemy.height / 2,
                type: 'REPAIR',
                life: 1,
              });
              lastRepairDropAt.current = repairDropNow;
              if (hasAliveBoss) {
                repairDropsDuringBossRef.current += 1;
              }
            }
          }

          // Spawn Power-up chance
          if (Math.random() < 0.08) {
            const types: PowerUp['type'][] = ['MULTISHOT', 'SHIELD', 'RAPIDFIRE'];
            powerUps.current.push({
              x: enemy.x + enemy.width / 2,
              y: enemy.y + enemy.height / 2,
              type: types[Math.floor(Math.random() * types.length)],
              life: 1
            });
          }

          audio.playEnemyHit(enemy.x + enemy.width / 2);
          shake.current = Math.max(shake.current, 5);

          // Spawn particles
          const colors = ['#ffcc00', '#ff33cc', '#33ccff'];
          createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, colors[enemy.type] || '#ffcc00', 30);

          break; // Bullet hit an enemy, move to next bullet
        }
      }
    }

    // Player collision (smaller hitbox for dodging)
    const hitMargin = 15;
    const px = playerPos.current.x + hitMargin;
    const py = playerPos.current.y + hitMargin;
    const pw = PLAYER_WIDTH - hitMargin * 2;
    const ph = PLAYER_HEIGHT - hitMargin * 2;
    // Swept box: union of previous and current player positions — prevents tunneling at high velocity
    const prevPx = prevPlayerPos.current.x + hitMargin;
    const prevPy = prevPlayerPos.current.y + hitMargin;
    const sweptLeft   = Math.min(px, prevPx);
    const sweptTop    = Math.min(py, prevPy);
    const sweptRight  = Math.max(px + pw, prevPx + pw);
    const sweptBottom = Math.max(py + ph, prevPy + ph);

    let playerHit = false;

    for (let i = 0; i < enemies.current.length; i++) {
      const enemy = enemies.current[i];
      if (!enemy.alive) continue;
      const inPlayerBox = isSlingshotAttacking ? (
        enemy.x < sweptRight &&
        enemy.x + enemy.width > sweptLeft &&
        enemy.y < sweptBottom &&
        enemy.y + enemy.height > sweptTop
      ) : (
        enemy.x < px + pw &&
        enemy.x + enemy.width > px &&
        enemy.y < py + ph &&
        enemy.y + enemy.height > py
      );
      // Shield arc catches enemies even before they reach the player body.
      // Wall must be active (isShieldObstacleRecoilPhase) — requires energy >= Stage 2 during drag.
      const shieldCatch = isShieldObstacleRecoilPhase
        && (doesShieldCatchRect(enemy.x, enemy.y, enemy.width, enemy.height, 10)
          || doesShieldCatchAtPrev(enemy.x, enemy.y, enemy.width, enemy.height, 10));
      if (!inPlayerBox && !shieldCatch) continue;

      if ((isSlingshotAttacking || isOverdriveActiveRef.current) && inPlayerBox) {
          // Offensive collision: Damage enemy
          const damage = isOverdriveActiveRef.current ? 1000 : 150;
          enemy.health! -= damage;

          if (isSlingshotAttacking) {
            if (!bossAlive) hitStopTimer.current = Date.now() + 60; // suppress during boss wave
            shake.current = Math.max(shake.current, 20);
            createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#ffffff', 40);
            createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#00ffcc', 30);
          }

          if (enemy.health! <= 0) {
            enemy.alive = false;
            createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#00ffcc', 40);
            audio.playEnemyHit(enemy.x + enemy.width / 2);
            if (isSlingshotAttacking) {
              registerSlingshotCombo(enemy.isDiving ? 280 : 180);
            }
          } else {
            createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#ffffff', 15);
            audio.playEnemyHit(enemy.x + enemy.width / 2);
          }
          shake.current = Math.max(shake.current, 8);
          // Bounce slightly on impact to feel 'physical'
          playerVel.current.x *= 0.8;
          playerVel.current.y *= 0.8;
      } else if (shieldCatch) {
          const enemyCenterX = enemy.x + enemy.width / 2;
          const enemyCenterY = enemy.y + enemy.height / 2;
          const dx = enemyCenterX - playerCenterX;
          const dy = enemyCenterY - playerCenterY;
          const pushDist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
          const wasDiving = enemy.isDiving;
          const pushStrength = enemy.isBoss ? 8 : wasDiving ? 18 : 12;
          enemy.x += (dx / pushDist) * pushStrength;
          enemy.y += (dy / pushDist) * pushStrength;
          if (!enemy.isBoss) {
            const stunMs = wasDiving ? SLINGSHOT_SHIELD_DIVE_STUN_MS : SLINGSHOT_SHIELD_STUN_MS;
            const knockback = wasDiving ? SLINGSHOT_SHIELD_DIVE_KNOCKBACK : SLINGSHOT_SHIELD_KNOCKBACK;
            enemy.stunnedUntil = Math.max(enemy.stunnedUntil, frameNow + stunMs);
            enemy.knockbackVX = (dx / pushDist) * knockback;
            enemy.knockbackVY = (dy / pushDist) * knockback;
            if (wasDiving) {
              enemy.isDiving = false;
              enemy.isReturning = true;
              enemy.state = 'RETURNING';
            }
          } else {
            enemy.knockbackVX = (dx / pushDist) * SLINGSHOT_SHIELD_BOSS_KNOCKBACK;
            enemy.knockbackVY = (dy / pushDist) * SLINGSHOT_SHIELD_BOSS_KNOCKBACK;
          }
          emitSlingshotShieldImpact(enemyCenterX, enemyCenterY, enemy.isBoss ? 1.4 : 1);
          const shieldOdCost = enemy.isBoss ? 20 : 12;
          overdriveGauge.current = Math.max(0, overdriveGauge.current - shieldOdCost);
          setOverdrive(overdriveGauge.current);
          // Player recoil: equal and opposite to the enemy push
          const shieldRecoilMag = enemy.isBoss ? 8 : wasDiving ? 10 : 6;
          playerVel.current.x -= (dx / pushDist) * shieldRecoilMag;
          playerVel.current.y -= (dy / pushDist) * shieldRecoilMag;
      } else if (inPlayerBox) {
          playerHit = true;
      }
    }

    const eBullets = enemyBullets.current;
    // Accumulators for guard-window bullet absorption — flush once after loop.
    let guardHpGain = 0;
    let guardOdGain = 0;
    for (let i = 0; i < eBullets.length; i++) {
      const bullet = eBullets[i];
      if (!bullet.alive) continue;
      const bulletCenterX = bullet.x + 2;
      const bulletCenterY = bullet.y + 6;
      // Graze Detection for bullets
      const bdx = (playerPos.current.x + PLAYER_WIDTH / 2) - bulletCenterX;
      const bdy = (playerPos.current.y + PLAYER_HEIGHT / 2) - bulletCenterY;
      const bdist = Math.sqrt(bdx * bdx + bdy * bdy);

      if (bdist < GRAZE_DISTANCE && bdist > 15) {
        handleGraze(bulletCenterX, bulletCenterY);
      }

      // Beam deflection: slingshot shield reflects BEAM_TURRET beams using proper mirror-reflection.
      // The reflected beam then ricochets off walls and destroys enemies/blocks it hits.
      if (bullet.isBeam) {
        if (!bullet.deflected && doesShieldCatchPoint(bulletCenterX, bulletCenterY, 8)) {
          // Mirror-reflection: v' = v - 2(v·n)n, where n = normalized vector from player center to bullet
          const pcx = playerPos.current.x + PLAYER_WIDTH / 2;
          const pcy = playerPos.current.y + PLAYER_HEIGHT / 2;
          const nx = bulletCenterX - pcx;
          const ny = bulletCenterY - pcy;
          const nlen = Math.sqrt(nx * nx + ny * ny) || 1;
          const nnx = nx / nlen;
          const nny = ny / nlen;
          const dot = (bullet.vx ?? 0) * nnx + (bullet.vy ?? 2.4) * nny;
          // Boost speed by 1.3× on deflect to make the ricochet feel punchy
          const speed = Math.sqrt((bullet.vx ?? 0) ** 2 + (bullet.vy ?? 2.4) ** 2) * 1.3;
          let rvx = (bullet.vx ?? 0) - 2 * dot * nnx;
          let rvy = (bullet.vy ?? 2.4) - 2 * dot * nny;
          const rspeed = Math.sqrt(rvx * rvx + rvy * rvy) || 1;
          bullet.vx = (rvx / rspeed) * speed;
          bullet.vy = (rvy / rspeed) * speed;
          bullet.deflected = true;
          bullet.bounces = 0;
          emitSlingshotShieldImpact(bulletCenterX, bulletCenterY, 1.8);
        } else if (!bullet.deflected && bullet.x > px && bullet.x < px + pw && bullet.y > py && bullet.y < py + ph) {
          playerHit = true;
          eBullets[i].alive = false;
        }
        continue;
      }

      if (doesShieldCatchPoint(bulletCenterX, bulletCenterY, 4)) {
          emitSlingshotShieldImpact(bulletCenterX, bulletCenterY, 0.9);
          if (wallModeRef.current === 'HP_ABSORB' && integrityRef.current < 100) {
            const healed = Math.min(100, integrityRef.current + 1);
            guardHpGain += healed - integrityRef.current;
            integrityRef.current = healed;
          } else {
            overdriveGauge.current = Math.min(MAX_OVERDRIVE, overdriveGauge.current + 2);
            guardOdGain += 2;
          }
          eBullets[i].alive = false;
          continue;
      }

      if (bullet.x > px && bullet.x < px + pw &&
          bullet.y > py && bullet.y < py + ph) {
        playerHit = true;
        eBullets[i].alive = false;
      }
    }
    // Flush guard-window absorption state — single React render regardless of how many bullets were caught.
    if (guardHpGain > 0) setIntegrity(integrityRef.current);
    if (guardOdGain > 0) setOverdrive(overdriveGauge.current);

    // Emergency spacing: if durable enemies and bullets overfill the local area, clear a minimal escape lane.
    if (
      gameState === 'PLAYING'
      && currentStage > 1
      && frameNow - lastAutoSpaceAt.current > AUTO_SPACE_COOLDOWN_MS
    ) {
      const playerCX = playerPos.current.x + PLAYER_WIDTH / 2;
      const playerCY = playerPos.current.y + PLAYER_HEIGHT / 2;

      const hardEnemies = enemies.current.filter((enemy) => {
        if (!enemy.alive || enemy.isBoss) return false;
        const isDurableType = enemy.type >= 2 || enemy.type === 4;
        if (!isDurableType) return false;
        const enemyCX = enemy.x + enemy.width / 2;
        const enemyCY = enemy.y + enemy.height / 2;
        const dx = enemyCX - playerCX;
        const dy = enemyCY - playerCY;
        return (dx * dx + dy * dy) <= AUTO_SPACE_HARD_ENEMY_RADIUS * AUTO_SPACE_HARD_ENEMY_RADIUS;
      });

      const nearbyBulletIndices: { index: number; distSq: number }[] = [];
      for (let _bi = 0; _bi < eBullets.length; _bi++) {
        const bullet = eBullets[_bi];
        if (!bullet.alive) continue;
        const bx = bullet.x + 2;
        const by = bullet.y + 6;
        const dx = bx - playerCX;
        const dy = by - playerCY;
        const distSq = dx * dx + dy * dy;
        if (distSq <= AUTO_SPACE_BULLET_RADIUS * AUTO_SPACE_BULLET_RADIUS) {
          nearbyBulletIndices.push({ index: _bi, distSq });
        }
      }
      nearbyBulletIndices.sort((a, b) => a.distSq - b.distSq);

      if (hardEnemies.length >= AUTO_SPACE_MIN_HARD_ENEMIES && nearbyBulletIndices.length >= AUTO_SPACE_MIN_BULLETS) {
        hardEnemies
          .slice(0, 5)
          .forEach((enemy) => {
            const enemyCX = enemy.x + enemy.width / 2;
            const enemyCY = enemy.y + enemy.height / 2;
            const dx = enemyCX - playerCX;
            const dy = enemyCY - playerCY;
            const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
            enemy.x += (dx / dist) * AUTO_SPACE_ENEMY_PUSH;
            enemy.y += (dy / dist) * AUTO_SPACE_ENEMY_PUSH * 0.8;
            if (enemy.isDiving) {
              enemy.isDiving = false;
              enemy.isReturning = true;
              enemy.state = 'RETURNING';
              enemy.diveTime = 0;
            }
          });

        nearbyBulletIndices
          .slice(0, AUTO_SPACE_BULLET_CLEAR_MAX)
          .forEach(({ index }) => {
            if (index >= 0 && index < eBullets.length) eBullets[index].alive = false;
          });

        invulnerableUntil.current = Math.max(invulnerableUntil.current, frameNow + 260);
        flash.current = Math.max(flash.current, 0.18);
        shake.current = Math.max(shake.current, 5);
        createExplosion(playerCX, playerCY, '#00ffcc', 10);
        lastAutoSpaceAt.current = frameNow;
      }
    }

    if (playerHit && Date.now() > invulnerableUntil.current) {
      if (godModeRef.current) return;
      // COUNTER HIT: If hit while dragging a high-tension slingshot, it's extra dangerous!
      const isDragging = isMouseDown.current || isTouching.current;
      const isHighTension = isDragging && isSlingshotCharged.current;

      // Auto-bomb if overdrive is full
      if (overdriveGauge.current >= MAX_OVERDRIVE && !isOverdriveActiveRef.current) {
        activateOverdrive();
        invulnerableUntil.current = Date.now() + 2000;
        createExplosion(playerPos.current.x + PLAYER_WIDTH / 2, playerPos.current.y + PLAYER_HEIGHT / 2, '#ffffff', 30);
        return;
      }
      // Check for Shield
      if (activeEffects.current['SHIELD'] > Date.now()) {
        activeEffects.current['SHIELD'] = 0; // Consume shield
        invulnerableUntil.current = Date.now() + 1000; // Brief invulnerability
        shake.current = 10;
        glitch.current = 15;
        audio.playPlayerHit(); // Or a shield break sound

        // If it was a counter hit, the shield break is more violent
        if (isHighTension) {
          createExplosion(playerPos.current.x + PLAYER_WIDTH/2, playerPos.current.y + PLAYER_HEIGHT/2, '#ff0066', 25);
          isMouseDown.current = false; // Force release
          mouseAnchorPos.current = null;
          isTouching.current = false;
          isSlingshotMode.current = false;
          isSlingshotCharged.current = false;
        }
        return;
      }

      // Overdrive invulnerability
      if (isOverdriveActiveRef.current) return;

      audio.playPlayerHit();
      shake.current = isHighTension ? 40 : 20;
      glitch.current = isHighTension ? 50 : 30;
      flash.current = 1;

      // If it was a counter hit, lose more health or overdrive
      if (isHighTension) {
        overdriveGauge.current = Math.max(0, overdriveGauge.current - 20);
        setOverdrive(overdriveGauge.current);
        // Force release of the slingshot
        isMouseDown.current = false;
        mouseAnchorPos.current = null;
        isTouching.current = false;
        isSlingshotMode.current = false;
        isSlingshotCharged.current = false;
      }

      // Spawn player explosion particles
      for(let i=0; i<50; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 12;
        particles.current.push({
          x: px + pw/2,
          y: py + ph/2,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 30 + Math.random() * 40,
          maxLife: 70,
          color: Math.random() > 0.5 ? '#00ffcc' : '#ffffff',
          size: 3 + Math.random() * 5,
          type: Math.random() > 0.3 ? 'line' : 'square',
          rotation: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.3
        });
      }

      const damage = isHighTension ? 40 : 20;
      if (integrityRef.current > damage) {
        integrityRef.current -= damage;
        setIntegrity(integrityRef.current);
        invulnerableUntil.current = Date.now() + 2000;
        for (const b of enemyBullets.current) b.alive = false; // Clear bullets to give a chance to recover
        if (comboRef.current > 5) audio.playComboBreak();
        comboRef.current = 0;
        setCombo(0);
      } else {
        integrityRef.current = 0;
        setIntegrity(0);
        hitsTakenRef.current++;
        gameOverStatsRef.current = {
          survivalMs: Date.now() - gameSessionStartRef.current,
          shotsFired: shotsFiredRef.current,
          shotsHit: shotsHitRef.current,
          hitsTaken: hitsTakenRef.current,
          maxCombo: maxComboRef.current,
          grazes: grazeCount.current,
          sectorsReached: waveRef.current,
        };
        audio.stopBGM();
        setGameState('GAME_OVER');
      }
    }

    // Update particles
    const warpParticleGate = isCriticalSim ? 0.9 : isReducedSim ? 0.78 : 0.6;
    if (isWarping.current && Math.random() > warpParticleGate) {
      particles.current.push({
        x: Math.random() * CANVAS_WIDTH,
        y: Math.random() * CANVAS_HEIGHT,
        vx: (Math.random() - 0.5) * 5,
        vy: (Math.random() - 0.5) * 5,
        life: 30,
        maxLife: 30,
        color: Math.random() > 0.5 ? '#00ffcc' : '#ff3366',
        size: 1 + Math.random() * 2,
        isWarp: true
      });
    }
    const particleList = particles.current;
    for (let i = particleList.length - 1; i >= 0; i--) {
      const p = particleList[i];
      if (p.isWarp) {
        // Warp particles fly towards center
        const dx = CANVAS_WIDTH / 2 - p.x;
        const dy = CANVAS_HEIGHT / 2 - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        p.vx = (dx / dist) * 10 * warpFactor.current * dt;
        p.vy = (dy / dist) * 10 * warpFactor.current * dt;
        p.x += p.vx;
        p.y += p.vy;
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const pFric = 1 - 0.05 * dt; p.vx *= pFric; p.vy *= pFric; // friction
      }
      if (p.rotation !== undefined && p.vr !== undefined) {
        p.rotation += p.vr * dt;
      }
      p.life -= 1 * dt;

      if (p.life <= 0) {
        particleList.splice(i, 1);
      }
    }

    // Prune dead enemies to prevent unbounded array growth.
    // Survival stages keep visible enemy counts low (≤5) — prune aggressively so dead
    // entries don't inflate the array and slow per-frame iteration over time.
    const enemyPruneThreshold = isSurvivalStage(currentStage) ? 10 : 24;
    if (enemies.current.length > enemyPruneThreshold) {
      enemies.current = enemies.current.filter(e => e.alive);
    }

    // Wave Completion Logic
    const isTimeBasedStage = isSurvivalStage(currentStage);
    const survivalDuration = getSurvivalDurationFromStage(currentStage);

    let isWaveCleared = false;
    if (isTimeBasedStage) {
      // Survive for the stage duration
      if (!stageStartTime.current) stageStartTime.current = Date.now();
      const elapsed = (Date.now() - stageStartTime.current) / 1000;
      const timeLeft = Math.max(0, survivalDuration - Math.floor(elapsed));
      // Only call setState when the displayed second actually changes (integer value).
      if (timeLeft !== survivalTimerRef.current) {
        survivalTimerRef.current = timeLeft;
        setSurvivalTime(timeLeft);
      }

      if (currentTime - lastProgressUiUpdateAt.current > 120) {
        setStageProgress(Math.min(1, elapsed / survivalDuration));
        lastProgressUiUpdateAt.current = currentTime;
      }

      if (elapsed >= survivalDuration) {
        isWaveCleared = true;
        stageStartTime.current = 0;
      }

      // Keep spawning enemies if visible threats are low.
      // Off-screen looping enemies should not block fresh spawns.
      const maxEnemies = isAsteroidBelt ? (isMobile ? 4 : 5) : currentStage === 3 ? 3 : currentStage === 4 ? 3 : 8;
      let visibleEnemyCount = 0;
      for (let vi = 0; vi < enemies.current.length; vi++) {
        const ve = enemies.current[vi];
        if (ve.alive && !ve.isBoss && ve.x > -80 && ve.x < CANVAS_WIDTH + 80 && ve.y > -120 && ve.y < CANVAS_HEIGHT + 120) visibleEnemyCount++;
      }
      if (visibleEnemyCount < maxEnemies && !isWarping.current) {
        const x = 40 + Math.random() * (CANVAS_WIDTH - 80);
        const eliteChance = isAsteroidBelt
          ? Math.min(0.18, 0.08 + (waveRef.current * 0.01))
          : Math.min(0.3, 0.12 + (waveRef.current * 0.015));
        const isElite = Math.random() < eliteChance;
        const e: Enemy = {
          ...createEnemy(x, -50, isElite ? 3 : 0),
          width: isElite ? 50 : 35, height: isElite ? 50 : 35,
          health: (isElite ? 15 : 3) + (waveRef.current * 0.8), maxHealth: (isElite ? 15 : 3) + (waveRef.current * 0.8),
          isDiving: true, isReturning: false, diveX: (Math.random() - 0.5) * 4, diveY: 5,
          originX: x, originY: 100, state: 'DIVING',
          diveType: isElite ? 'zigzag' : 'normal' as any
        };
        enemies.current.push(e);
      }
    } else {
      const aliveBoss = enemies.current.find(e => e.alive && e.isBoss);

      if (waveHasBossRef.current) {
        if (currentTime - lastProgressUiUpdateAt.current > 120) {
          const bossStamina = aliveBoss ? Math.max(0, Math.min(1, (aliveBoss.health || 0) / Math.max(1, aliveBoss.maxHealth || 1))) : 0;
          const bossProgress = 1 - bossStamina;
          setStageProgress(bossProgress);
          lastProgressUiUpdateAt.current = currentTime;
        }

        // Boss wave ends when the boss is defeated, regardless of remaining spawned adds.
        isWaveCleared = !aliveBoss && !isWarping.current && !showUpgrade;
      } else {
        const aliveCount = enemies.current.filter(e => e.alive).length;
        wavePeakAliveRef.current = Math.max(wavePeakAliveRef.current, aliveCount);

        if (currentTime - lastProgressUiUpdateAt.current > 120) {
          const nextProgress = (wavePeakAliveRef.current - aliveCount) / Math.max(1, wavePeakAliveRef.current);
          setStageProgress(prev => Math.max(prev, Math.max(0, Math.min(1, nextProgress))));
          lastProgressUiUpdateAt.current = currentTime;
        }

        isWaveCleared = aliveCount === 0 && !isWarping.current && !showUpgrade;
      }
    }

    // Ambush System (VS Style constant action)
    // Stage 4 excluded: formation-kill wave needs clean enemy count for wave-clear; ambush enemies
    // return to off-screen origin and stay alive forever, preventing wave completion.
    if (gameState === 'PLAYING' && !isWarping.current && !isTimeBasedStage && currentStage > 1 && currentStage !== 4) {
      ambushTimer.current += dt * (1000 / 60) * timeScale.current;
      const aliveCount = enemies.current.filter(e => e.alive).length;
      const isBossWave = enemies.current.some(e => e.alive && e.isBoss);
      const ambushInterval = Math.max(9000, 12000 - waveRef.current * 250);
      if (ambushTimer.current > ambushInterval && aliveCount <= 14 && !isBossWave) {
        ambushTimer.current = 0;
        const side = ambushSide.current === 'left' ? -50 : CANVAS_WIDTH + 50;
        const diveType = Math.random() > 0.5 ? 'sine' : 'normal';
        const isEliteAmbush = Math.random() < 0.2;
        for(let i=0; i<3; i++) {
          const e: Enemy = {
            ...createEnemy(side, 100 + i * 100, isEliteAmbush ? 3 : 2),
            width: isEliteAmbush ? 50 : 35, height: isEliteAmbush ? 50 : 35,
            health: isEliteAmbush ? 20 + waveRef.current : 5 + waveRef.current,
            maxHealth: isEliteAmbush ? 20 + waveRef.current : 5 + waveRef.current,
            isDiving: true, isReturning: false, diveX: side < 0 ? 1.8 : -1.8, diveY: 0.6,
            originX: side, originY: 100 + i * 100, state: 'DIVING',
            diveType: diveType as any
          };
          enemies.current.push(e);
        }
        // Randomize next side
        ambushSide.current = Math.random() > 0.5 ? 'left' : 'right';
      }
    }

    // Follower Pods Physics (Duckling Style)
    if (gameState === 'PLAYING' && hasFollowerRef.current) {
      const leaderX = wingmanRef.current ? wingmanPos.current.x + PLAYER_WIDTH / 2 : playerPos.current.x + PLAYER_WIDTH / 2;
      const leaderY = wingmanRef.current ? wingmanPos.current.y + PLAYER_HEIGHT / 2 : playerPos.current.y + PLAYER_HEIGHT / 2;

      // Record history
      followerHistory.current.unshift({ x: leaderX, y: leaderY });
      if (followerHistory.current.length > 200) followerHistory.current.pop();

      if (tailSegments.current.length === 0) {
        for (let i = 0; i < 6; i++) {
          tailSegments.current.push({ x: leaderX, y: leaderY, vx: 0, vy: 0 });
        }
      }

      const followerBulletStride = isCriticalSim ? 3 : isReducedSim ? 2 : 1;
      const followerAsteroidStride = isCriticalSim ? 2 : isReducedSim ? 2 : 1;
      const followerEnemyStride = isCriticalSim ? 3 : isReducedSim ? 2 : 1;

      tailSegments.current.forEach((seg, i) => {
        // Each pod follows a point in history with a delay
        const delay = (i + 1) * 15;
        const target = followerHistory.current[Math.min(delay, followerHistory.current.length - 1)];

        if (target) {
          // Smoothly move towards history point
          seg.x += (target.x - seg.x) * 0.1 * timeScale.current * dt;
          seg.y += (target.y - seg.y) * 0.1 * timeScale.current * dt;
        }

        // Passive Defense: Collision with enemy bullets
        enemyBullets.current.forEach((eb, ebIdx) => {
          if (!eb.alive) return;
          if (ebIdx % followerBulletStride !== 0) return;
          const bdx = eb.x - seg.x;
          const bdy = eb.y - seg.y;
          const bdist = Math.sqrt(bdx * bdx + bdy * bdy);
          if (bdist < 15) {
            eb.alive = false; // Destroy bullet
            createExplosion(seg.x, seg.y, '#00ffcc', 5);
            seg.lastHit = Date.now();
          }
        });

        // Passive Defense: Collision with Asteroids
        asteroids.current.forEach((a, aIdx) => {
          if (aIdx % followerAsteroidStride !== 0) return;
          const adx = a.x - seg.x;
          const ady = a.y - seg.y;
          const adist = Math.sqrt(adx * adx + ady * ady);
          if (adist < a.size + 10) {
            // Gently push asteroid away
            const angle = Math.atan2(ady, adx);
            a.vx += Math.cos(angle) * 0.5;
            a.vy += Math.sin(angle) * 0.5;
            seg.lastHit = Date.now();
          }
        });

        // Active Offense: Collision with Enemies
        enemies.current.forEach((e, eIdx) => {
          if (eIdx % followerEnemyStride !== 0) return;
          if (!e.alive) return;
          const edx = (e.x + e.width / 2) - seg.x;
          const edy = (e.y + e.height / 2) - seg.y;
          const edist = Math.sqrt(edx * edx + edy * edy);
          if (edist < 25) {
            // Damage enemy
            const damage = 0.5 * timeScale.current;
            e.health! -= damage;
            seg.lastHit = Date.now();
            if (Math.random() > 0.9) {
              createExplosion(seg.x, seg.y, '#00ffcc', 3);
            }
          }
        });
      });
    }

    if (isWaveCleared && gameState === 'PLAYING' && !victoryPendingRef.current) {
      isWarping.current = true;
      warpStartTime.current = Date.now();
      setIsWarpingState(true);
      pauseStartTime.current = Date.now();
      audio.playWaveClear();
      audio.playWarp();
      flash.current = 0.6; // Warp start flash (reduced intensity)

      // Clear bullets and loose entities
      for (const b of bullets.current) b.alive = false;
      for (const b of enemyBullets.current) b.alive = false;
      asteroids.current = [];
      obstacles.current = [];
      for (const s of scraps.current) s.alive = false;

      setTimeout(() => {
        flash.current = 1.0; // Final warp flash
        setTimeout(() => {
          if (waveRef.current % 2 === 0) {
            triggerRelicSelection();
          } else {
            startNextWave();
          }
        }, 100);
      }, 1400);
    }

    // Decay effects
    // (Moved to beginning of update loop)

    if (enemies.current.some(e => e.alive && e.y + e.height > CANVAS_HEIGHT && e.state === 'IN_FORMATION')) {
      gameOverStatsRef.current = {
        survivalMs: Date.now() - gameSessionStartRef.current,
        shotsFired: shotsFiredRef.current,
        shotsHit: shotsHitRef.current,
        hitsTaken: hitsTakenRef.current,
        maxCombo: maxComboRef.current,
        grazes: grazeCount.current,
        sectorsReached: waveRef.current,
      };
      setGameState('GAME_OVER');
    }
  };

  const drawShipVector = (ctx: CanvasRenderingContext2D) => {
    ctx.beginPath();
    // Main Body
    ctx.moveTo(0, -PLAYER_HEIGHT/2); // Nose
    ctx.lineTo(8, -10);
    ctx.lineTo(PLAYER_WIDTH/2, PLAYER_HEIGHT/2 - 5); // Right Wing Tip
    ctx.lineTo(5, PLAYER_HEIGHT/2 - 10);
    ctx.lineTo(0, PLAYER_HEIGHT/2 - 5); // Tail center
    ctx.lineTo(-5, PLAYER_HEIGHT/2 - 10);
    ctx.lineTo(-PLAYER_WIDTH/2, PLAYER_HEIGHT/2 - 5); // Left Wing Tip
    ctx.lineTo(-8, -10);
    ctx.closePath();
    ctx.stroke();
  };

  const draw = (mainCtx: CanvasRenderingContext2D) => {
    const ctx = offscreenCtx.current;
    if (!ctx || !offscreenCanvas.current) return;

    // Clear offscreen with a semi-transparent fill to create a motion-blur / trail effect.
    // Desktop: alpha 0.3 (70% of previous frame survives) — subtle cinematic blur at 60fps.
    // Mobile: alpha 0.5 (50% survives) — at lower effective FPS the 0.3 value let frames
    // accumulate visibly, making the game look blurry. 0.5 halves the accumulation time.
    ctx.fillStyle = isMobile ? 'rgba(2, 2, 5, 0.5)' : 'rgba(2, 2, 5, 0.3)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.save();

    // Apply screen shake
    if (shake.current > 0) {
      const dx = (Math.random() - 0.5) * shake.current;
      const dy = (Math.random() - 0.5) * shake.current;
      ctx.translate(dx, dy);
    }

    // Zoom effect during warp
    if (warpFactor.current > 0.1) {
      const scale = 1 + warpFactor.current * 0.2;
      ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
      ctx.scale(scale, scale);
      ctx.translate(-CANVAS_WIDTH / 2, -CANVAS_HEIGHT / 2);
    }

    // Parallax Starfield
    const currentStage = getStageFromWave(waveRef.current);
    const drawNow = Date.now();
    // Cache shield state once — reused throughout draw() to avoid redundant function calls per frame.
    const slingshotShieldStateCache = getSlingshotShieldState(drawNow);
    const drawLoadTier = renderLoadTierRef.current;
    const isReducedBossFx = drawLoadTier >= 1;
    const isMinimalBossFx = drawLoadTier >= 2;
    // shadowBlur scale: tier 0 = full, tier 1 = 60%, tier 2 = 0 (off)
    // On mobile tier 0 is already reduced; desktop is unaffected until load rises.
    const shadowScale = isMobile
      ? (drawLoadTier >= 2 ? 0 : 0.5)  // tier 0 & 1 both 0.5 on mobile (was 0.7 / 0.5)
      : 1;
    const isChase = currentStage === 4;
    const isFinalFrontStage = currentStage === 5;
    const isChaseLoadReduced = isChase && drawLoadTier >= 1;  // Skip fancy Chase rendering under load
    stars.current.forEach(s => {
      if (warpFactor.current > 0.1) {
        // Radial movement during warp
        const dx = s.x - CANVAS_WIDTH / 2;
        const dy = s.y - CANVAS_HEIGHT / 2;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        const speed = (s.speed + warpFactor.current * 30);

        s.x += Math.cos(angle) * speed * dtRef.current;
        s.y += Math.sin(angle) * speed * dtRef.current;

        // Reset stars that go offscreen
        if (s.x < -100 || s.x > CANVAS_WIDTH + 100 || s.y < -100 || s.y > CANVAS_HEIGHT + 100) {
          const spawnAngle = Math.random() * Math.PI * 2;
          const spawnDist = Math.random() * 50;
          s.x = CANVAS_WIDTH / 2 + Math.cos(spawnAngle) * spawnDist;
          s.y = CANVAS_HEIGHT / 2 + Math.sin(spawnAngle) * spawnDist;
        }

        const stageStarAlpha = isFinalFrontStage ? 0.55 : 1;
        ctx.strokeStyle = `rgba(255, 255, 255, ${s.opacity * warpFactor.current * stageStarAlpha})`;
        ctx.lineWidth = s.size;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - Math.cos(angle) * speed * 2, s.y - Math.sin(angle) * speed * 2);
        ctx.stroke();
      } else {
        // Normal vertical movement
        const speedMult = (isChase ? 3 : 1);
        s.y += s.speed * speedMult * dtRef.current;
        if (s.y > CANVAS_HEIGHT) {
          s.y = -10;
          s.x = Math.random() * CANVAS_WIDTH;
        }
        const stageStarAlpha = isFinalFrontStage ? 0.55 : 1;
        ctx.fillStyle = `rgba(255, 255, 255, ${s.opacity * stageStarAlpha})`;

        if (isChase && !isChaseLoadReduced) {  // Skip fancy lines under load
          const stretch = 5;
          ctx.strokeStyle = `rgba(255, 255, 255, ${s.opacity * 0.5})`;
          ctx.lineWidth = s.size;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(s.x, s.y - s.size * stretch);
          ctx.stroke();
        } else if (isMobile) {
          // fillRect is significantly cheaper than arc on mobile GPUs
          const d = Math.max(1, s.size);
          ctx.fillRect(s.x - d, s.y - d, d * 2, d * 2);
        } else {
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });

    // Grid (Perspective effect)
    const isBossNear = waveRef.current === 5 || waveRef.current === 9;
    const isBossWave = waveRef.current === 6 || waveRef.current === 10;

    let baseGridColor = 'rgba(0, 255, 204, 0.05)';
    if (isBossWave) baseGridColor = isFinalFrontStage ? 'rgba(255, 51, 102, 0.05)' : 'rgba(255, 51, 102, 0.1)';
    else if (isBossNear) baseGridColor = isFinalFrontStage ? 'rgba(255, 204, 0, 0.04)' : 'rgba(255, 204, 0, 0.08)';

    const gridColor = isWarping.current ? `rgba(255, 51, 102, ${0.1 + warpFactor.current * 0.3})` : baseGridColor;
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    const gridSpacing = isFinalFrontStage ? (isMobile ? 96 : 56) : (isMobile ? 80 : 40); // Reduce visual density in Final Front
    const gridSpeed = isWarping.current ? 100 : 20;
    const gridOffset = (drawNow / gridSpeed) % gridSpacing;

    // Skip grid entirely on mobile under load — low visual impact, non-trivial CPU cost
    if (!isMobile || drawLoadTier === 0) {
      if (!isMobile) {
        for (let x = 0; x <= CANVAS_WIDTH; x += gridSpacing) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, CANVAS_HEIGHT);
          ctx.stroke();
        }
      }
      for (let y = gridOffset; y <= CANVAS_HEIGHT; y += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(CANVAS_WIDTH, y);
        ctx.stroke();
      }
    }

    if (isFinalFrontStage) {
      // Slightly darken backdrop so collision objects stand out.
      ctx.fillStyle = 'rgba(2, 6, 18, 0.22)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    // Draw Trails
    trails.current.forEach(t => {
      ctx.globalAlpha = (t.life / t.maxLife) * VFX_TRAIL_ALPHA;
      ctx.fillStyle = t.color;
      ctx.beginPath();
      ctx.arc(t.x, t.y, (t.width / 2) * (t.life / t.maxLife), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    // Draw Follower Pods (Duckling Style)
    if (hasFollowerRef.current && tailSegments.current.length > 0 && gameState === 'PLAYING') {
      ctx.save();
      const color = isOverdriveActiveRef.current ? '#ff3366' : '#00ffcc';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.shadowBlur = 10;
      ctx.shadowColor = color;

      const leaderX = wingmanRef.current ? wingmanPos.current.x + PLAYER_WIDTH / 2 : playerPos.current.x + PLAYER_WIDTH / 2;
      const leaderY = wingmanRef.current ? wingmanPos.current.y + PLAYER_HEIGHT / 2 : playerPos.current.y + PLAYER_HEIGHT / 2;

      // Draw energy tether
      ctx.beginPath();
      ctx.setLineDash([2, 4]);
      ctx.globalAlpha = 0.3;
      ctx.moveTo(leaderX, leaderY);
      tailSegments.current.forEach(seg => {
        ctx.lineTo(seg.x, seg.y);
      });
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw individual pods
      tailSegments.current.forEach((seg, i) => {
        ctx.save();
        ctx.translate(seg.x, seg.y);
        ctx.rotate(Date.now() / 1000 + i);

        const pulse = Math.sin(Date.now() / 200 + i) * 2;
        const isHit = seg.lastHit && Date.now() - seg.lastHit < 100;
        const size = (6 + pulse) * (isHit ? 1.5 : 1);

        ctx.globalAlpha = isHit ? 1.0 : 0.8;
        if (isHit) {
          ctx.strokeStyle = '#ffffff';
          ctx.shadowBlur = 20;
        }

        // Hexagon Pod
        ctx.beginPath();
        for(let j=0; j<6; j++) {
          const angle = (j * Math.PI * 2) / 6;
          const x = Math.cos(angle) * size;
          const y = Math.sin(angle) * size;
          if(j === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();

        // Core
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(0, 0, 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      });
      ctx.restore();
    }

    // Draw Asteroids
    asteroids.current.forEach(a => {
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(a.rotation);
      if (isMobile) ctx.shadowBlur = 0;
      else ctx.shadowBlur = 10;

      const isLarge = a.size > 35;
      if (!isMobile) ctx.shadowColor = isLarge ? '#00ffcc' : '#888';
      ctx.strokeStyle = isLarge ? '#00ffcc' : '#888';
      ctx.lineWidth = isLarge ? 2.5 : 1.5;

      ctx.beginPath();
      const vertexCount = a.vertices ? a.vertices.length : 8;
      for (let i = 0; i < vertexCount; i++) {
        const angle = (i / vertexCount) * Math.PI * 2;
        const r = a.size * (a.vertices ? a.vertices[i] : 1);
        if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
        else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
      }
      ctx.closePath();
      // On mobile fill the asteroid interior with a near-black color so the
      // solid look is intentional rather than an artifact of frame persistence.
      if (isMobile) {
        ctx.fillStyle = isLarge ? 'rgba(0, 18, 12, 0.92)' : 'rgba(8, 8, 8, 0.92)';
        ctx.fill();
      }
      ctx.stroke();

      // Inner wireframe for large asteroids
      if (isLarge && !isMobile) {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(0, 255, 204, 0.3)';
        ctx.lineWidth = 1;
        const vertexCount = a.vertices ? a.vertices.length : 8;
        for (let i = 0; i < vertexCount; i+=2) {
          const angle = (i / vertexCount) * Math.PI * 2;
          const r = a.size * 0.4;
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
        }
        ctx.stroke();
      }
      ctx.restore();
    });

    // Draw Scraps — all share the same color; batch into one path to eliminate per-dot save/restore.
    if (scraps.current.length > 0) {
      if (!isMobile) { ctx.shadowBlur = 8; ctx.shadowColor = '#00ffcc'; }
      ctx.fillStyle = '#00ffcc';
      ctx.beginPath();
      for (let si = 0; si < scraps.current.length; si++) {
        const s = scraps.current[si];
        if (!s.alive) continue;
        ctx.moveTo(s.x + 2, s.y);
        ctx.arc(s.x, s.y, 2, 0, Math.PI * 2);
      }
      ctx.fill();
      if (!isMobile) ctx.shadowBlur = 0;
    }

    // Power-ups
    powerUps.current.forEach(p => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(drawNow / 500);
      const color = p.type === 'MULTISHOT'
        ? '#ffcc00'
        : p.type === 'SHIELD'
          ? '#33ccff'
          : p.type === 'REPAIR'
            ? '#66ff99'
            : '#ff33cc';
      const label = p.type === 'REPAIR' ? 'H' : p.type[0];
      ctx.shadowBlur = 15 * shadowScale;
      ctx.shadowColor = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(-10, -10, 20, 20);
      ctx.fillStyle = color;
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 0, 0);
      ctx.restore();
    });

    // Full-screen overdrive wash removed to keep frame pacing stable during movement-heavy sections.

    // Draw Obstacles
    obstacles.current.forEach(obs => {
      ctx.save();
      ctx.translate(obs.x, obs.y);

      const color = obs.color;
      ctx.shadowBlur = (isFinalFrontStage ? 10 : 15) * shadowScale;
      ctx.shadowColor = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = isFinalFrontStage ? 4 : 3;

      if (isFinalFrontStage) {
        ctx.fillStyle = 'rgba(4, 8, 20, 0.55)';
        ctx.fillRect(-2, -2, obs.width + 4, obs.height + 4);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.72)';
        ctx.lineWidth = 6;
        ctx.strokeRect(-1, -1, obs.width + 2, obs.height + 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
      }

      // Outer border
      ctx.strokeRect(0, 0, obs.width, obs.height);

      if (isFinalFrontStage) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(3, 3, obs.width - 6, obs.height - 6);
        ctx.strokeStyle = color;
      }

      // Inner details based on type
      ctx.lineWidth = 1;
      ctx.globalAlpha = isFinalFrontStage ? 0.16 : 0.3;
      if (obs.type === 'WALL') {
        // Diagonal lines
        const detailStep = isFinalFrontStage ? 28 : 20;
        for (let i = 0; i < obs.width + obs.height; i += detailStep) {
          ctx.beginPath();
          ctx.moveTo(Math.max(0, i - obs.height), Math.min(i, obs.height));
          ctx.lineTo(Math.min(i, obs.width), Math.max(0, i - obs.width));
          ctx.stroke();
        }
      } else if (obs.type === 'BUILDING') {
        // Grid pattern
        const detailStep = isFinalFrontStage ? 28 : 20;
        for (let x = detailStep; x < obs.width; x += detailStep) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, obs.height);
          ctx.stroke();
        }
        for (let y = detailStep; y < obs.height; y += detailStep) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(obs.width, y);
          ctx.stroke();
        }
      } else {
        // Concentric squares
        const detailStep = isFinalFrontStage ? 14 : 10;
        for (let i = detailStep; i < Math.min(obs.width, obs.height) / 2; i += detailStep) {
          ctx.strokeRect(i, i, obs.width - i * 2, obs.height - i * 2);
        }
      }

      // Health bar (only if damaged)
      if (obs.hp < obs.maxHp) {
        ctx.globalAlpha = 1.0;
        ctx.fillStyle = '#333';
        ctx.fillRect(5, -10, obs.width - 10, 4);
        ctx.fillStyle = color;
        ctx.fillRect(5, -10, (obs.width - 10) * (obs.hp / obs.maxHp), 4);
      }

      ctx.restore();
    });

    // Draw Maze Blocks

    blocks.current.forEach(block => {
      if (block.hp <= 0) return;
      ctx.save();
      ctx.translate(block.x, block.y);

      const color = block.color;
      // In Final Front, give walls a subtle blue glow so they read as solid obstacles against the dark backdrop.
      ctx.shadowBlur = (block.type === 'WALL' && isFinalFrontStage) ? 4 * shadowScale
        : block.type === 'WALL' ? 0
        : (isFinalFrontStage ? 9 : 15) * shadowScale;
      ctx.shadowColor = (block.type === 'WALL' && isFinalFrontStage) ? '#2255cc' : color;
      ctx.strokeStyle = color;
      ctx.lineWidth = block.type === 'WALL' ? (isFinalFrontStage ? 2 : 1) : 2;

      if (isFinalFrontStage) {
        ctx.fillStyle = 'rgba(5, 9, 24, 0.55)';
        ctx.fillRect(-2, -2, block.width + 4, block.height + 4);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.lineWidth = 4;
        ctx.strokeRect(-1, -1, block.width + 2, block.height + 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = block.type === 'WALL' ? 2 : 2;
      }

      if (block.type === 'WALL') {
        ctx.fillStyle = isFinalFrontStage ? 'rgba(12, 22, 60, 0.96)' : 'rgba(26, 26, 46, 0.8)';
        ctx.fillRect(0, 0, block.width, block.height);
        if (isFinalFrontStage) ctx.strokeStyle = '#2255cc';
        ctx.strokeRect(0, 0, block.width, block.height);
        // Bright top edge in Final Front to read as a solid fortification.
        if (isFinalFrontStage) {
          ctx.strokeStyle = '#4488ff';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(block.width, 0);
          ctx.stroke();
        }
      } else if (block.type === 'TURRET_BLOCK') {
        // Wall base
        ctx.fillStyle = 'rgba(26, 20, 10, 0.88)';
        ctx.fillRect(0, 0, block.width, block.height);
        ctx.strokeStyle = '#ff9900';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, block.width, block.height);
        // Turret octagon
        const tcx = block.width / 2;
        const tcy = block.height / 2;
        const tr = Math.min(block.width, block.height) * 0.26;
        ctx.shadowBlur = 14 * shadowScale;
        ctx.shadowColor = '#ff9900';
        ctx.strokeStyle = '#ff9900';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let k = 0; k < 8; k++) {
          const a = (k * Math.PI * 2) / 8 - Math.PI / 8;
          if (k === 0) ctx.moveTo(tcx + Math.cos(a) * tr, tcy + Math.sin(a) * tr);
          else ctx.lineTo(tcx + Math.cos(a) * tr, tcy + Math.sin(a) * tr);
        }
        ctx.closePath();
        ctx.stroke();
        // Gun barrel aimed at player
        const tAngle = Math.atan2(
          playerPos.current.y + PLAYER_HEIGHT / 2 - (block.y + tcy),
          playerPos.current.x + PLAYER_WIDTH / 2 - (block.x + tcx),
        );
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(tcx, tcy);
        ctx.lineTo(tcx + Math.cos(tAngle) * (tr + 14), tcy + Math.sin(tAngle) * (tr + 14));
        ctx.stroke();
        ctx.fillStyle = '#ffcc44';
        ctx.beginPath();
        ctx.arc(tcx + Math.cos(tAngle) * (tr + 14), tcy + Math.sin(tAngle) * (tr + 14), 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (block.type === 'WINDMILL') {
        // Wall base
        ctx.fillStyle = 'rgba(0, 30, 20, 0.88)';
        ctx.fillRect(0, 0, block.width, block.height);
        ctx.strokeStyle = '#00ffaa';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, block.width, block.height);
        // Rotating blades
        const wcx = block.width / 2;
        const wcy = block.height / 2;
        // Arms extend well beyond block edges to act as a corridor hazard.
        const armLen = block.height * 2.9;
        const rot = drawNow * 0.00025 + (block.id % 100) * 0.9;
        ctx.shadowBlur = 10 * shadowScale;
        ctx.shadowColor = '#00ffaa';
        ctx.strokeStyle = '#00ffaa';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        for (let k = 0; k < 2; k++) {
          const a = rot + k * Math.PI;
          ctx.beginPath();
          ctx.moveTo(wcx, wcy);
          ctx.lineTo(wcx + Math.cos(a) * armLen, wcy + Math.sin(a) * armLen);
          ctx.stroke();
        }
        ctx.fillStyle = '#00ffaa';
        ctx.shadowBlur = 6 * shadowScale;
        ctx.beginPath();
        ctx.arc(wcx, wcy, 5, 0, Math.PI * 2);
        ctx.fill();
      } else if (block.type === 'BEAM_TURRET') {
        const tcx = block.width / 2;
        const tcy = block.height / 2;
        const timeSinceShot = drawNow - (block.lastShotTime ?? 0);
        const chargeProgress = Math.min(1, timeSinceShot / 3500);
        const isMobile = block.vx !== undefined;
        const isAiming = isMobile && drawNow < (block.haltUntil ?? 0);

        // Caterpillar tread base — two tread pads, sits on the wall surface below
        if (isMobile) {
          const by = block.height - 1; // bottom edge in local coords
          const tw = block.width * 0.28; // tread pad width
          const th = 5;                  // tread height
          ctx.shadowBlur = 0;
          // Left tread
          ctx.fillStyle = isAiming ? 'rgba(0,200,180,0.7)' : 'rgba(0,120,110,0.55)';
          ctx.fillRect(3, by - th, tw, th);
          ctx.strokeStyle = isAiming ? 'rgba(0,255,221,0.6)' : 'rgba(0,160,140,0.5)';
          ctx.lineWidth = 1;
          ctx.strokeRect(3, by - th, tw, th);
          // Tread links (small vertical lines)
          ctx.lineWidth = 0.8;
          for (let tx = 3 + 4; tx < 3 + tw - 2; tx += 4) {
            ctx.beginPath(); ctx.moveTo(tx, by - th); ctx.lineTo(tx, by); ctx.stroke();
          }
          // Right tread
          const rx2 = block.width - 3 - tw;
          ctx.fillRect(rx2, by - th, tw, th);
          ctx.strokeRect(rx2, by - th, tw, th);
          for (let tx = rx2 + 4; tx < rx2 + tw - 2; tx += 4) {
            ctx.beginPath(); ctx.moveTo(tx, by - th); ctx.lineTo(tx, by); ctx.stroke();
          }
        }

        // Background plate
        ctx.fillStyle = 'rgba(0, 20, 30, 0.9)';
        ctx.fillRect(2, 2, block.width - 4, block.height - 4);

        const glow = (6 + chargeProgress * 22) * shadowScale;
        ctx.shadowBlur = isAiming ? glow * 1.6 : glow;
        ctx.shadowColor = '#00ffdd';

        // Hexagon body — pulses brighter while aiming
        ctx.strokeStyle = isAiming
          ? `rgba(0, 255, 221, ${0.6 + 0.4 * Math.sin(drawNow / 80)})`
          : `rgba(0, 255, 221, ${0.3 + chargeProgress * 0.7})`;
        ctx.lineWidth = isAiming ? 3 : 1.5 + chargeProgress * 1.5;
        const hexR = Math.min(block.width, block.height) * 0.28;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k * Math.PI * 2) / 6 + Math.PI / 6;
          if (k === 0) ctx.moveTo(tcx + Math.cos(a) * hexR, tcy + Math.sin(a) * hexR);
          else ctx.lineTo(tcx + Math.cos(a) * hexR, tcy + Math.sin(a) * hexR);
        }
        ctx.closePath();
        ctx.stroke();

        // Anchor bolts for fixed turrets (no baseVy)
        if (!isMobile) {
          ctx.strokeStyle = 'rgba(0, 200, 180, 0.5)';
          ctx.lineWidth = 2;
          ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(tcx - hexR * 0.7, tcy + hexR * 0.6); ctx.lineTo(tcx - hexR * 0.5, block.height - 2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(tcx + hexR * 0.7, tcy + hexR * 0.6); ctx.lineTo(tcx + hexR * 0.5, block.height - 2); ctx.stroke();
          ctx.fillStyle = 'rgba(0, 220, 200, 0.7)';
          ctx.shadowBlur = 4 * shadowScale;
          ctx.beginPath(); ctx.arc(tcx - hexR * 0.5, block.height - 2, 2.5, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(tcx + hexR * 0.5, block.height - 2, 2.5, 0, Math.PI * 2); ctx.fill();
        }

        // Angle from turret center to player — live tracking
        const aimAngle = Math.atan2(
          (playerPos.current.y + PLAYER_HEIGHT / 2) - (block.y + tcy),
          (playerPos.current.x + PLAYER_WIDTH / 2) - (block.x + tcx)
        );

        // Barrel
        const barrelLen = hexR + 14;
        const barrelTipX = tcx + Math.cos(aimAngle) * barrelLen;
        const barrelTipY = tcy + Math.sin(aimAngle) * barrelLen;
        ctx.shadowBlur = isAiming ? glow * 2 : glow;
        ctx.shadowColor = '#00ffdd';
        ctx.strokeStyle = isAiming
          ? `rgba(255, 255, 221, ${0.8 + 0.2 * Math.sin(drawNow / 55)})`
          : `rgba(0, 255, 221, ${0.3 + chargeProgress * 0.7})`;
        ctx.lineWidth = isAiming ? 5 : 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(tcx, tcy);
        ctx.lineTo(barrelTipX, barrelTipY);
        ctx.stroke();

        // Aiming: red targeting lines through turret center
        if (isAiming) {
          const lockAlpha = 0.35 + 0.2 * Math.sin(drawNow / 60);
          ctx.strokeStyle = `rgba(255, 80, 80, ${lockAlpha})`;
          ctx.lineWidth = 1;
          ctx.shadowBlur = 6 * shadowScale;
          ctx.shadowColor = '#ff5050';
          ctx.beginPath(); ctx.moveTo(0, tcy); ctx.lineTo(block.width, tcy); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(tcx, 0); ctx.lineTo(tcx, block.height); ctx.stroke();
        }

        // Telegraph: expanding ring + tip pulse when charge ≥ 70%
        if (chargeProgress >= 0.7) {
          const ringProgress = (chargeProgress - 0.7) / 0.3;
          ctx.strokeStyle = `rgba(0, 255, 221, ${0.6 * ringProgress})`;
          ctx.lineWidth = 2 * ringProgress;
          ctx.shadowBlur = 14 * shadowScale * ringProgress;
          ctx.shadowColor = '#00ffdd';
          ctx.beginPath();
          ctx.arc(tcx, tcy, hexR * (1.2 + ringProgress * 1.4), 0, Math.PI * 2);
          ctx.stroke();
        }
        if (chargeProgress >= 0.85 || isAiming) {
          const tipPulse = 3 + Math.sin(drawNow / 45) * 2.5;
          ctx.fillStyle = isAiming ? '#ffffff' : `rgba(0,255,221,${0.7 + 0.3 * Math.sin(drawNow / 45)})`;
          ctx.shadowBlur = 26 * shadowScale;
          ctx.shadowColor = '#00ffdd';
          ctx.beginPath();
          ctx.arc(barrelTipX, barrelTipY, tipPulse, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (block.type === 'TENTACLE' && block.segments) {
        // Draw Tentacle Segments (R-Type style)
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, 0);

        const time = Date.now() / 1000;
        const pulse = Math.sin(time * 5 + block.id) * 0.2 + 0.8;

        block.segments.forEach((seg, i) => {
          const size = (25 - i * 2) * pulse;
          ctx.lineTo(seg.x, seg.y);
          ctx.stroke();

          // Segment glow
          ctx.save();
          ctx.translate(seg.x, seg.y);
          ctx.rotate(seg.angle);

          const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
          gradient.addColorStop(0, color);
          gradient.addColorStop(1, 'transparent');
          ctx.fillStyle = gradient;
          ctx.globalAlpha = 0.4 + Math.sin(time * 3 + i) * 0.2;
          ctx.beginPath();
          ctx.arc(0, 0, size, 0, Math.PI * 2);
          ctx.fill();

          // Core
          ctx.fillStyle = '#ffffff';
          ctx.globalAlpha = 0.8;
          ctx.beginPath();
          ctx.arc(0, 0, size * 0.3, 0, Math.PI * 2);
          ctx.fill();

          // Spikes
          if (i % 2 === 0) {
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(size, 0);
            ctx.lineTo(size + 15, -5);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(-size, 0);
            ctx.lineTo(-size - 15, 5);
            ctx.stroke();
          }
          ctx.restore();
        });
      } else {
        ctx.strokeRect(2, 2, block.width - 4, block.height - 4);
        // Inner details
        ctx.lineWidth = 1;
        ctx.globalAlpha = isFinalFrontStage ? 0.16 : 0.3;
        if (block.type === 'PILLAR') { // Core
          ctx.beginPath();
          ctx.arc(block.width / 2, block.height / 2, 15, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = color;
          ctx.fill();
        } else {
          ctx.strokeRect(10, 10, block.width - 20, block.height - 20);
        }
        // Beam-charged glow: BUILDING hit once by a deflected beam pulses yellow before bursting
        if (block.type === 'BUILDING' && (block.chargeHits ?? 0) >= 1) {
          ctx.globalAlpha = 0.55 + 0.45 * Math.sin(drawNow / 80);
          ctx.fillStyle = '#ffcc00';
          ctx.shadowColor = '#ffcc00';
          ctx.shadowBlur = 18 * shadowScale;
          ctx.fillRect(4, 4, block.width - 8, block.height - 8);
        }
      }
      ctx.restore();
    });

    // Slingshot Trajectory Rendering
    if (slingshotTrajectory.current) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(slingshotTrajectory.current.x1, slingshotTrajectory.current.y1);
      ctx.lineTo(slingshotTrajectory.current.x2, slingshotTrajectory.current.y2);
      ctx.strokeStyle = `rgba(255, 255, 255, ${slingshotTrajectory.current.alpha * 0.4})`;
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 10]);
      ctx.stroke();
      ctx.restore();
    }

    // Slingshot Trails Rendering
    slingshotTrails.current.forEach(t => {
      ctx.save();
      ctx.globalAlpha = t.alpha * VFX_SLINGSHOT_TRAIL_ALPHA;
      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = 15 * shadowScale;
      ctx.shadowColor = '#00ffcc';
      ctx.beginPath();
      ctx.arc(t.x, t.y, 10 * t.alpha, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // Player
    const isInvulnerable = Date.now() < invulnerableUntil.current;
    const blink = Math.floor(Date.now() / 100) % 2 === 0;

    if (!isInvulnerable || blink) {
      ctx.save();

      // Warp movement
      const warpYOffset = isWarping.current ? -warpFactor.current * 100 : 0;
      ctx.translate(playerPos.current.x + PLAYER_WIDTH / 2, playerPos.current.y + PLAYER_HEIGHT / 2 + warpYOffset);

      // Dynamic tilt from Lerp
      ctx.rotate(playerTilt.current);
      if (!isMobile) ctx.shadowBlur = 25;

      // Ship Scale & Stretching (Warp/Overdrive/Beat/Rubber Band)
      const anchor = isTouching.current ? touchStartPos.current : mouseAnchorPos.current;
      const pullDist = (isMouseDown.current || isTouching.current) && anchor ?
        Math.sqrt((currentMousePos.current.x - anchor.x)**2 + (currentMousePos.current.y - anchor.y)**2) : 0;
      const pullRatio = Math.min(pullDist / 100, 1);

      // Vibration only in Slingshot Mode to avoid cluttering precision movement
      const shipVib = (isSlingshotMode.current && pullRatio > 0.8) ? (Math.random() - 0.5) * 2 : 0;
      ctx.translate(shipVib, shipVib);

      const beatPulse = pulseRef.current * 0.15;
      const shipScale = 1 + (isOverdriveActiveRef.current ? 0.1 : 0) + beatPulse;

      // Rubber Band Stretch based on velocity
      const currentSpeed = Math.sqrt(playerVel.current.x ** 2 + playerVel.current.y ** 2);
      const rubberStretch = Math.min(currentSpeed / 60, 0.4); // Elongation factor

      const stretchY = 1 + warpFactor.current * 1.5 + rubberStretch;
      const stretchX = 1 - warpFactor.current * 0.3 - rubberStretch * 0.3;

      // Tension Visual (Charging Slingshot) - Only in Slingshot Mode
      const isCharging = isMouseDown.current || isTouching.current;
      const tensionVib = (isSlingshotMode.current && isCharging && pullDist > 70) ? (Math.random() - 0.5) * (pullDist / 20) : 0;
      ctx.translate(tensionVib, 0);

      // If moving fast horizontally, tilt more towards velocity
      const velAngle = Math.atan2(playerVel.current.y, playerVel.current.x);
      const velTilt = (playerVel.current.x / 40) * 0.2;

      ctx.scale(shipScale * stretchX, shipScale * stretchY);

      // Warp Ghosting - Reduced on mobile
      if (warpFactor.current > 0.2) {
        const ghostCount = isMobile ? 1 : 3;
        for (let i = 1; i <= ghostCount; i++) {
          ctx.save();
          ctx.translate(0, i * 20 * warpFactor.current);
          ctx.globalAlpha = 0.3 / i;
          ctx.strokeStyle = i % 2 === 0 ? '#ff3366' : '#00ffcc';
          drawShipVector(ctx);
          ctx.restore();
        }
      }

      // Hacked Glitch Effect
      if (isHackedRef.current) {
        const glitchOffset = (Math.random() - 0.5) * 10;
        ctx.translate(glitchOffset, 0);
        ctx.strokeStyle = Math.random() > 0.5 ? '#ff00ff' : '#00ffff';
        ctx.shadowColor = ctx.strokeStyle;
      }

      // Graze Circle
      ctx.strokeStyle = isHackedRef.current ? 'rgba(255, 0, 255, 0.2)' : 'rgba(0, 255, 204, 0.2)';
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(0, 0, GRAZE_DISTANCE, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Repulsion Field Visual (Passive - Stage 2)
      if (currentStage === 2) {
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 255, 204, 0.05)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, 150, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Overdrive Gravity Pulse Visual (Active - Stage 2)
      if (isOverdriveActiveRef.current && currentStage === 2) {
        ctx.save();
        const pulse = Math.sin(Date.now() / 100) * 10;
        ctx.strokeStyle = 'rgba(255, 51, 102, 0.2)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 300 + pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      if (!isMobile) ctx.shadowBlur = 25;
      if (!isHackedRef.current) {
        if (!isMobile) ctx.shadowColor = '#00ffcc';
        ctx.strokeStyle = '#00ffcc';
      }
      ctx.lineWidth = 2.5;

      // Slingshot Mode Readiness Glow
      if (isSlingshotMode.current && (isMouseDown.current || isTouching.current) && pullDist > 5) {
        ctx.save();
        const pulse = Math.sin(Date.now() * 0.01) * 0.5 + 0.5;
        ctx.strokeStyle = `rgba(0, 255, 204, ${0.3 + pulse * 0.4})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 40 + pulse * 10, 0, Math.PI * 2);
        ctx.stroke();

        ctx.setLineDash([5, 10]);
        ctx.rotate(Date.now() * 0.002);
        ctx.beginPath();
        ctx.arc(0, 0, 35, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // OD-Ready: gold orbit ring — absorb one more bullet to trigger Overdrive
      if (odReadyRef.current && !isOverdriveActiveRef.current) {
        ctx.save();
        const pulse = Math.sin(Date.now() * 0.006) * 0.5 + 0.5;
        ctx.strokeStyle = `rgba(255, 204, 0, ${0.7 + pulse * 0.3})`;
        ctx.lineWidth = 2.5;
        if (!isMobile) { ctx.shadowBlur = 20; ctx.shadowColor = '#ffcc00'; }
        ctx.beginPath();
        ctx.arc(0, 0, 50 + pulse * 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([6, 8]);
        ctx.rotate(Date.now() * 0.003);
        ctx.strokeStyle = `rgba(255, 180, 0, ${0.5 + pulse * 0.3})`;
        ctx.beginPath();
        ctx.arc(0, 0, 44, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // High-End Neon Vector Ship
      drawShipVector(ctx);

      // Charging Tension Glow - Only in Slingshot Mode
      if (isSlingshotMode.current && isCharging && pullDist > 15) {
        ctx.save();
        const tensionRatio = Math.min(pullDist / 150, 1.5);

        ctx.strokeStyle = `rgba(0, 255, 204, ${0.2 + tensionRatio * 0.4})`;
        ctx.lineWidth = 1 + tensionRatio * 2;
        if (!isMobile) {
          ctx.shadowBlur = 10 + tensionRatio * 20;
          ctx.shadowColor = '#00ffcc';
        }

        ctx.beginPath();
        ctx.arc(0, 0, 15 + tensionRatio * 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      const slingshotShieldState = slingshotShieldStateCache;
      if (slingshotShieldState.active) {
        ctx.save();
        ctx.rotate(slingshotShieldState.angle - playerTilt.current);
        // 5 discrete energy stages (0=empty, 1-4=charging, 5=OD-ready)
        // Each non-empty stage snaps to a distinct color + thickness for clear readability.
        const charge = overdriveGauge.current;
        const stage = charge <= 0 ? 0 : charge < 25 ? 1 : charge < 50 ? 2 : charge < 75 ? 3 : charge < MAX_OVERDRIVE ? 4 : 5;
        // Stages 0-1 (gauge < 25): wall not yet active — show dashed orange-red.
        // Covers both active drag and guard window so dashed visual matches gameplay (no deflect).
        const isDraggingNow = isMouseDown.current || isTouching.current;
        const isInGuardWindow = !isDraggingNow && Date.now() < slingshotGuardUntil.current;
        const isEmptyWall = (isDraggingNow || isInGuardWindow) && stage < 2;
        const STAGE_COLORS: [number, number, number][] = [
          [255,  90,  30],  // 0: empty  — red-orange (no wall, not charging)
          [255, 160,  40],  // 1: low    — orange (charging, wall not yet active)
          [0,   255, 200],  // 2: mid    — teal (wall active)
          [80,  255, 140],  // 3: high   — green-teal
          [255, 200,  60],  // 4: near   — amber
          [255, 200,   0],  // 5: full   — gold
        ];
        const STAGE_WIDTHS = [5, 6, 7, 8, 10, 12];
        const [arcR, arcG, arcB] = STAGE_COLORS[stage];
        ctx.strokeStyle = `rgba(${arcR}, ${arcG}, ${arcB}, ${slingshotShieldState.alpha * (isEmptyWall ? 0.45 : 0.82)})`;
        ctx.lineWidth = STAGE_WIDTHS[stage];
        if (isEmptyWall) ctx.setLineDash([5, 9]);
        if (!isMobile && renderLoadTierRef.current === 0) {
          ctx.shadowBlur = 4 + stage * 5;
          ctx.shadowColor = stage >= 5 ? '#ffcc00' : stage >= 4 ? '#ffcc44' : stage >= 2 ? '#00ffcc' : '#ff8020';
        }
        ctx.beginPath();
        ctx.arc(0, 0, slingshotShieldState.radius, -Math.PI / 2, Math.PI / 2);
        ctx.stroke();
        ctx.restore();
      }

      // Invulnerability Shield Visual
      if (isInvulnerable) {
        ctx.save();
        const timeLeft = invulnerableUntil.current - Date.now();
        const isEnding = timeLeft < 500;
        const pulse = Math.sin(Date.now() / (isEnding ? 30 : 100)) * 5;

        ctx.strokeStyle = isEnding ? 'rgba(255, 51, 102, 0.6)' : 'rgba(0, 255, 204, 0.6)';
        ctx.lineWidth = 2 + pulse / 2;
        if (!isMobile) {
          ctx.shadowBlur = 15 + pulse;
          ctx.shadowColor = isEnding ? '#ff3366' : '#00ffcc';
        }

        ctx.beginPath();
        ctx.arc(0, 0, 25 + pulse, 0, Math.PI * 2);
        ctx.stroke();

        // Inner hex pattern or simple glow
        ctx.globalAlpha = 0.1 + (pulse + 5) / 100;
        ctx.fillStyle = isEnding ? '#ff3366' : '#00ffcc';
        ctx.fill();
        ctx.restore();
      }

      // Slingshot Attack Visual Feedback
      if (Date.now() < slingshotAttackUntil.current) {
        const isStillInvulnerable = Date.now() < invulnerableUntil.current;
        ctx.save();
        const pulse = Math.sin(Date.now() / 50) * 5;

        // Color changes based on vulnerability
        ctx.strokeStyle = isStillInvulnerable ? '#00ffcc' : '#ff9900';
        ctx.shadowColor = isStillInvulnerable ? '#00ffcc' : '#ff9900';
        ctx.lineWidth = 2;
        if (!isMobile) ctx.shadowBlur = 20 + pulse;
        ctx.globalAlpha = 0.3;

        // Energy Ring (Larger than shield)
        ctx.beginPath();
        ctx.arc(0, 0, 35 + pulse, 0, Math.PI * 2);
        ctx.stroke();

        // Speed Trails (Afterimages)
        for (let i = 1; i <= 2; i++) {
          ctx.save();
          // Offset trails based on velocity
          const trailOffset = i * 15;
          const angle = Math.atan2(playerVel.current.y, playerVel.current.x) + Math.PI;
          ctx.translate(Math.cos(angle) * trailOffset, Math.sin(angle) * trailOffset);
          ctx.globalAlpha = (isStillInvulnerable ? 0.2 : 0.1) / i;
          ctx.strokeStyle = isStillInvulnerable ? '#00ffcc' : '#ff9900';
          drawShipVector(ctx);
          ctx.restore();
        }
        ctx.restore();
      }

      // Cockpit Glow
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.ellipse(0, -5, 3, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;

      // Engine/Afterburner Glow (Subtle)
      const thrustScale = 1 + currentSpeed * 0.2; // Reduced scaling
      const engineFlicker = Math.random() * 2; // Reduced flicker
      if (!isMobile) {
        ctx.shadowBlur = 10 + engineFlicker;
        ctx.shadowColor = isOverdriveActiveRef.current ? '#ff3366' : '#33ccff';
      }
      ctx.fillStyle = isOverdriveActiveRef.current ? '#ff3366' : '#33ccff';
      ctx.globalAlpha = 0.6; // More transparent
      // Left Engine
      ctx.fillRect(-11, PLAYER_HEIGHT/2 - 6, 4, ((isOverdriveActiveRef.current ? 15 : 6) + engineFlicker) * thrustScale);
      // Right Engine
      ctx.fillRect(7, PLAYER_HEIGHT/2 - 6, 4, ((isOverdriveActiveRef.current ? 15 : 6) + engineFlicker) * thrustScale);
      ctx.globalAlpha = 1.0;

      // Shield Effect
      if (activeEffects.current['SHIELD'] > Date.now()) {
        ctx.strokeStyle = '#33ccff';
        ctx.lineWidth = 2;
        ctx.shadowBlur = 10 * shadowScale;
        ctx.beginPath();
        ctx.arc(0, 0, 35, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
    }

      // Wingman Rendering — use ref not state to avoid stale-closure ghost after destruction
      if (wingmanRef.current) {
        ctx.save();
        ctx.translate(wingmanPos.current.x + PLAYER_WIDTH / 2, wingmanPos.current.y + PLAYER_HEIGHT / 2);
      ctx.scale(0.8, 0.8); // Slightly smaller

      const color = '#ff33cc';
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 15 * shadowScale;
      ctx.lineWidth = 2;

      // High-End Neon Vector Ship (Wingman)
      ctx.beginPath();
      ctx.moveTo(0, -PLAYER_HEIGHT/2); // Nose
      ctx.lineTo(8, -10);
      ctx.lineTo(PLAYER_WIDTH/2, PLAYER_HEIGHT/2 - 5); // Right Wing Tip
      ctx.lineTo(5, PLAYER_HEIGHT/2 - 10);
      ctx.lineTo(0, PLAYER_HEIGHT/2 - 5); // Tail center
      ctx.lineTo(-5, PLAYER_HEIGHT/2 - 10);
      ctx.lineTo(-PLAYER_WIDTH/2, PLAYER_HEIGHT/2 - 5); // Left Wing Tip
      ctx.lineTo(-8, -10);
      ctx.closePath();
      ctx.stroke();

      ctx.restore();
    }

    // Bullets
    ctx.shadowBlur = 15 * shadowScale;
    bullets.current.forEach((b) => {
      if (!b.alive) return;
      const size = b.size || 4;
      ctx.fillStyle = isOverdriveActiveRef.current ? '#ff3366' : '#00ffcc';
      ctx.shadowColor = isOverdriveActiveRef.current ? '#ff3366' : '#00ffcc';
      ctx.fillRect(b.x, b.y, size, isOverdriveActiveRef.current ? size * 5 : size * 3);
    });
    ctx.shadowBlur = 0;

    // Enemy Bullets
    ctx.shadowBlur = 10 * shadowScale;
    enemyBullets.current.forEach((b) => {
      if (!b.alive) return;
      if (b.isBeam) {
        // Beam: elongated bar aligned to velocity direction; white when deflected/bouncing
        const beamColor = b.deflected ? '#ffffff' : '#00ffdd';
        ctx.shadowColor = beamColor;
        ctx.shadowBlur = 18 * shadowScale;
        ctx.fillStyle = beamColor;
        ctx.save();
        ctx.translate(b.x + 5, b.y + 5);
        ctx.rotate(Math.atan2(b.vy ?? 0, b.vx ?? 0) + Math.PI / 2);
        ctx.fillRect(-4, -14, 8, 28);
        ctx.restore();
        ctx.shadowBlur = 10 * shadowScale;
      } else {
        ctx.fillStyle = '#ff9900';
        ctx.shadowColor = '#ff9900';
        ctx.beginPath();
        ctx.arc(b.x + 2, b.y + 6, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.shadowBlur = 0;

    // Enemies — color array hoisted outside loop to avoid per-enemy allocation.
    const drawEnemyColors = ['#ffcc00', '#ff33cc', '#33ccff', '#ff0000'];
    enemies.current.forEach((enemy) => {
      if (!enemy.alive) return;

      ctx.save();
      ctx.translate(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2);

      // Warp-in flicker: ENTERING enemies are immune to bullets — pulse to signal this
      if (enemy.state === 'ENTERING') {
        ctx.globalAlpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(drawNow / 80));
      }

      if (enemy.isBoss) {
        // Boss Rendering
        const color = enemy.bossType === BossType.LASER ? '#00ffcc' : '#ff3366';
        const pulse = Math.sin(drawNow / 150) * 10;
        ctx.shadowBlur = (isMinimalBossFx ? 7 : isReducedBossFx ? 11 : 15) * shadowScale;
        ctx.shadowColor = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;

        if (enemy.bossType === BossType.TRACTOR) {
          // Main Body (Large Hexagon-like)
          ctx.beginPath();
          ctx.moveTo(0, -enemy.height / 2);
          ctx.lineTo(enemy.width / 2, -enemy.height / 4);
          ctx.lineTo(enemy.width / 2, enemy.height / 4);
          ctx.lineTo(0, enemy.height / 2);
          ctx.lineTo(-enemy.width / 2, enemy.height / 4);
          ctx.lineTo(-enemy.width / 2, -enemy.height / 4);
          ctx.closePath();
          ctx.stroke();

          // Inner details
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, 20 + pulse / 2, 0, Math.PI * 2);
          ctx.stroke();
        } else if (enemy.bossType === BossType.SWARM) {
          // Spiky Organic Shape
          ctx.beginPath();
          for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            const r = (i % 2 === 0 ? enemy.width / 2 : enemy.width / 3) + pulse;
            ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
          }
          ctx.closePath();
          ctx.stroke();

          // Core
          ctx.fillStyle = '#ffcc00';
          ctx.beginPath();
          ctx.arc(0, 0, 15 + pulse / 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (enemy.bossType === BossType.LASER) {
          // Core with rotating outer rings
          ctx.beginPath();
          ctx.arc(0, 0, 40 + pulse, 0, Math.PI * 2);
          ctx.stroke();

          // Rotating Rings — skip entirely at tier 2 (ellipse + rotate is expensive on mobile)
          // Use tractorBeamTimer (game-time) instead of wall clock: stays in sync with the
          // laser beams and doesn't desync when hitstop or upgrade screen pauses the update loop.
          const angleOffset = (enemy.tractorBeamTimer! / 1000) * Math.PI;
          const ringCount = isMinimalBossFx ? 0 : isReducedBossFx ? 1 : 2;
          for (let i = 0; i < ringCount; i++) {
            ctx.save();
            // 0.08 = slow drift; each ring has a different base phase so their "snap"
            // intervals never align. Ellipses are 1.3:1 (was 2:1) — rounder shape makes
            // the 2-fold visual symmetry much less jarring when the ring loops.
            ctx.rotate(angleOffset * (i + 1) * 0.08 + i * Math.PI * 0.37);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(0, 0, 60 + i * 20, 46 + i * 15, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }

          // Draw Lasers
          if (enemy.phase! >= 1) {
            const angle = (enemy.tractorBeamTimer! / 1000) * Math.PI;
            const laserCount = (isMinimalBossFx || isReducedBossFx) ? 2 : enemy.phase === 3 ? 4 : 2;
            ctx.save();
            ctx.lineWidth = (isMinimalBossFx ? 5 : isReducedBossFx ? 6.5 : 8) + Math.sin(drawNow / 50) * (isMinimalBossFx ? 2 : isReducedBossFx ? 3 : 4);
            ctx.strokeStyle = isMinimalBossFx ? 'rgba(0, 255, 255, 0.82)' : isReducedBossFx ? 'rgba(0, 255, 255, 0.9)' : '#00ffff';
            ctx.shadowBlur = (isMinimalBossFx ? 8 : isReducedBossFx ? 14 : 20) * shadowScale;
            ctx.shadowColor = '#00ffff';
            for (let i = 0; i < laserCount; i++) {
              const laserAngle = angle + (i * Math.PI * 2 / laserCount);
              ctx.beginPath();
              ctx.moveTo(0, 0);
              ctx.lineTo(Math.cos(laserAngle) * 1000, Math.sin(laserAngle) * 1000);
              ctx.stroke();
            }
            ctx.restore();
          }
        }

        // Phase indicators
        if (enemy.phase! >= 2) {
          ctx.fillStyle = '#ffcc00';
          ctx.fillRect(-enemy.width / 2 + 10, -10, 5, 20);
          ctx.fillRect(enemy.width / 2 - 15, -10, 5, 20);
        }
        if (enemy.phase! >= 3 && !isMinimalBossFx) {
          ctx.strokeStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(0, 0, 40, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Tractor Beam Rendering
        if (enemy.bossType === BossType.TRACTOR && (enemy.isTractorBeaming || (enemy.tractorBeamTimer! > 2500))) {
          ctx.save();
          const isCharging = enemy.tractorBeamTimer! > 2500 && !enemy.isTractorBeaming;
          const beamWidth = isCharging ? 4 : 120 + Math.sin(drawNow / 50) * 20;
          const beamAlpha = isCharging ? 0.3 : 0.8;

          const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
          gradient.addColorStop(0, `rgba(0, 255, 255, ${beamAlpha})`);
          gradient.addColorStop(1, `rgba(0, 255, 255, ${beamAlpha * 0.1})`);

          ctx.fillStyle = gradient;
          ctx.shadowColor = '#00ffff';
          ctx.shadowBlur = (isCharging ? 5 : 20) * shadowScale;
          ctx.beginPath();
          ctx.moveTo(-20, enemy.height / 2);
          ctx.lineTo(20, enemy.height / 2);
          ctx.lineTo(beamWidth / 2, CANVAS_HEIGHT);
          ctx.lineTo(-beamWidth / 2, CANVAS_HEIGHT);
          ctx.closePath();
          ctx.fill();

          if (!isCharging && !isMinimalBossFx) {
            // Add some scanning lines inside the beam
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 2;
            const scanY = (drawNow % 1000) / 1000 * CANVAS_HEIGHT;
            ctx.beginPath();
            ctx.moveTo(-beamWidth / 2 * (scanY / CANVAS_HEIGHT), scanY);
            ctx.lineTo(beamWidth / 2 * (scanY / CANVAS_HEIGHT), scanY);
            ctx.stroke();
          }
          ctx.restore();
        }

        ctx.restore();
        return;
      }

      if (enemy.isTurret) {
        // Turret Rendering (Octagon Defense)
        const color = '#ffcc00';
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 15 * shadowScale;
        ctx.lineWidth = 3;

        ctx.beginPath();
        for(let i=0; i<8; i++) {
          const a = (i * Math.PI * 2) / 8;
          const x = Math.cos(a) * enemy.width/2;
          const y = Math.sin(a) * enemy.height/2;
          if(i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();

        // Rotating Core
        ctx.save();
        ctx.rotate(drawNow / 500);
        ctx.strokeRect(-8, -8, 16, 16);
        ctx.restore();

        // Draw Tentacles in world space
        if (enemy.bossType === BossType.TENTACLE && enemy.tentacles) {
          ctx.restore(); // Restore boss translate
          const time = drawNow / 1000;

          enemy.tentacles.forEach((t, tIdx) => {
            const hue = (time * 50 + tIdx * 60) % 360;
            const color = `hsla(${hue}, 80%, 60%, 1)`;
            const glowColor = `hsla(${hue}, 80%, 60%, 0.4)`;

            if (isMinimalBossFx) {
              ctx.save();
              ctx.strokeStyle = color;
              ctx.lineWidth = 3;
              ctx.shadowBlur = 6 * shadowScale;
              ctx.shadowColor = glowColor;
              ctx.beginPath();
              t.segments.forEach((seg, i) => {
                if (i === 0) ctx.moveTo(seg.x, seg.y);
                else ctx.lineTo(seg.x, seg.y);
              });
              ctx.stroke();
              ctx.restore();
            } else {
              const segmentStride = isReducedBossFx ? 2 : 1;
              t.segments.forEach((seg, i) => {
                if (i % segmentStride !== 0) return;
              ctx.save();
              ctx.translate(seg.x, seg.y);
              ctx.rotate(seg.angle);

              const size = 30 - i * 2;
              if (size <= 0) {
                ctx.restore();
                return;
              }

              // Glow
              ctx.shadowBlur = 15 * shadowScale;
              ctx.shadowColor = glowColor;

              // Organic segment
              ctx.fillStyle = i % 2 === 0 ? color : '#ffffff';
              ctx.beginPath();
              // Pulsating size
              const pulse = 1 + Math.sin(time * 5 + i * 0.5) * 0.15;
              ctx.ellipse(0, 0, (size/2) * pulse, (size/3) * pulse, 0, 0, Math.PI * 2);
              ctx.fill();

              // Inner detail
              if (i % 3 === 0) {
                ctx.fillStyle = '#000000';
                ctx.beginPath();
                ctx.arc(0, 0, size/6, 0, Math.PI * 2);
                ctx.fill();
              }

              ctx.restore();
              });
            }

            // Tip effect
            const tip = t.segments[t.segments.length - 1];
            ctx.save();
            ctx.translate(tip.x, tip.y);
            ctx.fillStyle = '#ffffff';
            ctx.shadowBlur = (isMinimalBossFx ? 10 : 20) * shadowScale;
            ctx.shadowColor = '#ffffff';
            ctx.beginPath();
            ctx.arc(0, 0, 5 + Math.sin(time * 10) * 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          });

          // Core
          ctx.save();
          ctx.translate(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2);
          const coreHue = (time * 100) % 360;
          ctx.fillStyle = `hsla(${coreHue}, 90%, 50%, 1)`;
          ctx.shadowBlur = (isMinimalBossFx ? 14 : 30) * shadowScale;
          ctx.shadowColor = `hsla(${coreHue}, 90%, 50%, 0.8)`;
          ctx.beginPath();
          ctx.arc(0, 0, 30 + Math.sin(time * 8) * 5, 0, Math.PI * 2);
          ctx.fill();

          // Core eye
          ctx.fillStyle = '#000000';
          ctx.beginPath();
          ctx.arc(Math.sin(time * 2) * 5, Math.cos(time * 2) * 5, 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          return;
        }

        ctx.restore();
        return;
      }

      // Rotation for diving/returning/entering
      let angle = Math.PI; // Default: point down towards player
      if (enemy.state === 'ENTERING' || enemy.isDiving || enemy.isReturning) {
        const dx = enemy.x - (enemy.prevX ?? enemy.x);
        const dy = enemy.y - (enemy.prevY ?? enemy.y);

        if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
          angle = Math.atan2(dy, dx) + Math.PI / 2;
        } else if (enemy.state === 'ENTERING') {
          const target = enemy.path![Math.min(enemy.pathIndex!, enemy.path!.length - 1)];
          angle = Math.atan2(target.y - enemy.y, target.x - enemy.x) + Math.PI / 2;
        } else if (enemy.isDiving) {
          // Point towards player if just starting dive
          angle = Math.atan2(playerPos.current.y - enemy.y, playerPos.current.x - enemy.x) + Math.PI / 2;
        }
      }
      ctx.rotate(angle);

      const color = drawEnemyColors[enemy.type] || '#ffcc00';

      ctx.shadowBlur = 15 * shadowScale;
      ctx.shadowColor = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;

      ctx.beginPath();
      if (enemy.type === 0) {
        // Type 0: Scout (V-Shape Wing)
        ctx.moveTo(0, -enemy.height/2);
        ctx.lineTo(enemy.width/2, enemy.height/2);
        ctx.lineTo(0, enemy.height/4);
        ctx.lineTo(-enemy.width/2, enemy.height/2);
        ctx.closePath();
        ctx.stroke();

        // Core
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.5 + Math.sin(drawNow / 100) * 0.3;
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (enemy.type === 1) {
        // Type 1: Interceptor (Diamond Shield)
        ctx.moveTo(0, -enemy.height/2);
        ctx.lineTo(enemy.width/2, 0);
        ctx.lineTo(0, enemy.height/2);
        ctx.lineTo(-enemy.width/2, 0);
        ctx.closePath();
        ctx.stroke();

        // Inner Diamond
        ctx.beginPath();
        ctx.moveTo(0, -enemy.height/4);
        ctx.lineTo(enemy.width/4, 0);
        ctx.lineTo(0, enemy.height/4);
        ctx.lineTo(-enemy.width/4, 0);
        ctx.closePath();
        ctx.stroke();

        // Side Thrusters
        ctx.fillStyle = color;
        ctx.fillRect(-enemy.width/2 - 2, -2, 4, 4);
        ctx.fillRect(enemy.width/2 - 2, -2, 4, 4);
      } else if (enemy.type === 2) {
        // Type 2: Heavy (Hexagon Fortress)
        for(let i=0; i<6; i++) {
          const a = (i * Math.PI * 2) / 6 - Math.PI/2;
          const x = Math.cos(a) * enemy.width/2;
          const y = Math.sin(a) * enemy.height/2;
          if(i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();

        // Inner Hexagon
        ctx.beginPath();
        for(let i=0; i<6; i++) {
          const a = (i * Math.PI * 2) / 6 - Math.PI/2;
          const x = Math.cos(a) * enemy.width/4;
          const y = Math.sin(a) * enemy.height/4;
          if(i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();

        // Core Glow
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.fill();
      } else if (enemy.type === 3) {
        // Type 3: Elite (Spiked Star)
        for(let i=0; i<8; i++) {
          const a = (i * Math.PI * 2) / 8 - Math.PI/2;
          const r = i % 2 === 0 ? enemy.width/2 : enemy.width/4;
          const x = Math.cos(a) * r;
          const y = Math.sin(a) * r;
          if(i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();

        // Inner Pulse
        ctx.beginPath();
        ctx.arc(0, 0, 8 + Math.sin(drawNow / 100) * 4, 0, Math.PI * 2);
        ctx.stroke();

        // Health Bar for Elite
        if (enemy.health !== undefined && enemy.maxHealth !== undefined) {
          const barW = 40;
          const barH = 3;
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(-barW/2, -enemy.height/2 - 10, barW, barH);
          ctx.fillStyle = '#ff0000';
          ctx.fillRect(-barW/2, -enemy.height/2 - 10, (enemy.health / enemy.maxHealth) * barW, barH);
        }
      } else if (enemy.type === 4) {
        // Type 4: Shielded (Circle with front arc)
        const shieldColor = '#33ccff';
        ctx.strokeStyle = shieldColor;
        ctx.shadowColor = shieldColor;
        ctx.shadowBlur = 10 * shadowScale;
        ctx.lineWidth = 2;

        // Body
        ctx.beginPath();
        ctx.arc(0, 0, enemy.width / 2 - 5, 0, Math.PI * 2);
        ctx.stroke();

        // Core
        ctx.fillStyle = shieldColor;
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.fill();

        // Shield Arc
        if (enemy.shield && enemy.shield > 0) {
          ctx.beginPath();
          ctx.arc(0, 0, enemy.width / 2, -Math.PI / 2, Math.PI / 2);
          ctx.lineWidth = 4;
          ctx.stroke();
        }
      }

      ctx.restore();
    });

    // Particles
    particles.current.forEach(p => {
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.save();
      ctx.translate(p.x, p.y);
      if (p.rotation !== undefined) ctx.rotate(p.rotation);
      ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
      ctx.restore();
    });
    ctx.globalAlpha = 1.0;

    // Drones
    drones.current.forEach(drone => {
      const dx = playerPos.current.x + PLAYER_WIDTH / 2 + Math.cos(drone.angle) * drone.distance;
      const dy = playerPos.current.y + PLAYER_HEIGHT / 2 + Math.sin(drone.angle) * drone.distance;

      ctx.save();
      ctx.translate(dx, dy);
      ctx.rotate(drone.angle + Math.PI / 2);

      ctx.shadowBlur = 10 * shadowScale;
      ctx.shadowColor = '#00ffcc';
      ctx.strokeStyle = '#00ffcc';
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.lineTo(4, 3);
      ctx.lineTo(-4, 3);
      ctx.closePath();
      ctx.stroke();

      ctx.restore();
    });

    // Damage Numbers
    damageNumbers.current.forEach(dn => {
      ctx.globalAlpha = dn.life / 30;
      ctx.fillStyle = dn.color;
      ctx.font = `bold ${dn.isCrit ? '16px' : '12px'} 'JetBrains Mono'`;
      ctx.textAlign = 'center';
      ctx.fillText(Math.floor(dn.value).toString(), dn.x, dn.y - (30 - dn.life));
    });
    ctx.globalAlpha = 1.0;

    ctx.restore(); // Restore from shake

    // Nebula Pass Effect (boss/late-stage ambience only when trippy is active)
    // During boss on mobile tier 1, skip 2-of-3 frames (divisor 3) instead of 1-of-2.
    // Nebula uses createRadialGradient + screen composite — expensive for 60-frame loops.
    const nebulaFrameDivisor = renderLoadTierRef.current === 0 ? 1
      : (renderLoadTierRef.current === 1 && isMobile && waveHasBossRef.current) ? 3
      : renderLoadTierRef.current === 1 ? 2 : 3;
    const shouldRenderNebula = Math.floor(drawNow / 16) % nebulaFrameDivisor === 0;
    if (trippyIntensity.current > 0.05 && shouldRenderNebula) {
      ctx.save();
      const time = Date.now() / 2000;
      const nebulaLoadScale = renderLoadTierRef.current === 2 ? 0.4 : renderLoadTierRef.current === 1 ? 0.65 : 1;
      const intensity = (trippyIntensity.current * 0.18 + (pulseRef.current * 0.06 * trippyIntensity.current)) * nebulaLoadScale;

      const nebulaGradient = ctx.createRadialGradient(
        CANVAS_WIDTH / 2 + Math.sin(time) * 150,
        CANVAS_HEIGHT / 2 + Math.cos(time * 0.7) * 150,
        0,
        CANVAS_WIDTH / 2,
        CANVAS_HEIGHT / 2,
        CANVAS_WIDTH * (1.5 + pulseRef.current * 0.2)
      );

      const hue1 = (time * 40 + (trippyIntensity.current * 100)) % 360;
      const hue2 = (hue1 + 60 + (pulseRef.current * 30)) % 360;

      nebulaGradient.addColorStop(0, `hsla(${hue1}, 80%, 50%, ${intensity})`);
      nebulaGradient.addColorStop(0.5, `hsla(${hue2}, 80%, 30%, ${intensity * 0.5})`);
      nebulaGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = nebulaGradient;
      ctx.globalCompositeOperation = 'screen';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      ctx.globalAlpha = 1.0;
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
    }

    // Flash
    if (flash.current > 0) {
      const flashScale = renderLoadTierRef.current === 2 ? 0.12 : renderLoadTierRef.current === 1 ? 0.2 : 0.3;
      const flashAlpha = flash.current * flashScale;
      ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    // Speed Lines Overlay (Warp) - Removed for cleaner look
    /*
    if (warpFactor.current > 0.3) {
      ctx.save();
      ctx.strokeStyle = `rgba(255, 255, 255, ${warpFactor.current * 0.2})`;
      ctx.lineWidth = 2;
      for (let i = 0; i < 20; i++) {
        const x = Math.random() * CANVAS_WIDTH;
        const len = Math.random() * 200 * warpFactor.current;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, len);
        ctx.stroke();
      }
      ctx.restore();
    }
    */

    // Draw Mouse/Touch Anchor & Tether
    if (gameState === 'PLAYING') {
      const armedAnchor = slingshotArmed.current && slingshotArmedPos.current && Date.now() < slingshotArmedExpiry.current
        ? slingshotArmedPos.current
        : null;
      const anchor = isTouching.current ? touchStartPos.current : (mouseAnchorPos.current || armedAnchor);
      const current = currentMousePos.current;
      const isDraggingInput = isMouseDown.current || isTouching.current;

      if (anchor && (isDraggingInput || armedAnchor)) {
        const dx = current.x - anchor.x;
        const dy = current.y - anchor.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (armedAnchor && !isDraggingInput) {
          const pulse = 0.6 + Math.sin(Date.now() * 0.015) * 0.25;
          ctx.save();
          ctx.beginPath();
          ctx.arc(anchor.x, anchor.y, 10 + pulse * 4, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(0, 255, 204, ${0.35 + pulse * 0.25})`;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(anchor.x, anchor.y, 4, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 255, ${0.4 + pulse * 0.3})`;
          ctx.fill();
          ctx.restore();
        }

        if (dist > 5) {
          const maxJoy = 100;
          const ratio = Math.min(dist / maxJoy, 1);

          ctx.save();

          if (isSlingshotMode.current) {
            const pCenterX = playerPos.current.x + PLAYER_WIDTH / 2;
            const pCenterY = playerPos.current.y + PLAYER_HEIGHT / 2;
            const sCenterX = playerStartPos.current.x + PLAYER_WIDTH / 2;
            const sCenterY = playerStartPos.current.y + PLAYER_HEIGHT / 2;
            const isDefenseOnlyPreview = dist <= SLINGSHOT_DEFENSE_ONLY_MAX_PULL;
            if (isDefenseOnlyPreview) {
              const pullMag = Math.sqrt(dx * dx + dy * dy) || 1;
              const pullDirX = dx / pullMag;
              const pullDirY = dy / pullMag;
              const guardRatio = Math.min(dist / SLINGSHOT_DEFENSE_ONLY_MAX_PULL, 1);
              const boundaryX = pCenterX + pullDirX * SLINGSHOT_DEFENSE_ONLY_MAX_PULL;
              const boundaryY = pCenterY + pullDirY * SLINGSHOT_DEFENSE_ONLY_MAX_PULL;
              const pullAngle = Math.atan2(pullDirY, pullDirX);

              ctx.save();
              ctx.strokeStyle = `rgba(0, 255, 204, ${0.22 + guardRatio * 0.22})`;
              ctx.lineWidth = 2;
              ctx.setLineDash([8, 8]);
              ctx.beginPath();
              ctx.arc(pCenterX, pCenterY, SLINGSHOT_DEFENSE_ONLY_MAX_PULL, pullAngle - 0.8, pullAngle + 0.8);
              ctx.stroke();
              ctx.setLineDash([]);

              ctx.beginPath();
              ctx.arc(boundaryX, boundaryY, 7 + guardRatio * 3, 0, Math.PI * 2);
              ctx.fillStyle = `rgba(0, 255, 204, ${0.16 + guardRatio * 0.18})`;
              ctx.fill();
              ctx.strokeStyle = `rgba(255, 255, 255, ${0.4 + guardRatio * 0.3})`;
              ctx.lineWidth = 1.5;
              ctx.stroke();
              ctx.restore();
            } else {
              // Predicted landing point on the threshold ring (release stop position)
              if (dist >= SLINGSHOT_ATTACK_PREVIEW_THRESHOLD) {
                const pullMag = Math.sqrt(dx * dx + dy * dy) || 1;
                const pullDirX = -dx / pullMag;
                const pullDirY = -dy / pullMag;
                const landingDistance = getSlingshotLandingDistance(dist);
                const predictedCenterX = sCenterX + pullDirX * landingDistance;
                const predictedCenterY = sCenterY + pullDirY * landingDistance;

                ctx.beginPath();
                ctx.arc(predictedCenterX, predictedCenterY, 10, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0, 255, 204, 0.22)';
                ctx.fill();

                ctx.beginPath();
                ctx.arc(predictedCenterX, predictedCenterY, 4, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                ctx.fill();

                ctx.beginPath();
                ctx.moveTo(sCenterX, sCenterY);
                ctx.lineTo(predictedCenterX, predictedCenterY);
                ctx.strokeStyle = 'rgba(0, 255, 204, 0.3)';
                ctx.lineWidth = 1.5;
                ctx.stroke();
              }

              // 1. Tension Visuals
              const tension = dist / SLINGSHOT_THRESHOLD;
              const clampedTension = Math.min(tension, 2.5);
              const isAttackRange = isSlingshotCharged.current && tension > 1.0;

              let ringColor = `rgba(0, 255, 204, 0.3)`;
              let hue = 180;

              if (isAttackRange) {
                hue = 300 + (clampedTension - 1.0) * 60;
                ringColor = `hsla(${hue}, 100%, 60%, ${0.7 + (clampedTension - 1.0) * 0.3})`;
              } else if (tension > 0.6) {
                const warningRatio = (tension - 0.6) / 0.4;
                const r = Math.floor(0 + 255 * warningRatio);
                const g = Math.floor(255);
                const b = Math.floor(204 - 204 * warningRatio);
                ringColor = `rgba(${r}, ${g}, ${b}, ${0.3 + warningRatio * 0.4})`;
              }

              // 2. Tether Line (From Ship to Relative Mouse Offset)
              const handleX = pCenterX + dx;
              const handleY = pCenterY + dy;

              ctx.beginPath();
              const midX = (pCenterX + handleX) / 2;
              const midY = (pCenterY + handleY) / 2;
              const jitterIntensity = isAttackRange ? Math.max(0, (clampedTension - 1.0) * 40) : (tension > 0.8 ? (tension - 0.8) * 5 : 0);
              const jitter = Math.sin(Date.now() * 0.08) * jitterIntensity;

              ctx.moveTo(pCenterX, pCenterY);
              ctx.quadraticCurveTo(midX + jitter, midY + jitter, handleX, handleY);
              ctx.strokeStyle = ringColor;
              ctx.lineWidth = isAttackRange ? 4 + (clampedTension - 1.0) * 20 : 2.5;
              ctx.stroke();

              // 3. Anchor Core (At Ship Center)
              ctx.beginPath();
              ctx.arc(pCenterX, pCenterY, 8, 0, Math.PI * 2);
              ctx.fillStyle = isAttackRange ? `hsla(${hue}, 100%, 70%, 0.9)` : `rgba(0, 255, 204, 0.8)`;
              ctx.fill();
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 2;
              ctx.stroke();

              // 4. Mouse Handle (The "Pull Point" - Relative)
              ctx.beginPath();
              ctx.arc(handleX, handleY, 12 + clampedTension * 5, 0, Math.PI * 2);
              ctx.strokeStyle = ringColor;
              ctx.lineWidth = 2;
              ctx.stroke();

              // 5. Inner Core Glow
              if (isAttackRange) {
                ctx.beginPath();
                ctx.arc(pCenterX, pCenterY, 5 + clampedTension * 5, 0, Math.PI * 2);
                ctx.fillStyle = `hsla(${hue}, 100%, 80%, 0.8)`;
                ctx.fill();
              }

              // 6. High Tension Sparks
              const sparkNow = Date.now();
              if (clampedTension > 1.0 && sparkNow - lastSparkAt.current > 33) {
                lastSparkAt.current = sparkNow;
                createExplosion(handleX, handleY, '#ffffff', 1);
                if (Math.random() > 0.5) {
                  createExplosion(handleX, handleY, `hsla(${hue}, 100%, 70%, 1)`, 1);
                }
              }
            }
          } else {
            // PRECISION MODE: No visual line
          }

          ctx.restore();
        }
      }
    }

    // Ambush Warning removed
    const isTimeBasedStage = isSurvivalStage(currentStage);
    const shieldFxActive = slingshotShieldStateCache.active;

    // Final Post-Processing to Main Canvas
    mainCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    mainCtx.drawImage(offscreenCanvas.current, 0, 0);

    // Keep only lightweight screen finishing so visuals stay readable without affecting control timing.
    if (!isMobile && renderLoadTierRef.current === 0 && !shieldFxActive) {
      mainCtx.fillStyle = 'rgba(18, 16, 16, 0.1)';
      for (let i = 0; i < CANVAS_HEIGHT; i += 4) {
        mainCtx.fillRect(0, i, CANVAS_WIDTH, 1);
      }
    }

    if (!isMobile && renderLoadTierRef.current < 2 && !shieldFxActive) {
      const gradient = mainCtx.createRadialGradient(
        CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH / 4,
        CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH / 1.2
      );
      gradient.addColorStop(0, 'rgba(0,0,0,0)');
      gradient.addColorStop(1, 'rgba(0,0,0,0.4)');
      mainCtx.fillStyle = gradient;
      mainCtx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }
  };

  const loop = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');

    const now = Date.now();
    const elapsed = now - lastTimeRef.current;

    // Cap at 60fps on mobile (ProMotion devices fire rAF at 120Hz, doubling CPU/GPU load).
    // Skip the frame but re-queue immediately — keeps animation smooth without doing double work.
    if (isMobile && elapsed < 14) {
      requestRef.current = requestAnimationFrame(loop);
      return;
    }

    lastTimeRef.current = now;
    const boundedElapsed = Math.max(1, Math.min(1000, elapsed));
    // Normalize to 60fps (16.67ms per frame)
    dtRef.current = Math.min(2.0, boundedElapsed / (1000 / 60));
    frameCounterRef.current += 1;

    frameTimeSamplesMs.current.push(boundedElapsed);
    fpsSamples.current.push(1000 / boundedElapsed);
    if (frameTimeSamplesMs.current.length > 240) frameTimeSamplesMs.current.shift();
    if (fpsSamples.current.length > 240) fpsSamples.current.shift();

    if (now - lastPerfUiUpdateAt.current >= 500) {
      lastPerfUiUpdateAt.current = now;
      const currentStage = getStageFromWave(waveRef.current);
      const aliveEnemies = enemies.current.reduce((count, enemy) => count + (enemy.alive ? 1 : 0), 0);
      const p50Fps = getPercentile(fpsSamples.current, 50);
      const p95Fps = getPercentile(fpsSamples.current, 95);
      const p50Frame = getPercentile(frameTimeSamplesMs.current, 50);
      const p95Frame = getPercentile(frameTimeSamplesMs.current, 95);

      // Adaptive quality control with hysteresis: reduce expensive full-screen effects only when needed.
      // Mobile thresholds are tighter: GPU/CPU runs hotter and thermal throttling kicks in earlier.
      const prevTier = renderLoadTierRef.current;
      let nextTier = prevTier;
      const isChaseStage = currentStage === 4;
      const isFinalLaserBossActive = enemies.current.some((enemy) => enemy.alive && enemy.isBoss && enemy.bossType === BossType.LASER);
      // On mobile: pre-emptively raise to tier 1 the moment any boss is alive,
      // without waiting for frame-time degradation. Boss shadowBlur and tentacle
      // rendering are expensive enough that reactive tier changes arrive too late.
      const isBossActiveForTier = isMobile && waveHasBossRef.current;

      // Final Front sector 2 boss gets the earliest downgrade because its beam pass is expensive.
      if (isFinalLaserBossActive) {
        if (p95Frame > (isMobile ? 28 : 34)) nextTier = 2;
        else if (p95Frame > (isMobile ? 22 : 26)) nextTier = 1;
        else if (p95Frame < (isMobile ? 18 : 20)) nextTier = 0;
      } else if (isChaseStage) {
        if (p95Frame > (isMobile ? 36 : 42)) nextTier = 2;
        else if (p95Frame > (isMobile ? 28 : 32)) nextTier = 1;
        else if (p95Frame < (isMobile ? 20 : 24)) nextTier = 0;
      } else {
        // Other stages — mobile escalates at 28ms (tier 1) / 38ms (tier 2) vs desktop 36/48ms
        if (p95Frame > (isMobile ? 38 : 48)) nextTier = 2;
        else if (p95Frame > (isMobile ? 28 : 36)) nextTier = 1;
        else if (p95Frame < (isMobile ? 22 : 28)) nextTier = 0;
      }
      // Mobile boss floor: never drop below tier 1 while a boss is alive.
      if (isBossActiveForTier && nextTier < 1) nextTier = 1;
      // Mobile formation floor: ≥10 alive enemies means 10+ per-enemy shadowBlur draws per frame —
      // as GPU-expensive as a boss. Pre-raise to tier 1 proactively.
      if (isMobile && aliveEnemies >= 10 && nextTier < 1) nextTier = 1;
      renderLoadTierRef.current = nextTier;

      let nextSimulationTier = simulationLoadTierRef.current;
      // Mobile escalates earlier: 30fps (33ms) triggers tier 1, 24fps (42ms) triggers tier 2.
      if (isFinalLaserBossActive) {
        if (p95Frame > (isMobile ? 35 : 40)) nextSimulationTier = 2;
        else if (p95Frame > (isMobile ? 28 : 30)) nextSimulationTier = 1;
        else if (p95Frame < (isMobile ? 22 : 24)) nextSimulationTier = 0;
      } else if (p95Frame > (isMobile ? 42 : 50)) nextSimulationTier = 2;
      else if (p95Frame > (isMobile ? 33 : 38)) nextSimulationTier = 1;
      else if (p95Frame < (isMobile ? 26 : 28)) nextSimulationTier = 0;
      // Mobile boss + formation floor for simulation tier as well.
      if (isBossActiveForTier && nextSimulationTier < 1) nextSimulationTier = 1;
      if (isMobile && aliveEnemies >= 10 && nextSimulationTier < 1) nextSimulationTier = 1;
      simulationLoadTierRef.current = nextSimulationTier;

      setPerfStats({
        fpsP50: p50Fps,
        fpsP95: p95Fps,
        frameMsP50: p50Frame,
        frameMsP95: p95Frame,
        enemies: aliveEnemies,
        bullets: bullets.current.length,
        enemyBullets: enemyBullets.current.length,
        particles: particles.current.length,
      });
    }

    if (ctx) {
      // On mobile, throttle draw-only frames (non-PLAYING states) to ~30fps to save battery.
      const isIdleState = gameState !== 'PLAYING';
      if (isMobile && isIdleState && frameCounterRef.current % 2 !== 0) {
        requestRef.current = requestAnimationFrame(loop);
        return;
      }

      // Laser rotation runs on every rAF tick — completely independent of hitstop.
      // hitstop blocks update() which is why the beam used to freeze mid-rotation.
      for (const e of enemies.current) {
        if (e.alive && e.bossType === BossType.LASER) {
          const spd = e.phase === 3 ? 0.45 : e.phase === 2 ? 0.35 : 0.28;
          e.tractorBeamTimer = (e.tractorBeamTimer || 0) + dtRef.current * (1000 / 60) * spd;
        }
      }

      if (Date.now() < hitStopTimer.current) {
        draw(ctx);
      } else {
        update();
        draw(ctx);
      }
    }

    requestRef.current = requestAnimationFrame(loop);
  };

  useEffect(() => {
    // Only start the loop if it's not already running
    if (!requestRef.current) {
      requestRef.current = requestAnimationFrame(loop);
    }
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
        requestRef.current = null;
      }
    };
  }, [gameState, assets]);

  useEffect(() => {
    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem('neon:highScore', String(score));
    }
  }, [score]);

  return (
    <div
      className="min-h-dvh w-full bg-[#020205] text-white flex flex-col items-center justify-between md:justify-center font-mono overflow-x-hidden overflow-y-visible md:overflow-hidden"
      style={{
        paddingTop: isMobile ? 'max(8px, env(safe-area-inset-top))' : undefined,
        paddingBottom: isMobile ? 'max(8px, env(safe-area-inset-bottom))' : undefined,
      }}
    >
      <GameHud
        level={level}
        xp={xp}
        xpToNextLevel={xpToNextLevel}
        sectorName={sectorName}
        score={score}
        combo={combo}
        wingmanActive={wingmanRef.current}
        integrity={integrity}
        overdrive={overdrive}
        maxOverdrive={MAX_OVERDRIVE}
        isOverdriveActive={isOverdriveActive}
        stageProgress={stageProgress}
        wallMode={wallMode}
        onOpenWheel={openWheel}
        showWallMode={gameState === 'PLAYING'}
      />

      {/* Wall mode selection wheel — opens on Tab (PC) or HUD button (mobile) */}
      {isWheelOpen && (
        <SlingshotModeWheel
          current={wallMode}
          onSelect={(mode) => { setWallMode(mode); wallModeRef.current = mode; }}
          onClose={closeWheel}
        />
      )}

      {/* Game Canvas Container with Ambient Glow and Scanlines */}
      <div
        className="relative border-4 md:border-8 border-[#1a1a2e] rounded-xl shadow-[0_0_80px_rgba(0,255,204,0.15)] overflow-hidden max-w-[95vw] max-h-[70vh] aspect-3/4 group"
      >
        {/* Ambient Glow behind canvas */}
        <div className="absolute inset-0 bg-[#00ffcc]/5 blur-3xl rounded-full opacity-30 group-hover:opacity-60 transition-opacity duration-1000 -z-10" />

        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="block w-full h-full object-contain bg-black relative z-10"
          style={{ imageRendering: 'pixelated', touchAction: 'none' }}
        />

        {/* Scanline Overlay */}
        <div className="absolute inset-0 pointer-events-none z-20 opacity-[0.04] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-size-[100%_2px,3px_100%]" />

        {/* CRT Vignette */}
        <div className="absolute inset-0 pointer-events-none z-20 shadow-[inset_0_0_100px_rgba(0,0,0,0.4)]" />



        {/* Relic Inventory (VS Style) */}
        <div className="absolute top-16 left-4 flex flex-col gap-1 pointer-events-none">
          <span className="text-[8px] text-[#00ffcc]/40 font-bold uppercase tracking-widest">Tech_Inventory</span>
          <div className="flex gap-1 max-w-30 flex-wrap">
            {relics.map((relic, i) => (
              <motion.div
                key={`${relic.id}-${i}`}
                initial={{ scale: 0, rotate: -45 }}
                animate={{ scale: 1, rotate: 0 }}
                className="w-5 h-5 bg-[#00ffcc]/10 border border-[#00ffcc]/40 flex items-center justify-center rounded shadow-[0_0_10px_rgba(0,255,204,0.1)]"
                title={relic.label}
              >
                {relic.id === 'CHAIN' && <Zap className="w-3 h-3 text-[#00ffcc]" />}
                {relic.id === 'DRONE' && <Cpu className="w-3 h-3 text-[#00ffcc]" />}
                {relic.id === 'REGEN' && <Heart className="w-3 h-3 text-[#00ffcc]" />}
                {relic.id === 'SHIELD_REGEN' && <Shield className="w-3 h-3 text-[#00ffcc]" />}
                {relic.id === 'WINGMAN' && <Users className="w-3 h-3 text-[#00ffcc]" />}
                {relic.id === 'FRENZY' && <Activity className="w-3 h-3 text-[#00ffcc]" />}
                {relic.id === 'CHRONO' && <RotateCcw className="w-3 h-3 text-[#00ffcc]" />}
                {relic.id === 'EMP' && <Zap className="w-3 h-3 text-[#ff3366]" />}
              </motion.div>
            ))}
          </div>
        </div>

        {/* Active Power-ups UI */}
        <div className="absolute bottom-4 left-4 flex flex-col gap-2">
          {Object.entries(activeEffects.current).map(([type, expiry]) => (
            (expiry as number) > Date.now() && (
              <motion.div
                key={type}
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                className="flex items-center gap-2 bg-black/40 backdrop-blur-sm border border-white/20 px-2 py-1 rounded text-[10px] font-bold"
              >
                <div className={`w-2 h-2 rounded-full ${type === 'MULTISHOT' ? 'bg-[#ffcc00]' : type === 'SHIELD' ? 'bg-[#33ccff]' : 'bg-[#ff33cc]'}`} />
                <span className="uppercase tracking-widest">{type}</span>
              </motion.div>
            )
          ))}
        </div>

        {debugMode && gameState === 'PLAYING' && (
          <div className="absolute bottom-4 right-4 bg-black/65 border border-white/10 rounded overflow-hidden text-[9px] leading-tight font-mono z-30 select-none">
            {/* Stage jump buttons — mobile only (PC: Alt+1-5, Alt+6) */}
            {isMobile && (
              <div className="px-2 py-1.5 border-b border-yellow-400/20 flex items-center gap-1">
                <span className="text-[7px] text-yellow-400/50 uppercase tracking-widest mr-1">stage</span>
                {([1, 2, 3, 4, 5] as const).map(s => (
                  <button
                    key={s}
                    onPointerDown={e => { e.stopPropagation(); waveRef.current = (s - 1) * 2; startNextWave(); }}
                    className="w-6 h-6 text-[9px] font-black text-yellow-300 bg-yellow-400/20 border border-yellow-400/40 rounded active:scale-90 touch-none"
                  >{s}</button>
                ))}
                <button
                  onPointerDown={e => {
                    e.stopPropagation();
                    audio.stopBGM();
                    victoryPendingRef.current = true;
                    setBossHealth(null);
                    for (const b of bullets.current) b.alive = false;
                    for (const b of enemyBullets.current) b.alive = false;
                    setVictoryStats({
                      survivalMs: Date.now() - gameSessionStartRef.current,
                      shotsFired: shotsFiredRef.current,
                      shotsHit: shotsHitRef.current,
                      hitsTaken: hitsTakenRef.current,
                      maxCombo: maxComboRef.current,
                      grazes: grazeCount.current,
                    });
                    setGameState('VICTORY');
                  }}
                  className="w-6 h-6 text-[9px] font-black text-[#00ffcc] bg-[#00ffcc]/20 border border-[#00ffcc]/40 rounded active:scale-90 touch-none"
                >E</button>
              </div>
            )}
            {/* Input_Debug */}
            <div className="px-2 py-1.5 border-b border-[#ffcc00]/20 text-[#ffe9b3] pointer-events-none">
              <div className="text-[8px] text-[#ffcc00] uppercase tracking-widest mb-1">Input_Debug</div>
              <div>Mouse:{isMouseDown.current ? '1' : '0'} Touch:{isTouching.current ? '1' : '0'} Virtual:{isVirtualDragActive.current ? '1' : '0'}</div>
              <div>Sling:{isSlingshotMode.current ? '1' : '0'} Charged:{isSlingshotCharged.current ? '1' : '0'} Armed:{slingshotArmed.current ? '1' : '0'}</div>
              <div>Idle:{Math.max(0, Date.now() - lastInputActivityAt.current)}ms Anchor:{mouseAnchorPos.current ? '1' : '0'}</div>
            </div>
            {/* Perf_Baseline */}
            <div className="px-2 py-1.5 border-b border-white/5 text-[#bfffee] pointer-events-none">
              <div className="text-[8px] text-[#00ffcc] uppercase tracking-widest mb-1">Perf_Baseline</div>
              <div>FPS p50 {perfStats.fpsP50.toFixed(1)} | p95 {perfStats.fpsP95.toFixed(1)}</div>
              <div>Frame p50 {perfStats.frameMsP50.toFixed(2)}ms | p95 {perfStats.frameMsP95.toFixed(2)}ms</div>
              <div>Obj E:{perfStats.enemies} PB:{perfStats.bullets} EB:{perfStats.enemyBullets} P:{perfStats.particles}</div>
            </div>
            {/* GOD toggle (interactive on mobile, indicator on PC) */}
            {isMobile ? (
              <button
                onPointerDown={e => { e.stopPropagation(); const next = !godModeRef.current; godModeRef.current = next; setGodMode(next); if (next) { integrityRef.current = 100; setIntegrity(100); } }}
                className={`w-full px-2 py-1 text-left text-[8px] font-black uppercase tracking-wider touch-none ${godMode ? 'text-yellow-300 bg-yellow-400/10' : 'text-white/30'}`}
              >GOD {godMode ? 'ON' : 'OFF'}</button>
            ) : (
              <div className="px-2 py-1 flex items-center gap-2 pointer-events-none">
                <span className="text-[7px] text-yellow-400/40 uppercase tracking-widest">GOD</span>
                <span className={`text-[8px] font-black ${godMode ? 'text-yellow-300' : 'text-white/20'}`}>{godMode ? 'ON' : 'OFF'}</span>
              </div>
            )}
          </div>
        )}

        {/* Stage Progress Gauge */}
        <AnimatePresence>
          {gameState === 'PLAYING' && !isWarpingState && (
            <motion.div
              key="stage-progress-overlay"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute top-4 right-4 flex flex-col items-end gap-1"
            >
              <span className="text-[8px] text-[#00ffcc] font-bold uppercase tracking-widest">
                {isSurvivalStage(Math.min(5, Math.ceil(wave / 2))) ? 'Survival_Protocol' : (waveHasBossRef.current ? 'Boss_Progress' : 'Engagement_Progress')}
              </span>
              {isSurvivalStage(Math.min(5, Math.ceil(wave / 2))) ? (
                <div className="text-2xl font-black italic text-white drop-shadow-[0_0_10px_rgba(0,255,204,0.5)]">
                  {survivalTime}s
                </div>
              ) : (
                <div className="text-2xl font-black italic text-white drop-shadow-[0_0_10px_rgba(0,255,204,0.5)]">
                  {Math.round(stageProgress * 100)}%
                </div>
              )}
              <div className="w-24 h-1 bg-white/10 rounded-full overflow-hidden">
                <motion.div
                  animate={{ width: `${Math.max(0, Math.min(100, stageProgress * 100))}%` }}
                  className="h-full bg-[#00ffcc]"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Boss Health Bar */}
        <AnimatePresence>
          {bossHealth && (
            <motion.div
              key="boss-health-overlay"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute top-4 left-1/2 -translate-x-1/2 w-2/3 h-4 bg-black/50 border border-[#ff3366] rounded-full overflow-hidden"
            >
              <motion.div
                initial={{ width: '100%' }}
                animate={{ width: `${(bossHealth.current / bossHealth.max) * 100}%` }}
                className="h-full bg-linear-to-r from-[#ff3366] to-[#ffcc00] shadow-[0_0_10px_#ff3366]"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[8px] font-bold uppercase tracking-widest text-white drop-shadow-md">Boss Integrity</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Overlay Screens */}
        <AnimatePresence>
          {showUpgrade && gameState !== 'VICTORY' && (
            <motion.div
              key="upgrade-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/90 z-60 flex flex-col items-center justify-center p-8 backdrop-blur-md"
            >
              {/* Background Micro-details */}
              <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-transparent via-[#00ffcc]/50 to-transparent" />
              <div className="absolute bottom-0 left-0 w-full h-1 bg-linear-to-r from-transparent via-[#00ffcc]/50 to-transparent" />
              <div className="absolute top-4 left-4 text-[8px] text-[#00ffcc]/30 font-mono">SYSTEM_UPGRADE_PROTOCOL_v2.4</div>
              <div className="absolute bottom-4 right-4 text-[8px] text-[#00ffcc]/30 font-mono">AWAITING_PILOT_INPUT...</div>

              <motion.div
                initial={{ y: 20 }}
                animate={{ y: 0 }}
                className="text-center mb-12"
              >
                <h3 className="text-[#00ffcc] text-xs uppercase tracking-[0.5em] mb-2">
                  {gameState === 'UPGRADE' ? 'Level Up' : 'Relic Found'}
                </h3>
                <h2 className="text-4xl font-black italic tracking-tighter uppercase">
                  {gameState === 'UPGRADE' ? 'CHOOSE ENHANCEMENT' : 'SELECT TECHNOLOGY'}
                </h2>
              </motion.div>

              <div className="grid grid-cols-1 gap-4 w-full max-w-xs">
                {upgradeOptions.map((opt, idx) => (
                  <motion.button
                    key={opt.id}
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: idx * 0.1 }}
                    whileHover={{ scale: 1.05, backgroundColor: 'rgba(0, 255, 204, 0.1)' }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleUpgrade(opt.id)}
                    className="flex flex-col items-start p-4 border border-[#00ffcc]/30 bg-black/50 rounded-lg text-left transition-colors hover:border-[#00ffcc] group"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className="w-3 h-3 text-[#00ffcc] group-hover:animate-pulse" />
                      <span className="text-[#00ffcc] font-bold uppercase tracking-widest text-sm">{opt.label}</span>
                    </div>
                    <span className="text-gray-400 text-[10px] leading-tight ml-5">{opt.desc}</span>
                  </motion.button>
                ))}
              </div>

              <div className="mt-12 text-[8px] text-gray-600 uppercase tracking-[0.3em]">
                {gameState === 'UPGRADE' ? 'Pilot Evolution in Progress' : 'Ancient Technology Recovered'}
              </div>
            </motion.div>
          )}

          {waveTitle && <StageTitleOverlay key={`stage-title-${wave}`} wave={wave} sectorName={sectorName} />}

          {gameState === 'LOADING' && (
            <motion.div
              key="loading-screen"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black flex flex-col items-center justify-center p-8 text-center z-100"
            >
              <Loader2 size={48} className="text-[#00ffcc] animate-spin mb-4" />
              <p className="text-[#00ffcc] uppercase tracking-[0.5em] text-sm animate-pulse">
                Generating Assets...
              </p>
            </motion.div>
          )}

          {gameState === 'START' && (
            <motion.div
              key="start-screen"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-[#020205] flex flex-col items-center justify-center overflow-hidden z-100"
            >
              {/* High-End Background Elements */}
              <div className="absolute inset-0 pointer-events-none">
                {/* Large, very subtle radial gradient */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-200 h-200 bg-gradient-radial from-[#00ffcc]/10 to-transparent opacity-30" />

                {/* Technical Grid Accent */}
                <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#00ffcc 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

                {/* Vertical Rail Text */}
                <div className="absolute left-6 top-1/2 -translate-y-1/2 flex flex-col gap-24 opacity-20">
                  <span className="writing-vertical-rl rotate-180 text-[8px] uppercase tracking-[1em] font-black text-white">System_Active</span>
                  <span className="writing-vertical-rl rotate-180 text-[8px] uppercase tracking-[1em] font-black text-[#00ffcc]">Protocol_Neon</span>
                </div>
              </div>

              <motion.div
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
                className="relative flex flex-col items-center w-full max-w-lg"
              >
                {/* Central Ship Display */}
                <motion.div
                  animate={{
                    y: [0, -15, 0],
                    rotateZ: [-1, 1, -1],
                    filter: [
                      "drop-shadow(0 0 30px rgba(0,255,204,0.2))",
                      "drop-shadow(0 0 60px rgba(0,255,204,0.4))",
                      "drop-shadow(0 0 30px rgba(0,255,204,0.2))"
                    ]
                  }}
                  transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                  className="mb-12"
                >
                  <div className="relative">
                    <div className="absolute inset-0 bg-[#00ffcc]/20 blur-2xl rounded-full scale-150 animate-pulse" />
                    <NeonShip
                      className="w-28 h-28 md:w-32 md:h-32 relative z-10"
                      tension={0.08}
                    />
                  </div>
                </motion.div>

                {/* Editorial Typography Title */}
                <div className="text-center mb-16 relative">
                  <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ delay: 0.5, duration: 0.8 }}
                    className="absolute -top-4 left-1/2 -translate-x-1/2 w-12 h-px bg-[#00ffcc]/40"
                  />

                  <h1 className="flex flex-col items-center leading-none">
                    <span className="text-7xl md:text-8xl font-black italic tracking-tighter text-white/10 absolute -top-8 select-none">
                      DEFENDER
                    </span>
                    <span className="text-5xl md:text-6xl font-black italic tracking-tight text-white relative z-10">
                      NEON <span className="text-[#00ffcc] drop-shadow-[0_0_20px_#00ffcc]">DEFENDER</span>
                    </span>
                  </h1>

                  <div className="flex items-center justify-center gap-4 mt-6">
                    <span className="text-[7px] uppercase tracking-[0.8em] font-black text-gray-500">Combat_Simulation</span>
                    <div className="w-1 h-1 bg-[#00ffcc] rounded-full animate-ping" />
                    <span className="text-[7px] uppercase tracking-[0.8em] font-black text-gray-500">v2.5_Stable</span>
                  </div>
                </div>

                {/* Refined Neon Button */}
                <div className="flex flex-col items-center gap-12 w-full">
                  <button
                    onClick={startGame}
                    className="group relative px-16 py-5 overflow-hidden transition-all duration-500"
                  >
                    {/* Button Background Glow */}
                    <div className="absolute inset-0 bg-[#00ffcc]/0 group-hover:bg-[#00ffcc]/5 transition-colors duration-500" />

                    {/* Neon Frame with Flickering Effect */}
                    <div className="absolute inset-0 border border-[#00ffcc]/30 group-hover:border-[#00ffcc] transition-colors duration-500" />
                    <motion.div
                      animate={{ opacity: [1, 0.8, 1, 0.9, 1] }}
                      transition={{ duration: 0.2, repeat: Infinity, repeatDelay: Math.random() * 5 }}
                      className="absolute inset-0 border-2 border-[#00ffcc] shadow-[0_0_15px_rgba(0,255,204,0.3)] group-hover:shadow-[0_0_30px_rgba(0,255,204,0.6)] transition-shadow duration-500"
                    />

                    {/* Corner Accents */}
                    <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-[#00ffcc]" />
                    <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-[#00ffcc]" />

                    <span className="relative z-10 text-[#00ffcc] font-black uppercase tracking-[0.5em] text-[11px] group-hover:text-white transition-colors duration-300">
                      Engage Mission
                    </span>

                    {/* Internal Scanline Effect */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-10 pointer-events-none bg-[linear-gradient(transparent_50%,rgba(0,255,204,0.5)_50%)] bg-size-[100%_4px]" />
                  </button>
                  <button
                    onClick={() => { localStorage.setItem('neon:tutorial-seen', '1'); setShowTutorial(true); }}
                    className="text-[9px] uppercase tracking-[0.5em] font-black text-gray-600 hover:text-[#00ffcc] transition-colors duration-300"
                  >
                    ? How to Play
                  </button>

                  {/* High-End Stats Display */}
                  <div className="flex items-center justify-center gap-16 w-full max-w-xs border-t border-white/5 pt-8">
                    <div className="flex flex-col items-start gap-1">
                      <span className="text-[7px] uppercase tracking-[0.3em] text-gray-600 font-black">Global_Record</span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl font-mono font-black text-white/90">{highScore.toLocaleString()}</span>
                        <span className="text-[6px] text-gray-700 font-bold">PTS</span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span className="text-[7px] uppercase tracking-[0.3em] text-gray-600 font-black">System_Status</span>
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-[#00ffcc] rounded-full shadow-[0_0_8px_#00ffcc]" />
                        <span className="text-xs font-mono font-black text-[#00ffcc] uppercase tracking-widest">Online</span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Minimal Footer Instructions */}
              <div className="absolute bottom-12 flex flex-col items-center gap-3 opacity-30">
                <div className="flex gap-12 text-[7px] font-black tracking-[0.6em] text-white uppercase">
                  <span>Drag to Tension</span>
                  <div className="w-1 h-1 bg-white rounded-full self-center" />
                  <span>Release to Snap</span>
                </div>
                <div className="w-32 h-px bg-linear-to-r from-transparent via-white/20 to-transparent" />
              </div>
            </motion.div>
          )}

          {gameState === 'VICTORY' && (() => {
            const vRank = getVictoryRank(score);
            const isNewBest = score > 0 && score >= highScore;
            const vs = victoryStats;
            const vAccuracy = vs && vs.shotsFired > 0 ? Math.round((vs.shotsHit / vs.shotsFired) * 100) : null;
            const vCompletionSec = vs ? Math.floor(vs.survivalMs / 1000) : 0;
            const vCompletionStr = vs ? `${Math.floor(vCompletionSec / 60)}:${String(vCompletionSec % 60).padStart(2, '0')}` : '—';
            const vAssess = (): { label: string; detail: string } => {
              if (!vs) return { label: 'VETERAN', detail: 'Mission complete.' };
              const acc = vAccuracy ?? 0;
              if (vs.hitsTaken === 0 && acc >= 70 && vs.maxCombo >= 10) return { label: 'ACE PILOT', detail: 'Zero damage. Sharp aim. A textbook run.' };
              if (vs.hitsTaken === 0 && acc >= 60) return { label: 'PERFECT RUN', detail: 'No damage taken. Clean and decisive.' };
              if (acc >= 70 && vs.maxCombo >= 8) return { label: 'SHARPSHOOTER', detail: 'Outstanding accuracy and combo rhythm.' };
              if (vs.hitsTaken === 0) return { label: 'GHOST', detail: 'Untouchable. The enemy never landed a hit.' };
              if (acc >= 65) return { label: 'MARKSMAN', detail: 'High accuracy throughout the mission.' };
              if (vs.grazes >= 10) return { label: 'EDGE DANCER', detail: 'Lived dangerously. Survived anyway.' };
              if (vs.maxCombo >= 10) return { label: 'COMBO KING', detail: 'Relentless combo chains. Maximum pressure.' };
              return { label: 'VETERAN', detail: 'Mission complete. Experience shows.' };
            };
            const vAssessment = vAssess();
            const VStatBar = ({ value, max, color }: { value: number; max: number; color: string }) => (
              <div className="w-full h-1 rounded-full mt-1" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, Math.round((value / max) * 100))}%` }}
                  transition={{ delay: 2.1, duration: 0.8, ease: 'easeOut' }}
                  className="h-1 rounded-full"
                  style={{ background: color, boxShadow: `0 0 6px ${color}` }}
                />
              </div>
            );
            return (
            <motion.div
              key="victory-screen"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8 }}
              className="absolute inset-0 flex flex-col items-center justify-center z-50 text-center overflow-hidden"
              style={{ background: 'radial-gradient(ellipse at 50% 30%, rgba(0,255,204,0.07) 0%, rgba(0,0,0,0.96) 70%)' }}
            >
              {/* Scanlines overlay */}
              <div
                className="absolute inset-0 pointer-events-none z-0"
                aria-hidden="true"
                style={{
                  background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.18) 3px, rgba(0,0,0,0.18) 4px)',
                }}
              />

              {/* Confetti canvas */}
              <canvas
                ref={confettiCallback}
                className="absolute inset-0 w-full h-full pointer-events-none z-10"
                aria-hidden="true"
              />

              {/* Content — compact single screen */}
              <div className="relative z-20 flex flex-col items-center w-full max-w-sm px-5">

                {/* Game title */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.1, duration: 1 }}
                  className="text-[9px] tracking-[0.5em] text-[#00ffcc]/25 uppercase mb-2 font-bold"
                >
                  NEON DEFENDER
                </motion.div>

                {/* Trophy + Rank — side by side */}
                <div className="flex items-center justify-center gap-6 mb-2">
                  <motion.div
                    initial={{ scale: 0, rotate: -45, opacity: 0 }}
                    animate={{ scale: 1, rotate: 0, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 220, damping: 12, delay: 0.25 }}
                    className="relative flex items-center justify-center shrink-0"
                    style={{ width: '72px', height: '72px' }}
                  >
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                      className="absolute inset-0 pointer-events-none"
                      aria-hidden="true"
                      style={{
                        background: 'conic-gradient(transparent 0deg, rgba(255,204,0,0.22) 20deg, transparent 40deg, transparent 180deg, rgba(255,204,0,0.15) 200deg, transparent 220deg)',
                        borderRadius: '50%',
                      }}
                    />
                    <Trophy size={40} className="relative z-10 drop-shadow-[0_0_24px_rgba(255,204,0,0.9)]" style={{ color: '#ffcc00' }} />
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, scale: 1.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 1.3, duration: 0.55, type: 'spring', stiffness: 260, damping: 16 }}
                    className="flex flex-col items-center"
                  >
                    <div className="text-[9px] tracking-[0.4em] uppercase" style={{ color: vRank.color, opacity: 0.6 }}>RANK</div>
                    <div className="text-6xl font-black leading-none" style={{ color: vRank.color, textShadow: vRank.shadow }}>
                      {vRank.rank}
                    </div>
                    <div className="text-[9px] tracking-[0.3em] uppercase" style={{ color: vRank.color, opacity: 0.5 }}>{vRank.label}</div>
                  </motion.div>
                </div>

                {/* CONGRATULATIONS */}
                <motion.div
                  initial={{ opacity: 0, letterSpacing: '0.05em' }}
                  animate={{ opacity: 1, letterSpacing: '0.25em' }}
                  transition={{ delay: 0.6, duration: 0.7 }}
                  className="text-[11px] font-black text-[#ffcc00] uppercase mb-0.5"
                  style={{ textShadow: '0 0 16px rgba(255,204,0,0.6)' }}
                >
                  ✦ Congratulations ✦
                </motion.div>

                {/* MISSION COMPLETE */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{
                    opacity: 1, y: 0,
                    textShadow: ['0 0 15px #00ffcc', '0 0 50px #00ffcc, 0 0 80px rgba(0,255,204,0.4)', '0 0 15px #00ffcc'],
                  }}
                  transition={{ delay: 0.85, duration: 2.4, repeat: Infinity, y: { duration: 0.4, repeat: 0 } }}
                  className="text-3xl font-black text-[#00ffcc] tracking-[0.15em] mb-0.5 leading-tight"
                >
                  MISSION COMPLETE
                </motion.div>

                {/* Subtitle */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.15, duration: 0.8 }}
                  className="text-[9px] text-white/30 tracking-[0.15em] uppercase mb-3"
                >
                  The Core has been neutralized. The galaxy is safe.
                </motion.div>

                {/* Stats panel */}
                <motion.div
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.6, duration: 0.5 }}
                  className="w-full mb-3 rounded-xl overflow-hidden"
                  style={{ border: '1px solid rgba(0,255,204,0.2)', background: 'rgba(0,255,204,0.04)' }}
                >
                  {/* Score + Sectors row */}
                  <div className="flex justify-between items-end px-4 pt-3 pb-2">
                    <div className="text-left">
                      <div className="text-[8px] tracking-[0.3em] uppercase text-[#00ffcc]/40">Final Score</div>
                      <div className="text-xl font-black font-mono text-white" style={{ textShadow: '0 0 10px rgba(255,255,255,0.3)' }}>
                        {victoryDisplayScore.toLocaleString()}
                      </div>
                      {isNewBest && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: [1, 0.5, 1] }}
                          transition={{ delay: 1.8, duration: 1.2, repeat: Infinity }}
                          className="text-[9px] font-black tracking-[0.2em] text-[#ffcc00]"
                        >
                          ★ NEW BEST
                        </motion.div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-[8px] tracking-[0.3em] uppercase text-[#00ffcc]/30">Sectors</div>
                      <div className="text-xl font-black text-white">{waveRef.current} / 10</div>
                    </div>
                  </div>

                  {/* Pilot assessment */}
                  <div className="mx-4 border-t border-[#00ffcc]/10 mb-2" />
                  <div className="px-4 pb-2 flex items-start justify-between gap-2">
                    <div className="text-left">
                      <div className="text-[8px] tracking-[0.3em] uppercase text-[#00ffcc]/30 mb-0.5">Pilot Assessment</div>
                      <div className="text-sm font-black tracking-wider text-[#00ffcc]" style={{ textShadow: '0 0 12px rgba(0,255,204,0.5)' }}>
                        {vAssessment.label}
                      </div>
                    </div>
                    <div className="text-[9px] text-white/25 max-w-32 text-right leading-relaxed mt-3">{vAssessment.detail}</div>
                  </div>

                  {/* 2-column stat grid */}
                  <div className="mx-4 border-t border-[#00ffcc]/10 mb-1" />
                  <div className="grid grid-cols-2 gap-x-4 px-4 pb-3">
                    {[
                      {
                        label: 'Accuracy',
                        value: vAccuracy !== null ? `${vAccuracy}%` : '—',
                        bar: vAccuracy !== null ? <VStatBar value={vAccuracy} max={100} color={vAccuracy >= 70 ? '#00ffcc' : vAccuracy >= 45 ? '#ff8800' : '#ff3366'} /> : null,
                      },
                      {
                        label: 'Hull',
                        value: vs ? `${5 - vs.hitsTaken} / 5` : '—',
                        bar: vs ? <VStatBar value={5 - vs.hitsTaken} max={5} color={vs.hitsTaken === 0 ? '#00ffcc' : vs.hitsTaken <= 2 ? '#ff8800' : '#ff3366'} /> : null,
                      },
                      {
                        label: 'Clear Time',
                        value: vCompletionStr,
                        bar: null,
                      },
                      {
                        label: 'Peak Combo',
                        value: vs ? `×${vs.maxCombo}` : '—',
                        bar: vs ? <VStatBar value={vs.maxCombo} max={15} color='#ffcc00' /> : null,
                      },
                      {
                        label: 'Grazes',
                        value: vs ? String(vs.grazes) : '—',
                        bar: vs ? <VStatBar value={vs.grazes} max={20} color='#66aaff' /> : null,
                      },
                    ].map(({ label, value, bar }) => (
                      <div key={label} className="pt-2">
                        <div className="flex justify-between items-baseline">
                          <span className="text-[8px] tracking-[0.2em] uppercase text-white/25">{label}</span>
                          <span className="text-xs font-black font-mono text-white/55">{value}</span>
                        </div>
                        {bar ?? <div className="w-full h-1 rounded-full mt-1" style={{ background: 'rgba(255,255,255,0.04)' }} />}
                      </div>
                    ))}
                  </div>
                </motion.div>

                {/* CTA button */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 2.1, duration: 0.5 }}
                >
                  <button
                    onClick={startGame}
                    className="px-10 py-2.5 font-black text-sm tracking-[0.25em] uppercase transition-all duration-300"
                    style={{
                      border: '2px solid #00ffcc',
                      color: '#00ffcc',
                      borderRadius: '2px',
                      background: 'transparent',
                      boxShadow: '0 0 20px rgba(0,255,204,0.2)',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLButtonElement).style.background = '#00ffcc';
                      (e.currentTarget as HTMLButtonElement).style.color = '#000';
                      (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 40px rgba(0,255,204,0.6)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                      (e.currentTarget as HTMLButtonElement).style.color = '#00ffcc';
                      (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 20px rgba(0,255,204,0.2)';
                    }}
                  >
                    NEW MISSION
                  </button>
                </motion.div>

              </div>
            </motion.div>
            );
          })()}

          {gameState === 'GAME_OVER' && (() => {
            const s = gameOverStatsRef.current;
            const accuracy = s && s.shotsFired > 0 ? Math.round((s.shotsHit / s.shotsFired) * 100) : null;
            const survivalSec = s ? Math.floor(s.survivalMs / 1000) : 0;
            const survivalStr = s ? `${Math.floor(survivalSec / 60)}:${String(survivalSec % 60).padStart(2, '0')}` : '—';

            // Condition diagnosis — hitsTaken is always 5 on GAME_OVER (100HP / 20dmg),
            // so base diagnosis on accuracy, combo, grazes, sectors, and survival time.
            const diagnose = (): { label: string; color: string; detail: string } => {
              if (!s) return { label: 'UNKNOWN', color: '#888', detail: '' };
              const acc = accuracy ?? 0;
              const sharpEye = acc >= 68;
              const hotStreak = s.maxCombo >= 8;
              const reflexes = s.grazes >= 5;
              const deep = s.sectorsReached >= 6;

              if (sharpEye && hotStreak && reflexes) return { label: 'PEAK STATE',   color: '#00ffcc', detail: 'Aim sharp. Combo locked. Reflexes alive. Pushed hard today.' };
              if (sharpEye && hotStreak)             return { label: 'FOCUSED',       color: '#00ff85', detail: 'High accuracy and strong combo rhythm. Concentration is on.' };
              if (hotStreak && deep)                 return { label: 'IN THE ZONE',   color: '#66ffaa', detail: 'Kept the chain alive deep into the run. Good mental stamina.' };
              if (sharpEye && deep)                  return { label: 'MARKSMAN',      color: '#00ccff', detail: 'Accurate shooting held up far into the mission.' };
              if (reflexes && deep)                  return { label: 'EDGE DANCER',   color: '#66aaff', detail: 'Living on the edge and surviving. Instincts are sharp.' };
              if (sharpEye)                          return { label: 'SHARP EYES',    color: '#88ddff', detail: 'Good accuracy today. Work on sustaining combo chains.' };
              if (hotStreak)                         return { label: 'COMBO HUNTER',  color: '#ffcc00', detail: 'Great combo instinct. Tighten up your aim to push further.' };
              if (reflexes)                          return { label: 'EVASIVE',        color: '#9977ff', detail: 'Grazed danger often. Solid reflexes, inconsistent aim.' };
              if (acc < 30 && s.maxCombo <= 2)       return { label: 'FATIGUED',      color: '#ff3366', detail: 'Low accuracy and no combo flow. Off day — take a break?' };
              if (survivalSec < 30)                  return { label: 'WARMING UP',    color: '#888888', detail: 'Too short to read. Shake the rust off and go again.' };
              if (s.sectorsReached >= 4)             return { label: 'GRINDING',      color: '#ccaa44', detail: 'Making it through. Keep building consistency.' };
              return                                        { label: 'AVERAGE',        color: '#cccccc', detail: 'Steady play. Find one thing to sharpen each run.' };
            };
            const condition = diagnose();

            // Stat bar helper
            const StatBar = ({ value, max, color }: { value: number; max: number; color: string }) => (
              <div className="w-full h-1 rounded-full mt-1" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, Math.round((value / max) * 100))}%` }}
                  transition={{ delay: 1.2, duration: 0.8, ease: 'easeOut' }}
                  className="h-1 rounded-full"
                  style={{ background: color, boxShadow: `0 0 6px ${color}` }}
                />
              </div>
            );

            return (
            <motion.div
              key="game-over-screen"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7 }}
              className="absolute inset-0 flex flex-col items-center justify-center z-50 overflow-hidden"
              style={{ background: 'radial-gradient(ellipse at 50% 20%, rgba(255,51,102,0.08) 0%, rgba(0,0,0,0.97) 65%)' }}
            >
              {/* Scanlines */}
              <div className="absolute inset-0 pointer-events-none" aria-hidden style={{
                background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.15) 3px, rgba(0,0,0,0.15) 4px)'
              }} />

              <div className="relative z-10 flex flex-col items-center w-full max-w-sm px-5 text-center">

                {/* Header */}
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                  className="text-[9px] tracking-[0.5em] text-[#ff3366]/35 uppercase mb-2 font-bold">
                  NEON DEFENDER
                </motion.div>

                {/* MISSION FAILED */}
                <motion.div
                  initial={{ opacity: 0, scale: 1.3 }}
                  animate={{ opacity: 1, scale: 1, textShadow: ['0 0 20px #ff3366', '0 0 50px #ff3366', '0 0 20px #ff3366'] }}
                  transition={{ delay: 0.2, duration: 2.5, repeat: Infinity, scale: { duration: 0.4 } }}
                  className="text-3xl font-black text-[#ff3366] tracking-[0.15em] mb-0.5"
                >
                  MISSION FAILED
                </motion.div>

                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
                  className="text-[9px] text-white/25 tracking-[0.15em] uppercase mb-3">
                  Hull integrity lost — sector abandoned
                </motion.div>

                {/* Condition panel */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
                  className="w-full rounded-xl px-4 py-3 mb-3 text-left"
                  style={{ border: `1px solid ${condition.color}44`, background: `${condition.color}0d` }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[8px] tracking-[0.4em] uppercase mb-0.5" style={{ color: condition.color, opacity: 0.6 }}>
                        TODAY'S CONDITION
                      </div>
                      <div className="text-lg font-black tracking-wider" style={{ color: condition.color, textShadow: `0 0 16px ${condition.color}88` }}>
                        {condition.label}
                      </div>
                    </div>
                    <div className="text-[9px] text-white/30 leading-relaxed text-right max-w-32.5 mt-1">
                      {condition.detail}
                    </div>
                  </div>
                </motion.div>

                {/* Stats panel */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}
                  className="w-full rounded-xl overflow-hidden mb-3"
                  style={{ border: '1px solid rgba(255,51,102,0.15)', background: 'rgba(255,255,255,0.03)' }}
                >
                  {/* Score row */}
                  <div className="flex justify-between items-end px-4 pt-3 pb-2">
                    <div className="text-left">
                      <div className="text-[8px] tracking-[0.3em] uppercase text-white/30">Score</div>
                      <div className="text-xl font-black font-mono text-white">{score.toLocaleString()}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[8px] tracking-[0.3em] uppercase text-white/20">Sectors</div>
                      <div className="text-xl font-black text-white">{s ? `${s.sectorsReached} / 10` : '—'}</div>
                    </div>
                  </div>
                  <div className="mx-4 border-t border-white/5 mb-1" />

                  {/* 2-col stat grid */}
                  <div className="grid grid-cols-2 gap-x-3 px-4 pb-3">
                    {[
                      {
                        label: 'Survival Time',
                        value: survivalStr,
                        color: '#9977ff',
                        bar: null,
                      },
                      {
                        label: 'Accuracy',
                        value: accuracy !== null ? `${accuracy}%` : '—',
                        color: accuracy !== null && accuracy >= 68 ? '#00ffcc' : accuracy !== null && accuracy >= 45 ? '#ff8800' : '#ff3366',
                        bar: accuracy !== null ? <StatBar value={accuracy} max={100} color={accuracy >= 68 ? '#00ffcc' : accuracy >= 45 ? '#ff8800' : '#ff3366'} /> : null,
                      },
                      {
                        label: 'Shots Fired',
                        value: s ? String(s.shotsFired) : '—',
                        color: '#88aaff',
                        bar: s ? <StatBar value={Math.min(s.shotsFired, 300)} max={300} color='#88aaff' /> : null,
                      },
                      {
                        label: 'Peak Combo',
                        value: s ? `×${s.maxCombo}` : '—',
                        color: '#ffcc00',
                        bar: s ? <StatBar value={s.maxCombo} max={15} color='#ffcc00' /> : null,
                      },
                      {
                        label: 'Grazes',
                        value: s ? String(s.grazes) : '—',
                        color: '#66aaff',
                        bar: s ? <StatBar value={s.grazes} max={20} color='#66aaff' /> : null,
                      },
                    ].map(({ label, value, color, bar }) => (
                      <div key={label} className="pt-2">
                        <div className="flex justify-between items-baseline">
                          <span className="text-[8px] tracking-[0.2em] uppercase text-white/25">{label}</span>
                          <span className="text-xs font-black font-mono" style={{ color }}>{value}</span>
                        </div>
                        {bar ?? <div className="w-full h-1 rounded-full mt-1" style={{ background: 'rgba(255,255,255,0.05)' }} />}
                      </div>
                    ))}
                  </div>
                </motion.div>

                {/* Re-engage button */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.3 }}>
                  <button
                    onClick={startGame}
                    className="flex items-center gap-3 px-10 py-2.5 font-black text-sm tracking-[0.25em] uppercase transition-all duration-300"
                    style={{ border: '2px solid #00ffcc', color: '#00ffcc', background: 'transparent', boxShadow: '0 0 20px rgba(0,255,204,0.15)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#00ffcc'; (e.currentTarget as HTMLButtonElement).style.color = '#000'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#00ffcc'; }}
                  >
                    <RotateCcw size={16} /> Re-Engage
                  </button>
                </motion.div>

              </div>
            </motion.div>
            );
          })()}
        </AnimatePresence>

        <AnimatePresence>
          {showTutorial && (
            <TutorialOverlay
              isTouchDevice={isTouchDevice}
              onClose={() => setShowTutorial(false)}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Footer & Fullscreen */}
      <div className="mt-2 md:mt-8 text-[9px] text-gray-700 uppercase tracking-[0.5em] flex flex-col items-center gap-1">
        <div className="flex items-center gap-4">
          <span>Arcade Revision 2.6</span>
          <span className="w-1 h-1 bg-gray-800 rounded-full" />
          {!isIOSStandalone && (
            <button
              onClick={toggleFullscreen}
              className="hover:text-white transition-colors flex items-center gap-1"
            >
              <Maximize2 size={10} />
              <span>{isIOS ? 'Fullscreen' : (isFullscreen ? 'Exit Full' : 'Fullscreen')}</span>
            </button>
          )}
        </div>
        {showIosHint && (
          <span className="text-[8px] text-gray-600 tracking-normal normal-case text-center">
            Tap Safari's Share ↑ → "Add to Home Screen" for fullscreen
          </span>
        )}
      </div>
    </div>
  );
}
