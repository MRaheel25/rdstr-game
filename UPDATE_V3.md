# RDSTR // Cold Gas Pursuit: Version 3 Update

Read this first, then PROGRESS.md. UPDATE_V2.md Part 1 is done and merged. This file replaces UPDATE_V2.md Part 2 and adds new playtest feedback. Where this file and older spec files disagree, this file wins.

The target look and feel: a modern new-gen racing game like the latest Need for Speed and Asphalt. Clean, bright, confident, premium. Nothing should look like a generic AI-made web page.

## BUDGET RULES (IMPORTANT)

The budget for this whole update is tight. Work efficiently:
- Use PROGRESS.md and targeted file reads. Do not re-read the whole codebase.
- Reuse existing systems (vehicle, physics, AI driver, police, VFX, audio, activities, markers) instead of rewriting them.
- Generate content from data and templates (tracks, taxi fares, career tasks) instead of hand-writing each one.
- One quick headless smoke test (loads, no console errors, one screenshot) per milestone. No long QA loops.
- Work strictly in the priority order below. Commit and push after every milestone so nothing is lost if the session stops. Update PROGRESS.md each time with what is done and what is next.
- Work on a new branch from main and open a pull request when done (or when you stop).

---

## PLAYTEST FEEDBACK (WHAT THE PLAYER SAID)

1. The car sound is a harsh high beep that hurts the ears.
2. Game modes (Race, Heist, Career, Kids) show "Coming soon". Some districts are locked. The player wants to try everything right away.
3. Locations are hard to find. Charging stations were not noticed at all.
4. Main menu still looks generic. The neon poles in the background look like glitches. The money / level / rep / jobs line is tiny. The clickable dots on the car are not wanted.
5. In-game HUD for thrusters, charge and health should look like a modern racing game.
6. Thrusters are still hard to control and the car gets destroyed.
7. Crashes and destruction need to look real and high quality.
8. Racing should have no rings on the road, different tracks and weather, up to 9 opponents, and obstacles.
9. New Taxi mode.

---

## MILESTONE 1: UNLOCK EVERYTHING, MAP AND NAVIGATION (do first, it is quick)

- Remove every lock: all game modes, all districts, all missions and races are open from the start. Rep and level still go up and still unlock paint and upgrades, but never block where the player can go or what they can play.
- Full-screen MAP (key M, and a MAP button in the pause menu): the whole city with district names, roads, and clear icons with a legend for: charging stations, repair shops, tuning garage, police station, Grafigator studio, mission and race starts, taxi stands. Click any icon or location to set a waypoint.
- GPS route: once a waypoint is set, draw the route on the minimap and on the full map along the road graph (bright line), plus a soft glowing route line or arrows on the road ahead. Show the distance to the waypoint on the HUD.
- Minimap: bigger, cleaner icons, and service icons (charging, repair) always visible. Nearest charging station gets a small edge arrow on the minimap when battery is under 25 percent.
- Charging stations must be impossible to miss in the world: a branded canopy with bright lit signage and a tall icon pylon visible from far away, at least 8 spread across all districts. Check that the existing ones from V2 actually spawn and work, and fix them if not.

## MILESTONE 2: SOUND FIX AND MUSIC OPTIONS

- Replace the electric motor sound. No harsh high beeps or piercing tones. It must sound smooth, deep and satisfying like a real high-end EV: a warm low hum built from sine and soft triangle layers through a low-pass filter, a gentle rising tone with speed that never goes shrill (cap the pitch and filter the highs), a soft whoosh of air at high speed, and a subtle punchy surge on hard acceleration. Keep all motor layers at moderate volume and run them through a gentle compressor.
- Review every other synthesized sound (sirens, UI clicks, thrusters, warnings) and remove anything piercing. UI sounds should be soft, short and premium.
- Settings > Sound: Music ON/OFF, a choice of at least 3 music styles (for example Synthwave, Chill, Drum & Bass), and separate volume sliders for Engine, Music, SFX and UI.

## MILESTONE 3: MAIN MENU, FIRST IMPRESSION (very important)

The main menu is the first impression of the game. It must look like a big-budget racing game.

Showroom scene, light version by default:
- Replace the dark room with a bright, clean, high-end studio: a soft white or light grey infinity backdrop (curved floor-to-wall), large soft area lights overhead, a glossy light floor with a real soft reflection of the car, gentle contact shadows under the car. Think a premium car reveal photo shoot.
- Remove the neon poles and the glitchy streak effects completely.
- Subtle, smooth motion only: slow light sweep across the paint, slow camera drift. No flicker, no glitch effects.
- Optional "Night Studio" toggle in Settings for a darker version, but light is the default.

Car interaction, no hotspot dots:
- Remove the clickable dots on the car.
- Mouse drag to rotate (with smooth inertia), scroll to zoom (smooth, with limits), right drag or two-finger drag to pan slightly, touch drag and pinch on mobile.
- Clicking directly on a door opens or closes that door. Clicking the roof removes or replaces the roof panel. Clicking the rear reveals the thruster nozzles. Clicking the headlights toggles lights. Hovering a part shows a soft highlight outline so the player discovers it naturally.

Menu panel and typography:
- Bundle a modern display font and a clean UI font locally (install from npm, for example @fontsource/rajdhani or @fontsource/chakra-petch for headings and @fontsource/inter for body text, copy the files into vendor/fonts). Zero external requests.
- Redesign the left menu in a clean modern racing-game style: strong heading, generous spacing, smooth hover and focus animation (slide plus accent bar), consistent icons. Everything animates smoothly at 60 fps with eased transitions; no abrupt jumps.
- Player stats (cash, level with XP progress bar, rep, jobs) as a proper player card at the top: large readable numbers, small icons, level badge. Not tiny text.
- Mode select and district select: large image cards with real rendered previews, smooth hover zoom, readable text on a clear background.
- The whole UI must be responsive: correct at 1280x720, 1920x1080, ultrawide and mobile screen sizes.

