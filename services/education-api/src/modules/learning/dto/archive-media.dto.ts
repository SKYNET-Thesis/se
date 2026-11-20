import { IsOptional, IsString, MaxLength } from "class-validator";

export class ArchiveMediaDto {
  /** Optional note shown to other authors of the course (not shown to learners). */
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
