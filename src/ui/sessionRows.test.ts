import { describe, expect, test } from "bun:test";
import type { AgentSession, AgentSourceId } from "../agents/types.ts";
import { shortModel, truncate } from "./format.ts";
import {
  daySummary,
  groupSessionsBySource,
  orderedSessions,
  rowWidth,
  scrollWindow,
  sessionColumnWidths,
  sessionHours,
} from "./sessionRows.ts";

function session(
  id: string,
  source: AgentSourceId,
  start: string,
  end: string,
  extra: Partial<AgentSession> = {}
): AgentSession {
  return {
    id,
    source,
    title: `session ${id}`,
    projectPath: "/tmp/project",
    projectName: "project",
    startedAt: new Date(start),
    endedAt: new Date(end),
    userTurns: 1,
    assistantTurns: 1,
    toolCalls: 0,
    ...extra,
  };
}

describe("sessionColumnWidths", () => {
  test("never asks for more columns than the row has", () => {
    for (let width = 40; width <= 200; width++) {
      expect(rowWidth(sessionColumnWidths(width))).toBeLessThanOrEqual(width);
    }
  });

  test("stops widening the title on very wide terminals", () => {
    const widths = sessionColumnWidths(200);
    expect(widths.title).toBe(80);
    expect(rowWidth(widths)).toBeLessThan(200);
  });

  test("uses the full row when the optional columns fit", () => {
    const widths = sessionColumnWidths(116);
    expect(widths.model).toBeGreaterThan(0);
    expect(widths.counts).toBeGreaterThan(0);
    expect(rowWidth(widths)).toBe(116);
  });

  test("drops the model, then the counts, to protect the title", () => {
    expect(sessionColumnWidths(70).model).toBe(0);
    expect(sessionColumnWidths(70).counts).toBeGreaterThan(0);
    expect(sessionColumnWidths(45).counts).toBe(0);
    expect(sessionColumnWidths(45).title).toBeGreaterThan(0);
  });
});

describe("groupSessionsBySource", () => {
  test("numbers rows in render order, chronological within a source", () => {
    const groups = groupSessionsBySource([
      session("c", "vscode-copilot", "2026-08-25T11:00:00Z", "2026-08-25T11:30:00Z"),
      session("a", "claude", "2026-08-25T10:00:00Z", "2026-08-25T10:30:00Z"),
      session("b", "vscode-copilot", "2026-08-25T09:00:00Z", "2026-08-25T09:30:00Z"),
    ]);

    expect(groups.map((group) => group.source)).toEqual([
      "claude",
      "vscode-copilot",
    ]);
    expect(groups.flatMap((group) => group.items.map((item) => item.index))).toEqual([
      0, 1, 2,
    ]);
    expect(orderedSessions(groups).map((entry) => entry.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

describe("scrollWindow", () => {
  test("keeps the selection visible at both ends", () => {
    const top = scrollWindow({ total: 17, selected: 0, visible: 5 });
    expect(top).toEqual({ start: 0, end: 5, above: 0, below: 12 });

    const bottom = scrollWindow({ total: 17, selected: 16, visible: 5 });
    expect(bottom.end).toBe(17);
    expect(bottom.start).toBe(12);
    expect(bottom.below).toBe(0);

    const middle = scrollWindow({ total: 17, selected: 8, visible: 5 });
    expect(middle.start).toBeLessThanOrEqual(8);
    expect(middle.end).toBeGreaterThan(8);
  });

  test("collapses to the list when everything fits", () => {
    expect(scrollWindow({ total: 3, selected: 2, visible: 10 })).toEqual({
      start: 0,
      end: 3,
      above: 0,
      below: 0,
    });
  });
});

describe("shortModel", () => {
  test("strips the vendor prefix and handles missing models", () => {
    expect(shortModel("copilot/gpt-5.6-terra")).toBe("gpt-5.6-terra");
    expect(shortModel("zai/glm-5.3")).toBe("glm-5.3");
    expect(shortModel("gpt-5.6-sol")).toBe("gpt-5.6-sol");
    expect(shortModel(undefined)).toBe("-");
  });
});

describe("session totals", () => {
  test("applies the 15-minute minimum to short sessions", () => {
    const short = session("s", "claude", "2026-08-25T09:43:00Z", "2026-08-25T09:48:00Z");
    expect(sessionHours(short)).toBe(0.3);
  });

  test("sums turns and tool calls without merging overlaps", () => {
    const summary = daySummary([
      session("a", "pi", "2026-08-25T09:00:00Z", "2026-08-25T10:00:00Z", {
        userTurns: 2,
        toolCalls: 10,
      }),
      session("b", "pi", "2026-08-25T09:30:00Z", "2026-08-25T10:30:00Z", {
        userTurns: 3,
        toolCalls: 5,
      }),
    ]);
    expect(summary).toEqual({ userTurns: 5, toolCalls: 15, rawHours: 2 });
  });
});

describe("truncate", () => {
  test("keeps short strings and ellipsises long ones", () => {
    expect(truncate("work on this", 20)).toBe("work on this");
    expect(truncate("Build failure due to missing fr content", 20)).toBe(
      "Build failure due..."
    );
    expect(truncate("anything", 0)).toBe("");
  });
});
