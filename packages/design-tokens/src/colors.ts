// ورد (Wird) palette. Anchored on #02636C — the deep teal of the brand mark (an open muṣḥaf
// in a mihrab medallion). `mint` is the softer green of the mark's flat colourway and carries
// "done"; `accent` is a warm brass that stays clear of both greens.
// Single light theme for v1 (no dark mode). Mirrors ../theme.css — keep the two in sync.

export const primary = {
  50: '#ECFAFA',
  100: '#D2F1F2',
  200: '#A6E2E5',
  300: '#6ECCD3',
  400: '#35AFBA',
  500: '#14919C',
  600: '#05757F',
  700: '#02636C', // brand core
  800: '#06505A',
  900: '#0A414A',
  950: '#032B31',
};

export const mint = {
  50: '#EDF9F2',
  100: '#D3F0E1',
  200: '#A9E2C6',
  300: '#72BF9D',
  400: '#4EAA84',
  500: '#2E8E68',
  600: '#1E7454',
  700: '#185E45',
  800: '#154B38',
  900: '#123E2F',
};

export const accent = {
  50: '#FBF6EA',
  100: '#F6EBCE',
  200: '#EDD79E',
  300: '#E0BC66',
  400: '#D2A343',
  500: '#BC8B2E',
  600: '#9C7025',
  700: '#7C5820',
  800: '#63461C',
  900: '#533B19',
};

// Neutrals carry a slight cyan cast so grey surfaces sit inside the teal family.
export const neutral = {
  50: '#F6F9F9',
  100: '#EDF2F3',
  200: '#DDE6E7',
  300: '#C3D0D2',
  400: '#92A3A6',
  500: '#6A7B7F',
  600: '#526165',
  700: '#3F4C50',
  800: '#2B3639',
  900: '#1A2325',
  950: '#0D1416',
};

export const danger = {
  50: '#FEF2F2',
  100: '#FEE2E2',
  200: '#FECACA',
  500: '#EF4444',
  600: '#DC2626',
  700: '#B91C1C',
};

export const surface = {
  canvas: '#F3F7F7',
  raised: '#FFFFFF',
  sunken: neutral[100],
};

export const semantic = {
  success: mint[600],
  warning: accent[500],
  danger: danger[600],
  info: primary[600],
};

export const colors = { primary, mint, accent, neutral, danger, surface, semantic };
