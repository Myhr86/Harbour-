import type { LtId } from '../types';

// One-line opinions. Each topic lists a mood per lieutenant: approve raises
// loyalty a little, disapprove lowers it. Keep them short and salty.
export type BarkTopic =
  | 'dawn'
  | 'idle'
  | 'unpaid'
  | 'hurricane'
  | 'landfall'
  | 'blockade'
  | 'win'
  | 'loss'
  | 'taken'
  | 'lost'
  | 'wreck'
  | 'navyParley'
  | 'prize'
  | 'pardon'
  | 'vice'
  | 'deal';

type Line = { text: string; mood: 'approve' | 'disapprove' | 'neutral' };

export const BARKS: Record<BarkTopic, Partial<Record<LtId, Line[]>>> = {
  dawn: {
    hawkins: [{ text: 'Wages first. Glory after.', mood: 'neutral' }, { text: 'Ledger’s open, Captain. Let’s make it heavier.', mood: 'neutral' }],
    dixon: [{ text: 'That Company sloop is sitting fat.', mood: 'neutral' }, { text: 'My cutlass is bored, Captain.', mood: 'neutral' }],
    bridge: [{ text: 'Glass is steady. For now.', mood: 'neutral' }, { text: 'I know three channels the navy doesn’t.', mood: 'neutral' }],
    thorne: [{ text: 'I can talk to the commodore. After one drink. Or three.', mood: 'neutral' }, { text: 'Blessed are the dry of powder.', mood: 'neutral' }],
    crane: [{ text: 'I know how the navy thinks. Badly, and on schedule.', mood: 'neutral' }],
    beaumont: [{ text: 'Everything in Nassau has a price. Especially the honest things.', mood: 'neutral' }],
  },
  idle: {
    hawkins: [{ text: 'A quartermaster with nothing to count is a sad thing.', mood: 'disapprove' }],
    dixon: [{ text: 'Sitting on my hands makes me want to use them on someone.', mood: 'disapprove' }],
    bridge: [{ text: 'A quiet day ashore. I’ll not complain.', mood: 'approve' }],
    thorne: [{ text: 'Idle hands, full cup. The Lord provides.', mood: 'neutral' }],
    crane: [{ text: 'On a King’s ship we’d be holystoning the deck by now.', mood: 'disapprove' }],
    beaumont: [{ text: 'You pay me to sit? Very well. I sit expensively.', mood: 'neutral' }],
  },
  unpaid: {
    hawkins: [{ text: 'You missed wages. I told them you wouldn’t. Now I’m a liar too.', mood: 'disapprove' }],
    dixon: [{ text: 'The lads are muttering. I’m starting to agree with them.', mood: 'disapprove' }],
    bridge: [{ text: 'Empty purse, full sails — a ship sails on the first, not the second.', mood: 'disapprove' }],
    thorne: [{ text: 'Poverty is a virtue. Not one the crew admires.', mood: 'disapprove' }],
    crane: [{ text: 'Even the King paid, eventually.', mood: 'disapprove' }],
    beaumont: [{ text: 'Hart pays on time, you know. I only mention it.', mood: 'disapprove' }],
  },
  hurricane: {
    hawkins: [{ text: 'Storms drink rum faster than sailors. Stock the casks.', mood: 'neutral' }],
    dixon: [{ text: 'Can’t stab weather. Pity.', mood: 'neutral' }],
    bridge: [{ text: 'Storm by morning. We should not be at sea.', mood: 'neutral' }],
    thorne: [{ text: 'I shall pray. Loudly. With a bottle, for acoustics.', mood: 'neutral' }],
    crane: [{ text: 'Batten down, double the lines on the moorings.', mood: 'neutral' }],
    beaumont: [{ text: 'After a storm, salvage is cheap and questions are few.', mood: 'neutral' }],
  },
  landfall: {
    hawkins: [{ text: 'Counting what’s left. It’s a short count.', mood: 'neutral' }],
    dixon: [{ text: 'Still standing. The weather owes me a rematch.', mood: 'neutral' }],
    bridge: [{ text: 'I told you. I always tell you.', mood: 'neutral' }],
    thorne: [{ text: 'We live. Clearly someone up there owes me a favour.', mood: 'neutral' }],
    crane: [{ text: 'The Company lost more than we did. Small mercies.', mood: 'neutral' }],
    beaumont: [{ text: 'Driftwood, cargo, bits of Company pride. I can sell all of it.', mood: 'approve' }],
  },
  blockade: {
    hawkins: [{ text: 'No ships in, no coin in. Smuggle or starve.', mood: 'neutral' }],
    dixon: [{ text: 'Let them come ashore. I dare them.', mood: 'neutral' }],
    bridge: [{ text: 'A blockade is a net. Nets have holes. I know every one.', mood: 'approve' }],
    thorne: [{ text: 'Let me row out with a bottle of the good stuff.', mood: 'neutral' }],
    crane: [{ text: 'Frigate on the north channel, cutter on the south. Every six hours.', mood: 'neutral' }],
    beaumont: [{ text: 'Scarcity doubles prices. I love a good siege.', mood: 'approve' }],
  },
  win: {
    hawkins: [{ text: 'Victory. Now, who’s paying for the broken chairs?', mood: 'approve' }],
    dixon: [{ text: 'Ha! Again, I say. Again!', mood: 'approve' }],
    bridge: [{ text: 'Good. Can we stop now?', mood: 'neutral' }],
    thorne: [{ text: 'The meek shall inherit. We, however, took it.', mood: 'approve' }],
    crane: [{ text: 'Clean work. Almost regulation.', mood: 'approve' }],
    beaumont: [{ text: 'Winning is lovely. Profitable winning is lovelier.', mood: 'approve' }],
  },
  loss: {
    hawkins: [{ text: 'That cost us more than coin.', mood: 'disapprove' }],
    dixon: [{ text: 'Next time, let me go first.', mood: 'disapprove' }],
    bridge: [{ text: 'I did say running was an option.', mood: 'neutral' }],
    thorne: [{ text: 'Pride goeth. So did we, quite quickly.', mood: 'disapprove' }],
    crane: [{ text: 'Sloppy. The navy would have hanged the lot of us.', mood: 'disapprove' }],
    beaumont: [{ text: 'I backed the wrong horse. I rarely do.', mood: 'disapprove' }],
  },
  taken: {
    hawkins: [{ text: 'More streets, more takings. I’ll draw up the rates.', mood: 'approve' }],
    dixon: [{ text: 'Paint it teal!', mood: 'approve' }],
    bridge: [{ text: 'More ground to lose, if you ask me.', mood: 'neutral' }],
    thorne: [{ text: 'A new parish. I’ll need a new cup.', mood: 'approve' }],
    crane: [{ text: 'Post a watch. Always post a watch.', mood: 'approve' }],
    beaumont: [{ text: 'Every street is a shop window. Congratulations.', mood: 'approve' }],
  },
  lost: {
    hawkins: [{ text: 'There goes a column of my ledger.', mood: 'disapprove' }],
    dixon: [{ text: 'Give me six sailors and a night. I’ll take it back.', mood: 'disapprove' }],
    bridge: [{ text: 'Fewer streets, fewer worries.', mood: 'neutral' }],
    thorne: [{ text: 'The Lord giveth. The Knives taketh.', mood: 'disapprove' }],
    crane: [{ text: 'We should have fortified.', mood: 'disapprove' }],
    beaumont: [{ text: 'Hm. My stock in you just fell a point.', mood: 'disapprove' }],
  },
  wreck: {
    hawkins: [{ text: 'A reef is cheaper than a crew. Profitable night.', mood: 'approve' }],
    dixon: [{ text: 'No fight, just lanterns and patience. Boring. Lucrative.', mood: 'neutral' }],
    bridge: [{ text: 'I know those waters. I wish I didn’t, tonight.', mood: 'disapprove' }],
    thorne: [{ text: 'False lights on the reef. I’ll need a longer confession.', mood: 'disapprove' }],
    crane: [{ text: 'The Company will send ships for this. Real ones.', mood: 'disapprove' }],
    beaumont: [{ text: 'Silk, pepper, and a clock that still ticks. Lovely.', mood: 'approve' }],
  },
  navyParley: {
    hawkins: [{ text: 'Cheaper than a war. Barely.', mood: 'approve' }],
    dixon: [{ text: 'Talking to redcoats. What have we become?', mood: 'disapprove' }],
    bridge: [{ text: 'Any day the frigate sails away is a good day.', mood: 'approve' }],
    thorne: [{ text: 'The commodore is a Methodist. I adapted.', mood: 'approve' }],
    crane: [{ text: 'Bowing to the King’s men. I left to stop bowing.', mood: 'disapprove' }],
    beaumont: [{ text: 'Good relations with the navy are worth their weight in bribes.', mood: 'approve' }],
  },
  prize: {
    hawkins: [{ text: 'A brig! That’s a hold, a hull, and a share for every hand.', mood: 'approve' }],
    dixon: [{ text: 'That’s how you take a ship. Over the rail, blades first.', mood: 'approve' }],
    bridge: [{ text: 'She sails a point closer to the wind than the sloop. I want her.', mood: 'approve' }],
    thorne: [{ text: 'We shall rename her. Something pious. Something ironic.', mood: 'approve' }],
    crane: [{ text: 'Sweet lines. Company built, King’s timber.', mood: 'approve' }],
    beaumont: [{ text: 'The cargo manifest alone is worth a fortune.', mood: 'approve' }],
  },
  pardon: {
    hawkins: [{ text: 'A pardon means a pension. I like pensions.', mood: 'approve' }],
    dixon: [{ text: 'An honest life? I’d be terrible at it.', mood: 'disapprove' }],
    bridge: [{ text: 'A pardon. And a bed that doesn’t pitch. Please.', mood: 'approve' }],
    thorne: [{ text: 'Absolution, at last. For all of us. Mostly me.', mood: 'approve' }],
    crane: [{ text: 'A pardon won’t cover a deserter. It never does.', mood: 'disapprove' }],
    beaumont: [{ text: 'Legitimacy! Finally, customers with money.', mood: 'approve' }],
  },
  vice: {
    thorne: [{ text: 'Purely pastoral visit. Purely. Bring the chair.', mood: 'approve' }],
    hawkins: [{ text: 'The Father spent the night at the vice hall. The ledger noticed.', mood: 'disapprove' }],
  },
  deal: {
    hawkins: [{ text: 'Cash on the barrelhead. My favourite kind of friend.', mood: 'approve' }],
    dixon: [{ text: 'We could have just taken it.', mood: 'disapprove' }],
    bridge: [{ text: 'No blood. I’m in favour.', mood: 'approve' }],
    thorne: [{ text: 'Blessed are the peacemakers, for they get a commission.', mood: 'approve' }],
    crane: [{ text: 'Paper’s cheaper than powder. Fine.', mood: 'neutral' }],
    beaumont: [{ text: 'Now you’re speaking my language.', mood: 'approve' }],
  },
};
