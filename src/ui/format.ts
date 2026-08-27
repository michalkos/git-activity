/** Small formatting helpers shared by the terminal views. */

export function truncate(value: string, maxLength: number): string {
  if (maxLength <= 0) return "";
  if (value.length <= maxLength) return value;
  if (maxLength <= 3) return value.slice(0, maxLength);
  return value.slice(0, maxLength - 3) + "...";
}

/** Placeholder for sources that record no model; ASCII so column widths stay exact. */
export const NO_MODEL = "-";

/**
 * Model ids arrive vendor-prefixed (`copilot/gpt-5.6-terra`, `zai/glm-5.3`).
 * The vendor is the same for every row of a source, so only the model is shown.
 */
export function shortModel(model?: string): string {
  if (!model) return NO_MODEL;
  const name = model.slice(model.lastIndexOf("/") + 1).trim();
  return name || NO_MODEL;
}
