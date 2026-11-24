/**
 * Self-enrollment rules of a course Offering: an optional enrollment window and an optional student cap. They apply when a student enrolls
 * themselves through the catalog. Authorized administrative enrollment (a School Admin adding or importing members) is a deliberate
 * override and is not blocked here; it stays visible to the school through the offering's enrolled count.
 */
export interface OfferingEnrollmentFacts {
  enrollmentOpenAt: Date | null;
  enrollmentCloseAt: Date | null;
  maxStudents: number | null;
  /** Distinct students with an active student membership in an active classroom of the offering. */
  enrolledStudents: number;
  /** The database clock, so every check in one transaction uses the same instant. */
  now: Date;
}

export type OfferingEnrollmentBlockCode = "ENROLLMENT_NOT_OPEN" | "ENROLLMENT_CLOSED" | "OFFERING_FULL";
export interface OfferingEnrollmentBlock { code: OfferingEnrollmentBlockCode; message: string }

const stamp = (date: Date) => `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;

/** Why the offering cannot take another self-enrolling student right now (empty when it can). The window is [open, close). */
export function offeringEnrollmentBlocks(facts: OfferingEnrollmentFacts): OfferingEnrollmentBlock[] {
  const blocks: OfferingEnrollmentBlock[] = [];
  const now = facts.now.getTime();
  if (facts.enrollmentOpenAt && facts.enrollmentOpenAt.getTime() > now) blocks.push({ code: "ENROLLMENT_NOT_OPEN", message: `Enrollment for this course opens on ${stamp(facts.enrollmentOpenAt)}.` });
  else if (facts.enrollmentCloseAt && facts.enrollmentCloseAt.getTime() <= now) blocks.push({ code: "ENROLLMENT_CLOSED", message: `Enrollment for this course closed on ${stamp(facts.enrollmentCloseAt)}.` });
  if (facts.maxStudents !== null && facts.enrolledStudents >= facts.maxStudents) blocks.push({ code: "OFFERING_FULL", message: `This course is full (${facts.enrolledStudents} of ${facts.maxStudents} places taken).` });
  return blocks;
}

/** Places left for self-enrollment, or null when the offering has no cap. */
export const offeringSeatsLeft = (maxStudents: number | null, enrolledStudents: number): number | null => (maxStudents === null ? null : Math.max(0, maxStudents - enrolledStudents));
