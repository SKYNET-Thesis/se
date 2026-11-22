import { IsDateString, IsIn, IsOptional, IsString, Matches, MaxLength } from "class-validator";

export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: "Name cannot be empty." })
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @IsIn(["school", "university", "training_center", "enterprise"])
  type?: string;

  @IsOptional()
  @IsString()
  @IsIn(["k12", "higher_ed", "vocational", "corporate"])
  segment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  schoolCode?: string;

  @IsOptional()
  @IsDateString()
  contractStart?: string;

  @IsOptional()
  @IsDateString()
  contractEnd?: string;

  @IsOptional()
  @IsString()
  @IsIn(["active", "suspended"])
  status?: string;
}
