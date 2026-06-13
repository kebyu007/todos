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

// Telegram bot: account linking + full todo control + reminder delivery.
// Stays completely inert (no bot launched) until TELEGRAM_BOT_TOKEN is set.
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

    // launch() resolves only when the bot stops, so fire-and-forget.
    this.bot
      .launch()
      .catch((err) => this.logger.error('Telegram bot launch failed', err));
    this.logger.log('Telegram bot starting…');
  }

  onModuleDestroy(): void {
    this.bot?.stop('SIGTERM');
  }

  // ---- Outbound: reminder delivery (called by the scheduler) ----
  async sendReminder(
    chatId: string,
    todo: TodoDocument,
    offsetMinutes: number,
  ): Promise<void> {
    if (!this.bot) return;
    const when = todo.dueAt
      ? new Date(todo.dueAt).toLocaleString('en-GB', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';
    const head =
      offsetMinutes >= 60
        ? `⏰ Due in 1 hour`
        : offsetMinutes > 0
          ? `⏰ Due in ${offsetMinutes} min`
          : `🔔 Due now`;
    const text = `${head}\n*${this.escape(todo.title)}*\n🗓 ${when}`;
    await this.bot.telegram.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      ...this.todoButtons(todo),
    });
  }

  // ---- Bot handlers ----
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

    // Inline buttons on task messages.
    bot.action(/^done:(.+)$/, async (ctx) => this.handleToggle(ctx));
    bot.action(/^del:(.+)$/, async (ctx) => this.handleDelete(ctx));

    // Any other plain text becomes a new task — frictionless capture.
    bot.on('text', async (ctx) => {
      if (ctx.message.text.startsWith('/')) return; // ignore unknown commands
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
        await ctx.reply('⚠️ This link is invalid or expired. Generate a new one from your Profile.');
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
      await ctx.reply(`👋 Welcome back, ${existing.username}! Send a message to add a task, or /list.`);
    } else {
      await ctx.reply('👋 Open the app → *Profile* → *Connect Telegram* to link your account.', {
        parse_mode: 'Markdown',
      });
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
    for (const todo of open.slice(0, 20)) {
      await ctx.reply(this.todoLine(todo), {
        parse_mode: 'Markdown',
        ...this.todoButtons(todo),
      });
    }
  }

  private async createTask(ctx: Context, title: string): Promise<void> {
    const user = await this.requireUser(ctx);
    if (!user) return;
    if (!title) {
      await ctx.reply('Please include a title, e.g. `Buy milk`', { parse_mode: 'Markdown' });
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
      await ctx.editMessageText(this.todoLine(todo), {
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

  // ---- helpers ----
  private async requireUser(ctx: Context): Promise<UserDocument | null> {
    const chatId = ctx.chat ? String(ctx.chat.id) : null;
    const user = chatId
      ? await this.userService.findByTelegramChatId(chatId)
      : null;
    if (!user) {
      await ctx.reply('🔗 Link your account first: app → Profile → Connect Telegram.');
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

  private todoButtons(todo: TodoDocument) {
    const id = todo._id.toString();
    const done = todo.status === TodoStatus.DONE;
    return Markup.inlineKeyboard([
      [
        Markup.button.callback(done ? '↩️ Reopen' : '✅ Done', `done:${id}`),
        Markup.button.callback('🗑 Delete', `del:${id}`),
      ],
    ]);
  }

  private todoLine(todo: TodoDocument): string {
    const mark = todo.status === TodoStatus.DONE ? '✅' : '⬜️';
    const due = todo.dueAt
      ? ` · 🗓 ${new Date(todo.dueAt).toLocaleString('en-GB', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })}`
      : '';
    return `${mark} *${this.escape(todo.title)}*${due}`;
  }

  // Escape Telegram Markdown (v1) special chars in user content.
  private escape(s: string): string {
    return s.replace(/([_*`\[])/g, '\\$1');
  }
}
