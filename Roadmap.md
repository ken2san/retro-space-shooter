# NEON DEFENDER — Development Roadmap

_Last updated: 2026-04-09_

> Note: Core gameplay (player, enemies, bosses, upgrades, relics, audio, mobile) is already implemented.
> This roadmap covers technical hardening, design review, and release.

---

## Phase 1 — Technical Foundation ✅ Completed

- Extracted constants, types, and components from App.tsx monolith
- Fixed Tailwind v4 class name migrations
- Enforced TypeScript strictness (zero type errors)
- Finalized .gitignore, .vscode settings, and project structure docs

---

## Phase 2 — Game Design Review ✅ Completed

- Difficulty curve normalization: wave variance, boss HP/time-to-kill calibration
- Economy pacing: scrap → XP → level, Overdrive gain sources
- Slingshot/shield collision fairness hardening (swept AABB, stun/knockback drift)
- Shield vs obstacle interaction: player recoil on guard, obstacle kick on slingshot
- Touch control tuning: deadzone, drag feel, flick detection, mobile-only post-release speed
- Relic balance audit; low-impact relics identified and flagged

---

## Phase 3 — Architecture (Partial / Deferred)

App.tsx is still largely monolithic. The following modules have been extracted:

- `src/game/enemies.ts` — enemy spawning and formation logic
- `src/game/stage.ts` — stage/wave/sector helpers
- `src/game/upgrades.ts` — upgrade and relic definitions
- `src/game/progression.ts` — XP / level-up logic
- `src/hooks/useInput.ts` — input handling
- `src/components/` — HUD, ship, overlays

Remaining game loop, render pipeline, and state management are still in App.tsx.
Not blocking release. Deferred until after Phase 5.

---

## Phase 4 — Polish ✅ Completed

- Frame-rate independence: dt-scaled movement, dive, boss, star, ambush timer
- Performance overlay (FPS p50/p95, frame ms p50/p95, object counts)
- Adaptive render/simulation tier system (shadowBlur, collision stride, particle caps)
- Mobile 60fps cap (ProMotion guard), idle 30fps throttle
- Relic cache: per-frame lookup cost eliminated
- Sound design: master/SFX level rebalance, BGM mix clarity
- Visual effects: particle density, trail count/alpha tuning
- Stage 4 "Chase" level design complete:
  - V-wedge formation entry + pincer pairs from sides
  - Structured canyon corridor obstacle layout
  - BEAM_TURRET: fires from canyon wall, tracks player, charge telegraph ring; deflect with slingshot to destroy; ricochets off walls and enemies
  - ENTERING immunity window + warp-in flicker visual
- Stage 5 "Final Front": VICTORY state confirmed end-to-end

---

## Phase 5 — Release ✅ Active

### Goal

Ship a stable, deployable build to Firebase Hosting.

### Done

- Production build optimized (Vite vendor chunk split)
- Firebase Hosting deployed (mainline build live)
- Victory state bugfixes: wave-clear relic override, `startNextWave` loop guard past wave 10, level-up upgrade screen suppression on final boss kill
- `loadGame()` wave clamped to 10 (protects against stale save data)

### Remaining

- Final QA pass: full playthrough waves 1–10 on desktop and mobile
- Confirm no regression on touch controls (slingshot, shield, movement)
- Merge/close or delete stale local branches (`feature/tutorial`, `perf/speed-polish`, `phase4-polish-remaining`, `slingshot/energy-wall`)

---

## Phase 6 — Performance Polish ✅ Completed

Branch: `perf/speed-polish-2`

See [PERFORMANCE.md](PERFORMANCE.md) for full details of completed fixes and
next optimization candidates.

### Done

- GC pressure / BGM timer drift: removed per-frame `aliveEnemies` filter; iteration guards throughout
- Survival enemy prune threshold lowered (24 → 10)
- Scrap rendering batched (N×`ctx.save/restore` → one `beginPath/fill`)
- Stage 2 entry: scraps + asteroids cleared at wave boundary
- Stage 2-2 entry jolt: 5 causes isolated and fixed
- Wingman position init on upgrade grant
- Mobile shadow reduction: `shadowScale` tier 0 on mobile 0.7 → 0.5
- Graze slow-motion permanent bug fixed
- Mobile boss rendering: 3 render gaps closed (laser beam cap, tractor shadowBlur, nebula frame divisor)
- Mobile formation floor: immediate tier ≥1 when ≥10 enemies alive
- Mobile boss floor: immediate tier ≥1 on boss wave entry
- **Object pooling**: bullets, enemyBullets, scraps — zero heap alloc per shot
- Scrap render artifact (cyan polygon): `moveTo` restored before each `arc()`
- iOS Home Screen shortcut stale JS: `Cache-Control: no-store` for `/index.html`
- Boss sim gating: LASER phase-3 collision capped to 2 beams at tier ≥1; SWARM filter GC eliminated

### Remaining candidates (if boss fight still heavy after device measurement)

1. **Layered canvas** — separate bg/game layers; reduce clear+redraw cost (no new deps)
2. **OffscreenCanvas + Worker** — move render off main thread (Safari 16.4+, requires refactor)
3. **Pixi.js** — WebGL renderer (requires approval; worth it only if entity counts grow)

---

## Current Status

Active phase: **None — all planned phases complete**
Branch: `main`
Build: passing (tsc, Vite)
Firebase: live

Game is stable and demo-ready. Significant performance improvements confirmed on device.
No active development branch.
