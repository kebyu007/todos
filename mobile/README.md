# Todos — Android app (Expo / React Native)

A native Android app for the Todos backend. It talks to the NestJS server over a
JSON API, signs in with a bearer token, and delivers reminders via **push
notifications** (from the server) and **local notifications** (scheduled on the
device as an offline fallback). The existing web (HBS) app is untouched.

```
Android app ──HTTP/JSON──►  NestJS  /api/*   (new)
        ▲                      │
        └──── Expo push ◄──── reminder sweep (every minute)
```

---

## 1. Backend — what was added

The server now exposes a JSON API alongside the web pages (no web changes):

| Method | Path                      | Auth   | Purpose                          |
|--------|---------------------------|--------|----------------------------------|
| POST   | `/api/auth/register`      | public | create account → tokens + user   |
| POST   | `/api/auth/login`         | public | login → tokens + user            |
| POST   | `/api/auth/refresh`       | public | `{ refreshToken }` → new tokens  |
| POST   | `/api/auth/logout`        | bearer | revoke refresh token             |
| GET    | `/api/auth/me`            | bearer | current user profile             |
| GET    | `/api/todos`              | bearer | list (supports `?filter=&search=`) |
| POST   | `/api/todos`              | bearer | create                           |
| GET    | `/api/todos/:id`          | bearer | one                              |
| PATCH  | `/api/todos/:id`          | bearer | update                           |
| POST   | `/api/todos/:id/toggle`   | bearer | toggle done                      |
| POST   | `/api/todos/:id/snooze`   | bearer | `{ minutes }` (5–180)            |
| DELETE | `/api/todos/:id`          | bearer | delete                           |
| POST   | `/api/devices`            | bearer | `{ token }` register push token  |
| DELETE | `/api/devices`            | bearer | `{ token }` unregister           |

`bearer` routes expect `Authorization: Bearer <accessToken>`. Times (`dueAt`,
`remindAt`) are **UTC ISO** strings on the wire; the app formats them in the
device's timezone.

Run the server so your phone can reach it over the LAN:

```bash
pnpm start:dev        # listens on 0.0.0.0:3000 by default
```

Find your machine's LAN IP (`ip addr` / `ifconfig` → e.g. `192.168.1.100`).
Phone and computer must be on the same Wi-Fi.

> Native apps don't enforce CORS, so no CORS config is needed.

---

## 2. App setup

```bash
cd mobile
npm install
# align native module versions with the installed Expo SDK:
npx expo install expo-notifications expo-secure-store expo-device expo-constants
```

Point the app at your server — edit `app.json` → `expo.extra.apiUrl`:

```json
"apiUrl": "http://192.168.1.100:3000"
```

Run it:

```bash
npx expo start          # press "a" for Android, or scan the QR in Expo Go
```

Login/register, add a task with a due chip (In 1h / Tonight / Tomorrow), and
you'll get reminders. Tap a task to complete it, 😴 to snooze, 🗑 to delete.

---

## 3. Notifications

**Local reminders** (offline, on-device) work out of the box in Expo Go — the
app schedules them from each todo's `reminders` whenever the list syncs, and
re-schedules on snooze. Toggle them with `ENABLE_LOCAL_REMINDERS` in
`src/config.ts`.

**Push reminders** (server-driven, fire even when the app is closed) need
Firebase Cloud Messaging, because that's how Android delivers remote push:

1. Create a free Firebase project → add an **Android app** with package name
   `com.example.todos` (matches `app.json` → `android.package`; change both if
   you use your own).
2. Download **`google-services.json`** into `mobile/` (it's gitignored).
3. Create an EAS project to get a push-capable build + project id:
   ```bash
   npm i -g eas-cli
   eas login
   eas init            # writes the projectId into app.json → extra.eas.projectId
   ```
4. Build a **development build** (remote push is unreliable in Expo Go on
   Android; a dev build is the supported path):
   ```bash
   eas build --profile development --platform android
   ```
   Install the resulting APK on your phone, then `npx expo start --dev-client`.

On first launch the app asks for notification permission, gets an Expo push
token, and registers it via `POST /api/devices`. The reminder sweep then pushes
to every registered device (in addition to Telegram).

> **Duplicates:** with both channels on, a reminder could arrive twice (push +
> local) on the same phone. If that bothers you, set `ENABLE_LOCAL_REMINDERS =
> false` and rely on server push, or keep local-only and skip the Firebase
> steps.

---

## 4. Project layout

```
mobile/
  app.json            Expo config (apiUrl, android package, eas projectId)
  src/
    api.ts            stateless fetch helpers + auth calls
    AuthContext.tsx   token storage (SecureStore) + auto-refresh on 401
    useTodos.ts       todos state + CRUD/snooze, re-syncs local reminders
    notifications.ts  push registration + foreground handler + local scheduling
    components/        TodoItem, SnoozeModal (the ±5 stepper)
    screens/          AuthScreen, TodosScreen
```
