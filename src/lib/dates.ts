const DAY_MS = 86_400_000;

export function startOfLocalDay(at: number = Date.now()): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function isToday(at: number, now: number = Date.now()): boolean {
  return startOfLocalDay(at) === startOfLocalDay(now);
}

export function isYesterday(at: number, now: number = Date.now()): boolean {
  return startOfLocalDay(at) === startOfLocalDay(now) - DAY_MS;
}

export function formatHeaderDate(at: number = Date.now()): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(at));
}

export function formatTime(at: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(at));
}

export function formatSightingStamp(at: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(at));
}

export function formatDayHeading(at: number, now: number = Date.now()): string {
  if (isToday(at, now)) return "Today";
  if (isYesterday(at, now)) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date(at));
}

export function groupSightingsByDay<T extends { at: number }>(
  sightings: T[],
  now: number = Date.now(),
): { key: number; label: string; items: T[] }[] {
  const groups = new Map<number, T[]>();
  for (const item of sightings) {
    const key = startOfLocalDay(item.at);
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([key, items]) => ({
      key,
      label: formatDayHeading(key, now),
      items: [...items].sort((a, b) => b.at - a.at),
    }));
}

export function minutesAgo(hours: number, minutes = 0, now = Date.now()): number {
  return now - Math.round((hours * 60 + minutes) * 60_000);
}
