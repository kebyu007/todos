# Frontend & API Reference

A guide for designing/building the UI: every endpoint, what it returns, the data
each page receives, the data models, and what the backend can do.

> **Design system:** all components and tokens live in
> [public/css/app.css](public/css/app.css); see [docs/DESIGN.md](docs/DESIGN.md).

---

## 1. How the app responds

This is a **server-rendered** app (Handlebars), progressively enhanced with
**HTMX** (partial swaps) and **Alpine.js** (theme toggle, menus). Endpoints fall
into four response shapes:

| Shape | Meaning | Used by |
|---|---|---|
| **Page** | Full HTML doc (wrapped in `layouts/main`) | top-level navigations |
| **Partial** | HTML fragment, no layout | HTMX swaps (todo rows, lists) |
| **Redirect** | `302` + `Set-Cookie`/flash | form submits |
| **JSON** | `{ ... }` | `/auth/refresh`, and **all error responses to HTMX** |

**Auth:** a global guard protects everything except `@Public` routes. The access
token rides in an httpOnly `access_token` cookie (you never touch it in JS).
Roles: `user`, `viewer`, `admin`.

**Detecting HTMX server-side:** requests carry `HX-Request: true`; some endpoints
return a partial for HTMX and a redirect otherwise.

---

## 2. Endpoint reference

### Auth & public pages
| Method | Path | Auth | Returns | Notes |
|---|---|---|---|---|
| GET | `/login` | public | Page `login` | Email/password + "Continue with Google" |
| GET | `/register` | public | Page `register` | + Google sign-up |
| POST | `/auth/register` | public | Redirect `/` | body: `email, username, password, timezone?` |
| POST | `/auth/login` | public | Redirect `/` | body: `email, password` |
| GET | `/auth/google` | public | Redirect → Google | starts OAuth |
| GET | `/auth/google/callback` | public | Redirect `/` | links/creates account (never double-registers) |
| POST | `/auth/refresh` | refresh cookie | JSON `{ ok: true }` | rotates tokens |
| POST | `/auth/logout` | access | Redirect `/login` | clears cookies |

### Todos (owner-scoped)
| Method | Path | Auth | Returns | Notes |
|---|---|---|---|---|
| GET | `/` | access | Page `dashboard` | the main task list |
| GET | `/todos?filter=&search=` | access | Partial `todo-list` | HTMX filter/search refresh |
| POST | `/todos` | access | Partial `todo-item` (HTMX) / Redirect | body: `title, description?, dueAt?, priority?, tags?` |
| GET | `/todos/:id` | access | Partial `todo-item` | single row (used to cancel edit) |
| GET | `/todos/:id/edit` | access | Partial `todo-edit` | inline edit form |
| PATCH | `/todos/:id` | access | Partial `todo-item` | update (owner or admin) |
| POST | `/todos/:id/toggle` | access | Partial `todo-item` | flip done/pending |
| DELETE | `/todos/:id` | access | empty body | HTMX removes the row |

`filter` ∈ `all | today | upcoming | done`. Creating/deleting also emits an
`HX-Trigger: {"toast": {...}}` header for a success toast.

### Profile (self-service)
| Method | Path | Auth | Returns | Notes |
|---|---|---|---|---|
| GET | `/profile` | access | Page `profile` | account + Telegram link UI |
| POST | `/profile` | access | Redirect `/profile` | body: `username, email, timezone, notificationsEnabled` |
| POST | `/profile/telegram/connect` | access | Redirect `/profile` | generates the Telegram deep link |
| POST | `/profile/telegram/disconnect` | access | Redirect `/profile` | unlinks the chat |

### Admin (role `admin` only)
| Method | Path | Returns | Notes |
|---|---|---|---|
| GET | `/admin` | Page `admin/dashboard` | stats + recent users/todos |
| GET | `/admin/users` | Page `admin/users` | manage all users |
| POST | `/admin/users/:id` | Redirect | change `role` etc. |
| POST | `/admin/users/:id/delete` | Redirect | delete user (not self) |
| GET | `/admin/todos` | Page `admin/todos` | **all** users' todos |
| POST | `/admin/todos/:id/toggle` | Redirect | toggle any todo |
| POST | `/admin/todos/:id/delete` | Redirect | delete any todo |

