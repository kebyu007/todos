# To-Do App — NestJS + HBS + Mongoose + Telegram Notifications

> Architecture, folder structure, data model, and best-practice spec for a server-rendered To-Do application with timed Telegram reminders.

---

## 1. Overview

A server-rendered task manager where users create to-dos with due dates and reminder offsets. A background engine pushes **"upcoming"** and **"due now"** notifications to each user through a linked **Telegram bot**. No SPA — the frontend is server-rendered HBS enhanced with **HTMX** (partial updates) and **Alpine.js** (micro-interactivity), which keeps it contemporary without React-level complexity.

**Core principles**
- Feature-modular NestJS (each domain is a self-contained module).
- All times stored in **UTC**; each user carries a `timezone` for correct local reminders.
- **Backend owns canonical ordering** (indexed DB sort); frontend only re-orders loaded data for UX.
- Notifications are **scheduled, idempotent, and queue-backed** so a restart never drops or double-sends a reminder.

---

## 2. Tech Stack & Rationale

| Layer | Choice | Why |
|---|---|---|
| Runtime / framework | **NestJS** | DI, modular structure, guards/interceptors, first-class scheduling & queue support. |
| Views | **HBS (`hbs`)** | Server-rendered, SEO-friendly, simple. |
| Interactivity | **HTMX + Alpine.js** | Partial swaps + light reactivity without an SPA build pipeline. |
| Styling | **Tailwind CSS** (build step) or modern vanilla CSS | Fast, consistent, dark-mode ready. |
| DB / ODM | **MongoDB + Mongoose** (`@nestjs/mongoose`) | Flexible documents, great for embedded reminders + indexes on `dueAt`. |
| Auth | **Passport + JWT (httpOnly cookie)** or session | Stateless, works cleanly with HBS pages and the bot link flow. |
| Scheduling | **`@nestjs/schedule`** (cron) | Sweeps for due reminders as a safety net. |
| Queue | **BullMQ + Redis** | Delayed jobs fire reminders at the exact minute; survives restarts. |
| Telegram | **`nestjs-telegraf`** (Telegraf) | Idiomatic Nest wrapper for bot updates & sending messages. |
| Validation | **class-validator / class-transformer** | DTO-level request validation. |
| Config | **`@nestjs/config`** + Joi schema | Validated env at boot. |

> Pin exact versions against the latest stable releases when you scaffold — the architecture below is version-agnostic.

---

## 3. Folder Structure

