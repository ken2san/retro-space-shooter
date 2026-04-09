# NEON DEFENDER — Performance Notes

_Last updated: 2026-04-09_

> **Usage**: Update "Current State" at the end of each session so the next session
> can start here instead of reading conversation history.

---

## Current State

**Branch**: `perf/speed-polish-2`
**Last commit**: `cfc1223` — docs: update PERFORMANCE.md and Roadmap.md
**Build**: passing (TSC clean, Vite build OK)
**Firebase**: deployed and live

**Verified fixed** (tested on device):
- Stage 2 entry slowdown ✅
- Stage 2-2 entry jolt ✅
- BGM gradual slowdown during Stage 2-2 survival wave — **deployed but not yet confirmed on device**

**Open issues / known bugs**: none currently tracked

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
