import { addDays, endOfWeek, isAfter, isBefore, startOfWeek, subWeeks } from "date-fns";
import { getCommits } from "./git.ts";
import { formatDateKey, groupCommitsByDay } from "./time-estimator.ts";
import { calculateIntensity } from "./ui/Heatmap.tsx";
import type {
  GitCommit,
  GitRepo,
  HeatmapData,
  ProjectActivity,
  WeeklyReport,
} from "./types.ts";

/** Reads commits for every repo in range and groups them into a weekly report. */
export async function buildGitReport(
  repos: GitRepo[],
  authors: string[],
  startDate: Date,
  endDate: Date
): Promise<WeeklyReport> {
  const projects: ProjectActivity[] = [];

  for (const repo of repos) {
    const commits = await getCommits(
      repo,
      authors,
      startDate,
      addDays(endDate, 1) // Add 1 day to include the end date
    );

    if (commits.length > 0) {
      const days = groupCommitsByDay(commits);
      // Guard against out-of-range days (e.g., git boundary quirks).
      for (const [dateKey, day] of days) {
        if (isBefore(day.date, startDate) || isAfter(day.date, endDate)) {
          days.delete(dateKey);
        }
      }
      const totalHours = Array.from(days.values()).reduce(
        (sum, day) => sum + day.estimatedHours,
        0
      );

      if (days.size > 0) {
        projects.push({
          repo,
          days,
          totalCommits: commits.length,
          totalHours: Math.round(totalHours * 10) / 10,
        });
      }
    }
  }

  const totalCommits = projects.reduce((sum, p) => sum + p.totalCommits, 0);
  const totalHours = projects.reduce((sum, p) => sum + p.totalHours, 0);

  return {
    startDate,
    endDate,
    projects,
    totalCommits,
    totalHours: Math.round(totalHours * 10) / 10,
  };
}

/** The 3-week window the heatmap renders: two weeks before the viewed week, plus it. */
export function heatmapRange(weekOffset: number): { from: Date; to: Date } {
  const targetWeekStart = startOfWeek(subWeeks(new Date(), weekOffset), {
    weekStartsOn: 1,
  });
  return {
    from: subWeeks(targetWeekStart, 2),
    to: endOfWeek(targetWeekStart, { weekStartsOn: 1 }),
  };
}

/** Turns per-day counts into the heatmap cells for the 3-week window. */
export function buildHeatmapCells(
  countsByDate: Map<string, number>,
  weekOffset: number
): HeatmapData[] {
  const { from, to } = heatmapRange(weekOffset);
  const cells: HeatmapData[] = [];
  let current = new Date(from);

  while (current <= to) {
    const count = countsByDate.get(formatDateKey(current)) || 0;
    cells.push({
      date: new Date(current),
      commits: count,
      intensity: calculateIntensity(count),
    });
    current = addDays(current, 1);
  }

  return cells;
}

export async function buildGitHeatmapData(
  repos: GitRepo[],
  authors: string[],
  weekOffset: number = 0
): Promise<HeatmapData[]> {
  const { from, to } = heatmapRange(weekOffset);
  const commits = await collectCommits(repos, authors, from, to);
  return buildHeatmapCells(countByDate(commits, (commit) => commit.date), weekOffset);
}

/** Every matching commit across all repos in an inclusive date range. */
export async function collectCommits(
  repos: GitRepo[],
  authors: string[],
  from: Date,
  to: Date
): Promise<GitCommit[]> {
  const commits: GitCommit[] = [];

  for (const repo of repos) {
    commits.push(...(await getCommits(repo, authors, from, addDays(to, 1))));
  }

  return commits;
}

/** Buckets items into `YYYY-MM-DD` counts using each item's own date accessor. */
export function countByDate<T>(items: T[], dateOf: (item: T) => Date): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = formatDateKey(dateOf(item));
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}
