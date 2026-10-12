import { ReactNode } from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
  PressableProps,
  DimensionValue,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  withDelay,
  withRepeat,
  Easing,
} from 'react-native-reanimated';
import { colors, radii, spacing } from '@/theme/tokens';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedView = Animated.createAnimatedComponent(View);

// ---------------------------------------------------------------------------
// Animated Button with spring effect
// ---------------------------------------------------------------------------

interface AnimatedButtonProps extends Omit<PressableProps, 'style'> {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}

export function AnimatedButton({
  children,
  style,
  disabled = false,
  ...props
}: AnimatedButtonProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
      opacity: opacity.value,
    };
  });

  const handlePressIn = () => {
    if (disabled) return;
    scale.set(withSpring(0.96, {
      damping: 15,
      stiffness: 400,
    }));
  };

  const handlePressOut = () => {
    if (disabled) return;
    scale.set(withSpring(1, {
      damping: 15,
      stiffness: 400,
    }));
  };

  return (
    <AnimatedPressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={[styles.animatedButton, animatedStyle, style]}
      {...props}
    >
      {children}
    </AnimatedPressable>
  );
}

// ---------------------------------------------------------------------------
// Fade In Animation
// ---------------------------------------------------------------------------

interface FadeInProps {
  children: ReactNode;
  style?: ViewStyle;
  delay?: number;
  duration?: number;
}

export function FadeIn({
  children,
  style,
  delay = 0,
  duration = 300,
}: FadeInProps) {
  const opacity = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
    };
  });

  // Trigger animation on mount
  opacity.set(withDelay(
    delay,
    withTiming(1, {
      duration,
      easing: Easing.out(Easing.ease),
    })
  ));

  return <AnimatedView style={[animatedStyle, style]}>{children}</AnimatedView>;
}

// ---------------------------------------------------------------------------
// Slide Up Animation
// ---------------------------------------------------------------------------

interface SlideUpProps {
  children: ReactNode;
  style?: ViewStyle;
  delay?: number;
  distance?: number;
}

export function SlideUp({
  children,
  style,
  delay = 0,
  distance = 20,
}: SlideUpProps) {
  const translateY = useSharedValue(distance);
  const opacity = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
      opacity: opacity.value,
    };
  });

  translateY.set(withDelay(
    delay,
    withSpring(0, {
      damping: 15,
      stiffness: 400,
    })
  ));
  opacity.set(withDelay(
    delay,
    withTiming(1, {
      duration: 400,
      easing: Easing.out(Easing.ease),
    })
  ));

  return <AnimatedView style={[animatedStyle, style]}>{children}</AnimatedView>;
}

// ---------------------------------------------------------------------------
// Scale In Animation
// ---------------------------------------------------------------------------

interface ScaleInProps {
  children: ReactNode;
  style?: ViewStyle;
  delay?: number;
}

export function ScaleIn({ children, style, delay = 0 }: ScaleInProps) {
  const scale = useSharedValue(0.8);
  const opacity = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
      opacity: opacity.value,
    };
  });

  scale.set(withDelay(
    delay,
    withSpring(1, {
      damping: 15,
      stiffness: 400,
    })
  ));
  opacity.set(withDelay(
    delay,
    withTiming(1, {
      duration: 300,
      easing: Easing.out(Easing.ease),
    })
  ));

  return <AnimatedView style={[animatedStyle, style]}>{children}</AnimatedView>;
}

// ---------------------------------------------------------------------------
// Pulse Animation for loading/attention
// ---------------------------------------------------------------------------

interface PulseProps {
  children: ReactNode;
  style?: ViewStyle;
  active?: boolean;
}

export function Pulse({ children, style, active = true }: PulseProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  if (active) {
    // `withRepeat` wraps the whole sequence: repeat the pulse up-down cycle
    // forever rather than repeating a single timing curve.
    scale.set(withRepeat(
      withSequence(
        withTiming(1.05, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) })
      ),
      -1
    ));
  }

  return <AnimatedView style={[animatedStyle, style]}>{children}</AnimatedView>;
}

// ---------------------------------------------------------------------------
// Shimmer Effect for skeleton loading
// ---------------------------------------------------------------------------

interface ShimmerProps {
  style?: StyleProp<ViewStyle>;
  width?: DimensionValue;
  height?: number;
}

export function Shimmer({ style, width = '100%', height = 20 }: ShimmerProps) {
  const translateX = useSharedValue(-100);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: translateX.value }],
    };
  });

  translateX.set(withSequence(
    withTiming(100, { duration: 1500, easing: Easing.linear }),
    withTiming(-100, { duration: 0 })
  ));

  return (
    <View style={[styles.shimmerContainer, { width, height }, style]}>
      <Animated.View
        style={[
          styles.shimmerGradient,
          animatedStyle,
          {
            width: '100%',
            height: '100%',
          },
        ]}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Skeleton Card for loading states
// ---------------------------------------------------------------------------

interface SkeletonCardProps {
  style?: ViewStyle;
}

export function SkeletonCard({ style }: SkeletonCardProps) {
  return (
    <View style={[styles.skeletonCard, style]}>
      <Shimmer width={60} height={60} style={styles.skeletonImage} />
      <View style={styles.skeletonContent}>
        <Shimmer width="80%" height={16} style={styles.skeletonLine} />
        <Shimmer width="60%" height={14} style={styles.skeletonLine} />
        <Shimmer width="40%" height={12} style={styles.skeletonLine} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  animatedButton: {
    overflow: 'hidden',
  },
  shimmerContainer: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radii.sm,
    overflow: 'hidden',
  },
  shimmerGradient: {
    backgroundColor: colors.surfaceMuted,
    opacity: 0.6,
  },
  skeletonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  skeletonImage: {
    borderRadius: radii.md,
  },
  skeletonContent: {
    flex: 1,
    gap: spacing.sm,
  },
  skeletonLine: {
    borderRadius: radii.xs,
  },
});
