import type { AgentActivity } from "../types.ts";
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

/** Includes sessions resumed during the range even if they were created earlier. */
export function overlapsRange(
  startedAt: Date,
  endedAt: Date,
  from: Date,
  to: Date
): boolean {
  return formatDateKey(startedAt) <= formatDateKey(to) &&
    formatDateKey(endedAt) >= formatDateKey(from);
}

/** Retains daily bounds and counts without retaining transcript content. */
export class DailyActivity {
  private days = new Map<string, AgentActivity>();

  add(timestamp: Date | undefined, counts: Partial<Pick<AgentActivity, "userTurns" | "assistantTurns" | "toolCalls">> = {}) {
    if (!timestamp) return;
    const key = formatDateKey(timestamp);
    const day = this.days.get(key) ?? {
      startedAt: timestamp, endedAt: timestamp,
      userTurns: 0, assistantTurns: 0, toolCalls: 0,
    };
    if (timestamp < day.startedAt) day.startedAt = timestamp;
    if (timestamp > day.endedAt) day.endedAt = timestamp;
    day.userTurns += counts.userTurns ?? 0;
    day.assistantTurns += counts.assistantTurns ?? 0;
    day.toolCalls += counts.toolCalls ?? 0;
    this.days.set(key, day);
  }

  values(): AgentActivity[] {
    return [...this.days.values()];
  }
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
 * Collects extracted user texts from a JSONL transcript. Pass `cap` to truncate
 * each string for the session-detail index; omit it for the full text.
 */
export async function collectUserTexts<T>(
  filePath: string,
  extract: (line: T) => string | null,
  cap?: number
): Promise<string[]> {
  const prompts: string[] = [];
  for await (const line of readJsonLines<T>(filePath)) {
    const text = extract(line);
    if (!text) {
      continue;
    }
    prompts.push(cap === undefined ? text : truncate(text, cap));
  }
  return prompts;
}

/** Untruncated text at `index` in extract order; null when the index does not exist. */
export async function nthUserText<T>(
  filePath: string,
  extract: (line: T) => string | null,
  index: number
): Promise<string | null> {
  if (!Number.isInteger(index) || index < 0) {
    return null;
  }
  let seen = 0;
  for await (const line of readJsonLines<T>(filePath)) {
    const text = extract(line);
    if (!text) {
      continue;
    }
    if (seen === index) {
      return text;
    }
    seen += 1;
  }
  return null;
}

/**
 * Agents wrap prompts in synthetic blocks (skills, IDE context, slash-command
 * expansions). Those make terrible titles, so prefer a prompt that is not one.
 */
export function isWrappedPrompt(text: string): boolean {
  return text.startsWith("<") || text.startsWith("## Referenced ");
}
