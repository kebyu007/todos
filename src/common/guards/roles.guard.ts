import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRoles } from '../../modules/user/entities/user.entity';
import type { AuthUser } from '../types/auth-user';

// Enforces @Roles(...) metadata. Runs after JwtAuthGuard, so req.user is set.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRoles[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    const authUser = user as AuthUser | undefined;
    if (!authUser || !required.includes(authUser.role)) {
      throw new ForbiddenException('You do not have access to this resource');
    }
    return true;
  }
}
