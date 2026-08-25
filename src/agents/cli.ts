import React from "react";
import { render } from "ink";
import { addDays, endOfWeek, startOfWeek, subWeeks } from "date-fns";
import { getDateRange } from "../dates.ts";
import { detectAgents, formatDetectionTable } from "./detect.ts";
import {
  loadAgentConfig,
  parseAgentIds,
  saveAgentConfig,
} from "./select.ts";
import { createDefaultSources } from "./sources/index.ts";
import {
  buildAgentHeatmapData,
  buildAgentReport,
  collectSessions,
} from "./report.ts";
import {
  exportAgentToCSV,
  exportAgentToMarkdown,
  formatAgentReportAsJSON,
} from "./export.ts";
import { AgentApp } from "../ui/AgentApp.tsx";
import { AgentPicker } from "../ui/AgentPicker.tsx";
import type {
  AgentSession,
  AgentSourceId,
  DetectedAgent,
} from "./types.ts";

export interface AgentsCliOptions {
  week?: string;
  from?: string;
  to?: string;
  json?: boolean;
  export?: string;
  select?: boolean;
  list?: boolean;
  agents?: string;
}

export async function runAgentsCommand(options: AgentsCliOptions): Promise<void> {
  const sources = createDefaultSources();
  const detections = await detectAgents(sources);

  if (options.list) {
    console.log(formatDetectionTable(detections));
    return;
  }

  const enabledIds = await resolveEnabledSources(options, detections);
  if (enabledIds === null) {
    return;
  }

  const enabledSources = sources.filter((source) =>
    enabledIds.includes(source.id)
  );
  const noAgentsEnabled = enabledIds.length === 0;

  const weeksBack = parseInt(options.week || "0", 10);
  const { startDate, endDate } = getDateRange(
    weeksBack,
    options.from,
    options.to
  );

  const heatmapStart = startOfWeek(subWeeks(new Date(), weeksBack + 2), {
    weekStartsOn: 1,
  });
  const heatmapEnd = endOfWeek(subWeeks(new Date(), weeksBack), {
    weekStartsOn: 1,
  });
  const collectFrom =
    startDate < heatmapStart ? startDate : heatmapStart;
  const collectTo = endDate > heatmapEnd ? endDate : heatmapEnd;

  const sessions = noAgentsEnabled
    ? []
    : await collectSessions(enabledSources, collectFrom, collectTo);

  const report = buildAgentReport(sessions, startDate, endDate);

  if (options.json) {
    console.log(formatAgentReportAsJSON(report));
    return;
  }

  if (options.export) {
    const formatName = options.export.toLowerCase();
    if (formatName === "csv") {
      const file = await exportAgentToCSV(report);
      console.log(`Exported to ${file}`);
    } else if (formatName === "md") {
      const file = await exportAgentToMarkdown(report);
      console.log(`Exported to ${file}`);
    } else {
      console.error('Invalid export format. Use "csv" or "md".');
      process.exit(1);
    }
    return;
  }

  const heatmapData = buildAgentHeatmapData(sessions, weeksBack);
  const sourcesById = new Map(
    enabledSources.map((source) => [source.id, source])
  );

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error("Interactive TUI requires a TTY. Use --json or --export.");
    process.exit(1);
  }

  const buildReportFn = async (weekOffset: number) => {
    const range = getDateRange(weekOffset);
    const from = startOfWeek(subWeeks(new Date(), weekOffset + 2), {
      weekStartsOn: 1,
    });
    const to = range.endDate;
    const weekSessions = noAgentsEnabled
      ? []
      : await collectSessions(enabledSources, from, to);
    return buildAgentReport(weekSessions, range.startDate, range.endDate);
  };

  const buildHeatmapFn = async (weekOffset: number) => {
    const from = startOfWeek(subWeeks(new Date(), weekOffset + 2), {
      weekStartsOn: 1,
    });
    const to = addDays(
      endOfWeek(subWeeks(new Date(), weekOffset), { weekStartsOn: 1 }),
      0
    );
    const weekSessions = noAgentsEnabled
      ? []
      : await collectSessions(enabledSources, from, to);
    return buildAgentHeatmapData(weekSessions, weekOffset);
  };

  const loadPrompts = async (session: AgentSession) => {
    const source = sourcesById.get(session.source);
    if (!source) {
      return [];
    }
    return source.getUserPrompts(session);
  };

  render(
    React.createElement(AgentApp, {
      initialReport: report,
      initialHeatmapData: heatmapData,
      initialWeekOffset: weeksBack,
      noAgentsEnabled,
      buildReport: buildReportFn,
      buildHeatmapData: buildHeatmapFn,
      loadPrompts,
    })
  );
}

async function resolveEnabledSources(
  options: AgentsCliOptions,
  detections: DetectedAgent[]
): Promise<AgentSourceId[] | null> {
  const installed = detections.filter((entry) => entry.detection.installed);
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const nonInteractive = Boolean(options.json || options.export);

  if (options.agents) {
    return parseAgentIds(options.agents);
  }

  if (options.select) {
    if (!interactive) {
      throw new Error("Cannot use --select without a TTY");
    }
    if (installed.length === 0) {
      console.log("No AI coding agents detected.");
      return [];
    }
    const saved = await loadAgentConfig();
    const picked = await runPicker(
      installed,
      defaultPickerSelection(installed, saved?.enabled)
    );
    if (picked === null) {
      console.log("No changes saved.");
      return null;
    }
    await saveAgentConfig({ enabled: picked });
    return picked;
  }

  const saved = await loadAgentConfig();
  if (saved) {
    return saved.enabled;
  }

  if (nonInteractive || !interactive) {
    return detections
      .filter((entry) => entry.detection.installed && entry.detection.sessionCount > 0)
      .map((entry) => entry.id);
  }

  if (installed.length === 0) {
    console.log("No AI coding agents detected.");
    return [];
  }

  const picked = await runPicker(
    installed,
    defaultPickerSelection(installed)
  );
  if (picked === null) {
    console.log("No agents selected.");
    return null;
  }
  await saveAgentConfig({ enabled: picked });
  return picked;
}

function defaultPickerSelection(
  installed: DetectedAgent[],
  saved?: AgentSourceId[]
): AgentSourceId[] {
  if (saved) {
    const installedIds = new Set(installed.map((entry) => entry.id));
    return saved.filter((id) => installedIds.has(id));
  }
  return installed
    .filter((entry) => entry.detection.sessionCount > 0)
    .map((entry) => entry.id);
}

async function runPicker(
  detections: DetectedAgent[],
  initiallyEnabled: AgentSourceId[]
): Promise<AgentSourceId[] | null> {
  let result: AgentSourceId[] | null = null;
  const { waitUntilExit } = render(
    React.createElement(AgentPicker, {
      detections,
      initiallyEnabled,
      onSubmit: (enabled) => {
        result = enabled;
      },
      onCancel: () => {
        result = null;
      },
    })
  );
  await waitUntilExit();
  return result;
}
