import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { StudentLoginDto } from "./dto/student-login.dto";
import { StudentSetupDto } from "./dto/student-setup.dto";
import { StudentAuthHttpsGuard } from "./student-auth-https.guard";
import { StudentAuthRateLimitGuard } from "./student-auth-rate-limit.guard";
import { StudentAuthService } from "./student-auth.service";

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
}