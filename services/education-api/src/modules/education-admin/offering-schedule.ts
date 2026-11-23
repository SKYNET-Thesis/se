import { BadRequestException } from "@nestjs/common";

export interface OfferingSchedule {
  startAt?: Date | string | null;
  endAt?: Date | string | null;
  enrollmentOpenAt?: Date | string | null;
  enrollmentCloseAt?: Date | string | null;
}

const ms = (value: Date | string | null | undefined) => (value ? new Date(value).getTime() : undefined);

/**
 * An offering's dates must be orderable: it ends after it starts, enrollment closes after it opens, and enrollment cannot
 * stay open past the end of the offering. Missing values are not constrained (all of them are optional).
 */
export function assertOfferingSchedule(schedule: OfferingSchedule): void {
  const start = ms(schedule.startAt), end = ms(schedule.endAt);
  const open = ms(schedule.enrollmentOpenAt), close = ms(schedule.enrollmentCloseAt);
  if ([start, end, open, close].some((value) => value !== undefined && Number.isNaN(value))) throw new BadRequestException("Offering dates must be valid dates.");
  if (start !== undefined && end !== undefined && end <= start) throw new BadRequestException("The offering must end after it starts.");
  if (open !== undefined && close !== undefined && close <= open) throw new BadRequestException("Enrollment must close after it opens.");
  if (end !== undefined && close !== undefined && close > end) throw new BadRequestException("Enrollment cannot close after the offering ends.");
}
