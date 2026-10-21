import { IsOptional, IsString, MaxLength } from "class-validator";
export class CreateReflectionDto {
  @IsString() @MaxLength(120) promptKey!: string;
  @IsString() @MaxLength(2000) promptText!: string;
  @IsOptional() @IsString() @MaxLength(5000) responseText?: string;
}
