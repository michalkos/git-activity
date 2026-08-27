import {
  intervalWithMinimum,
  totalHours,
  type TimeInterval,
} from "../agents/hours.ts";
import type {
  AgentSession,
  AgentSourceId,
  AgentWeeklyReport,
} from "../agents/types.ts";
import { buildHeatmapCells } from "../report.ts";
import { formatDateKey } from "../time-estimator.ts";
import type {
  DayActivity,
  GitCommit,
  GitRepo,
  HeatmapData,
  WeeklyReport,
} from "../types.ts";
import { matchRepo } from "./match.ts";
import type {
  CombinedDayActivity,
  CombinedProjectActivity,
  CombinedWeeklyReport,
  TimelineEntry,
} from "./types.ts";

/** Same floor `time-estimator.ts` applies to a git work session. */
const GIT_MIN_SESSION_MS = 30 * 60 * 1000;

export interface CombinedReportInput {
  gitReport: WeeklyReport;
  agentReport: AgentWeeklyReport;
  /**
   * Every discovered repo, not only those with commits this week — an agent
   * session in a quiet repo should still be filed under the repo, not its cwd.
   */
  repos: GitRepo[];
}

/**
 * Folds a git report and an agent report into one per-project/per-day view.
 * Agent sessions are attributed to the repo containing their cwd; sessions with
 * no repo keep their own directory as the project.
 */
export function buildCombinedReport({
  gitReport,
  agentReport,
  repos,
}: CombinedReportInput): CombinedWeeklyReport {
  const projects = new Map<string, CombinedProjectActivity>();

  const project = (
    projectPath: string,
    projectName: string,
    repo?: GitRepo
  ): CombinedProjectActivity => {
    const existing = projects.get(projectPath);
    if (existing) {
      // A repo learned from git wins over the name derived from a cwd.
      if (!existing.repo && repo) {
        existing.repo = repo;
        existing.projectName = repo.name;
      }
      return existing;
    }
    const created: CombinedProjectActivity = {
      projectPath,
      projectName,
      repo,
      days: new Map(),
      totalCommits: 0,
      totalSessions: 0,
      totalHours: 0,
    };
    projects.set(projectPath, created);
    return created;
  };

  const day = (
    target: CombinedProjectActivity,
    dateKey: string,
    date: Date
  ): CombinedDayActivity => {
    const existing = target.days.get(dateKey);
    if (existing) return existing;
    const created: CombinedDayActivity = {
      date: startOfLocalDay(date),
      commits: [],
      sessions: [],
      gitHours: 0,
      agentHours: 0,
      estimatedHours: 0,
      sources: [],
    };
    target.days.set(dateKey, created);
    return created;
  };

  // Git side: the repo path is the project key.
  const gitIntervalsByDay = new Map<string, TimeInterval[]>();

  for (const gitProject of gitReport.projects) {
    const target = project(
      gitProject.repo.path,
      gitProject.repo.name,
      gitProject.repo
    );
    for (const [dateKey, gitDay] of gitProject.days) {
      const combinedDay = day(target, dateKey, gitDay.date);
      combinedDay.commits.push(...gitDay.commits);
      gitIntervalsByDay.set(
        `${target.projectPath}|${dateKey}`,
        gitIntervals(gitDay)
      );
    }
  }

  // Agent side: fold each cwd onto the repo that contains it, when there is one.
  const agentIntervalsByDay = new Map<string, TimeInterval[]>();

  for (const agentProject of agentReport.projects) {
    const repo = matchRepo(agentProject.projectPath, repos);
    const target = project(
      repo ? repo.path : agentProject.projectPath,
      repo ? repo.name : agentProject.projectName,
      repo ?? undefined
    );
    for (const [dateKey, agentDay] of agentProject.days) {
      const combinedDay = day(target, dateKey, agentDay.date);
      combinedDay.sessions.push(...agentDay.sessions);
      const key = `${target.projectPath}|${dateKey}`;
      // Several agent cwds can collapse into one repo, so append rather than set.
      const intervals = agentIntervalsByDay.get(key) ?? [];
      intervals.push(...agentIntervals(agentDay.sessions));
      agentIntervalsByDay.set(key, intervals);
    }
  }

  for (const target of projects.values()) {
    let projectHours = 0;

    for (const [dateKey, combinedDay] of target.days) {
      const key = `${target.projectPath}|${dateKey}`;
      const git = gitIntervalsByDay.get(key) ?? [];
      const agent = agentIntervalsByDay.get(key) ?? [];

      combinedDay.commits.sort((a, b) => a.date.getTime() - b.date.getTime());
      combinedDay.sessions.sort(
        (a, b) => a.startedAt.getTime() - b.startedAt.getTime()
      );
      combinedDay.gitHours = totalHours(git);
      combinedDay.agentHours = totalHours(agent);
      combinedDay.estimatedHours = totalHours([...git, ...agent]);
      combinedDay.sources = uniqueSources(combinedDay.sessions);

      target.totalCommits += combinedDay.commits.length;
      target.totalSessions += combinedDay.sessions.length;
      projectHours += combinedDay.estimatedHours;
    }

    target.totalHours = round(projectHours);
  }

  const projectList = Array.from(projects.values()).sort((a, b) =>
    a.projectName.localeCompare(b.projectName)
  );

  let totalCommits = 0;
  let totalSessions = 0;
  let merged = 0;
  let gitHours = 0;
  let agentHours = 0;

  for (const target of projectList) {
    totalCommits += target.totalCommits;
    totalSessions += target.totalSessions;
    for (const combinedDay of target.days.values()) {
      merged += combinedDay.estimatedHours;
      gitHours += combinedDay.gitHours;
      agentHours += combinedDay.agentHours;
    }
  }

  return {
    startDate: gitReport.startDate,
    endDate: gitReport.endDate,
    projects: projectList,
    totalCommits,
    totalSessions,
    totalHours: round(merged),
    gitHours: round(gitHours),
    agentHours: round(agentHours),
  };
}

