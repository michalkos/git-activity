import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { warnAdapter } from "../log.ts";
import { editorAppSupportDir, projectNameFromPath } from "../paths.ts";
import {
  isUntouchedSince,
  parseTimestamp,
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
 * VS Code GitHub Copilot Chat.
 * Layout: {Code}/User/workspaceStorage/<hash>/chatSessions/*.{json,jsonl}
 * The workspace folder comes from `workspace.json` next to `chatSessions`.
 *
 * Two on-disk shapes, both reduced to the same record:
 *  - `.json`  — one snapshot object.
 *  - `.jsonl` — an append journal: kind 0 is the initial snapshot, kind 1 sets a
 *    key path, kind 2 appends to an array at a key path. Only the paths this
 *    report needs are applied; response bodies are counted and dropped so a
 *    multi-megabyte chat stays cheap to read.
 *
 * Insiders is probed as the same source. The schema has shifted across VS Code
 * versions, so anything unrecognized is skipped rather than guessed at.
 */

interface ChatRequest {
  timestamp?: number;
  modelId?: string;
  elapsedMs?: number | null;
  message?: { text?: string };
}

interface ChatSnapshot {
  sessionId?: string;
  creationDate?: number;
  lastMessageDate?: number;
  customTitle?: string;
  requests?: ChatRequest[];
}

interface JournalLine {
  kind?: number;
  k?: (string | number)[];
  v?: unknown;
}

interface ParsedChat {
  sessionId?: string;
  creationDate?: number;
  lastMessageDate?: number;
  customTitle?: string;
  requests: ChatRequest[];
  /** Latest per-request completion time seen in the journal. */
  completedAt?: number;
  toolCalls: number;
}

interface VscodeCopilotSourceOptions {
  workspaceStorageDirs?: string[];
  which?: (name: string) => string | null;
}

export function createVscodeCopilotSource(
  options: VscodeCopilotSourceOptions = {}
): AgentSource {
  const candidates =
    options.workspaceStorageDirs ??
    [
      join(editorAppSupportDir("Code"), "User", "workspaceStorage"),
      join(editorAppSupportDir("Code - Insiders"), "User", "workspaceStorage"),
    ];
  const whichBin = options.which ?? ((name: string) => Bun.which(name));

  return {
    id: "vscode-copilot",
    label: "VS Code Copilot Chat",
    async detect() {
      const binary =
        whichBin("code") ?? whichBin("code-insiders") ?? undefined;

      let dataDir: string | undefined;
      let sessionCount = 0;
      for (const dir of candidates) {
        if (!(await isDirectory(dir))) {
          continue;
        }
        const count = (await listChatFiles(dir)).length;
        if (!dataDir || count > sessionCount) {
          dataDir = dir;
          sessionCount = count;
        }
      }

      return {
        installed: Boolean(binary) || Boolean(dataDir),
        dataDir,
        binary,
        sessionCount,
      };
    },
    async listSessions(from, to) {
      const sessions: AgentSession[] = [];

      for (const dir of candidates) {
        for (const chat of await listChatFiles(dir)) {
          try {
            if (await isUntouchedSince(chat.filePath, from)) {
              continue;
            }
            const parsed = await parseChat(chat.filePath);
            if (!parsed) {
              continue;
            }
            const session = toSession(parsed, chat);
            if (session && startedInRange(session.startedAt, from, to)) {
              sessions.push(session);
            }
          } catch (error) {
            warnAdapter(
              "vscode-copilot",
              `skipped unreadable ${chat.filePath}${reason(error)}`
            );
          }
        }
      }

      return sessions;
    },
    async getUserPrompts(session) {
      if (!session.sourceRef) {
        return [];
      }
      try {
        const parsed = await parseChat(session.sourceRef);
        return (parsed?.requests ?? [])
          .map((request) => request.message?.text?.trim())
          .filter((text): text is string => Boolean(text))
          .map((text) => truncate(text, PROMPT_MAX));
      } catch (error) {
        warnAdapter(
          "vscode-copilot",
          `failed to read prompts for ${session.id}${reason(error)}`
        );
        return [];
      }
    },
  };
}

interface ChatFile {
  filePath: string;
  workspacePath: string;
}

/** Every chat file under every workspace hash, paired with its resolved folder. */
async function listChatFiles(workspaceStorage: string): Promise<ChatFile[]> {
  const files: ChatFile[] = [];
  let hashes;
  try {
    hashes = await readdir(workspaceStorage, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const hash of hashes) {
    if (!hash.isDirectory()) {
      continue;
    }
    const storageDir = join(workspaceStorage, hash.name);
    const chatDir = join(storageDir, "chatSessions");
    let entries;
    try {
      entries = await readdir(chatDir, { withFileTypes: true });
    } catch {
      continue;
    }

    const workspacePath = await readWorkspacePath(storageDir);
    for (const entry of entries) {
      if (
        entry.isFile() &&
        (entry.name.endsWith(".json") || entry.name.endsWith(".jsonl"))
      ) {
        files.push({ filePath: join(chatDir, entry.name), workspacePath });
      }
    }
  }

  return files;
}

/** `workspace.json` holds a folder URI, or a `.code-workspace` file for multi-root. */
async function readWorkspacePath(storageDir: string): Promise<string> {
  const file = Bun.file(join(storageDir, "workspace.json"));
  if (!(await file.exists())) {
    return "(unknown)";
  }
  try {
    const parsed = (await file.json()) as {
      folder?: string;
      workspace?: string;
    };
    const uri = parsed.folder ?? parsed.workspace;
    if (!uri) {
      return "(unknown)";
    }
    return uri.startsWith("file://") ? fileURLToPath(uri) : uri;
  } catch {
    return "(unknown)";
  }
}

async function parseChat(filePath: string): Promise<ParsedChat | null> {
  return filePath.endsWith(".jsonl")
    ? await parseJournal(filePath)
    : await parseSnapshotFile(filePath);
}

async function parseSnapshotFile(filePath: string): Promise<ParsedChat | null> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return null;
  }
  const snapshot = (await file.json()) as ChatSnapshot;
  const chat = emptyChat();
  applySnapshot(chat, snapshot);
  return chat;
}

