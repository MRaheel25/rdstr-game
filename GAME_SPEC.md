# RDSTR // Cold Gas Pursuit: Full Game Spec

This file is the single source of truth for the game. Read all of it before writing any code, and re-read the relevant section before starting each milestone.

Reference images of the real 2nd generation Tesla Roadster are in the `reference/` folder of this repository. Open and study every image before building the car model.

---

## SECTION A: THE BRIEF

Build a next gen 3D browser game around Tesla's new Roadster, featuring realistic physics, high-speed drifting and multiple race routes. The game must include the same features the real Roadster has: instant torque acceleration, a battery management system, Dynamic Handling Modes, and the SpaceX cold-gas thruster package for speed boosts and extreme aerial maneuvers, so the car can fly, flip and roll in the air.

This is not a normal racing game. It is a police pursuit game: the player is the Roadster driver, chased by the police through high-stakes missions across a sprawling, destructible open-world city. Physics must make stunts feel visceral. Graphics must be top-tier, with dynamic lighting, reflections and high-fidelity textures, inspired by GTA V and the best racing games for maximum visual impact. The experience must be smooth and adrenaline-fueled, with cinematic camera angles and intense sound design.

You are a senior game director, lead gameplay programmer, technical artist and audio designer working together on one product. The goal is a polished, professional-grade 3D open-world police pursuit game that feels like a premium console title running in the browser.

---

## SECTION 0: MISTAKES A PREVIOUS ATTEMPT MADE (DO NOT REPEAT THEM)

An earlier version of this game, built with a different tool, failed in these ways. Treat each one as a hard requirement to get right:

1. BROKEN COLLISION: the Roadster drove straight through buildings and walls. Nothing solid should ever be penetrable.
2. The world looked unfinished: flat grey ground, plain black monolith buildings with no windows or detail, a pure black void sky, no roads, no sidewalks, no lane markings, no street furniture, no traffic, no life.
3. Stunt props felt random: stairs, ramps and rings floating in empty space with no reason to exist in a city. Bollards scattered without purpose.
4. The car was a basic white box that did not look like the Tesla Roadster. Police cars were flat black slabs with a stripe.
5. Weak effects: thrusters were glowing blobs; no tire smoke, sparks, skid marks, debris, explosions, wind, rain, light streaks or impact feedback.
6. Flat lighting: no real shadows, no reflections, no bloom on light sources, no atmosphere or fog depth.
7. Floaty, toy-like physics. The car flipped and spun like light plastic, landings had no weight, crashes had no consequence.
8. Passive police: no intelligent chasing, boxing in, ramming, roadblocks or escalation.
9. Meaningless score: 212,000 points in under one minute.
10. No real sound design, no music, no sense of speed (no FOV change, no camera shake, no motion blur).
11. The HUD covered the bottom center of the screen and control buttons sat on top of the gameplay.

Systems that previous version had and that this game must also include (built to the higher standard below): HUD data, Dynamic Handling Modes (Track / Drift / Flight), Rear Rockets, Hover Jets, opening doors, X-Ray view, camera toggle, pursuit heat stars, checkpoints, takedowns, chassis HP and a game-over screen ("PURSUIT TERMINATED").

---

## SECTION 1: CREATIVE VISION AND UNIQUE IDENTITY

Pitch: "You are the getaway driver behind the wheel of the fastest electric car ever built, with a SpaceX cold-gas thruster package. The city's entire police force wants you off the road. You cannot outgun them. You can only out-drive, out-fly and out-think them."

Mood: neo-noir night city after heavy rain. Wet asphalt mirroring neon signs, sodium street lamps, red and blue police strobes washing across glass towers, steam rising from vents, light fog that gives the skyline depth. Think the night driving of GTA V mixed with the speed and crash drama of Burnout Paradise and the police pressure of Need for Speed Most Wanted (2005), but with its own identity.

