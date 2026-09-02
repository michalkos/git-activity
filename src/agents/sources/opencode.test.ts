import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOpenCodeSource } from "./opencode.ts";

const febStart = Date.parse("2026-02-16T10:00:00.000Z");
const febEnd = Date.parse("2026-02-16T11:30:00.000Z");
const untitledStart = Date.parse("2026-02-16T12:00:00.000Z");
const untitledEnd = Date.parse("2026-02-16T12:30:00.000Z");
const v1Start = Date.parse("2026-02-16T14:00:00.000Z");
const v1End = Date.parse("2026-02-16T14:45:00.000Z");
const janStart = Date.parse("2026-01-05T09:00:00.000Z");
const janEnd = Date.parse("2026-01-05T10:00:00.000Z");
const childStart = Date.parse("2026-02-16T10:15:00.000Z");

const model = JSON.stringify({
  id: "grok-4.6",
  providerID: "github-copilot",
  variant: "high",
});

let fixtureDir: string;
let dbPath: string;
let brokenPath: string;
let missingPath: string;

beforeAll(async () => {
  fixtureDir = await mkdtemp(join(tmpdir(), "git-activity-opencode-"));
  dbPath = join(fixtureDir, "opencode.db");
  brokenPath = join(fixtureDir, "broken.db");
  missingPath = join(fixtureDir, "missing", "opencode.db");
  await writeFile(brokenPath, "not a sqlite database\n");
  seedFixture(dbPath);
});

afterAll(async () => {
  await rm(fixtureDir, { recursive: true, force: true });
});

const february = (path: string = dbPath) =>
  createOpenCodeSource({ dbPath: path, which: () => null }).listSessions(
    new Date(2026, 1, 16),
    new Date(2026, 1, 22, 23, 59, 59, 999)
  );

describe("opencode adapter", () => {
  test("detects the fixture database without a binary", async () => {
    const source = createOpenCodeSource({ dbPath, which: () => null });
    const detection = await source.detect();
    expect(detection.installed).toBe(true);
    expect(detection.sessionCount).toBe(4);
    expect(detection.dataDir).toBe(fixtureDir);
    expect(detection.binary).toBeUndefined();
  });

  test("missing database is not installed without a binary", async () => {
    const source = createOpenCodeSource({
      dbPath: missingPath,
      which: () => null,
    });
    const detection = await source.detect();
    expect(detection.installed).toBe(false);
    expect(detection.sessionCount).toBe(0);
    expect(detection.dataDir).toBeUndefined();
  });

  test("parses a V2 session with turns, tools, and model", async () => {
    const sessions = await february();
    const session = sessions.find((entry) => entry.id === "sess-login")!;
    expect(session.source).toBe("opencode");
    expect(session.title).toBe("Fix the login redirect");
    expect(session.projectPath).toBe("/Users/demo/git-activity");
    expect(session.projectName).toBe("git-activity");
    expect(session.userTurns).toBe(2);
    expect(session.assistantTurns).toBe(2);
    expect(session.toolCalls).toBe(1);
    expect(session.model).toBe("github-copilot/grok-4.6");
    expect(session.startedAt.toISOString()).toBe("2026-02-16T10:00:00.000Z");
    expect(session.endedAt.toISOString()).toBe("2026-02-16T11:30:00.000Z");
  });

  test("filters by start date, skips children, and unions leftover V1 rows", async () => {
    const februaryIds = (await february()).map((session) => session.id).sort();
    expect(februaryIds).toEqual(["sess-login", "sess-untitled", "sess-v1-only"]);

    const source = createOpenCodeSource({ dbPath, which: () => null });
    const january = await source.listSessions(
      new Date(2026, 0, 1),
      new Date(2026, 0, 31, 23, 59, 59, 999)
    );
    expect(january.map((session) => session.id)).toEqual(["sess-jan"]);
  });

  test("placeholder titles fall back to the first real user prompt", async () => {
    const sessions = await february();
    const session = sessions.find((entry) => entry.id === "sess-untitled")!;
    expect(session.title).toBe("Ship the heatmap");
    expect(session.userTurns).toBe(2);
  });

  test("reads a V1-only session from the leftover session table", async () => {
    const sessions = await february();
    const session = sessions.find((entry) => entry.id === "sess-v1-only")!;
    expect(session.title).toBe("V1 leftover session");
    expect(session.projectPath).toBe("/Users/demo/legacy");
    expect(session.userTurns).toBe(1);
    expect(session.assistantTurns).toBe(1);
    expect(session.toolCalls).toBe(1);
    expect(session.model).toBe("opencode/x-preview");
  });

  test("loads truncated user prompts without assistant text", async () => {
    const source = createOpenCodeSource({ dbPath, which: () => null });
    const sessions = await february();
    const login = sessions.find((entry) => entry.id === "sess-login")!;
    expect(await source.getUserPrompts(login)).toEqual([
      "Fix the login redirect on the dashboard",
      "Also add a test",
    ]);

    const untitled = sessions.find((entry) => entry.id === "sess-untitled")!;
    expect(await source.getUserPrompts(untitled)).toEqual([
      '<skill name="testing">wrapped context</skill>',
      "Ship the heatmap",
    ]);

    const v1 = sessions.find((entry) => entry.id === "sess-v1-only")!;
    expect(await source.getUserPrompts(v1)).toEqual(["Migrate the leftover row"]);
  });

  test("unreadable database warns and returns no sessions", async () => {
    const source = createOpenCodeSource({
      dbPath: brokenPath,
      which: () => null,
    });
    const detection = await source.detect();
    expect(detection.installed).toBe(true);
    expect(detection.sessionCount).toBe(0);
    await expect(source.listSessions(new Date(2026, 1, 16), new Date(2026, 1, 22))).resolves.toEqual([]);
  });
});

