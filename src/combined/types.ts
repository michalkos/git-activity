import type { AgentSession, AgentSourceId } from "../agents/types.ts";
import type { GitCommit, GitRepo } from "../types.ts";

/**
 * One project's work on one day, from both sides: commits from git and sessions
 * from local agents. `estimatedHours` merges the two sets of intervals, so an
 * agent session that produced a commit inside its own window is counted once.
 */
export interface CombinedDayActivity {
  date: Date;
  commits: GitCommit[];
  sessions: AgentSession[];
  /** Hours the git-only report would show for this day. */
  gitHours: number;
  /** Hours the agents-only report would show for this day. */
  agentHours: number;
  /** Hours after merging git and agent intervals; <= gitHours + agentHours. */
  estimatedHours: number;
  sources: AgentSourceId[];
}

/**
 * A project is keyed by its git repo path when one matched, otherwise by the
 * agent working directory. `repo` is absent for agent work outside any repo.
 */
export interface CombinedProjectActivity {
  projectPath: string;
  projectName: string;
  repo?: GitRepo;
  days: Map<string, CombinedDayActivity>;
  totalCommits: number;
  totalSessions: number;
  totalHours: number;
}

export interface CombinedWeeklyReport {
  startDate: Date;
  endDate: Date;
  projects: CombinedProjectActivity[];
  totalCommits: number;
  totalSessions: number;
  /** Merged total. */
  totalHours: number;
  /** Unmerged git and agent totals, for the overlap line in the footer. */
  gitHours: number;
  agentHours: number;
}

/** A single dated event in a day's timeline: either a commit or an agent session. */
export type TimelineEntry =
  | { kind: "commit"; at: Date; commit: GitCommit }
  | { kind: "session"; at: Date; session: AgentSession };

export type CombinedViewState =
  | { view: "week" }
  | { view: "timeline"; projectPath: string; date: string }
  | {
      view: "commit-detail";
      projectPath: string;
      date: string;
      commitHash: string;
    }
  | {
      view: "session-detail";
      projectPath: string;
      date: string;
      sessionId: string;
    };
