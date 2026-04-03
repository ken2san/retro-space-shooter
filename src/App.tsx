/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Rocket, Trophy, Play, RotateCcw, Loader2, Zap, Maximize2, Shield, Cpu, Heart, Users, Activity, MousePointer2 } from 'lucide-react';
import { generateGameAssets } from './services/assetGenerator';
import { audio } from './services/audio';
import {
  CANVAS_WIDTH, CANVAS_HEIGHT, PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_SPEED,
  SLINGSHOT_THRESHOLD, GRAZE_DISTANCE, MAX_OVERDRIVE, BULLET_SPEED,
  ENEMY_DIVE_SPEED, ENEMY_BULLET_SPEED, ENEMY_ROWS, ENEMY_COLS, ENEMY_SPACING,
  isMobile, MAX_PARTICLES, MAX_TRAILS, MAX_BULLETS, MAX_ENEMY_BULLETS, ENABLE_SHADOWS,
} from './constants';
import {
  GameState, Bullet, Enemy, Particle, Trail, PowerUp, Scrap, Asteroid,
  BossType, Obstacle, DamageNumber, TailSegment, Drone,
} from './types';
import NeonShip from './components/NeonShip';
import GameHud from './components/GameHud';
import StageTitleOverlay from './components/StageTitleOverlay';
import { buildWaveEnemies, createEnemy } from './game/enemies';
import { bindInputListeners } from './hooks/useInput';
import { LEVEL_UP_OPTIONS, RELIC_LABELS, RELIC_OPTIONS, UpgradeOption, pickRandomOptions } from './game/upgrades';
import { getStageFromWave, getStageLabelFromWave, getSurvivalDurationFromStage } from './game/stage';
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

