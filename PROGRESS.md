# RDSTR // Cold Gas Pursuit — Progress

Single source of truth for the design: `GAME_SPEC.md`. Reference photos of the Roadster: `reference/`.

## How to run
- Static site, no build step: serve the repo root (`node tools/serve.mjs 8123`) and open `http://localhost:8123/`.
  The game opens on the title screen; `?play=1` jumps straight into free roam.
- GitHub Pages serves `index.html` from the root (`.nojekyll` present). Libraries are vendored in `vendor/` and loaded through the import map; the game makes zero external requests.
- Acceptance tests: `SCEN=./qa.mjs node tools/smoke.mjs t<N> screenshots/qa` (N = 2..16, see `tools/qa.mjs`).
- Headless QA: `node tools/smoke.mjs <scenario> screenshots/<prefix>` (scenarios in `tools/scenarios.mjs`: `boot`, `physics`, `wall`, `drive`, `keys`, `tour`, `car`, `fleet`, `fx`, `pursuit`, `evade`, `busted`, `audio`, `missions`, `race` (env `RACE=ring-sprint|downtown-circuit|canyon-drift`), `score`, `menus` (run with `EXTRA='&menu=1'`)). `?test=1` exposes `window.__game.test` (deterministic physics stepping).

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
| `game/Progress.js` | Career save (localStorage `rdstr.save.v1`): cash, rep, districts, mission stars, race records, upgrades, paints, stats |
| `game/Score.js` | Style score: base values, chain multiplier x1-x10, bank after 3 s, crash loses chain, 3D popups |
| `game/Activities.js`, `Missions.js`, `Races.js` | Free-roam markers, briefing -> run -> results, 10 story missions, 3 street races with rivals |
| `game/Markers.js`, `game/Jumps.js` | Light columns / checkpoint gates; named stunt-jump detection |
| `ui/Menu.js`, `ui/GarageScene.js` | Title, mission/race lists, Garage (paint, upgrades, stat bars), Settings (+ key rebinding), Pause, Controls; the showroom scene |
| `fx/XRay.js` | X-Ray view: vehicles glow through buildings |
| `ui/ActivityUI.js` | Briefing cards, results screen, race HUD, countdown, objective line |
| `ai/Heat.js`, `ai/PoliceAI.js`, `ai/Radio.js` | Heat 0-5, evade/cooldown loop, busted timer; police units, roadblocks, spikes, heli, drones; dispatch subtitles |

## Version 3 (UPDATE_V3.md) — branch `v3`
UPDATE_V3.md replaces UPDATE_V2.md Part 2. Smoke tests: `SCEN=./v3.mjs EXTRA='&menu=1' node tools/smoke.mjs m<N> screenshots/v3m<N>`.
- [x] **V3 M1 — Unlock everything, map and navigation** (see "V3 M1 results")
- [ ] V3 M2 — Sound fix and music options
- [ ] V3 M3 — Main menu first impression
- [ ] V3 M4 — In-game HUD
- [ ] V3 M5 — Thruster control and safe landings
- [ ] V3 M6 — Realistic crashes and destruction
- [ ] V3 M7 — Race mode
- [ ] V3 M8 — Taxi mode
- [ ] V3 M9 — Kids, Heist, Career, saves, garage
- [ ] V3 M10 — Polish
- **Next:** V3 M2.

## V3 M1 results
- No locks: `Progress.districtOpen()` is always true, briefings and lists never lock, every mode card is open (Free Roam,
  Race, Heist, Career, Taxi, Kids; until their own milestones Race/Heist/Career open the existing race / mission lists,
  Taxi starts free roam, Kids starts free roam with `game.kidsMode`: no police or heat, no damage, speed capped).
- `ui/MapView.js`: full-screen map (M, or MAP in the pause menu; pauses the game): roads, parks, district and
  neighbourhood names, icons with a legend (charging, repair, tuning, police, studio, taxi stands, mission / race
  starts), player arrow, route. Hover shows names; click an icon or any spot to set a waypoint; drag pans, wheel zooms.
