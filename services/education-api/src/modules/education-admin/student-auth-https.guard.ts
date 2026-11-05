import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Request } from "express";

@Injectable()
export class StudentAuthHttpsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (process.env.NODE_ENV !== "production") return true;
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.secure) throw new ForbiddenException("Student authentication requires HTTPS.");
    return true;
  }
}