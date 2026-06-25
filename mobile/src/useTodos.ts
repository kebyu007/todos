import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { syncLocalReminders } from './notifications';
import type { Todo } from './types';

export interface NewTodo {
  title: string;
  description?: string;
  dueAt?: string | null; // UTC ISO
  priority?: string;
}

export function useTodos() {
  const { authedRequest } = useAuth();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((next: Todo[]) => {
    setTodos(next);
    // Keep on-device scheduled reminders in step with the latest data.
    void syncLocalReminders(next);
  }, []);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const data = await authedRequest<Todo[]>('/api/todos');
      apply(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load todos');
    } finally {
      setLoading(false);
    }
  }, [authedRequest, apply]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = useCallback(
    async (input: NewTodo) => {
      const created = await authedRequest<Todo>('/api/todos', {
        method: 'POST',
        body: input,
      });
      apply([created, ...todos]);
    },
    [authedRequest, todos, apply],
  );

  const toggle = useCallback(
    async (id: string) => {
      const updated = await authedRequest<Todo>(`/api/todos/${id}/toggle`, {
        method: 'POST',
      });
      apply(todos.map((t) => (t.id === id ? updated : t)));
    },
    [authedRequest, todos, apply],
  );

  const snooze = useCallback(
    async (id: string, minutes: number) => {
      const { todo } = await authedRequest<{ remindAt: string; todo: Todo }>(
        `/api/todos/${id}/snooze`,
        { method: 'POST', body: { minutes } },
      );
      apply(todos.map((t) => (t.id === id ? todo : t)));
    },
    [authedRequest, todos, apply],
  );

  const remove = useCallback(
    async (id: string) => {
      await authedRequest<void>(`/api/todos/${id}`, { method: 'DELETE' });
      apply(todos.filter((t) => t.id !== id));
    },
    [authedRequest, todos, apply],
  );

  return { todos, loading, error, refresh, create, toggle, snooze, remove };
}
