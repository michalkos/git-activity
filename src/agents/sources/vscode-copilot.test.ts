import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createVscodeCopilotSource } from "./vscode-copilot.ts";

const workspaceStorage = join(
  import.meta.dir,
  "fixtures",
  "vscode",
  "workspaceStorage"
);
const source = createVscodeCopilotSource({
  workspaceStorageDirs: [workspaceStorage],
  which: () => null,
});

const february = () =>
  source.listSessions(new Date(2026, 1, 16), new Date(2026, 1, 22, 23, 59, 59, 999));

describe("vscode copilot chat adapter", () => {
  test("counts chat files across every workspace hash", async () => {
    const detection = await source.detect();
    expect(detection.installed).toBe(true);
    expect(detection.sessionCount).toBe(3);
    expect(detection.dataDir).toBe(workspaceStorage);
  });

  test("parses the snapshot format and resolves the workspace folder", async () => {
    const sessions = await february();
    const session = sessions.find((entry) => entry.id === "sess-vscode-json")!;
    expect(session.source).toBe("vscode-copilot");
    expect(session.title).toBe("Fix the login redirect");
    expect(session.projectPath).toBe("/Users/demo/git-activity");
    expect(session.projectName).toBe("git-activity");
    expect(session.model).toBe("copilot/gpt-5.6");
    expect(session.userTurns).toBe(2);
    expect(session.toolCalls).toBe(1);
  });

  test("starts at the first request, not at the day the panel was opened", async () => {
    const sessions = await february();
    const session = sessions.find((entry) => entry.id === "sess-vscode-json")!;
    expect(session.startedAt.toISOString()).toBe("2026-02-16T10:00:00.000Z");
    expect(session.endedAt.toISOString()).toBe("2026-02-16T10:05:00.000Z");
  });

  test("replays the append journal, including appended requests and responses", async () => {
    const sessions = await february();
    const session = sessions.find((entry) => entry.id === "sess-vscode-jsonl")!;
    expect(session.title).toBe("Journalled chat");
    expect(session.projectPath).toBe("/Users/demo/api");
    expect(session.userTurns).toBe(1);
    expect(session.toolCalls).toBe(2);
    expect(session.model).toBe("copilot/claude-sonnet-5");
    expect(session.endedAt.toISOString()).toBe("2026-02-16T10:10:00.000Z");
  });

  test("drops chats that were opened but never used", async () => {
    const sessions = await february();
    expect(sessions.map((entry) => entry.id)).not.toContain("sess-vscode-empty");
  });

  test("loads the prompts from both formats", async () => {
    const sessions = await february();
    const snapshot = sessions.find((entry) => entry.id === "sess-vscode-json")!;
    expect(await source.getUserPrompts(snapshot)).toEqual([
      "Fix the login redirect",
      "Also add a test",
    ]);
    expect(await source.getUserPrompt(snapshot, 1)).toBe("Also add a test");
    expect(await source.getUserPrompt(snapshot, 99)).toBeNull();
  });
});
