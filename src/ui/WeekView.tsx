import React, { useEffect } from "react";
import { Box, Text } from "ink";
import { format } from "date-fns";
import type { WeeklyReport, ProjectActivity, DayActivity } from "../types.ts";
import { Heatmap } from "./Heatmap.tsx";
import type { HeatmapData } from "../types.ts";
import { parseDateKey } from "../time-estimator.ts";

interface SelectableItem {
  projectPath: string;
  dateKey: string;
  project: ProjectActivity;
  day: DayActivity;
}

interface WeekViewProps {
  report: WeeklyReport;
  selectedIndex: number;
  onSetMaxIndex: (max: number) => void;
  heatmapData: HeatmapData[];
  weekOffset: number;
  terminalWidth: number;
}

export function WeekView({
  report,
  selectedIndex,
  onSetMaxIndex,
  heatmapData,
  weekOffset,
  terminalWidth,
}: WeekViewProps) {
  // Calculate divider width: terminal width minus box borders/padding
  const dividerWidth = Math.max(terminalWidth - 4, 20);
  // Build a flat list of selectable items (project/day combinations)
  const selectableItems: SelectableItem[] = [];
  const dayGroups = new Map<
    string,
    Array<{ project: ProjectActivity; day: DayActivity }>
  >();

  for (const project of report.projects) {
    for (const [dateKey, day] of project.days) {
      if (!dayGroups.has(dateKey)) {
        dayGroups.set(dateKey, []);
      }
      dayGroups.get(dateKey)!.push({ project, day });
      selectableItems.push({
        projectPath: project.repo.path,
        dateKey,
        project,
        day,
      });
    }
  }

  // Sort by date then by project name
  selectableItems.sort((a, b) => {
    const dateCompare = a.dateKey.localeCompare(b.dateKey);
    if (dateCompare !== 0) return dateCompare;
    return a.project.repo.name.localeCompare(b.project.repo.name);
  });

  useEffect(() => {
    onSetMaxIndex(selectableItems.length);
  }, [selectableItems.length, onSetMaxIndex]);

  // Sort day groups by date
  const sortedDates = Array.from(dayGroups.keys()).sort();

  // Sort projects within each date group by name (to match selectableItems order)
  for (const projects of dayGroups.values()) {
    projects.sort((a, b) => a.project.repo.name.localeCompare(b.project.repo.name));
  }

  // Calculate which item index each date-project combo maps to
  let itemIndex = 0;
  const indexMap = new Map<string, number>(); // key: `${dateKey}|${projectPath}`
  for (const item of selectableItems) {
    indexMap.set(`${item.dateKey}|${item.projectPath}`, itemIndex++);
  }

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
      {/* Header */}
      <Box justifyContent="space-between">
        <Text bold>
          Week: {startStr} - {endStr}
        </Text>
        <Text dimColor>({weekLabel})</Text>
      </Box>

      {/* Divider */}
      <Box marginY={1}>
        <Text dimColor>{"─".repeat(dividerWidth)}</Text>
      </Box>

      {/* Days with activity */}
      {sortedDates.length === 0 ? (
        <Box>
          <Text dimColor>No commits found for this period.</Text>
        </Box>
      ) : (
        sortedDates.map((dateKey) => {
          const date = parseDateKey(dateKey);
          const dayProjects = dayGroups.get(dateKey)!;

          return (
            <Box key={dateKey} flexDirection="column" marginBottom={1}>
              <Text bold>{format(date, "EEEE, MMM d")}</Text>
              {dayProjects.map(({ project, day }, idx) => {
                const itemIdx = indexMap.get(`${dateKey}|${project.repo.path}`)!;
                const isSelected = itemIdx === selectedIndex;
                const isLast = idx === dayProjects.length - 1;
                const prefix = isLast ? "└── " : "├── ";

                return (
                  <Box key={`${dateKey}|${project.repo.path}`} justifyContent="space-between">
                    <Box>
                      {isSelected ? (
                        <Text backgroundColor="blue" color="white">
                          {prefix}
                          {project.repo.name} ({shortenPath(project.repo.path)})
                        </Text>
                      ) : (
                        <Text>
                          {prefix}
                          {project.repo.name} ({shortenPath(project.repo.path)})
                        </Text>
                      )}
                    </Box>
                    <Text dimColor>
                      ~{day.estimatedHours}h {day.commits.length} commit
                      {day.commits.length === 1 ? "" : "s"}
                    </Text>
                  </Box>
                );
              })}
            </Box>
          );
        })
      )}

      {/* Divider */}
      <Box marginY={1}>
        <Text dimColor>{"─".repeat(dividerWidth)}</Text>
      </Box>

      {/* Summary */}
      <Box>
        <Text>
          Weekly Total: ~{report.totalHours}h across {report.projects.length}{" "}
          project{report.projects.length === 1 ? "" : "s"}
        </Text>
      </Box>

      {/* Heatmap */}
      <Heatmap data={heatmapData} weeksToShow={3} weekOffset={weekOffset} />

      {/* Footer instructions */}
      <Box marginTop={1}>
        <Text dimColor>
          [↑↓] Navigate [←→] Week [Enter] Details [q] Quit
        </Text>
      </Box>
    </Box>
  );
}

export function getSelectableItems(report: WeeklyReport): SelectableItem[] {
  const items: SelectableItem[] = [];

  for (const project of report.projects) {
    for (const [dateKey, day] of project.days) {
      items.push({
        projectPath: project.repo.path,
        dateKey,
        project,
        day,
      });
    }
  }

  items.sort((a, b) => {
    const dateCompare = a.dateKey.localeCompare(b.dateKey);
    if (dateCompare !== 0) return dateCompare;
    return a.project.repo.name.localeCompare(b.project.repo.name);
  });

  return items;
}

function shortenPath(path: string): string {
  const home = process.env.HOME || "";
  if (path.startsWith(home)) {
    return "~" + path.slice(home.length);
  }
  return path;
}
