import { BadRequestException } from "@nestjs/common";
import { assertOfferingSchedule } from "./offering-schedule";

describe("assertOfferingSchedule", () => {
  it("accepts a complete ordered schedule and any subset of dates", () => {
    expect(() => assertOfferingSchedule({ startAt: "2026-09-01T00:00:00Z", endAt: "2027-01-01T00:00:00Z", enrollmentOpenAt: "2026-08-01T00:00:00Z", enrollmentCloseAt: "2026-09-15T00:00:00Z" })).not.toThrow();
    expect(() => assertOfferingSchedule({})).not.toThrow();
    expect(() => assertOfferingSchedule({ endAt: "2027-01-01T00:00:00Z" })).not.toThrow();
    expect(() => assertOfferingSchedule({ enrollmentCloseAt: null, startAt: null })).not.toThrow();
  });

  it.each([
    [{ startAt: "2026-09-01T00:00:00Z", endAt: "2026-09-01T00:00:00Z" }, /end after it starts/],
    [{ startAt: "2026-09-02T00:00:00Z", endAt: "2026-09-01T00:00:00Z" }, /end after it starts/],
    [{ enrollmentOpenAt: "2026-09-02T00:00:00Z", enrollmentCloseAt: "2026-09-01T00:00:00Z" }, /close after it opens/],
    [{ endAt: "2026-12-01T00:00:00Z", enrollmentCloseAt: "2026-12-02T00:00:00Z" }, /cannot close after the offering ends/],
    [{ startAt: "not a date" }, /valid dates/],
  ])("rejects %j", (schedule, message) => {
    expect(() => assertOfferingSchedule(schedule)).toThrow(BadRequestException);
    expect(() => assertOfferingSchedule(schedule)).toThrow(message);
  });

  it("compares Date values and ISO strings alike", () => {
    expect(() => assertOfferingSchedule({ startAt: new Date("2026-09-01T00:00:00Z"), endAt: "2026-08-01T00:00:00Z" })).toThrow(BadRequestException);
  });
});
