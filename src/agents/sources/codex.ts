import { expandHome } from "../paths.ts";
import { countMatchingFiles, isDirectory } from "./fs.ts";
import type { AgentSource } from "./types.ts";

/**
 * Codex CLI sessions.
 * Layout: ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
 * Index: ~/.codex/session_index.jsonl. Archives: ~/.codex/archived_sessions/.
 *
 * v1: detection only. Session parsing is Phase 2.
 */
export function createCodexSource(): AgentSource {
  return {
    id: "codex",
    label: "Codex",
    async detect() {
      const binary = Bun.which("codex") ?? undefined;
      const dataDir = expandHome("~/.codex/sessions");
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
