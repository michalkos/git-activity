import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { createInterface } from "node:readline";
import { formatDateKey } from "../../time-estimator.ts";
import { expandHome, projectNameFromPath } from "../paths.ts";
import { warnAdapter } from "../log.ts";
import { countMatchingFiles, isDirectory } from "./fs.ts";
import type { AgentSource } from "./types.ts";
import type { AgentSession } from "../types.ts";

const TITLE_MAX = 80;
const PROMPT_MAX = 200;

interface ClaudeSourceOptions {
  projectsDir?: string;
  which?: (name: string) => string | null;
}

interface ClaudeEvent {
  type?: string;
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
  isMeta?: boolean;
  summary?: string;
  model?: string;
  message?: {
    role?: string;
    model?: string;
    content?: unknown;
  };
}

interface SessionMeta {
  session: AgentSession;
}

/**
 * Claude Code sessions.
 * Layout: ~/.claude/projects/<cwd-encoded>/*.jsonl
 * Each file is one session. Lines are events with type, timestamp, sessionId, cwd.
 */
export function createClaudeSource(
  options: ClaudeSourceOptions = {}
): AgentSource {
  const projectsDir =
    options.projectsDir ?? expandHome("~/.claude/projects");
  const whichBin = options.which ?? ((name: string) => Bun.which(name));

  return {
    id: "claude",
    label: "Claude Code",
    async detect() {
      const binary = whichBin("claude") ?? undefined;
      const hasDir = await isDirectory(projectsDir);
      const sessionCount = hasDir
        ? await countMatchingFiles(projectsDir, (name) => name.endsWith(".jsonl"))
        : 0;
      return {
        installed: Boolean(binary) || hasDir,
        dataDir: hasDir ? projectsDir : undefined,
        binary,
        sessionCount,
      };
    },
    async listSessions(from: Date, to: Date) {
      const files = await listSessionFiles(projectsDir);
      const sessions: AgentSession[] = [];

      for (const filePath of files) {
        try {
          if (await isOlderThan(filePath, from)) {
            continue;
          }
          const parsed = await parseSessionMeta(filePath);
          if (!parsed) {
            continue;
          }
          if (startedInRange(parsed.session, from, to)) {
            sessions.push(parsed.session);
          }
        } catch (error) {
          warnAdapter(
            "claude",
            `skipped unreadable ${filePath}${error instanceof Error ? `: ${error.message}` : ""}`
          );
        }
      }

      return sessions;
    },
    async getUserPrompts(session) {
      if (!session.sourceRef) {
        return [];
      }
      try {
        return await collectUserPrompts(session.sourceRef);
      } catch (error) {
        warnAdapter(
          "claude",
          `failed to read prompts for ${session.id}${error instanceof Error ? `: ${error.message}` : ""}`
        );
        return [];
      }
    },
  };
}

async function listSessionFiles(projectsDir: string): Promise<string[]> {
  const files: string[] = [];
  let projectDirs;
  try {
    projectDirs = await readdir(projectsDir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const project of projectDirs) {
    if (!project.isDirectory()) {
      continue;
    }
    const projectPath = join(projectsDir, project.name);
    let entries;
    try {
      entries = await readdir(projectPath, { withFileTypes: true });
    } catch (error) {
      warnAdapter(
        "claude",
        `skipped unreadable ${projectPath}${error instanceof Error ? `: ${error.message}` : ""}`
      );
      continue;
    }
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push(join(projectPath, entry.name));
      }
    }
  }

  return files;
}

async function isOlderThan(filePath: string, from: Date): Promise<boolean> {
  try {
    const info = await stat(filePath);
    return info.mtime.getTime() < from.getTime();
  } catch {
    return false;
  }
}

function startedInRange(session: AgentSession, from: Date, to: Date): boolean {
  const key = formatDateKey(session.startedAt);
  return key >= formatDateKey(from) && key <= formatDateKey(to);
}

