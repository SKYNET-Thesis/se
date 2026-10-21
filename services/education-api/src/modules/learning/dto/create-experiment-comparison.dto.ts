import { ArrayMinSize, IsArray, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
export class CreateExperimentComparisonDto { @IsString() @MaxLength(200) title!:string; @IsArray() @ArrayMinSize(2) @IsUUID("4",{each:true}) experimentIds!:string[]; @IsOptional() @IsString() @MaxLength(5000) conclusion?:string; }
