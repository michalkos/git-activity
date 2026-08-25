import { describe, expect, test } from "bun:test";
import {
  intervalWithMinimum,
  mergeIntervals,
  MIN_SESSION_MS,
  totalHours,
} from "./hours.ts";

describe("intervalWithMinimum", () => {
  test("keeps sessions longer than 15 minutes", () => {
    const start = new Date("2026-02-16T10:00:00");
    const end = new Date("2026-02-16T12:00:00");
    const interval = intervalWithMinimum(start, end);
    expect(interval.start).toEqual(start);
    expect(interval.end).toEqual(end);
  });

  test("pads short sessions to 15 minutes", () => {
    const start = new Date("2026-02-16T10:00:00");
    const end = new Date("2026-02-16T10:01:00");
    const interval = intervalWithMinimum(start, end);
    expect(interval.end.getTime() - interval.start.getTime()).toBe(
      MIN_SESSION_MS
    );
  });
});

describe("mergeIntervals", () => {
  test("merges overlapping agent windows", () => {
    const merged = mergeIntervals([
      {
        start: new Date("2026-02-16T10:00:00"),
        end: new Date("2026-02-16T12:00:00"),
      },
      {
        start: new Date("2026-02-16T11:00:00"),
        end: new Date("2026-02-16T13:00:00"),
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.start).toEqual(new Date("2026-02-16T10:00:00"));
    expect(merged[0]?.end).toEqual(new Date("2026-02-16T13:00:00"));
    expect(totalHours(merged)).toBe(3);
  });

  test("does not merge disjoint windows", () => {
    const merged = mergeIntervals([
      {
        start: new Date("2026-02-16T10:00:00"),
        end: new Date("2026-02-16T11:00:00"),
      },
      {
        start: new Date("2026-02-16T13:00:00"),
        end: new Date("2026-02-16T14:00:00"),
      },
    ]);
    expect(merged).toHaveLength(2);
    expect(totalHours(merged)).toBe(2);
  });
});
