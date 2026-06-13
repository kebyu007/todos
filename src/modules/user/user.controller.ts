import { Body, Controller, Get, Post, Render, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { UserService } from './user.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { setFlash } from '../../common/utils/flash';

// Self-service profile page. Admin user management lives in AdminController.
@Controller('profile')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @Render('pages/profile')
  async profile(@CurrentUser() current: AuthUser) {
    const user = await this.userService.findByIdWithTelegram(current.userId);
    const botUsername = this.config.get<string>('telegram.botUsername');
    const telegramEnabled = this.config.get<boolean>('telegram.enabled');

    // Deep link the user taps to finish linking in the Telegram app.
    const linkUrl =
      botUsername && user?.telegramLinkToken
        ? `https://t.me/${botUsername}?start=${user.telegramLinkToken}`
        : null;

    return {
      layout: 'layouts/main',
      title: 'Profile',
      currentUser: current,
      user,
      telegram: {
        enabled: telegramEnabled,
        connected: Boolean(user?.telegramChatId),
        linkUrl,
      },
    };
  }

  @Post()
  async update(
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateUserDto,
    @Res() res: Response,
  ): Promise<void> {
    // Self-service edits must never let a user escalate their own role.
    delete dto.role;
    await this.userService.update(userId, dto);
    setFlash(res, 'success', 'Profile updated');
    res.redirect('/profile');
  }

  // Generate a one-time link token, then show the deep link on /profile.
  @Post('telegram/connect')
  async connectTelegram(
    @CurrentUser('userId') userId: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.userService.generateTelegramLinkToken(userId);
    setFlash(res, 'info', 'Tap "Open Telegram" to finish linking');
    res.redirect('/profile');
  }

  @Post('telegram/disconnect')
  async disconnectTelegram(
    @CurrentUser('userId') userId: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.userService.unlinkTelegram(userId);
    setFlash(res, 'success', 'Telegram disconnected');
    res.redirect('/profile');
  }
}
