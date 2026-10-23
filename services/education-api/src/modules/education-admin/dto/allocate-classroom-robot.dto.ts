import { IsUUID } from "class-validator";

export class AllocateClassroomRobotDto {
  @IsUUID()
  robotId!: string;
}
