import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";
export class CreateAssignmentDto { @IsUUID() lessonId!:string; @IsString() @MaxLength(200) title!:string; @IsOptional() @IsString() instructions?:string; @IsOptional() @IsUUID() challengeId?:string; @IsOptional() @IsInt() @Min(1) @Max(100) quizPassPercent?:number; }
