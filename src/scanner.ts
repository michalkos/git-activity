import { readdir, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import type { GitRepo } from "./types.ts";

const EXCLUDE_DIRS = new Set([
  "node_modules",
  ".cache",
  ".npm",
  ".yarn",
  "vendor",
  "dist",
  "build",
  ".git",
  "__pycache__",
  ".venv",
  "venv",
  ".Trash",
  "Library",
  "Applications",
]);

export async function scanForRepos(
  basePath: string,
  maxDepth: number = 3
): Promise<GitRepo[]> {
  const repos: GitRepo[] = [];
  const expandedPath = basePath.replace(/^~/, process.env.HOME || "");

  await scanDirectory(expandedPath, 0, maxDepth, repos);

  return repos;
}

async function scanDirectory(
  dirPath: string,
  currentDepth: number,
  maxDepth: number,
  repos: GitRepo[]
): Promise<void> {
  if (currentDepth > maxDepth) {
    return;
  }

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });

    // Check if this directory contains a .git folder
    const hasGit = entries.some(
      (entry) => entry.isDirectory() && entry.name === ".git"
    );

    if (hasGit) {
      repos.push({
        path: dirPath,
        name: basename(dirPath),
        lastScanned: new Date(),
      });
      // Don't recurse into git repos (they might have submodules, but we skip those)
      return;
    }

    // Recurse into subdirectories
    const subdirs = entries.filter(
      (entry) => entry.isDirectory() && !EXCLUDE_DIRS.has(entry.name) && !entry.name.startsWith(".")
    );

    await Promise.all(
      subdirs.map((subdir) =>
        scanDirectory(
          join(dirPath, subdir.name),
          currentDepth + 1,
          maxDepth,
          repos
        )
      )
    );
  } catch (error) {
    // Skip directories we can't read (permissions, etc.)
  }
}

export function expandPath(path: string): string {
  return path.replace(/^~/, process.env.HOME || "");
}
