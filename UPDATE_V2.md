# RDSTR // Cold Gas Pursuit: Version 2 Update

Read this together with GAME_SPEC.md and PROGRESS.md. This update comes from a real human playtest. The 3D graphics quality is good and must be kept. Everything below is new work or a change to existing work. Where this file and GAME_SPEC.md disagree, this file wins.

## BUDGET RULES (IMPORTANT)

This update must be done on a tight compute budget. Work efficiently:
- Use PROGRESS.md and targeted file reads. Do not re-read the whole codebase.
- Reuse existing systems (vehicle, physics, police AI, VFX, audio) instead of rewriting them.
- Generate content from data and templates (tasks, shop types, building styles) instead of hand-writing each one.
- One quick headless smoke test (loads, no console errors, one screenshot) per milestone. No long QA loops.
- Commit and push after every milestone so nothing is lost if the session stops. Update PROGRESS.md each time with what is done and what is next.
- Work in the milestone order below. Milestones 1 to 4 are Part 1, Milestones 5 to 8 are Part 2.

---

## PLAYTEST FEEDBACK (WHAT TO FIX)

1. The menus and in-game interface look generic and basic. They need a unique, premium identity.
2. Night only, and too dark: things are hard to see. Daylight and weather options are needed.
3. Physics need more realism, better effects and animations.
4. Every part of the city looks the same: same buildings, nothing interesting. Props need more detail.
5. Roads are too narrow and it is too easy to drive off the main roads.
6. Thrusters are hard to control.
7. No people in the city.
8. Car shine, sunlight highlights and shadows can be more realistic.

---

## PART 1

### MILESTONE 1: TITLE SCREEN AND MAIN MENU (UNIQUE, PREMIUM)

Layout:
- The Roadster is the hero, shown large on the right or center of the screen in a stylish showroom scene: polished reflective floor, dramatic key light and rim lights, light sweeps across the paint, subtle haze, slow camera drift.
- All menu buttons stacked on the left side in a custom design that does not look like a default web UI: angled or cut-corner panels, animated hover states (glow line, slide, subtle sound), the RDSTR logo with an animated glitch or light-sweep effect. Consistent visual style used across every menu and HUD element in the game.

Buttons:
- PLAY
- PLAYER NAME (enter and save a name, shown on HUD and results screens)
- SETTINGS: Sound (master, music, SFX), VFX (particle amount, motion blur on/off, camera shake on/off), Graphics Quality (Low / Medium / High / Ultra plus resolution scale), Controls (keyboard and gamepad bindings, rebindable), HUD (see Milestone 4)
- GAME INFO (story, controls overview, mode descriptions, credits)
- SAVE GAMES (3 save slots with name, level, cash, playtime and last played date; load, overwrite, delete)
- EXIT (confirm dialog, then a "Thanks for playing" screen; browsers cannot close tabs, so this is the exit state)

Car viewer (live):
- The player can rotate the car with the mouse (drag), zoom with the scroll wheel (limits so the camera never goes inside the car), and use touch drag/pinch on mobile.
- Hotspot buttons on the car: open/close doors, open roof panel, lights on/off, reveal thruster nozzles.
- Every paint or upgrade change in the Garage updates this car live with a smooth transition.

### MILESTONE 2: DAYLIGHT, WEATHER AND LIGHTING QUALITY

After PLAY, the player picks:
1. Game mode (see Part 2; until Part 2 exists, show Free Roam only)
2. Map or district start point, shown as cards with a preview image rendered from the game
3. Time of day: Morning, Noon, Golden Hour, Sunset, Night
4. Weather: Clear, Cloudy, Rain, Fog, Storm (rain plus lightning flashes)

Lighting requirements:
- A real sun directional light whose angle and color follow the time of day, with a matching sky (physical sky model or gradient sky with sun disk and clouds).
- Daylight is the default for new players.
- Realistic cascaded or tightly fitted shadows from the sun on cars, people, props and buildings.
- Car paint: stronger clearcoat specular highlights from the sun and street lights, environment map updated per time of day so reflections match the sky.
- Night mode stays, but make it readable: brighter street lighting, better exposure, no areas of pure black.
- Wet roads only when it rains.

### MILESTONE 3: CITY OVERHAUL (VARIETY, DETAIL, ROADS, PEOPLE)

Roads:
- Make all main roads wider (at least 4 lanes on main streets, 6 on boulevards and the Highway Ring).
- Clear curbs, lane markings and road edges so the player always knows where the road is.
- Soft guidance: the minimap highlights the road; low walls, barriers or planters line the roads in dense areas so the car stays on the road without feeling trapped.

District variety (each district must look clearly different):
- Downtown Core: glass towers, offices, hotels, big neon billboards.
- Shopping District (new): street-level shops of many types: cafes, restaurants, fast food, clothing stores, electronics store, pharmacy, supermarket, car dealership, gym, cinema, bookstore. Each with its own facade, awning, sign and window display.
- Residential Hills: houses with gardens, fences, trees, driveways, parked cars.
- Harbor and Docks, Construction Zone, Highway Ring, Hillside Canyon: keep, but add more props and detail.
- City Park (new): trees, grass, lake, paths, benches, fountain.
- Building styles built from modular, data-driven pieces (base, middle floors, top, materials, colors) so many different buildings are generated cheaply.
- More prop detail everywhere using InstancedMesh: signs, awnings, AC units, planters, bikes, kiosks, billboards, street art.

