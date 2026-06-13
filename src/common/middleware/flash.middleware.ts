import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { FLASH_COOKIE, readFlash } from '../utils/flash';

// Moves a one-shot flash cookie into res.locals.flash for the view, then
// clears it so the toast shows exactly once.
@Injectable()
export class FlashMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const flash = readFlash(req.cookies?.[FLASH_COOKIE]);
    if (flash) {
      res.locals.flash = flash;
      res.clearCookie(FLASH_COOKIE, { path: '/' });
    }
    next();
  }
}
