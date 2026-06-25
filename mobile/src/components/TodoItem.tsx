import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, priorityColor } from '../theme';
import type { Todo } from '../types';

interface Props {
  todo: Todo;
  onToggle: () => void;
  onSnooze: () => void;
  onDelete: () => void;
}

function formatDue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // Device-local formatting (matches the user's timezone).
  return d.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function TodoItem({ todo, onToggle, onSnooze, onDelete }: Props) {
  const due = formatDue(todo.dueAt);

  return (
    <View style={styles.card}>
      <Pressable style={styles.main} onPress={onToggle}>
        <View style={[styles.check, todo.isDone && styles.checkDone]}>
          {todo.isDone && <Text style={styles.checkMark}>✓</Text>}
        </View>
        <View style={styles.body}>
          <Text style={[styles.title, todo.isDone && styles.titleDone]}>
            {todo.title}
          </Text>
          <View style={styles.meta}>
            <View
              style={[
                styles.dot,
                { backgroundColor: priorityColor[todo.priority] ?? colors.muted },
              ]}
            />
            {!!due && <Text style={styles.due}>🗓 {due}</Text>}
          </View>
        </View>
      </Pressable>

      <View style={styles.actions}>
        {!todo.isDone && !!todo.dueAt && (
          <Pressable style={styles.actionBtn} onPress={onSnooze}>
            <Text style={styles.actionText}>😴</Text>
          </Pressable>
        )}
        <Pressable style={styles.actionBtn} onPress={onDelete}>
          <Text style={styles.actionText}>🗑</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 10,
  },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  check: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDone: { backgroundColor: colors.success, borderColor: colors.success },
  checkMark: { color: '#fff', fontSize: 14, fontWeight: '800' },
  body: { flex: 1 },
  title: { color: colors.text, fontSize: 16, fontWeight: '500' },
  titleDone: { textDecorationLine: 'line-through', color: colors.muted },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  due: { color: colors.muted, fontSize: 13 },
  actions: { flexDirection: 'row', gap: 4, marginLeft: 8 },
  actionBtn: { padding: 8 },
  actionText: { fontSize: 18 },
});