```text
todos-app/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   │
│   ├── config/
│   │   ├── configuration.ts          # typed config loader
│   │   └── env.validation.ts         # Joi schema, fails fast at boot
│   │
│   ├── common/
│   │   ├── decorators/               # @CurrentUser(), @Public()
│   │   ├── filters/                  # HttpExceptionFilter (renders error.hbs)
│   │   ├── guards/                   # JwtAuthGuard, etc.
│   │   ├── interceptors/             # logging, response shaping
│   │   ├── pipes/                    # global ValidationPipe config
│   │   └── utils/                    # time helpers (UTC <-> tz)
│   │
│   ├── database/
│   │   └── database.module.ts        # MongooseModule.forRootAsync
│   │
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts    # GET/POST /login, /register, /logout
│   │   │   ├── auth.service.ts       # hash, validate, issue JWT
│   │   │   ├── strategies/
│   │   │   │   ├── jwt.strategy.ts
│   │   │   │   └── local.strategy.ts
│   │   │   ├── guards/
│   │   │   │   └── jwt-auth.guard.ts
│   │   │   └── dto/
│   │   │       ├── register.dto.ts
│   │   │       └── login.dto.ts
│   │   │
│   │   ├── users/
│   │   │   ├── users.module.ts
│   │   │   ├── users.service.ts
│   │   │   ├── schemas/user.schema.ts
│   │   │   └── dto/update-profile.dto.ts
│   │   │
│   │   ├── todos/
│   │   │   ├── todos.module.ts
│   │   │   ├── todos.controller.ts   # HBS pages + HTMX partial responses
│   │   │   ├── todos.service.ts      # CRUD + canonical sorting/filtering
│   │   │   ├── schemas/todo.schema.ts
│   │   │   └── dto/
│   │   │       ├── create-todo.dto.ts
│   │   │     # Todos — NestJS + HBS + Mongoose

A server-rendered task manager. NestJS handles auth, CRUD, and an admin
dashboard; views are rendered with **Handlebars (HBS)** and enhanced with
**HTMX** (partial swaps) and **Alpine.js** (dark-mode toggle). Auth uses a
short-lived **access JWT** + rotating **refresh JWT**, both in httpOnly cookies.

## Features

- **Auth** — register / login / logout / refresh with argon2-hashed passwords.
  Access token (15m, cookie `access_token`, path `/`) + refresh token (7d,
  cookie `refresh_token`, path `/auth`, with server-side hash + rotation and
  reuse detection).
- **Todos CRUD** — owner-scoped, server-rendered dashboard with filter tabs
  (all / today / upcoming / done), live search, and HTMX inline create / edit /
  toggle / delete (returns `todo-item` partials, no full reload).
- **Roles & guards** — global `JwtAuthGuard` (with `@Public()` escape hatch),
  `RolesGuard` + `@Roles()`, and `@CurrentUser()` param decorator.
- **Admin dashboard** (`/admin`, admin-only) — stats overview, manage **all
  users** (change role, delete) and **all todos** across every user
  (toggle / delete).

## Setup
  ├── update-todo.dto.ts
│   │   │       └── query-todos.dto.ts   # sort, filter, status, page
│   │   │
│   │   ├── notifications/
│   │   │   ├── notifications.module.ts
│   │   │   ├── notifications.service.ts    # schedule/cancel reminder jobs
│   │   │   ├── notifications.scheduler.ts   # @Cron sweep (safety net)
│   │   │   ├── notifications.processor.ts   # BullMQ worker -> sends via Telegram
│   │   │   └── schemas/reminder-log.schema.ts
│   │   │
│   │   └── telegram/
│   │       ├── telegram.module.ts
│   │       ├── telegram.service.ts    # sendMessage(chatId, text)
│   │       ├── telegram.update.ts     # /start, link flow, inline buttons
│   │       └── telegram.keyboard.ts   # "Done", "Snooze 1h" inline keyboards
│   │
│   └── views.module.ts                # (optional) shared view helpers
│
├── views/
│   ├── layouts/
│   │   └── main.hbs                   # <html> shell, loads htmx + alpine + css
│   ├── partials/
│   │   ├── navbar.hbs
│   │   ├── todo-item.hbs             # single row — reused by HTMX swaps
│   │   ├── todo-list.hbs            # list container
│   │   └── flash.hbs
│   └── pages/
│       ├── dashboard.hbs
│       ├── login.hbs
│       ├── register.hbs
│       ├── profile.hbs              # shows Telegram link button + timezone
│       └── error.hbs
│
├── public/
│   ├── css/app.css
│   ├── js/app.js                    # tiny: htmx config, toasts
│   └── img/
│
├── test/
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

---

## 4. Database Schema (Mongoose)

### 4.1 User

```ts
// users/schemas/user.schema.ts

export enum UserRoles {
  user = 'user',
  viewer = 'viwer',
  admin = 'admin',
}

@Schema({ collection: 'users', versionKey: false, timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, trim: true })
  username: string;

  @Prop({ required: true, select: false }) // never returned by default
  passwordHash: string;

  // IANA timezone, e.g. "Asia/Tashkent" — critical for correct reminders
  @Prop({ default: 'UTC' })
  timezone: string;

  // Telegram linkage
  @Prop({ index: true, default: null })
  telegramChatId: string | null;

  @Prop({ default: null, select: false }) // one-time token used by /start
  telegramLinkToken: string | null;

  @Prop({ default: true })
  notificationsEnabled: boolean;

  @Prop({ type: SchemaTypes.Array, enum: UserRoles, default: UserRoles.user })
  role: UserRoles;
}

```

### 4.2 Todo (with embedded reminders)

```ts
// todos/schemas/todo.schema.ts
export enum Priority { LOW = 'low', MEDIUM = 'medium', HIGH = 'high' }
export enum TodoStatus { PENDING = 'pending', IN_PROGRESS = 'in_progress', DONE = 'done' }

