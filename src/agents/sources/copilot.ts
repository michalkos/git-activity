import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { warnAdapter } from "../log.ts";
import { expandHome, projectNameFromPath } from "../paths.ts";
import {
  collectUserTexts,
  nthUserText,
  parseTimestamp,
  PROMPT_MAX,
  readJsonLines,
  overlapsRange,
  DailyActivity,
  titleFrom,
} from "./common.ts";
import { countMatchingFiles, isDirectory, pathExists } from "./fs.ts";
import type { AgentSource } from "./types.ts";
import type { AgentSession } from "../types.ts";

/**
 * GitHub Copilot CLI sessions (not VS Code Chat — they share no local store).
 * Layout: ~/.copilot/session-state/<uuid>/ with workspace.yaml + events.jsonl.
 * workspace.yaml is a flat map (id, cwd, branch, name, summary, created_at,
 * updated_at) and is enough to place a session on the calendar; events.jsonl is
 * opened only for sessions inside the range, for turn counts and prompts.
 * ~/.copilot/session-store.db mirrors the same data — the files are preferred so
 * a locked database can never break the report. Override: COPILOT_HOME.
 */

interface CopilotEvent {
  type?: string;
  timestamp?: string;
  data?: {
    content?: string;
    model?: string;
  };
}

interface CopilotSourceOptions {
  sessionStateDir?: string;
  which?: (name: string) => string | null;
}

export function createCopilotSource(
  options: CopilotSourceOptions = {}
): AgentSource {
  const sessionStateDir = options.sessionStateDir ?? resolveCopilotSessionDir();
  const whichBin = options.which ?? ((name: string) => Bun.which(name));

  return {
    id: "copilot",
    label: "GitHub Copilot CLI",
    async detect() {
      const binary = whichBin("copilot") ?? undefined;
      const hasDir = await isDirectory(sessionStateDir);
      const sessionCount = hasDir
        ? await countMatchingFiles(sessionStateDir, (name) => name === "workspace.yaml")
        : 0;
      return {
        installed: Boolean(binary) || hasDir,
        dataDir: hasDir ? sessionStateDir : undefined,
        binary,
        sessionCount,
      };
    },
    async listSessions(from, to) {
      const sessions: AgentSession[] = [];
      let entries;
      try {
        entries = await readdir(sessionStateDir, { withFileTypes: true });
      } catch {
        return sessions;
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }
        const sessionDir = join(sessionStateDir, entry.name);
        try {
          const session = await parseSession(sessionDir, entry.name, from, to);
          if (session) {
            sessions.push(session);
          }
        } catch (error) {
          warnAdapter("copilot", `skipped unreadable ${sessionDir}${reason(error)}`);
        }
      }

      return sessions;
    },
    async getUserPrompts(session) {
      if (!session.sourceRef || !(await pathExists(session.sourceRef))) {
        return [];
      }
      try {
        return await collectUserTexts(session.sourceRef, userText, PROMPT_MAX);
      } catch (error) {
        warnAdapter("copilot", `failed to read prompts for ${session.id}${reason(error)}`);
        return [];
      }
    },
    async getUserPrompt(session, index) {
      if (!session.sourceRef || !(await pathExists(session.sourceRef))) {
        return null;
      }
      try {
        return await nthUserText(session.sourceRef, userText, index);
      } catch (error) {
        warnAdapter("copilot", `failed to read prompt ${index} for ${session.id}${reason(error)}`);
        return null;
      }
    },
  };
}

function userText(event: CopilotEvent): string | null {
  if (event.type !== "user.message" || !event.data?.content) {
    return null;
  }
  return event.data.content.trim() || null;
}

function resolveCopilotSessionDir(): string {
  const home = process.env.COPILOT_HOME
    ? expandHome(process.env.COPILOT_HOME)
    : expandHome("~/.copilot");
  return join(home, "session-state");
}

