import { IsUUID } from "class-validator";

export class AssignSchoolAdminDto {
  @IsUUID()
  userId!: string;
}
