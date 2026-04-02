import { describe, expect, it, vi } from 'vitest';

import {
  LEVEL_UP_OPTIONS,
  RELIC_LABELS,
  RELIC_OPTIONS,
  pickRandomOptions,
} from './upgrades';

describe('upgrades helpers', () => {
  it('contains expected option counts', () => {
    expect(LEVEL_UP_OPTIONS).toHaveLength(4);
    expect(RELIC_OPTIONS).toHaveLength(9);
  });

  it('keeps relic labels in sync with relic option ids', () => {
    for (const relic of RELIC_OPTIONS) {
      expect(RELIC_LABELS[relic.id]).toBe(relic.label);
    }
  });

  it('returns requested count without mutating original options', () => {
    const source = [...LEVEL_UP_OPTIONS];
    const picked = pickRandomOptions(LEVEL_UP_OPTIONS, 2);

    expect(picked).toHaveLength(2);
    expect(LEVEL_UP_OPTIONS).toEqual(source);
  });

  it('returns deterministic order when Math.random is mocked', () => {
    const randomSpy = vi
      .spyOn(Math, 'random')
      .mockReturnValueOnce(0.9)
      .mockReturnValueOnce(0.2)
      .mockReturnValueOnce(0.6);

    const picked = pickRandomOptions(LEVEL_UP_OPTIONS, 3).map((o) => o.id);

    expect(picked).toEqual(['MAGNET', 'SPEED', 'FIREPOWER']);
    randomSpy.mockRestore();
  });
});
