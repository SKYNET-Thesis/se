import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../identity/auth/current-user.decorator";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { SupabaseAuthGuard } from "../identity/auth/supabase-auth.guard";
import { ChallengeAuthoringService, type ChallengeInput } from "./challenge-authoring.service";
import { ChallengeBodyDto } from "./dto/challenge.dto";

@ApiTags("Challenge authoring") @ApiBearerAuth() @UseGuards(SupabaseAuthGuard) @Controller("author/challenges")
export class ChallengeAuthoringController {
  constructor(private readonly challenges: ChallengeAuthoringService) {}
  @Get("catalog") catalog() { return this.challenges.catalog(); }
  @Get() list(@CurrentUser() user: AuthenticatedUser) { return this.challenges.list(user); }
  @Post() create(@CurrentUser() user: AuthenticatedUser, @Body() body: ChallengeBodyDto) { return this.challenges.create(user, body as ChallengeInput); }
  @Get(":id") get(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) { return this.challenges.get(user, id); }
  @Patch(":id") update(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Body() body: ChallengeBodyDto) { return this.challenges.update(user, id, body as ChallengeInput); }
  @Post(":id/publish") publish(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) { return this.challenges.publish(user, id); }
  @Post(":id/unpublish") unpublish(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) { return this.challenges.unpublish(user, id); }
  @Delete(":id") remove(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) { return this.challenges.remove(user, id); }
}
