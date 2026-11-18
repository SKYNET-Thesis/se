import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { PrismaService } from "../../../common/database/prisma.service";
import { AuthenticatedUser } from "./authenticated-user.interface";
import { ALLOW_PASSWORD_CHANGE_ONLY_KEY } from "./allow-password-change.decorator";
import { studentTempPasswordEnabled } from "../../education-admin/student-temp-password.feature";

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private jwks?: ReturnType<typeof createRemoteJWKSet>;
  private jwksUrl?: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearerToken(request);
    const { issuer, jwksUrl, audience } = this.getJwtConfiguration();
    const { payload } = await jwtVerify(token, this.getJwks(jwksUrl), {
      issuer,
      audience,
    }).catch(() => {
      throw new UnauthorizedException("Invalid or expired Supabase access token.");
    });

    if (typeof payload.sub !== "string" || payload.sub.length === 0) {
      throw new UnauthorizedException("Supabase access token has no subject.");
    }

    // auth.users is intentionally not a Prisma relation.  The scalar mapping is
    // queried explicitly until Prisma can safely introspect the cross-schema FK.
    const users = studentTempPasswordEnabled()
      ? await this.prisma.$queryRaw<VistaUserRow[]>`
      SELECT u.id, u.email, u.status, EXISTS (
        SELECT 1 FROM public.education_school_user_profiles p
        WHERE p.user_id = u.id AND p.person_type = 'student' AND p.password_change_required = true
      ) AS password_change_required, (
        SELECT MAX(p.password_changed_at) FROM public.education_school_user_profiles p
        WHERE p.user_id = u.id AND p.person_type = 'student'
      ) AS password_changed_at, (
        SELECT MIN(p.temporary_password_expires_at) FROM public.education_school_user_profiles p
        WHERE p.user_id = u.id AND p.person_type = 'student' AND p.password_change_required = true
          AND p.temporary_password_expires_at IS NOT NULL
      ) AS temporary_password_expires_at
      FROM public.users u
      WHERE u.auth_user_id = ${payload.sub}::uuid
      LIMIT 1
    `
      : await this.prisma.$queryRaw<VistaUserRow[]>`
      SELECT u.id, u.email, u.status, false AS password_change_required,
        NULL::timestamptz AS password_changed_at, NULL::timestamptz AS temporary_password_expires_at
      FROM public.users u
      WHERE u.auth_user_id = ${payload.sub}::uuid
      LIMIT 1
    `;
    const user = users[0];

    if (!user) {
      throw new ForbiddenException("No linked VISTA account exists for this identity.");
    }
    if (user.status === "disabled") {
      throw new ForbiddenException("This VISTA account is disabled.");
    }
    const passwordChangedAt = user.password_changed_at ? new Date(user.password_changed_at).getTime() : null;
    if (passwordChangedAt !== null && (typeof payload.iat !== "number" || payload.iat * 1000 <= passwordChangedAt)) {
      throw new UnauthorizedException({ code: "SESSION_ROTATED", message: "This session is stale. Sign in again." });
    }
    const temporaryExpiry = user.temporary_password_expires_at ? new Date(user.temporary_password_expires_at).getTime() : null;
    if (user.password_change_required && temporaryExpiry !== null && temporaryExpiry <= Date.now()) {
      throw new ForbiddenException({ code: "TEMPORARY_PASSWORD_EXPIRED", message: "Temporary password expired. Ask your school administrator to reissue it." });
    }
    const passwordChangeOnly = this.reflector?.getAllAndOverride<boolean>(ALLOW_PASSWORD_CHANGE_ONLY_KEY, [
      context.getHandler(), context.getClass(),
    ]) ?? false;
    if (user.password_change_required && !passwordChangeOnly) {
      throw new ForbiddenException({ code: "PASSWORD_CHANGE_REQUIRED", message: "Change your temporary password to continue." });
    }

    const [systemRows, membershipRows] = await Promise.all([
      this.prisma.$queryRaw<SystemPermissionRow[]>`
        SELECT r.code AS role_code, p.code AS permission_code
        FROM public.user_system_roles usr
        JOIN public.roles r ON r.id = usr.role_id
        LEFT JOIN public.role_permissions rp ON rp.role_id = r.id
        LEFT JOIN public.permissions p ON p.id = rp.permission_id
        WHERE usr.user_id = ${user.id}::uuid
      `,
      this.prisma.$queryRaw<MembershipPermissionRow[]>`
        SELECT
          m.id AS membership_id,
          m.organization_id,
          m.status,
          r.code AS role_code,
          p.code AS permission_code
        FROM public.memberships m
        JOIN public.roles r ON r.id = m.role_id
        LEFT JOIN public.role_permissions rp ON rp.role_id = r.id
        LEFT JOIN public.permissions p ON p.id = rp.permission_id
        WHERE m.user_id = ${user.id}::uuid
      `,
    ]);

    const memberships = this.toMemberships(membershipRows);
    (request as Request & { user: AuthenticatedUser }).user = {
      authUserId: payload.sub,
      vistaUserId: user.id,
      email: user.email,
      status: user.status,
      systemRoleCodes: [...new Set(systemRows.map((row) => row.role_code))].sort(),
      systemPermissions: this.uniquePermissions(
        systemRows.flatMap((row) => row.permission_code ? [row.permission_code] : []),
      ),
      memberships,
    } satisfies AuthenticatedUser;
    return true;
  }

  private extractBearerToken(request: Request): string {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
      throw new UnauthorizedException("A Supabase Bearer access token is required.");
    }
    const token = authorization.slice("Bearer ".length).trim();
    if (!token) throw new UnauthorizedException("A Supabase Bearer access token is required.");
    return token;
  }

  private getJwtConfiguration(): { issuer: string; jwksUrl: string; audience: string } {
    const supabaseUrl = this.config.get<string>("SUPABASE_URL")?.replace(/\/$/, "");
    const issuer = this.config.get<string>("SUPABASE_JWT_ISSUER") ??
      (supabaseUrl ? `${supabaseUrl}/auth/v1` : undefined);
    const jwksUrl = this.config.get<string>("SUPABASE_JWKS_URL") ??
      (issuer ? `${issuer}/.well-known/jwks.json` : undefined);
    if (!issuer || !jwksUrl) {
      throw new Error("SUPABASE_URL (or SUPABASE_JWT_ISSUER and SUPABASE_JWKS_URL) must be configured.");
    }
    return {
      issuer,
      jwksUrl,
      audience: this.config.get<string>("SUPABASE_JWT_AUDIENCE") ?? "authenticated",
    };
  }

  private getJwks(jwksUrl: string): ReturnType<typeof createRemoteJWKSet> {
    if (!this.jwks || this.jwksUrl !== jwksUrl) {
      this.jwks = createRemoteJWKSet(new URL(jwksUrl));
      this.jwksUrl = jwksUrl;
    }
    return this.jwks;
  }

  private uniquePermissions(permissions: string[]): string[] {
    return [...new Set(permissions)].sort();
  }

  private toMemberships(rows: MembershipPermissionRow[]): AuthenticatedUser["memberships"] {
    const grouped = new Map<string, AuthenticatedUser["memberships"][number]>();
    for (const row of rows) {
      const membership = grouped.get(row.membership_id) ?? {
        id: row.membership_id,
        organizationId: row.organization_id,
        roleCode: row.role_code,
        status: row.status,
        permissions: [],
      };
      if (row.status === "active" && row.permission_code) {
        membership.permissions.push(row.permission_code);
      }
      grouped.set(row.membership_id, membership);
    }
    return [...grouped.values()]
      .map((membership) => ({ ...membership, permissions: this.uniquePermissions(membership.permissions) }))
      .sort((a, b) => a.organizationId.localeCompare(b.organizationId));
  }
}

interface VistaUserRow {
  id: string;
  email: string;
  status: string;
  password_change_required: boolean;
  password_changed_at: Date | string | null;
  temporary_password_expires_at: Date | string | null;
}

interface SystemPermissionRow {
  role_code: string;
  permission_code: string | null;
}

interface MembershipPermissionRow {
  membership_id: string;
  organization_id: string;
  status: string;
  role_code: string;
  permission_code: string | null;
}
