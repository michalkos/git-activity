import { Box, Text } from "ink";
import { useInput } from "ink";
import { format } from "date-fns";
import type { DayActivity, GitCommit, GitRepo } from "../types.ts";

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
  const groupedCommits = groupCommitsByBranch(day.commits);
  const orderedCommits = groupedCommits.flatMap((group) => group.items.map((item) => item.commit));
  const commitCount = orderedCommits.length;
  const dividerWidth = Math.max(terminalWidth - 4, 20);
  // Time takes ~7 chars ("HH:mm  "), box padding ~4, leave some buffer
  const messageMaxLength = Math.max(terminalWidth - 15, 30);

  useInput((_input, key) => {
    if (key.upArrow) {
      setSelectedIndex(Math.max(0, selectedIndex - 1));
    } else if (key.downArrow && commitCount > 0) {
      setSelectedIndex(Math.min(commitCount - 1, selectedIndex + 1));
    } else if (key.return && commitCount > 0) {
      const selectedCommit = orderedCommits[selectedIndex];
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
        {groupedCommits.map((group) => (
          <Box key={group.branch} flexDirection="column" marginBottom={1}>
            <Text bold color="cyan">
              {group.branch} ({group.items.length})
            </Text>
            {group.items.map(({ commit, index }) => {
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

interface BranchGroup {
  branch: string;
  items: Array<{ commit: GitCommit; index: number }>;
}

function groupCommitsByBranch(commits: GitCommit[]): BranchGroup[] {
  const commitsByBranch = new Map<string, GitCommit[]>();

  for (const commit of commits) {
    const key = commit.branch || "unknown";
    if (!commitsByBranch.has(key)) {
      commitsByBranch.set(key, []);
    }
    commitsByBranch.get(key)!.push(commit);
  }

  const sortedBranches = Array.from(commitsByBranch.keys()).sort((a, b) => {
    if (a === "unknown") return 1;
    if (b === "unknown") return -1;
    return a.localeCompare(b);
  });

  let displayIndex = 0;
  const groups: BranchGroup[] = [];

  for (const branch of sortedBranches) {
    const branchCommits = commitsByBranch.get(branch)!;
    groups.push({
      branch,
      items: branchCommits.map((commit) => ({
        commit,
        index: displayIndex++,
      })),
    });
  }

  return groups;
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + "...";
}