const VFX_PARTICLE_DESKTOP_MULTIPLIER = 0.75;
const VFX_PARTICLE_MOBILE_MULTIPLIER = 0.18;
const VFX_TRAIL_SPAWN_INTERVAL_MS = 20;
const VFX_TRAIL_ALPHA = 0.32;
const VFX_SLINGSHOT_TRAIL_ALPHA = 0.42;
const SLINGSHOT_GUARD_COOLDOWN_MS = 1200;
const SLINGSHOT_GUARD_SMALL_MS = 280;
const SLINGSHOT_GUARD_LARGE_MS = 450;
const SLINGSHOT_COMBO_WINDOW_MS = 1200;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('LOADING');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [wave, setWave] = useState(1);
  const [sectorName, setSectorName] = useState('Outer Rim');
  const [scrapCount, setScrapCount] = useState(0);
  const [integrity, setIntegrity] = useState(100);
  const lastContinuousSpawnTime = useRef(0);
  const integrityRef = useRef(100);
  const [level, setLevel] = useState(1);
  const [xp, setXp] = useState(0);
  const [xpToNextLevel, setXpToNextLevel] = useState(200);
  const levelRef = useRef(1);
  const xpRef = useRef(0);
  const xpToNextLevelRef = useRef(200);

  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeOptions, setUpgradeOptions] = useState<UpgradeOption[]>([]);
  const [assets, setAssets] = useState<Record<string, HTMLImageElement>>({});
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [hasWingman, setHasWingman] = useState(false);
  const wingmanRef = useRef(false);
  const wingmanPos = useRef({ x: 0, y: 0 });

  // Dev-only god mode
  const godModeRef = useRef(false);
  const [godMode, setGodMode] = useState(false);

  // Game state refs for the loop
  const waveRef = useRef(1);
  const invulnerableUntil = useRef(0);
  const playerPos = useRef({ x: CANVAS_WIDTH / 2 - PLAYER_WIDTH / 2, y: CANVAS_HEIGHT - 80 });
  const targetPos = useRef({ x: CANVAS_WIDTH / 2 - PLAYER_WIDTH / 2, y: CANVAS_HEIGHT - 80 });
  const playerVel = useRef({ x: 0, y: 0 }); // Added velocity for inertia
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
  const bullets = useRef<Bullet[]>([]);
  const enemyBullets = useRef<Bullet[]>([]);
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
  const playerStartPos = useRef({ x: 0, y: 0 });
  const isSlingshotCharged = useRef(false);
  const isSlingshotMode = useRef(false);
  const isTouching = useRef(false);
  const isMouseDown = useRef(false);
  const touchPoints = useRef<Record<number, { x: number, y: number }>>({});
  const lastTapTime = useRef(0);
  const lastMouseTapTime = useRef(0);
  const lastPointerTapTime = useRef(0); // records pointerdowns that were NOT followed by mousedown (macOS ate them)
  const pointerTapTimer = useRef<number | null>(null); // timer to detect orphaned pointerdowns
  // Armed state: double-tap detected but released before dragging (trackpad support)
  const slingshotArmed = useRef(false);
  const slingshotArmedExpiry = useRef(0);
  const slingshotArmedPos = useRef<{ x: number, y: number } | null>(null);
  const isVirtualDragActive = useRef(false);
  const virtualDragReleaseTimer = useRef<number | null>(null);
  // Idle-fire: fire slingshot when mousemove stops (finger lifted on trackpad before OS sends mouseup)
  const idleFireTimer = useRef<number | null>(null);
  const slingshotAttackUntil = useRef(0);
  const slingshotGuardUntil = useRef(0);
  const slingshotGuardCooldownUntil = useRef(0);

  // Power-up & Overdrive State
  const powerUps = useRef<PowerUp[]>([]);
  const activeEffects = useRef<Record<string, number>>({});
  const overdriveGauge = useRef(0);
  const [overdrive, setOverdrive] = useState(0);
  const [isOverdriveActive, setIsOverdriveActive] = useState(false);
  const isOverdriveActiveRef = useRef(false);
  const overdriveEndTime = useRef(0);
  const pauseStartTime = useRef(0);
  const hasFollowerRef = useRef(false);
  const ambushSide = useRef<'left' | 'right'>(Math.random() > 0.5 ? 'left' : 'right');

  // Warp Transition State
  const isWarping = useRef(false);
  const scraps = useRef<Scrap[]>([]);
  const asteroids = useRef<Asteroid[]>([]);
  const obstacles = useRef<Obstacle[]>([]);
  const lastObstacleTime = useRef(0);
  const obstaclePattern = useRef(0);
  const warpFactor = useRef(0);
  const warpStartTime = useRef(0);
  const slingshotTrails = useRef<{x: number, y: number, alpha: number}[]>([]);
  const slingshotTrajectory = useRef<{x1: number, y1: number, x2: number, y2: number, alpha: number} | null>(null);
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
  const [survivalTime, setSurvivalTime] = useState(30);
  const survivalTimerRef = useRef(30);
  const blocks = useRef<Obstacle[]>([]);
  const lastBlockRowY = useRef(0);

  // Initialize stars and offscreen canvas
  useEffect(() => {
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    stars.current = Array.from({ length: 100 }, () => ({
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
    setWave(saveData.wave);
    waveRef.current = saveData.wave;
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
    initEnemies(saveData.wave);
    audio.init();
    const stage = Math.min(5, Math.ceil(saveData.wave / 2));
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

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

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
      } catch (error) {
        console.error('Failed to generate assets:', error);
        // Fallback to start if generation fails (though it shouldn't)
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

    // Give Overdrive fuel on scrap collection
    if (!isOverdriveActiveRef.current) {
      overdriveGauge.current = Math.min(100, overdriveGauge.current + 2);
      setOverdrive(overdriveGauge.current);
    }

    if (progress.didLevelUp) {
      triggerLevelUp();
    }

    audio.playScrap();
    createExplosion(s.x, s.y, '#00ffcc', 5);
  };

  const triggerLevelUp = () => {
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

    mouseAnchorPos.current = null;
    slingshotArmed.current = false;
    slingshotArmedExpiry.current = 0;
    slingshotArmedPos.current = null;
    touchPoints.current = {};

    lastTapTime.current = 0;
    lastMouseTapTime.current = 0;
    lastPointerTapTime.current = 0;
    inputVel.current = { x: 0, y: 0 };
    inputHistory.current = [];
    slingshotGuardUntil.current = 0;
    slingshotGuardCooldownUntil.current = 0;
  };

  const startNextWave = () => {
    resetInputGestureState();
    if (isOverdriveActiveRef.current && pauseStartTime.current > 0) {
      overdriveEndTime.current += (Date.now() - pauseStartTime.current);
    }
    pauseStartTime.current = 0;

    setGameState('PLAYING');
    waveRef.current += 1;
    setWave(waveRef.current);

    const stage = getStageFromWave(waveRef.current);
    setSectorName(getStageLabelFromWave(waveRef.current));

    initEnemies(waveRef.current);

    stageStartTime.current = 0;
    survivalTimerRef.current = 30;
    setSurvivalTime(getSurvivalDurationFromStage(stage));
    blocks.current = [];

    setWaveTitle(true);
    audio.playStageStart();
    audio.playBGM(stage);
    setTimeout(() => setWaveTitle(false), 2000);

    setTimeout(() => {
      isWarping.current = false;
      warpFactor.current = 0;
    }, 1000);
  };

  const triggerRelicSelection = () => {
    // Pick 4 random (increased choice since it's rarer)
    setUpgradeOptions(pickRandomOptions(RELIC_OPTIONS, 4));
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
        hasFollowerRef.current = true;
        // Pre-fill history to avoid jump
        const startX = wingmanRef.current ? wingmanPos.current.x + PLAYER_WIDTH / 2 : playerPos.current.x + PLAYER_WIDTH / 2;
        const startY = wingmanRef.current ? wingmanPos.current.y + PLAYER_HEIGHT / 2 : playerPos.current.y + PLAYER_HEIGHT / 2;
        followerHistory.current = Array(200).fill({ x: startX, y: startY });
        break;
      case 'WINGMAN':
        setHasWingman(true);
        wingmanRef.current = true;
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
    // Introduce maze blocks earlier (Stage 2) but keep it sparse initially
    if (currentStage < 2) return;

    const rowY = -100;
    const blockWidth = CANVAS_WIDTH / 10;
    const blockHeight = 100;

    // Density increases with stage and wave
    let wallDensity = 0.02;
    let destructibleDensity = 0.05;
    let tentacleChance = 0.01;

    if (currentStage === 3) {
      wallDensity = 0.04;
      destructibleDensity = 0.08;
      tentacleChance = 0.03;
    } else if (currentStage >= 4) {
      wallDensity = 0.06 + (waveRef.current - 7) * 0.02;
      destructibleDensity = 0.12 + (waveRef.current - 7) * 0.03;
      tentacleChance = 0.05;
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
    setHasWingman(false);
    wingmanRef.current = false;
    isHackedRef.current = false;
    hasFollowerRef.current = false;
    tailSegments.current = [];
    followerHistory.current = [];
    invulnerableUntil.current = 0;
    slingshotGuardUntil.current = 0;
    slingshotGuardCooldownUntil.current = 0;
    playerPos.current = { x: CANVAS_WIDTH / 2 - PLAYER_WIDTH / 2, y: CANVAS_HEIGHT - 80 };
    targetPos.current = { x: CANVAS_WIDTH / 2 - PLAYER_WIDTH / 2, y: CANVAS_HEIGHT - 80 };
    bullets.current = [];
    enemyBullets.current = [];
    particles.current = [];
    trails.current = [];
    scraps.current = [];
    asteroids.current = [];
    blocks.current = [];
    obstacles.current = [];
    lastObstacleTime.current = 0;
    survivalTimerRef.current = 30;
    setSurvivalTime(30);
    shake.current = 0;
    flash.current = 0;
    initEnemies(1);
    audio.playStageStart();
    setGameState('PLAYING');
  };

  // Input handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyS', 'KeyA', 'KeyD'].includes(e.code)) {
        e.preventDefault();
      }
      keysPressed.current[e.code] = true;

      // Dev-only god mode toggle
      if (import.meta.env.DEV && !e.repeat && e.code === 'KeyG') {
        const next = !godModeRef.current;
        godModeRef.current = next;
        setGodMode(next);
        if (next) {
          integrityRef.current = 100;
          setIntegrity(100);
        }
      }

      // Allow Ctrl to trigger Slingshot Mode during an active drag
      if (!e.repeat && (e.code === 'ControlLeft' || e.code === 'ControlRight') && isMouseDown.current && !isSlingshotMode.current) {
        isSlingshotMode.current = true;
        // Ctrl-based anchor: treat as a real drag (not virtual) so mouseup fires instantly
        isVirtualDragActive.current = false;
        clearVirtualDragReleaseTimer();
        mouseAnchorPos.current = { x: currentMousePos.current.x, y: currentMousePos.current.y };
        playerStartPos.current = { x: playerPos.current.x, y: playerPos.current.y };
        audio.playSlingshot?.();
        shake.current = Math.max(shake.current, 5);
        createExplosion(currentMousePos.current.x, currentMousePos.current.y, '#00ffcc', 20);

        // Brief time slow/freeze for tactile feedback
        timeScale.current = 0.2;
        setTimeout(() => { if (!isOverdriveActiveRef.current) timeScale.current = 1.0; }, 100);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyS', 'KeyA', 'KeyD'].includes(e.code)) {
        e.preventDefault();
      }
      keysPressed.current[e.code] = false;
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (gameState !== 'PLAYING' || showUpgrade) return;
      e.preventDefault();

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
        if (!isVirtualDragActive.current || !isSlingshotMode.current) return;
        if (!isSlingshotCharged.current) {
          armSlingshotAtCurrentPos();
        } else {
          handleSlingshot();
          slingshotArmed.current = false;
          slingshotArmedPos.current = null;
        }
        isVirtualDragActive.current = false;
        isMouseDown.current = false;
        mouseAnchorPos.current = null;
      }, 40);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isTouching.current || showUpgrade) return;
      e.preventDefault();

      const touch = e.touches[0];
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const x = ((touch.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
        const y = ((touch.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;

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

        if (isSlingshotMode.current && mouseAnchorPos.current) {
          // SLINGSHOT MODE: Rubber band logic
          const rawDx = (x - mouseAnchorPos.current.x);
          const rawDy = (y - mouseAnchorPos.current.y);
          const dist = Math.sqrt(rawDx * rawDx + rawDy * rawDy);

          if (dist > TOUCH_SLINGSHOT_CHARGE_DEADZONE) {
            isSlingshotCharged.current = true;
          }

          // Apply resistance
          const resistance = TOUCH_SLINGSHOT_RESISTANCE;
          const finalDx = rawDx * resistance;
          const finalDy = rawDy * resistance;

          targetPos.current.x = Math.max(0, Math.min(CANVAS_WIDTH - PLAYER_WIDTH, playerStartPos.current.x + finalDx));
          targetPos.current.y = Math.max(0, Math.min(CANVAS_HEIGHT - PLAYER_HEIGHT, playerStartPos.current.y + finalDy));
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
        isSlingshotCharged.current = false;
        isSlingshotMode.current = false;
        return;
      }

      const dist = Math.max(physicalDist, inputDist);
      const mag = Math.sqrt(inputDx * inputDx + inputDy * inputDy) || 1;
      const dirX = inputDx / mag;
      const dirY = inputDy / mag;

      // If not charged or not in slingshot mode, just settle
      if (!isSlingshotCharged.current || !isSlingshotMode.current) {
        isSnapping.current = 0;
        isSlingshotCharged.current = false;
        isSlingshotMode.current = false;
        return;
      }

      // Deterministic landing: snap destination is fixed on the threshold ring.
      // This makes the stop point predictable while dragging.
      const landingCenterX = homeX + dirX * SLINGSHOT_THRESHOLD;
      const landingCenterY = homeY + dirY * SLINGSHOT_THRESHOLD;
      targetPos.current = {
        x: Math.max(0, Math.min(CANVAS_WIDTH - PLAYER_WIDTH, landingCenterX - PLAYER_WIDTH / 2)),
        y: Math.max(CANVAS_HEIGHT * 0.1, Math.min(CANVAS_HEIGHT - PLAYER_HEIGHT, landingCenterY - PLAYER_HEIGHT / 2))
      };

      // Flick Detection
      const inputSpeed = Math.sqrt(inputVel.current.x ** 2 + inputVel.current.y ** 2);
      const isFlick = inputSpeed > 400;
      const tryActivateSlingshotGuard = (durationMs: number) => {
        const now = Date.now();
        if (now < slingshotGuardCooldownUntil.current) return;
        slingshotGuardUntil.current = Math.max(slingshotGuardUntil.current, now + durationMs);
        slingshotGuardCooldownUntil.current = now + SLINGSHOT_GUARD_COOLDOWN_MS;
      };

      // 1. DEADZONE / ADJUSTMENT MODE (Small pull)
      if (dist < SLINGSHOT_THRESHOLD + 30) {
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
      else if (dist >= SLINGSHOT_THRESHOLD + 30) {
        const attackDist = dist - (SLINGSHOT_THRESHOLD + 30);
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

        const attackDuration = 500 + (totalPower * 700);
        slingshotAttackUntil.current = Date.now() + attackDuration;
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
          const bdx = b.x - centerX;
          const bdy = b.y - centerY;
          if (Math.sqrt(bdx*bdx + bdy*bdy) < shockwaveRadius) {
            b.y = -100;
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
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (gameState !== 'PLAYING' || showUpgrade) return;
      isVirtualDragActive.current = false;
      clearVirtualDragReleaseTimer();

      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const now = Date.now();
        const isRightClick = e.button === 2 || (e.button === 0 && e.ctrlKey);

        // If already dragging and right-click/ctrl-click, force slingshot mode
        if (isMouseDown.current && isRightClick) {
          isSlingshotMode.current = true;
          const x = ((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
          const y = ((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;
          mouseAnchorPos.current = { x, y };
          audio.playSlingshot?.();
          shake.current = Math.max(shake.current, 5);
          createExplosion(x, y, '#00ffcc', 20);
          timeScale.current = 0.2;
          setTimeout(() => { if (!isOverdriveActiveRef.current) timeScale.current = 1.0; }, 100);
          return;
        }

        isMouseDown.current = true;
        const x = ((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
        const y = ((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;

        currentMousePos.current = { x, y };
        playerStartPos.current = { x: playerPos.current.x, y: playerPos.current.y };
        inputHistory.current = [{ x, y, t: now }];

        // Armed state: double-tap on trackpad sets armed, next mousedown triggers slingshot
        const isArmed = slingshotArmed.current && now < slingshotArmedExpiry.current;
        if (isArmed) {
          slingshotArmed.current = false;
          slingshotArmedPos.current = null;
          isSlingshotMode.current = true;
          mouseAnchorPos.current = { x, y };
          audio.playSlingshot?.();
          shake.current = Math.max(shake.current, 5);
          createExplosion(x, y, '#00ffcc', 20);
          timeScale.current = 0.2;
          setTimeout(() => { if (!isOverdriveActiveRef.current) timeScale.current = 1.0; }, 100);
        } else if (isRightClick) {
          isSlingshotMode.current = true;
          mouseAnchorPos.current = { x, y };
          audio.playSlingshot?.();
          shake.current = Math.max(shake.current, 5);
          createExplosion(x, y, '#00ffcc', 20);

          // Brief time slow/freeze for tactile feedback
          timeScale.current = 0.2;
          setTimeout(() => { if (!isOverdriveActiveRef.current) timeScale.current = 1.0; }, 100);
        } else {
          isSlingshotMode.current = false;
          mouseAnchorPos.current = { x, y }; // Still need anchor for relative movement
        }
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (gameState !== 'PLAYING' || showUpgrade) return;

      // Web/trackpad safety: if mouseup was swallowed by gesture handling,
      // force-release stale drag state when no button is currently pressed.
      if (isMouseDown.current && e.buttons === 0 && !isTouching.current) {
        handleMouseUp();
      }

      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const x = ((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
        const y = ((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;

        currentMousePos.current = { x, y };

        // Track velocity for flick detection (same as touch)
        const now = Date.now();
        inputHistory.current.push({ x, y, t: now });
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

        // Trackpad fallback: when double-tap armed but no mousedown is generated,
        // promote movement into a virtual drag so slingshot can still charge/fire.
        if (!isMouseDown.current && !isTouching.current && slingshotArmed.current && now < slingshotArmedExpiry.current && slingshotArmedPos.current) {
          const armedDx = x - slingshotArmedPos.current.x;
          const armedDy = y - slingshotArmedPos.current.y;
          const armedDist = Math.sqrt(armedDx * armedDx + armedDy * armedDy);
          if (armedDist > 4) {
            isMouseDown.current = true;
            isVirtualDragActive.current = true;
            isSlingshotMode.current = true;
            mouseAnchorPos.current = { x: slingshotArmedPos.current.x, y: slingshotArmedPos.current.y };
            playerStartPos.current = { x: playerPos.current.x, y: playerPos.current.y };
            inputHistory.current = [
              { x: slingshotArmedPos.current.x, y: slingshotArmedPos.current.y, t: now },
              { x, y, t: now }
            ];
            slingshotArmed.current = false;
            slingshotArmedPos.current = null;
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
            }
            idleFireTimer.current = null;
          }, 80);
        }

        if (isMouseDown.current && mouseAnchorPos.current) {
          if (isSlingshotMode.current) {
            const rawDx = (x - mouseAnchorPos.current.x);
            const rawDy = (y - mouseAnchorPos.current.y);
            const dist = Math.sqrt(rawDx * rawDx + rawDy * rawDy);

            if (dist > 22) isSlingshotCharged.current = true;

            const resistance = 0.25;
            const finalDx = rawDx * resistance;
            const finalDy = rawDy * resistance;

            targetPos.current.x = Math.max(0, Math.min(CANVAS_WIDTH - PLAYER_WIDTH, playerStartPos.current.x + finalDx));
            targetPos.current.y = Math.max(0, Math.min(CANVAS_HEIGHT - PLAYER_HEIGHT, playerStartPos.current.y + finalDy));
          } else {
            const rawDx = (x - mouseAnchorPos.current.x);
            const rawDy = (y - mouseAnchorPos.current.y);
            targetPos.current.x = Math.max(0, Math.min(CANVAS_WIDTH - PLAYER_WIDTH, playerStartPos.current.x + rawDx));
            targetPos.current.y = Math.max(0, Math.min(CANVAS_HEIGHT - PLAYER_HEIGHT, playerStartPos.current.y + rawDy));
          }
        }
      }
    };

    const handleMouseUp = () => {
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
          // Slingshot mode but not dragged enough: re-arm for next gesture
          armSlingshotAtCurrentPos();
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

      // Boost overdrive
      if (!isOverdriveActiveRef.current) {
        overdriveGauge.current = Math.min(MAX_OVERDRIVE, overdriveGauge.current + 0.5);
        setOverdrive(overdriveGauge.current);
      }

    // Slow motion effect
    timeScale.current = 0.8;

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

  // Game Loop
  const update = () => {
    // Hit stop logic
    if (Date.now() < hitStopTimer.current) return;

    const dt = dtRef.current;

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
    if (glitch.current > 0) glitch.current *= Math.pow(0.9, dt);
    if (shake.current > 0) shake.current *= Math.pow(0.85, dt);
    if (shake.current < 0.5) shake.current = 0;
    if (flash.current > 0) flash.current -= 0.04 * dt;
    if (flash.current < 0) flash.current = 0;

    const currentStage = getStageFromWave(waveRef.current);

    // Update trippy intensity
    const isBossActive = enemies.current.some(e => e.isBoss && e.alive);
    pulseRef.current = audio.getPulse();
    const targetTrippy = (isBossActive ? 0.6 : 0) + (currentStage >= 4 ? 0.3 : 0);
    trippyIntensity.current += (targetTrippy - trippyIntensity.current) * 0.05 * dt;
    // Add beat pulse to trippy intensity
    const effectiveTrippy = trippyIntensity.current + pulseRef.current * 0.15 * trippyIntensity.current;

    if (gameState !== 'PLAYING' || showUpgrade) return;

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
    if (relicsRef.current.some(r => r.id === 'SHIELD_REGEN')) {
      const now = Date.now();
      const shieldActive = activeEffects.current['SHIELD'] > now;
      if (!shieldActive) {
        if (!activeEffects.current['SHIELD_RECHARGE']) {
          activeEffects.current['SHIELD_RECHARGE'] = now + 20000;
        } else if (now > activeEffects.current['SHIELD_RECHARGE']) {
          activeEffects.current['SHIELD'] = now + 10000;
          activeEffects.current['SHIELD_RECHARGE'] = 0;
        }
      } else {
        activeEffects.current['SHIELD_RECHARGE'] = 0;
      }
    }

    // Spawn Asteroids
    if ((isAsteroidBelt || isFinalFront) && !isWarping.current) {
      const spawnRate = isAsteroidBelt ? (isMobile ? 0.006 : 0.014) : (isMobile ? 0.008 : 0.02);
      const maxAsteroids = isAsteroidBelt ? (isMobile ? 8 : 12) : 999;
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

      // Wingman firing
      if (gameState === 'PLAYING') {
        const now = Date.now();
        if (now - lastShotTime.current > (isOverdriveActiveRef.current ? 75 : 150)) {
          bullets.current.push({
            x: wingmanPos.current.x + PLAYER_WIDTH / 2 - 2,
            y: wingmanPos.current.y,
            vx: 0, vy: -10, damage: firepowerRef.current, color: '#ff33cc'
          });
        }
      }

      // Wingman collision with enemy bullets
      enemyBullets.current.forEach((bullet, idx) => {
        if (!wingmanRef.current) return;
        const dx = bullet.x - (wingmanPos.current.x + PLAYER_WIDTH / 2);
        const dy = bullet.y - (wingmanPos.current.y + PLAYER_HEIGHT / 2);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 15) {
          enemyBullets.current.splice(idx, 1);
          createExplosion(wingmanPos.current.x + PLAYER_WIDTH / 2, wingmanPos.current.y + PLAYER_HEIGHT / 2, '#ff33cc', 30);
          audio.playExplosion(wingmanPos.current.x);
          setHasWingman(false);
          wingmanRef.current = false;
        }
      });

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

    const isDragging = isMouseDown.current || isTouching.current;

    // 1. DAMPING & FRICTION (Only for Slingshot Snap)
    if (isSnapping.current > 0) {
      playerVel.current.x *= 0.98;
      playerVel.current.y *= 0.98;
      isSnapping.current--;
      // When snapping ends and no finger is down, sync targetPos to current position
      // so the precision lerp doesn't pull the ship back toward the fire-time target.
      if (isMobile && isSnapping.current === 0 && !isDragging) {
        targetPos.current = { x: playerPos.current.x, y: playerPos.current.y };
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
      const lerpFactor = 0.25 * dt;
      playerPos.current.x += (targetPos.current.x - playerPos.current.x) * lerpFactor;
      playerPos.current.y += (targetPos.current.y - playerPos.current.y) * lerpFactor;
      playerVel.current = { x: 0, y: 0 };
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
            scraps.current.push({
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
    const now = Date.now();
    if (isMoving && now - lastTrailSpawnAt.current > VFX_TRAIL_SPAWN_INTERVAL_MS && trails.current.length < MAX_TRAILS) {
      lastTrailSpawnAt.current = now;
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
        activeEffects.current[p.type] = Date.now() + 8000; // 8 seconds
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
    for (let i = sList.length - 1; i >= 0; i--) {
      const s = sList[i];
      const dx = (playerPos.current.x + PLAYER_WIDTH / 2) - s.x;
      const dy = (playerPos.current.y + PLAYER_HEIGHT / 2) - s.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const magnetRange = 150 + (magnetRef.current - 1) * 60;
      if (dist < magnetRange) {
        // Magnet effect
        const pullStrength = (0.5 + (magnetRef.current - 1) * 0.2) * dt;
        s.vx += (dx / dist) * pullStrength;
        s.vy += (dy / dist) * pullStrength;
      }

      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= Math.pow(0.95, dt);
      s.vy *= Math.pow(0.95, dt);
      s.y += 1 * dt; // Drift down

      if (dist < 30) {
        handleScrapCollection(s);
        s.life = 0;
      }

      if (s.y >= CANVAS_HEIGHT || s.life <= 0) {
        sList.splice(i, 1);
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
        bullets.current.push({
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

    // Maze Generation (Canyon)
    const scrollSpeed = 3 * worldSpeedScale;
    lastBlockRowY.current += scrollSpeed;
    if (lastBlockRowY.current > 100) {
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

      // Collision with player
      if (block.hp > 0 && !isOverdriveActiveRef.current && Date.now() > invulnerableUntil.current) {
        if (playerPos.current.x < block.x + block.width &&
            playerPos.current.x + PLAYER_WIDTH > block.x &&
            playerPos.current.y < block.y + block.height &&
            playerPos.current.y + PLAYER_HEIGHT > block.y) {
          handlePlayerHit();
        }
      }

      // Collision with bullets
      bullets.current.forEach(bullet => {
        if (block.hp > 0 &&
            bullet.x > block.x && bullet.x < block.x + block.width &&
            bullet.y > block.y && bullet.y < block.y + block.height) {
          if (block.type !== 'WALL') {
            block.hp -= (bullet.damage || 1);
            bullet.y = -100;
            if (block.hp <= 0) {
              triggerChainExplosion(block);
            }
          } else {
            bullet.y = -100; // Wall is indestructible
          }
        }
      });
    });
    blocks.current = blocks.current.filter(b => b.y < CANVAS_HEIGHT + 100);

    const frameNow = Date.now();
    const isSlingshotAttacking = frameNow < slingshotAttackUntil.current;
    const registerSlingshotCombo = (basePoints: number) => {
      if (!isSlingshotAttacking) return;

      if (frameNow - lastHitTime.current < SLINGSHOT_COMBO_WINDOW_MS) {
        comboRef.current += 1;
      } else {
        comboRef.current = 1;
      }
      lastHitTime.current = frameNow;
      setCombo(comboRef.current);

      const comboBonus = Math.floor(basePoints * (comboRef.current - 1) * 0.15);
      setScore((s) => s + basePoints + comboBonus);

      if (!isOverdriveActiveRef.current) {
        const gaugeGain = Math.min(3.5, 1.4 + comboRef.current * 0.25);
        overdriveGauge.current = Math.min(MAX_OVERDRIVE, overdriveGauge.current + gaugeGain);
        setOverdrive(overdriveGauge.current);
      }
    };

    asteroids.current.forEach(a => {
      // Movement with inertia
      a.x += (a.dx + a.vx) * worldSpeedScale * dt;
      a.y += (a.speed + a.vy) * worldSpeedScale * dt;
      a.rotation += a.vr * worldSpeedScale * dt;

      // Friction for vx/vy
      a.vx *= Math.pow(0.98, dt);
      a.vy *= Math.pow(0.98, dt);

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
        } else if (Date.now() > invulnerableUntil.current) {
          handlePlayerHit();
          a.hp = 0; // Destroy on impact
        }
      }

      // Collision with enemies (Kinetic Weapon)
      enemies.current.forEach(e => {
        if (!e.alive) return;
        const edx = e.x + e.width / 2 - a.x;
        const edy = e.y + e.height / 2 - a.y;
        const edist = Math.sqrt(edx * edx + edy * edy);
        const combinedVel = Math.sqrt(a.vx * a.vx + a.vy * a.vy);

        if (edist < a.size + e.width / 2 && combinedVel > 1) {
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

      // Collision with bullets
      bullets.current.forEach(b => {
        const bdx = b.x - a.x;
        const bdy = b.y - a.y;
        const bdist = Math.sqrt(bdx * bdx + bdy * bdy);
        if (bdist < a.size) {
          a.hp -= (b.damage || 1);

          // Kinetic Push: Bullet transfers momentum to asteroid
          const pushForce = 2;
          a.vx += (b.vx || 0) * 0.1 * pushForce;
          a.vy += (b.vy || -10) * 0.1 * pushForce;

          b.y = -100; // Remove bullet

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
              scraps.current.push({
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
              for(let i=0; i<numFragments; i++) {
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

    // Update Obstacles (Sector 16+: Fortress Gates & The Core)
    if (currentStage === 5 && !isWarping.current) {
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

      // Collision with player
      const px = playerPos.current.x;
      const py = playerPos.current.y;
      if (px + PLAYER_WIDTH > obs.x && px < obs.x + obs.width &&
          py + PLAYER_HEIGHT > obs.y && py < obs.y + obs.height && Date.now() > invulnerableUntil.current) {
        handlePlayerHit();
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
        if (b.x > obs.x && b.x < obs.x + obs.width &&
            b.y > obs.y && b.y < obs.y + obs.height) {
          obs.hp -= (b.damage || 1);
          b.y = -100; // Remove bullet
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
        const hasFrenzy = relicsRef.current.some(r => r.id === 'FRENZY');
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
    const shootInterval = isOverdriveActiveRef.current ? 80 : isRapid ? 120 : 250;

    if (gameState === 'PLAYING') {
      const now = Date.now();
      if (now - lastShotTime.current > shootInterval) {
        const isMulti = activeEffects.current['MULTISHOT'] > Date.now();
        const isOver = isOverdriveActiveRef.current;
        const bulletDamage = 1 + (firepowerRef.current - 1) * 0.5;
        const bulletSize = 4 + (firepowerRef.current - 1) * 2;

        if (isOver) {
          // Super Overdrive Shot - Nerfed damage but kept intensity
          for (let i = -2; i <= 2; i++) {
            bullets.current.push({
              x: playerPos.current.x + PLAYER_WIDTH / 2 - bulletSize / 2 + i * 15,
              y: playerPos.current.y,
              vx: i * 0.5,
              vy: -BULLET_SPEED * 1.5,
              damage: bulletDamage * 1.5, // 2x -> 1.5x
              size: bulletSize * 1.2
            });
          }
        } else if (isMulti) {
          bullets.current.push({ x: playerPos.current.x + PLAYER_WIDTH / 2 - 10, y: playerPos.current.y, damage: bulletDamage, size: bulletSize });
          bullets.current.push({ x: playerPos.current.x + PLAYER_WIDTH / 2 + 6, y: playerPos.current.y, damage: bulletDamage, size: bulletSize });
          bullets.current.push({ x: playerPos.current.x + PLAYER_WIDTH / 2 - 2, y: playerPos.current.y - 10, damage: bulletDamage, size: bulletSize });
        } else {
          bullets.current.push({
            x: playerPos.current.x + PLAYER_WIDTH / 2 - bulletSize / 2,
            y: playerPos.current.y,
            damage: bulletDamage,
            size: bulletSize
          });
        }
        audio.playShoot(playerPos.current.x + PLAYER_WIDTH / 2);
        lastShotTime.current = now;
      }
    }

    // Update bullets
    const bulletList = bullets.current;
    for (let i = bulletList.length - 1; i >= 0; i--) {
      const b = bulletList[i];
      b.x += (b.vx || 0) * timeScale.current * dt;
      b.y += (b.vy || -BULLET_SPEED) * timeScale.current * dt;

      if (b.y < -20 || b.y > CANVAS_HEIGHT + 20) {
        bulletList.splice(i, 1);
      }
    }

    // Update enemy bullets
    const currentEnemyBulletSpeed = (ENEMY_BULLET_SPEED + waveRef.current * 0.2) * worldSpeedScale;
    const enemyBulletList = enemyBullets.current;
    for (let i = enemyBulletList.length - 1; i >= 0; i--) {
      const b = enemyBulletList[i];
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

      if (b.y > CANVAS_HEIGHT + 20 || b.x < -20 || b.x > CANVAS_WIDTH + 20) {
        enemyBulletList.splice(i, 1);
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
                enemyBullets.current.push({
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
                enemyBullets.current.push({
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
        newBullets.forEach(b => enemyBullets.current.push(b));
        if (newBullets.length > 0) audio.playEnemyShoot(shooter.x + shooter.width / 2);
      }
    }

    // Update enemies formation
    const currentEnemyDiveSpeed = (ENEMY_DIVE_SPEED + waveRef.current * 0.2) * worldSpeedScale * dt;
    const formationOffset = (Math.sin(Date.now() / 1200) * 60);
    const currentTime = Date.now();

    enemies.current.forEach((enemy) => {
      if (!enemy.alive) return;

      // EMP Stun check
      if (enemy.stunnedUntil && enemy.stunnedUntil > currentTime) {
        return;
      }

      enemy.prevX = enemy.x;
      enemy.prevY = enemy.y;

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
            // Spawns small fast enemies
            if (currentTime - (enemy.lastShotTime || 0) > (enemy.phase === 3 ? 1000 : 2000)) {
              enemy.lastShotTime = currentTime;
              for (let i = 0; i < 3; i++) {
                const offsetX = (Math.random() - 0.5) * 60;
                const offsetY = (Math.random() - 0.5) * 40;
                const swarmEnemy: Enemy = {
                  ...createEnemy(enemy.x + enemy.width / 2 + offsetX, enemy.y + enemy.height + offsetY, 0),
                  isDiving: true,
                  diveType: 'chase',
                  // Add significant jitter to target position to prevent overlap during chase
                  diveX: playerPos.current.x + (Math.random() - 0.5) * 200,
                  diveY: playerPos.current.y + (Math.random() - 0.5) * 200,
                  state: 'DIVING'
                };
                enemies.current.push(swarmEnemy);
              }
              audio.playDive(enemy.x);
            }
          } else if (enemy.bossType === BossType.TENTACLE) {
            // Tentacle Boss logic
            const time = currentTime / 1000;
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

                  // Collision with player
                  const pdx = (playerPos.current.x + PLAYER_WIDTH / 2) - seg.x;
                  const pdy = (playerPos.current.y + PLAYER_HEIGHT / 2) - seg.y;
                  const pdist = Math.sqrt(pdx * pdx + pdy * pdy);
                  if (pdist < 20 && invulnerableUntil.current < currentTime) {
                    handlePlayerHit();
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
                enemyBullets.current.push({
                  x: tip.x, y: tip.y,
                  vx: (dx / dist) * 3.5, vy: (dy / dist) * 3.5
                });
              });
              audio.playEnemyShoot(enemy.x);
            }
          } else if (enemy.bossType === BossType.LASER) {
            // Rotating Laser Beams
            enemy.tractorBeamTimer += dt * (1000 / 60) * timeScale.current; // Using this as rotation angle
            const angle = (enemy.tractorBeamTimer / 1000) * Math.PI;
            const laserCount = enemy.phase === 3 ? 4 : 2;

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

              // Beam visual width is ~12px core + 30px glow. At distance d, angular width = 42/d rad.
              // Use 0.15 as a generous threshold so the hit zone matches what the player sees.
              const hitThreshold = Math.max(0.15, 42 / Math.max(dist, 1));
              if (diff < hitThreshold && dist < 1000 && dist > 50) {
                shake.current = 5;
                // Damage every 200ms using lastShotTime as a per-beam damage timer
                if (!enemy.laserHitTime) enemy.laserHitTime = 0;
                if (currentTime - enemy.laserHitTime > 200) {
                  enemy.laserHitTime = currentTime;
                  handlePlayerHit();
                }
              }
            }
          }

          // General Boss Shooting
          let shootInterval = enemy.phase === 3 ? 600 : enemy.phase === 2 ? 1000 : 1500;
          if (currentTime - (enemy.lastShotTime || 0) > shootInterval) {
            enemy.lastShotTime = currentTime;
            audio.playEnemyShoot(enemy.x + enemy.width / 2);
            // Spread shot
            const count = enemy.phase === 3 ? 7 : 5;
            for (let i = 0; i < count; i++) {
              const angle = (Math.PI / count) * i + Math.PI / 4;
              enemyBullets.current.push({
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
          enemyBullets.current.push({
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
        } else if (enemy.diveType === 'chase') {
          const dx = (enemy.diveX || 0) - enemy.x;
          const dy = (enemy.diveY || 0) - enemy.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 5) {
            enemy.x += (dx / dist) * enemy.speedScale * currentEnemyDiveSpeed * 1.5 * dt;
            enemy.y += (dy / dist) * enemy.speedScale * currentEnemyDiveSpeed * 1.5 * dt;
          } else {
            enemy.y += currentEnemyDiveSpeed * enemy.speedScale * dt;
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
          // Wrap around
          if (enemy.x < -100) enemy.x = CANVAS_WIDTH + 50;
          if (enemy.x > CANVAS_WIDTH + 100) enemy.x = -50;
          if (enemy.y < -100) enemy.y = CANVAS_HEIGHT + 50;
          if (enemy.y > CANVAS_HEIGHT + 100) enemy.y = -50;
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
    enemies.current.forEach((enemy) => {
      if (!enemy.alive || enemy.state === 'ENTERING') return;

      enemies.current.forEach((other) => {
        if (enemy === other || !other.alive || other.state === 'ENTERING') return;

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
    const aliveEnemies = enemies.current.filter(e => e.alive);
    const playerBullets = bullets.current;

    for (let i = playerBullets.length - 1; i >= 0; i--) {
      const bullet = playerBullets[i];

      for (let j = 0; j < aliveEnemies.length; j++) {
        const enemy = aliveEnemies[j];
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
            const nearby = aliveEnemies.filter(e => e !== enemy);
            nearby.forEach(e => {
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

          // Hit stop (milliseconds)
          hitStopTimer.current = Date.now() + 33;

          // EMP Burst
          if (relicsRef.current.some(r => r.id === 'EMP') && Math.random() < 0.1) {
            enemy.stunnedUntil = Date.now() + 2000;
            createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#ff3366', 10);
          }

          if (enemy.isBoss) {
            enemy.health! -= damage;
            setBossHealth({ current: enemy.health!, max: enemy.maxHealth! });
            playerBullets.splice(i, 1);
            audio.playEnemyHit(enemy.x + enemy.width / 2);
            flash.current = 0.2;

            if (enemy.health! <= 0) {
              enemy.alive = false;

              // Chrono Trigger
              if (relicsRef.current.some(r => r.id === 'CHRONO') && !isOverdriveActiveRef.current && Math.random() < 0.15) {
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
                setGameState('VICTORY');
              }

              audio.playExplosion(enemy.x + enemy.width / 2);
              createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#ff33cc', 100);

              // Drop many scraps
              for (let i = 0; i < 20; i++) {
                scraps.current.push({
                  x: enemy.x + enemy.width / 2,
                  y: enemy.y + enemy.height / 2,
                  vx: (Math.random() - 0.5) * 10,
                  vy: (Math.random() - 0.5) * 10,
                  life: 1
                });
              }

              // Overdrive gauge increase
              if (!isOverdriveActiveRef.current) {
                overdriveGauge.current = Math.min(100, overdriveGauge.current + 12);
                setOverdrive(overdriveGauge.current);
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
            aliveEnemies.forEach(other => {
              if (other.alive && other !== enemy) {
                const dx = (other.x + other.width/2) - (enemy.x + enemy.width/2);
                const dy = (other.y + other.height/2) - (enemy.y + enemy.height/2);
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < 150) {
                  other.health = (other.health || 0) - 50;
                  if (other.health <= 0) other.alive = false;
                }
              }
            });
          }

          // Chrono Trigger
          if (relicsRef.current.some(r => r.id === 'CHRONO') && !isOverdriveActiveRef.current && Math.random() < 0.15) {
            timeScale.current = 0.3;
          }
          playerBullets.splice(i, 1);

          // Drop scrap
          const scrapChance = isOverdriveActiveRef.current ? 1.0 : 0.6;
          const scrapCount = isOverdriveActiveRef.current ? 3 : 1;
          if (Math.random() < scrapChance) {
            for (let k = 0; k < scrapCount; k++) {
              scraps.current.push({
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

          const basePoints = enemy.isDiving ? 250 : 100;
          const comboBonus = Math.floor(basePoints * (comboRef.current - 1) * 0.1);
          setScore((s) => s + basePoints + comboBonus);

          // Overdrive gauge increase
          if (!isOverdriveActiveRef.current) {
            const stageGainScale = Math.min(1.25, 1 + waveRef.current * 0.02);
            const gaugeGain = (enemy.isDiving ? 2.2 : 0.9) * stageGainScale;
            overdriveGauge.current = Math.min(100, overdriveGauge.current + gaugeGain);
            setOverdrive(overdriveGauge.current);
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

    let playerHit = false;

    for (let i = 0; i < aliveEnemies.length; i++) {
      const enemy = aliveEnemies[i];
      if (enemy.x < px + pw &&
          enemy.x + enemy.width > px &&
          enemy.y < py + ph &&
          enemy.y + enemy.height > py) {

        if (isSlingshotAttacking || isOverdriveActiveRef.current) {
          // Offensive collision: Damage enemy
          const damage = isOverdriveActiveRef.current ? 1000 : 150;
          enemy.health! -= damage;

          if (isSlingshotAttacking) {
            hitStopTimer.current = Date.now() + 60; // 60ms hit stop
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
        } else {
          playerHit = true;
        }
      }
    }

    const eBullets = enemyBullets.current;
    const isSlingshotGuardActive = Date.now() < slingshotGuardUntil.current;
    for (let i = eBullets.length - 1; i >= 0; i--) {
      const bullet = eBullets[i];
      // Graze Detection for bullets
      const bdx = (playerPos.current.x + PLAYER_WIDTH / 2) - bullet.x;
      const bdy = (playerPos.current.y + PLAYER_HEIGHT / 2) - bullet.y;
      const bdist = Math.sqrt(bdx * bdx + bdy * bdy);

      if (bdist < GRAZE_DISTANCE && bdist > 15) {
        handleGraze(bullet.x, bullet.y);
      }

      if (bullet.x > px && bullet.x < px + pw &&
          bullet.y > py && bullet.y < py + ph) {
        if (isSlingshotGuardActive) {
          createExplosion(bullet.x, bullet.y, '#00ffcc', 6);
          overdriveGauge.current = Math.min(MAX_OVERDRIVE, overdriveGauge.current + 2);
          setOverdrive(overdriveGauge.current);
          eBullets.splice(i, 1);
          continue;
        }
        playerHit = true;
        eBullets.splice(i, 1);
      }
    }

    if (playerHit && Date.now() > invulnerableUntil.current) {
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
        enemyBullets.current = []; // Clear bullets to give a chance to recover
        if (comboRef.current > 5) audio.playComboBreak();
        comboRef.current = 0;
        setCombo(0);
      } else {
        integrityRef.current = 0;
        setIntegrity(0);
        audio.stopBGM();
        setGameState('GAME_OVER');
      }
    }

    // Update particles
    if (isWarping.current && Math.random() > 0.6) {
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
        p.vx *= Math.pow(0.95, dt); // friction
        p.vy *= Math.pow(0.95, dt);
      }
      if (p.rotation !== undefined && p.vr !== undefined) {
        p.rotation += p.vr * dt;
      }
      p.life -= 1 * dt;

      if (p.life <= 0) {
        particleList.splice(i, 1);
      }
    }

    // Wave Completion Logic
    const isTimeBasedStage = currentStage === 2; // Asteroid Belt is survival based

    let isWaveCleared = false;
    if (isTimeBasedStage) {
      // Survive for 45 seconds
      if (!stageStartTime.current) stageStartTime.current = Date.now();
      const elapsed = (Date.now() - stageStartTime.current) / 1000;
      setSurvivalTime(Math.max(0, 45 - Math.floor(elapsed)));
      if (elapsed >= 45) {
        isWaveCleared = true;
        stageStartTime.current = 0;
      }

      // Keep spawning enemies if they are low
      const maxEnemies = isAsteroidBelt ? (isMobile ? 4 : 5) : 8;
      if (enemies.current.filter(e => e.alive).length < maxEnemies && !isWarping.current) {
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
      isWaveCleared = enemies.current.every(e => !e.alive) && !isWarping.current && !showUpgrade;
    }

    // Ambush System (VS Style constant action)
    if (gameState === 'PLAYING' && !isWarping.current && !isTimeBasedStage) {
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
        enemyBullets.current.forEach(eb => {
          const bdx = eb.x - seg.x;
          const bdy = eb.y - seg.y;
          const bdist = Math.sqrt(bdx * bdx + bdy * bdy);
          if (bdist < 15) {
            eb.y = CANVAS_HEIGHT + 100; // Destroy bullet
            createExplosion(seg.x, seg.y, '#00ffcc', 5);
            seg.lastHit = Date.now();
          }
        });

        // Passive Defense: Collision with Asteroids
        asteroids.current.forEach(a => {
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
        enemies.current.forEach(e => {
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

    if (isWaveCleared && gameState === 'PLAYING') {
      isWarping.current = true;
      warpStartTime.current = Date.now();
      pauseStartTime.current = Date.now();
      audio.playWaveClear();
      audio.playWarp();
      flash.current = 0.6; // Warp start flash (reduced intensity)

      // Clear bullets
      bullets.current = [];
      enemyBullets.current = [];
      asteroids.current = [];
      obstacles.current = [];

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

    const currentAliveEnemies = enemies.current.filter(e => e.alive);
    if (currentAliveEnemies.some(e => e.y + e.height > CANVAS_HEIGHT && e.state === 'IN_FORMATION')) {
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

    // Clear offscreen
    ctx.fillStyle = 'rgba(2, 2, 5, 0.3)';
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
    const isChase = currentStage === 4;
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

        ctx.strokeStyle = `rgba(255, 255, 255, ${s.opacity * warpFactor.current})`;
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
        ctx.fillStyle = `rgba(255, 255, 255, ${s.opacity})`;

        if (isChase) {
          const stretch = 5;
          ctx.strokeStyle = `rgba(255, 255, 255, ${s.opacity * 0.5})`;
          ctx.lineWidth = s.size;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(s.x, s.y - s.size * stretch);
          ctx.stroke();
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
    if (isBossWave) baseGridColor = 'rgba(255, 51, 102, 0.1)';
    else if (isBossNear) baseGridColor = 'rgba(255, 204, 0, 0.08)';

    const gridColor = isWarping.current ? `rgba(255, 51, 102, ${0.1 + warpFactor.current * 0.3})` : baseGridColor;
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    const gridSpacing = isMobile ? 80 : 40; // Fewer grid lines on mobile
    const gridSpeed = isWarping.current ? 100 : 20;
    const gridOffset = (Date.now() / gridSpeed) % gridSpacing;

    // Only draw vertical lines on mobile to save performance
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
      if (!isMobile) ctx.shadowBlur = 10;

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

    // Draw Scraps
    scraps.current.forEach(s => {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#00ffcc';
      ctx.fillStyle = '#00ffcc';
      ctx.beginPath();
      ctx.arc(0, 0, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // Power-ups
    powerUps.current.forEach(p => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Date.now() / 500);
      const color = p.type === 'MULTISHOT' ? '#ffcc00' : p.type === 'SHIELD' ? '#33ccff' : '#ff33cc';
      ctx.shadowBlur = 15;
      ctx.shadowColor = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(-10, -10, 20, 20);
      ctx.fillStyle = color;
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.type[0], 0, 0);
      ctx.restore();
    });

    // Overdrive Screen Effect
    if (isOverdriveActiveRef.current) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const pulse = Math.sin(Date.now() / 100) * 0.1;
      ctx.fillStyle = `rgba(255, 51, 102, ${0.1 + pulse})`;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.restore();
    }

    // Draw Obstacles
    obstacles.current.forEach(obs => {
      ctx.save();
      ctx.translate(obs.x, obs.y);

      const color = obs.color;
      ctx.shadowBlur = 15;
      ctx.shadowColor = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;

      // Outer border
      ctx.strokeRect(0, 0, obs.width, obs.height);

      // Inner details based on type
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.3;
      if (obs.type === 'WALL') {
        // Diagonal lines
        for (let i = 0; i < obs.width + obs.height; i += 20) {
          ctx.beginPath();
          ctx.moveTo(Math.max(0, i - obs.height), Math.min(i, obs.height));
          ctx.lineTo(Math.min(i, obs.width), Math.max(0, i - obs.width));
          ctx.stroke();
        }
      } else if (obs.type === 'BUILDING') {
        // Grid pattern
        for (let x = 20; x < obs.width; x += 20) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, obs.height);
          ctx.stroke();
        }
        for (let y = 20; y < obs.height; y += 20) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(obs.width, y);
          ctx.stroke();
        }
      } else {
        // Concentric squares
        for (let i = 10; i < Math.min(obs.width, obs.height) / 2; i += 10) {
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
      ctx.shadowBlur = block.type === 'WALL' ? 0 : 15;
      ctx.shadowColor = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = block.type === 'WALL' ? 1 : 2;

      if (block.type === 'WALL') {
        ctx.fillStyle = 'rgba(26, 26, 46, 0.8)';
        ctx.fillRect(0, 0, block.width, block.height);
        ctx.strokeRect(0, 0, block.width, block.height);
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
        ctx.globalAlpha = 0.3;
        if (block.type === 'PILLAR') { // Core
          ctx.beginPath();
          ctx.arc(block.width / 2, block.height / 2, 15, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = color;
          ctx.fill();
        } else {
          ctx.strokeRect(10, 10, block.width - 20, block.height - 20);
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
      ctx.shadowBlur = 15;
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
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(0, 0, 35, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
    }

      // Wingman Rendering
      if (hasWingman) {
        ctx.save();
        ctx.translate(wingmanPos.current.x + PLAYER_WIDTH / 2, wingmanPos.current.y + PLAYER_HEIGHT / 2);
      ctx.scale(0.8, 0.8); // Slightly smaller

      const color = '#ff33cc';
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 15;
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
    if (!isMobile) ctx.shadowBlur = 15;
    bullets.current.forEach((b) => {
      const size = b.size || 4;
      ctx.fillStyle = isOverdriveActiveRef.current ? '#ff3366' : '#00ffcc';
      ctx.shadowColor = isOverdriveActiveRef.current ? '#ff3366' : '#00ffcc';
      ctx.fillRect(b.x, b.y, size, isOverdriveActiveRef.current ? size * 5 : size * 3);
    });

    // Enemy Bullets
    ctx.fillStyle = '#ff9900'; // Changed to Orange for better visibility against player's pink Overdrive
    if (!isMobile) ctx.shadowColor = '#ff9900';
    enemyBullets.current.forEach((b) => {
      ctx.beginPath();
      ctx.arc(b.x + 2, b.y + 6, 4, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.shadowBlur = 0;

    // Enemies
    enemies.current.forEach((enemy) => {
      if (!enemy.alive) return;

      ctx.save();
      ctx.translate(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2);

      if (enemy.isBoss) {
        // Boss Rendering
        const color = enemy.bossType === BossType.LASER ? '#00ffcc' : '#ff3366';
        const pulse = Math.sin(Date.now() / 150) * 10;
        ctx.shadowBlur = 20 + pulse;
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

          // Rotating Rings
          const angleOffset = (Date.now() / 1000) * Math.PI;
          for (let i = 0; i < 3; i++) {
            ctx.save();
            ctx.rotate(angleOffset * (i + 1) * 0.5);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(0, 0, 60 + i * 20, 30 + i * 10, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }

          // Draw Lasers
          if (enemy.phase! >= 1) {
            const angle = (enemy.tractorBeamTimer! / 1000) * Math.PI;
            const laserCount = enemy.phase === 3 ? 4 : 2;
            ctx.save();
            ctx.lineWidth = 10 + Math.sin(Date.now() / 50) * 5;
            ctx.strokeStyle = '#00ffff';
            ctx.shadowBlur = 30;
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
        if (enemy.phase! >= 3) {
          ctx.strokeStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(0, 0, 40, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Tractor Beam Rendering
        if (enemy.bossType === BossType.TRACTOR && (enemy.isTractorBeaming || (enemy.tractorBeamTimer! > 2500))) {
          ctx.save();
          const isCharging = enemy.tractorBeamTimer! > 2500 && !enemy.isTractorBeaming;
          const beamWidth = isCharging ? 4 : 120 + Math.sin(Date.now() / 50) * 20;
          const beamAlpha = isCharging ? 0.3 : 0.8;

          const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
          gradient.addColorStop(0, `rgba(0, 255, 255, ${beamAlpha})`);
          gradient.addColorStop(1, `rgba(0, 255, 255, ${beamAlpha * 0.1})`);

          ctx.fillStyle = gradient;
          ctx.shadowColor = '#00ffff';
          ctx.shadowBlur = isCharging ? 5 : 20;
          ctx.beginPath();
          ctx.moveTo(-20, enemy.height / 2);
          ctx.lineTo(20, enemy.height / 2);
          ctx.lineTo(beamWidth / 2, CANVAS_HEIGHT);
          ctx.lineTo(-beamWidth / 2, CANVAS_HEIGHT);
          ctx.closePath();
          ctx.fill();

          if (!isCharging) {
            // Add some scanning lines inside the beam
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 2;
            const scanY = (Date.now() % 1000) / 1000 * CANVAS_HEIGHT;
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
        ctx.shadowBlur = 15;
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
        ctx.rotate(Date.now() / 500);
        ctx.strokeRect(-8, -8, 16, 16);
        ctx.restore();

        // Draw Tentacles in world space
        if (enemy.bossType === BossType.TENTACLE && enemy.tentacles) {
          ctx.restore(); // Restore boss translate
          const time = Date.now() / 1000;

          enemy.tentacles.forEach((t, tIdx) => {
            const hue = (time * 50 + tIdx * 60) % 360;
            const color = `hsla(${hue}, 80%, 60%, 1)`;
            const glowColor = `hsla(${hue}, 80%, 60%, 0.4)`;

            t.segments.forEach((seg, i) => {
              ctx.save();
              ctx.translate(seg.x, seg.y);
              ctx.rotate(seg.angle);

              const size = 30 - i * 2;
              if (size <= 0) {
                ctx.restore();
                return;
              }

              // Glow
              ctx.shadowBlur = 15;
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

            // Tip effect
            const tip = t.segments[t.segments.length - 1];
            ctx.save();
            ctx.translate(tip.x, tip.y);
            ctx.fillStyle = '#ffffff';
            ctx.shadowBlur = 20;
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
          ctx.shadowBlur = 30;
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

      const colors = ['#ffcc00', '#ff33cc', '#33ccff', '#ff0000'];
      const color = colors[enemy.type] || '#ffcc00';
      const pulse = Math.sin(Date.now() / 200) * 5;

      ctx.shadowBlur = 15 + pulse;
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
        ctx.globalAlpha = 0.5 + Math.sin(Date.now() / 100) * 0.3;
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
        ctx.arc(0, 0, 8 + Math.sin(Date.now() / 100) * 4, 0, Math.PI * 2);
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
        ctx.shadowBlur = 10;
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

      ctx.shadowBlur = 10;
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

    // Nebula Pass Effect (Stage 3+: Heavy Fire / Trippy)
    if (currentStage >= 3 || trippyIntensity.current > 0.1) {
      ctx.save();
      const time = Date.now() / 2000;
      const intensity = (currentStage === 3 ? 0.1 : 0) + trippyIntensity.current * 0.3 + (pulseRef.current * 0.15 * trippyIntensity.current);

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

      // Add some "static" noise / particles
      if (trippyIntensity.current > 0.3) {
        ctx.globalAlpha = trippyIntensity.current * 0.1;
        for (let i = 0; i < 10; i++) {
          const x = Math.random() * CANVAS_WIDTH;
          const y = Math.random() * CANVAS_HEIGHT;
          const size = Math.random() * 100 + 50;
          ctx.fillStyle = i % 2 === 0 ? '#ff00ff' : '#00ffff';
          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1.0;
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
    }

    // Flash
    if (flash.current > 0 || pulseRef.current > 0.1) {
      const flashAlpha = (flash.current * 0.3) + (pulseRef.current * 0.05 * trippyIntensity.current);
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

            // Predicted landing point on the threshold ring (release stop position)
            if (dist > 5) {
              const pullMag = Math.sqrt(dx * dx + dy * dy) || 1;
              const pullDirX = -dx / pullMag;
              const pullDirY = -dy / pullMag;
              const predictedCenterX = sCenterX + pullDirX * SLINGSHOT_THRESHOLD;
              const predictedCenterY = sCenterY + pullDirY * SLINGSHOT_THRESHOLD;

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
            let lineWidth = 2;
            let hue = 180;

            if (isAttackRange) {
              hue = 300 + (clampedTension - 1.0) * 60;
              ringColor = `hsla(${hue}, 100%, 60%, ${0.7 + (clampedTension - 1.0) * 0.3})`;
              lineWidth = 6 + (clampedTension - 1.0) * 15;
            } else if (tension > 0.6) {
              const warningRatio = (tension - 0.6) / 0.4;
              const r = Math.floor(0 + 255 * warningRatio);
              const g = Math.floor(255);
              const b = Math.floor(204 - 204 * warningRatio);
              ringColor = `rgba(${r}, ${g}, ${b}, ${0.3 + warningRatio * 0.4})`;
              lineWidth = 2 + warningRatio * 4;
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
          } else {
            // PRECISION MODE: No visual line
          }

          ctx.restore();
        }
      }
    }

    // Ambush Warning removed
    const isTimeBasedStage = currentStage === 2;

    // Final Post-Processing to Main Canvas
    mainCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Ghosting / Motion Trails (Trippy)
    if (trippyIntensity.current > 0.4) {
      mainCtx.save();
      mainCtx.globalAlpha = 0.3 * trippyIntensity.current;
      const offset = 5 * trippyIntensity.current;
      mainCtx.drawImage(offscreenCanvas.current, offset, 0);
      mainCtx.drawImage(offscreenCanvas.current, -offset, 0);
      mainCtx.restore();
    }

    // Radial Warp Streaks (Stylish Warp)
    if (warpFactor.current > 0.1 && !isMobile) {
      mainCtx.save();
      mainCtx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);

      // Energy Tunnel Rings
      for (let i = 0; i < 4; i++) {
        const r = ((Date.now() * 0.6 + i * 250) % 1200) * warpFactor.current;
        const alpha = (1 - r / 1200) * warpFactor.current * 0.25;
        mainCtx.strokeStyle = i % 2 === 0 ? `rgba(0, 255, 204, ${alpha})` : `rgba(255, 51, 102, ${alpha})`;
        mainCtx.lineWidth = 1 + (1 - r / 1200) * 3;
        mainCtx.beginPath();
        mainCtx.arc(0, 0, r, 0, Math.PI * 2);
        mainCtx.stroke();

        // Add some "energy bits" on the rings
        if (warpFactor.current > 0.7) {
          for (let j = 0; j < 3; j++) {
            const angle = (Date.now() * 0.003 + j * (Math.PI * 2 / 3));
            mainCtx.fillStyle = '#ffffff';
            mainCtx.beginPath();
            mainCtx.arc(Math.cos(angle) * r, Math.sin(angle) * r, 1.5, 0, Math.PI * 2);
            mainCtx.fill();
          }
        }
      }

      // Warp Streaks
      const streakCount = 20;
      for (let i = 0; i < streakCount; i++) {
        mainCtx.save();
        const angle = (i / streakCount) * Math.PI * 2 + Date.now() * 0.001;
        const len = 150 + Math.random() * 600 * warpFactor.current;
        mainCtx.rotate(angle);

        const grad = mainCtx.createLinearGradient(0, 0, 0, len);
        grad.addColorStop(0, 'transparent');
        grad.addColorStop(0.2, `rgba(0, 255, 204, ${warpFactor.current * 0.4})`);
        grad.addColorStop(0.5, `rgba(255, 255, 255, ${warpFactor.current * 0.6})`);
        grad.addColorStop(0.8, `rgba(255, 51, 102, ${warpFactor.current * 0.4})`);
        grad.addColorStop(1, 'transparent');

        mainCtx.strokeStyle = grad;
        mainCtx.lineWidth = 1.5 + Math.random() * 2;
        mainCtx.beginPath();
        mainCtx.moveTo(0, 30);
        mainCtx.lineTo(0, 30 + len);
        mainCtx.stroke();
        mainCtx.restore();
      }

      // Center Glow
      const glow = mainCtx.createRadialGradient(0, 0, 0, 0, 0, 100 * warpFactor.current);
      glow.addColorStop(0, `rgba(255, 255, 255, ${warpFactor.current * 0.8})`);
      glow.addColorStop(1, 'transparent');
      mainCtx.fillStyle = glow;
      mainCtx.beginPath();
      mainCtx.arc(0, 0, 100 * warpFactor.current, 0, Math.PI * 2);
      mainCtx.fill();

      mainCtx.restore();
    }

    // UI Glitch during Warp
    if (warpFactor.current > 0.7) {
      const glitchAmount = warpFactor.current * 10;
      const warpGlitchCount = isMobile ? 1 : 2;
      for (let i = 0; i < warpGlitchCount; i++) {
        const x = Math.random() * CANVAS_WIDTH;
        const y = Math.random() * 40; // Top HUD area
        const w = Math.random() * 150 + 50;
        const h = Math.random() * 5 + 2;
        const dx = (Math.random() - 0.5) * glitchAmount;
        mainCtx.drawImage(offscreenCanvas.current, x, y, w, h, x + dx, y, w, h);
      }
    }

    // Chromatic Aberration
    const caIntensity = (isOverdriveActiveRef.current ? 4 : 0) + (warpFactor.current * 15) + (glitch.current * 0.5) + (trippyIntensity.current * 10);

    mainCtx.save();

    // Kaleidoscope / Mirror Effect (Trippy)
    if (trippyIntensity.current > 0.7) {
      mainCtx.save();
      mainCtx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
      mainCtx.scale(-1, 1);
      mainCtx.translate(-CANVAS_WIDTH / 2, -CANVAS_HEIGHT / 2);
      mainCtx.globalAlpha = 0.2 * trippyIntensity.current;
      mainCtx.drawImage(offscreenCanvas.current, 0, 0);
      mainCtx.restore();
    }

    // Trippy Hue Rotation - Disabled on mobile
    if (trippyIntensity.current > 0.1 && !isMobile) {
      const hue = (Date.now() / 50) % 360;
      mainCtx.filter = `hue-rotate(${hue * trippyIntensity.current}deg) saturate(${100 + trippyIntensity.current * 100}%)`;
    }

    if (warpFactor.current > 0.2 || pulseRef.current > 0.1) {
      // Radial Distortion (Fisheye) + Beat Pulse
      const beatScale = pulseRef.current * 0.02 * trippyIntensity.current;
      const distortionScale = 1 + warpFactor.current * 0.03 + beatScale;
      mainCtx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
      mainCtx.scale(distortionScale, distortionScale);
      mainCtx.translate(-CANVAS_WIDTH / 2, -CANVAS_HEIGHT / 2);
    }

    if (caIntensity > (isMobile ? 4 : 0.5)) {
      mainCtx.globalCompositeOperation = 'screen';
      // Red
      mainCtx.drawImage(offscreenCanvas.current, -caIntensity, 0);
      // Green (center)
      if (!isMobile) mainCtx.drawImage(offscreenCanvas.current, 0, 0);
      // Blue
      mainCtx.drawImage(offscreenCanvas.current, caIntensity, 0);
      mainCtx.globalCompositeOperation = 'source-over';
    } else {
      mainCtx.drawImage(offscreenCanvas.current, 0, 0);
    }

    // Glitch Effect - Reduced on mobile
    if (glitch.current > 1) {
      const glitchAmount = glitch.current;
      const glitchCount = isMobile ? 1 : 4;
      for (let i = 0; i < glitchCount; i++) {
        const x = Math.random() * CANVAS_WIDTH;
        const y = Math.random() * CANVAS_HEIGHT;
        const w = Math.random() * 100 + 50;
        const h = Math.random() * 20 + 5;
        const dx = (Math.random() - 0.5) * glitchAmount * 2;
        mainCtx.drawImage(offscreenCanvas.current, x, y, w, h, x + dx, y, w, h);
      }
    }

    // Scanlines - Disabled on mobile
    if (!isMobile) {
      mainCtx.fillStyle = 'rgba(18, 16, 16, 0.1)';
      for (let i = 0; i < CANVAS_HEIGHT; i += 4) {
        mainCtx.fillRect(0, i, CANVAS_WIDTH, 1);
      }
    }

    // Vignette - Disabled on mobile
    if (!isMobile) {
      const gradient = mainCtx.createRadialGradient(
        CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH / 4,
        CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH / 1.2
      );
      gradient.addColorStop(0, 'rgba(0,0,0,0)');
      gradient.addColorStop(1, 'rgba(0,0,0,0.4)');
      mainCtx.fillStyle = gradient;
      mainCtx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    // Static Noise
    if (Math.random() > 0.9) {
      mainCtx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.02})`;
      mainCtx.fillRect(Math.random() * CANVAS_WIDTH, Math.random() * CANVAS_HEIGHT, 2, 2);
    }

    mainCtx.restore(); // Close the save from CA/Distortion
  };

  const loop = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');

    const now = Date.now();
    const elapsed = now - lastTimeRef.current;
    lastTimeRef.current = now;
    const boundedElapsed = Math.max(1, Math.min(1000, elapsed));
    // Normalize to 60fps (16.67ms per frame)
    dtRef.current = Math.min(2.0, boundedElapsed / (1000 / 60));

    frameTimeSamplesMs.current.push(boundedElapsed);
    fpsSamples.current.push(1000 / boundedElapsed);
    if (frameTimeSamplesMs.current.length > 240) frameTimeSamplesMs.current.shift();
    if (fpsSamples.current.length > 240) fpsSamples.current.shift();

    if (now - lastPerfUiUpdateAt.current >= 500) {
      lastPerfUiUpdateAt.current = now;
      const aliveEnemies = enemies.current.reduce((count, enemy) => count + (enemy.alive ? 1 : 0), 0);
      setPerfStats({
        fpsP50: getPercentile(fpsSamples.current, 50),
        fpsP95: getPercentile(fpsSamples.current, 95),
        frameMsP50: getPercentile(frameTimeSamplesMs.current, 50),
        frameMsP95: getPercentile(frameTimeSamplesMs.current, 95),
        enemies: aliveEnemies,
        bullets: bullets.current.length,
        enemyBullets: enemyBullets.current.length,
        particles: particles.current.length,
      });
    }

    if (ctx) {
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
    }
  }, [score]);

  return (
    <div className="min-h-screen bg-[#020205] text-white flex flex-col items-center justify-center font-mono overflow-hidden">
      <GameHud
        level={level}
        xp={xp}
        xpToNextLevel={xpToNextLevel}
        sectorName={sectorName}
        score={score}
        wingmanActive={wingmanRef.current}
        integrity={integrity}
        overdrive={overdrive}
        maxOverdrive={MAX_OVERDRIVE}
        isOverdriveActive={isOverdriveActive}
        survivalTime={survivalTime}
      />

      {/* Game Canvas Container with Ambient Glow and Scanlines */}
      <div className="relative border-4 md:border-8 border-[#1a1a2e] rounded-xl shadow-[0_0_80px_rgba(0,255,204,0.15)] overflow-hidden max-w-[95vw] max-h-[70vh] aspect-3/4 group">
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

        {/* Dev: God Mode badge */}
        {import.meta.env.DEV && godMode && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-30 px-3 py-0.5 bg-yellow-400/20 border border-yellow-400/60 rounded-full pointer-events-none">
            <span className="text-[9px] font-black text-yellow-300 uppercase tracking-widest">★ GOD MODE [G]</span>
          </div>
        )}

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

        {gameState === 'PLAYING' && (
          <div className="absolute bottom-4 right-4 pointer-events-none bg-black/65 border border-[#00ffcc]/30 rounded px-2 py-1.5 text-[9px] leading-tight text-[#bfffee] font-mono z-30">
            <div className="text-[8px] text-[#00ffcc] uppercase tracking-widest mb-1">Perf_Baseline</div>
            <div>FPS p50 {perfStats.fpsP50.toFixed(1)} | p95 {perfStats.fpsP95.toFixed(1)}</div>
            <div>Frame p50 {perfStats.frameMsP50.toFixed(2)}ms | p95 {perfStats.frameMsP95.toFixed(2)}ms</div>
            <div>Obj E:{perfStats.enemies} PB:{perfStats.bullets} EB:{perfStats.enemyBullets} P:{perfStats.particles}</div>
          </div>
        )}

        {/* Survival Timer (Stage 2) */}
        <AnimatePresence>
          {Math.min(5, Math.ceil(wave / 2)) === 2 && gameState === 'PLAYING' && !isWarping.current && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute top-4 right-4 flex flex-col items-end gap-1"
            >
              <span className="text-[8px] text-[#00ffcc] font-bold uppercase tracking-widest">Survival_Protocol</span>
              <div className="text-2xl font-black italic text-white drop-shadow-[0_0_10px_rgba(0,255,204,0.5)]">
                {survivalTime}s
              </div>
              <div className="w-24 h-1 bg-white/10 rounded-full overflow-hidden">
                <motion.div
                  animate={{ width: `${(survivalTime / 45) * 100}%` }}
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
          {showUpgrade && (
            <motion.div
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

          {waveTitle && <StageTitleOverlay wave={wave} sectorName={sectorName} />}

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

          {gameState === 'VICTORY' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-50 p-8 text-center"
            >
              <motion.div
                animate={{
                  textShadow: ["0 0 20px #00ffcc", "0 0 40px #00ffcc", "0 0 20px #00ffcc"],
                  scale: [1, 1.1, 1]
                }}
                transition={{ duration: 2, repeat: Infinity }}
                className="text-6xl font-bold text-[#00ffcc] mb-4 tracking-widest"
              >
                MISSION COMPLETE
              </motion.div>
              <div className="text-2xl text-white mb-8">
                The Core has been neutralized. The galaxy is safe.
              </div>
              <div className="bg-[#00ffcc]/10 border border-[#00ffcc]/30 p-6 rounded-xl mb-8 w-full max-w-md">
                <div className="flex justify-between mb-2">
                  <span className="text-[#00ffcc]/70">FINAL SCORE</span>
                  <span className="text-2xl font-bold text-white">{score}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#00ffcc]/70">SECTORS CLEARED</span>
                  <span className="text-2xl font-bold text-white">{waveRef.current}</span>
                </div>
              </div>
              <button
                onClick={startGame}
                className="px-12 py-4 bg-transparent border-2 border-[#00ffcc] text-[#00ffcc] rounded-full text-xl font-bold hover:bg-[#00ffcc] hover:text-black transition-all shadow-[0_0_20px_rgba(0,255,204,0.3)]"
              >
                NEW MISSION
              </button>
            </motion.div>
          )}

          {gameState === 'GAME_OVER' && (
            <motion.div
              key="game-over-screen"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center p-8 text-center z-100"
            >
              <Trophy size={64} className="text-[#ffcc00] mb-6 drop-shadow-[0_0_20px_rgba(255,204,0,0.3)]" />
              <h2 className="text-5xl font-black mb-2 text-[#ff3366] tracking-tighter">MISSION FAILED</h2>
              <p className="text-gray-400 mb-10 uppercase tracking-[0.2em]">Final Score: <span className="text-white font-bold">{score}</span></p>
              <button
                onClick={startGame}
                className="flex items-center gap-3 px-10 py-5 border-2 border-[#00ffcc] text-[#00ffcc] font-bold text-xl uppercase tracking-[0.2em] hover:bg-[#00ffcc] hover:text-black transition-all duration-300 shadow-[0_0_30px_rgba(0,255,204,0.2)]"
              >
                <RotateCcw size={24} /> Re-Engage
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer & Fullscreen */}
      <div className="mt-8 text-[9px] text-gray-700 uppercase tracking-[0.5em] flex items-center gap-4">
        <span>Arcade Revision 2.5</span>
        <span className="w-1 h-1 bg-gray-800 rounded-full" />
        <button
          onClick={toggleFullscreen}
          className="hover:text-white transition-colors flex items-center gap-1"
        >
          <Maximize2 size={10} />
          <span>{isFullscreen ? "Exit Full" : "Fullscreen"}</span>
        </button>
      </div>
    </div>
  );
}
