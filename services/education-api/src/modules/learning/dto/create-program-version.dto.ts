import { IsOptional, IsString, MaxLength } from "class-validator";

export class CreateProgramVersionDto {
  @IsOptional() @IsString() @MaxLength(500)
  changeSummary?: string;
}
