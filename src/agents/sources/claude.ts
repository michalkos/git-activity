import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { expandHome, projectNameFromPath } from "../paths.ts";
import { warnAdapter } from "../log.ts";
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
          if (await isUntouchedSince(filePath, from)) {
            continue;
          }
          const parsed = await parseSessionMeta(filePath);
          if (!parsed) {
            continue;
          }
          if (overlapsRange(parsed.session.startedAt, parsed.session.endedAt, from, to)) {
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
        return await collectUserTexts(session.sourceRef, userPromptText, PROMPT_MAX);
      } catch (error) {
        warnAdapter(
          "claude",
          `failed to read prompts for ${session.id}${error instanceof Error ? `: ${error.message}` : ""}`
        );
        return [];
      }
    },
    async getUserPrompt(session, index) {
      if (!session.sourceRef) {
        return null;
      }
      try {
        return await nthUserText(session.sourceRef, userPromptText, index);
      } catch (error) {
        warnAdapter(
          "claude",
          `failed to read prompt ${index} for ${session.id}${error instanceof Error ? `: ${error.message}` : ""}`
        );
        return null;
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
  const activity = new DailyActivity();

  for await (const event of readJsonLines<ClaudeEvent>(filePath, () => {
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
    activity.add(timestamp);
    if (timestamp) {
      firstTimestamp ??= timestamp;
      lastTimestamp = timestamp;
    }

    if (event.type === "user") {
      const text = extractUserText(event);
      if (text) {
        userTurns += 1;
        activity.add(timestamp, { userTurns: 1 });
        firstUserPrompt ??= text;
        if (!isWrappedPrompt(text)) {
          firstRealPrompt ??= text;
        }
      }
    } else if (event.type === "assistant") {
      assistantTurns += 1;
      activity.add(timestamp, { assistantTurns: 1 });
      const tools = countToolUses(event);
      toolCalls += tools;
      activity.add(timestamp, { toolCalls: tools });
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
  const title = titleFrom(
    summaryTitle || firstRealPrompt || firstUserPrompt || basename(filePath, ".jsonl")
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
      activity: activity.values(),
    },
  };
}

function userPromptText(event: ClaudeEvent): string | null {
  return event.type === "user" ? extractUserText(event) : null;
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

