import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { editorAppSupportDir, expandHome } from "../paths.ts";
import { countMatchingFiles, isDirectory } from "./fs.ts";
import type { AgentSource } from "./types.ts";

/**
 * Cursor agent transcripts.
 * v1 source of truth: ~/.cursor/projects/<id>/agent-transcripts/ (jsonl files, nested).
 * Chat DBs (~/.cursor/chats/<id>/<id>/store.db) and composer state.vscdb are later.
 *
 * v1: detection only. Session parsing is Phase 3.
 */
export function createCursorSource(): AgentSource {
  return {
    id: "cursor",
    label: "Cursor",
    async detect() {
      const binary = Bun.which("cursor") ?? undefined;
      const cursorHome = expandHome("~/.cursor");
      const cursorUser = editorAppSupportDir("Cursor");
      const hasHome = await isDirectory(cursorHome);
      const hasUser = await isDirectory(cursorUser);
      const dataDir = hasHome ? cursorHome : hasUser ? cursorUser : undefined;
      const sessionCount = hasHome ? await countCursorTranscripts(cursorHome) : 0;

      return {
        installed: Boolean(binary) || hasHome || hasUser,
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

async function countCursorTranscripts(cursorHome: string): Promise<number> {
  const projectsDir = join(cursorHome, "projects");
  let count = 0;
  let projects;
  try {
    projects = await readdir(projectsDir, { withFileTypes: true });
  } catch {
    return 0;
  }

  for (const project of projects) {
    if (!project.isDirectory()) {
      continue;
    }
    const transcripts = join(projectsDir, project.name, "agent-transcripts");
    count += await countMatchingFiles(transcripts, (name) =>
      name.endsWith(".jsonl")
    );
  }

  return count;
}
