import { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { format } from "date-fns";
import type { AgentSession } from "../agents/types.ts";
import { shortenHome } from "../agents/paths.ts";
import { NO_MODEL, shortModel, truncate } from "./format.ts";
import { scrollWindow, sessionHours } from "./sessionRows.ts";

interface SessionDetailProps {
  session: AgentSession;
  loadPrompts: (session: AgentSession) => Promise<string[]>;
  terminalWidth: number;
  terminalHeight: number;
}

/** Header, metadata and hint lines above the prompt list. */
const CHROME_LINES = 12;
/** Prompts are capped at two rendered lines so the viewport maths stay honest. */
const PROMPT_LINES = 2;

function promptLines(prompt: string, width: number): number {
  return Math.min(Math.max(Math.ceil(prompt.length / width), 1), PROMPT_LINES);
}

export function SessionDetail({
  session,
  loadPrompts,
  terminalWidth,
  terminalHeight,
}: SessionDetailProps) {
  const [prompts, setPrompts] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await loadPrompts(session);
        if (!cancelled) {
          setPrompts(result);
          setCursor(0);
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

  const promptCount = prompts?.length ?? 0;

  useInput((_input, key) => {
    if (promptCount === 0) return;
    if (key.upArrow) {
      setCursor((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setCursor((prev) => Math.min(promptCount - 1, prev + 1));
    }
  });

  const contentWidth = Math.max(terminalWidth - 4, 40);
  const hours = sessionHours(session);
  const range = `${format(session.startedAt, "HH:mm")}–${format(session.endedAt, "HH:mm")}`;
  const model = shortModel(session.model);
  // "▸ 12. " — wide enough that wrapped lines hang under the prompt text.
  const labelWidth = 4 + String(Math.max(promptCount, 1)).length;
  const meta = [
    session.source,
    model === NO_MODEL ? null : model,
    `${range} (~${hours}h)`,
  ]
    .filter(Boolean)
    .join("  ·  ");

  // How many prompts fit: budget the tallest prompt in the list, so the frame
  // never overflows, but give a list of one-liners the room it deserves.
  const textWidth = Math.max(contentWidth - labelWidth, 20);
  const tallest = (prompts ?? []).reduce(
    (max, prompt) => Math.max(max, promptLines(prompt, textWidth)),
    1
  );
  const visiblePrompts = Math.max(
    Math.floor((terminalHeight - CHROME_LINES) / tallest),
    1
  );
  const window = scrollWindow({
    total: promptCount,
    selected: cursor,
    visible: visiblePrompts,
  });

  return (
    <Box flexDirection="column" width={terminalWidth} paddingX={1}>
      <Box borderStyle="single" paddingX={1} justifyContent="space-between">
        <Text bold wrap="truncate-end">
          {session.title}
        </Text>
        <Text dimColor>[↑↓] Scroll [Esc] Back</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor wrap="truncate-end">
          {meta}
        </Text>
      </Box>

      <Box>
        <Text dimColor wrap="truncate-end">
          {session.userTurns} user / {session.assistantTurns} assistant turns
          {"  ·  "}
          {session.toolCalls} tool calls
        </Text>
      </Box>

      <Box>
        <Text dimColor wrap="truncate-end">
          {session.projectName} ({shortenHome(session.projectPath)})
        </Text>
      </Box>

      <Box marginTop={1} flexDirection="column" width={contentWidth}>
        <Text bold dimColor>
          User prompts{promptCount > 0 ? ` (${cursor + 1}/${promptCount})` : ""}:
        </Text>

        {error ? (
          <Text color="red">{error}</Text>
        ) : prompts === null ? (
          <Text dimColor>Loading...</Text>
        ) : promptCount === 0 ? (
          <Text dimColor>No user prompts stored.</Text>
        ) : (
          <>
            {window.above > 0 ? (
              <Text dimColor>{`↑ ${window.above} more`}</Text>
            ) : null}
            {prompts.slice(window.start, window.end).map((prompt, offset) => {
              const index = window.start + offset;
              const isCurrent = index === cursor;
              const label = `${isCurrent ? "▸" : " "} ${index + 1}.`.padEnd(
                labelWidth
              );
              return (
                <Box key={index} marginTop={offset === 0 ? 1 : 0}>
                  <Text color={isCurrent ? "cyan" : undefined}>{label}</Text>
                  <Box width={textWidth}>
                    <Text color={isCurrent ? "cyan" : undefined}>
                      {truncate(prompt, textWidth * PROMPT_LINES)}
                    </Text>
                  </Box>
                </Box>
              );
            })}
            {window.below > 0 ? (
              <Text dimColor>{`↓ ${window.below} more`}</Text>
            ) : null}
          </>
        )}
      </Box>
    </Box>
  );
}
