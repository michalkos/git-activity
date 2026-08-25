import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { editorAppSupportDir } from "../paths.ts";
import { countMatchingFiles, isDirectory } from "./fs.ts";
import type { AgentSource } from "./types.ts";

/**
 * VS Code GitHub Copilot Chat.
 * Layout: {Code}/User/workspaceStorage/<hash>/chatSessions/*.json
 * Also probes VS Code Insiders (`Code - Insiders`) as the same source.
 *
 * v1: detection only. Session parsing is Phase 3.
 */
export function createVscodeCopilotSource(): AgentSource {
  return {
    id: "vscode-copilot",
    label: "VS Code Copilot Chat",
    async detect() {
      const binary =
        Bun.which("code") ?? Bun.which("code-insiders") ?? undefined;
      const candidates = [
        join(editorAppSupportDir("Code"), "User", "workspaceStorage"),
        join(editorAppSupportDir("Code - Insiders"), "User", "workspaceStorage"),
      ];

      let dataDir: string | undefined;
      let sessionCount = 0;
      for (const dir of candidates) {
        if (!(await isDirectory(dir))) {
          continue;
        }
        const count = await countVscodeChatSessions(dir);
        if (!dataDir || count > sessionCount) {
          dataDir = dir;
          sessionCount = count;
        }
      }

      return {
        installed: Boolean(binary) || Boolean(dataDir),
        dataDir,
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

async function countVscodeChatSessions(workspaceStorage: string): Promise<number> {
  let count = 0;
  let hashes;
  try {
    hashes = await readdir(workspaceStorage, { withFileTypes: true });
  } catch {
    return 0;
  }

  for (const hash of hashes) {
    if (!hash.isDirectory()) {
      continue;
    }
    const chatDir = join(workspaceStorage, hash.name, "chatSessions");
    count += await countMatchingFiles(chatDir, (name) => name.endsWith(".json"));
  }

  return count;
}
