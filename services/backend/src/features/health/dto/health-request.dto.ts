import { IsOptional, IsUUID } from "class-validator";

export class HealthRequestDto {
  @IsOptional()
  @IsUUID()
  requestId?: string;
}
