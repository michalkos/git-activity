import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { warnAdapter } from "../log.ts";
import { expandHome, projectNameFromPath } from "../paths.ts";
import {
  isWrappedPrompt,
  parseTimestamp,
  PROMPT_MAX,
  readJsonLines,
  startedInRange,
  titleFrom,
  truncate,
} from "./common.ts";
import { countMatchingFiles, isDirectory } from "./fs.ts";
import type { AgentSource } from "./types.ts";
import type { AgentSession } from "../types.ts";

/**
 * Codex CLI / Desktop sessions.
 * Layout: ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl — the date shards make range
 * scans cheap, so only the days in range are opened.
 * Lines are { timestamp, type, payload }: `session_meta` carries session_id + cwd,
 * `turn_context` the model, `event_msg` the user/assistant turns, `response_item`
 * the tool calls.
 * Titles come from ~/.codex/session_index.jsonl (id -> thread_name) when present.
 */

interface CodexContentPart {
  type?: string;
  text?: string;
}

interface CodexLine {
  timestamp?: string;
  type?: string;
  payload?: {
    type?: string;
    session_id?: string;
    id?: string;
    cwd?: string;
    model?: string;
    message?: string;
    role?: string;
    content?: CodexContentPart[];
  };
}

interface CodexIndexEntry {
  id?: string;
  thread_name?: string;
}

interface CodexSourceOptions {
  codexHome?: string;
  which?: (name: string) => string | null;
}

/** Rollout directories are named for the local day; widen by one to absorb TZ skew. */
const DAY_MS = 24 * 60 * 60 * 1000;

export function createCodexSource(options: CodexSourceOptions = {}): AgentSource {
  const codexHome = options.codexHome ?? expandHome("~/.codex");
  const sessionsDir = join(codexHome, "sessions");
  const indexPath = join(codexHome, "session_index.jsonl");
  const whichBin = options.which ?? ((name: string) => Bun.which(name));

  return {
    id: "codex",
    label: "Codex",
    async detect() {
      const binary = whichBin("codex") ?? undefined;
      const hasDir = await isDirectory(sessionsDir);
      const sessionCount = hasDir
        ? await countMatchingFiles(sessionsDir, (name) => name.endsWith(".jsonl"))
        : 0;
      return {
        installed: Boolean(binary) || hasDir,
        dataDir: hasDir ? sessionsDir : undefined,
        binary,
        sessionCount,
      };
    },
    async listSessions(from, to) {
      const names = await loadThreadNames(indexPath);
      const sessions: AgentSession[] = [];

      for (const filePath of await listRolloutFiles(sessionsDir, from, to)) {
        try {
          const session = await parseSession(filePath, names);
          if (session && startedInRange(session.startedAt, from, to)) {
            sessions.push(session);
          }
        } catch (error) {
          warnAdapter("codex", `skipped unreadable ${filePath}${reason(error)}`);
        }
      }

      return sessions;
    },
    async getUserPrompts(session) {
      if (!session.sourceRef) {
        return [];
      }
      try {
        const prompts: string[] = [];
        for await (const line of readJsonLines<CodexLine>(session.sourceRef)) {
          const text = userMessage(line);
          if (text) {
            prompts.push(truncate(text, PROMPT_MAX));
          }
        }
        return prompts;
      } catch (error) {
        warnAdapter("codex", `failed to read prompts for ${session.id}${reason(error)}`);
        return [];
      }
    },
  };
}

async function loadThreadNames(indexPath: string): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  try {
    for await (const entry of readJsonLines<CodexIndexEntry>(indexPath)) {
      if (entry.id && entry.thread_name) {
        names.set(entry.id, entry.thread_name);
      }
    }
  } catch {
    // No index yet: fall back to first prompts for titles.
  }
  return names;
}

/** Walks the YYYY/MM/DD shards and keeps only the days overlapping the range. */
async function listRolloutFiles(
  sessionsDir: string,
  from: Date,
  to: Date
): Promise<string[]> {
  const lower = new Date(from.getTime() - DAY_MS);
  const upper = new Date(to.getTime() + DAY_MS);
  const files: string[] = [];

  for (const year of await numericEntries(sessionsDir)) {
    for (const month of await numericEntries(join(sessionsDir, year))) {
      for (const day of await numericEntries(join(sessionsDir, year, month))) {
        const shard = new Date(
          Number(year),
          Number(month) - 1,
          Number(day)
        );
        if (Number.isNaN(shard.getTime()) || shard < lower || shard > upper) {
          continue;
        }
        const dir = join(sessionsDir, year, month, day);
        let entries;
        try {
          entries = await readdir(dir, { withFileTypes: true });
        } catch (error) {
          warnAdapter("codex", `skipped unreadable ${dir}${reason(error)}`);
          continue;
        }
        for (const entry of entries) {
          if (entry.isFile() && entry.name.endsWith(".jsonl")) {
            files.push(join(dir, entry.name));
          }
        }
      }
    }
  }

  return files;
}

