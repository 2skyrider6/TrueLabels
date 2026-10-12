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
// TYPOGRAPHY — Plus Jakarta Sans (headings) + Inter (body)
// ============================================================================

/**
 * Font families. Using system fonts as fallbacks since custom fonts
 * require bundling TTF files. The design is achieved through sizing,
 * weight, and letter-spacing specs from the design system.
 * 
 * For custom fonts, add TTF files to assets/fonts/ and load via expo-font.
 */
export const fontFamily = {
  // System font on iOS (SF Pro) and Android (Roboto) approximate Inter/Plus Jakarta Sans
  heading: undefined, // Uses system font, weight controlled per style
  body: undefined,    // Uses system font
  mono: 'monospace',
} as const;

export const typography = {
  /** Display — largest scan header (mobile). */
  display: {
    fontFamily: fontFamily.heading,
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '700' as const,
    letterSpacing: -0.28,
  },
  /** Title — product names, screen titles. */
  title: {
    fontFamily: fontFamily.heading,
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '600' as const,
    letterSpacing: -0.24,
  },
  /** Heading — section headers. */
  heading: {
    fontFamily: fontFamily.heading,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600' as const,
    letterSpacing: -0.18,
  },
  /** Subheading — brand names, secondary emphasis. */
  subheading: {
    fontFamily: fontFamily.heading,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600' as const,
  },
  /** Body — primary reading text. */
  body: {
    fontFamily: fontFamily.body,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400' as const,
  },
  /** Body strong — emphasized body text. */
  bodyStrong: {
    fontFamily: fontFamily.body,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600' as const,
  },
  /** Caption — metadata, helper text. */
  caption: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400' as const,
  },
  /** Caption strong — labelled metadata. */
  captionStrong: {
    fontFamily: fontFamily.body,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600' as const,
    letterSpacing: 0.24,
  },
  /** Overline — uppercase micro-labels, eyebrows. */
  overline: {
    fontFamily: fontFamily.body,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500' as const,
    letterSpacing: 0.44,
    textTransform: 'uppercase' as const,
  },
  /** Verdict — large all-caps safety score headline. */
  verdict: {
    fontFamily: fontFamily.heading,
    fontSize: 36,
    lineHeight: 44,
    fontWeight: '800' as const,
    letterSpacing: 1.2,
  },
  /** INS / chemical codes — tabular numbers for alignment. */
  code: {
    fontFamily: fontFamily.mono,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600' as const,
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