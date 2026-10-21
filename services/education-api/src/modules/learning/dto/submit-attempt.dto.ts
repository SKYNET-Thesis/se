import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class SubmitAttemptDto {
  @IsUUID()
  programVersionId!: string;

  @IsOptional() @IsString() @MaxLength(5000)
  reflection?: string;
}
