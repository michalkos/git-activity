import { sessionKey } from "../agents/session.ts";
import { Box, Text, useInput } from "ink";
import { format } from "date-fns";
import type { AgentDayActivity, AgentProjectActivity } from "../agents/types.ts";
import { shortModel, truncate } from "./format.ts";
import {
  daySummary,
  groupSessionsBySource,
  orderedSessions,
  scrollWindow,
  sessionColumnWidths,
  sessionHours,
  type SessionColumnWidths,
} from "./sessionRows.ts";

interface SessionListProps {
  project: AgentProjectActivity;
  day: AgentDayActivity;
  terminalWidth: number;
  terminalHeight: number;
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  onSelectSession: (sessionId: string) => void;
}

const FULL_HINT = "[↑↓] Navigate [Enter] Details [Esc] Back";
const SHORT_HINT = "[↑↓] [Enter] [Esc]";
/** Border, header, divider, column header, footer and scroll hints. */
const CHROME_LINES = 12;
/** A group costs its own header plus the blank line after it. */
const GROUP_LINES = 2;

export function SessionList({
  project,
  day,
  terminalWidth,
  terminalHeight,
  selectedIndex,
  setSelectedIndex,
  onSelectSession,
}: SessionListProps) {
  const groups = groupSessionsBySource(day.sessions);
  const ordered = orderedSessions(groups);
  const sessionCount = ordered.length;

  const contentWidth = Math.max(terminalWidth - 4, 40);
  const widths = sessionColumnWidths(contentWidth);
  const summary = daySummary(ordered);
  const overlapping = summary.rawHours - day.estimatedHours > 0.1;

  const hint = contentWidth >= 80 ? FULL_HINT : SHORT_HINT;
  const heading = truncate(
    `${project.projectName} — ${format(day.date, "EEEE, MMM d")}`,
    Math.max(contentWidth - hint.length - 2, 10)
  );

  const visibleRows = Math.max(
    terminalHeight - CHROME_LINES - GROUP_LINES * groups.length - (overlapping ? 1 : 0),
    3
  );
  const window = scrollWindow({
    total: sessionCount,
    selected: selectedIndex,
    visible: visibleRows,
  });

  useInput((_input, key) => {
    if (key.upArrow) {
      setSelectedIndex(Math.max(0, selectedIndex - 1));
    } else if (key.downArrow && sessionCount > 0) {
      setSelectedIndex(Math.min(sessionCount - 1, selectedIndex + 1));
    } else if (key.return && sessionCount > 0) {
      const selected = ordered[selectedIndex];
      if (selected) {
        onSelectSession(sessionKey(selected));
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
        {groups.map((group) => {
          const visible = group.items.filter(
            (item) => item.index >= window.start && item.index < window.end
          );
          if (visible.length === 0) {
            return null;
          }

          return (
            <Box key={group.source} flexDirection="column" marginBottom={1}>
              <Text bold color="cyan">
                {group.source} ({group.items.length})
              </Text>
              {visible.map(({ session, index }) => {
                const isSelected = index === selectedIndex;
                const color = isSelected ? "white" : undefined;
                const dim = !isSelected;
                const range = `${format(session.startedAt, "HH:mm")}-${format(session.endedAt, "HH:mm")}`;
                const counts = `${session.userTurns}/${session.toolCalls}`;

                return (
                  <Box
                    key={sessionKey(session)}
                    width={contentWidth}
                    backgroundColor={isSelected ? "blue" : undefined}
                  >
                    <Text color={color}>{isSelected ? "▸ " : "  "}</Text>
                    <Text color={color} dimColor={dim}>
                      {range.padEnd(widths.time)}{" "}
                    </Text>
                    <Text color={color} dimColor={dim}>
                      {`~${sessionHours(session)}h`.padStart(widths.duration)}{" "}
                    </Text>
                    <Text color={color}>
                      {truncate(session.title, widths.title).padEnd(widths.title)}
                    </Text>
                    {widths.model > 0 ? (
                      <Text color={color} dimColor={dim}>
                        {" "}
                        {truncate(shortModel(session.model), widths.model).padEnd(
                          widths.model
                        )}
                      </Text>
                    ) : null}
                    {widths.counts > 0 ? (
                      <Text color={color} dimColor={dim}>
                        {" "}
                        {truncate(counts, widths.counts).padStart(widths.counts)}
                      </Text>
                    ) : null}
                  </Box>
                );
              })}
            </Box>
          );
        })}
      </Box>

      {window.below > 0 ? <Text dimColor>{`  ↓ ${window.below} more`}</Text> : null}

      <Box marginTop={1} flexDirection="column">
        <Text wrap="truncate-end">
          Estimated: ~{day.estimatedHours}h
          {"  ·  "}
          {sessionCount} session{sessionCount === 1 ? "" : "s"}
          {"  ·  "}
          {summary.userTurns} user turns
          {"  ·  "}
          {summary.toolCalls} tool calls
        </Text>
        {overlapping ? (
          <Text dimColor wrap="truncate-end">
            Sessions overlap: ~{summary.rawHours}h before merging.
          </Text>
        ) : null}
      </Box>
    </Box>
  );
}

/** Labels the columns so the numeric ones need no glyphs to explain themselves. */
function columnHeader(widths: SessionColumnWidths): string {
  const parts = [
    " ".repeat(widths.marker),
    "time".padEnd(widths.time),
    " ",
    "hrs".padStart(widths.duration),
    " ",
    "session".padEnd(widths.title),
  ];
  if (widths.model > 0) {
    parts.push(" ", "model".padEnd(widths.model));
  }
  if (widths.counts > 0) {
    parts.push(" ", "turns/tools".padStart(widths.counts));
  }
  return parts.join("");
}
