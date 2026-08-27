// CommonJS on purpose: Tailwind loads config files directly with Node, without a TS/ESM
// transform step, so this mirrors src/colors.ts, src/typography.ts, src/spacing.ts in plain JS.
// Keep both in sync if the palette or scales change.

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class', // present for future flexibility; v1 ships light-only, never toggled
  theme: {
    extend: {
      colors: {
        primary: {
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
        },
        accent: {
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
        },
        neutral: {
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
        },
        success: '#12866B',
        warning: '#D8A93B',
        danger: '#DC2626',
        info: '#2563EB',
      },
      fontFamily: {
        sans: ["'IBM Plex Sans Arabic'", 'system-ui', '-apple-system', "'Segoe UI'", 'sans-serif'],
      },
      borderRadius: {
        sm: '4px',
        md: '8px',
        lg: '12px',
        xl: '16px',
      },
    },
  },
};
