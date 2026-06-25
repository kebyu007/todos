import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { EAS_PROJECT_ID, ENABLE_LOCAL_REMINDERS } from './config';
import type { Todo } from './types';

// Show notifications even while the app is in the foreground (in-app banner).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Asks permission, sets up the Android channel, and returns the Expo push token
// (or null if unavailable, e.g. on a simulator or if permission is denied).
export async function registerForPush(): Promise<string | null> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#4f46e5',
    });
  }

  if (!Device.isDevice) return null; // push tokens require a physical device

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') return null;

  try {
    const token = await Notifications.getExpoPushTokenAsync(
      EAS_PROJECT_ID ? { projectId: EAS_PROJECT_ID } : undefined,
    );
    return token.data;
  } catch {
    // Typically a missing EAS projectId / FCM config — local reminders still work.
    return null;
  }
}

// Re-schedules on-device reminders to match the current todos. Mirrors the
// server sweep: an unsent reminder fires at `remindAt` (snooze) or at
// `dueAt − offsetMinutes`.
export async function syncLocalReminders(todos: Todo[]): Promise<void> {
  if (!ENABLE_LOCAL_REMINDERS) return;

  await Notifications.cancelAllScheduledNotificationsAsync();
  const now = Date.now();

  for (const todo of todos) {
    if (todo.isDone || !todo.dueAt) continue;
    const dueMs = new Date(todo.dueAt).getTime();

    for (const reminder of todo.reminders) {
      if (reminder.sent) continue;
      const fireMs = reminder.remindAt
        ? new Date(reminder.remindAt).getTime()
        : dueMs - reminder.offsetMinutes * 60_000;
      if (fireMs <= now) continue;

      const title = reminder.remindAt
        ? '😴 Snoozed reminder'
        : reminder.offsetMinutes >= 60
          ? '⏰ Due in 1 hour'
          : reminder.offsetMinutes > 0
            ? `⏰ Due in ${reminder.offsetMinutes} min`
            : '🔔 Due now';

      await Notifications.scheduleNotificationAsync({
        content: { title, body: todo.title, data: { todoId: todo.id } },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(fireMs),
          channelId: 'reminders',
        },
      });
    }
  }
}
