<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/ec044b0c-3c79-4297-8542-29af244d9bf8

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Run the app:
   `npm run dev`

## Debug Overlays

Two on-screen debug overlays are hidden by default. Enable them via URL parameter:

| Parameter | Effect |
|---|---|
| `?inputDebug=1` | Show **Perf_Baseline** (FPS / frame-time stats) and **Input_Debug** (mouse / touch / slingshot state) overlays during gameplay |
| `?inputDebug=0` | Disable overlays and clear the persisted setting |

The setting is persisted in `localStorage` — once enabled with `?inputDebug=1`, overlays remain visible across reloads until explicitly disabled with `?inputDebug=0`.
