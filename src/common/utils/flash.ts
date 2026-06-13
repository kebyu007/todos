import type { Response } from 'express';

export type FlashType = 'success' | 'error' | 'info';

export interface Flash {
  type: FlashType;
  message: string;
}

const COOKIE = 'flash';

// Stores a one-shot toast for the NEXT full-page render (survives a redirect).
// Read + cleared by FlashMiddleware, surfaced to views as res.locals.flash.
export function setFlash(res: Response, type: FlashType, message: string): void {
  const value = encodeURIComponent(JSON.stringify({ type, message }));
  res.cookie(COOKIE, value, {
    httpOnly: false, // the client toast script may also read it as a fallback
    sameSite: 'lax',
    path: '/',
    maxAge: 10_000,
  });
}

export function readFlash(raw: string | undefined): Flash | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    if (parsed && typeof parsed.message === 'string') return parsed as Flash;
  } catch {
    /* ignore malformed flash */
  }
  return null;
}

export const FLASH_COOKIE = COOKIE;
