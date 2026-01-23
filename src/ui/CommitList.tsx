import { Box, Text } from "ink";
import { useInput } from "ink";
import { format } from "date-fns";
import type { DayActivity, GitRepo } from "../types.ts";

interface CommitListProps {
  repo: GitRepo;
  day: DayActivity;
  terminalWidth: number;
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  onSelectCommit: (commitHash: string) => void;
}

export function CommitList({ repo, day, terminalWidth, selectedIndex, setSelectedIndex, onSelectCommit }: CommitListProps) {

  const dateStr = format(day.date, "EEEE, MMM d");
  const sessionCount = day.sessions.length;
  const dividerWidth = Math.max(terminalWidth - 4, 20);
  // Time takes ~7 chars ("HH:mm  "), box padding ~4, leave some buffer
  const messageMaxLength = Math.max(terminalWidth - 15, 30);

  useInput((_input, key) => {
    if (key.upArrow) {
      setSelectedIndex(Math.max(0, selectedIndex - 1));
    } else if (key.downArrow) {
      setSelectedIndex(Math.min(day.commits.length - 1, selectedIndex + 1));
    } else if (key.return && day.commits.length > 0) {
      const selectedCommit = day.commits[selectedIndex];
      if (selectedCommit) {
        onSelectCommit(selectedCommit.hash);
      }
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      {/* Header */}
      <Box justifyContent="space-between">
        <Text bold>
          {repo.name} - {dateStr}
        </Text>
        <Text dimColor>[↑↓] Navigate [Enter] Details [Esc] Back</Text>
      </Box>

      {/* Divider */}
      <Box marginY={1}>
        <Text dimColor>{"─".repeat(dividerWidth)}</Text>
      </Box>

      {/* Commit list */}
      <Box flexDirection="column">
        {day.commits.map((commit, index) => {
          const isSelected = index === selectedIndex;
          return (
            <Box key={commit.hash} backgroundColor={isSelected ? "blue" : undefined}>
              <Text dimColor={isSelected ? false : true}>
                {format(commit.date, "HH:mm")}
              </Text>
              <Text>{"  "}</Text>
              <Text color={isSelected ? "white" : undefined}>
                {truncate(commit.message, messageMaxLength)}
              </Text>
            </Box>
          );
        })}
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