- `game/Navigation.js`: waypoint + A* route over the road graph (re-planned every 1.5 s), glowing chevrons on the road
  ahead (every 9 m out to ~170 m), route line on the minimap and the map, rim arrow when the target is off the minimap,
  distance on the HUD, "ARRIVED" + optional callback. API: `game.nav.setWaypoint(x, z, label, {color, onArrive})`.
- Minimap 260 px with bigger icons; below 25% battery a pulsing ⚡ rim arrow points to the nearest charging station.
- Charging: every station has a 13 m lit "⚡ CHARGE" pylon with a beacon; `placeChargingHubs()` ray-casts for open flat
  ground beside roads and adds 7 canopy hubs outside the grid (harbor x2, construction x2, canyon, waterfront,
  highway), 11 stations in total. Verified headless: 42 charge bays registered, all with service points.


- [x] **V2 M1 — Title screen and main menu** (see "V2 M1 results")
- [x] **V2 M2 — Daylight, weather and lighting quality** (see "V2 M2 results")
- [x] **V2 M3 — City overhaul (roads, districts, landmarks, people, Grafigator)** (see "V2 M3 results")
- [x] **V2 M4 — HUD, thruster control, physics and feedback** (see "V2 M4 results")
- **Part 1 (M1-M4) complete.** Part 2 (M5-M8) not started.
- V2 smoke test: `SCEN=./v2.mjs EXTRA='&menu=1' node tools/smoke.mjs m<N> screenshots/v2m<N>` (scenarios `m1`..`m4` in `tools/v2.mjs`).
- **Next:** Part 2, starting with V2 M5 (Garage upgrades and paint). Kids Mode (M6) should set `game.kidsMode = true` (pedestrians already honour it).

## V2 M4 results
- HUD (`ui/HUD.js`, css "HUD (V2)"): cut-corner gauge tiles with icons for Battery (temperature sub-line), Chassis
  and Thrusters (COPV pressure + which system is firing). Green -> yellow -> red with a pulsing glow when low. A
  thruster view draws the car from above with the rear rockets, the four hover jets and the RCS nozzles lighting up as
  they fire, inside a COPV pressure ring. The speed arc gauge stays. Player name tag above the minimap.
- Settings > HUD now works: show / hide speedometer, battery, health, thrusters, minimap, score; gauge position bottom
  (centre row), side (stack beside the speedometer) or top. `HUD.applyLayout()`.
- Assisted Flight (default; Settings > Controls > Flight mode): `Game.flightAssist()` + Vehicle air stabilisation hold
  the car level in the air (yaw untouched). Space = lift, Shift = boost, tap Q / E = full barrel roll, tap W / S = full
  flip, then it levels out. Pro Flight keeps the manual controls with gentle stabilisation. Both straighten up harder
  in the last 0.9 s before landing. Measured (test stepping): tilted 52° -> upright in 2 s with Assist (Pro 0.98 up,
  none 0.62); barrel roll done in 2.1 s and flip in 2.4 s, both ending level.
- Landing preview: ballistic path ray-cast every other frame while airborne; ring marker on the ground (green upright,
  amber if the car would land badly), size grows with time to impact.
- Physics: visual body pitch under braking / acceleration and body roll in corners on a spring-damper (wheels stay
  planted); off-road rolling resistance on grass / dirt on top of the lower grip; asphalt grip x0.84 in the rain.
- Damage on the model: clearcoat dulls and paint roughens with damage, hood smoke below 50% chassis (black below
  25%), left headlight breaks and the right one flickers above 60% damage (plus the V1 dents, cracked glass and the
  splitter falling off).

## V2 M3 results
- Roads: grid streets 20 m (4 lanes, 4.7 m lanes), the two central boulevards (x = 0, z = 0) 28 m with 6 lanes; the
  Highway Ring keeps 6 lanes. `CityGenerator.buildGrid(xs, zs, lotFn, widthFn)` takes per-street widths; graph edges
  carry `lanes` / `laneWidth`, so traffic lanes (`Traffic.laneOffsets`) and resets (`World.nearestRoad`) follow.
  Dense blocks and the Shopping District have planters and bollards along the curb (gaps at crosswalks / lamps).
  Minimap: roads drawn at their real width with a light edge, parks in green, icons for key locations.