@Schema({ _id: false })
class Reminder {
  // minutes before dueAt: e.g. 1440 (1 day), 60 (1h), 0 (at due time)
  @Prop({ required: true }) offsetMinutes: number;
  @Prop({ default: false })  sent: boolean;
  @Prop({ default: null })   sentAt: Date | null;
  // BullMQ job id so we can cancel/reschedule if dueAt changes
  @Prop({ default: null })   jobId: string | null;
}

@Schema({ timestamps: true })
export class Todo {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, trim: true }) title: string;
  @Prop({ default: '' })                description: string;

  // stored in UTC
  @Prop({ default: null, index: true })  dueAt: Date | null;

  @Prop({ type: String, enum: Priority, default: Priority.MEDIUM })
  priority: Priority;

  @Prop({ type: String, enum: TodoStatus, default: TodoStatus.PENDING, index: true })
  status: TodoStatus;

  @Prop({ type: [String], default: [] }) tags: string[];

  @Prop({ type: [Reminder], default: [] }) reminders: Reminder[];

  @Prop({ default: null }) completedAt: Date | null;
}
```

**Recommended indexes**
```ts
TodoSchema.index({ userId: 1, status: 1, dueAt: 1 });  // dashboard list & sort
TodoSchema.index({ dueAt: 1, 'reminders.sent': 1 });   // scheduler sweep
```

### 4.3 ReminderLog (audit / idempotency safety net)

```ts
@Schema({ timestamps: true })
export class ReminderLog {
  @Prop({ type: Types.ObjectId, ref: 'Todo', index: true }) todoId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User' })             userId: Types.ObjectId;
  @Prop() offsetMinutes: number;
  @Prop() deliveredAt: Date;
  @Prop({ default: 'telegram' }) channel: string;
}
// unique guard so a reminder can never be sent twice:
ReminderLogSchema.index({ todoId: 1, offsetMinutes: 1 }, { unique: true });
```

> **Why store reminders embedded in the Todo** instead of a separate collection: they share the todo's lifecycle (edit dueAt → reschedule; delete todo → cancel). The `ReminderLog` exists only as the idempotency/audit ledger.

---

## 5. Backend Architecture

### 5.1 Auth flow
1. `POST /register` → hash password with **argon2** (or bcrypt) → create user.
2. `POST /login` → `LocalStrategy` validates → issue **JWT in an httpOnly, SameSite=Lax cookie**.
3. `JwtAuthGuard` (global, with a `@Public()` escape hatch) protects all pages.
4. `@CurrentUser()` decorator injects the user into controllers.

### 5.2 The notification engine (the real-use core)

Use a **hybrid: precise queue + cron safety net.**

**On create/update of a todo with `dueAt`:**
- For each reminder, compute `fireAt = dueAt − offsetMinutes`.
- If `fireAt` is in the future, enqueue a **BullMQ delayed job** (`delay = fireAt − now`); store the returned `jobId` on the reminder.
- If `dueAt` changes, **remove old jobs by `jobId` and re-enqueue**.

**Worker (`notifications.processor.ts`):**
- Pull the todo, re-check it's still `pending/in_progress` and the reminder isn't `sent`.
- Atomically insert into `ReminderLog` (unique index = idempotency). If it throws duplicate → skip.
- Call `telegram.service.sendMessage(user.telegramChatId, message)` with inline buttons.
- Mark `reminder.sent = true`.

**Cron safety net (`@Cron(EVERY_MINUTE)`):**
- Query todos where `dueAt` window has a reminder whose `fireAt <= now` and `sent === false` (covers jobs lost during downtime/Redis flush), then dispatch the same way.

> This combination gives you **minute-accurate delivery** (queue) **plus durability** (cron reconciliation). Polling alone drifts; queue alone is fragile to Redis loss — together they're production-grade.

### 5.3 Timezone correctness
- Always persist `dueAt` in **UTC**.
- The UI accepts a local datetime; convert to UTC using the user's `timezone` before saving.
- Reminder math is pure UTC, so it's timezone-agnostic. Only the *display* and the Telegram message format use the user's tz (via `Intl.DateTimeFormat` / `date-fns-tz`).

---

## 6. Telegram Integration

**Linking flow (account ↔ chat):**
1. User clicks "Connect Telegram" on `/profile`.
2. Backend generates a `telegramLinkToken`, shows a deep link: `https://t.me/<bot>?start=<token>`.
3. User taps it → bot receives `/start <token>` → `telegram.update.ts` finds the user by token, stores `telegramChatId`, clears the token.
4. Future notifications use `telegramChatId`.

