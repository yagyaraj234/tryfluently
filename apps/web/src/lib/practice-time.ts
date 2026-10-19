/** Optional planning preferences, included in each selected Goal's Context. */
export function practiceTime(hours: string, minWeeks: string, maxWeeks: string) {
  if (
    hours &&
    (!Number.isFinite(Number(hours)) ||
      Number(hours) < 0.25 ||
      Number(hours) > 168 ||
      !Number.isInteger(Number(hours) * 4))
  ) {
    return { error: "Enter weekly practice time between 0.25 and 168 hours, in quarter-hour steps." };
  }
  if (
    (minWeeks || maxWeeks) &&
    (![minWeeks, maxWeeks].every((value) => Number.isSafeInteger(Number(value)) && Number(value) >= 1) ||
      Number(minWeeks) > Number(maxWeeks))
  ) {
    return { error: "Enter a minimum and maximum number of weeks, with the maximum at least the minimum." };
  }
  return {
    context: [
      hours ? `I can spend ${Number(hours)} hours per week practising.` : "",
      minWeeks ? `I would like to reach my Goal in ${Number(minWeeks)}–${Number(maxWeeks)} weeks.` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}
