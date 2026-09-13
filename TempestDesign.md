# TEMPEST - Technical Design Document & Architecture Reference

This document serves as the master engineering and design reference for the HTML5 / JavaScript vector recreation of Dave Theurer's classic 1981 Atari arcade game **TEMPEST**. It provides a common taxonomy, coordinate system definitions, level transition mathematics, level vanishing point data, and runtime debugging controls.

---

## 1. System Architecture & Component Taxonomy

The application is built with vanilla modern JavaScript using standard HTML5 Canvas 2D without third-party frameworks, faithfully reproducing the look and feel of the original Atari QuadraScan vector hardware.

```
                  ┌─────────────────────────────────────┐
                  │             main.js                 │
                  │   (Bootstrap, DOM & URL Routing)    │
                  └──────────────────┬──────────────────┘
                                     │
      ┌──────────────────────────────┼──────────────────────────────┐
      ▼                              ▼                              ▼
┌───────────────┐            ┌───────────────┐              ┌───────────────┐
│ input.js      │            │ game.js       │              │ audio.js      │
│ (Spinner,     │◄───────────┤ (State Machine│─────────────►│ (POKEY Sound  │
│  Mouse, Keys) │            │  Rules Engine)│              │  Synthesizer) │
└───────────────┘            └───────┬───────┘              └───────────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    ▼                                 ▼
          ┌───────────────────┐             ┌───────────────────┐
          │ web.js            │             │ enemies.js        │
          │ (16 Parametric    │             │ (Flippers, Tankers│
          │  Tube Geometries) │             │  Spikers, Spikes) │
          └─────────┬─────────┘             └─────────┬─────────┘
                    │                                 │
                    └────────────────┬────────────────┘
                                     ▼
                          ┌─────────────────────┐
                          │ renderer.js         │
                          │ (Vector Engine,     │
                          │  Bloom, Transitions)│
                          └─────────────────────┘
```

### Component Roles
* **`main.js`**: Application entry point, window event dispatching, canvas resizing, URL parameter routing, and test shortcuts.
* **`game.js`**: Central state coordinator (`ATTRACT`, `RATE_YOURSELF`, `PLAYING`, `LEVEL_WARP`, `PLAYER_DYING`, `ENTER_INITIALS`, `GAME_OVER`).
* **`renderer.js`**: Atari QuadraScan vector rendering engine. Implements beam glows, line blooming, perspective projection, 16-ray sunburst explosions, and camera transitions.
* **`web.js`**: Parametric geometry definitions for all 16 arcade wells directly translated from Dave Theurer's original 6502 assembly files (`ALDIS2.MAC` / `WORSCR`).
* **`enemies.js`**: Invader lifecycle, movement, collision detection, pulsing animations, and division logic (e.g. Tankers splitting into Flippers).
* **`player.js`**: Claw Blaster physics, lane boundary tracking, projectile firing, and Superzapper logic.
* **`audio.js`**: Web Audio API implementation of Atari's procedural POKEY sound chip channels.
* **`input.js`**: Low-latency steering input handling for rotary spinners (Pointer Lock), mouse radial aiming, trackpad wheel emulation, and keyboard taps.

---

## 2. Coordinate Systems & The Two Center Points

Understanding coordinate spaces is essential to the math behind rendering and level transitions:

### A. World Coordinates
* Symmetrical normalized coordinate space centered at $(0, 0)$.
* Spans $X \in [-85.1, +85.1]$ and $Y \in [-85.1, +85.1]$.
* $Z_{\text{depth}} \in [0.0, 1.0]$, where $Z = 1.0$ is the outer playfield rim (closest to camera) and $Z = 0.0$ is the distant abyss hole / vanishing point.

### B. Screen / Viewport Coordinates
* HTML5 Canvas pixel space where top-left is $(0, 0)$ and $+Y$ points downwards.
* **Responsive Viewport Scale**: Computed dynamically based on screen dimensions to maximize playfield footprint while providing clean margins for the top HUD and bottom Superzapper display.

### C. The Two Critical Screen Centers
1. **Center of the Play Area ($C = [CX, CY]$)**:
   * The physical centroid of the active display area on screen (represented as the **Red Dot** in our design taxonomy).
   * In `renderer.js`: `screenCx = this.viewport.centerX`, `screenCy = this.viewport.centerY`.
   * This is where Deep Space particles originate during warp transit.
