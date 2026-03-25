/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Rocket, Trophy, Play, RotateCcw, Loader2, Zap, Maximize2 } from 'lucide-react';
import { generateGameAssets } from './services/assetGenerator';
import { audio } from './services/audio';

// --- Constants ---
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 800;
const PLAYER_WIDTH = 50;
const PLAYER_HEIGHT = 50;
const PLAYER_SPEED = 3.5;
const FOLLOW_SMOOTHNESS = 0.15;
const GRAZE_DISTANCE = 40;
const MAX_OVERDRIVE = 100;
const BULLET_SPEED = 5;
const ENEMY_DIVE_SPEED = 1.8;
const ENEMY_BULLET_SPEED = 2.2;
const ENEMY_ROWS = 5;
const ENEMY_COLS = 8;
const ENEMY_SPACING = 55;

type GameState = 'LOADING' | 'START' | 'PLAYING' | 'GAME_OVER' | 'VICTORY' | 'STAGE_CLEAR';

interface Bullet {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  damage?: number;
  size?: number;
}

interface Enemy {
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
  diveType?: 'normal' | 'uturn' | 'zigzag' | 'sweep' | 'spread' | 'loop' | 'chase';
  turnY?: number;
  diveTime?: number;
  diveStartX?: number;
  diveStartY?: number;
  isBoss?: boolean;
  health?: number;
  maxHealth?: number;
  phase?: number;
  moveDir?: number;
  lastShotTime?: number;
  isTurret?: boolean;
  isFinalBoss?: boolean;
  tractorBeamTimer?: number;
  isTractorBeaming?: boolean;
  // Entry path properties
  state: 'ENTERING' | 'IN_FORMATION' | 'DIVING' | 'RETURNING';
  path?: { x: number, y: number }[];
  pathIndex?: number;
  entryDelay?: number;
  prevX?: number;
  prevY?: number;
}

interface Particle {
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
}

interface Trail {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  color: string;
  width: number;
}

const NeonShip = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="glow">
        <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
        <feMerge>
          <feMergeNode in="coloredBlur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    {/* Wings */}
    <path d="M50 20 L85 75 L50 65 L15 75 Z" stroke="#00ffcc" strokeWidth="3" filter="url(#glow)" strokeLinejoin="round" />
    {/* Cockpit */}
    <path d="M50 35 L65 60 L50 55 L35 60 Z" stroke="#33ccff" strokeWidth="2" filter="url(#glow)" strokeLinejoin="round" />
    {/* Engine Glow */}
    <circle cx="50" cy="70" r="8" fill="#ff3366" filter="url(#glow)" opacity="0.6">
      <animate attributeName="r" values="6;10;6" dur="0.2s" repeatCount="indefinite" />
      <animate attributeName="opacity" values="0.4;0.8;0.4" dur="0.2s" repeatCount="indefinite" />
    </circle>
  </svg>
);

interface PowerUp {
  x: number;
  y: number;
  type: 'MULTISHOT' | 'SHIELD' | 'RAPIDFIRE';
  life: number;
}

interface Scrap {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

interface Asteroid {
  x: number;
  y: number;
  size: number;
  speed: number;
  rotation: number;
  vr: number;
  hp: number;
  vertices: number[];
}

interface Obstacle {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'BUILDING' | 'WALL' | 'PILLAR';
  hp: number;
  maxHp: number;
  color: string;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('LOADING');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [wave, setWave] = useState(1);
  const [sectorName, setSectorName] = useState('Outer Rim');
  const [distance, setDistance] = useState(25000);
  const [scrapCount, setScrapCount] = useState(0);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeOptions, setUpgradeOptions] = useState<{id: string, label: string, desc: string}[]>([]);
  const [assets, setAssets] = useState<Record<string, HTMLImageElement>>({});
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [hasWingman, setHasWingman] = useState(false);
  const wingmanRef = useRef(false);
  const wingmanPos = useRef({ x: 0, y: 0 });

  // Game state refs for the loop
  const livesRef = useRef(3);
  const waveRef = useRef(1);
  const invulnerableUntil = useRef(0);
  const playerPos = useRef({ x: CANVAS_WIDTH / 2 - PLAYER_WIDTH / 2, y: CANVAS_HEIGHT - 80 });
  const targetPos = useRef({ x: CANVAS_WIDTH / 2 - PLAYER_WIDTH / 2, y: CANVAS_HEIGHT - 80 });
  const playerTilt = useRef(0);
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
  const particles = useRef<Particle[]>([]);
  const trails = useRef<Trail[]>([]);
  const shake = useRef(0);
  const flash = useRef(0);
  const glitch = useRef(0);
  const offscreenCanvas = useRef<HTMLCanvasElement | null>(null);
  const offscreenCtx = useRef<CanvasRenderingContext2D | null>(null);
  const keysPressed = useRef<Record<string, boolean>>({});
  const lastShotTime = useRef(0);
  const lastDiveTime = useRef(0);
  const requestRef = useRef<number>(null);
  const comboRef = useRef(0);
  const lastHitTime = useRef(0);
  const stars = useRef<{x: number, y: number, size: number, speed: number, opacity: number}[]>([]);
  const [combo, setCombo] = useState(0);
  const [waveTitle, setWaveTitle] = useState(false);
  const [bossHealth, setBossHealth] = useState<{current: number, max: number} | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Touch Movement Refs
  const touchStartPos = useRef({ x: 0, y: 0 });
  const playerStartPos = useRef({ x: 0, y: 0 });
  const isTouching = useRef(false);
  const touchPoints = useRef<Record<number, { x: number, y: number }>>({});
  const lastTapTime = useRef(0);
  const [touchFeedback, setTouchFeedback] = useState<{ x: number, y: number } | null>(null);

  // Power-up & Overdrive State
  const powerUps = useRef<PowerUp[]>([]);
  const activeEffects = useRef<Record<string, number>>({});
  const overdriveGauge = useRef(0);
  const [overdrive, setOverdrive] = useState(0);
  const isOverdriveActive = useRef(false);
  const overdriveEndTime = useRef(0);
  const pauseStartTime = useRef(0);

  // Warp Transition State
  const isWarping = useRef(false);
  const scraps = useRef<Scrap[]>([]);
  const asteroids = useRef<Asteroid[]>([]);
  const obstacles = useRef<Obstacle[]>([]);
  const lastObstacleTime = useRef(0);
  const obstaclePattern = useRef(0);
  const warpFactor = useRef(0);
  const warpStartTime = useRef(0);
  const isHackedRef = useRef(false);

