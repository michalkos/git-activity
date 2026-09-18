import { addDays, startOfDay } from "date-fns";
import { intervalWithMinimum } from "./hours.ts";
import type { AgentSession } from "./types.ts";

/** A thread may have several rollout files, even from the same source and day. */
export function sessionKey(session: AgentSession): string {
  return JSON.stringify([
    session.source, session.id, session.sourceRef ?? session.projectPath,
    session.startedAt.toISOString(),
  ]);
}

export function sessionInterval(session: AgentSession) {
  return session.estimatedInterval ?? intervalWithMinimum(session.startedAt, session.endedAt);
}

/** Uses recorded activity days when available; otherwise splits the session span. */
export function sessionDays(session: AgentSession): AgentSession[] {
  if (session.estimatedInterval) return [session];
  const result: AgentSession[] = [];
  for (const activity of session.activity ?? [session]) {
    const interval = intervalWithMinimum(activity.startedAt, activity.endedAt);
    let day = startOfDay(interval.start);
    while (day <= activity.startedAt || day < activity.endedAt) {
      const next = addDays(day, 1);
      const start = new Date(Math.max(day.getTime(), interval.start.getTime()));
      const end = new Date(Math.min(next.getTime(), interval.end.getTime()));
      const first = start.getTime() === activity.startedAt.getTime();
      result.push({
        ...session,
        startedAt: start,
        endedAt: new Date(Math.max(start.getTime(), Math.min(end.getTime(), activity.endedAt.getTime()))),
        // Without event timestamps, counts can only be assigned to the start day.
        userTurns: first ? activity.userTurns : 0,
        assistantTurns: first ? activity.assistantTurns : 0,
        toolCalls: first ? activity.toolCalls : 0,
        activity: undefined,
        estimatedInterval: { start, end },
      });
      day = next;
    }
  }
  return result;
}
