<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# NEON DEFENDER

A neon arcade space shooter inspired by Galaga and Galaxian.  
Dodge, graze, combo, and blast your way through 5 stages.

**[▶ Play on itch.io](https://ken2san.itch.io/neon-defender)** · **[Play on Firebase](https://neon-defender-57165.web.app)**

</div>

## Features

- 5 stages with escalating obstacles, enemies, and bosses
- **Slingshot mechanic** — drag to aim, release to snap your ship across the screen
- **Combo system** — chain kills for score multipliers, tracked with live HUD display
- **Relic upgrades** — pick power-ups between stages (no duplicates)
- **Brain performance tracking** — post-run stats: accuracy, max combo, grazes, condition diagnosis
- **High score persistence** — personal best saved across sessions
- Mobile-friendly (touch + slingshot gesture support)

## Stack

React · TypeScript · Vite · Tailwind CSS v4 · HTML5 Canvas · Firebase Hosting

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   ```
   npm install
   ```
2. Run the development server:
   ```
   npm run dev
   ```
3. Build for production:
   ```
   npm run build
   ```

## Debug Mode

On-screen overlays and input logging are disabled by default. Enable with a URL parameter:

| Parameter  | Effect |
| ---------- | ------ |
| `?debug=1` | Show **Perf_Baseline** (FPS / frame-time) and **Input_Debug** overlays; enable `[NEON]` console logging; unlock stage-skip buttons |
| `?debug=0` | Disable debug mode and clear the persisted setting |

The setting persists in `localStorage` — once enabled with `?debug=1`, it stays active across reloads until explicitly cleared with `?debug=0`.
