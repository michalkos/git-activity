import { useEffect } from "react";
import { Box, Text } from "ink";
import { format } from "date-fns";
import type {
  AgentDayActivity,
  AgentProjectActivity,
  AgentWeeklyReport,
} from "../agents/types.ts";
import { shortenHome } from "../agents/paths.ts";
import { Heatmap } from "./Heatmap.tsx";
import type { HeatmapData } from "../types.ts";
import { parseDateKey } from "../time-estimator.ts";

interface SelectableItem {
  projectPath: string;
  dateKey: string;
  project: AgentProjectActivity;
  day: AgentDayActivity;
}

interface AgentWeekViewProps {
  report: AgentWeeklyReport;
  selectedIndex: number;
  onSetMaxIndex: (max: number) => void;
  heatmapData: HeatmapData[];
  weekOffset: number;
  terminalWidth: number;
  noAgentsEnabled?: boolean;
}

export function AgentWeekView({
  report,
  selectedIndex,
  onSetMaxIndex,
  heatmapData,
  weekOffset,
  terminalWidth,
  noAgentsEnabled = false,
}: AgentWeekViewProps) {
  const dividerWidth = Math.max(terminalWidth - 4, 20);
  const selectableItems = getSelectableAgentItems(report);
  const dayGroups = new Map<
    string,
    Array<{ project: AgentProjectActivity; day: AgentDayActivity }>
  >();

  for (const item of selectableItems) {
    if (!dayGroups.has(item.dateKey)) {
      dayGroups.set(item.dateKey, []);
    }
    dayGroups.get(item.dateKey)!.push({
      project: item.project,
      day: item.day,
    });
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

      {noAgentsEnabled ? (
        <Box flexDirection="column">
          <Text>No agents enabled.</Text>
          <Text dimColor>
            Run git-activity agents --select to choose sources.
          </Text>
        </Box>
      ) : sortedDates.length === 0 ? (
        <Box>
          <Text dimColor>No sessions found for this period.</Text>
        </Box>
      ) : (
        sortedDates.map((dateKey) => {
          const date = parseDateKey(dateKey);
          const dayProjects = dayGroups.get(dateKey)!;

          return (
            <Box key={dateKey} flexDirection="column" marginBottom={1}>
              <Text bold>{format(date, "EEEE, MMM d")}</Text>
              {dayProjects.map(({ project, day }, idx) => {
                const itemIdx = indexMap.get(
                  `${dateKey}|${project.projectPath}`
                )!;
                const isSelected = itemIdx === selectedIndex;
                const isLast = idx === dayProjects.length - 1;
                const prefix = isLast ? "└── " : "├── ";
                const sessionLabel = `${day.sessions.length} session${
                  day.sessions.length === 1 ? "" : "s"
                }`;
                const tags =
                  day.sources.length > 0 ? `  [${day.sources.join(", ")}]` : "";
                const label = `${prefix}${project.projectName} (${shortenHome(project.projectPath)})`;

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
                    <Text dimColor>
                      ~{day.estimatedHours}h  {sessionLabel}
                      {tags}
                    </Text>
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

      <Box>
        <Text>
          Weekly Total: ~{report.totalHours}h across {report.projects.length}{" "}
          project{report.projects.length === 1 ? "" : "s"}{" "}
          ({report.totalSessions} session
          {report.totalSessions === 1 ? "" : "s"})
        </Text>
      </Box>

      <Heatmap data={heatmapData} weeksToShow={3} weekOffset={weekOffset} />

      <Box marginTop={1}>
        <Text dimColor>
          [↑↓] Navigate [←→] Week [Enter] Details [q] Quit
        </Text>
      </Box>
    </Box>
  );
}

export function getSelectableAgentItems(
  report: AgentWeeklyReport
): SelectableItem[] {
  const items: SelectableItem[] = [];

  for (const project of report.projects) {
    for (const [dateKey, day] of project.days) {
      items.push({
        projectPath: project.projectPath,
        dateKey,
        project,
        day,
      });
    }
  }

  items.sort((a, b) => {
    const dateCompare = a.dateKey.localeCompare(b.dateKey);
    if (dateCompare !== 0) return dateCompare;
    return a.project.projectName.localeCompare(b.project.projectName);
  });

  return items;
}
