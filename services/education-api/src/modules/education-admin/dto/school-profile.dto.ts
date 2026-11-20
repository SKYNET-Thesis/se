import { IsIn, IsString, Matches, MaxLength } from "class-validator";

export class UpdateSchoolProfileDto {
  @IsString() @Matches(/\S/, { message: "Value cannot be empty or whitespace." }) @MaxLength(160) name!: string;
}

export class UpdateMemberStatusDto {
  @IsIn(["active", "suspended"]) status!: "active" | "suspended";
}

export class UpdateAccountStatusDto {
  @IsIn(["active", "disabled"]) status!: "active" | "disabled";
}
