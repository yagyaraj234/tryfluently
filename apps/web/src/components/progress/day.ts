export const formatDay = (at: string, timeZone: string) =>
  new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone });
