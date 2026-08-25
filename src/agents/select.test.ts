import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseAgentIds, loadAgentConfig, saveAgentConfig } from "./select.ts";
import { formatDetectionTable } from "./detect.ts";
import type { DetectedAgent } from "./types.ts";

describe("parseAgentIds", () => {
  test("parses a comma-separated list", () => {
    expect(parseAgentIds("claude, pi,cursor")).toEqual([
      "claude",
      "pi",
      "cursor",
    ]);
  });

  test("rejects unknown ids", () => {
    expect(() => parseAgentIds("claude,windsurf")).toThrow(/Unknown agent/);
  });
});

describe("agent config", () => {
  test("round-trips enabled sources and drops unknown ids", async () => {
    const dir = await mkdtemp(join(tmpdir(), "git-activity-agents-"));
    const path = join(dir, "agents.json");
    await saveAgentConfig({ enabled: ["claude", "cursor"] }, path);
    const raw = await readFile(path, "utf-8");
    expect(JSON.parse(raw)).toEqual({ enabled: ["claude", "cursor"] });

    await Bun.write(
      path,
      JSON.stringify({ enabled: ["claude", "nope", "pi"] })
    );
    const loaded = await loadAgentConfig(path);
    expect(loaded).toEqual({ enabled: ["claude", "pi"] });
  });
});

describe("formatDetectionTable", () => {
  test("renders installed and missing rows", () => {
    const detections: DetectedAgent[] = [
      {
        id: "claude",
        label: "Claude Code",
        detection: {
          installed: true,
          dataDir: "/home/demo/.claude/projects",
          sessionCount: 42,
        },
      },
      {
        id: "copilot",
        label: "GitHub Copilot CLI",
        detection: { installed: false, sessionCount: 0 },
      },
    ];
    const table = formatDetectionTable(detections);
    expect(table).toContain("claude");
    expect(table).toContain("installed");
    expect(table).toContain("42 sessions");
    expect(table).toContain("copilot");
    expect(table).toContain("missing");
    expect(table).toContain("—");
  });
});
