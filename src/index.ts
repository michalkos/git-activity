#!/usr/bin/env bun

import { Command } from "commander";
import { render } from "ink";
import React from "react";
import {
  startOfWeek,
  endOfWeek,
  subWeeks,
  addDays,
  isBefore,
  isAfter,
} from "date-fns";

import { scanForRepos, expandPath } from "./scanner.ts";
import { getCommits, getAuthorsFromEnv } from "./git.ts";
import { groupCommitsByDay, formatDateKey } from "./time-estimator.ts";
import { getCachedRepos, clearCache } from "./cache.ts";
import { exportToCSV, exportToMarkdown, formatReportAsJSON } from "./export.ts";
import { App } from "./ui/App.tsx";
import { calculateIntensity } from "./ui/Heatmap.tsx";
import { getDateRange } from "./dates.ts";
import { runAgentsCommand } from "./agents/cli.ts";
import type {
  WeeklyReport,
  ProjectActivity,
  HeatmapData,
  GitCommit,
} from "./types.ts";

const program = new Command();

program
  .name("git-activity")
  .description(
    "Track your git activity across repositories. Use the agents subcommand for local AI-agent sessions."
  )
  .version("1.0.0")
  .option("-w, --week <offset>", "Week offset (e.g., 1 for last week, 2 for two weeks ago)", "0")
  .option("-p, --path <path>", "Path to scan for repositories (default: current directory)")
  .option("-d, --depth <number>", "Max scan depth", "3")
  .option("--from <date>", "Start date (YYYY-MM-DD)")
  .option("--to <date>", "End date (YYYY-MM-DD)")
  .option("-j, --json", "Output as JSON")
  .option("-e, --export <format>", "Export to file (csv or md)")
  .option("-r, --refresh", "Force rescan repositories (ignore cache)")
  .option("--clear-cache", "Clear the repository cache")
  .action(async (options) => {
    try {
      await run(options);
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command("agents")
  .description("Track local AI agent activity")
  .option("-w, --week <offset>", "Week offset (e.g., 1 for last week, 2 for two weeks ago)", "0")
  .option("--from <date>", "Start date (YYYY-MM-DD)")
  .option("--to <date>", "End date (YYYY-MM-DD)")
  .option("-j, --json", "Output as JSON")
  .option("-e, --export <format>", "Export to file (csv or md)")
  .option("--select", "Pick which detected agents to include")
  .option("--list", "Print detection table and exit")
  .option("--agents <ids>", "Comma-separated agent ids (claude,cursor,pi,codex,copilot,vscode-copilot)")
  .action(async (options) => {
    try {
      await runAgentsCommand(options);
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();

async function run(cmdOptions: any) {
  // Handle clear-cache
  if (cmdOptions.clearCache) {
    await clearCache();
    console.log("Cache cleared.");
    return;
  }

  // Parse options
  const scanPath = expandPath(cmdOptions.path || process.cwd());
  const scanDepth = parseInt(
    cmdOptions.depth || process.env.GIT_SCAN_DEPTH || "3",
    10
  );

  // Get date range
  const weeksBack = parseInt(cmdOptions.week || "0", 10);
  const { startDate, endDate } = getDateRange(
    weeksBack,
    cmdOptions.from,
    cmdOptions.to
  );

  // Get authors
  const authors = getAuthorsFromEnv();
  if (authors.length === 0) {
    console.error(
      "No authors configured. Set GIT_ACTIVITY_AUTHORS in .env (comma-separated emails/names)"
    );
    process.exit(1);
  }

  // Scan or load repos
  console.log(`Scanning for repositories in ${scanPath}...`);
  const repos = await getCachedRepos(
    scanPath,
    scanDepth,
    cmdOptions.refresh || false,
    () => scanForRepos(scanPath, scanDepth)
  );
  console.log(`Found ${repos.length} repositories.`);

  if (repos.length === 0) {
    console.log("No git repositories found.");
    return;
  }

  // Gather commits
  console.log("Gathering commits...");
  const report = await buildReport(repos, authors, startDate, endDate);

  // Handle JSON output
  if (cmdOptions.json) {
    console.log(formatReportAsJSON(report));
    return;
  }

  // Handle exports
  if (cmdOptions.export) {
    const format = cmdOptions.export.toLowerCase();
    if (format === "csv") {
      const file = await exportToCSV(report);
      console.log(`Exported to ${file}`);
    } else if (format === "md") {
      const file = await exportToMarkdown(report);
      console.log(`Exported to ${file}`);
    } else {
      console.error('Invalid export format. Use "csv" or "md".');
      process.exit(1);
    }
    return;
  }

  // Build heatmap data (3 weeks centered on selected week)
  const heatmapData = await buildHeatmapDataForWeek(repos, authors, weeksBack);

  // Create report builder functions for week navigation
  const buildReportFn = async (
    repos: Array<{ path: string; name: string }>,
    authors: string[],
    weekOffset: number
  ) => {
    const { startDate, endDate } = getDateRange(weekOffset, undefined, undefined);
    return buildReport(repos, authors, startDate, endDate);
  };

  const buildHeatmapFn = async (
    repos: Array<{ path: string; name: string }>,
    authors: string[],
    weekOffset: number
  ) => {
    return buildHeatmapDataForWeek(repos, authors, weekOffset);
  };

  // Render TUI
  render(
    React.createElement(App, {
      initialReport: report,
      initialHeatmapData: heatmapData,
      initialWeekOffset: weeksBack,
      repos,
      authors,
      buildReport: buildReportFn,
      buildHeatmapData: buildHeatmapFn,
    })
  );
}

async function buildReport(
  repos: Array<{ path: string; name: string }>,
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

async function buildHeatmapDataForWeek(
  repos: Array<{ path: string; name: string }>,
  authors: string[],
  weekOffset: number = 0
): Promise<HeatmapData[]> {
  const now = new Date();
  const targetWeekStart = startOfWeek(subWeeks(now, weekOffset), { weekStartsOn: 1 });
  // Show 2 weeks before and the current selected week
  const threeWeeksAgo = subWeeks(targetWeekStart, 2);
  const endDate = endOfWeek(targetWeekStart, { weekStartsOn: 1 });

  // Collect all commits across all repos for the heatmap period
  const allCommits: GitCommit[] = [];

  for (const repo of repos) {
    const commits = await getCommits(repo, authors, threeWeeksAgo, addDays(endDate, 1));
    allCommits.push(...commits);
  }

  // Group commits by date
  const commitsByDate = new Map<string, number>();
  for (const commit of allCommits) {
    const dateKey = formatDateKey(commit.date);
    commitsByDate.set(dateKey, (commitsByDate.get(dateKey) || 0) + 1);
  }

  // Build heatmap data for all days in the range
  const heatmapData: HeatmapData[] = [];
  let current = new Date(threeWeeksAgo);

  while (current <= endDate) {
    const dateKey = formatDateKey(current);
    const commits = commitsByDate.get(dateKey) || 0;

    heatmapData.push({
      date: new Date(current),
      commits,
      intensity: calculateIntensity(commits),
    });

    current = addDays(current, 1);
  }

  return heatmapData;
}
