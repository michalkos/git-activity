import { describe, expect, test } from "bun:test";
import type { AgentSession } from "../agents/types.ts";
import type { TimelineEntry } from "../combined/types.ts";
import {
  timelineCells,
  timelineColumnWidths,
  timelineRowWidth,
} from "./timelineRows.ts";

const SESSION: AgentSession = {
  id: "claude-1",
  source: "vscode-copilot",
  title: "Add the combined view",
  projectPath: "/tmp/project",
  projectName: "project",
  startedAt: new Date("2026-02-16T09:43:00"),
  endedAt: new Date("2026-02-16T11:05:00"),
  userTurns: 12,
  assistantTurns: 12,
  toolCalls: 48,
};

const COMMIT_ENTRY: TimelineEntry = {
  kind: "commit",
  at: new Date("2026-02-16T10:52:00"),
  commit: {
    hash: "a1b2c3d4e5f6",
    date: new Date("2026-02-16T10:52:00"),
    message: "feat: combined week view",
    branch: "main",
    author: "Demo",
    email: "demo@example.com",
  },
};

describe("timelineColumnWidths", () => {
  test("never asks for more columns than the row has", () => {
    for (let width = 40; width <= 200; width++) {
      expect(timelineRowWidth(timelineColumnWidths(width))).toBeLessThanOrEqual(width);
    }
  });

  test("keeps the source column readable on a narrow terminal", () => {
    const widths = timelineColumnWidths(50);
    expect(widths.kind).toBeGreaterThanOrEqual("commit".length);
  });
});

describe("timelineCells", () => {
  test("shows a span and hours for a session", () => {
    const cells = timelineCells({ kind: "session", at: SESSION.startedAt, session: SESSION });
    expect(cells.time).toBe("09:43-11:05");
    expect(cells.kind).toBe("vscode-copilot");
    expect(cells.meta).toBe("~1.4h");
  });

  test("shows one time and a short hash for a commit", () => {
    const cells = timelineCells(COMMIT_ENTRY);
    expect(cells.time).toBe("10:52");
    expect(cells.kind).toBe("commit");
    expect(cells.meta).toBe("a1b2c3d");
  });
});
