import { writeFile } from "node:fs/promises";
import { format } from "date-fns";
import { parseDateKey } from "../time-estimator.ts";
import { timelineEntries } from "./report.ts";
import type { CombinedDayActivity, CombinedWeeklyReport } from "./types.ts";

export async function exportCombinedToCSV(
  report: CombinedWeeklyReport,
  filename?: string
): Promise<string> {
  const lines: string[] = [
    "Date,Project,Path,Hours,GitHours,AgentHours,Commits,Sessions,Agents",
  ];

  for (const row of sortedDays(report)) {
    lines.push(
      [
        format(row.day.date, "yyyy-MM-dd"),
        csvField(row.projectName),
        csvField(row.projectPath),
        String(row.day.estimatedHours),
        String(row.day.gitHours),
        String(row.day.agentHours),
        String(row.day.commits.length),
        String(row.day.sessions.length),
        csvField(row.day.sources.join(",")),
      ].join(",")
    );
  }

  const outputFile =
    filename || `combined-activity-${format(report.startDate, "yyyy-MM-dd")}.csv`;
  await writeFile(outputFile, lines.join("\n"), "utf-8");
  return outputFile;
}

export async function exportCombinedToMarkdown(
  report: CombinedWeeklyReport,
  filename?: string
): Promise<string> {
  const lines: string[] = [];
  const startStr = format(report.startDate, "MMM d");
  const endStr = format(report.endDate, "MMM d, yyyy");
  lines.push(`# Combined week of ${startStr} - ${endStr}`);
  lines.push("");

  let currentDate = "";
  for (const row of sortedDays(report)) {
    const dateKey = format(row.day.date, "yyyy-MM-dd");
    if (dateKey !== currentDate) {
      currentDate = dateKey;
      lines.push(`## ${format(parseDateKey(dateKey), "EEEE, MMM d")}`);
      lines.push("");
    }

    const { commits, sessions } = row.day;
    const agents = row.day.sources.length > 0 ? ` [${row.day.sources.join(", ")}]` : "";
    lines.push(
      `- **${row.projectName}** (~${row.day.estimatedHours}h, ${commits.length} commit${
        commits.length === 1 ? "" : "s"
      }, ${sessions.length} session${sessions.length === 1 ? "" : "s"})${agents}`
    );

    for (const entry of timelineEntries(row.day)) {
      const time = format(entry.at, "HH:mm");
      if (entry.kind === "commit") {
        lines.push(`  - ${time} · commit · ${entry.commit.message}`);
      } else {
        lines.push(`  - ${time} · ${entry.session.source} · ${entry.session.title}`);
      }
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push(
    `**Weekly Total:** ~${report.totalHours}h across ${report.projects.length} project${
      report.projects.length === 1 ? "" : "s"
    } (${report.totalCommits} commit${report.totalCommits === 1 ? "" : "s"}, ${
      report.totalSessions
    } session${report.totalSessions === 1 ? "" : "s"})`
  );
  lines.push("");
  lines.push(
    `Git alone ~${report.gitHours}h, agents alone ~${report.agentHours}h; overlapping time is counted once.`
  );

  const outputFile =
    filename || `combined-activity-${format(report.startDate, "yyyy-MM-dd")}.md`;
  await writeFile(outputFile, lines.join("\n"), "utf-8");
  return outputFile;
}

export function formatCombinedReportAsJSON(report: CombinedWeeklyReport): string {
  const serializable = {
    startDate: report.startDate.toISOString(),
    endDate: report.endDate.toISOString(),
    totalCommits: report.totalCommits,
    totalSessions: report.totalSessions,
    totalHours: report.totalHours,
    gitHours: report.gitHours,
    agentHours: report.agentHours,
    projects: report.projects.map((project) => ({
      projectPath: project.projectPath,
      projectName: project.projectName,
      hasRepo: Boolean(project.repo),
      totalCommits: project.totalCommits,
      totalSessions: project.totalSessions,
      totalHours: project.totalHours,
      days: Object.fromEntries(
        Array.from(project.days.entries()).map(([key, day]) => [
          key,
          {
            date: day.date.toISOString(),
            estimatedHours: day.estimatedHours,
            gitHours: day.gitHours,
            agentHours: day.agentHours,
            sources: day.sources,
            commits: day.commits.map((commit) => ({
              hash: commit.hash,
              date: commit.date.toISOString(),
              message: commit.message,
              branch: commit.branch,
              author: commit.author,
              email: commit.email,
            })),
            sessions: day.sessions.map((session) => ({
              id: session.id,
              source: session.source,
              title: session.title,
              projectPath: session.projectPath,
              startedAt: session.startedAt.toISOString(),
              endedAt: session.endedAt.toISOString(),
              userTurns: session.userTurns,
              assistantTurns: session.assistantTurns,
              toolCalls: session.toolCalls,
              model: session.model,
            })),
          },
        ])
      ),
    })),
  };

  return JSON.stringify(serializable, null, 2);
}

function csvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

interface DayRow {
  projectName: string;
  projectPath: string;
  day: CombinedDayActivity;
}

/** Every project/day pair, ordered by date then project name. */
function sortedDays(report: CombinedWeeklyReport): DayRow[] {
  const rows: DayRow[] = [];

  for (const project of report.projects) {
    for (const day of project.days.values()) {
      rows.push({
        projectName: project.projectName,
        projectPath: project.projectPath,
        day,
      });
    }
  }

  rows.sort((a, b) => {
    const byDate = a.day.date.getTime() - b.day.date.getTime();
    if (byDate !== 0) return byDate;
    return a.projectName.localeCompare(b.projectName);
  });

  return rows;
}
