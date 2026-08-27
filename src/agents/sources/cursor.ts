import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { warnAdapter } from "../log.ts";
import { expandHome, projectNameFromPath } from "../paths.ts";
import {
  fileTimes,
  PROMPT_MAX,
  readJsonLines,
  startedInRange,
  titleFrom,
  truncate,
} from "./common.ts";
import { isDirectory } from "./fs.ts";
import type { AgentSource } from "./types.ts";
import type { AgentSession } from "../types.ts";

/**
 * Cursor agent transcripts.
 * Layout: ~/.cursor/projects/<encoded-cwd>/agent-transcripts/<sessionId>/
 *         <sessionId>.jsonl plus subagents/*.jsonl
 *
 * Transcript lines carry no timestamps, so the session window comes from the
 * file times in the session directory (earliest creation to latest write) —
 * spot-checked against the `<timestamp>` header Cursor embeds in the first user
 * query. Chat DBs and `state.vscdb` stay out of v1: the transcripts already
 * cover both IDE and CLI agents, and `state.vscdb` can be gigabytes.
 */

interface CursorContentPart {
  type?: string;
  text?: string;
}

interface CursorLine {
  role?: string;
  type?: string;
  message?: {
    content?: CursorContentPart[] | string;
  };
}

interface CursorSourceOptions {
  cursorHome?: string;
  which?: (name: string) => string | null;
}

export function createCursorSource(
  options: CursorSourceOptions = {}
): AgentSource {
  const cursorHome = options.cursorHome ?? expandHome("~/.cursor");
  const projectsDir = join(cursorHome, "projects");
  const whichBin = options.which ?? ((name: string) => Bun.which(name));

  return {
    id: "cursor",
    label: "Cursor",
    async detect() {
      const binary = whichBin("cursor") ?? undefined;
      const hasHome = await isDirectory(cursorHome);
      const sessionCount = hasHome
        ? (await listSessionDirs(projectsDir)).length
        : 0;
      return {
        installed: Boolean(binary) || hasHome,
        dataDir: hasHome ? cursorHome : undefined,
        binary,
        sessionCount,
      };
    },
    async listSessions(from, to) {
      const sessions: AgentSession[] = [];
      const projectPaths = new Map<string, string>();
      const entriesCache = new Map<string, string[]>();

      for (const entry of await listSessionDirs(projectsDir)) {
        try {
          const times = await sessionTimes(entry.sessionDir);
          if (!times || !startedInRange(times.startedAt, from, to)) {
            continue;
          }

          let projectPath = projectPaths.get(entry.encodedProject);
          if (projectPath === undefined) {
            projectPath = await decodeProjectPath(
              entry.encodedProject,
              entriesCache
            );
            projectPaths.set(entry.encodedProject, projectPath);
          }

          const transcript = join(entry.sessionDir, `${entry.sessionId}.jsonl`);
          const stats = await readTranscript(transcript);

          sessions.push({
            id: entry.sessionId,
            source: "cursor",
            title: titleFrom(stats.title ?? entry.sessionId),
            projectPath,
            projectName:
              projectPath === "(unknown)"
                ? "(unknown)"
                : projectNameFromPath(projectPath),
            startedAt: times.startedAt,
            endedAt: times.endedAt,
            userTurns: stats.userTurns,
            assistantTurns: stats.assistantTurns,
            toolCalls: stats.toolCalls,
            sourceRef: transcript,
          });
        } catch (error) {
          warnAdapter(
            "cursor",
            `skipped unreadable ${entry.sessionDir}${reason(error)}`
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
        const prompts: string[] = [];
        for await (const line of readJsonLines<CursorLine>(session.sourceRef)) {
          const text = line.role === "user" ? userText(line) : null;
          if (text) {
            prompts.push(truncate(text, PROMPT_MAX));
          }
        }
        return prompts;
      } catch (error) {
        warnAdapter("cursor", `failed to read prompts for ${session.id}${reason(error)}`);
        return [];
      }
    },
  };
}

interface SessionDirEntry {
  encodedProject: string;
  sessionId: string;
  sessionDir: string;
}

async function listSessionDirs(projectsDir: string): Promise<SessionDirEntry[]> {
  const entries: SessionDirEntry[] = [];
  let projects;
  try {
    projects = await readdir(projectsDir, { withFileTypes: true });
  } catch {
    return entries;
  }

  for (const project of projects) {
    if (!project.isDirectory()) {
      continue;
    }
    const transcriptsDir = join(projectsDir, project.name, "agent-transcripts");
    let sessionDirs;
    try {
      sessionDirs = await readdir(transcriptsDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const session of sessionDirs) {
      if (session.isDirectory()) {
        entries.push({
          encodedProject: project.name,
          sessionId: session.name,
          sessionDir: join(transcriptsDir, session.name),
        });
      }
    }
  }

  return entries;
}

/**
 * Earliest creation and latest write across the session's transcripts, subagents
 * included — the only timing signal Cursor leaves on disk.
 */
async function sessionTimes(
  sessionDir: string
): Promise<{ startedAt: Date; endedAt: Date } | null> {
  let started: Date | undefined;
  let ended: Date | undefined;

  const stack = [sessionDir];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(path);
        continue;
      }
      if (!entry.name.endsWith(".jsonl")) {
        continue;
      }
      const times = await fileTimes(path);
      if (!times) {
        continue;
      }
      if (!started || times.birth < started) {
        started = times.birth;
      }
      if (!ended || times.modified > ended) {
        ended = times.modified;
      }
    }
  }

  if (!started || !ended) {
    return null;
  }
  return { startedAt: started, endedAt: ended < started ? started : ended };
}

