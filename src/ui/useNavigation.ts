import { useState, useCallback } from "react";
import type { ViewState } from "../types.ts";

interface NavigationState {
  viewState: ViewState;
  selectedIndex: number;
  maxIndex: number;
  commitIndex: number;
}

interface NavigationActions {
  moveUp: () => void;
  moveDown: () => void;
  select: (projectPath: string, date: string) => void;
  selectCommit: (projectPath: string, date: string, commitHash: string) => void;
  goBack: () => void;
  setMaxIndex: (max: number) => void;
  setCommitIndex: (index: number) => void;
}

export function useNavigation(): [NavigationState, NavigationActions] {
  const [viewState, setViewState] = useState<ViewState>({ view: "week" });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [maxIndex, setMaxIndex] = useState(0);
  const [previousIndex, setPreviousIndex] = useState(0);
  const [commitIndex, setCommitIndex] = useState(0);

  const moveUp = useCallback(() => {
    setSelectedIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const moveDown = useCallback(() => {
    setSelectedIndex((prev) => Math.min(maxIndex - 1, prev + 1));
  }, [maxIndex]);

  const select = useCallback((projectPath: string, date: string) => {
    setPreviousIndex(selectedIndex);
    setCommitIndex(0); // Reset commit index when entering commits view
    setViewState({ view: "commits", projectPath, date });
  }, [selectedIndex]);

  const selectCommit = useCallback((projectPath: string, date: string, commitHash: string) => {
    setViewState({ view: "commit-detail", projectPath, date, commitHash });
  }, []);

  const goBack = useCallback(() => {
    if (viewState.view === "commit-detail") {
      // Go back to commits view, preserve commit index
      const { projectPath, date } = viewState;
      setViewState({ view: "commits", projectPath, date });
    } else {
      // From commits view, go back to week view
      setViewState({ view: "week" });
      setSelectedIndex(previousIndex);
    }
  }, [viewState, previousIndex]);

  const updateMaxIndex = useCallback((max: number) => {
    setMaxIndex(max);
  }, []);

  return [
    { viewState, selectedIndex, maxIndex, commitIndex },
    {
      moveUp,
      moveDown,
      select,
      selectCommit,
      goBack,
      setMaxIndex: updateMaxIndex,
      setCommitIndex,
    },
  ];
}
