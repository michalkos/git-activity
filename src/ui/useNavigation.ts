import { useState, useCallback } from "react";
import type { ViewState } from "../types.ts";

interface NavigationState {
  viewState: ViewState;
  selectedIndex: number;
  maxIndex: number;
}

interface NavigationActions {
  moveUp: () => void;
  moveDown: () => void;
  select: (projectPath: string, date: string) => void;
  goBack: () => void;
  setMaxIndex: (max: number) => void;
}

export function useNavigation(): [NavigationState, NavigationActions] {
  const [viewState, setViewState] = useState<ViewState>({ view: "week" });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [maxIndex, setMaxIndex] = useState(0);
  const [previousIndex, setPreviousIndex] = useState(0);

  const moveUp = useCallback(() => {
    setSelectedIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const moveDown = useCallback(() => {
    setSelectedIndex((prev) => Math.min(maxIndex - 1, prev + 1));
  }, [maxIndex]);

  const select = useCallback((projectPath: string, date: string) => {
    setPreviousIndex(selectedIndex);
    setViewState({ view: "commits", projectPath, date });
  }, [selectedIndex]);

  const goBack = useCallback(() => {
    setViewState({ view: "week" });
    setSelectedIndex(previousIndex);
  }, [previousIndex]);

  const updateMaxIndex = useCallback((max: number) => {
    setMaxIndex(max);
  }, []);

  return [
    { viewState, selectedIndex, maxIndex },
    {
      moveUp,
      moveDown,
      select,
      goBack,
      setMaxIndex: updateMaxIndex,
    },
  ];
}
