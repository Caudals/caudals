import { describe,expect,it } from "vitest";
import { latestDueSlot,nextScheduleSlot,scheduleConfigSchema } from "../../lib/evals/monitoring/calendar";

describe("WP-13 local schedule slots",()=>{
  it("skips nonexistent spring time and runs once at the first fall occurrence",()=>{
    const daily={timezone:"Europe/Madrid",cadence:"daily" as const,localTime:"02:30",weekday:null,dayOfMonth:null};
    const beforeSpring=nextScheduleSlot(daily,"2026-03-28T02:00:00Z");
    expect(beforeSpring.localSlotKey).toBe("2026-03-30T02:30");
    expect(beforeSpring.scheduledFor).toBe("2026-03-30T00:30:00.000Z");
    const fall=nextScheduleSlot(daily,"2026-10-24T23:00:00Z");
    expect(fall.localSlotKey).toBe("2026-10-25T02:30");
    expect(fall.scheduledFor).toBe("2026-10-25T00:30:00.000Z");
    expect(nextScheduleSlot(daily,fall.scheduledFor,fall.localSlotKey).localSlotKey).toBe("2026-10-26T02:30");
  });
  it("catches up only the latest missed slot and records the skipped count",()=>{
    const weekly={timezone:"Europe/Madrid",cadence:"weekly" as const,localTime:"09:00",weekday:1,dayOfMonth:null};
    const first=nextScheduleSlot(weekly,"2026-09-01T00:00:00Z");
    const caught=latestDueSlot(weekly,first.scheduledFor,"2026-09-19T12:00:00Z");
    expect(caught.latest?.localSlotKey).toBe("2026-09-14T09:00");
    expect(caught.missedCount).toBe(1);
    expect(caught.next.localSlotKey).toBe("2026-09-21T09:00");
  });
  it("rejects an unknown timezone and mismatched cadence fields",()=>{
    expect(()=>scheduleConfigSchema.parse({timezone:"Not/AZone",cadence:"daily",localTime:"09:00",weekday:null,dayOfMonth:null})).toThrow();
    expect(()=>scheduleConfigSchema.parse({timezone:"UTC",cadence:"monthly",localTime:"09:00",weekday:1,dayOfMonth:null})).toThrow();
  });
  it("supports the 31st and skips months without that date",()=>{
    const monthly={timezone:"UTC",cadence:"monthly" as const,localTime:"09:00",weekday:null,dayOfMonth:31};
    expect(nextScheduleSlot(monthly,"2026-01-31T09:00:00Z").localSlotKey).toBe("2026-03-31T09:00");
  });
});
