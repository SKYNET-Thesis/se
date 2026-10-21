import { IsIn, IsOptional, IsUUID } from "class-validator";

export class UpsertClassroomMemberDto {
  @IsUUID()
  userId!: string;

  @IsIn(["teacher", "teaching_assistant", "student"])
  classroomRole!: "teacher" | "teaching_assistant" | "student";

  @IsOptional()
  @IsIn(["active", "inactive"])
  status?: "active" | "inactive";
}
