import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthenticatedUser } from "./authenticated-user.interface";
import { REQUIRED_PERMISSIONS_KEY } from "./require-permissions.decorator";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;
    const user = context.switchToHttp().getRequest().user as AuthenticatedUser;
    const effectivePermissions = new Set([
      ...user.systemPermissions,
      ...user.memberships.flatMap((membership) => membership.permissions),
    ]);
    if (required.every((permission) => effectivePermissions.has(permission))) return true;
    throw new ForbiddenException("Missing required permission.");
  }
}
