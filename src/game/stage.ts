export const STAGE_NAMES = ['Tutorial', 'Asteroid Belt', 'Heavy Fire', 'Chase', 'Final Front'] as const;

export const getStageFromWave = (wave: number): number => {
  return Math.min(5, Math.ceil(wave / 2));
};

export const getSectorFromWave = (wave: number): number => {
  return ((wave - 1) % 2) + 1;
};

export const getStageLabelFromWave = (wave: number): string => {
  const stage = getStageFromWave(wave);
  const sector = getSectorFromWave(wave);
  return `${STAGE_NAMES[stage - 1]} - SECTOR ${sector}`;
};

export const getSurvivalDurationFromStage = (stage: number): number => {
  return stage === 2 ? 45 : 30;
};
