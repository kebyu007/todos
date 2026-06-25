import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import * as argon2 from 'argon2';
import { UserService } from '../user/user.service';
import { UserDocument } from '../user/entities/user.entity';
import { TokenService } from './token.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

// Shape returned to the mobile app on auth (tokens travel in the body, not cookies).
export interface MobileAuthResult {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}

export interface PublicUser {
  id: string;
  email: string;
  username: string;
  role: UserDocument['role'];
  avatarUrl: string | null;
  timezone: string;
  notificationsEnabled: boolean;
}

export function toPublicUser(user: UserDocument): PublicUser {
  return {
    id: user._id.toString(),
    email: user.email,
    username: user.username,
    role: user.role,
    avatarUrl: user.avatarUrl ?? null,
    timezone: user.timezone,
    notificationsEnabled: user.notificationsEnabled,
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly tokenService: TokenService,
  ) {}

  async register(dto: RegisterDto, res: Response): Promise<UserDocument> {
    const user = await this.userService.create({
      email: dto.email,
      username: dto.username,
      password: dto.password,
      timezone: dto.timezone,
    });
    await this.issueAndSet(user, res);
    return user;
  }

  async login(dto: LoginDto, res: Response): Promise<UserDocument> {
    const user = await this.userService.findByEmailWithSecret(dto.email);
    if (!user || !(await this.userService.verifyPassword(user, dto.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    await this.issueAndSet(user, res);
    return user;
  }

  // Logs in (or links/creates) via a verified Google profile, then sets cookies.
  async googleLogin(
    profile: {
      googleId: string;
      email: string;
      username: string;
      avatarUrl: string | null;
    },
    res: Response,
  ): Promise<UserDocument> {
    const user = await this.userService.findOrCreateGoogleUser(profile);
    await this.issueAndSet(user, res);
    return user;
  }

  // Verifies the presented refresh token against the stored hash, then rotates.
  async refresh(
    userId: string,
    presentedToken: string,
    res: Response,
  ): Promise<void> {
    const user = await this.userService.findByIdWithRefresh(userId);
    if (!user || !user.hashedRefreshToken) {
      throw new UnauthorizedException('Session expired, please log in again');
    }

    const matches = await argon2.verify(
      user.hashedRefreshToken,
      presentedToken,
    );
    if (!matches) {
      // Reuse of an old/invalid refresh token → revoke the whole session.
      await this.userService.setRefreshToken(userId, null);
      throw new ForbiddenException('Refresh token reuse detected');
    }

    await this.issueAndSet(user, res);
  }

  async logout(userId: string, res: Response): Promise<void> {
    await this.userService.setRefreshToken(userId, null);
    this.tokenService.clearAuthCookies(res);
  }

  // ---- Mobile (token-in-body) auth ----

  async registerMobile(dto: RegisterDto): Promise<MobileAuthResult> {
    const user = await this.userService.create({
      email: dto.email,
      username: dto.username,
      password: dto.password,
      timezone: dto.timezone,
    });
    return this.issueMobile(user);
  }

  async loginMobile(dto: LoginDto): Promise<MobileAuthResult> {
    const user = await this.userService.findByEmailWithSecret(dto.email);
    if (!user || !(await this.userService.verifyPassword(user, dto.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.issueMobile(user);
  }

  // Verifies the presented refresh token (body), checks it against the stored
  // hash, then rotates — same reuse-detection as the cookie flow.
  async refreshMobile(refreshToken: string): Promise<MobileAuthResult> {
    let sub: string;
    try {
      ({ sub } = await this.tokenService.verifyRefreshToken(refreshToken));
    } catch {
      throw new UnauthorizedException('Session expired, please log in again');
    }

    const user = await this.userService.findByIdWithRefresh(sub);
    if (!user || !user.hashedRefreshToken) {
      throw new UnauthorizedException('Session expired, please log in again');
    }

    const matches = await argon2.verify(user.hashedRefreshToken, refreshToken);
    if (!matches) {
      await this.userService.setRefreshToken(sub, null);
      throw new ForbiddenException('Refresh token reuse detected');
    }

    return this.issueMobile(user);
  }

  async logoutMobile(userId: string): Promise<void> {
    await this.userService.setRefreshToken(userId, null);
  }

  // Issues a fresh AT+RT pair, persists the new RT hash, returns them in-body.
  private async issueMobile(user: UserDocument): Promise<MobileAuthResult> {
    const tokens = await this.tokenService.issueTokens(user);
    await this.userService.setRefreshToken(
      user._id.toString(),
      tokens.refreshToken,
    );
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: toPublicUser(user),
    };
  }

  // Issues a fresh AT+RT pair, persists the new RT hash, and writes cookies.
  private async issueAndSet(user: UserDocument, res: Response): Promise<void> {
    const tokens = await this.tokenService.issueTokens(user);
    await this.userService.setRefreshToken(
      user._id.toString(),
      tokens.refreshToken,
    );
    this.tokenService.setAuthCookies(res, tokens);
  }
}
