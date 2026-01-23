import React from "react";
import { Box, Text } from "ink";
import { format } from "date-fns";
import type { DayActivity, GitRepo } from "../types.ts";

interface CommitListProps {
  repo: GitRepo;
  day: DayActivity;
  terminalWidth: number;
}

export function CommitList({ repo, day, terminalWidth }: CommitListProps) {
  const dateStr = format(day.date, "EEEE, MMM d");
  const sessionCount = day.sessions.length;
  const dividerWidth = Math.max(terminalWidth - 4, 20);
  // Time takes ~7 chars ("HH:mm  "), box padding ~4, leave some buffer
  const messageMaxLength = Math.max(terminalWidth - 15, 30);

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      {/* Header */}
      <Box justifyContent="space-between">
        <Text bold>
          {repo.name} - {dateStr}
        </Text>
        <Text dimColor>[Esc] Back</Text>
      </Box>

      {/* Divider */}
      <Box marginY={1}>
        <Text dimColor>{"─".repeat(dividerWidth)}</Text>
      </Box>

      {/* Commit list */}
      <Box flexDirection="column">
        {day.commits.map((commit, index) => (
          <Box key={commit.hash}>
            <Text dimColor>{format(commit.date, "HH:mm")}</Text>
            <Text>{"  "}</Text>
            <Text>{truncate(commit.message, messageMaxLength)}</Text>
          </Box>
        ))}
      </Box>

      {/* Footer */}
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
