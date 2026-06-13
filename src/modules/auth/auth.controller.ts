import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Render,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtRefreshGuard } from '../../common/guards/jwt-refresh.guard';
import { GoogleAuthGuard } from '../../common/guards/google-auth.guard';
import { GoogleProfile } from './strategies/google.strategy';
import { setFlash } from '../../common/utils/flash';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ---- Pages ----
  @Public()
  @Get('login')
  @Render('pages/login')
  loginPage() {
    return { layout: 'layouts/main', title: 'Sign in' };
  }

  @Public()
  @Get('register')
  @Render('pages/register')
  registerPage() {
    return { layout: 'layouts/main', title: 'Create account' };
  }

  // ---- Local auth ----
  @Public()
  @Post('auth/register')
  async register(@Body() dto: RegisterDto, @Res() res: Response): Promise<void> {
    const user = await this.authService.register(dto, res);
    setFlash(res, 'success', `Welcome aboard, ${user.username}!`);
    res.redirect('/');
  }

  @Public()
  @Post('auth/login')
  async login(@Body() dto: LoginDto, @Res() res: Response): Promise<void> {
    const user = await this.authService.login(dto, res);
    setFlash(res, 'success', `Welcome back, ${user.username}!`);
    res.redirect('/');
  }

  // ---- Google OAuth ----
  // Step 1: redirect the user to Google's consent screen.
  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('auth/google')
  googleStart(): void {
    // GoogleAuthGuard performs the redirect; this body never runs.
  }

  // Step 2: Google redirects back here; req.user is the validated profile.
  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('auth/google/callback')
  async googleCallback(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const profile = req.user as GoogleProfile;
    const user = await this.authService.googleLogin(profile, res);
    setFlash(res, 'success', `Signed in as ${user.username}`);
    res.redirect('/');
  }

  // ---- Session lifecycle ----
  @Public()
  @UseGuards(JwtRefreshGuard)
  @Post('auth/refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res() res: Response): Promise<void> {
    const payload = req.user as { sub: string; refreshToken: string };
    await this.authService.refresh(payload.sub, payload.refreshToken, res);
    res.json({ ok: true });
  }

  @Post('auth/logout')
  async logout(
    @CurrentUser('userId') userId: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.authService.logout(userId, res);
    setFlash(res, 'info', 'You have been signed out');
    res.redirect('/login');
  }
}
