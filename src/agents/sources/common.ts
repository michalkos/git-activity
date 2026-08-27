import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import { formatDateKey } from "../../time-estimator.ts";

export const TITLE_MAX = 80;
export const PROMPT_MAX = 200;

/**
 * Streams a JSONL file one parsed line at a time so adapters never load a whole
 * transcript into memory. Unparseable lines invoke `onMalformed` and are skipped.
 */
export async function* readJsonLines<T>(
  filePath: string,
  onMalformed: () => void = () => {}
): AsyncGenerator<T> {
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      try {
        yield JSON.parse(trimmed) as T;
      } catch {
        onMalformed();
      }
    }
  } finally {
    rl.close();
  }
}

/** Accepts ISO strings and epoch milliseconds; returns undefined for anything unusable. */
export function parseTimestamp(
  value: string | number | null | undefined
): Date | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Cheap pre-filter: a file last written before `from` cannot hold sessions in range. */
export async function isUntouchedSince(
  filePath: string,
  from: Date
): Promise<boolean> {
  try {
    const info = await stat(filePath);
    return info.mtime.getTime() < from.getTime();
  } catch {
    return false;
  }
}

/**
 * Creation and last-write times, used by adapters whose transcripts carry no
 * timestamps of their own (Cursor). `birth` falls back to mtime on filesystems
 * that do not record it.
 */
export async function fileTimes(
  filePath: string
): Promise<{ birth: Date; modified: Date } | null> {
  try {
    const info = await stat(filePath);
    const modified = info.mtime;
    const birthMs = info.birthtime.getTime();
    const birth =
      Number.isNaN(birthMs) || birthMs === 0 ? modified : info.birthtime;
    return { birth, modified };
  } catch {
    return null;
  }
}

/** Sessions belong to the day they started on, matching how git commits are bucketed. */
export function startedInRange(
  startedAt: Date,
  from: Date,
  to: Date
): boolean {
  const key = formatDateKey(startedAt);
  return key >= formatDateKey(from) && key <= formatDateKey(to);
}

/** Session titles land in single-line table rows and CSV cells. */
export function titleFrom(value: string): string {
  return truncate(value.replace(/\s+/g, " ").trim(), TITLE_MAX);
}

export function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return value.slice(0, maxLength - 3) + "...";
}

/**
 * Agents wrap prompts in synthetic blocks (skills, IDE context, slash-command
 * expansions). Those make terrible titles, so prefer a prompt that is not one.
 */
export function isWrappedPrompt(text: string): boolean {
  return text.startsWith("<") || text.startsWith("## Referenced ");
}
