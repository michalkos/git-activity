import { describe, expect, test } from "bun:test";
import { buildAgentReport } from "./report.ts";
import type { AgentSession } from "./types.ts";

function session(
  overrides: Partial<AgentSession> &
    Pick<AgentSession, "id" | "source" | "projectPath" | "startedAt" | "endedAt">
): AgentSession {
  return {
    title: overrides.title ?? overrides.id,
    projectName: overrides.projectName ?? "git-activity",
    userTurns: overrides.userTurns ?? 1,
    assistantTurns: overrides.assistantTurns ?? 1,
    toolCalls: overrides.toolCalls ?? 0,
    ...overrides,
  };
}

describe("buildAgentReport", () => {
  test("groups by project cwd and start day, merging overlapping hours", () => {
    const report = buildAgentReport(
      [
        session({
          id: "claude-1",
          source: "claude",
          projectPath: "/Users/demo/git-activity",
          startedAt: new Date("2026-02-16T10:00:00"),
          endedAt: new Date("2026-02-16T12:00:00"),
        }),
        session({
          id: "cursor-1",
          source: "cursor",
          projectPath: "/Users/demo/git-activity",
          startedAt: new Date("2026-02-16T11:00:00"),
          endedAt: new Date("2026-02-16T13:00:00"),
        }),
        session({
          id: "pi-1",
          source: "pi",
          projectPath: "/Users/demo/api-service",
          projectName: "api-service",
          startedAt: new Date("2026-02-18T09:00:00"),
          endedAt: new Date("2026-02-18T09:30:00"),
        }),
      ],
      new Date(2026, 1, 16),
      new Date(2026, 1, 22)
    );

    expect(report.projects).toHaveLength(2);
    const gitActivity = report.projects.find(
      (project) => project.projectName === "git-activity"
    );
    const monday = gitActivity?.days.get("2026-02-16");
    expect(monday?.sessions).toHaveLength(2);
    expect(monday?.estimatedHours).toBe(3);
    expect(monday?.sources).toEqual(["claude", "cursor"]);
    expect(report.totalSessions).toBe(3);
  });

  test("assigns overnight sessions to the start day", () => {
    const report = buildAgentReport(
      [
        session({
          id: "late",
          source: "claude",
          projectPath: "/Users/demo/git-activity",
          startedAt: new Date("2026-02-16T23:00:00"),
          endedAt: new Date("2026-02-17T01:00:00"),
        }),
      ],
      new Date(2026, 1, 16),
      new Date(2026, 1, 22)
    );

    const project = report.projects[0];
    expect(project?.days.has("2026-02-16")).toBe(true);
    expect(project?.days.has("2026-02-17")).toBe(false);
    expect(project?.days.get("2026-02-16")?.estimatedHours).toBe(2);
  });

  test("drops sessions whose start day is outside the range", () => {
    const report = buildAgentReport(
      [
        session({
          id: "outside",
          source: "claude",
          projectPath: "/Users/demo/git-activity",
          startedAt: new Date("2026-01-05T09:00:00"),
          endedAt: new Date("2026-01-05T10:00:00"),
        }),
      ],
      new Date(2026, 1, 16),
      new Date(2026, 1, 22)
    );
    expect(report.projects).toHaveLength(0);
  });
});
