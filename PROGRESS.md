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
| `world/*` | City generator (road graph, roads + markings, curbs, buildings w/ window shader), materials, textures |
| `camera/CameraController.js` | Chase near/far, bumper, cinematic, scripted shots, sphere-cast collision, shake |
| `ui/HUD.js` | Speed arc gauge, power/battery/COPV arcs, mode, HP, warnings, prompts |

## Milestones
- [x] **M1 — Setup, collision and vehicle physics on a test city block**
- [ ] M2 — Full city world, lighting, sky, atmosphere and post-processing
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

## Next
- M2: districts (Downtown, Harbor, Highway Ring, Construction, Canyon), street furniture, sky dome, fog, rain, street lights, wet-road streaks, env map.

## Known issues
- Player car still uses the collider-shaped proxy model until M3.
- Headless (SwiftShader) FPS is not representative of GPU performance.
