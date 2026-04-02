import { describe, expect, it } from 'vitest';

import { XP_PER_SCRAP, applyXpGain } from './progression';

describe('progression', () => {
  it('exports the expected XP per scrap value', () => {
    expect(XP_PER_SCRAP).toBe(10);
  });

  it('applies xp gain without level up when below threshold', () => {
    const result = applyXpGain({ level: 1, xp: 50, xpToNextLevel: 200 }, 10);

    expect(result.didLevelUp).toBe(false);
    expect(result.next).toEqual({
      level: 1,
      xp: 60,
      xpToNextLevel: 200,
    });
  });

  it('levels up once and rolls remaining xp when threshold is reached', () => {
    const result = applyXpGain({ level: 2, xp: 195, xpToNextLevel: 200 }, 10);

    expect(result.didLevelUp).toBe(true);
    expect(result.next).toEqual({
      level: 3,
      xp: 5,
      xpToNextLevel: 300,
    });
  });

  it('keeps single-level-up behavior for large gain inputs', () => {
    const result = applyXpGain({ level: 1, xp: 199, xpToNextLevel: 200 }, 500);

    expect(result.didLevelUp).toBe(true);
    expect(result.next.level).toBe(2);
    expect(result.next.xpToNextLevel).toBe(300);
    expect(result.next.xp).toBe(499);
  });
});
