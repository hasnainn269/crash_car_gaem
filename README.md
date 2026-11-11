# One-Tap Drift 🏎️💨

An arcade 2D top-down driving and reaction game built purely with HTML5 Canvas, CSS3, and vanilla JavaScript.

## Overview

In **One-Tap Drift**, your sports car accelerates along an endless, winding asphalt track automatically. You don't need to steer or brake continuously—instead, your timing and reflex are tested before every sharp corner. Tap at the exact apex of each bend to initiate a high-speed drift!

- **Perfect Timing:** Hit the sweet spot for +100 points, bonus coins, and explosive combos.
- **Good / Late Timing:** Awards partial points and keeps your car on the road.
- **Missed Turn:** Fail to drift in time and your car flies off into the gravel barrier, ending the run.
- **Progression:** Speed steadily increases, timing windows tighten, and coins allow you to unlock custom high-performance sports cars in the Garage.

---

## Project Structure

```
one-tap-drift/
├── index.html        # Semantic HTML5 layout, UI layers, HUD, modals, and canvas
├── style.css         # Modern arcade styling, responsive layouts, animations
├── game.js           # Full game engine, 2D physics, procedural track, Web Audio, LocalStorage
└── README.md         # Game overview, controls, rules, and local setup guide
```

---

## How to Run Locally

Because this game relies purely on standard HTML5, CSS3, and vanilla JavaScript without external build tools, CDNs, or dependencies:

1. **Direct Browser Execution:**
   - Double-click `index.html` (or right-click -> Open with Google Chrome / Firefox / Safari / Edge).
2. **With a Local HTTP Server (Recommended for Web Audio):**
   - In terminal:
     ```bash
     npx serve .
     # or
     python3 -m http.server 8080
     ```
   - Open `http://localhost:8080` in your web browser.

---

## Controls

| Action | Control |
|---|---|
| **Drift** | Spacebar / Left Mouse Click / Touchscreen Tap |
| **Pause / Resume** | `P` key / `Escape` key / On-screen Pause button |
| **Restart Run** | `Spacebar` on Game Over screen / Restart button |
| **Mute / Unmute** | Audio icon toggle button |

*Tip: Buttons and menus prevent accidental drifts through event bubbling safeguards.*

---

## Gameplay Rules & Features

1. **Automatic Driving:** The car adheres to the road centerline with natural heading interpolation and speed acceleration proportional to distance travelled.
2. **Timing Radar & Meter:** As each turn approaches, a directional arrow (`⬅ TURN LEFT` or `TURN RIGHT ➔`) and a timing bar appear. The needle sweeps from Early into the blue **PERFECT** sweet spot.
3. **Combo Multiplier:** Chaining consecutive drifts increases your combo multiplier up to **8x**, multiplying all drift scores.
4. **Coins & Garage:** Pick up gold coins along turns to unlock all 4 vehicles:
   - **Cobalt Apex** (Starter)
   - **Flame GT** (45 coins)
   - **Crimson Fury** (90 coins)
   - **Midas Velocity** (160 coins)
5. **Procedural Endless Road:** Endless smooth spline generation guarantees unbroken tracks with straightaways, S-bends, and hairpins.
6. **Local Persistence:** Personal best score, distance record, coins, car collection, and audio settings are safely persisted in `localStorage`.
