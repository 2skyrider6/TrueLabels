import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

import { HIT_SIZE, colors, radii, shadows, spacing, typography } from '@/theme/tokens';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Radius used by buttons and the smallest containers: 0.5rem / 8px. */
const RADIUS_BUTTON = 8;

/** Press scale for the primary action, per the design system. */
const PRESS_SCALE = 0.99;

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled = false,
  loading = false,
  fullWidth = true,
  style,
  accessibilityLabel,
  accessibilityHint,
}: ButtonProps) {
  const inactive = disabled || loading;
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  const handlePressIn = () => {
    if (inactive) return;
    // `.set()` rather than `scale.value =`: the React Compiler lint rule does
    // not recognise reanimated's mutable shared values, but a method call is
    // still assignment-free and keeps the rule satisfied.
    scale.set(
      withSpring(PRESS_SCALE, {
        damping: 15,
        stiffness: 400,
      })
    );
  };

  const handlePressOut = () => {
    if (inactive) return;
    scale.set(
      withSpring(1, {
        damping: 15,
        stiffness: 400,
      })
    );
  };

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={[
        styles.button,
        buttonVariantStyles[variant],
        fullWidth && styles.buttonFull,
        inactive && styles.buttonDisabled,
        animatedStyle,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' || variant === 'danger' ? colors.textInverse : colors.primary}
        />
      ) : (
        <>
          {icon ? (
            <Ionicons
              name={icon}
              size={18}
              color={buttonVariantText[variant].color}
              style={styles.buttonIcon}
            />
          ) : null}
          <Text style={[styles.buttonLabel, buttonVariantText[variant]]}>{label}</Text>
        </>
      )}
    </AnimatedPressable>
  );
}

/**
 * Translucent navy tint for the ghost variant. The design system specifies no
 * border, so the tint alone has to carry the affordance.
 */
const GHOST_TINT = 'rgba(30, 62, 98, 0.06)';

const buttonVariantStyles: Record<ButtonVariant, ViewStyle> = {
  primary: { backgroundColor: colors.primary, borderColor: colors.primary },
  secondary: { backgroundColor: colors.surface, borderColor: colors.borderStrong },
  ghost: { backgroundColor: GHOST_TINT, borderColor: 'transparent' },
  danger: { backgroundColor: colors.danger, borderColor: colors.danger },
};

const buttonVariantText: Record<ButtonVariant, { color: string }> = {
  primary: { color: colors.textInverse },
  secondary: { color: colors.text },
  ghost: { color: colors.primary },
  danger: { color: colors.textInverse },
};

// ---------------------------------------------------------------------------
// ScanTrigger — floating circular camera button
// ---------------------------------------------------------------------------

interface ScanTriggerProps {
  onPress: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
}

/**
 * The primary capture control: a 64px circle with the dual-ring treatment from
 * the design system — emerald inner ring, translucent navy outer ring.
 */
export function ScanTrigger({ onPress, accessibilityLabel, disabled = false }: ScanTriggerProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (disabled) return;
    scale.set(withSpring(0.96, { damping: 15, stiffness: 400 }));
  };

  const handlePressOut = () => {
    if (disabled) return;
    scale.set(withSpring(1, { damping: 15, stiffness: 400 }));
  };

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={[styles.scanTriggerWrap, disabled && styles.buttonDisabled, animatedStyle]}
    >
      <View style={styles.scanTriggerRing} />
      <View style={styles.scanTriggerFace}>
        <Ionicons name="barcode-outline" size={26} color={colors.textInverse} />
      </View>
    </AnimatedPressable>
  );
}

// ---------------------------------------------------------------------------
// IconButton
// ---------------------------------------------------------------------------

