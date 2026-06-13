import { SetMetadata } from '@nestjs/common';
import { UserRoles } from '../../modules/user/entities/user.entity';

export const ROLES_KEY = 'roles';

// Restricts a route to the given roles (used together with RolesGuard).
export const Roles = (...roles: UserRoles[]) => SetMetadata(ROLES_KEY, roles);
