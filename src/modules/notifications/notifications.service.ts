import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as moment from 'moment-timezone';
import { TodosService } from '../todos/todos.service';
import { UserService } from '../user/user.service';
import { TelegramService } from '../telegram/telegram.service';
import { PushService, PushMessage } from './push.service';
import { UserDocument } from '../user/entities/user.entity';
import { TodoDocument } from '../todos/entities/todo.entity';

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
    private readonly push: PushService,
  ) {}

  // Every minute: deliver any reminder (1h-before / at-due) that is now due.
  @Cron(CronExpression.EVERY_MINUTE)
  async sweep(): Promise<void> {
    // Epoch ms is timezone-agnostic; dueAt is stored in UTC, so compare
    // against the real current instant. (Timezone only matters for display.)
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
        // Snoozed reminders carry an absolute fire time; the rest are offsets
        // measured back from the due date.
        const isSnooze = Boolean(reminder.remindAt);
        const fireAt = isSnooze
          ? new Date(reminder.remindAt!).getTime()
          : dueMs - reminder.offsetMinutes * MINUTE;
        if (fireAt > now) continue; // not time yet

        // Only deliver to opted-in users within the freshness window.
        const fresh = fireAt >= now - STALE_WINDOW;
        if (owner?.notificationsEnabled && fresh) {
          const timezone = owner.timezone || 'Asia/Tashkent';

          // Telegram channel (best-effort).
          if (this.telegram.isEnabled() && owner.telegramChatId) {
            try {
              await this.telegram.sendReminder(
                owner.telegramChatId,
                todo,
                reminder.offsetMinutes,
                timezone,
                isSnooze,
              );
            } catch (err) {
              this.logger.error(
                `Telegram reminder failed for todo ${todo._id}`,
                err as Error,
              );
            }
          }

          // Mobile push channel (best-effort).
          if (owner.pushTokens?.length) {
            try {
              await this.push.sendToTokens(
                owner.pushTokens,
                this.buildPush(todo, reminder.offsetMinutes, isSnooze, timezone),
              );
            } catch (err) {
              this.logger.error(
                `Push reminder failed for todo ${todo._id}`,
                err as Error,
              );
            }
          }
        }

        // Mark sent regardless: avoids re-firing a past reminder if a channel
        // is unavailable or the user later links a device.
        reminder.sent = true;
        reminder.sentAt = new Date();
        changed = true;
      }

      if (changed) await todo.save();
    }
  }

  // Builds the push title/body, mirroring the Telegram reminder wording.
  private buildPush(
    todo: TodoDocument,
    offsetMinutes: number,
    isSnooze: boolean,
    timezone: string,
  ): PushMessage {
    const when = todo.dueAt
      ? moment.tz(todo.dueAt, timezone).format('DD MMM, HH:mm')
      : '';

    const title = isSnooze
      ? '😴 Snoozed reminder'
      : offsetMinutes >= 60
        ? '⏰ Due in 1 hour'
        : offsetMinutes > 0
          ? `⏰ Due in ${offsetMinutes} min`
          : '🔔 Due now';

    return {
      title,
      body: when ? `${todo.title} · ${when}` : todo.title,
      data: { todoId: todo._id.toString() },
    };
  }
}
