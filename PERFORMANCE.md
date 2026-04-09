# NEON DEFENDER — Performance Notes

_Last updated: 2026-04-09 (session 2)_

> **Usage**: Update "Current State" at the end of each session so the next session
> can start here instead of reading conversation history.

---

## Current State

**Branch**: `perf/speed-polish-2`
**Last commit**: `094afb1` — perf: mobile boss rendering — 3 gaps fixed
**Build**: passing (TSC clean, Vite build OK)
**Firebase**: deployed and live

**Verified fixed** (tested on device):

- Stage 2 entry slowdown ✅
- Stage 2-2 entry jolt ✅
- BGM gradual slowdown ✅
- Graze slow-motion stuck at 0.8× permanently ✅
- Wingman top-left spawn ✅
- Tutorial Stage blur / motion accumulation: improved (shadowScale 0.7→0.5 at tier 0 on mobile) ✅
- Boss fight heavy: partially improved (3 render gaps closed); still the heaviest point

**Open issues / known bugs**:

- Boss fight still noticeably heavy on mobile — further investigation needed

**Next task**: Object pooling for bullets and scraps (see "Next Optimization Candidates" below)

---

## Completed (branch: `perf/speed-polish-2`)

### GC pressure / BGM timer drift (iOS `setInterval` delay)

Root cause: `enemies.current.filter(e => e.alive)` ran unconditionally every frame
(60 calls/sec on a 45s survival wave = 2,700 ephemeral arrays). On iOS, accumulated
GC pauses delay `setInterval(125ms)`, causing BGM to gradually slow down mid-wave.

| Fix                                                                                                      | Location                    |
| -------------------------------------------------------------------------------------------------------- | --------------------------- |
| Remove per-frame `aliveEnemies` pre-filter; iterate `enemies.current` directly with `!alive` guard       | Bullet-enemy collision loop |
| `enemies.current.some()` instead of `filter().some()` for boss check                                     | Same section                |
| Tesla arc chain: iterate `enemies.current` with guard instead of `aliveEnemies.filter(e => e !== enemy)` | Tesla hit handler           |
| Overdrive chain: same pattern                                                                            | Overdrive explosion         |
| Player-enemy sweep collision: iterate `enemies.current` with alive guard                                 | AABB sweep loop             |
| `hardEnemies` filter: switch to `enemies.current.filter()` (no detached variable)                        | Auto-space logic            |
| Survival enemy prune threshold: 24 → 10 (max 4–5 visible at once; dead ones piled up)                    | Enemy prune block           |
| Scrap rendering: batch all dots into one `beginPath/fill` (was N×`ctx.save/restore`)                     | Scrap draw loop             |

### Stage 2 entry slowdown

| Fix                                                                           | Cause                                              |
| ----------------------------------------------------------------------------- | -------------------------------------------------- |
| `scraps.current = []` and `asteroids.current = []` added to `startNextWave()` | Entities from previous waves kept updating/drawing |
| Cap fragment spawning to `maxAsteroids` (splits were bypassing the cap)       | Mobile asteroid count exceeded 8/12 limit          |

### Stage 2-2 entry jolt (wave boundary)

| Fix                                                                                  | Cause                                        |
| ------------------------------------------------------------------------------------ | -------------------------------------------- |
| Survival spawn check: manual count loop instead of `filter().length` per frame       | 60 alloc/sec in spawn throttle               |
| Game-over check: `enemies.current.some()` instead of `filter(e => e.alive)`          | Unnecessary array creation                   |
| Scraps cleared in wave-clear handler (pre-warp), not only in `startNextWave`         | Scraps piled during 1400ms warp animation    |
| `survivalTimerRef` fixed to use `getSurvivalDurationFromStage()` (was hard-coded 30) | Spurious timer call at wave 4 entry          |
| BGM: skip `playBGM()` restart when stage hasn't changed                              | AGM AudioContext work at every wave boundary |

### Wingman position init

| Fix                                                          | Cause                                                 |
| ------------------------------------------------------------ | ----------------------------------------------------- |
| `wingmanPos.current` set to player position on upgrade grant | Default `{x:0,y:0}` caused top-left spawn + slow lerp |

### Mobile shadow reduction (tier 0 unification)

Root cause: at render tier 0, `shadowScale = 0.7` on mobile → 18 enemies × `shadowBlur 10.5px`
cost more than a boss at tier 1 (`shadowBlur 7.5px`). Tutorial stage was heavier than
Chase-1 despite having no survival mechanics.

| Fix                                                        | Effect                                                                                     |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `shadowScale` tier 0 on mobile: 0.7 → 0.5 (same as tier 1) | `shadowBlur 10.5` → `7.5` per enemy at tier 0; ~28% GPU shadow reduction on Tutorial stage |

### Graze slow-motion permanent bug

| Fix                                                                   | Cause                                                                                          |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `handleGraze()`: add `setTimeout(150ms)` to restore `timeScale = 1.0` | `timeScale` set to 0.8 on graze with no reset; every other hit-stop had a reset; graze did not |

### Mobile boss rendering — 3 render gaps

Root cause: three rendering paths did not correctly apply mobile tier reductions during boss fights.

