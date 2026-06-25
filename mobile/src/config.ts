import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as {
  apiUrl?: string;
  eas?: { projectId?: string };
};

// Base URL of the NestJS server. Set this in app.json -> expo.extra.apiUrl.
// On a physical device, use your machine's LAN IP (not localhost), e.g.
// "http://192.168.1.100:3000".
export const API_URL = extra.apiUrl ?? 'http://localhost:3000';

// EAS project id, needed to obtain an Expo push token. Run `eas init` to set it.
export const EAS_PROJECT_ID = extra.eas?.projectId ?? '';

// Toggle on-device scheduled reminders. Server push covers the closed-app case;
// local reminders are a fallback that works offline. Set false to avoid the
// (rare) chance of a duplicate notification when both fire.
export const ENABLE_LOCAL_REMINDERS = true;