Key locations (marked on minimap with icons):
- POLICE STATION: a detailed building with a parking lot full of police cruisers. Police units at higher heat visibly spawn and drive out from here.
- CHARGING STATIONS (several around the city): drive in and stop to recharge the battery with a charging animation (cable or light ring, filling battery bar, sound). Costs a little in-game cash.
- REPAIR SHOPS (several): drive in to restore chassis HP with a short repair animation (sparks, garage door, tools sound). Costs in-game cash. Also refills COPV thruster pressure.
- GARAGE / TUNING SHOP: opens the upgrade and paint menu.

People:
- Pedestrians walking on sidewalks, crossing at crosswalks, standing at shops and bus stops. Simple low-poly human models with varied clothing colors and walk animations, using instancing.
- When the car comes close, pedestrians react and dive out of the way. If touched, they stumble, fall and get back up. No blood, no injury, no death, ever. In Kids Mode they always dodge in time.

GRAFIGATOR LANDMARK (must look built-in, not like a watermark):
- A distinctive modern building in the Downtown or Shopping District on a busy main road the player passes often (and near the default spawn), called "GRAFIGATOR Design Studio".
- The logo file is in `reference/grafigator-logo.svg`. Turn it into a 3D illuminated sign on the building facade: extruded or layered letters/shape with depth, lit from behind with a soft glow at night and real shadows in daylight.
- Use the brand colors lime yellow #e7f75b and light teal #54dc9d as accent lighting and trim on the building.
- Ground floor: glass storefront with a studio interior visible through the windows (desks, screens, design posters), plus a smaller logo on the glass door.
- Add the Grafigator logo on 2 or 3 billboards around the city as in-world advertising, styled like the other fictional brands.
- Show it in the main menu showroom too, as a subtle sign on the showroom wall.

### MILESTONE 4: HUD, THRUSTER CONTROL, PHYSICS AND FEEDBACK

HUD (redesigned in the new visual style, clean and readable):
- Speedometer, battery charge level, chassis health, thruster (COPV) pressure, each as a clear gauge with icons, color changes when low (green, yellow, red) and a warning pulse.
- Settings > HUD: show/hide each element separately (speedometer, battery, health, thrusters, minimap, score) and choose position for the gauges (bottom, side or top). Saved to settings.
- Thruster usage visual: on-screen indicator showing which thrusters are firing and remaining pressure.

Thruster control (make it easy):
- New "Assisted Flight" mode, ON by default: the car automatically stays level in the air, the player only presses one key for each simple action: Space = hover/lift, Shift = boost forward, Q/E = barrel roll left/right, W/S in air = flip forward/back. The car auto-straightens before landing so landings are usually clean.
- "Pro Flight" mode in settings keeps the full manual control.
- Gentle air stabilization and a landing preview marker on the ground showing where the car will land.

Physics and effects realism:
- More believable suspension movement, body roll and pitch under braking and acceleration.
- Better tire grip on road vs grass/dirt (slower and slippery off-road, which also encourages staying on the road).
- Stronger feedback: tire smoke, skid marks, sparks, dust, water spray, debris and camera shake tuned to feel realistic, not exaggerated.
- Car damage visible on the model as health drops (scratches, dents, broken lights, smoke).

---

## PART 2

### MILESTONE 5: CAR UPGRADES AND PAINT (GARAGE)

- Paint: at least 12 colors including metallic, pearl and matte finishes, plus custom color picker, wheel/rim color and brake caliper color.
- Upgrades with 5 levels each, bought with cash: Motor Power, Battery Capacity, Battery Cooling, Thruster Power, COPV Tank, Armor (max health), Tire Grip, Suspension.
- Each upgrade shows stat bars (before vs after) and visibly changes the car where it makes sense (wider tires, rear wing, armor plating, glowing thruster rings).
- Changes appear live on the menu car viewer.

### MILESTONE 6: GAME MODES

PLAY shows mode cards:
1. RACE MODE: classic racing on dedicated tracks with rival AI cars, laps, checkpoints, positions, lap times and best-time records. At least 5 tracks: Downtown Circuit, Highway Ring Sprint, Canyon Drift Run, Harbor Loop, Park Speedway. No police unless the player turns on "Police Interference".
2. HEIST MODE: plan and carry out a robbery (bank, jewelry store, armored truck), collect the loot, then escape a full city-wide police chase to a safehouse. Heat rises during the escape. At least 5 different heists.
3. CAREER MODE (tasks): at least 100 unique tasks with levels. Build them from data templates in a single JSON file, mixing task types (deliveries, time trials, drift scores, jumps, stunts, chase escapes, takedowns, races, photo spots, collectibles, parking challenges, charge-economy challenges) with different locations, targets and modifiers so each task feels different. Difficulty increases smoothly with each task. Completing tasks gives XP, cash and level-ups; new levels unlock districts, upgrades and paint.
4. KIDS MODE: daylight only, no police, no damage, no failing. Free ride around the city with fun easy challenges (collect stars, pop balloons, drive through hoops, find hidden animals), bright cheerful music, slower max speed, large simple HUD.
5. FREE ROAM: open city with all features, time of day and weather choice.

### MILESTONE 7: SAVE SYSTEM

- Autosave on mission/task/race completion, on quitting to menu and every 2 minutes in free roam.
- 3 manual save slots (from the main menu SAVE GAMES button and the Pause menu).
- Saves: player name, level, XP, cash, completed tasks, unlocks, upgrades, paint, settings, current mode and car position in free roam.
- CONTINUE on the title screen loads the latest save and puts the player back where they left.
- Stored in localStorage with a version number so future updates do not break old saves.

### MILESTONE 8: POLISH AND FINAL CHECK

- Consistent visual style across menus, HUD, results screens and popups.
- Loading screen with tips and the car silhouette.
- Make sure performance stays smooth at Medium on a mid-range laptop with the new pedestrians, props and lighting (instancing, LOD, culling).
- Final smoke test of every mode and update PROGRESS.md with a full summary.
