// ورد (Wird) palette — deep teal/emerald primary, warm gold/amber accent, slate neutrals.
// Single light theme for v1 (no dark mode). Shared by the Tailwind preset (web) and the RN theme.

export const primary = {
  50: '#EAFBF6',
  100: '#CFF6EA',
  200: '#9FECD6',
  300: '#6BDDBE',
  400: '#3EC7A2',
  500: '#1FA885',
  600: '#12866B',
  700: '#0F6B57',
  800: '#0D5646',
  900: '#0B4638',
  950: '#052720',
};

export const accent = {
  50: '#FDF8EC',
  100: '#FBF0D2',
  200: '#F6DFA0',
  300: '#EFCB6E',
  400: '#E5B84A',
  500: '#D8A93B',
  600: '#BA8A28',
  700: '#966D1F',
  800: '#785819',
  900: '#634A16',
  950: '#382809',
};

export const neutral = {
  50: '#F8FAFC',
  100: '#F1F5F9',
  200: '#E2E8F0',
  300: '#CBD5E1',
  400: '#94A3B8',
  500: '#64748B',
  600: '#475569',
  700: '#334155',
  800: '#1E293B',
  900: '#0F172A',
  950: '#020617',
};

export const semantic = {
  success: primary[600],
  warning: accent[500],
  danger: '#DC2626',
  info: '#2563EB',
};

export const colors = { primary, accent, neutral, semantic };
