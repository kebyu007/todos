import { EnvironmentVariables } from './env.validation';

// Typed config object consumed across the app via ConfigService.get('...')
export const configuration = () => {
  const env = process.env as unknown as EnvironmentVariables;

  const accessSecret = env.JWT_SECRET;
  const refreshSecret = env.JWT_REFRESH_SECRET || env.JWT_SECRET;
  const appUrl = env.APP_URL || `http://localhost:${env.PORT || 3000}`;

  return {
    nodeEnv: env.NODE_ENV || 'development',
    appUrl,
    server: {
      port: Number(env.PORT) || 3000,
    },
    mongo: {
      url: env.MONGO_URL,
    },
    jwt: {
      accessSecret,
      refreshSecret,
      accessTtl: env.JWT_ACCESS_TTL || '15m',
      refreshTtl: env.JWT_REFRESH_TTL || '7d',
    },
    cookie: {
      secure: String(env.COOKIE_SECURE) === 'true',
    },
    google: {
      clientId: env.GOOGLE_CLIENT_ID || '',
      clientSecret: env.GOOGLE_CLIENT_SECRET || '',
      callbackUrl:
        env.GOOGLE_CALLBACK_URL || `${appUrl}/auth/google/callback`,
      enabled: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    },
    telegram: {
      botToken: env.TELEGRAM_BOT_TOKEN || '',
      botUsername: env.TELEGRAM_BOT_USERNAME || '',
      enabled: Boolean(env.TELEGRAM_BOT_TOKEN),
    },
    // Parsed "email:password" pairs to seed/promote as admins on boot.
    seedAdmins: parseSeedAdmins(env.SEED_ADMINS),
  };
};

function parseSeedAdmins(
  raw?: string,
): Array<{ email: string; password: string }> {
  if (!raw) return [];
  return raw
    .split(',')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const sep = pair.indexOf(':'); // email can't contain ':'
      if (sep === -1) return null;
      const email = pair.slice(0, sep).trim();
      const password = pair.slice(sep + 1);
      return email && password ? { email, password } : null;
    })
    .filter((v): v is { email: string; password: string } => v !== null);
}

export type ConfigType = ReturnType<typeof configuration>;
