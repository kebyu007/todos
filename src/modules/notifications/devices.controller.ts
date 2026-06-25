import { Body, Controller, Delete, HttpCode, Post } from '@nestjs/common';
import { UserService } from '../user/user.service';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

// Mobile devices register/unregister their Expo push token here so the
// reminder sweep knows where to push.
@Controller('api/devices')
export class DevicesController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @HttpCode(204)
  async register(
    @CurrentUser('userId') userId: string,
    @Body() dto: RegisterDeviceDto,
  ): Promise<void> {
    await this.userService.addPushToken(userId, dto.token);
  }

  @Delete()
  @HttpCode(204)
  async unregister(
    @CurrentUser('userId') userId: string,
    @Body() dto: RegisterDeviceDto,
  ): Promise<void> {
    await this.userService.removePushToken(userId, dto.token);
  }
}