The city: "Halcyon Bay", a fictional coastal mega-city with 5 distinct districts, each with its own look and driving style:
- Downtown Core: glass skyscrapers, tight grid, neon billboards, elevated train line overhead.
- Harbor and Docks: cranes, stacked shipping containers, long straight pier roads, container ramps.
- Highway Ring: a multi-lane elevated freeway looping the city with long straights for top-speed runs, overpasses, interchanges and tunnels.
- Construction Zone: half-built towers, an unfinished bridge that ends in mid air, scaffolding, dirt ramps, crane arms. This is where the big stunt jumps live naturally.
- Hillside Canyon: winding mountain road above the city with hairpin drift corners and a view of the skyline.

All stunt jumps must be part of the world (a broken bridge, a car carrier truck ramp, a parking garage roof, a container stack, a highway gap), never floating objects.

SIGNATURE MECHANICS (build all of them):

A) GHOST MODE (electric stealth): the Roadster is an EV and is almost silent. Holding a key kills all exterior lights and the motor sound. While police have lost line of sight, Ghost Mode makes the search radius shrink faster. It drains battery and caps speed at 60 percent while active.

B) COLD SNAP (aerial bullet time): when the car is airborne higher than 8 meters, tapping the thruster key triggers 1.5 seconds of slow motion (time scale 0.25). The camera swings to a cinematic orbit angle, the screen gets a cool blue frost tint, and the player can rotate the car and pick a landing vector with the thrusters. Landing from Cold Snap releases a frost shockwave that pushes nearby police cars away and can trigger a takedown. Limited by cold-gas pressure.

C) CHARGE ECONOMY (real BMS feel): the battery is the life of the car.
- Drifting, near misses with traffic and regenerative braking recharge the battery.
- Rear Rockets and top speed drain it fast and raise battery temperature.
- Above 90 C the BMS throttles power to 70 percent and the HUD warns "THERMAL LIMIT". Ghost Mode or slowing down cools it.
- COPV cold-gas pressure (for thrusters and Hover Jets) refills slowly over time and instantly at hidden "Air Stations" around the city.
This makes every boost a decision, not a button you hold forever.

D) TAKEDOWN CAM: when a police car crashes because of the player (rammed into a wall, flipped, hit by the frost shockwave), play a 1.2 second slow-motion crash shot from a dramatic angle, Burnout style, then snap back to gameplay. No more than once every 6 seconds.

---

## SECTION 2: TECH STACK AND ARCHITECTURE

Hosting constraint: the game is a static site served by GitHub Pages from the repository root. No build step. `index.html` at the root must run directly.
- Install `three`, `@dimforge/rapier3d-compat` and `postprocessing` with npm, then copy their browser ES module builds into a `vendor/` folder that is committed to the repo. Load them through an import map in `index.html`. The game must make zero external network requests at runtime.
- Add a `.nojekyll` file at the root.

Engine:
- Three.js (latest stable) with WebGLRenderer. ACESFilmic tone mapping, sRGB output, physically correct lighting, antialias off (use SMAA in post instead), pixel ratio capped at 2.
- Physics: Rapier 3D (`@dimforge/rapier3d-compat`). Fixed physics step of 1/120 s with an accumulator, maximum 4 substeps per frame, interpolate render transforms between steps.
- Post-processing: pmndrs `postprocessing`: Bloom (selective, high threshold so only lights glow), SMAA, subtle Vignette, Chromatic Aberration only during boost, Radial/Motion blur during Rear Rockets, cinematic color grading (deep teal shadows, warm orange street lights, saturated neon accents).
- All textures generated procedurally with canvas or shaders (asphalt, road markings, building windows, concrete, metal, neon signs). No external image files are needed to run the game.
- Code organized into clear systems, one module each: Renderer, World/CityGenerator, Physics, Vehicle, PoliceAI, Traffic, Missions, VFX, Audio, Camera, HUD/UI, Input, GameState, Settings. No giant single function.
- Object pooling for particles, debris, skid marks and police units. No memory leaks after 20 minutes of play.
- Performance target: stable 60 FPS on a mid-range laptop with an integrated or entry GPU at "Medium". Provide Low / Medium / High / Ultra presets that scale shadow resolution, draw distance, particle count, post effects and pixel ratio. Use InstancedMesh for repeated objects (lamps, windows, cones, cars, trees), merge static geometry per city block, LOD for buildings and police cars, frustum culling, distance culling for small props, and fog to hide the draw distance.
- Dynamic lights limited to the 4 nearest police units; emissive sprites for the rest. Shadows only from one directional/moon light, fitted tightly around the player.
- FPS and draw-call counter on F8. Automatic quality drop if FPS stays under 45 for 5 seconds.

