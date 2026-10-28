/** Parse a user-entered BRL amount without binary floating point arithmetic. */
export function brlAmountMinor(input: string): string | undefined {
  const match = input.trim().match(/^(\d{1,7})(?:[,.](\d{1,2}))?$/);
  if (!match) return undefined;
  const minor = `${match[1]}${(match[2] ?? "").padEnd(2, "0")}`.replace(/^0+/, "");
  return minor || undefined;
}
/** Interpret a calendar/time input in the ad account zone, never the browser zone. */
export function accountDateTime(input: string, timeZone: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input)) return undefined;
  const wall = Date.parse(`${input}:00Z`);
  if (!Number.isFinite(wall)) return undefined;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  let timestamp = wall;
  function rendered(time: number) {
    const parts = formatter.formatToParts(time);
    const get = (key: string) => parts.find((part) => part.type === key)?.value;
    return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
  }
  for (let index = 0; index < 3; index++)
    timestamp += wall - Date.parse(`${rendered(timestamp)}:00Z`);
  if (rendered(timestamp) !== input) return undefined;
  return new Date(timestamp).toISOString();
}
export function accountDateTimeInput(iso: string | undefined, timeZone: string) {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (key: string) => parts.find((part) => part.type === key)?.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