interface IconButtonProps {
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  variant?: 'surface' | 'plain' | 'inverse';
  size?: number;
  disabled?: boolean;
}

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  variant = 'surface',
  size = 20,
  disabled = false,
}: IconButtonProps) {
  const palette = {
    surface: { bg: colors.surface, fg: colors.text, border: colors.border },
    plain: { bg: 'transparent', fg: colors.textSecondary, border: 'transparent' },
    inverse: { bg: colors.overlay, fg: colors.textInverse, border: 'transparent' },
  }[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      hitSlop={8}
      style={({ pressed }) => [
        styles.iconButton,
        { backgroundColor: palette.bg, borderColor: palette.border },
        pressed && styles.iconButtonPressed,
        disabled && styles.buttonDisabled,
      ]}
    >
      <Ionicons name={icon} size={size} color={palette.fg} />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

interface CardProps {
  children: ReactNode;
  style?: ViewStyle;
  padded?: boolean;
}

/** Clinical card container: white surface, 1px border, rounded-lg (16px). */
export function Card({ children, style, padded = true }: CardProps) {
  return <View style={[styles.card, padded && styles.cardPadded, style]}>{children}</View>;
}

// ---------------------------------------------------------------------------
// SectionHeading
// ---------------------------------------------------------------------------

interface SectionHeadingProps {
  title: string;
  /** Small uppercase label above the title, used to group sections. */
  eyebrow?: string;
  icon?: IconName;
  trailing?: ReactNode;
}

export function SectionHeading({ title, eyebrow, icon, trailing }: SectionHeadingProps) {
  return (
    <View style={styles.sectionHeading}>
      <View style={styles.sectionHeadingLeft}>
        {eyebrow ? <Text style={styles.sectionEyebrow}>{eyebrow}</Text> : null}
        <View style={styles.sectionTitleRow}>
          {icon ? <Ionicons name={icon} size={16} color={colors.textMuted} style={styles.sectionIcon} /> : null}
          <Text style={styles.sectionTitle} accessibilityRole="header">
            {title}
          </Text>
        </View>
      </View>
      {trailing}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

interface BadgeProps {
  label: string;
  fg: string;
  bg: string;
  border?: string;
  icon?: IconName;
}

export function Badge({ label, fg, bg, border, icon }: BadgeProps) {
  return (
    <View style={[styles.badge, { backgroundColor: bg, borderColor: border ?? bg }]}>
      {icon ? <Ionicons name={icon} size={12} color={fg} style={styles.badgeIcon} /> : null}
      <Text style={[styles.badgeText, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// DietaryBadge — FSSAI-style veg / non-veg square
// ---------------------------------------------------------------------------

interface DietaryBadgeProps {
  mark: 'veg' | 'non-veg' | 'unknown';
  /** Rendered next to the square for screen readers and label readers. */
  label?: string;
}

const DIETARY_FG = {
  veg: colors.safe,
  'non-veg': colors.nonVeg,
  unknown: colors.textSubtle,
} as const;

const DIETARY_TEXT = {
  veg: 'Vegetarian',
  'non-veg': 'Non-vegetarian',
  unknown: 'Mark unknown',
} as const;

/**
 * The standardized Indian veg / non-veg mark: a 20x20px white square with a
 * 1.5px coloured border and a filled centred indicator. Kept as a regulatory-
 * familiar shape rather than a generic pill.
 */
export function DietaryBadge({ mark, label }: DietaryBadgeProps) {
  const fg = DIETARY_FG[mark];
  const text = label ?? DIETARY_TEXT[mark];

  return (
    <View
      accessibilityLabel={text}
      style={[styles.dietaryBadge, { borderColor: fg }]}
    >
      {mark === 'veg' ? (
        <View style={[styles.dietaryDot, { backgroundColor: fg }]} />
      ) : mark === 'non-veg' ? (
        // A downward triangle, drawn with three borders rather than a glyph so
        // the indicator stays geometric at any size.
        <View style={[styles.dietaryTriangle, { borderTopColor: fg }]} />
      ) : (
        <View style={[styles.dietaryDot, { backgroundColor: fg }]} />
      )}
    </View>
  );
}

/** Text pill for advisory marks such as palm-oil detection. */
interface AdvisoryBadgeProps {
  label: string;
  fg?: string;
  bg?: string;
  border?: string;
}

export function AdvisoryBadge({ label, fg, bg, border }: AdvisoryBadgeProps) {
  const palette = {
    fg: fg ?? colors.caution,
    bg: bg ?? colors.cautionSoft,
    border: border ?? colors.cautionBorder,
  };
  return (
    <View style={[styles.advisoryBadge, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <Text style={[styles.advisoryBadgeText, { color: palette.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// AdditivePill — INS code with plain-English descriptor
// ---------------------------------------------------------------------------

interface AdditivePillProps {
  /** The INS code, rendered in monospace. */
  code: string;
  /** Plain-English functional descriptor, e.g. "Citric Acid". */
  descriptor: string;
  /** Hazard level driving the pill colour. */
  tone?: 'safe' | 'caution' | 'unsafe';
}

const ADDITIVE_FG = {
  safe: colors.safe,
  caution: colors.caution,
  unsafe: colors.danger,
} as const;

const ADDITIVE_BG = {
  safe: colors.safeSoft,
  caution: colors.cautionSoft,
  unsafe: colors.dangerSoft,
} as const;

const ADDITIVE_BORDER = {
  safe: colors.safeBorder,
  caution: colors.cautionBorder,
  unsafe: colors.dangerBorder,
} as const;

/** `INS 330 · Citric Acid` — pill-shaped, 24px tall, monospaced code. */
export function AdditivePill({ code, descriptor, tone = 'safe' }: AdditivePillProps) {
  const fg = ADDITIVE_FG[tone];
  return (
    <View style={[styles.additivePill, { backgroundColor: ADDITIVE_BG[tone], borderColor: ADDITIVE_BORDER[tone] }]}>
      <Text style={[styles.additiveCode, { color: fg }]}>{code}</Text>
      <Text style={styles.additiveDescriptor} numberOfLines={1}>
        {descriptor}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// SafetyMeter — 0-100 health score
// ---------------------------------------------------------------------------

interface SafetyMeterProps {
  /** 0-100. */
  score: number;
  /** Show the numeric value beside the track. */
  showValue?: boolean;
  height?: number;
  accessibilityLabel?: string;
}

/** Score zone thresholds, with the colour each zone renders in. */
function scoreZone(score: number): { fg: string; label: string } {
  if (score >= 70) return { fg: colors.safe, label: 'Pure' };
  if (score >= 40) return { fg: colors.caution, label: 'Moderate risk' };
  return { fg: colors.danger, label: 'Critical alert' };
}

/**
 * Segmented horizontal track. A radial ring would be the other spec'd option,
 * but a bar reads more reliably at small widths and keeps the number aligned
 * with the fill for tabular display.
 */
export function SafetyMeter({
  score,
  showValue = true,
  height = 10,
  accessibilityLabel,
}: SafetyMeterProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const zone = scoreZone(clamped);
  const label = accessibilityLabel ?? `Safety score ${clamped} out of 100, ${zone.label}`;

  return (
    <View
      style={styles.safetyMeter}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: clamped }}
    >
      <View style={[styles.safetyMeterTrack, { height, borderRadius: height / 2 }]}>
        <View
          style={[
            styles.safetyMeterFill,
            { width: `${clamped}%`, backgroundColor: zone.fg, borderRadius: height / 2 },
          ]}
        />
      </View>
      {showValue ? (
        <Text style={[styles.safetyMeterValue, { color: zone.fg }]}>{clamped}</Text>
      ) : null}
    </View>
  );
}

/**
 * Radial score ring for cards. Drawn from two half-circle overlays so no SVG
 * dependency is needed; the numeric score sits in the middle.
 */
interface ScoreRingProps {
  score: number;
  size?: number;
  thickness?: number;
  accessibilityLabel?: string;
}

export function ScoreRing({ score, size = 56, thickness = 5, accessibilityLabel }: ScoreRingProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const zone = scoreZone(clamped);

  // Progress across the visible 180deg half-circle, from 0 to 180.
  const sweep = Math.round((clamped / 100) * 180);

  return (
    <View
      style={[styles.scoreRingContainer, { width: size, height: size / 2 + thickness }]}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? `Safety score ${clamped} out of 100, ${zone.label}`}
    >
      <View style={[styles.scoreRingTrack, { width: size, height: size, borderRadius: size / 2, borderWidth: thickness }]}>
        <View
          style={[
            styles.scoreRingFill,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: thickness,
              borderColor: zone.fg,
              // Only the half the fill has reached stays visible.
              transform: [{ rotate: `${sweep - 180}deg` }],
              opacity: sweep > 0 ? 1 : 0,
            },
          ]}
        />
      </View>
      <View style={styles.scoreRingLabelWrap}>
        <Text style={[styles.scoreRingText, { color: zone.fg }]}>{clamped}</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// ProductSafetyCard — score ring, thumbnail, brand, dietary pills
// ---------------------------------------------------------------------------

interface ProductSafetyCardProps {
  score?: number;
  title: string;
  brand?: string;
  imageUrl?: string;
  vegMark?: 'veg' | 'non-veg' | 'unknown';
  barcode?: string;
  children?: ReactNode;
}

/** Placeholder thumbnail shown when a product has no image. */
function ThumbnailPlaceholder({ size = 56 }: { size?: number }) {
  return (
    <View style={[styles.productThumb, { width: size, height: size }]}>
      <Ionicons name="cube-outline" size={20} color={colors.textSubtle} />
    </View>
  );
}

/**
 * The headline container for a scanned product: circular score ring, product
 * thumbnail, brand headline, and a horizontal dietary pill container.
 */
export function ProductSafetyCard({
  score,
  title,
  brand,
  imageUrl,
  vegMark,
  barcode,
  children,
}: ProductSafetyCardProps) {
  return (
    <View style={styles.productSafetyCard}>
      {score === undefined ? null : <ScoreRing score={score} />}

      <View style={styles.productThumbWrap}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.productThumb}
            resizeMode="contain"
            accessibilityLabel={title}
          />
        ) : (
          <ThumbnailPlaceholder size={56} />
        )}
      </View>

      <View style={styles.productSafetyBody}>
        <Text style={styles.productSafetyTitle} numberOfLines={2}>
          {title}
        </Text>
        {brand ? (
          <Text style={styles.productSafetyBrand} numberOfLines={1}>
            {brand}
          </Text>
        ) : null}

        <View style={styles.dietaryPillRow}>
          {vegMark && vegMark !== 'unknown' ? <DietaryBadge mark={vegMark} /> : null}
          {barcode ? <Text style={styles.productBarcodeCode}>{barcode}</Text> : null}
          {children}
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Chip
// ---------------------------------------------------------------------------

interface ChipProps {
  label: string;
  fg: string;
  bg: string;
  border?: string;
}

export function Chip({ label, fg, bg, border }: ChipProps) {
  return (
    <View style={[styles.chip, { backgroundColor: bg, borderColor: border ?? bg }]}>
      <Text style={[styles.chipText, { color: fg }]}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Callout
// ---------------------------------------------------------------------------

interface CalloutProps {
  tone?: 'info' | 'warning' | 'neutral';
  title?: string;
  icon?: IconName;
  children: ReactNode;
}

export function Callout({ tone = 'info', title, icon, children }: CalloutProps) {
  const palette = {
    info: { bg: colors.primarySoft, border: colors.primaryBorder, fg: colors.primary },
    warning: { bg: colors.cautionSoft, border: colors.cautionBorder, fg: colors.caution },
    neutral: { bg: colors.surfaceSunken, border: colors.border, fg: colors.textSecondary },
  }[tone];

  return (
    <View style={[styles.callout, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      {icon ? <Ionicons name={icon} size={16} color={palette.fg} style={styles.calloutIcon} /> : null}
      <View style={styles.calloutBody}>
        {title ? <Text style={[styles.calloutTitle, { color: palette.fg }]}>{title}</Text> : null}
        <Text style={styles.calloutText}>{children}</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// EmptyState
// ---------------------------------------------------------------------------

interface EmptyStateProps {
  icon: IconName;
  title: string;
  message: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, message, action }: EmptyStateProps) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={32} color={colors.primary} />
      </View>
      <Text style={styles.emptyTitle} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.emptyMessage}>{message}</Text>
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// ScreenHeader
// ---------------------------------------------------------------------------

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
}

/**
 * In-screen header used by the screens that hide the native navigation header,
 * so the top of the screen has the same hierarchy everywhere.
 */
export function ScreenHeader({ title, subtitle, trailing }: ScreenHeaderProps) {
  return (
    <View style={styles.screenHeader}>
      <View style={styles.screenHeaderText}>
        <Text style={styles.screenTitle} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? <Text style={styles.screenSubtitle}>{subtitle}</Text> : null}
      </View>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  // -- Button ---------------------------------------------------------------
  button: {
    minHeight: HIT_SIZE,
    paddingHorizontal: spacing.lg,
    borderRadius: RADIUS_BUTTON,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    ...shadows.card,
  },
  buttonFull: { alignSelf: 'stretch' },
  buttonDisabled: { opacity: 0.45 },
  buttonIcon: { marginTop: 1 },
  buttonLabel: {
    ...typography.bodyStrong,
    textAlign: 'center',
  },

  // -- ScanTrigger ----------------------------------------------------------
  scanTriggerWrap: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Translucent navy outer ring.
  scanTriggerRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: 'rgba(30, 62, 98, 0.28)',
  },
  // Emerald inner ring around the solid navy face.
  scanTriggerFace: {
    width: 54,
    height: 54,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: colors.safe,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.raised,
  },

  // -- IconButton -----------------------------------------------------------
  iconButton: {
    width: HIT_SIZE,
    height: HIT_SIZE,
    borderRadius: RADIUS_BUTTON,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonPressed: { opacity: 0.6 },

  // -- Card -----------------------------------------------------------------
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  cardPadded: { padding: spacing.lg },

  // -- SectionHeading -------------------------------------------------------
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  sectionHeadingLeft: { flex: 1 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionIcon: { marginTop: 1 },
  sectionEyebrow: {
    ...typography.overline,
    color: colors.textSubtle,
    marginBottom: spacing.xs,
  },
  sectionTitle: { ...typography.heading, color: colors.text, flexShrink: 1 },

  // -- Badge ----------------------------------------------------------------
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: RADIUS_BUTTON,
    borderWidth: 1,
  },
  badgeIcon: { marginTop: 1 },
  badgeText: { ...typography.overline },

  // -- DietaryBadge / AdvisoryBadge -----------------------------------------
  dietaryBadge: {
    width: 20,
    height: 20,
    borderRadius: 2,
    borderWidth: 1.5,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dietaryDot: {
    width: 8,
    height: 8,
    borderRadius: radii.pill,
  },
  // Zero-size box with coloured top and transparent sides gives a triangle.
  dietaryTriangle: {
    width: 0,
    height: 0,
    borderLeftWidth: 4.5,
    borderRightWidth: 4.5,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  advisoryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS_BUTTON,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  advisoryBadgeText: { ...typography.captionStrong },

  // -- AdditivePill ---------------------------------------------------------
  additivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 24,
    paddingHorizontal: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  additiveCode: { ...typography.code },
  additiveDescriptor: { ...typography.caption, color: colors.text, flexShrink: 1 },

  // -- SafetyMeter ----------------------------------------------------------
  safetyMeter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  safetyMeterTrack: {
    flex: 1,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  safetyMeterFill: {
    height: '100%',
  },
  safetyMeterValue: {
    ...typography.heading,
    minWidth: 32,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },

  // -- ScoreRing ------------------------------------------------------------
  scoreRingContainer: {
    alignItems: 'center',
    overflow: 'hidden',
  },
  scoreRingTrack: {
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: colors.border,
  },
  scoreRingFill: {
    position: 'absolute',
    top: -1,
    left: -1,
    // Only the left half is drawn; the right side stays transparent so the
    // track underneath remains the neutral grey.
    borderBottomColor: 'transparent',
    borderRightColor: 'transparent',
  },
  scoreRingLabelWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreRingText: {
    ...typography.heading,
    fontVariant: ['tabular-nums'],
  },

  // -- ProductSafetyCard ----------------------------------------------------
  productSafetyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadows.card,
  },
  productThumbWrap: { width: 56 },
  productThumb: {
    borderRadius: RADIUS_BUTTON,
    backgroundColor: colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productSafetyBody: { flex: 1, gap: spacing.xxs },
  productSafetyTitle: { ...typography.subheading, color: colors.text },
  productSafetyBrand: { ...typography.caption, color: colors.textMuted },
  dietaryPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
    flexWrap: 'wrap',
  },
  productBarcodeCode: {
    ...typography.code,
    color: colors.textMuted,
  },

  // -- Chip -----------------------------------------------------------------
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: RADIUS_BUTTON,
    borderWidth: 1,
  },
  chipText: { ...typography.captionStrong },

  // -- Callout --------------------------------------------------------------
  callout: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: RADIUS_BUTTON,
    borderWidth: 1,
  },
  calloutIcon: { marginTop: 2 },
  calloutBody: { flex: 1 },
  calloutTitle: { ...typography.captionStrong, marginBottom: spacing.xxs },
  calloutText: { ...typography.caption, color: colors.textSecondary },

  // -- EmptyState -----------------------------------------------------------
  emptyState: { alignItems: 'center', paddingHorizontal: spacing.xxl, paddingVertical: spacing.huge },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: radii.lg,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: { ...typography.title, color: colors.text, marginBottom: spacing.sm, textAlign: 'center' },
  emptyMessage: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 24,
  },
  emptyAction: { alignSelf: 'stretch', maxWidth: 280 },

  // -- ScreenHeader ---------------------------------------------------------
  screenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  screenHeaderText: { flex: 1 },
  screenTitle: { ...typography.title, color: colors.text },
  screenSubtitle: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
});