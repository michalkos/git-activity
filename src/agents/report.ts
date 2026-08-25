import { addDays, endOfWeek, startOfWeek, subWeeks } from "date-fns";
import { calculateIntensity } from "../ui/Heatmap.tsx";
import { formatDateKey } from "../time-estimator.ts";
import type { HeatmapData } from "../types.ts";
import { intervalWithMinimum, totalHours } from "./hours.ts";
import { warnAdapter } from "./log.ts";
import type { AgentSource } from "./sources/types.ts";
import type {
  AgentDayActivity,
  AgentProjectActivity,
  AgentSession,
  AgentSourceId,
  AgentWeeklyReport,
} from "./types.ts";

export async function collectSessions(
  sources: AgentSource[],
  from: Date,
  to: Date
): Promise<AgentSession[]> {
  const results = await Promise.all(
    sources.map(async (source) => {
      try {
        return await source.listSessions(from, to);
      } catch (error) {
        warnAdapter(
          source.id,
          error instanceof Error ? error.message : "failed to list sessions"
        );
        return [];
      }
    })
  );
  return results.flat();
}

export function buildAgentReport(
  sessions: AgentSession[],
  startDate: Date,
  endDate: Date
): AgentWeeklyReport {
  const inRange = sessions.filter((session) =>
    isDateKeyInRange(session.startedAt, startDate, endDate)
  );

  const projects = new Map<string, AgentProjectActivity>();

  for (const session of inRange) {
    const project =
      projects.get(session.projectPath) ??
      ({
        projectPath: session.projectPath,
        projectName: session.projectName,
        days: new Map<string, AgentDayActivity>(),
        totalSessions: 0,
        totalHours: 0,
      } satisfies AgentProjectActivity);

    const dateKey = formatDateKey(session.startedAt);
    const day =
      project.days.get(dateKey) ??
      ({
        date: startOfLocalDay(session.startedAt),
        sessions: [],
        estimatedHours: 0,
        sources: [],
      } satisfies AgentDayActivity);

    day.sessions.push(session);
    project.days.set(dateKey, day);
    projects.set(session.projectPath, project);
  }

  const projectList: AgentProjectActivity[] = [];

  for (const project of projects.values()) {
    let totalSessions = 0;
    let projectHours = 0;

    for (const day of project.days.values()) {
      day.sessions.sort(
        (a, b) => a.startedAt.getTime() - b.startedAt.getTime()
      );
      day.estimatedHours = totalHours(
        day.sessions.map((session) =>
          intervalWithMinimum(session.startedAt, session.endedAt)
        )
      );
      day.sources = uniqueSources(day.sessions);
      totalSessions += day.sessions.length;
      projectHours += day.estimatedHours;
    }

    project.totalSessions = totalSessions;
    project.totalHours = Math.round(projectHours * 10) / 10;
    projectList.push(project);
  }

  projectList.sort((a, b) => a.projectName.localeCompare(b.projectName));

  const totalSessions = projectList.reduce(
    (sum, project) => sum + project.totalSessions,
    0
  );
  const weeklyHours = projectList.reduce(
    (sum, project) => sum + project.totalHours,
    0
  );

  return {
    startDate,
    endDate,
    projects: projectList,
    totalSessions,
    totalHours: Math.round(weeklyHours * 10) / 10,
  };
}

export function buildAgentHeatmapData(
  sessions: AgentSession[],
  weekOffset: number
): HeatmapData[] {
  const now = new Date();
  const targetWeekStart = startOfWeek(subWeeks(now, weekOffset), {
    weekStartsOn: 1,
  });
  const threeWeeksAgo = subWeeks(targetWeekStart, 2);
  const endDate = endOfWeek(targetWeekStart, { weekStartsOn: 1 });

  const sessionsByDate = new Map<string, number>();
  for (const session of sessions) {
    if (!isDateKeyInRange(session.startedAt, threeWeeksAgo, endDate)) {
      continue;
    }
    const dateKey = formatDateKey(session.startedAt);
    sessionsByDate.set(dateKey, (sessionsByDate.get(dateKey) || 0) + 1);
  }

  const heatmapData: HeatmapData[] = [];
  let current = new Date(threeWeeksAgo);

  while (current <= endDate) {
    const dateKey = formatDateKey(current);
    const count = sessionsByDate.get(dateKey) || 0;
    heatmapData.push({
      date: new Date(current),
      commits: count,
      intensity: calculateIntensity(count),
    });
    current = addDays(current, 1);
  }

  return heatmapData;
}

function isDateKeyInRange(date: Date, start: Date, end: Date): boolean {
  const key = formatDateKey(date);
  return key >= formatDateKey(start) && key <= formatDateKey(end);
}

function startOfLocalDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function uniqueSources(sessions: AgentSession[]): AgentSourceId[] {
  return [...new Set(sessions.map((session) => session.source))].sort();
}
