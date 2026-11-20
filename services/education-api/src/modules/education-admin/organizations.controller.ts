import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../identity/auth/current-user.decorator";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { SupabaseAuthGuard } from "../identity/auth/supabase-auth.guard";
import { EducationAdminService } from "./education-admin.service";
import { CreateOrganizationDto } from "./dto/create-organization.dto";
import { UpdateOrganizationDto } from "./dto/update-organization.dto";
import { AssignSchoolAdminDto } from "./dto/assign-school-admin.dto";

@ApiTags("Organizations")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller("organizations")
export class OrganizationsController {
  constructor(private readonly educationAdmin: EducationAdminService) {}

  @Get()
  @ApiOperation({ summary: "List all organizations (System Admin only)" })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.educationAdmin.organizations(user);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create a new organization (System Admin only)" })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOrganizationDto) {
    return this.educationAdmin.createOrganization(user, dto);
  }

  @Get(":organizationId")
  @ApiOperation({ summary: "Get organization details (System Admin only)" })
  get(@CurrentUser() user: AuthenticatedUser, @Param("organizationId", ParseUUIDPipe) organizationId: string) {
    return this.educationAdmin.getOrganization(user, organizationId);
  }

  @Patch(":organizationId")
  @ApiOperation({ summary: "Update organization details (System Admin only)" })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.educationAdmin.updateOrganization(user, organizationId, dto);
  }

  @Get(":organizationId/admins")
  @ApiOperation({ summary: "List school administrators for organization (System Admin only)" })
  listAdmins(@CurrentUser() user: AuthenticatedUser, @Param("organizationId", ParseUUIDPipe) organizationId: string) {
    return this.educationAdmin.listSchoolAdmins(user, organizationId);
  }

  @Post(":organizationId/admins")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Assign a school administrator to an organization (System Admin only)" })
  assignAdmin(
    @CurrentUser() user: AuthenticatedUser,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Body() dto: AssignSchoolAdminDto,
  ) {
    return this.educationAdmin.assignSchoolAdmin(user, organizationId, dto);
  }

  @Delete(":organizationId/admins/:userId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Remove a school administrator from an organization (System Admin only)" })
  removeAdmin(
    @CurrentUser() user: AuthenticatedUser,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("userId", ParseUUIDPipe) userId: string,
  ) {
    return this.educationAdmin.removeSchoolAdmin(user, organizationId, userId);
  }
}
