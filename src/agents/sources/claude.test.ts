import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createClaudeSource } from "./claude.ts";

const fixtureProjects = join(import.meta.dir, "fixtures", "claude", "projects");

describe("claude adapter", () => {
  const source = createClaudeSource({
    projectsDir: fixtureProjects,
    which: () => null,
  });

  test("detects the fixture directory without a binary", async () => {
    const detection = await source.detect();
    expect(detection.installed).toBe(true);
    expect(detection.sessionCount).toBe(3);
    expect(detection.dataDir).toBe(fixtureProjects);
  });

  test("parses metadata from a golden jsonl session", async () => {
    const sessions = await source.listSessions(
      new Date(2026, 1, 16),
      new Date(2026, 1, 22, 23, 59, 59, 999)
    );
    expect(sessions).toHaveLength(1);
    const session = sessions[0]!;
    expect(session.id).toBe("sess-login");
    expect(session.source).toBe("claude");
    expect(session.title).toBe("Fix the login redirect");
    expect(session.projectPath).toBe("/Users/demo/git-activity");
    expect(session.projectName).toBe("git-activity");
    expect(session.userTurns).toBe(2);
    expect(session.assistantTurns).toBe(3);
    expect(session.toolCalls).toBe(1);
    expect(session.model).toBe("claude-opus-4-6");
    expect(session.startedAt.toISOString()).toBe("2026-02-16T10:00:00.000Z");
    expect(session.endedAt.toISOString()).toBe("2026-02-16T11:30:00.000Z");
  });

  test("filters by start date and skips broken files", async () => {
    const january = await source.listSessions(
      new Date(2026, 0, 1),
      new Date(2026, 0, 31, 23, 59, 59, 999)
    );
    expect(january).toHaveLength(1);
    expect(january[0]?.id).toBe("sess-jan");
  });

  test("loads truncated user prompts without tool results", async () => {
    const sessions = await source.listSessions(
      new Date(2026, 1, 16),
      new Date(2026, 1, 22, 23, 59, 59, 999)
    );
    const prompts = await source.getUserPrompts(sessions[0]!);
    expect(prompts).toEqual([
      "Fix the login redirect on the dashboard",
      "Also add a test",
    ]);
  });
});
