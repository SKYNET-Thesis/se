import { IsString, Matches, MaxLength, MinLength } from "class-validator";

/** A spreadsheet (.xlsx) or CSV upload for the school user import, sent as base64 (the import UI stays JSON-only). the 1 MiB request limit applies (about 700 KB of file). */
export class ParseImportFileDto {
  @IsString() @MinLength(5) @MaxLength(255) @Matches(/\.(xlsx|csv)$/i, { message: "Only .xlsx and .csv files are supported." }) fileName!: string;
  @IsString() @MinLength(4) @MaxLength(1_000_000) contentBase64!: string;
}