async function parseSessionMeta(filePath: string): Promise<SessionMeta | null> {
  let sessionId: string | undefined;
  let cwd: string | undefined;
  let firstTimestamp: Date | undefined;
  let lastTimestamp: Date | undefined;
  let summaryTitle: string | undefined;
  let firstUserPrompt: string | undefined;
  let firstRealPrompt: string | undefined;
  let userTurns = 0;
  let assistantTurns = 0;
  let toolCalls = 0;
  let model: string | undefined;
  let malformed = false;

  for await (const event of readClaudeEvents(filePath, () => {
    malformed = true;
  })) {
    if (event.sessionId && !sessionId) {
      sessionId = event.sessionId;
    }
    if (event.cwd && !cwd) {
      cwd = event.cwd;
    }
    if (event.type === "summary" && typeof event.summary === "string" && event.summary.trim()) {
      summaryTitle ??= event.summary.trim();
    }

    const timestamp = parseTimestamp(event.timestamp);
    if (timestamp) {
      firstTimestamp ??= timestamp;
      lastTimestamp = timestamp;
    }

    if (event.type === "user") {
      const text = extractUserText(event);
      if (text) {
        userTurns += 1;
        firstUserPrompt ??= text;
        if (!isCommandWrapper(text)) {
          firstRealPrompt ??= text;
        }
      }
    } else if (event.type === "assistant") {
      assistantTurns += 1;
      toolCalls += countToolUses(event);
      model = event.message?.model || event.model || model;
    }
  }

  if (malformed) {
    warnAdapter("claude", `skipped malformed lines in ${filePath}`);
  }

  if (!firstTimestamp || !lastTimestamp) {
    return null;
  }

  const projectPath = cwd || "(unknown)";
  const title = truncate(
    summaryTitle || firstRealPrompt || firstUserPrompt || basename(filePath, ".jsonl"),
    TITLE_MAX
  );

  return {
    session: {
      id: sessionId || basename(filePath, ".jsonl"),
      source: "claude",
      title,
      projectPath,
      projectName: projectNameFromPath(projectPath),
      startedAt: firstTimestamp,
      endedAt: lastTimestamp,
      userTurns,
      assistantTurns,
      toolCalls,
      model,
      sourceRef: filePath,
    },
  };
}

async function collectUserPrompts(filePath: string): Promise<string[]> {
  const prompts: string[] = [];
  for await (const event of readClaudeEvents(filePath, () => {})) {
    if (event.type !== "user") {
      continue;
    }
    const text = extractUserText(event);
    if (text) {
      prompts.push(truncate(text, PROMPT_MAX));
    }
  }
  return prompts;
}

async function* readClaudeEvents(
  filePath: string,
  onMalformed: () => void
): AsyncGenerator<ClaudeEvent> {
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      try {
        yield JSON.parse(trimmed) as ClaudeEvent;
      } catch {
        onMalformed();
      }
    }
  } finally {
    rl.close();
  }
}

function parseTimestamp(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function extractUserText(event: ClaudeEvent): string | null {
  if (event.isMeta) {
    return null;
  }
  const content = event.message?.content;
  if (typeof content === "string") {
    const text = content.trim();
    return text.length > 0 ? text : null;
  }
  if (!Array.isArray(content)) {
    return null;
  }

  const texts: string[] = [];
  for (const part of content) {
    if (!part || typeof part !== "object") {
      continue;
    }
    const record = part as { type?: string; text?: string };
    if (record.type === "tool_result") {
      continue;
    }
    if (record.type === "text" && typeof record.text === "string") {
      texts.push(record.text);
    }
  }

  const text = texts.join("\n").trim();
  return text.length > 0 ? text : null;
}

function isCommandWrapper(text: string): boolean {
  return text.startsWith("<command-") || text.startsWith("<local-command-");
}

function countToolUses(event: ClaudeEvent): number {
  const content = event.message?.content;
  if (!Array.isArray(content)) {
    return 0;
  }
  let count = 0;
  for (const part of content) {
    if (part && typeof part === "object" && (part as { type?: string }).type === "tool_use") {
      count += 1;
    }
  }
  return count;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return value.slice(0, maxLength - 3) + "...";
}
