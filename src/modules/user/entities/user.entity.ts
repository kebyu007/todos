import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export enum UserRoles {
  user = 'user',
  viewer = 'viewer',
  admin = 'admin',
}

@Schema({ collection: 'users', versionKey: false, timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, trim: true })
  username: string;

  // Optional: OAuth-only accounts (Google) never set a local password.
  @Prop({ type: String, required: false, select: false, default: null })
  passwordHash: string | null;

  // Google account id. Uniqueness is enforced by a partial index below so the
  // many local users (googleId === null) don't collide on null.
  @Prop({ type: String, default: null })
  googleId: string | null;

  // Profile picture (from Google or future uploads).
  @Prop({ type: String, default: null })
  avatarUrl: string | null;

  // argon2 hash of the CURRENT refresh token (rotation + revocation). Never raw.
  @Prop({ type: String, select: false, default: null })
  hashedRefreshToken: string | null;

  // IANA timezone, e.g. "Asia/Tashkent" — critical for correct reminders
  @Prop({ default: 'Asia/Tashkent' })
  timezone: string;

  // Telegram linkage (phase 2)
  @Prop({ type: String, index: true, default: null })
  telegramChatId: string | null;

  @Prop({ type: String, default: null, select: false }) // one-time token used by /start
  telegramLinkToken: string | null;

  @Prop({ default: true })
  notificationsEnabled: boolean;

  // Expo push tokens for the user's registered mobile devices (phase 3).
  // One user can have several devices; tokens are deduped on registration.
  @Prop({ type: [String], default: [] })
  pushTokens: string[];

  @Prop({ type: String, enum: UserRoles, default: UserRoles.user })
  role: UserRoles;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);

// Enforce one account per Google id, but only for real (string) ids — local
// users keep googleId === null without colliding.
UserSchema.index(
  { googleId: 1 },
  { unique: true, partialFilterExpression: { googleId: { $type: 'string' } } },
);