interface TranscriptStats {
  title?: string;
  userTurns: number;
  assistantTurns: number;
  toolCalls: number;
}

async function readTranscript(filePath: string): Promise<TranscriptStats> {
  const stats: TranscriptStats = {
    userTurns: 0,
    assistantTurns: 0,
    toolCalls: 0,
  };

  try {
    for await (const line of readJsonLines<CursorLine>(filePath)) {
      if (line.role === "user") {
        const text = userText(line);
        if (text) {
          stats.userTurns += 1;
          stats.title ??= text;
        }
      } else if (line.role === "assistant") {
        stats.assistantTurns += 1;
        stats.toolCalls += countToolUses(line);
      }
    }
  } catch {
    // A missing or unreadable top-level transcript still leaves usable file times.
  }

  return stats;
}

/**
 * Cursor wraps prompts as `<timestamp>...</timestamp><user_query>...</user_query>`
 * and reuses the user role for tool results, which are dropped here.
 */
function userText(line: CursorLine): string | null {
  const content = line.message?.content;
  const raw =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content
            .filter((part) => part?.type === "text" && typeof part.text === "string")
            .map((part) => part.text)
            .join("\n")
        : "";

  const query = raw.match(/<user_query>([\s\S]*?)<\/user_query>/);
  const text = (query?.[1] ?? raw.replace(/<timestamp>[\s\S]*?<\/timestamp>/g, ""))
    .trim();
  return text || null;
}

function countToolUses(line: CursorLine): number {
  const content = line.message?.content;
  if (!Array.isArray(content)) {
    return 0;
  }
  return content.filter((part) => part?.type === "tool_use").length;
}

/**
 * Project directories encode the cwd with `/` — and any other punctuation, such
 * as the dot in a `.code-workspace` name — flattened to `-`, which is ambiguous
 * on its own. Walk the real filesystem and match each encoded segment against
 * the names actually on disk instead of guessing where the separators were.
 * Projects that have since moved or been deleted resolve to "(unknown)" rather
 * than an invented path.
 */
async function decodeProjectPath(
  encoded: string,
  entriesCache: Map<string, string[]>
): Promise<string> {
  if (!encoded) {
    return "(unknown)";
  }
  return (await resolveEncoded("", encoded, entriesCache)) ?? "(unknown)";
}

async function resolveEncoded(
  base: string,
  remainder: string,
  entriesCache: Map<string, string[]>
): Promise<string | null> {
  if (!remainder) {
    return base;
  }

  const normalized = flatten(remainder);
  for (const name of await cachedEntries(base || "/", entriesCache)) {
    const encodedName = flatten(name);
    if (normalized === encodedName) {
      return `${base}/${name}`;
    }
    if (!normalized.startsWith(`${encodedName}-`)) {
      continue;
    }
    const resolved = await resolveEncoded(
      `${base}/${name}`,
      remainder.slice(encodedName.length + 1),
      entriesCache
    );
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

/** Same 1:1 char mapping Cursor applies when it builds the directory name. */
function flatten(name: string): string {
  return name.replace(/[^A-Za-z0-9]/g, "-");
}

async function cachedEntries(
  dir: string,
  entriesCache: Map<string, string[]>
): Promise<string[]> {
  const cached = entriesCache.get(dir);
  if (cached) {
    return cached;
  }
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    names = [];
  }
  entriesCache.set(dir, names);
  return names;
}

function reason(error: unknown): string {
  return error instanceof Error ? `: ${error.message}` : "";
}
