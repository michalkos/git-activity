import { homedir } from "node:os";
import { join } from "node:path";
import { expandPath } from "../scanner.ts";

export function homeDir(): string {
  return process.env.HOME || homedir();
}

export function expandHome(path: string): string {
  return expandPath(path);
}

export function editorAppSupportDir(appName: string): string {
  switch (process.platform) {
    case "darwin":
      return join(homeDir(), "Library", "Application Support", appName);
    case "win32":
      return join(
        process.env.APPDATA || join(homeDir(), "AppData", "Roaming"),
        appName
      );
    default:
      return join(homeDir(), ".config", appName);
  }
}

export function shortenHome(path: string): string {
  const home = homeDir();
  if (home && (path === home || path.startsWith(home + "/") || path.startsWith(home + "\\"))) {
    return "~" + path.slice(home.length);
  }
  return path;
}

export function projectNameFromPath(projectPath: string): string {
  const parts = projectPath.split(/[/\\]/).filter(Boolean);
  return parts.at(-1) || projectPath;
}
