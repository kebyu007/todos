import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { UserModule } from '../user/user.module';
import { TodosModule } from '../todos/todos.module';

@Module({
  imports: [UserModule, TodosModule],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
