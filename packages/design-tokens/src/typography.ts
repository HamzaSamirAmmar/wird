// Arabic-first typography. IBM Plex Sans Arabic (Google Fonts, free) covers both Arabic and
// Latin glyphs with a modern, neutral feel; Reem Kufi is the display face, reserved for the
// wordmark and page titles.

export const fontFamily = {
  sans: "'IBM Plex Sans Arabic', system-ui, -apple-system, 'Segoe UI', sans-serif",
  display: "'Reem Kufi', 'IBM Plex Sans Arabic', system-ui, sans-serif",
};

// Numeric scale (px-equivalent): Tailwind divides by 16 for rem, RN uses these numbers directly.
export const fontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
  '5xl': 48,
};

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
};
