import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createCopilotSource } from "./copilot.ts";

const sessionStateDir = join(
  import.meta.dir,
  "fixtures",
  "copilot",
  "session-state"
);
const source = createCopilotSource({ sessionStateDir, which: () => null });

const february = () =>
  source.listSessions(new Date(2026, 1, 16), new Date(2026, 1, 22, 23, 59, 59, 999));

describe("copilot cli adapter", () => {
  test("detects the fixture directory without a binary", async () => {
    const detection = await source.detect();
    expect(detection.installed).toBe(true);
    expect(detection.sessionCount).toBe(2);
    expect(detection.dataDir).toBe(sessionStateDir);
  });

  test("reads workspace.yaml and counts turns from the event log", async () => {
    const sessions = await february();
    expect(sessions).toHaveLength(1);
    const session = sessions[0]!;
    expect(session.id).toBe("sess-copilot");
    expect(session.source).toBe("copilot");
    expect(session.title).toBe("Fix the login redirect #attachment:Pasted text #1");
    expect(session.projectPath).toBe("/Users/demo/git-activity");
    expect(session.model).toBe("claude-sonnet-4.6");
    expect(session.userTurns).toBe(2);
    expect(session.assistantTurns).toBe(2);
    expect(session.toolCalls).toBe(1);
  });

  test("ends at the last event, not at updated_at", async () => {
    // updated_at moves when Copilot merely relists the session, so a live event
    // log always wins — here it runs 40 minutes past the recorded stamp.
    const [session] = await february();
    expect(session!.startedAt.toISOString()).toBe("2026-02-16T10:00:00.000Z");
    expect(session!.endedAt.toISOString()).toBe("2026-02-16T10:45:00.000Z");
  });

  test("keeps sessions that have no event log and skips directories without one", async () => {
    const january = await source.listSessions(
      new Date(2026, 0, 1),
      new Date(2026, 0, 31, 23, 59, 59, 999)
    );
    expect(january).toHaveLength(1);
    expect(january[0]!.id).toBe("sess-copilot-jan");
    expect(january[0]!.userTurns).toBe(0);
    expect(january[0]!.endedAt.toISOString()).toBe("2026-01-05T09:30:00.000Z");
  });

  test("loads the typed prompts, not the context-wrapped copies", async () => {
    const [session] = await february();
    expect(await source.getUserPrompts(session!)).toEqual([
      "Fix the login redirect",
      "Also add a test",
    ]);
    expect(await source.getUserPrompt(session!, 1)).toBe("Also add a test");
    expect(await source.getUserPrompt(session!, 99)).toBeNull();
  });
});
