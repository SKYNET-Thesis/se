import { IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { MAX_SUBMISSION_FILE_BYTES } from '../submission-file.validation';

export class CreateSubmissionFileUploadDto {
  @IsString() @MinLength(1) @MaxLength(240)
  filename!: string;

  @IsString() @MaxLength(150)
  contentType!: string;

  @IsInt() @Min(1) @Max(MAX_SUBMISSION_FILE_BYTES)
  sizeBytes!: number;
}
