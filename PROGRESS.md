# RDSTR // Cold Gas Pursuit — Progress

Single source of truth for the design: `GAME_SPEC.md`. Reference photos of the Roadster: `reference/`.

## How to run
- Static site, no build step: serve the repo root (`node tools/serve.mjs 8123`) and open `http://localhost:8123/`.
- GitHub Pages serves `index.html` from the root (`.nojekyll` present). Libraries are vendored in `vendor/` and loaded through the import map; the game makes zero external requests.
- Headless QA: `node tools/smoke.mjs <scenario> screenshots/<prefix>` (scenarios in `tools/scenarios.mjs`: `boot`, `physics`, `wall`, `drive`, `keys`). `?test=1` exposes `window.__game.test` (deterministic physics stepping).

## Architecture (src/)
| Module | Responsibility |
|---|---|
| `core/Game.js` | Orchestrator, state machine, fixed-step loop, time scale / slow-mo / hit stop, safety net |
| `core/Renderer.js` | WebGLRenderer + postprocessing (bloom, ACES, grade, vignette, SMAA, speed blur + CA) |
| `core/Physics.js` | Rapier world, 1/120 s fixed step (max 4 substeps), interpolation, groups, F9 debug |
| `core/Input.js` | Keyboard + gamepad (Xbox), rebindable actions, rumble |
| `core/Settings.js` | Quality presets, volumes, bindings (localStorage) |
| `core/TestHooks.js` | Test API for headless QA |
| `vehicle/Vehicle.js` | Raycast vehicle: suspension, anti-roll, Pacejka-style tires, slip-vector wheelspin model, TC/ESC, AWD torque vectoring, downforce, drag, launch control, thrusters, air control, impact detection |
| `vehicle/EnergySystem.js` | Battery / BMS thermal / COPV pressure / Ghost / EMP |
| `vehicle/VehicleConfig.js` | Roadster, police cruiser, interceptor, SWAT, civilian specs; handling modes |
| `world/World.js` | Assembles the city; per-frame lamp lights, wet-road streaks, signals, rain, steam, train, culling; world queries |
| `world/CityGenerator.js` | Chunked geometry batches, street grid, lots, buildings (window shader), skyline LOD |
| `world/districts/*` | Base (land/water/boundary/waterfront), Downtown, Roads (connectors), Highway, Harbor, Construction, Canyon |
| `world/RoadBuilder.js` | Ribbon roads (elevated decks, ramps, bridges, canyon road) with trimesh colliders, barriers, pillars, lamps |
| `world/Terrain.js` | Heightfield hills with roads carved in (cut & fill) |
| `world/Props.js`, `PropModels.js` | Instanced destructible street furniture, near-set rendering, pooled debris |
| `world/Environment.js` | Sky dome, height fog chunk patch, moon + hemisphere, PMREM env map, time-of-day presets |
| `world/LightStreaks.js`, `Atmosphere.js`, `Decor.js`, `Train.js` | Wet-road reflections, rain/steam/water, neon & billboards, elevated train |
| `camera/CameraController.js` | Chase near/far, bumper, cinematic, scripted shots, sphere-cast collision, shake |
| `ui/HUD.js` | Speed arc gauge, power/battery/COPV arcs, mode, HP, warnings, prompts |

## Milestones
- [x] **M1 — Setup, collision and vehicle physics on a test city block**
- [x] M2 — Full city world, lighting, sky, atmosphere and post-processing
- [ ] M3 — Roadster and police models
- [ ] M4 — VFX, camera and game feel
- [ ] M5 — Police AI and heat system
- [ ] M6 — Audio
- [ ] M7 — Missions, races, scoring and progression
- [ ] M8 — Menus, garage, settings and polish

## M1 results (measured headless with `node tools/smoke.mjs physics` / `wall`)
- 0-60 mph 2.1 s, 0-100 mph 3.6 s, top speed 253 mph, 319 mph with Rear Rockets.
- Drift mode holds 25–50° slides indefinitely on throttle; lifting off and centring the wheel recovers. Track mode stays planted (TC/ESC caps drive to the friction ellipse).
- QA #1 wall test at 250 mph + rockets: head-on, 30° and 60° incidence all PASS (no penetration; glancing hits deflect along the wall keeping speed).
- Safety net pushes a car out through the nearest side wall or roof if it ever ends up inside a building.

## M2 results
- Halcyon Bay (~2.4 x 3 km): Downtown 8x8 grid (towers, plaza, parks, parking, 4-level garage, elevated train with stations),
  Highway Ring (elevated 6 lanes, 4 on-ramps, covered tunnel, unfinished spur = Highway Gap jump), Harbor (container yard,
  climbable container staircase jump, car-carrier ramp, gantry cranes, 3 piers, container ship, warehouses), Construction Zone
  (canal, Broken Bridge jump, road bridge, half-built towers, tower cranes, scaffolding, dirt kickers), Hillside Canyon
  (heightfield, 3 km hairpin loop with guard rails, gallery tunnel, lookout with skyline view, pine forest), Waterfront promenade.
- Every solid thing has a collider (single shared static body; ~6.8k colliders). Dev self-check reports 0 meshes without colliders.
- Street furniture (lamps, signals with cycling phases, benches, bins, hydrants, news boxes, bus stops, palms, trees, fences,
  stalls, parked cars, cones, barriers) is instanced and destructible (props snap off into pooled physics debris, respawn later).
- Lighting: moon shadow fitted around the player, hemisphere fill, nearest-lamp spot lights (count by quality), light pools and
  volumetric cones, PMREM env map, wet-road light streaks, height fog, night sky with stars/moon/clouds, skyline LOD.
- Time of day: Night / Dusk / Rainy Night. Rain streak volume around the camera, steam vents, blinking aviation beacons.
- Quality presets drive pixel ratio, shadows, draw distance, prop distance, lamp lights, bloom resolution, SMAA, rain density.
  Auto quality drop when FPS < 45 for 5 s. Downtown: ~190 draw calls, ~530k triangles.

## Next
- M3: detailed Roadster model (from reference photos) and police vehicle models.

## Known issues
- Player car still uses the collider-shaped proxy model until M3.
- Ramp/merge geometry on the Highway Ring is functional but simple (taper merge, no exit lanes except via the same ramps).
- Headless (SwiftShader) FPS is not representative of GPU performance.