---

## SECTION 3: COLLISION AND PHYSICS (TOP PRIORITY)

COLLISION:
- Every solid object (buildings, walls, barriers, containers, ramps, bridges, parked cars, lamp posts, police cars, traffic) has a physics collider that matches its visual shape. Buildings use box colliders per block; ramps use convex or trimesh colliders.
- Continuous Collision Detection (CCD) on the player car and all police cars so nothing tunnels through walls at 250 mph or during Rear Rockets.
- The camera collides too: sphere cast from the car to the camera so it never clips inside buildings. When blocked, pull the camera closer smoothly.
- Hitting a wall feels violent and believable: the car deflects along the wall based on impact angle, loses speed based on the normal component of velocity, takes damage scaled by impact force, throws sparks and debris, shakes the camera and plays a heavy crunch. A head-on hit above 120 mph is a "wreck" with a short slow-motion and heavy damage.
- Safety net: if the car's center ever ends up inside a building collider, push it out along the shortest normal and apply crash damage.
- Debug toggle on F9 that draws all colliders as wireframes.
- Dev-mode self-check at load: log a warning for any static mesh without a collider.

VEHICLE PHYSICS (raycast vehicle model):
- Four raycast wheels with spring and damper suspension, anti-roll bars, realistic weight transfer under braking, acceleration and cornering.
- Tire model with slip angle and slip ratio (simplified Pacejka curve): grip builds, peaks, then drops off so drifts are controllable and catchable with countersteer.
- Mass around 1.9 tonnes with a low center of gravity. Heavy and planted at speed, never toy-like.
- Downforce scales with speed squared so high-speed cornering is stable.
- Tri-motor all-wheel drive with torque vectoring: more torque to the outer rear wheel in corners.
- Instant electric torque: maximum torque from 0 mph, with a short, sharp launch that pushes the camera back. Target feel from the officially announced Roadster figures: 0 to 60 mph in about 1.9 s (faster with the cold-gas package), top speed above 250 mph, 200 kWh battery.
- Launch Control: hold brake + throttle for 1 second, release for a perfect launch with a camera kick and tire smoke.

DYNAMIC HANDLING MODES (keys 1 / 2 / 3), each clearly different:
- TRACK: maximum grip, traction control on, sharp and precise steering, best for highways.
- DRIFT: rear-biased torque, reduced rear grip, traction control off, wider steering lock, auto countersteer assist. Long smoky slides. Drifting builds Style Points and recharges the battery.
- FLIGHT: thrusters and Hover Jets fully unlocked, stronger air control, reduced gravity feel while thrusters fire, rear wing and side vents animate open.

AIR AND THRUSTER PHYSICS:
- Gravity stays real (9.81 m/s2). Air time comes from speed and ramps, not floaty gravity.
- In the air, pitch, roll and yaw only through cold-gas thrusters (each burst uses pressure), so flips are a skill, not a random spin.
- Hover Jets [Space]: downward thrust to slow a fall, hop over roadblocks, or hover briefly.
- Rear Rockets [Shift]: strong forward thrust, big speed boost, drains COPV pressure.
- Landing: suspension compresses visibly, a dust or water splash ring appears, camera dips. Landing flat on four wheels gives "PERFECT LANDING" style points and keeps speed. Landing on the roof or nose causes damage and a crash.
- Self-righting: if the car is upside down or stuck for 2 seconds, show "Hold R to Reset" and reset onto the nearest road facing the road direction.

