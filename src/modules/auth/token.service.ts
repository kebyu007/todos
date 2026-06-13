import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { CookieOptions, Response } from 'express';
import { UserDocument } from '../user/entities/user.entity';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

// Signs access/refresh JWTs and writes them as httpOnly cookies.
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async issueTokens(user: UserDocument): Promise<IssuedTokens> {
    const userId = user._id.toString();

    const accessToken = await this.jwt.signAsync(
      {
        sub: userId,
        email: user.email,
        username: user.username,
        role: user.role,
        avatarUrl: user.avatarUrl ?? null,
      },
      {
        secret: this.config.get<string>('jwt.accessSecret'),
        // ms-style duration string ('15m'); cast for jsonwebtoken's types.
        expiresIn: this.config.get<string>('jwt.accessTtl') as any,
      },
    );

    const refreshToken = await this.jwt.signAsync(
      { sub: userId, jti: randomUUID() },
      {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: this.config.get<string>('jwt.refreshTtl') as any,
      },
    );

    return { accessToken, refreshToken };
  }

  setAuthCookies(res: Response, tokens: IssuedTokens): void {
    const secure = this.config.get<boolean>('cookie.secure') ?? false;
    const base: CookieOptions = { httpOnly: true, secure };

    res.cookie('access_token', tokens.accessToken, {
      ...base,
      sameSite: 'lax',
      path: '/',
      maxAge: 15 * 60 * 1000, // 15m
    });

    // Refresh cookie is scoped to /auth so it never rides along normal requests.
    res.cookie('refresh_token', tokens.refreshToken, {
      ...base,
      sameSite: 'strict',
      path: '/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7d
    });
  }

  clearAuthCookies(res: Response): void {
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/auth' });
  }
}
