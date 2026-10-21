import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../identity/auth/current-user.decorator";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { SupabaseAuthGuard } from "../identity/auth/supabase-auth.guard";
import { VrLessonService } from "./vr-lesson.service";
@ApiTags("VR learning sessions") @ApiBearerAuth() @UseGuards(SupabaseAuthGuard) @Controller()
export class VrLessonController { constructor(private readonly vr:VrLessonService){} @Get("me/attempts/:attemptId/vr-session") status(@CurrentUser()u:AuthenticatedUser,@Param("attemptId",ParseUUIDPipe)id:string){return this.vr.status(u,id)} @Post("me/attempts/:attemptId/vr-session") start(@CurrentUser()u:AuthenticatedUser,@Param("attemptId",ParseUUIDPipe)id:string){return this.vr.start(u,id)} @Post("me/vr-sessions/:sessionId/stop") stop(@CurrentUser()u:AuthenticatedUser,@Param("sessionId",ParseUUIDPipe)id:string){return this.vr.stop(u,id)} @Post("me/vr-sessions/:sessionId/complete") complete(@CurrentUser()u:AuthenticatedUser,@Param("sessionId",ParseUUIDPipe)id:string,@Body()body:Record<string,unknown>){return this.vr.complete(u,id,body.reflection as Record<string,unknown>)} }
