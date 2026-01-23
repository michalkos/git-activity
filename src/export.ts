import { writeFile } from "node:fs/promises";
import { format } from "date-fns";
import type { WeeklyReport, ProjectActivity, DayActivity } from "./types.ts";
import { parseDateKey } from "./time-estimator.ts";

export async function exportToCSV(
  report: WeeklyReport,
  filename?: string
): Promise<string> {
  const lines: string[] = ["Date,Project,Path,Hours,Commits"];

  // Collect all days across all projects
  const allEntries: Array<{
    date: Date;
    project: string;
    path: string;
    hours: number;
    commits: number;
  }> = [];

  for (const project of report.projects) {
    for (const [_, day] of project.days) {
      allEntries.push({
        date: day.date,
        project: project.repo.name,
        path: project.repo.path,
        hours: day.estimatedHours,
        commits: day.commits.length,
      });
    }
  }

  // Sort by date
  allEntries.sort((a, b) => a.date.getTime() - b.date.getTime());

  for (const entry of allEntries) {
    const dateStr = format(entry.date, "yyyy-MM-dd");
    // Escape fields that might contain commas
    const path = entry.path.includes(",") ? `"${entry.path}"` : entry.path;
    lines.push(`${dateStr},${entry.project},${path},${entry.hours},${entry.commits}`);
  }

  const content = lines.join("\n");
  const outputFile = filename || `git-activity-${format(report.startDate, "yyyy-MM-dd")}.csv`;

  await writeFile(outputFile, content, "utf-8");
  return outputFile;
}

export async function exportToMarkdown(
  report: WeeklyReport,
  filename?: string
): Promise<string> {
  const lines: string[] = [];

  // Header
  const startStr = format(report.startDate, "MMM d");
  const endStr = format(report.endDate, "MMM d, yyyy");
  lines.push(`# Week of ${startStr} - ${endStr}`);
  lines.push("");

  // Get all unique dates with activity
  const dateMap = new Map<string, Map<string, { project: ProjectActivity; day: DayActivity }>>();

  for (const project of report.projects) {
    for (const [dateKey, day] of project.days) {
      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, new Map());
      }
      dateMap.get(dateKey)!.set(project.repo.path, { project, day });
    }
  }

  // Sort dates
  const sortedDates = Array.from(dateMap.keys()).sort();

  for (const dateKey of sortedDates) {
    const date = parseDateKey(dateKey);
    lines.push(`## ${format(date, "EEEE, MMM d")}`);
    lines.push("");

    const dayProjects = dateMap.get(dateKey)!;
    for (const [_, { project, day }] of dayProjects) {
      const hours = day.estimatedHours;
      const commitCount = day.commits.length;
      lines.push(`- **${project.repo.name}** (${hours}h, ${commitCount} commit${commitCount === 1 ? "" : "s"})`);

      // List commit messages
      for (const commit of day.commits) {
        lines.push(`  - ${commit.message}`);
      }
    }
    lines.push("");
  }

  // Summary
  lines.push("---");
  lines.push("");
  lines.push(`**Weekly Total:** ~${report.totalHours}h across ${report.projects.length} project${report.projects.length === 1 ? "" : "s"}`);

  const content = lines.join("\n");
  const outputFile = filename || `git-activity-${format(report.startDate, "yyyy-MM-dd")}.md`;

  await writeFile(outputFile, content, "utf-8");
  return outputFile;
}

export function formatReportAsJSON(report: WeeklyReport): string {
  // Convert Maps to plain objects for JSON serialization
  const serializable = {
    startDate: report.startDate.toISOString(),
    endDate: report.endDate.toISOString(),
    totalCommits: report.totalCommits,
    totalHours: report.totalHours,
    projects: report.projects.map((project) => ({
      repo: project.repo,
      totalCommits: project.totalCommits,
      totalHours: project.totalHours,
      days: Object.fromEntries(
        Array.from(project.days.entries()).map(([key, day]) => [
          key,
          {
            date: day.date.toISOString(),
            estimatedHours: day.estimatedHours,
            commits: day.commits.map((c) => ({
              hash: c.hash,
              date: c.date.toISOString(),
              message: c.message,
              author: c.author,
            })),
            sessions: day.sessions.map((s) => ({
              start: s.start.toISOString(),
              end: s.end.toISOString(),
              commitCount: s.commits.length,
            })),
          },
        ])
      ),
    })),
  };

  return JSON.stringify(serializable, null, 2);
}
