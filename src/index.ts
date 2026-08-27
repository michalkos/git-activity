#!/usr/bin/env bun

import { Command } from "commander";
import { render } from "ink";
import React from "react";
import { scanForRepos, expandPath } from "./scanner.ts";
import { getAuthorsFromEnv } from "./git.ts";
import { getCachedRepos, clearCache } from "./cache.ts";
import { exportToCSV, exportToMarkdown, formatReportAsJSON } from "./export.ts";
import { App } from "./ui/App.tsx";
import { buildGitHeatmapData, buildGitReport } from "./report.ts";
import { getDateRange } from "./dates.ts";
import { runAgentsCommand } from "./agents/cli.ts";
import { runCombinedCommand } from "./combined/cli.ts";
import type { GitRepo } from "./types.ts";

const program = new Command();
program.enablePositionalOptions();

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

program
  .command("all")
  .description("Combined report: git commits and local AI agent sessions together")
  .option("-w, --week <offset>", "Week offset (e.g., 1 for last week, 2 for two weeks ago)", "0")
  .option("-p, --path <path>", "Path to scan for repositories (default: current directory)")
  .option("-d, --depth <number>", "Max scan depth", "3")
  .option("--from <date>", "Start date (YYYY-MM-DD)")
  .option("--to <date>", "End date (YYYY-MM-DD)")
  .option("-j, --json", "Output as JSON")
  .option("-e, --export <format>", "Export to file (csv or md)")
  .option("-r, --refresh", "Force rescan repositories (ignore cache)")
  .option("--select", "Pick which detected agents to include")
  .option("--agents <ids>", "Comma-separated agent ids (claude,cursor,pi,codex,copilot,vscode-copilot)")
  .action(async (options) => {
    try {
      await runCombinedCommand(options);
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
  const report = await buildGitReport(repos, authors, startDate, endDate);

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
  const heatmapData = await buildGitHeatmapData(repos, authors, weeksBack);

  // Create report builder functions for week navigation
  const buildReportFn = async (
    repos: GitRepo[],
    authors: string[],
    weekOffset: number
  ) => {
    const { startDate, endDate } = getDateRange(weekOffset, undefined, undefined);
    return buildGitReport(repos, authors, startDate, endDate);
  };

  const buildHeatmapFn = async (
    repos: GitRepo[],
    authors: string[],
    weekOffset: number
  ) => buildGitHeatmapData(repos, authors, weekOffset);

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