  // Initialize stars and offscreen canvas
  useEffect(() => {
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

  const getSectorName = (w: number) => {
    if (w <= 5) return "Outer Rim";
    if (w <= 10) return "Asteroid Belt";
    if (w <= 15) return "Nebula Pass";
    if (w <= 20) return "Fortress Gates";
    return "The Core";
  };

  const createExplosion = (x: number, y: number, color: string, count: number) => {
    for (let i = 0; i < count; i++) {
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
    if (Date.now() < invulnerableUntil.current) return;
    
    const newLives = livesRef.current - 1;
    livesRef.current = newLives;
    setLives(newLives);
    
    // Lose wingman on hit
    if (wingmanRef.current) {
      setHasWingman(false);
      wingmanRef.current = false;
      createExplosion(wingmanPos.current.x + PLAYER_WIDTH / 2, wingmanPos.current.y + PLAYER_HEIGHT / 2, '#ff33cc', 30);
    }
    
    isHackedRef.current = false; // Clear hacked state on hit
    
    if (newLives <= 0) {
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

  // Initialize enemies
  const initEnemies = (waveNum: number) => {
    const newEnemies: Enemy[] = [];
    const stage = Math.min(5, Math.ceil(waveNum / 2));
    const isBossWave = waveNum === 6 || waveNum === 10;
    
    const createEnemy = (x: number, y: number, type: number, delay: number = 0, path?: {x: number, y: number}[]): Enemy => ({
      x: path ? path[0].x : x, 
      y: path ? path[0].y : y, 
      width: 35, height: 35, alive: true, type,
      isDiving: false, isReturning: false, diveX: 0, diveY: 0,
      originX: x, originY: y, diveType: 'normal', turnY: 0,
      diveTime: 0, diveStartX: 0, diveStartY: 0,
      state: path ? 'ENTERING' : 'IN_FORMATION',
      path: path,
      pathIndex: 0,
      entryDelay: delay
    });

    if (isBossWave) {
      audio.playBossWarning();
      if (waveNum === 6) {
        // Mid-Boss: Tractor Carrier
        const boss: Enemy = {
          ...createEnemy(CANVAS_WIDTH / 2 - 50, 80, 1),
          width: 120, height: 90, isBoss: true, health: 1000, maxHealth: 1000,
          phase: 1, moveDir: 1, lastShotTime: 0,
          tractorBeamTimer: 0, isTractorBeaming: false
        };
        newEnemies.push(boss);
        setBossHealth({ current: 1000, max: 1000 });
      } else if (waveNum === 10) {
        // Final Boss: The Core
        const boss: Enemy = {
          ...createEnemy(CANVAS_WIDTH / 2 - 90, 80, 2),
          width: 180, height: 150, isBoss: true, isFinalBoss: true, health: 3000, maxHealth: 3000,
          phase: 1, moveDir: 1, lastShotTime: 0
        };
        newEnemies.push(boss);
        setBossHealth({ current: 3000, max: 3000 });
      }
    } else {
      // Normal Waves
      if (stage === 1) {
        // Tutorial: Scouts only
        for (let i = 0; i < 10 + (waveNum % 2) * 5; i++) {
          newEnemies.push(createEnemy(80 + (i % 5) * 100, 60 + Math.floor(i / 5) * 80, 0));
        }
      } else if (stage === 2) {
        // Asteroid Belt: Scouts
        for (let i = 0; i < 12; i++) {
          newEnemies.push(createEnemy(100 + (i % 4) * 120, 60 + Math.floor(i / 4) * 80, 0));
        }
      } else if (stage === 3) {
        // Heavy Fire: Snipers + Turrets
        for (let i = 0; i < 10; i++) {
          newEnemies.push(createEnemy(50 + (i % 5) * 120, 60 + Math.floor(i / 5) * 60, 1));
        }
        // Add some turrets
        for (let i = 0; i < 3; i++) {
          const turret = createEnemy(100 + i * 150, 200, 1);
          turret.isTurret = true;
          turret.width = 50;
          turret.height = 50;
          turret.health = 50;
          newEnemies.push(turret);
        }
      } else if (stage === 4) {
        // Chase: Fast scouts from sides and bottom
        for (let i = 0; i < 15; i++) {
          const side = Math.floor(Math.random() * 3); // 0: left, 1: right, 2: bottom
          let x = 0, y = 0;
          let diveX = 0, diveY = 0;
          if (side === 0) { 
            x = -50; y = Math.random() * CANVAS_HEIGHT; 
            diveX = 5; diveY = (Math.random() - 0.5) * 2;
          } else if (side === 1) { 
            x = CANVAS_WIDTH + 50; y = Math.random() * CANVAS_HEIGHT; 
            diveX = -5; diveY = (Math.random() - 0.5) * 2;
          } else { 
            x = Math.random() * CANVAS_WIDTH; y = CANVAS_HEIGHT + 50; 
            diveX = (Math.random() - 0.5) * 2; diveY = -5;
          }
          const enemy = createEnemy(x, y, 2);
          enemy.state = 'DIVING';
          enemy.isDiving = true;
          enemy.diveX = diveX;
          enemy.diveY = diveY;
          enemy.diveType = 'chase';
          newEnemies.push(enemy);
        }
      } else if (stage === 5) {
        // Final Front: Mixed
        for (let i = 0; i < 20; i++) {
          newEnemies.push(createEnemy(50 + (i % 5) * 120, 60 + Math.floor(i / 5) * 60, i % 3));
        }
      }
    }

    enemies.current = newEnemies;
  };

  const handleUpgrade = (id: string) => {
    if (id === 'firepower') {
      firepowerRef.current += 1;
    } else if (id === 'speed') {
      speedRef.current += 1;
    } else if (id === 'shield') {
      setLives(prev => Math.min(5, prev + 1));
      livesRef.current = Math.min(5, livesRef.current + 1);
    } else if (id === 'magnet') {
      magnetRef.current += 1;
    }
    
    // Resume overdrive timer if active
    if (isOverdriveActive.current) {
      overdriveEndTime.current += (Date.now() - pauseStartTime.current);
    }
    
    setShowUpgrade(false);
    
    waveRef.current += 1;
    setWave(waveRef.current);
    
    const stage = Math.min(5, Math.ceil(waveRef.current / 2));
    const sector = ((waveRef.current - 1) % 2) + 1;
    const stageNames = ["Tutorial", "Asteroid Belt", "Heavy Fire", "Chase", "Final Front"];
    setSectorName(`${stageNames[stage - 1]} - SECTOR ${sector}`);
    
    setDistance(prev => Math.max(0, prev - 1000));
    initEnemies(waveRef.current);
    
    setWaveTitle(true);
    audio.playStageStart();
    setTimeout(() => setWaveTitle(false), 2000);
    
    setTimeout(() => {
      isWarping.current = false;
    }, 1000);
  };

  const startGame = () => {
    audio.init();
    audio.playBGM();
    setScore(0);
    setLives(3);
    setWave(1);
    setSectorName('Tutorial - SECTOR 1');
    setDistance(25000);
    setScrapCount(0);
    setShowUpgrade(false);
    setBossHealth(null);
    firepowerRef.current = 1;
    speedRef.current = 1;
    magnetRef.current = 1;
    livesRef.current = 3;
    waveRef.current = 1;
    setHasWingman(false);
    wingmanRef.current = false;
    isHackedRef.current = false;
    invulnerableUntil.current = 0;
    playerPos.current = { x: CANVAS_WIDTH / 2 - PLAYER_WIDTH / 2, y: CANVAS_HEIGHT - 80 };
    bullets.current = [];
    enemyBullets.current = [];
    particles.current = [];
    trails.current = [];
    scraps.current = [];
    asteroids.current = [];
    obstacles.current = [];
    lastObstacleTime.current = 0;
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
      const isDoubleTap = now - lastTapTime.current < 300;
      lastTapTime.current = now;

      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        touchPoints.current[touch.identifier] = { x: touch.clientX, y: touch.clientY };
      }

      // Two-finger tap for Overdrive
      if (e.touches.length >= 2) {
        if (overdriveGauge.current >= MAX_OVERDRIVE && !isOverdriveActive.current) {
          activateOverdrive();
        }
      }

      const touch = e.touches[0];
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const x = ((touch.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
        const y = ((touch.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;
        setTouchFeedback({ x, y });
      }

      touchStartPos.current = { x: touch.clientX, y: touch.clientY };
      playerStartPos.current = { x: targetPos.current.x, y: targetPos.current.y };
      isTouching.current = true;
      keysPressed.current['TouchFire'] = true;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isTouching.current || showUpgrade) return;
      e.preventDefault();
      
      const touch = e.touches[0];
      const dx = (touch.clientX - touchStartPos.current.x) * 1.2;
      const dy = (touch.clientY - touchStartPos.current.y) * 1.2;

      targetPos.current.x = Math.max(0, Math.min(CANVAS_WIDTH - PLAYER_WIDTH, playerStartPos.current.x + dx));
      targetPos.current.y = Math.max(CANVAS_HEIGHT * 0.2, Math.min(CANVAS_HEIGHT - PLAYER_HEIGHT - 20, playerStartPos.current.y + dy));
      
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const x = ((touch.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
        const y = ((touch.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;
        setTouchFeedback({ x, y });
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        delete touchPoints.current[e.changedTouches[i].identifier];
      }
      if (e.touches.length === 0) {
        isTouching.current = false;
        keysPressed.current['TouchFire'] = false;
        setTouchFeedback(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown, { passive: false });
    window.addEventListener('keyup', handleKeyUp, { passive: false });
    
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', handleTouchEnd);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (canvas) {
        canvas.removeEventListener('touchstart', handleTouchStart);
        window.removeEventListener('touchmove', handleTouchMove);
        window.removeEventListener('touchend', handleTouchEnd);
      }
    };
  }, [gameState, showUpgrade]);

  const handleGraze = (x: number, y: number) => {
    if (Date.now() % 5 !== 0) return; // Throttling
    audio.playGraze();
    grazeCount.current++;
    setScore(s => s + 10);
    
    // Boost overdrive
    if (!isOverdriveActive.current) {
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
    isOverdriveActive.current = true;
    overdriveEndTime.current = Date.now() + 10000;
    shake.current = 30;
    flash.current = 0.5;
    audio.playOverdrive();
  };

  // Game Loop
  const update = () => {
    if (gameState !== 'PLAYING' || showUpgrade) return;

    // Apply slow-mo recovery
    if (timeScale.current < 1.0) {
      timeScale.current = Math.min(1.0, timeScale.current + 0.005);
    }

    // Wingman Logic
    if (wingmanRef.current) {
      const wingmanTargetX = playerPos.current.x + 50;
      const wingmanTargetY = playerPos.current.y + 10;
      
      // Smooth follow
      const wdx = wingmanTargetX - wingmanPos.current.x;
      const wdy = wingmanTargetY - wingmanPos.current.y;
      wingmanPos.current.x += wdx * 0.1;
      wingmanPos.current.y += wdy * 0.1;

      // Wingman firing
      if (keysPressed.current['Space'] || keysPressed.current['TouchFire']) {
        const now = Date.now();
        if (now - lastShotTime.current > (isOverdriveActive.current ? 75 : 150)) {
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
    const currentSpeed = (isOverdriveActive.current ? PLAYER_SPEED * 1.5 : PLAYER_SPEED) * speedMultiplier;

    if (keysPressed.current['ArrowLeft'] || keysPressed.current['KeyA'] || keysPressed.current['TouchLeft']) {
      targetPos.current.x = Math.max(0, targetPos.current.x - currentSpeed);
    }
    if (keysPressed.current['ArrowRight'] || keysPressed.current['KeyD'] || keysPressed.current['TouchRight']) {
      targetPos.current.x = Math.min(CANVAS_WIDTH - PLAYER_WIDTH, targetPos.current.x + currentSpeed);
    }
    if (keysPressed.current['ArrowUp'] || keysPressed.current['KeyW'] || keysPressed.current['TouchUp']) {
      targetPos.current.y = Math.max(CANVAS_HEIGHT * 0.2, targetPos.current.y - currentSpeed);
    }
    if (keysPressed.current['ArrowDown'] || keysPressed.current['KeyS'] || keysPressed.current['TouchDown']) {
      targetPos.current.y = Math.min(CANVAS_HEIGHT - PLAYER_HEIGHT - 20, targetPos.current.y + currentSpeed);
    }

    // Lerp player position
    const prevX = playerPos.current.x;
    playerPos.current.x += (targetPos.current.x - playerPos.current.x) * FOLLOW_SMOOTHNESS;
    playerPos.current.y += (targetPos.current.y - playerPos.current.y) * FOLLOW_SMOOTHNESS;

    // Calculate Tilt
    const dx = playerPos.current.x - prevX;
    playerTilt.current = dx * 0.15;

    let isMoving = Math.abs(dx) > 0.1 || Math.abs(playerPos.current.y - targetPos.current.y) > 0.1;

    // Add trail
    if (isMoving && Date.now() % 3 === 0) {
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
    trails.current.forEach(t => t.life -= 1);
    trails.current = trails.current.filter(t => t.life > 0);

    // Update Power-ups
    powerUps.current.forEach(p => {
      p.y += 1.5;
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
    });
    powerUps.current = powerUps.current.filter(p => p.y < CANVAS_HEIGHT && p.life > 0);

    // Update Scraps
    scraps.current.forEach(s => {
      const dx = (playerPos.current.x + PLAYER_WIDTH / 2) - s.x;
      const dy = (playerPos.current.y + PLAYER_HEIGHT / 2) - s.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      const magnetRange = 150 + (magnetRef.current - 1) * 60;
      if (dist < magnetRange) {
        // Magnet effect
        const pullStrength = 0.5 + (magnetRef.current - 1) * 0.2;
        s.vx += (dx / dist) * pullStrength;
        s.vy += (dy / dist) * pullStrength;
      }
      
      s.x += s.vx;
      s.y += s.vy;
      s.vx *= 0.95;
      s.vy *= 0.95;
      s.y += 1; // Drift down
      
      if (dist < 30) {
        setScrapCount(prev => prev + 1);
        s.life = 0;
        setScore(prev => prev + 10);
      }
    });
    scraps.current = scraps.current.filter(s => s.y < CANVAS_HEIGHT && s.life > 0);

    // Update Asteroids
    const currentStage = Math.min(5, Math.ceil(waveRef.current / 2));
    const isAsteroidBelt = currentStage === 2;
    if (isAsteroidBelt && !isWarping.current && Math.random() < 0.02) {
      const size = isAsteroidBelt ? Math.random() * 80 + 60 : Math.random() * 40 + 20;
      const vertices = [];
      for (let i = 0; i < 8; i++) {
        vertices.push(0.8 + Math.random() * 0.4);
      }
      asteroids.current.push({
        x: Math.random() * CANVAS_WIDTH,
        y: -150,
        size: size,
        speed: Math.random() * 2 + 1,
        rotation: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.05,
        hp: isAsteroidBelt ? 9999 : 3, // Indestructible in belt
        vertices: vertices
      });
    }
    
    asteroids.current.forEach(a => {
      a.y += a.speed;
      a.rotation += a.vr;
      
      // Collision with player
      const dx = (playerPos.current.x + PLAYER_WIDTH / 2) - a.x;
      const dy = (playerPos.current.y + PLAYER_HEIGHT / 2) - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < a.size * 0.8 && Date.now() > invulnerableUntil.current) {
        handlePlayerHit();
        if (!isAsteroidBelt) a.hp = 0; // Destroy asteroid if not in belt
      }
      
      // Collision with wingman
      if (wingmanRef.current) {
        const wdx = (wingmanPos.current.x + PLAYER_WIDTH / 2) - a.x;
        const wdy = (wingmanPos.current.y + PLAYER_HEIGHT / 2) - a.y;
        const wdist = Math.sqrt(wdx * wdx + wdy * wdy);
        if (wdist < a.size * 0.8) {
          setHasWingman(false);
          wingmanRef.current = false;
          createExplosion(wingmanPos.current.x + PLAYER_WIDTH / 2, wingmanPos.current.y + PLAYER_HEIGHT / 2, '#ff33cc', 30);
          audio.playExplosion(wingmanPos.current.x);
          if (!isAsteroidBelt) a.hp = 0;
        }
      }
      
      // Collision with bullets
      bullets.current.forEach(b => {
        const bdx = b.x - a.x;
        const bdy = b.y - a.y;
        const bdist = Math.sqrt(bdx * bdx + bdy * bdy);
        if (bdist < a.size) {
          if (!isAsteroidBelt) a.hp -= (b.damage || 1);
          b.y = -100; // Remove bullet
          if (a.hp <= 0 && !isAsteroidBelt) {
            audio.playExplosion(a.x);
            createExplosion(a.x, a.y, '#888888', 10);
            setScore(s => s + 50);
          }
        }
      });
    });
    asteroids.current = asteroids.current.filter(a => a.y < CANVAS_HEIGHT + 100 && a.hp > 0);

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
    if (isOverdriveActive.current) {
      if (Date.now() > overdriveEndTime.current) {
        isOverdriveActive.current = false;
        overdriveGauge.current = 0;
        setOverdrive(0);
      } else {
        const remaining = (overdriveEndTime.current - Date.now()) / 10000;
        setOverdrive(remaining * 100);
      }
    } else {
      if (keysPressed.current['KeyX'] || keysPressed.current['TouchOverdrive']) {
        if (overdriveGauge.current >= 100) {
          isOverdriveActive.current = true;
          overdriveEndTime.current = Date.now() + 10000; // 10 seconds
          shake.current = 30;
          flash.current = 0.5;
          audio.playOverdrive();
        }
      }
    }

    // Update shake & flash
    if (shake.current > 0) shake.current *= 0.85;
    if (shake.current < 0.5) shake.current = 0;
    if (flash.current > 0) flash.current -= 0.05;
    if (flash.current < 0) flash.current = 0;

    // Shooting
    const isRapid = (activeEffects.current['RAPIDFIRE'] > Date.now()) || isOverdriveActive.current;
    const shootInterval = isOverdriveActive.current ? 80 : isRapid ? 120 : 250;
    
    if (keysPressed.current['Space'] || keysPressed.current['TouchFire']) {
      const now = Date.now();
      if (now - lastShotTime.current > shootInterval) {
        const isMulti = activeEffects.current['MULTISHOT'] > Date.now();
        const isOver = isOverdriveActive.current;
        const bulletDamage = 1 + (firepowerRef.current - 1) * 0.5;
        const bulletSize = 4 + (firepowerRef.current - 1) * 2;

        if (isOver) {
          // Super Overdrive Shot
          for (let i = -2; i <= 2; i++) {
            bullets.current.push({
              x: playerPos.current.x + PLAYER_WIDTH / 2 - bulletSize / 2 + i * 15,
              y: playerPos.current.y,
              vx: i * 0.5,
              vy: -BULLET_SPEED * 1.5,
              damage: bulletDamage * 2,
              size: bulletSize * 1.5
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
    bullets.current = bullets.current
      .map((b) => ({ 
        ...b, 
        x: b.x + (b.vx || 0) * timeScale.current,
        y: b.y + (b.vy || -BULLET_SPEED) * timeScale.current
      }))
      .filter((b) => b.y > -20 && b.y < CANVAS_HEIGHT + 20);

    // Update enemy bullets
    const currentEnemyBulletSpeed = (ENEMY_BULLET_SPEED + waveRef.current * 0.2) * timeScale.current;
    enemyBullets.current = enemyBullets.current
      .map((b) => {
        let vx = b.vx || 0;
        let vy = b.vy || currentEnemyBulletSpeed;

        if (b.isHoming) {
          const dx = (playerPos.current.x + PLAYER_WIDTH / 2) - b.x;
          const dy = (playerPos.current.y + PLAYER_HEIGHT / 2) - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          vx += (dx / dist) * 0.1;
          vy += (dy / dist) * 0.1;
          
          // Cap speed
          const speed = Math.sqrt(vx * vx + vy * vy);
          if (speed > 4) {
            vx = (vx / speed) * 4;
            vy = (vy / speed) * 4;
          }
        }

        return {
          ...b,
          vx,
          vy,
          x: b.x + vx * timeScale.current,
          y: b.y + vy
        };
      })
      .filter((b) => b.y < CANVAS_HEIGHT + 20 && b.x > -20 && b.x < CANVAS_WIDTH + 20);

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
        
        // Normalize and multiply by speed
        const vx = (dx / distance) * currentEnemyBulletSpeed;
        const vy = (dy / distance) * currentEnemyBulletSpeed;

        enemyBullets.current.push({
          x: shooter.x + shooter.width / 2 - 2,
          y: shooter.y + shooter.height,
          vx,
          vy
        });
        audio.playEnemyShoot(shooter.x + shooter.width / 2);
      }
    }

    // Update enemies formation
    const currentEnemyDiveSpeed = (ENEMY_DIVE_SPEED + waveRef.current * 0.2) * timeScale.current;
    const formationOffset = (Math.sin(Date.now() / 1200) * 60);
    
    enemies.current.forEach((enemy) => {
      if (!enemy.alive) return;
      
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
          enemy.x += (dx / dist) * 8;
          enemy.y += (dy / dist) * 8;
        }
        return;
      }

      // Boss Logic
      if (enemy.isBoss) {
        const stage = Math.min(5, Math.ceil(waveRef.current / 2));
        
        if (enemy.y < enemy.originY) {
          enemy.y += 1; // Entry
        } else {
          // Horizontal movement
          let moveSpeed = stage === 4 ? 4 : 1.5; // Speed Demon is faster
          
          // Final Boss Phase 3 Dash
          if (stage === 5 && enemy.phase === 3) {
            const now = Date.now();
            if (!enemy.diveStartX) {
              enemy.diveStartX = now; // Use as timer
            }
            const dashTime = now - enemy.diveStartX;
            if (dashTime < 1000) {
              moveSpeed = 0; // Stop and aim
              enemy.diveX = playerPos.current.x - enemy.width / 2;
            } else if (dashTime < 1500) {
              enemy.y += 15; // Dash down
              enemy.x += (enemy.diveX - enemy.x) * 0.1;
            } else if (dashTime < 2500) {
              enemy.y -= 5; // Return
            } else {
              enemy.diveStartX = 0; // Reset
              enemy.y = enemy.originY;
            }
          } else {
            enemy.x += (enemy.moveDir || 1) * moveSpeed;
            if (enemy.x < 50 || enemy.x > CANVAS_WIDTH - enemy.width - 50) {
              enemy.moveDir = (enemy.moveDir || 1) * -1;
            }
          }

          // Phase logic
          if (enemy.health! < enemy.maxHealth! * 0.3) enemy.phase = 3;
          else if (enemy.health! < enemy.maxHealth! * 0.6) enemy.phase = 2;

          // Boss shooting
          const now = Date.now();
          let shootInterval = enemy.phase === 3 ? 600 : enemy.phase === 2 ? 1000 : 1500;
          if (stage === 5) shootInterval *= 0.7; // Final boss fires faster
          
          if (stage === 3) {
            // Mid-Boss Tractor Beam Logic
            if (!enemy.isTractorBeaming) {
              if (now - (enemy.tractorBeamTimer || 0) > 5000) {
                enemy.isTractorBeaming = true;
                enemy.tractorBeamTimer = now;
              }
            } else {
              if (now - (enemy.tractorBeamTimer || 0) > 2000) {
                enemy.isTractorBeaming = false;
                enemy.tractorBeamTimer = now;
              } else {
                // Check collision with player
                const beamWidth = 80;
                const beamX = enemy.x + enemy.width / 2 - beamWidth / 2;
                const beamY = enemy.y + enemy.height;
                const beamHeight = CANVAS_HEIGHT;
                
                const px = playerPos.current.x;
                const py = playerPos.current.y;
                
                if (px < beamX + beamWidth && px + PLAYER_WIDTH > beamX &&
                    py < beamY + beamHeight && py + PLAYER_HEIGHT > beamY) {
                  isHackedRef.current = true;
                }
              }
            }
          }
          
          if (now - (enemy.lastShotTime || 0) > shootInterval) {
            enemy.lastShotTime = now;
            audio.playEnemyShoot(enemy.x + enemy.width / 2);

            if (stage === 3) {
              // Mid-Boss: Tractor Carrier
              // Fires simple aimed shots while not tractor beaming
              if (!enemy.isTractorBeaming) {
                const dx = (playerPos.current.x + PLAYER_WIDTH / 2) - (enemy.x + enemy.width / 2);
                const dy = playerPos.current.y - (enemy.y + enemy.height);
                const dist = Math.sqrt(dx * dx + dy * dy);
                for (let i = -1; i <= 1; i++) {
                  enemyBullets.current.push({
                    x: enemy.x + enemy.width / 2,
                    y: enemy.y + enemy.height,
                    vx: (dx / dist) * 4 + i * 0.5,
                    vy: (dy / dist) * 4
                  });
                }
              }
            } else if (stage === 5) {
              // The Core: Multi-phase Bullet Hell
              if (enemy.phase === 1) {
                // Normal aimed spread
                const dx = (playerPos.current.x + PLAYER_WIDTH / 2) - (enemy.x + enemy.width / 2);
                const dy = playerPos.current.y - (enemy.y + enemy.height);
                const dist = Math.sqrt(dx * dx + dy * dy);
                for (let i = -2; i <= 2; i++) {
                  enemyBullets.current.push({
                    x: enemy.x + enemy.width / 2,
                    y: enemy.y + enemy.height,
                    vx: (dx / dist) * 3 + i * 0.5,
                    vy: (dy / dist) * 3
                  });
                }
              } else if (enemy.phase === 2) {
                // Spiral
                for (let i = 0; i < 4; i++) {
                  const angle = (now / 200) + (i * Math.PI / 2);
                  enemyBullets.current.push({
                    x: enemy.x + enemy.width / 2,
                    y: enemy.y + enemy.height / 2,
                    vx: Math.cos(angle) * 3,
                    vy: Math.sin(angle) * 3
                  });
                }
              } else if (enemy.phase === 3) {
                // Ring burst
                for (let i = 0; i < 12; i++) {
                  const angle = (i / 12) * Math.PI * 2;
                  enemyBullets.current.push({
                    x: enemy.x + enemy.width / 2,
                    y: enemy.y + enemy.height / 2,
                    vx: Math.cos(angle) * 4,
                    vy: Math.sin(angle) * 4
                  });
                }
              }
            }
          }
        }
        return;
      }

      if (enemy.isTurret) {
        // Turret Logic
        const now = Date.now();
        const shootInterval = 2000 - Math.min(1000, waveRef.current * 50);
        if (now - (enemy.lastShotTime || 0) > shootInterval) {
          enemy.lastShotTime = now;
          audio.playEnemyShoot(enemy.x + enemy.width / 2);
          
          // Target player
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

      enemy.originY += 0.01 + (waveRef.current * 0.002);

      if (!enemy.isDiving && !enemy.isReturning) {
        if (enemy.state === 'IN_FORMATION') {
          enemy.x = enemy.originX + formationOffset;
          enemy.y = enemy.originY;
        }
      } else if (enemy.isDiving) {
        enemy.diveTime = (enemy.diveTime || 0) + 1;
        
        if (enemy.diveTime < 0) {
          // Waiting to dive, keep formation
          enemy.x = enemy.originX + formationOffset;
          enemy.y = enemy.originY;
          enemy.diveStartX = enemy.x;
          enemy.diveStartY = enemy.y;
          return;
        }

        if (enemy.diveType === 'loop') {
          const t = enemy.diveTime;
          const loopRadius = 70;
          const loopSpeed = 0.08;
          const loopDuration = Math.PI * 2 / loopSpeed;
          
          let currentY = enemy.diveStartY || enemy.originY;
          if (t <= loopDuration) {
            currentY += t * currentEnemyDiveSpeed * 0.4; // Slower descent during loop
          } else {
            currentY += loopDuration * currentEnemyDiveSpeed * 0.4 + (t - loopDuration) * currentEnemyDiveSpeed;
          }
          
          const cappedAngle = Math.min(t * loopSpeed, Math.PI * 2);
          const direction = (enemy.diveX || 1) > 0 ? 1 : -1;
          const offsetX = Math.sin(cappedAngle) * loopRadius * direction;
          const offsetY = (1 - Math.cos(cappedAngle)) * loopRadius;
          
          enemy.x = (enemy.diveStartX || enemy.originX) + (enemy.diveX || 0) * t + offsetX;
          enemy.y = currentY + offsetY;
        } else if (enemy.diveType === 'chase') {
          enemy.x += enemy.diveX || 0;
          enemy.y += enemy.diveY || 0;
        } else {
          enemy.y += currentEnemyDiveSpeed;
          
          if (enemy.diveType === 'zigzag') {
            enemy.x += enemy.diveX + Math.sin(enemy.diveTime / 10) * 4;
          } else if (enemy.diveType === 'sweep') {
            enemy.x += enemy.diveX + Math.sin(enemy.diveTime / 40) * 6;
          } else if (enemy.diveType === 'spread') {
            enemy.x += enemy.diveX;
          } else {
            enemy.x += enemy.diveX + Math.sin(enemy.diveTime / 20) * 2;
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
          enemy.x = targetX;
          enemy.y = targetY;
        } else {
          enemy.x += (dx / dist) * currentEnemyDiveSpeed;
          enemy.y += (dy / dist) * currentEnemyDiveSpeed;
        }
      }
    });

    // Formation dive
    const now = Date.now();
    const diveInterval = Math.max(1200, 3000 - waveRef.current * 200);
    if (now - lastDiveTime.current > diveInterval) {
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
        const diveType = availableTypes[Math.floor(Math.random() * availableTypes.length)] as any;
        
        const turnY = playerPos.current.y - 150 + Math.random() * 100;
        const baseDiveX = (playerPos.current.x - leader.x) / 120;
        
        squad.forEach((diver, index) => {
          diver.isDiving = true;
          diver.state = 'DIVING';
          diver.diveTime = -index * 15; // 15 frames delay for snake-like formation
          diver.diveStartX = diver.x;
          diver.diveStartY = diver.y;
          
          if (diveType === 'spread') {
            // Spread out from the center
            const spreadFactor = (index - (squadSize - 1) / 2) * 1.5;
            diver.diveX = baseDiveX + spreadFactor;
          } else {
            diver.diveX = baseDiveX; // Fly in parallel formation
          }
          
          diver.diveType = diveType;
          diver.turnY = turnY;
        });
        
        lastDiveTime.current = now;
        audio.playDive(leader.x + leader.width / 2);
      }
    }

    // Collision detection
    bullets.current.forEach((bullet, bIdx) => {
      enemies.current.forEach((enemy) => {
        if (enemy.alive &&
            bullet.x > enemy.x && bullet.x < enemy.x + enemy.width &&
            bullet.y > enemy.y && bullet.y < enemy.y + enemy.height) {
          
          if (enemy.isBoss) {
            enemy.health! -= (bullet.damage || 1) * 10;
            setBossHealth({ current: enemy.health!, max: enemy.maxHealth! });
            bullets.current.splice(bIdx, 1);
            audio.playEnemyHit(enemy.x + enemy.width / 2);
            flash.current = 0.2;
            
            if (enemy.health! <= 0) {
              enemy.alive = false;
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
              if (!isOverdriveActive.current) {
                overdriveGauge.current = Math.min(100, overdriveGauge.current + 20);
                setOverdrive(overdriveGauge.current);
              }

              // Big explosion
              for(let i=0; i<100; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = Math.random() * 12;
                particles.current.push({
                  x: enemy.x + enemy.width/2,
                  y: enemy.y + enemy.height/2,
                  vx: Math.cos(angle) * speed,
                  vy: Math.sin(angle) * speed,
                  life: 40 + Math.random() * 40,
                  maxLife: 80,
                  color: i % 2 === 0 ? '#ff3366' : '#ffffff',
                  size: 4 + Math.random() * 6,
                  type: 'square',
                  rotation: Math.random() * Math.PI,
                  vr: (Math.random() - 0.5) * 0.2
                });
              }
              shake.current = 30;
            }
            return;
          }

          enemy.alive = false;
          bullets.current.splice(bIdx, 1);
          
          // Drop scrap
          if (Math.random() < 0.6) {
            scraps.current.push({
              x: enemy.x + enemy.width / 2,
              y: enemy.y + enemy.height / 2,
              vx: (Math.random() - 0.5) * 4,
              vy: (Math.random() - 0.5) * 4,
              life: 1
            });
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
          if (!isOverdriveActive.current) {
            const gaugeGain = (enemy.isDiving ? 3 : 1) * (1 + comboRef.current * 0.1);
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
          for(let i=0; i<25; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 8;
            particles.current.push({
              x: enemy.x + enemy.width/2,
              y: enemy.y + enemy.height/2,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              life: 20 + Math.random() * 20,
              maxLife: 40,
              color: colors[enemy.type],
              size: 2 + Math.random() * 4,
              type: Math.random() > 0.5 ? 'square' : 'line',
              rotation: Math.random() * Math.PI,
              vr: (Math.random() - 0.5) * 0.2
            });
          }
        }
      });
    });

    // Player collision (smaller hitbox for dodging)
    const hitMargin = 15;
    const px = playerPos.current.x + hitMargin;
    const py = playerPos.current.y + hitMargin;
    const pw = PLAYER_WIDTH - hitMargin * 2;
    const ph = PLAYER_HEIGHT - hitMargin * 2;

    let playerHit = false;

    enemies.current.forEach((enemy) => {
      if (enemy.alive &&
          enemy.x < px + pw &&
          enemy.x + enemy.width > px &&
          enemy.y < py + ph &&
          enemy.y + enemy.height > py) {
        playerHit = true;
      }
    });

    enemyBullets.current.forEach((bullet) => {
      // Graze Detection for bullets
      const bdx = (playerPos.current.x + PLAYER_WIDTH / 2) - bullet.x;
      const bdy = (playerPos.current.y + PLAYER_HEIGHT / 2) - bullet.y;
      const bdist = Math.sqrt(bdx * bdx + bdy * bdy);
      if (bdist < GRAZE_DISTANCE && bdist > 15) {
        handleGraze(bullet.x, bullet.y);
      }

      if (bullet.x > px && bullet.x < px + pw &&
          bullet.y > py && bullet.y < py + ph) {
        playerHit = true;
      }
    });

    if (playerHit && Date.now() > invulnerableUntil.current) {
      // Auto-bomb if overdrive is full
      if (overdriveGauge.current >= MAX_OVERDRIVE && !isOverdriveActive.current) {
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
        return;
      }

      // Overdrive invulnerability
      if (isOverdriveActive.current) return;

      audio.playPlayerHit();
      shake.current = 20;
      glitch.current = 30;
      flash.current = 1;
      
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

      if (livesRef.current > 1) {
        livesRef.current -= 1;
        setLives(livesRef.current);
        invulnerableUntil.current = Date.now() + 2000;
        enemyBullets.current = []; // Clear bullets to give a chance to recover
        if (comboRef.current > 5) audio.playComboBreak();
        comboRef.current = 0;
        setCombo(0);
      } else {
        livesRef.current = 0;
        setLives(0);
        audio.stopBGM();
        setGameState('GAME_OVER');
      }
    }

    // Update particles
    particles.current.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.95; // friction
      p.vy *= 0.95;
      if (p.rotation !== undefined && p.vr !== undefined) {
        p.rotation += p.vr;
      }
      p.life -= 1;
    });
    particles.current = particles.current.filter(p => p.life > 0);

    const aliveEnemies = enemies.current.filter(e => e.alive);
    if (aliveEnemies.length === 0 && !isWarping.current && !showUpgrade) {
      isWarping.current = true;
      warpStartTime.current = Date.now();
      audio.playWaveClear();
      audio.playWarp();
      
      // Clear bullets
      bullets.current = [];
      enemyBullets.current = [];
      asteroids.current = [];
      obstacles.current = [];

      setTimeout(() => {
        // Show Upgrade Choice
        const options = [
          { id: 'firepower', label: 'Enhanced Plasma', desc: 'Increase bullet size and damage' },
          { id: 'speed', label: 'Overclocked Thrusters', desc: 'Permanent movement speed boost' },
          { id: 'shield', label: 'Nano-Repair', desc: 'Restore 1 life or gain temporary shield' },
          { id: 'magnet', label: 'Scrap Magnet', desc: 'Increase scrap collection range' }
        ];
        // Pick 2 random
        const shuffled = options.sort(() => 0.5 - Math.random());
        setUpgradeOptions(shuffled.slice(0, 2));
        setShowUpgrade(true);
        pauseStartTime.current = Date.now();
      }, 1500);
    }

    // Update Warp Factor
    if (isWarping.current) {
      const elapsed = Date.now() - warpStartTime.current;
      if (elapsed < 1500) {
        warpFactor.current = Math.min(1, warpFactor.current + 0.05);
        glitch.current = Math.max(glitch.current, warpFactor.current * 10);
      } else {
        warpFactor.current = Math.max(0, warpFactor.current - 0.02);
      }
    } else {
      warpFactor.current = Math.max(0, warpFactor.current - 0.05);
    }

    // Decay effects
    if (glitch.current > 0) glitch.current *= 0.9;
    if (shake.current > 0) shake.current *= 0.9;
    if (flash.current > 0) flash.current *= 0.9;

    if (aliveEnemies.some(e => e.y + e.height > CANVAS_HEIGHT && e.state === 'IN_FORMATION')) {
      setGameState('GAME_OVER');
    }
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

    // Parallax Starfield
    const currentStage = Math.min(5, Math.ceil(waveRef.current / 2));
    const isChase = currentStage === 4;
    stars.current.forEach(s => {
      const speedMult = (1 + warpFactor.current * 40) * (isChase ? 3 : 1);
      s.y += s.speed * speedMult;
      if (s.y > CANVAS_HEIGHT) {
        s.y = -10;
        s.x = Math.random() * CANVAS_WIDTH;
      }
      ctx.fillStyle = `rgba(255, 255, 255, ${s.opacity})`;
      
      if (warpFactor.current > 0.1 || isChase) {
        // Stretched stars during warp or chase
        const stretch = warpFactor.current > 0.1 ? 20 * warpFactor.current : 5;
        ctx.strokeStyle = `rgba(255, 255, 255, ${s.opacity * (warpFactor.current > 0.1 ? warpFactor.current : 0.5)})`;
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
    const gridSpacing = 40;
    const gridSpeed = isWarping.current ? 100 : 20;
    const gridOffset = (Date.now() / gridSpeed) % gridSpacing;
    for (let x = 0; x <= CANVAS_WIDTH; x += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      ctx.stroke();
    }
    for (let y = gridOffset; y <= CANVAS_HEIGHT; y += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
      ctx.stroke();
    }

    // Draw Trails
    trails.current.forEach(t => {
      ctx.globalAlpha = (t.life / t.maxLife) * 0.4;
      ctx.fillStyle = t.color;
      ctx.beginPath();
      ctx.arc(t.x, t.y, (t.width / 2) * (t.life / t.maxLife), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    // Draw Asteroids
    asteroids.current.forEach(a => {
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(a.rotation);
      ctx.shadowBlur = 10;
      ctx.shadowColor = a.hp > 1000 ? '#ffcc00' : '#555';
      ctx.strokeStyle = a.hp > 1000 ? '#ffcc00' : '#888';
      ctx.lineWidth = a.hp > 1000 ? 3 : 2;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const r = a.size * (a.vertices ? a.vertices[i] : 1);
        if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
        else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
      }
      ctx.closePath();
      ctx.stroke();
      
      // Inner wireframe for indestructible asteroids
      if (a.hp > 1000) {
        ctx.beginPath();
        for (let i = 0; i < 8; i+=2) {
          const angle = (i / 8) * Math.PI * 2;
          const r = a.size * (a.vertices ? a.vertices[i] : 1);
          if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
          else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
        }
        ctx.closePath();
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
    if (isOverdriveActive.current) {
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

      ctx.shadowBlur = 25;
      if (!isHackedRef.current) {
        ctx.shadowColor = '#00ffcc';
        ctx.strokeStyle = '#00ffcc';
      }
      ctx.lineWidth = 2.5;
      
      // High-End Neon Vector Ship
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
      
      // Cockpit Glow
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.ellipse(0, -5, 3, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;
      
      // Engine/Afterburner Glow
      const engineFlicker = Math.random() * 5;
      ctx.shadowBlur = 15 + engineFlicker;
      ctx.shadowColor = isOverdriveActive.current ? '#ff3366' : '#33ccff';
      ctx.fillStyle = isOverdriveActive.current ? '#ff3366' : '#33ccff';
      // Left Engine
      ctx.fillRect(-12, PLAYER_HEIGHT/2 - 8, 6, (isOverdriveActive.current ? 20 : 10) + engineFlicker);
      // Right Engine
      ctx.fillRect(6, PLAYER_HEIGHT/2 - 8, 6, (isOverdriveActive.current ? 20 : 10) + engineFlicker);

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
    ctx.shadowBlur = 15;
    bullets.current.forEach((b) => {
      const size = b.size || 4;
      ctx.fillStyle = isOverdriveActive.current ? '#ff3366' : '#00ffcc';
      ctx.shadowColor = isOverdriveActive.current ? '#ff3366' : '#00ffcc';
      ctx.fillRect(b.x, b.y, size, isOverdriveActive.current ? size * 5 : size * 3);
    });
    
    // Enemy Bullets
    ctx.fillStyle = '#ff3366';
    ctx.shadowColor = '#ff3366';
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
        const color = '#ff3366';
        const pulse = Math.sin(Date.now() / 150) * 10;
        ctx.shadowBlur = 20 + pulse;
        ctx.shadowColor = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;

        // Main Body (Large Hexagon-like)
        if (enemy.isFinalBoss) {
          ctx.strokeStyle = '#00ffcc';
          ctx.shadowColor = '#00ffcc';
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.arc(0, 0, 70 + pulse, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = color; // Reset for main body
        }
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
        if (enemy.isTractorBeaming) {
          ctx.save();
          const beamWidth = 100 + Math.sin(Date.now() / 50) * 20;
          const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
          gradient.addColorStop(0, 'rgba(0, 255, 255, 0.8)');
          gradient.addColorStop(1, 'rgba(0, 255, 255, 0.1)');
          
          ctx.fillStyle = gradient;
          ctx.shadowColor = '#00ffff';
          ctx.shadowBlur = 20;
          ctx.beginPath();
          ctx.moveTo(-20, enemy.height / 2);
          ctx.lineTo(20, enemy.height / 2);
          ctx.lineTo(beamWidth / 2, CANVAS_HEIGHT);
          ctx.lineTo(-beamWidth / 2, CANVAS_HEIGHT);
          ctx.closePath();
          ctx.fill();
          
          // Add some scanning lines inside the beam
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
          ctx.lineWidth = 2;
          const scanY = (Date.now() % 1000) / 1000 * CANVAS_HEIGHT;
          ctx.beginPath();
          ctx.moveTo(-beamWidth / 2 * (scanY / CANVAS_HEIGHT), scanY);
          ctx.lineTo(beamWidth / 2 * (scanY / CANVAS_HEIGHT), scanY);
          ctx.stroke();
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

      const colors = ['#ffcc00', '#ff33cc', '#33ccff'];
      const color = colors[enemy.type];
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
      } else {
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

    ctx.restore(); // Restore from shake

    // Nebula Pass Effect (Stage 3: Heavy Fire)
    if (currentStage === 3) {
      ctx.save();
      const time = Date.now() / 2000;
      const nebulaGradient = ctx.createRadialGradient(
        CANVAS_WIDTH / 2 + Math.sin(time) * 100,
        CANVAS_HEIGHT / 2 + Math.cos(time) * 100,
        0,
        CANVAS_WIDTH / 2,
        CANVAS_HEIGHT / 2,
        CANVAS_WIDTH
      );
      nebulaGradient.addColorStop(0, 'rgba(100, 0, 255, 0.1)');
      nebulaGradient.addColorStop(0.5, 'rgba(50, 0, 100, 0.05)');
      nebulaGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      
      ctx.fillStyle = nebulaGradient;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      
      // Add some "static" noise
      ctx.globalAlpha = 0.03;
      for (let i = 0; i < 5; i++) {
        const x = Math.random() * CANVAS_WIDTH;
        const y = Math.random() * CANVAS_HEIGHT;
        const w = Math.random() * 200 + 100;
        const h = Math.random() * 50 + 20;
        ctx.fillStyle = '#ff00ff';
        ctx.fillRect(x, y, w, h);
      }
      ctx.globalAlpha = 1.0;
      ctx.restore();
    }

    // Flash
    if (flash.current > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${flash.current * 0.3})`;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    // Speed Lines Overlay (Warp)
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

    // Touch Feedback
    if (touchFeedback) {
      ctx.save();
      ctx.strokeStyle = 'rgba(0, 255, 204, 0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(touchFeedback.x, touchFeedback.y, 30, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Final Post-Processing to Main Canvas
    mainCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Chromatic Aberration
    const caIntensity = (isOverdriveActive.current ? 4 : 0) + (warpFactor.current * 15) + (glitch.current * 0.5);
    if (caIntensity > 0.5) {
      mainCtx.globalCompositeOperation = 'screen';
      // Red
      mainCtx.drawImage(offscreenCanvas.current, -caIntensity, 0);
      // Green (center)
      mainCtx.drawImage(offscreenCanvas.current, 0, 0);
      // Blue
      mainCtx.drawImage(offscreenCanvas.current, caIntensity, 0);
      mainCtx.globalCompositeOperation = 'source-over';
    } else {
      mainCtx.drawImage(offscreenCanvas.current, 0, 0);
    }

    // Glitch Effect
    if (glitch.current > 1) {
      const glitchAmount = glitch.current;
      for (let i = 0; i < 5; i++) {
        const x = Math.random() * CANVAS_WIDTH;
        const y = Math.random() * CANVAS_HEIGHT;
        const w = Math.random() * 100 + 50;
        const h = Math.random() * 20 + 5;
        const dx = (Math.random() - 0.5) * glitchAmount * 2;
        mainCtx.drawImage(offscreenCanvas.current, x, y, w, h, x + dx, y, w, h);
      }
    }

    // Scanlines
    mainCtx.fillStyle = 'rgba(18, 16, 16, 0.1)';
    for (let i = 0; i < CANVAS_HEIGHT; i += 4) {
      mainCtx.fillRect(0, i, CANVAS_WIDTH, 1);
    }

    // Vignette
    const gradient = mainCtx.createRadialGradient(
      CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH / 4,
      CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH / 1.2
    );
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.4)');
    mainCtx.fillStyle = gradient;
    mainCtx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Static Noise
    if (Math.random() > 0.9) {
      mainCtx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.02})`;
      mainCtx.fillRect(Math.random() * CANVAS_WIDTH, Math.random() * CANVAS_HEIGHT, 2, 2);
    }
  };

  const loop = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    update();
    draw(ctx);
    requestRef.current = requestAnimationFrame(loop);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(loop);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [gameState, assets]);

  useEffect(() => {
    if (score > highScore) {
      setHighScore(score);
    }
  }, [score]);

  return (
    <div className="min-h-screen bg-[#020205] text-white flex flex-col items-center justify-center font-mono overflow-hidden">
      {/* HUD */}
      <div className="w-full max-w-[600px] flex justify-between items-end mb-4 px-4">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 uppercase tracking-[0.3em]">Stage</span>
            {isTouchDevice && (
              <button 
                onClick={toggleFullscreen}
                className="p-2 bg-white/10 border border-white/20 rounded-lg hover:bg-white/20 active:scale-95 transition-all flex items-center gap-2"
                title="Toggle Fullscreen"
              >
                <Maximize2 size={16} className={isFullscreen ? "text-[#00ffcc]" : "text-white"} />
                <span className="text-[10px] uppercase font-bold tracking-wider">
                  {isFullscreen ? "Exit Full" : "Fullscreen"}
                </span>
              </button>
            )}
          </div>
          <span className="text-xl font-bold text-white tracking-tighter italic">{sectorName}</span>
          <div className="flex flex-col mt-2">
            <span className="text-[8px] text-gray-500 uppercase tracking-widest">Distance to Fortress</span>
            <div className="w-32 h-1 bg-white/10 rounded-full mt-1 overflow-hidden">
              <motion.div 
                animate={{ width: `${(1 - distance / 25000) * 100}%` }}
                className="h-full bg-[#00ffcc] shadow-[0_0_5px_#00ffcc]"
              />
            </div>
            <span className="text-[9px] text-[#00ffcc] mt-1 font-mono">{distance.toLocaleString()} KM</span>
          </div>
        </div>
        
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-gray-500 uppercase tracking-[0.3em]">Score</span>
          <span className="text-2xl font-bold text-[#00ffcc] tracking-tighter">{score.toString().padStart(6, '0')}</span>
        </div>
        
        {combo > 1 && (
          <motion.div 
            initial={{ scale: 0, opacity: 0, rotate: -20 }}
            animate={{ 
              scale: [1, 1.2, 1], 
              opacity: 1, 
              rotate: [0, 5, -5, 0],
              color: combo > 10 ? '#ffcc00' : '#ff3366'
            }}
            transition={{ duration: 0.2 }}
            key={combo}
            className="flex flex-col items-center"
          >
            <span className="text-[10px] uppercase tracking-widest font-bold opacity-70">Combo</span>
            <span className={`text-4xl font-black italic drop-shadow-[0_0_10px_currentColor]`}>x{combo}</span>
          </motion.div>
        )}

        <div className="flex flex-col items-center">
          <span className="text-[10px] text-gray-500 uppercase tracking-[0.3em] mb-1">Overdrive</span>
          <div className="w-24 h-2 bg-black/50 border border-[#ff3366] rounded-full overflow-hidden">
            <motion.div 
              animate={{ width: `${overdrive}%` }}
              className={`h-full ${overdrive >= 100 ? 'bg-white shadow-[0_0_10px_#fff]' : 'bg-[#ff3366]'}`}
            />
          </div>
          {overdrive >= 100 && !isOverdriveActive.current && (
            <span className="text-[8px] text-white animate-pulse mt-1 font-bold">READY [X]</span>
          )}
        </div>

        <div className="flex flex-col items-center">
          <span className="text-[10px] text-gray-500 uppercase tracking-[0.3em] mb-1">Wave</span>
          <span className="text-xl font-bold text-[#ff33cc] tracking-tighter">{wave}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-gray-500 uppercase tracking-[0.3em] mb-1">Scrap</span>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-[#00ffcc] rounded-full animate-pulse" />
            <span className="text-xl font-bold text-[#00ffcc] tracking-tighter">{scrapCount}</span>
          </div>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-gray-500 uppercase tracking-[0.3em] mb-1">Lives</span>
          <div className="flex gap-2 h-6">
            {[...Array(Math.max(0, lives))].map((_, i) => (
              <Rocket key={i} size={20} className="text-[#ff3366] -rotate-45" fill="currentColor" />
            ))}
          </div>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[10px] text-gray-500 uppercase tracking-[0.3em]">High Score</span>
          <span className="text-2xl font-bold text-[#ffcc00] tracking-tighter">{highScore.toString().padStart(6, '0')}</span>
        </div>
      </div>

      {/* Game Canvas Container */}
      <div className="relative border-4 md:border-8 border-[#1a1a2e] rounded-xl shadow-[0_0_50px_rgba(0,255,204,0.1)] overflow-hidden max-w-[95vw] max-h-[70vh] aspect-[3/4]">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="block w-full h-full object-contain bg-black"
        />

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
                className="h-full bg-gradient-to-r from-[#ff3366] to-[#ffcc00] shadow-[0_0_10px_#ff3366]"
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
              className="absolute inset-0 bg-black/90 z-[60] flex flex-col items-center justify-center p-8"
            >
              <motion.div 
                initial={{ y: 20 }}
                animate={{ y: 0 }}
                className="text-center mb-12"
              >
                <h3 className="text-[#00ffcc] text-xs uppercase tracking-[0.5em] mb-2">Sector Cleared</h3>
                <h2 className="text-4xl font-black italic tracking-tighter">CHOOSE ENHANCEMENT</h2>
              </motion.div>
              
              <div className="grid grid-cols-1 gap-4 w-full max-w-xs">
                {upgradeOptions.map((opt) => (
                  <motion.button
                    key={opt.id}
                    whileHover={{ scale: 1.05, backgroundColor: 'rgba(0, 255, 204, 0.1)' }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleUpgrade(opt.id)}
                    className="flex flex-col items-start p-4 border border-[#00ffcc]/30 bg-black/50 rounded-lg text-left transition-colors hover:border-[#00ffcc]"
                  >
                    <span className="text-[#00ffcc] font-bold uppercase tracking-widest text-sm mb-1">{opt.label}</span>
                    <span className="text-gray-400 text-[10px] leading-tight">{opt.desc}</span>
                  </motion.button>
                ))}
              </div>
              
              <div className="mt-12 text-[8px] text-gray-600 uppercase tracking-[0.3em]">
                System Scavenging Complete
              </div>
            </motion.div>
          )}

          {waveTitle && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, rotateX: 45 }}
              animate={{ opacity: 1, scale: 1, rotateX: 0 }}
              exit={{ opacity: 0, scale: 1.2, rotateX: -45 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none z-50"
            >
              <div className="text-center relative">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                  className="absolute -top-6 left-0 h-[2px] bg-gradient-to-r from-transparent via-[#00ffcc] to-transparent"
                />
                <div className="relative">
                  <h2 className={`text-5xl md:text-7xl font-black tracking-[0.3em] italic drop-shadow-[0_0_30px_rgba(255,255,255,0.8)] ${(wave === 6 || wave === 10) ? 'text-[#ff3366]' : 'text-white'}`}>
                    {(wave === 6 || wave === 10) ? 'BOSS BATTLE' : `STAGE ${Math.min(5, Math.ceil(wave / 2))}-${wave % 2 === 0 ? 2 : 1}`}
                  </h2>
                  <p className="text-[#00ffcc] text-xs mt-2 tracking-[0.5em] font-bold uppercase">{sectorName}</p>
                  {/* Glitch clones for stylish effect */}
                  <motion.h2 
                    animate={{ x: [-2, 2, -2], opacity: [0.3, 0.1, 0.3] }}
                    transition={{ duration: 0.1, repeat: Infinity }}
                    className="absolute inset-0 text-5xl md:text-7xl font-black tracking-[0.3em] italic text-[#00ffcc] -z-10 translate-x-1"
                  >
                    {(wave === 6 || wave === 10) ? 'BOSS BATTLE' : `STAGE ${Math.min(5, Math.ceil(wave / 2))}-${wave % 2 === 0 ? 2 : 1}`}
                  </motion.h2>
                  <motion.h2 
                    animate={{ x: [2, -2, 2], opacity: [0.3, 0.1, 0.3] }}
                    transition={{ duration: 0.1, repeat: Infinity }}
                    className="absolute inset-0 text-5xl md:text-7xl font-black tracking-[0.3em] italic text-[#ff3366] -z-10 -translate-x-1"
                  >
                    {(wave === 6 || wave === 10) ? 'BOSS BATTLE' : `STAGE ${Math.min(5, Math.ceil(wave / 2))}-${wave % 2 === 0 ? 2 : 1}`}
                  </motion.h2>
                </div>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                  className="absolute -bottom-6 left-0 h-[2px] bg-gradient-to-r from-transparent via-[#ff3366] to-transparent"
                />
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="mt-12 flex flex-col items-center gap-2"
                >
                  <span className="text-[10px] uppercase tracking-[0.5em] text-gray-400 font-bold">System Status: Optimal</span>
                  <div className="flex gap-1">
                    {[...Array(5)].map((_, i) => (
                      <motion.div 
                        key={i}
                        animate={{ opacity: [0.2, 1, 0.2] }}
                        transition={{ duration: 1, delay: i * 0.1, repeat: Infinity }}
                        className="w-1 h-1 bg-[#00ffcc]"
                      />
                    ))}
                  </div>
                </motion.div>
              </div>
            </motion.div>
          )}

          {gameState === 'LOADING' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black flex flex-col items-center justify-center p-8 text-center"
            >
              <Loader2 size={48} className="text-[#00ffcc] animate-spin mb-4" />
              <p className="text-[#00ffcc] uppercase tracking-[0.5em] text-sm animate-pulse">
                Generating Assets...
              </p>
            </motion.div>
          )}

          {gameState === 'START' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-4 md:p-8 text-center overflow-hidden"
            >
              <motion.div
                animate={{ y: [0, -10, 0], rotate: [0, 3, -3, 0] }}
                transition={{ duration: 4, repeat: Infinity }}
                className="mb-4 md:mb-8"
              >
                <NeonShip className="w-20 h-20 md:w-32 md:h-32 drop-shadow-[0_0_20px_rgba(0,255,204,0.6)]" />
              </motion.div>
              <h1 className="text-4xl md:text-6xl font-black mb-2 md:mb-4 tracking-tighter italic text-transparent bg-clip-text bg-gradient-to-b from-white via-gray-300 to-gray-600">
                NEON DEFENDER
              </h1>
              <p className="text-gray-400 mb-6 md:mb-10 max-w-[280px] md:max-w-xs text-xs md:text-sm leading-relaxed tracking-wide">
                The swarm is approaching. <br/>Engage thrusters and defend the sector.
              </p>
              <button
                onClick={startGame}
                className="group relative px-6 py-3 md:px-10 md:py-5 bg-[#00ffcc] text-black font-bold text-lg md:text-xl uppercase tracking-[0.2em] hover:scale-105 transition-all duration-300 shadow-[0_0_30px_rgba(0,255,204,0.3)]"
              >
                <span className="relative z-10 flex items-center gap-3">
                  <Play size={20} className="md:w-6 md:h-6" fill="currentColor" /> Launch Mission
                </span>
                <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-30 transition-opacity" />
              </button>
              <div className="mt-8 md:mt-16 grid grid-cols-3 gap-4 md:gap-8 text-[8px] md:text-[10px] text-gray-500 uppercase tracking-[0.4em]">
                <div className="flex flex-col gap-1 md:gap-2">
                  <span className="text-gray-400">Movement</span>
                  <span>{isTouchDevice ? 'Drag Anywhere' : 'Arrow Keys'}</span>
                </div>
                <div className="flex flex-col gap-1 md:gap-2">
                  <span className="text-gray-400">Weapon</span>
                  <span>{isTouchDevice ? 'Auto-Fire' : 'Space Bar'}</span>
                </div>
                <div className="flex flex-col gap-1 md:gap-2">
                  <span className="text-gray-400">Overdrive</span>
                  <span>{isTouchDevice ? 'Tap Icon' : 'X Key'}</span>
                </div>
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
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center p-8 text-center"
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

      {/* Touch Feedback */}
      {isTouchDevice && isTouching.current && (
        <motion.div 
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 0.3 }}
          style={{ 
            position: 'fixed', 
            left: touchStartPos.current.x - 30, 
            top: touchStartPos.current.y - 30,
            width: 60,
            height: 60,
            borderRadius: '50%',
            border: '2px solid #00ffcc',
            pointerEvents: 'none',
            zIndex: 100
          }}
        />
      )}

      {/* Mobile Overdrive Button (Floating) */}
      {gameState === 'PLAYING' && isTouchDevice && (
        <div className="fixed bottom-8 right-8 flex flex-col gap-4 z-50">
          <button 
            onPointerDown={(e) => { e.preventDefault(); keysPressed.current['TouchOverdrive'] = true; }}
            onPointerUp={(e) => { e.preventDefault(); keysPressed.current['TouchOverdrive'] = false; }}
            className={`w-20 h-20 rounded-full border-2 flex flex-col items-center justify-center transition-all ${
              overdrive >= 100 
                ? 'border-[#ff3366] bg-[#ff3366]/20 shadow-[0_0_20px_#ff3366] animate-pulse' 
                : 'border-white/20 bg-white/5 opacity-50'
            }`}
          >
            <Zap size={32} className={overdrive >= 100 ? 'text-[#ff3366]' : 'text-white/40'} fill={overdrive >= 100 ? 'currentColor' : 'none'} />
            <span className="text-[8px] font-bold mt-1 text-white/60">OVERDRIVE</span>
          </button>
        </div>
      )}

      {/* Footer */}
      <div className="mt-8 text-[9px] text-gray-700 uppercase tracking-[0.5em] flex items-center gap-4">
        <span>Arcade Revision 2.5</span>
        <span className="w-1 h-1 bg-gray-800 rounded-full" />
        <span>Sector 7-G Defense System</span>
      </div>
    </div>
  );
}
