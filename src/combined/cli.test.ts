import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const cli = join(import.meta.dir, "../index.ts");
const root = join(import.meta.dir, "../..");

async function runAll(args: string[]): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  const proc = Bun.spawn(["bun", "run", cli, "all", ...args], {
    cwd: root,
    env: { ...process.env, GIT_ACTIVITY_AUTHORS: "nobody@example.com" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

describe("all CLI", () => {
  test("--json prints only the report, with scan progress on stderr", async () => {
    const result = await runAll([
      "--agents",
      "claude",
      "--json",
      "--path",
      root,
      "--from",
      "2026-02-16",
      "--to",
      "2026-02-22",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("Scanning for repositories");
    const parsed = JSON.parse(result.stdout);
    expect(typeof parsed.totalHours).toBe("number");
    expect(typeof parsed.gitHours).toBe("number");
    expect(typeof parsed.agentHours).toBe("number");
    expect(Array.isArray(parsed.projects)).toBe(true);
  });
});
