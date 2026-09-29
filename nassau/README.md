# NASSAU: Pirate Republic

*Nassau, New Providence, 1718.* You are a captain who stayed ashore, and now you run a crew like a crooked town council. Own the docks, keep your lieutenants loyal, win messy brawls and boarding actions, and survive hurricanes and navies much bigger than you.

This is a turn-based captain-politician game for one player, designed as a complete 20–40 minute vertical slice. It runs entirely in the browser: no backend, no asset files, no LLM at runtime.

## Run it

```bash
cd nassau
npm install
npm run dev        # http://localhost:5173
npm test           # rules tests + full-season simulations (vitest)
npm run build      # typecheck + production build into dist/
```

## How a day plays

1. **Dawn events.** Storm warnings, raids, insults, prize ships, navy inspections, Company offers. Each has 2–3 choices, and number keys pick them.
2. **Orders.** Click a district, pick an order, choose which lieutenant leads it. Every active lieutenant can lead one order a day, and their stats set the odds (the percentages are shown before you commit).
   - **Protect Lane**: +fortification, cools heat, and the lieutenant is on the spot if raiders come.
   - **Smuggle**: needs a seaworthy ship. Pays nearly double during a blockade, which is often the only money you'll make then.
   - **Wreck**: coastal districts only. Big payout and big infamy, and the Company will hate you for it.
   - **Parley**: seek a truce, buy a district outright, or talk the navy down. Father Thorne is the best at this.
   - **Muscle In**: a street brawl to seize a district that borders one of yours. One brawl per day.
   - **Build / Repair / Batten Down / Rally Crew**.
3. **End Day** (press **E**). Income, wages, rum, heat, pardon drift, the hurricane clock and the navy clock all tick. Then the rival factions make their moves.

**Win** by holding 4 of 6 districts through 3 consecutive dawns (**Pirate King of the Docks**), holding the Prize Court and the Shipyard for 8 days, or reaching 100% pardon (**Bought Pardon**).
**Lose** (**Washed Out**) if morale hits 0, you can't pay wages for 3 days, the Company occupies the Docks for 3 dawns, you lose every district, or day 40 arrives.

### Bigger than raids

- **Hurricanes** give 48 hours' warning (72 with a Lookout). Landfall drinks rum (`20 + crew/2`); if you run dry, morale drops 25. It unroofs any building that wasn't battened down, sinks ships at sea, and holes ships left riding at anchor. *Batten Down* a coastal district to double-moor your ships.
- **Blockades** start when Navy Alert reaches 100%. Navy Alert rises every day with heat and infamy, and faster when the Company pays for patrols. During a blockade, ship trade collapses (the Docks earn about 30% of normal), marines may land on your wharves, and navy fights are brutal.

### Combat

Combat uses a grid, turn-based by individual initiative (the portrait bar), with up to 6 of your units against up to 8 enemies. Each unit gets 4 AP per turn.

| Action | AP | Notes |
|---|---|---|
| Move | 1/tile | reachable tiles are highlighted |
| Melee | 2 | +8% per ally flanking the target |
| Boarding Pike | 2 | reach 2 in a straight line, knocks the target back, and can push them **overboard** |
| Shove | 1 | into the sea or over the rail = out of the fight; into a wall = stunned |
| Brace | 1 | −20% to be hit, −1 damage; ends your turn |
| Pistol | 2 | **once per fight per side**; loud, so it adds heat to the district |
| Rally | 2 | lieutenants only, once per fight: heals nearby allies and shakes off stuns |
| Parley | 3 | Thorne and Beaumont: talk an enemy into surrendering |

Objectives vary: rout them, take the helm, hold the doorway for 5 rounds, or extract a prisoner. Losing a brawl costs a district's income for 2 days, not the game. Downed lieutenants may die (20%, or 35% against the navy). Keyboard: `1`–`8` for actions, `Space` to end the unit's turn. **Auto** lets the AI play the current unit.

## Content (hand-authored)

- **6 districts**: The Docks, Thieves' Alley, Salt Market, Rum Row, Shipyard, Fort Slope
- **8 buildings**: Tavern, Vice Hall, Shipyard Berth, Prize Court, Warehouse, Lookout, Chapel, Armory
- **6 lieutenants**, each with loyalty, a vice, a specialty and one-line opinions after major events. Four start with you; Jonah Crane (an ex-navy bosun) and Solange Beaumont (a fence) join through events. Lieutenants can be wounded, die, refuse orders, or defect to Hart.
- **5 factions**: your crew (teal), the Red Knives (red), Hart's Faction (plum), the Charter Company (gold), and the Governor's Navy (a clock, not a gang)
- **16 events** (12 in the random pool, 4 triggered by the clocks, the AI or loyalty), **5 combat maps**, **3 endings**

## Code layout

```
nassau/src/
  game/                 pure TypeScript rules, no React, no DOM
    types.ts            GameState and friends (plain JSON, so it's saveable)
    rng.ts              seeded mulberry32; its state lives in GameState.rng
    state.ts            newGame(seed, crewName)
    actions.ts          player orders: availability, odds, resolution
    day.ts              endDay(): economy, weather, blockade, AI, events, win/lose
    ai.ts               rival faction utility AI (expand / raid / fortify / parley / fund navy)
    combat.ts           tactical engine: setup, initiative, actions, hit chances, AI
    encounters.ts       builds combat setups (seize / defend / board / navy / rescue)
    outcomes.ts         applies a finished fight back to the strategic layer
    endings.ts          win/lose checks + the three endings
    save.ts             localStorage save/load/settings
    helpers.ts          small shared utilities (logging, barks, loyalty)
    content/            hand-authored content modules
      districts.ts buildings.ts factions.ts lieutenants.ts barks.ts
      events.ts combatMaps.ts
    sim.test.ts         determinism, all encounters, 100 bot-played seasons
  ui/                   React components (SVG map, combat board, modals, HUD)
  audio.ts              WebAudio-synthesized stings (no audio files)
  App.tsx               screen flow + state management
```

Every UI action calls a rules function on a `structuredClone` of the state, so the rules can be tested headless and the React tree stays thin. All randomness goes through `game/rng.ts` using the saved RNG state. The autosave is written at every dawn, so loading it replays the day exactly as it played (the test suite checks this).

### Tuning

The balance levers live at the top of their modules: wages in `day.ts`, enemy squad sizes in `encounters.ts`, unit templates in `combat.ts` (`ENEMY`), AI weights in `data/factions.ts`, and the win thresholds in `endings.ts`. Run `npm test` after changing them. The simulation prints the combat win rates and the spread of endings for a bot that plays aggressively and a bot that chases the pardon.

## Accessibility

- **E** ends the day, **1–4** pick event choices, **1–8** and **Space** drive combat, **Esc** closes dialogs, and **?** opens help.
- The **Reduce flashes & motion** setting turns off storm lightning, screen shake and the spinning hurricane. It's on by default if your OS prefers reduced motion.
- Text is light on dark wood with high contrast, and success odds are always printed as numbers, never shown by colour alone.