2. **Visual Vanishing Point / Center of Tube Shape ($H = [HX, HY]$)**:
   * The visual vanishing point of the specific well geometry (represented as the **Black Dot** in our design taxonomy).
   * For **Closed Tubes** (Circle, Triangle, Peanut, Cross, etc.), this is the geometric centroid of the inner abyss hole polygon at $Z = 0.0$.
   * For **Open Trenches** (V-Trench, Flat Ribbon, Staircase, U-Channel), this is the perspective apex where all corridor boundary ribs converge.
   * **Crucial Observation**: On many levels, $H$ does **not** coincide with $C$! (e.g., in Level 1 Circle, the abyss hole sits lower on screen than the play area center).

---

## 3. Level Transition Lifecycle & Taxonomy

When a level is completed (or when triggered via the `W` key / warp button), the game initiates a seamless 3-stage transition lasting 4.8 seconds:

```
[0.0s] ──────────────────────► [1.9s] ─────────────► [2.6s] ──────────────────────────► [4.8s]
        STAGE 1: TUBE DIVE              STAGE 2:              STAGE 3: NEXT LEVEL EMERGENCE
        Hole glides H0 -> C            DEEP SPACE             Both Tube & Stars glide C -> H_next
        Camera zooms 1x -> 4.5x        Particles stream       Scale expands 0.035 -> 1.0
        Avoid Spikes warning           from C (stationary)    White-to-color vector bloom shift
        Purple debris emerges          Embryonic dot @ C      Snap & Level Start
```

### Stage 1: The Tube Dive (0.0s – 1.9s)
* **Goal**: The camera accelerates down the current corridor towards the abyss hole, expanding the tube past screen boundaries.
* **The Centering Problem & Fix**:
  * If the tube simply scales in place around the screen center, the off-center hole drifts far down or off-screen, creating a jarring visual snap when deep space starts at screen center.
  * **Solution**: On **every single animation frame**, the tube's visual vanishing point $H(t)$ translates smoothly from its initial screen position $H_0$ to the Center of the Play Area $C$:
    $$H(t) = H_0 + (C - H_0) \cdot t^{1.8} \quad \text{where } t = \frac{\text{stateTimer}}{\text{diveDuration}}$$
    $$\text{zoom}(t) = 1.0 + t^{2.3} \cdot 3.5$$
  * Canvas transform:
    ```javascript
    ctx.translate(H_t.x, H_t.y);
    ctx.scale(zoom, zoom);
    ctx.translate(-H_0.x, -H_0.y);
    ```
  * By $t = 1.9\text{s}$, the center of the tube hole sits **exactly at $C$**.
* **Player Mobility & Spikes**:
  * Spikes remain in the tube and are dangerous.
  * If spikes are present, `"AVOID SPIKES"` pulses at top center.
  * The player retains full steering and shooting capability to dodge or shoot spikes as the Claw dives from $Z = 1.0 \to 0.0$.
* **Abyss Space Debris**:
  * Inside the abyss hole, purple and violet particles swarm and expand outward, originating from $H(t)$ and arriving at $C$.

### Stage 2: Deep Space Fly-Through (1.9s – 2.6s)
* **Goal**: The old tube is completely gone; the player hurtles through deep space.
* **Visuals**:
  * 3D particle field of QuadraScan purple, violet, and electric blue debris streams radially outward from the Center of the Play Area $C$.
  * Because Stage 1 finished with the hole aligned at $C$, there is **zero jump or discontinuity**.
  * Top Center: `LEVEL  <nextLevel>` rendered in vector blue directly under high score initials.
  * Bottom Center: `SUPERZAPPER RECHARGE` in vector blue.
  * Exact Center $C$: A tiny embryonic white wireframe ($scale = 0.035$) with a glowing white core dot appears.

### Stage 3: Next Level Emergence & Growth (2.6s – 4.8s)
* **Goal**: The new level expands outward from deep space to full size, locking into place ready for combat.
* **Dual-Vanishing-Point Motion**:
  * The new level's resting hole center is $H_{\text{next}}$.
  * To avoid visual distortion, **BOTH** the Deep Space Fly-Through particle origin **AND** the expanding wireframe vanishing point move together, frame-by-frame, from $C$ to $H_{\text{next}}$:
    $$\text{progress} = \frac{\text{stateTimer} - 2.6}{4.8 - 2.6}$$
    $$\text{ease} = 1.0 - (1.0 - \text{progress})^{2.5}$$
    $$VP(t) = C + (H_{\text{next}} - C) \cdot \text{ease}$$
    $$\text{scale}(t) = 0.035 + 0.965 \cdot \text{ease}$$
  * Deep space debris emits radially from $VP(t)$.
  * Next level wireframe is transformed:
    ```javascript
    ctx.translate(VP_t.x, VP_t.y);
    ctx.scale(scale, scale);
    ctx.translate(-H_next.x, -H_next.y);
    ```
  * Color begins as brilliant pure white (`#ffffff`), shifting into the authentic level color as it passes $65\%$ expansion.
  * At $4.8\text{s}$, the wireframe hits scale $1.0$ at $H_{\text{next}}$, locks with the arcade slam sound, and spawns the Player Claw!