---

## SECTION 4: THE ROADSTER MODEL (MUST LOOK LIKE THE REAL CAR)

Build the player car as a detailed, accurate model of the 2nd generation Tesla Roadster, matching the images in `reference/`. Use proper curved geometry (side profile spline extruded and lofted, not stacked boxes):
- Very low, wide, smooth wedge body with a long sloping nose and no front grille.
- Cab set back, two-door coupe with removable glass roof panel (targa), dark tinted glass canopy that wraps around.
- Thin sharp LED headlight strips, full-width thin rear LED light bar, wide muscular rear haunches over the rear wheels, clean rear diffuser.
- Large aero wheels with low-profile tires, visible brake calipers, wheels that rotate at the correct speed and steer.
- Materials: MeshPhysicalMaterial car paint with clearcoat and metallic flake, real reflections from an environment map (PMREM of the night city or a procedural HDR), glossy black glass, chrome and carbon details.
- Animated parts: doors open with G, headlights and tail lights glow and bloom, brake lights brighten when braking, reverse lights, rear wing raises at high speed, thruster nozzles hidden behind the rear plate (the license plate flips down to reveal them when Rear Rockets fire, like the SpaceX package concept).
- Damage model: panels deform or lose parts at high damage (bumper falls off, glass cracks, sparks from a scraping chassis), smoke from the battery area when HP is low.
- Paint options in the garage: Red Multi-Coat, Pearl White, Midnight Silver, Matte Black, Deep Blue, plus 3 neon paints unlocked by progress.

POLICE VEHICLES: real-looking cruisers from curved geometry, black and white livery with "HALCYON BAY POLICE" text, push bars, roof light bars that strobe red and blue and cast colored light onto the road and buildings. Each unit type has a clear silhouette:
- Patrol Cruiser (Heat 1+)
- Interceptor: low, fast, matte black, blue under-glow (Heat 2+)
- Armored SWAT Truck: heavy, slow, dangerous to hit head-on (Heat 4+)
- Police Helicopter with a moving searchlight beam on the ground (Heat 3+)
- Pursuit Drones that track you in tunnels and try to EMP you (Heat 5)

---

## SECTION 5: THE OPEN-WORLD CITY

Generate Halcyon Bay procedurally from a road graph with fixed seeds so the layout is the same each time:
- Real roads: asphalt with procedural wear, lane markings, crosswalks, turn arrows, curbs, raised sidewalks, manhole covers, puddles.
- Buildings: varied heights and footprints, beveled tops, rooftop units, antennas, helipads, glowing window grids with random lit and dark windows (shader-based so it is cheap), ground-floor shop fronts with lit signs, neon billboards with fictional brands.
- Dense street furniture (destructible), using InstancedMesh: street lamps with real light cones, traffic lights that cycle, bus stops with glass, benches, trash bins, fire hydrants (spray water when hit), newspaper boxes, traffic cones, construction barriers, palm trees on the waterfront, fences, food stalls, parked cars.
- Sky: night sky dome with gradient, faint stars, moon, clouds lit from below by the city glow. Never pure black.
- Atmosphere: height fog and distance fog tinted by city light, rain particles (toggle in settings), wet road reflections (rough reflective material plus environment map, with light streak reflections from lamps, neon and police lights), steam vents.
- Ambient traffic: civilian cars that follow lanes, stop at red lights, swerve and honk when the player drives near. Near misses give style points and battery charge. Traffic can be crashed into and pushed realistically.
- Time of day presets in the menu: Night (default), Dusk and Rainy Night.

