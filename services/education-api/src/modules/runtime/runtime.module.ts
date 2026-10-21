import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { RuntimeController } from "./runtime.controller";
import { RuntimeService } from "./runtime.service";
@Module({imports:[IdentityModule],controllers:[RuntimeController],providers:[RuntimeService]}) export class RuntimeModule {}
