import { IsUUID } from "class-validator";

export class AssignClassroomOfferingDto {
  @IsUUID()
  offeringId!: string;
}
