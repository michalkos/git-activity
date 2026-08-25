import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function isDirectory(path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    return info.isDirectory();
  } catch {
    return false;
  }
}

export async function countMatchingFiles(
  root: string,
  matches: (name: string) => boolean
): Promise<number> {
  let count = 0;
  const stack = [root];

  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        stack.push(join(dir, entry.name));
      } else if (entry.isFile() && matches(entry.name)) {
        count++;
      }
    }
  }

  return count;
}
