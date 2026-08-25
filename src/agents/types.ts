export const AGENT_SOURCE_IDS = [
  "claude",
  "cursor",
  "pi",
  "codex",
  "copilot",
  "vscode-copilot",
] as const;

export type AgentSourceId = (typeof AGENT_SOURCE_IDS)[number];

export interface Detection {
  installed: boolean;
  dataDir?: string;
  binary?: string;
  sessionCount: number;
}

export interface DetectedAgent {
  id: AgentSourceId;
  label: string;
  detection: Detection;
}

export interface AgentSession {
  id: string;
  source: AgentSourceId;
  title: string;
  projectPath: string;
  projectName: string;
  startedAt: Date;
  endedAt: Date;
  userTurns: number;
  assistantTurns: number;
  toolCalls: number;
  model?: string;
  /** Adapter-private pointer used to load prompts for the detail view. */
  sourceRef?: string;
}

export interface AgentDayActivity {
  date: Date;
  sessions: AgentSession[];
  estimatedHours: number;
  sources: AgentSourceId[];
}

export interface AgentProjectActivity {
  projectPath: string;
  projectName: string;
  days: Map<string, AgentDayActivity>;
  totalSessions: number;
  totalHours: number;
}

export interface AgentWeeklyReport {
  startDate: Date;
  endDate: Date;
  projects: AgentProjectActivity[];
  totalSessions: number;
  totalHours: number;
}

export type AgentViewState =
  | { view: "week" }
  | { view: "sessions"; projectPath: string; date: string }
  | {
      view: "session-detail";
      projectPath: string;
      date: string;
      sessionId: string;
    };

export interface AgentConfig {
  enabled: AgentSourceId[];
}

export function isAgentSourceId(value: string): value is AgentSourceId {
  return (AGENT_SOURCE_IDS as readonly string[]).includes(value);
}
