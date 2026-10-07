import { IsOptional, IsUUID } from "class-validator";

export class StatusRequestDto {
  @IsOptional()
  @IsUUID()
  requestId?: string;
}
