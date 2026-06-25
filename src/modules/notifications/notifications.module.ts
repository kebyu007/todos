import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { DevicesController } from './devices.controller';
import { TodosModule } from '../todos/todos.module';
import { UserModule } from '../user/user.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [TodosModule, UserModule, TelegramModule],
  controllers: [DevicesController],
  providers: [NotificationsService, PushService],
  exports: [PushService],
})
export class NotificationsModule {}
