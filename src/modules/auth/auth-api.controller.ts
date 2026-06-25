import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { AuthService, toPublicUser } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserService } from '../user/user.service';

// JSON auth API for the mobile app. Unlike the cookie-based web controller,
// these return the tokens in the response body for the app to store securely.
@Controller('api/auth')
export class AuthApiController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
  ) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.registerMobile(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.authService.loginMobile(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refreshMobile(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentUser('userId') userId: string): Promise<void> {
    await this.authService.logoutMobile(userId);
  }

  @Get('me')
  async me(@CurrentUser('userId') userId: string) {
    const user = await this.userService.findById(userId);
    return toPublicUser(user);
  }
}
