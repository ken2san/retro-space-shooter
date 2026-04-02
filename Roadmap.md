# NEON DEFENDER — Development Roadmap

_Last updated: 2026-04-02_

> Note: Core gameplay (player, enemies, bosses, upgrades, relics, audio, mobile) is already implemented.
> This roadmap covers technical hardening, design review, and release.

---

## Phase 1 — Technical Foundation ✅ Completed

### Goal

Establish a maintainable codebase before any further feature work.

### Scope

- Extract constants, types, and components from App.tsx monolith
- Fix Tailwind v4 class name migrations
- Enforce TypeScript strictness (zero type errors)
- Finalize .gitignore, .vscode settings, and project structure docs

---

## Phase 2 — Game Design Review

### Goal

Audit the current game for feel, balance, and scope — decide what stays, what changes, what gets cut.

### Scope

- Gameplay balance: enemy difficulty curves, boss phases, power-up frequency
- UX review: HUD clarity, touch controls, game state transitions
- Feature audit: identify redundant or broken mechanics
- Produce a concise design spec before any new code is written

### Design Review Focus (Now)

- Difficulty curve normalization:
  - Reduce wave-to-wave spike variance (especially elite + ambush overlap windows)
  - Re-check boss HP/time-to-kill against current weapon growth
- Economy pacing:
  - Normalize scrap -> XP -> level pacing to prevent early snowball
  - Rebalance Overdrive gain sources (kill, scrap, boss kill) for consistent cadence
- Defensive fairness:
  - Validate integrity loss patterns against bullet density and dive burst timing
  - Keep recovery windows readable on both desktop and mobile
- Relic balance:
  - Mark low-impact relics vs high-impact relics and flatten outliers
  - Ensure selection frequency aligns with stage pacing
- Time-scale consistency:
  - Audit stacked slow-motion sources (Chrono, slingshot feedback, overdrive) for control feel stability

---

## Phase 3 — Architecture

### Goal

Break App.tsx into logical, maintainable modules aligned with the finalized design.

### Scope

- Game loop / render pipeline → `src/game/`
- Input handling → `src/hooks/useInput.ts`
- Enemy AI / spawning → `src/game/enemies.ts`
- UI components → `src/components/`
- State management consolidation

---

## Phase 4 — Polish

### Goal

Raise the quality bar on performance, mobile UX, and audio.

### Scope

- Canvas rendering performance profiling
- Mobile touch control refinement
- Sound design review (BGM, SFX balance)
- Visual effects tuning (particles, trails)

### Execution Plan (Now)

1. Measurement baseline first (mandatory)
   - Fix a reproducible capture window: same stage segment, 60s run, same input pattern
   - Record FPS and frame time with p50 and p95
   - Record object counts (enemies, bullets, particles) at the same time
2. Targeted optimization pass
   - Address one hotspot group at a time (timers, particle bursts, collision-heavy windows)
   - Avoid batching unrelated changes in a single pass
3. Re-measure and compare
   - Compare only against the fixed baseline scenario
   - Keep changes only when metrics improve without damaging gameplay readability
4. Regression gate
   - Run lint and tests after each logical optimization unit
   - Reject changes that improve metrics but worsen control feel or difficulty fairness

### Phase 4 Checkpoints

- Completed
  - Initial frame-rate dependency reduction in `src/App.tsx`
    - Replaced modulo-based throttles with timestamp cooldown checks
    - Converted selected fixed-step timers to dt-scaled updates
    - Corrected Stage 2 survival mini-bar denominator to 45s
  - Added lightweight in-game performance overlay in `src/App.tsx`
    - Displays FPS p50/p95, frame time p50/p95, and live object counts
    - Updates at 500ms intervals with bounded sample windows to keep overhead low
  - Enemy dive movement and ambush timer fixes
    - All dive y-movement types (zigzag/sweep/sine/normal) now multiply by dt
    - Ambush timer uses actual frame time instead of hardcoded 16ms
  - Boss movement and boss timer fixes
    - Path-follow entry movement now dt-scaled
    - Boss lateral movement now dt-scaled
    - Tractor beam timer and laser rotation timer use dt-based ms instead of 16ms
- Next
  - Run 60s baseline captures per fixed scenario and compare perf overlay values
  - Audit remaining hotspots: star/particle movement, formation float, asteroid drift

---

## Phase 5 — Release

### Goal

Ship a stable, deployable build to Firebase Hosting.

### Scope

- Production build optimization (Vite)
- Firebase Hosting deployment
- Final gameplay pass and bug fixes

---

## Current Status

Active phase: **Phase 4 (Polish)**
