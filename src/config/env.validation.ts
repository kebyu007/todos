import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
  Staging = 'staging',
}

export class EnvironmentVariables {
  @IsOptional()
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  @IsNumber()
  @Min(0)
  @Max(65535)
  PORT: number;

  @IsString()
  MONGO_URL: string;

  // Access token secret (kept as JWT_SECRET for backwards compatibility)
  @IsString()
  JWT_SECRET: string;

  // Separate secret for refresh tokens; falls back to JWT_SECRET if absent.
  @IsOptional()
  @IsString()
  JWT_REFRESH_SECRET?: string;

  @IsOptional()
  @IsString()
  JWT_ACCESS_TTL?: string;

  @IsOptional()
  @IsString()
  JWT_REFRESH_TTL?: string;

  // 'true' in production (HTTPS-only cookies)
  @IsOptional()
  @IsString()
  COOKIE_SECURE?: string;

  // Public base URL, used to build the Google OAuth callback.
  @IsOptional()
  @IsString()
  APP_URL?: string;

  // --- Google OAuth (optional; routes 503 until configured) ---
  @IsOptional()
  @IsString()
  GOOGLE_CLIENT_ID?: string;

  @IsOptional()
  @IsString()
  GOOGLE_CLIENT_SECRET?: string;

  @IsOptional()
  @IsString()
  GOOGLE_CALLBACK_URL?: string;

  // --- Telegram bot (optional; bot stays off until a token is set) ---
  @IsOptional()
  @IsString()
  TELEGRAM_BOT_TOKEN?: string;

  @IsOptional()
  @IsString()
  TELEGRAM_BOT_USERNAME?: string;

  // Seed admins, format: "email:password,email2:password2".
  // Existing accounts are promoted; missing ones are created.
  @IsOptional()
  @IsString()
  SEED_ADMINS?: string;
}

export function validateEnv(config: Record<string, any>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(`❌ Invalid .env configuration: ${errors.toString()}`);
  }

  return validatedConfig;
}
