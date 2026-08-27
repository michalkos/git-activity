import React from "react";
import { render } from "ink";
import { resolveEnabledSources } from "../agents/cli.ts";
import { detectAgents } from "../agents/detect.ts";
import { createDefaultSources } from "../agents/sources/index.ts";
import type { AgentSource } from "../agents/sources/types.ts";
import type { AgentSession } from "../agents/types.ts";
import { buildAgentReport, collectSessions } from "../agents/report.ts";
import { getCachedRepos } from "../cache.ts";
import { getDateRange } from "../dates.ts";
import { getAuthorsFromEnv } from "../git.ts";
import { buildGitReport, collectCommits, heatmapRange } from "../report.ts";
import { expandPath, scanForRepos } from "../scanner.ts";
import type { GitRepo } from "../types.ts";
import { CombinedApp } from "../ui/CombinedApp.tsx";
import {
  exportCombinedToCSV,
  exportCombinedToMarkdown,
  formatCombinedReportAsJSON,
} from "./export.ts";
import { buildCombinedHeatmapData, buildCombinedReport } from "./report.ts";
import type { CombinedWeeklyReport } from "./types.ts";
import type { HeatmapData } from "../types.ts";

export interface CombinedCliOptions {
  week?: string;
  path?: string;
  depth?: string;
  from?: string;
  to?: string;
  json?: boolean;
  export?: string;
  refresh?: boolean;
  select?: boolean;
  agents?: string;
}

/**
 * `git-activity all`: one report over git commits and local agent sessions,
 * grouped by repo. Progress goes to stderr so --json stays machine-readable.
 */
export async function runCombinedCommand(options: CombinedCliOptions): Promise<void> {
  const authors = getAuthorsFromEnv();
  if (authors.length === 0) {
    console.error(
      "No authors configured. Set GIT_ACTIVITY_AUTHORS in .env (comma-separated emails/names)"
    );
    process.exit(1);
  }

  const sources = createDefaultSources();
  const detections = await detectAgents(sources);
  const enabledIds = await resolveEnabledSources(options, detections);
  if (enabledIds === null) {
    return;
  }
  const enabledSources = sources.filter((source) => enabledIds.includes(source.id));
  const sourcesById = new Map(enabledSources.map((source) => [source.id, source]));

  const scanPath = expandPath(options.path || process.cwd());
  const scanDepth = parseInt(options.depth || process.env.GIT_SCAN_DEPTH || "3", 10);

  console.error(`Scanning for repositories in ${scanPath}...`);
  const repos = await getCachedRepos(scanPath, scanDepth, options.refresh || false, () =>
    scanForRepos(scanPath, scanDepth)
  );
  console.error(`Found ${repos.length} repositories.`);

  const weeksBack = parseInt(options.week || "0", 10);
  const { startDate, endDate } = getDateRange(weeksBack, options.from, options.to);

  const report = await buildWeek({
    repos,
    authors,
    sources: enabledSources,
    startDate,
    endDate,
  });

  if (options.json) {
    console.log(formatCombinedReportAsJSON(report));
    return;
  }

  if (options.export) {
    const formatName = options.export.toLowerCase();
    if (formatName === "csv") {
      console.log(`Exported to ${await exportCombinedToCSV(report)}`);
    } else if (formatName === "md") {
      console.log(`Exported to ${await exportCombinedToMarkdown(report)}`);
    } else {
      console.error('Invalid export format. Use "csv" or "md".');
      process.exit(1);
    }
    return;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error("Interactive TUI requires a TTY. Use --json or --export.");
    process.exit(1);
  }

  const heatmapData = await buildHeatmap({
    repos,
    authors,
    sources: enabledSources,
    weekOffset: weeksBack,
  });

  const loadPrompts = async (session: AgentSession) => {
    const source = sourcesById.get(session.source);
    return source ? source.getUserPrompts(session) : [];
  };

  render(
    React.createElement(CombinedApp, {
      initialReport: report,
      initialHeatmapData: heatmapData,
      initialWeekOffset: weeksBack,
      buildReport: (weekOffset: number) => {
        const range = getDateRange(weekOffset);
        return buildWeek({
          repos,
          authors,
          sources: enabledSources,
          startDate: range.startDate,
          endDate: range.endDate,
        });
      },
      buildHeatmapData: (weekOffset: number) =>
        buildHeatmap({ repos, authors, sources: enabledSources, weekOffset }),
      loadPrompts,
    })
  );
}

interface WeekInput {
  repos: GitRepo[];
  authors: string[];
  sources: AgentSource[];
  startDate: Date;
  endDate: Date;
}

async function buildWeek({
  repos,
  authors,
  sources,
  startDate,
  endDate,
}: WeekInput): Promise<CombinedWeeklyReport> {
  const [gitReport, sessions] = await Promise.all([
    buildGitReport(repos, authors, startDate, endDate),
    collectSessions(sources, startDate, endDate),
  ]);

  return buildCombinedReport({
    gitReport,
    agentReport: buildAgentReport(sessions, startDate, endDate),
    repos,
  });
}

async function buildHeatmap({
  repos,
  authors,
  sources,
  weekOffset,
}: {
  repos: GitRepo[];
  authors: string[];
  sources: AgentSource[];
  weekOffset: number;
}): Promise<HeatmapData[]> {
  const { from, to } = heatmapRange(weekOffset);
  const [commits, sessions] = await Promise.all([
    collectCommits(repos, authors, from, to),
    collectSessions(sources, from, to),
  ]);
  return buildCombinedHeatmapData(commits, sessions, weekOffset);
}