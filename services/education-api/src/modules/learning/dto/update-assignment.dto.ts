import { IsOptional, IsString, MaxLength } from "class-validator";
export class UpdateAssignmentDto { @IsOptional() @IsString() @MaxLength(200) title?:string; @IsOptional() @IsString() instructions?:string; }
