import { applyAnswer, BOX_INTERVAL_DAYS } from './leitner';

const now = new Date('2026-10-13T10:00:00Z');
const daysLater = (days: number) =>
  new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

describe('applyAnswer', () => {
  it('first correct answer moves a new word to box 2', () => {
    expect(applyAnswer(null, true, now)).toEqual({ box: 2, nextReviewAt: daysLater(2) });
  });

  it('first wrong answer keeps a new word in box 1', () => {
    expect(applyAnswer(null, false, now)).toEqual({ box: 1, nextReviewAt: daysLater(1) });
  });

  it.each([
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 5],
  ])('correct answer moves box %i to box %i', (from, to) => {
    const result = applyAnswer(from, true, now);
    expect(result.box).toBe(to);
    expect(result.nextReviewAt).toEqual(daysLater(BOX_INTERVAL_DAYS[to]));
  });

  it('wrong answer from box 5 goes back to box 1', () => {
    expect(applyAnswer(5, false, now)).toEqual({ box: 1, nextReviewAt: daysLater(1) });
  });

  it('uses the spec intervals', () => {
    expect(BOX_INTERVAL_DAYS).toEqual({ 1: 1, 2: 2, 3: 4, 4: 8, 5: 16 });
  });
});
