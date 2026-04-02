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
  - Star movement and particle movement audit
    - Star warp/scroll movement now multiplies by `dtRef.current`
    - Particle movement confirmed dt-consistent in all paths
- In Progress
- Completed
  - P4-1: Run 60s baseline captures per fixed scenario and compare perf overlay values
  - P4-2: Mobile touch control refinement
    - Tuned touch double-tap window to reduce accidental slingshot activation
    - Reduced touch slingshot deadzone and adjusted resistance for more responsive drag feel
    - Smoothed touch input velocity sampling to stabilize flick detection
  - P4-3: Sound design review (BGM/SFX balance)
    - Rebalanced master level and reduced peak-heavy SFX levels (slingshot, overdrive, player hit, explosion)
    - Slightly reduced kick/sub dominance in BGM to improve gameplay cue clarity
  - P4-4: Visual effects tuning (particles, trails)
    - Reduced explosion particle density on desktop/mobile
    - Reduced slingshot burst trail count and softened trail alpha intensity
    - Increased movement trail spawn interval to lower visual clutter

#### P4-1 Capture Log Template

Use one row per 60s run in the fixed scenario.

Fixed scenario (for all runs):

- Start from a fresh `New Game` state
- Capture window: first 60s from gameplay start
- Input pattern: standard movement + primary fire only (no overdrive trigger, no intentional slingshot burst)
- Device: same machine/browser/tab state for all runs
- Quality settings: unchanged between runs

Execution steps:

1. Launch the game with the current mainline build.
2. Run the fixed scenario for 60 seconds with the same input pattern.
3. Read performance overlay values at the end of the run.
4. Record one row in the table below.
5. Repeat at least 3 runs and use median values as the baseline reference.

| Run Date   | Build/Commit | Scenario                             | FPS p50 | FPS p95 | Frame ms p50 | Frame ms p95 | Enemies | Bullets | Enemy Bullets | Particles | Notes              |
| ---------- | ------------ | ------------------------------------ | ------- | ------- | ------------ | ------------ | ------- | ------- | ------------- | --------- | ------------------ |
| 2026-04-02 | de21773      | New Game / first 60s / std move+fire | 125.0   | 125.0   | 8.00         | 9.00         | 5       | 3       | 20            | 0         | run-1              |
| 2026-04-02 | de21773      | New Game / first 60s / std move+fire | 125.0   | 142.9   | 8.00         | 9.00         | 3       | 32      | 15            | 24        | run-2              |
| 2026-04-02 | de21773      | New Game / first 60s / std move+fire | 125.0   | 125.0   | 8.00         | 9.00         | 6       | 3       | 6             | 15        | run-3              |
| 2026-04-02 | de21773      | Median (run-1..run-3)                | 125.0   | 125.0   | 8.00         | 9.00         | 5       | 3       | 15            | 15        | baseline reference |

- Next (execute in order)
  - Compare current build against baseline and accept/reject each polish unit under Phase 4 Exit Criteria

### Phase 4 Exit Criteria

- Gameplay readability and control feel do not regress
- p95 frame time does not regress against fixed baseline scenario
- Lint and tests pass after each optimization unit

### Design Expansion Lane (Post-Phase 4)

Design expansion (new enemy or new stage variation) starts only after Phase 4 exit criteria are met.

#### Scope Guard

- Do not mix broad design changes with active polish tasks in the same implementation unit
- Keep release-path behavior stable while experiments are evaluated

#### Spike Protocol

1. One spike = one theme only
   - Example: one new enemy behavior OR one stage gimmick, not both
2. Implement with a runtime feature flag
   - Default OFF on mainline behavior until validated
3. Validate in the same 60s fixed scenario
   - Collect FPS/frame-time p50/p95 plus gameplay outcomes

#### Adoption Gates

- Fun/readability improves in playtest feedback
- No fairness regression (damage spikes, unavoidable overlap windows)
- No performance regression (p95 frame time)
- Existing lint/tests pass

#### Integration Order

1. Low risk: add behavior variants to existing enemies
2. Medium risk: introduce one new enemy type with low spawn rate
3. High risk: add stage-structure variation last

#### Rollback Rule

- If any gate fails, keep feature flag OFF and return to redesign

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
