import React from "react";
import { Box, Text } from "ink";
import { startOfWeek, addDays, subWeeks, isSameDay } from "date-fns";
import type { HeatmapData } from "../types.ts";

interface HeatmapProps {
  data: HeatmapData[];
  weeksToShow?: number;
  weekOffset?: number;
}

const INTENSITY_CHARS = {
  none: "·",
  low: "░",
  medium: "▓",
  high: "█",
};

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

export function Heatmap({ data, weeksToShow = 3, weekOffset = 0 }: HeatmapProps) {
  // Calculate the reference date based on which week is being viewed
  const targetWeekDate = subWeeks(new Date(), weekOffset);
  const weeks: Array<{ label: string; days: HeatmapData[] }> = [];

  // Generate weeks: show 2 weeks before the viewed week, then the viewed week
  // Data is generated for weekOffset-2, weekOffset-1, weekOffset (viewed week)
  for (let w = weeksToShow - 1; w >= 0; w--) {
    // w=2 -> weekOffset-2 (oldest), w=1 -> weekOffset-1, w=0 -> weekOffset (viewed)
    const actualOffset = weekOffset + w;
    const weekStart = startOfWeek(subWeeks(new Date(), actualOffset), { weekStartsOn: 1 });
    const weekDays: HeatmapData[] = [];

    for (let d = 0; d < 7; d++) {
      const date = addDays(weekStart, d);
      const dayData = data.find((item) => isSameDay(item.date, date));
      weekDays.push(
        dayData || {
          date,
          commits: 0,
          intensity: "none" as const,
        }
      );
    }

    let label: string;
    if (w === 0) {
      label = "Viewed";
    } else if (w === 1) {
      label = "Week -1";
    } else {
      label = `Week -${w}`;
    }

    weeks.push({ label, days: weekDays });
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Header row with day names */}
      <Box>
        <Text dimColor>{"         "}</Text>
        {DAYS.map((day) => (
          <Text key={day} dimColor>
            {day}{" "}
          </Text>
        ))}
      </Box>

      {/* Week rows */}
      {weeks.map((week, weekIndex) => (
        <Box key={weekIndex}>
          <Text dimColor>{week.label.padEnd(9)}</Text>
          {week.days.map((day, dayIndex) => (
            <Text key={dayIndex}>
              {INTENSITY_CHARS[day.intensity]}
              {INTENSITY_CHARS[day.intensity]}{" "}
            </Text>
          ))}
        </Box>
      ))}

      {/* Legend */}
      <Box marginTop={1}>
        <Text dimColor>
          {"          └─ Intensity: "}
          <Text>· </Text>
          <Text dimColor>none  </Text>
          <Text>░░ </Text>
          <Text dimColor>low  </Text>
          <Text>▓▓ </Text>
          <Text dimColor>medium  </Text>
          <Text>██ </Text>
          <Text dimColor>high</Text>
        </Text>
      </Box>
    </Box>
  );
}

export function calculateIntensity(commits: number): HeatmapData["intensity"] {
  if (commits === 0) return "none";
  if (commits <= 2) return "low";
  if (commits <= 5) return "medium";
  return "high";
}
