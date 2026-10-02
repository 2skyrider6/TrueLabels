import { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { HIT_SIZE, colors, radii, shadows, spacing, typography } from '@/theme/tokens';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

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

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        buttonVariantStyles[variant],
        fullWidth && styles.buttonFull,
        // A pressed fill instead of an opacity change keeps the label crisp.
        !inactive && pressed && buttonPressedStyles[variant],
        inactive && styles.buttonDisabled,
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
    </Pressable>
  );
}

const buttonVariantStyles: Record<ButtonVariant, ViewStyle> = {
  primary: { backgroundColor: colors.primary, borderColor: colors.primary },
  secondary: { backgroundColor: colors.surface, borderColor: colors.borderStrong },
  ghost: { backgroundColor: 'transparent', borderColor: 'transparent' },
  danger: { backgroundColor: colors.danger, borderColor: colors.danger },
};

const buttonPressedStyles: Record<ButtonVariant, ViewStyle> = {
  primary: { backgroundColor: colors.primaryPressed },
  secondary: { backgroundColor: colors.surfaceSunken },
  ghost: { backgroundColor: colors.surfaceMuted },
  danger: { backgroundColor: colors.dangerPressed },
};

const buttonVariantText: Record<ButtonVariant, { color: string }> = {
  primary: { color: colors.textInverse },
  secondary: { color: colors.text },
  ghost: { color: colors.primary },
  danger: { color: colors.textInverse },
};

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
        <Ionicons name={icon} size={26} color={colors.primary} />
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
  button: {
    minHeight: HIT_SIZE + 6,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.md,
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

  iconButton: {
    width: HIT_SIZE,
    height: HIT_SIZE,
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonPressed: { opacity: 0.6 },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  cardPadded: { padding: spacing.lg },

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

  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  badgeIcon: { marginTop: 1 },
  badgeText: { ...typography.overline },

  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  chipText: { ...typography.captionStrong },

  callout: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  calloutIcon: { marginTop: 2 },
  calloutBody: { flex: 1 },
  calloutTitle: { ...typography.captionStrong, marginBottom: spacing.xxs },
  calloutText: { ...typography.caption, color: colors.textSecondary },

  emptyState: { alignItems: 'center', paddingHorizontal: spacing.xxl, paddingVertical: spacing.huge },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: radii.xl,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: { ...typography.heading, color: colors.text, marginBottom: spacing.xs },
  emptyMessage: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  emptyAction: { alignSelf: 'stretch' },

  screenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  screenHeaderText: { flex: 1 },
  screenTitle: { ...typography.title, color: colors.text },
  screenSubtitle: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
});