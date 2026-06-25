import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../AuthContext';
import { useTodos } from '../useTodos';
import { registerForPush } from '../notifications';
import { TodoItem } from '../components/TodoItem';
import { SnoozeModal } from '../components/SnoozeModal';
import { colors } from '../theme';

// Quick due-date presets so a reminder can be set without a date picker.
const DUE_PRESETS: { label: string; build: () => string }[] = [
  { label: 'In 1h', build: () => new Date(Date.now() + 60 * 60_000).toISOString() },
  {
    label: 'Tonight',
    build: () => atToday(20, 0),
  },
  {
    label: 'Tomorrow',
    build: () => atTomorrow(9, 0),
  },
];

function atToday(h: number, m: number): string {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}
function atTomorrow(h: number, m: number): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

export function TodosScreen() {
  const { user, signOut, authedRequest } = useAuth();
  const { todos, loading, error, refresh, create, toggle, snooze, remove } =
    useTodos();

  const [title, setTitle] = useState('');
  const [duePreset, setDuePreset] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [snoozeId, setSnoozeId] = useState<string | null>(null);

  // Register this device for push, then sync when a notification is tapped.
  useEffect(() => {
    (async () => {
      const token = await registerForPush();
      if (token) {
        try {
          await authedRequest('/api/devices', {
            method: 'POST',
            body: { token },
          });
        } catch {
          // non-fatal; local reminders still work
        }
      }
    })();

    const sub = Notifications.addNotificationResponseReceivedListener(() => {
      void refresh();
    });
    return () => sub.remove();
  }, [authedRequest, refresh]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  async function addTodo() {
    const trimmed = title.trim();
    if (!trimmed) return;
    setAdding(true);
    try {
      await create({
        title: trimmed,
        dueAt: duePreset !== null ? DUE_PRESETS[duePreset].build() : null,
      });
      setTitle('');
      setDuePreset(null);
    } catch {
      // surfaced via list error on next load; keep input for retry
    } finally {
      setAdding(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.hello}>Hi {user?.username}</Text>
          <Text style={styles.sub}>
            {todos.filter((t) => !t.isDone).length} open
          </Text>
        </View>
        <Pressable onPress={signOut}>
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>

      <View style={styles.addBox}>
        <TextInput
          style={styles.addInput}
          placeholder="Add a task…"
          placeholderTextColor={colors.muted}
          value={title}
          onChangeText={setTitle}
          onSubmitEditing={addTodo}
          returnKeyType="done"
        />
        <Pressable style={styles.addBtn} onPress={addTodo} disabled={adding}>
          {adding ? (
            <ActivityIndicator color={colors.primaryText} />
          ) : (
            <Text style={styles.addBtnText}>＋</Text>
          )}
        </Pressable>
      </View>

      <View style={styles.chips}>
        {DUE_PRESETS.map((p, i) => (
          <Pressable
            key={p.label}
            style={[styles.chip, duePreset === i && styles.chipOn]}
            onPress={() => setDuePreset(duePreset === i ? null : i)}
          >
            <Text style={[styles.chipText, duePreset === i && styles.chipTextOn]}>
              {p.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={todos}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.muted}
            />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              {error ?? '🎉 Nothing here yet — add your first task.'}
            </Text>
          }
          renderItem={({ item }) => (
            <TodoItem
              todo={item}
              onToggle={() => toggle(item.id)}
              onSnooze={() => setSnoozeId(item.id)}
              onDelete={() => remove(item.id)}
            />
          )}
        />
      )}

      <SnoozeModal
        visible={snoozeId !== null}
        onCancel={() => setSnoozeId(null)}
        onConfirm={async (minutes) => {
          const id = snoozeId;
          setSnoozeId(null);
          if (id) await snooze(id, minutes);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 14,
  },
  hello: { color: colors.text, fontSize: 22, fontWeight: '800' },
  sub: { color: colors.muted, fontSize: 13, marginTop: 2 },
  signOut: { color: colors.muted, fontSize: 14 },
  addBox: { flexDirection: 'row', gap: 10 },
  addInput: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  addBtn: {
    width: 48,
    backgroundColor: colors.primary,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: { color: colors.primaryText, fontSize: 24, fontWeight: '700' },
  chips: { flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.muted, fontSize: 13 },
  chipTextOn: { color: colors.primaryText, fontWeight: '600' },
  list: { paddingTop: 12, paddingBottom: 40 },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 50, fontSize: 15 },
});
