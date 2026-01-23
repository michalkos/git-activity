import { useState, useCallback } from "react";
import { Box, Text, useApp, useInput } from "ink";
import type { WeeklyReport, HeatmapData, GitRepo } from "../types.ts";
import { WeekView, getSelectableItems } from "./WeekView.tsx";
import { CommitList } from "./CommitList.tsx";
import { CommitDetail } from "./CommitDetail.tsx";
import { useNavigation } from "./useNavigation.ts";
import { useTerminalDimensions } from "./useTerminalDimensions.ts";

interface AppProps {
  initialReport: WeeklyReport;
  initialHeatmapData: HeatmapData[];
  initialWeekOffset: number;
  repos: GitRepo[];
  authors: string[];
  buildReport: (
    repos: GitRepo[],
    authors: string[],
    weekOffset: number
  ) => Promise<WeeklyReport>;
  buildHeatmapData: (
    repos: GitRepo[],
    authors: string[],
    weekOffset: number
  ) => Promise<HeatmapData[]>;
}

export function App({
  initialReport,
  initialHeatmapData,
  initialWeekOffset,
  repos,
  authors,
  buildReport,
  buildHeatmapData,
}: AppProps) {
  const { exit } = useApp();
  const [navState, navActions] = useNavigation();
  const [terminalWidth] = useTerminalDimensions();

  const [weekOffset, setWeekOffset] = useState(initialWeekOffset);
  const [report, setReport] = useState<WeeklyReport>(initialReport);
  const [heatmapData, setHeatmapData] =
    useState<HeatmapData[]>(initialHeatmapData);
  const [loading, setLoading] = useState(false);

  const selectableItems = getSelectableItems(report);

  const loadWeek = useCallback(
    async (offset: number) => {
      setLoading(true);
      try {
        const [newReport, newHeatmap] = await Promise.all([
          buildReport(repos, authors, offset),
          buildHeatmapData(repos, authors, offset),
        ]);
        setReport(newReport);
        setHeatmapData(newHeatmap);
        navActions.goBack(); // Reset to week view and selection
      } finally {
        setLoading(false);
      }
    },
    [repos, authors, buildReport, buildHeatmapData, navActions]
  );

  useInput((input, key) => {
    if (input === "q") {
      exit();
      return;
    }

    if (loading) return;

    if (navState.viewState.view === "week") {
      if (key.upArrow) {
        navActions.moveUp();
      } else if (key.downArrow) {
        navActions.moveDown();
      } else if (key.return && selectableItems.length > 0) {
        const item = selectableItems[navState.selectedIndex];
        if (item) {
          navActions.select(item.projectPath, item.dateKey);
        }
      } else if (key.leftArrow) {
        // Previous week (further in the past)
        const newOffset = weekOffset + 1;
        setWeekOffset(newOffset);
        loadWeek(newOffset);
      } else if (key.rightArrow) {
        // Next week (closer to present)
        if (weekOffset > 0) {
          const newOffset = weekOffset - 1;
          setWeekOffset(newOffset);
          loadWeek(newOffset);
        }
      }
    } else if (navState.viewState.view === "commits" || navState.viewState.view === "commit-detail") {
      // In commit view or commit detail view, Escape or backspace goes back
      if (key.escape || (key.backspace && !input)) {
        navActions.goBack();
      }
    }
  });

  if (loading) {
    return (
      <Box>
        <Text>Loading week data...</Text>
      </Box>
    );
  }

  if (navState.viewState.view === "commits") {
    const { projectPath, date } = navState.viewState;
    const project = report.projects.find((p) => p.repo.path === projectPath);
    const day = project?.days.get(date);

    if (project && day) {
      return (
        <CommitList
          repo={project.repo}
          day={day}
          terminalWidth={terminalWidth}
          selectedIndex={navState.commitIndex}
          setSelectedIndex={navActions.setCommitIndex}
          onSelectCommit={(commitHash) => navActions.selectCommit(projectPath, date, commitHash)}
        />
      );
    }

    navActions.goBack();
    return null;
  }

  if (navState.viewState.view === "commit-detail") {
    const { projectPath, commitHash } = navState.viewState;
    const project = report.projects.find((p) => p.repo.path === projectPath);

    if (project) {
      return <CommitDetail repo={project.repo} commitHash={commitHash} terminalWidth={terminalWidth} />;
    }

    navActions.goBack();
    return null;
  }

  return (
    <WeekView
      report={report}
      selectedIndex={navState.selectedIndex}
      onSetMaxIndex={navActions.setMaxIndex}
      heatmapData={heatmapData}
      weekOffset={weekOffset}
      terminalWidth={terminalWidth}
    />
  );
}
