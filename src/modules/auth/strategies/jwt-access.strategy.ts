import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import type { AuthUser } from '../../../common/types/auth-user';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  username: string;
  role: AuthUser['role'];
  avatarUrl?: string | null;
}

// Reads the access token from the `access_token` cookie.
const cookieExtractor = (req: Request): string | null => {
  return req?.cookies?.access_token ?? null;
};

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(
  Strategy,
  'jwt-access',
) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([cookieExtractor]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret')!,
    });
  }

  // Return value becomes req.user.
  validate(payload: AccessTokenPayload): AuthUser {
    return {
      userId: payload.sub,
      email: payload.email,
      username: payload.username,
      role: payload.role,
      avatarUrl: payload.avatarUrl ?? null,
    };
  }
}
