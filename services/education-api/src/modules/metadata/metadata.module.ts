import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { MetadataController } from "./metadata.controller";
import { MetadataService } from "./metadata.service";

@Module({
  imports: [IdentityModule],
  controllers: [MetadataController],
  providers: [MetadataService],
})
export class MetadataModule {}
