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
const PLAYER_SPEED = 3;
const BULLET_SPEED = 5;
const ENEMY_DIVE_SPEED = 2;
const ENEMY_BULLET_SPEED = 2.5;
const ENEMY_ROWS = 5;
const ENEMY_COLS = 8;
const ENEMY_SPACING = 55;

type GameState = 'LOADING' | 'START' | 'PLAYING' | 'GAME_OVER';

interface Bullet {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
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

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('LOADING');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [wave, setWave] = useState(1);
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
  const particles = useRef<Particle[]>([]);
  const trails = useRef<Trail[]>([]);
  const shake = useRef(0);
  const flash = useRef(0);
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

  // Initialize stars
  useEffect(() => {
    stars.current = Array.from({ length: 100 }, () => ({
      x: Math.random() * CANVAS_WIDTH,
      y: Math.random() * CANVAS_HEIGHT,
      size: Math.random() * 2 + 1,
      speed: Math.random() * 2 + 0.5,
      opacity: Math.random() * 0.5 + 0.2
    }));
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

  // Initialize enemies
  const initEnemies = (waveNum: number) => {
    const newEnemies: Enemy[] = [];
    const isBossWave = waveNum % 5 === 0;
    const formationType = isBossWave ? 'BOSS' : waveNum % 4; // 1, 2, 3, 0
    
    const createEnemy = (x: number, y: number, type: number): Enemy => ({
      x, y, width: 35, height: 35, alive: true, type,
      isDiving: false, isReturning: false, diveX: 0, diveY: 0,
      originX: x, originY: y, diveType: 'normal', turnY: 0,
      diveTime: 0, diveStartX: 0, diveStartY: 0
    });

    if (isBossWave) {
      const bossHealthVal = 1000 + (waveNum / 5) * 500;
      newEnemies.push({
        x: CANVAS_WIDTH / 2 - 60,
        y: -150,
        width: 120,
        height: 100,
        alive: true,
        type: 0,
        isDiving: false,
        isReturning: false,
        diveX: 0,
        diveY: 0,
        originX: CANVAS_WIDTH / 2 - 60,
        originY: 80,
        isBoss: true,
        health: bossHealthVal,
        maxHealth: bossHealthVal,
        phase: 1,
        moveDir: 1,
        lastShotTime: 0
      });
      setBossHealth({ current: bossHealthVal, max: bossHealthVal });
    } else {
      setBossHealth(null);
      if (formationType === 1) {
        // Grid
        for (let row = 0; row < ENEMY_ROWS; row++) {
          for (let col = 0; col < ENEMY_COLS; col++) {
            const x = col * ENEMY_SPACING + 80;
            const y = row * ENEMY_SPACING + 60;
            newEnemies.push(createEnemy(x, y, row % 3));
          }
        }
      } else if (formationType === 2) {
        // V-shape
        for (let row = 0; row < 5; row++) {
          for (let col = 0; col < 9; col++) {
            if (row === Math.abs(col - 4)) {
              const x = col * ENEMY_SPACING + 60;
              const y = row * ENEMY_SPACING + 60;
              newEnemies.push(createEnemy(x, y, 1));
            }
            if (row > 1 && row - 1 === Math.abs(col - 4)) {
              const x = col * ENEMY_SPACING + 60;
              const y = row * ENEMY_SPACING + 60;
              newEnemies.push(createEnemy(x, y, 2));
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
          newEnemies.push(createEnemy(x, y, i % 3));
        }
        for (let i = 0; i < 10; i++) {
          const angle = (i / 10) * Math.PI * 2;
          const x = centerX + Math.cos(angle) * (radiusX / 2) - 17.5;
          const y = centerY + Math.sin(angle) * (radiusY / 2) - 17.5;
          newEnemies.push(createEnemy(x, y, 0));
        }
      } else {
        // Checkerboard / U-Shape
        for (let row = 0; row < 5; row++) {
          for (let col = 0; col < 9; col++) {
            if ((row + col) % 2 === 0) {
              const x = col * ENEMY_SPACING + 60;
              const y = row * ENEMY_SPACING + 60;
              newEnemies.push(createEnemy(x, y, row % 3));
            }
          }
        }
      }
    }
    enemies.current = newEnemies;
  };

  const startGame = () => {
    audio.init();
    audio.playBGM();
    setScore(0);
    setLives(3);
    setWave(1);
    livesRef.current = 3;
    waveRef.current = 1;
    invulnerableUntil.current = 0;
    playerPos.current = { x: CANVAS_WIDTH / 2 - PLAYER_WIDTH / 2, y: CANVAS_HEIGHT - 80 };
    bullets.current = [];
    enemyBullets.current = [];
    particles.current = [];
    trails.current = [];
    shake.current = 0;
    flash.current = 0;
    initEnemies(1);
    setGameState('PLAYING');
  };

  // Input handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
      keysPressed.current[e.code] = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
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
    if (gameState !== 'PLAYING') return;

    // Player movement
    let isMoving = false;
    if ((keysPressed.current['ArrowLeft'] || keysPressed.current['TouchLeft']) && playerPos.current.x > 0) {
      playerPos.current.x -= PLAYER_SPEED;
      isMoving = true;
    }
    if ((keysPressed.current['ArrowRight'] || keysPressed.current['TouchRight']) && playerPos.current.x < CANVAS_WIDTH - PLAYER_WIDTH) {
      playerPos.current.x += PLAYER_SPEED;
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
          audio.playOverdrive?.(); // Optional sound
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

        if (isOver) {
          // Super Overdrive Shot
          for (let i = -2; i <= 2; i++) {
            bullets.current.push({
              x: playerPos.current.x + PLAYER_WIDTH / 2 - 2 + i * 15,
              y: playerPos.current.y,
              vx: i * 0.5,
              vy: -BULLET_SPEED * 1.5
            });
          }
        } else if (isMulti) {
          bullets.current.push({ x: playerPos.current.x + PLAYER_WIDTH / 2 - 10, y: playerPos.current.y });
          bullets.current.push({ x: playerPos.current.x + PLAYER_WIDTH / 2 + 6, y: playerPos.current.y });
          bullets.current.push({ x: playerPos.current.x + PLAYER_WIDTH / 2 - 2, y: playerPos.current.y - 10 });
        } else {
          bullets.current.push({
            x: playerPos.current.x + PLAYER_WIDTH / 2 - 2,
            y: playerPos.current.y,
          });
        }
        audio.playShoot();
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
        audio.playEnemyShoot();
      }
    }

    // Update enemies formation
    const currentEnemyDiveSpeed = ENEMY_DIVE_SPEED + waveRef.current * 0.2;
    const formationOffset = (Math.sin(Date.now() / 1200) * 60);
    
    enemies.current.forEach((enemy) => {
      if (!enemy.alive) return;

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
            audio.playEnemyShoot();

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

      enemy.originY += 0.01 + (waveRef.current * 0.002);

      if (!enemy.isDiving && !enemy.isReturning) {
        enemy.x = enemy.originX + formationOffset;
        enemy.y = enemy.originY;
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
        } else if (enemy.y > CANVAS_HEIGHT) {
          enemy.y = -40;
          enemy.isDiving = false;
          enemy.isReturning = true;
        }
      } else if (enemy.isReturning) {
        const targetX = enemy.originX + formationOffset;
        const targetY = enemy.originY;
        
        const dx = targetX - enemy.x;
        const dy = targetY - enemy.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < currentEnemyDiveSpeed) {
          enemy.isReturning = false;
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
      const aliveEnemies = enemies.current.filter(e => e.alive && !e.isDiving && !e.isReturning);
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
        audio.playDive();
      }
    }

    // Collision detection
    bullets.current.forEach((bullet, bIdx) => {
      enemies.current.forEach((enemy) => {
        if (enemy.alive &&
            bullet.x > enemy.x && bullet.x < enemy.x + enemy.width &&
            bullet.y > enemy.y && bullet.y < enemy.y + enemy.height) {
          
          if (enemy.isBoss) {
            enemy.health! -= 10;
            setBossHealth({ current: enemy.health!, max: enemy.maxHealth! });
            bullets.current.splice(bIdx, 1);
            audio.playEnemyHit();
            flash.current = 0.2;
            
            if (enemy.health! <= 0) {
              enemy.alive = false;
              setBossHealth(null);
              setScore(s => s + 5000 * (waveRef.current / 5));
              
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

          audio.playEnemyHit();
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
    const hitMargin = 12;
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
        audio.playPlayerHit(); // Or a shield break sound
        return;
      }

      // Overdrive invulnerability
      if (isOverdriveActive.current) return;

      audio.playPlayerHit();
      shake.current = 20;
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
    if (aliveEnemies.length === 0) {
      waveRef.current += 1;
      setWave(waveRef.current);
      initEnemies(waveRef.current);
      
      // Wave title effect
      const isBossWave = waveRef.current % 5 === 0;
      setWaveTitle(true);
      setTimeout(() => setWaveTitle(false), 2000);
    }

    if (aliveEnemies.some(e => e.y + e.height > CANVAS_HEIGHT && !e.isDiving && !e.isReturning)) {
      setGameState('GAME_OVER');
    }
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    // Clear with slight trail effect
    ctx.fillStyle = 'rgba(2, 2, 5, 0.3)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.save();
    
    // Apply screen shake
    if (shake.current > 0) {
      const dx = (Math.random() - 0.5) * shake.current;
      const dy = (Math.random() - 0.5) * shake.current;
      ctx.translate(dx, dy);
      shake.current *= 0.9;
    }

    // Parallax Starfield
    stars.current.forEach(s => {
      s.y += s.speed;
      if (s.y > CANVAS_HEIGHT) {
        s.y = -10;
        s.x = Math.random() * CANVAS_WIDTH;
      }
      ctx.fillStyle = `rgba(255, 255, 255, ${s.opacity})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
    });

    // Grid (Perspective effect)
    ctx.strokeStyle = 'rgba(0, 255, 204, 0.05)';
    ctx.lineWidth = 1;
    const gridSpacing = 40;
    const gridOffset = (Date.now() / 20) % gridSpacing;
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

    // Trails
    trails.current.forEach(t => {
      ctx.globalAlpha = (t.life / t.maxLife) * 0.4;
      ctx.fillStyle = t.color;
      ctx.beginPath();
      ctx.arc(t.x, t.y, (t.width / 2) * (t.life / t.maxLife), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1.0;

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

    // Player
    const isInvulnerable = Date.now() < invulnerableUntil.current;
    const blink = Math.floor(Date.now() / 100) % 2 === 0;
    
    if (!isInvulnerable || blink) {
      ctx.save();
      ctx.translate(playerPos.current.x + PLAYER_WIDTH / 2, playerPos.current.y + PLAYER_HEIGHT / 2);
      
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
      ctx.fillStyle = isOverdriveActive.current ? '#ff3366' : '#00ffcc';
      ctx.shadowColor = isOverdriveActive.current ? '#ff3366' : '#00ffcc';
      ctx.fillRect(b.x, b.y, 4, isOverdriveActive.current ? 20 : 12);
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

      // Rotation for diving/returning
      if (enemy.isDiving || enemy.isReturning) {
        const angle = Math.atan2(enemy.y - (enemy.y - 1), enemy.x - (enemy.x - (enemy.diveX || 0)));
        ctx.rotate(angle + Math.PI/2);
      }

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

    // Flash
    if (flash.current > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${flash.current * 0.3})`;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      flash.current *= 0.9;
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
          <span className="text-[10px] text-gray-500 uppercase tracking-[0.3em]">Score</span>
          <span className="text-2xl font-bold text-[#00ffcc] tracking-tighter">{score.toString().padStart(6, '0')}</span>
        </div>
        
        {combo > 1 && (
          <motion.div 
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            key={combo}
            className="flex flex-col items-center"
          >
            <span className="text-[10px] text-[#ff3366] font-bold uppercase tracking-widest">Combo</span>
            <span className="text-3xl font-black text-[#ff3366] italic">x{combo}</span>
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
          {waveTitle && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <div className="text-center">
                <h2 className={`text-5xl md:text-6xl font-black tracking-[0.2em] italic drop-shadow-[0_0_20px_rgba(255,255,255,0.5)] ${wave % 5 === 0 ? 'text-[#ff3366]' : 'text-white'}`}>
                  {wave % 5 === 0 ? 'BOSS BATTLE' : `WAVE ${wave}`}
                </h2>
                <div className={`h-1 w-full mt-2 shadow-[0_0_10px_currentColor] ${wave % 5 === 0 ? 'bg-[#ff3366] text-[#ff3366]' : 'bg-[#00ffcc] text-[#00ffcc]'}`} />
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
        <div className="w-full max-w-[600px] mt-8 px-6 flex justify-between items-center select-none">
          {/* Movement Group */}
          <div className="flex gap-6">
            <button
              onPointerDown={(e) => { e.preventDefault(); keysPressed.current['TouchLeft'] = true; }}
              onPointerUp={(e) => { e.preventDefault(); keysPressed.current['TouchLeft'] = false; }}
              onPointerLeave={(e) => { e.preventDefault(); keysPressed.current['TouchLeft'] = false; }}
              className="w-20 h-20 bg-[#1a1a2e] border-2 border-[#00ffcc]/40 rounded-2xl flex items-center justify-center active:bg-[#00ffcc]/20 active:scale-95 transition-all touch-none shadow-[0_4px_0_rgba(0,255,204,0.2)] active:translate-y-1 active:shadow-none"
            >
              <div className="w-0 h-0 border-t-[12px] border-t-transparent border-r-[24px] border-r-[#00ffcc] border-b-[12px] border-b-transparent" />
            </button>
            <button
              onPointerDown={(e) => { e.preventDefault(); keysPressed.current['TouchRight'] = true; }}
              onPointerUp={(e) => { e.preventDefault(); keysPressed.current['TouchRight'] = false; }}
              onPointerLeave={(e) => { e.preventDefault(); keysPressed.current['TouchRight'] = false; }}
              className="w-20 h-20 bg-[#1a1a2e] border-2 border-[#00ffcc]/40 rounded-2xl flex items-center justify-center active:bg-[#00ffcc]/20 active:scale-95 transition-all touch-none shadow-[0_4px_0_rgba(0,255,204,0.2)] active:translate-y-1 active:shadow-none"
            >
              <div className="w-0 h-0 border-t-[12px] border-t-transparent border-l-[24px] border-l-[#00ffcc] border-b-[12px] border-b-transparent" />
            </button>
          </div>
          
          {/* Action Group */}
          <div className="flex items-center gap-6">
            <button
              onPointerDown={(e) => { e.preventDefault(); keysPressed.current['TouchOverdrive'] = true; }}
              onPointerUp={(e) => { e.preventDefault(); keysPressed.current['TouchOverdrive'] = false; }}
              className={`w-20 h-20 rounded-full flex flex-col items-center justify-center transition-all duration-300 touch-none shadow-lg ${
                overdrive >= 100 
                  ? 'bg-[#ff3366] border-4 border-white animate-pulse scale-110 shadow-[0_0_30px_#ff3366]' 
                  : 'bg-[#1a1a2e] border-2 border-[#ff3366]/40 opacity-50'
              }`}
            >
              <Zap size={24} className={overdrive >= 100 ? 'text-white' : 'text-[#ff3366]'} fill="currentColor" />
              <span className={`text-[8px] font-bold mt-1 ${overdrive >= 100 ? 'text-white' : 'text-[#ff3366]'}`}>OVERDRIVE</span>
            </button>

            <div className="flex flex-col items-center gap-1">
              <button
                onPointerDown={(e) => { e.preventDefault(); keysPressed.current['TouchFire'] = true; }}
                onPointerUp={(e) => { e.preventDefault(); keysPressed.current['TouchFire'] = false; }}
                onPointerLeave={(e) => { e.preventDefault(); keysPressed.current['TouchFire'] = false; }}
                className="w-24 h-24 bg-[#ff3366]/10 border-4 border-[#ff3366]/50 rounded-full flex items-center justify-center active:bg-[#ff3366]/40 active:scale-90 transition-all touch-none shadow-[0_6px_0_rgba(255,51,102,0.3)] active:translate-y-1 active:shadow-none"
              >
                <div className="w-8 h-8 bg-[#ff3366] rounded-sm rotate-45 shadow-[0_0_15px_rgba(255,51,102,0.5)]" />
              </button>
              <span className="text-[10px] text-[#ff3366] font-bold uppercase tracking-widest opacity-50">Fire</span>
            </div>
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
