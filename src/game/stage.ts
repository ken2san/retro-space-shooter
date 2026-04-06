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

export const isSurvivalStage = (stage: number): boolean => {
  return stage === 2 || stage === 3 || stage === 4;
};

export const getSurvivalDurationFromStage = (stage: number): number => {
  if (stage === 2 || stage === 3) return 45;
  if (stage === 4) return 40; // canyon chase — obstacles carry the difficulty
  if (isSurvivalStage(stage)) return 30;
  return 30;
};
