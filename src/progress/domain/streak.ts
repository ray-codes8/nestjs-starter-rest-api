const DAY_MS = 24 * 60 * 60 * 1000;

export function toDayString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function previousDay(day: string): string {
  return toDayString(new Date(Date.parse(`${day}T00:00:00Z`) - DAY_MS));
}

export function computeStreak(activeDays: string[], today: string): number {
  const days = new Set(activeDays);
  let cursor = days.has(today) ? today : previousDay(today);
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor = previousDay(cursor);
  }
  return streak;
}