---

## 4. All 16 Levels: Geometries & Visual Vanishing Points

Dave Theurer's original level sequence (`WELSEQ` from `ALDIS2.MAC`) maps wave numbers to 16 distinct well shapes:

| Wave / Level | Well ID | Shape Name | Topology | Dave Theurer Vanish $(X, Y)$ | Hole Centroid $(X, Y)$ | Description |
| :---: | :---: | :--- | :---: | :---: | :---: | :--- |
| **Level 1** | 0 | **Circle** | Closed | $(0.0, +36.5)$ | $(0.0, +30.9)$ | 16-sided circular cylinder. Hole sits slightly lower than center. |
| **Level 2** | 1 | **Square** | Closed | $(0.0, +36.5)$ | $(0.0, +30.5)$ | Rectangular box tube. |
| **Level 3** | 2 | **Cross** | Closed | $(0.0, +36.5)$ | $(0.0, +30.9)$ | Plus sign cross shape. |
| **Level 4** | 3 | **Peanut** | Closed | $(0.0, +18.2)$ | $(0.0, +16.0)$ | Narrow waisted dumbbell shape. |
| **Level 5** | 4 | **4-Key** | Closed | $(0.0, +36.5)$ | $(0.0, +30.9)$ | Clover / 4-prong diamond key. |
| **Level 6** | 5 | **Triangle** | Closed | $(0.0, +36.5)$ | $(0.0, +36.3)$ | Equilateral triangle, horizontal base on bottom, apex UP. |
| **Level 7** | 6 | **Clover** | Closed | $(0.0, +18.2)$ | $(0.0, +15.5)$ | 4-leaf clover flower. |
| **Level 8** | 7 | **V-Trench** | Open | $(0.0, -36.5)$ | $(0.0, -30.9)$ | Upright V trench corridor. Ribs converge downward. |
| **Level 9** | 13 | **Staircase** | Open | $(0.0, -62.1)$ | $(0.0, -54.0)$ | Stepped zigzag V corridor. |
| **Level 10** | 9 | **U-Channel** | Open | $(0.0, +37.2)$ | $(0.0, +31.7)$ | Deep U-shaped trench. |
| **Level 11** | 8 | **Flat Ribbon** | Open | $(0.0, -40.3)$ | $(0.0, -32.7)$ | Horizontal open plane corridor. |
| **Level 12** | 12 | **Heart** | Closed | $(0.0, +69.9)$ | $(0.0, +58.9)$ | Symmetrical heart shape. Hole is in upper half. |
| **Level 13** | 14 | **Star** | Closed | $(0.0, +22.0)$ | $(0.0, +18.9)$ | 8-pointed star tube. |
| **Level 14** | 15 | **Wave** | Open | $(0.0, -45.4)$ | $(0.0, -38.6)$ | Undulating undulating wave trench. |
| **Level 15** | 10 | **Jagged** | Open | $(0.0, -22.8)$ | $(0.0, -19.0)$ | Irregular asymmetric trench corridor. |
| **Level 16** | 11 | **Lying 8** | Closed | $(0.0, +0.8)$ | $(0.0, +0.8)$ | Figure-8 infinity symbol. Centered near $(0, 0)$. |

---

## 5. URL Parameters Reference

You can pass query parameters to `index.html` to jump directly into specific levels, bypass intro flows, or enable diagnostics:

| Parameter | Example | Function |
| :--- | :--- | :--- |
| `level` | `?level=8` | Jumps directly to Level 8 in **PLAYING** mode, bypassing Attract and Rate Yourself. |
| `debug` or `vp` | `?debug=1` | Enables the on-screen **Visual Vanishing Point Debug Overlay**. |
| `god` | `?god=1` | Enables **God Mode** (invincibility to spikes during tube dive transitions). |
| `warp` | `?warp=1` | Spawns and immediately triggers the Level Warp sequence. |
| `v` | `?v=warp_center1`| Cache buster for module imports. |

*Example Combination*:
`http://localhost:8088/index.html?level=4&debug=1&v=test1` (Starts on Level 4 with Vanishing Point debug overlay active).

---

## 6. Diagnostic Controls & Keyboard Shortcuts

