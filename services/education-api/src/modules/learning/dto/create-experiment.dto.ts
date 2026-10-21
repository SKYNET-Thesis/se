import { IsIn, IsUUID } from "class-validator";
export class CreateExperimentDto { @IsUUID() programVersionId!:string; @IsIn(["schematic"]) executionMode!:"schematic"; }
