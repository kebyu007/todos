import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ReminderLogService } from './reminder-log.service';
import { CreateReminderLogDto } from './dto/create-reminder-log.dto';
import { UpdateReminderLogDto } from './dto/update-reminder-log.dto';

@Controller('reminder-log')
export class ReminderLogController {
  constructor(private readonly reminderLogService: ReminderLogService) {}

  @Post()
  create(@Body() createReminderLogDto: CreateReminderLogDto) {
    return this.reminderLogService.create(createReminderLogDto);
  }

  @Get()
  findAll() {
    return this.reminderLogService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.reminderLogService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateReminderLogDto: UpdateReminderLogDto) {
    return this.reminderLogService.update(+id, updateReminderLogDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.reminderLogService.remove(+id);
  }
}
