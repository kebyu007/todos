import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { setFlash } from '../utils/flash';

// Central error → message funnel:
//  • HTMX requests        -> JSON { message }; client shows a toast on error.
//  • Form posts (page)    -> flash cookie + redirect back; toast on next render.
//  • GET pages            -> render error.hbs (401 -> /login).
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = this.extractMessage(exception, status);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${req.method} ${req.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const isHtmx = req.headers['hx-request'] === 'true';
    const wantsHtml = (req.headers.accept || '').includes('text/html');

    // HTMX: let the client toast it (see public/js/toast.js → htmx:responseError).
    if (isHtmx) {
      return res.status(status).json({ statusCode: status, message });
    }

    // Plain browser navigation / form posts.
    if (wantsHtml) {
      if (status === HttpStatus.UNAUTHORIZED && req.method === 'GET') {
        setFlash(res, 'info', 'Please sign in to continue');
        return res.redirect('/login');
      }
      // Form submissions: bounce back to the previous page with a toast.
      if (req.method !== 'GET') {
        setFlash(res, 'error', message);
        return res.redirect(req.get('referer') || '/');
      }
      return res.status(status).render('pages/error', {
        layout: 'layouts/main',
        title: `Error ${status}`,
        status,
        message,
      });
    }

    return res.status(status).json({ statusCode: status, message });
  }

  private extractMessage(exception: unknown, status: number): string {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'string') return response;
      if (response && typeof response === 'object') {
        const m = (response as { message?: string | string[] }).message;
        if (Array.isArray(m)) return m[0];
        if (typeof m === 'string') return m;
      }
      return exception.message;
    }
    return status >= 500 ? 'Something went wrong. Please try again.' : 'Request failed';
  }
}
