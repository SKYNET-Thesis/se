import { IsInt, IsString, Max, MaxLength, Min } from 'class-validator';
import { MAX_LEARNING_MEDIA_BYTES } from '../learning-media.constants';

export class CreateLearningMediaUploadDto {
  @IsString() @MaxLength(240) filename!: string;
  @IsString() @MaxLength(120) contentType!: string;
  @IsInt() @Min(1) @Max(MAX_LEARNING_MEDIA_BYTES) sizeBytes!: number;
}
