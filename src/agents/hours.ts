export interface TimeInterval {
  start: Date;
  end: Date;
}

export const MIN_SESSION_MS = 15 * 60 * 1000;

export function intervalWithMinimum(start: Date, end: Date): TimeInterval {
  const duration = end.getTime() - start.getTime();
  if (duration >= MIN_SESSION_MS) {
    return { start, end };
  }
  return { start, end: new Date(start.getTime() + MIN_SESSION_MS) };
}

export function mergeIntervals(intervals: TimeInterval[]): TimeInterval[] {
  if (intervals.length === 0) {
    return [];
  }

  const sorted = [...intervals].sort(
    (a, b) => a.start.getTime() - b.start.getTime()
  );
  const merged: TimeInterval[] = [
    { start: sorted[0]!.start, end: sorted[0]!.end },
  ];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]!;
    const last = merged[merged.length - 1]!;
    if (current.start.getTime() <= last.end.getTime()) {
      if (current.end.getTime() > last.end.getTime()) {
        last.end = current.end;
      }
    } else {
      merged.push({ start: current.start, end: current.end });
    }
  }

  return merged;
}

export function totalHours(intervals: TimeInterval[]): number {
  const merged = mergeIntervals(intervals);
  const ms = merged.reduce(
    (sum, interval) => sum + (interval.end.getTime() - interval.start.getTime()),
    0
  );
  return roundHours(ms);
}

export function roundHours(ms: number): number {
  return Math.round((ms / 3_600_000) * 10) / 10;
}
