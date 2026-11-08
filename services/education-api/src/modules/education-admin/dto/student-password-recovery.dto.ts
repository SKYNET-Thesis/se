import { IsString, MaxLength, MinLength } from "class-validator";

export class StudentPasswordRecoveryDto {
  @IsString() @MinLength(1) @MaxLength(80) schoolCode!: string;
  @IsString() @MinLength(1) @MaxLength(80) studentCode!: string;
  @IsString() @MinLength(20) @MaxLength(128) recoveryCode!: string;
  @IsString() @MinLength(12) @MaxLength(128) password!: string;
}