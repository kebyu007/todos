import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import { User, UserDocument, UserRoles } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async create(dto: CreateUserDto): Promise<UserDocument> {
    const existing = await this.userModel.findOne({
      email: dto.email.toLowerCase(),
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await argon2.hash(dto.password);
    const created = await this.userModel.create({
      email: dto.email,
      username: dto.username,
      passwordHash,
      timezone: dto.timezone ?? 'UTC',
      role: dto.role,
    });
    return created;
  }

  // Google sign-in: never registers the same person twice.
  //  1. known googleId  -> log in
  //  2. same email      -> link googleId onto the existing account
  //  3. otherwise       -> create a passwordless account
  async findOrCreateGoogleUser(profile: {
    googleId: string;
    email: string;
    username: string;
    avatarUrl?: string | null;
  }): Promise<UserDocument> {
    const byGoogle = await this.userModel
      .findOne({ googleId: profile.googleId })
      .exec();
    if (byGoogle) return byGoogle;

    const byEmail = await this.userModel
      .findOne({ email: profile.email.toLowerCase() })
      .exec();
    if (byEmail) {
      byEmail.googleId = profile.googleId;
      if (!byEmail.avatarUrl && profile.avatarUrl) {
        byEmail.avatarUrl = profile.avatarUrl;
      }
      return byEmail.save();
    }

    return this.userModel.create({
      email: profile.email,
      username: profile.username,
      googleId: profile.googleId,
      avatarUrl: profile.avatarUrl ?? null,
      passwordHash: null,
    });
  }

  // Idempotent admin seeding: promote an existing account or create a new one.
  // Never overwrites an existing user's password.
  async ensureAdmin(
    email: string,
    password: string,
  ): Promise<'created' | 'promoted' | 'unchanged'> {
    const existing = await this.userModel
      .findOne({ email: email.toLowerCase() })
      .exec();

    if (existing) {
      if (existing.role === UserRoles.admin) return 'unchanged';
      existing.role = UserRoles.admin;
      await existing.save();
      return 'promoted';
    }

    const passwordHash = await argon2.hash(password);
    await this.userModel.create({
      email,
      username: email.split('@')[0],
      passwordHash,
      role: UserRoles.admin,
    });
    return 'created';
  }

  findAll(): Promise<UserDocument[]> {
    return this.userModel.find().sort({ createdAt: -1 }).exec();
  }

  count(): Promise<number> {
    return this.userModel.countDocuments().exec();
  }

  async findById(id: string): Promise<UserDocument> {
    this.assertObjectId(id);
    const user = await this.userModel.findById(id).exec();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  findByIdOrNull(id: string): Promise<UserDocument | null> {
    if (!Types.ObjectId.isValid(id)) return Promise.resolve(null);
    return this.userModel.findById(id).exec();
  }

  // Includes passwordHash for credential checks.
  findByEmailWithSecret(email: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ email: email.toLowerCase() })
      .select('+passwordHash')
      .exec();
  }

  // Includes hashedRefreshToken for rotation/verification.
  findByIdWithRefresh(id: string): Promise<UserDocument | null> {
    this.assertObjectId(id);
    return this.userModel.findById(id).select('+hashedRefreshToken').exec();
  }

  async verifyPassword(user: UserDocument, password: string): Promise<boolean> {
    if (!user.passwordHash) return false;
    return argon2.verify(user.passwordHash, password);
  }

  async setRefreshToken(id: string, rawToken: string | null): Promise<void> {
    const hashedRefreshToken =
      rawToken === null ? null : await argon2.hash(rawToken);
    await this.userModel.findByIdAndUpdate(id, { hashedRefreshToken }).exec();
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserDocument> {
    this.assertObjectId(id);
    const update: Record<string, unknown> = {};
    if (dto.email !== undefined) update.email = dto.email;
    if (dto.username !== undefined) update.username = dto.username;
    if (dto.timezone !== undefined) update.timezone = dto.timezone;
    if (dto.role !== undefined) update.role = dto.role;
    if (dto.notificationsEnabled !== undefined) {
      update.notificationsEnabled = dto.notificationsEnabled;
    }
    if (dto.password) {
      update.passwordHash = await argon2.hash(dto.password);
    }

    const user = await this.userModel
      .findByIdAndUpdate(id, update, { new: true })
      .exec();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async remove(id: string): Promise<void> {
    this.assertObjectId(id);
    const res = await this.userModel.findByIdAndDelete(id).exec();
    if (!res) throw new NotFoundException('User not found');
  }

  // ---- Mobile push device tokens ----

  // Registers an Expo push token for a device ($addToSet dedupes).
  async addPushToken(id: string, token: string): Promise<void> {
    this.assertObjectId(id);
    await this.userModel
      .findByIdAndUpdate(id, { $addToSet: { pushTokens: token } })
      .exec();
  }

  async removePushToken(id: string, token: string): Promise<void> {
    this.assertObjectId(id);
    await this.userModel
      .findByIdAndUpdate(id, { $pull: { pushTokens: token } })
      .exec();
  }

  // ---- Telegram linking ----

  // Profile view needs the (normally hidden) one-time link token.
  findByIdWithTelegram(id: string): Promise<UserDocument | null> {
    this.assertObjectId(id);
    return this.userModel.findById(id).select('+telegramLinkToken').exec();
  }

  // Creates a fresh one-time token for the t.me/<bot>?start=<token> deep link.
  async generateTelegramLinkToken(id: string): Promise<string> {
    this.assertObjectId(id);
    const token = randomBytes(24).toString('hex');
    const user = await this.userModel
      .findByIdAndUpdate(id, { telegramLinkToken: token })
      .exec();
    if (!user) throw new NotFoundException('User not found');
    return token;
  }

  findByTelegramLinkToken(token: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ telegramLinkToken: token })
      .select('+telegramLinkToken')
      .exec();
  }

  findByTelegramChatId(chatId: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ telegramChatId: chatId }).exec();
  }

  // Completes linking from the bot's /start handler.
  async linkTelegram(id: string, chatId: string): Promise<void> {
    await this.userModel
      .findByIdAndUpdate(id, {
        telegramChatId: chatId,
        telegramLinkToken: null,
      })
      .exec();
  }

  async unlinkTelegram(id: string): Promise<void> {
    this.assertObjectId(id);
    await this.userModel
      .findByIdAndUpdate(id, {
        telegramChatId: null,
        telegramLinkToken: null,
      })
      .exec();
  }

  private assertObjectId(id: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Invalid id');
    }
  }
}
