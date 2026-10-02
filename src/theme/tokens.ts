import { Platform } from 'react-native';

/**
 * Design tokens for the app.
 *
 * Screens never hardcode a colour or a radius; they reference these so spacing,
 * elevation and palette stay consistent across the scanner, the result view,
 * history and the manual entry screens.
 */

/** Brand and semantic palette. Kept small and high-contrast on purpose. */
export const colors = {
  /** Primary brand colour, used for primary actions and active states. */
  primary: '#0F766E',
  primaryPressed: '#0B5A54',
  primarySoft: '#E6F4F1',
  primaryBorder: '#99D6CF',

  /** Screen and surface backgrounds. */
  background: '#F7F8FA',
  surface: '#FFFFFF',
  surfaceSunken: '#F1F3F5',
  surfaceMuted: '#EDEFF2',

  /** Text. `muted` is the body-secondary tone, `subtle` is for metadata only. */
  text: '#111827',
  textSecondary: '#4B5563',
  textMuted: '#6B7280',
  textSubtle: '#9CA3AF',
  textInverse: '#FFFFFF',

  border: '#E3E6EA',
  borderStrong: '#CFD4DA',

  /** Verdict colours. Deliberately desaturated so the UI stays calm. */
  safe: '#15803D',
  safeSoft: '#E8F5EC',
  safeBorder: '#A7D8B8',

  caution: '#B45309',
  cautionSoft: '#FDF3E3',
  cautionBorder: '#EFC999',

  danger: '#B91C1C',
  dangerPressed: '#991B1B',
  dangerSoft: '#FBEDED',
  dangerBorder: '#EFB4B4',

  neutral: '#4B5563',
  neutralSoft: '#F1F3F5',
  neutralBorder: '#D7DBE0',

  /** In-code colours only: the camera preview and overlays. */
  onCamera: '#FFFFFF',
  overlay: 'rgba(17, 24, 39, 0.62)',
  overlayStrong: 'rgba(17, 24, 39, 0.78)',
  onCameraMuted: 'rgba(255, 255, 255, 0.86)',
  scrim: '#111827',
} as const;

/** 4pt spacing scale. Use these instead of ad-hoc padding. */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

/** Corner radii, with a single visual language of soft, consistent rounding. */
export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

/**
 * Type scale. System font with tightened letter spacing on large text, which is
 * what gives the app a cleaner typographic voice than the default React Native
 * rendering.
 */
export const typography = {
  display: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '700' as const,
    letterSpacing: -0.6,
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700' as const,
    letterSpacing: -0.4,
  },
  heading: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600' as const,
    letterSpacing: -0.2,
  },
  subheading: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600' as const,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400' as const,
  },
  bodyStrong: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600' as const,
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400' as const,
  },
  captionStrong: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600' as const,
  },
  /** Uppercase micro-labels for eyebrows and badge text. */
  overline: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700' as const,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
  },
  /** Large all-caps verdict headline. */
  verdict: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800' as const,
    letterSpacing: 1.2,
  },
} as const;

/**
 * Subtle elevation. Two levels only: resting cards and pressed/raised controls,
 * so shadows never compete with the content.
 */
export const shadows = {
  none: {},
  card: Platform.select({
    ios: {
      shadowColor: '#0B1220',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
    },
    android: { elevation: 1 },
    default: {},
  }) as object,
  raised: Platform.select({
    ios: {
      shadowColor: '#0B1220',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
    },
    android: { elevation: 3 },
    default: {},
  }) as object,
} as const;

/** Verdict presentation, shared by the result banner and the history badges. */
export type VerdictTone = 'safe' | 'caution' | 'unsafe' | 'neutral';

export function toneColors(tone: VerdictTone) {
  switch (tone) {
    case 'safe':
      return { fg: colors.safe, bg: colors.safeSoft, border: colors.safeBorder };
    case 'caution':
      return { fg: colors.caution, bg: colors.cautionSoft, border: colors.cautionBorder };
    case 'unsafe':
      return { fg: colors.danger, bg: colors.dangerSoft, border: colors.dangerBorder };
    default:
      return { fg: colors.neutral, bg: colors.neutralSoft, border: colors.neutralBorder };
  }
}

/** Maps an engine verdict onto the tone palette. */
export function verdictTone(verdict?: string): VerdictTone {
  switch ((verdict || '').toLowerCase()) {
    case 'unsafe':
      return 'unsafe';
    case 'caution':
      return 'caution';
    case 'safe':
      return 'safe';
    default:
      return 'neutral';
  }
}

/** Minimum touch target, so controls stay comfortably tappable. */
export const HIT_SIZE = 44;