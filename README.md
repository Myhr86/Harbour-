> **Also in this repo: [NASSAU: Pirate Republic](nassau/README.md)**, a single-player, turn-based captain-politician game set in Nassau in 1718 (Vite + React + TypeScript, runs entirely in the browser). `cd nassau && npm install && npm run dev`.

# Harbor Compact

**One city. Three sides. One economy.**

A persistent, browser-native city where mafia crews, legitimate businesses and the police share one map and one economy. It runs in a browser tab with nothing to download: an SVG district map, WebSockets for presence and chat, and timed live events. Play from a phone or a desktop. The city keeps moving while you're away.

## Run it

```bash
npm install
npm start            # http://localhost:3000
FAST=1 npm start     # shorter timers and cooldowns for playtesting
npm test             # game-rule tests (node:test)
```

Environment variables: `PORT` (default 3000), `DATA_DIR` (default `./data`, where the city is saved as `state.json` every 30s and on shutdown), `FAST=1`, and `ADMIN_TOKEN` (enables `POST /admin/season` with `Authorization: Bearer <token>` to end the season early).

Open two browser windows with different names to see live multiplayer. If you're the only person online, NPCs fill empty event roles, chat in character, run rackets, build case files and take envelopes.

## Everyone has two lives

You arrive as a **civilian** with a legal job. You can work shifts for clean cash, then pick a track (or drift into one):

| Track | Earns | Main actions |
|---|---|---|
| **Family** | Dirty cash, heat | Rackets (shakedown / smuggling / protection), claim blocks, plan heists, call sit-downs, launder, intimidate witnesses |
| **Board** | Clean income, influence | Buy companies, set how dirty the books are, act as a front for a Family, bury paper, lobby City Hall, call board meetings |
| **Badge** | Influence, reputation | Patrol, crackdowns, open case files, investigate / subpoena / interview, offer witnesses deals, request raids, overreach, submit to the DA, keep or log envelopes |

Switching sides costs reputation, halves your influence and drops your territory. People remember.

## Systems

- **Heat vs. Influence.** Crime raises heat, and heat makes you easier to investigate. Business and political favors raise influence. Police spend influence to open and work cases, and they gain heat when they overreach.
- **Dirty vs. clean money.** Family crime pays dirty cash. You can wash it through a fence at a 40% cut, or through a Board partner's front for their cut. Every laundered dollar and every dirty book adds to that company's **paper trail**, which subpoenas and raids turn into evidence.
- **Evidence, not health bars.** A case file collects evidence (Inconclusive, Partial, Collected, Verified) and witnesses. Once a file reaches 40% strength, word of it gets out, and Families can lean on witnesses while Boards bury paper. At 35% or more an officer can submit it to the DA. The trial is short and timed, and the judge's corruption (and whoever has been paying them) matters. A conviction costs the target a life and some jail time, and seizes any fronts. An acquittal after overreach burns the officer.
- **Envelopes.** Anyone can bribe a Badge player. If the officer keeps it, they get dirty cash and any case named in the envelope gets weaker. If they log it, they gain influence and the briber gets a new case file.
- **Territory is tax, not paint.** A block holder takes a racket cut of every crime committed there and a business tax on every company's income there. Crackdowns can break a holder's grip. A district with heavy police presence and no holder is under Badge control.
- **Live events** (heists, raids, board meetings, sit-downs) have roles and a countdown. The timer pauses until the required roles are filled, and NPCs step in when nobody else does. During a heist the Fence can run with the whole take, and anyone can snitch. Betrayal is cheap the first time and expensive after that.
- **Lives.** You lose one to a conviction or a hit at a sit-down. Lose all three and you start over as a civilian, but your name and reputation stay.
- **Seasons with memory.** At the end of a season (7 weeks by default) the mayor, commissioner, judge and every block reset. Companies, reputations and grudges carry over.

## Code layout

```
server/
  data.js    districts, starting assets, NPC cast, crimes, event templates, chatter
  game.js    authoritative rules: actions, tick loop, events, cases, trials, per-player views
  npc.js     NPC director: chatter, NPC crews and detectives, bribe decisions, event supply
  index.js   static HTTP server + WebSocket gateway, persistence
public/
  index.html, style.css, app.js   mobile-first client (Map · Ledger · Events · Chat · Profile)
test/
  game.test.js
```

The `Game` class knows nothing about the transport it runs over. Time and randomness are injected, so the rules can be tested deterministically. Clients only ever get a **filtered view**: company books are visible only to their owner, full case files only to the Badge, and a target only learns about a case once it's rumored on the street.
