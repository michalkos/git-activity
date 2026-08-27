import { intervalWithMinimum, roundHours } from "../agents/hours.ts";
import type { AgentSession, AgentSourceId } from "../agents/types.ts";

/** Layout arithmetic for the agent session views, kept out of the components. */

export interface SessionGroup {
  source: AgentSourceId;
  /** `index` is the flat selection index across all groups, in render order. */
  items: Array<{ session: AgentSession; index: number }>;
}

/**
 * Groups a day's sessions by the agent that produced them, so the source name is
 * a header instead of a column repeated on every row.
 */
export function groupSessionsBySource(sessions: AgentSession[]): SessionGroup[] {
  const bySource = new Map<AgentSourceId, AgentSession[]>();

  for (const session of sessions) {
    const existing = bySource.get(session.source);
    if (existing) {
      existing.push(session);
    } else {
      bySource.set(session.source, [session]);
    }
  }

  const sources = Array.from(bySource.keys()).sort();
  let index = 0;

  return sources.map((source) => {
    const sorted = [...bySource.get(source)!].sort(
      (a, b) => a.startedAt.getTime() - b.startedAt.getTime()
    );
    return {
      source,
      items: sorted.map((session) => ({ session, index: index++ })),
    };
  });
}

/** The flat order the selection index refers to. */
export function orderedSessions(groups: SessionGroup[]): AgentSession[] {
  return groups.flatMap((group) => group.items.map((item) => item.session));
}

export interface SessionColumnWidths {
  marker: number;
  time: number;
  duration: number;
  title: number;
  /** 0 when the terminal is too narrow to keep the column. */
  model: number;
  counts: number;
}

const MARKER_WIDTH = 2;
const TIME_WIDTH = 11; // "09:43-09:48"
const DURATION_WIDTH = 6; // "~10.2h"
const MODEL_WIDTH = 16;
const COUNTS_WIDTH = 11; // "turns/tools"
/** Titles run to 80 characters, so trade a column away before squeezing below this. */
const MIN_TITLE_WIDTH = 32;
/** Adapters cap titles at 80 characters; wider columns would only add dead space. */
const MAX_TITLE_WIDTH = 80;

/**
 * Divides the row across the columns, dropping the model and then the counts
 * when the title would otherwise be squeezed. The widths plus their single-space
 * gaps never exceed `contentWidth`, which is what keeps rows from wrapping.
 */
export function sessionColumnWidths(contentWidth: number): SessionColumnWidths {
  const base = MARKER_WIDTH + TIME_WIDTH + 1 + DURATION_WIDTH + 1;
  let model = MODEL_WIDTH;
  let counts = COUNTS_WIDTH;
  let title = contentWidth - base - (model + 1) - (counts + 1);

  if (title < MIN_TITLE_WIDTH) {
    model = 0;
    title = contentWidth - base - (counts + 1);
  }
  if (title < MIN_TITLE_WIDTH) {
    counts = 0;
    title = contentWidth - base;
  }

  return {
    marker: MARKER_WIDTH,
    time: TIME_WIDTH,
    duration: DURATION_WIDTH,
    title: Math.min(Math.max(title, 0), MAX_TITLE_WIDTH),
    model,
    counts,
  };
}

/** Total columns a row occupies; never more than the `contentWidth` it was built for. */
export function rowWidth(widths: SessionColumnWidths): number {
  return (
    widths.marker +
    widths.time +
    1 +
    widths.duration +
    1 +
    widths.title +
    (widths.model > 0 ? widths.model + 1 : 0) +
    (widths.counts > 0 ? widths.counts + 1 : 0)
  );
}

export interface ScrollWindow {
  start: number;
  end: number;
  above: number;
  below: number;
}

/** Viewport over a list, centred on the selection and clamped to the ends. */
export function scrollWindow({
  total,
  selected,
  visible,
}: {
  total: number;
  selected: number;
  visible: number;
}): ScrollWindow {
  const size = Math.max(1, Math.min(visible, total));
  const maxStart = Math.max(0, total - size);
  const centred = selected - Math.floor(size / 2);
  const start = Math.min(Math.max(centred, 0), maxStart);
  const end = Math.min(start + size, total);
  return { start, end, above: start, below: total - end };
}

/** Session length after the 15-minute minimum, rounded the way the report rounds. */
export function sessionHours(session: AgentSession): number {
  const interval = intervalWithMinimum(session.startedAt, session.endedAt);
  return roundHours(interval.end.getTime() - interval.start.getTime());
}

export interface DaySummary {
  userTurns: number;
  toolCalls: number;
  /** Hours before overlapping sessions are merged; >= the report's estimate. */
  rawHours: number;
}

export function daySummary(sessions: AgentSession[]): DaySummary {
  let userTurns = 0;
  let toolCalls = 0;
  let rawMs = 0;

  for (const session of sessions) {
    userTurns += session.userTurns;
    toolCalls += session.toolCalls;
    const interval = intervalWithMinimum(session.startedAt, session.endedAt);
    rawMs += interval.end.getTime() - interval.start.getTime();
  }

  return { userTurns, toolCalls, rawHours: roundHours(rawMs) };
}