- Buildings: `BUILDING_STYLES` (glass tower, office, hotel, brick, industrial) combine a podium base with canopy,
  facade style + palette, vertical fins and a crown (flat, stepped, spire with beacon, water tank).
- `districts/Neighborhoods.js`: Shopping District (lots i 0-3, j 5-7): rows of shops from `SHOP_TYPES` (cafe,
  restaurant, fast food, clothing, electronics, pharmacy, supermarket, car dealer, gym, cinema, bookstore, bakery), each
  with facade colour, awning, sign and painted window display from one canvas atlas (one draw call), plus planters,
  bikes, bike racks, kiosks and roof AC units. Residential Hills (i 5-7, j 0-2): houses with gable roofs, lawns,
  fences, trees, driveways, parked cars and mailboxes. City Park (i 0-1, j 1-2): grass, cross paths, a lake with a stone
  rim, a fountain, benches, lamps and ~45 trees per lot. `Layout.placeName(x, z)` names the neighbourhood.
- `districts/Landmarks.js` (all marked on the minimap): Police Station (lot 2_3) with a parking lot of cruisers; at
  heat 3+ every other reinforcement drives out of its exits when it is within 900 m. Charging Stations (canopy with 4
  bays at lots 5_5 and 1_4, plus bays in both parking lots), Repair Shops (2 drive-in bays with roller doors, lots 6_4
  and 2_6), Garage / Tuning Shop (3 bays, lot 4_2).
- `game/Services.js`: stop in a bay for 0.7 s. Charging: light ring around the car, cable sparks, hum, battery fills,
  $3 per %. Repair: roller door closes, sparks and tool sounds, HP and COPV restored, popped tyres fixed, dents
  removed ($4 per HP, min $150). Tuning: opens the Garage menu. Verified headless: 40% -> 100% battery (-$180),
  40% -> 100% HP (-$240).
- `world/Pedestrians.js`: 40/90/150/220 people by quality in one InstancedMesh; walk cycle, bob, dive and fall done in
  the vertex shader; varied shirt / trouser / skin / hair colours. They walk the sidewalk loops of the blocks around
  the player, cross at crosswalks, stand at shop windows and bus stops. A car on a collision course makes them dive
  aside; if touched they stumble, fall and get back up (no injuries). `game.kidsMode` = earlier, wider dodges and
  no knock-downs.
- GRAFIGATOR (in the world only): Design Studio on lot 4_4 beside the default spawn, facing the west boulevard:
  dark glass curtain wall, cantilevered white top floor, glass storefront with a lit studio interior (desks, monitors,
  design posters), small logo on the glass door, extruded mark + bold wordmark sign on the fascia, rooftop sign, lime
  / teal trim lines. Three rooftop billboards along the boulevards carry it as a normal neon brand (`GRAFIGATOR_BRAND`,
  never picked at random). Removed from the showroom, menus and credits by request (UPDATE_V2.md updated).
- New props: planter, bollard, bike, bike rack, kiosk, AC unit, mailbox, charger, police car.

## V2 M2 results
- `world/Environment.js`: lighting is now time of day x weather. `TODS` (Morning, Noon, Golden Hour, Sunset, Night) give
  sun elevation/azimuth, sun colour/intensity, sky, fog, hemisphere fill, exposure, lamp level and a `night` factor;
  `WEATHERS` (Clear, Cloudy, Rain, Fog, Storm) scale cloud cover, fog density, direct light, sky greying, rain, wet roads
  and lightning. `makePreset()` merges both into the flat preset the rest of the game reads (old fields kept: `moon`,
  `moonI`, `rain`, `wet`, `lampScale`). V1 names `night`/`dusk`/`rain` still work through `apply()`.
