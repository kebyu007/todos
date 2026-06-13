import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { TodosModule } from '../todos/todos.module';
import { UserModule } from '../user/user.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [TodosModule, UserModule, TelegramModule],
  providers: [NotificationsService],
})
export class NotificationsModule {}
