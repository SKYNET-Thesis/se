import { IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from "class-validator";

const nonBlank = { message: "Title cannot be empty or whitespace." };
export class CreateAssignmentDto { @IsUUID() lessonId!:string; @IsString() @Matches(/\S/, nonBlank) @MaxLength(200) title!:string; @IsOptional() @IsString() instructions?:string; @IsOptional() @IsUUID() challengeId?:string; @IsOptional() @IsInt() @Min(1) @Max(100) quizPassPercent?:number; }