**Bot capabilities**
- `/start <token>` — link account.
- `/today`, `/upcoming` — on-demand list (queries the **backend-sorted** todo list).
- Inline buttons on each reminder: **✅ Done**, **⏰ Snooze 1h**, **👀 Open** — these call back into `TodosService` (mark done / reschedule reminder).

```ts
// telegram.service.ts (essence)
async sendReminder(chatId: string, todo: Todo) {
  await this.bot.telegram.sendMessage(chatId, this.format(todo), {
    parse_mode: 'HTML',
    reply_markup: doneSnoozeKeyboard(todo._id),
  });
}
```

---

## 7. Frontend (Contemporary, No SPA)

**Pattern: HBS shell + HTMX swaps + Alpine sprinkles.**

- The dashboard renders the full list server-side.
- Creating / toggling / deleting a todo posts via **HTMX** and the server returns **just the `todo-item.hbs` partial**, swapped into the DOM — instant feel, zero page reload, no client-state bugs.
- **Alpine.js** handles purely-local UI (open the "new todo" drawer, priority color picker, optimistic checkbox).
- **UX/UI essentials:**
  - Sticky top bar, segmented filters (All / Today / Upcoming / Done).
  - Priority encoded by color + label (accessible, not color-only).
  - Empty states, skeleton on HTMX requests (`htmx-indicator`).
  - Dark mode via `prefers-color-scheme` + toggle.
  - Relative due labels ("in 2h", "tomorrow 9:00") computed server-side in user tz.
  - Keyboard: `n` = new todo, `/` = search, `Enter` = save.
  - Toasts for success/error, driven by HTMX response headers.

```hbs
{{!-- partials/todo-item.hbs --}}
<li class="todo" data-priority="{{priority}}" hx-target="this" hx-swap="outerHTML">
  <input type="checkbox" hx-post="/todos/{{id}}/toggle" {{#if isDone}}checked{{/if}}>
  <div class="todo__body">
    <span class="todo__title">{{title}}</span>
    {{#if dueLabel}}<time class="todo__due">{{dueLabel}}</time>{{/if}}
  </div>
  <button hx-delete="/todos/{{id}}" hx-confirm="Delete this task?">✕</button>
</li>
```

---

## 8. Backend vs Frontend Sorting — the decision

**Sort canonically in the backend; let the frontend only re-order already-loaded data.**

| Concern | Where | Why |
|---|---|---|
| Default list order (by `dueAt`/priority) | **Backend** | Indexed Mongo sort; works with pagination; one source of truth. |
| "Upcoming / due soon" for the bot & engine | **Backend** | Notifications can't depend on a browser being open. |
| Filtering by status/tag/date range | **Backend** | Keeps payloads small, scales, hits indexes. |
| Instant re-sort of the visible page (toggle priority view) | **Frontend** | Avoids a round-trip on data already in the DOM; cosmetic only. |

Rule of thumb: **if anything other than the current browser tab needs the order (the bot, the scheduler, pagination), it must be backend.** Frontend sorting is a UX nicety layered on top, never the source of truth. Add the compound index `{ userId: 1, status: 1, dueAt: 1 }` and the backend sort is effectively free.

---

## 9. Environment Variables (`.env.example`)

```env
NODE_ENV=development
PORT=3000
APP_URL=http://localhost:3000

MONGODB_URI=mongodb://localhost:27017/todos
REDIS_URL=redis://localhost:6379

JWT_SECRET=change_me
JWT_EXPIRES_IN=7d

TELEGRAM_BOT_TOKEN=123456:ABC...
TELEGRAM_BOT_USERNAME=my_todos_bot
```

---

## 10. Route Map

