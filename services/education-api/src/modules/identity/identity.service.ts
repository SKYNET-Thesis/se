import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/database/prisma.service";
import { AuthenticatedUser } from "./auth/authenticated-user.interface";
import { UpdateMyProfileDto } from "./dto/update-my-profile.dto";

@Injectable()
export class IdentityService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(currentUser: AuthenticatedUser) {
    const user = await this.prisma.users.findUnique({
      where: { id: currentUser.vistaUserId },
      select: {
        id: true, email: true, full_name: true, status: true, signup_method: true,
        email_verified_at: true, created_at: true, updated_at: true,
      },
    });
    if (!user) throw new NotFoundException("VISTA user was not found.");
    return this.toProfile(user);
  }

  async updateMyProfile(currentUser: AuthenticatedUser, dto: UpdateMyProfileDto) {
    const user = await this.prisma.users.update({
      where: { id: currentUser.vistaUserId },
      data: { full_name: dto.fullName.trim() },
      select: {
        id: true, email: true, full_name: true, status: true, signup_method: true,
        email_verified_at: true, created_at: true, updated_at: true,
      },
    });
    return this.toProfile(user);
  }

  getMyPermissions(currentUser: AuthenticatedUser) {
    return {
      system: { roleCodes: currentUser.systemRoleCodes, permissionCodes: currentUser.systemPermissions },
      memberships: currentUser.memberships.map((membership) => ({
        membershipId: membership.id,
        organizationId: membership.organizationId,
        roleCode: membership.roleCode,
        status: membership.status,
        permissionCodes: membership.permissions,
      })),
    };
  }

  getMyRoles(currentUser: AuthenticatedUser) {
    return {
      systemRoleCodes: currentUser.systemRoleCodes,
      memberships: currentUser.memberships.map((membership) => ({
        membershipId: membership.id,
        organizationId: membership.organizationId,
        roleCode: membership.roleCode,
        status: membership.status,
      })),
    };
  }

  getMyMemberships(currentUser: AuthenticatedUser) {
    return currentUser.memberships.map((membership) => ({
      membershipId: membership.id,
      organizationId: membership.organizationId,
      roleCode: membership.roleCode,
      status: membership.status,
      permissionCodes: membership.permissions,
    }));
  }

  private toProfile(user: {
    id: string; email: string; full_name: string; status: string; signup_method: string;
    email_verified_at: Date | null; created_at: Date; updated_at: Date;
  }) {
    return {
      id: user.id, email: user.email, fullName: user.full_name, status: user.status,
      signupMethod: user.signup_method, emailVerifiedAt: user.email_verified_at,
      createdAt: user.created_at, updatedAt: user.updated_at,
    };
  }
}