---

## SECTION 6: POLICE AI AND THE HEAT SYSTEM

Heat levels (1 to 5 stars), raised by speeding past police, crashing into police, destruction, property damage and mission objectives.
- Heat 1: 2 patrol cruisers follow and try to pull you over.
- Heat 2: 4 units, interceptors join, first ramming attempts.
- Heat 3: roadblocks of parked cruisers ahead of you, spike strips that pop tires (reduced grip and sparks from rims until repaired), helicopter arrives.
- Heat 4: SWAT trucks, rolling roadblocks on the highway, boxing in (one in front braking, two on the sides, one behind).
- Heat 5: drones with EMP pulses that disable thrusters for 3 seconds, heavy roadblocks with gaps you must thread or jump.

AI behavior:
- Path-find on the road graph to predict where you are going and cut you off through side streets.
- PIT maneuver attempts: an interceptor aligns with your rear quarter and pushes to spin you out.
- Formation driving and boxing in at high heat. Aggressive: early ramming, fast roadblocks, helicopter searchlight following the car.
- Police crash into each other, into traffic and into walls. Wrecked police cars smoke, burn and stay on the map for a while.
- Police radio subtitles at the top of the screen, for example: "Suspect heading north on Harbor Avenue, units 4 and 7 set a block at the bridge."
- Hard cap on active police units so 5-star heat never spawns endlessly.

Escape system (GTA-style):
- When you break line of sight, the minimap shows search cones for each unit and the helicopter searchlight.
- An "EVADE" meter fills while you stay out of all search cones. Fill it to drop to "COOLDOWN", then lose heat.
- Hiding spots: tunnels, under bridges, parking garages, alleys. Ghost Mode makes evading faster.
- BUSTED: if the car is stopped and boxed in by police for 3 seconds, a "BUSTED" sequence plays.

---

## SECTION 7: MISSIONS, RACES AND GAME LOOP

Structure: Free Roam with mission markers on the minimap. Each mission has a short briefing card, objectives, a timer where needed and a results screen with star rating.

Missions (at least 2 of each type, 10 missions total, with a light story about a driver called "VOLT" doing jobs for a mysterious contact):
1. GETAWAY: pick up a crew after a heist and escape a full Heat 3 pursuit to a safehouse.
2. DATA RUN: deliver a hard drive across the city through checkpoints before the timer ends.
3. BOUNTY: take down a set number of interceptors.
4. SKY GAP: land specific big jumps (broken bridge, container stack, highway gap) using thrusters.
5. GHOST PROTOCOL: reach a location without ever going above Heat 1, using Ghost Mode and stealth.

Street Races (the "multiple race tracks" of the original brief, built inside the open world, police can join mid-race):
- Highway Ring Sprint: top-speed loop of the elevated freeway.
- Canyon Drift Run: scored by drift style on the Hillside Canyon hairpins.
- Downtown Circuit: tight checkpoint circuit through the Downtown grid.
- Each race has rival AI drivers, checkpoints, lap times and a best-time record.

Progression:
- Earn Cash and Rep. Cash buys Garage upgrades: battery cooling, COPV tank size, thruster power, armor, tire grip and paint.
- Rep unlocks districts, missions and races.
- Save progress in localStorage.

---

## SECTION 8: SCORING AND STYLE SYSTEM

- Base values: Drift 10 per second, Near Miss 50, Perfect Landing 150, Flip 200, Barrel Roll 200, Cold Snap Landing 300, Takedown 500, Roadblock Smash 250, Air Time 25 per second.
- Chain combos within 3 seconds grow a multiplier (x1 up to x10). Crashing loses the unbanked chain. Bank by driving clean for 3 seconds.
- Style popups appear near the car in 3D space with a punchy animation and sound, then fly into the score counter. Big moves get bigger text and a short screen flash.
- A full 2 to 3 minute pursuit should land around 20,000 to 60,000 points.

