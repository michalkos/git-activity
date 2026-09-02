import { Database } from "bun:sqlite";
import { dirname, join } from "node:path";
import { warnAdapter } from "../log.ts";
import { expandHome, homeDir, projectNameFromPath } from "../paths.ts";
import {
  isWrappedPrompt,
  PROMPT_MAX,
  startedInRange,
  titleFrom,
  truncate,
} from "./common.ts";
import { pathExists } from "./fs.ts";
import type { AgentSource } from "./types.ts";
import type { AgentSession } from "../types.ts";

/**
 * OpenCode sessions (V1 `opencode` and V2 `opencode2` share one data dir).
 * Layout: ~/.local/share/opencode/opencode.db  (OPENCODE_DB / XDG_DATA_HOME override)
 *
 * V2 tables `session_v2` + `session_message` are the source of truth. Leftover V1
 * `session` / `message` / `part` rows are unioned when their id is not already in
 * V2. Child sessions (parent_id set) are skipped so subagent time is not counted
 * twice. The HTTP API is never called.
 */

interface OpenCodeSourceOptions {
  dbPath?: string;
  which?: (name: string) => string | null;
}

interface SessionRow {
  id: string;
  directory: string | null;
  title: string | null;
  parent_id: string | null;
  agent: string | null;
  model: string | null;
  time_created: number;
  time_updated: number;
}

interface CountRow {
  session_id: string;
  n: number;
}

interface TypeCountRow {
  session_id: string;
  type: string;
  n: number;
}

