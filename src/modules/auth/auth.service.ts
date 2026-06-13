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
