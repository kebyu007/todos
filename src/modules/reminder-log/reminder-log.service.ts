import { Injectable } from '@nestjs/common';
import { CreateReminderLogDto } from './dto/create-reminder-log.dto';
import { UpdateReminderLogDto } from './dto/update-reminder-log.dto';

@Injectable()
export class ReminderLogService {
  create(createReminderLogDto: CreateReminderLogDto) {
    return 'This action adds a new reminderLog';
  }

  findAll() {
    return `This action returns all reminderLog`;
  }

  findOne(id: number) {
    return `This action returns a #${id} reminderLog`;
  }

  update(id: number, updateReminderLogDto: UpdateReminderLogDto) {
    return `This action updates a #${id} reminderLog`;
  }

  remove(id: number) {
    return `This action removes a #${id} reminderLog`;
  }
}
