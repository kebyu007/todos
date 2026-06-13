import { Module } from '@nestjs/common';
import { ReminderLogService } from './reminder-log.service';
import { ReminderLogController } from './reminder-log.controller';

@Module({
  controllers: [ReminderLogController],
  providers: [ReminderLogService],
})
export class ReminderLogModule {}
