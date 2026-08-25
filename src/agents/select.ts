import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { join } from "node:path";
import { CACHE_DIR } from "../cache.ts";
import {
  isAgentSourceId,
  type AgentConfig,
  type AgentSourceId,
} from "./types.ts";

export function agentConfigPath(): string {
  return join(CACHE_DIR, "agents.json");
}

export async function loadAgentConfig(
  path: string = agentConfigPath()
): Promise<AgentConfig | null> {
  try {
    const content = await readFile(path, "utf-8");
    const parsed = JSON.parse(content) as { enabled?: unknown };
    if (!Array.isArray(parsed.enabled)) {
      return null;
    }
    const enabled = parsed.enabled.filter(
      (id): id is AgentSourceId =>
        typeof id === "string" && isAgentSourceId(id)
    );
    return { enabled };
  } catch {
    return null;
  }
}

export async function saveAgentConfig(
  config: AgentConfig,
  path: string = agentConfigPath()
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

export function parseAgentIds(raw: string): AgentSourceId[] {
  const ids = raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  const unknown = ids.filter((id) => !isAgentSourceId(id));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown agent${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}. Known: claude, cursor, pi, codex, copilot, vscode-copilot`
    );
  }

  return ids as AgentSourceId[];
}
