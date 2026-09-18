import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { warnAdapter } from "../log.ts";
import { expandHome, projectNameFromPath } from "../paths.ts";
import {
  collectUserTexts,
  isUntouchedSince,
  isWrappedPrompt,
  nthUserText,
  parseTimestamp,
  PROMPT_MAX,
  readJsonLines,
  overlapsRange,
  DailyActivity,
  titleFrom,
} from "./common.ts";
import { countMatchingFiles, isDirectory } from "./fs.ts";
import type { AgentSource } from "./types.ts";
import type { AgentSession } from "../types.ts";

/**
 * Pi coding agent sessions.
 * Layout: ~/.pi/agent/sessions/--<cwd-with-slashes-as-dashes>--/<timestamp>_<uuid>.jsonl
 * Header line: { type: "session", cwd, timestamp, id }, so cwd never needs decoding
 * from the directory name. Later entries: `message` (role/content/timestamp),
 * `model_change` (modelId), `session_info` (display name).
 * Overrides: PI_CODING_AGENT_SESSION_DIR, PI_CODING_AGENT_DIR.
 */

interface PiContentPart {
  type?: string;
  text?: string;
}

interface PiEvent {
  type?: string;
  timestamp?: string;
  cwd?: string;
  id?: string;
  name?: string;
  title?: string;
  modelId?: string;
  message?: {
    role?: string;
    content?: PiContentPart[] | string;
  };
}

interface PiSourceOptions {
  sessionsDir?: string;
  which?: (name: string) => string | null;
}

export function createPiSource(options: PiSourceOptions = {}): AgentSource {
  const sessionsDir = options.sessionsDir ?? resolvePiSessionsDir();
  const whichBin = options.which ?? ((name: string) => Bun.which(name));

  return {
    id: "pi",
    label: "Pi",
    async detect() {
      const binary = whichBin("pi") ?? undefined;
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
      const sessions: AgentSession[] = [];

      for (const filePath of await listSessionFiles(sessionsDir)) {
        try {
          if (await isUntouchedSince(filePath, from)) {
            continue;
          }
          const session = await parseSession(filePath);
          if (session && overlapsRange(session.startedAt, session.endedAt, from, to)) {
            sessions.push(session);
          }
        } catch (error) {
          warnAdapter("pi", `skipped unreadable ${filePath}${reason(error)}`);
        }
      }

      return sessions;
    },
    async getUserPrompts(session) {
      if (!session.sourceRef) {
        return [];
      }
      try {
        return await collectUserTexts(session.sourceRef, userText, PROMPT_MAX);
      } catch (error) {
        warnAdapter("pi", `failed to read prompts for ${session.id}${reason(error)}`);
        return [];
      }
    },
    async getUserPrompt(session, index) {
      if (!session.sourceRef) {
        return null;
      }
      try {
        return await nthUserText(session.sourceRef, userText, index);
      } catch (error) {
        warnAdapter("pi", `failed to read prompt ${index} for ${session.id}${reason(error)}`);
        return null;
      }
    },
  };
}

function resolvePiSessionsDir(): string {
  if (process.env.PI_CODING_AGENT_SESSION_DIR) {
    return expandHome(process.env.PI_CODING_AGENT_SESSION_DIR);
  }
  const root = process.env.PI_CODING_AGENT_DIR
    ? expandHome(process.env.PI_CODING_AGENT_DIR)
    : expandHome("~/.pi");
  return join(root, "agent", "sessions");
}

async function listSessionFiles(sessionsDir: string): Promise<string[]> {
  const files: string[] = [];
  let projects;
  try {
    projects = await readdir(sessionsDir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const project of projects) {
    if (!project.isDirectory()) {
      continue;
    }
    const projectDir = join(sessionsDir, project.name);
    let entries;
    try {
      entries = await readdir(projectDir, { withFileTypes: true });
    } catch (error) {
      warnAdapter("pi", `skipped unreadable ${projectDir}${reason(error)}`);
      continue;
    }
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push(join(projectDir, entry.name));
      }
    }
  }

  return files;
}

async function parseSession(filePath: string): Promise<AgentSession | null> {
  let sessionId: string | undefined;
  let cwd: string | undefined;
  let displayName: string | undefined;
  let firstTimestamp: Date | undefined;
  let lastTimestamp: Date | undefined;
  let firstPrompt: string | undefined;
  let firstRealPrompt: string | undefined;
  let userTurns = 0;
  let assistantTurns = 0;
  let toolCalls = 0;
  let model: string | undefined;
  let malformed = false;
  const activity = new DailyActivity();

  for await (const event of readJsonLines<PiEvent>(filePath, () => {
    malformed = true;
  })) {
    const timestamp = parseTimestamp(event.timestamp);
    activity.add(timestamp);
    if (timestamp) {
      firstTimestamp ??= timestamp;
      lastTimestamp = timestamp;
    }

    if (event.type === "session") {
      sessionId ??= event.id;
      cwd ??= event.cwd;
      continue;
    }
    if (event.type === "session_info") {
      displayName ??= event.name || event.title;
      continue;
    }
    if (event.type === "model_change" && event.modelId) {
      model = event.modelId;
      continue;
    }
    if (event.type !== "message") {
      continue;
    }

    if (event.message?.role === "user") {
      const text = userText(event);
      if (text) {
        userTurns += 1;
        activity.add(timestamp, { userTurns: 1 });
        firstPrompt ??= text;
        if (!isWrappedPrompt(text)) {
          firstRealPrompt ??= text;
        }
      }
    } else if (event.message?.role === "assistant") {
      assistantTurns += 1;
      activity.add(timestamp, { assistantTurns: 1 });
      const tools = countToolUses(event);
      toolCalls += tools;
      activity.add(timestamp, { toolCalls: tools });
    }
  }

  if (malformed) {
    warnAdapter("pi", `skipped malformed lines in ${filePath}`);
  }
  if (!firstTimestamp || !lastTimestamp) {
    return null;
  }

  const projectPath = cwd || "(unknown)";
  return {
    id: sessionId || basename(filePath, ".jsonl"),
    source: "pi",
    title: titleFrom(
      displayName || firstRealPrompt || firstPrompt || basename(filePath, ".jsonl")
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
    activity: activity.values(),
  };
}

/** User-authored text only: tool results and thinking blocks are never part of a prompt. */
function userText(event: PiEvent): string | null {
  if (event.type !== "message" || event.message?.role !== "user") {
    return null;
  }
  const content = event.message.content;
  if (typeof content === "string") {
    return content.trim() || null;
  }
  if (!Array.isArray(content)) {
    return null;
  }
  const text = content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim();
  return text || null;
}

function countToolUses(event: PiEvent): number {
  const content = event.message?.content;
  if (!Array.isArray(content)) {
    return 0;
  }
  return content.filter(
    (part) => part?.type === "toolCall" || part?.type === "tool_use"
  ).length;
}

function reason(error: unknown): string {
  return error instanceof Error ? `: ${error.message}` : "";
}