function seedFixture(path: string): void {
  const db = new Database(path);
  db.exec(`
    CREATE TABLE session_v2 (
      id TEXT PRIMARY KEY,
      parent_id TEXT,
      directory TEXT,
      title TEXT,
      agent TEXT,
      model TEXT,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL
    );
    CREATE TABLE session_message (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      seq INTEGER NOT NULL,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL,
      data TEXT NOT NULL
    );
    CREATE TABLE session (
      id TEXT PRIMARY KEY,
      parent_id TEXT,
      directory TEXT,
      title TEXT,
      agent TEXT,
      model TEXT,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL
    );
    CREATE TABLE message (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL,
      data TEXT NOT NULL
    );
    CREATE TABLE part (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL,
      data TEXT NOT NULL
    );
  `);

  insertSession(db, "session_v2", {
    id: "sess-login",
    directory: "/Users/demo/git-activity",
    title: "Fix the login redirect",
    model,
    time_created: febStart,
    time_updated: febEnd,
  });
  insertMessage(db, "sess-login", 1, "user", febStart, {
    text: "Fix the login redirect on the dashboard",
    time: { created: febStart },
  });
  insertMessage(db, "sess-login", 2, "assistant", febStart + 60_000, {
    agent: "build",
    model: { providerID: "github-copilot", id: "grok-4.6" },
    content: [
      { type: "reasoning", text: "thinking that must not leak" },
      { type: "tool", tool: "Read" },
      { type: "text", text: "Patched the redirect" },
    ],
  });
  insertMessage(db, "sess-login", 3, "user", febStart + 120_000, {
    text: "Also add a test",
    time: { created: febStart + 120_000 },
  });
  insertMessage(db, "sess-login", 4, "assistant", febEnd, {
    agent: "build",
    content: [{ type: "text", text: "Added coverage" }],
  });
  insertMessage(db, "sess-login", 5, "synthetic", febEnd, {
    text: "Called the Read tool",
  });

  insertSession(db, "session_v2", {
    id: "sess-jan",
    directory: "/Users/demo/git-activity",
    title: "January only",
    model,
    time_created: janStart,
    time_updated: janEnd,
  });
  insertMessage(db, "sess-jan", 1, "user", janStart, {
    text: "Old work",
    time: { created: janStart },
  });

  insertSession(db, "session_v2", {
    id: "sess-child",
    parent_id: "sess-login",
    directory: "/Users/demo/git-activity",
    title: "Explore subagent",
    model,
    time_created: childStart,
    time_updated: childStart + 60_000,
  });
  insertMessage(db, "sess-child", 1, "user", childStart, {
    text: "Search the repo",
    time: { created: childStart },
  });

  insertSession(db, "session_v2", {
    id: "sess-untitled",
    directory: "/Users/demo/git-activity",
    title: "New session - 2026-02-16T12:00:00.000Z",
    model,
    time_created: untitledStart,
    time_updated: untitledEnd,
  });
  insertMessage(db, "sess-untitled", 1, "user", untitledStart, {
    text: '<skill name="testing">wrapped context</skill>',
    time: { created: untitledStart },
  });
  insertMessage(db, "sess-untitled", 2, "user", untitledStart + 30_000, {
    text: "Ship the heatmap",
    time: { created: untitledStart + 30_000 },
  });

  insertSession(db, "session", {
    id: "sess-v1-only",
    directory: "/Users/demo/legacy",
    title: "V1 leftover session",
    model: JSON.stringify({ id: "x-preview", providerID: "opencode" }),
    time_created: v1Start,
    time_updated: v1End,
  });
  db.query(
    `INSERT INTO message (id, session_id, time_created, time_updated, data)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    "msg-v1-user",
    "sess-v1-only",
    v1Start,
    v1Start,
    JSON.stringify({ role: "user", time: { created: v1Start } })
  );
  db.query(
    `INSERT INTO message (id, session_id, time_created, time_updated, data)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    "msg-v1-assistant",
    "sess-v1-only",
    v1Start + 60_000,
    v1End,
    JSON.stringify({ role: "assistant", time: { created: v1Start + 60_000 } })
  );
  db.query(
    `INSERT INTO part (id, message_id, session_id, time_created, time_updated, data)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    "part-v1-text",
    "msg-v1-user",
    "sess-v1-only",
    v1Start,
    v1Start,
    JSON.stringify({ type: "text", text: "Migrate the leftover row" })
  );
  db.query(
    `INSERT INTO part (id, message_id, session_id, time_created, time_updated, data)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    "part-v1-file",
    "msg-v1-user",
    "sess-v1-only",
    v1Start,
    v1Start,
    JSON.stringify({ type: "file", mime: "text/plain" })
  );
  db.query(
    `INSERT INTO part (id, message_id, session_id, time_created, time_updated, data)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    "part-v1-tool",
    "msg-v1-assistant",
    "sess-v1-only",
    v1Start + 60_000,
    v1End,
    JSON.stringify({ type: "tool", tool: "Read" })
  );

  db.close();
}

function insertSession(
  db: Database,
  table: "session_v2" | "session",
  row: {
    id: string;
    parent_id?: string;
    directory: string;
    title: string;
    model: string;
    time_created: number;
    time_updated: number;
  }
): void {
  db.query(
    `INSERT INTO ${table} (id, parent_id, directory, title, agent, model, time_created, time_updated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.id,
    row.parent_id ?? null,
    row.directory,
    row.title,
    "build",
    row.model,
    row.time_created,
    row.time_updated
  );
}

function insertMessage(
  db: Database,
  sessionId: string,
  seq: number,
  type: string,
  time: number,
  data: unknown
): void {
  db.query(
    `INSERT INTO session_message (id, session_id, type, seq, time_created, time_updated, data)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    `${sessionId}-msg-${seq}`,
    sessionId,
    type,
    seq,
    time,
    time,
    JSON.stringify(data)
  );
}
