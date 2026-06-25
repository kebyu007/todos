import { Injectable, Logger } from '@nestjs/common';

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

// Sends notifications through Expo's push service. The phone hands us an
// ExpoPushToken on registration; Expo relays to FCM (Android) for us, so the
// server never needs raw Firebase credentials — just this HTTPS call.
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly endpoint = 'https://exp.host/--/api/v2/push/send';

  private isExpoToken(token: string): boolean {
    return /^Expo(nent)?PushToken\[.+\]$/.test(token);
  }

  async sendToTokens(
    tokens: string[] | undefined,
    message: PushMessage,
  ): Promise<void> {
    const valid = (tokens ?? []).filter((t) => this.isExpoToken(t));
    if (valid.length === 0) return;

    const messages = valid.map((to) => ({
      to,
      sound: 'default',
      title: message.title,
      body: message.body,
      data: message.data ?? {},
    }));

    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });
      if (!res.ok) {
        this.logger.warn(
          `Expo push responded ${res.status} ${res.statusText}`,
        );
      }
    } catch (err) {
      this.logger.error('Expo push request failed', err as Error);
    }
  }
}
