import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserService } from './user.service';

interface SeedAdmin {
  email: string;
  password: string;
}

// On boot, ensure every admin listed in SEED_ADMINS exists and has the admin
// role. Idempotent — safe to run on every startup.
@Injectable()
export class AdminSeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminSeederService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly userService: UserService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const admins = this.config.get<SeedAdmin[]>('seedAdmins') ?? [];
    if (admins.length === 0) return;

    for (const { email, password } of admins) {
      try {
        const result = await this.userService.ensureAdmin(email, password);
        if (result === 'created') {
          this.logger.log(`Seeded admin ${email}`);
        } else if (result === 'promoted') {
          this.logger.log(`Promoted ${email} to admin (re-login required)`);
        }
      } catch (err) {
        this.logger.error(`Failed to seed admin ${email}`, err as Error);
      }
    }
  }
}