## MILESTONE 4: IN-GAME HUD (modern racing game style)

- Redesign the HUD in the same modern style as the new menu (same fonts, colors, shapes).
- Bottom right: large clean speedometer with a smooth arc, digital speed in big numbers, and right under it a THRUSTER bar styled like a nitro bar in Asphalt: segmented, glows and drains in real time while thrusters fire, refills visibly.
- Battery charge: a sleek horizontal bar with a battery icon, percent, color shifting green to yellow to red, and a charging animation while at a station.
- Car health: a small car silhouette that shows damage per zone (front, rear, sides) plus a health bar.
- Small thruster diagram showing which jets are firing.
- Keep the show/hide and position options from V2.
- Everything readable at a glance, nothing covering the road in front of the car.

## MILESTONE 5: THRUSTER CONTROL AND SAFE LANDINGS

The player still cannot control the car in the air and it gets destroyed. Fix this properly:
- Assisted Flight (default): the car always stays level and stable in the air. Simple controls: Space = lift, Shift = boost, W/S = pitch nose gently, A/D = turn in the air, Q/E = optional barrel roll trick that always finishes level.
- Auto landing: when the car is close to the ground, it automatically levels, slows the fall with a short hover burst and lands on its wheels.
- In Assisted Flight, a landing on four wheels never causes heavy damage, even from a big jump. Only crashing into walls or landing upside down in Pro Flight causes heavy damage.
- Make sure there is always enough thruster pressure for a safe landing (keep a small reserve that only the auto landing can use).
- Pro Flight in Settings keeps full manual control for expert players.
- Test a big jump with a scripted Assisted Flight run and confirm a clean landing with low damage.

## MILESTONE 6: REALISTIC CRASHES AND DESTRUCTION

- Body deformation at the impact point (vertex displacement on the body mesh), visible dents that build up.
- Parts that break off with real physics: bumpers, side mirrors, rear wing, doors at high damage, wheels at extreme damage. They bounce and slide on the road.
- Glass shattering into small shards, sparks scraping along the road, smoke from the damaged area, fire at very low health.
- Heavy impacts: short slow motion with a dramatic camera angle, then back to normal (no more than once every 6 seconds).
- Rollovers: the car tumbles and rolls realistically after big side hits.
- Police and traffic cars get the same deformation and breakaway parts in a lighter form.
- Wrecked state: car body crumpled, smoking, with a clear "WRECKED" screen and a quick respawn option.

## MILESTONE 7: RACE MODE

- No floating rings on the road. Checkpoints are invisible lines. The track itself guides the player: barriers, tire walls, cones, arrow boards on corners, a start/finish gantry with lights, and a GPS racing line arrow on the minimap.
- At least 6 tracks, each with its own default weather and time of day, and the player can change weather and time before the race: for example Downtown Circuit (noon, clear), Highway Ring Sprint (golden hour), Canyon Drift Run (morning, fog), Harbor Loop (rain), Park Speedway (morning sun), Night Neon Circuit (night, storm).
- Choose the number of opponents from 1 to 9 before the race. Opponents have different car colors and names and race smartly (overtaking, braking for corners).
- Obstacles on the track to make racing challenging, placed by data per track: cones, barrels, construction barriers, oil slicks (grip loss), water puddles (spray and slight slide), ramps for shortcuts, slow trucks, and swinging or sliding barriers on harder tracks.
- Countdown with start lights, live position, lap times, best-time records, results with podium.
- No police unless the player turns on "Police Interference".

## MILESTONE 8: TAXI MODE

- Pick up passengers waiting at the roadside (person with a waving animation and a marker), drive them to their destination, drop them off.
- Fare depends on distance and time; a time bonus for fast delivery; a tip for smooth driving; passengers get scared and the tip drops with crashes.
- Passenger comments as short subtitles (excited at high speed, scared after crashes, happy on arrival).
- Destinations spread across all districts, with GPS route on the map and minimap.
- Shift mode: as many fares as possible in 10 minutes, with a results screen.
- Optional taxi roof light on the car while in this mode.

## MILESTONE 9: OTHER MODES AND SAVES (from V2 Part 2)

Do as much of this as the budget allows, in this order:
1. Kids Mode: daylight, no police, no damage, no failing, slower max speed, fun easy challenges (collect stars, pop balloons, drive through hoops, find hidden animals), bright cheerful music, big simple HUD.
2. Heist Mode: at least 3 heists (bank, jewelry store, armored truck): collect the loot, escape a city-wide police chase to a safehouse.
3. Career Mode: at least 100 tasks generated from data templates in one JSON file (deliveries, time trials, drift scores, jumps, stunts, chase escapes, takedowns, races, taxi fares, collectibles, parking challenges, charge-economy challenges), difficulty rising smoothly, XP and level-ups.
4. Save system: autosave on completion, on quit and every 2 minutes; 3 manual slots; CONTINUE returns the player to where they left; versioned localStorage saves.
5. Garage: at least 12 paints (metallic, pearl, matte), custom color picker, rim and caliper colors, 8 upgrades with 5 levels each, visible changes on the car.

## MILESTONE 10: POLISH

- Consistent modern style across menus, HUD, results screens, briefings and popups.
- Smooth eased transitions between all screens; loading screen with tips.
- Keep performance smooth at Medium on a mid-range laptop.
- Final smoke test of every mode, update PROGRESS.md with a full summary, open the pull request.

## BRANDING RULE

The Grafigator logo appears only inside the city (the Grafigator Design Studio building and a few in-world billboards styled like the other fictional brands). Never on the main menu, showroom, loading screen or HUD.
