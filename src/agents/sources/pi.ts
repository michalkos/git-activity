import { join } from "node:path";
import { expandHome } from "../paths.ts";
import { countMatchingFiles, isDirectory } from "./fs.ts";
import type { AgentSource } from "./types.ts";

/**
 * Pi coding agent sessions.
 * Layout: ~/.pi/agent/sessions/--<cwd-with-slashes-as-dashes>--/<timestamp>_<uuid>.jsonl
 * Header line: { type: "session", cwd, timestamp, id }.
 * Overrides: PI_CODING_AGENT_SESSION_DIR, PI_CODING_AGENT_DIR.
 *
 * v1: detection only. Session parsing is Phase 2.
 */
export function createPiSource(): AgentSource {
  return {
    id: "pi",
    label: "Pi",
    async detect() {
      const binary = Bun.which("pi") ?? undefined;
      const dataDir = resolvePiSessionsDir();
      const hasDir = await isDirectory(dataDir);
      const sessionCount = hasDir
        ? await countMatchingFiles(dataDir, (name) => name.endsWith(".jsonl"))
        : 0;
      return {
        installed: Boolean(binary) || hasDir,
        dataDir: hasDir ? dataDir : undefined,
        binary,
        sessionCount,
      };
    },
    async listSessions() {
      return [];
    },
    async getUserPrompts() {
      return [];
    },
  };
}

function resolvePiSessionsDir(): string {
  if (process.env.PI_CODING_AGENT_SESSION_DIR) {
    return expandHome(process.env.PI_CODING_AGENT_SESSION_DIR);
  }
  const root = process.env.PI_CODING_AGENT_DIR
    ? expandHome(process.env.PI_CODING_AGENT_DIR)
    : expandHome("~/.pi");
  return join(root, "agent", "sessions");
}
