import { sessionKey } from "../agents/session.ts";
import { useState, useCallback } from "react";
import { Box, Text, useApp, useInput } from "ink";
import type { AgentSession } from "../agents/types.ts";
import type { CombinedWeeklyReport } from "../combined/types.ts";
import type { HeatmapData } from "../types.ts";
import { CombinedWeekView, getSelectableCombinedItems } from "./CombinedWeekView.tsx";
import { CommitDetail } from "./CommitDetail.tsx";
import { SessionDetail } from "./SessionDetail.tsx";
import { TimelineView } from "./TimelineView.tsx";
import { useCombinedNavigation } from "./useCombinedNavigation.ts";
import { useTerminalDimensions } from "./useTerminalDimensions.ts";

interface CombinedAppProps {
  initialReport: CombinedWeeklyReport;
  initialHeatmapData: HeatmapData[];
  initialWeekOffset: number;
  buildReport: (weekOffset: number) => Promise<CombinedWeeklyReport>;
  buildHeatmapData: (weekOffset: number) => Promise<HeatmapData[]>;
  loadPrompts: (session: AgentSession) => Promise<string[]>;
  loadPrompt: (session: AgentSession, index: number) => Promise<string | null>;
}

export function CombinedApp({
  initialReport,
  initialHeatmapData,
  initialWeekOffset,
  buildReport,
  buildHeatmapData,
  loadPrompts,
  loadPrompt,
}: CombinedAppProps) {
  const { exit } = useApp();
  const [navState, navActions] = useCombinedNavigation();
  const [terminalWidth, terminalHeight] = useTerminalDimensions();
  const [weekOffset, setWeekOffset] = useState(initialWeekOffset);
  const [report, setReport] = useState(initialReport);
  const [heatmapData, setHeatmapData] = useState(initialHeatmapData);
  const [loading, setLoading] = useState(false);

  const selectableItems = getSelectableCombinedItems(report);

  const loadWeek = useCallback(
    async (offset: number) => {
      setLoading(true);
      try {
        const [newReport, newHeatmap] = await Promise.all([
          buildReport(offset),
          buildHeatmapData(offset),
        ]);
        setReport(newReport);
        setHeatmapData(newHeatmap);
        navActions.goBack();
      } finally {
        setLoading(false);
      }
    },
    [buildReport, buildHeatmapData, navActions]
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
        const newOffset = weekOffset + 1;
        setWeekOffset(newOffset);
        loadWeek(newOffset);
      } else if (key.rightArrow && weekOffset > 0) {
        const newOffset = weekOffset - 1;
        setWeekOffset(newOffset);
        loadWeek(newOffset);
      }
    } else if (
      navState.viewState.view !== "session-detail" &&
      (key.escape || (key.backspace && !input))
    ) {
      navActions.goBack();
    }
  });

  if (loading) {
    return (
      <Box>
        <Text>Loading week data...</Text>
      </Box>
    );
  }

  const { viewState } = navState;
  const currentProject =
    viewState.view === "week"
      ? undefined
      : report.projects.find(
          (project) => project.projectPath === viewState.projectPath
        );

  if (viewState.view === "timeline") {
    const { projectPath, date } = viewState;
    const day = currentProject?.days.get(date);

    if (currentProject && day) {
      return (
        <TimelineView
          project={currentProject}
          day={day}
          terminalWidth={terminalWidth}
          terminalHeight={terminalHeight}
          selectedIndex={navState.timelineIndex}
          setSelectedIndex={navActions.setTimelineIndex}
          onSelect={(entry) => {
            if (entry.kind === "commit") {
              navActions.selectCommit(projectPath, date, entry.commit.hash);
            } else {
              navActions.selectSession(projectPath, date, sessionKey(entry.session));
            }
          }}
        />
      );
    }

    navActions.goBack();
    return null;
  }

  if (viewState.view === "commit-detail") {
    const { commitHash } = viewState;

    // Only rows from a project with a repo can reach this view.
    if (currentProject?.repo) {
      return (
        <CommitDetail
          repo={currentProject.repo}
          commitHash={commitHash}
          terminalWidth={terminalWidth}
        />
      );
    }

    navActions.goBack();
    return null;
  }

  if (viewState.view === "session-detail") {
    const { date, sessionId } = viewState;
    const session = currentProject?.days
      .get(date)
      ?.sessions.find((candidate) => sessionKey(candidate) === sessionId);

    if (session) {
      return (
        <SessionDetail
          session={session}
          loadPrompts={loadPrompts}
          loadPrompt={loadPrompt}
          onBack={navActions.goBack}
          terminalWidth={terminalWidth}
          terminalHeight={terminalHeight}
        />
      );
    }

    navActions.goBack();
    return null;
  }

  return (
    <CombinedWeekView
      report={report}
      selectedIndex={navState.selectedIndex}
      onSetMaxIndex={navActions.setMaxIndex}
      heatmapData={heatmapData}
      weekOffset={weekOffset}
      terminalWidth={terminalWidth}
    />
  );
}
