import { UserRoles } from '../../modules/user/entities/user.entity';

// Shape injected onto req.user by the access-token strategy.
export interface AuthUser {
  userId: string;
  email: string;
  username: string;
  role: UserRoles;
  avatarUrl?: string | null;
}
