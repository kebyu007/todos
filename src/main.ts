import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { readdirSync, readFileSync } from 'fs';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import hbs from 'hbs';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // ---- Security & parsing ----
  // HBS + HTMX/Alpine over a CDN need a relaxed CSP, so disable the strict default.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());

  // ---- Global validation ----
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  // ---- Renders error.hbs for thrown HttpExceptions on page routes ----
  app.useGlobalFilters(new HttpExceptionFilter());

  // ---- View engine (HBS) ----
  const viewsPath = join(__dirname, '..', 'views');
  app.setBaseViewsDir(viewsPath);
  app.setViewEngine('hbs');
  registerPartials(join(viewsPath, 'partials'));
  registerHbsHelpers();

  // ---- Static assets ----
  app.useStaticAssets(join(__dirname, '..', 'public'), { prefix: '/public/' });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 Todos app running on http://localhost:${port}`);
}

// hbs.registerPartials() rewrites hyphens to underscores in partial names
// (todo-item -> todo_item), so register them by hand to keep {{> todo-item}}.
function registerPartials(dir: string) {
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.hbs')) continue;
    const name = file.replace(/\.hbs$/, '');
    hbs.registerPartial(name, readFileSync(join(dir, file), 'utf8'));
  }
}

function registerHbsHelpers() {
  hbs.registerHelper('eq', (a: unknown, b: unknown) => a === b);
  hbs.registerHelper('firstLetter', (s: unknown) =>
    typeof s === 'string' && s.length ? s.charAt(0).toUpperCase() : '?',
  );
  hbs.registerHelper('formatDate', (date: Date | string | null) => {
    if (!date) return '';
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  });
  // value for <input type="datetime-local"> (yyyy-MM-ddTHH:mm)
  hbs.registerHelper('inputDate', (date: Date | string | null) => {
    if (!date) return '';
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 16);
  });
}

bootstrap();
