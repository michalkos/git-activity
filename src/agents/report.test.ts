import { describe, expect, test } from "bun:test";
import { addDays, startOfWeek } from "date-fns";
import { buildAgentHeatmapData, buildAgentReport } from "./report.ts";
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

  test("splits overnight sessions and their hours at local midnight", () => {
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
    expect(project?.days.has("2026-02-17")).toBe(true);
    expect(project?.days.get("2026-02-17")?.estimatedHours).toBe(1);
    expect(project?.days.get("2026-02-16")?.estimatedHours).toBe(1);
    expect(report.totalHours).toBe(2);
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


test("keeps only the portion inside the requested day", () => {
  const report = buildAgentReport([session({
    id: "overnight", source: "claude", projectPath: "/demo",
    startedAt: new Date("2026-02-15T23:00:00"),
    endedAt: new Date("2026-02-16T01:00:00"),
  })], new Date(2026, 1, 16), new Date(2026, 1, 16));
  const day = report.projects[0]!.days.get("2026-02-16")!;
  expect([...report.projects[0]!.days.keys()]).toEqual(["2026-02-16"]);
  expect(day.estimatedHours).toBe(1);
  expect(day.sessions[0]!.startedAt.getHours()).toBe(0);
});

test("a session ending at midnight does not add a session to the next day", () => {
  const report = buildAgentReport([session({
    id: "midnight", source: "claude", projectPath: "/demo",
    startedAt: new Date("2026-02-16T23:55:00"),
    endedAt: new Date("2026-02-17T00:00:00"),
  })], new Date(2026, 1, 16), new Date(2026, 1, 17));
  expect([...report.projects[0]!.days.keys()]).toEqual(["2026-02-16"]);
  expect(report.totalHours).toBe(0.1);
});


test("the heatmap counts resumed activity on its actual days", () => {
  const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
  monday.setHours(10);
  const friday = addDays(monday, 4);
  const activity = [monday, friday].map((startedAt) => ({
    startedAt,
    endedAt: new Date(startedAt.getTime() + 3_600_000),
    userTurns: 1, assistantTurns: 1, toolCalls: 0,
  }));
  const cells = buildAgentHeatmapData([session({
    id: "resumed", source: "codex", projectPath: "/demo",
    startedAt: monday, endedAt: activity[1]!.endedAt, activity,
  })], 0);
  expect(cells.slice(-7).map((cell) => cell.commits)).toEqual([1, 0, 0, 0, 1, 0, 0]);
});
