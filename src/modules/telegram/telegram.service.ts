import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf, Markup, type Context } from 'telegraf';
import { UserService } from '../user/user.service';
import { TodosService } from '../todos/todos.service';
import { TodoDocument, TodoStatus } from '../todos/entities/todo.entity';
import { UserDocument } from '../user/entities/user.entity';
import type { AuthUser } from '../../common/types/auth-user';
import * as moment from 'moment-timezone';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private bot: Telegraf | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly userService: UserService,
    private readonly todosService: TodosService,
  ) {}

  isEnabled(): boolean {
    return Boolean(this.bot);
  }

  onModuleInit(): void {
    if (!this.config.get<boolean>('telegram.enabled')) {
      this.logger.warn('Telegram bot disabled (no TELEGRAM_BOT_TOKEN set)');
      return;
    }
    this.bot = new Telegraf(this.config.get<string>('telegram.botToken')!);
    this.registerHandlers(this.bot);

    this.bot
      .launch()
      .catch((err) => this.logger.error('Telegram bot launch failed', err));
    this.logger.log('Telegram bot starting…');
  }

  onModuleDestroy(): void {
    this.bot?.stop('SIGTERM');
  }

  // ---- TAROXIY O'ZGARISH: timezone parametri qo'shildi ----

  async sendReminder(
    chatId: string,
    todo: TodoDocument,
    offsetMinutes: number,
    timezone: string = 'Asia/Tashkent',
    isSnooze = false,
  ): Promise<void> {
    if (!this.bot) return;

    // Timezone mavjudligini va bo'sh emasligini tekshiramiz
    const activeZone =
      timezone && timezone.trim() ? timezone.trim() : 'Asia/Tashkent';

    const when = todo.dueAt
      ? moment.tz(todo.dueAt, activeZone).format('DD MMM, HH:mm')
      : '';

    const head = isSnooze
      ? `😴 Snoozed reminder`
      : offsetMinutes >= 60
        ? `⏰ Due in 1 hour`
        : offsetMinutes > 0
          ? `⏰ Due in ${offsetMinutes} min`
          : `🔔 Due now`;

    // Diagnostika uchun [Z: ${activeZone}] qo'shildi
    const text = `${head}\n*${this.escape(todo.title)}*\n🗓 ${when} `;

    await this.bot.telegram.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      ...this.todoButtons(todo),
    });
  }

  private registerHandlers(bot: Telegraf): void {
    bot.start(async (ctx) => this.handleStart(ctx));

    bot.help((ctx) =>
      ctx.reply(
        [
          '🤖 *Todos bot*',
          '',
          'Send any message to create a task.',
          '',
          '/list — your open tasks',
          '/new <title> — add a task',
          '/help — this message',
        ].join('\n'),
        { parse_mode: 'Markdown' },
      ),
    );

    bot.command('list', async (ctx) => this.handleList(ctx));
    bot.command('new', async (ctx) => {
      const title = ctx.message.text.replace(/^\/new(@\S+)?\s*/i, '').trim();
      await this.createTask(ctx, title);
    });

    bot.action(/^done:(.+)$/, async (ctx) => this.handleToggle(ctx));
    bot.action(/^del:(.+)$/, async (ctx) => this.handleDelete(ctx));

    // Snooze stepper: open → adjust (±5) → confirm, or cancel.
    bot.action(/^snooze:(.+)$/, async (ctx) => this.handleSnoozeOpen(ctx));
    bot.action(/^snz([+-]):([^:]+):(\d+)$/, async (ctx) =>
      this.handleSnoozeAdjust(ctx),
    );
    bot.action(/^snzok:([^:]+):(\d+)$/, async (ctx) =>
      this.handleSnoozeConfirm(ctx),
    );
    bot.action(/^snzx:(.+)$/, async (ctx) => this.handleSnoozeCancel(ctx));

    bot.on('text', async (ctx) => {
      if (ctx.message.text.startsWith('/')) return;
      await this.createTask(ctx, ctx.message.text.trim());
    });
  }

  private async handleStart(ctx: Context): Promise<void> {
    const text = (ctx.message as { text?: string })?.text ?? '';
    const token = text.split(' ')[1]?.trim();
    const chatId = String(ctx.chat!.id);

    if (token) {
      const user = await this.userService.findByTelegramLinkToken(token);
      if (!user) {
        await ctx.reply(
          '⚠️ This link is invalid or expired. Generate a new one from your Profile.',
        );
        return;
      }
      await this.userService.linkTelegram(user._id.toString(), chatId);
      await ctx.reply(
        `✅ Linked! Hi ${user.username}. You'll get reminders here.\nSend me a message to add a task, or /list to see them.`,
      );
      return;
    }

    const existing = await this.userService.findByTelegramChatId(chatId);
    if (existing) {
      await ctx.reply(
        `👋 Welcome back, ${existing.username}! Send a message to add a task, or /list.`,
      );
    } else {
      await ctx.reply(
        '👋 Open the app → *Profile* → *Connect Telegram* to link your account.',
        {
          parse_mode: 'Markdown',
        },
      );
    }
  }

  private async handleList(ctx: Context): Promise<void> {
    const user = await this.requireUser(ctx);
    if (!user) return;
    const todos = await this.todosService.findForUser(user._id.toString(), {});
    const open = todos.filter((t) => t.status !== TodoStatus.DONE);
    if (open.length === 0) {
      await ctx.reply('🎉 No open tasks. Send a message to add one.');
      return;
    }

    const timezone = user.timezone || 'Asia/Tashkent'; // User timezone olindi
    for (const todo of open.slice(0, 20)) {
      await ctx.reply(this.todoLine(todo, timezone), {
        // uzatildi
        parse_mode: 'Markdown',
        ...this.todoButtons(todo),
      });
    }
  }

  private async createTask(ctx: Context, title: string): Promise<void> {
    const user = await this.requireUser(ctx);
    if (!user) return;
    if (!title) {
      await ctx.reply('Please include a title, e.g. `Buy milk`', {
        parse_mode: 'Markdown',
      });
      return;
    }
    const todo = await this.todosService.create({ title }, user._id.toString());
    await ctx.reply(`✅ Added: *${this.escape(todo.title)}*`, {
      parse_mode: 'Markdown',
      ...this.todoButtons(todo),
    });
  }

  private async handleToggle(ctx: Context): Promise<void> {
    const user = await this.requireUser(ctx);
    if (!user) return;
    const id = (ctx as unknown as { match: RegExpExecArray }).match[1];
    try {
      const todo = await this.todosService.toggle(id, this.actor(user));
      const done = todo.status === TodoStatus.DONE;
      await ctx.answerCbQuery(done ? '✅ Completed' : '↩️ Reopened');

      const timezone = user.timezone || 'Asia/Tashkent';
      await ctx.editMessageText(this.todoLine(todo, timezone), {
        // uzatildi
        parse_mode: 'Markdown',
        ...this.todoButtons(todo),
      });
    } catch {
      await ctx.answerCbQuery('Could not update task');
    }
  }

  private async handleDelete(ctx: Context): Promise<void> {
    const user = await this.requireUser(ctx);
    if (!user) return;
    const id = (ctx as unknown as { match: RegExpExecArray }).match[1];
    try {
      await this.todosService.remove(id, this.actor(user));
      await ctx.answerCbQuery('🗑 Deleted');
      await ctx.editMessageText('🗑 Task deleted');
    } catch {
      await ctx.answerCbQuery('Could not delete task');
    }
  }

  private async requireUser(ctx: Context): Promise<UserDocument | null> {
    const chatId = ctx.chat ? String(ctx.chat.id) : null;
    const user = chatId
      ? await this.userService.findByTelegramChatId(chatId)
      : null;
    if (!user) {
      await ctx.reply(
        '🔗 Link your account first: app → Profile → Connect Telegram.',
      );
    }
    return user;
  }

  private actor(user: UserDocument): AuthUser {
    return {
      userId: user._id.toString(),
      email: user.email,
      username: user.username,
      role: user.role,
    };
  }

  // TelegramService ichida

  // ---- O'ZGARISH: todoLine ichida ham local vaqt ko'rsatiladi ----
  private todoLine(
    todo: TodoDocument,
    timezone: string = 'Asia/Tashkent',
  ): string {
    const mark = todo.status === TodoStatus.DONE ? '✅' : '⬜️';

    // Xavfsiz zona tekshiruvi
    const activeZone =
      timezone && timezone.trim() ? timezone.trim() : 'Asia/Tashkent';

    const due = todo.dueAt
      ? ` · 🗓 ${moment.tz(todo.dueAt, activeZone).format('DD MMM, HH:mm')}`
      : '';

    // Diagnostika uchun oxiriga zona nomi qo'shildi
    return `${mark} *${this.escape(todo.title)}*${due} `;
  }

  // ----- Snooze stepper config & keyboards -----
  private static readonly SNOOZE_DEFAULT = 25;
  private static readonly SNOOZE_STEP = 5;
  private static readonly SNOOZE_MIN = 5;
  private static readonly SNOOZE_MAX = 180;

  private clampSnooze(mins: number): number {
    if (Number.isNaN(mins)) return TelegramService.SNOOZE_DEFAULT;
    return Math.min(
      TelegramService.SNOOZE_MAX,
      Math.max(TelegramService.SNOOZE_MIN, mins),
    );
  }

  // Default row: Done · Snooze · Delete
  private mainKeyboardRows(id: string, done: boolean) {
    return [
      [
        Markup.button.callback(done ? '↩️ Reopen' : '✅ Done', `done:${id}`),
        Markup.button.callback('😴 Snooze', `snooze:${id}`),
        Markup.button.callback('🗑 Delete', `del:${id}`),
      ],
    ];
  }

  // Stepper row: −5 · [confirm N min] · +5  with a Cancel below.
  private snoozeMarkup(id: string, mins: number) {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback('➖ 5', `snz-:${id}:${mins}`),
        Markup.button.callback(`😴 ${mins} min`, `snzok:${id}:${mins}`),
        Markup.button.callback('5 ➕', `snz+:${id}:${mins}`),
      ],
      [Markup.button.callback('✖️ Cancel', `snzx:${id}`)],
    ]).reply_markup;
  }

  private todoButtons(todo: any) {
    const id =
      (todo._id ? todo._id.toString() : todo.id?.toString()) || 'unknown';
    const done = todo.status === TodoStatus.DONE;
    return Markup.inlineKeyboard(this.mainKeyboardRows(id, done));
  }

  // Open the stepper at the default value.
  private async handleSnoozeOpen(ctx: Context): Promise<void> {
    const id = (ctx as unknown as { match: RegExpExecArray }).match[1];
    await ctx.answerCbQuery();
    await ctx.editMessageReplyMarkup(
      this.snoozeMarkup(id, TelegramService.SNOOZE_DEFAULT),
    );
  }

  // ± a step, re-rendering the stepper (clamped to the allowed range).
  private async handleSnoozeAdjust(ctx: Context): Promise<void> {
    const match = (ctx as unknown as { match: RegExpExecArray }).match;
    const sign = match[1];
    const id = match[2];
    const current = parseInt(match[3], 10);
    const next = this.clampSnooze(
      current + (sign === '+' ? 1 : -1) * TelegramService.SNOOZE_STEP,
    );

    if (next === current) {
      await ctx.answerCbQuery(
        sign === '+'
          ? `Max ${TelegramService.SNOOZE_MAX} min`
          : `Min ${TelegramService.SNOOZE_MIN} min`,
      );
      return;
    }

    await ctx.answerCbQuery();
    await ctx.editMessageReplyMarkup(this.snoozeMarkup(id, next));
  }

  // Confirm: persist the snooze and restore the default buttons.
  private async handleSnoozeConfirm(ctx: Context): Promise<void> {
    const user = await this.requireUser(ctx);
    if (!user) return;

    const match = (ctx as unknown as { match: RegExpExecArray }).match;
    const id = match[1];
    const mins = this.clampSnooze(parseInt(match[2], 10));

    try {
      const { remindAt } = await this.todosService.snooze(
        id,
        mins,
        this.actor(user),
      );
      const zone = user.timezone || 'Asia/Tashkent';
      const at = moment.tz(remindAt, zone).format('HH:mm');
      await ctx.answerCbQuery(`😴 Snoozed ${mins} min · back at ${at}`);
      await ctx.editMessageReplyMarkup(
        Markup.inlineKeyboard(this.mainKeyboardRows(id, false)).reply_markup,
      );
    } catch {
      await ctx.answerCbQuery('Could not snooze this task');
    }
  }

  // Cancel: drop the stepper, restore the default buttons.
  private async handleSnoozeCancel(ctx: Context): Promise<void> {
    const id = (ctx as unknown as { match: RegExpExecArray }).match[1];
    await ctx.answerCbQuery();
    await ctx.editMessageReplyMarkup(
      Markup.inlineKeyboard(this.mainKeyboardRows(id, false)).reply_markup,
    );
  }

  private escape(s: string): string {
    // <-- JAYRONI JOYIGA QAYTDI
    if (!s) return '';
    return s.replace(/([_*`\[])/g, '\\$1');
  }
} // Class shu yerda yopiladi
