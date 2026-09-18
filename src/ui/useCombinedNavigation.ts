import { useState, useCallback } from "react";
import type { CombinedViewState } from "../combined/types.ts";

interface NavigationState {
  viewState: CombinedViewState;
  selectedIndex: number;
  maxIndex: number;
  timelineIndex: number;
}

interface NavigationActions {
  moveUp: () => void;
  moveDown: () => void;
  select: (projectPath: string, date: string) => void;
  selectCommit: (projectPath: string, date: string, commitHash: string) => void;
  selectSession: (projectPath: string, date: string, sessionId: string) => void;
  goBack: () => void;
  setMaxIndex: (max: number) => void;
  setTimelineIndex: (index: number) => void;
}

/**
 * Week → timeline → detail, where a detail is a commit or a session depending on
 * the timeline row. Back from either detail returns to the same timeline row.
 */
export function useCombinedNavigation(): [NavigationState, NavigationActions] {
  const [viewState, setViewState] = useState<CombinedViewState>({ view: "week" });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [maxIndex, setMaxIndex] = useState(0);
  const [previousIndex, setPreviousIndex] = useState(0);
  const [timelineIndex, setTimelineIndex] = useState(0);

  const moveUp = useCallback(() => {
    setSelectedIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const moveDown = useCallback(() => {
    setSelectedIndex((prev) => Math.min(maxIndex - 1, prev + 1));
  }, [maxIndex]);

  const select = useCallback(
    (projectPath: string, date: string) => {
      setPreviousIndex(selectedIndex);
      setTimelineIndex(0);
      setViewState({ view: "timeline", projectPath, date });
    },
    [selectedIndex]
  );

  const selectCommit = useCallback(
    (projectPath: string, date: string, commitHash: string) => {
      setViewState({ view: "commit-detail", projectPath, date, commitHash });
    },
    []
  );

  const selectSession = useCallback(
    (projectPath: string, date: string, sessionId: string) => {
      setViewState({ view: "session-detail", projectPath, date, sessionId });
    },
    []
  );

  const goBack = useCallback(() => {
    if (viewState.view === "commit-detail" || viewState.view === "session-detail") {
      const { projectPath, date } = viewState;
      setViewState({ view: "timeline", projectPath, date });
    } else {
      setViewState({ view: "week" });
      setSelectedIndex(previousIndex);
    }
  }, [viewState, previousIndex]);

  const updateMaxIndex = useCallback((max: number) => {
    setMaxIndex(max);
  }, []);

  return [
    { viewState, selectedIndex, maxIndex, timelineIndex },
    {
      moveUp,
      moveDown,
      select,
      selectCommit,
      selectSession,
      goBack,
      setMaxIndex: updateMaxIndex,
      setTimelineIndex,
    },
  ];
}
