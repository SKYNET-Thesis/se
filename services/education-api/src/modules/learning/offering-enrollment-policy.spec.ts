import { offeringEnrollmentBlocks, offeringSeatsLeft, type OfferingEnrollmentFacts } from "./offering-enrollment-policy";

const at = (iso: string) => new Date(iso);
const facts = (over: Partial<OfferingEnrollmentFacts> = {}): OfferingEnrollmentFacts => ({ enrollmentOpenAt: null, enrollmentCloseAt: null, maxStudents: null, enrolledStudents: 0, now: at("2027-01-10T12:00:00Z"), ...over });
const codes = (over: Partial<OfferingEnrollmentFacts>) => offeringEnrollmentBlocks(facts(over)).map((b) => b.code);

describe("offeringEnrollmentBlocks", () => {
  it("allows self-enrollment when the offering sets no window and no cap", () => { expect(codes({})).toEqual([]); });

  it("treats the window as [open, close): closed before it opens, open at the opening instant, closed at the closing instant", () => {
    const window = { enrollmentOpenAt: at("2027-01-10T12:00:00Z"), enrollmentCloseAt: at("2027-01-20T12:00:00Z") };
    expect(codes({ ...window, now: at("2027-01-10T11:59:59Z") })).toEqual(["ENROLLMENT_NOT_OPEN"]);
    expect(codes({ ...window, now: at("2027-01-10T12:00:00Z") })).toEqual([]);
    expect(codes({ ...window, now: at("2027-01-20T11:59:59Z") })).toEqual([]);
    expect(codes({ ...window, now: at("2027-01-20T12:00:00Z") })).toEqual(["ENROLLMENT_CLOSED"]);
  });

  it("supports a one-sided window", () => {
    expect(codes({ enrollmentOpenAt: at("2027-02-01T00:00:00Z") })).toEqual(["ENROLLMENT_NOT_OPEN"]);
    expect(codes({ enrollmentCloseAt: at("2027-01-01T00:00:00Z") })).toEqual(["ENROLLMENT_CLOSED"]);
    expect(codes({ enrollmentOpenAt: at("2027-01-01T00:00:00Z") })).toEqual([]);
  });

  it("blocks at the cap, not before it, and never for an uncapped offering", () => {
    expect(codes({ maxStudents: 3, enrolledStudents: 2 })).toEqual([]);
    expect(codes({ maxStudents: 3, enrolledStudents: 3 })).toEqual(["OFFERING_FULL"]);
    expect(codes({ maxStudents: 3, enrolledStudents: 5 })).toEqual(["OFFERING_FULL"]);          // administrators may have placed more
    expect(codes({ maxStudents: null, enrolledStudents: 9999 })).toEqual([]);
  });

  it("reports the window and the cap together, with readable messages", () => {
    const blocks = offeringEnrollmentBlocks(facts({ enrollmentCloseAt: at("2027-01-05T08:30:00Z"), maxStudents: 2, enrolledStudents: 2 }));
    expect(blocks.map((b) => b.code)).toEqual(["ENROLLMENT_CLOSED", "OFFERING_FULL"]);
    expect(blocks[0].message).toBe("Enrollment for this course closed on 2027-01-05 08:30 UTC.");
    expect(blocks[1].message).toBe("This course is full (2 of 2 places taken).");
  });
});

describe("offeringSeatsLeft", () => {
  it("is null without a cap and never negative", () => {
    expect(offeringSeatsLeft(null, 40)).toBeNull();
    expect(offeringSeatsLeft(30, 12)).toBe(18);
    expect(offeringSeatsLeft(30, 30)).toBe(0);
    expect(offeringSeatsLeft(30, 35)).toBe(0);
  });
});