| Key / Control | Function | Context |
| :--- | :--- | :--- |
| **`Tab`** or **`H`** | **Toggle Arcade Reference Guide & Stats Drawer** | Any |
| **`Escape`** | **Close Arcade Reference Guide** | Guide Open |
| **`W`** or **`N`** | **Trigger Level Warp** immediately | Playing |
| **`V`** or **`D`** | **Toggle Vanishing Point Debug Overlay** | Any |
| **`I`** | **Nudge Tube Vanishing Point UP** ($Y - 1.0$) | Debug Overlay Active |
| **`K`** | **Nudge Tube Vanishing Point DOWN** ($Y + 1.0$) | Debug Overlay Active |
| **`J`** | **Nudge Tube Vanishing Point LEFT** ($X - 1.0$) | Debug Overlay Active |
| **`L`** | **Nudge Tube Vanishing Point RIGHT** ($X + 1.0$) | Debug Overlay Active |
| **`R`** | **Reset Vanishing Point** to default math coordinates | Debug Overlay Active |
| **`P`** | **Print/Copy Vanishing Point Override** to console | Debug Overlay Active |
| **`Space`** / **`Enter`** | Fire Blaster / Select menu item | Playing / Attract |
| **`Z`** | Trigger Superzapper | Playing |
| **`C`** | Insert Coin (increments credit counter) | Attract |
| **`1`** | 1-Player Start | Attract / Rate Yourself |
| **`Arrow Left` / `Right`** | Rotate Claw / Change Lanes | Playing |
| **`Mouse Aiming`** | Direct radial lane targeting | Playing |

---

## 7. Cabinet Bezel Presentation & Arcade Compendium Drawer

To maximize player immersion and recreate the visual experience of standing in front of a real 1981 Atari cabinet:

### A. Primary Left Panel (Zero Distractions)
* **Marquee Header**: High-resolution QuadraScan Atari Tempest logo artwork.
* **Side Art Bezel**: Full-color archival illustration (`Tempest-LeftPanel.png`) showcasing the iconic monster heads, vortex, and pink light beams.
* **Control Panel**:
  * Mechanical coin slot button (`INSERT 25¢ COIN`) with authentic credit counter LED readout.
  * Gold arcade `1 PLAYER START` push button with breathing illumination glow.
  * Quick-access `⚡ ARCADE MANUAL & STATS [TAB]` button.
* **Cabinet Serial Plate**: `ATARI COIN-OP NO. 04812 • 1981`.

### B. Slide-Out Arcade Guide Drawer (`#arcade-guide-drawer`)
Accessible at any time via the **`[TAB]`** or **`[H]`** key, or by clicking the manual button:
* **Tactical Action Buttons**: On-screen click targets for `FIRE [SPACE]`, `SUPER ZAPPER [Z]`, and `WARP [W]`.
* **Enemy Identification & Scoring**: Detailed vector art and point breakdowns for Fuseball, Pulsars, Flippers, faceted Tankers, and Spikers.
* **Arcade Rotary Controls**: Guide to mouse radial direct-aiming, trackpad wheel emulation, and keyboard controls.
* **Hall of Fame Top Scores**: Dynamic leaderboard of the top 8 high scores.
* **Dismissal**: Smoothly closes via **`[ESC]`**, **`[TAB]`**, clicking the `✕` close button, or clicking the darkened backdrop scrim.

---

## 8. Claw Vector Shatter & Arcade Explosion Audio

### A. Booming Sub-Bass Explosion Audio Engine (`playClawExplosion`)
When the Claw collides with a Spike during level transitions or dies in combat, the previous thin sound is replaced with a massive multi-layered arcade explosion:
1. **Sub-Bass Body & Physical Punch**:
   * Sine wave sweep starting at 45Hz and diving down to 32Hz over 1.4s with 0.85 peak gain.
2. **Resonant Vector Blast & Noise Body**:
   * White noise buffer running through a dual low-pass filter (cutoff sweeping from 850Hz to 60Hz) and a resonant bandpass filter (Q=3.2 at 180Hz) with non-linear distortion.
3. **High-Voltage Vector Screen Ionization Screech**:
   * Triangle oscillator diving from 920Hz down to 38Hz, mimicking the CRT cathode ray overload of Atari QuadraScan vector hardware.

### B. Visual Claw Shatter (`createClawExplosion`)
* **Stationary Core Sunburst**: An authentic 16-ray brilliant pure white sunburst flash blossoms at the player's exact 3D tube coordinates `(lane, z)`.
* **16 Vector Line Shards**: 16 individual glowing line fragments (in `#ffff00`, `#ffea00`, `#ff3344`, `#ffffff`, `#ffaa00`) shatter outward with 360-degree outward velocities, rotational spin, and decaying alpha over 1.5 seconds.
* **Transition Spike Collision**: Spikes chip away from blaster fire as the Claw dives down the tube; if the player fails to steer clear, the Claw detonates into the full 16-shard explosion directly in the 3D tube corridor.

