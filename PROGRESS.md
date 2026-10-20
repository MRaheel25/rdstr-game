# RDSTR // Cold Gas Pursuit — Progress

Single source of truth for the design: `GAME_SPEC.md`. Reference photos of the Roadster: `reference/`.

## How to run
- Static site, no build step: serve the repo root (`node tools/serve.mjs 8123`) and open `http://localhost:8123/`.
- GitHub Pages serves `index.html` from the root (`.nojekyll` present). Libraries are vendored in `vendor/` and loaded through the import map; the game makes zero external requests.
- Headless QA: `node tools/smoke.mjs <scenario> screenshots/<prefix>` (scenarios in `tools/scenarios.mjs`: `boot`, `physics`, `wall`, `drive`, `keys`, `tour`, `car`, `fleet`, `fx`, `pursuit`, `evade`, `busted`, `audio`). `?test=1` exposes `window.__game.test` (deterministic physics stepping).

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
| `ui/HUD.js` | Speed arc gauge, power/battery/COPV arcs, mode, HP, heat stars + evade meter, warnings, prompts |
| `ui/Minimap.js`, `ui/Banner.js` | Rotating minimap (police, search cones, heli, drones, Air Stations, mission marker); big banners |
| `ai/Driver.js` | AI driver: pure pursuit, braking-distance corner speeds, obstacle probe, stuck recovery |
| `ai/Traffic.js` | Civilian traffic: kinematic lane following with signals, turns into physics bodies on contact range |
| `audio/*` | Web Audio: engine/buses/listener (`AudioEngine`), car (`CarAudio`), sirens/heli/drones (`PoliceAudio`), one-shots (`SFX`), adaptive music (`Music`), glue (`AudioSystem`) |
| `ai/Heat.js`, `ai/PoliceAI.js`, `ai/Radio.js` | Heat 0-5, evade/cooldown loop, busted timer; police units, roadblocks, spikes, heli, drones; dispatch subtitles |

## Milestones
- [x] **M1 — Setup, collision and vehicle physics on a test city block**
- [x] M2 — Full city world, lighting, sky, atmosphere and post-processing
- [x] M3 — Roadster and police models
- [x] M4 — VFX, camera and game feel
- [x] M5 — Police AI and heat system
- [x] M6 — Audio
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

## M3 results
- `vehicle/models/BodyBuilder.js`: loft generator (spline-interpolated crease lines, banded panels with crisp creases,
  exact wheel-arch cut-outs, separate door panels, mirrored halves, front/rear caps).
- `RoadsterModel.js`: modelled from the reference photos (faceted wedge, fender peaks with triangular LED headlights,
  full-width nose LED strip, bronze canopy, black sill rising to wide haunches, Kamm tail with full-width red bar,
  RDSTR plate that flips down to reveal rocket nozzles, four copper cold-gas outlets, finned diffuser, aero wheels with
  turbine blades and calipers). Animated: butterfly doors (G), wing rises with speed/braking/Flight mode, Flight-mode side
  vents, brake/reverse lights, headlight spots, Ghost Mode lights-off. Damage: panel dents at impact points, cracked-glass
  overlay, front splitter detaches. Paints: Pearl White, Red Multi-Coat, Midnight Silver, Matte Black, Deep Blue + 3 neon.
- `PoliceModels.js`: Patrol Cruiser (B/W livery, HALCYON BAY POLICE doors, unit numbers, push bar, light bar), Interceptor
  (low matte-black coupe, blue under-glow, hidden grille/rear strobes), armored SWAT truck (ram, SWAT livery), helicopter
  (rotors, searchlight spot + beam), pursuit drone (rotors, strobes, EMP ring). Shared LightBar strobe pattern.
- Draw-call control: wheels merged per material; police units bake a single-mesh LOD for distance.

## M4 results
- `fx/Particles.js`: instanced GPU particle systems (billboards + velocity-stretched streaks), skid-mark ribbon ring buffer.
- `fx/VFX.js`: tyre smoke lit by ambient + nearby lamps, sparks, glass shards, dust, water splashes, frost, fire,
  expanding rings, flash lights, explosions (fireball, smoke column, shockwave ring, flash), timed emitters (broken
  hydrants spray, burning wrecks, battery smoke), pooled physics debris (cleaned after 8 s), screen-crack overlay,
  directional cold-gas jets with shock diamonds from the real nozzle positions (rocket, cold-gas outlets, hover, RCS).
