import type { GitCommit, WorkSession, DayActivity } from "./types.ts";

// Time constants in milliseconds
const SESSION_GAP_THRESHOLD = 2 * 60 * 60 * 1000; // 2 hours - gap that starts new session
const MIN_SESSION_TIME = 30 * 60 * 1000; // 30 minutes minimum per session
const BUFFER_BEFORE_FIRST = 15 * 60 * 1000; // 15 min buffer before first commit
const BUFFER_AFTER_LAST = 15 * 60 * 1000; // 15 min buffer after last commit

export function estimateWorkSessions(commits: GitCommit[]): WorkSession[] {
  if (commits.length === 0) {
    return [];
  }

  // Sort commits by date
  const sorted = [...commits].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );

  const sessions: WorkSession[] = [];
  let currentSession: GitCommit[] = [sorted[0]!];

  for (let i = 1; i < sorted.length; i++) {
    const commit = sorted[i]!;
    const lastCommit = currentSession[currentSession.length - 1]!;
    const gap = commit.date.getTime() - lastCommit.date.getTime();

    if (gap > SESSION_GAP_THRESHOLD) {
      // Start new session
      sessions.push(createSession(currentSession));
      currentSession = [commit];
    } else {
      currentSession.push(commit);
    }
  }

  // Don't forget the last session
  if (currentSession.length > 0) {
    sessions.push(createSession(currentSession));
  }

  return sessions;
}

function createSession(commits: GitCommit[]): WorkSession {
  const first = commits[0]!;
  const last = commits[commits.length - 1]!;

  // Add buffers before and after
  const start = new Date(first.date.getTime() - BUFFER_BEFORE_FIRST);
  const end = new Date(last.date.getTime() + BUFFER_AFTER_LAST);

  return {
    start,
    end,
    commits,
  };
}

export function calculateSessionDuration(session: WorkSession): number {
  const duration = session.end.getTime() - session.start.getTime();
  // Ensure minimum session time
  return Math.max(duration, MIN_SESSION_TIME);
}

export function calculateTotalHours(sessions: WorkSession[]): number {
  const totalMs = sessions.reduce(
    (sum, session) => sum + calculateSessionDuration(session),
    0
  );
  // Convert to hours and round to 1 decimal place
  return Math.round((totalMs / (1000 * 60 * 60)) * 10) / 10;
}

export function groupCommitsByDay(
  commits: GitCommit[]
): Map<string, DayActivity> {
  const days = new Map<string, DayActivity>();

  for (const commit of commits) {
    const dateKey = formatDateKey(commit.date);

    if (!days.has(dateKey)) {
      days.set(dateKey, {
        date: startOfDay(commit.date),
        commits: [],
        sessions: [],
        estimatedHours: 0,
      });
    }

    days.get(dateKey)!.commits.push(commit);
  }

  // Calculate sessions and hours for each day
  for (const activity of days.values()) {
    activity.sessions = estimateWorkSessions(activity.commits);
    activity.estimatedHours = calculateTotalHours(activity.sessions);
  }

  return days;
}

export function formatDateKey(date: Date): string {
  // Use local calendar date to avoid UTC day shifts in heatmap/week views.
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
