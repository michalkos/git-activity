import { useEffect, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import { format } from "date-fns";
import type { AgentSession } from "../agents/types.ts";
import { shortenHome } from "../agents/paths.ts";
import { copyToClipboard } from "./clipboard.ts";
import { NO_MODEL, shortModel, truncate } from "./format.ts";
import { scrollWindow, sessionHours, wrapLines } from "./sessionRows.ts";

interface SessionDetailProps {
  session: AgentSession;
  loadPrompts: (session: AgentSession) => Promise<string[]>;
  loadPrompt: (session: AgentSession, index: number) => Promise<string | null>;
  onBack: () => void;
  terminalWidth: number;
  terminalHeight: number;
}

/** Header, metadata and hint lines above the prompt list. */
const CHROME_LINES = 12;
/** Header, label and scroll hints above the prompt reader. */
const READER_CHROME_LINES = 8;
/** Prompts are capped at two rendered lines so the viewport maths stay honest. */
const PROMPT_LINES = 2;

const LIST_HINT_FULL = "[↑↓] Navigate [Enter] Read [y] Copy [Esc] Back";
const LIST_HINT_SHORT = "[↑↓] [Enter] [y] [Esc]";
const READER_HINT_FULL = "[↑↓] Scroll [y] Copy [Esc] Back";
const READER_HINT_SHORT = "[↑↓] [y] [Esc]";

type ReaderState =
  | { index: number; status: "loading" }
  | { index: number; status: "error" }
  | { index: number; status: "ready"; text: string; scroll: number };

function promptLines(prompt: string, width: number): number {
  return Math.min(Math.max(Math.ceil(prompt.length / width), 1), PROMPT_LINES);
}

function withCopied(hint: string, copied: boolean): string {
  if (!copied) {
    return hint;
  }
  return hint.includes("Copy") ? hint.replace("Copy", "Copied") : `${hint} Copied`;
}

export function SessionDetail({
  session,
  loadPrompts,
  loadPrompt,
  onBack,
  terminalWidth,
  terminalHeight,
}: SessionDetailProps) {
  const [prompts, setPrompts] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [reader, setReader] = useState<ReaderState | null>(null);
  const [copied, setCopied] = useState(false);
  const cache = useRef(new Map<number, string>());
  const generation = useRef(0);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    generation.current += 1;
    cache.current.clear();
    setReader(null);
    setCopied(false);
    setPrompts(null);
    setError(null);
    setCursor(0);

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
      if (copyTimer.current) {
        clearTimeout(copyTimer.current);
      }
    };
  }, [session, loadPrompts, loadPrompt]);

  const promptCount = prompts?.length ?? 0;
  const contentWidth = Math.max(terminalWidth - 4, 40);
  const wide = contentWidth >= 80;

  const flashCopied = () => {
    setCopied(true);
    if (copyTimer.current) {
      clearTimeout(copyTimer.current);
    }
    copyTimer.current = setTimeout(() => setCopied(false), 1500);
  };

  const fullText = async (index: number): Promise<string | null> => {
    const cached = cache.current.get(index);
    if (cached !== undefined) {
      return cached;
    }
    const loaded = await loadPrompt(session, index);
    if (loaded !== null) {
      cache.current.set(index, loaded);
    }
    return loaded;
  };

  const openReader = async (index: number) => {
    const gen = ++generation.current;
    setReader({ index, status: "loading" });
    try {
      const text = await fullText(index);
      if (gen !== generation.current) {
        return;
      }
      if (text === null) {
        setReader({ index, status: "error" });
        return;
      }
      setReader({ index, status: "ready", text, scroll: 0 });
    } catch {
      if (gen !== generation.current) {
        return;
      }
      setReader({ index, status: "error" });
    }
  };

  const copySelected = async (index: number) => {
    try {
      const text = (await fullText(index)) ?? prompts?.[index];
      if (!text) {
        return;
      }
      await copyToClipboard(text);
      flashCopied();
    } catch {
      // Leave the list as-is; copy is best-effort.
    }
  };

  useInput((input, key) => {
    if (key.escape || (key.backspace && !input)) {
      if (reader) {
        generation.current += 1;
        setReader(null);
      } else {
        onBack();
      }
      return;
    }

    if (reader) {
      if (reader.status === "ready") {
        const textWidth = Math.max(contentWidth, 20);
        const lines = wrapLines(reader.text, textWidth);
        const visible = Math.max(terminalHeight - READER_CHROME_LINES, 1);
        const maxScroll = Math.max(0, lines.length - visible);
        if (key.upArrow) {
          setReader({
            ...reader,
            scroll: Math.max(0, reader.scroll - 1),
          });
        } else if (key.downArrow) {
          setReader({
            ...reader,
            scroll: Math.min(maxScroll, reader.scroll + 1),
          });
        } else if (input === "y" || input === "Y") {
          void copySelected(reader.index);
        }
      }
      return;
    }

    if (promptCount === 0) {
      return;
    }
    if (key.upArrow) {
      setCursor((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setCursor((prev) => Math.min(promptCount - 1, prev + 1));
    } else if (key.return) {
      void openReader(cursor);
    } else if (input === "y" || input === "Y") {
      void copySelected(cursor);
    }
  });

  if (reader) {
    return (
      <PromptReader
        session={session}
        reader={reader}
        promptCount={promptCount}
        copied={copied}
        terminalWidth={terminalWidth}
        terminalHeight={terminalHeight}
        contentWidth={contentWidth}
        hint={withCopied(wide ? READER_HINT_FULL : READER_HINT_SHORT, copied)}
      />
    );
  }

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
  const hint = withCopied(wide ? LIST_HINT_FULL : LIST_HINT_SHORT, copied);

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
        <Text dimColor>{hint}</Text>
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
          User prompts (full session){promptCount > 0 ? ` (${cursor + 1}/${promptCount})` : ""}:
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

function PromptReader({
  session,
  reader,
  promptCount,
  copied,
  terminalWidth,
  terminalHeight,
  contentWidth,
  hint,
}: {
  session: AgentSession;
  reader: ReaderState;
  promptCount: number;
  copied: boolean;
  terminalWidth: number;
  terminalHeight: number;
  contentWidth: number;
  hint: string;
}) {
  const textWidth = Math.max(contentWidth, 20);
  const visible = Math.max(terminalHeight - READER_CHROME_LINES, 1);
  const lines =
    reader.status === "ready" ? wrapLines(reader.text, textWidth) : [];
  const scroll = reader.status === "ready" ? reader.scroll : 0;
  const end = Math.min(scroll + visible, lines.length);
  const above = scroll;
  const below = Math.max(0, lines.length - end);

  return (
    <Box flexDirection="column" width={terminalWidth} paddingX={1}>
      <Box borderStyle="single" paddingX={1} justifyContent="space-between">
        <Text bold wrap="truncate-end">
          {session.title}
        </Text>
        <Text dimColor>{hint}</Text>
      </Box>

      <Box marginTop={1}>
        <Text bold dimColor>
          Prompt {reader.index + 1}
          {promptCount > 0 ? `/${promptCount}` : ""}
          {copied ? "  ·  copied" : ""}
        </Text>
      </Box>

      <Box marginTop={1} flexDirection="column" width={contentWidth}>
        {reader.status === "loading" ? (
          <Text dimColor>Loading...</Text>
        ) : reader.status === "error" ? (
          <Text color="red">Failed to load prompt</Text>
        ) : (
          <>
            {above > 0 ? <Text dimColor>{`↑ ${above} more`}</Text> : null}
            {lines.slice(scroll, end).map((line, offset) => (
              <Text key={scroll + offset}>{line.length > 0 ? line : " "}</Text>
            ))}
            {below > 0 ? <Text dimColor>{`↓ ${below} more`}</Text> : null}
          </>
        )}
      </Box>
    </Box>
  );
}
