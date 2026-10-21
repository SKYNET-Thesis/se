import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, Matches, MaxLength } from "class-validator";

export class UpdateMyProfileDto {
  @ApiProperty({ example: "Nguyen Van A", maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Matches(/\S/, { message: "fullName must contain a non-whitespace character." })
  fullName!: string;
}
