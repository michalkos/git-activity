import { describe, expect, test } from "bun:test";
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
    expect(session.userTurns).toBe(0);
    expect(session.toolCalls).toBe(1);
  });

  test("only opens the date shards inside the range", async () => {
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
  });
});