---

## 9. Pulsars & Fuseballs: Geometry, Spawning, & Modulated Audio

### A. Pulsars
* **Spawn Progression**:
  * Wave 3+: Introduced inside Tankers (split into 2 Pulsars upon destruction).
  * Wave 9+: Spawn directly from the abyss into tube lanes.
* **Waveform Geometry**:
  * Spans across the active lane at depth $z$.
  * Composed of 6 vector segments forming an oscillating sawtooth/zigzag waveform.
  * Stretches vertically along the lane normal: peak height oscillates between 0.08x lane width (flat/dormant) and 0.76x lane width (tall/electrified).
  * When electrified (`pulseHeight > 0.42`), flashes bright cyan and white with high-voltage jitter, shooting electric spark arcs from the waveform peaks. If the player touches an electrified Pulsar near the rim, the Claw is instantly destroyed.
* **Dynamic Modulated Audio Hum (`updatePulsarHum`)**:
  * Continuous low electrical throb created with dual triangle oscillators (base frequency 75Hz, sub-oscillator at 37.5Hz) running through a resonant lowpass filter.
  * Modulates dynamically with the highest Pulsar's `pulseHeight`:
    * Frequency rises from 75Hz up to 160Hz as the pulsar stretches taller.
    * Gain swells from quiet (0.04) up to loud (0.26) at maximum height, subsiding as it flattens.

### B. Fuseballs
* **Spawn Progression**:
  * Wave 3+: Introduced inside Tankers (split into 2 Fuseballs).
  * Wave 11+: Spawn directly onto the lane divider boundary ribs.
* **Multi-Color Electric Spark Visuals**:
  * Travels strictly along the boundary ribs between lanes.
  * Zips unpredictably down and up the rib, reversing direction every 0.25–0.85s.
  * 6-spoke rapidly spinning electric spark star with jagged spokes and an outer rotating pentagram spark ring.
  * Color cycles through neon colors (`#ff0055`, `#00ffff`, `#ffff00`, `#00ff66`, `#ffffff`, `#cc00ff`) every 60ms.
  * Point values: 250 points on the rim, 500 points midway, 750 points deep in the tube.

---

## 10. Attract Mode TEMPEST Logo: Expansion & Shifting Neon Underglow

### A. Jiggle Removal
* The previous random coordinate jitter (`jitterX`/`jitterY`) during the logo hold phase has been completely removed. The logo rests in a solid, elegant vector lock.

### B. Smooth Line Width Doubling (1x to 2x)
* Over the 2.1-second hold phase, the vector stroke width multiplier ramps smoothly:
  $$\text{strokeMultiplier} = 1.0 + \text{holdProgress} \times 1.0 \quad (1.0 \to 2.0)$$

### C. High-Contrast White Lettering
* Over the 2.1-second hold phase, the vector stroke width multiplier ramps smoothly from 1.0x to 2.0x, providing thick, crisp white vector letters on the dark vector screen.

---

## 11. Project Architecture & Release Build System

### A. Modular Directory Organization
* **`css/`**: Houses `style.css` and a local `Makefile` that concatenates CSS into `candidates/tempest.css`.
* **`js/`**: Houses all modular source JavaScript components (`vector_font.js`, `web.js`, `audio.js`, `input.js`, `player.js`, `enemies.js`, `renderer.js`, `game.js`, `main.js`) and a local `Makefile` that concatenates them in topological dependency order into `candidates/tempest.js`.
* **`images/`**: Houses all cabinet art and SVG assets with an asset-packaging `Makefile`.
* **`dist/`**: The standalone production distribution containing a single bundled `js/tempest.js`, a single `css/tempest.css`, `images/`, and a version-stamped `index.html`.

### B. Recursive Makefile Targets
* **`make` / `make package`**: Recursively compiles sub-makefiles, validates syntax and duplicate functions via ESLint, and constructs the production `dist/` directory.
* **`make build`**: Aggregates code into `candidates/` and verifies syntax.
* **`make clean`**: Removes `dist/`, `candidates/`, and any temporary build files.
* **`make validate`**: Runs ESLint across all source and candidate files.
* **`make serve`**: Launches local HTTP server serving directly from `dist/` on port `8088`.
* **`make relsman`**: Deploys the package to `sman@stevemansour.com:~/public_html/games/tempest/` using atomic `.new` directory swap over SSH port 1291.


