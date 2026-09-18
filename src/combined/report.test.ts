import { describe, expect, test } from "bun:test";
import { buildAgentReport } from "../agents/report.ts";
import type { AgentSession, AgentSourceId } from "../agents/types.ts";
import { groupCommitsByDay } from "../time-estimator.ts";
import type { GitCommit, GitRepo, WeeklyReport } from "../types.ts";
import { isUnder, matchRepo } from "./match.ts";
import { buildCombinedReport, timelineEntries } from "./report.ts";

const REPO: GitRepo = { path: "/Users/demo/git-activity", name: "git-activity" };
const WEEK_START = new Date(2026, 1, 16);
const WEEK_END = new Date(2026, 1, 22);

function commit(hash: string, at: string, message = `commit ${hash}`): GitCommit {
  return {
    hash,
    date: new Date(at),
    message,
    branch: "main",
    author: "Demo",
    email: "demo@example.com",
  };
}

function session(
  id: string,
  source: AgentSourceId,
  projectPath: string,
  start: string,
  end: string
): AgentSession {
  return {
    id,
    source,
    title: `session ${id}`,
    projectPath,
    projectName: projectPath.split("/").at(-1)!,
    startedAt: new Date(start),
    endedAt: new Date(end),
    userTurns: 2,
    assistantTurns: 2,
    toolCalls: 4,
  };
}

/** Stands in for `buildGitReport`, which shells out to `git log`. */
function gitReportOf(repo: GitRepo, commits: GitCommit[]): WeeklyReport {
  const days = groupCommitsByDay(commits);
  const totalHours = Array.from(days.values()).reduce(
    (sum, day) => sum + day.estimatedHours,
    0
  );
  return {
    startDate: WEEK_START,
    endDate: WEEK_END,
    projects: [{ repo, days, totalCommits: commits.length, totalHours }],
    totalCommits: commits.length,
    totalHours,
  };
}

describe("buildCombinedReport", () => {
  test("counts time a session and its commits share only once", () => {
    const report = buildCombinedReport({
      gitReport: gitReportOf(REPO, [commit("aaa1111", "2026-02-16T10:50:00")]),
      agentReport: buildAgentReport(
        [
          session(
            "claude-1",
            "claude",
            "/Users/demo/git-activity/src",
            "2026-02-16T10:00:00",
            "2026-02-16T12:00:00"
          ),
        ],
        WEEK_START,
        WEEK_END
      ),
      repos: [REPO],
    });

    expect(report.projects).toHaveLength(1);
    const day = report.projects[0]!.days.get("2026-02-16")!;
    // The commit's own 30-minute session falls inside the agent's two hours.
    expect(day.gitHours).toBe(0.5);
    expect(day.agentHours).toBe(2);
    expect(day.estimatedHours).toBe(2);
    expect(day.commits).toHaveLength(1);
    expect(day.sessions).toHaveLength(1);
    expect(day.sources).toEqual(["claude"]);
    expect(report.totalHours).toBe(2);
  });

  test("adds disjoint git and agent work instead of merging it", () => {
    const report = buildCombinedReport({
      gitReport: gitReportOf(REPO, [commit("bbb2222", "2026-02-16T17:00:00")]),
      agentReport: buildAgentReport(
        [
          session(
            "claude-1",
            "claude",
            "/Users/demo/git-activity",
            "2026-02-16T09:00:00",
            "2026-02-16T10:00:00"
          ),
        ],
        WEEK_START,
        WEEK_END
      ),
      repos: [REPO],
    });

    const day = report.projects[0]!.days.get("2026-02-16")!;
    expect(day.estimatedHours).toBe(1.5);
    expect(report.gitHours).toBe(0.5);
    expect(report.agentHours).toBe(1);
  });

  test("keeps agent work outside every repo as its own project", () => {
    const report = buildCombinedReport({
      gitReport: gitReportOf(REPO, [commit("ccc3333", "2026-02-16T10:00:00")]),
      agentReport: buildAgentReport(
        [
          session(
            "pi-1",
            "pi",
            "/Users/demo/notes",
            "2026-02-17T09:00:00",
            "2026-02-17T10:00:00"
          ),
        ],
        WEEK_START,
        WEEK_END
      ),
      repos: [REPO],
    });

    expect(report.projects.map((project) => project.projectName)).toEqual([
      "git-activity",
      "notes",
    ]);
    const notes = report.projects.find((p) => p.projectName === "notes")!;
    expect(notes.repo).toBeUndefined();
    expect(notes.totalCommits).toBe(0);
    expect(notes.totalSessions).toBe(1);
  });
});

describe("timelineEntries", () => {
  test("interleaves commits and sessions, session first at the same minute", () => {
    const report = buildCombinedReport({
      gitReport: gitReportOf(REPO, [
        commit("aaa1111", "2026-02-16T10:00:00", "first"),
        commit("bbb2222", "2026-02-16T11:30:00", "second"),
      ]),
      agentReport: buildAgentReport(
        [
          session(
            "claude-1",
            "claude",
            "/Users/demo/git-activity",
            "2026-02-16T10:00:00",
            "2026-02-16T11:00:00"
          ),
        ],
        WEEK_START,
        WEEK_END
      ),
      repos: [REPO],
    });

    const entries = timelineEntries(report.projects[0]!.days.get("2026-02-16")!);
    expect(
      entries.map((entry) =>
        entry.kind === "commit" ? entry.commit.message : entry.session.id
      )
    ).toEqual(["claude-1", "first", "second"]);
  });
});

describe("matchRepo", () => {
  const repos: GitRepo[] = [
    { path: "/Users/demo/work", name: "work" },
    { path: "/Users/demo/work/packages/api", name: "api" },
    { path: "/Users/demo/work-notes", name: "work-notes" },
  ];

  test("picks the deepest repo containing the working directory", () => {
    expect(matchRepo("/Users/demo/work/packages/api/src", repos)?.name).toBe("api");
    expect(matchRepo("/Users/demo/work/docs", repos)?.name).toBe("work");
  });

  test("does not match on a shared name prefix", () => {
    expect(matchRepo("/Users/demo/work-notes", repos)?.name).toBe("work-notes");
    expect(isUnder("/Users/demo/workshop", "/Users/demo/work")).toBe(false);
  });

  test("returns null when nothing contains the path", () => {
    expect(matchRepo("/Users/demo/notes", repos)).toBeNull();
  });
});


test("merges a continued session with commits on the following day", () => {
  const report = buildCombinedReport({
    gitReport: gitReportOf(REPO, [commit("overnight", "2026-02-17T00:30:00")]),
    agentReport: buildAgentReport([
      session("continued", "codex", REPO.path, "2026-02-16T23:00:00", "2026-02-17T01:00:00"),
    ], WEEK_START, WEEK_END),
    repos: [REPO],
  });
  const tuesday = report.projects[0]!.days.get("2026-02-17")!;
  expect(tuesday.agentHours).toBe(1);
  expect(tuesday.estimatedHours).toBe(1);
  expect(report.totalHours).toBe(2);
  expect(timelineEntries(tuesday).map((entry) => entry.kind)).toEqual(["session", "commit"]);
});
