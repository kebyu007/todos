import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

const STEP = 5;
const MIN = 5;
const MAX = 180;
const DEFAULT = 25;

interface Props {
  visible: boolean;
  onCancel: () => void;
  onConfirm: (minutes: number) => void;
}

// On-device version of the Telegram snooze stepper: − 5 · [confirm N min] · + 5.
export function SnoozeModal({ visible, onCancel, onConfirm }: Props) {
  const [minutes, setMinutes] = useState(DEFAULT);

  const dec = () => setMinutes((m) => Math.max(MIN, m - STEP));
  const inc = () => setMinutes((m) => Math.min(MAX, m + STEP));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.heading}>Snooze reminder</Text>

          <View style={styles.stepper}>
            <Pressable
              style={[styles.stepBtn, minutes <= MIN && styles.stepBtnDisabled]}
              onPress={dec}
            >
              <Text style={styles.stepText}>➖ 5</Text>
            </Pressable>

            <Pressable style={styles.confirm} onPress={() => onConfirm(minutes)}>
              <Text style={styles.confirmText}>😴 {minutes} min</Text>
            </Pressable>

            <Pressable
              style={[styles.stepBtn, minutes >= MAX && styles.stepBtnDisabled]}
              onPress={inc}
            >
              <Text style={styles.stepText}>5 ➕</Text>
            </Pressable>
          </View>

          <Pressable style={styles.cancel} onPress={onCancel}>
            <Text style={styles.cancelText}>✖️ Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 34,
    gap: 16,
  },
  heading: { color: colors.text, fontSize: 16, fontWeight: '600', textAlign: 'center' },
  stepper: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  stepBtn: {
    backgroundColor: colors.cardAlt,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 14,
  },
  stepBtnDisabled: { opacity: 0.4 },
  stepText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  confirm: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  confirmText: { color: colors.primaryText, fontSize: 16, fontWeight: '700' },
  cancel: { alignItems: 'center', paddingVertical: 6 },
  cancelText: { color: colors.muted, fontSize: 15 },
});
