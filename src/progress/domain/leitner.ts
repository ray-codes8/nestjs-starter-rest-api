export const MAX_BOX = 5;
export const LEARNED_MIN_BOX = 4;
export const BOX_INTERVAL_DAYS: Record<number, number> = {
  1: 1,
  2: 2,
  3: 4,
  4: 8,
  5: 16,
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function applyAnswer(
  currentBox: number | null,
  isCorrect: boolean,
  now: Date,
): { box: number; nextReviewAt: Date } {
  const startBox = currentBox ?? 1;
  const box = isCorrect ? Math.min(startBox + 1, MAX_BOX) : 1;
  return {
    box,
    nextReviewAt: new Date(now.getTime() + BOX_INTERVAL_DAYS[box] * DAY_MS),
  };
}