| Method | Path | Renders / Action |
|---|---|---|
| GET | `/login`, `/register` | Auth pages |
| POST | `/auth/login`, `/auth/register`, `/auth/logout` | Auth actions |
| GET | `/` (dashboard) | Server-sorted todo list |
| GET | `/todos?status=&sort=&page=` | List (HTMX partial or full page) |
| POST | `/todos` | Create → returns `todo-item` partial |
| PATCH | `/todos/:id` | Update |
| POST | `/todos/:id/toggle` | Toggle done → partial |
| DELETE | `/todos/:id` | Delete → empty swap |
| GET | `/profile` | Timezone + Telegram link |
| POST | `/profile/telegram/link` | Generate link token |

---

## 11. Implementation Roadmap

1. **Scaffold** Nest app, config + env validation, Mongoose connection, HBS + layouts/partials, static assets.
2. **Auth** (register/login/logout, JWT cookie, guard, `@CurrentUser`).
3. **Todos CRUD** server-rendered, then layer HTMX partials.
4. **Timezone** capture on profile; UTC conversion utilities.
5. **Telegram bot** + account linking flow.
6. **Notification engine**: BullMQ delayed jobs → worker → send; then add the cron safety net + `ReminderLog` idempotency.
7. **Polish UX**: filters, dark mode, toasts, empty/loading states, keyboard shortcuts.
8. **Harden**: rate-limit auth, helmet, CSRF on forms, e2e tests for the reminder path.

---

## 12. Best-Practice Prompt (reusable spec to generate the project)

> Use this as a single prompt to an AI coding assistant to scaffold the app consistently.

```text
You are a senior full-stack engineer. Build a production-grade To-Do web app.

STACK: NestJS (TypeScript) + HBS server-side rendering, enhanced with HTMX and
Alpine.js (no SPA). MongoDB via @nestjs/mongoose. Auth with Passport + JWT stored
in an httpOnly cookie. Scheduling with @nestjs/schedule, queue with BullMQ + Redis.
Telegram bot via nestjs-telegraf. Validation with class-validator. Config validated
with Joi at boot.

ARCHITECTURE: Feature-modular (auth, users, todos, notifications, telegram).
Use DTOs, guards, a global ValidationPipe, an exception filter that renders error.hbs,
and a @CurrentUser() decorator.

DATA MODEL:
- User { email(unique), username, passwordHash(select:false), timezone(IANA),
  telegramChatId, telegramLinkToken, notificationsEnabled }
- Todo { userId(ref), title, description, dueAt(UTC), priority(low|medium|high),
  status(pending|in_progress|done), tags[], reminders[{offsetMinutes, sent, sentAt,
  jobId}], completedAt }
- ReminderLog { todoId, userId, offsetMinutes, deliveredAt, channel } with a UNIQUE
  index on (todoId, offsetMinutes) for idempotency.
Indexes: {userId,status,dueAt} and {dueAt,'reminders.sent'}.

RULES:
- Store all times in UTC; convert to/from user timezone only at the edges (input + display).
- Canonical sorting/filtering/pagination happen in the BACKEND against indexes; the
  frontend may only re-order already-loaded rows for instant UX.
- Notifications: on todo create/update, compute fireAt = dueAt - offset and enqueue
  BullMQ DELAYED jobs (store jobId; reschedule on edit). A @Cron(EVERY_MINUTE) sweep
  reconciles any missed reminders. The worker inserts into ReminderLog (unique index)
  before sending, guaranteeing exactly-once delivery, then sends via Telegram with
  inline buttons: Done, Snooze 1h, Open.
- Telegram linking: profile generates a token -> deep link t.me/<bot>?start=<token>
  -> bot /start handler stores telegramChatId.

FRONTEND/UX: Clean contemporary UI, dark mode, segmented filters (All/Today/Upcoming/
Done), priority color+label, relative due labels in user tz, HTMX partial swaps that
return todo-item.hbs, loading indicators, toasts, keyboard shortcuts (n, /, Enter),
accessible and responsive.

DELIVER: full folder structure, all schemas, modules, controllers, the notification
processor + scheduler, the telegram update handlers, HBS layouts/partials, and a
README with setup steps and .env.example.
```

---

*End of spec.*
