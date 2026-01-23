import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { GitRepo, RepoCache } from "./types.ts";

const CACHE_DIR = join(process.env.HOME || "", ".git-activity");
const CACHE_FILE = join(CACHE_DIR, "repos.json");
const CACHE_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

export async function loadCache(): Promise<RepoCache | null> {
  try {
    const content = await readFile(CACHE_FILE, "utf-8");
    const cache = JSON.parse(content) as RepoCache;
    // Convert date strings back to Date objects
    cache.lastUpdated = new Date(cache.lastUpdated);
    for (const repo of cache.repos) {
      if (repo.lastScanned) {
        repo.lastScanned = new Date(repo.lastScanned);
      }
    }
    return cache;
  } catch {
    return null;
  }
}

export async function saveCache(cache: RepoCache): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
  } catch (error) {
    console.error("Failed to save cache:", error);
  }
}

export async function clearCache(): Promise<void> {
  try {
    await unlink(CACHE_FILE);
  } catch {
    // File might not exist, that's fine
  }
}

export function isCacheValid(
  cache: RepoCache,
  scanPath: string,
  scanDepth: number
): boolean {
  // Check if scan parameters match
  if (cache.scanPath !== scanPath || cache.scanDepth !== scanDepth) {
    return false;
  }

  // Check if cache is too old
  const age = Date.now() - cache.lastUpdated.getTime();
  if (age > CACHE_MAX_AGE) {
    return false;
  }

  return true;
}

export function createCache(
  repos: GitRepo[],
  scanPath: string,
  scanDepth: number
): RepoCache {
  return {
    repos,
    lastUpdated: new Date(),
    scanPath,
    scanDepth,
  };
}

export async function getCachedRepos(
  scanPath: string,
  scanDepth: number,
  forceRefresh: boolean,
  scanFn: () => Promise<GitRepo[]>
): Promise<GitRepo[]> {
  if (!forceRefresh) {
    const cache = await loadCache();
    if (cache && isCacheValid(cache, scanPath, scanDepth)) {
      return cache.repos;
    }
  }

  // Scan and cache
  const repos = await scanFn();
  const newCache = createCache(repos, scanPath, scanDepth);
  await saveCache(newCache);

  return repos;
}
