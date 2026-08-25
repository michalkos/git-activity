import { useState, useCallback } from "react";
import { Box, Text, useApp, useInput } from "ink";
import type { AgentSession, AgentWeeklyReport } from "../agents/types.ts";
import type { HeatmapData } from "../types.ts";
import { AgentWeekView, getSelectableAgentItems } from "./AgentWeekView.tsx";
import { SessionList } from "./SessionList.tsx";
import { SessionDetail } from "./SessionDetail.tsx";
import { useAgentNavigation } from "./useAgentNavigation.ts";
import { useTerminalDimensions } from "./useTerminalDimensions.ts";

interface AgentAppProps {
  initialReport: AgentWeeklyReport;
  initialHeatmapData: HeatmapData[];
  initialWeekOffset: number;
  noAgentsEnabled: boolean;
  buildReport: (weekOffset: number) => Promise<AgentWeeklyReport>;
  buildHeatmapData: (weekOffset: number) => Promise<HeatmapData[]>;
  loadPrompts: (session: AgentSession) => Promise<string[]>;
}

export function AgentApp({
  initialReport,
  initialHeatmapData,
  initialWeekOffset,
  noAgentsEnabled,
  buildReport,
  buildHeatmapData,
  loadPrompts,
}: AgentAppProps) {
  const { exit } = useApp();
  const [navState, navActions] = useAgentNavigation();
  const [terminalWidth] = useTerminalDimensions();
  const [weekOffset, setWeekOffset] = useState(initialWeekOffset);
  const [report, setReport] = useState(initialReport);
  const [heatmapData, setHeatmapData] = useState(initialHeatmapData);
  const [loading, setLoading] = useState(false);

  const selectableItems = getSelectableAgentItems(report);

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
      } else if (key.rightArrow) {
        if (weekOffset > 0) {
          const newOffset = weekOffset - 1;
          setWeekOffset(newOffset);
          loadWeek(newOffset);
        }
      }
    } else if (
      navState.viewState.view === "sessions" ||
      navState.viewState.view === "session-detail"
    ) {
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

  if (navState.viewState.view === "sessions") {
    const { projectPath, date } = navState.viewState;
    const project = report.projects.find((p) => p.projectPath === projectPath);
    const day = project?.days.get(date);

    if (project && day) {
      return (
        <SessionList
          project={project}
          day={day}
          terminalWidth={terminalWidth}
          selectedIndex={navState.sessionIndex}
          setSelectedIndex={navActions.setSessionIndex}
          onSelectSession={(sessionId) =>
            navActions.selectSession(projectPath, date, sessionId)
          }
        />
      );
    }

    navActions.goBack();
    return null;
  }

  if (navState.viewState.view === "session-detail") {
    const { projectPath, date, sessionId } = navState.viewState;
    const project = report.projects.find((p) => p.projectPath === projectPath);
    const session = project?.days.get(date)?.sessions.find((s) => s.id === sessionId);

    if (session) {
      return (
        <SessionDetail
          session={session}
          loadPrompts={loadPrompts}
          terminalWidth={terminalWidth}
        />
      );
    }

    navActions.goBack();
    return null;
  }

  return (
    <AgentWeekView
      report={report}
      selectedIndex={navState.selectedIndex}
      onSetMaxIndex={navActions.setMaxIndex}
      heatmapData={heatmapData}
      weekOffset={weekOffset}
      terminalWidth={terminalWidth}
      noAgentsEnabled={noAgentsEnabled}
    />
  );
}
