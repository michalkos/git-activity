import { useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import type { DetectedAgent, AgentSourceId } from "../agents/types.ts";
import { shortenHome } from "../agents/paths.ts";

interface AgentPickerProps {
  detections: DetectedAgent[];
  initiallyEnabled: AgentSourceId[];
  onSubmit: (enabled: AgentSourceId[]) => void;
  onCancel: () => void;
}

export function AgentPicker({
  detections,
  initiallyEnabled,
  onSubmit,
  onCancel,
}: AgentPickerProps) {
  const { exit } = useApp();
  const [cursor, setCursor] = useState(0);
  const [enabled, setEnabled] = useState<Set<AgentSourceId>>(
    () => new Set(initiallyEnabled)
  );

  useInput((input, key) => {
    if (input === "q" || key.escape) {
      onCancel();
      exit();
      return;
    }

    if (key.upArrow) {
      setCursor((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow) {
      setCursor((prev) => Math.min(detections.length - 1, prev + 1));
      return;
    }

    if (input === " ") {
      const current = detections[cursor];
      if (!current) {
        return;
      }
      setEnabled((prev) => {
        const next = new Set(prev);
        if (next.has(current.id)) {
          next.delete(current.id);
        } else {
          next.add(current.id);
        }
        return next;
      });
      return;
    }

    if (key.return) {
      onSubmit(detections.filter((d) => enabled.has(d.id)).map((d) => d.id));
      exit();
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text bold>Select agents to include in reports</Text>
      <Text dimColor>Space toggle  Enter save  q cancel</Text>
      <Box marginY={1} flexDirection="column">
        {detections.map((entry, index) => {
          const checked = enabled.has(entry.id);
          const isCursor = index === cursor;
          const mark = checked ? "x" : " ";
          const prefix = isCursor ? "❯ " : "  ";
          const sessions = `${entry.detection.sessionCount} session${
            entry.detection.sessionCount === 1 ? "" : "s"
          }`;
          const dir = entry.detection.dataDir
            ? shortenHome(entry.detection.dataDir)
            : "—";
          const line = `${prefix}[${mark}] ${entry.id.padEnd(16)} ${sessions.padStart(12)}  ${dir}`;

          return (
            <Text
              key={entry.id}
              backgroundColor={isCursor ? "blue" : undefined}
              color={isCursor ? "white" : undefined}
            >
              {line}
            </Text>
          );
        })}
      </Box>
    </Box>
  );
}
