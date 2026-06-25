import { Transform } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Priority, TodoStatus } from '../entities/todo.entity';
import * as moment from 'moment-timezone'; // Namespace import saqlanadi

// Splits a comma-separated form field ("work, home") into a string[].
const toStringArray = ({ value }: { value: unknown }): string[] => {
  if (Array.isArray(value))
    return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
};

export class CreateTodoDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  // Normalize the wall-clock the user typed to a plain local datetime string
  // (NO timezone/Z suffix). The service is the single place that converts it
  // to UTC using the user's own timezone — so storage is identical on a
  // UTC AWS box and a local machine.
  @IsOptional()
  @Transform(({ value }) => {
    if (!value || value === '') return undefined;

    // Parse as UTC purely to keep the wall-clock numbers intact across
    // server timezones; format WITHOUT an offset so it stays a plain local
    // datetime for the service to convert.
    const parsed = moment.utc(
      value,
      [
        'YYYY-MM-DDTHH:mm',
        'YYYY-MM-DDTHH:mm:ss',
        'DD.MM.YYYY, HH:mm',
        'DD.MM.YYYY HH:mm',
      ],
      true,
    );

    return parsed.isValid() ? parsed.format('YYYY-MM-DDTHH:mm:ss') : value;
  })
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @IsEnum(TodoStatus)
  status?: TodoStatus;

  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}