import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
}

const cookieExtractor = (req: Request): string | null => {
  return req?.cookies?.refresh_token ?? null;
};

// Validates the refresh token signature AND hands the raw token back so the
// service can compare it to the stored argon2 hash (rotation/reuse detection).
@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([cookieExtractor]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.refreshSecret')!,
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: RefreshTokenPayload) {
    const refreshToken = req?.cookies?.refresh_token ?? null;
    return { ...payload, refreshToken };
  }
}
