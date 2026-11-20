import { Body, Controller, Get, Header, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { StudentLoginDto } from "./dto/student-login.dto";
import { StudentSetupDto } from "./dto/student-setup.dto";
import { StudentPasswordRecoveryDto } from "./dto/student-password-recovery.dto";
import { StudentAuthHttpsGuard } from "./student-auth-https.guard";
import { StudentAuthRateLimitGuard } from "./student-auth-rate-limit.guard";
import { StudentAuthService } from "./student-auth.service";
import { SupabaseAuthGuard } from "../identity/auth/supabase-auth.guard";
import { CurrentUser } from "../identity/auth/current-user.decorator";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { AllowPasswordChangeOnly } from "../identity/auth/allow-password-change.decorator";
import { StudentPasswordChangeDto } from "./dto/student-password-change.dto";
import { studentTempPasswordEnabled } from "./student-temp-password.feature";

@ApiTags("Student authentication")
@Controller("auth/students")
@UseGuards(StudentAuthHttpsGuard, StudentAuthRateLimitGuard)
export class StudentAuthController {
  constructor(private readonly studentAuth: StudentAuthService) {}

  @Post("login")
  login(@Body() dto: StudentLoginDto) {
    return this.studentAuth.login(dto);
  }

  @Post("setup")
  setup(@Body() dto: StudentSetupDto) {
    return this.studentAuth.setup(dto);
  }

  @Post("recover")
  recover(@Body() dto: StudentPasswordRecoveryDto) {
    return this.studentAuth.recover(dto);
  }

  /**
   * Public, non-sensitive capability probe so the login page can show the onboarding that matches the server's actual state
   * (temporary-password onboarding vs the legacy Setup Code). It cannot drift from the backend like a build-time frontend flag.
   */
  @Get("capabilities")
  @Header("Cache-Control", "no-store")
  capabilities() {
    return { temporaryPasswordEnabled: studentTempPasswordEnabled() };
  }

  @Patch("password")
  @UseGuards(SupabaseAuthGuard)
  @AllowPasswordChangeOnly()
  changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: StudentPasswordChangeDto) {
    return this.studentAuth.changeFirstLoginPassword(user, dto);
  }
}