- Real sun: the directional key light follows the preset's angle and colour (moon at night); the sky shader draws a sun
  disc with Mie halo, forward-scattering glow and sunlit day clouds (city-lit clouds and stars at night).
- Shadows: tightly fitted frustum (±55/62/75 m by shadow map size) centred ahead of the camera; low suns are clamped
  above the horizon so the street still gets long shadows.
- Reflections: the PMREM env map is rebuilt per preset (sunlit facades and asphalt by day, neon and sodium at night);
  `scene.environmentIntensity` per time of day. Car paint clearcoat sharper (roughness 0.025, env 1.4).
- Building windows glow only at night (`uNight` uniform in the facade shader); street-lamp spots, light pools and
  cones follow the lamp level, so daylight has none. Night is readable: exposure 1.3, brighter moon/fill, lamps x1.35.
- Wet roads only when it rains (road/sidewalk roughness and colour change, wet light streaks; dry = none).
- Storm: random double-flicker lightning lights the scene, short screen flash and synthesized thunder (`SFX.thunder`).
- Play setup: Mode -> District (cards with a still rendered from the game by `Game.renderPreview`, locked districts show
  their rep) -> Time of day -> Weather (sky swatch cards) -> drive. `Game.startPlay({district, tod, weather})`,
  `World.districtStart(id)`. Noon / Clear is the default for new players. Settings > Graphics also has Time of day
  and Weather (applied live). The intro card shows the chosen time and weather.

## V2 M1 results
- New visual identity (css/style.css "Menus (V2)"): graphite glass panels with cut corners, cyan->magenta signal line,
  skewed button plates with index numbers, glow line that grows under the focused item, light-sweep shine on focus,
  hover sounds, scanlines. Logo: heavy italic RDSTR with glitch layers + animated light sweep.
- Showroom (`ui/GarageScene.js`): planar-reflection floor (vendored `Reflector`) under a glossy tiled coat, key spot with
  shadows, 3 sweeping light bars, cyan/magenta rim lights, back light, additive haze beams, fog, light pillars, slow camera
  drift. (No Grafigator branding in the menus: see the M3 note on branding.)
- Live car viewer: drag (mouse / touch) to orbit, wheel / pinch to zoom (5.4-12 m, never inside the car), idle turntable.
  Hotspots projected on the car: doors, roof (canopy lifts on a rear hinge), lights on/off, thrusters (plate flips, vents
  open and glow). Paint changes blend smoothly (`RoadsterModel.setPaint(key, true)`).
- Title buttons: CONTINUE (when a career exists), PLAY (mode cards; Free Roam only until Part 2), GARAGE, PLAYER NAME
  (saved in the career, shown on the title and save slots), SETTINGS, GAME INFO (Story / Controls / Modes / Credits),
  SAVE GAMES (3 slots: name, level, cash, playtime, date; load / overwrite / delete with confirmation; also in Pause),
  EXIT (confirm -> "Thanks for playing" screen).
- Settings by category: Sound (master/music/SFX), VFX (particle amount, motion blur, camera shake), Graphics (preset,
  resolution scale, auto quality), Controls (flight assist, keyboard + gamepad rebinding), HUD (show/hide, gauge position;
  wired up in M4), Career (units, reset).
- `world/Grafigator.js`: logo parsed from `reference/grafigator-logo.svg` with SVGLoader and extruded; bold block-glyph
  wordmark; `makeSign()` illuminated sign with lime/teal trim; `drawLogo2D()` for canvas billboards.
- Progress: `playerName`, `playtime`, `lastPlayed`, `level` (from rep until Part 2 career XP), slot API.

## Milestones (V1)
- [x] **M1 — Setup, collision and vehicle physics on a test city block**
- [x] M2 — Full city world, lighting, sky, atmosphere and post-processing
- [x] M3 — Roadster and police models
- [x] M4 — VFX, camera and game feel
- [x] M5 — Police AI and heat system
- [x] M6 — Audio
- [x] M7 — Missions, races, scoring and progression
- [x] M8 — Menus, garage, settings and polish

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

