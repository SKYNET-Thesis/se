import { IsObject, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateProgramDto {
  @IsOptional() @IsString() @MaxLength(200)
  title?: string;

  @IsOptional() @IsObject()
  workspaceJson?: Record<string, unknown>;

  @IsOptional() @IsObject()
  robotProgram?: Record<string, unknown>;
}
