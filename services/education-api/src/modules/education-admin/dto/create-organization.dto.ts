import { IsDateString, IsIn, IsOptional, IsString, Matches, MaxLength } from "class-validator";

export class CreateOrganizationDto {
  @IsString()
  @Matches(/\S/, { message: "Name cannot be empty." })
  @MaxLength(200)
  name!: string;

  @IsString()
  @IsIn(["school", "university", "training_center", "enterprise"])
  type!: string;

  @IsString()
  @IsIn(["k12", "higher_ed", "vocational", "corporate"])
  segment!: string;

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
}
