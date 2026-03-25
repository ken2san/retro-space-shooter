/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Rocket, Trophy, Play, RotateCcw, Loader2 } from 'lucide-react';
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

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('LOADING');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [wave, setWave] = useState(1);
  const [assets, setAssets] = useState<Record<string, HTMLImageElement>>({});

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
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  // Detect touch device
  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
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
    const formationType = waveNum % 4; // 1, 2, 3, 0
    
    const createEnemy = (x: number, y: number, type: number): Enemy => ({
      x, y, width: 35, height: 35, alive: true, type,
      isDiving: false, isReturning: false, diveX: 0, diveY: 0,
      originX: x, originY: y, diveType: 'normal', turnY: 0,
      diveTime: 0, diveStartX: 0, diveStartY: 0
    });

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

    // Update shake & flash
    if (shake.current > 0) shake.current *= 0.85;
    if (shake.current < 0.5) shake.current = 0;
    if (flash.current > 0) flash.current -= 0.05;
    if (flash.current < 0) flash.current = 0;

    // Shooting
    if (keysPressed.current['Space'] || keysPressed.current['TouchFire']) {
      const now = Date.now();
      if (now - lastShotTime.current > 250) {
        bullets.current.push({
          x: playerPos.current.x + PLAYER_WIDTH / 2 - 2,
          y: playerPos.current.y,
        });
        audio.playShoot();
        lastShotTime.current = now;
      }
    }

    // Update bullets
    bullets.current = bullets.current
      .map((b) => ({ ...b, y: b.y - BULLET_SPEED }))
      .filter((b) => b.y > -20);

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
          enemy.alive = false;
          bullets.current.splice(bIdx, 1);
          setScore((s) => s + (enemy.isDiving ? 250 : 100));
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
    }

    if (aliveEnemies.some(e => e.y + e.height > CANVAS_HEIGHT && !e.isDiving && !e.isReturning)) {
      setGameState('GAME_OVER');
    }
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = '#020205';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.save();
    if (shake.current > 0) {
      const dx = (Math.random() - 0.5) * shake.current;
      const dy = (Math.random() - 0.5) * shake.current;
      ctx.translate(dx, dy);
    }

    // Starfield
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 60; i++) {
      const x = (Math.sin(i * 1234.5) * 0.5 + 0.5) * CANVAS_WIDTH;
      const y = ((Math.cos(i * 5432.1) * 0.5 + 0.5) * CANVAS_HEIGHT + Date.now() / 15) % CANVAS_HEIGHT;
      const size = i % 3 === 0 ? 2 : 1;
      ctx.globalAlpha = i % 2 === 0 ? 0.8 : 0.4;
      ctx.fillRect(x, y, size, size);
    }
    ctx.globalAlpha = 1.0;

    // Trails
    trails.current.forEach(t => {
      ctx.globalAlpha = (t.life / t.maxLife) * 0.4;
      ctx.fillStyle = t.color;
      ctx.beginPath();
      ctx.arc(t.x, t.y, (t.width / 2) * (t.life / t.maxLife), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    // Player
    const isInvulnerable = Date.now() < invulnerableUntil.current;
    const blink = Math.floor(Date.now() / 100) % 2 === 0;
    
    if (!isInvulnerable || blink) {
      const playerFrame = Math.floor(Date.now() / 150) % 2;
      const playerImg = assets[`player_${playerFrame}`];
      
      if (playerImg) {
        ctx.drawImage(playerImg, playerPos.current.x, playerPos.current.y, PLAYER_WIDTH, PLAYER_HEIGHT);
      } else {
        ctx.fillStyle = '#00ffcc';
        ctx.beginPath();
        ctx.moveTo(playerPos.current.x + PLAYER_WIDTH / 2, playerPos.current.y);
        ctx.lineTo(playerPos.current.x, playerPos.current.y + PLAYER_HEIGHT);
        ctx.lineTo(playerPos.current.x + PLAYER_WIDTH, playerPos.current.y + PLAYER_HEIGHT);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Bullets
    ctx.fillStyle = '#ff3366';
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#ff3366';
    bullets.current.forEach((b) => {
      ctx.fillRect(b.x, b.y, 4, 12);
    });
    
    // Enemy Bullets
    ctx.fillStyle = '#ffcc00';
    ctx.shadowColor = '#ffcc00';
    enemyBullets.current.forEach((b) => {
      ctx.beginPath();
      ctx.arc(b.x + 2, b.y + 6, 4, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.shadowBlur = 0;

    // Enemies
    const baseEnemyFrame = Math.floor(Date.now() / 200) % 4;
    enemies.current.forEach((enemy) => {
      if (!enemy.alive) return;
      
      const currentEnemyFrame = (enemy.isDiving || enemy.isReturning) ? (Math.floor(Date.now() / 100) % 4) : baseEnemyFrame;
      const enemyImg = assets[`enemy${enemy.type + 1}_${currentEnemyFrame}`];
      
      if (enemyImg) {
        ctx.drawImage(enemyImg, enemy.x, enemy.y, enemy.width, enemy.height);
      } else {
        const colors = ['#ffcc00', '#ff33cc', '#33ccff'];
        ctx.fillStyle = colors[enemy.type];
        ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);
      }
    });

    // Particles
    particles.current.forEach(p => {
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;

      ctx.save();
      ctx.translate(p.x, p.y);
      if (p.rotation !== undefined) {
        ctx.rotate(p.rotation);
      }

      if (p.type === 'line') {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        const len = p.size * 3;
        ctx.lineTo(-len, 0);
        ctx.stroke();
      } else {
        ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
      }
      ctx.restore();
    });
    ctx.globalAlpha = 1.0;

    ctx.restore(); // Restore from shake

    // Flash
    if (flash.current > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${flash.current})`;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
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
      <div className="relative border-8 border-[#1a1a2e] rounded-xl shadow-[0_0_50px_rgba(0,255,204,0.1)] overflow-hidden max-w-full max-h-[70vh] aspect-[3/4]">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="block w-full h-full object-contain"
        />

        {/* Overlay Screens */}
        <AnimatePresence>
          {/* Mobile Controls */}
          {gameState === 'PLAYING' && isTouchDevice && (
            <div className="absolute inset-0 pointer-events-none select-none">
              {/* Left/Right Buttons */}
              <div className="absolute bottom-4 left-4 flex gap-2 pointer-events-auto">
                <button
                  onPointerDown={() => keysPressed.current['TouchLeft'] = true}
                  onPointerUp={() => keysPressed.current['TouchLeft'] = false}
                  onPointerLeave={() => keysPressed.current['TouchLeft'] = false}
                  className="w-16 h-16 bg-white/10 border-2 border-[#00ffcc]/30 rounded-full flex items-center justify-center active:bg-[#00ffcc]/40 active:scale-95 transition-all"
                >
                  <div className="w-0 h-0 border-t-[10px] border-t-transparent border-r-[20px] border-r-[#00ffcc] border-b-[10px] border-b-transparent" />
                </button>
                <button
                  onPointerDown={() => keysPressed.current['TouchRight'] = true}
                  onPointerUp={() => keysPressed.current['TouchRight'] = false}
                  onPointerLeave={() => keysPressed.current['TouchRight'] = false}
                  className="w-16 h-16 bg-white/10 border-2 border-[#00ffcc]/30 rounded-full flex items-center justify-center active:bg-[#00ffcc]/40 active:scale-95 transition-all"
                >
                  <div className="w-0 h-0 border-t-[10px] border-t-transparent border-l-[20px] border-l-[#00ffcc] border-b-[10px] border-b-transparent" />
                </button>
              </div>
              
              {/* Fire Button */}
              <div className="absolute bottom-4 right-4 pointer-events-auto">
                <button
                  onPointerDown={() => keysPressed.current['TouchFire'] = true}
                  onPointerUp={() => keysPressed.current['TouchFire'] = false}
                  onPointerLeave={() => keysPressed.current['TouchFire'] = false}
                  className="w-20 h-20 bg-[#ff3366]/20 border-4 border-[#ff3366]/50 rounded-full flex items-center justify-center active:bg-[#ff3366]/60 active:scale-90 shadow-[0_0_20px_rgba(255,51,102,0.2)]"
                >
                  <div className="w-6 h-6 bg-[#ff3366] rounded-sm rotate-45" />
                </button>
              </div>
            </div>
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
              className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-8 text-center"
            >
              <motion.div
                animate={{ y: [0, -15, 0], rotate: [0, 5, -5, 0] }}
                transition={{ duration: 4, repeat: Infinity }}
                className="mb-8"
              >
                {assets.player_0 ? (
                  <img src={assets.player_0.src} alt="Player" className="w-24 h-24 drop-shadow-[0_0_15px_rgba(0,255,204,0.5)]" />
                ) : (
                  <Rocket size={80} className="text-[#00ffcc]" />
                )}
              </motion.div>
              <h1 className="text-6xl font-black mb-4 tracking-tighter italic text-transparent bg-clip-text bg-gradient-to-b from-white via-gray-300 to-gray-600">
                NEON DEFENDER
              </h1>
              <p className="text-gray-400 mb-10 max-w-xs text-sm leading-relaxed tracking-wide">
                The swarm is approaching. <br/>Engage thrusters and defend the sector.
              </p>
              <button
                onClick={startGame}
                className="group relative px-10 py-5 bg-[#00ffcc] text-black font-bold text-xl uppercase tracking-[0.2em] hover:scale-110 transition-all duration-300 shadow-[0_0_30px_rgba(0,255,204,0.3)]"
              >
                <span className="relative z-10 flex items-center gap-3">
                  <Play size={24} fill="currentColor" /> Launch Mission
                </span>
                <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-30 transition-opacity" />
              </button>
              <div className="mt-16 grid grid-cols-2 gap-12 text-[10px] text-gray-500 uppercase tracking-[0.4em]">
                <div className="flex flex-col gap-2">
                  <span className="text-gray-400">Movement</span>
                  <span>Arrow Keys</span>
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-gray-400">Weapon</span>
                  <span>Space Bar</span>
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

      {/* Footer */}
      <div className="mt-8 text-[9px] text-gray-700 uppercase tracking-[0.5em] flex items-center gap-4">
        <span>Arcade Revision 2.5</span>
        <span className="w-1 h-1 bg-gray-800 rounded-full" />
        <span>Sector 7-G Defense System</span>
      </div>
    </div>
  );
}