- `fx/VehicleFX.js`: per-wheel smoke, skid marks, dirt dust, wet spray, rim sparks (popped tyres), scraping sparks.
- `game/Stunts.js`: air time, height, flips / barrel rolls / spins, perfect landings, Cold Snap (tap Space > 8 m up:
  1.5 s at 0.25x, orbit cam, frost grade, frost shockwave on landing that shoves and damages police).
- Game feel: launch control kick + smoke, landing dust/water ring + camera dip, hit stop, wreck slow-mo, screen flash,
  takedown cam (`Game.startTakedownCam`, 6 s cooldown), water splash + reset, speed lines, chromatic aberration,
  radial blur, raindrops sliding on the lens at speed, FOV punch.
- Photo Mode (P): pauses, free camera, depth of field focused on the car, 5 filters, UI hidden.
- Control hints shown for the first minute (H toggles).

## M5 results (headless `pursuit`, `evade`, `busted` scenarios)
- Traffic: 10/18/26/32 civilian cars by quality (sedan, hatch, SUV, van), lane following on the road graph, stop at red
  signals, turn at intersections, become full physics bodies near the player (can be shunted), near-miss and honk events.
- Heat 0-5 from offences seen by police (speeding near units, destruction, hitting cars/police) with level unlocks per spec:
  1 cruisers follow/pull-over, 2 interceptors + ramming + PIT, 3 roadblocks + spike strips + helicopter, 4 SWAT + box-in +
  rolling blocks on the Ring, 5 EMP drones + heavy roadblocks. Max 8 chasing / 12 total units.
- Police drive with the shared AI driver; close pursuit uses ram cycles (contact, drop back, hit again), PIT from the rear
  quarter, box roles at heat 4+; out of sight they intercept via A* on the road graph (routes start along the current road so
  re-plans never double back) and later search around the last known position.
- Line of sight via raycasts (Ghost Mode cuts police view range), helicopter searchlight, drones that fire EMP (thrusters
  offline). Evade loop: lose visual -> EVADE meter fills outside search cones (faster under cover / in Ghost) -> COOLDOWN ->
  heat cleared (+EVADED banner). Reinforcements during evade spawn around the last known position, out of view range.
- Busted: stopped with 2 units within 7.5 m (or 1 unit while flooring it) for 3 s -> BUSTED; chassis HP 0 -> PURSUIT
  TERMINATED; respawn on the nearest road with heat cleared. Wrecked units explode/burn, trigger takedown cam + radio.
- Measured: heat 3 units reach the player within ~10-20 s of spawning; heat 5 drones EMP the player; evade from heat 2
  completes in ~19 s parked out of sight; busted fires at 3.0 s with two cruisers alongside.

## M6 results
- Everything synthesized with the Web Audio API (no files). Buses: world SFX -> low-pass "muffle" -> SFX, music, UI ->
  compressor -> output; generated convolution reverb; analyser for the headless level test.
- Car: EV motor whine tracking wheel speed (saw + triangle through a moving band-pass), sub layer under load, inverter
  harmonics at low speed, regen whine, turbine whistle above ~125 mph; tyre squeal from slide on hard surfaces; road roar;
  gravel crackle on dirt/grass (terrain colliders now report `grass`); puddle spray when wet; wind (speed squared);
  metal scrape loop; cold-gas hiss bursts for Hover Jets / air control; Rear Rocket roar with sub rumble. Slow motion lowers pitch.
- Police: 4 siren voices assigned to the nearest units (wail far, yelp close / interceptors, hi-lo SWAT), Doppler from
  relative velocity, PannerNode falloff, engine growl; helicopter rotor thump + blade slap + turbine; drone buzz.
- One-shots: impacts (crunch + clank, scaled by strength), glass, explosions, landings, splashes, spike pops, EMP, near-miss
  whoosh (panned), traffic horns, prop hits by material, Cold Snap shimmer, frost shockwave, launch, Air Station, radio squelch,
  heat alert, stingers (evaded, busted, takedown).
- Adaptive synthwave (96 BPM, A minor): pad + soft arp in free roam, bass at heat 1, drums at 2, hats at 3, lead at 4,
  double-time at 5. Ghost Mode / Cold Snap: pad only and the world muffled through a low-pass. Pause ducks the world.
- Master / Music / SFX volumes come from Settings (squared curves) and update live. Measured headless: master 0 -> silence,
  motor under throttle ~-19 dBFS RMS, Ghost Mode -> world cutoff ramps down to ~400 Hz, music layers follow heat.

## Next
- M7: missions, races, scoring/style system, cash/rep progression, garage upgrades, save game.

## Known issues
- Ramp/merge geometry on the Highway Ring is functional but simple (taper merge, no exit lanes except via the same ramps).
- Headless (SwiftShader) FPS is not representative of GPU performance.
