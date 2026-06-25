export const colors = {
  bg: '#0f1115',
  card: '#1a1d24',
  cardAlt: '#232732',
  border: '#2b303b',
  text: '#e6e8ee',
  muted: '#8b93a7',
  primary: '#4f46e5',
  primaryText: '#ffffff',
  danger: '#e0524b',
  success: '#2fa36b',
  warning: '#d39b2d',
};

export const priorityColor: Record<string, string> = {
  low: colors.muted,
  medium: colors.warning,
  high: colors.danger,
};
