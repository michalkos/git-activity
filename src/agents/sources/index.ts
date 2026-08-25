import type { AgentSource } from "./types.ts";
import { createClaudeSource } from "./claude.ts";
import { createCodexSource } from "./codex.ts";
import { createCopilotSource } from "./copilot.ts";
import { createCursorSource } from "./cursor.ts";
import { createPiSource } from "./pi.ts";
import { createVscodeCopilotSource } from "./vscode-copilot.ts";

export function createDefaultSources(): AgentSource[] {
  return [
    createClaudeSource(),
    createCursorSource(),
    createPiSource(),
    createCodexSource(),
    createCopilotSource(),
    createVscodeCopilotSource(),
  ];
}

export {
  createClaudeSource,
  createCodexSource,
  createCopilotSource,
  createCursorSource,
  createPiSource,
  createVscodeCopilotSource,
};