---

## SECTION 9: VFX AND GAME FEEL (EVERY ACTION HAS FEEDBACK)

- Tire smoke: thick, lit by surrounding lights, from wheels with high slip.
- Skid marks: decal ribbons on the road that fade over time.
- Sparks: scraping walls, landing hard, driving on rims.
- Cold-gas thrusters: sharp white-blue vapor jets with frost particles and a short shock-diamond flicker, directional from each real nozzle position, never round blobs.
- Rear Rockets: bright exhaust plume, heat distortion behind the car, speed lines, chromatic aberration at the screen edges, motion blur, FOV widening.
- Hover Jets: downward blast that blows dust, water and debris away from the ground.
- Water splashes from puddles, rain streaks on the camera at high speed.
- Destruction: physics debris (glass shards, metal parts, concrete chunks), pooled and cleaned after 8 seconds.
- Explosions for wrecked police cars: fireball, smoke column, shockwave that pushes nearby objects, light flash.
- Police light bars: strong bloom and colored light spill on wet roads.
- Frost shockwave ring for Cold Snap landings.
- Damage screen effects: red edge pulse when HP is low, screen crack overlay after big hits.
- Hit stop: a 60 ms freeze on big impacts and takedowns.
- Cold Snap and Takedown Cam: slow motion, sound drop, dramatic camera angles.

---

## SECTION 10: CAMERA AND SENSE OF SPEED

- Chase cam (default): spring arm with smooth lag, looks slightly ahead in the direction of travel, swings outward during drifts, lowers and pulls back as speed increases.
- FOV: 65 at rest up to 90 at top speed, extra +8 punch when Rear Rockets fire.
- Camera shake: small constant rumble at high speed, strong shake on impacts and landings, scaled by force.
- Camera modes [C]: Chase Near, Chase Far, Bumper, Cinematic (auto-cuts between dramatic low angles and drone shots during pursuits).
- Cinematic moments: intro flyover of the city on game start, slow motion takedown cam, Cold Snap orbit cam, mission complete orbit shot around the car.
- Photo Mode [P]: pause, free camera, depth of field, filters, hide HUD.

---

## SECTION 11: AUDIO (WEB AUDIO API, NO FILES)

- Electric motor: layered oscillators with a rising whine that follows speed, a deep sub layer under load, a turbine-like whistle at very high speed.
- Tire squeal from slip amount, gravel and puddle noise from surface type, wind noise that grows with speed.
- Cold-gas thruster: sharp filtered white-noise hiss bursts, a deeper roar for Rear Rockets.
- Sirens: wail and yelp patterns with Doppler pitch shift from relative velocity and 3D distance falloff (PannerNode).
- Impacts: heavy low-end crunch, glass shatter, metal scrape loops.
- Helicopter rotor thump that gets louder when close.
- Adaptive music: dark synthwave generated in code, adding drums, bass and lead as Heat rises, dropping to a quiet pad during Ghost Mode and Cold Snap.
- Ghost Mode: motor fades almost to silence, the world gets a muffled low-pass filter.
- Master, Music and SFX volume sliders in Settings.

---

## SECTION 12: HUD, MENUS AND UX

HUD (clean, minimal, never blocking the road):
- Bottom left: circular minimap rotating with the car, showing roads, police dots with search cones, helicopter, mission marker and Air Stations.
- Above the minimap: Heat stars and the EVADE / COOLDOWN meter.
- Bottom right: large digital speedometer with an arc gauge, power bar, battery percent and temperature as a slim arc, COPV pressure as a second arc, handling mode indicator (TRACK / DRIFT / FLIGHT).
- Top center: mission objective and timer only when active, style score with multiplier.
- Top: police radio subtitles.
- Left edge: chassis HP as a slim bar plus damage overlays.
- No always-visible control buttons. Contextual control hints for the first minute and in the Pause menu, then hidden. H shows or hides controls.

