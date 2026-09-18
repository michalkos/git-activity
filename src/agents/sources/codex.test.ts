import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { buildAgentReport } from "../report.ts";
import { sessionKey } from "../session.ts";
import { join } from "node:path";
import { createCodexSource } from "./codex.ts";

const codexHome = join(import.meta.dir, "fixtures", "codex");
const source = createCodexSource({ codexHome, which: () => null });

const february = () =>
  source.listSessions(new Date(2026, 1, 16), new Date(2026, 1, 22, 23, 59, 59, 999));

describe("codex adapter", () => {
  test("detects the fixture directory without a binary", async () => {
    const detection = await source.detect();
    expect(detection.installed).toBe(true);
    expect(detection.sessionCount).toBe(3);
    expect(detection.dataDir).toBe(join(codexHome, "sessions"));
  });

  test("parses a rollout and titles it from the session index", async () => {
    const sessions = await february();
    const session = sessions.find((entry) => entry.id === "sess-codex")!;
    expect(session.source).toBe("codex");
    expect(session.title).toBe("Named by the index");
    expect(session.projectPath).toBe("/Users/demo/git-activity");
    expect(session.model).toBe("gpt-5.6-sol");
    expect(session.userTurns).toBe(2);
    expect(session.assistantTurns).toBe(1);
    expect(session.toolCalls).toBe(1);
    expect(session.startedAt.toISOString()).toBe("2026-02-16T10:00:00.000Z");
    expect(session.endedAt.toISOString()).toBe("2026-02-16T10:45:00.000Z");
  });

  test("falls back to the replayed transcript when there are no user_message events", async () => {
    const sessions = await february();
    const session = sessions.find((entry) => entry.id === "sess-codex-replay")!;
    expect(session.title).toBe("Title from the replayed transcript");
    expect(session.userTurns).toBe(1);
    expect(session.assistantTurns).toBe(1);
    expect(await source.getUserPrompts(session)).toEqual(["Title from the replayed transcript"]);
    expect(await source.getUserPrompt(session, 0)).toBe("Title from the replayed transcript");
    expect(await source.getUserPrompt(session, 1)).toBeNull();
    expect(session.activity?.reduce((sum, day) => sum + day.userTurns, 0)).toBe(1);
    expect(session.toolCalls).toBe(1);
  });

  test("returns only sessions active inside the range", async () => {
    const january = await source.listSessions(
      new Date(2026, 0, 5),
      new Date(2026, 0, 5, 23, 59, 59, 999)
    );
    expect(january.map((session) => session.id)).toEqual(["sess-codex-jan"]);
  });

  test("loads the typed prompts only", async () => {
    const sessions = await february();
    const session = sessions.find((entry) => entry.id === "sess-codex")!;
    expect(await source.getUserPrompts(session)).toEqual([
      "Fix the login redirect",
      "Also add a test",
    ]);
    expect(await source.getUserPrompt(session, 1)).toBe("Also add a test");
    expect(await source.getUserPrompt(session, 99)).toBeNull();
  });
});


test("finds resumed rollouts in old shards and distinguishes files with the same thread ID", async () => {
  const home = await mkdtemp(join(tmpdir(), "git-activity-resumed-"));
  try {
    const dir = join(home, "sessions", "2026", "02", "13");
    await mkdir(dir, { recursive: true });
    const first = join(dir, "first.jsonl");
    const resumed = join(dir, "resumed.jsonl");
    const meta = { timestamp: "2026-02-13T10:00:00Z", type: "session_meta", payload: { id: "shared-thread", cwd: "/demo" } };
    const message = (timestamp: string, text: string) => ({ timestamp, type: "event_msg", payload: { type: "user_message", message: text } });
    const done = (timestamp: string) => ({ timestamp, type: "event_msg", payload: { type: "agent_message" } });
    await writeFile(first, [meta, message("2026-02-13T10:00:00Z", "First rollout"), done("2026-02-13T11:00:00Z")].map((line) => JSON.stringify(line)).join("\n"));
    await writeFile(resumed, [meta, message("2026-02-13T12:00:00Z", "Resumed rollout"), done("2026-02-13T13:00:00Z"), message("2026-02-16T09:00:00Z", "Monday follow-up"), done("2026-02-16T10:00:00Z")].map((line) => JSON.stringify(line)).join("\n"));
    const adapter = createCodexSource({ codexHome: home, which: () => null });
    const monday = new Date("2026-02-16T00:00:00Z");
    const mondaySessions = await adapter.listSessions(monday, monday);
    expect(mondaySessions).toHaveLength(1);
    const report = buildAgentReport(mondaySessions, monday, monday);
    const day = report.projects[0]!.days.get("2026-02-16")!;
    expect(day.estimatedHours).toBe(1);
    expect(day.sessions[0]!.userTurns).toBe(1);
    expect(day.sessions[0]!.assistantTurns).toBe(1);

    const friday = new Date("2026-02-13T00:00:00Z");
    const sessions = await adapter.listSessions(friday, monday);
    const week = buildAgentReport(sessions, friday, monday);
    expect([...week.projects[0]!.days.keys()]).toEqual(["2026-02-13", "2026-02-16"]);
    const rows = week.projects[0]!.days.get("2026-02-13")!.sessions;
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map(sessionKey)).size).toBe(2);
    const selected = rows.find((row) => sessionKey(row) === sessionKey(rows[1]!))!;
    expect(await adapter.getUserPrompt(selected, 0)).toBe("Resumed rollout");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
