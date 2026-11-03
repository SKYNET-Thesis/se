import { IsBoolean, IsOptional } from "class-validator";

export class StartPhysicalExecutionDto {
  @IsOptional()
  @IsBoolean()
  safetyConfirmed?: boolean;
}