async function parseJournal(filePath: string): Promise<ParsedChat | null> {
  const chat = emptyChat();
  let malformed = false;
  let sawSnapshot = false;

  for await (const line of readJsonLines<JournalLine>(filePath, () => {
    malformed = true;
  })) {
    if (line.kind === 0) {
      applySnapshot(chat, (line.v ?? {}) as ChatSnapshot);
      sawSnapshot = true;
      continue;
    }

    const path = line.k;
    if (!Array.isArray(path) || path.length === 0) {
      continue;
    }
    const value = decodeJournalValue(line.v);
    if (value === undefined) {
      continue;
    }

    if (line.kind === 1) {
      applyJournalSet(chat, path, value);
    } else if (line.kind === 2) {
      applyJournalAppend(chat, path, value);
    }
  }

  if (malformed) {
    warnAdapter("vscode-copilot", `skipped malformed lines in ${filePath}`);
  }
  return sawSnapshot || chat.requests.length > 0 ? chat : null;
}

function emptyChat(): ParsedChat {
  return { requests: [], toolCalls: 0 };
}

function applySnapshot(chat: ParsedChat, snapshot: ChatSnapshot): void {
  chat.sessionId ??= snapshot.sessionId;
  chat.creationDate ??= snapshot.creationDate;
  chat.lastMessageDate = snapshot.lastMessageDate ?? chat.lastMessageDate;
  chat.customTitle = snapshot.customTitle ?? chat.customTitle;
  if (Array.isArray(snapshot.requests)) {
    for (const request of snapshot.requests) {
      chat.requests.push(slimRequest(request));
      chat.toolCalls += countToolInvocations(
        (request as { response?: unknown }).response
      );
    }
  }
}

