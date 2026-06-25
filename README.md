# Todos — NestJS + HBS + Mongoose

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

```bash
pnpm install
cp .env.example .env   # then edit secrets
pnpm run start:dev     # http://localhost:5000
```

Requires a running MongoDB (default `mongodb://localhost:27017/todos`).

### Environment (`.env`)

| Var | Purpose |
|---|---|
| `PORT` | HTTP port (default 5000) |
| `MONGO_URL` | MongoDB connection string |
| `JWT_SECRET` | Access-token secret |
| `JWT_REFRESH_SECRET` | Refresh-token secret (separate from access) |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | Token lifetimes (e.g. `15m`, `7d`) |
| `COOKIE_SECURE` | `true` in production (HTTPS-only cookies) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth (optional) |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_BOT_USERNAME` | Telegram bot (optional) |

## Telegram bot & reminders

Optional — the bot stays off until `TELEGRAM_BOT_TOKEN` is set.

1. In Telegram, message **@BotFather** → `/newbot`, copy the token into
   `TELEGRAM_BOT_TOKEN` and the bot's username into `TELEGRAM_BOT_USERNAME`.
2. Restart the app; the bot launches automatically.
3. In the app: **Profile → Connect Telegram → Open Telegram** to link your chat.

Once linked you can **create** tasks (send any message), **list** them
(`/list`), and **complete/delete** them via inline buttons — all from chat.
A per-minute scheduler ([`NotificationsService`](src/modules/notifications/notifications.service.ts))
delivers a reminder **1 hour before** and **at** each task's due time. Reminders
(`[60, 0]` minute offsets) are auto-created whenever a task gets a due date.

## Creating an admin

Roles default to `user`. Promote a registered account in the DB, then
**log out and back in** so the new role is baked into a fresh JWT:

```js
db.users.updateOne({ email: 'you@example.com' }, { $set: { role: 'admin' } })
```

## Route map

| Method | Path | Auth | Action |
|---|---|---|---|
| GET | `/login`, `/register` | public | Auth pages |
| POST | `/auth/register` · `/auth/login` | public | Set AT+RT cookies → `/` |
| GET | `/auth/google` · `/auth/google/callback` | public | Google OAuth login |
| POST | `/auth/refresh` | refresh cookie | Rotate tokens |
| POST | `/auth/logout` | access | Revoke RT, clear cookies |
| POST | `/profile/telegram/connect` · `/disconnect` | access | Link / unlink Telegram |
| GET | `/` | access | Dashboard (owner todos) |
| GET | `/todos` | access | HTMX list (filter/search) |
| POST | `/todos` | access | Create → `todo-item` partial |
| GET | `/todos/:id` · `/todos/:id/edit` | access (owner/admin) | Item / edit form |
| PATCH | `/todos/:id` | access (owner/admin) | Update |
| POST | `/todos/:id/toggle` | access (owner/admin) | Toggle done |
| DELETE | `/todos/:id` | access (owner/admin) | Delete |
| GET | `/profile` · POST `/profile` | access | View / edit profile |
| GET | `/admin` | admin | Overview + stats |
| GET | `/admin/users` | admin | Manage users |
| POST | `/admin/users/:id` · `/admin/users/:id/delete` | admin | Update / delete user |
| GET | `/admin/todos` | admin | All todos |
| POST | `/admin/todos/:id/toggle` · `/admin/todos/:id/delete` | admin | Operate on any todo |

## Project layout

```
src/
  common/        decorators (@Public, @CurrentUser, @Roles), guards, filter
  config/        env validation (Joi-style) + typed configuration
  modules/
    auth/        strategies, token.service, auth.service/controller
    user/        schema, service (CRUD + refresh-token store), profile
    todos/       owner-scoped CRUD + HTMX controller
    admin/       admin-only controller (reuses user + todos services)
views/           layouts/, partials/, pages/ (+ pages/admin/)
public/css/      app.css (light/dark themed)
```

## Run with Docker

Spin up the server **and** MongoDB together — no local Node/Mongo install needed.

```bash
cp .env.example .env      # first time only; edit secrets as needed
docker compose up --build
```

The app comes up on **http://localhost:5000** (set by `PORT` in
`docker-compose.yml`) and connects to the bundled `mongo` service automatically
(compose overrides `MONGO_URL`). Mongo data persists in the `mongo-data` volume.

Common commands:

```bash
docker compose up -d --build   # run in the background
docker compose logs -f app     # follow server logs
docker compose down            # stop (keeps the DB volume)
docker compose down -v         # stop and wipe the DB
```

Notes:
- For the **mobile app**, point `mobile/app.json` → `expo.extra.apiUrl` at your
  machine's LAN IP on the same port, e.g. `http://192.168.1.100:5000`.
- To change the port, edit both `PORT` and the `ports:` mapping in
  `docker-compose.yml`.
- `docker compose up app` rebuilds just the app after code changes.
