export type Priority = 'low' | 'medium' | 'high';
export type Status = 'pending' | 'in_progress' | 'done';

export interface Reminder {
  offsetMinutes: number;
  sent: boolean;
  sentAt: string | null;
  remindAt: string | null;
}

export interface Todo {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  status: Status;
  isDone: boolean;
  tags: string[];
  dueAt: string | null; // UTC ISO
  reminders: Reminder[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface User {
  id: string;
  email: string;
  username: string;
  role: string;
  avatarUrl: string | null;
  timezone: string;
  notificationsEnabled: boolean;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: User;
}
