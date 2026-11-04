import { IsString, MaxLength, MinLength } from "class-validator";

export class StudentLoginDto {
  @IsString() @MinLength(1) @MaxLength(80) schoolCode!: string;
  @IsString() @MinLength(1) @MaxLength(80) studentCode!: string;
  @IsString() @MinLength(1) @MaxLength(128) password!: string;
}