async function numericEntries(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

async function parseSession(
  filePath: string,
  names: Map<string, string>
): Promise<AgentSession | null> {
  let sessionId: string | undefined;
  let cwd: string | undefined;
  let firstTimestamp: Date | undefined;
  let lastTimestamp: Date | undefined;
  let firstPrompt: string | undefined;
  let firstRealPrompt: string | undefined;
  let firstItemPrompt: string | undefined;
  let userTurns = 0;
  let assistantTurns = 0;
  let toolCalls = 0;
  let model: string | undefined;
  let malformed = false;

  for await (const line of readJsonLines<CodexLine>(filePath, () => {
    malformed = true;
  })) {
    const timestamp = parseTimestamp(line.timestamp);
    if (timestamp) {
      firstTimestamp ??= timestamp;
      lastTimestamp = timestamp;
    }

    const payload = line.payload;
    if (!payload) {
      continue;
    }

    if (line.type === "session_meta") {
      sessionId ??= payload.session_id || payload.id;
      cwd ??= payload.cwd;
      continue;
    }
    if (line.type === "turn_context") {
      model = payload.model || model;
      cwd ??= payload.cwd;
      continue;
    }
    if (line.type === "event_msg") {
      if (payload.type === "user_message") {
        const text = userMessage(line);
        if (text) {
          userTurns += 1;
          firstPrompt ??= text;
          if (!isWrappedPrompt(text)) {
            firstRealPrompt ??= text;
          }
        }
      } else if (payload.type === "agent_message") {
        assistantTurns += 1;
      }
      continue;
    }
    if (line.type === "response_item") {
      if (isToolCall(payload.type)) {
        toolCalls += 1;
      } else if (payload.type === "message" && payload.role === "user") {
        // Compacted or resumed rollouts can lack `user_message` events entirely;
        // the replayed transcript is then the only source of a usable title.
        const text = inputText(payload.content);
        if (text && !isWrappedPrompt(text)) {
          firstItemPrompt ??= text;
        }
      }
    }
  }

  if (malformed) {
    warnAdapter("codex", `skipped malformed lines in ${filePath}`);
  }
  if (!firstTimestamp || !lastTimestamp) {
    return null;
  }

  const id = sessionId || basenameId(filePath);
  const projectPath = cwd || "(unknown)";
  return {
    id,
    source: "codex",
    title: titleFrom(
      names.get(id) ||
        firstRealPrompt ||
        firstPrompt ||
        firstItemPrompt ||
        basenameId(filePath)
    ),
    projectPath,
    projectName: projectNameFromPath(projectPath),
    startedAt: firstTimestamp,
    endedAt: lastTimestamp,
    userTurns,
    assistantTurns,
    toolCalls,
    model,
    sourceRef: filePath,
  };
}

function isToolCall(payloadType: string | undefined): boolean {
  return (
    payloadType === "function_call" ||
    payloadType === "custom_tool_call" ||
    payloadType === "local_shell_call"
  );
}

/** Prompts the user actually typed; the `response_item` copies repeat them with IDE context. */
function userMessage(line: CodexLine): string | null {
  if (line.type !== "event_msg" || line.payload?.type !== "user_message") {
    return null;
  }
  const message = line.payload.message;
  return typeof message === "string" ? message.trim() || null : null;
}

function inputText(content: CodexContentPart[] | undefined): string | null {
  if (!Array.isArray(content)) {
    return null;
  }
  const text = content
    .filter((part) => part?.type === "input_text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim();
  return text || null;
}

/** rollout-2026-08-14T09-19-12-<uuid>.jsonl -> <uuid> */
function basenameId(filePath: string): string {
  const name = filePath.split(/[/\\]/).at(-1) ?? filePath;
  const match = name.match(
    /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
  );
  return match?.[1] ?? name.replace(/\.jsonl$/, "");
}

function reason(error: unknown): string {
  return error instanceof Error ? `: ${error.message}` : "";
}