interface DataRow {
  session_id?: string;
  data: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_COLUMNS =
  "id, directory, title, parent_id, agent, model, time_created, time_updated";
const ROOT_SESSION = "IFNULL(parent_id, '') = ''";

export function createOpenCodeSource(
  options: OpenCodeSourceOptions = {}
): AgentSource {
  const dbPath = options.dbPath ?? resolveOpenCodeDb();
  const whichBin = options.which ?? ((name: string) => Bun.which(name));

  return {
    id: "opencode",
    label: "OpenCode",
    async detect() {
      const binary =
        whichBin("opencode2") ?? whichBin("opencode") ?? undefined;
      const hasDb = await pathExists(dbPath);
      const sessionCount = hasDb ? countRootSessions(dbPath) : 0;
      return {
        installed: Boolean(binary) || hasDb,
        dataDir: hasDb ? dirname(dbPath) : undefined,
        binary,
        sessionCount,
      };
    },
    async listSessions(from, to) {
      return withDb(dbPath, (db) => readSessions(db, dbPath, from, to)) ?? [];
    },
    async getUserPrompts(session) {
      const ref = parseSourceRef(session.sourceRef);
      if (!ref) {
        return [];
      }
      try {
        return (
          withDb(ref.dbPath, (db) => readUserPrompts(db, ref.sessionId)) ?? []
        );
      } catch (error) {
        warnAdapter(
          "opencode",
          `failed to read prompts for ${session.id}${reason(error)}`
        );
        return [];
      }
    },
  };
}

function resolveOpenCodeDb(): string {
  if (process.env.OPENCODE_DB) {
    return expandHome(process.env.OPENCODE_DB);
  }
  const dataHome = process.env.XDG_DATA_HOME
    ? expandHome(process.env.XDG_DATA_HOME)
    : join(homeDir(), ".local", "share");
  return join(dataHome, "opencode", "opencode.db");
}

function countRootSessions(dbPath: string): number {
  return withDb(dbPath, (db) => {
    const ids = new Set<string>();
    for (const table of sessionTables(tableNames(db))) {
      const rows = db
        .query(`SELECT id FROM ${table} WHERE ${ROOT_SESSION}`)
        .all() as { id: string }[];
      for (const row of rows) {
        ids.add(row.id);
      }
    }
    return ids.size;
  }) ?? 0;
}

function readSessions(
  db: Database,
  dbPath: string,
  from: Date,
  to: Date
): AgentSession[] {
  const tables = tableNames(db);
  const lower = from.getTime() - DAY_MS;
  const upper = to.getTime() + DAY_MS;
  const seen = new Set<string>();
  const rows: SessionRow[] = [];

  for (const table of sessionTables(tables)) {
    const found = db
      .query(
        `SELECT ${SESSION_COLUMNS} FROM ${table}
         WHERE ${ROOT_SESSION}
           AND time_created >= ?
           AND time_created <= ?`
      )
      .all(lower, upper) as SessionRow[];
    for (const row of found) {
      if (seen.has(row.id)) {
        continue;
      }
      seen.add(row.id);
      rows.push(row);
    }
  }

  const inRange: SessionRow[] = [];
  for (const row of rows) {
    const startedAt = msToDate(row.time_created);
    if (!startedAt || !startedInRange(startedAt, from, to)) {
      continue;
    }
    inRange.push(row);
  }

  const ids = inRange.map((row) => row.id);
  const turns = turnCounts(db, tables, ids);
  const tools = toolCounts(db, tables, ids);
  const untitledIds = inRange
    .filter((row) => isPlaceholderTitle(row.title))
    .map((row) => row.id);
  const firstPrompts = firstUserPrompts(db, tables, untitledIds);

  return inRange.flatMap((row) => {
    const startedAt = msToDate(row.time_created);
    const endedAt = msToDate(row.time_updated) ?? startedAt;
    if (!startedAt || !endedAt) {
      return [];
    }
    const projectPath = row.directory?.trim() || "(unknown)";
    const counts = turns.get(row.id) ?? { userTurns: 0, assistantTurns: 0 };
    const prompt = firstPrompts.get(row.id);
    const title = titleFrom(
      isPlaceholderTitle(row.title)
        ? prompt || row.id
        : row.title!.trim()
    );
    return [
      {
        id: row.id,
        source: "opencode",
        title,
        projectPath,
        projectName:
          projectPath === "(unknown)"
            ? "(unknown)"
            : projectNameFromPath(projectPath),
        startedAt,
        endedAt: endedAt < startedAt ? startedAt : endedAt,
        userTurns: counts.userTurns,
        assistantTurns: counts.assistantTurns,
        toolCalls: tools.get(row.id) ?? 0,
        model: parseModel(row.model),
        sourceRef: `${dbPath}#${row.id}`,
      },
    ];
  });
}

function turnCounts(
  db: Database,
  tables: Set<string>,
  ids: string[]
): Map<string, { userTurns: number; assistantTurns: number }> {
  const counts = new Map<string, { userTurns: number; assistantTurns: number }>();
  if (ids.length === 0) {
    return counts;
  }

  const bump = (sessionId: string, role: string, n: number) => {
    const entry = counts.get(sessionId) ?? { userTurns: 0, assistantTurns: 0 };
    if (role === "user") {
      entry.userTurns += n;
    } else if (role === "assistant") {
      entry.assistantTurns += n;
    }
    counts.set(sessionId, entry);
  };

  if (tables.has("session_message")) {
    try {
      const rows = db
        .query(
          `SELECT session_id, type, COUNT(*) AS n
           FROM session_message
           WHERE session_id IN (${placeholders(ids.length)})
             AND type IN ('user', 'assistant')
           GROUP BY session_id, type`
        )
        .all(...ids) as TypeCountRow[];
      for (const row of rows) {
        bump(row.session_id, row.type, row.n);
      }
    } catch (error) {
      warnAdapter("opencode", `failed to count V2 turns${reason(error)}`);
    }
  }

  const missing = ids.filter((id) => !counts.has(id));
  if (missing.length > 0 && tables.has("message")) {
    try {
      const rows = db
        .query(
          `SELECT session_id, json_extract(data, '$.role') AS type, COUNT(*) AS n
           FROM message
           WHERE session_id IN (${placeholders(missing.length)})
           GROUP BY session_id, type`
        )
        .all(...missing) as TypeCountRow[];
      for (const row of rows) {
        if (row.type === "user" || row.type === "assistant") {
          bump(row.session_id, row.type, row.n);
        }
      }
    } catch (error) {
      warnAdapter("opencode", `failed to count V1 turns${reason(error)}`);
    }
  }

  return counts;
}

function toolCounts(
  db: Database,
  tables: Set<string>,
  ids: string[]
): Map<string, number> {
  const counts = new Map<string, number>();
  if (ids.length === 0) {
    return counts;
  }

  if (tables.has("session_message")) {
    try {
      const rows = db
        .query(
          `SELECT m.session_id AS session_id, COUNT(*) AS n
           FROM session_message m, json_each(json_extract(m.data, '$.content')) AS p
           WHERE m.session_id IN (${placeholders(ids.length)})
             AND m.type = 'assistant'
             AND json_extract(p.value, '$.type') = 'tool'
           GROUP BY m.session_id`
        )
        .all(...ids) as CountRow[];
      for (const row of rows) {
        counts.set(row.session_id, row.n);
      }
    } catch (error) {
      warnAdapter("opencode", `failed to count V2 tool calls${reason(error)}`);
    }
  }

  const missing = ids.filter((id) => !counts.has(id));
  if (missing.length > 0 && tables.has("part")) {
    try {
      const rows = db
        .query(
          `SELECT session_id, COUNT(*) AS n
           FROM part
           WHERE session_id IN (${placeholders(missing.length)})
             AND json_extract(data, '$.type') = 'tool'
           GROUP BY session_id`
        )
        .all(...missing) as CountRow[];
      for (const row of rows) {
        counts.set(row.session_id, row.n);
      }
    } catch (error) {
      warnAdapter("opencode", `failed to count V1 tool calls${reason(error)}`);
    }
  }

  return counts;
}

function firstUserPrompts(
  db: Database,
  tables: Set<string>,
  ids: string[]
): Map<string, string> {
  const prompts = new Map<string, string>();
  if (ids.length === 0) {
    return prompts;
  }

  const consider = (sessionId: string, text: string | null) => {
    if (!text) {
      return;
    }
    const current = prompts.get(sessionId);
    if (!current) {
      prompts.set(sessionId, text);
      return;
    }
    if (isWrappedPrompt(current) && !isWrappedPrompt(text)) {
      prompts.set(sessionId, text);
    }
  };

  if (tables.has("session_message")) {
    try {
      const rows = db
        .query(
          `SELECT session_id, data
           FROM session_message
           WHERE session_id IN (${placeholders(ids.length)})
             AND type = 'user'
           ORDER BY session_id, seq`
        )
        .all(...ids) as DataRow[];
      for (const row of rows) {
        if (row.session_id) {
          consider(row.session_id, userTextFromV2(row.data));
        }
      }
    } catch (error) {
      warnAdapter("opencode", `failed to read V2 prompts${reason(error)}`);
    }
  }

  const missing = ids.filter((id) => !prompts.has(id));
  if (missing.length > 0 && tables.has("part") && tables.has("message")) {
    try {
      const rows = db
        .query(
          `SELECT p.session_id AS session_id, p.data AS data
           FROM part p
           JOIN message m ON m.id = p.message_id
           WHERE p.session_id IN (${placeholders(missing.length)})
             AND json_extract(m.data, '$.role') = 'user'
           ORDER BY p.session_id, p.time_created, p.id`
        )
        .all(...missing) as DataRow[];
      for (const row of rows) {
        if (row.session_id) {
          consider(row.session_id, userTextFromV1Part(row.data));
        }
      }
    } catch (error) {
      warnAdapter("opencode", `failed to read V1 prompts${reason(error)}`);
    }
  }

  return prompts;
}

function readUserPrompts(db: Database, sessionId: string): string[] {
  const tables = tableNames(db);
  const prompts: string[] = [];

  if (tables.has("session_message")) {
    const rows = db
      .query(
        `SELECT data FROM session_message
         WHERE session_id = ? AND type = 'user'
         ORDER BY seq`
      )
      .all(sessionId) as DataRow[];
    for (const row of rows) {
      const text = userTextFromV2(row.data);
      if (text) {
        prompts.push(truncate(text, PROMPT_MAX));
      }
    }
  }

  if (prompts.length === 0 && tables.has("part") && tables.has("message")) {
    const rows = db
      .query(
        `SELECT p.data AS data
         FROM part p
         JOIN message m ON m.id = p.message_id
         WHERE p.session_id = ?
           AND json_extract(m.data, '$.role') = 'user'
         ORDER BY p.time_created, p.id`
      )
      .all(sessionId) as DataRow[];
    for (const row of rows) {
      const text = userTextFromV1Part(row.data);
      if (text) {
        prompts.push(truncate(text, PROMPT_MAX));
      }
    }
  }

  return prompts;
}

function userTextFromV2(raw: string): string | null {
  const data = parseJson(raw) as { text?: unknown } | null;
  if (typeof data?.text !== "string") {
    return null;
  }
  const text = data.text.trim();
  return text.length > 0 ? text : null;
}

function userTextFromV1Part(raw: string): string | null {
  const data = parseJson(raw) as {
    type?: string;
    text?: unknown;
    synthetic?: unknown;
  } | null;
  if (data?.type !== "text" || data.synthetic) {
    return null;
  }
  if (typeof data.text !== "string") {
    return null;
  }
  const text = data.text.trim();
  return text.length > 0 ? text : null;
}

function parseModel(raw: string | null | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }
  const parsed = parseJson(raw) as { id?: unknown; providerID?: unknown } | null;
  if (parsed && typeof parsed.id === "string" && parsed.id.trim()) {
    return typeof parsed.providerID === "string" && parsed.providerID.trim()
      ? `${parsed.providerID}/${parsed.id}`
      : parsed.id;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isPlaceholderTitle(title: string | null | undefined): boolean {
  if (!title || !title.trim()) {
    return true;
  }
  return /^New session\s*-/i.test(title.trim());
}

function msToDate(value: number | null | undefined): Date | undefined {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseSourceRef(
  ref: string | undefined
): { dbPath: string; sessionId: string } | null {
  if (!ref) {
    return null;
  }
  const hash = ref.lastIndexOf("#");
  if (hash <= 0 || hash === ref.length - 1) {
    return null;
  }
  return { dbPath: ref.slice(0, hash), sessionId: ref.slice(hash + 1) };
}

function sessionTables(tables: Set<string>): string[] {
  const names: string[] = [];
  if (tables.has("session_v2")) {
    names.push("session_v2");
  }
  if (tables.has("session")) {
    names.push("session");
  }
  return names;
}

function tableNames(db: Database): Set<string> {
  const rows = db
    .query("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all() as { name: string }[];
  return new Set(rows.map((row) => row.name));
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

function parseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function withDb<T>(dbPath: string, fn: (db: Database) => T): T | undefined {
  let db: Database;
  try {
    db = new Database(dbPath, { readonly: true, create: false });
  } catch (error) {
    warnAdapter("opencode", `skipped unreadable ${dbPath}${reason(error)}`);
    return undefined;
  }
  try {
    return fn(db);
  } catch (error) {
    warnAdapter("opencode", `skipped unreadable ${dbPath}${reason(error)}`);
    return undefined;
  } finally {
    db.close();
  }
}

function reason(error: unknown): string {
  return error instanceof Error ? `: ${error.message}` : "";
}
