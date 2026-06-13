import { PartialType } from '@nestjs/mapped-types';
import { CreateReminderLogDto } from './create-reminder-log.dto';

export class UpdateReminderLogDto extends PartialType(CreateReminderLogDto) {}
