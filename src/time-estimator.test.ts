import { describe, expect, test } from "bun:test";
import {
  calculateSessionDuration,
  calculateTotalHours,
  estimateWorkSessions,
} from "./time-estimator.ts";
import type { GitCommit, WorkSession } from "./types.ts";

function createCommit(hash: string, isoDate: string): GitCommit {
  return {
    hash,
    date: new Date(isoDate),
    message: hash,
    branch: "main",
    author: "Tester",
    email: "tester@example.com",
  };
}

function createSession(commits: GitCommit[]): WorkSession {
  return {
    start: commits[0]!.date,
    end: commits[commits.length - 1]!.date,
    commits,
  };
}

describe("time estimation", () => {
  test("keeps minimum duration for a single-commit session", () => {
    const session = createSession([createCommit("a", "2026-01-01T10:00:00.000Z")]);
    expect(calculateSessionDuration(session)).toBe(30 * 60 * 1000);
  });

  test("caps inactive gaps inside a session to one hour", () => {
    const session = createSession([
      createCommit("a", "2026-01-01T10:00:00.000Z"),
      createCommit("b", "2026-01-01T11:30:00.000Z"),
    ]);

    // 15m before + 60m capped gap + 15m after
    expect(calculateSessionDuration(session)).toBe(90 * 60 * 1000);
    expect(calculateTotalHours([session])).toBe(1.5);
  });

  test("still starts a new session after a gap larger than 2 hours", () => {
    const sessions = estimateWorkSessions([
      createCommit("a", "2026-01-01T10:00:00.000Z"),
      createCommit("b", "2026-01-01T13:01:00.000Z"),
    ]);

    expect(sessions).toHaveLength(2);
  });
});