/** Commits and sessions of one day, oldest first, as one selectable list. */
export function timelineEntries(day: CombinedDayActivity): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...day.commits.map(
      (commit): TimelineEntry => ({ kind: "commit", at: commit.date, commit })
    ),
    ...day.sessions.map(
      (session): TimelineEntry => ({
        kind: "session",
        at: session.startedAt,
        session,
      })
    ),
  ];

  // Sessions sort before commits at the same minute: the session produced it.
  entries.sort((a, b) => {
    const byTime = a.at.getTime() - b.at.getTime();
    if (byTime !== 0) return byTime;
    return a.kind === b.kind ? 0 : a.kind === "session" ? -1 : 1;
  });

  return entries;
}

/** Heatmap intensity counts commits and sessions together. */
export function buildCombinedHeatmapData(
  commits: GitCommit[],
  sessions: AgentSession[],
  weekOffset: number
): HeatmapData[] {
  const counts = new Map<string, number>();

  const bump = (date: Date) => {
    const key = formatDateKey(date);
    counts.set(key, (counts.get(key) || 0) + 1);
  };

  commits.forEach((commit) => bump(commit.date));
  sessions.forEach((session) => bump(session.startedAt));

  return buildHeatmapCells(counts, weekOffset);
}

function gitIntervals(day: DayActivity): TimeInterval[] {
  return day.sessions.map(({ start, end }) => {
    const duration = end.getTime() - start.getTime();
    return duration >= GIT_MIN_SESSION_MS
      ? { start, end }
      : { start, end: new Date(start.getTime() + GIT_MIN_SESSION_MS) };
  });
}

function agentIntervals(sessions: AgentSession[]): TimeInterval[] {
  return sessions.map((session) =>
    intervalWithMinimum(session.startedAt, session.endedAt)
  );
}

function uniqueSources(sessions: AgentSession[]): AgentSourceId[] {
  return [...new Set(sessions.map((session) => session.source))].sort();
}

function startOfLocalDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function round(hours: number): number {
  return Math.round(hours * 10) / 10;
}
