import { IsUUID } from "class-validator";

export class UpsertClassroomMemberDto {
  @IsUUID()
  userId!: string;

}