async function parseSession(
  sessionDir: string,
  dirName: string,
  from: Date,
  to: Date
): Promise<AgentSession | null> {
  const workspacePath = join(sessionDir, "workspace.yaml");
  const workspace = await readFlatYaml(workspacePath);
  if (!workspace) {
    return null;
  }

  const startedAt = parseTimestamp(workspace.created_at);
  if (!startedAt) {
    return null;
  }
  const endedAt = parseTimestamp(workspace.updated_at) ?? startedAt;

  const eventsPath = join(sessionDir, "events.jsonl");
  const counts = (await pathExists(eventsPath))
    ? await countTurns(eventsPath)
    : emptyCounts();

  // updated_at moves whenever Copilot touches the session record — including days
  // later, when it is merely relisted — so the event log is the end of the work.
  const lastActivity = counts.lastEventAt ?? endedAt;

  if (!overlapsRange(startedAt, lastActivity, from, to)) return null;

  const projectPath = workspace.cwd || "(unknown)";
  return {
    id: workspace.id || dirName,
    source: "copilot",
    title: titleFrom(
      workspace.name || workspace.summary || counts.firstPrompt || dirName
    ),
    projectPath,
    projectName: projectNameFromPath(projectPath),
    startedAt,
    endedAt: lastActivity < startedAt ? startedAt : lastActivity,
    userTurns: counts.userTurns,
    assistantTurns: counts.assistantTurns,
    toolCalls: counts.toolCalls,
    model: counts.model,
    sourceRef: eventsPath,
    activity: counts.activity.values().length ? counts.activity.values() : undefined,
  };
}

interface TurnCounts {
  userTurns: number;
  assistantTurns: number;
  toolCalls: number;
  firstPrompt: string | undefined;
  model: string | undefined;
  lastEventAt: Date | undefined;
  activity: DailyActivity;
}

function emptyCounts(): TurnCounts {
  return {
    userTurns: 0,
    assistantTurns: 0,
    toolCalls: 0,
    firstPrompt: undefined,
    model: undefined,
    lastEventAt: undefined,
    activity: new DailyActivity(),
  };
}

async function countTurns(eventsPath: string): Promise<TurnCounts> {
  const counts = emptyCounts();

  for await (const event of readJsonLines<CopilotEvent>(eventsPath)) {
    const timestamp = parseTimestamp(event.timestamp);
    counts.activity.add(timestamp);
    if (event.type === "user.message") {
      counts.userTurns += 1;
      counts.activity.add(timestamp, { userTurns: 1 });
      const content = event.data?.content?.trim();
      if (content) {
        counts.firstPrompt ??= content;
      }
    } else if (event.type === "assistant.message") {
      counts.assistantTurns += 1;
      counts.activity.add(timestamp, { assistantTurns: 1 });
    } else if (event.type === "tool.execution_start") {
      counts.toolCalls += 1;
      counts.activity.add(timestamp, { toolCalls: 1 });
    }
    counts.model ??= event.data?.model;
    counts.lastEventAt = parseTimestamp(event.timestamp) ?? counts.lastEventAt;
  }

  return counts;
}

/**
 * workspace.yaml is a `key: value` map of scalars — the only nesting is a block
 * scalar (`name: |-`) for titles that span lines — so a full YAML parser would be
 * dead weight. Anything else is ignored rather than guessed at.
 */
async function readFlatYaml(
  filePath: string
): Promise<Record<string, string> | null> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return null;
  }

  const result: Record<string, string> = {};
  const lines = (await file.text()).split("\n");

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    if (!line.trim() || line.startsWith("#") || /^\s/.test(line)) {
      continue;
    }
    const separator = line.indexOf(":");
    if (separator < 1) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();

    if (/^[|>][-+]?$/.test(value)) {
      // Blank lines are part of the block as long as indented content follows.
      const block: string[] = [];
      while (index + 1 < lines.length && continuesBlock(lines, index + 1)) {
        block.push(lines[++index]!.trim());
      }
      result[key] = block.join("\n").trim();
      continue;
    }
    result[key] = unquote(value);
  }

  return result;
}

function continuesBlock(lines: string[], index: number): boolean {
  const line = lines[index] ?? "";
  if (/^\s/.test(line)) {
    return true;
  }
  if (line.trim() !== "") {
    return false;
  }
  return lines.slice(index + 1).some((next) => {
    if (next.trim() === "") {
      return false;
    }
    return /^\s/.test(next);
  });
}

function unquote(value: string): string {
  if (value.length >= 2 && /^(".*"|'.*')$/s.test(value)) {
    return value.slice(1, -1);
  }
  return value;
}

function reason(error: unknown): string {
  return error instanceof Error ? `: ${error.message}` : "";
}