## M7 results
- Story: VOLT works for a contact called CIPHER (briefings and outros in the contact's voice, radio-style subtitles).
- 10 missions, 2 of each type: Getaway (Clean Exit, Harbor Heist), Data Run (Cold Storage, Uplink), Bounty (Black & White,
  Interceptor Hunt), Sky Gap (Leap of Faith, Steel Garden), Ghost Protocol (Silent Running, Blackout). Missions are stage
  scripts (reach / hold / evade / checkpoints / takedowns / jumps / scanners) with mission rules: time limits, max heat,
  locked minimum heat, forced police unit types, extra patrols. Briefing card, objective + timer HUD, star criteria.
- 3 street races inside the world: Highway Ring Sprint (2 laps), Downtown Circuit (2 laps), Canyon Drift Run (point to point,
  scored on drift). 3 rival AI drivers (own coupe models, racing lines, rubber band, overtaking around blocked lanes,
  off-screen recovery), checkpoint gates, countdown, live standings, lap / best lap, saved best time / lap / drift score.
  Police are reported mid-race. Busted / wrecked during an activity = fail.
- Style score per spec (Drift 10/s, Near Miss 50, Perfect Landing 150, Flip / Barrel Roll 200, Cold Snap Landing 300,
  Takedown 500, Roadblock Smash 250, Air 25/s; plus named stunt jumps 250). Chain multiplier grows by 1 every 2 moves within
  3 s (max x10), banks after 3 s clean, a crash loses it. Popups punch in at the move's 3D position and fly into the counter.
- Progression: cash and rep from missions (scaled by stars, full rep first time), races (by position), banked style
  (score / 20 cash), free-roam escapes (by heat and time). Rep unlocks districts (Harbor 400, Construction 1000, Canyon 1800)
  and with them their activities; briefings show rep requirements. Bust = impound fee, wreck = repair bill.
- Results screen (frozen frame, glitch title): time, top speed, takedowns, best combo, style score, stars, cash/rep, records,
  unlocks, CIPHER outro, Continue / Retry. Also shown after a free-roam bust or wreck with the pursuit summary.
- Garage upgrade data (cooling, COPV, thrusters, armor, grip; 3 levels) and paint prices are in Progress.js and applied to the
  car at start; the Garage UI to buy them comes in M8.
- Fixes found while testing: AI driver no longer capped at 40 m/s on straights; police get a short "reported position"
  window and closer dispatch when a mission sets heat directly; car-carrier ramp geometry (lower deck poked through the ramp).
- Verified headless: Clean Exit end to end (pickup -> Heat 3 -> evade -> safehouse -> 3 stars, $3,600 + 250 rep),
  Cold Storage timeout fail, Downtown Circuit finish (1st, records saved), Ring and Canyon runs, jump detection for
  Broken Bridge (46 m), Highway Gap (46 m), Car Carrier (73 m).

## M8 results
- Title screen: the player's Roadster on a turntable in a dark showroom (glossy floor, ceiling strips, sweeping spot lights,
  colored rim lights, baked garage reflections), glitch-animated RDSTR logo, Continue (drives to the next story job),
  Free Roam, Missions, Street Races, Garage, Settings; career line (cash, rep, missions). Menu music mode.
- Mission / race lists with type, district, lock reasons (rep / district), stars and best times; picking one drops you near
  its marker and opens the briefing after the intro.
- Garage: drag to rotate / scroll to zoom, paints (preview on focus, buy, equip), 5 upgrades x 3 levels with pips and costs,
  stat bars with a green preview of the next level.
- Settings (saved): quality preset, auto quality, motion blur, camera shake, time of day (applied live), rain, master /
  music / SFX volume, speed units, full keyboard rebinding (press a key; a key moves between actions), reset controls,
  reset career (with confirmation). Reachable from the title and the pause menu.
