import { describe, expect, it } from 'vitest';

import {
  STAGE_NAMES,
  getSectorFromWave,
  getStageFromWave,
  getStageLabelFromWave,
  getSurvivalDurationFromStage,
} from './stage';

describe('stage helpers', () => {
  it('maps waves to stages with a max cap of 5', () => {
    expect(getStageFromWave(1)).toBe(1);
    expect(getStageFromWave(2)).toBe(1);
    expect(getStageFromWave(3)).toBe(2);
    expect(getStageFromWave(10)).toBe(5);
    expect(getStageFromWave(99)).toBe(5);
  });

  it('maps waves to alternating sector numbers', () => {
    expect(getSectorFromWave(1)).toBe(1);
    expect(getSectorFromWave(2)).toBe(2);
    expect(getSectorFromWave(3)).toBe(1);
    expect(getSectorFromWave(4)).toBe(2);
  });

  it('builds stage labels using stage and sector', () => {
    expect(getStageLabelFromWave(1)).toBe('Tutorial - SECTOR 1');
    expect(getStageLabelFromWave(4)).toBe('Asteroid Belt - SECTOR 2');
    expect(getStageLabelFromWave(9)).toBe('Final Front - SECTOR 1');
  });

  it('returns stage-dependent survival duration', () => {
    expect(getSurvivalDurationFromStage(2)).toBe(45);
    expect(getSurvivalDurationFromStage(1)).toBe(30);
    expect(getSurvivalDurationFromStage(5)).toBe(30);
  });

  it('exposes expected stage names ordering', () => {
    expect(STAGE_NAMES).toEqual([
      'Tutorial',
      'Asteroid Belt',
      'Heavy Fire',
      'Chase',
      'Final Front',
    ]);
  });
});
