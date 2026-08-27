import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createPiSource } from "./pi.ts";

const sessionsDir = join(import.meta.dir, "fixtures", "pi", "sessions");
const source = createPiSource({ sessionsDir, which: () => null });

const february = () =>
  source.listSessions(new Date(2026, 1, 16), new Date(2026, 1, 22, 23, 59, 59, 999));

describe("pi adapter", () => {
  test("detects the fixture directory without a binary", async () => {
    const detection = await source.detect();
    expect(detection.installed).toBe(true);
    expect(detection.sessionCount).toBe(2);
    expect(detection.dataDir).toBe(sessionsDir);
  });

  test("reads cwd and timing from the session header, skipping bad lines", async () => {
    const sessions = await february();
    expect(sessions).toHaveLength(1);
    const session = sessions[0]!;
    expect(session.id).toBe("sess-pi");
    expect(session.source).toBe("pi");
    expect(session.projectPath).toBe("/Users/demo/git-activity");
    expect(session.projectName).toBe("git-activity");
    expect(session.model).toBe("glm-5.2");
    expect(session.startedAt.toISOString()).toBe("2026-02-16T10:00:00.000Z");
    expect(session.endedAt.toISOString()).toBe("2026-02-16T10:30:00.000Z");
  });

  test("titles skip wrapped context blocks and collapse newlines", async () => {
    const [session] = await february();
    expect(session!.title).toBe("Fix the login redirect");
    expect(session!.userTurns).toBe(2);
    expect(session!.assistantTurns).toBe(2);
    expect(session!.toolCalls).toBe(1);
  });

  test("filters by start date", async () => {
    const january = await source.listSessions(
      new Date(2026, 0, 1),
      new Date(2026, 0, 31, 23, 59, 59, 999)
    );
    expect(january.map((session) => session.id)).toEqual(["sess-pi-jan"]);
  });

  test("loads user prompts without assistant text", async () => {
    const [session] = await february();
    expect(await source.getUserPrompts(session!)).toEqual([
      '<skill name="testing">wrapped context</skill>',
      "Fix the\nlogin redirect",
    ]);
  });
});
