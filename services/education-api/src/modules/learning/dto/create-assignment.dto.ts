import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
export class CreateAssignmentDto { @IsUUID() lessonId!:string; @IsString() @MaxLength(200) title!:string; @IsOptional() @IsString() instructions?:string; @IsOptional() @IsUUID() challengeId?:string; }
