import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCursorSource } from "./cursor.ts";
import type { AgentSession } from "../types.ts";

/**
 * Cursor transcripts carry no timestamps, so the adapter times sessions from the
 * files themselves and decodes the project path against the real filesystem.
 * The fixture therefore has to be a live directory tree, not a checked-in one.
 */
let root: string;
let sessions: AgentSession[];

const transcript = [
  {
    role: "user",
    message: {
      content: [
        {
          type: "text",
          text: "<timestamp>Monday, Feb 16, 2026, 10:00 AM (UTC+1)</timestamp>\n<user_query>\nFix the login\nredirect\n</user_query>",
        },
      ],
    },
  },
  {
    role: "assistant",
    message: {
      content: [
        { type: "text", text: "Looking." },
        { type: "tool_use", name: "Grep" },
        { type: "tool_use", name: "Read" },
      ],
    },
  },
  {
    role: "user",
    message: { content: [{ type: "tool_result", text: "ignored" }] },
  },
  { type: "turn_ended", status: "completed" },
];

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "git-activity-cursor-"));

  // A project whose real name contains both a dash and a dot, which the Cursor
  // directory name flattens away.
  const projectPath = join(root, "work", "acme-web.app");
  await Bun.write(join(projectPath, ".keep"), "");

  const encoded = `${root.slice(1).replace(/[^A-Za-z0-9]/g, "-")}-work-acme-web-app`;
  const sessionDir = join(
    root,
    "cursor",
    "projects",
    encoded,
    "agent-transcripts",
    "sess-cursor"
  );
  await Bun.write(
    join(sessionDir, "sess-cursor.jsonl"),
    transcript.map((line) => JSON.stringify(line)).join("\n") + "\n"
  );
  await Bun.write(
    join(sessionDir, "subagents", "sub-1.jsonl"),
    JSON.stringify({ role: "assistant", message: { content: [] } }) + "\n"
  );

  const source = createCursorSource({
    cursorHome: join(root, "cursor"),
    which: () => null,
  });
  const today = new Date();
  sessions = await source.listSessions(today, today);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("cursor adapter", () => {
  test("counts session directories, not transcript files", async () => {
    const detection = await createCursorSource({
      cursorHome: join(root, "cursor"),
      which: () => null,
    }).detect();
    expect(detection.installed).toBe(true);
    expect(detection.sessionCount).toBe(1);
  });

  test("decodes the project path against the filesystem", () => {
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.projectPath).toBe(join(root, "work", "acme-web.app"));
    expect(sessions[0]!.projectName).toBe("acme-web.app");
  });

  test("titles from the user query, dropping the timestamp wrapper", () => {
    const session = sessions[0]!;
    expect(session.id).toBe("sess-cursor");
    expect(session.source).toBe("cursor");
    expect(session.title).toBe("Fix the login redirect");
    expect(session.userTurns).toBe(1);
    expect(session.assistantTurns).toBe(1);
    expect(session.toolCalls).toBe(2);
  });

  test("times the session from the files it wrote", () => {
    const session = sessions[0]!;
    expect(session.endedAt.getTime()).toBeGreaterThanOrEqual(
      session.startedAt.getTime()
    );
    expect(Date.now() - session.startedAt.getTime()).toBeLessThan(60_000);
  });

  test("loads user prompts without tool results", async () => {
    const source = createCursorSource({
      cursorHome: join(root, "cursor"),
      which: () => null,
    });
    expect(await source.getUserPrompts(sessions[0]!)).toEqual([
      "Fix the login\nredirect",
    ]);
  });
});
