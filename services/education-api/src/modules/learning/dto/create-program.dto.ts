import { IsObject, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateProgramDto {
  @IsOptional() @IsString() @MaxLength(200)
  title?: string;

  @IsObject()
  workspaceJson!: Record<string, unknown>;

  @IsObject()
  robotProgram!: Record<string, unknown>;
}
