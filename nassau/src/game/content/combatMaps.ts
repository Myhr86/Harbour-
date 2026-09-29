// Hand-authored tactical maps. 12x8 tiles.
// Legend:
//  .  floor           #  wall (impassable)      c  crate (impassable, cover)
//  b  barrel          m  mast                   ~  water (shove = overboard)
//  r  ship rail (shove = overboard)            H  helm (objective)
//  h  hold hatch (floor)                        Z  hold zone (floor)
//  d  doorway (floor) X  exit (floor)           p  prisoner spawn (floor)
//  P  player spawn    E  enemy spawn

export interface CombatMapDef {
  id: string;
  name: string;
  kind: 'street' | 'deck' | 'wharf';
  blurb: string;
  rows: string[];
}

export const COMBAT_MAPS: Record<string, CombatMapDef> = {
  alley: {
    id: 'alley',
    name: 'Thieves’ Alley',
    kind: 'street',
    blurb: 'A crooked lane of crates and shut doors. Nobody lights it; everybody listens.',
    rows: [
      'P..c...##..E',
      'P..c....#..E',
      '..........bE',
      'P.##..c.....',
      '..##......E.',
      'P....b..##..',
      '..c.....##.E',
      '....cc......',
    ],
  },
  tavern: {
    id: 'tavern',
    name: 'The Tavern Doorway',
    kind: 'street',
    blurb: 'Hold the tavern door on Rum Row. Tables for cover, bottles for courage.',
    rows: [
      '###d####.###',
      'b.ZZZZ.....E',
      'P.ZZZZ..c..E',
      'P.ZZZZ.....E',
      'P.ZZZZ..c...',
      'b.ZZZZ.....E',
      '..c.....bb.E',
      '####...#####',
    ],
  },
  market: {
    id: 'market',
    name: 'Salt Market Square',
    kind: 'street',
    blurb: 'Fish stalls, salt barrels and a Company lock-up behind the weighhouse.',
    rows: [
      'X..#....c...',
      'P..#..b...E.',
      'P.....#...cp',
      'P..c..#..E..',
      'X.....c.....',
      'P..b....#.E.',
      '....#...#...',
      'X...#.....E.',
    ],
  },
  brig: {
    id: 'brig',
    name: 'Deck of the “Good Intent”',
    kind: 'deck',
    blurb: 'A merchant brig with a nervous crew. Take the helm and she’s yours.',
    rows: [
      'rrrrrrrrrrrr',
      'rP..b.....Er',
      'rP....m...Er',
      'rP..h..c..Hr',
      'rP..h.....Er',
      'rP....m..bEr',
      'rP..c.....Er',
      'rrrrrrrrrrrr',
    ],
  },
  wharf: {
    id: 'wharf',
    name: 'The Wharf',
    kind: 'wharf',
    blurb: 'Bollards, coiled rope and deep water on every side. Mind your footing.',
    rows: [
      '##b..###..##',
      'P......c...E',
      'P..cc......E',
      'P.......b..E',
      '..~~~..~~~..',
      'P.~~~..~~~.E',
      '...........E',
      '~~~~~~~~~~~~',
    ],
  },
};
