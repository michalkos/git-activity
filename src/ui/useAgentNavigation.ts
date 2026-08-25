import { useState, useCallback } from "react";
import type { AgentViewState } from "../agents/types.ts";

interface NavigationState {
  viewState: AgentViewState;
  selectedIndex: number;
  maxIndex: number;
  sessionIndex: number;
}

interface NavigationActions {
  moveUp: () => void;
  moveDown: () => void;
  select: (projectPath: string, date: string) => void;
  selectSession: (projectPath: string, date: string, sessionId: string) => void;
  goBack: () => void;
  setMaxIndex: (max: number) => void;
  setSessionIndex: (index: number) => void;
}

export function useAgentNavigation(): [NavigationState, NavigationActions] {
  const [viewState, setViewState] = useState<AgentViewState>({ view: "week" });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [maxIndex, setMaxIndex] = useState(0);
  const [previousIndex, setPreviousIndex] = useState(0);
  const [sessionIndex, setSessionIndex] = useState(0);

  const moveUp = useCallback(() => {
    setSelectedIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const moveDown = useCallback(() => {
    setSelectedIndex((prev) => Math.min(maxIndex - 1, prev + 1));
  }, [maxIndex]);

  const select = useCallback(
    (projectPath: string, date: string) => {
      setPreviousIndex(selectedIndex);
      setSessionIndex(0);
      setViewState({ view: "sessions", projectPath, date });
    },
    [selectedIndex]
  );

  const selectSession = useCallback(
    (projectPath: string, date: string, sessionId: string) => {
      setViewState({ view: "session-detail", projectPath, date, sessionId });
    },
    []
  );

  const goBack = useCallback(() => {
    if (viewState.view === "session-detail") {
      const { projectPath, date } = viewState;
      setViewState({ view: "sessions", projectPath, date });
    } else {
      setViewState({ view: "week" });
      setSelectedIndex(previousIndex);
    }
  }, [viewState, previousIndex]);

  const updateMaxIndex = useCallback((max: number) => {
    setMaxIndex(max);
  }, []);

  return [
    { viewState, selectedIndex, maxIndex, sessionIndex },
    {
      moveUp,
      moveDown,
      select,
      selectSession,
      goBack,
      setMaxIndex: updateMaxIndex,
      setSessionIndex,
    },
  ];
}
