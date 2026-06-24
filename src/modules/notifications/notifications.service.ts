import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TodosService } from '../todos/todos.service';
import { UserService } from '../user/user.service';
import { TelegramService } from '../telegram/telegram.service';
import { UserDocument } from '../user/entities/user.entity';

const MINUTE = 60 * 1000;
// Don't fire reminders whose moment passed long ago (e.g. after downtime).
const STALE_WINDOW = 24 * 60 * MINUTE;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly todosService: TodosService,
    private readonly userService: UserService,
    private readonly telegram: TelegramService,
  ) {}

  // Every minute: deliver any reminder (1h-before / at-due) that is now due.
  @Cron(CronExpression.EVERY_MINUTE)
  async sweep(): Promise<void> {
    if (!this.telegram.isEnabled()) return;

    const now = Date.now();
    const todos = await this.todosService.findDueReminderTodos();
    if (todos.length === 0) return;

    // Cache owners so multiple todos by the same user hit the DB once.
    const userCache = new Map<string, UserDocument | null>();

    for (const todo of todos) {
      if (!todo.dueAt) continue;
      const ownerId = todo.userId.toString();

      let owner = userCache.get(ownerId);
      if (owner === undefined) {
        owner = await this.userService.findByIdOrNull(ownerId);
        userCache.set(ownerId, owner);
      }

      const dueMs = new Date(todo.dueAt).getTime();
      let changed = false;

      for (const reminder of todo.reminders) {
        if (reminder.sent) continue;
        const fireAt = dueMs - reminder.offsetMinutes * MINUTE;
        if (fireAt > now) continue; // not time yet

        // Only deliver to opted-in, linked users within the freshness window.
        const deliverable =
          owner?.telegramChatId &&
          owner.notificationsEnabled &&
          fireAt >= now - STALE_WINDOW;

        // ... (Tepadagi kodlar o'zgarishsiz qoladi)

        if (deliverable) {
          try {
            // Foydalanuvchining shaxsiy timezone'ini aniqlaymiz
            const timezone = owner?.timezone || 'Asia/Tashkent';

            await this.telegram.sendReminder(
              owner!.telegramChatId!,
              todo,
              reminder.offsetMinutes,
              timezone, // To'rtinchi argument qilib uzatdik!
            );
          } catch (err) {
            this.logger.error(
              `Failed to send reminder for todo ${todo._id}`,
              err as Error,
            );
            continue;
          }
        }
        reminder.sent = true;
        reminder.sentAt = new Date();
        changed = true;
      }

      if (changed) await todo.save();
    }
  }
}
