import { Platform } from 'react-native';

/**
 * Design tokens for the app.
 *
 * Clinical Purity & Consumer Trust design system.
 * Colors, typography, spacing, radii, and elevation for food safety analysis.
 */

// ============================================================================
// COLOR PALETTE
// ============================================================================

/** Brand and semantic palette. High-contrast, clinical authority. */
export const colors = {
  /** Primary — deep oceanic navy for institutional authority and CTAs. */
  primary: '#1E3E62',
  primaryPressed: '#01284B',
  primarySoft: '#E5EEFF',
  primaryBorder: '#AAC9F4',

  /** Screen and surface backgrounds. Clean slate white foundation. */
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceSunken: '#F1F5F9',
  surfaceMuted: '#E2E8F0',

  /** Text hierarchy. */
  text: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#64748B',
  textSubtle: '#94A3B8',
  textInverse: '#FFFFFF',

  /** Borders. */
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',

  /** Verdict colours — desaturated, clinical, instant semantic feedback. */
  safe: '#10B981',
  safeSoft: '#ECFDF5',
  safeBorder: '#A7F3D0',

  caution: '#F59E0B',
  cautionSoft: '#FFFBEB',
  cautionBorder: '#FDE68A',

  danger: '#EF4444',
  dangerPressed: '#DC2626',
  dangerSoft: '#FEF2F2',
  dangerBorder: '#FECACA',

  /** Non-veg marker — FSSAI brown. */
  nonVeg: '#854D0E',
  nonVegSoft: '#FFF7ED',
  nonVegBorder: '#FED7AA',

  neutral: '#475569',
  neutralSoft: '#F1F5F9',
  neutralBorder: '#E2E8F0',

  /** Camera overlay colours. */
  onCamera: '#FFFFFF',
  overlay: 'rgba(15, 23, 42, 0.6)',
  overlayStrong: 'rgba(15, 23, 42, 0.8)',
  onCameraMuted: 'rgba(255, 255, 255, 0.85)',
  scrim: '#0F172A',
} as const;

// ============================================================================
// SPACING — 8-point scale
// ============================================================================

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

// ============================================================================
// CORNER RADII — rounded level 2 (median between regulatory & modern)
// ============================================================================

export const radii = {
  xs: 4,
  sm: 8,
  md: 8,
  lg: 16,
  xl: 24,
  pill: 9999,
} as const;

// ============================================================================
// TYPOGRAPHY — Inter (all text) via expo-google-fonts
// ============================================================================

/**
 * Font weights mapped to Inter font weights loaded via expo-google-fonts
 * (see app/_layout.tsx).
 * - 400 or normal -> Inter_400Regular
 * - 500 -> Inter_500Medium
 * - 600 -> Inter_600SemiBold
 * - 700 or higher -> Inter_700Bold
 */
export const typography = {
  /** Display — largest scan header (mobile). */
  display: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    lineHeight: 36,
    letterSpacing: -0.28,
  },
  /** Title — product names, screen titles. */
  title: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 24,
    lineHeight: 32,
    letterSpacing: -0.24,
  },
  /** Heading — section headers. */
  heading: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.18,
  },
  /** Subheading — brand names, secondary emphasis. */
  subheading: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    lineHeight: 24,
  },
  /** Body — primary reading text. */
  body: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  /** Body strong — emphasized body text. */
  bodyStrong: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    lineHeight: 24,
  },
  /** Caption — metadata, helper text. */
  caption: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 18,
  },
  /** Caption strong — labelled metadata. */
  captionStrong: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.24,
  },
  /** Overline — uppercase micro-labels, eyebrows. */
  overline: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.44,
    textTransform: 'uppercase' as const,
  },
  /** Verdict — large all-caps safety score headline. */
  verdict: {
    fontFamily: 'Inter_700Bold',
    fontSize: 36,
    lineHeight: 44,
    letterSpacing: 1.2,
  },
  /** INS / chemical codes — tabular numbers for alignment. */
  code: {
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.6,
  },
} as const;

// ============================================================================
// ELEVATION & DEPTH — tonal separation, no heavy shadows
// ============================================================================

const shadowColor = 'rgba(30, 62, 98, 1)'; // primary with alpha

export const shadows = {
  none: {},
  /** Level 1 — resting cards & panels. */
  card: Platform.select({
    ios: {
      shadowColor,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 3,
    },
    android: { elevation: 1 },
    default: {},
  }) as object,
  /** Level 2 — active viewfinder, floating scoreboards, sticky trays. */
  raised: Platform.select({
    ios: {
      shadowColor,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.08,
      shadowRadius: 24,
    },
    android: { elevation: 3 },
    default: {},
  }) as object,
  /** Level 2 alternative — with negative spread for tighter feel. */
  raisedTight: Platform.select({
    ios: {
      shadowColor,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 6,
    },
    android: { elevation: 2 },
    default: {},
  }) as object,
  /** Level 3 — alert sheets & overlays. */
  overlay: Platform.select({
    ios: {
      shadowColor,
      shadowOffset: { width: 0, height: 16 },
      shadowOpacity: 0.16,
      shadowRadius: 32,
    },
    android: { elevation: 6 },
    default: {},
  }) as object,
} as const;

// ============================================================================
// SEMANTIC HELPERS
// ============================================================================

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

export function vegColors(vegMark: 'veg' | 'non-veg' | 'unknown') {
  switch (vegMark) {
    case 'veg':
      return { fg: colors.safe, bg: colors.safeSoft, border: colors.safe };
    case 'non-veg':
      return { fg: colors.nonVeg, bg: colors.nonVegSoft, border: colors.nonVeg };
    default:
      return { fg: colors.textSubtle, bg: colors.surfaceMuted, border: colors.border };
  }
}

/** Minimum touch target — 48px for comfortable tap. */
export const HIT_SIZE = 48;