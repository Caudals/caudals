export type CalibrationResult = {
  gold: boolean;
  correct: boolean;
  agreed: boolean;
};

export type ExpertQualityMetrics = {
  count: number;
  goldCount: number;
  agreementCount: number;
  reliable: boolean;
  score: number | null;
  agreementRate: number | null;
};

const MIN_RELIABLE_SAMPLE = 10;

export function computeExpertQualityMetrics(rows: readonly CalibrationResult[]): ExpertQualityMetrics {
  const count = rows.length;
  const gold = rows.filter((row) => row.gold);
  const goldCount = gold.length;
  const agreementCount = rows.filter((row) => row.agreed).length;
  const reliable = goldCount >= MIN_RELIABLE_SAMPLE && count >= MIN_RELIABLE_SAMPLE;
  return {
    count,
    goldCount,
    agreementCount,
    reliable,
    score: reliable ? gold.filter((row) => row.correct).length / goldCount : null,
    agreementRate: reliable ? agreementCount / count : null,
  };
}