- Pause (Esc / Menu button): resume, restart / quit mission or race, controls, settings, garage, quit to title; the controls
  list (with the player's current bindings) is shown beside it.
- Intro flyover of the city on every start (skippable with Enter / Space / Esc), "HALCYON BAY" title card.
- Mission complete / race finish: slow orbit shot around the car behind the results; fails freeze the final frame.
- X-Ray view (X / D-pad down): police (red/blue), rivals (magenta), traffic and the player glow through buildings, air units
  as rings, with a cool screen tint.
- Navigation: keyboard (arrows / WASD, Enter, Esc), mouse (hover, click, sliders), gamepad (D-pad / stick, A, B, Menu).

## QA checklist results (headless Chromium + SwiftShader, `tools/qa.mjs`)
| # | Test | Result | How it was checked |
|---|------|--------|--------------------|
| 1 | Top speed + rockets into a building | PASS | `wall`: 0°, 30°, 60° at 250+ mph, never penetrates |
| 2 | Camera near walls | PASS | 1020 camera frames (wall push, reverse into wall, spins, garage, both chase cams): 0 inside geometry |
| 3 | Broken Bridge jump | PASS | 55 m jump, 11 m peak, air roll to ~30° and back with thrusters, clean landing |
| 4 | Land upside down | PASS | roof impact damage, "HOLD R TO RESET" prompt, holding R rights the car |
| 5 | Drift mode, canyon road | PASS | 3 hairpins of 156-160° (~26-29 m radius); Drift-mode slide held 5.4 s at 38° avg slip with skid marks, smoke, +2% battery |
| 6 | Heat 3 to 5 | PASS | roadblocks, spike strips, helicopter, box-in roles (4 units), 2 EMP drones at 5, units capped at 12 |
| 7 | Break line of sight | PASS | search cones present while evading, EVADE fills, COOLDOWN, heat cleared |
| 8 | Ghost Mode | PASS | headlights 0, motor gain ~0, world low-pass 1.1 kHz, speed capped at 150 mph, battery drains |
| 9 | Cold Snap | PASS | time scale 0.25, orbit camera, frost shockwave event on landing |
| 10 | Takedown | PASS | takedown event, crash cam + 0.22x slow motion, +500 style, wreck stays on the map |
| 11 | Score for a 2-3 min pursuit | PASS | scripted 150 s pursuit timeline through the real scoring code: 25,755 |
| 12 | 20 minutes of play | PASS | 10 min Heat 4 + explosion/debris stress: particles at caps, debris <= 36, GPU geometries rise and fall, heap stable |
| 13 | Gamepad | PASS | mocked Gamepad API: triggers, stick, X rockets, Y ghost, A hover, vibration call |
| 14 | Settings | PASS | quality, volumes, rebinding persist across reload and take effect |
| 15 | Street races | PASS | Downtown (won, best time + lap saved), Ring Sprint (won, 2 laps), Canyon Drift Run (finished, best time + drift score saved) |
| 16 | 5-star heat for 3 minutes | PASS | units <= 11 of 12, drones 2, ~1.5-2 ms of CPU per 1/120 s step incl. AI |

Fixes made during QA: camera snaps in instantly when a wall appears (one frame inside geometry before); cars on their
roof scrub to a stop (they slid forever on the low-friction chassis) and the reset prompt accepts a slowly sliding wreck;
canyon switchbacks rebuilt as real ~26-29 m hairpins and the Canyon Drift Run now covers the whole loop (up and back down);
box-in from 2 units within 90 m; failed roadblock placements retry after 3 s; NPC model geometry is disposed on despawn
(GPU geometry count used to climb); one physics step at start-up so early raycasts see the city.

## Known issues / limits
- All verification is headless (SwiftShader renders ~0.5-2 fps), so real GPU frame rates were not measured; #12 / #16
  check resource bounds and simulation cost instead. Worth a pass on real hardware.
- #5 and #11 use scripted inputs / timelines: drifting and scoring feel need a human playtest for tuning.
- #13 uses a mocked gamepad; vibration support depends on the browser.
- Rolling roadblocks only happen on the Highway Ring; the Container Stack jump is not covered by an automated test.
- Ramp/merge geometry on the Highway Ring is functional but simple (taper merges).

