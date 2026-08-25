import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const cli = join(import.meta.dir, "../index.ts");

async function runAgents(args: string[]): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  const proc = Bun.spawn(["bun", "run", cli, "agents", ...args], {
    cwd: join(import.meta.dir, "../.."),
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

describe("agents CLI", () => {
  test("--json prints a report instead of the TUI", async () => {
    const result = await runAgents([
      "--agents",
      "claude",
      "--json",
      "--from",
      "2026-02-16",
      "--to",
      "2026-02-22",
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"totalSessions"');
    expect(result.stdout).not.toContain("Navigate");
    const parsed = JSON.parse(result.stdout);
    expect(typeof parsed.totalHours).toBe("number");
  });

  test("--list prints detection rows", async () => {
    const result = await runAgents(["--list"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("claude");
    expect(result.stdout).toContain("cursor");
  });
});
