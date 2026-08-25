import { join } from "node:path";
import { expandHome } from "../paths.ts";
import { countMatchingFiles, isDirectory } from "./fs.ts";
import type { AgentSource } from "./types.ts";

/**
 * GitHub Copilot CLI sessions (not VS Code Chat).
 * Layout: ~/.copilot/session-state/<uuid>/ with workspace.yaml + events.jsonl.
 * Summary DB: ~/.copilot/session-store.db. Override: COPILOT_HOME.
 *
 * v1: detection only. Session parsing is Phase 2.
 */
export function createCopilotSource(): AgentSource {
  return {
    id: "copilot",
    label: "GitHub Copilot CLI",
    async detect() {
      const binary = Bun.which("copilot") ?? undefined;
      const dataDir = resolveCopilotSessionDir();
      const hasDir = await isDirectory(dataDir);
      const sessionCount = hasDir
        ? await countMatchingFiles(dataDir, (name) => name === "workspace.yaml")
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

function resolveCopilotSessionDir(): string {
  const home = process.env.COPILOT_HOME
    ? expandHome(process.env.COPILOT_HOME)
    : expandHome("~/.copilot");
  return join(home, "session-state");
}
