import type { AgentSource } from "./sources/types.ts";
import type { DetectedAgent } from "./types.ts";
import { shortenHome } from "./paths.ts";

export async function detectAgents(
  sources: AgentSource[]
): Promise<DetectedAgent[]> {
  const detections = await Promise.all(
    sources.map(async (source) => ({
      id: source.id,
      label: source.label,
      detection: await source.detect(),
    }))
  );
  return detections;
}

export function formatDetectionTable(detections: DetectedAgent[]): string {
  const rows = detections.map((entry) => {
    const status = entry.detection.installed ? "installed" : "missing";
    const dataDir = entry.detection.dataDir
      ? shortenHome(entry.detection.dataDir)
      : "—";
    const sessions = entry.detection.installed
      ? `${entry.detection.sessionCount} session${
          entry.detection.sessionCount === 1 ? "" : "s"
        }`
      : "";
    return { id: entry.id, status, dataDir, sessions };
  });

  const idWidth = Math.max(16, ...rows.map((row) => row.id.length));
  const statusWidth = Math.max(9, ...rows.map((row) => row.status.length));
  const dirWidth = Math.max(1, ...rows.map((row) => row.dataDir.length));

  return rows
    .map((row) => {
      const id = row.id.padEnd(idWidth);
      const status = row.status.padEnd(statusWidth);
      const dir = row.dataDir.padEnd(dirWidth);
      return row.sessions
        ? `${id}  ${status}  ${dir}  ${row.sessions}`
        : `${id}  ${status}  ${dir}`;
    })
    .join("\n");
}
