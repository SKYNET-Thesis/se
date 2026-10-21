import { IsString, MaxLength } from "class-validator";
export class CreateFeedbackDto { @IsString() @MaxLength(5000) content!: string; }
