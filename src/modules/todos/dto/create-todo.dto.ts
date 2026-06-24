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

  // Bo'sh form maydonlarini tozalash va xavfsiz ISO formatga o'girish
  @IsOptional()
  @Transform(({ value }) => {
    if (!value || value === '') return undefined;
    
    // AWS yoki istalgan muhitda vaqtni o'zgartirmasdan "kiritilganidek" UTC qilib saqlaymiz
    const parsed = moment.utc(
      value,
      ['YYYY-MM-DDTHH:mm', 'DD.MM.YYYY, HH:mm', 'DD.MM.YYYY HH:mm'],
      true,
    );
    
    return parsed.isValid() ? parsed.format('YYYY-MM-DDTHH:mm:ss.SSS') : value;
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