/** Journal values are JSON encoded as strings; kind 0 snapshots are already objects. */
function decodeJournalValue(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function applyJournalSet(
  chat: ParsedChat,
  path: (string | number)[],
  value: unknown
): void {
  const [head, index, field] = path;

  if (head === "customTitle" && typeof value === "string") {
    chat.customTitle = value;
    return;
  }
  if (head === "lastMessageDate" && typeof value === "number") {
    chat.lastMessageDate = value;
    return;
  }
  if (head !== "requests" || typeof index !== "number") {
    return;
  }

  const request = chat.requests[index];
  if (field === "modelState") {
    const completedAt = (value as { completedAt?: number })?.completedAt;
    if (typeof completedAt === "number") {
      chat.completedAt = Math.max(chat.completedAt ?? 0, completedAt);
    }
    return;
  }
  if (field === "elapsedMs" && request && typeof value === "number") {
    request.elapsedMs = value;
  }
}

function applyJournalAppend(
  chat: ParsedChat,
  path: (string | number)[],
  value: unknown
): void {
  const [head, index, field] = path;

  if (head === "requests" && index === undefined) {
    for (const request of asArray(value)) {
      chat.requests.push(slimRequest(request as ChatRequest));
      chat.toolCalls += countToolInvocations(
        (request as { response?: unknown }).response
      );
    }
    return;
  }
  if (head === "requests" && typeof index === "number" && field === "response") {
    chat.toolCalls += countToolInvocations(value);
  }
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Keeps only the metadata the report needs; response bodies are never retained. */
function slimRequest(request: ChatRequest): ChatRequest {
  return {
    timestamp: request?.timestamp,
    modelId: request?.modelId,
    elapsedMs: request?.elapsedMs,
    message: { text: request?.message?.text },
  };
}

function countToolInvocations(response: unknown): number {
  return asArray(response).filter(
    (part) =>
      part &&
      typeof part === "object" &&
      (part as { kind?: string }).kind === "toolInvocationSerialized"
  ).length;
}

function toSession(chat: ParsedChat, file: ChatFile): AgentSession | null {
  const timestamps = chat.requests
    .map((request) => request.timestamp)
    .filter((value): value is number => typeof value === "number");
  if (timestamps.length === 0) {
    // An opened-but-unused chat panel is not work.
    return null;
  }

  // `creationDate` is when the panel was opened, which can be months before the
  // first prompt, so the requests themselves define the session window.
  const startedAt = parseTimestamp(Math.min(...timestamps));
  if (!startedAt) {
    return null;
  }
  const lastRequest = chat.requests.reduce((latest, request) =>
    (request.timestamp ?? 0) > (latest.timestamp ?? 0) ? request : latest
  );
  const lastEnd = Math.max(
    (lastRequest.timestamp ?? 0) + (lastRequest.elapsedMs ?? 0),
    chat.completedAt ?? 0,
    chat.lastMessageDate ?? 0
  );
  const endedAt = parseTimestamp(lastEnd) ?? startedAt;

  const id = chat.sessionId || basename(file.filePath).replace(/\.jsonl?$/, "");
  const firstPrompt = chat.requests.find((request) =>
    request.message?.text?.trim()
  )?.message?.text?.trim();

  return {
    id,
    source: "vscode-copilot",
    title: titleFrom(chat.customTitle || firstPrompt || id),
    projectPath: file.workspacePath,
    projectName:
      file.workspacePath === "(unknown)"
        ? "(unknown)"
        : projectNameFromPath(file.workspacePath),
    startedAt,
    endedAt: endedAt < startedAt ? startedAt : endedAt,
    userTurns: chat.requests.length,
    assistantTurns: chat.requests.length,
    toolCalls: chat.toolCalls,
    model: chat.requests.find((request) => request.modelId)?.modelId,
    sourceRef: file.filePath,
  };
}

function reason(error: unknown): string {
  return error instanceof Error ? `: ${error.message}` : "";
}