> `/reminder-log` exists only as an unimplemented scaffold stub — ignore it.

---

## 3. View models (data each page receives)

Use these to build accurate mockups.

**`dashboard`** — `{ currentUser, todos[], filter, search, filters[] }`
where each **todo** = `{ id, title, description, priority, status, isDone, dueAt, tags[] }`.

**`profile`** — `{ currentUser, user, telegram }`
`telegram` = `{ enabled, connected, linkUrl }`.

**`admin/dashboard`** — `{ currentUser, isAdmin, stats{users,todos,done,admins}, recentUsers[], recentTodos[] }`.

**`admin/users`** — `{ users[], roles[] }`; user = `{ id, email, username, role, timezone, notificationsEnabled, isSelf }`.

**`admin/todos`** — `{ todos[] }`; todo = `{ id, title, status, priority, isDone, dueAt, ownerEmail, ownerName }`.

**`currentUser`** (on every authed page) = `{ userId, email, username, role, avatarUrl }`.

---

## 4. Data models

**User** — `email` (unique), `username`, `passwordHash` (null for Google-only),
`googleId` (null for local), `avatarUrl`, `timezone` (IANA), `telegramChatId`,
`notificationsEnabled`, `role` (`user|viewer|admin`), timestamps.

**Todo** — `userId`, `title`, `description`, `dueAt` (UTC, nullable), `priority`
(`low|medium|high`), `status` (`pending|in_progress|done`), `tags[]`,
`completedAt`, and embedded **reminders**: `[{ offsetMinutes, sent, sentAt }]`.
Reminders `[60, 0]` (1h before + at due) are auto-created when a `dueAt` is set.

---

## 5. UI components & tokens

All defined in [public/css/app.css](public/css/app.css):

- **Layout:** `.app-shell`, `.navbar`, `.container`, `.card`, `.page-head`
- **Buttons:** `.btn` + `--primary --ghost --danger --google --sm --block`
- **Forms:** `.field`, `.input`, `.divider`
- **Todos:** `.todo`, `.todo-list`, `.todo-create`, filter `.chip`, `.badge--*`, `.tag`
- **Admin:** `.stats`, `.stat`, `.table`
- **Feedback:** `.toast` (`--success --error --info`), user menu `.usermenu`, `.avatar`
- **Tokens:** brand/semantic/surface/text colors, `--radius*`, `--shadow*`,
  `--ring`; full **dark mode** via `[data-theme="dark"]` on `<html>`.

**Toasts** (`public/js/toast.js`): call `window.showToast(type, message)` from JS;
the backend triggers them via flash cookie (redirects), `HX-Trigger` (HTMX
success), or error JSON (HTMX errors).

---

## 6. Telegram bot (no HTTP — chat interface)

After linking from Profile, the user can manage tasks from chat:
- send any text → **create** a task
- `/list` → open tasks with **✅ Done / 🗑 Delete** inline buttons
- `/new <title>`, `/help`
- automatic **reminders** 1h before and at each task's due time.

---

## 7. What the backend does (capabilities)

- **Auth:** register/login (argon2), Google OAuth, short access JWT + rotating
  refresh JWT in httpOnly cookies, refresh rotation with reuse detection, logout
  revocation. Role-based access (`user/viewer/admin`).
- **Todos:** owner-scoped CRUD with filtering (today/upcoming/done), search, and
  canonical server-side sorting; admins can act on any user's todos.
- **Admin:** manage all users (roles, deletion) and all todos; dashboard stats.
- **Reminders:** auto-scheduled per-todo reminders, delivered via a per-minute
  cron through the Telegram bot (1h-before + at-due), with a freshness guard.
- **Profile:** timezone, notification toggle, Telegram link/unlink.
- **Cross-cutting:** validation (class-validator), unified error→toast funnel,
  one-shot flash messages, security headers (helmet), HBS rendering with HTMX
  partials.
