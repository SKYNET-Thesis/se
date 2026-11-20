import { Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { CurrentUser } from "../identity/auth/current-user.decorator";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { SupabaseAuthGuard } from "../identity/auth/supabase-auth.guard";
import { ACADEMIC_LEVELS } from "./course-academic";
import { CourseDiscoveryService } from "./course-discovery.service";

export class CatalogQueryDto {
  @IsOptional() @IsIn(ACADEMIC_LEVELS as unknown as string[]) level?: string;
  @IsOptional() @IsString() @MaxLength(32) tag?: string;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
}

@ApiTags("Course discovery") @ApiBearerAuth() @UseGuards(SupabaseAuthGuard) @Controller("me/course-catalog")
export class CourseDiscoveryController {
  constructor(private readonly discovery: CourseDiscoveryService) {}
  @Get() catalog(@CurrentUser() user: AuthenticatedUser, @Query() query: CatalogQueryDto) { return this.discovery.catalog(user, query); }
  @Post(":classroomId/enroll") enroll(@CurrentUser() user: AuthenticatedUser, @Param("classroomId", ParseUUIDPipe) classroomId: string) { return this.discovery.enroll(user, classroomId); }
}
