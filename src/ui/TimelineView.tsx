import { Box, Text } from "ink";
import { useInput } from "ink";
import { format } from "date-fns";
import { timelineEntries } from "../combined/report.ts";
import type { CombinedDayActivity, CombinedProjectActivity, TimelineEntry } from "../combined/types.ts";
import { truncate } from "./format.ts";
import { scrollWindow } from "./sessionRows.ts";
import {
  timelineCells,
  timelineColumnWidths,
  timelineKey,
  type TimelineColumnWidths,
} from "./timelineRows.ts";

interface TimelineViewProps {
  project: CombinedProjectActivity;
  day: CombinedDayActivity;
  terminalWidth: number;
  terminalHeight: number;
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  onSelect: (entry: TimelineEntry) => void;
}

const FULL_HINT = "[↑↓] Navigate [Enter] Details [Esc] Back";
const SHORT_HINT = "[↑↓] [Enter] [Esc]";
/** Border, header, divider, column header, footer and scroll hints. */
const CHROME_LINES = 11;

/**
 * One project's day as a single chronological list of commits and agent
 * sessions, so it reads as what actually happened rather than two reports.
 */
export function TimelineView({
  project,
  day,
  terminalWidth,
  terminalHeight,
  selectedIndex,
  setSelectedIndex,
  onSelect,
}: TimelineViewProps) {
  const entries = timelineEntries(day);
  const contentWidth = Math.max(terminalWidth - 4, 40);
  const widths = timelineColumnWidths(contentWidth);
  const overlap = day.gitHours + day.agentHours - day.estimatedHours > 0.1;

  const hint = contentWidth >= 80 ? FULL_HINT : SHORT_HINT;
  const heading = truncate(
    `${project.projectName} — ${format(day.date, "EEEE, MMM d")}`,
    Math.max(contentWidth - hint.length - 2, 10)
  );

  const visibleRows = Math.max(
    terminalHeight - CHROME_LINES - (overlap ? 1 : 0),
    3
  );
  const window = scrollWindow({
    total: entries.length,
    selected: selectedIndex,
    visible: visibleRows,
  });

  useInput((_input, key) => {
    if (key.upArrow) {
      setSelectedIndex(Math.max(0, selectedIndex - 1));
    } else if (key.downArrow && entries.length > 0) {
      setSelectedIndex(Math.min(entries.length - 1, selectedIndex + 1));
    } else if (key.return && entries.length > 0) {
      const selected = entries[selectedIndex];
      if (selected) {
        onSelect(selected);
      }
    }
  });

  return (
    <Box
      flexDirection="column"
      width={terminalWidth}
      borderStyle="round"
      paddingX={1}
    >
      <Box justifyContent="space-between">
        <Text bold>{heading}</Text>
        <Text dimColor>{hint}</Text>
      </Box>

      <Box marginY={1} flexDirection="column">
        <Text dimColor>{columnHeader(widths)}</Text>
        <Text dimColor>{"─".repeat(contentWidth)}</Text>
      </Box>

      {window.above > 0 ? <Text dimColor>{`  ↑ ${window.above} more`}</Text> : null}

      <Box flexDirection="column">
        {entries.slice(window.start, window.end).map((entry, offset) => {
          const index = window.start + offset;
          const isSelected = index === selectedIndex;
          const color = isSelected ? "white" : undefined;
          const cells = timelineCells(entry);

          return (
            <Box
              key={timelineKey(entry)}
              width={contentWidth}
              backgroundColor={isSelected ? "blue" : undefined}
            >
              <Text color={color}>{isSelected ? "▸ " : "  "}</Text>
              <Text color={color} dimColor={!isSelected}>
                {cells.time.padEnd(widths.time)}{" "}
              </Text>
              <Text color={isSelected ? "white" : entry.kind === "commit" ? "green" : "cyan"}>
                {truncate(cells.kind, widths.kind).padEnd(widths.kind)}{" "}
              </Text>
              <Text color={color}>
                {truncate(cells.title, widths.title).padEnd(widths.title)}
              </Text>
              {widths.meta > 0 ? (
                <Text color={color} dimColor={!isSelected}>
                  {" "}
                  {truncate(cells.meta, widths.meta).padStart(widths.meta)}
                </Text>
              ) : null}
            </Box>
          );
        })}
      </Box>

      {window.below > 0 ? <Text dimColor>{`  ↓ ${window.below} more`}</Text> : null}

      <Box marginTop={1} flexDirection="column">
        <Text wrap="truncate-end">
          Estimated: ~{day.estimatedHours}h
          {"  ·  "}
          {day.commits.length} commit{day.commits.length === 1 ? "" : "s"}
          {"  ·  "}
          {day.sessions.length} session{day.sessions.length === 1 ? "" : "s"}
          {day.sources.length > 0 ? `  ·  [${day.sources.join(", ")}]` : ""}
        </Text>
        {overlap ? (
          <Text dimColor wrap="truncate-end">
            Git ~{day.gitHours}h and agents ~{day.agentHours}h overlap; shared time counted once.
          </Text>
        ) : null}
      </Box>
    </Box>
  );
}

/** Labels the columns so the numeric ones need no glyphs to explain themselves. */
function columnHeader(widths: TimelineColumnWidths): string {
  const parts = [
    " ".repeat(widths.marker),
    "time".padEnd(widths.time),
    " ",
    "source".padEnd(widths.kind),
    " ",
    "what".padEnd(widths.title),
  ];
  if (widths.meta > 0) {
    parts.push(" ", "hrs/sha".padStart(widths.meta));
  }
  return parts.join("");
}
