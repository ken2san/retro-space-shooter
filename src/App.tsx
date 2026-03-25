/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Rocket, Trophy, Play, RotateCcw, Loader2, Zap } from 'lucide-react';
import { generateGameAssets } from './services/assetGenerator';
import { audio } from './services/audio';

// --- Constants ---
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 800;
const PLAYER_WIDTH = 50;
const PLAYER_HEIGHT = 50;
const PLAYER_SPEED = 3.5;
const BULLET_SPEED = 5;
const ENEMY_DIVE_SPEED = 1.8;
const ENEMY_BULLET_SPEED = 2.2;
const ENEMY_ROWS = 5;
const ENEMY_COLS = 8;
const ENEMY_SPACING = 55;

type GameState = 'LOADING' | 'START' | 'PLAYING' | 'GAME_OVER' | 'VICTORY';

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
  diveType?: 'normal' | 'uturn' | 'zigzag' | 'sweep' | 'spread' | 'loop';
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

  // Game state refs for the loop
  const livesRef = useRef(3);
  const waveRef = useRef(1);
  const invulnerableUntil = useRef(0);
  const playerPos = useRef({ x: CANVAS_WIDTH / 2 - PLAYER_WIDTH / 2, y: CANVAS_HEIGHT - 80 });
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
    return () => window.removeEventListener('resize', checkTouch);
  }, []);

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
    
    setLives(prev => {
      const newLives = prev - 1;
      livesRef.current = newLives;
      if (newLives <= 0) {
        setGameState('GAME_OVER');
        audio.playGameOver();
      } else {
        audio.playPlayerHit();
        invulnerableUntil.current = Date.now() + 2000;
        flash.current = 1.0;
        shake.current = 20;
      }
      return newLives;
    });
    
    createExplosion(playerPos.current.x + PLAYER_WIDTH / 2, playerPos.current.y + PLAYER_HEIGHT / 2, '#00ffcc', 50);
  };

  // Initialize enemies
  const initEnemies = (waveNum: number) => {
    const newEnemies: Enemy[] = [];
    const isBossWave = waveNum % 5 === 0;
    const formationType = isBossWave ? 'BOSS' : waveNum % 4; // 1, 2, 3, 0
    
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
      const isFinalBoss = waveNum >= 25;
      const bossHealthVal = (500 + (waveNum / 5) * 400) * (isFinalBoss ? 2 : 1);
      const bossPath = [
        { x: CANVAS_WIDTH / 2, y: -200 },
        { x: CANVAS_WIDTH / 2, y: 80 }
      ];
      newEnemies.push({
        ...createEnemy(CANVAS_WIDTH / 2 - (isFinalBoss ? 90 : 60), 80, 0, 0, bossPath),
        width: isFinalBoss ? 180 : 120,
        height: isFinalBoss ? 150 : 100,
        isBoss: true,
        isFinalBoss,
        health: bossHealthVal,
        maxHealth: bossHealthVal,
        phase: 1,
        moveDir: 1,
        lastShotTime: 0
      });
      setBossHealth({ current: bossHealthVal, max: bossHealthVal });
    } else {
      setBossHealth(null);
      
      // Define entry paths (Galaga style)
      const paths = [
        // Path 0: Loop from top left
        Array.from({ length: 30 }, (_, i) => ({
          x: -100 + i * 25,
          y: 100 + Math.sin(i * 0.4) * 150
        })),
        // Path 1: Loop from top right
        Array.from({ length: 30 }, (_, i) => ({
          x: CANVAS_WIDTH + 100 - i * 25,
          y: 150 + Math.cos(i * 0.4) * 180
        })),
        // Path 2: Swirl from bottom (Only for wave > 1)
        Array.from({ length: 30 }, (_, i) => ({
          x: CANVAS_WIDTH / 2 + Math.sin(i * 0.6) * 250,
          y: CANVAS_HEIGHT + 100 - i * 35
        }))
      ];

      // Wave 1 is always easier: only top entry
      const availablePaths = waveNum === 1 ? [paths[0], paths[1]] : paths;

      if (formationType === 1) {
        // Grid
        for (let row = 0; row < ENEMY_ROWS; row++) {
          for (let col = 0; col < ENEMY_COLS; col++) {
            const x = col * ENEMY_SPACING + 80;
            const y = row * ENEMY_SPACING + 60;
            const squadron = Math.floor((row * ENEMY_COLS + col) / 8);
            const path = availablePaths[squadron % availablePaths.length];
            const delay = (squadron * 1200) + ((row * ENEMY_COLS + col) % 8) * 150;
            newEnemies.push(createEnemy(x, y, row % 3, delay, path));
          }
        }
      } else if (formationType === 2) {
        // V-shape
        let count = 0;
        for (let row = 0; row < 5; row++) {
          for (let col = 0; col < 9; col++) {
            if (row === Math.abs(col - 4)) {
              const x = col * ENEMY_SPACING + 60;
              const y = row * ENEMY_SPACING + 60;
              const squadron = Math.floor(count / 8);
              const path = availablePaths[squadron % availablePaths.length];
              const delay = (squadron * 1200) + (count % 8) * 150;
              newEnemies.push(createEnemy(x, y, 1, delay, path));
              count++;
            }
            if (row > 1 && row - 1 === Math.abs(col - 4)) {
              const x = col * ENEMY_SPACING + 60;
              const y = row * ENEMY_SPACING + 60;
              const squadron = Math.floor(count / 8);
              const path = availablePaths[squadron % availablePaths.length];
              const delay = (squadron * 1200) + (count % 8) * 150;
              newEnemies.push(createEnemy(x, y, 2, delay, path));
              count++;
            }
          }
        }
      } else if (formationType === 3) {
        // Circle
        const centerX = CANVAS_WIDTH / 2;
        const centerY = 150;
        const radiusX = 200;
        const radiusY = 100;
        for (let i = 0; i < 20; i++) {
          const angle = (i / 20) * Math.PI * 2;
          const x = centerX + Math.cos(angle) * radiusX - 17.5;
          const y = centerY + Math.sin(angle) * radiusY - 17.5;
          const squadron = Math.floor(i / 10);
          const path = availablePaths[squadron % availablePaths.length];
          const delay = (squadron * 1200) + (i % 10) * 150;
          newEnemies.push(createEnemy(x, y, i % 3, delay, path));
        }
        for (let i = 0; i < 10; i++) {
          const angle = (i / 10) * Math.PI * 2;
          const x = centerX + Math.cos(angle) * (radiusX / 2) - 17.5;
          const y = centerY + Math.sin(angle) * (radiusY / 2) - 17.5;
          const squadron = Math.floor((i + 20) / 10);
          const path = availablePaths[squadron % availablePaths.length];
          const delay = (squadron * 1200) + (i % 10) * 150;
          newEnemies.push(createEnemy(x, y, 0, delay, path));
        }
      } else {
        // Checkerboard / U-Shape
        let count = 0;
        for (let row = 0; row < 5; row++) {
          for (let col = 0; col < 9; col++) {
            if ((row + col) % 2 === 0) {
              const x = col * ENEMY_SPACING + 60;
              const y = row * ENEMY_SPACING + 60;
              const squadron = Math.floor(count / 8);
              const path = availablePaths[squadron % availablePaths.length];
              const delay = (squadron * 1200) + (count % 8) * 150;
              newEnemies.push(createEnemy(x, y, row % 3, delay, path));
              count++;
            }
          }
        }
      }
    }
    
    // Add turrets for Fortress Gates
    if (waveNum > 15) {
      for (let i = 0; i < 4; i++) {
        const x = (i + 1) * (CANVAS_WIDTH / 5) - 20;
        const y = 60;
        const turret = createEnemy(x, y, 2, 0); 
        turret.isTurret = true;
        turret.health = 100;
        turret.maxHealth = 100;
        turret.state = 'IN_FORMATION';
        turret.width = 40;
        turret.height = 40;
        newEnemies.push(turret);
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
    setSectorName(getSectorName(waveRef.current));
    setDistance(prev => Math.max(0, prev - 1000));
    initEnemies(waveRef.current);
    
    setWaveTitle(true);
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
    setSectorName('Outer Rim');
    setDistance(25000);
    setScrapCount(0);
    setShowUpgrade(false);
    firepowerRef.current = 1;
    speedRef.current = 1;
    magnetRef.current = 1;
    livesRef.current = 3;
    waveRef.current = 1;
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
    window.addEventListener('keydown', handleKeyDown, { passive: false });
    window.addEventListener('keyup', handleKeyUp, { passive: false });
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Game Loop
  const update = () => {
    if (gameState !== 'PLAYING' || showUpgrade) return;

    // Player movement
    let isMoving = false;
    const speedMultiplier = 1 + (speedRef.current - 1) * 0.15;
    const currentSpeed = (isOverdriveActive.current ? PLAYER_SPEED * 1.5 : PLAYER_SPEED) * speedMultiplier;

    if ((keysPressed.current['ArrowLeft'] || keysPressed.current['KeyA'] || keysPressed.current['TouchLeft']) && playerPos.current.x > 0) {
      playerPos.current.x -= currentSpeed;
      isMoving = true;
    }
    if ((keysPressed.current['ArrowRight'] || keysPressed.current['KeyD'] || keysPressed.current['TouchRight']) && playerPos.current.x < CANVAS_WIDTH - PLAYER_WIDTH) {
      playerPos.current.x += currentSpeed;
      isMoving = true;
    }
    if ((keysPressed.current['ArrowUp'] || keysPressed.current['KeyW'] || keysPressed.current['TouchUp']) && playerPos.current.y > CANVAS_HEIGHT * 0.6) {
      playerPos.current.y -= currentSpeed;
      isMoving = true;
    }
    if ((keysPressed.current['ArrowDown'] || keysPressed.current['KeyS'] || keysPressed.current['TouchDown']) && playerPos.current.y < CANVAS_HEIGHT - PLAYER_HEIGHT - 20) {
      playerPos.current.y += currentSpeed;
      isMoving = true;
    }

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

    // Update Asteroids (Sector 6-10: Asteroid Belt)
    if (sectorName === 'Asteroid Belt' && !isWarping.current && Math.random() < 0.02) {
      asteroids.current.push({
        x: Math.random() * CANVAS_WIDTH,
        y: -100,
        size: Math.random() * 40 + 20,
        speed: Math.random() * 2 + 1,
        rotation: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.05,
        hp: 3
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
        a.hp = 0; // Destroy asteroid
      }
      
      // Collision with bullets
      bullets.current.forEach(b => {
        const bdx = b.x - a.x;
        const bdy = b.y - a.y;
        const bdist = Math.sqrt(bdx * bdx + bdy * bdy);
        if (bdist < a.size) {
          a.hp -= (b.damage || 1);
          b.y = -100; // Remove bullet
          if (a.hp <= 0) {
            audio.playExplosion(a.x);
            createExplosion(a.x, a.y, '#888888', 10);
            setScore(s => s + 50);
          }
        }
      });
    });
    asteroids.current = asteroids.current.filter(a => a.y < CANVAS_HEIGHT + 100 && a.hp > 0);

    // Update Obstacles (Sector 16+: Fortress Gates & The Core)
    if ((sectorName === 'Fortress Gates' || sectorName === 'The Core') && !isWarping.current) {
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
        x: b.x + (b.vx || 0),
        y: b.y + (b.vy || -BULLET_SPEED) 
      }))
      .filter((b) => b.y > -20 && b.y < CANVAS_HEIGHT + 20);

    // Update enemy bullets
    const currentEnemyBulletSpeed = ENEMY_BULLET_SPEED + waveRef.current * 0.2;
    enemyBullets.current = enemyBullets.current
      .map((b) => ({ 
        ...b, 
        x: b.x + (b.vx || 0),
        y: b.y + (b.vy || currentEnemyBulletSpeed) 
      }))
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
    const currentEnemyDiveSpeed = ENEMY_DIVE_SPEED + waveRef.current * 0.2;
    const formationOffset = (Math.sin(Date.now() / 1200) * 60);
    
    enemies.current.forEach((enemy) => {
      if (!enemy.alive) return;
      
      enemy.prevX = enemy.x;
      enemy.prevY = enemy.y;

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

      if (enemy.isBoss) {
        // Boss Logic
        if (enemy.y < enemy.originY) {
          enemy.y += 1; // Entry
        } else {
          // Horizontal movement
          enemy.x += (enemy.moveDir || 1) * 1.5;
          if (enemy.x < 50 || enemy.x > CANVAS_WIDTH - enemy.width - 50) {
            enemy.moveDir = (enemy.moveDir || 1) * -1;
          }

          // Phase logic
          if (enemy.health! < enemy.maxHealth! * 0.3) enemy.phase = 3;
          else if (enemy.health! < enemy.maxHealth! * 0.6) enemy.phase = 2;

          // Boss shooting
          const now = Date.now();
          const shootInterval = enemy.phase === 3 ? 600 : enemy.phase === 2 ? 1000 : 1500;
          if (now - (enemy.lastShotTime || 0) > shootInterval) {
            enemy.lastShotTime = now;
            audio.playEnemyShoot(enemy.x + enemy.width / 2);

            if (enemy.phase === 1) {
              // Spread shot
              for (let i = -2; i <= 2; i++) {
                enemyBullets.current.push({
                  x: enemy.x + enemy.width / 2,
                  y: enemy.y + enemy.height,
                  vx: i * 0.8,
                  vy: 3
                });
              }
            } else if (enemy.phase === 2) {
              // Targeted + Spread
              const dx = (playerPos.current.x + PLAYER_WIDTH / 2) - (enemy.x + enemy.width / 2);
              const dy = playerPos.current.y - (enemy.y + enemy.height);
              const dist = Math.sqrt(dx * dx + dy * dy);
              for (let i = -1; i <= 1; i++) {
                enemyBullets.current.push({
                  x: enemy.x + enemy.width / 2,
                  y: enemy.y + enemy.height,
                  vx: (dx / dist) * 3 + i * 0.5,
                  vy: (dy / dist) * 3
                });
              }
            } else {
              // Circle burst
              for (let i = 0; i < 12; i++) {
                const angle = (i / 12) * Math.PI * 2;
                enemyBullets.current.push({
                  x: enemy.x + enemy.width / 2,
                  y: enemy.y + enemy.height / 2,
                  vx: Math.cos(angle) * 3,
                  vy: Math.sin(angle) * 3
                });
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
      if (bullet.x > px && bullet.x < px + pw &&
          bullet.y > py && bullet.y < py + ph) {
        playerHit = true;
      }
    });

    if (playerHit && Date.now() > invulnerableUntil.current) {
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
    stars.current.forEach(s => {
      const speedMult = 1 + warpFactor.current * 40;
      s.y += s.speed * speedMult;
      if (s.y > CANVAS_HEIGHT) {
        s.y = -10;
        s.x = Math.random() * CANVAS_WIDTH;
      }
      ctx.fillStyle = `rgba(255, 255, 255, ${s.opacity})`;
      
      if (warpFactor.current > 0.1) {
        // Stretched stars during warp
        ctx.strokeStyle = `rgba(255, 255, 255, ${s.opacity * warpFactor.current})`;
        ctx.lineWidth = s.size;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x, s.y - s.size * 20 * warpFactor.current);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Grid (Perspective effect)
    const isBossNear = (waveRef.current + 1) % 5 === 0;
    const isBossWave = waveRef.current % 5 === 0;
    
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
      ctx.shadowColor = '#555';
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const r = a.size * (0.8 + Math.random() * 0.4);
        if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
        else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
      }
      ctx.closePath();
      ctx.stroke();
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
      
      // Subtle tilt
      const tilt = (keysPressed.current['ArrowLeft'] || keysPressed.current['TouchLeft']) ? -0.15 : 
                   (keysPressed.current['ArrowRight'] || keysPressed.current['TouchRight']) ? 0.15 : 0;
      ctx.rotate(tilt);

      ctx.shadowBlur = 25;
      ctx.shadowColor = '#00ffcc';
      ctx.strokeStyle = '#00ffcc';
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

    // Nebula Pass Effect
    if (sectorName === 'Nebula Pass') {
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
          <span className="text-[10px] text-gray-500 uppercase tracking-[0.3em]">Sector</span>
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
                  <h2 className={`text-5xl md:text-7xl font-black tracking-[0.3em] italic drop-shadow-[0_0_30px_rgba(255,255,255,0.8)] ${wave % 5 === 0 ? 'text-[#ff3366]' : 'text-white'}`}>
                    {wave % 5 === 0 ? 'BOSS BATTLE' : `SECTOR ${wave.toString().padStart(2, '0')}`}
                  </h2>
                  <p className="text-[#00ffcc] text-xs mt-2 tracking-[0.5em] font-bold uppercase">{sectorName}</p>
                  {/* Glitch clones for stylish effect */}
                  <motion.h2 
                    animate={{ x: [-2, 2, -2], opacity: [0.3, 0.1, 0.3] }}
                    transition={{ duration: 0.1, repeat: Infinity }}
                    className="absolute inset-0 text-5xl md:text-7xl font-black tracking-[0.3em] italic text-[#00ffcc] -z-10 translate-x-1"
                  >
                    {wave % 5 === 0 ? 'BOSS BATTLE' : `SECTOR ${wave.toString().padStart(2, '0')}`}
                  </motion.h2>
                  <motion.h2 
                    animate={{ x: [2, -2, 2], opacity: [0.3, 0.1, 0.3] }}
                    transition={{ duration: 0.1, repeat: Infinity }}
                    className="absolute inset-0 text-5xl md:text-7xl font-black tracking-[0.3em] italic text-[#ff3366] -z-10 -translate-x-1"
                  >
                    {wave % 5 === 0 ? 'BOSS BATTLE' : `SECTOR ${wave.toString().padStart(2, '0')}`}
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
              <div className="mt-8 md:mt-16 grid grid-cols-2 gap-8 md:gap-12 text-[8px] md:text-[10px] text-gray-500 uppercase tracking-[0.4em]">
                <div className="flex flex-col gap-1 md:gap-2">
                  <span className="text-gray-400">Movement</span>
                  <span>{isTouchDevice ? 'Touch Drag' : 'Arrow Keys'}</span>
                </div>
                <div className="flex flex-col gap-1 md:gap-2">
                  <span className="text-gray-400">Weapon</span>
                  <span>{isTouchDevice ? 'Auto-Fire' : 'Space Bar'}</span>
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

      {/* Mobile Control Pad (Outside Canvas) */}
      {gameState === 'PLAYING' && isTouchDevice && (
        <div className="w-full max-w-[700px] mt-8 px-4 flex justify-between items-center select-none">
          {/* Movement Group - D-Pad Layout */}
          <div className="relative w-40 h-40 md:w-48 md:h-48 flex items-center justify-center">
            {/* Up */}
            <button
              onPointerDown={(e) => { e.preventDefault(); keysPressed.current['TouchUp'] = true; }}
              onPointerUp={(e) => { e.preventDefault(); keysPressed.current['TouchUp'] = false; }}
              onPointerLeave={(e) => { e.preventDefault(); keysPressed.current['TouchUp'] = false; }}
              className="absolute top-0 w-14 h-14 md:w-16 md:h-16 bg-[#1a1a2e] border-2 border-[#00ffcc]/40 rounded-xl flex items-center justify-center active:bg-[#00ffcc]/20 active:scale-95 transition-all touch-none shadow-[0_4px_0_rgba(0,255,204,0.2)]"
            >
              <div className="w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-b-[20px] border-b-[#00ffcc]" />
            </button>
            {/* Down */}
            <button
              onPointerDown={(e) => { e.preventDefault(); keysPressed.current['TouchDown'] = true; }}
              onPointerUp={(e) => { e.preventDefault(); keysPressed.current['TouchDown'] = false; }}
              onPointerLeave={(e) => { e.preventDefault(); keysPressed.current['TouchDown'] = false; }}
              className="absolute bottom-0 w-14 h-14 md:w-16 md:h-16 bg-[#1a1a2e] border-2 border-[#00ffcc]/40 rounded-xl flex items-center justify-center active:bg-[#00ffcc]/20 active:scale-95 transition-all touch-none shadow-[0_4px_0_rgba(0,255,204,0.2)]"
            >
              <div className="w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[20px] border-t-[#00ffcc]" />
            </button>
            {/* Left */}
            <button
              onPointerDown={(e) => { e.preventDefault(); keysPressed.current['TouchLeft'] = true; }}
              onPointerUp={(e) => { e.preventDefault(); keysPressed.current['TouchLeft'] = false; }}
              onPointerLeave={(e) => { e.preventDefault(); keysPressed.current['TouchLeft'] = false; }}
              className="absolute left-0 w-14 h-14 md:w-16 md:h-16 bg-[#1a1a2e] border-2 border-[#00ffcc]/40 rounded-xl flex items-center justify-center active:bg-[#00ffcc]/20 active:scale-95 transition-all touch-none shadow-[0_4px_0_rgba(0,255,204,0.2)]"
            >
              <div className="w-0 h-0 border-t-[10px] border-t-transparent border-b-[10px] border-b-transparent border-r-[20px] border-r-[#00ffcc]" />
            </button>
            {/* Right */}
            <button
              onPointerDown={(e) => { e.preventDefault(); keysPressed.current['TouchRight'] = true; }}
              onPointerUp={(e) => { e.preventDefault(); keysPressed.current['TouchRight'] = false; }}
              onPointerLeave={(e) => { e.preventDefault(); keysPressed.current['TouchRight'] = false; }}
              className="absolute right-0 w-14 h-14 md:w-16 md:h-16 bg-[#1a1a2e] border-2 border-[#00ffcc]/40 rounded-xl flex items-center justify-center active:bg-[#00ffcc]/20 active:scale-95 transition-all touch-none shadow-[0_4px_0_rgba(0,255,204,0.2)]"
            >
              <div className="w-0 h-0 border-t-[10px] border-t-transparent border-b-[10px] border-b-transparent border-l-[20px] border-l-[#00ffcc]" />
            </button>
            {/* Center decoration */}
            <div className="w-8 h-8 bg-[#00ffcc]/10 rounded-full border border-[#00ffcc]/20" />
          </div>
          
          {/* Overdrive Button */}
          <button
            onPointerDown={(e) => { e.preventDefault(); keysPressed.current['TouchOverdrive'] = true; }}
            onPointerUp={(e) => { e.preventDefault(); keysPressed.current['TouchOverdrive'] = false; }}
            className={`w-20 h-20 md:w-24 md:h-24 rounded-full flex flex-col items-center justify-center transition-all duration-300 touch-none shadow-lg ${
              overdrive >= 100 
                ? 'bg-[#ff3366] border-4 border-white animate-pulse scale-110 shadow-[0_0_30px_#ff3366]' 
                : 'bg-[#1a1a2e] border-2 border-[#ff3366]/40 opacity-50'
            }`}
          >
            <Zap size={24} className={overdrive >= 100 ? 'text-white' : 'text-[#ff3366]'} fill="currentColor" />
            <span className={`text-[8px] font-bold mt-1 ${overdrive >= 100 ? 'text-white' : 'text-[#ff3366]'}`}>OVERDRIVE</span>
          </button>

          {/* Fire Group */}
          <div className="flex flex-col items-center gap-1">
            <button
              onPointerDown={(e) => { e.preventDefault(); keysPressed.current['TouchFire'] = true; }}
              onPointerUp={(e) => { e.preventDefault(); keysPressed.current['TouchFire'] = false; }}
              onPointerLeave={(e) => { e.preventDefault(); keysPressed.current['TouchFire'] = false; }}
              className="w-20 h-20 md:w-24 md:h-24 bg-[#ff3366]/10 border-4 border-[#ff3366]/50 rounded-full flex items-center justify-center active:bg-[#ff3366]/40 active:scale-90 transition-all touch-none shadow-[0_6px_0_rgba(255,51,102,0.3)] active:translate-y-1 active:shadow-none"
            >
              <div className="w-8 h-8 bg-[#ff3366] rounded-sm rotate-45 shadow-[0_0_15px_rgba(255,51,102,0.5)]" />
            </button>
            <span className="text-[10px] text-[#ff3366] font-bold uppercase tracking-widest opacity-50">Fire</span>
          </div>
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
