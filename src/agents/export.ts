import { writeFile } from "node:fs/promises";
import { format } from "date-fns";
import { parseDateKey } from "../time-estimator.ts";
import type {
  AgentDayActivity,
  AgentProjectActivity,
  AgentWeeklyReport,
} from "./types.ts";

export async function exportAgentToCSV(
  report: AgentWeeklyReport,
  filename?: string
): Promise<string> {
  const lines: string[] = ["Date,Project,Path,Hours,Sessions,Agents"];
  const entries: Array<{
    date: Date;
    project: string;
    path: string;
    hours: number;
    sessions: number;
    agents: string;
  }> = [];

  for (const project of report.projects) {
    for (const day of project.days.values()) {
      entries.push({
        date: day.date,
        project: project.projectName,
        path: project.projectPath,
        hours: day.estimatedHours,
        sessions: day.sessions.length,
        agents: day.sources.join(","),
      });
    }
  }

  entries.sort((a, b) => a.date.getTime() - b.date.getTime());

  for (const entry of entries) {
    const dateStr = format(entry.date, "yyyy-MM-dd");
    lines.push(
      [
        dateStr,
        csvField(entry.project),
        csvField(entry.path),
        String(entry.hours),
        String(entry.sessions),
        csvField(entry.agents),
      ].join(",")
    );
  }

  const content = lines.join("\n");
  const outputFile =
    filename || `agent-activity-${format(report.startDate, "yyyy-MM-dd")}.csv`;
  await writeFile(outputFile, content, "utf-8");
  return outputFile;
}

export async function exportAgentToMarkdown(
  report: AgentWeeklyReport,
  filename?: string
): Promise<string> {
  const lines: string[] = [];
  const startStr = format(report.startDate, "MMM d");
  const endStr = format(report.endDate, "MMM d, yyyy");
  lines.push(`# Agent week of ${startStr} - ${endStr}`);
  lines.push("");

  const dateMap = new Map<
    string,
    Map<string, { project: AgentProjectActivity; day: AgentDayActivity }>
  >();

  for (const project of report.projects) {
    for (const [dateKey, day] of project.days) {
      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, new Map());
      }
      dateMap.get(dateKey)!.set(project.projectPath, { project, day });
    }
  }

  const sortedDates = Array.from(dateMap.keys()).sort();

  for (const dateKey of sortedDates) {
    const date = parseDateKey(dateKey);
    lines.push(`## ${format(date, "EEEE, MMM d")}`);
    lines.push("");

    const dayProjects = dateMap.get(dateKey)!;
    for (const { project, day } of dayProjects.values()) {
      const sessionCount = day.sessions.length;
      const agents = day.sources.length > 0 ? ` [${day.sources.join(", ")}]` : "";
      lines.push(
        `- **${project.projectName}** (${day.estimatedHours}h, ${sessionCount} session${sessionCount === 1 ? "" : "s"})${agents}`
      );
      for (const session of day.sessions) {
        lines.push(`  - ${session.title}`);
      }
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push(
    `**Weekly Total:** ~${report.totalHours}h across ${report.projects.length} project${report.projects.length === 1 ? "" : "s"} (${report.totalSessions} session${report.totalSessions === 1 ? "" : "s"})`
  );

  const content = lines.join("\n");
  const outputFile =
    filename || `agent-activity-${format(report.startDate, "yyyy-MM-dd")}.md`;
  await writeFile(outputFile, content, "utf-8");
  return outputFile;
}

export function formatAgentReportAsJSON(report: AgentWeeklyReport): string {
  const serializable = {
    startDate: report.startDate.toISOString(),
    endDate: report.endDate.toISOString(),
    totalSessions: report.totalSessions,
    totalHours: report.totalHours,
    projects: report.projects.map((project) => ({
      projectPath: project.projectPath,
      projectName: project.projectName,
      totalSessions: project.totalSessions,
      totalHours: project.totalHours,
      days: Object.fromEntries(
        Array.from(project.days.entries()).map(([key, day]) => [
          key,
          {
            date: day.date.toISOString(),
            estimatedHours: day.estimatedHours,
            sources: day.sources,
            sessions: day.sessions.map((session) => ({
              id: session.id,
              source: session.source,
              title: session.title,
              projectPath: session.projectPath,
              projectName: session.projectName,
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
