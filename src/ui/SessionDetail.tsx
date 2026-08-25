import { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { format } from "date-fns";
import type { AgentSession } from "../agents/types.ts";
import { intervalWithMinimum, roundHours } from "../agents/hours.ts";
import { shortenHome } from "../agents/paths.ts";

interface SessionDetailProps {
  session: AgentSession;
  loadPrompts: (session: AgentSession) => Promise<string[]>;
  terminalWidth: number;
}

export function SessionDetail({
  session,
  loadPrompts,
  terminalWidth,
}: SessionDetailProps) {
  const [prompts, setPrompts] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await loadPrompts(session);
        if (!cancelled) {
          setPrompts(result);
        }
      } catch {
        if (!cancelled) {
          setError("Failed to load user prompts");
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [session, loadPrompts]);

  const interval = intervalWithMinimum(session.startedAt, session.endedAt);
  const hours = roundHours(interval.end.getTime() - interval.start.getTime());
  const range = `${format(session.startedAt, "HH:mm")} – ${format(session.endedAt, "HH:mm")}`;

  return (
    <Box flexDirection="column" width={terminalWidth}>
      <Box borderStyle="single" paddingBottom={1} marginBottom={1}>
        <Text bold>[Esc] Back</Text>
      </Box>

      <Box>
        <Text bold color="cyan">
          {session.title}
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Source: </Text>
        <Text>{session.source}</Text>
      </Box>

      <Box>
        <Text dimColor>Project: </Text>
        <Text>
          {session.projectName} ({shortenHome(session.projectPath)})
        </Text>
      </Box>

      {session.model ? (
        <Box>
          <Text dimColor>Model: </Text>
          <Text>{session.model}</Text>
        </Box>
      ) : null}

      <Box>
        <Text dimColor>Duration: </Text>
        <Text>
          {range} (~{hours}h)
        </Text>
      </Box>

      <Box>
        <Text dimColor>Turns: </Text>
        <Text>
          {session.userTurns} user / {session.assistantTurns} assistant
        </Text>
      </Box>

      <Box>
        <Text dimColor>Tool calls: </Text>
        <Text>{session.toolCalls}</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold dimColor>
          User prompts:
        </Text>
        {error ? (
          <Text color="red">{error}</Text>
        ) : prompts === null ? (
          <Text dimColor>Loading...</Text>
        ) : prompts.length === 0 ? (
          <Text dimColor>No user prompts stored.</Text>
        ) : (
          prompts.map((prompt, index) => (
            <Box key={index} marginTop={index === 0 ? 1 : 0}>
              <Text>
                {index + 1}. {prompt}
              </Text>
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
}
