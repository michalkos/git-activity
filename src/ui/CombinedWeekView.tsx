import { useEffect } from "react";
import { Box, Text } from "ink";
import { format } from "date-fns";
import { shortenHome } from "../agents/paths.ts";
import type {
  CombinedDayActivity,
  CombinedProjectActivity,
  CombinedWeeklyReport,
} from "../combined/types.ts";
import type { HeatmapData } from "../types.ts";
import { truncate } from "./format.ts";
import { Heatmap } from "./Heatmap.tsx";
import { parseDateKey } from "../time-estimator.ts";

interface SelectableItem {
  projectPath: string;
  dateKey: string;
  project: CombinedProjectActivity;
  day: CombinedDayActivity;
}

interface CombinedWeekViewProps {
  report: CombinedWeeklyReport;
  selectedIndex: number;
  onSetMaxIndex: (max: number) => void;
  heatmapData: HeatmapData[];
  weekOffset: number;
  terminalWidth: number;
}

export function CombinedWeekView({
  report,
  selectedIndex,
  onSetMaxIndex,
  heatmapData,
  weekOffset,
  terminalWidth,
}: CombinedWeekViewProps) {
  const dividerWidth = Math.max(terminalWidth - 4, 20);
  const selectableItems = getSelectableCombinedItems(report);

  const dayGroups = new Map<string, SelectableItem[]>();
  for (const item of selectableItems) {
    const existing = dayGroups.get(item.dateKey);
    if (existing) {
      existing.push(item);
    } else {
      dayGroups.set(item.dateKey, [item]);
    }
  }

  useEffect(() => {
    onSetMaxIndex(selectableItems.length);
  }, [selectableItems.length, onSetMaxIndex]);

  const sortedDates = Array.from(dayGroups.keys()).sort();
  const indexMap = new Map<string, number>();
  selectableItems.forEach((item, index) => {
    indexMap.set(`${item.dateKey}|${item.projectPath}`, index);
  });

  const startStr = format(report.startDate, "MMM d");
  const endStr = format(report.endDate, "MMM d, yyyy");
  const weekLabel =
    weekOffset === 0
      ? "Current Week"
      : weekOffset === 1
        ? "Last Week"
        : `${weekOffset} Weeks Ago`;
  const overlap =
    Math.round((report.gitHours + report.agentHours - report.totalHours) * 10) / 10;

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Box justifyContent="space-between">
        <Text bold>
          Week: {startStr} - {endStr}
        </Text>
        <Text dimColor>({weekLabel})</Text>
      </Box>

      <Box marginY={1}>
        <Text dimColor>{"─".repeat(dividerWidth)}</Text>
      </Box>

      {sortedDates.length === 0 ? (
        <Box>
          <Text dimColor>No commits or agent sessions found for this period.</Text>
        </Box>
      ) : (
        sortedDates.map((dateKey) => {
          const date = parseDateKey(dateKey);
          const dayItems = dayGroups.get(dateKey)!;

          return (
            <Box key={dateKey} flexDirection="column" marginBottom={1}>
              <Text bold>{format(date, "EEEE, MMM d")}</Text>
              {dayItems.map(({ project, day }, idx) => {
                const itemIdx = indexMap.get(`${dateKey}|${project.projectPath}`)!;
                const isSelected = itemIdx === selectedIndex;
                const prefix = idx === dayItems.length - 1 ? "└── " : "├── ";
                const meta = rowMeta(day);
                // Rows carry more numbers than the git-only view, so the label is
                // trimmed to whatever the metrics leave rather than wrapping.
                const label = truncate(
                  `${prefix}${project.projectName} (${shortenHome(project.projectPath)})`,
                  Math.max(dividerWidth - meta.length - 2, 12)
                );

                return (
                  <Box
                    key={`${dateKey}|${project.projectPath}`}
                    justifyContent="space-between"
                  >
                    <Box>
                      {isSelected ? (
                        <Text backgroundColor="blue" color="white">
                          {label}
                        </Text>
                      ) : (
                        <Text>{label}</Text>
                      )}
                    </Box>
                    <Text dimColor>{meta}</Text>
                  </Box>
                );
              })}
            </Box>
          );
        })
      )}

      <Box marginY={1}>
        <Text dimColor>{"─".repeat(dividerWidth)}</Text>
      </Box>

      <Box flexDirection="column">
        <Text>
          Weekly Total: ~{report.totalHours}h across {report.projects.length} project
          {report.projects.length === 1 ? "" : "s"} ({report.totalCommits} commit
          {report.totalCommits === 1 ? "" : "s"}, {report.totalSessions} session
          {report.totalSessions === 1 ? "" : "s"})
        </Text>
        <Text dimColor>
          Git ~{report.gitHours}h · Agents ~{report.agentHours}h
          {overlap > 0.1 ? ` · ~${overlap}h overlapped and counted once` : ""}
        </Text>
      </Box>

      <Heatmap data={heatmapData} weeksToShow={3} weekOffset={weekOffset} />

      <Box marginTop={1}>
        <Text dimColor>[↑↓] Navigate [←→] Week [Enter] Timeline [q] Quit</Text>
      </Box>
    </Box>
  );
}

/** Right-hand metrics of a row: merged hours, both counts, and the agent tags. */
function rowMeta(day: CombinedDayActivity): string {
  const commits = `${day.commits.length} commit${day.commits.length === 1 ? "" : "s"}`;
  const sessions = `${day.sessions.length} session${day.sessions.length === 1 ? "" : "s"}`;
  const tags = day.sources.length > 0 ? `  [${day.sources.join(", ")}]` : "";
  return `~${day.estimatedHours}h  ${commits}  ${sessions}${tags}`;
}

/** Flat, date-then-name ordered list the week-view selection index refers to. */
export function getSelectableCombinedItems(
  report: CombinedWeeklyReport
): SelectableItem[] {
  const items: SelectableItem[] = [];

  for (const project of report.projects) {
    for (const [dateKey, day] of project.days) {
      items.push({ projectPath: project.projectPath, dateKey, project, day });
    }
  }

  items.sort((a, b) => {
    const byDate = a.dateKey.localeCompare(b.dateKey);
    if (byDate !== 0) return byDate;
    return a.project.projectName.localeCompare(b.project.projectName);
  });

  return items;
}
