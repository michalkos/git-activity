import { sessionKey } from "../agents/session.ts";
import { format } from "date-fns";
import type { TimelineEntry } from "../combined/types.ts";
import { sessionHours } from "./sessionRows.ts";

/** Layout arithmetic for the combined day timeline, kept out of the component. */

export interface TimelineColumnWidths {
  marker: number;
  time: number;
  /** Agent source id or `commit`. */
  kind: number;
  title: number;
  /** 0 when the terminal is too narrow to keep the column. */
  meta: number;
}

const MARKER_WIDTH = 2;
const TIME_WIDTH = 11; // "09:43-11:05"; commits render a single time, padded
const KIND_WIDTH = 14; // "vscode-copilot", the longest source id
const NARROW_KIND_WIDTH = 7; // "copilot", "commit"
const META_WIDTH = 7; // "~10.2h" or a short hash
/** Trade a column away before squeezing titles below this. */
const MIN_TITLE_WIDTH = 28;
/** Commit subjects and session titles are capped by their sources near this. */
const MAX_TITLE_WIDTH = 80;

/**
 * Divides the row across the columns, shrinking the kind column and then
 * dropping the meta column when the title would otherwise be squeezed. Widths
 * plus their single-space gaps never exceed `contentWidth`, which keeps rows
 * from wrapping.
 */
export function timelineColumnWidths(contentWidth: number): TimelineColumnWidths {
  const base = MARKER_WIDTH + TIME_WIDTH + 1;
  let kind = KIND_WIDTH;
  let meta = META_WIDTH;
  let title = contentWidth - base - (kind + 1) - (meta + 1);

  if (title < MIN_TITLE_WIDTH) {
    kind = NARROW_KIND_WIDTH;
    title = contentWidth - base - (kind + 1) - (meta + 1);
  }
  if (title < MIN_TITLE_WIDTH) {
    meta = 0;
    title = contentWidth - base - (kind + 1);
  }

  return {
    marker: MARKER_WIDTH,
    time: TIME_WIDTH,
    kind,
    title: Math.min(Math.max(title, 0), MAX_TITLE_WIDTH),
    meta,
  };
}

/** Total columns a row occupies; never more than the `contentWidth` it was built for. */
export function timelineRowWidth(widths: TimelineColumnWidths): number {
  return (
    widths.marker +
    widths.time +
    1 +
    widths.kind +
    1 +
    widths.title +
    (widths.meta > 0 ? widths.meta + 1 : 0)
  );
}

export interface TimelineCells {
  time: string;
  kind: string;
  title: string;
  meta: string;
}

/**
 * The four cells of a row. Commits show one timestamp and their short hash;
 * sessions show their span and estimated hours.
 */
export function timelineCells(entry: TimelineEntry): TimelineCells {
  if (entry.kind === "commit") {
    return {
      time: format(entry.commit.date, "HH:mm"),
      kind: "commit",
      title: entry.commit.message,
      meta: entry.commit.hash.slice(0, 7),
    };
  }

  const { session } = entry;
  return {
    time: `${format(session.startedAt, "HH:mm")}-${format(session.endedAt, "HH:mm")}`,
    kind: session.source,
    title: session.title,
    meta: `~${sessionHours(session)}h`,
  };
}

/** Stable key for a timeline row; includes the source and rollout for sessions. */
export function timelineKey(entry: TimelineEntry): string {
  return entry.kind === "commit"
    ? `commit:${entry.commit.hash}`
    : `session:${sessionKey(entry.session)}`;
}
