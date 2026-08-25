import { startOfWeek, endOfWeek, subWeeks, parseISO } from "date-fns";

export function getDateRange(
  weeksBack: number,
  fromStr?: string,
  toStr?: string
): { startDate: Date; endDate: Date } {
  if (fromStr && toStr) {
    return {
      startDate: parseISO(fromStr),
      endDate: parseISO(toStr),
    };
  }

  const targetDate = subWeeks(new Date(), weeksBack);
  return {
    startDate: startOfWeek(targetDate, { weekStartsOn: 1 }),
    endDate: endOfWeek(targetDate, { weekStartsOn: 1 }),
  };
}
