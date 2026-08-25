import type {
  AgentSession,
  AgentSourceId,
  Detection,
} from "../types.ts";

export interface AgentSource {
  id: AgentSourceId;
  label: string;
  detect(): Promise<Detection>;
  listSessions(from: Date, to: Date): Promise<AgentSession[]>;
  getUserPrompts(session: AgentSession): Promise<string[]>;
}
