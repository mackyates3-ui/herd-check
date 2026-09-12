import { describe, expect, it } from "vitest";
import { groupSightingsByDay, isToday, startOfLocalDay } from "./dates";

describe("dates", () => {
  it("treats midnight-local as the day boundary", () => {
    const noon = new Date(2026, 8, 12, 12, 0, 0).getTime();
    const early = new Date(2026, 8, 12, 0, 5, 0).getTime();
    const yesterday = new Date(2026, 8, 11, 23, 50, 0).getTime();
    expect(isToday(early, noon)).toBe(true);
    expect(isToday(yesterday, noon)).toBe(false);
    expect(startOfLocalDay(noon)).toBe(new Date(2026, 8, 12).getTime());
  });

  it("groups newest days first", () => {
    const now = new Date(2026, 8, 12, 16, 0, 0).getTime();
    const groups = groupSightingsByDay(
      [
        { at: now - 1000 },
        { at: now - 86_400_000 },
        { at: now - 2000 },
      ],
      now,
    );
    expect(groups[0]?.label).toBe("Today");
    expect(groups[0]?.items).toHaveLength(2);
    expect(groups[1]?.label).toBe("Yesterday");
  });
});
