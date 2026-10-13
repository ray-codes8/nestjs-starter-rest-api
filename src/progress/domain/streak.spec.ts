import { computeStreak, toDayString } from './streak';

describe('toDayString', () => {
  it('formats in UTC', () => {
    expect(toDayString(new Date('2026-10-13T23:30:00Z'))).toBe('2026-10-13');
  });
});

describe('computeStreak', () => {
  const today = '2026-10-13';

  it('is 0 without activity', () => {
    expect(computeStreak([], today)).toBe(0);
  });

  it('counts consecutive days ending today', () => {
    expect(computeStreak(['2026-10-13', '2026-10-12', '2026-10-11'], today)).toBe(3);
  });

  it('keeps the streak alive when the last activity was yesterday', () => {
    expect(computeStreak(['2026-10-12', '2026-10-11'], today)).toBe(2);
  });

  it('is 0 when the last activity was two days ago', () => {
    expect(computeStreak(['2026-10-11', '2026-10-10'], today)).toBe(0);
  });

  it('stops at a gap and ignores order and duplicates', () => {
    expect(
      computeStreak(['2026-10-10', '2026-10-13', '2026-10-12', '2026-10-13'], today),
    ).toBe(2);
  });

  it('crosses month boundaries', () => {
    expect(computeStreak(['2026-10-01', '2026-09-30'], '2026-10-01')).toBe(2);
  });
});
