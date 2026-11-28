import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../identity/auth/current-user.decorator";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { SupabaseAuthGuard } from "../identity/auth/supabase-auth.guard";
import { AllowPasswordChangeOnly } from "../identity/auth/allow-password-change.decorator";
import { CreateStaffAccountDto, StaffPasswordChangeDto } from "./dto/staff-account.dto";
import { StaffAccountService } from "./staff-account.service";

/** Direct creation / invitation of School Administrators and Instructors, recovery of pending accounts, and the mandatory first-login change. */
@Controller()
export class StaffAccountController {
  constructor(private readonly staff: StaffAccountService) {}

  /** Public, non-sensitive probe so the UI offers "Create Account" only when the server can really enforce the first-login gate. */
  @Get("auth/staff/capabilities")
  @Header("Cache-Control", "no-store")
  capabilities() { return this.staff.capabilities(); }

  @Post("education-admin/organizations/:organizationId/accounts")
  @UseGuards(SupabaseAuthGuard)
  @Header("Cache-Control", "no-store, private") @Header("Pragma", "no-cache")
  create(@CurrentUser() user: AuthenticatedUser, @Param("organizationId", ParseUUIDPipe) organizationId: string, @Body() dto: CreateStaffAccountDto) {
    return this.staff.create(user, organizationId, dto);
  }

  @Post("education-admin/organizations/:organizationId/accounts/:userId/recover-pending")
  @UseGuards(SupabaseAuthGuard)
  @Header("Cache-Control", "no-store, private") @Header("Pragma", "no-cache")
  recoverPending(@CurrentUser() user: AuthenticatedUser, @Param("organizationId", ParseUUIDPipe) organizationId: string, @Param("userId", ParseUUIDPipe) userId: string) {
    return this.staff.recoverPending(user, organizationId, userId);
  }

  @Post("education-admin/organizations/:organizationId/accounts/:userId/reset-credentials")
  @UseGuards(SupabaseAuthGuard)
  @Header("Cache-Control", "no-store, private") @Header("Pragma", "no-cache")
  resetCredentials(@CurrentUser() user: AuthenticatedUser, @Param("organizationId", ParseUUIDPipe) organizationId: string, @Param("userId", ParseUUIDPipe) userId: string) {
    return this.staff.resetTemporary(user, organizationId, userId);
  }

  @Patch("auth/staff/password")
  @UseGuards(SupabaseAuthGuard)
  @AllowPasswordChangeOnly()
  @Header("Cache-Control", "no-store, private")
  changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: StaffPasswordChangeDto) {
    return this.staff.changeFirstLoginPassword(user, dto);
  }
}
