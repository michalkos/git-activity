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
  /** Truncated previews for the session-detail list. */
  getUserPrompts(session: AgentSession): Promise<string[]>;
  /** Full text of one prompt from that list; null if the index does not exist. */
  getUserPrompt(session: AgentSession, index: number): Promise<string | null>;
}
