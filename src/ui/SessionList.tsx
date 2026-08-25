import { Box, Text, useInput } from "ink";
import { format } from "date-fns";
import type { AgentDayActivity, AgentProjectActivity } from "../agents/types.ts";
import { intervalWithMinimum, roundHours } from "../agents/hours.ts";

interface SessionListProps {
  project: AgentProjectActivity;
  day: AgentDayActivity;
  terminalWidth: number;
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  onSelectSession: (sessionId: string) => void;
}

export function SessionList({
  project,
  day,
  terminalWidth,
  selectedIndex,
  setSelectedIndex,
  onSelectSession,
}: SessionListProps) {
  const dateStr = format(day.date, "EEEE, MMM d");
  const sessionCount = day.sessions.length;
  const dividerWidth = Math.max(terminalWidth - 4, 20);
  const titleMaxLength = Math.max(terminalWidth - 42, 16);

  useInput((_input, key) => {
    if (key.upArrow) {
      setSelectedIndex(Math.max(0, selectedIndex - 1));
    } else if (key.downArrow && sessionCount > 0) {
      setSelectedIndex(Math.min(sessionCount - 1, selectedIndex + 1));
    } else if (key.return && sessionCount > 0) {
      const selected = day.sessions[selectedIndex];
      if (selected) {
        onSelectSession(selected.id);
      }
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Box justifyContent="space-between">
        <Text bold>
          {project.projectName} - {dateStr}
        </Text>
        <Text dimColor>[↑↓] Navigate [Enter] Details [Esc] Back</Text>
      </Box>

      <Box marginY={1}>
        <Text dimColor>{"─".repeat(dividerWidth)}</Text>
      </Box>

      <Box flexDirection="column">
        {day.sessions.map((session, index) => {
          const isSelected = index === selectedIndex;
          const interval = intervalWithMinimum(session.startedAt, session.endedAt);
          const duration = roundHours(
            interval.end.getTime() - interval.start.getTime()
          );
          const range = `${format(session.startedAt, "HH:mm")}-${format(session.endedAt, "HH:mm")}`;
          const model = session.model ?? "—";
          const line = `${range.padEnd(12)} ${session.source.padEnd(16)} ${truncate(session.title, titleMaxLength).padEnd(titleMaxLength)} ${truncate(model, 12)}  ~${duration}h`;

          return (
            <Box key={session.id} backgroundColor={isSelected ? "blue" : undefined}>
              <Text color={isSelected ? "white" : undefined} dimColor={!isSelected}>
                {line}
              </Text>
            </Box>
          );
        })}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          Estimated: ~{day.estimatedHours}h ({sessionCount} session
          {sessionCount === 1 ? "" : "s"})
        </Text>
      </Box>
    </Box>
  );
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + "...";
}
