import React from "react";
import { Box, Text } from "ink";
import { format } from "date-fns";
import type { ProjectActivity, DayActivity } from "../types.ts";

interface DayDetailProps {
  date: Date;
  projects: Array<{ project: ProjectActivity; day: DayActivity }>;
  selectedIndex: number;
}

export function DayDetail({ date, projects, selectedIndex }: DayDetailProps) {
  const dateStr = format(date, "EEEE, MMM d");

  return (
    <Box flexDirection="column">
      <Text bold>{dateStr}</Text>
      {projects.map(({ project, day }, index) => {
        const isSelected = index === selectedIndex;
        const prefix = index === projects.length - 1 ? "└── " : "├── ";
        const hours = day.estimatedHours;
        const commits = day.commits.length;

        return (
          <Box key={project.repo.path}>
            <Text>
              {isSelected ? (
                <Text backgroundColor="blue" color="white">
                  {prefix}
                  {project.repo.name} ({shortenPath(project.repo.path)})
                </Text>
              ) : (
                <Text>
                  {prefix}
                  {project.repo.name} ({shortenPath(project.repo.path)})
                </Text>
              )}
            </Text>
            <Text dimColor>
              {"  "}~{hours}h {commits} commit{commits === 1 ? "" : "s"}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}

function shortenPath(path: string): string {
  const home = process.env.HOME || "";
  if (path.startsWith(home)) {
    return "~" + path.slice(home.length);
  }
  return path;
}
