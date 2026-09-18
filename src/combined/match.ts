import type { GitRepo } from "../types.ts";

/** True when `child` is `parent` or sits inside it, respecting path boundaries. */
export function isUnder(child: string, parent: string): boolean {
  const a = stripTrailingSeparator(child);
  const b = stripTrailingSeparator(parent);
  if (a === b) return true;
  return a.startsWith(b + "/") || a.startsWith(b + "\\");
}

/**
 * Attributes an agent working directory to a git repo. Agents run from anywhere
 * inside a checkout, so the deepest repo containing the cwd wins — nested repos
 * (submodules, monorepo packages) map to the inner one, matching `git log`.
 */
export function matchRepo(projectPath: string, repos: GitRepo[]): GitRepo | null {
  let best: GitRepo | null = null;

  for (const repo of repos) {
    if (!isUnder(projectPath, repo.path)) continue;
    if (!best || repo.path.length > best.path.length) {
      best = repo;
    }
  }

  return best;
}

function stripTrailingSeparator(path: string): string {
  return path.length > 1 ? path.replace(/[/\\]+$/, "") : path;
}
