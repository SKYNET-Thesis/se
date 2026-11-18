import { IsBoolean, Equals } from "class-validator";

export class ReissueStudentTemporaryPasswordDto {
  @IsBoolean() @Equals(true) confirm!: true;
}
