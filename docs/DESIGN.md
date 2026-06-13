# Todos — UI / UX Design System

A single source of truth for the frontend.

## Principles

1. **Glass & depth, iOS/One-UI inspired.** Surfaces (navbar, cards, todos,
   toasts) are frosted glass (`backdrop-filter`) over a soft, slowly drifting
   **mesh-gradient background** (`body::before/::after` blobs). Depth comes from
   layered soft shadows and large radii, not hard borders.
2. **Content-centered.** The navbar and background span full width; readable
   content is capped at `--maxw` and centered. Shell: `.app-shell → .navbar +
   .app-main → .container`.
3. **Spring motion, used sparingly.** Entrances (`riseIn`/`popIn`), button
   presses (scale), the satisfying checkbox pop, and HTMX swap transitions use a
   springy easing (`--spring`). All motion collapses under
   `prefers-reduced-motion`.
4. **Tokens first.** Never hard-code a color, radius, shadow, or glass value —
   use a `:root` variable. Dark mode is a second token set under
   `[data-theme="dark"]`, toggled by Alpine on `<html>`, persisted to
   `localStorage` (falls back to the OS `prefers-color-scheme`).
5. **Feedback is always a toast.** Every success, error, and validation message
   surfaces through the toast system — never a raw JSON page or silent failure.
6. **Progressive enhancement.** Server-rendered HBS works without JS; HTMX adds
   partial swaps, Alpine adds micro-interactions (theme, menus).

## Tokens (`public/css/app.css`)

| Group | Examples |
|---|---|
| Brand | `--brand-500/600/700`, `--brand-grad`, `--brand-glow` |
| Glass | `--glass --glass-strong --glass-2 --glass-brd --field` |
| Mesh | `--blob-1 --blob-2 --blob-3` |
| Priority/status | `--high --medium --low --done --pending --in_progress` |
| Semantic | `--success --error --info` |
| Base | `--bg --text --text-soft --muted --border --border-strong` |
| Effects | `--r(-sm/-lg/-xl/-full) --shadow(-sm/-lg) --ring --spring --ease` |

## Components

Buttons (`.btn` + `--primary/--ghost/--danger/--google/--sm/--block`), forms
(`.field`, `.input`, `.divider`, iOS `.switch` toggle), cards (`.card`, `.auth`),
navbar + `.usermenu` + `.avatar`, todo rows (`.todo` with custom circular
checkbox, `.todo-list`, `.todo-create`, segmented filter `.filters`/`.chip`),
`.badge--*` / `.tag`, admin `.stats` + `.table`, and `.toast`. The `.glass`
utility applies the frosted-surface treatment to any element.

## Toast system

- **Client:** [`public/js/toast.js`](../public/js/toast.js) exposes
  `window.showToast(type, message)` and listens for three sources.
- **Full-page (redirects):** `setFlash(res, type, msg)` drops a short-lived
  `flash` cookie → `FlashMiddleware` moves it to `res.locals.flash` → the layout
  renders a hidden `#flash-data` element → the script shows it once on load.
- **HTMX success:** controllers set `HX-Trigger: { "toast": {...} }`; HTMX
  dispatches a `toast` event the script listens for.
- **HTMX errors:** the script listens to `htmx:responseError` and toasts the
  server's JSON `{ message }` (produced by `HttpExceptionFilter`).

## Auth UX

- Email/password **and** "Continue with Google" on both `/login` and `/register`.
- Google sign-in never double-registers: an existing `googleId` logs in, a
  matching email links the Google account, otherwise a passwordless user is
  created (`UserService.findOrCreateGoogleUser`).

## Extending

1. Add a token to `:root` (and its dark counterpart) before using a new color.
2. Build the component class in the relevant section of `app.css`.
3. Prefer existing utilities (`.flex`, `.stack`, `.between`, `.muted`) over
   one-off inline styles.
