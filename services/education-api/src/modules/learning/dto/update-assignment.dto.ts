import { IsOptional, IsString, MaxLength, IsBoolean } from 'class-validator';
export class UpdateAssignmentDto { @IsOptional() @IsString() @MaxLength(200) title?:string; @IsOptional() @IsString() instructions?:string; @IsOptional() @IsBoolean() attachmentsEnabled?:boolean; }