| Fix                                                                           | Gap                                                                                                  |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| LASER phase-3 beam count: `isReducedBossFx` (tier 1) now also caps at 2 beams | Was only capped at tier 2; mobile always at tier ≥1 during boss → 4 full-screen strokes redundantly  |
| Tractor beam `shadowBlur`: `20` → `20 * shadowScale`                          | Hardcoded value ignored `shadowScale`; shadow fired at full cost even at tier 2 (shadowScale=0)      |
| Nebula frame divisor: mobile + boss + tier 1 → 3 (skip 2-of-3 frames)         | Was 2 (skip 1-of-2); `createRadialGradient + screen composite` is expensive during heaviest scenario |

### Mobile formation floor (tier ≥1 when ≥10 enemies alive)

| Fix                                                                        | Cause                                                              |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Pre-raise render and simulation tier to 1 on mobile when ≥10 enemies alive | 18 formation enemies at tier 0 cost more GPU than a boss at tier 1 |

### Mobile boss render/simulation floor (immediate tier ≥1)

| Fix                                                                                    | Cause                                                                                  |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Clamp `nextTier` and `nextSimulationTier` to ≥1 on mobile when `waveHasBossRef` is set | p95 moving average took 2–3s to cross threshold; boss caused visible slowdown on entry |

### Scrap magnet sqrt elimination

| Fix                                                                                                          | Location          |
| ------------------------------------------------------------------------------------------------------------ | ----------------- |
| Range check: `Math.sqrt` → squared-distance comparison; `Math.sqrt` only for in-range scraps (normalisation) | Scrap magnet loop |
| Collection check: `dist < 30` → `distSq < 900`                                                               | Same              |

### Other (Phase 4, earlier)

- Frame-rate independence: dt-scaled movement
- Adaptive render tier: shadowBlur, collision stride, particle caps by device
- Mobile 60fps cap (ProMotion guard), idle 30fps throttle
- Relic cache: per-frame lookup eliminated
- Math.pow → exponentiation operator (`**`) where compiled away
- Audio node reuse; oscillator pool

---

## Next Optimization Candidates

Ordered by impact-to-effort ratio for iOS mobile.

### 0. Boss simulation tier gating (targeted, no new deps)

**Directly addresses "boss still heavy" on mobile.**

Current state: boss phase logic, laser rotation, tractor beam drag, and tentacle physics
run at full cost regardless of `simulationLoadTier`. Only particle/bullet caps are affected.

Candidates for gating:
- Tentacle segment physics: at sim tier ≥1, update every 2nd segment only (mirroring
  the render stride already applied to collision detection)
- Laser beam angle: at sim tier 2, quantise to 8 steps instead of continuous sin/cos
- Tractor drag: at sim tier ≥1, skip drag update on frames where no player contact (cheap guard)

Low refactor risk — all changes are inside the boss update block, isolated to mobile paths.

### 1. Object pooling (high impact, no new deps)

Today: bullets and scraps are `push()`-ed and destroyed by filtering or splicing,
creating constant heap churn. Object pooling reuses dead slots.

Pattern:

```ts
// Pre-allocate
const bulletPool: Bullet[] = Array.from({ length: 200 }, () => ({ alive: false, ...defaults }));
// Spawn: find first dead slot
const b = bulletPool.find(b => !b.alive)!;
Object.assign(b, { alive: true, x, y, ... });
// Destroy: flip flag only — no splice, no alloc
b.alive = false;
// Iterate: for loop with alive guard (already done for enemies)
```

This is the structural fix that makes GC pressure go away permanently.
Current enemy loop already uses this pattern — extend it to bullets and scraps.

### 2. Layered canvas (medium impact, no new deps)

Background (stars, asteroids) moves slowly and doesn't change every frame.
Split into two `<canvas>` elements:

- **bg layer**: redraws only when dirty (parallax scroll tick, asteroid move)
- **game layer**: clears and redraws every frame

Saves ~30–40% of `clearRect` + star/asteroid draw calls per frame on busy frames.

### 3. OffscreenCanvas + Worker (high impact, requires refactor)

Move the entire render pipeline to a Web Worker via `canvas.transferControlToOffscreen()`.
Main thread handles only input and state; worker handles draw.
Structurally eliminates all rendering from the main thread — BGM timers, touch events,
and `setInterval` are no longer competing with draw calls.

**Safari support**: OffscreenCanvas is supported since Safari 16.4 / iOS 16.4 (2023).
**Cost**: significant refactor — all canvas API calls must move to worker; state must
be serialized/transferred across the boundary. Not worth it until pooling + layered
canvas are done and profiling still shows a bottleneck.

### 4. Pixi.js / WebGL renderer (high impact, high effort, new dep)

Replace Canvas 2D with WebGL via Pixi.js. Sprite batching and GPU-side compositing
handle hundreds of objects with negligible CPU cost.

**When to consider**: when enemy/particle count is intentionally increased (Phase 3+
content), or when Canvas 2D is confirmed as the bottleneck via profiler. Current
game scale (≤50 enemies, ≤200 bullets) does not saturate Canvas 2D on modern
devices — GC and main-thread pressure are the real bottleneck today.

**Requires user approval** before adding as a dependency.

---

## Profiling Tips (iOS Safari)

1. Safari → Develop → [device] → Connect
2. Timelines tab → JavaScript & Events + Rendering & Layout
3. Record a full survival wave (45s)
4. Look for: GC events in JS timeline, long frames in rendering, `setInterval` drift

Key metric: if `setInterval` callbacks for BGM fire at 130ms+ instead of 125ms
mid-wave, GC pressure is still present.