Menus:
- Title screen: the Roadster slowly rotating in a dark garage with lights sweeping over the paint, game title with a glitch animation, buttons: Continue, Free Roam, Missions, Races, Garage, Settings.
- Garage: rotate the car, change paint, buy upgrades with stat bars.
- Pause: resume, controls, settings, restart mission, quit.
- Results screen after each mission, race or bust: time, top speed, takedowns, best combo, style score, star rating, cash earned. "PURSUIT TERMINATED" style, cinematic, with a slow-motion freeze frame of the final moment behind it.

Controls (shown in Settings, rebindable, saved):
- W/S or Up/Down: throttle and brake/reverse. A/D or Left/Right: steer.
- Shift: Rear Rockets. Space: Hover Jets. Ctrl: handbrake.
- Q/E: air roll left/right with thrusters. Arrow keys or mouse in air: pitch and yaw.
- F: Ghost Mode. 1/2/3: Handling mode. C: camera. G: doors. R: reset car. P: photo mode. Esc: pause. H: show/hide controls. X: X-Ray. F8: FPS counter. F9: collider debug.
- Full gamepad support via the Gamepad API (Xbox layout): triggers for throttle/brake, sticks for steering and air control, vibration on impacts where supported.

---

## SECTION 13: HOW TO WORK (MILESTONES AND DELIVERY)

- Deliver complete, working code. No placeholders, no "TODO", no "add your code here".
- Build in this order. Commit and push after each milestone with a clear commit message, so the game is playable at every step:
  1. Project setup (vendor libs, import map, module structure), collision and vehicle physics on a test city block
  2. Full city world, lighting, sky, atmosphere and post-processing
  3. Roadster and police models
  4. VFX, camera and game feel
  5. Police AI and heat system
  6. Audio
  7. Missions, races, scoring and progression
  8. Menus, garage, settings and polish
- Keep a `PROGRESS.md` file updated after every milestone: what is done, what is next, known issues. Future sessions will continue from it.
- Verify as you go: serve the folder locally and load it in a headless browser (Playwright, if available) to confirm there are no console errors and the frame renders. Take screenshots of key milestones and save them in `screenshots/` so progress can be reviewed.
- Before calling the game finished, run every test in the QA checklist below and fix failures.

---

## QA CHECKLIST (ACCEPTANCE TESTS)

| # | Test | Pass when |
|---|------|-----------|
| 1 | Drive at top speed with Rear Rockets into a building | Car crashes and deflects, never passes through |
| 2 | Camera near walls | Camera never shows the inside of a building |
| 3 | Big jump off the broken bridge | Real arc, controllable rotation with thrusters, weighty landing |
| 4 | Land upside down | Crash, damage, "Hold R to Reset" prompt |
| 5 | Drift mode on the canyon road | Long controllable slides, smoke, skid marks, battery recharges |
| 6 | Heat 3 to 5 | Roadblocks, spike strips, helicopter, boxing in, drones at 5 |
| 7 | Break line of sight | Search cones on minimap, EVADE meter fills, heat drops |
| 8 | Ghost Mode | Lights off, near-silent motor, speed capped, battery drains |
| 9 | Cold Snap | Slow motion, cinematic camera, frost shockwave on landing |
| 10 | Takedown | Slow-motion crash cam, style points, wreck stays on map |
| 11 | Score after a 2 to 3 minute pursuit | Roughly 20k to 60k, not hundreds of thousands |
| 12 | 20 minutes of play | FPS stable, no slowdown from particles or debris |
| 13 | Gamepad | Throttle, steering, thrusters, vibration all work |
| 14 | Settings | Quality presets, volume sliders and rebinding all work and are saved |
| 15 | Street Races | All 3 races run with rivals, checkpoints, lap times and saved best times |
| 16 | 5-star heat for 3 minutes | FPS smooth, police count stays capped |
