export const COLORS = {
  background: '#041221',
  backgroundDeep: '#020B16',
  surface: '#08182C',
  surfaceLight: '#10233D',
  surfaceMuted: '#0C1B2F',

  primary: '#2478FF',
  primaryDark: '#155FD4',
  primaryLight: '#67B8FF',

  text: '#F5F9FF',
  textMuted: '#91A0B7',
  textSoft: '#71839D',

  success: '#42F39B',
  warning: '#FFB84D',
  danger: '#FF5C70',

  border: 'rgba(112, 169, 255, 0.18)',
  borderStrong: 'rgba(112, 169, 255, 0.32)',
  glass: 'rgba(8, 24, 44, 0.92)',
  overlay: 'rgba(2, 11, 22, 0.78)',

  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
} as const;

export const RADIUS = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export const FONT_SIZE = {
  caption: 11,
  small: 13,
  body: 16,
  bodyLarge: 18,
  title: 24,
  heading: 32,
  hero: 48,
} as const;

export const SHADOWS = {
  card: {
    shadowColor: COLORS.black,
    shadowOpacity: 0.32,
    shadowRadius: 22,
    shadowOffset: {
      width: 0,
      height: 12,
    },
    elevation: 8,
  },

  primaryButton: {
    shadowColor: COLORS.primary,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    elevation: 7,
  },
} as const;