import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

// Snooze a reminder by N minutes (matches the Telegram stepper's 5–180 range).
export class SnoozeDto {
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(180)
  minutes: number;
}
